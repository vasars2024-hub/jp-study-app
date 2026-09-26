/**
 * "Sentence deck from a video" — the renderer half: cut the audio (in main),
 * write the cards (here, the only owner of the deck), optionally push each one
 * to Anki, and undo the whole batch.
 *
 * One write for the whole deck: `addDeckCardsTracked` with every card at once,
 * never a card-at-a-time loop — the deck store re-serialises on each write, and
 * an episode is a few hundred lines. The Anki half then goes through
 * `mineToStudy`, which finds each card by its `mineKey` instead of adding a
 * second one, so Anki routing, the offline queue and duplicate handling are
 * the ones every other mining surface uses.
 *
 * The planner (`shared/sentenceDeck.ts`) decides what the sentences are; this
 * module never re-decides it.
 */
import {
  buildSentenceDeckNoteRequest,
  sentenceDeckBookId,
  sentenceTimeLabel,
  type SentenceSegment,
} from '../shared/sentenceDeck';
import type { StudyLang } from '../shared/studyLang';
import {
  addDeckCardsTracked,
  createDeckFolder,
  deleteDeckFolder,
  loadDeck,
  loadDeckFolders,
  removeDeckCards,
  type DeckFlashcard,
  type FlashcardTextProvenance,
} from './flashcardDeck';
import { enrichNewCards } from './flashcardAutoEnrich';
import { markAnkiSeen, mineKeyFor, mineToStudy, type MineAnkiOutcome } from './studyMining';

export interface SentenceDeckBuildInput {
  videoPath: string;
  /** Deck (folder) name — study content, editable, never translated. */
  deckName: string;
  studyLang: StudyLang;
  segments: readonly SentenceSegment[];
  /** Where the text came from; absent when the track does not say. */
  textProvenance?: FlashcardTextProvenance;
  /** Library row id, when the video is in the library. */
  mediaId?: string;
  withStill: boolean;
  sendToAnki: boolean;
}

export type SentenceDeckPhase = 'audio' | 'cards' | 'anki';

export interface SentenceDeckProgressState {
  phase: SentenceDeckPhase;
  done: number;
  total: number;
  failed: number;
}

export interface SentenceDeckFailedClip {
  index: number;
  text: string;
  /** ffmpeg's or Node's own words — a technical detail, English. */
  error: string;
  /** Why, as an i18n key the dialog shows. */
  reasonKey: string;
}

/** The i18n key for a clip that was not cut. */
export function clipFailureKey(failure: string | undefined): string {
  switch (failure) {
    case 'silent':
      return 'sentenceDeck.clip.silent';
    case 'timeout':
      return 'sentenceDeck.clip.timeout';
    case 'too-large':
      return 'sentenceDeck.clip.tooLarge';
    case 'store':
      return 'sentenceDeck.clip.store';
    default:
      return 'sentenceDeck.clip.failed';
  }
}

export interface SentenceDeckAnkiTally {
  added: number;
  queued: number;
  duplicate: number;
  failed: number;
  local: number;
}

export type SentenceDeckBuildResult =
  | { status: 'refused'; reasonKey: string; detail?: string }
  | { status: 'cancelled' }
  | {
      status: 'done';
      added: number;
      addedIds: string[];
      /** Cards written without audio, and why their clip failed. */
      failedClips: SentenceDeckFailedClip[];
      folder: string;
      /** This batch created the folder, so undo may remove it again. */
      folderCreated: boolean;
      bookId: string;
      anki?: SentenceDeckAnkiTally;
    };

export type SentenceDeckDone = Extract<SentenceDeckBuildResult, { status: 'done' }>;

interface ClipOutcome {
  ok: boolean;
  audioPath?: string;
  imagePath?: string;
  error?: string;
  failure?: string;
}

/** The deck rows for a finished audio batch. Exported for the tests. */
export function sentenceDeckDrafts(
  input: SentenceDeckBuildInput,
  clips: ReadonlyMap<string, ClipOutcome>,
): Array<Omit<DeckFlashcard, 'id' | 'addedAt'>> {
  const bookId = sentenceDeckBookId(input.videoPath);
  const folder = input.deckName.trim();
  return input.segments.map((segment) => {
    const clip = clips.get(String(segment.index));
    const draft: Omit<DeckFlashcard, 'id' | 'addedAt'> = {
      word: segment.text.slice(0, 200),
      reading: '',
      meaning: segment.translation ?? '',
      sentence: segment.text.slice(0, 2000),
      source: 'subtitle',
      bookId,
      bookTitle: folder,
      folder,
      studyKind: 'sentence',
      sourceUrl: input.videoPath,
      sourceRef: {
        mediaId: input.mediaId ?? input.videoPath,
        cueStartSec: segment.startMs / 1000,
        cueEndSec: segment.endMs / 1000,
        sentence: segment.text,
      },
      sceneReference: sentenceTimeLabel(segment.startMs),
      tags: ['sentence-deck'],
      mineKey: mineKeyFor({
        word: segment.text,
        sentence: segment.text,
        source: 'subtitle',
        sourceUrl: input.videoPath,
        sourceId: bookId,
      }),
    };
    // Absent means Japanese on stored cards (the format predates the others).
    if (input.studyLang !== 'ja') draft.studyLang = input.studyLang;
    if (input.textProvenance) draft.textProvenance = input.textProvenance;
    if (clip?.ok && clip.audioPath) draft.audioPath = clip.audioPath;
    if (clip?.ok && clip.imagePath) draft.imagePath = clip.imagePath;
    return draft;
  });
}

