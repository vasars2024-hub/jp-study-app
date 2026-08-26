// @vitest-environment node
/**
 * Video's three action buttons: the rules behind their grey, and the order those
 * rules are consulted in.
 *
 * The category-8 sweep scored `Subtitles`, `Generate` and `Download & transcribe`
 * as three mute pairs — all three captioned, so the user could read exactly what
 * each did and still had nothing telling them why it was dead. What is pinned
 * here is not that a reason exists (the live bridge run showed that) but that the
 * RIGHT one is chosen, which is the part a refactor can silently invert.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from '../i18n/catalogs/en';
import { ja } from '../i18n/catalogs/ja';
import { ru } from '../i18n/catalogs/ru';
import { zh } from '../i18n/catalogs/zh';
import {
  MEDIA_VIDEO_ACTION_REASON_KEYS,
  videoGenerateDisabledReason,
  videoSubtitlesDisabledReason,
  youtubeDownloadDisabledReason,
} from '../mediaVideoActionReason';

const SRC = resolve(__dirname, '..', '..');

describe('Video action disabled reasons', () => {
  it('names the missing video, and says nothing once one is open', () => {
    expect(videoSubtitlesDisabledReason({ hasSource: false })).toBe('mediaCenter.video.reason.noVideo');
    // `undefined` is the enabled signal both shells derive `disabled` from. A rule
    // that returned a string here would grey a button that works.
    expect(videoSubtitlesDisabledReason({ hasSource: true })).toBeUndefined();
  });

  it('distinguishes "nothing to generate from" from "already generating"', () => {
    expect(videoGenerateDisabledReason({ hasSource: false, generating: false }))
      .toBe('mediaCenter.video.reason.noVideo');
    expect(videoGenerateDisabledReason({ hasSource: true, generating: true }))
      .toBe('mediaCenter.video.reason.generating');
    expect(videoGenerateDisabledReason({ hasSource: true, generating: false })).toBeUndefined();
    // The two conditions cannot co-occur in the shell today, so this asserts the
    // defensive order rather than an observed state: if generation ever becomes
    // startable without a source, the answer stays "open a video" instead of
    // reporting a run the user did not start.
    expect(videoGenerateDisabledReason({ hasSource: false, generating: true }))
      .toBe('mediaCenter.video.reason.noVideo');
  });

  it('lets a running download outrank an empty URL box, because the box is locked', () => {
    expect(youtubeDownloadDisabledReason({ url: '', downloading: false }))
      .toBe('media.yt.reason.noUrl');
    expect(youtubeDownloadDisabledReason({ url: 'https://example.invalid/v', downloading: true }))
      .toBe('media.yt.reason.busy');
    expect(youtubeDownloadDisabledReason({ url: 'https://example.invalid/v', downloading: false }))
      .toBeUndefined();
    // THE reason this is a module. Both conditions really can hold at once, and
    // the same running download disables the input — so "paste a link" would be
    // advice the user is physically unable to follow, about a field the app
    // itself has locked. Flipping these two lines is a silent product defect
    // that every other guard in this repo would pass.
    expect(youtubeDownloadDisabledReason({ url: '', downloading: true }))
      .toBe('media.yt.reason.busy');
    expect(youtubeDownloadDisabledReason({ url: '   ', downloading: false }))
      .toBe('media.yt.reason.noUrl');
  });

  it('resolves every key it can return, in all four languages', () => {
    // `translate()` returns the BARE KEY on a miss, so a reason with no catalogue
    // entry renders as `media.yt.reason.busy` in the tooltip — and `i18n-check`
    // cannot see it, because a key no catalogue has is missing from all of them
    // equally and so compares clean.
    expect(MEDIA_VIDEO_ACTION_REASON_KEYS.length).toBe(4);
    for (const catalog of [en, ja, ru, zh]) {
      for (const key of MEDIA_VIDEO_ACTION_REASON_KEYS) {
        expect(catalog[key]).toBeTruthy();
        expect(catalog[key]).not.toBe(key);
      }
    }
  });

  it('is what both shells actually consult, rather than a second opinion', () => {
    // The module is only worth having if `disabled` derives from it. A component
    // that kept its own condition list would drift from the sentence it shows.
    const view = readFileSync(resolve(SRC, 'renderer/views/MediaCenterView.tsx'), 'utf8');
    expect(view).toContain('disabled={!!subtitlesReason}');
    expect(view).toContain('disabled={!!generateReason}');
    expect(view).not.toContain('disabled={!state.src || state.generating}');

    const content = readFileSync(resolve(SRC, 'renderer/components/media/MediaContent.tsx'), 'utf8');
    expect(content).toContain('disabled={!!downloadReason}');
    expect(content).not.toContain('disabled={!state.ytUrl.trim() || !!state.yt}');
  });
});
