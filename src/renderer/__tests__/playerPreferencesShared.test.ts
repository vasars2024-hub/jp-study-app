// @vitest-environment jsdom
/**
 * The Media Center and the player share `jp-media-player-preferences-v1`
 * without erasing each other (round-2 audit B, item 18).
 *
 * Before: MediaContent wrote a fixed 14-field copy on mount and on every
 * change, which dropped the player's subtitle font, colours and position; the
 * VideoCore overlay wrote its whole copy on every change, which reset whatever
 * the Media Center had changed since the overlay loaded; and the two stored
 * `subtitlePosition` in different types (string vs number), so each reset the
 * other's value.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  normalizePlayerPreferences,
  playerPreferencesPatch,
} from '../../shared/playerPreferences';
import { normalizeVideoCoreStudyPreferences, PLAYER_PREFERENCES_STORAGE_KEY } from '../../shared/videoCoreStudy';
import {
  onPlayerPreferencesChanged,
  readStoredPlayerPreferences,
  writePlayerPreferencesPatch,
} from '../playerPreferencesStore';

const SRC = resolve(__dirname, '..', '..');

beforeEach(() => localStorage.clear());

function seedPlayer(): void {
  localStorage.setItem(PLAYER_PREFERENCES_STORAGE_KEY, JSON.stringify(normalizeVideoCoreStudyPreferences({
    subtitleFontFamily: 'mincho',
    subtitleColor: '#ff3300',
    subtitlePosition: 12,
    subtitleBgOpacity: 60,
    playbackRate: 1,
  })));
}

describe('a Media Center change', () => {
  it('does not reset the subtitle font, colour or position', () => {
    seedPlayer();
    const stored = readStoredPlayerPreferences();
    writePlayerPreferencesPatch(playerPreferencesPatch({ playbackRate: 1.25, furigana: true }, stored), 'media-center');
    const after = normalizeVideoCoreStudyPreferences(readStoredPlayerPreferences());
    expect(after).toMatchObject({
      playbackRate: 1.25,
      furigana: true,
      subtitleFontFamily: 'mincho',
      subtitleColor: '#ff3300',
      subtitlePosition: 12,
      subtitleBgOpacity: 60,
    });
  });

  it('writes its position and background choices in the player\'s own fields', () => {
    seedPlayer();
    const stored = readStoredPlayerPreferences();
    expect(playerPreferencesPatch({ subtitlePosition: 'top' }, stored)).toEqual({ subtitleAtTop: true });
    expect(playerPreferencesPatch({ subtitlePosition: 'bottom' }, stored)).toEqual({ subtitleAtTop: false, subtitlePosition: 0 });
    expect(playerPreferencesPatch({ subtitleOverlay: false }, stored)).toEqual({ subtitleBgOpacity: 0 });
    // Turning the background back on keeps the player's own opacity when it has one.
    expect(playerPreferencesPatch({ subtitleOverlay: true }, stored)).toEqual({ subtitleBgOpacity: 60 });
    // And the Media Center reads the player's fields back.
    expect(normalizePlayerPreferences({ subtitleAtTop: true }).subtitlePosition).toBe('top');
    expect(normalizePlayerPreferences({ subtitlePosition: 0 }).subtitlePosition).toBe('bottom');
    expect(normalizePlayerPreferences({ subtitlePosition: 20 }).subtitlePosition).toBe('center');
    expect(normalizePlayerPreferences({ subtitleBgOpacity: 0 }).subtitleOverlay).toBe(false);
  });
});

describe('a player change', () => {
  it('does not reset the Media Center\'s fields', () => {
    localStorage.setItem(PLAYER_PREFERENCES_STORAGE_KEY, JSON.stringify({
      playbackRate: 1.5,
      volumeNormalization: true,
      preferredAudioLanguage: 'ja',
    }));
    writePlayerPreferencesPatch({ subtitleColor: '#00ff00' }, 'video-core');
    expect(normalizePlayerPreferences(readStoredPlayerPreferences())).toMatchObject({
      playbackRate: 1.5,
      volumeNormalization: true,
      preferredAudioLanguage: 'ja',
    });
    expect(readStoredPlayerPreferences().subtitleColor).toBe('#00ff00');
  });
});

describe('each owner hears the other', () => {
  it('delivers another writer\'s change, in this window and from another one, and not its own echo', () => {
    const heard = vi.fn();
    const off = onPlayerPreferencesChanged('video-core', heard);
    writePlayerPreferencesPatch({ playbackRate: 0.9 }, 'video-core');
    expect(heard).not.toHaveBeenCalled();
    writePlayerPreferencesPatch({ playbackRate: 0.75 }, 'media-center');
    expect(heard).toHaveBeenCalledTimes(1);
    expect(heard.mock.calls[0][0].playbackRate).toBe(0.75);
    window.dispatchEvent(new StorageEvent('storage', { key: PLAYER_PREFERENCES_STORAGE_KEY }));
    expect(heard).toHaveBeenCalledTimes(2);
    off();
  });

  it('both owners write patches through the shared store, never a whole copy', () => {
    const media = readFileSync(resolve(SRC, 'renderer/components/media/MediaContent.tsx'), 'utf8');
    const overlay = readFileSync(resolve(SRC, 'media/VideoCoreStudyOverlay.tsx'), 'utf8');
    for (const text of [media, overlay]) {
      expect(text).toContain('writePlayerPreferencesPatch(');
      expect(text).toContain('onPlayerPreferencesChanged(');
      expect(text).not.toMatch(/localStorage\.setItem\(\s*PLAYER_PREFERENCES/);
    }
  });
});
