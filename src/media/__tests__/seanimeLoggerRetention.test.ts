// @vitest-environment jsdom
/**
 * The adopted player's logger must not hand the console anything it could keep alive.
 *
 * Chromium stores console messages with live references to their arguments (up to 1,000)
 * so DevTools can show them when it opens later. The player logs its <video>, the element's
 * TextTrackList, its managers and whole playback-info objects; on the packaged build
 * (2026-09-26) a closed player's <video> was retained by
 * `(Global handles) / DevTools console -> TextTrackList -> <video>`.
 *
 * The console here is a spy that keeps every argument it receives, which is exactly what
 * Chromium's message store does.
 */
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { logArgument, logger } from '../../../vendor/seanime-web/lib/helpers/debug';

setFlagsFromString('--expose-gc');
const gc = runInNewContext('gc') as () => void;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('seanime logger outside development', () => {
  it('passes the console text, never an object', () => {
    const store = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const video = document.createElement('video');
    video.className = 'study-video-core main';
    const log = logger('VIDEO CORE');
    log.info('Text tracks', video.textTracks ?? video, { video, n: [1, 2], title: 'ゆるキャン△' }, new Error('boom'), 3, null);

    const args = store.mock.calls[0] ?? [];
    for (const arg of args.slice(1)) expect(arg === null || typeof arg !== 'object').toBe(true);
    expect(args.slice(1)).toEqual([
      'Text tracks',
      expect.stringMatching(/^\[|^<video/),
      '{video: <video.study-video-core.main>, n: [1, 2], title: "ゆるキャン△"}',
      'Error: boom',
      3,
      null,
    ]);
  });

  it('lets a logged element be collected even though the console keeps its arguments', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const log = logger('VIDEO CORE PIP');
    const logged = ((): WeakRef<HTMLElement> => {
      const player = document.createElement('div');
      player.append(document.createElement('video'));
      log.info('Entered PiP', player.firstElementChild, { player });
      return new WeakRef(player);
    })();
    for (let i = 0; i < 4; i += 1) {
      gc();
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(logged.deref()).toBeUndefined();
  });

  it('bounds what it renders', () => {
    const big = { cues: Array.from({ length: 5000 }, (_, i) => ({ start: i, text: 'x'.repeat(500) })), deep: { a: { b: { c: { d: 1 } } } } };
    const text = logArgument(big) as string;
    expect(typeof text).toBe('string');
    expect(text.length).toBeLessThanOrEqual(1001);
    expect(text).toContain('more');
    const cyclic: Record<string, unknown> = { name: 'loop' };
    cyclic.self = cyclic;
    expect(logArgument(cyclic)).toBe('{name: "loop", self: [circular]}');
  });
});
