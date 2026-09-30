/**
 * Music, round 2 (coverage D): a stable shuffle with history, "Up next" that is what will
 * actually play, lyrics that travel with the file, and the visualizer frame relay's
 * guard. The player bus and the relay sit on these pure halves.
 */
import { describe, expect, it } from 'vitest';
import {
  linearOrder,
  pickInOrder,
  reconcileOrder,
  shuffledOrder,
  stepOrder,
  upcomingIds,
} from '../musicPlayOrder';
import { normaliseLyricsText, parseFfmetadata, pickLyricsTag, sidecarLrcNames } from '../musicLocalLyrics';
import { isRelayableVizFrame, relayVizFrame, VIZ_FRAME_MAX_LEN } from '../../main/vizFrameRelay';

/** Deterministic rng: always picks the first remaining slot. */
const first = () => 0;

describe('play order', () => {
  const q = ['a', 'b', 'c', 'd', 'e'];

  it.each([{ ids: ['a'] }, { ids: ['a', 'b'] }, { ids: q }])('Previous reaches the last track when the current song is outside queue $ids', ({ ids }) => {
    const order = linearOrder(ids, 'filtered-out');
    const previous = stepOrder(order, -1, { repeat: 'off', fromEnded: false });
    expect(previous.nextId).toBe(ids[ids.length - 1]);
    expect(previous.order.cursor).toBe(ids.length - 1);
    expect(stepOrder(order, 1, { repeat: 'off', fromEnded: false }).nextId).toBe(ids[0]);
  });

  it('shuffle keeps the current track first and never repeats until the cycle ends', () => {
    let order = shuffledOrder(q, 'c', first);
    expect(order.ids[0]).toBe('c');
    const seen = ['c'];
    for (let i = 0; i < q.length - 1; i += 1) {
      const step = stepOrder(order, 1, { repeat: 'off', fromEnded: true });
      order = step.order;
      seen.push(step.nextId ?? '');
    }
    expect([...seen].sort()).toEqual([...q].sort());
    // End of the cycle with repeat off: stop.
    expect(stepOrder(order, 1, { repeat: 'off', fromEnded: true }).nextId).toBeNull();
  });

  it('Previous walks back through what actually played (history), not a random pick', () => {
    let order = shuffledOrder(q, 'a', first);
    const played = [order.ids[0]];
    for (let i = 0; i < 2; i += 1) {
      const step = stepOrder(order, 1, { repeat: 'off', fromEnded: false });
      order = step.order;
      played.push(step.nextId ?? '');
    }
    expect(stepOrder(order, -1, { repeat: 'off', fromEnded: false }).nextId).toBe(played[1]);
  });

  it('Up next lists what follows the current track, and wraps only with repeat all', () => {
    const order = linearOrder(q, 'd');
    expect(upcomingIds(order, 10)).toEqual(['e']);
    expect(upcomingIds(order, 10, true)).toEqual(['e', 'a', 'b', 'c']);
  });

  it('picking a track in a shuffle makes it the current step without reshuffling the rest', () => {
    const order = shuffledOrder(q, 'a', first);
    const picked = pickInOrder(order, order.ids[3] ?? '');
    expect(picked.ids[picked.cursor]).toBe(order.ids[3]);
    expect(new Set(picked.ids)).toEqual(new Set(order.ids));
  });

  it('a track added to the queue joins the upcoming part of the cycle; nothing reshuffles what played', () => {
    const order = { ...shuffledOrder(q, 'a', first), cursor: 2 };
    const played = order.ids.slice(0, 3);
    const next = reconcileOrder(order, [...q, 'f'], true, order.ids[2] ?? null, first);
    expect(next.ids.slice(0, 3)).toEqual(played);
    expect(next.ids).toContain('f');
  });
});

describe('lyrics that travel with the file', () => {
  it('looks for Song.lrc and Song.mp3.lrc', () => {
    expect(sidecarLrcNames('Song.mp3')).toEqual(['Song.lrc', 'Song.mp3.lrc']);
  });

  it('reads the lyrics tag out of ffmetadata, and strips a BOM', () => {
    const tags = parseFfmetadata(';FFMETADATA1\ntitle=Song\nlyrics-eng=[00:01.00]line one\\\n[00:02.00]line two\n');
    expect(pickLyricsTag(tags)).toContain('line one');
    expect(normaliseLyricsText(`${String.fromCharCode(0xfeff)}a\r\nb`)).toBe('a\nb');
  });
});

describe('visualizer frame relay (main)', () => {
  const frame = { freq: new Uint8Array(256), wave: new Uint8Array(256) };
  function win(id: number, sent: unknown[]) {
    return { isDestroyed: () => false, webContents: { id, isCrashed: () => false, send: (_c: string, f: unknown) => sent.push(f) } };
  }

  it('forwards a small frame to every other live window, never back to the sender', () => {
    const a: unknown[] = [];
    const b: unknown[] = [];
    expect(relayVizFrame([win(1, a), win(2, b)], 1, frame)).toBe(1);
    expect(a).toHaveLength(0);
    expect(b).toHaveLength(1);
  });

  it('drops anything that is not two small byte arrays', () => {
    expect(isRelayableVizFrame({ freq: new Uint8Array(VIZ_FRAME_MAX_LEN + 1), wave: new Uint8Array(1) })).toBe(false);
    expect(isRelayableVizFrame({ freq: [1, 2], wave: new Uint8Array(2) })).toBe(false);
    expect(isRelayableVizFrame(frame)).toBe(true);
  });
});
