// Renderer glue between the Arena and the user's own material.
//
// contentSource.ts is the pure logic; this reads the actual stores (the mined
// flashcard deck + the level-slot word lists) and supplies the kuromoji-backed
// resolvers those pure functions take as parameters.
//
// Fallback policy: when the user's deck can't fill a round, the games fall back
// to the bundled tables rather than locking. `usingFallback` lets the UI say so
// honestly instead of passing built-in content off as the player's own.

import { loadDeck } from '../flashcardDeck';
import { getSlotList } from '../levelLists';
import { tokenizeSync, tokenizerReady } from '../tokenizer';
import { slotsForLang, type LevelTier, type StudyLang } from '../../shared/levelScale';
import { getStudyLang } from '../studyEnvironment';
import { normalizeStudyLang } from '../../shared/studyLang';
import { segmentStudyText, studyWordKey } from '../../shared/studySegmentation';
import { packFor } from '../data/gamePacks';
import type { GamePack } from '../data/gamePacks/types';
import { listCards, loadGameLists, packExtrasFromLists } from './gameItemImport';
import { getLevel } from '../knownWords';
import {
  iPlusOneScore,
  isStudyTarget,
  studyWordStatus,
  type StudyWordStatus,
} from '../../shared/gameStudyMix';
import {
  buildClozePool,
  buildVocabPool,
  buildSentencePool,
  type ClozeItem,
  type SourceCard,
  type VocabItem,
} from './contentSource';

/**
 * Reduce an expression to its lemma so list and deck entries meet: kuromoji's
 * lemma for Japanese, the shared stem for Russian (книга / книгу), the word
 * itself for Chinese.
 */
function lemmaOf(expr: string): string {
  const lang = getStudyLang();
  if (lang !== 'ja') return studyWordKey(expr, lang);
  if (!tokenizerReady()) return expr;
  try {
    const tokens = tokenizeSync(expr);
    return tokens.length === 1 ? tokens[0].lemma || expr : expr;
  } catch {
    return expr;
  }
}

/**
 * Find the literal substring of `sentence` to blank for `word`.
 *
 * Mined cards store the dictionary form while the sentence carries it
 * conjugated (word 食べる, sentence 食べました), so an exact match finds almost
 * nothing. Tokenize the sentence and take the surface of the token whose lemma
 * matches; fall back to an exact hit when the tokenizer isn't up yet.
 */
