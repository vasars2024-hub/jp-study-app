/**
 * IPC for "Sentence deck from a video": which text tracks a video has, reading
 * one of them as cues, and cutting the deck's audio with progress and Cancel.
 *
 * Every reader here is an existing one — the library's subtitle records
 * (`subtitleDiscovery.ts`, which already hold downloaded, attached, embedded
 * and Whisper tracks), sidecar files and container streams
 * (`subtitleLocalSources.ts`), and `parseSubtitles`. The only new machinery is
 * the batch cutter, which lives in `sentenceAudioBatch.ts` without Electron so
 * the suite can run it against the real ffmpeg.
 */
import { app, ipcMain, type WebContents } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { MediaItem } from '../shared/types';
import { parseSubtitles } from '../shared/subtitleCues';
import { SUBTITLE_EXT, VIDEO_EXT, extOf } from '../shared/mediaKind';
import { pickSubtitlePair, subtitleLangMatches } from '../shared/subtitleDiscoveryPick';
import { isMachineTranslatedSubtitle, type SubtitleRecord } from '../shared/subtitleRecord';
import {
  studyAudioStreamIndex,
  type SentenceDeckCue,
  type SentenceDeckSources,
  type SentenceDeckTrack,
  type SentenceDeckTrackRead,
} from '../shared/sentenceDeck';
import { normalizeStudyLang } from '../shared/studyLang';
import {
  extractSentenceAudioBatch,
  type SentenceAudioBatchRequest,
  type SentenceAudioBatchResult,
  type SentenceAudioClipResult,
} from './sentenceAudioBatch';
import { minedMediaDirectoryUnder } from './minedMediaStore';
import { loadDiscoverySettings, readSubtitleRecord, readableSubtitleRecords } from './subtitleDiscovery';
import {
  extractEmbeddedSubtitle,
  findSidecarSubtitles,
  listAudioStreamLanguages,
  listEmbeddedSubtitleStreams,
  normalizeStreamLanguage,
} from './subtitleLocalSources';
import { getMainStudyLang, getMainStudyLangTag } from './studyLanguage';

export interface SentenceDeckHost {
  listItems: () => MediaItem[];
}

/** Guard against a mis-routed multi-gigabyte file reaching a UTF-8 read. */
const MAX_SUBTITLE_BYTES = 32 * 1024 * 1024;

function pathKey(value: string): string {
  return value.trim().replace(/\\/g, '/').toLowerCase();
}

function itemForPath(host: SentenceDeckHost, filePath: string): MediaItem | undefined {
  const wanted = pathKey(filePath);
  return host.listItems().find((item) => pathKey(item.path ?? '') === wanted);
}

/**
 * The episode a subtitle file belongs to: the video in the same folder whose
 * name the subtitle's name starts with (`Ep 01.ja.srt` → `Ep 01.mkv`), longest
 * match first so `Ep 1` never claims `Ep 10`'s subtitle.
 */
export function videoForSubtitle(subtitlePath: string): string | null {
  const dir = path.dirname(subtitlePath);
  const name = path.basename(subtitlePath).toLowerCase();
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const candidates = entries
    .filter((entry) => VIDEO_EXT.has(extOf(entry)))
    .map((entry) => ({ entry, stem: path.basename(entry, path.extname(entry)).toLowerCase() }))
    .filter(({ stem }) => stem && name.startsWith(stem))
    .sort((a, b) => b.stem.length - a.stem.length);
  return candidates[0] ? path.join(dir, candidates[0].entry) : null;
}

function recordKind(record: SubtitleRecord): SentenceDeckTrack['kind'] {
  if (isMachineTranslatedSubtitle(record)) return 'translation';
  if (record.source === 'generated') return 'transcript';
  if (record.source === 'embedded') return 'embedded';
  if (record.source === 'sidecar') return 'sidecar';
  return 'downloaded';
}

