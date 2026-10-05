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
