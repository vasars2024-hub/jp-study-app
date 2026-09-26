// Phase 6 — the single catalog of every heavy asset the app can download.
//
// Nothing big ships inside the installer. Models, dictionaries and index packs
// all land here first, get downloaded on demand into `userData/models/<id>/`,
// and every consumer is expected to check `isInstalled(id)` before using one.
// This module is pure (no electron, no fs) so the state machine and the
// pre-flight math can be unit-tested without booting the app.

import type { StudyLang } from './levelScale';

export type AssetKind =
  | 'dictionary'
  | 'whisper'
  | 'tts'
  | 'ocr'
  | 'tessdata'
  | 'examples'
  | 'accent'
  | 'sentences'
  | 'llm';

/** Language an asset belongs to, or 'any' for language-neutral assets. */
export type AssetLang = 'ja' | 'zh' | 'ru' | 'any';

export interface AssetSpec {
  id: string;
  name: string;
  /** One-line description shown under the name in the Storage page. */
  description: string;
  /** Optional translated description key; `description` remains the registry fallback. */
  descriptionKey?: string;
  kind: AssetKind;
  lang: AssetLang;
  url: string;
  /**
   * Lowercase hex sha256 of the downloaded file (pre-extraction).
   *
   * Optional on purpose. A pinned hash is the strong guarantee and every asset
   * should end up with one — but a *wrong* pinned hash is worse than none: it
   * fails every install with "corrupt download" and the user cannot fix it.
   * So an asset whose upstream hash has not been confirmed omits this field and
   * installs under `verifyMode: 'size'` instead (see verifyAsset). Fill these in
   * — or better, serve them from the remote registry — as each URL is confirmed.
   */
  sha256?: string;
  sizeBytes: number;
  version: string;
  /** Directory name under `userData/models/`. */
  installDir: string;
  /** Zip archives are extracted into installDir; plain files are moved in as `file`. */
  archive?: 'zip';
  /** Filename to give a non-archive asset inside installDir. */
  file?: string;
  /** Assets that must be installed alongside this one (e.g. an ONNX tokenizer). */
  requires?: string[];
  /**
   * The dependencies exist only for this bundle, so cancelling/removing the
   * parent also reclaims them. Shared dependencies deliberately leave this off.
   */
  ownsRequires?: boolean;
}

/**
 * Download lifecycle. `verifying` covers both hashing and extraction — from the
 * user's point of view it is one "checking…" step they cannot cancel halfway.
 */
export type AssetState =
  | 'not-installed'
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'verifying'
  | 'installed'
  | 'failed';

/**
 * An error the main process can compose without knowing what language the UI
 * is currently in. `key` names a catalog entry (see `shared/i18n/catalogs.ts`,
 * `assetError.*`); `vars` are interpolated into it. The renderer is the only
 * place that ever calls `t()` on this — main just describes what happened.
 */
export interface AssetError {
  key: string;
  vars?: Record<string, string | number>;
}

export interface AssetStatus {
  id: string;
  state: AssetState;
  /** Bytes on disk for a partial (paused/downloading) or finished download. */
  receivedBytes: number;
  totalBytes: number;
  /** Bytes/sec, smoothed; 0 when not actively downloading. */
  bytesPerSecond: number;
  /** Version actually installed, which may lag the catalog after an update. */
  installedVersion?: string;
  error?: AssetError;
}

/** A registry that can be refreshed from the network without an app release. */
export interface AssetRegistry {
  /** Bumped when the shape changes; a remote registry with a newer schema is ignored. */
  schema: number;
  assets: AssetSpec[];
}

export const REGISTRY_SCHEMA = 1;

/**
 * Downloading writes a temp copy before the atomic rename, so a download needs
 * room for the payload twice over, plus a little slack for the extracted
 * archive. Deliberately conservative: refusing a download the user could
 * *just* have squeezed in is far kinder than dying at 97%.
 */
export const TEMP_OVERHEAD_FACTOR = 2.2;

export interface PreflightResult {
  ok: boolean;
  requiredBytes: number;
  freeBytes: number;
  shortfallBytes: number;
}

export function preflightDiskSpace(sizeBytes: number, freeBytes: number): PreflightResult {
  const requiredBytes = Math.ceil(sizeBytes * TEMP_OVERHEAD_FACTOR);
  const shortfallBytes = Math.max(0, requiredBytes - freeBytes);
  return { ok: shortfallBytes === 0, requiredBytes, freeBytes, shortfallBytes };
}

/**
 * The locale a size is written in: a BCP-47 tag for the number and the five unit
 * words B/KB/MB/GB/TB. Round-2 audit V12: a Russian UI read "1.7 GB" where it
 * should read "1,7 ГБ" — `toFixed` always writes a dot and the units were
 * hard-coded English.
 */
export interface ByteFormatLocale {
  tag: string;
  units: readonly string[];
}

