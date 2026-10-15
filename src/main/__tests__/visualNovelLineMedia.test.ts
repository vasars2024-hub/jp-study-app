// @vitest-environment node
/**
 * Live VN capture: the per-line screenshot and voice clip, attached with fakes.
 *
 * The grab, the system-audio cut and the write to the saved line are all
 * injected; a hand-run clock and timer queue decide when a clip ends.
 */
import { describe, expect, it } from 'vitest';
import {
  createLineMediaAttacher,
  LINE_AUDIO_LEAD_MS,
  LINE_AUDIO_MAX_MS,
  LINE_AUDIO_MIN_MS,
  type LineMediaPatch,
} from '../immersion/visualNovelLineMedia';

function harness() {
  let clock = 1_000_000;
  const timers: Array<{ at: number; fn: () => void; id: number }> = [];
  let nextId = 1;
  const attached: Array<{ ids: readonly string[]; patch: LineMediaPatch }> = [];
  const cuts: Array<[number, number]> = [];
  const errors: string[] = [];
  let shots = 0;
  let shotResult: () => Promise<string> = async () => `shot-${++shots}.jpg`;
  let cutResult: (start: number, end: number) => Promise<string> = async (start, end) => `clip-${start}-${end}.mp3`;
  const media = createLineMediaAttacher({
    grabScreenshot: () => shotResult(),
    cutAudio: (start, end) => {
      cuts.push([start, end]);
      return cutResult(start, end);
    },
    attach: (ids, patch) => attached.push({ ids, patch }),
    onError: (kind) => errors.push(kind),
    now: () => clock,
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timers.push({ at: clock + ms, fn, id });
      return id;
    },
    clearTimeout: (handle) => {
      const i = timers.findIndex((t) => t.id === handle);
      if (i >= 0) timers.splice(i, 1);
    },
  });
  const advance = async (ms: number): Promise<void> => {
    const end = clock + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const due = timers[0];
      if (!due || due.at > end) break;
      timers.shift();
      clock = due.at;
      due.fn();
      await new Promise((r) => setTimeout(r, 0));
    }
    clock = end;
  };
  return {
    media,
    attached,
    cuts,
    errors,
    advance,
    now: () => clock,
    timers: () => timers.length,
    setShot: (fn: () => Promise<string>) => {
      shotResult = fn;
    },
    setCut: (fn: (s: number, e: number) => Promise<string>) => {
      cutResult = fn;
    },
    settle: () => new Promise((r) => setTimeout(r, 0)),
  };
}

