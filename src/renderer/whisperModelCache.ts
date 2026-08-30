// Tracks which Whisper transcription models the user has downloaded, so the
// Settings "Transcription models" section and the player's model dropdown agree
// on what is available offline.
//
// Transformers.js streams each model's files from HuggingFace on first use and
// stores them in the browser Cache Storage (`transformers-cache`). We record a
// tier as downloaded once its pipeline has loaded successfully at least once.
//
// The record is per *variant*, not just per tier: the GPU path downloads fp16/q4
// weights and the CPU path downloads fp32 ones, so a model downloaded on GPU is
// genuinely not present for CPU. Tracking only the tier made the "downloaded"
// tick lie after a GPU/CPU switch. Follows the get/set/subscribe shape of
// whisperSettings.ts so any open view stays in sync.

import { WHISPER_MODEL_SPECS, whisperSpec, type WhisperModelTier } from '../shared/whisperModels';
import { whisperHfId, type WhisperDevice } from './whisperSettings';

const DOWNLOADED_KEY = 'jp-study-whisper-downloaded';
const AUTO_DEVICE_KEY = 'jp-study-whisper-auto-device';
const DOWNLOADED_EVENT = 'whisper-downloaded-changed';
/** The Cache Storage bucket Transformers.js writes model files into. */
const TRANSFORMERS_CACHE = 'transformers-cache';

/** The runtime backend a download's weights belong to. */
export type WhisperVariant = 'webgpu' | 'wasm';

/** tier → the variants downloaded for it. */
export type DownloadedMap = Partial<Record<WhisperModelTier, WhisperVariant[]>>;

const asVariant = (v: unknown): WhisperVariant => (v === 'webgpu' ? 'webgpu' : 'wasm');

/** The tier whose artifacts the worker actually loaded after a CPU fallback. */
export function effectiveWhisperTier(
  requested: WhisperModelTier,
  workerModel: unknown,
): WhisperModelTier {
  if (typeof workerModel !== 'string') return requested;
  return WHISPER_MODEL_SPECS.find((spec) => spec.hfId === workerModel)?.id ?? requested;
}