const DEFAULT_BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * This module is shared with the main process, which has no UI language, so the
 * renderer registers a provider for the current one (see
 * `renderer/components/shell/localeFormat.ts`). Without a provider — main, tests —
 * the output is the historical English form, byte for byte.
 */
let byteLocaleProvider: (() => ByteFormatLocale | null) | null = null;

export function setByteFormatLocaleProvider(provider: (() => ByteFormatLocale | null) | null): void {
  byteLocaleProvider = provider;
}

/** Human-readable size. Used by both the pre-flight warning and the Storage page. */
export function formatBytes(bytes: number, locale?: ByteFormatLocale): string {
  const loc = locale ?? byteLocaleProvider?.() ?? null;
  const units = loc && loc.units.length === DEFAULT_BYTE_UNITS.length ? loc.units : DEFAULT_BYTE_UNITS;
  if (!Number.isFinite(bytes) || bytes <= 0) return `0 ${units[2]}`;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value < 10 && unit >= 2 ? 1 : 0;
  let text = value.toFixed(digits);
  if (loc) {
    try {
      text = new Intl.NumberFormat(loc.tag, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
        // "1000 KB", never "1,000 KB": the value is always < 1024.
        useGrouping: false,
      }).format(value);
    } catch {
      // An unknown tag keeps the plain form rather than throwing inside a render.
    }
  }
  return `${text} ${units[unit]}`;
}

// ----- state machine -----------------------------------------------------

const TRANSITIONS: Record<AssetState, AssetState[]> = {
  'not-installed': ['queued'],
  queued: ['downloading', 'not-installed', 'failed'],
  downloading: ['paused', 'verifying', 'failed', 'not-installed'],
  // Resuming goes back through the queue; cancelling drops the partial.
  paused: ['queued', 'not-installed', 'failed'],
  // Verification never rewinds to downloading — a bad hash is a failure, and
  // the partial is dropped so the retry starts clean.
  verifying: ['installed', 'failed'],
  installed: ['not-installed', 'queued'],
  failed: ['queued', 'not-installed'],
};

