/**
 * Snip to cards — the main window's half.
 *
 * Main notices a Win+Shift+S snip on the clipboard and sends it here
 * (`main/snipToCards.ts`), because the deck, the known words and the
 * pending-Anki queue live in this window's storage. This reads the picture
 * (main's accurate engine when one is installed, otherwise the bundled offline
 * recognizer for Japanese), splits the sentence into words, adds every word
 * the learner does not know yet as a card through the one mining path every
 * surface uses (`mineToStudy`), and writes the analysis back to main's history.
 *
 * "Known" and "already a card" are asked by the reader's own key
 * (`shared/knowledgeKey` through `shared/snipKnowledge`), so a snip never
 * carries a word the reader shows as known. A word that is already a card gets
 * this snip's sentence as another example instead of being skipped.
 *
 * Two modes: automatic (the default) adds the words at once; review (automatic
 * adding off, or an unsure OCR read) lists them for the learner to correct and
 * choose. Either way the learner can fix a word or its reading, or the whole
 * OCR text, and re-run the analysis.
 *
 * Undo is exact: each snip records the ids of the cards and the Anki notes it
 * created and the examples it added, and Undo / the per-word toggle remove
 * those and nothing else.
 *
 * Everything heavy (the tokenizer, the OCR worker, the dictionary, the deck)
 * is imported only when a snip arrives, so installing this costs a Blanc or
 * Study OS boot nothing but three IPC listeners.
 */

import {
  classifySnipTokens,
  groupJapaneseTokens,
  snipDeckFor,
  snipOwnsWork,
  snipReadCertainty,
  snipSendsToAnki,
  snipTextProblem,
  snipWordList,
  type SnipAction,
  type SnipEntry,
  type SnipEntryPatch,
  type SnipError,
  type SnipGrammarPoint,
  type SnipJob,
  type SnipReviewReason,
  type SnipSettings,
  type SnipToken,
  type SnipWord,
} from '../shared/snipToCards';
import { normalizeStudyLang, type StudyLang } from '../shared/studyLang';
import { t, getUiLang } from './i18n';
import { isDnd } from './notificationStore';
import { SECTION_OPEN_EVENT } from './sectionSurface';

export const SNIP_SECTION = 'snips';
/** Fired (with the snip id) when the Snips view should show one snip. */
export const SNIP_FOCUS_EVENT = 'snip:focus';

let pendingFocus: string | null = null;

/** The snip the view should open on (read once by the view when it mounts). */
export function takeSnipFocus(): string | null {
  const id = pendingFocus;
  pendingFocus = null;
  return id;
}

function focusSnip(id: string | null): void {
  pendingFocus = id;
  try {
    window.dispatchEvent(new CustomEvent(SNIP_FOCUS_EVENT, { detail: id }));
  } catch {
    /* no window */
  }
}

function isTextEntry(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'TEXTAREA' || (tag === 'INPUT' && !/^(button|checkbox|radio|range|submit|reset)$/i.test((el as HTMLInputElement).type));
}

/**
 * Bring the Snips view forward inside Gum. Never through main's pop-out route
 * (that would show and focus a window over the app the user is in): only a
 * shell already on screen takes it, and a field the user was typing in keeps
 * the keyboard.
 */
function surfaceView(id: string | null, opts: { userAsked: boolean }): void {
  focusSnip(id);
  const typing = isTextEntry(document.activeElement) ? (document.activeElement as HTMLElement) : null;
  const claimed = !window.dispatchEvent(new CustomEvent(SECTION_OPEN_EVENT, { detail: SNIP_SECTION, cancelable: true }));
  if (!claimed && opts.userAsked) void window.api?.popOut?.(SNIP_SECTION).catch(() => undefined);
  if (typing && !opts.userAsked) window.setTimeout(() => typing.focus({ preventScroll: true }), 0);
}

