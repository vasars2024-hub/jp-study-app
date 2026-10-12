/**
 * Whisper model tiers for Transformers.js (Phase 5b).
 * Runtime downloads ONNX weights via HF; the Phase 6 ggml registry entries
 * remain for a future whisper.cpp path and are not used by the worker yet.
 */

export type WhisperModelTier =
  | 'whisper-base'
  | 'whisper-small'
  | 'kotoba-whisper'
  | 'whisper-large-v3-turbo';

export interface WhisperModelSpec {
  id: WhisperModelTier;
  /** Hugging Face model id for @huggingface/transformers */
  hfId: string;
  /**
   * Approx download size for UI copy (bytes): the fp16 encoder plus the fp16
   * merged decoder that the default WebGPU path fetches (measured from the HF
   * file listings, 2026-10). The CPU path downloads fp32 weights instead.
   */
  sizeBytes: number;
  langs: Array<'ja' | 'zh' | 'ru' | 'any'>;
  /** Prefer this tier when study language matches. */
  preferFor?: Array<'ja' | 'zh' | 'ru'>;
}

export const WHISPER_MODEL_SPECS: WhisperModelSpec[] = [
  {
    id: 'whisper-base',
    hfId: 'Xenova/whisper-base',
    sizeBytes: 150_000_000,
    langs: ['any'],
  },
  {
    id: 'whisper-small',
    hfId: 'Xenova/whisper-small',
    sizeBytes: 490_000_000,
    langs: ['any'],
  },
  {
    // `onnx-community/kotoba-whisper-v2.0` — the id this used to carry — answers
    // 401 for every file, so the tier that `defaultWhisperTier('ja')` picks could
    // not be downloaded at all: Japanese transcription failed on a default install
    // with "Unauthorized access to file". `-v2.2-ONNX` is the published ONNX
    // conversion and serves the full encoder/decoder set (fp16, q4, quantized).
    id: 'kotoba-whisper',
    hfId: 'onnx-community/kotoba-whisper-v2.2-ONNX',
    sizeBytes: 1_500_000_000,
    langs: ['ja'],
    preferFor: ['ja'],
  },
  {
    id: 'whisper-large-v3-turbo',
    hfId: 'onnx-community/whisper-large-v3-turbo',
    sizeBytes: 1_600_000_000,
    langs: ['any'],
  },
];

export function whisperSpec(id: WhisperModelTier): WhisperModelSpec {
  return WHISPER_MODEL_SPECS.find((s) => s.id === id) ?? WHISPER_MODEL_SPECS[0];
}

export function defaultWhisperTier(lang: 'ja' | 'zh' | 'ru'): WhisperModelTier {
  if (lang === 'ja') return 'kotoba-whisper';
  return 'whisper-small';
}

export function isWhisperModelTier(v: unknown): v is WhisperModelTier {
  return WHISPER_MODEL_SPECS.some((s) => s.id === v);
}

/**
 * The chunk error a transcription reports when the audio's language needs a
 * multilingual model and none is installed. Main stops the job on it (every
 * slice would fail the same way) instead of writing an empty transcript.
 */
export const WHISPER_MULTILINGUAL_REQUIRED = 'multilingual-model-required';

/** Whether `tier`'s model can transcribe `lang` at all. */
export function whisperTierSupports(tier: WhisperModelTier, lang: 'ja' | 'zh' | 'ru'): boolean {
  const spec = whisperSpec(tier);
  return spec.langs.includes('any') || spec.langs.includes(lang);
}

/**
 * The tier to actually run for `lang`.
 *
 * The model choice in Settings is global, so a learner who picked
 * kotoba-whisper (trained on Japanese only) and then transcribed Chinese audio
 * had it fed to a model that cannot produce Chinese. A tier that cannot do the
 * language is swapped for a multilingual one — one that is already downloaded
 * first, so the swap does not start a 500 MB download inside a 30 s chunk.
 */
export function whisperTierForLang(
  tier: WhisperModelTier,
  lang: 'ja' | 'zh' | 'ru',
  isDownloaded: (candidate: WhisperModelTier) => boolean = () => false,
): WhisperModelTier {
  if (whisperTierSupports(tier, lang)) return tier;
  const candidates = [defaultWhisperTier(lang), 'whisper-small', 'whisper-large-v3-turbo', 'whisper-base']
    .filter((id, index, all): id is WhisperModelTier => (
      isWhisperModelTier(id) && all.indexOf(id) === index && whisperTierSupports(id, lang)
    ));
  return candidates.find(isDownloaded) ?? candidates[0] ?? tier;
}
