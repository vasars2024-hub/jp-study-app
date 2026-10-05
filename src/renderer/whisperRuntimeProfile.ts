/**
 * Backend-specific model artifacts for the browser Whisper worker.
 *
 * These are deliberately explicit. A model cache entry is backend-specific,
 * and selecting a graph that the packaged runtime cannot deserialize turns a
 * completed download into a misleading transcription failure.
 */
export const WHISPER_CPU_PIPELINE_OPTIONS = {
  device: 'wasm',
  // fp32 avoids the MatMulNBits operator used by this runtime's q8/int8/q4
  // graphs. Large external-data encoders are routed to the bounded fallback
  // below before this profile is applied.
  dtype: 'fp32',
} as const;

export const WHISPER_CPU_FALLBACK_MODEL = 'Xenova/whisper-base';

/** Models whose fp32 encoder cannot be mounted by the packaged WASM runtime. */
export function whisperModelForCpu(requestedModel: string): string {
  return requestedModel.includes('kotoba-whisper') || requestedModel.includes('whisper-large-v3-turbo')
    ? WHISPER_CPU_FALLBACK_MODEL
    : requestedModel;
}

// fp16 throughout. The q4 decoder this used to load turned clear Japanese speech
// into fragments like 「て。」 on WebGPU while the same audio transcribed correctly
// on CPU, and it bought nothing: for every tier the q4 decoder is no smaller than
// the fp16 one, and fp16 is the GPU's native precision.
export const WHISPER_GPU_PIPELINE_OPTIONS = {
  device: 'webgpu',
  dtype: { encoder_model: 'fp16', decoder_model_merged: 'fp16' },
} as const;
