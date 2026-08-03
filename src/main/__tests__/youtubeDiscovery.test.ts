// @vitest-environment node

/**
 * The fetch half of YouTube discovery (Phase 8 item 3), over the injected
 * transport.
 *
 * Nothing here spawns a process or touches the network. Electron and
 * `main/media.ts` are stubbed so the module loads, and every test passes its own
 * `runYtDlp` / `locateYtDlp`, which is the whole point of the seam: the
 * tool-missing path, the argument construction and the metadata-only guard are
 * all checkable on a machine with no yt-dlp and no internet.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: () => undefined },
}));

// Stubbed rather than imported: the real module pulls in the downloader, ffmpeg
// probing and Electron's app paths, none of which this file exercises.
vi.mock('../media', () => ({
  findYtDlp: async () => null,
  ytDlpJson: async () => ({ ok: false as const, error: 'stub' }),
}));

const {
  MAX_SEARCH_RESULTS,
  assertMetadataOnly,
  browseYoutubeChannel,
  buildChannelArgs,
  buildProbeArgs,
  buildSearchArgs,
  channelVideosUrl,
  clampResultCount,
  isYoutubeVideoId,
  probeYoutubeVideo,
  sanitiseQuery,
  searchYoutube,
} = await import('../youtubeDiscovery');

const PRESENT = async (): Promise<string> => 'C:/tools/yt-dlp.exe';
const ABSENT = async (): Promise<string | null> => null;

function payload(entries: unknown[]): { ok: true; data: unknown } {
  return { ok: true, data: { entries } };
}

const ONE_HIT = [{ id: 'aaaaaaaaaaa', title: '日本語' }];

// ---------------------------------------------------------------------------

describe('metadata-only guard', () => {
  it('refuses an argument list that would write files', () => {
    expect(() => assertMetadataOnly(['-J', '--skip-download', '-o', 'out/%(id)s'])).toThrow(/downloading flag/);
    expect(() => assertMetadataOnly(['-J', '--flat-playlist', '--write-subs'])).toThrow(/downloading flag/);
  });

  it('refuses an argument list that is neither skip-download nor flat', () => {
    expect(() => assertMetadataOnly(['-J', 'https://example.invalid'])).toThrow(/metadata-only/);
  });

  it('accepts the three lists this module actually builds', () => {
    expect(() => assertMetadataOnly(buildSearchArgs('x', 5))).not.toThrow();
    expect(() => assertMetadataOnly(buildChannelArgs('https://www.youtube.com/@x/videos', 5))).not.toThrow();
    expect(() => assertMetadataOnly(buildProbeArgs('aaaaaaaaaaa'))).not.toThrow();
  });
});

describe('argument construction', () => {
  it('uses yt-dlp\'s keyless search extractor and stays to one round trip', () => {
    const args = buildSearchArgs('日本語 リスニング', 12);

    expect(args).toContain('--flat-playlist');
    expect(args[args.length - 1]).toBe('ytsearch12:日本語 リスニング');
  });

  it('clamps the result count into a sane band', () => {
    expect(clampResultCount(500)).toBe(MAX_SEARCH_RESULTS);
    expect(clampResultCount(0)).toBe(1);
    expect(clampResultCount(-3)).toBe(1);
    expect(clampResultCount('nope')).toBe(20);
  });

  it('collapses a query onto one bounded line', () => {
    expect(sanitiseQuery('  two\nlines\there  ')).toBe('two lines here');
    expect(sanitiseQuery('x'.repeat(500))).toHaveLength(200);
    expect(sanitiseQuery(42)).toBe('');
  });

  /**
   * `--no-playlist` is load-bearing, not decoration: a watch URL that carries a
   * `list=` parameter expands into the entire playlist without it, so a
   * one-video probe becomes a two-hundred-video extraction.
   */
  it('probes exactly one video, without downloading it', () => {
    const args = buildProbeArgs('aaaaaaaaaaa');

    expect(args).toContain('--skip-download');
    expect(args).toContain('--no-playlist');
    expect(args).toContain('https://www.youtube.com/watch?v=aaaaaaaaaaa');
  });

  it('resolves the shapes a user actually types for a channel', () => {
    expect(channelVideosUrl('@nihongo')).toBe('https://www.youtube.com/@nihongo/videos');
    expect(channelVideosUrl('UC1234567890123456789A'))
      .toBe('https://www.youtube.com/channel/UC1234567890123456789A/videos');
    expect(channelVideosUrl('https://www.youtube.com/@nihongo'))
      .toBe('https://www.youtube.com/@nihongo/videos');
    expect(channelVideosUrl('https://www.youtube.com/@nihongo/videos'))
      .toBe('https://www.youtube.com/@nihongo/videos');
    expect(channelVideosUrl('https://example.invalid/@nihongo')).toBeNull();
    expect(channelVideosUrl('')).toBeNull();
  });

  it('recognises a video id by shape', () => {
    expect(isYoutubeVideoId('aaaaaaaaaaa')).toBe(true);
    expect(isYoutubeVideoId('short')).toBe(false);
    expect(isYoutubeVideoId('https://www.youtube.com/watch?v=aaaaaaaaaaa')).toBe(false);
  });
});

