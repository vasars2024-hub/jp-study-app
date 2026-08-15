/**
 * The persistent Whisper transcription queue.
 *
 * Three things make this different from the RPC it replaces:
 *
 *  - **It survives.** The queue is written to disk on every change and restored
 *    on boot, so closing the app mid-transcription resumes rather than loses it.
 *  - **It is chunked.** A 24-minute episode is transcribed in slices, which is
 *    what makes progress real instead of a spinner, and what stops the whole
 *    thing dying on one timeout.
 *  - **It is visible and stoppable.** Every phase broadcasts, and cancellation is
 *    checked between chunks.
 *
 * Whisper itself lives in a renderer worker, so the main process has to call
 * *outward*. That inversion uses the same UUID-correlation pattern as
 * `requestWhisperTranscribe` in `extensionServer.ts`.
 */

import { BrowserWindow, app, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {
  MAX_NO_WINDOW_ATTEMPTS,
  MAX_TRANSCRIPTION_ATTEMPTS,
  estimateEtaMs,
  type TranscriptionJob,
  type TranscriptionPhase,
  type TranscriptionProgress,
  type TranscriptionRequest,
  type TranscriptionResult,
} from '../shared/transcriptionIpc';
import type { SubtitleRecord } from '../shared/subtitleRecord';
import type { MediaItem } from '../shared/types';
import { parseSubtitles } from '../shared/subtitleCues';
import { shiftCues } from '../shared/subtitleSync';
import {
  decideFusedWindows,
  meanFusionConfidence,
  planAsrWindows,
  selectDialogueCues,
  buildBaselineTracks,
  windowCuesToSubtitleCues,
  windowSourceText,
  FUSION_MAX_WINDOW_SEC,
  type CueExclusionReason,
} from '../shared/subtitleFusionCore';
import {
  buildFusionTrackMeta,
  fusionConfidencePercent,
  fusionMetaPathFor,
  parseFusionTrackMeta,
  serializeFusionTrackMeta,
  type FusionTrackMeta,
} from '../shared/subtitleFusionMeta';
import { cuesToSrt } from '../shared/subtitlesExport';
import { extractAudioPcm } from './media';
import { estimateSubtitleOffset } from './subtitleSync';
import { isTranslateAvailable, runTranslationBatch } from './translate';
import { arbitrateFusionDecisions } from './subtitleFusionArbiter';

export interface TranscriptionHost {
  listItems: () => MediaItem[];
  patchItems: (ids: readonly string[], patch: Partial<MediaItem>) => void;
}

let host: TranscriptionHost | null = null;

/** Seconds of audio per Whisper call. Long enough to keep context, short enough
 *  that one slice cannot exceed the reply timeout, and that progress moves. */
const CHUNK_SECONDS = 30;
const SAMPLE_RATE = 16_000;
/** Generous: a slow CPU model on a 30 s slice is still well inside this. */
const CHUNK_TIMEOUT_MS = 120_000;
/** One at a time — Whisper is already saturating the machine. */
const MAX_CONCURRENT = 1;

let queue: TranscriptionJob[] = [];
const cancelled = new Set<string>();
let active = 0;
let draining = false;
/** Pending re-attempt, so a stalled queue cannot stack timers. */
let retryTimer: NodeJS.Timeout | null = null;
const progressListeners = new Set<(progress: TranscriptionProgress) => void>();

/** How long to wait before looking for a window again. */
const NO_WINDOW_RETRY_MS = 15_000;

/**
 * Queue a drain attempt.
 *
 * Needed because the drain loop gives up when there is no renderer to run Whisper
 * in — and without a re-attempt that was permanent: a queue restored at boot before
 * the window was ready would sit untouched for the entire session, which is exactly
 * the "restore active jobs after restarting" promise not being kept.
 */
function scheduleDrain(delayMs: number): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void drain();
  }, delayMs);
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function queuePath(): string {
  return path.join(app.getPath('userData'), 'transcription-jobs.json');
}

function saveQueue(): void {
  try {
    fs.writeFileSync(queuePath(), JSON.stringify(queue), 'utf-8');
  } catch {
    /* a queue that cannot persist still runs for this session */
  }
}