export function loadDownloaded(): DownloadedMap {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(DOWNLOADED_KEY) ?? '{}');
    // An array is the pre-variant format. It can't say which backend it meant,
    // so treat it as nothing downloaded rather than risk a false tick — the
    // files are still cached, so re-downloading resolves near-instantly.
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const valid = new Set<string>(WHISPER_MODEL_SPECS.map((s) => s.id));
    const map: DownloadedMap = {};
    for (const [tier, variants] of Object.entries(raw as Record<string, unknown>)) {
      if (!valid.has(tier) || !Array.isArray(variants)) continue;
      map[tier as WhisperModelTier] = [...new Set(variants.map(asVariant))];
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * What `auto` actually resolved to on this machine, learned from the first load
 * that ran under it. Falls back to a capability guess until then — `navigator.gpu`
 * missing means the worker is certain to fall back to wasm.
 */
function autoVariant(): WhisperVariant {
  try {
    const remembered = localStorage.getItem(AUTO_DEVICE_KEY);
    if (remembered === 'webgpu' || remembered === 'wasm') return remembered;
  } catch {
    /* fall through to the capability guess */
  }
  return typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'wasm';
}

/** The variant a given device preference will actually load. */
export function variantForDevice(device: WhisperDevice): WhisperVariant {
  return device === 'cpu' ? 'wasm' : autoVariant();
}

/** Whether `tier` is downloaded for the backend `device` will use. */
export function isDownloadedIn(
  map: DownloadedMap,
  tier: WhisperModelTier,
  device: WhisperDevice,
): boolean {
  return (map[tier] ?? []).includes(variantForDevice(device));
}

function persist(map: DownloadedMap): void {
  try {
    localStorage.setItem(DOWNLOADED_KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable — the record just won't persist */
  }
  window.dispatchEvent(new CustomEvent<DownloadedMap>(DOWNLOADED_EVENT, { detail: map }));
}

/**
 * Record a completed download. `actual` is the backend the worker really loaded
 * (it may fall back to wasm when WebGPU is unavailable); `requested` is the
 * preference that produced it, which is how we learn what `auto` means here.
 */
export function markTierDownloaded(
  tier: WhisperModelTier,
  actual: WhisperVariant,
  requested?: WhisperDevice,
): void {
  if (requested === 'auto') {
    try {
      localStorage.setItem(AUTO_DEVICE_KEY, actual);
    } catch {
      /* ignore */
    }
  }
  const map = loadDownloaded();
  const variants = map[tier] ?? [];
  if (variants.includes(actual)) return;
  persist({ ...map, [tier]: [...variants, actual] });
}

/** Forget every variant of a tier. */
export function unmarkTierDownloaded(tier: WhisperModelTier): void {
  const map = loadDownloaded();
  if (!map[tier]) return;
  const next = { ...map };
  delete next[tier];
  persist(next);
}

/** Subscribe to changes in the downloaded record. Returns an unsubscribe fn. */
export function onDownloadedChanged(cb: (map: DownloadedMap) => void): () => void {
  const handler = (e: Event): void => cb((e as CustomEvent<DownloadedMap>).detail);
  window.addEventListener(DOWNLOADED_EVENT, handler);
  return () => window.removeEventListener(DOWNLOADED_EVENT, handler);
}

/**
 * Delete a tier's cached model files and forget that it was downloaded. The
 * cache keys are request URLs under the model's HuggingFace id, so we drop every
 * entry whose URL contains that id — which covers all of its variants.
 */
export async function removeWhisperModel(tier: WhisperModelTier): Promise<void> {
  const hfId = whisperHfId(tier);
  try {
    if (typeof caches !== 'undefined') {
      const cache = await caches.open(TRANSFORMERS_CACHE);
      const keys = await cache.keys();
      await Promise.all(
        keys.filter((req) => req.url.includes(hfId)).map((req) => cache.delete(req)),
      );
    }
  } catch {
    /* cache API unavailable or blocked — still clear the record below */
  }
  unmarkTierDownloaded(tier);
}

export interface PrefetchHandle {
  /** Resolves when the model has fully downloaded and loaded. */
  done: Promise<void>;
  /** Abort the in-flight download. */
  cancel(): void;
}

/**
 * Download and load a model ahead of time. `onProgress` reports 0..100 (the
 * percentage of the file currently downloading). Marks the tier downloaded for
 * whichever backend actually loaded.
 */
export function prefetchWhisperModel(
  tier: WhisperModelTier,
  device: WhisperDevice,
  onProgress?: (percent: number) => void,
): PrefetchHandle {
  const worker = new Worker(new URL('./whisperWorker.ts', import.meta.url), { type: 'module' });
  let settled = false;

  const done = new Promise<void>((resolve, reject) => {
    worker.onmessage = (ev: MessageEvent) => {
      const m = ev.data;
      if (m.type === 'progress' && m.status === 'progress' && typeof m.progress === 'number') {
        onProgress?.(Math.round(m.progress));
      } else if (m.type === 'ready') {
        settled = true;
        markTierDownloaded(effectiveWhisperTier(tier, m.model), asVariant(m.device), device);
        worker.terminate();
        resolve();
      } else if (m.type === 'error') {
        settled = true;
        worker.terminate();
        reject(new Error(typeof m.message === 'string' ? m.message : 'Download failed.'));
      }
    };
    worker.onerror = (err) => {
      settled = true;
      worker.terminate();
      reject(new Error(err.message || 'Download failed.'));
    };
    worker.postMessage({ mode: 'prefetch', model: whisperSpec(tier).hfId, prefer: device });
  });

  return {
    done,
    cancel() {
      if (settled) return;
      settled = true;
      worker.terminate();
    },
  };
}