function mediaKey(path: string): string {
  return path.trim().replace(/\\/g, '/').toLowerCase();
}

/**
 * Delete the managed clips and stills a batch cut that no card points at — after
 * a cancel, a failed write, or Undo. The store is content-addressed, so a file
 * this batch cut can be the very file an older card already uses (the same line
 * cut twice); only what the deck no longer references goes, and main refuses
 * anything outside the managed root.
 */
function releaseUnreferencedMedia(paths: ReadonlyArray<string | undefined>): void {
  const cut = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  if (!cut.length || typeof window.api?.flashcardReleaseAudio !== 'function') return;
  const referenced = new Set(
    loadDeck()
      .flatMap((card) => [card.audioPath, card.imagePath])
      .filter((path): path is string => Boolean(path))
      .map(mediaKey),
  );
  const free = cut.filter((path) => !referenced.has(mediaKey(path)));
  if (free.length) void window.api.flashcardReleaseAudio(free).catch(() => undefined);
}

async function managedBase64(path: string | undefined): Promise<string | undefined> {
  if (!path) return undefined;
  try {
    const read = await window.api.flashcardReadAudio(path);
    if (!read.ok || !read.dataUrl) return undefined;
    return read.dataUrl.slice(read.dataUrl.indexOf(',') + 1);
  } catch {
    return undefined;
  }
}

function fileName(path: string | undefined, fallback: string): string {
  const leaf = (path ?? '').split(/[\\/]/).pop() ?? '';
  return leaf ? `gum-sentence-${leaf}` : fallback;
}

/** Push the new cards to Anki one at a time through the shared mine path. */
async function sendCardsToAnki(
  input: SentenceDeckBuildInput,
  cards: readonly DeckFlashcard[],
  onProgress: (done: number) => void,
  cancelled: () => boolean,
): Promise<SentenceDeckAnkiTally> {
  const tally: SentenceDeckAnkiTally = { added: 0, queued: 0, duplicate: 0, failed: 0, local: 0 };
  const bookId = sentenceDeckBookId(input.videoPath);
  for (const [i, card] of cards.entries()) {
    if (cancelled()) break;
    const text = card.sentence ?? card.word;
    const [audioBase64, imageBase64] = await Promise.all([
      managedBase64(card.audioPath),
      managedBase64(card.imagePath),
    ]);
    const request = buildSentenceDeckNoteRequest(
      { text, translation: card.meaning || undefined },
      {
        studyLang: input.studyLang,
        audioBase64,
        audioFilename: fileName(card.audioPath, `gum-sentence-${i + 1}.mp3`),
        imageBase64,
        imageFilename: fileName(card.imagePath, `gum-sentence-${i + 1}.jpg`),
      },
    );
    let outcome: MineAnkiOutcome = 'failed';
    try {
      const result = await mineToStudy({
        word: text,
        sentence: text,
        source: 'subtitle',
        sourceUrl: input.videoPath,
        sourceId: bookId,
        sourceTitle: input.deckName,
        folder: input.deckName,
        studyKind: 'sentence',
        studyLang: input.studyLang,
        anki: request,
        notify: false,
      });
      outcome = result.anki;
    } catch {
      outcome = 'failed';
    }
    if (outcome === 'added') tally.added += 1;
    else if (outcome === 'queued') tally.queued += 1;
    else if (outcome === 'duplicate') tally.duplicate += 1;
    else if (outcome === 'local') tally.local += 1;
    else tally.failed += 1;
    onProgress(i + 1);
  }
  // Cancelled part-way: the cards not sent stay in Gum only, and the summary
  // counts them ("not sent") instead of adding up to fewer than were made.
  const sent = tally.added + tally.queued + tally.duplicate + tally.failed + tally.local;
  tally.local += cards.length - sent;
  return tally;
}

export interface SentenceDeckBuildHooks {
  jobId: string;
  onProgress?: (state: SentenceDeckProgressState) => void;
  /** Checked between phases and between Anki sends. */
  isCancelled?: () => boolean;
}