function loadQueue(): TranscriptionJob[] {
  try {
    const raw = JSON.parse(fs.readFileSync(queuePath(), 'utf-8')) as TranscriptionJob[];
    if (!Array.isArray(raw)) return [];
    return raw.filter((job): job is TranscriptionJob =>
      Boolean(job && typeof job.mediaId === 'string' && typeof job.title === 'string'));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Renderer RPC
// ---------------------------------------------------------------------------

const pendingReplies = new Map<string, { resolve: (r: { ok: boolean; text?: string; error?: string }) => void; timer: NodeJS.Timeout }>();

/** Called by the renderer when a chunk comes back. */
export function resolveTranscriptionChunk(id: string, payload: { ok: boolean; text?: string; error?: string }): void {
  const pending = pendingReplies.get(id);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingReplies.delete(id);
  pending.resolve(payload);
}

function requestChunk(pcm: Float32Array, lang: string): Promise<{ ok: boolean; text?: string; error?: string }> {
  const windows = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
  if (!windows.length) {
    return Promise.resolve({ ok: false, error: 'no-window' });
  }
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingReplies.delete(id);
      resolve({ ok: false, error: 'timeout' });
    }, CHUNK_TIMEOUT_MS);
    pendingReplies.set(id, { resolve, timer });
    const buffer = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    for (const win of windows) {
      win.webContents.send('transcription:chunk-request', {
        id,
        lang,
        pcmBase64: buffer.toString('base64'),
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

function broadcast(progress: TranscriptionProgress): void {
  for (const listener of progressListeners) {
    try {
      listener(progress);
    } catch {
      // Progress observers are isolated from the transcription job itself.
    }
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('transcription:progress', progress);
  }
}

// ---------------------------------------------------------------------------
// SRT assembly
// ---------------------------------------------------------------------------

function timestamp(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const rest = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(rest).padStart(3, '0')}`;
}

/**
 * Turns per-chunk text into SRT cues.
 *
 * Timing is chunk-granular rather than word-granular: Whisper is asked for text,
 * not alignment, so each chunk becomes one cue spanning its own window. That is
 * honest about the precision on offer — and why the record is labelled
 * machine-generated and left editable.
 */
export function chunksToSrt(chunks: readonly string[], chunkSeconds = CHUNK_SECONDS): string {
  const cues: string[] = [];
  let index = 1;
  chunks.forEach((text, i) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const start = i * chunkSeconds;
    const end = (i + 1) * chunkSeconds;
    cues.push(`${index}\n${timestamp(start)} --> ${timestamp(end)}\n${trimmed}\n`);
    index += 1;
  });
  return cues.join('\n');
}

// ---------------------------------------------------------------------------
// The job
// ---------------------------------------------------------------------------

async function runJob(job: TranscriptionJob): Promise<TranscriptionResult> {
  if (!host) return { ok: false, error: 'host-not-registered' };
  const item = host.listItems().find((entry) => entry.id === job.mediaId);
  if (!item) return { ok: false, error: 'item-not-found' };

  const startedAt = Date.now();
  let total = 0;
  const emit = (phase: TranscriptionPhase, done: number, extra: Partial<TranscriptionProgress> = {}): void =>
    broadcast({
      mediaId: job.mediaId,
      title: job.title,
      phase,
      done,
      total,
      startedAt,
      etaMs: estimateEtaMs(done, total, Date.now() - startedAt),
      ...extra,
    });

  try {
    emit('preparing', 0);
    if (cancelled.has(job.mediaId)) {
      emit('cancelled', 0);
      return { ok: false, error: 'cancelled' };
    }

    emit('extracting-audio', 0);
    const pcmBuffer = await extractAudioPcm(item.path);
    const samples = new Float32Array(pcmBuffer);
    const perChunk = CHUNK_SECONDS * SAMPLE_RATE;
    total = Math.max(1, Math.ceil(samples.length / perChunk));

    const texts: string[] = [];
    for (let i = 0; i < total; i += 1) {
      if (cancelled.has(job.mediaId)) {
        emit('cancelled', i);
        return { ok: false, error: 'cancelled' };
      }
      emit('transcribing', i);
      const slice = samples.subarray(i * perChunk, Math.min((i + 1) * perChunk, samples.length));
      // A trailing sliver of audio carries no words worth a round trip.
      if (slice.length < SAMPLE_RATE / 2) {
        texts.push('');
        continue;
      }
      const reply = await requestChunk(slice, job.lang);
      if (!reply.ok) {
        // `no-window` is not the file's fault — the job goes back to the queue
        // rather than counting as a failed attempt against this media.
        if (reply.error === 'no-window') throw new Error('no-window');
        texts.push('');
        continue;
      }
      texts.push(reply.text ?? '');
    }

    emit('aligning', total);
    const srt = chunksToSrt(texts);
    if (!srt.trim()) {
      emit('error', total, { error: 'empty' });
      return { ok: false, error: 'empty-transcript' };
    }

    const relative = writeSubtitleFile(job.mediaId, `generated-${job.lang}.srt`, srt);

    const record: SubtitleRecord = {
      id: crypto.randomUUID(),
      lang: job.lang,
      source: 'generated',
      format: 'srt',
      path: relative,
      label: `Whisper (${job.lang})`,
      machineGenerated: true,
      derivation: 'whisper',
      addedAt: Date.now(),
    };
    // Replaces any previous grid-transcribed track for this language; keeps every
    // human-sourced one, which always outranks a transcript anyway, and keeps a
    // fused track, which is a different artifact rather than an older version of
    // this one. Records written before `derivation` existed are this kind.
    const kept = (item.subtitles ?? []).filter(
      (entry) => !(entry.source === 'generated'
        && entry.lang === job.lang
        && entry.derivation !== 'en-ja-fusion'),
    );
    host.patchItems([job.mediaId], {
      subtitles: [...kept, record],
      subtitlesCheckedAt: Date.now(),
    });

    emit('done', total);
    return { ok: true, mediaId: job.mediaId, lines: texts.filter((t) => t.trim()).length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'no-window') throw error; // requeue, do not count as a failure
    emit('error', 0, { error: message });
    return { ok: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// EN→JA fusion (plan stages F1 and F2)
// ---------------------------------------------------------------------------

/** Where a subtitle record's bytes actually are. Sidecars are absolute. */
function subtitleFilePath(record: SubtitleRecord): string {
  return record.external || path.isAbsolute(record.path)
    ? record.path
    : path.join(app.getPath('userData'), record.path);
}

/**
 * The English track whose cue timing the fusion job will borrow.
 *
 * A human-authored track outranks a machine-generated one unconditionally: this
 * job exists to inherit *trustworthy* timing, and a previous Whisper pass on the
 * English audio has the same 30-second grid the fusion is trying to escape.
 */
function pickEnglishTrack(
  item: MediaItem,
  preferredId?: string,
): SubtitleRecord | undefined {
  const english = (item.subtitles ?? []).filter((record) => /^en\b/i.test(record.lang.trim()));
  if (preferredId) return english.find((record) => record.id === preferredId);
  return [...english].sort((a, b) => {
    const human = Number(Boolean(a.machineGenerated)) - Number(Boolean(b.machineGenerated));
    if (human !== 0) return human;
    const confidence = (b.confidence ?? 0) - (a.confidence ?? 0);
    if (confidence !== 0) return confidence;
    return b.addedAt - a.addedAt;
  })[0];
}

function writeSubtitleFile(mediaId: string, fileName: string, contents: string): string {
  const relativeDir = path.join('subtitles', mediaId.replace(/[^a-zA-Z0-9_-]/g, ''));
  const relative = path.join(relativeDir, fileName);
  fs.mkdirSync(path.join(app.getPath('userData'), relativeDir), { recursive: true });
  fs.writeFileSync(path.join(app.getPath('userData'), relative), contents, 'utf-8');
  return relative;
}

/**
 * Translate each ASR window's English text, for the reference F4 scores against.
 *
 * Returns an array parallel to `sources`, with an empty string wherever no
 * translation was produced. **Every failure path yields empties rather than
 * throwing**, and that is the whole contract: the plan makes offline degradation
 * a hard requirement, and a missing reference costs confidence, never the track.
 * With no local model installed, a cancelled batch, or a chunk the model declined,
 * the job still writes exactly the Whisper output F2 produced.
 *
 * The local translator is used, not a cloud provider. The reference only has to
 * carry meaning well enough to disagree usefully with a misheard transcript, and
 * spending a cloud call per window on an episode with ~500 of them is not a cost
 * this stage can justify. Cloud arbitration is F5, on the disputed cues only.
 */
async function translateWindowReferences(
  sources: readonly string[],
  sourceLang: string,
  targetLang: string,
  isCancelled: () => boolean,
): Promise<string[]> {
  const references = sources.map(() => '');
  if (!isTranslateAvailable()) return references;

  const items = sources
    .map((text, index) => ({ id: String(index), text: text.trim(), source: sourceLang, target: targetLang }))
    .filter((item) => item.text.length > 0);
  if (!items.length) return references;

  try {
    const results = await runTranslationBatch(items, { shouldCancel: isCancelled });
    for (const result of results) {
      const index = Number(result.id);
      // `runTranslationBatch` echoes the ids it was given, but a model that
      // fabricates one must not be able to write outside the array.
      if (!Number.isInteger(index) || index < 0 || index >= references.length) continue;
      references[index] = result.text.trim();
    }
  } catch {
    // A translator failure is not a fusion failure. Deliberately silent: the
    // reduced per-cue confidence in the written record is where this shows up,
    // and it shows up per line rather than as one banner about the whole run.
    return sources.map(() => '');
  }
  return references;
}

/**
 * Transcribe the Japanese audio on the English track's cue grid.
 *
 * This is F1+F2 of `docs/ACTIVE/EN_JA_SUBTITLE_FUSION_PLAN.md`, and on its own it
 * already produces the thing the plain Whisper pass cannot: Japanese lines timed
 * to the line, not to a 30-second block. The later stages (reference translation,
 * agreement scoring, arbitration) refine the *text* of these same cues; they do
 * not change the grid, which is why this lands as its own slice.
 *
 * The sync gate comes first and is load-bearing. An English track timed against a
 * different release would put every window over the wrong line, and the result
 * would be confident, well-timed nonsense — worse than no track. `subtitleSync`
 * declines rather than guessing, and a declined estimate means "proceed unshifted",
 * not "shift by its best guess".
 */
async function runFusionJob(job: TranscriptionJob): Promise<TranscriptionResult> {
  if (!host) return { ok: false, error: 'host-not-registered' };
  const item = host.listItems().find((entry) => entry.id === job.mediaId);
  if (!item) return { ok: false, error: 'item-not-found' };

  const startedAt = Date.now();
  let total = 0;
  const emit = (phase: TranscriptionPhase, done: number, extra: Partial<TranscriptionProgress> = {}): void =>
    broadcast({
      mediaId: job.mediaId,
      title: job.title,
      phase,
      done,
      total,
      startedAt,
      etaMs: estimateEtaMs(done, total, Date.now() - startedAt),
      ...extra,
    });
  const stopped = (done: number): boolean => {
    if (!cancelled.has(job.mediaId)) return false;
    emit('cancelled', done);
    return true;
  };

  try {
    emit('preparing', 0);
    if (stopped(0)) return { ok: false, error: 'cancelled' };

    const source = pickEnglishTrack(item, job.sourceSubtitleId);
    // This feature fuses tracks; it does not fetch them. Refusing by name is what
    // lets the UI say which precondition is missing instead of "it failed".
    if (!source) {
      emit('error', 0, { error: 'no-english-track' });
      return { ok: false, error: 'no-english-track' };
    }
    let raw: string;
    try {
      raw = fs.readFileSync(subtitleFilePath(source), 'utf-8');
    } catch {
      emit('error', 0, { error: 'source-unreadable' });
      return { ok: false, error: 'source-unreadable' };
    }

    const selection = selectDialogueCues(parseSubtitles(raw));
    if (!selection.cues.length) {
      emit('error', 0, { error: 'no-dialogue-cues' });
      return { ok: false, error: 'no-dialogue-cues' };
    }
    const excluded = selection.excluded.reduce<Record<CueExclusionReason, number>>(
      (counts, entry) => ({ ...counts, [entry.reason]: counts[entry.reason] + 1 }),
      { music: 0, sign: 0, empty: 0 },
    );

    // F1 — the timing gate. Cheap relative to ASR (four 90 s windows), and it is
    // the difference between fusing this episode and fusing a neighbouring one.
    emit('extracting-audio', 0);
    const estimate = await estimateSubtitleOffset(
      item.path,
      selection.cues.map((cue) => ({ start: cue.start, end: cue.end })),
      item.durationSec ?? 0,
    );
    const cues = estimate.confident
      ? shiftCues(selection.cues, estimate.offsetSec)
      : selection.cues;

    const pcmBuffer = await extractAudioPcm(item.path);
    const samples = new Float32Array(pcmBuffer);
    const durationSec = samples.length / SAMPLE_RATE;
    const windows = planAsrWindows(cues, { durationSec, maxWindowSec: FUSION_MAX_WINDOW_SEC });
    total = windows.length;
    if (!total) {
      emit('error', 0, { error: 'no-windows' });
      return { ok: false, error: 'no-windows' };
    }

    // F2 — one Whisper call per window. Same RPC as the grid path; only the slice
    // boundaries changed, so nothing about the renderer worker protocol moves.
    const texts: string[] = [];
    for (let i = 0; i < total; i += 1) {
      if (stopped(i)) return { ok: false, error: 'cancelled' };
      emit('transcribing', i);
      const from = Math.max(0, Math.floor(windows[i].startSec * SAMPLE_RATE));
      const to = Math.min(samples.length, Math.ceil(windows[i].endSec * SAMPLE_RATE));
      const slice = samples.subarray(from, to);
      if (slice.length < SAMPLE_RATE / 4) {
        texts.push('');
        continue;
      }
      const reply = await requestChunk(slice, job.lang);
      if (!reply.ok) {
        if (reply.error === 'no-window') throw new Error('no-window');
        texts.push('');
        continue;
      }
      texts.push(reply.text ?? '');
    }

    // F3 — the reference translation, one request per window rather than per cue.
    // A merged window's transcript covers several English lines, so the reference
    // it is scored against has to cover the same span or the comparison is
    // structurally unfair. `runTranslationBatch` already dedupes, chunks and
    // caches, so identical lines across an episode cost one call.
    emit('aligning', total);
    const englishTexts = windows.map((window) => windowSourceText(window, cues));
    const references = await translateWindowReferences(
      englishTexts,
      source.lang,
      job.lang,
      () => stopped(total),
    );

    // F4 — agreement scoring. Offline this never overrides Whisper; what it
    // changes is the confidence carried per line, and that a window Whisper
    // returned nothing for now carries the translated English instead of
    // disappearing from the track.
    const scored = decideFusedWindows(texts, references);

    // F5 — the optional cloud second opinion on the disputed windows only. With
    // no key configured, no disputes, or a provider that fails, this returns
    // `scored` unchanged; nothing downstream can tell the difference except the
    // per-cue basis. That is the plan's offline-degradation requirement, and it
    // is why the call sits here rather than behind a settings branch.
    const arbitration = await arbitrateFusionDecisions(
      scored,
      englishTexts,
      references,
      {
        isCancelled: () => cancelled.has(job.mediaId),
        // A heartbeat, not a second progress bar: batches do not map onto the
        // window count the bar already shows, and inventing a unit for them
        // would make the bar jump backwards.
        onBatch: () => emit('aligning', total),
      },
    );
    const decisions = arbitration.decisions;
    const fused = windowCuesToSubtitleCues(windows, cues, decisions.map((d) => d.text));
    const srt = cuesToSrt(fused);
    if (!srt.trim()) {
      emit('error', total, { error: 'empty' });
      return { ok: false, error: 'empty-transcript' };
    }
    const relative = writeSubtitleFile(job.mediaId, `fused-${job.lang}.srt`, srt);

    // F7 — the two baselines the ship gate needs, written only when asked for.
    //
    // `JP_FUSION_EVAL=1` is a developer escape hatch, not a feature: the harness
    // in `tools/fusion-eval.cjs` needs raw-Whisper and MT-only tracks on the same
    // cue grid as the fused one, and they only exist inside this function. They
    // are written as plain files with **no `SubtitleRecord`** — a user picking a
    // subtitle track should never be offered "the worse one we measured against".
    // Off by default because three tracks per fusion is a cost nobody pressing
    // "fuse" asked for; a failure to write one never fails the job.
    if (process.env.JP_FUSION_EVAL === '1') {
      try {
        const baselines = buildBaselineTracks(windows, cues, texts, references);
        writeSubtitleFile(job.mediaId, `fused-${job.lang}.whisper-only.srt`,
          cuesToSrt(baselines.whisperOnly));
        writeSubtitleFile(job.mediaId, `fused-${job.lang}.mt-only.srt`,
          cuesToSrt(baselines.mtOnly));
      } catch {
        // Evaluation artifacts are not the product; the fused track already landed.
      }
    }

    // F6 — the provenance sidecar. Written from the same `decisions` the SRT was,
    // through the same skip rule, so cue N in the file is cue N here. A failure to
    // write it is deliberately not a failure of the job: the track is readable
    // without it, and losing a finished transcription over a metadata file would be
    // the wrong trade.
    const createdAt = Date.now();
    const meta = buildFusionTrackMeta(windows, cues, decisions, {
      createdAt,
      sourceSubtitleId: source.id,
      sourceLang: source.lang,
      lang: job.lang,
      offsetSec: estimate.confident ? estimate.offsetSec : 0,
      offsetConfident: estimate.confident,
      // What F5 did, recorded rather than inferred. Two runs on this install
      // with the same key applied 22 verdicts and 0, and the sidecars were
      // indistinguishable from "no provider configured" — both leave every
      // disputed cue `whisper-unverified`, so counting bases cannot separate a
      // failed arbiter from an absent one. The F7 harness picks its `--mode`
      // from exactly this distinction.
      arbitration: {
        attempted: arbitration.attempted,
        applied: arbitration.applied,
        failedBatches: arbitration.failedBatches,
        skipped: arbitration.skipped,
        // Omitted when nothing failed, so a clean run's sidecar is unchanged.
        ...(Object.keys(arbitration.failures).length ? { failures: arbitration.failures } : {}),
        ...(arbitration.dropped > 0 ? { dropped: arbitration.dropped } : {}),
        ...(arbitration.recovered > 0 ? { recovered: arbitration.recovered } : {}),
      },
    });
    try {
      writeSubtitleFile(
        job.mediaId,
        path.basename(fusionMetaPathFor(`fused-${job.lang}.srt`)),
        serializeFusionTrackMeta(meta),
      );
    } catch {
      // Intentionally silent; the badge simply has nothing to read.
    }

    const record: SubtitleRecord = {
      id: crypto.randomUUID(),
      lang: job.lang,
      source: 'generated',
      format: 'srt',
      path: relative,
      label: `${job.lang.toUpperCase()} (fused from ${source.lang.toUpperCase()} + Whisper)`,
      machineGenerated: true,
      derivation: 'en-ja-fusion',
      // `confidence` on a record is documented as a **0–100** match score and is
      // rendered as a percent by the media library. F4 landed the 0–1 mean straight
      // into it, so a track at 0.52 displayed as "1% match". Same number, right unit.
      confidence: fusionConfidencePercent(meanFusionConfidence(decisions)),
      addedAt: createdAt,
    };
    // Replaces the previous *fused* track only. A plain Whisper transcript for the
    // same language is a different artifact with different timing, and evicting it
    // here would silently delete work the user may still be reading.
    const kept = (item.subtitles ?? []).filter(
      (entry) => !(entry.source === 'generated'
        && entry.lang === job.lang
        && entry.derivation === 'en-ja-fusion'),
    );
    host.patchItems([job.mediaId], {
      subtitles: [...kept, record],
      subtitlesCheckedAt: Date.now(),
    });

    emit('done', total);
    return {
      ok: true,
      mediaId: job.mediaId,
      lines: fused.length,
      windows: total,
      sourceSubtitleId: source.id,
      offsetSec: estimate.confident ? estimate.offsetSec : 0,
      offsetConfident: estimate.confident,
      excludedCues: excluded,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'no-window') throw error; // requeue, do not count as a failure
    emit('error', 0, { error: message });
    return { ok: false, error: message };
  }
}

/**
 * What to do with the head job when a drain found no renderer window.
 *
 * Pure, so the bound is testable without a queue, a window or a Whisper: the
 * thing worth asserting is that the counter climbs and that it eventually
 * stops, not how the loop is written.
 */
function planNoWindowRetry(job: TranscriptionJob): { retire: boolean; job: TranscriptionJob } {
  const noWindowAttempts = (job.noWindowAttempts ?? 0) + 1;
  return {
    retire: noWindowAttempts >= MAX_NO_WINDOW_ATTEMPTS,
    job: { ...job, noWindowAttempts },
  };
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (queue.length > 0 && active < MAX_CONCURRENT) {
      const job = queue[0];
      if (cancelled.has(job.mediaId)) {
        queue.shift();
        cancelled.delete(job.mediaId);
        saveQueue();
        continue;
      }
      active += 1;
      try {
        const result = job.kind === 'fuse-en-ja' ? await runFusionJob(job) : await runJob(job);
        queue.shift();
        if (!result.ok && result.error !== 'cancelled') {
          const attempts = job.attempts + 1;
          // A file that fails repeatedly is dropped rather than retried forever.
          // The no-window counter resets: this run did reach a renderer, so the
          // waiting it did earlier says nothing about the wait ahead of it.
          if (attempts < MAX_TRANSCRIPTION_ATTEMPTS) {
            queue.push({ ...job, attempts, noWindowAttempts: 0 });
          }
        }
      } catch {
        // No window to transcribe in. Keep the job queued and try again shortly:
        // the window usually arrives seconds later, and breaking without a retry
        // stalls the queue until something else happens to enqueue. But a
        // renderer that never arrives — or one that keeps dying mid-job — would
        // otherwise hold the queue head forever, re-extracting the audio every
        // 15 s for the rest of the session, so the wait is bounded too.
        const plan = planNoWindowRetry(job);
        if (plan.retire) {
          if (queue[0]?.mediaId === job.mediaId) queue.shift();
          broadcast({
            mediaId: job.mediaId,
            title: job.title,
            phase: 'error',
            done: 0,
            total: 0,
            startedAt: Date.now(),
            error: 'no-window',
          });
        } else {
          if (queue[0]?.mediaId === job.mediaId) queue[0] = plan.job;
          scheduleDrain(NO_WINDOW_RETRY_MS);
        }
        break;
      } finally {
        active -= 1;
        cancelled.delete(job.mediaId);
        saveQueue();
      }
    }
  } finally {
    draining = false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function enqueueTranscription(request: TranscriptionRequest): TranscriptionResult {
  if (!host) return { ok: false, error: 'host-not-registered' };
  const item = host.listItems().find((entry) => entry.id === request.mediaId);
  if (!item) return { ok: false, error: 'item-not-found' };
  const kind = request.kind ?? 'transcribe';
  // Matched on kind as well as media, so asking to fuse a file that is already
  // queued for a plain transcript is a real second job rather than a silent no-op.
  if (queue.some((job) => job.mediaId === request.mediaId && (job.kind ?? 'transcribe') === kind)) {
    // Already queued: not an error, just nothing new to do.
    return { ok: true, mediaId: request.mediaId };
  }

  queue.push({
    mediaId: item.id,
    title: item.title?.trim() || item.fileName,
    lang: request.lang?.trim() || 'ja',
    queuedAt: Date.now(),
    attempts: 0,
    ...(kind === 'transcribe' ? {} : { kind }),
    ...(request.sourceSubtitleId ? { sourceSubtitleId: request.sourceSubtitleId } : {}),
  });
  saveQueue();
  broadcast({
    mediaId: item.id,
    title: item.title?.trim() || item.fileName,
    phase: 'queued',
    done: 0,
    total: 0,
    startedAt: Date.now(),
  });
  void drain();
  return { ok: true, mediaId: item.id };
}

export function onMainTranscriptionProgress(
  listener: (progress: TranscriptionProgress) => void,
): () => void {
  progressListeners.add(listener);
  return () => progressListeners.delete(listener);
}

export function cancelTranscription(mediaId?: string): void {
  const targets = mediaId ? [mediaId] : queue.map((job) => job.mediaId);
  const queuedBeforeCancellation = [...queue];
  for (const id of targets) cancelled.add(id);

  // A job that has not started yet is simply dropped. The running one (always at
  // the head) is left in place so its loop can notice the flag and unwind
  // cleanly — yanking it here would leak the in-flight chunk request.
  const runningId = active > 0 ? queue[0]?.mediaId : undefined;
  queue = queue.filter((job, index) => {
    if (index === 0 && job.mediaId === runningId) return true;
    return !cancelled.has(job.mediaId);
  });
  const remainingIds = new Set(queue.map((job) => job.mediaId));
  const cancelledAt = Date.now();
  for (const job of queuedBeforeCancellation) {
    if (!targets.includes(job.mediaId) || remainingIds.has(job.mediaId)) continue;
    cancelled.delete(job.mediaId);
    broadcast({
      mediaId: job.mediaId,
      title: job.title,
      phase: 'cancelled',
      done: 0,
      total: 0,
      startedAt: cancelledAt,
    });
  }
  saveQueue();
  // Nothing left to come back for.
  if (queue.length === 0 && retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

export function transcriptionQueue(): TranscriptionJob[] {
  return [...queue];
}

/**
 * The provenance sidecar for one fused track, or `null` when there is none.
 *
 * `null` is the honest answer for four different situations and the caller does
 * not need to tell them apart: the media or the record is gone, the track was not
 * produced by fusion, the sidecar predates F6, or the file on disk is not one.
 * Every one of them means the same thing to a surface — show the track, show no
 * per-line provenance.
 */
export function readFusionTrackMeta(
  mediaId: string,
  subtitleId: string,
): FusionTrackMeta | null {
  if (!host || !mediaId || !subtitleId) return null;
  const item = host.listItems().find((entry) => entry.id === mediaId);
  const record = (item?.subtitles ?? []).find((entry) => entry.id === subtitleId);
  if (!record || record.derivation !== 'en-ja-fusion') return null;
  try {
    return parseFusionTrackMeta(
      fs.readFileSync(fusionMetaPathFor(subtitleFilePath(record)), 'utf-8'),
    );
  } catch {
    return null;
  }
}

export function registerTranscriptionIpc(transcriptionHost: TranscriptionHost): void {
  host = transcriptionHost;
  queue = loadQueue();

  ipcMain.handle('transcription:enqueue', (_e, request: TranscriptionRequest) =>
    enqueueTranscription(request ?? { mediaId: '' }));
  ipcMain.handle('transcription:cancel', (_e, mediaId?: string) => {
    cancelTranscription(typeof mediaId === 'string' ? mediaId : undefined);
  });
  ipcMain.handle('transcription:queue', () => transcriptionQueue());
  ipcMain.handle('transcription:fusionMeta', (_e, mediaId?: string, subtitleId?: string) =>
    readFusionTrackMeta(
      typeof mediaId === 'string' ? mediaId : '',
      typeof subtitleId === 'string' ? subtitleId : '',
    ));
  ipcMain.on('transcription:chunk-reply', (_e, payload: { id: string; ok: boolean; text?: string; error?: string }) => {
    if (payload && typeof payload.id === 'string') resolveTranscriptionChunk(payload.id, payload);
  });

  // Anything left from a previous run picks up where it stopped. Delayed so the
  // renderer has a window open to transcribe in; if it is not ready yet, the
  // drain loop reschedules itself rather than giving up for the session.
  if (queue.length > 0) scheduleDrain(5_000);
}

export const __transcriptionTestables = {
  chunksToSrt,
  timestamp,
  pickEnglishTrack,
  planNoWindowRetry,
  hasPendingRetry: (): boolean => retryTimer !== null,
};
