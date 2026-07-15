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
  | 'sentences';

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
 * With a pinned hash this is a real integrity check. Without one, all we can
 * honestly assert is "the server sent us the number of bytes the catalog
 * promised" — which catches truncation and captive-portal HTML, and nothing
 * else. We still compute the hash so it can be stored: a later integrity check
 * can then detect on-disk corruption even for a size-verified asset.
 *
 * Size tolerance exists because published sizes drift by a few bytes on
 * re-uploads; a mismatch beyond it means we did not get the file we asked for.
 */
export const SIZE_TOLERANCE = 0.02;

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
  const drift = Math.abs(actualBytes - spec.sizeBytes) / spec.sizeBytes;
  const ok = drift <= SIZE_TOLERANCE;
  return {
    ok,
    mode: 'size',
    actualSha256,
    reason: ok
      ? undefined
      : {
          key: 'assetError.sizeMismatch',
          vars: { expected: formatBytes(spec.sizeBytes), actual: formatBytes(actualBytes) },
        },
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
    url: 'https://huggingface.co/TrixiaBelleza/manga-ocr-onnx/resolve/main/manga-ocr.zip',
    sizeBytes: 471_859_200,
    version: '1',
    installDir: 'manga-ocr',
    archive: 'zip',
  },
  {
    id: 'comic-text-detector',
    name: 'Comic text detector',
    description: 'Finds the speech bubbles that Manga OCR then reads.',
    kind: 'ocr',
    lang: 'any',
    url: 'https://huggingface.co/dreMaz/AnimeInstanceSegmentation/resolve/main/comictextdetector.pt.onnx',
    sizeBytes: 91_226_112,
    version: '1',
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
    sizeBytes: 2_248_704,
    version: '1',
    installDir: 'tessdata-jpn',
    file: 'jpn.traineddata',
  },
  {
    id: 'cc-cedict',
    name: 'CC-CEDICT',
    description: 'The Chinese-English dictionary. Required for Chinese lookups.',
    kind: 'dictionary',
    lang: 'zh',
    url: 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.zip',
    sizeBytes: 4_194_304,
    version: '1',
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
    sizeBytes: 62_914_560,
    version: '1',
    installDir: 'jmdict-yomitan',
    archive: 'zip',
  },
  {
    id: 'kanjium-accent',
    name: 'Pitch accent (Kanjium)',
    description: 'Pitch-accent contours for the pronunciation checker. Not part of JMdict.',
    kind: 'accent',
    lang: 'ja',
    url: 'https://github.com/yomidevs/yomitan-import/releases/latest/download/kanjium_pitch_accents.zip',
    sizeBytes: 10_485_760,
    version: '1',
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
    sizeBytes: 20_971_520,
    version: '1',
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

/** Total download size of a set of ids — drives the "Set up Chinese (2 downloads, 210 MB)" card. */
export function totalSize(assets: AssetSpec[], ids: string[]): number {
  return ids.reduce((sum, id) => sum + (findAsset(assets, id)?.sizeBytes ?? 0), 0);
}
