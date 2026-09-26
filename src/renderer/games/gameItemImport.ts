/**
 * The learner's own word lists for the Game Arena.
 *
 * A list is words (with an optional reading, level, example sentence and its
 * translation) in one study language. Once imported it feeds the games two
 * ways: it extends the bundled pack for that language (so every game can deal
 * it), and it can be chosen as the only material for a session — "make a game
 * from my list". The same holds for a flashcard deck folder, which needs no
 * import at all (see contentStore).
 */
import { importId, pick, readImportTable } from '../../shared/contentImport';
import { segmentStudyText } from '../../shared/studySegmentation';
import { normalizeStudyLang, studyLangFromTag, studyLangOfText } from '../../shared/studyLang';
import type { LevelTier, StudyLang } from '../../shared/levelScale';
import type { GamePack } from '../data/gamePacks/types';
import type { GradedSentence, VocabPrompt, ClozePrompt, KanjiReadingPrompt } from '../data/gradedSentences';
import { writeLocalStorageJson } from '../localStorageWrite';
import type { SourceCard } from './contentSource';

export const GAME_LISTS_KEY = 'jp-game-arena-lists-v1';
export const GAME_LISTS_EVENT = 'game-arena-lists-changed';

export interface GameListRow {
  word: string;
  reading?: string;
  meaning: string;
  level?: LevelTier;
  sentence?: string;
  translation?: string;
}

export interface GameList {
  id: string;
  name: string;
  lang: StudyLang;
  createdAt: number;
  rows: GameListRow[];
}

const COLUMNS = ['word', 'term', 'expression', 'reading', 'pinyin', 'stress', 'meaning', 'translation', 'english', 'definition', 'level', 'sentence', 'example', 'sentencetranslation', 'exampletranslation', 'lang', 'language'];
const POSITIONAL = ['word', 'reading', 'meaning', 'level', 'sentence', 'sentencetranslation'];

/** `3`, `N3`, `HSK 4`, `B1` → the shared 1..7 tier. */
export function tierOf(value: string): LevelTier | undefined {
  const v = value.trim().toUpperCase().replace(/\s+/g, '');
  if (!v) return undefined;
  const n = /^(\d)$/.exec(v);
  if (n) return Math.min(7, Math.max(1, Number(n[1]))) as LevelTier;
  const jlpt = /^N([1-5])$/.exec(v);
  if (jlpt) return (7 - Number(jlpt[1])) as LevelTier;
  const hsk = /^HSK(\d)/.exec(v);
  if (hsk) return Math.min(7, Number(hsk[1])) as LevelTier;
  const cefr = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].indexOf(v);
  return cefr >= 0 ? ((cefr + 1) as LevelTier) : undefined;
}

export interface ParsedGameList {
  rows: GameListRow[];
  skipped: number;
  lang: StudyLang;
}

/** Read a word list. Rows need a word and a meaning; everything else is optional. */
export function parseGameList(text: string, fileName: string, fallbackLang: StudyLang): ParsedGameList {
  const table = readImportTable(text, fileName, COLUMNS, POSITIONAL);
  const rows: GameListRow[] = [];
  let skipped = 0;
  let declared: StudyLang | null = null;
  for (const raw of table.rows) {
    const word = pick(raw, 'word', 'term', 'expression');
    const meaning = pick(raw, 'meaning', 'translation', 'english', 'definition');
    if (!word || !meaning || word === meaning) {
      skipped += 1;
      continue;
    }
    declared ??= studyLangFromTag(pick(raw, 'lang', 'language'));
    const row: GameListRow = { word, meaning };
    const reading = pick(raw, 'reading', 'pinyin', 'stress');
    const level = tierOf(pick(raw, 'level'));
    const sentence = pick(raw, 'sentence', 'example');
    const translation = pick(raw, 'sentencetranslation', 'exampletranslation');
    if (reading) row.reading = reading;
    if (level) row.level = level;
    if (sentence) row.sentence = sentence;
    if (translation) row.translation = translation;
    rows.push(row);
  }
  // Han characters alone cannot tell Chinese from Japanese; pinyin readings can.
  const pinyin = rows.some((r) => r.reading && /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/i.test(r.reading));
  const lang =
    declared ??
    (pinyin ? 'zh' : studyLangOfText(rows.slice(0, 20).map((r) => r.word).join(' '), normalizeStudyLang(fallbackLang)));
  return { rows, skipped, lang };
}

