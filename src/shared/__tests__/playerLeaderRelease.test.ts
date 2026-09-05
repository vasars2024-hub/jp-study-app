import { describe, expect, it } from 'vitest';
import {
  livePlayerWindowIds,
  releasePlayerLeadership,
  type PlayerSnapshot,
} from '../playerSync';

const snap = (over: Partial<PlayerSnapshot> = {}): PlayerSnapshot => ({
  sourceId: 3,
  trackToken: 7,
  current: { id: 'm1', fileName: 'e2e-audio-ja.m4a' } as PlayerSnapshot['current'],
  playing: true,
  time: 20.7,
  duration: 90,
  volume: 1,
  shuffle: false,
  repeat: 'off',
  mediaUrl: 'media://1-a216-453d-8972-0af8c2b06fb7/',
  ...over,
});

describe('releasePlayerLeadership', () => {
  it('releases the snapshot when its owning window is gone', () => {
    // The live 2026-09-04 state exactly: snapshot from webContents 3, one window left.
    const out = releasePlayerLeadership(snap(), [1]);
    expect(out).not.toBeNull();
    expect(out?.sourceId).toBe(0);
  });

  it('says nothing is playing, because the element that was playing is gone', () => {
    const out = releasePlayerLeadership(snap({ playing: true }), [1]);
    expect(out?.playing).toBe(false);
    expect(out?.mediaUrl).toBe('');
  });

  it('keeps the track and the position so the survivor can restart it', () => {
    const out = releasePlayerLeadership(snap(), [1]);
    expect(out?.current?.id).toBe('m1');
    expect(out?.time).toBe(20.7);
    expect(out?.duration).toBe(90);
    expect(out?.volume).toBe(1);
    expect(out?.repeat).toBe('off');
    expect(out?.trackToken).toBe(7);
  });

  it('leaves a snapshot alone while its window is still open', () => {
    expect(releasePlayerLeadership(snap({ sourceId: 3 }), [1, 3, 5])).toBeNull();
  });

  it('leaves a snapshot alone when the owner is the only window', () => {
    expect(releasePlayerLeadership(snap({ sourceId: 1 }), [1])).toBeNull();
  });

  it('does not re-release an already released snapshot', () => {
    // Idempotence matters: `player:getSnapshot` runs this on every read, and a second
    // release would broadcast a redundant sync to every window on every window open.
    expect(releasePlayerLeadership(snap({ sourceId: 0, playing: false }), [1])).toBeNull();
  });

  it('has nothing to release when no window ever published', () => {
    expect(releasePlayerLeadership(null, [1])).toBeNull();
  });

  it('does not mutate the snapshot it was given', () => {
    const before = snap();
    releasePlayerLeadership(before, [1]);
    expect(before.sourceId).toBe(3);
    expect(before.playing).toBe(true);
    expect(before.mediaUrl).not.toBe('');
  });

  it('releases when every window is gone, not only some', () => {
    expect(releasePlayerLeadership(snap(), [])?.sourceId).toBe(0);
  });
});

/**
 * Boss audit 2026-09-05, Finding 4. `releasePlayerLeadership` was always correct;
 * what fed it was not. The caller built its live set from `!isDestroyed()`, and a
 * renderer crash leaves the window undestroyed — so the dead leader stayed live
 * and the release never fired on the one path the caller's comment claimed.
 *
 * A real `render-process-gone` cannot be induced here, and the audit was right to
 * refuse to credit source reasoning as live proof. What CAN be proven is the
 * discrimination: given a crashed host, the id must not be in the live set, and
 * the release must then fire. The live crash remains unobserved and is recorded
 * as such.
 */
const host = (id: number, over: { destroyed?: boolean; crashed?: boolean } = {}) => ({
  isDestroyed: () => over.destroyed ?? false,
  webContents: { id, isCrashed: () => over.crashed ?? false },
});

describe('livePlayerWindowIds', () => {
  it('drops a window whose renderer crashed, which isDestroyed() calls alive', () => {
    // The control on the whole finding: `isDestroyed()` says this window is fine.
    const crashed = host(3, { crashed: true });
    expect(crashed.isDestroyed()).toBe(false);
    expect(livePlayerWindowIds([host(1), crashed])).toEqual([1]);
  });

  it('makes the leader release fire after a crash, which it previously did not', () => {
    // End to end through the real pure function: window 3 owns the audio and its
    // renderer crashes. Before the fix `live` was [1, 3] and this returned null.
    const live = livePlayerWindowIds([host(1), host(3, { crashed: true })]);
    const released = releasePlayerLeadership(snap({ sourceId: 3 }), live);
    expect(released).not.toBeNull();
    expect(released?.sourceId).toBe(0);
    expect(released?.playing).toBe(false);
  });

  it('keeps a healthy window, so a crash check cannot orphan a live leader', () => {
    // The negative control. If this ever went empty the fix would release
    // leadership constantly and look like a much worse bug than the one it fixes.
    const live = livePlayerWindowIds([host(1), host(3)]);
    expect(live).toEqual([1, 3]);
    expect(releasePlayerLeadership(snap({ sourceId: 3 }), live)).toBeNull();
  });

  it('drops a destroyed window too, without regressing the original case', () => {
    expect(livePlayerWindowIds([host(1), host(3, { destroyed: true })])).toEqual([1]);
  });

  it('survives a window torn down mid-walk instead of aborting the release', () => {
    // `webContents` is gone and `isDestroyed()` throws — both real races between
    // the enumeration and the read. One bad window must not cost the survivors
    // their release, which is the entire point of the loop.
    const noContents = { isDestroyed: () => false, webContents: null };
    const throwing = {
      isDestroyed: () => {
        throw new Error('window is gone');
      },
      webContents: { id: 9, isCrashed: () => false },
    };
    expect(livePlayerWindowIds([host(1), noContents, throwing, host(2)])).toEqual([1, 2]);
  });
});
