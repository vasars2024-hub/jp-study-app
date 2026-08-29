// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadVoicePreferences,
  preferredVoiceFor,
  saveVoicePreference,
} from '../flashcardVoicePreference';

beforeEach(() => {
  localStorage.clear();
});

describe('the saved card voice', () => {
  it('starts unset, so the operating system chooses as it always did', () => {
    expect(loadVoicePreferences()).toEqual({});
    expect(preferredVoiceFor('ja')).toBeUndefined();
  });

  it('round-trips per language and is keyed by the primary subtag', () => {
    saveVoicePreference('ja-JP', 'Microsoft Haruka Desktop');
    saveVoicePreference('zh', 'Microsoft Huihui Desktop');

    expect(preferredVoiceFor('ja')).toBe('Microsoft Haruka Desktop');
    expect(preferredVoiceFor('ja-JP')).toBe('Microsoft Haruka Desktop');
    expect(preferredVoiceFor('zh-CN')).toBe('Microsoft Huihui Desktop');
  });

  it('can be un-chosen, not only swapped', () => {
    // The reverse path the "System default" option needs; without it a voice
    // could never be cleared once picked.
    saveVoicePreference('ja', 'Microsoft Haruka Desktop');
    saveVoicePreference('ja', '');

    expect(preferredVoiceFor('ja')).toBeUndefined();
    expect(loadVoicePreferences()).toEqual({});
  });

  it('announces the change so an open picker does not go stale', () => {
    const seen: unknown[] = [];
    const handler = (event: Event): void => seen.push((event as CustomEvent).detail);
    window.addEventListener('flashcard-voice-preference', handler);
    saveVoicePreference('ja', 'Microsoft Haruka Desktop');
    window.removeEventListener('flashcard-voice-preference', handler);

    expect(seen).toEqual([{ ja: 'Microsoft Haruka Desktop' }]);
  });

  it('degrades to the system default when the store is unreadable', () => {
    localStorage.setItem('jp-flashcard-voice-v1', '{ not json');
    expect(loadVoicePreferences()).toEqual({});
  });
});
