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
 * Undo is exact: each snip records the ids of the cards and the Anki notes it
 * created, and Undo / the per-word toggle remove those and nothing else.
 *
 * Everything heavy (the tokenizer, the OCR worker, the dictionary, the deck)
 * is imported only when a snip arrives, so installing this costs a Blanc or
 * Study OS boot nothing but three IPC listeners.
 */

import {
  classifySnipTokens,
  groupJapaneseTokens,
  snipSendsToAnki,
  snipTextProblem,
  snipWordList,
  type SnipAction,
  type SnipEntry,
  type SnipEntryPatch,
  type SnipError,
  type SnipGrammarPoint,
  type SnipJob,
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

function normalizeWord(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}

/** The sentence of the snip a word sits in (a card's context), at most 300 characters. */
export function sentenceFor(text: string, surface: string, lang: StudyLang): string {
  const flat = lang === 'ru' ? text.replace(/\s*\n\s*/g, ' ') : text.replace(/\s*\n\s*/g, '');
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

/** Reading, meaning, level, frequency and the conjugation, from the offline dictionary. */
async function enrichWord(word: SnipWord, lang: StudyLang): Promise<SnipWord> {
  const api = window.api;
  const pick = (result: Awaited<ReturnType<typeof api.lookupTerm>> | null | undefined, target: string) =>
    result?.entries?.find((e) => e.word === target || e.reading === target) ?? result?.entries?.[0];
  try {
    let result = null as Awaited<ReturnType<typeof api.lookupTerm>> | null;
    if (lang === 'zh') {
      result = (await withTimeout(api.lookupChinese?.(word.lemma, 4) ?? Promise.resolve(null), 20_000, null)) ?? null;
    } else {
      // The surface first: the dictionary deinflects it (眠っていた → 眠る, with the steps).
      if (word.surface !== word.lemma) {
        result = (await withTimeout(api.lookupTerm?.(word.surface, 4, lang) ?? Promise.resolve(null), 20_000, null)) ?? null;
      }
      if (!result?.entries?.length) {
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
    const reasons = result?.deinflection?.reasons?.filter(Boolean);
    return {
      ...word,
      ...(entry.reading && entry.reading !== entry.word ? { reading: entry.reading } : {}),
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
    const flat = lang === 'ru' ? text.replace(/\s*\n\s*/g, ' ') : text.replace(/\s*\n\s*/g, '');
    const result = localSentenceAnalysis(flat, lang);
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

// ---------------------------------------------------------------------------
// Cards

interface MineContext {
  entry: SnipEntry;
  lang: StudyLang;
  settings: SnipSettings;
  imagePath?: string;
  image?: { base64: string; filename: string };
}

async function storeImage(job: SnipJob): Promise<string | undefined> {
  if (!job.cardImage || typeof window.api?.flashcardStoreMinedMedia !== 'function') return undefined;
  try {
    const stored = await window.api.flashcardStoreMinedMedia(job.cardImage.base64, job.cardImage.filename);
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
      folder: ctx.settings.deck,
      sourceId: 'snip',
      sourceTitle: t('snip.card.source'),
      ...(ctx.imagePath ? { imagePath: ctx.imagePath } : {}),
      ...(anki ? { anki } : {}),
      notify: false,
    });
    if (!result.created) return { ...word, status: 'inDeck', cardId: undefined, ankiNoteId: undefined };
    const noteId = result.anki === 'added' && result.ankiResult?.ok && typeof result.ankiResult.noteId === 'number'
      ? result.ankiResult.noteId
      : undefined;
    return { ...word, status: 'added', cardId: result.card.id, ...(noteId ? { ankiNoteId: noteId } : { ankiNoteId: undefined }) };
  } catch (err) {
    console.warn('[snipToCards] could not add', term, err);
    return { ...word, status: 'failed' };
  }
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

/** The toast (or, in quiet hours, only the notification center's record). */
function announce(entry: SnipEntry, added: readonly string[]): void {
  const lang = normalizeStudyLang(entry.lang);
  const failed = entry.status === 'error';
  const message = failed
    ? errorMessage(entry.error, lang)
    : added.length
      ? t('snip.toast.added', { count: added.length, words: snipWordList(added) })
      : t('snip.toast.none');
  const kind = failed ? 'warning' : added.length ? 'success' : 'info';
  const quiet = isDnd();
  const inApp = !quiet && typeof document !== 'undefined' && document.hasFocus();
  if (inApp) {
    // ToastHost's bus; it also records the notice in the notification center.
    window.dispatchEvent(new CustomEvent('os:toast', {
      detail: {
        message,
        kind: failed ? 'warn' : 'ok',
        ...(added.length ? { action: { label: t('snip.toast.undo'), run: () => void runAction({ id: entry.id, action: 'undo' }) } } : {}),
      },
    }));
    return;
  }
  void import('./notificationStore').then(({ notify }) => {
    notify({ message, kind, source: 'snip', silent: quiet });
  }).catch(() => undefined);
  if (quiet) return;
  void window.api?.snipToastShow?.({
    id: entry.id,
    kind: failed ? 'error' : added.length ? 'added' : 'none',
    words: [...added],
    count: added.length,
    lang,
    ...(failed && entry.error ? { error: entry.error } : {}),
  }).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// The pipeline

async function translateLater(entry: SnipEntry): Promise<void> {
  const lang = normalizeStudyLang(entry.lang);
  const ui = getUiLang();
  const target = ui === lang ? 'en' : ui;
  const flat = lang === 'ru' ? entry.text.replace(/\s*\n\s*/g, ' ') : entry.text.replace(/\s*\n\s*/g, '');
  try {
    const { translateTo } = await import('./translator');
    // The user's own route for this pair: offline first, a cloud engine only when they
    // already chose and consented to it (translateRouter enforces both).
    const text = await translateTo(flat, lang, target);
    await update(entry.id, text.trim() ? { translation: text.trim() } : { translationError: t('snip.translate.empty') });
  } catch (err) {
    await update(entry.id, { translationError: err instanceof Error ? err.message : t('snip.translate.failed') });
  }
}

export async function processSnip(job: SnipJob): Promise<SnipEntry | null> {
  const { entry, settings } = job;
  const lang = normalizeStudyLang(entry.lang);
  if (entry.status === 'error') {
    announce(entry, []);
    return entry;
  }
  const read = await readPicture(job);
  const problem = read.error ?? snipTextProblem(read.text, lang, read.confidence);
  if (problem) {
    // Never cards from an empty or garbled read: the entry keeps what was read, for the history.
    const failed = await update(entry.id, {
      status: 'error',
      error: problem,
      text: read.text.trim(),
      engine: read.engine,
      ...(read.confidence !== undefined ? { confidence: read.confidence } : {}),
    });
    announce(failed ?? { ...entry, status: 'error', error: problem }, []);
    return failed;
  }
  const text = read.text.trim();

  const [{ loadDeck }, { getLevel }] = await Promise.all([import('./flashcardDeck'), import('./knownWords')]);
  const deckWords = new Set<string>();
  for (const card of loadDeck()) {
    if (normalizeStudyLang(card.studyLang) !== lang) continue;
    deckWords.add(normalizeWord(card.word));
  }
  const tokens = await tokensOf(text, lang);
  let words = classifySnipTokens(tokens, lang, {
    isKnown: (lemma, surface) => getLevel(lemma) === 3 || getLevel(surface) === 3,
    inDeck: (lemma, surface) => deckWords.has(normalizeWord(lemma)) || deckWords.has(normalizeWord(surface)),
  }, settings.maxWords);
  words = await enrichWords(words, lang);
  const grammar = await grammarOf(text, lang);
  const base: SnipEntry = {
    ...entry,
    text,
    engine: read.engine,
    ...(read.confidence !== undefined ? { confidence: read.confidence } : {}),
    words,
    grammar,
    overLimit: words.filter((w) => w.status === 'overLimit').length,
  };
  await update(entry.id, {
    text: base.text,
    engine: base.engine,
    ...(read.confidence !== undefined ? { confidence: read.confidence } : {}),
    words,
    grammar,
    overLimit: base.overLimit,
  });

  if (settings.autoAdd) {
    const ctx: MineContext = {
      entry: base,
      lang,
      settings,
      imagePath: await storeImage(job),
      ...(job.cardImage ? { image: job.cardImage } : {}),
    };
    for (let i = 0; i < words.length; i += 1) {
      if (words[i].status !== 'candidate') continue;
      words[i] = await mineWord(words[i], ctx);
    }
  }
  const owned = ownedIds(words);
  const done = await update(entry.id, { status: 'done', words, ...owned });
  const final = done ?? { ...base, status: 'done' as const, words, ...owned };
  announce(final, words.filter((w) => w.status === 'added').map((w) => w.lemma || w.surface));
  if (settings.openView && typeof document !== 'undefined' && document.visibilityState === 'visible') {
    surfaceView(entry.id, { userAsked: false });
  }
  void translateLater(final);
  return final;
}

// ---------------------------------------------------------------------------
// Undo and the per-word toggle

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
  const words = entry.words.map((w) => (w.status === 'added'
    ? { ...w, status: 'removed' as const, cardId: undefined, ...(w.ankiNoteId && notesLeft.includes(w.ankiNoteId) ? {} : { ankiNoteId: undefined }) }
    : w));
  await update(id, { undone: true, words, cardIds: [], ankiNoteIds: notesLeft });
  const message = notesLeft.length
    ? t('snip.toast.undoneAnkiLeft', { count: removed.length })
    : t('snip.toast.undone', { count: removed.length });
  if (typeof document !== 'undefined' && document.hasFocus()) {
    window.dispatchEvent(new CustomEvent('os:toast', { detail: { message, kind: notesLeft.length ? 'warn' : 'ok' } }));
  } else if (!isDnd()) {
    void window.api?.snipToastShow?.({ id, kind: 'undone', words: removed, count: removed.length }).catch(() => undefined);
  }
}

async function toggleWord(id: string, index: number, add: boolean): Promise<void> {
  const entry = await window.api.snipHistoryGet(id);
  const word = entry?.words[index];
  if (!entry || !word) return;
  const lang = normalizeStudyLang(entry.lang);
  const words = [...entry.words];
  if (!add) {
    if (word.status !== 'added') return;
    const { notesLeft } = await removeOwned(word.cardId ? [word.cardId] : [], word.ankiNoteId ? [word.ankiNoteId] : []);
    words[index] = { ...word, status: 'removed', cardId: undefined, ...(notesLeft.length ? {} : { ankiNoteId: undefined }) };
  } else {
    if (word.status === 'added' || word.status === 'punct' || word.status === 'number') return;
    const status = await window.api.snipGetStatus();
    const enriched = word.meaning ? word : await enrichWord(word, lang);
    words[index] = await mineWord({ ...enriched, status: 'candidate' }, { entry, lang, settings: status });
  }
  const owned = ownedIds(words);
  await update(id, { words, cardIds: owned.cardIds, ankiNoteIds: owned.ankiNoteIds, ...(owned.cardIds.length ? { undone: false } : {}) });
}

let actions: Promise<unknown> = Promise.resolve();

/** Undo / remove one / add one, one at a time (they read and write the same entry). */
export function runAction(action: SnipAction): Promise<void> {
  const run = actions.then(async () => {
    if (action.action === 'undo') await undo(action.id);
    else await toggleWord(action.id, action.index, action.action === 'addWord');
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
