import { describe, expect, it } from 'vitest';
import {
  WHISPER_CPU_PIPELINE_OPTIONS,
  WHISPER_GPU_PIPELINE_OPTIONS,
  whisperModelForCpu,
} from '../whisperRuntimeProfile';

describe('Whisper packaged runtime profiles', () => {
  it('uses standard fp32 operators on CPU', () => {
    expect(WHISPER_CPU_PIPELINE_OPTIONS).toEqual({ device: 'wasm', dtype: 'fp32' });
  });

  it('routes external-data Japanese and turbo encoders to the bounded CPU model', () => {
    expect(whisperModelForCpu('onnx-community/kotoba-whisper-v2.2-ONNX')).toBe('Xenova/whisper-base');
    expect(whisperModelForCpu('onnx-community/whisper-large-v3-turbo')).toBe('Xenova/whisper-base');
    expect(whisperModelForCpu('Xenova/whisper-small')).toBe('Xenova/whisper-small');
  });

  it('loads fp16 weights on WebGPU, never the q4 decoder that garbled Japanese', () => {
    expect(WHISPER_GPU_PIPELINE_OPTIONS).toEqual({
      device: 'webgpu',
      dtype: { encoder_model: 'fp16', decoder_model_merged: 'fp16' },
    });
  });
});
