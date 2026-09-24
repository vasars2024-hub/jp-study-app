import { describe, expect, it } from 'vitest';
import { buildExternalPlayerArguments, createPlaybackHandoff, externalPlayerPresetFor, normalizeExternalPlayerPreferences, orderExternalPlayerProfiles, selectExternalPlayerProfile } from '../externalPlayer';
describe('external player handoff', () => { it('builds a resumable handoff', () => { const h = createPlaybackHandoff({ id: '1', title: 'Episode 2', path: 'C:/video.mkv', fileName: 'video.mkv', addedAt: 1, positionSec: 42, kind: 'video' }); expect(h.resumePositionSec).toBe(42); }); it('rejects unknown profile references', () => { expect(normalizeExternalPlayerPreferences({ profiles: [{ id: 'vlc', name: 'VLC', executablePath: 'C:/vlc.exe' }], defaultProfileId: 'missing' }).defaultProfileId).toBeNull(); }); });
describe('external player selection', () => { it('prefers content-type mapping, then default, then compatible fallback', () => { const prefs = normalizeExternalPlayerPreferences({ profiles: [{ id: 'audio', name: 'Audio', executablePath: 'a', contentType: 'audio' }, { id: 'video', name: 'Video', executablePath: 'v', contentType: 'video' }], defaultProfileId: 'audio' }); expect(selectExternalPlayerProfile(prefs, 'video')?.id).toBe('audio'); expect(selectExternalPlayerProfile({ ...prefs, contentTypeProfileIds: { video: 'video' } }, 'video')?.id).toBe('video'); }); });
describe('external player arguments', () => {
  const base = { id: 'mpv', name: 'mpv', executablePath: '/usr/bin/mpv', os: 'all' as const, contentType: 'video' as const, supportsSubtitles: true, supportsResume: true };
  const handoff = { mediaPath: '/v/a.mkv', title: '--evil', episodeNumber: 1, subtitlePath: '/v/a.ja.srt', audioPreference: null, metadata: {}, resumePositionSec: 61.9 };
  it('fills {position} and {subtitle}, drops them when absent, never lets a title read as a switch', () => {
    expect(buildExternalPlayerArguments({ ...base, arguments: ['{media}', '--start={position}', '--sub-file={subtitle}', '{title}'] }, handoff))
      .toEqual(['/v/a.mkv', '--start=61', '--sub-file=/v/a.ja.srt', 'evil']);
    expect(buildExternalPlayerArguments({ ...base, supportsSubtitles: false, arguments: ['{media}', '--start={position}', '--sub-file={subtitle}'] }, { ...handoff, resumePositionSec: null }))
      .toEqual(['/v/a.mkv']);
    expect(buildExternalPlayerArguments({ ...base, arguments: ['--fs'] }, handoff)).toEqual(['--fs', '/v/a.mkv']);
  });
  it('remembers the last-used player ahead of the default', () => {
    const prefs = normalizeExternalPlayerPreferences({ profiles: [{ ...base, arguments: [] }, { ...base, id: 'vlc', name: 'VLC', arguments: [] }], defaultProfileId: 'mpv', lastUsedProfileId: 'vlc' });
    expect(selectExternalPlayerProfile(prefs, 'video')?.id).toBe('vlc');
    expect(orderExternalPlayerProfiles(prefs, 'video').map((p) => p.id)).toEqual(['vlc', 'mpv']);
  });
  it('knows VLC and mpv argument templates', () => {
    expect(externalPlayerPresetFor('C:\\Program Files\\VideoLAN\\VLC\\vlc.exe')?.arguments).toContain('--start-time={position}');
    expect(externalPlayerPresetFor('/usr/bin/mpv')?.supportsResume).toBe(true);
    expect(externalPlayerPresetFor('C:/Tools/other.exe')).toBeNull();
  });
});
