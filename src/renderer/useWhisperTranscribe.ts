// Reusable renderer-side Whisper transcription driver.
//
// This is the "existing Whisper path" the plan's audio-transcribe-and-mine tool
// reuses (BLANC_REFINEMENT_PLAN.md, study-native item 6): extract a file's audio
// to PCM via the `media:extractAudio` IPC, then run it through the same
// `whisperWorker.ts` the media player uses, marking the model tier downloaded
// through the shared `whisperModelCache` so the Settings "Transcription models"
// section and this tool agree on what is present offline.
//
// The hook is deliberately English-free: it exposes structured state
// (`state`, `progress`, `device`, `download`) and lets the consumer format its
// own copy, so a future i18n caller (or the media player, should it adopt this)
// is not forced through Blanc's plain-English string policy.
import { useCallback, useEffect, useRef, useState } from 'react';
import { effectiveWhisperTier, markTierDownloaded, type WhisperVariant } from './whisperModelCache';
import { whisperHfId, type WhisperDevice, type WhisperModelTier } from './whisperSettings';

export type TranscribeState =
  | 'idle'
  | 'extracting'
  | 'loading'
  | 'transcribing'
  | 'done'
  | 'error';

export interface TranscribeCue {
  start: number;
  end: number;
  text: string;
}

export interface TranscribeRunOptions {
  tier: WhisperModelTier;
  device: WhisperDevice;
  lang: 'ja' | 'zh';
}

/** Model-download progress, non-null only while a tier's files are streaming in. */
export interface TranscribeDownload {
  file: string;
  percent: number;
}

export interface WhisperTranscription {
  state: TranscribeState;
  /** 0..1 across the audio during transcription. */
  progress: number;
  /** The backend that actually loaded (may fall back to wasm), once known. */
  device: WhisperVariant | null;
  /** Non-null while the model is downloading on first use. */
  download: TranscribeDownload | null;
  /** Cues accumulate as each time-window is transcribed. */
  cues: TranscribeCue[];
  error: string;
  /** Transcribe a media token URL (from `pickMedia` / `openMedia`). */
  run(url: string, opts: TranscribeRunOptions): void;
  /** Abort an in-flight run without clearing what was produced so far. */
  cancel(): void;
  /** Back to a clean slate. */
  reset(): void;
}

const asVariant = (device: unknown): WhisperVariant => (device === 'webgpu' ? 'webgpu' : 'wasm');

export function useWhisperTranscribe(): WhisperTranscription {
  const [state, setState] = useState<TranscribeState>('idle');
  const [progress, setProgress] = useState(0);
  const [device, setDevice] = useState<WhisperVariant | null>(null);
  const [download, setDownload] = useState<TranscribeDownload | null>(null);
  const [cues, setCues] = useState<TranscribeCue[]>([]);
  const [error, setError] = useState('');

  const workerRef = useRef<Worker | null>(null);
  // Monotonic id: a stale run (cancelled / superseded) must not push state after
  // a newer one has started, and must not resurrect a terminated worker.
  const runIdRef = useRef(0);

  const teardownWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  useEffect(() => () => teardownWorker(), [teardownWorker]);

  const reset = useCallback(() => {
    runIdRef.current += 1;
    teardownWorker();
    setState('idle');
    setProgress(0);
    setDevice(null);
    setDownload(null);
    setCues([]);
    setError('');
  }, [teardownWorker]);

  const cancel = useCallback(() => {
    runIdRef.current += 1;
    teardownWorker();
    setDownload(null);
    // Keep any cues already produced; only leave the "busy" states.
    setState((s) => (s === 'done' || s === 'error' ? s : 'idle'));
  }, [teardownWorker]);

  const run = useCallback(
    (url: string, opts: TranscribeRunOptions) => {
      const myRun = (runIdRef.current += 1);
      teardownWorker();
      setError('');
      setCues([]);
      setProgress(0);
      setDevice(null);
      setDownload(null);
      setState('extracting');

      void (async () => {
        let audio: Float32Array;
        try {
          const buf = await window.api.extractAudio(url);
          audio = new Float32Array(buf);
          if (audio.length === 0) throw new Error('No audio track found in this file.');
        } catch (e) {
          if (runIdRef.current !== myRun) return;
          setState('error');
          setError(e instanceof Error ? e.message : String(e));
          return;
        }
        if (runIdRef.current !== myRun) return;

        setState('loading');
        const worker = new Worker(new URL('./whisperWorker.ts', import.meta.url), {
          type: 'module',
        });
        workerRef.current = worker;

        worker.onmessage = (ev: MessageEvent) => {
          if (runIdRef.current !== myRun) return;
          const m = ev.data;
          if (m.type === 'progress' && m.status === 'progress' && typeof m.progress === 'number') {
            const file = typeof m.file === 'string' ? m.file.split('/').pop() ?? 'model' : 'model';
            setDownload({ file, percent: Math.round(m.progress) });
          } else if (m.type === 'status' && m.status === 'transcribing') {
            // The pipeline loaded, so this tier's files are now fully cached for
            // whichever backend actually won (auto can fall back to wasm).
            const variant = asVariant(m.device);
            markTierDownloaded(effectiveWhisperTier(opts.tier, m.model), variant, opts.device);
            setDevice(variant);
            setDownload(null);
            setState('transcribing');
          } else if (m.type === 'partial') {
            setCues((prev) => [...prev, ...((m.cues as TranscribeCue[]) ?? [])]);
            setProgress(typeof m.progress === 'number' ? m.progress : 0);
          } else if (m.type === 'done') {
            setState('done');
            setProgress(1);
            teardownWorker();
          } else if (m.type === 'error') {
            setState('error');
            setError(typeof m.message === 'string' ? m.message : 'Transcription failed.');
            teardownWorker();
          }
        };
        worker.onerror = (err) => {
          if (runIdRef.current !== myRun) return;
          setState('error');
          setError(err.message || 'The transcriber failed to start.');
          teardownWorker();
        };

        worker.postMessage(
          { audio, model: whisperHfId(opts.tier), prefer: opts.device, lang: opts.lang },
          [audio.buffer],
        );
      })();
    },
    [teardownWorker],
  );

  return { state, progress, device, download, cues, error, run, cancel, reset };
}
