/**
 * One way into the study database for every mining surface.
 *
 * MASTER_PLAN.md §0 (one shared vocabulary / flashcard database) and the
 * offline-first principle: a card the user mines must exist in the app's own
 * deck whether or not Anki is running. Before this module six surfaces — the
 * dictionary page and popup, the video player, sentence analysis, the Reading
 * Lens reader panel, the lexicon workbench and lyrics — wrote ONLY to Anki
 * through `ankiMineNote`: with Anki closed the dictionary showed a setup panel
 * and saved nothing, and the others reported an error and dropped the card.
 *
 * `mineToStudy` always writes the local card first (word, reading, meaning,
 * sentence, where it came from, media), then pushes to Anki when the caller
 * asked for Anki. The returned note id is stored on the card, so a later
 * re-sync or duplicate check can find it. When Anki is unreachable the card is
 * kept, marked `ankiPending`, and its request is queued; the queue drains the
 * next time Anki's link comes up (`installStudyMining`). Repeating the same
 * mine (a double click, an auto-mine re-firing) finds the existing card by its
 * `mineKey` instead of adding a second one.
 */

import {
  ANKI_COLLECTION_UNAVAILABLE_MSG,
  ANKI_UNREACHABLE_MSG,
  type MineNoteRequest,
  type MineNoteResult,
} from '../shared/anki';
import type { MineSource } from '../shared/profileRules';
import {
  buildVideoCoreMineRequest,
  type VideoCoreMiningDraft,
} from '../shared/videoCoreMining';
import {
  addDeckCardsTracked,
  FLASHCARD_DECK_STORAGE_EVENT,
  loadDeck,
  removeDeckCards,
  updateDeckCard,
  type DeckFlashcard,
  type FlashcardSource,
} from './flashcardDeck';
import { enrichNewCards } from './flashcardAutoEnrich';
import { kvGet, kvSet } from './storage/db';
import { showToast } from './components/ui/Toast';
import { translateAnkiReason } from '../shared/anki';
import { t } from './i18n';
import { writeLocalStorage } from './localStorageWrite';

export interface MineMediaPayload {
  base64: string;
  filename: string;
}

export interface MineToStudyInput {
  word: string;
  reading?: string;
  meaning?: string;
  sentence?: string;
  /** Which surface mined it. */
  source: FlashcardSource;
  /** Page, book, show or song the card came from (study content, never translated). */
  sourceTitle?: string;
  sourceUrl?: string;
  /** Stable id of the source (media id, book id…); groups cards into one deck. */
  sourceId?: string;
  folder?: string;
  studyKind?: DeckFlashcard['studyKind'];
  textProvenance?: DeckFlashcard['textProvenance'];
  sourceRef?: DeckFlashcard['sourceRef'];
  studyLang?: string;
  audioPath?: string;
  imagePath?: string;
  audioDataUrl?: string;
  /** Raw media to keep as managed files on the local card. */
  audio?: MineMediaPayload;
  image?: MineMediaPayload;
  /**
   * The Anki half. Omit for a local-only save (the dictionary star). When
   * present it is sent as-is, so every surface keeps its own field mapping,
   * translations and mining-rule routing.
   */
  anki?: MineNoteRequest;
  /** Anki was already attempted elsewhere (the extension server mines in main). */
  ankiResult?: MineNoteResult;
  /** Show the "saved" toast. Default true. */
  notify?: boolean;
}

export type MineAnkiOutcome =
  /** Note created in Anki (now, or earlier for this same card). */
  | 'added'
  /** Anki already held a matching note. */
  | 'duplicate'
  /** Anki unreachable: waiting in the queue. */
  | 'queued'
  /** Anki answered with an error a retry will not fix. */
  | 'failed'
  /** No Anki half was asked for (or Anki has never been set up here). */
  | 'local';