/** Cut, write and (optionally) send one sentence deck. Never throws. */
export async function buildSentenceDeck(
  input: SentenceDeckBuildInput,
  hooks: SentenceDeckBuildHooks,
): Promise<SentenceDeckBuildResult> {
  const folder = input.deckName.trim();
  if (!folder) return { status: 'refused', reasonKey: 'sentenceDeck.error.noName' };
  if (!input.segments.length) return { status: 'refused', reasonKey: 'sentenceDeck.error.nothingToAdd' };
  const cancelled = (): boolean => hooks.isCancelled?.() === true;
  const total = input.segments.length;

  hooks.onProgress?.({ phase: 'audio', done: 0, total, failed: 0 });
  const unsubscribe = window.api.onSentenceDeckProgress?.((progress) => {
    if (progress.jobId !== hooks.jobId) return;
    hooks.onProgress?.({ phase: 'audio', done: progress.done, total: progress.total, failed: progress.failed });
  });
  let batch;
  try {
    batch = await window.api.sentenceDeckExtractAudio({
      jobId: hooks.jobId,
      filePath: input.videoPath,
      studyLang: input.studyLang,
      withStill: input.withStill,
      clips: input.segments.map((segment) => ({
        id: String(segment.index),
        startMs: segment.startMs,
        endMs: segment.endMs,
      })),
    });
  } catch (error) {
    return {
      status: 'refused',
      reasonKey: 'sentenceDeck.error.audioFailed',
      detail: error instanceof Error ? error.message : String(error),
    };
  } finally {
    unsubscribe?.();
  }
  // What this batch stored; given back unless cards end up pointing at it.
  const cutMedia = (batch.results ?? []).flatMap((result) => [result.audioPath, result.imagePath]);
  if (batch.cancelled || cancelled()) {
    releaseUnreferencedMedia(cutMedia);
    return { status: 'cancelled' };
  }
  if (!batch.ok) {
    releaseUnreferencedMedia(cutMedia);
    return { status: 'refused', reasonKey: batch.reasonKey ?? 'sentenceDeck.error.audioFailed', detail: batch.error };
  }

  const clips = new Map(batch.results.map((result) => [result.id, result]));
  const failedClips: SentenceDeckFailedClip[] = input.segments
    .filter((segment) => !clips.get(String(segment.index))?.ok)
    .map((segment) => {
      const clip = clips.get(String(segment.index));
      return {
        index: segment.index,
        text: segment.text,
        error: clip?.error ?? 'not cut',
        reasonKey: clipFailureKey(clip?.failure),
      };
    });

  hooks.onProgress?.({ phase: 'cards', done: 0, total, failed: failedClips.length });
  const folderCreated = !loadDeckFolders().includes(folder);
  let created: DeckFlashcard[];
  try {
    createDeckFolder(folder);
    created = addDeckCardsTracked(sentenceDeckDrafts(input, clips));
  } catch (error) {
    releaseUnreferencedMedia(cutMedia);
    return {
      status: 'refused',
      reasonKey: 'sentenceDeck.error.writeFailed',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  hooks.onProgress?.({ phase: 'cards', done: created.length, total, failed: failedClips.length });
  // Readings (and nothing else — every card already has its audio) follow the
  // user's own auto-enrich preferences, as for any new card.
  void enrichNewCards(created).catch(() => undefined);

  const done: SentenceDeckDone = {
    status: 'done',
    added: created.length,
    addedIds: created.map((card) => card.id),
    failedClips,
    folder,
    folderCreated,
    bookId: sentenceDeckBookId(input.videoPath),
  };
  if (input.sendToAnki) {
    // Switching "Also send to Anki" on says Anki is part of this setup, and the
    // switch promises "queued while Anki is closed": without this a profile that
    // had never reached Anki kept every note local and reported them "not sent".
    markAnkiSeen();
    hooks.onProgress?.({ phase: 'anki', done: 0, total: created.length, failed: 0 });
    done.anki = await sendCardsToAnki(
      input,
      created,
      (count) => hooks.onProgress?.({ phase: 'anki', done: count, total: created.length, failed: 0 }),
      cancelled,
    );
  }
  return done;
}

/**
 * Take the whole batch back: its cards, the clips and stills cut for them, and
 * its folder when this batch made it and nothing else has been filed there
 * since. Notes already sent to Anki stay in Anki — the dialog says so rather
 * than deleting from a collection this app does not own.
 */
export function undoSentenceDeck(result: Pick<SentenceDeckDone, 'addedIds' | 'folder' | 'folderCreated'>): number {
  const ids = new Set(result.addedIds);
  const media = loadDeck()
    .filter((card) => ids.has(card.id))
    .flatMap((card) => [card.audioPath, card.imagePath]);
  removeDeckCards(result.addedIds);
  if (result.folderCreated && !loadDeck().some((card) => card.folder === result.folder)) {
    deleteDeckFolder(result.folder);
  }
  releaseUnreferencedMedia(media);
  return result.addedIds.length;
}