/** Every text track a video has, and the pair the player would pick. */
export async function listSentenceDeckSources(
  host: SentenceDeckHost,
  input: { videoPath?: unknown; subtitlePath?: unknown },
): Promise<SentenceDeckSources> {
  const subtitlePath = typeof input?.subtitlePath === 'string' ? input.subtitlePath : '';
  let videoPath = typeof input?.videoPath === 'string' ? input.videoPath : '';
  if (!videoPath && subtitlePath) videoPath = videoForSubtitle(subtitlePath) ?? '';
  if (!videoPath) {
    return { ok: false, reasonKey: subtitlePath ? 'sentenceDeck.error.noVideoForSubtitle' : 'sentenceDeck.error.noFile', tracks: [] };
  }
  if (!fs.existsSync(videoPath)) return { ok: false, reasonKey: 'sentenceDeck.error.noFile', tracks: [] };

  const studyTag = getMainStudyLangTag();
  const helper = loadDiscoverySettings().helperLanguage;
  const tracks: SentenceDeckTrack[] = [];
  let primaryId: string | undefined;
  let secondaryId: string | undefined;

  if (subtitlePath) {
    tracks.push({
      id: `file:${subtitlePath}`,
      label: path.basename(subtitlePath),
      lang: '',
      kind: 'file',
    });
    primaryId = `file:${subtitlePath}`;
  }

  const item = itemForPath(host, videoPath);
  const records = readableSubtitleRecords(item?.subtitles);
  for (const record of records) {
    tracks.push({
      id: `record:${record.id}`,
      label: record.label ?? `${record.lang} (${record.source})`,
      lang: record.lang ?? '',
      kind: recordKind(record),
    });
  }
  const pair = pickSubtitlePair(records, studyTag, helper, item?.preferredSubtitleId);
  if (!primaryId && pair.primary) primaryId = `record:${pair.primary.id}`;
  if (pair.secondary) secondaryId = `record:${pair.secondary.id}`;

  // Files beside the video that the library has not attached (or a video the
  // library has never seen).
  const known = new Set(records.filter((r) => r.external).map((r) => pathKey(r.path)));
  if (subtitlePath) known.add(pathKey(subtitlePath));
  for (const sidecar of findSidecarSubtitles(videoPath)) {
    if (known.has(pathKey(sidecar.path))) continue;
    tracks.push({ id: `sidecar:${sidecar.path}`, label: sidecar.fileName, lang: sidecar.language ?? '', kind: 'sidecar' });
  }

  // Streams inside the container, unless discovery already extracted them.
  if (!records.some((r) => r.source === 'embedded')) {
    try {
      for (const stream of await listEmbeddedSubtitleStreams(videoPath)) {
        const lang = normalizeStreamLanguage(stream.language) ?? '';
        tracks.push({
          id: `embedded:${stream.subtitleIndex}`,
          label: stream.title || `${lang || stream.codec} #${stream.subtitleIndex + 1}`,
          lang,
          kind: 'embedded',
        });
      }
    } catch {
      /* An unreadable container lists no streams; the other sources still count. */
    }
  }

  // No library pick: the first track in the study language, then the helper.
  if (!primaryId) primaryId = tracks.find((t) => subtitleLangMatches(t.lang, studyTag))?.id;
  if (!secondaryId && helper) {
    secondaryId = tracks.find((t) => t.id !== primaryId && subtitleLangMatches(t.lang, helper))?.id;
  }
  // A lone untagged track is still the one to try.
  if (!primaryId && tracks.length === 1) primaryId = tracks[0].id;

  return {
    ok: true,
    videoPath,
    ...(item ? { mediaId: item.id } : {}),
    title: path.basename(videoPath, path.extname(videoPath)),
    tracks,
    ...(primaryId ? { primaryId } : {}),
    ...(secondaryId ? { secondaryId } : {}),
  };
}

function readTextFile(filePath: string): string | null {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > MAX_SUBTITLE_BYTES) return null;
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function toCues(text: string): SentenceDeckCue[] {
  // A transcript file is `JSON.stringify(Cue[])` — read as that, like the Files app does.
  const trimmed = text.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as Array<{ start?: unknown; end?: unknown; text?: unknown }>;
      if (Array.isArray(parsed)) {
        return parsed
          .filter((cue) => typeof cue?.start === 'number' && typeof cue?.end === 'number' && typeof cue?.text === 'string')
          .map((cue) => ({
            startMs: Math.round((cue.start as number) * 1000),
            endMs: Math.round((cue.end as number) * 1000),
            text: cue.text as string,
          }));
      }
    } catch {
      /* not JSON after all — fall through to the subtitle parser */
    }
  }
  return parseSubtitles(text).map((cue) => ({
    startMs: Math.round(cue.start * 1000),
    endMs: Math.round(cue.end * 1000),
    text: cue.text,
    ...(cue.style ? { style: cue.style } : {}),
  }));
}

