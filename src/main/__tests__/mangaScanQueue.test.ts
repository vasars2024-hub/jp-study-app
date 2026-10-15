// @vitest-environment node
// The one queue every manga page scan goes through (main/mangaScanQueue.ts):
// the shown page first, read-ahead next, volume work last; a page turn drops
// the scans of pages turned past; a second request for a page joins the first.

import { describe, expect, it } from 'vitest';
import { MangaScanCancelled, createMangaScanQueue, type MangaScanKey } from '../mangaScanQueue';
import { isMangaOcrCancelled } from '../../shared/mangaOcrIpc';

/** A queue whose scans finish when the test says so, recording the run order. */
function harness() {
  const ran: string[] = [];
  const pending = new Map<
    string,
    { resolve: (v: string) => void; reject: (e: unknown) => void; shouldCancel: () => boolean }
  >();
  const queue = createMangaScanQueue<MangaScanKey, string>((r, shouldCancel) => {
    ran.push(`${r.mediaUrl}${r.force ? '!' : ''}`);
    return new Promise<string>((resolve, reject) => pending.set(r.mediaUrl, { resolve, reject, shouldCancel }));
  });
  const finish = async (url: string): Promise<void> => {
    const p = pending.get(url);
    if (!p) throw new Error(`${url} is not running`);
    pending.delete(url);
    if (p.shouldCancel()) p.reject(new MangaScanCancelled());
    else p.resolve(`page ${url}`);
    // Let the queue start the next job.
    await new Promise((r) => setTimeout(r, 0));
  };
  return { queue, ran, finish };
}

const req = (mediaUrl: string, itemId = 'm1', force = false): MangaScanKey => ({ itemId, mediaUrl, force });

describe('manga scan queue', () => {
  it('runs one scan at a time: the shown page, then read-ahead, then volume work', async () => {
    const { queue, ran, finish } = harness();
    const first = queue.request(req('p1'), 'background');
    const vol = queue.request(req('p2'), 'background');
    // As the reader sends them: the shown page, then the page after it.
    const shown = queue.request(req('p5'), 'page');
    const ahead = queue.request(req('p6'), 'prefetch');
    expect(ran).toEqual(['p1']);
    await finish('p1');
    expect(ran).toEqual(['p1', 'p5']);
    await finish('p5');
    expect(ran).toEqual(['p1', 'p5', 'p6']);
    await finish('p6');
    await finish('p2');
    await expect(Promise.all([first, vol, ahead, shown])).resolves.toEqual([
      'page p1',
      'page p2',
      'page p6',
      'page p5',
    ]);
  });

  it('a page turn cancels the scans of pages turned past, queued or running, but not volume work', async () => {
    const { queue, ran, finish } = harness();
    const old = queue.request(req('p1'), 'page');
    const oldAhead = queue.request(req('p2'), 'prefetch');
    const vol = queue.request(req('p9'), 'background');
    const oldStopped = expect(old).rejects.toSatisfy(isMangaOcrCancelled);
    const now = queue.request(req('p7'), 'page');
    await expect(oldAhead).rejects.toBeInstanceOf(MangaScanCancelled);
    // p1 was already running: it learns at its next check.
    await finish('p1');
    await oldStopped;
    expect(ran).toEqual(['p1', 'p7']);
    await finish('p7');
    await finish('p9');
    await expect(now).resolves.toBe('page p7');
    await expect(vol).resolves.toBe('page p9');
  });

  it('a page turn in one book leaves another book\'s scans alone', async () => {
    const { queue, finish } = harness();
    const other = queue.request(req('p1', 'm2'), 'page');
    const mine = queue.request(req('p4', 'm1'), 'page');
    await finish('p1');
    await finish('p4');
    await expect(other).resolves.toBe('page p1');
    await expect(mine).resolves.toBe('page p4');
  });

  it('joins a second request for the same page and lifts its priority', async () => {
    const { queue, ran, finish } = harness();
    const running = queue.request(req('p1'), 'background');
    const volume = queue.request(req('p2'), 'background');
    const shown = queue.request(req('p2'), 'page');
    const ahead = queue.request(req('p3'), 'prefetch');
    expect(shown).toBe(volume);
    await finish('p1');
    // p2 jumped ahead of the read-ahead.
    expect(ran).toEqual(['p1', 'p2']);
    await finish('p2');
    await finish('p3');
    await Promise.all([running, ahead]);
  });

  it('a forced rescan upgrades a queued plain scan, and plain requests join it', async () => {
    const { queue, ran, finish } = harness();
    const busy = queue.request(req('p0'), 'page');
    const plain = queue.request(req('p1'), 'prefetch');
    const forced = queue.request(req('p1', 'm1', true), 'prefetch');
    expect(forced).toBe(plain);
    await finish('p0');
    expect(ran).toEqual(['p0', 'p1!']);
    expect(queue.request(req('p1'), 'prefetch')).toBe(forced);
    await finish('p1');
    await busy;
  });

  it('a forced rescan of a page whose plain scan already started runs again after it', async () => {
    const { queue, ran, finish } = harness();
    const plain = queue.request(req('p1'), 'page');
    const forced = queue.request(req('p1', 'm1', true), 'page');
    expect(forced).not.toBe(plain);
    await finish('p1');
    expect(ran).toEqual(['p1', 'p1!']);
    await finish('p1');
    await expect(forced).resolves.toBe('page p1');
  });

  it('stops volume work at its own cancel, unless a reader joined it', async () => {
    const { queue, finish } = harness();
    let volumeCancelled = false;
    const a = queue.request(req('p1'), 'background', { shouldCancel: () => volumeCancelled });
    const b = queue.request(req('p2'), 'background', { shouldCancel: () => volumeCancelled });
    const reader = queue.request(req('p2'), 'prefetch');
    expect(reader).toBe(b);
    const aStopped = expect(a).rejects.toBeInstanceOf(MangaScanCancelled);
    volumeCancelled = true;
    await finish('p1');
    await aStopped;
    await finish('p2');
    await expect(b).resolves.toBe('page p2');
  });

  it('keeps going after a scan fails', async () => {
    const queue = createMangaScanQueue<MangaScanKey, string>(async (r) => {
      if (r.mediaUrl === 'bad') throw new Error('Could not decode page image.');
      return `page ${r.mediaUrl}`;
    });
    const bad = queue.request(req('bad'), 'page');
    const next = queue.request(req('ok'), 'prefetch');
    await expect(bad).rejects.toThrow(/decode/);
    await expect(next).resolves.toBe('page ok');
    expect(queue.size()).toBe(0);
  });
});