/** A list's rows as the SourceCards the deck-driven games already understand. */
export function listCards(list: GameList): SourceCard[] {
  return list.rows.map((r) => ({ word: r.word, reading: r.reading ?? '', meaning: r.meaning, sentence: r.sentence }));
}

function tokensOf(sentence: string, lang: StudyLang): string[] {
  return segmentStudyText(sentence, lang)
    .map((part) => part.text)
    .filter((part) => part.trim().length > 0)
    .map((part) => part.trim());
}

/** The pack slots a list can fill, so bundled games deal the learner's own items too. */
export function packExtrasFromLists(lists: readonly GameList[]): Partial<Omit<GamePack, 'lang'>> {
  const vocab: VocabPrompt[] = [];
  const reading: KanjiReadingPrompt[] = [];
  const cloze: ClozePrompt[] = [];
  const sentences: GradedSentence[] = [];
  for (const list of lists) {
    for (const row of list.rows) {
      const level = row.level ?? 1;
      const id = importId(`gl-${list.lang}`, `${list.id} ${row.word}`);
      vocab.push({ id, level, jp: row.word, reading: row.reading ?? '', meanings: { en: row.meaning } });
      if (row.reading && row.reading !== row.word) {
        reading.push({ id: `${id}-r`, level, word: row.word, reading: row.reading, meaning: { en: row.meaning } });
      }
      if (row.sentence && row.sentence.includes(row.word)) {
        cloze.push({
          id: `${id}-c`,
          level,
          prompt: row.sentence.replace(row.word, '___'),
          answer: row.word,
          translations: { en: row.translation || row.meaning },
        });
      }
      if (row.sentence && row.translation) {
        const tokens = tokensOf(row.sentence, list.lang);
        if (tokens.length >= 2) {
          sentences.push({ id: `${id}-s`, level, jp: row.sentence, reading: '', tokens, translations: { en: row.translation } });
        }
      }
    }
  }
  return { vocab, reading, cloze, sentences };
}

function isList(value: unknown): value is GameList {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<GameList>;
  return typeof v.id === 'string' && typeof v.name === 'string' && Array.isArray(v.rows);
}

export function loadGameLists(): GameList[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(GAME_LISTS_KEY) ?? '[]') as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(isList).map((l) => ({ ...l, lang: normalizeStudyLang(l.lang) }))
      : [];
  } catch {
    return [];
  }
}

function saveGameLists(lists: readonly GameList[]): void {
  writeLocalStorageJson(GAME_LISTS_KEY, lists);
  try {
    window.dispatchEvent(new CustomEvent(GAME_LISTS_EVENT));
  } catch {
    /* non-browser context */
  }
}

/** Add a list (a list with the same name and language is replaced). */
export function addGameList(name: string, lang: StudyLang, rows: readonly GameListRow[], now = Date.now()): GameList {
  const list: GameList = { id: importId('glist', `${lang} ${name}`), name: name.trim(), lang, createdAt: now, rows: [...rows] };
  saveGameLists([...loadGameLists().filter((l) => l.id !== list.id), list]);
  return list;
}

export function deleteGameList(id: string): void {
  saveGameLists(loadGameLists().filter((l) => l.id !== id));
}

export function onGameListsChanged(cb: () => void): () => void {
  window.addEventListener(GAME_LISTS_EVENT, cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === GAME_LISTS_KEY) cb();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(GAME_LISTS_EVENT, cb);
    window.removeEventListener('storage', onStorage);
  };
}

export const GAME_LIST_TEMPLATE_CSV = [
  'word,reading,meaning,level,sentence,sentence_translation',
  '猫,ねこ,cat,1,猫が好きです。,I like cats.',
  '学习,xuéxí,to study,1,我在学习汉语。,I am studying Chinese.',
  'книга,кни\u0301га,book,1,Это моя книга.,This is my book.',
].join('\n');

export const GAME_LIST_TEMPLATE_JSON = JSON.stringify(
  {
    items: [
      { word: '猫', reading: 'ねこ', meaning: 'cat', level: 'N5', sentence: '猫が好きです。', sentenceTranslation: 'I like cats.' },
      { word: '学习', reading: 'xuéxí', meaning: 'to study', level: 'HSK1' },
    ],
  },
  null,
  2,
);
