/**
 * YouTube study helpers: recognising this app's own yt-dlp file names (so a download
 * is called by its title on cards and in Statistics), the sidecar language rank for
 * files the library never tagged, and watch progress for the playlist rows.
 */
import { describe, expect, it } from 'vitest';
import { sidecarWantedLang, youtubeIdentityFromPath } from '../youtubeDownloadFiles';
import { formatResumeClock, ytWatchState } from '../ytWatchProgress';
import { videoCoreResumeKey } from '../videoCoreStudy';

describe('youtubeIdentityFromPath', () => {
  it('reads the title and id from the app\'s download name', () => {
    expect(youtubeIdentityFromPath('C:\\Users\\me\\Videos\\Gum\\日本語の勉強 [dQw4w9WgXcQ].mp4')).toEqual({
      title: '日本語の勉強',
      youtubeId: 'dQw4w9WgXcQ',
    });
    expect(youtubeIdentityFromPath('/home/me/yt/A [B] title [abcdefghijk].webm')?.title).toBe('A [B] title');
  });

  it('refuses names that are not YouTube downloads', () => {
    expect(youtubeIdentityFromPath('Show - 01 [1080p].mkv')).toBeNull();
    expect(youtubeIdentityFromPath('Show - 01.mkv')).toBeNull();
    // 11 characters, but the last one cannot end a YouTube id.
    expect(youtubeIdentityFromPath('Show [BluRay-108p].mkv')).toBeNull();
    expect(youtubeIdentityFromPath(undefined)).toBeNull();
  });
});

describe('sidecarWantedLang', () => {
  it('prefers the item language, else the study language, reduced to the base tag', () => {
    expect(sidecarWantedLang('ja', 'zh-Hans')).toBe('ja');
    expect(sidecarWantedLang(undefined, 'zh-Hans')).toBe('zh');
    expect(sidecarWantedLang('', 'ru')).toBe('ru');
    expect(sidecarWantedLang(null, null)).toBe('ja');
  });
});

describe('ytWatchState', () => {
  const path = 'C:\\yt\\Video [dQw4w9WgXcQ].mp4';
  const key = videoCoreResumeKey({ localFilePath: path });

  it('resumes from the player\'s resume store first', () => {
    expect(ytWatchState({
      item: { path, positionSec: 30, durationSec: 600 },
      positions: [{ key, positionSec: 125, updatedAt: 1 }],
    })).toEqual({ kind: 'resume', positionSec: 125, fraction: 125 / 600 });
  });

  it('falls back to the library position, and YouTube\'s duration', () => {
    expect(ytWatchState({ item: { path, positionSec: 60 }, ytDurationSec: 120, positions: [] }))
      .toEqual({ kind: 'resume', positionSec: 60, fraction: 0.5 });
  });

  it('a finished video reads watched (the player clears its resume point at the end)', () => {
    expect(ytWatchState({ item: { path, positionSec: 590, durationSec: 600 }, positions: [] }))
      .toEqual({ kind: 'watched' });
  });

  it('nothing for an untouched video or one with no library item', () => {
    expect(ytWatchState({ item: { path, positionSec: 3, durationSec: 600 }, positions: [] })).toBeNull();
    expect(ytWatchState({ item: null, positions: [] })).toBeNull();
  });

  it('formats the resume clock', () => {
    expect(formatResumeClock(125)).toBe('2:05');
    expect(formatResumeClock(3725)).toBe('1:02:05');
  });
});
