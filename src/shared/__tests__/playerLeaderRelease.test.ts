import { describe, expect, it } from 'vitest';
import { releasePlayerLeadership, type PlayerSnapshot } from '../playerSync';

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
