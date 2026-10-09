// @vitest-environment node
/**
 * The tab / mic recorder's bookkeeping in the service worker:
 * (a) a stop that lands while chunks are uploading is never overwritten;
 * (b) rows a browser restart left `recording` are cleaned at startup;
 * (c) each chunk leaves IndexedDB as soon as the app acknowledged it;
 * (d) a locked app (HTTP 423) pauses the upload with the chunks kept, and it
 *     resumes when /v1/health reports `locked: false`;
 * (e) /finish is asked for asynchronously (202) and polled, with a timeout.
 */
import { describe, expect, it } from 'vitest';
import { POPUP_SENDER, bootBackground, type BackgroundHarness } from './extensionHarness';

const flush = (ms = 10) => new Promise((r) => setTimeout(r, ms));

interface Idb {
  get(store: string, key: string): Promise<Record<string, unknown> | undefined>;
  put(store: string, v: unknown): Promise<void>;
  getAllByIndex(store: string, index: string, value: unknown): Promise<unknown[]>;
}
const idbOf = (h: BackgroundHarness): Idb => (h.sandbox as unknown as { jpStudyIdb: Idb }).jpStudyIdb;

async function seed(h: BackgroundHarness, rec: Record<string, unknown>, seqs: number[]): Promise<void> {
  const idb = idbOf(h);
  await idb.put('recs', { id: 'r1', kind: 'tab', startedAt: Date.now() - 10_000, uploadedSeq: -1, chunks: seqs.length, ...rec });
  for (const seq of seqs) {
    await idb.put('chunks', { key: `r1:${String(seq).padStart(7, '0')}`, recId: 'r1', seq, data: `c${seq}`, size: 2 });
  }
}

async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, ms = 2000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v as T;
    if (Date.now() - start > ms) throw new Error('waitFor timed out');
    await flush(5);
  }
}

