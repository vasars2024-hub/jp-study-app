/**
 * Turns an uploaded Chrome-extension tab recording into a library item — the
 * same pipeline the desktop Region Recorder runs (regionRecorder.ts runJob):
 * WebM → MP4 through `finalizeRecording` (ffmpeg), `ingestMediaPaths(…,
 * 'recording')`, then the Whisper queue in the study language.
 *
 * Tab-audio-only recordings have no video stream, which `finalizeRecording`
 * refuses by design, so their WebM is ingested as it is.
 *
 * Registered by `installExtensionRecordingFinalizer()`; without it the upload
 * still lands as a WebM in the recordings folder (extensionRecordings.ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import { setRecordingFinalizer, type RecordingFinalizeOptions, type RecordingFinalizeResult } from './extensionRecordings';
import { finalizeRecording, probeRecording } from './recordingFinalize';
import { ingestMediaPaths } from './mediaIngest';
import { enqueueTranscription } from './transcriptionJobs';
import { getMainStudyLang } from './studyLanguage';

function uniqueSibling(file: string, ext: string): string {
  const dir = path.dirname(file);
  const base = path.basename(file, path.extname(file));
  let candidate = path.join(dir, `${base}${ext}`);
  for (let i = 2; fs.existsSync(candidate) && i < 1000; i++) candidate = path.join(dir, `${base} (${i})${ext}`);
  return candidate;
}

export async function finalizeExtensionRecording(
  filePath: string,
  opts: RecordingFinalizeOptions,
): Promise<RecordingFinalizeResult> {
  const probe = await probeRecording(filePath);
  let finalPath = filePath;
  if (probe.hasVideo) {
    const output = uniqueSibling(filePath, '.mp4');
    const result = await finalizeRecording({
      input: filePath,
      output,
      // The extension already cropped in the offscreen document.
      crop: null,
      quality: 'standard',
      durationHintSec: opts.durationMs && opts.durationMs > 0 ? opts.durationMs / 1000 : undefined,
    }).done;
    if (!result.ok) return { ok: false, path: filePath, error: result.error };
    finalPath = result.output;
    try {
      fs.rmSync(filePath, { force: true });
    } catch {
      /* the WebM is only a leftover now */
    }
  }
  let mediaId: string | undefined;
  try {
    const added = await ingestMediaPaths([finalPath], { title: opts.title || undefined }, 'recording');
    mediaId = added[0]?.id;
  } catch {
    mediaId = undefined;
  }
  if (!mediaId) return { ok: true, path: finalPath, error: 'import' };
  if (opts.transcribe !== false && (probe.hasAudio || !probe.ok)) {
    enqueueTranscription({ mediaId, lang: getMainStudyLang() });
  }
  return { ok: true, mediaId, path: finalPath };
}

export function installExtensionRecordingFinalizer(): void {
  setRecordingFinalizer(finalizeExtensionRecording);
}