describe('the tool-missing state', () => {
  /**
   * This is the "not configured" state, and the two halves of the assertion are
   * both required.
   *
   * Reporting the state is not enough — a gate that *says* it did not run is
   * worthless if it in fact ran and swallowed the result. So the transport is a
   * spy and the test asserts a call count of zero against a control run that
   * asserts a count of one.
   */
  it('reports tool-missing without spawning anything, and the control run does spawn', async () => {
    const missing = vi.fn(async (_args: string[]) => payload(ONE_HIT));
    const present = vi.fn(async (_args: string[]) => payload(ONE_HIT));

    const absent = await searchYoutube('日本語', 5, { locateYtDlp: ABSENT, runYtDlp: missing });
    const found = await searchYoutube('日本語', 5, { locateYtDlp: PRESENT, runYtDlp: present });

    expect(absent.state).toBe('tool-missing');
    expect(absent.candidates).toEqual([]);
    expect(missing).toHaveBeenCalledTimes(0);

    expect(found.state).toBe('ready');
    expect(found.candidates).toHaveLength(1);
    expect(present).toHaveBeenCalledTimes(1);
  });

  it('applies to a channel browse and a probe too', async () => {
    const transport = vi.fn(async (_args: string[]) => payload(ONE_HIT));

    expect((await browseYoutubeChannel('@x', 5, { locateYtDlp: ABSENT, runYtDlp: transport })).state)
      .toBe('tool-missing');
    expect((await probeYoutubeVideo('aaaaaaaaaaa', { locateYtDlp: ABSENT, runYtDlp: transport })).state)
      .toBe('tool-missing');
    expect(transport).toHaveBeenCalledTimes(0);
  });
});

describe('search', () => {
  it('passes the sanitised query and the clamped limit to yt-dlp', async () => {
    const transport = vi.fn(async (_args: string[]) => payload(ONE_HIT));

    await searchYoutube('  日本語\nリスニング  ', 999, { locateYtDlp: PRESENT, runYtDlp: transport });

    const args = transport.mock.calls[0][0];
    expect(args[args.length - 1]).toBe(`ytsearch${MAX_SEARCH_RESULTS}:日本語 リスニング`);
  });

  it('does not run anything for an empty query', async () => {
    const transport = vi.fn(async (_args: string[]) => payload(ONE_HIT));
    const locate = vi.fn(PRESENT);

    const result = await searchYoutube('   ', 5, { locateYtDlp: locate, runYtDlp: transport });

    expect(result.state).toBe('empty');
    expect(transport).toHaveBeenCalledTimes(0);
    expect(locate).toHaveBeenCalledTimes(0);
  });

  it('reports empty rather than error when YouTube answers with nothing', async () => {
    const result = await searchYoutube('日本語', 5, {
      locateYtDlp: PRESENT,
      runYtDlp: async () => payload([]),
    });

    expect(result.state).toBe('empty');
  });

  it('carries a transport failure through as an error with its message', async () => {
    const result = await searchYoutube('日本語', 5, {
      locateYtDlp: PRESENT,
      runYtDlp: async () => ({ ok: false as const, error: 'HTTP Error 429' }),
    });

    expect(result.state).toBe('error');
    expect(result.message).toBe('HTTP Error 429');
    expect(result.candidates).toEqual([]);
  });

  it('stamps the result with the injected clock', async () => {
    const result = await searchYoutube('日本語', 5, {
      locateYtDlp: PRESENT,
      runYtDlp: async () => payload(ONE_HIT),
      now: () => 1234,
    });

    expect(result.fetchedAt).toBe(1234);
    expect(result.mode).toBe('search');
  });
});

describe('channel browse', () => {
  it('turns a handle into a uploads URL and asks for it', async () => {
    const transport = vi.fn(async (_args: string[]) => payload(ONE_HIT));

    const result = await browseYoutubeChannel('@nihongo', 7, { locateYtDlp: PRESENT, runYtDlp: transport });

    const args = transport.mock.calls[0][0];
    expect(args).toContain('https://www.youtube.com/@nihongo/videos');
    expect(args).toContain('--playlist-end');
    expect(args[args.indexOf('--playlist-end') + 1]).toBe('7');
    expect(result.mode).toBe('channel');
    expect(result.state).toBe('ready');
  });

  it('rejects something that is not a channel without spawning anything', async () => {
    const transport = vi.fn(async (_args: string[]) => payload(ONE_HIT));

    const result = await browseYoutubeChannel('not a channel', 5, {
      locateYtDlp: PRESENT,
      runYtDlp: transport,
    });

    expect(result.state).toBe('error');
    expect(transport).toHaveBeenCalledTimes(0);
  });
});

describe('probe', () => {
  it('returns the caption inventory for one video', async () => {
    const result = await probeYoutubeVideo('aaaaaaaaaaa', {
      locateYtDlp: PRESENT,
      now: () => 555,
      runYtDlp: async () => ({
        ok: true as const,
        data: {
          id: 'aaaaaaaaaaa',
          language: 'ja',
          subtitles: { ja: [{ ext: 'vtt' }], live_chat: [{ ext: 'json' }] },
          automatic_captions: { ja: [{ ext: 'vtt' }] },
        },
      }),
    });

    expect(result.state).toBe('ready');
    expect(result.probe?.probedAt).toBe(555);
    expect(result.probe?.captions).toEqual([
      { key: 'ja', lang: 'ja', kind: 'human' },
      { key: 'ja', lang: 'ja', kind: 'auto' },
    ]);
  });

  it('rejects a malformed id before locating the tool', async () => {
    const transport = vi.fn(async (_args: string[]) => payload(ONE_HIT));
    const locate = vi.fn(PRESENT);

    const result = await probeYoutubeVideo('https://youtu.be/x', { locateYtDlp: locate, runYtDlp: transport });

    expect(result.state).toBe('error');
    expect(transport).toHaveBeenCalledTimes(0);
    expect(locate).toHaveBeenCalledTimes(0);
  });

  it('reports an error when yt-dlp answers with something unusable', async () => {
    const result = await probeYoutubeVideo('aaaaaaaaaaa', {
      locateYtDlp: PRESENT,
      runYtDlp: async () => ({ ok: true as const, data: { title: 'no id here' } }),
    });

    expect(result.state).toBe('error');
    expect(result.probe).toBeNull();
  });
});