export interface MineToStudyResult {
  card: DeckFlashcard;
  /** False when an identical mine already existed and was reused. */
  created: boolean;
  anki: MineAnkiOutcome;
  ankiResult?: MineNoteResult;
  /** Anki's own message for a `failed` outcome. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Identity

function normalizeText(value: string | undefined): string {
  return (value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Same expression + same sentence + same source = the same card. */
export function mineKeyFor(input: Pick<MineToStudyInput, 'word' | 'sentence' | 'source' | 'sourceUrl' | 'sourceId'>): string {
  const origin = normalizeText(input.sourceUrl) || normalizeText(input.sourceId);
  return [input.source, normalizeText(input.word), normalizeText(input.sentence), origin].join('␟');
}

function findMinedCard(key: string, input: MineToStudyInput): DeckFlashcard | undefined {
  const word = normalizeText(input.word);
  const sentence = normalizeText(input.sentence);
  return loadDeck().find((card) => card.mineKey === key)
    // Cards saved before mineKey existed (the dictionary star's migrated rows,
    // extension copies) still match on the same three facts.
    ?? loadDeck().find((card) =>
      !card.mineKey
      && card.source === input.source
      && normalizeText(card.word) === word
      && normalizeText(card.sentence) === sentence);
}

// ---------------------------------------------------------------------------
// Anki link + "has Anki ever been used here"

/**
 * Remembered once Anki has been reachable from this profile. A user who never
 * installed Anki must not collect an ever-growing "waiting for Anki" pile, so
 * a mine with Anki down is queued only when Anki is part of this setup.
 */
const ANKI_SEEN_KEY = 'jp-anki-seen-connected';

export function markAnkiSeen(): void {
  if (ankiSeen()) return;
  writeLocalStorage(ANKI_SEEN_KEY, '1');
}

function ankiSeen(): boolean {
  try {
    return localStorage.getItem(ANKI_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

async function ankiConnected(): Promise<boolean> {
  try {
    if (typeof window.api?.ankiLinkState !== 'function') return false;
    const link = await window.api.ankiLinkState();
    if (link.state === 'connected') {
      markAnkiSeen();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function isUnreachable(error: string | undefined): boolean {
  return error === ANKI_UNREACHABLE_MSG || error === ANKI_COLLECTION_UNAVAILABLE_MSG;
}

// ---------------------------------------------------------------------------
// Pending-Anki queue (IndexedDB: requests can carry base64 media)

export const ANKI_MINE_QUEUE_KEY = 'anki-mine-queue-v1';
export const ANKI_MINE_QUEUE_EVENT = 'anki-mine-queue-changed';

interface QueueEntry {
  request: MineNoteRequest;
  queuedAt: number;
  attempts: number;
}

type QueueStore = Record<string, QueueEntry>;

let queueChain: Promise<unknown> = Promise.resolve();

/** Serialise read-modify-write of the queue so two mines never lose one. */
function withQueue<T>(fn: (queue: QueueStore) => T | Promise<T>): Promise<T> {
  const run = queueChain.then(async () => {
    let queue: QueueStore = {};
    try {
      const raw = await kvGet<unknown>(ANKI_MINE_QUEUE_KEY);
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) queue = { ...(raw as QueueStore) };
    } catch {
      queue = {};
    }
    const before = JSON.stringify(queue);
    const result = await fn(queue);
    if (JSON.stringify(queue) !== before) {
      try {
        await kvSet(ANKI_MINE_QUEUE_KEY, queue);
      } catch (error) {
        console.error('[study-mining] queue write failed:', error);
      }
    }
    return result;
  });
  queueChain = run.catch(() => undefined);
  return run;
}

function emitQueueChanged(): void {
  try {
    window.dispatchEvent(new CustomEvent(ANKI_MINE_QUEUE_EVENT));
  } catch {
    /* non-browser context */
  }
}

async function enqueue(cardId: string, request: MineNoteRequest): Promise<void> {
  await withQueue((queue) => {
    const prior = queue[cardId];
    queue[cardId] = { request, queuedAt: prior?.queuedAt ?? Date.now(), attempts: prior?.attempts ?? 0 };
  });
  updateDeckCard(cardId, { ankiPending: true });
  emitQueueChanged();
}

async function dequeue(cardId: string): Promise<void> {
  await withQueue((queue) => {
    delete queue[cardId];
  });
}

/** Cards mined while Anki was down and not yet added. */
export function pendingAnkiCards(cards: readonly DeckFlashcard[] = loadDeck()): DeckFlashcard[] {
  return cards.filter((card) => card.ankiPending === true);
}

const ROUTE_SOURCE: Partial<Record<FlashcardSource, MineSource>> = {
  dictionary: 'dictionary',
  extension: 'extension',
  epub: 'epub',
  subtitle: 'subtitle',
  media: 'subtitle',
  lyrics: 'subtitle',
  reader: 'reader',
  analysis: 'dictionary',
  lexicon: 'dictionary',
};

/** A request for a pending card whose queued request was lost. */
export function requestFromCard(card: DeckFlashcard): MineNoteRequest {
  const sentence = card.sentence?.trim();
  return {
    route: {
      source: ROUTE_SOURCE[card.source] ?? 'other',
      cardKind: card.studyKind === 'sentence' || (sentence && sentence === card.word.trim()) ? 'sentence' : 'word',
    },
    term: card.word,
    ...(card.reading?.trim() && card.reading !== card.word ? { reading: card.reading.trim() } : {}),
    ...(card.meaning?.trim() ? { meaning: card.meaning.trim() } : {}),
    ...(sentence ? { sentence } : {}),
  };
}

// ---------------------------------------------------------------------------
// Applying an Anki answer to the local card

async function applyAnkiResult(
  card: DeckFlashcard,
  result: MineNoteResult,
  request: MineNoteRequest,
): Promise<{ outcome: MineAnkiOutcome; error?: string }> {
  if (result.ok) {
    markAnkiSeen();
    updateDeckCard(card.id, {
      ankiExported: true,
      ankiExportedAt: Date.now(),
      ...(typeof result.noteId === 'number' ? { ankiNoteId: result.noteId } : {}),
      ...(result.deckName ? { ankiDeck: result.deckName } : {}),
      ankiPending: undefined,
      ankiExportError: undefined,
    });
    await dequeue(card.id);
    emitQueueChanged();
    return { outcome: 'added' };
  }
  if (result.error === 'duplicate') {
    markAnkiSeen();
    updateDeckCard(card.id, { ankiDuplicate: true, ankiPending: undefined, ankiExportError: undefined });
    await dequeue(card.id);
    emitQueueChanged();
    return { outcome: 'duplicate' };
  }
  // The extension's "save to the app only" preference: no Anki half at all.
  if (result.error === 'skipped') return { outcome: 'local' };
  if (isUnreachable(result.error)) {
    if (!ankiSeen()) return { outcome: 'local' };
    await enqueue(card.id, request);
    return { outcome: 'queued' };
  }
  // A refusal a retry cannot fix (missing field, bad model): keep the card,
  // record why, and do not queue it forever.
  updateDeckCard(card.id, { ankiExportError: result.error ?? 'error', ankiPending: undefined });
  await dequeue(card.id);
  emitQueueChanged();
  return { outcome: 'failed', error: result.error };
}

async function pushToAnki(
  card: DeckFlashcard,
  request: MineNoteRequest,
): Promise<{ outcome: MineAnkiOutcome; result?: MineNoteResult; error?: string }> {
  const connected = await ankiConnected();
  if (!connected) {
    if (!ankiSeen()) return { outcome: 'local' };
    await enqueue(card.id, request);
    return { outcome: 'queued' };
  }
  let result: MineNoteResult;
  try {
    result = await window.api.ankiMineNote(request);
  } catch (error) {
    result = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  const applied = await applyAnkiResult(card, result, request);
  return { ...applied, result };
}

// ---------------------------------------------------------------------------
// Media → managed files

async function storeMedia(payload: MineMediaPayload | undefined): Promise<string | undefined> {
  if (!payload?.base64 || typeof window.api?.flashcardStoreMinedMedia !== 'function') return undefined;
  try {
    const stored = await window.api.flashcardStoreMinedMedia(payload.base64, payload.filename);
    return stored.ok && stored.path ? stored.path : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Feedback

export function mineToastMessage(result: Pick<MineToStudyResult, 'created' | 'anki' | 'error'>): {
  message: string;
  kind: 'success' | 'warning' | 'default';
} {
  switch (result.anki) {
    case 'added':
      return { message: t('studyMine.toast.savedAnki'), kind: 'success' };
    case 'queued':
      return { message: t('studyMine.toast.queued'), kind: 'default' };
    case 'duplicate':
      return { message: t('studyMine.toast.ankiDuplicate'), kind: 'default' };
    case 'failed':
      return {
        message: t('studyMine.toast.ankiFailed', {
          error: translateAnkiReason(result.error, t) ?? t('studyMine.toast.unknownError'),
        }),
        kind: 'warning',
      };
    default:
      return result.created
        ? { message: t('studyMine.toast.saved'), kind: 'success' }
        : { message: t('studyMine.toast.alreadySaved'), kind: 'default' };
  }
}

// ---------------------------------------------------------------------------
// Surface adapters

/**
 * A study card for a surface that already builds its Anki request: the card
 * carries exactly what the note will, so the two copies never disagree.
 */
export function requestStudyInput(
  request: MineNoteRequest,
  source: FlashcardSource,
  extra: Partial<MineToStudyInput> = {},
): MineToStudyInput {
  const sentence = request.sentence?.trim();
  return {
    word: request.term.trim(),
    reading: request.reading?.trim() ?? '',
    meaning: (request.meaning || request.translation || request.sentenceTranslation || '').trim(),
    sentence: sentence || undefined,
    source,
    studyKind: request.route?.cardKind === 'sentence' ? 'sentence' : 'vocabulary',
    anki: request,
    ...extra,
  };
}

/**
 * A player / lyrics mining draft as a study card plus its Anki request. Both
 * surfaces build the same `VideoCoreMiningDraft`, so one adapter keeps their
 * local cards identical: the cue's show/song as the source, the file as its
 * URL, and the captured audio and screenshot as managed files.
 */
export function videoCoreStudyInput(
  draft: VideoCoreMiningDraft,
  source: 'subtitle' | 'lyrics',
): MineToStudyInput {
  const origin = draft.provenance.source;
  const title = [origin.mediaTitle, origin.episodeNumber != null ? `#${origin.episodeNumber}` : '']
    .filter(Boolean)
    .join(' ');
  const sentence = draft.sentence.trim();
  return {
    word: draft.term.trim(),
    reading: draft.reading.trim(),
    meaning: draft.meaning.trim() || draft.translation.trim(),
    sentence: sentence || undefined,
    source,
    sourceId: origin.mediaId != null ? `media-${origin.mediaId}` : origin.localFilePath || origin.playbackId,
    sourceTitle: title || undefined,
    sourceUrl: origin.localFilePath || origin.streamPath || undefined,
    folder: source === 'lyrics' ? 'Music' : 'Media',
    studyKind: draft.cardKind === 'sentence' ? 'sentence' : 'vocabulary',
    ...(draft.audioBase64 && draft.audio
      ? { audio: { base64: draft.audioBase64, filename: draft.audio.filename } }
      : {}),
    ...(draft.screenshotBase64 && draft.screenshot
      ? { image: { base64: draft.screenshotBase64, filename: draft.screenshot.filename } }
      : {}),
    anki: buildVideoCoreMineRequest(draft),
  };
}

// ---------------------------------------------------------------------------
// The one entry point

const inFlight = new Map<string, Promise<MineToStudyResult>>();

export function mineToStudy(input: MineToStudyInput): Promise<MineToStudyResult> {
  const key = mineKeyFor(input);
  const running = inFlight.get(key);
  if (running) return running;
  const work = runMine(key, input).finally(() => inFlight.delete(key));
  inFlight.set(key, work);
  return work;
}

async function runMine(key: string, input: MineToStudyInput): Promise<MineToStudyResult> {
  const word = input.word.trim();
  let card = findMinedCard(key, input);
  let created = false;
  if (!card) {
    const [audioPath, imagePath] = await Promise.all([storeMedia(input.audio), storeMedia(input.image)]);
    // A duplicate may have landed while media was being stored.
    card = findMinedCard(key, input);
    if (!card) {
      const draft: Omit<DeckFlashcard, 'id' | 'addedAt'> = {
        word: word.slice(0, 200),
        reading: (input.reading ?? '').trim(),
        meaning: (input.meaning ?? '').trim(),
        source: input.source,
        mineKey: key,
      };
      const sentence = input.sentence?.trim();
      if (sentence) draft.sentence = sentence.slice(0, 2000);
      if (input.sourceId || input.sourceTitle) {
        draft.bookId = input.sourceId || `${input.source}:${input.sourceTitle}`;
        draft.bookTitle = input.sourceTitle || input.sourceId;
      }
      if (input.sourceUrl) draft.sourceUrl = input.sourceUrl.slice(0, 2000);
      if (input.folder) draft.folder = input.folder;
      if (input.studyKind) draft.studyKind = input.studyKind;
      if (input.textProvenance) draft.textProvenance = input.textProvenance;
      if (input.sourceRef) draft.sourceRef = input.sourceRef;
      if (input.studyLang && input.studyLang !== 'ja') draft.studyLang = input.studyLang;
      const audio = input.audioPath || audioPath;
      const image = input.imagePath || imagePath;
      if (audio) draft.audioPath = audio;
      if (image) draft.imagePath = image;
      if (input.audioDataUrl && !audio) draft.audioDataUrl = input.audioDataUrl;
      card = addDeckCardsTracked([draft])[0];
      created = true;
      // Readings and narration follow the user's own auto-enrich preferences.
      void enrichNewCards([card]).catch(() => undefined);
    }
  }

  let outcome: MineAnkiOutcome = card.ankiNoteId || card.ankiExported
    ? 'added'
    : card.ankiDuplicate
      ? 'duplicate'
      : card.ankiPending
        ? 'queued'
        : 'local';
  let ankiResult: MineNoteResult | undefined;
  let error: string | undefined;
  const request = input.anki ?? (input.ankiResult ? requestFromCard(card) : undefined);
  if (input.ankiResult && outcome !== 'added') {
    const applied = await applyAnkiResult(card, input.ankiResult, request ?? requestFromCard(card));
    outcome = applied.outcome;
    error = applied.error;
    ankiResult = input.ankiResult;
  } else if (input.anki && outcome === 'local') {
    const pushed = await pushToAnki(card, input.anki);
    outcome = pushed.outcome;
    ankiResult = pushed.result;
    error = pushed.error;
  }
  const cardId = card.id;
  const finalCard = loadDeck().find((row) => row.id === cardId) ?? card;
  const result: MineToStudyResult = { card: finalCard, created, anki: outcome, ankiResult, error };
  if (input.notify !== false) {
    // Feedback is cosmetic: a toast that cannot render must never turn a saved
    // card into a failed mine for the surface waiting on this promise.
    try {
      const toast = mineToastMessage(result);
      showToast({ message: toast.message, kind: toast.kind });
    } catch {
      /* no toast host / i18n in this context */
    }
  }
  return result;
}

/**
 * Remove the cards a local-only save created (the dictionary star toggled off).
 * Cards that already reached Anki are left: un-starring must not delete a
 * card the user is also studying there.
 */
export function unmineFromStudy(match: (card: DeckFlashcard) => boolean): number {
  const doomed = loadDeck().filter((card) => match(card) && !card.ankiNoteId && !card.ankiPending);
  if (doomed.length) removeDeckCards(doomed.map((card) => card.id));
  return doomed.length;
}

// ---------------------------------------------------------------------------
// Draining the queue

export interface AnkiQueueReport {
  sent: number;
  duplicate: number;
  failed: number;
  remaining: number;
  /** Anki was not reachable, so nothing was attempted. */
  unreachable: boolean;
}

const LEASE_KEY = 'jp-anki-mine-queue-lease';
const LEASE_MS = 60_000;
const windowId = Math.random().toString(36).slice(2);

/** One window drains at a time: two would each create the same notes. */
function acquireLease(now = Date.now()): boolean {
  try {
    const raw = localStorage.getItem(LEASE_KEY);
    if (raw) {
      const [owner, until] = raw.split(':');
      if (owner !== windowId && Number(until) > now) return false;
    }
    writeLocalStorage(LEASE_KEY, `${windowId}:${now + LEASE_MS}`);
    return true;
  } catch {
    return true;
  }
}

function releaseLease(): void {
  try {
    const raw = localStorage.getItem(LEASE_KEY);
    if (raw?.startsWith(`${windowId}:`)) localStorage.removeItem(LEASE_KEY);
  } catch {
    /* storage unavailable */
  }
}

let draining: Promise<AnkiQueueReport> | null = null;

export function flushAnkiMineQueue(): Promise<AnkiQueueReport> {
  if (draining) return draining;
  draining = drain().finally(() => {
    draining = null;
  });
  return draining;
}

async function drain(): Promise<AnkiQueueReport> {
  const report: AnkiQueueReport = { sent: 0, duplicate: 0, failed: 0, remaining: 0, unreachable: false };
  const pending = pendingAnkiCards();
  // Queue entries whose card was deleted are dropped rather than sent.
  const live = new Set(loadDeck().map((card) => card.id));
  await withQueue((queue) => {
    for (const id of Object.keys(queue)) if (!live.has(id)) delete queue[id];
  });
  if (!pending.length) return report;
  if (!(await ankiConnected())) {
    report.unreachable = true;
    report.remaining = pending.length;
    return report;
  }
  if (!acquireLease()) {
    report.remaining = pending.length;
    return report;
  }
  try {
    const queue = await withQueue((q) => ({ ...q }));
    for (let i = 0; i < pending.length; i += 1) {
      const card = pending[i];
      const request = queue[card.id]?.request ?? requestFromCard(card);
      let result: MineNoteResult;
      try {
        result = await window.api.ankiMineNote(request);
      } catch (error) {
        result = { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
      if (isUnreachable(result.error)) {
        // Anki went away mid-drain: everything from here on stays queued.
        report.unreachable = true;
        report.remaining = pending.length - i;
        break;
      }
      const applied = await applyAnkiResult(card, result, request);
      if (applied.outcome === 'added') report.sent += 1;
      else if (applied.outcome === 'duplicate') report.duplicate += 1;
      else report.failed += 1;
    }
  } finally {
    releaseLease();
  }
  emitQueueChanged();
  return report;
}

/** Keep pending cards in the app only: clear the Anki half without sending. */
export async function keepPendingCardsLocal(): Promise<number> {
  const pending = pendingAnkiCards();
  for (const card of pending) updateDeckCard(card.id, { ankiPending: undefined });
  await withQueue((queue) => {
    for (const card of pending) delete queue[card.id];
  });
  emitQueueChanged();
  return pending.length;
}

export function onAnkiMineQueueChanged(cb: () => void): () => void {
  window.addEventListener(ANKI_MINE_QUEUE_EVENT, cb);
  return () => window.removeEventListener(ANKI_MINE_QUEUE_EVENT, cb);
}

/**
 * Wire the queue to Anki's link and surface deck-storage problems. Mounted once
 * per app window; returns the teardown.
 */
export function installStudyMining(): () => void {
  const offs: Array<() => void> = [];
  const announceDrain = (report: AnkiQueueReport): void => {
    if (report.sent > 0) {
      showToast({ message: t('studyMine.toast.queueSent', { count: report.sent }), kind: 'success' });
    }
  };
  if (typeof window.api?.onAnkiLinkChanged === 'function') {
    offs.push(window.api.onAnkiLinkChanged((status) => {
      if (status.state !== 'connected') return;
      markAnkiSeen();
      if (pendingAnkiCards().length) void flushAnkiMineQueue().then(announceDrain);
    }));
  }
  if (pendingAnkiCards().length) void flushAnkiMineQueue().then(announceDrain);

  let warnedFull = false;
  const onStorage = (): void => {
    if (warnedFull) return;
    warnedFull = true;
    showToast({ message: t('studyMine.toast.deckStorageFull'), kind: 'warning', duration: 9000 });
  };
  window.addEventListener(FLASHCARD_DECK_STORAGE_EVENT, onStorage);
  offs.push(() => window.removeEventListener(FLASHCARD_DECK_STORAGE_EVENT, onStorage));
  return () => offs.forEach((off) => off());
}
