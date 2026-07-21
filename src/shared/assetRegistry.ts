// Phase 6 — the single catalog of every heavy asset the app can download.
//
// Nothing big ships inside the installer. Models, dictionaries and index packs
// all land here first, get downloaded on demand into `userData/models/<id>/`,
// and every consumer is expected to check `isInstalled(id)` before using one.
// This module is pure (no electron, no fs) so the state machine and the
// pre-flight math can be unit-tested without booting the app.

export type AssetKind =
  | 'dictionary'
  | 'whisper'
  | 'ocr'
  | 'tessdata'
  | 'examples'
  | 'accent'
  | 'sentences'
  | 'llm';

/** Language an asset belongs to, or 'any' for language-neutral assets. */
export type AssetLang = 'ja' | 'zh' | 'any';

export interface AssetSpec {
  id: string;
  name: string;
  /** One-line description shown under the name in the Storage page. */
  description: string;
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

/** Human-readable size. Used by both the pre-flight warning and the Storage page. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value < 10 && unit >= 2 ? 1 : 0;
  return `${value.toFixed(digits)} ${units[unit]}`;
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
  /** The hash we actually computed — recorded on install so later integrity checks have a baseline. */
  actualSha256: string;
  reason?: AssetError;
}

/**
 * Decide whether a finished download is good.
 *
 * With a pinned hash this is a real integrity check. Without one, catalog
 * `sizeBytes` is only an estimate used for the Storage UI and disk pre-flight
 * — GitHub `latest` release zips and HuggingFace remuxes drift constantly, so
 * rejecting on a tight size match discarded otherwise-good installs. We still
 * compute the hash so it can be stored for later integrity checks.
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
    kind: 'whisper',
    lang: 'any',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
    sizeBytes: 1_533_763_059,
    version: '1',
    installDir: 'whisper-medium',
    file: 'ggml-medium.bin',
  },
  {
    id: 'manga-ocr',
    name: 'Manga OCR',
    description: 'Reads whole speech bubbles in one pass. Replaces Tesseract for manga.',
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
    kind: 'llm',
    lang: 'ja',
    url: 'https://huggingface.co/onnx-community/Tiny-LLM-ONNX/resolve/main/onnx/model_q4.onnx',
    sizeBytes: 28_912_263,
    version: '1',
    installDir: 'mirror-writing-evaluator',
    file: 'model_q4.onnx',
  },
  {
    id: 'comic-text-detector',
    name: 'Comic text detector',
    description: 'Finds the speech bubbles that Manga OCR then reads.',
    kind: 'ocr',
    lang: 'any',
    // dreMaz/AnimeInstanceSegmentation never hosted this file (404). Official
    // ONNX lives on the manga-image-translator release that first shipped it.
    url: 'https://github.com/zyddnys/manga-image-translator/releases/download/beta-0.2.1/comictextdetector.pt.onnx',
    sizeBytes: 94_669_756,
    version: '2',
    installDir: 'comic-text-detector',
    file: 'comictextdetector.onnx',
  },
  {
    id: 'tessdata-jpn',
    name: 'Tesseract Japanese',
    description: 'Fallback OCR for screenshots and non-manga images.',
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
    kind: 'dictionary',
    lang: 'zh',
    url: 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.zip',
    sizeBytes: 3_965_257,
    version: '2',
    installDir: 'cc-cedict',
    archive: 'zip',
  },
  {
    id: 'jmdict-yomitan',
    name: 'JMdict (Yomitan)',
    description: 'The Japanese-English dictionary pack used by the lookup popup.',
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

/** Assets a given study language needs before its features light up. */
export function assetsForLang(assets: AssetSpec[], lang: 'ja' | 'zh'): AssetSpec[] {
  return assets.filter((a) => a.lang === lang || a.lang === 'any');
}

/**
 * Starter setup set for the study-language environment card.
 * Excludes `lang: 'any'` whispers (downloaded on demand via Transformers.js).
 * JA: empty — Yomitan JMdict auto-provisions. ZH: CC-CEDICT.
 */
export function starterAssetIds(lang: 'ja' | 'zh'): string[] {
  if (lang === 'zh') return ['cc-cedict'];
  return [];
}

export function starterAssetsForLang(assets: AssetSpec[], lang: 'ja' | 'zh'): AssetSpec[] {
  const ids = new Set(starterAssetIds(lang));
  return assets.filter((a) => ids.has(a.id));
}

/** Total download size of a set of ids — drives the "Set up Chinese (N downloads, X MB)" card. */
export function totalSize(assets: AssetSpec[], ids: string[]): number {
  return ids.reduce((sum, id) => sum + (findAsset(assets, id)?.sizeBytes ?? 0), 0);
}