describe('per-line screenshot and audio', () => {
  it('attaches nothing while both are off (the default)', async () => {
    const h = harness();
    await h.media.lineCaptured(['a']);
    await h.advance(LINE_AUDIO_MAX_MS * 2);
    await h.media.flush();
    expect(h.attached).toEqual([]);
    expect(h.cuts).toEqual([]);
    expect(h.media.options()).toEqual({ screenshot: false, audio: false });
  });

  it('grabs the game window as the line is captured and attaches it', async () => {
    const h = harness();
    h.media.configure({ screenshot: true, audio: false });
    await h.media.lineCaptured(['a']);
    expect(h.attached).toEqual([{ ids: ['a'], patch: { screenshotPath: 'shot-1.jpg' } }]);
    await h.media.lineCaptured(['b', 'c']);
    expect(h.attached[1]).toEqual({ ids: ['b', 'c'], patch: { screenshotPath: 'shot-2.jpg' } });
  });

  it("cuts a line's clip from just before it appeared until the next line", async () => {
    const h = harness();
    h.media.configure({ screenshot: false, audio: true });
    const t0 = h.now();
    await h.media.lineCaptured(['a'], t0);
    expect(h.cuts).toEqual([]);
    expect(h.media.pendingIds()).toEqual(['a']);
    await h.advance(3_000);
    await h.media.lineCaptured(['b'], h.now());
    await h.settle();
    expect(h.cuts).toEqual([[t0 - LINE_AUDIO_LEAD_MS, t0 + 3_000]]);
    expect(h.attached).toEqual([{ ids: ['a'], patch: { audioPath: `clip-${t0 - LINE_AUDIO_LEAD_MS}-${t0 + 3_000}.mp3` } }]);
    expect(h.media.pendingIds()).toEqual(['b']);
  });

  it('caps a line left on screen at the longest clip, without waiting for the next line', async () => {
    const h = harness();
    h.media.configure({ screenshot: false, audio: true });
    const t0 = h.now();
    await h.media.lineCaptured(['a'], t0);
    await h.advance(LINE_AUDIO_MAX_MS + 1);
    await h.settle();
    expect(h.cuts).toEqual([[t0 - LINE_AUDIO_LEAD_MS, t0 + LINE_AUDIO_MAX_MS]]);
    expect(h.media.pendingIds()).toEqual([]);
    // The next line much later does not cut the old one a second time.
    await h.media.lineCaptured(['b'], h.now());
    await h.settle();
    expect(h.cuts).toHaveLength(1);
  });

  it('cuts nothing for a line skipped past at once', async () => {
    const h = harness();
    h.media.configure({ screenshot: false, audio: true });
    await h.media.lineCaptured(['a']);
    await h.advance(LINE_AUDIO_MIN_MS - 100);
    await h.media.lineCaptured(['b']);
    await h.settle();
    expect(h.cuts).toEqual([]);
    expect(h.media.pendingIds()).toEqual(['b']);
  });

  it('ends the last clip when capture stops', async () => {
    const h = harness();
    h.media.configure({ screenshot: true, audio: true });
    const t0 = h.now();
    await h.media.lineCaptured(['a'], t0);
    await h.advance(2_000);
    await h.media.flush();
    expect(h.cuts).toEqual([[t0 - LINE_AUDIO_LEAD_MS, t0 + 2_000]]);
    expect(h.attached.map((a) => a.patch)).toEqual([
      { screenshotPath: 'shot-1.jpg' },
      { audioPath: `clip-${t0 - LINE_AUDIO_LEAD_MS}-${t0 + 2_000}.mp3` },
    ]);
    expect(h.timers()).toBe(0);
  });

  it('attaches no file when there was nothing to grab or cut', async () => {
    const h = harness();
    h.media.configure({ screenshot: true, audio: true });
    h.setShot(async () => '');
    h.setCut(async () => '');
    await h.media.lineCaptured(['a']);
    await h.advance(2_000);
    await h.media.flush();
    expect(h.attached).toEqual([]);
    expect(h.errors).toEqual([]);
  });

  it('reports a failed grab or cut and keeps capturing', async () => {
    const h = harness();
    h.media.configure({ screenshot: true, audio: true });
    h.setShot(async () => {
      throw new Error('no window');
    });
    h.setCut(async () => {
      throw new Error('buffer gone');
    });
    await h.media.lineCaptured(['a']);
    await h.advance(2_000);
    await h.media.lineCaptured(['b']);
    await h.settle();
    expect(h.errors).toEqual(['screenshot', 'audio', 'screenshot']);
    expect(h.media.pendingIds()).toEqual(['b']);
  });

  it('turning audio off forgets the waiting line, reset drops it without a cut', async () => {
    const h = harness();
    h.media.configure({ screenshot: false, audio: true });
    await h.media.lineCaptured(['a']);
    h.media.configure({ screenshot: false, audio: false });
    expect(h.media.pendingIds()).toEqual([]);
    h.media.configure({ screenshot: false, audio: true });
    await h.media.lineCaptured(['b']);
    h.media.reset();
    await h.advance(LINE_AUDIO_MAX_MS * 2);
    await h.media.flush();
    expect(h.cuts).toEqual([]);
    expect(h.timers()).toBe(0);
  });
});
