import { describe, expect, it } from 'vitest';
import {
  SUPERTONIC_VOICES,
  supertonicVoiceFromId,
  supertonicVoiceId,
} from '../flashcardTtsProtocol';

describe('the persisted neural voice id', () => {
  it('round-trips every bundled voice style', () => {
    expect(SUPERTONIC_VOICES).toHaveLength(10);
    for (const voice of SUPERTONIC_VOICES) {
      expect(supertonicVoiceFromId(supertonicVoiceId(voice))).toBe(voice);
    }
  });

  it('refuses lookalike and unsupported ids', () => {
    expect(supertonicVoiceFromId('neural:supertonic-3:F6')).toBeNull();
    expect(supertonicVoiceFromId('system:supertonic-3:F1')).toBeNull();
    expect(supertonicVoiceFromId('')).toBeNull();
  });
});
