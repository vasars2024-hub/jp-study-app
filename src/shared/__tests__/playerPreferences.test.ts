import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLAYER_PREFERENCES,
  normalizePlayerPreferences,
} from '../playerPreferences';

describe('player preferences', () => {
  it('uses stable defaults for missing or invalid data', () => {
    expect(normalizePlayerPreferences(null)).toEqual(DEFAULT_PLAYER_PREFERENCES);
    expect(normalizePlayerPreferences({ subtitlePosition: 'side' }).subtitlePosition).toBe('center');
  });

  it('bounds playback rate and subtitle font size', () => {
    expect(normalizePlayerPreferences({ playbackRate: 9, subtitleFontSize: 4 })).toMatchObject({
      playbackRate: 3,
      subtitleFontSize: 16,
    });
  });

  it('defaults the video subtitle overlay on and bounds its background opacity', () => {
    expect(normalizePlayerPreferences(null)).toMatchObject({
      subtitleOverlay: true,
      subtitleOverlayBackground: 35,
    });
    expect(normalizePlayerPreferences({ subtitleOverlayBackground: 400 }).subtitleOverlayBackground).toBe(80);
    expect(normalizePlayerPreferences({ subtitleOverlayBackground: -5 }).subtitleOverlayBackground).toBe(0);
    expect(normalizePlayerPreferences({ subtitleOverlayBackground: 'x' }).subtitleOverlayBackground).toBe(35);
  });

  it('preserves an explicit overlay opt-out', () => {
    expect(normalizePlayerPreferences({
      subtitleOverlay: false,
      subtitleOverlayBackground: 60,
    })).toMatchObject({
      subtitleOverlay: false,
      subtitleOverlayBackground: 60,
    });
  });

  it('preserves explicit subtitle-layer choices', () => {
    expect(normalizePlayerPreferences({
      primarySubs: false,
      dualSubs: false,
      subtitlePosition: 'top',
      volumeNormalization: true,
      preferredAudioLanguage: ' JA ',
    })).toMatchObject({
      primarySubs: false,
      dualSubs: false,
      subtitlePosition: 'top',
      volumeNormalization: true,
      preferredAudioLanguage: 'ja',
    });
  });

  it('keeps persisted learning modes mutually exclusive', () => {
    expect(normalizePlayerPreferences({ dictationMode: true, shadowingMode: true })).toMatchObject({
      dictationMode: true,
      shadowingMode: false,
    });
  });
});
