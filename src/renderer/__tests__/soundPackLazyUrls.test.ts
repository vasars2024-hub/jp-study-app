// @vitest-environment jsdom
/**
 * The generated sound packs build their WAV data URLs on first play.
 *
 * Both packs are registered at boot, and building every cue eagerly held ~22 MB
 * of base64 strings on the renderer heap (measured with a sampling heap profile
 * of the packaged build) for two themes most users never pick.
 */
import { describe, expect, it, vi } from 'vitest';
import { lazySounds } from '../audio/soundPack';
import { WIRED_ARCHIVE_SOUND_PACK } from '../audio/wiredArchivePack';

describe('lazySounds', () => {
  it('builds nothing until a sound is read, then each cue once', () => {
    const build = vi.fn((cue: string) => `data:audio/wav;base64,${cue}`);
    const sounds = lazySounds({ system: { startup: 'boot', wake: 'boot' }, ui: { menu: 'click' } }, build);
    expect(build).not.toHaveBeenCalled();
    expect(sounds.system?.startup).toBe('data:audio/wav;base64,boot');
    expect(sounds.system?.wake).toBe('data:audio/wav;base64,boot');
    expect(sounds.system?.startup).toBe('data:audio/wav;base64,boot');
    expect(build).toHaveBeenCalledTimes(1);
    expect(Object.keys(sounds.ui ?? {})).toEqual(['menu']);
  });

  it('still yields a playable WAV for a generated pack', () => {
    const url = WIRED_ARCHIVE_SOUND_PACK.sounds.ui?.menu ?? '';
    expect(url.startsWith('data:audio/wav;base64,UklGR')).toBe(true);
    expect(WIRED_ARCHIVE_SOUND_PACK.sounds.environment?.forest)
      .toBe(WIRED_ARCHIVE_SOUND_PACK.sounds.environment?.ambient);
  });
});