export function canTransition(from: AssetState, to: AssetState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** True when a partial download exists on disk that a resume can append to. */
export function isResumable(status: AssetStatus): boolean {
  return status.state === 'paused' && status.receivedBytes > 0;
}

export function isBusy(state: AssetState): boolean {
  return state === 'queued' || state === 'downloading' || state === 'verifying';
}

// ----- remote registry merge --------------------------------------------

function isValidSpec(value: unknown): value is AssetSpec {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  // A remote entry may pin a hash the bundled catalog lacks — that is the main
  // reason the registry is refreshable — but a malformed hash is rejected
  // outright rather than silently downgrading the asset to a size check.
  if (s.sha256 !== undefined && !(typeof s.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(s.sha256))) {
    return false;
  }
  return (
    typeof s.id === 'string' &&
    s.id.length > 0 &&
    // Guard the id: it becomes a directory name under userData/models.
    /^[a-z0-9][a-z0-9._-]*$/i.test(s.id) &&
    typeof s.name === 'string' &&
    typeof s.url === 'string' &&
    /^https:\/\//i.test(s.url) &&
    typeof s.sizeBytes === 'number' &&
    s.sizeBytes > 0 &&
    typeof s.version === 'string' &&
    typeof s.installDir === 'string' &&
    /^[a-z0-9][a-z0-9._-]*$/i.test(s.installDir)
  );
}

// ----- verification ------------------------------------------------------

export type VerifyMode = 'sha256' | 'size';

export interface VerifyOutcome {
  ok: boolean;
  mode: VerifyMode;
  /**
   * The hash we actually computed.
   *
   * `recordInstall` persists it (`main/downloads.ts:587`) — but **nothing reads
   * it back**, so today it is write-only (audit T6, 2026-08-04). The claim that
   * it gives "later integrity checks a baseline" was aspirational; there is no
   * later integrity check in the tree. Left recorded because it is the thing a
   * re-verification pass would need, but do not cite it as a guarantee.
   */
  actualSha256: string;
  reason?: AssetError;
}

/**
 * Decide whether a finished download is good.
 *
 * With a pinned hash this is a real integrity check. Without one, catalog
 * `sizeBytes` is only an estimate used for the Storage UI and disk pre-flight
 * — GitHub `latest` release zips and HuggingFace remuxes drift constantly, so
 * rejecting on a tight size match discarded otherwise-good installs.
 *
 * **Measured 2026-08-04 (audit T6): 21 of 21 shipped assets omit `sha256`**, so
 * every real install today takes the `'size'` branch and the strong path is
 * exercised only by fixtures in `__tests__/assetRegistry.test.ts` (4 pinned).
 * That is a coverage fact, not a bug in this function — but it means "verified"
 * in the Storage UI currently means "plausible size", and
 * `assetPinCoverage()` below exists so the number cannot drift unnoticed again.
 * Pinning needs each URL downloaded and its hash confirmed upstream; a *wrong*
 * pin fails every install unrecoverably, which is why the field stays optional.
 *
 * Truncation guard: empty payloads and tiny bodies (captive-portal HTML) when
 * the catalog expects a large artifact are still rejected.
 */
export const SIZE_TOLERANCE = 0.02;
/** Absolute floor — below this, a "large" download is almost certainly an HTML error page. */
export const SIZE_TRUNCATION_ABS = 8_192;
/** Catalog sizes above this must clear SIZE_TRUNCATION_ABS or we treat them as truncated. */
export const SIZE_LARGE_BYTES = 100_000;

export function verifyAsset(
  spec: AssetSpec,
  actualSha256: string,
  actualBytes: number,
): VerifyOutcome {
  if (spec.sha256) {
    const ok = spec.sha256.toLowerCase() === actualSha256.toLowerCase();
    return {
      ok,
      mode: 'sha256',
      actualSha256,
      reason: ok ? undefined : { key: 'assetError.checksumMismatch' },
    };
  }
  // Unpinned: accept any non-empty real payload. Catalog sizes for floating
  // URLs (GitHub latest, Tatoeba exports) swing by tens of MB across releases;
  // a ratio check would discard good installs. Only reject empty / HTML-sized
  // bodies when we were expecting something large.
  const truncated =
    actualBytes <= 0 || (spec.sizeBytes >= SIZE_LARGE_BYTES && actualBytes < SIZE_TRUNCATION_ABS);
  return {
    ok: !truncated,
    mode: 'size',
    actualSha256,
    reason: truncated
      ? {
          key: 'assetError.sizeMismatch',
          vars: { expected: formatBytes(spec.sizeBytes), actual: formatBytes(actualBytes) },
        }
      : undefined,
  };
}

/**
 * Overlay a fetched registry on top of the bundled one. Remote entries win by
 * id (that is the whole point — URLs rotate and hashes change without an app
 * release), but anything malformed is dropped rather than trusted, and a
 * registry from a future schema is ignored wholesale.
 */
export function mergeRegistry(bundled: AssetSpec[], remote: unknown): AssetSpec[] {
  const r = remote as Partial<AssetRegistry> | null | undefined;
  if (!r || typeof r !== 'object' || !Array.isArray(r.assets)) return bundled;
  if (typeof r.schema !== 'number' || r.schema !== REGISTRY_SCHEMA) return bundled;

  const merged = new Map(bundled.map((a) => [a.id, a]));
  for (const entry of r.assets) {
    if (!isValidSpec(entry)) continue;
    merged.set(entry.id, entry);
  }
  return [...merged.values()];
}

// ----- the catalog -------------------------------------------------------

/**
 * Sizes are the published artifact sizes; hashes are verified on install. When
 * an upstream URL rotates, ship a new registry JSON rather than a new build.
 */
export const ASSET_CATALOG: AssetSpec[] = [
  {
    id: 'whisper-tiny',
    name: 'Whisper Tiny',
    description: 'Fastest transcription, lowest accuracy. Good for a first test.',
    descriptionKey: 'storage.asset.whisperTiny.desc',
    kind: 'whisper',
    lang: 'any',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
    sizeBytes: 77_691_713,
    version: '1',
    installDir: 'whisper-tiny',
    file: 'ggml-tiny.bin',
  },
  {
    id: 'whisper-base',
    name: 'Whisper Base',
    description: 'Balanced speed and accuracy. The recommended starting model.',
    descriptionKey: 'storage.asset.whisperBase.desc',
    kind: 'whisper',
    lang: 'any',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
    sizeBytes: 147_951_465,
    version: '1',
    installDir: 'whisper-base',
    file: 'ggml-base.bin',
  },
  {
    id: 'whisper-small',
    name: 'Whisper Small',
    description: 'Noticeably better Japanese, roughly 3x slower than Base.',
    descriptionKey: 'storage.asset.whisperSmall.desc',
    kind: 'whisper',
    lang: 'any',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
    sizeBytes: 487_601_967,
    version: '1',
    installDir: 'whisper-small',
    file: 'ggml-small.bin',
  },
  {
    id: 'whisper-medium',
    name: 'Whisper Medium',
    description: 'High accuracy for dense audio. Needs a capable GPU to stay usable.',
    descriptionKey: 'storage.asset.whisperMedium.desc',
    kind: 'whisper',
    lang: 'any',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
    sizeBytes: 1_533_763_059,
    version: '1',
    installDir: 'whisper-medium',
    file: 'ggml-medium.bin',
  },
  {
    id: 'supertonic-3',
    name: 'Supertonic 3',
    description: 'High-quality offline Japanese speech with ten local voice styles.',
    descriptionKey: 'storage.asset.supertonic3.desc',
    kind: 'tts',
    lang: 'ja',
    // Immutable upstream revision, verified byte-for-byte on 2026-08-29. The
    // official Node reference uses these same ONNX graphs with onnxruntime-node.
    url: 'https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/onnx/vector_estimator.onnx',
    sizeBytes: 256_534_781,
    sha256: '883ac868ea0275ef0e991524dc64f16b3c0376efd7c320af6b53f5b780d7c61c',
    version: '3cadd1e',
    installDir: 'supertonic-3-vector',
    file: 'vector_estimator.onnx',
    requires: [
      'supertonic-3-duration',
      'supertonic-3-text',
      'supertonic-3-vocoder',
      'supertonic-3-config',
      'supertonic-3-indexer',
      'supertonic-3-voice-f1',
      'supertonic-3-voice-f2',
      'supertonic-3-voice-f3',
      'supertonic-3-voice-f4',
      'supertonic-3-voice-f5',
      'supertonic-3-voice-m1',
      'supertonic-3-voice-m2',
      'supertonic-3-voice-m3',
      'supertonic-3-voice-m4',
      'supertonic-3-voice-m5',
    ],
    ownsRequires: true,
  },
  {
    id: 'supertonic-3-duration',
    name: 'Supertonic 3 duration graph',
    description: 'Installed automatically with Supertonic 3.',
    descriptionKey: 'storage.asset.supertonic3Part.desc',
    kind: 'tts',
    lang: 'ja',
    url: 'https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/onnx/duration_predictor.onnx',
    sizeBytes: 3_700_147,
    sha256: 'c3eb91414d5ff8a7a239b7fe9e34e7e2bf8a8140d8375ffb14718b1c639325db',
    version: '3cadd1e',
    installDir: 'supertonic-3-duration',
    file: 'duration_predictor.onnx',
  },
  {
    id: 'supertonic-3-text',
    name: 'Supertonic 3 text graph',
    description: 'Installed automatically with Supertonic 3.',
    descriptionKey: 'storage.asset.supertonic3Part.desc',
    kind: 'tts',
    lang: 'ja',
    url: 'https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/onnx/text_encoder.onnx',
    sizeBytes: 36_416_150,
    sha256: 'c7befd5ea8c3119769e8a6c1486c4edc6a3bc8365c67621c881bbb774b9902ff',
    version: '3cadd1e',
    installDir: 'supertonic-3-text',
    file: 'text_encoder.onnx',
  },
  {
    id: 'supertonic-3-vocoder',
    name: 'Supertonic 3 vocoder',
    description: 'Installed automatically with Supertonic 3.',
    descriptionKey: 'storage.asset.supertonic3Part.desc',
    kind: 'tts',
    lang: 'ja',
    url: 'https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/onnx/vocoder.onnx',
    sizeBytes: 101_424_195,
    sha256: '085de76dd8e8d5836d6ca66826601f615939218f90e519f70ee8a36ed2a4c4ba',
    version: '3cadd1e',
    installDir: 'supertonic-3-vocoder',
    file: 'vocoder.onnx',
  },
  {
    id: 'supertonic-3-config',
    name: 'Supertonic 3 configuration',
    description: 'Installed automatically with Supertonic 3.',
    descriptionKey: 'storage.asset.supertonic3Part.desc',
    kind: 'tts',
    lang: 'ja',
    url: 'https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/onnx/tts.json',
    sizeBytes: 8_253,
    sha256: '42078d3aef1cd43ab43021f3c54f47d2d75ceb4e75f627f118890128b06a0d09',
    version: '3cadd1e',
    installDir: 'supertonic-3-config',
    file: 'tts.json',
  },
  {
    id: 'supertonic-3-indexer',
    name: 'Supertonic 3 Unicode indexer',
    description: 'Installed automatically with Supertonic 3.',
    descriptionKey: 'storage.asset.supertonic3Part.desc',
    kind: 'tts',
    lang: 'ja',
    url: 'https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/onnx/unicode_indexer.json',
    sizeBytes: 277_676,
    sha256: '9bf7346e43883a81f8645c81224f786d43c5b57f3641f6e7671a7d6c493cb24f',
    version: '3cadd1e',
    installDir: 'supertonic-3-indexer',
    file: 'unicode_indexer.json',
  },
  ...([
    ['f1', 292_046, 'bbdec6ee00231c2c742ad05483df5334cab3b52fda3ba38e6a07059c4563dbc2'],
    ['f2', 292_423, '7c722c6a72707b1a77f035d67f0d1351ba187738e06f7683e8c72b1df3477fc6'],
    ['f3', 290_794, '12f6ef2573baa2defa1128069cb59f203e3ab67c92af77b42df8a0e3a2f7c6ab'],
    ['f4', 291_808, 'c2fa764c1225a76dfc3e2c73e8aa4f70d9ee48793860eb34c295fff01c2e032b'],
    ['f5', 291_479, '45966e73316415626cf41a7d1c6f3b4c70dbc1ba2bee5c1978ef0ce33244fc8d'],
    ['m1', 291_748, 'e35604687f5d23694b8e91593a93eec0e4eca6c0b02bb8ed69139ab2ea6b0a5b'],
    ['m2', 292_055, 'b76cbf62bac707c710cf0ae5aba5e31eea1a6339a9734bfae33ab98499534a50'],
    ['m3', 290_198, 'ea1ac35ccb91b0d7ecad533a2fbd0eec10c91513d8951e3b25fbba99954e159b'],
    ['m4', 291_522, 'ca8eefad4fcd989c9379032ff3e50738adc547eeb5e221b82593a6d7b3bac303'],
    ['m5', 291_469, 'dd22b92740314321f8ae11c5e87f8dd60d060f15dd3a632b5adf77f471f77af2'],
  ] as const).map(([voice, sizeBytes, sha256]): AssetSpec => ({
    id: `supertonic-3-voice-${voice}`,
    name: `Supertonic 3 voice ${voice.toUpperCase()}`,
    description: 'Installed automatically with Supertonic 3.',
    descriptionKey: 'storage.asset.supertonic3Part.desc',
    kind: 'tts',
    lang: 'ja',
    url: `https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/voice_styles/${voice.toUpperCase()}.json`,
    sizeBytes,
    sha256,
    version: '3cadd1e',
    installDir: `supertonic-3-voice-${voice}`,
    file: `${voice.toUpperCase()}.json`,
  })),
  {
    id: 'manga-ocr',
    name: 'Manga OCR',
    description: 'Reads whole speech bubbles in one pass. Replaces Tesseract for manga.',
    descriptionKey: 'storage.asset.mangaOcr.desc',
    kind: 'ocr',
    lang: 'ja',
    // TrixiaBelleza/manga-ocr-onnx returned 401 (gated/removed). Public ONNX
    // export from mayocream — encoder is the bulk of the ~440 MB package.
    url: 'https://huggingface.co/mayocream/manga-ocr-onnx/resolve/main/encoder_model.onnx',
    sizeBytes: 343_454_249,
    version: '2',
    installDir: 'manga-ocr',
    file: 'encoder_model.onnx',
    requires: ['manga-ocr-decoder', 'manga-ocr-vocab'],
  },
  {
    id: 'manga-ocr-decoder',
    name: 'Manga OCR (decoder)',
    description: 'Decoder graph for Manga OCR. Downloaded automatically with Manga OCR.',
    descriptionKey: 'storage.asset.mangaOcrDecoder.desc',
    kind: 'ocr',
    lang: 'ja',
    url: 'https://huggingface.co/mayocream/manga-ocr-onnx/resolve/main/decoder_model.onnx',
    sizeBytes: 117_480_262,
    version: '2',
    installDir: 'manga-ocr-decoder',
    file: 'decoder_model.onnx',
  },
  {
    id: 'manga-ocr-vocab',
    name: 'Manga OCR (vocab)',
    description: 'Tokenizer vocabulary for Manga OCR. Downloaded automatically with Manga OCR.',
    descriptionKey: 'storage.asset.mangaOcrVocab.desc',
    kind: 'ocr',
    lang: 'ja',
    url: 'https://huggingface.co/mayocream/manga-ocr-onnx/resolve/main/vocab.txt',
    sizeBytes: 30_216,
    version: '2',
    installDir: 'manga-ocr-vocab',
    file: 'vocab.txt',
  },
  {
    id: 'mirror-writing-evaluator',
    name: 'Mirror Writing evaluator',
    description: 'Small local LLM artifact reserved for offline Japanese writing evaluation.',
    descriptionKey: 'storage.asset.writingEvaluator.desc',
    kind: 'llm',
    lang: 'ja',
    url: 'https://huggingface.co/onnx-community/Tiny-LLM-ONNX/resolve/main/onnx/model_q4.onnx',
    sizeBytes: 28_912_263,
    version: '1',
    installDir: 'mirror-writing-evaluator',
    file: 'model_q4.onnx',
  },
  {
    id: 'qwen3-1.7b',
    name: 'Qwen3 1.7B',
    description: 'The offline AI model: translation, AI cards, sentence analysis and the Agent without a cloud key.',
    descriptionKey: 'storage.asset.qwen3.desc',
    kind: 'llm',
    lang: 'any',
    // Qwen's own GGUF release (Apache-2.0), pinned to an immutable revision of
    // https://huggingface.co/Qwen/Qwen3-1.7B-GGUF. Size and sha256 are the LFS
    // object the repository API reports for that revision (read 2026-09-24),
    // so the checksum is a real integrity check, not a guess. Q8_0 is the only
    // quantisation Qwen publishes for 1.7B. The file name is one the shared
    // model locator (`QWEN3_1_7B_FILE_NAMES`) knows, and `installDir` is the
    // folder it searches — `DEFAULT_LOCAL_MODEL_ASSET_ID` names both.
    url: 'https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/90862c4b9d2787eaed51d12237eafdfe7c5f6077/Qwen3-1.7B-Q8_0.gguf',
    sizeBytes: 1_834_426_016,
    sha256: '061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a',
    version: '90862c4',
    installDir: 'qwen3-1.7b',
    file: 'Qwen3-1.7B-Q8_0.gguf',
  },
  {
    id: 'comic-text-detector',
    name: 'Comic text detector',
    description: 'Finds the speech bubbles that Manga OCR then reads.',
    descriptionKey: 'storage.asset.comicTextDetector.desc',
    kind: 'ocr',
    lang: 'any',
    // dreMaz/AnimeInstanceSegmentation never hosted this file (404). Official
    // ONNX lives on the manga-image-translator release that first shipped it.
    url: 'https://github.com/zyddnys/manga-image-translator/releases/download/beta-0.2.1/comictextdetector.pt.onnx',
    sizeBytes: 94_669_756,
    /*
     * The ONE pinned asset, and the only spec where a hard checksum failure is
     * the correct behaviour (audit T6).
     *
     * 20 of the 21 asset URLs are mutable — HuggingFace `/resolve/main/`, GitHub
     * `raw/main/` and `releases/latest/`, plus regenerated MDBG and Tatoeba
     * exports. Pinning those turns every legitimate upstream release into a
     * `checksumMismatch` on a good file, and it stays broken until someone
     * re-records the hash and ships a build — a recurring tax that ends with the
     * check being switched off. This URL is different: it names an immutable
     * release TAG (`beta-0.2.1`), so it will serve identical bytes forever.
     *
     * Recorded 2026-08-05 from three independent sources that agree:
     *   1. fresh download from the URL above — 94,669,756 bytes
     *   2. sha256 of the installed copy on disk
     *   3. the `sha256` already in the install record (`models/state.json`)
     * `verifyAsset` (:240-247) compares this on every download.
     */
    sha256: '1a86ace74961413cbd650002e7bb4dcec4980ffa21b2f19b86933372071d718f',
    version: '2',
    installDir: 'comic-text-detector',
    file: 'comictextdetector.onnx',
  },
  {
    id: 'tessdata-jpn',
    name: 'Tesseract Japanese',
    description: 'Fallback OCR for screenshots and non-manga images.',
    descriptionKey: 'storage.asset.tessdataJpn.desc',
    kind: 'tessdata',
    lang: 'ja',
    url: 'https://github.com/tesseract-ocr/tessdata_fast/raw/main/jpn.traineddata',
    sizeBytes: 2_471_260,
    version: '2',
    installDir: 'tessdata-jpn',
    file: 'jpn.traineddata',
  },
  // PP-OCR pack for the browser extension. manga-ocr reads manga bubbles well
  // but hallucinates confident nonsense on printed web text (news headlines,
  // video thumbnails), so pages that are not manga go through these instead.
  //
  // Detection is language-agnostic and shared; only the small recognition head
  // and its charset change per language, so a second language costs ~10 MB
  // rather than a second full engine. There is deliberately no angle
  // classifier: browser screenshots never contain upside-down text, and
  // vertical Japanese is handled by rotating tall boxes, which is geometry
  // rather than a model.
  {
    id: 'paddle-ocr-det',
    name: 'Web OCR (text detector)',
    description: 'Finds every line of text in a screenshot. Shared by all OCR languages.',
    descriptionKey: 'storage.asset.paddleOcrDet.desc',
    kind: 'ocr',
    lang: 'any',
    url: 'https://huggingface.co/deepghs/paddleocr/resolve/main/det/ch_PP-OCRv4_det/model.onnx',
    sizeBytes: 4_745_517,
    version: '1',
    installDir: 'paddle-ocr-det',
    file: 'model.onnx',
  },
  {
    id: 'paddle-ocr-ja',
    name: 'Web OCR — Japanese',
    description: 'Reads Japanese text on web pages and images, horizontal or vertical.',
    descriptionKey: 'storage.asset.paddleOcrJa.desc',
    kind: 'ocr',
    lang: 'ja',
    url: 'https://huggingface.co/deepghs/paddleocr/resolve/main/rec/japan_PP-OCRv3_rec/model.onnx',
    sizeBytes: 10_085_330,
    version: '1',
    installDir: 'paddle-ocr-ja',
    file: 'model.onnx',
    requires: ['paddle-ocr-det', 'paddle-ocr-ja-keys'],
  },
  {
    id: 'paddle-ocr-ja-keys',
    name: 'Web OCR — Japanese (charset)',
    description: 'Character set for Japanese web OCR. Downloaded automatically with it.',
    descriptionKey: 'storage.asset.paddleOcrJaKeys.desc',
    kind: 'ocr',
    lang: 'ja',
    url: 'https://huggingface.co/deepghs/paddleocr/resolve/main/rec/japan_PP-OCRv3_rec/dict.txt',
    sizeBytes: 17_332,
    version: '1',
    installDir: 'paddle-ocr-ja-keys',
    file: 'keys.txt',
  },
  {
    id: 'paddle-ocr-zh',
    name: 'Web OCR — Chinese',
    description: 'Reads Chinese text on web pages and images.',
    descriptionKey: 'storage.asset.paddleOcrZh.desc',
    kind: 'ocr',
    lang: 'zh',
    url: 'https://huggingface.co/deepghs/paddleocr/resolve/main/rec/ch_PP-OCRv4_rec/model.onnx',
    sizeBytes: 10_826_336,
    version: '1',
    installDir: 'paddle-ocr-zh',
    file: 'model.onnx',
    requires: ['paddle-ocr-det', 'paddle-ocr-zh-keys'],
  },
  {
    id: 'paddle-ocr-zh-keys',
    name: 'Web OCR — Chinese (charset)',
    description: 'Character set for Chinese web OCR. Downloaded automatically with it.',
    descriptionKey: 'storage.asset.paddleOcrZhKeys.desc',
    kind: 'ocr',
    lang: 'zh',
    url: 'https://huggingface.co/deepghs/paddleocr/resolve/main/rec/ch_PP-OCRv4_rec/dict.txt',
    sizeBytes: 26_249,
    version: '1',
    installDir: 'paddle-ocr-zh-keys',
    file: 'keys.txt',
  },
  {
    id: 'paddle-ocr-ru',
    name: 'Web OCR — Russian',
    description: 'Reads Russian and other Cyrillic text on web pages and images.',
    descriptionKey: 'storage.asset.paddleOcrRu.desc',
    kind: 'ocr',
    lang: 'any',
    url: 'https://huggingface.co/deepghs/paddleocr/resolve/main/rec/cyrillic_PP-OCRv3_rec/model.onnx',
    sizeBytes: 8_983_966,
    version: '1',
    installDir: 'paddle-ocr-ru',
    file: 'model.onnx',
    requires: ['paddle-ocr-det', 'paddle-ocr-ru-keys'],
  },
  {
    id: 'paddle-ocr-ru-keys',
    name: 'Web OCR — Russian (charset)',
    description: 'Character set for Russian web OCR. Downloaded automatically with it.',
    descriptionKey: 'storage.asset.paddleOcrRuKeys.desc',
    kind: 'ocr',
    lang: 'any',
    url: 'https://huggingface.co/deepghs/paddleocr/resolve/main/rec/cyrillic_PP-OCRv3_rec/dict.txt',
    sizeBytes: 410,
    version: '1',
    installDir: 'paddle-ocr-ru-keys',
    file: 'keys.txt',
  },
  {
    id: 'cc-cedict',
    name: 'CC-CEDICT',
    description: 'The Chinese-English dictionary. Required for Chinese lookups.',
    descriptionKey: 'storage.asset.ccCedict.desc',
    kind: 'dictionary',
    lang: 'zh',
    url: 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.zip',
    sizeBytes: 3_965_257,
    version: '2',
    installDir: 'cc-cedict',
    archive: 'zip',
  },
  {
    /*
     * The Russian starter dictionary: every Russian entry of the English
     * Wiktionary, as extracted by wiktextract and published by kaikki.org.
     * Licence: CC BY-SA 4.0 (and GFDL), the licence of Wiktionary's text —
     * attribution is written into the dictionary row by the importer
     * (WIKTEXTRACT_LICENCE / WIKTEXTRACT_ATTRIBUTION in importers/wiktextract.ts).
     *
     * It is the one freely licensed Russian source with what a learner needs
     * beyond glosses: `forms[]` carries the full declension/conjugation grid
     * (книги → книга resolves through the `inflections` table) and the
     * stress-marked canonical form (кни́га).
     *
     * Unpinned on purpose, the MDBG/Tatoeba convention: kaikki regenerates the
     * file weekly, so a pinned hash would fail every install after the next
     * rebuild. Size measured by HEAD on 2026-09-25 (89,235,839 bytes gzip,
     * 939,171,418 bytes uncompressed). The gzip is kept as downloaded; the
     * dictionary importer streams it into the database.
     */
    id: 'wiktionary-ru',
    name: 'Wiktionary Russian (kaikki.org)',
    description: 'The Russian-English dictionary, with inflected forms and stress marks. Required for Russian lookups.',
    descriptionKey: 'storage.asset.wiktionaryRu.desc',
    kind: 'dictionary',
    lang: 'ru',
    url: 'https://kaikki.org/dictionary/Russian/kaikki.org-dictionary-Russian.jsonl.gz',
    sizeBytes: 89_235_839,
    version: '1',
    installDir: 'wiktionary-ru',
    file: 'kaikki.org-dictionary-Russian.jsonl.gz',
  },
  {
    id: 'jmdict-yomitan',
    name: 'JMdict (Yomitan)',
    description: 'The Japanese-English dictionary pack used by the lookup popup.',
    descriptionKey: 'storage.asset.jmdictYomitan.desc',
    kind: 'dictionary',
    lang: 'ja',
    url: 'https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/JMdict_english.zip',
    sizeBytes: 15_487_771,
    version: '2',
    installDir: 'jmdict-yomitan',
    archive: 'zip',
  },
  {
    id: 'kanjium-accent',
    name: 'Pitch accent (Kanjium)',
    description: 'Pitch-accent contours for the pronunciation checker. Not part of JMdict.',
    descriptionKey: 'storage.asset.kanjiumAccent.desc',
    kind: 'accent',
    lang: 'ja',
    // yomitan-import latest no longer attaches this zip (404). Yomitan still
    // ships it on the dictionaries branch.
    url: 'https://github.com/yomidevs/yomitan/raw/dictionaries/kanjium_pitch_accents.zip',
    sizeBytes: 1_072_708,
    version: '2',
    installDir: 'kanjium-accent',
    archive: 'zip',
  },
  {
    id: 'tatoeba-ja',
    name: 'Tatoeba examples (JA)',
    description: 'Offline example sentences shown beside dictionary entries.',
    descriptionKey: 'storage.asset.tatoebaJa.desc',
    kind: 'examples',
    lang: 'ja',
    url: 'https://downloads.tatoeba.org/exports/per_language/jpn/jpn_sentences.tsv.bz2',
    sizeBytes: 3_415_765,
    version: '2',
    installDir: 'tatoeba-ja',
    file: 'jpn_sentences.tsv.bz2',
  },
];

export function findAsset(assets: AssetSpec[], id: string): AssetSpec | undefined {
  return assets.find((a) => a.id === id);
}

/** The root plus every transitive companion, in stable dependency-first order. */
export function assetDependencyClosure(assets: AssetSpec[], id: string): AssetSpec[] {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const seen = new Set<string>();
  const result: AssetSpec[] = [];
  const visit = (nextId: string): void => {
    if (seen.has(nextId)) return;
    seen.add(nextId);
    const asset = byId.get(nextId);
    if (!asset) return;
    for (const dependency of asset.requires ?? []) visit(dependency);
    result.push(asset);
  };
  visit(id);
  return result;
}

/** What one visible bundle costs, including the companion rows hidden in Storage. */
export function assetBundleSize(assets: AssetSpec[], id: string): number {
  return assetDependencyClosure(assets, id).reduce((sum, asset) => sum + asset.sizeBytes, 0);
}

/**
 * How many assets actually carry a pinned hash (audit T6).
 *
 * `sha256` is optional by design — see the field's comment — which means the
 * registry can drift to all-unpinned without anything failing, and did: **0 of
 * 21 pinned** when this was written. A count is the cheapest way to keep that
 * visible, and `assetRegistry.test.ts` asserts it never gets *worse*.
 */
export function assetPinCoverage(assets: AssetSpec[] = ASSET_CATALOG): {
  total: number;
  pinned: number;
  unpinned: string[];
} {
  const unpinned = assets.filter((a) => !a.sha256).map((a) => a.id);
  return { total: assets.length, pinned: assets.length - unpinned.length, unpinned };
}

/** Assets a given study language needs before its features light up. */
export function assetsForLang(assets: AssetSpec[], lang: StudyLang): AssetSpec[] {
  return assets.filter((a) => a.lang === lang || a.lang === 'any');
}

/**
 * Starter setup set for the study-language environment card.
 * Excludes `lang: 'any'` whispers (downloaded on demand via Transformers.js).
 * JA: empty — Yomitan JMdict auto-provisions. ZH: CC-CEDICT. RU: Wiktionary.
 */
export function starterAssetIds(lang: StudyLang): string[] {
  if (lang === 'zh') return ['cc-cedict'];
  if (lang === 'ru') return ['wiktionary-ru'];
  return [];
}

export function starterAssetsForLang(assets: AssetSpec[], lang: StudyLang): AssetSpec[] {
  const ids = new Set(starterAssetIds(lang));
  return assets.filter((a) => ids.has(a.id));
}

/** Total download size of a set of ids — drives the "Set up Chinese (N downloads, X MB)" card. */
export function totalSize(assets: AssetSpec[], ids: string[]): number {
  return ids.reduce((sum, id) => sum + (findAsset(assets, id)?.sizeBytes ?? 0), 0);
}
