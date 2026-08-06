import type { MineNoteRequest, MineNoteResult } from './anki';
import type { VideoCoreStudyCue } from './videoCoreStudy';

export const VIDEO_CORE_MINING_HISTORY_KEY = 'jp-video-core-mining-history-v1';
export const VIDEO_CORE_MINING_HISTORY_LIMIT = 100;

export type VideoCoreMiningCardKind = 'word' | 'sentence';
export type VideoCoreMiningHistoryStatus = 'exported' | 'duplicate' | 'failed' | 'undone';

export interface VideoCoreMiningSource {
  playbackId: string;
  playbackType: string;
  streamType: string;
  streamPath?: string;
  localFilePath?: string;
  mediaId?: number;
  mediaTitle?: string;
  episodeNumber?: number;
  episodeTitle?: string;
}

export interface VideoCoreMiningAsset {
  filename: string;
  mimeType: string;
  bytes: number;
}

export interface VideoCoreCueProvenance {
  schemaVersion: 1;
  cue: {
    index: number;
    trackNumber: number;
    rawText: string;
    text: string;
    startMs: number;
    endMs: number;
  };
  source: VideoCoreMiningSource;
  assets: {
    screenshot?: VideoCoreMiningAsset;
    audio?: VideoCoreMiningAsset;
    clip?: VideoCoreMiningAsset;
  };
  capturedAt: number;
}

export interface VideoCoreMiningDraft {
  cardKind: VideoCoreMiningCardKind;
  term: string;
  reading: string;
  meaning: string;
  translation: string;
  sentence: string;
  deckName: string;
  screenshotBase64?: string;
  screenshot?: VideoCoreMiningAsset;
  audioBase64?: string;
  audio?: VideoCoreMiningAsset;
  /** The scene the sentence was said in, for the {clip} variable. */
  clipBase64?: string;
  clip?: VideoCoreMiningAsset;
  provenance: VideoCoreCueProvenance;
}

export interface VideoCoreMiningHistoryEntry {
  id: string;
  createdAt: number;
  status: VideoCoreMiningHistoryStatus;
  noteId?: number;
  /** Actual Anki media names returned by the mining gateway (after image renaming). */
  mediaFilenames?: string[];
  destination?: string;
  error?: string;
  term: string;
  sentence: string;
  provenance: VideoCoreCueProvenance;
}

function text(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asset(value: unknown): VideoCoreMiningAsset | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Partial<VideoCoreMiningAsset>;
  const filename = text(raw.filename, 160);
  const mimeType = text(raw.mimeType, 80);
  const bytes = finite(raw.bytes);
  if (!filename || !mimeType || bytes == null || bytes < 0) return undefined;
  return { filename, mimeType, bytes: Math.round(bytes) };
}

function provenance(value: unknown): VideoCoreCueProvenance | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Partial<VideoCoreCueProvenance>;
  const cue = raw.cue;
  const source = raw.source;
  if (!cue || !source) return null;
  const index = finite(cue.index);
  const trackNumber = finite(cue.trackNumber);
  const startMs = finite(cue.startMs);
  const endMs = finite(cue.endMs);
  const playbackId = text(source.playbackId, 240);
  if (
    index == null
    || trackNumber == null
    || startMs == null
    || endMs == null
    || !playbackId
  ) return null;
  return {
    schemaVersion: 1,
    cue: {
      index: Math.round(index),
      trackNumber: Math.round(trackNumber),
      rawText: text(cue.rawText, 4000),
      text: text(cue.text, 4000),
      startMs: Math.max(0, Math.round(startMs)),
      endMs: Math.max(0, Math.round(endMs)),
    },
    source: {
      playbackId,
      playbackType: text(source.playbackType, 80),
      streamType: text(source.streamType, 80),
      ...(text(source.streamPath, 1200) ? { streamPath: text(source.streamPath, 1200) } : {}),
      ...(text(source.localFilePath, 1200)
        ? { localFilePath: text(source.localFilePath, 1200) }
        : {}),
      ...(finite(source.mediaId) != null ? { mediaId: finite(source.mediaId) } : {}),
      ...(text(source.mediaTitle, 500) ? { mediaTitle: text(source.mediaTitle, 500) } : {}),
      ...(finite(source.episodeNumber) != null
        ? { episodeNumber: finite(source.episodeNumber) }
        : {}),
      ...(text(source.episodeTitle, 500)
        ? { episodeTitle: text(source.episodeTitle, 500) }
        : {}),
    },
    assets: {
      ...(asset(raw.assets?.screenshot) ? { screenshot: asset(raw.assets?.screenshot) } : {}),
      ...(asset(raw.assets?.audio) ? { audio: asset(raw.assets?.audio) } : {}),
    },
    capturedAt: Math.max(0, Math.round(finite(raw.capturedAt) ?? Date.now())),
  };
}

export function createVideoCoreMiningDraft(
  cue: VideoCoreStudyCue,
  displayText: string,
  source: VideoCoreMiningSource,
  capturedAt = Date.now(),
): VideoCoreMiningDraft {
  const sentence = displayText.trim();
  const cueProvenance: VideoCoreCueProvenance = {
    schemaVersion: 1,
    cue: {
      index: cue.index,
      trackNumber: cue.trackNumber,
      rawText: cue.text,
      text: sentence,
      startMs: cue.startMs,
      endMs: cue.endMs,
    },
    source,
    assets: {},
    capturedAt,
  };
  return {
    cardKind: 'sentence',
    term: sentence,
    reading: '',
    meaning: '',
    translation: '',
    sentence,
    deckName: '',
    provenance: cueProvenance,
  };
}