describe('recorder integrity', () => {
  it('(a) keeps a stop that arrives mid-upload, then finishes via 202 + /status', async () => {
    let h: BackgroundHarness | null = null;
    let stopSent = false;
    h = bootBackground({
      responder: (url, call) => {
        if (call.method === 'PUT' && !stopSent) {
          stopSent = true;
          // The offscreen document reports the stop while chunk 0 is in flight.
          void h!.send({ type: 'rec-stopped', recId: 'r1', durationMs: 4000 }, POPUP_SENDER);
        }
        if (url.endsWith('/finish')) return { status: 202, json: { ok: true, id: 'srv-1', state: 'finishing', pending: true } };
        if (url.endsWith('/status')) return { status: 200, json: { ok: true, state: 'finished', result: { ok: true, mediaId: 'm-1' } } };
        return { status: 200, json: { ok: true } };
      },
    });
    await seed(h, { status: 'recording', serverId: 'srv-1' }, [0, 1]);
    await h.send({ type: 'recording-upload', id: 'r1' }, POPUP_SENDER);
    const rec = await waitFor(async () => {
      const r = await idbOf(h!).get('recs', 'r1');
      return r && r.status === 'finished' ? r : null;
    });
    expect(rec).toMatchObject({ status: 'finished', durationMs: 4000, uploadedSeq: 1, result: { ok: true, mediaId: 'm-1' } });
    const finish = h.fetches.find((f) => f.url.endsWith('/finish'));
    expect(JSON.parse(String(finish?.body))).toMatchObject({ totalChunks: 2, async: true });
    expect(h.fetches.some((f) => f.url.endsWith('/v1/recordings/srv-1/status'))).toBe(true);
    expect(h.badgeText()).not.toBe('REC');
  });

  it('(c) drops each chunk once acknowledged, while still recording', async () => {
    const h = bootBackground();
    await seed(h, { status: 'recording', serverId: 'srv-2' }, [0, 1, 2]);
    await h.send({ type: 'recording-upload', id: 'r1' }, POPUP_SENDER);
    await flush();
    expect(await idbOf(h).getAllByIndex('chunks', 'recId', 'r1')).toEqual([]);
    const rec = await idbOf(h).get('recs', 'r1');
    expect(rec).toMatchObject({ status: 'recording', uploadedSeq: 2 });
    expect(h.fetches.some((f) => f.url.endsWith('/finish'))).toBe(false);
  });

  it('(c) keeps a chunk the app did not acknowledge', async () => {
    const h = bootBackground({ responder: (_url, call) => (call.method === 'PUT' ? { status: 500, json: { ok: false } } : { status: 200, json: { ok: true } }) });
    await seed(h, { status: 'recording', serverId: 'srv-3' }, [0]);
    await h.send({ type: 'recording-upload', id: 'r1' }, POPUP_SENDER);
    await flush();
    expect(await idbOf(h).getAllByIndex('chunks', 'recId', 'r1')).toHaveLength(1);
  });

  it('(b) marks rows left `recording` by a browser restart as stopped (no offscreen document)', async () => {
    const h = bootBackground({ responder: () => 'network-error' });
    await seed(h, { status: 'recording' }, [0]);
    await idbOf(h).put('recs', { id: 'r2', kind: 'mic', status: 'recording', chunks: 0, startedAt: Date.now() });
    for (const fn of h.chrome.listeners.onStartup ?? []) fn();
    const r1 = await waitFor(async () => {
      const r = await idbOf(h).get('recs', 'r1');
      return r && r.status !== 'recording' ? r : null;
    });
    expect(r1.status).toBe('stopped');
    expect((await idbOf(h).get('recs', 'r2'))?.status).toBe('failed');
    expect(h.badgeText()).not.toBe('REC');
  });

  it('(d) a 423 pauses the upload with every chunk kept, and resumes after the unlock', async () => {
    const app = { locked: true };
    const h = bootBackground({
      responder: (url) => {
        if (url.endsWith('/v1/health')) return { status: 200, json: { ok: true, locked: app.locked } };
        if (app.locked) return { status: 423, json: { ok: false, code: 'locked', error: 'Gum is locked' } };
        if (url.endsWith('/finish')) return { status: 200, json: { ok: true, id: 'srv-4', mediaId: 'm-4' } };
        return { status: 200, json: { ok: true } };
      },
    });
    await seed(h, { status: 'stopped', serverId: 'srv-4', durationMs: 6000 }, [0, 1, 2]);
    await h.send({ type: 'recording-upload', id: 'r1' }, POPUP_SENDER);
    await flush();
    // One refused PUT; the chunk was not acknowledged, so nothing left IndexedDB.
    const puts = () => h.fetches.filter((f) => f.method === 'PUT').length;
    expect(puts()).toBe(1);
    expect(await idbOf(h).getAllByIndex('chunks', 'recId', 'r1')).toHaveLength(3);
    expect(await idbOf(h).get('recs', 'r1')).toMatchObject({ status: 'stopped', uploadedSeq: -1, paused: 'locked' });

    // A recording still running pumps on every 2 s chunk: none of that reaches a locked app.
    for (let i = 0; i < 3; i++) await h.send({ type: 'rec-chunk', recId: 'r1', seq: 2, size: 2 }, POPUP_SENDER);
    await flush();
    expect(puts()).toBe(1);
    expect(h.fetches.some((f) => f.url.endsWith('/finish'))).toBe(false);

    app.locked = false;
    h.chrome.listeners.onAlarm[0]({ name: 'jpStudyFlushQueue' });
    const rec = await waitFor(async () => {
      const r = await idbOf(h).get('recs', 'r1');
      return r && r.status === 'finished' ? r : null;
    });
    expect(rec).toMatchObject({ status: 'finished', uploadedSeq: 2 });
    expect(rec.paused).toBeUndefined();
    expect(await idbOf(h).getAllByIndex('chunks', 'recId', 'r1')).toEqual([]);
    expect(h.fetches.filter((f) => f.method === 'PUT').map((f) => f.url.split('/').pop())).toEqual(['0', '0', '1', '2']);
  });

  it('(d) a 423 on /finish keeps the recording stopped until the unlock, then finishes it', async () => {
    const app = { locked: true };
    const h = bootBackground({
      responder: (url) => {
        if (url.endsWith('/v1/health')) return { status: 200, json: { ok: true, locked: app.locked } };
        if (app.locked) return { status: 423, json: { ok: false, code: 'locked', error: 'Gum is locked' } };
        if (url.endsWith('/finish')) return { status: 202, json: { ok: true, id: 'srv-5', state: 'finishing', pending: true } };
        if (url.endsWith('/status')) return { status: 200, json: { ok: true, state: 'finished', result: { ok: true, mediaId: 'm-5' } } };
        return { status: 200, json: { ok: true } };
      },
    });
    // Every chunk is already up; only /finish is left.
    await seed(h, { status: 'stopped', serverId: 'srv-5', uploadedSeq: 1, chunks: 2, durationMs: 3000 }, []);
    await h.send({ type: 'recording-upload', id: 'r1' }, POPUP_SENDER);
    await flush();
    expect(h.fetches.filter((f) => f.url.endsWith('/finish'))).toHaveLength(1);
    expect(await idbOf(h).get('recs', 'r1')).toMatchObject({ status: 'stopped', paused: 'locked' });

    // Still locked at the next tick: a health probe, no second /finish.
    h.chrome.listeners.onAlarm[0]({ name: 'jpStudyFlushQueue' });
    await flush();
    expect(h.fetches.filter((f) => f.url.endsWith('/finish'))).toHaveLength(1);

    app.locked = false;
    h.chrome.listeners.onAlarm[0]({ name: 'jpStudyFlushQueue' });
    const rec = await waitFor(async () => {
      const r = await idbOf(h).get('recs', 'r1');
      return r && r.status === 'finished' ? r : null;
    });
    expect(rec).toMatchObject({ status: 'finished', result: { ok: true, mediaId: 'm-5' } });
  });

  it('(b) leaves a session the live offscreen document still records', async () => {
    const h = bootBackground({ responder: () => 'network-error' });
    h.chrome.runtime.getContexts = (() => Promise.resolve([{ contextType: 'OFFSCREEN_DOCUMENT' }])) as never;
    h.chrome.runtime.sendMessage = ((msg: { type?: string }) =>
      Promise.resolve(msg?.type === 'offscreen-rec-list' ? { ok: true, ids: ['r1'] } : { ok: true })) as never;
    await seed(h, { status: 'recording' }, [0]);
    for (const fn of h.chrome.listeners.onStartup ?? []) fn();
    await flush(30);
    expect((await idbOf(h).get('recs', 'r1'))?.status).toBe('recording');
  });
});