export function surfaceInSentence(sentence: string, word: string): string | null {
  if (sentence.includes(word)) return word;
  const lang = getStudyLang();
  if (lang !== 'ja') {
    // The inflected Russian form in the sentence (книгу for книга); Chinese
    // words do not inflect, so only the exact hit above can match.
    const key = studyWordKey(word, lang);
    return segmentStudyText(sentence, lang).find((part) => part.wordLike && studyWordKey(part.text, lang) === key)?.text ?? null;
  }
  if (!tokenizerReady()) return null;
  try {
    const target = lemmaOf(word);
    for (const token of tokenizeSync(sentence)) {
      if (token.lemma === target || token.surface === word) return token.surface;
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** Sentences split into pieces per content build: each split tokenizes the sentence once. */
const PIECE_LIMIT = 300;
const MIN_PIECES = 3;
const MAX_PIECES = 9;

/** IPADIC parts that lean on the word before them: they ride in its piece. */
function attachesToPrevious(pos: string, detail: string): boolean {
  return pos === '助詞'
    || pos === '助動詞'
    || pos === '記号'
    || (pos === '名詞' && (detail === '接尾' || detail === '非自立'))
    || (pos === '動詞' && (detail === '非自立' || detail === '接尾'));
}

/**
 * A sentence in phrase-sized pieces for Sentence Builder: each content word with the
 * particles, endings and punctuation that follow it (猫が / 好き / です。). Null when it
 * cannot be split yet or would make fewer than three or more than nine pieces.
 */
export function builderPieces(sentence: string): string[] | null {
  const lang = getStudyLang();
  const pieces: string[] = [];
  if (lang === 'ja') {
    if (!tokenizerReady()) return null;
    try {
      for (const token of tokenizeSync(sentence)) {
        if (!token.surface.trim()) continue;
        if (pieces.length && attachesToPrevious(token.pos, token.posDetail)) pieces[pieces.length - 1] += token.surface;
        else pieces.push(token.surface);
      }
    } catch {
      return null;
    }
  } else {
    for (const part of segmentStudyText(sentence, lang)) {
      const text = part.text.trim();
      if (!text) continue;
      if (!part.wordLike && pieces.length) pieces[pieces.length - 1] += text;
      else pieces.push(text);
    }
  }
  return pieces.length >= MIN_PIECES && pieces.length <= MAX_PIECES ? pieces : null;
}

function withPieces(cards: SourceCard[]): SourceCard[] {
  return cards.map((card, i) => {
    if (i >= PIECE_LIMIT || !card.sentence) return card;
    const pieces = builderPieces(card.sentence);
    return pieces ? { ...card, pieces } : card;
  });
}

/** Read the actual cloze surface, whose conjugation can differ from the card. */
function readingOfSurface(surface: string): string {
  if (getStudyLang() !== 'ja' || !tokenizerReady()) return '';
  try {
    return tokenizeSync(surface).map((token) => token.reading || token.surface).join('');
  } catch {
    return '';
  }
}

/** The level slot whose tier matches, if the user bound a list to it. */
function wordsForLevel(level: LevelTier): string[] | null {
  const slot = slotsForLang(getStudyLang()).find((s) => s.tier === level);
  if (!slot) return null;
  const list = getSlotList(slot.id);
  return list && list.words.length ? list.words : null;
}

interface DeckSource extends SourceCard {
  status: StudyWordStatus;
  addedAt: number;
}

/** Sentences checked for i+1 per content build: each check tokenizes the sentence once. */
const I_PLUS_ONE_CHECK_LIMIT = 400;

function startOfToday(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** The word's known-word level, under its own spelling or its lemma. */
function knownLevelOf(word: string): number {
  const lemma = lemmaOf(word);
  return Math.max(getLevel(word), lemma && lemma !== word ? getLevel(lemma) : 0);
}

/**
 * The deck's cards in the study language only: a Russian learner's round never
 * deals Japanese cards. `folder` narrows to one deck folder; `due` to the cards
 * due now and the ones still being learned; `mined-today` to the cards added today.
 */
function deckCards(folder?: string, scope: 'all' | 'due' | 'mined-today' = 'all', now = Date.now()): DeckSource[] {
  const lang = getStudyLang();
  const today = startOfToday(now);
  return loadDeck()
    .filter((c) => normalizeStudyLang(c.studyLang) === lang && (!folder || c.folder === folder))
    .map((c) => ({
      word: c.word,
      reading: c.reading,
      meaning: c.meaning,
      sentence: c.sentence,
      ...(c.audioDataUrl ? { audioDataUrl: c.audioDataUrl } : {}),
      ...(c.audioPath ? { audioPath: c.audioPath } : {}),
      addedAt: c.addedAt,
      status: studyWordStatus(c.srs, knownLevelOf(c.word), now),
    }))
    .filter((c) => scope === 'all'
      || (scope === 'due' ? isStudyTarget(c.status) : Number.isFinite(c.addedAt) && c.addedAt >= today));
}

/**
 * How many words of `sentence`, other than the answer, the learner does not know yet
 * (known-word level under 2). Particles, punctuation and proper nouns do not count. Null
 * when the sentence cannot be split yet (the Japanese tokenizer is still loading).
 */
export function unknownWordsBesides(sentence: string, answer: string): number | null {
  const lang = getStudyLang();
  if (lang === 'ja') {
    if (!tokenizerReady()) return null;
    try {
      return tokenizeSync(sentence)
        .filter((token) => token.content && !token.proper && token.surface !== answer && !answer.includes(token.surface))
        .filter((token) => Math.max(getLevel(token.lemma), getLevel(token.surface)) < 2)
        .length;
    } catch {
      return null;
    }
  }
  return segmentStudyText(sentence, lang)
    .filter((part) => part.wordLike && part.text !== answer)
    .filter((part) => Math.max(getLevel(part.text), getLevel(studyWordKey(part.text, lang))) < 2)
    .length;
}

export interface ArenaContent {
  vocab: VocabItem[];
  cloze: ClozeItem[];
  sentences: SourceCard[];
  /** True when the deck produced nothing usable and the caller must fall back. */
  usingFallback: boolean;
  studyLang: StudyLang;
  /** The bundled pack for the study language, extended by the learner's imported lists. */
  pack: GamePack;
  /**
   * i+1 (`shared/gameStudyMix.ts`): item keys (a vocab word, a cloze sentence) of words due
   * or still being learned, of words already known, and of sentences whose other words are
   * all known. The engine's `PickContext` takes them as sets.
   */
  target: string[];
  known: string[];
  prefer: string[];
  /** The study queue this content was drawn from, for the Arena's one-line summary. */
  queue: { due: number; learning: number; known: number };
}

/** Split the material into i+1 tiers. Vocab keys are words, cloze keys are sentences. */
function studyTiers(cards: readonly DeckSource[], vocab: readonly VocabItem[], cloze: readonly ClozeItem[]) {
  const statusByWord = new Map<string, StudyWordStatus>();
  for (const card of cards) {
    const word = card.word.trim();
    if (word && !statusByWord.has(word)) statusByWord.set(word, card.status);
  }
  const target: string[] = [];
  const known: string[] = [];
  const prefer: string[] = [];
  for (const item of vocab) {
    const status = statusByWord.get(item.word);
    if (status && isStudyTarget(status)) target.push(item.word);
    else if (status === 'known') known.push(item.word);
  }
  // Target sentences are checked first: they are the rounds an i+1 context matters most for.
  const targetFirst: ClozeItem[] = [];
  const rest: ClozeItem[] = [];
  for (const item of cloze) {
    const status = item.word ? statusByWord.get(item.word) : undefined;
    if (status && isStudyTarget(status)) {
      target.push(item.sentence);
      targetFirst.push(item);
    } else {
      if (status === 'known') known.push(item.sentence);
      rest.push(item);
    }
  }
  for (const item of [...targetFirst, ...rest].slice(0, I_PLUS_ONE_CHECK_LIMIT)) {
    const unknown = unknownWordsBesides(item.sentence, item.answer);
    if (unknown !== null && iPlusOneScore(unknown) >= 3) prefer.push(item.sentence);
  }
  const queue = { due: 0, learning: 0, known: 0 };
  for (const status of statusByWord.values()) {
    if (status === 'due') queue.due += 1;
    else if (status === 'learning') queue.learning += 1;
    else if (status === 'known') queue.known += 1;
  }
  return { target, known, prefer, queue };
}

/**
 * Everything the Arena can draw from the user's material for one level.
 *
 * Vocab narrows to the level's list when one is bound; with no list the whole
 * deck is eligible, since showing the player nothing is worse than showing them
 * their own words at an approximate level.
 */
export function loadArenaContent(level: LevelTier, material = 'auto'): ArenaContent {
  const studyLang = getStudyLang();
  const lists = loadGameLists().filter((l) => l.lang === studyLang);
  // "Make a game from my list": one imported list, or one deck folder, is the
  // whole session's material; nothing bundled is mixed in.
  if (material.startsWith('list:')) {
    const list = lists.find((l) => l.id === material.slice(5));
    if (list) {
      const cards = listCards(list);
      const extras = packExtrasFromLists([list]);
      const vocab = buildVocabPool(cards, null, level, lemmaOf);
      const cloze = buildClozePool(cards, surfaceInSentence, readingOfSurface);
      const onlyList = packFor(studyLang, undefined);
      const pack: GamePack = {
        ...onlyList,
        sentences: extras.sentences?.length ? extras.sentences : onlyList.sentences,
        vocab: extras.vocab?.length ? extras.vocab : onlyList.vocab,
        cloze: extras.cloze?.length ? extras.cloze : onlyList.cloze,
        reading: extras.reading?.length ? extras.reading : onlyList.reading,
      };
      // A list's words have no schedule here; their known-word level is what places them.
      const listed: DeckSource[] = cards.map((card) => ({
        ...card,
        addedAt: 0,
        status: studyWordStatus(undefined, knownLevelOf(card.word), Date.now()),
      }));
      return {
        vocab,
        cloze,
        sentences: withPieces(buildSentencePool(cards)),
        usingFallback: false,
        studyLang,
        pack,
        ...studyTiers(listed, vocab, cloze),
      };
    }
  }
  const folder = material.startsWith('folder:') ? material.slice(7) : undefined;
  // "Due" and "mined today" are the session's whole material, like a folder: the level's
  // word list does not narrow them, or a due word outside the list could never be drilled.
  const scope = material === 'due' ? 'due' : material === 'mined-today' ? 'mined-today' : 'all';
  const cards = deckCards(folder, scope);
  const vocab = buildVocabPool(cards, folder || scope !== 'all' ? null : wordsForLevel(level), level, lemmaOf);
  const cloze = buildClozePool(cards, surfaceInSentence, readingOfSurface);
  const sentences = withPieces(buildSentencePool(cards));
  return {
    vocab,
    cloze,
    sentences,
    usingFallback: vocab.length === 0 && cloze.length === 0 && sentences.length === 0,
    studyLang,
    pack: packFor(studyLang, lists.length ? packExtrasFromLists(lists) : undefined),
    ...studyTiers(cards, vocab, cloze),
  };
}

/** The deck's study queue for the warm-up: counts per kind of round the due words can fill. */
export function warmUpQueue(now = Date.now()): {
  dueCloze: number;
  dueReadable: number;
  dueVocab: number;
  deckCards: number;
} {
  const all = deckCards(undefined, 'all', now);
  const due = all.filter((card) => isStudyTarget(card.status));
  const lang = getStudyLang();
  return {
    dueCloze: buildClozePool(due, surfaceInSentence, readingOfSurface).length,
    dueReadable: due.filter((card) => (lang === 'ru' ? card.reading.normalize('NFD').includes('́') : !!card.reading.trim())).length,
    dueVocab: buildVocabPool(due, null, 1, lemmaOf).length,
    deckCards: all.length,
  };
}

/** How much of a level's list the deck can actually teach — drives the progress bar. */
export function levelCoverage(level: LevelTier): { have: number; total: number; pct: number } {
  const words = wordsForLevel(level);
  const total = words?.length ?? 0;
  const have = total ? buildVocabPool(deckCards(), words, level, lemmaOf).length : 0;
  return { have, total, pct: total > 0 ? (have / total) * 100 : 0 };
}
