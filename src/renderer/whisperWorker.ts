/// <reference lib="webworker" />
// Runs Whisper locally (Transformers.js) in a worker. The audio is transcribed
// in time-windows so the UI gets steady progress and subtitles appear as they
// are produced — instead of one long silent wait. WebGPU (fast, quantised) is
// used when available, falling back to WASM.
import { pipeline, env } from '@huggingface/transformers';
import { isStudyLang, WHISPER_LANGUAGE } from '../shared/studyLang';
import { commitWhisperWindow, whisperChunkCues, WHISPER_WINDOW_SEC } from '../shared/whisperWindowing';
import {
  WHISPER_CPU_PIPELINE_OPTIONS,
  WHISPER_GPU_PIPELINE_OPTIONS,
  whisperModelForCpu,
} from './whisperRuntimeProfile';

env.allowLocalModels = false;

// Serve the onnxruntime-web engine (the .wasm/.mjs runtime) from the app's own
// bundle instead of a CDN. Without this, Transformers.js fetches the engine from
// jsdelivr — which needs the network in dev and is blocked outright by the
// packaged app's CSP, surfacing as "Failed to fetch" before any model even
// downloads. The files in public/ort are byte-identical to the ort version this
// Transformers.js bundles, so the jsep (WebGPU) and wasm (CPU) backends match.
// `/ort/` resolves to http://127.0.0.1:5173/ort/ in dev and app://bundle/ort/
// when packaged (public/ is served at the origin root in both).
env.backends.onnx.wasm.wasmPaths = new URL('/ort/', self.location.href).href;

const post = (m: unknown): void => (self as unknown as { postMessage: (m: unknown) => void }).postMessage(m);

const SAMPLE_RATE = 16000;
/** Below this, a trailing scrap of audio is not worth a Whisper pass (it hallucinates on near-silence). */
const MIN_TAIL_SEC = 0.5;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let transcriber: any = null;
let loadedModel = '';
let effectiveModel = '';
let device = 'webgpu';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function load(model: string, prefer: 'auto' | 'cpu'): Promise<any> {
  // Re-load if the model OR the chosen device changed.
  const wantDevice = prefer === 'cpu' ? 'wasm' : 'webgpu';
  if (transcriber && loadedModel === model && device === wantDevice) return transcriber;
  transcriber = null;
  loadedModel = model;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const progress_callback = (p: any): void => post({ type: 'progress', ...p });

  // CPU/WASM path — used when the user forces it, or as a GPU fallback.
  // q4/int8/q8 use MatMulNBits, which this onnxruntime-web build cannot load.
  // fp32 is safe after `whisperModelForCpu` replaces models whose fp32 encoder
  // uses external ONNX data that the packaged browser runtime cannot mount.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loadWasm = async (): Promise<any> => {
    const cpuModel = whisperModelForCpu(model);
    if (cpuModel !== model) {
      post({ type: 'status', status: 'model-fallback', requestedModel: model, model: cpuModel, device: 'wasm' });
    }
    transcriber = await pipeline('automatic-speech-recognition', cpuModel, {
      ...WHISPER_CPU_PIPELINE_OPTIONS,
      progress_callback,
    });
    device = 'wasm';
    effectiveModel = cpuModel;
    return transcriber;
  };

  if (prefer === 'cpu') return loadWasm();

  // Chromium can expose `navigator.gpu` while still having no usable adapter (remote
  // desktop, disabled driver, or WebGPU flag off). Letting ONNX initialize WebGPU first
  // can leave its backend registry unable to recover to WASM in the same worker. Probe
  // before pipeline creation so CPU fallback remains clean and deterministic.
  const gpu = (navigator as Navigator & {
    gpu?: { requestAdapter: () => Promise<unknown | null> };
  }).gpu;
  if (!gpu) return loadWasm();
  try {
    if (!await gpu.requestAdapter()) return loadWasm();
  } catch {
    return loadWasm();
  }

  try {
    transcriber = await pipeline('automatic-speech-recognition', model, {
      ...WHISPER_GPU_PIPELINE_OPTIONS,
      progress_callback,
    });
    device = 'webgpu';
    effectiveModel = model;
    return transcriber;
  } catch {
    return loadWasm();
  }
}

self.onmessage = async (e: MessageEvent): Promise<void> => {
  const { audio, model, prefer, lang, mode } = e.data as {
    audio?: Float32Array;
    model: string;
    prefer?: 'auto' | 'cpu';
    lang?: 'ja' | 'zh' | 'ru';
    mode?: 'prefetch';
  };

  // Prefetch: load (and therefore download + cache) the model without any audio.
  // Used by the Settings "Transcription models" section so a user can download
  // ahead of time and see it reflected in the player's model dropdown.
  if (mode === 'prefetch') {
    try {
      await load(model, prefer ?? 'auto');
      post({ type: 'ready', device, model: effectiveModel, requestedModel: model });
    } catch (err) {
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  const whisperLang = WHISPER_LANGUAGE[isStudyLang(lang) ? lang : 'ja'];
  try {
    if (!audio) throw new Error('no audio provided');
    const t = await load(model, prefer ?? 'auto');
    post({ type: 'status', status: 'transcribing', device, model: effectiveModel, requestedModel: model });

    // Windows that overlap where it matters (`shared/whisperWindowing.ts`): a segment cut
    // by a window's edge is held back and the next window starts just before it, so it is
    // heard whole; a segment without an end time is closed at the next one's start rather
    // than dropped. Each window advances by at least half its length.
    const totalSec = audio.length / SAMPLE_RATE;
    let startSec = 0;
    let committedUntilSec = 0;
    while (startSec < totalSec) {
      if (startSec > 0 && totalSec - startSec < MIN_TAIL_SEC) break;
      const from = Math.floor(startSec * SAMPLE_RATE);
      const to = Math.min(audio.length, from + WHISPER_WINDOW_SEC * SAMPLE_RATE);
      const seg = audio.subarray(from, to);
      const windowStartSec = from / SAMPLE_RATE;
      const windowSec = seg.length / SAMPLE_RATE;
      const out = await t(seg, {
        language: whisperLang,
        task: 'transcribe',
        return_timestamps: true,
        chunk_length_s: 30,
        stride_length_s: 5,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw: any[] = Array.isArray(out?.chunks) ? out.chunks : [];
      const step = commitWhisperWindow({
        cues: whisperChunkCues(raw, windowSec),
        windowStartSec,
        windowSec,
        audioEndSec: totalSec,
        committedUntilSec,
      });
      committedUntilSec = step.committedUntilSec;
      post({ type: 'partial', cues: step.kept, progress: totalSec > 0 ? Math.min(1, step.nextStartSec / totalSec) : 1 });
      // Never stand still: a window that cannot advance ends the run instead of looping.
      if (step.nextStartSec <= startSec) break;
      startSec = step.nextStartSec;
    }
    post({ type: 'done' });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