/** One track's cues, by the opaque id `listSentenceDeckSources` handed out. */
export async function readSentenceDeckTrack(
  host: SentenceDeckHost,
  videoPathInput: unknown,
  trackIdInput: unknown,
): Promise<SentenceDeckTrackRead> {
  const videoPath = typeof videoPathInput === 'string' ? videoPathInput : '';
  const trackId = typeof trackIdInput === 'string' ? trackIdInput : '';
  const unreadable: SentenceDeckTrackRead = { ok: false, reasonKey: 'sentenceDeck.error.trackUnreadable', cues: [] };
  let text: string | null = null;
  if (trackId.startsWith('record:')) {
    const item = itemForPath(host, videoPath);
    const record = item?.subtitles?.find((entry) => entry.id === trackId.slice('record:'.length));
    text = record ? readSubtitleRecord(record) : null;
  } else if (trackId.startsWith('sidecar:') || trackId.startsWith('file:')) {
    const filePath = trackId.slice(trackId.indexOf(':') + 1);
    const ext = extOf(filePath);
    // Only subtitle and transcript files: this id arrives from the renderer.
    if (!SUBTITLE_EXT.has(ext) && ext !== '.json') return unreadable;
    text = readTextFile(filePath);
  } else if (trackId.startsWith('embedded:')) {
    const index = Number(trackId.slice('embedded:'.length));
    if (!Number.isInteger(index) || index < 0 || !videoPath || !fs.existsSync(videoPath)) return unreadable;
    text = await extractEmbeddedSubtitle(videoPath, index);
  }
  if (text == null) return unreadable;
  const cues = toCues(text);
  if (!cues.length) return { ok: false, reasonKey: 'sentenceDeck.error.trackEmpty', cues: [] };
  return { ok: true, cues };
}

// ---------------------------------------------------------------------------
// Audio jobs

export interface SentenceDeckAudioRequest extends Omit<SentenceAudioBatchRequest, 'audioStream'> {
  jobId: string;
  /** Study language of the deck; picks the audio stream of a dual-audio file. */
  studyLang?: string;
}

export interface SentenceDeckProgress {
  jobId: string;
  done: number;
  total: number;
  failed: number;
  /** The clip that just finished. */
  last?: Pick<SentenceAudioClipResult, 'id' | 'ok'>;
}

const jobs = new Map<string, AbortController>();

export async function runSentenceDeckAudio(
  request: SentenceDeckAudioRequest,
  sender: Pick<WebContents, 'send' | 'isDestroyed'> | null,
  mediaDirectory: string,
): Promise<SentenceAudioBatchResult> {
  const jobId = typeof request?.jobId === 'string' ? request.jobId : '';
  if (!jobId || jobs.has(jobId)) return { ok: false, cancelled: false, results: [], reasonKey: 'sentenceDeck.error.busy' };
  const controller = new AbortController();
  jobs.set(jobId, controller);
  try {
    const lang = normalizeStudyLang(request.studyLang, getMainStudyLang());
    let audioStream = 0;
    try {
      audioStream = studyAudioStreamIndex(await listAudioStreamLanguages(request.filePath), lang);
    } catch {
      /* Untagged or unreadable: the first stream. */
    }
    let failed = 0;
    return await extractSentenceAudioBatch(
      {
        filePath: request.filePath,
        clips: Array.isArray(request.clips) ? request.clips : [],
        padMs: request.padMs,
        withStill: request.withStill === true,
        audioStream,
      },
      {
        mediaDirectory,
        signal: controller.signal,
        onProgress: (done, total, result) => {
          if (!result.ok) failed += 1;
          if (sender && !sender.isDestroyed()) {
            const progress: SentenceDeckProgress = { jobId, done, total, failed, last: { id: result.id, ok: result.ok } };
            sender.send('sentenceDeck:progress', progress);
          }
        },
      },
    );
  } finally {
    jobs.delete(jobId);
  }
}

export function cancelSentenceDeckAudio(jobId: unknown): boolean {
  const controller = typeof jobId === 'string' ? jobs.get(jobId) : undefined;
  if (!controller) return false;
  controller.abort();
  return true;
}

export function registerSentenceDeckIpc(host: SentenceDeckHost): void {
  ipcMain.handle('sentenceDeck:sources', (_e, input: unknown) =>
    listSentenceDeckSources(host, (input ?? {}) as { videoPath?: unknown; subtitlePath?: unknown }));
  ipcMain.handle('sentenceDeck:readTrack', (_e, videoPath: unknown, trackId: unknown) =>
    readSentenceDeckTrack(host, videoPath, trackId));
  ipcMain.handle('sentenceDeck:extractAudio', (event, request: SentenceDeckAudioRequest) =>
    runSentenceDeckAudio(request, event.sender, minedMediaDirectoryUnder(app.getPath('userData'))));
  ipcMain.handle('sentenceDeck:cancel', (_e, jobId: unknown) => cancelSentenceDeckAudio(jobId));
}