// ---------------------------------------------------------------------------
// Small helpers

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = window.setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      () => {
        window.clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

function flatText(text: string, lang: StudyLang): string {
  return lang === 'ru' ? text.replace(/\s*\n\s*/g, ' ') : text.replace(/\s*\n\s*/g, '');
}

/** The sentence of the snip a word sits in (a card's context), at most 300 characters. */
export function sentenceFor(text: string, surface: string, lang: StudyLang): string {
  const flat = flatText(text, lang);
  const sentences = flat.split(/(?<=[。！？!?.])/u).map((s) => s.trim()).filter(Boolean);
  const hit = sentences.find((s) => s.includes(surface)) ?? flat;
  return hit.trim().slice(0, 300);
}

async function update(id: string, patch: SnipEntryPatch): Promise<SnipEntry | null> {
  try {
    return await window.api.snipHistoryUpdate(id, patch);
  } catch {
    return null;
  }
}

/** The in-app toast bus (ToastHost; it also records the notice in the notification center). */
function inAppToast(message: string, kind: 'ok' | 'warn', action?: { label: string; run: () => void }): void {
  window.dispatchEvent(new CustomEvent('os:toast', { detail: { message, kind, ...(action ? { action } : {}) } }));
}

// ---------------------------------------------------------------------------
// Reading the picture

interface OcrRead {
  text: string;
  engine: string;
  confidence?: number;
  error?: SnipError;
}

async function readPicture(job: SnipJob): Promise<OcrRead> {
  if (job.ocr) return { text: job.ocr.text, engine: job.ocr.engine, confidence: job.ocr.confidence };
  if (!job.basicOcr) return { text: '', engine: 'none', error: 'ocr-failed' };
  try {
    const { readLensFallbackImage } = await import('./lensOfflineOcr');
    const read = await readLensFallbackImage({
      dataUrl: job.basicOcr.dataUrl,
      width: job.basicOcr.width,
      height: job.basicOcr.height,
      dipPerPixelX: 1,
      dipPerPixelY: 1,
    });
    const chars = read.lines.reduce((sum, line) => sum + line.text.length, 0);
    const confidence = chars
      ? read.lines.reduce((sum, line) => sum + line.confidence * line.text.length, 0) / chars
      : undefined;
    return { text: read.text, engine: 'basic', ...(confidence !== undefined ? { confidence } : {}) };
  } catch (err) {
    console.warn('[snipToCards] offline OCR failed', err);
    return { text: '', engine: 'basic', error: 'ocr-failed' };
  }
}

// ---------------------------------------------------------------------------
// Words

async function tokensOf(text: string, lang: StudyLang): Promise<SnipToken[]> {
  if (lang === 'ja') {
    // `getTokenizer` builds kuromoji through `tokenizerLoader` the first time it is
    // wanted (a dynamic import), so a boot that never snips never loads it.
    const { getTokenizer, tokenizeSync } = await import('./tokenizer');
    await getTokenizer();
    // OCR breaks lines where the picture did, not where the sentence does.
    const joined = text.replace(/\s+/g, '');
    return groupJapaneseTokens(tokenizeSync(joined).map((tok) => ({
      surface: tok.surface,
      lemma: tok.lemma,
      ...(tok.reading ? { reading: tok.reading } : {}),
      pos: tok.pos,
      posDetail: tok.posDetail,
      content: tok.content,
      proper: tok.proper,
    })));
  }
  const { segmentStudyText, isVocabularySegment } = await import('../shared/studySegmentation');
  const flat = lang === 'zh' ? text.replace(/\s*\n\s*/g, '') : text.replace(/\s*\n\s*/g, ' ');
  return segmentStudyText(flat, lang)
    .filter((seg) => seg.text.trim())
    .map((seg) => ({
      surface: seg.text,
      lemma: lang === 'ru' ? seg.text.toLowerCase() : seg.text,
      content: seg.wordLike && isVocabularySegment(seg.text, lang),
    }));
}

type Knowledge = import('../shared/snipKnowledge').SnipKnowledge;

/**
 * Known / in-deck by the reader's key, and the card each in-deck word is. The
 * tokenizer is built by now for Japanese (`tokensOf` awaited it), so compound
 * and する-verb cards in the deck are keyed exactly as the reader keys them.
 */
async function knowledgeFor(words: readonly Pick<SnipWord, 'surface' | 'lemma' | 'surfaceReading'>[], lang: StudyLang): Promise<Knowledge> {
  const [{ loadDeck }, known, { snipKnowledge }] = await Promise.all([
    import('./flashcardDeck'),
    import('./knownWords'),
    import('../shared/snipKnowledge'),
  ]);
  let tokenizeJapanese: ((text: string) => ReturnType<typeof import('./tokenizer').tokenizeSync>) | null = null;
  if (lang === 'ja') {
    const tokenizer = await import('./tokenizer');
    tokenizeJapanese = tokenizer.tokenizerReady() ? tokenizer.tokenizeSync : null;
  }
  return snipKnowledge(
    words.map((w) => ({ surface: w.surface, lemma: w.lemma, ...(w.surfaceReading ? { reading: w.surfaceReading } : {}) })),
    lang,
    { levelOf: known.getLevel, isManual: known.isManualLevel },
    loadDeck(),
    { tokenizeJapanese, levelOf: known.getLevel },
  );
}

/**
 * Reading, meaning, level, frequency and the conjugation, from the offline
 * dictionary. Only entries the dictionary presents as THIS word count (exact,
 * by reading, or de-inflected — never a prefix or gloss near-miss), and the
 * conjugation steps are kept only when the chosen entry is the one the
 * dictionary de-inflected to.
 */
async function enrichWord(word: SnipWord, lang: StudyLang, opts: { surfaceFirst?: boolean } = {}): Promise<SnipWord> {
  const api = window.api;
  const { isScanAcceptedEntry } = await import('../shared/dictScan');
  type Result = Awaited<ReturnType<typeof api.lookupTerm>>;
  const accepted = (result: Result | null | undefined) => (result?.entries ?? []).filter(isScanAcceptedEntry);
  const pick = (result: Result | null | undefined, target: string) => {
    const entries = accepted(result);
    return entries.find((e) => e.word === target) ?? entries.find((e) => e.reading === target) ?? entries[0];
  };
  try {
    let result = null as Result | null;
    if (lang === 'zh') {
      result = (await withTimeout(api.lookupChinese?.(word.lemma, 4) ?? Promise.resolve(null), 20_000, null)) ?? null;
    } else {
      // The surface first: the dictionary de-inflects it (眠っていた → 眠る, with the steps).
      if ((opts.surfaceFirst ?? true) && word.surface !== word.lemma) {
        result = (await withTimeout(api.lookupTerm?.(word.surface, 4, lang) ?? Promise.resolve(null), 20_000, null)) ?? null;
      }
      if (!accepted(result).length) {
        result = (await withTimeout(api.lookupTerm?.(word.lemma, 4, lang) ?? Promise.resolve(null), 20_000, null)) ?? null;
      }
    }
    const entry = pick(result, word.lemma);
    if (!entry) return word;
    const meaning = entry.senses
      .slice(0, 2)
      .map((sense) => sense.definitions.join('; '))
      .filter(Boolean)
      .join(' / ')
      .slice(0, 600);
    const info = result?.deinflection;
    const reasons = info && (!info.term || info.term === entry.word) && entry.via !== 'exact'
      ? info.reasons?.filter(Boolean)
      : undefined;
    return {
      ...word,
      // A reading the learner typed is theirs; the dictionary's only fills a gap.
      ...(entry.reading && entry.reading !== entry.word && !(word.edited && word.reading) ? { reading: entry.reading } : {}),
      ...(meaning ? { meaning } : {}),
      ...(entry.jlpt?.[0] ? { level: entry.jlpt[0] } : {}),
      ...(typeof entry.frequency === 'number' && entry.frequency > 0 ? { freq: entry.frequency } : {}),
      ...(reasons?.length ? { deinflection: reasons } : {}),
    };
  } catch {
    return word;
  }
}

const LOOKUP_STATUSES = new Set<SnipWord['status']>(['candidate', 'overLimit', 'known', 'inDeck', 'duplicate', 'name']);
const MAX_LOOKUPS = 40;

async function enrichWords(words: SnipWord[], lang: StudyLang): Promise<SnipWord[]> {
  const out = [...words];
  const targets = out
    .map((word, index) => ({ word, index }))
    .filter(({ word }) => LOOKUP_STATUSES.has(word.status))
    .slice(0, MAX_LOOKUPS);
  // A few at a time: the dictionary is one database, and the snip's own words first.
  for (let i = 0; i < targets.length; i += 4) {
    const batch = targets.slice(i, i + 4);
    const done = await Promise.all(batch.map(({ word }) => enrichWord(word, lang)));
    batch.forEach(({ index }, k) => {
      out[index] = done[k];
    });
  }
  return out;
}

async function grammarOf(text: string, lang: StudyLang): Promise<SnipGrammarPoint[]> {
  try {
    const { localSentenceAnalysis } = await import('./localGrammarAnalysis');
    const result = localSentenceAnalysis(flatText(text, lang), lang);
    const seen = new Set<string>();
    const points: SnipGrammarPoint[] = [];
    for (const a of result?.annotations ?? []) {
      const title = a.headword || a.text;
      if (!title || seen.has(title)) continue;
      seen.add(title);
      points.push({
        title,
        ...(a.grammarId ? { id: a.grammarId } : {}),
        ...(a.meaning ? { meaning: a.meaning } : {}),
        ...(a.level ? { level: a.level } : {}),
      });
    }
    return points.slice(0, 20);
  } catch {
    return [];
  }
}

/** Split, classify (by the reader's key), enrich and find the grammar of a text. */
async function analyse(text: string, lang: StudyLang, maxWords: number): Promise<{
  words: SnipWord[];
  grammar: SnipGrammarPoint[];
  knowledge: Knowledge;
}> {
  const tokens = await tokensOf(text, lang);
  const knowledge = await knowledgeFor(
    tokens.map((tok) => ({ surface: tok.surface, lemma: tok.lemma || tok.surface, ...(tok.reading ? { surfaceReading: tok.reading } : {}) })),
    lang,
  );
  let words = classifySnipTokens(tokens, lang, knowledge, maxWords);
  // The card an in-deck word already is (for Open card and for merging the sentence in).
  words = words.map((w) => {
    if (w.status !== 'inDeck') return w;
    const cardId = knowledge.cardFor({ surface: w.surface, lemma: w.lemma, ...(w.surfaceReading ? { reading: w.surfaceReading } : {}) });
    return cardId ? { ...w, cardId } : w;
  });
  words = await enrichWords(words, lang);
  const grammar = await grammarOf(text, lang);
  return { words, grammar, knowledge };
}

// ---------------------------------------------------------------------------
// Cards

interface MineContext {
  entry: SnipEntry;
  lang: StudyLang;
  settings: SnipSettings;
  imagePath?: string;
  image?: { base64: string; filename: string };
}

async function storeImage(cardImage: SnipJob['cardImage']): Promise<string | undefined> {
  if (!cardImage || typeof window.api?.flashcardStoreMinedMedia !== 'function') return undefined;
  try {
    const stored = await window.api.flashcardStoreMinedMedia(cardImage.base64, cardImage.filename);
    return stored.ok && stored.path ? stored.path : undefined;
  } catch {
    return undefined;
  }
}

/** Mine one word as a card (and Anki note). Returns the word with what happened. */
async function mineWord(word: SnipWord, ctx: MineContext): Promise<SnipWord> {
  const { mineToStudy } = await import('./studyMining');
  const { toHiragana } = await import('../shared/furigana');
  const sentence = sentenceFor(ctx.entry.text, word.surface, ctx.lang);
  const reading = word.reading ? (ctx.lang === 'ja' ? toHiragana(word.reading) : word.reading) : '';
  const term = word.lemma || word.surface;
  const anki = snipSendsToAnki(ctx.settings.sendToAnki)
    ? {
      route: { source: 'extension' as const, cardKind: 'word' as const, language: ctx.lang },
      term,
      ...(reading && reading !== term ? { reading } : {}),
      ...(word.meaning ? { meaning: word.meaning } : {}),
      ...(sentence ? { sentence } : {}),
      ...(word.surface !== term ? { surface: word.surface } : {}),
      ...(ctx.image ? { imageBase64: ctx.image.base64, imageFilename: ctx.image.filename } : {}),
      ...(ctx.settings.ankiDeck ? { deckName: ctx.settings.ankiDeck } : {}),
    }
    : undefined;
  try {
    const result = await mineToStudy({
      word: term,
      reading: reading && reading !== term ? reading : '',
      meaning: word.meaning ?? '',
      ...(sentence ? { sentence } : {}),
      source: 'companion',
      studyKind: 'vocabulary',
      studyLang: ctx.lang,
      folder: snipDeckFor(ctx.entry, ctx.settings),
      sourceId: 'snip',
      sourceTitle: t('snip.card.source'),
      ...(ctx.imagePath ? { imagePath: ctx.imagePath } : {}),
      ...(anki ? { anki } : {}),
      notify: false,
    });
    if (!result.created) return { ...word, status: 'inDeck', cardId: result.card.id, ankiNoteId: undefined };
    const noteId = result.anki === 'added' && result.ankiResult?.ok && typeof result.ankiResult.noteId === 'number'
      ? result.ankiResult.noteId
      : undefined;
    return { ...word, status: 'added', cardId: result.card.id, ...(noteId ? { ankiNoteId: noteId } : { ankiNoteId: undefined }) };
  } catch (err) {
    console.warn('[snipToCards] could not add', term, err);
    return { ...word, status: 'failed' };
  }
}

function sameSentence(a: string | undefined, b: string | undefined): boolean {
  const norm = (s: string | undefined) => (s ?? '').normalize('NFKC').replace(/\s+/g, '').trim();
  return Boolean(norm(a)) && norm(a) === norm(b);
}

/**
 * The word is already a card: give that card this snip's sentence as another
 * example (the card's own sentence and examples it already has are not
 * repeated). Returns the word as `merged` with the exact example text stored,
 * or unchanged when there was nothing to add.
 */
async function mergeIntoCard(word: SnipWord, ctx: Pick<MineContext, 'entry' | 'lang'>): Promise<SnipWord> {
  if (!word.cardId) return word;
  const sentence = sentenceFor(ctx.entry.text, word.surface, ctx.lang);
  if (!sentence) return word;
  const [{ loadDeck, updateDeckCard }, { mergeCardExamples }] = await Promise.all([
    import('./flashcardDeck'),
    import('../shared/aiExampleSentences'),
  ]);
  const card = loadDeck().find((c) => c.id === word.cardId);
  if (!card) return { ...word, cardId: undefined };
  if (sameSentence(card.sentence, sentence)) return word;
  const before = card.exampleSentences ?? [];
  if (before.some((e) => sameSentence(e.text, sentence))) return word;
  const next = mergeCardExamples(before, [{ text: sentence, origin: 'corpus' }]);
  if (next.length === before.length) return word; // the card's examples are full
  const stored = next[next.length - 1].text;
  updateDeckCard(card.id, { exampleSentences: next });
  return { ...word, status: 'merged', example: stored };
}

/** Take back the example a merge added (and only it). */
async function unmergeFromCard(word: SnipWord): Promise<void> {
  if (!word.cardId || !word.example) return;
  const { loadDeck, updateDeckCard } = await import('./flashcardDeck');
  const card = loadDeck().find((c) => c.id === word.cardId);
  if (!card?.exampleSentences?.length) return;
  const at = card.exampleSentences.findIndex((e) => e.text === word.example);
  if (at < 0) return;
  const next = card.exampleSentences.filter((_, i) => i !== at);
  updateDeckCard(card.id, { exampleSentences: next.length ? next : undefined });
}

/**
 * What the snip still owns: the cards of its added words, and every Anki note it
 * created that is still there — including one whose card was removed while Anki
 * was closed, so the next Undo can still take the note away.
 */
function ownedIds(words: readonly SnipWord[]): { cardIds: string[]; ankiNoteIds: number[] } {
  return {
    cardIds: words
      .filter((w) => w.status === 'added')
      .map((w) => w.cardId)
      .filter((id): id is string => Boolean(id)),
    ankiNoteIds: words
      .filter((w) => w.status === 'added' || w.status === 'removed')
      .map((w) => w.ankiNoteId)
      .filter((id): id is number => typeof id === 'number'),
  };
}

/** Add one word: a new card, or — already a card — this sentence as another example. */
async function addOne(word: SnipWord, ctx: MineContext, merge: boolean): Promise<SnipWord> {
  if (word.status === 'inDeck' && word.cardId && merge) return mergeIntoCard(word, ctx);
  return mineWord({ ...word, status: 'candidate' }, ctx);
}

// ---------------------------------------------------------------------------
// Telling the user

function errorMessage(error: SnipError | undefined, lang: StudyLang): string {
  switch (error) {
    case 'models-missing':
      return t('snip.toast.modelsMissing', { lang: t(`snip.lang.${lang}`) });
    case 'no-text':
      return t('snip.error.noText');
    case 'garbage':
      return t('snip.error.garbage');
    case 'low-confidence':
      return t('snip.error.lowConfidence');
    case 'cancelled':
      return t('snip.error.cancelled');
    default:
      return t('snip.error.ocrFailed');
  }
}

function reviewMessage(count: number, review: SnipReviewReason, confidence: number | undefined): string {
  return review === 'uncertain'
    ? t('snip2.toast.reviewUnsure', { count, percent: Math.round((confidence ?? 0) * 100) })
    : t('snip2.toast.review', { count });
}

/** What happened, for the toasts. */
interface Outcome {
  added: string[];
  merged: number;
  /** Words waiting for the learner (review mode). */
  waiting: number;
}

function outcomeOf(entry: SnipEntry): Outcome {
  return {
    added: entry.words.filter((w) => w.status === 'added').map((w) => w.lemma || w.surface),
    merged: entry.words.filter((w) => w.status === 'merged').length,
    waiting: entry.review ? entry.words.filter((w) => w.status === 'candidate').length : 0,
  };
}

/**
 * The toast (or, in quiet hours, only the notification center's record). The
 * first snip that makes cards always goes to the background toast, even with
 * Gum focused: main attaches the one-time "Snip to cards is on" notice there,
 * with Turn off and Keep.
 */
function announce(entry: SnipEntry, outcome: Outcome, opts: { noticePending?: boolean } = {}): void {
  const lang = normalizeStudyLang(entry.lang);
  const failed = entry.status === 'error';
  const { added, merged, waiting } = outcome;
  let message: string;
  if (failed) message = errorMessage(entry.error, lang);
  else if (added.length) message = t('snip.toast.added', { count: added.length, words: snipWordList(added) });
  else if (waiting && entry.review) message = reviewMessage(waiting, entry.review, entry.confidence);
  else if (merged) message = t('snip2.toast.mergedOnly', { count: merged });
  else message = t('snip.toast.none');
  if (!failed && added.length && merged) message = `${message} ${t('snip2.toast.mergedToo', { count: merged })}`;
  const kind = failed ? 'warning' : added.length || merged ? 'success' : 'info';
  const quiet = isDnd();
  const notice = Boolean(opts.noticePending && added.length);
  const inApp = !quiet && !notice && typeof document !== 'undefined' && document.hasFocus();
  if (inApp) {
    const action = added.length || merged
      ? { label: t('snip.toast.undo'), run: () => void runAction({ id: entry.id, action: 'undo' }) }
      : waiting
        ? { label: t('snip2.toast.reviewAction'), run: () => surfaceView(entry.id, { userAsked: true }) }
        : undefined;
    inAppToast(message, failed || entry.review === 'uncertain' ? 'warn' : 'ok', action);
    return;
  }
  void import('./notificationStore').then(({ notify }) => {
    notify({ message, kind, source: 'snip', silent: quiet });
  }).catch(() => undefined);
  if (quiet) return;
  const toastKind = failed ? 'error' : added.length ? 'added' : waiting ? 'review' : merged ? 'added' : 'none';
  void window.api?.snipToastShow?.({
    id: entry.id,
    kind: toastKind,
    words: [...added],
    count: added.length,
    lang,
    ...(merged ? { merged } : {}),
    ...(waiting ? { count: waiting } : {}),
    ...(entry.review && waiting ? { review: entry.review } : {}),
    ...(entry.engine ? { engine: entry.engine } : {}),
    ...(typeof entry.confidence === 'number' ? { confidence: Math.round(entry.confidence * 100) } : {}),
    ...(failed && entry.error ? { error: entry.error } : {}),
  }).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// The pipeline

async function translateLater(entry: SnipEntry): Promise<void> {
  const lang = normalizeStudyLang(entry.lang);
  const ui = getUiLang();
  const target = ui === lang ? 'en' : ui;
  try {
    const { translateTo } = await import('./translator');
    // The user's own route for this pair: offline first, a cloud engine only when they
    // already chose and consented to it (translateRouter enforces both).
    const text = await translateTo(flatText(entry.text, lang), lang, target);
    await update(entry.id, text.trim() ? { translation: text.trim() } : { translationError: t('snip.translate.empty') });
  } catch (err) {
    await update(entry.id, { translationError: err instanceof Error ? err.message : t('snip.translate.failed') });
  }
}

/** Add every candidate (and merge every in-deck word) of an analysed snip. */
async function addAll(words: SnipWord[], ctx: MineContext): Promise<SnipWord[]> {
  const out = [...words];
  for (let i = 0; i < out.length; i += 1) {
    if (out[i].status === 'candidate') out[i] = await mineWord(out[i], ctx);
    else if (out[i].status === 'inDeck' && ctx.settings.mergeExisting) out[i] = await mergeIntoCard(out[i], ctx);
  }
  return out;
}

export async function processSnip(job: SnipJob): Promise<SnipEntry | null> {
  const { entry, settings } = job;
  const lang = normalizeStudyLang(entry.lang);
  if (entry.status === 'error') {
    announce(entry, { added: [], merged: 0, waiting: 0 });
    return entry;
  }
  const read = await readPicture(job);
  const problem = read.error ?? snipTextProblem(read.text, lang, read.confidence);
  if (problem) {
    // Never cards from an empty or garbled read: the entry keeps what was read, for the
    // history (and for "Fix the text" in the Snips view).
    const failed = await update(entry.id, {
      status: 'error',
      error: problem,
      text: read.text.trim(),
      engine: read.engine,
      ...(read.confidence !== undefined ? { confidence: read.confidence } : {}),
    });
    announce(failed ?? { ...entry, status: 'error', error: problem }, { added: [], merged: 0, waiting: 0 });
    return failed;
  }
  const text = read.text.trim();
  const { words: analysed, grammar } = await analyse(text, lang, settings.maxWords);
  // Review instead of adding: the learner turned automatic adding off, or the read is unsure.
  const review: SnipReviewReason | undefined = !settings.autoAdd
    ? 'manual'
    : snipReadCertainty(read.confidence) === 'unsure'
      ? 'uncertain'
      : undefined;
  const base: SnipEntry = {
    ...entry,
    text,
    engine: read.engine,
    ...(read.confidence !== undefined ? { confidence: read.confidence } : {}),
    words: analysed,
    grammar,
    overLimit: analysed.filter((w) => w.status === 'overLimit').length,
    ...(review ? { review } : {}),
  };
  await update(entry.id, {
    text: base.text,
    engine: base.engine,
    ...(read.confidence !== undefined ? { confidence: read.confidence } : {}),
    words: analysed,
    grammar,
    overLimit: base.overLimit,
    ...(review ? { review } : {}),
  });

  let words = analysed;
  if (!review) {
    const ctx: MineContext = {
      entry: base,
      lang,
      settings,
      imagePath: await storeImage(job.cardImage),
      ...(job.cardImage ? { image: job.cardImage } : {}),
    };
    words = await addAll(words, ctx);
  }
  const owned = ownedIds(words);
  const done = await update(entry.id, { status: 'done', words, ...owned });
  const final = done ?? { ...base, status: 'done' as const, words, ...owned };
  announce(final, outcomeOf(final), { noticePending: settings.notice === 'pending' });
  if (settings.openView && typeof document !== 'undefined' && document.visibilityState === 'visible') {
    surfaceView(entry.id, { userAsked: false });
  }
  void translateLater(final);
  return final;
}

// ---------------------------------------------------------------------------
// Undo, the per-word toggle, review, corrections

async function removeOwned(cardIds: readonly string[], noteIds: readonly number[]): Promise<{ notesLeft: number[] }> {
  const { loadDeck, removeDeckCards } = await import('./flashcardDeck');
  const live = new Set(loadDeck().map((c) => c.id));
  const doomed = cardIds.filter((id) => live.has(id));
  if (doomed.length) removeDeckCards(doomed);
  if (!noteIds.length || typeof window.api?.ankiDeleteNotes !== 'function') return { notesLeft: [] };
  try {
    const res = await window.api.ankiDeleteNotes([...noteIds]);
    return { notesLeft: res?.ok ? [] : [...noteIds] };
  } catch {
    return { notesLeft: [...noteIds] };
  }
}

async function undo(id: string): Promise<void> {
  const entry = await window.api.snipHistoryGet(id);
  if (!entry || entry.undone) return;
  const { notesLeft } = await removeOwned(entry.cardIds, entry.ankiNoteIds);
  const removed = entry.words.filter((w) => w.status === 'added').map((w) => w.lemma || w.surface);
  const merged = entry.words.filter((w) => w.status === 'merged');
  for (const word of merged) await unmergeFromCard(word);
  const words = entry.words.map((w): SnipWord => {
    if (w.status === 'added') {
      return { ...w, status: 'removed', cardId: undefined, ...(w.ankiNoteId && notesLeft.includes(w.ankiNoteId) ? {} : { ankiNoteId: undefined }) };
    }
    if (w.status === 'merged') return { ...w, status: 'inDeck', example: undefined };
    return w;
  });
  await update(id, { undone: true, words, cardIds: [], ankiNoteIds: notesLeft });
  let message = notesLeft.length
    ? t('snip.toast.undoneAnkiLeft', { count: removed.length })
    : t('snip.toast.undone', { count: removed.length });
  if (merged.length) message = removed.length ? `${message} ${t('snip2.toast.examplesRemoved', { count: merged.length })}` : t('snip2.toast.examplesRemoved', { count: merged.length });
  if (typeof document !== 'undefined' && document.hasFocus()) {
    inAppToast(message, notesLeft.length ? 'warn' : 'ok');
  } else if (!isDnd()) {
    void window.api?.snipToastShow?.({ id, kind: 'undone', words: removed, count: removed.length, ...(merged.length ? { merged: merged.length } : {}) }).catch(() => undefined);
  }
}

/** Never added from the toggle: punctuation and numbers are not words. */
const NOT_ADDABLE = new Set<SnipWord['status']>(['added', 'merged', 'punct', 'number']);

async function contextFor(entry: SnipEntry): Promise<MineContext> {
  const status = await window.api.snipGetStatus();
  return { entry, lang: normalizeStudyLang(entry.lang), settings: status };
}

async function saveWords(id: string, words: SnipWord[]): Promise<void> {
  const owned = ownedIds(words);
  const owns = words.some((w) => w.status === 'added' || w.status === 'merged') || owned.ankiNoteIds.length > 0;
  await update(id, { words, cardIds: owned.cardIds, ankiNoteIds: owned.ankiNoteIds, ...(owns ? { undone: false } : {}) });
}

async function toggleWord(id: string, index: number, add: boolean): Promise<void> {
  const entry = await window.api.snipHistoryGet(id);
  const word = entry?.words[index];
  if (!entry || !word) return;
  const lang = normalizeStudyLang(entry.lang);
  const words = [...entry.words];
  if (!add) {
    if (word.status === 'merged') {
      await unmergeFromCard(word);
      words[index] = { ...word, status: 'inDeck', example: undefined };
    } else if (word.status === 'added') {
      const { notesLeft } = await removeOwned(word.cardId ? [word.cardId] : [], word.ankiNoteId ? [word.ankiNoteId] : []);
      words[index] = { ...word, status: 'removed', cardId: undefined, ...(notesLeft.length ? {} : { ankiNoteId: undefined }) };
    } else {
      return;
    }
  } else {
    if (NOT_ADDABLE.has(word.status)) return;
    const ctx = await contextFor(entry);
    const enriched = word.meaning ? word : await enrichWord(word, lang, { surfaceFirst: !word.edited });
    words[index] = await addOne(enriched, ctx, true);
  }
  await saveWords(id, words);
}

/** Review mode's "Add selected": the chosen words, in sentence order, as one change. */
async function addWords(id: string, indices: readonly number[]): Promise<void> {
  const entry = await window.api.snipHistoryGet(id);
  if (!entry) return;
  const ctx = await contextFor(entry);
  const lang = ctx.lang;
  const words = [...entry.words];
  for (const index of [...indices].sort((a, b) => a - b)) {
    const word = words[index];
    if (!word || NOT_ADDABLE.has(word.status)) continue;
    const enriched = word.meaning ? word : await enrichWord(word, lang, { surfaceFirst: !word.edited });
    words[index] = await addOne(enriched, ctx, true);
  }
  await saveWords(id, words);
  const done = await window.api.snipHistoryGet(id);
  if (done) {
    const outcome = outcomeOf({ ...done, review: undefined });
    if (outcome.added.length || outcome.merged) announce({ ...done, review: undefined }, { ...outcome, waiting: 0 });
  }
}

/**
 * Correct a word: its dictionary form (an OCR misread such as 末 for 未) and/or
 * its reading (furigana). A changed word is looked up again and re-checked
 * against the known words and the deck; a word that is already a card has
 * that card corrected too (an Anki note already sent keeps what it had).
 */
async function editWord(id: string, index: number, patch: { lemma?: string; reading?: string }): Promise<void> {
  const entry = await window.api.snipHistoryGet(id);
  const word = entry?.words[index];
  if (!entry || !word) return;
  const lang = normalizeStudyLang(entry.lang);
  const { toHiragana } = await import('../shared/furigana');
  const lemmaChanged = patch.lemma !== undefined && patch.lemma !== word.lemma;
  const reading = patch.reading !== undefined ? (lang === 'ja' ? toHiragana(patch.reading) : patch.reading) : undefined;
  let next: SnipWord = {
    ...word,
    edited: true,
    // A new word drops everything looked up for the old one (its reading too, unless one was typed).
    ...(lemmaChanged
      ? { lemma: patch.lemma as string, reading: undefined, surfaceReading: undefined, meaning: undefined, level: undefined, freq: undefined, deinflection: undefined }
      : {}),
    ...(reading !== undefined ? { reading: reading || undefined } : {}),
  };
  if (lemmaChanged && word.surface === word.lemma) next.surface = patch.lemma as string;
  // Furigana over the text follows a corrected reading when the word is not inflected.
  if (reading !== undefined && next.surface === next.lemma) next.surfaceReading = reading || undefined;
  if (lemmaChanged) {
    next = await enrichWord(next, lang, { surfaceFirst: false });
    if (next.status !== 'added' && next.status !== 'merged') {
      const knowledge = await knowledgeFor([next], lang);
      const cardId = knowledge.cardFor({ surface: next.surface, lemma: next.lemma });
      next = knowledge.isKnown(next.lemma, next.surface)
        ? { ...next, status: 'known', cardId: undefined }
        : cardId
          ? { ...next, status: 'inDeck', cardId }
          : { ...next, status: 'candidate', cardId: undefined };
    }
  }
  const words = [...entry.words];
  words[index] = next;
  // A misread written form is corrected in the snip's text too, so the card's sentence carries it.
  const surfaceChanged = next.surface !== word.surface;
  const text = surfaceChanged && entry.text.includes(word.surface) ? entry.text.replace(word.surface, next.surface) : entry.text;
  if (next.status === 'added' && next.cardId) {
    const { updateDeckCard } = await import('./flashcardDeck');
    updateDeckCard(next.cardId, {
      word: next.lemma,
      reading: next.reading && next.reading !== next.lemma ? next.reading : '',
      ...(lemmaChanged ? { meaning: next.meaning ?? '' } : {}),
    });
  }
  if (text !== entry.text) await update(id, { text, ...(entry.ocrText === undefined ? { ocrText: entry.text } : {}) });
  await saveWords(id, words);
}

/**
 * Analyse corrected text again (the OCR got characters wrong). Only while the
 * snip owns nothing — Undo first — so its cards always match its words. The
 * result waits for review: the learner is already checking this snip.
 */
async function reanalyze(id: string, text: string): Promise<void> {
  const entry = await window.api.snipHistoryGet(id);
  if (!entry || snipOwnsWork(entry)) return;
  const lang = normalizeStudyLang(entry.lang);
  const status = await window.api.snipGetStatus();
  const { words, grammar } = await analyse(text, lang, status.maxWords);
  const next = await update(id, {
    status: 'done',
    text,
    ...(entry.ocrText === undefined ? { ocrText: entry.text } : {}),
    words,
    grammar,
    review: 'manual',
    undone: false,
    cardIds: [],
    ankiNoteIds: [],
    ...(words.some((w) => w.status === 'overLimit') ? { overLimit: words.filter((w) => w.status === 'overLimit').length } : {}),
    clear: ['error', 'installIds', 'translation', 'translationError', ...(words.some((w) => w.status === 'overLimit') ? [] : ['overLimit' as const])],
  });
  if (next) void translateLater(next);
}

/** This snip's own deck: later adds go there, and the cards it added move there. */
async function setDeck(id: string, deck: string): Promise<void> {
  const entry = await window.api.snipHistoryGet(id);
  if (!entry) return;
  const status = await window.api.snipGetStatus();
  const target = snipDeckFor({ deck }, status);
  const { setDeckCardFolder } = await import('./flashcardDeck');
  for (const cardId of entry.cardIds) setDeckCardFolder(cardId, target);
  await update(id, deck ? { deck } : { deck: '' });
}

let actions: Promise<unknown> = Promise.resolve();

/** Undo / remove one / add one / review / corrections, one at a time (they read and write the same entry). */
export function runAction(action: SnipAction): Promise<void> {
  const run = actions.then(async () => {
    switch (action.action) {
      case 'undo':
        await undo(action.id);
        break;
      case 'addWord':
      case 'removeWord':
        await toggleWord(action.id, action.index, action.action === 'addWord');
        break;
      case 'addWords':
        await addWords(action.id, action.indices);
        break;
      case 'editWord':
        await editWord(action.id, action.index, { lemma: action.lemma, reading: action.reading });
        break;
      case 'reanalyze':
        await reanalyze(action.id, action.text);
        break;
      case 'setDeck':
        await setDeck(action.id, action.deck);
        break;
      default:
        break;
    }
  });
  actions = run.catch(() => undefined);
  return run;
}

let snips: Promise<unknown> = Promise.resolve();

/**
 * Listen for snips, Undo and Open from main, then tell main this window is
 * ready (which also sends anything that arrived while it was loading).
 */
export function installSnipToCards(): () => void {
  const api = window.api;
  if (!api?.onSnipProcess) return () => undefined;
  const offs = [
    api.onSnipProcess((job) => {
      snips = snips.then(() => processSnip(job)).catch((err) => console.error('[snipToCards] snip failed', err));
    }),
    api.onSnipAction((action) => {
      void runAction(action);
    }),
    api.onSnipOpen(({ id }) => surfaceView(id, { userAsked: true })),
  ];
  void api.snipReady?.().catch(() => undefined);
  return () => {
    for (const off of offs) off();
  };
}

export const __snipToCardsRendererTestables = { tokensOf, enrichWord, ownedIds, announce };