export function withVideoCoreMiningAsset(
  draft: VideoCoreMiningDraft,
  kind: 'screenshot' | 'audio' | 'clip',
  input: { base64: string; asset: VideoCoreMiningAsset },
): VideoCoreMiningDraft {
  // Capture helpers return `{ base64, filename, mimeType, bytes }`. Structural
  // typing permits that richer object to be passed as `asset`, so never retain
  // the object by reference: doing so persisted the full binary payload inside
  // provenance/history as well as in the transient draft.
  const metadata: VideoCoreMiningAsset = {
    filename: input.asset.filename,
    mimeType: input.asset.mimeType,
    bytes: input.asset.bytes,
  };
  return {
    ...draft,
    [`${kind}Base64`]: input.base64,
    [kind]: metadata,
    provenance: {
      ...draft.provenance,
      assets: { ...draft.provenance.assets, [kind]: metadata },
    },
  };
}

export function buildVideoCoreMineRequest(draft: VideoCoreMiningDraft): MineNoteRequest {
  const cueTag = `cue-${draft.provenance.cue.trackNumber}-${draft.provenance.cue.index}`;
  const mediaTag = draft.provenance.source.mediaId != null
    ? `media-${draft.provenance.source.mediaId}`
    : 'media-local';
  return {
    route: {
      source: 'subtitle',
      cardKind: draft.cardKind,
      language: 'ja',
    },
    term: draft.term.trim(),
    ...(draft.reading.trim() ? { reading: draft.reading.trim() } : {}),
    ...(draft.meaning.trim() ? { meaning: draft.meaning.trim() } : {}),
    ...(draft.translation.trim() ? { translation: draft.translation.trim() } : {}),
    sentence: draft.sentence.trim(),
    surface: draft.term.trim(),
    ...(draft.translation.trim()
      ? { sentenceTranslation: draft.translation.trim() }
      : {}),
    ...(draft.deckName.trim() ? { deckName: draft.deckName.trim() } : {}),
    ...(draft.screenshotBase64 && draft.screenshot
      ? {
          imageBase64: draft.screenshotBase64,
          imageFilename: draft.screenshot.filename,
        }
      : {}),
    ...(draft.clipBase64 && draft.clip
      ? {
          clipBase64: draft.clipBase64,
          clipFilename: draft.clip.filename,
        }
      : {}),
    ...(draft.audioBase64 && draft.audio
      ? {
          audioBase64: draft.audioBase64,
          audioFilename: draft.audio.filename,
        }
      : {}),
    extraTags: ['video-core', cueTag, mediaTag],
  };
}

export function createVideoCoreMiningHistoryEntry(
  draft: VideoCoreMiningDraft,
  result: MineNoteResult,
  now = Date.now(),
): VideoCoreMiningHistoryEntry {
  const historyProvenance = provenance(draft.provenance);
  if (!historyProvenance) {
    throw new Error('Cannot record mining history without valid cue provenance.');
  }
  const status: VideoCoreMiningHistoryStatus = result.ok
    ? 'exported'
    : result.error === 'duplicate'
      ? 'duplicate'
      : 'failed';
  return {
    id: `video-core-mine-${now.toString(36)}-${draft.provenance.cue.trackNumber}-${draft.provenance.cue.index}`,
    createdAt: now,
    status,
    ...(result.noteId ? { noteId: result.noteId } : {}),
    ...(result.mediaFilenames?.length ? { mediaFilenames: result.mediaFilenames.slice() } : {}),
    // Prefer the deck the note actually landed in; the profile label is a coarser
    // fallback and hides a rule-routed deck override.
    ...(result.deckName || result.profileName
      ? { destination: result.deckName ?? result.profileName }
      : {}),
    ...(result.error ? { error: result.error } : {}),
    term: draft.term.trim(),
    sentence: draft.sentence.trim(),
    provenance: historyProvenance,
  };
}

export function markVideoCoreMiningHistoryUndone(
  history: readonly VideoCoreMiningHistoryEntry[],
  noteId: number,
): VideoCoreMiningHistoryEntry[] {
  return history.map((entry) =>
    entry.noteId === noteId && entry.status === 'exported'
      ? { ...entry, status: 'undone' }
      : entry);
}

export function normalizeVideoCoreMiningHistory(value: unknown): VideoCoreMiningHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-VIDEO_CORE_MINING_HISTORY_LIMIT).flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const raw = item as Partial<VideoCoreMiningHistoryEntry>;
    const normalizedProvenance = provenance(raw.provenance);
    const status = raw.status;
    const id = text(raw.id, 240);
    const createdAt = finite(raw.createdAt);
    const noteId = finite(raw.noteId);
    const term = text(raw.term, 500);
    if (
      !id
      || createdAt == null
      || !normalizedProvenance
      || !['exported', 'duplicate', 'failed', 'undone'].includes(String(status))
    ) return [];
    return [{
      id,
      createdAt: Math.max(0, Math.round(createdAt)),
      status: status as VideoCoreMiningHistoryStatus,
      ...(noteId != null ? { noteId: Math.round(noteId) } : {}),
      ...(Array.isArray(raw.mediaFilenames)
        ? {
            mediaFilenames: [...new Set(
              raw.mediaFilenames.map((filename) => text(filename, 180)).filter(Boolean),
            )],
          }
        : {}),
      ...(text(raw.destination, 240) ? { destination: text(raw.destination, 240) } : {}),
      ...(text(raw.error, 1000) ? { error: text(raw.error, 1000) } : {}),
      term,
      sentence: text(raw.sentence, 4000),
      provenance: normalizedProvenance,
    }];
  });
}

export function appendVideoCoreMiningHistory(
  history: readonly VideoCoreMiningHistoryEntry[],
  entry: VideoCoreMiningHistoryEntry,
): VideoCoreMiningHistoryEntry[] {
  return [...history, entry].slice(-VIDEO_CORE_MINING_HISTORY_LIMIT);
}
