export const SUPERTONIC_VOICES = [
  'F1', 'F2', 'F3', 'F4', 'F5',
  'M1', 'M2', 'M3', 'M4', 'M5',
] as const;

export type SupertonicVoice = typeof SUPERTONIC_VOICES[number];

export interface SupertonicModelPaths {
  durationPredictor: string;
  textEncoder: string;
  vectorEstimator: string;
  vocoder: string;
  config: string;
  unicodeIndexer: string;
  voiceStyle: string;
}

/** Main sends paths, never model bytes; the worker writes directly to the managed library. */
export interface SupertonicSynthesisRequest {
  kind: 'synthesize';
  id: string;
  text: string;
  language: 'ja';
  voice: SupertonicVoice;
  outputPath: string;
  paths: SupertonicModelPaths;
  /** More diffusion steps improve fidelity at the cost of CPU time. */
  steps: number;
  speed: number;
}

export type SupertonicWorkerRequest = SupertonicSynthesisRequest;

export type SupertonicWorkerResponse =
  | { kind: 'ready' }
  | { kind: 'accepted'; id: string }
  | { kind: 'complete'; id: string; outputPath: string; durationSec: number; sampleRate: number }
  | { kind: 'error'; id: string; error: string };

export function supertonicVoiceFromId(id?: string): SupertonicVoice | null {
  const match = /^neural:supertonic-3:(F[1-5]|M[1-5])$/.exec(id ?? '');
  return match ? match[1] as SupertonicVoice : null;
}

export function supertonicVoiceId(voice: SupertonicVoice): string {
  return `neural:supertonic-3:${voice}`;
}
