/*
 * extension/background.js — the offline retry queue.
 *
 * This is the whole of "saving works even when Gum is closed": every save
 * path catches its own failure, drops the payload into
 * `chrome.storage.local.jpStudyRetryQueue`, and tells the user it is queued. A
 * one-minute alarm and every later successful save drain it.
 *
 * It is pure logic over a storage stub — no DOM, no network beyond the fetch
 * the harness already controls — and it is reachable end to end through the
 * `save-text` / `clipboard-text` / `capture` / `flush` messages, so nothing
 * here needs production code to move.
 *
 * Four things decide whether an offline save is a feature or a data-loss bug,
 * and none of them were pinned before this file:
 *   - the order items go back to the app in;
 *   - what happens to an item that can never succeed;
 *   - which end of a full queue gets discarded;
 *   - and whether the badge tells the truth about how much is pending.
 *
 * The second of those was rebuilt on 2026-08-02: items now carry `attempts`,
 * flushQueue bounds them on age and on answered failures, and it returns a third
 * count — `dropped`. The tests that used to pin the unbounded behaviour (named
 * AUDIT) now assert the bounds, keeping the historical note in a comment. A
 * remaining AUDIT name means the behaviour under it is still considered wrong.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  RETRY_QUEUE_KEY,
  bootBackground,
  extensionMessage,
  readExtensionFile,
  type BackgroundHarness,
  type QueuedItem,
  type Responder,
} from './extensionHarness';

/* --------------------------------- helpers -------------------------------- */

/** Nothing is listening on the pairing port. */
const APP_DOWN: Responder = () => 'network-error';
/** The app answers everything happily. */
const APP_UP: Responder = () => ({ status: 200, json: { ok: true } });

/** background.js MAX_QUEUE: saves are never evicted; past it a new save is refused. */
const MAX_QUEUE = 200;

interface SaveResult {
  ok?: boolean;
  queued?: boolean;
  term?: string;
  error?: string;
}

interface FlushResult {
  flushed: number;
  left: number;
  /** Items the queue gave up on this pass. flushed + left + dropped === went in. */
  dropped: number;
}

interface ActivityEntry {
  kind: string;
  label: string;
  dropped?: string;
  queued?: boolean;
}

/** The popup's recent-activity list, newest first — where a drop is announced. */
async function activity(h: BackgroundHarness): Promise<ActivityEntry[]> {
  const res = (await h.send({ type: 'recent-activity' })) as { items: ActivityEntry[] };
  return res.items;
}

/** A queued item as an older build (or a previous session) would have left it. */
function aged(kind: string, payload: Record<string, unknown>, ageMs: number): QueuedItem {
  return { kind, payload, at: Date.now() - ageMs };
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** background.js's MAX_QUEUE_ATTEMPTS — answered failures only, see below. */
const MAX_ATTEMPTS = 10;

/** Every path that POSTs to the bridge, so a save can be made from a test. */
function saveWord(h: BackgroundHarness, text: string): Promise<SaveResult> {
  return h.send({ type: 'save-text', text, mode: 'word' }) as Promise<SaveResult>;
}

/** POST bodies only, in order — what the app would actually have received. */
function postedTo(h: BackgroundHarness, path: string): Array<Record<string, unknown>> {
  return h.fetches
    .filter((f) => f.method === 'POST' && f.url.endsWith(path))
    .map((f) => JSON.parse(String(f.body)) as Record<string, unknown>);
}

/** Forget the requests made while the app was down, so ordering reads clean. */
function forgetFetches(h: BackgroundHarness): void {
  h.fetches.length = 0;
}

/**
 * The alarm listener is `void flushQueue()` — fire and forget — so awaiting the
 * listener proves nothing. One macrotask turn lets the flush's promise chain
 * (storage get → fetch → storage set → badge) run to completion.
 */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/* ------------------------ what the source declares ------------------------ */

/**
 * `QUEUE_ENDPOINTS` and the `enqueue()` call sites are both module-private and
 * function-scoped once the harness wraps the module body, so neither can be
 * read out of the sandbox. Parsing them out of the source is the honest way to
 * assert the two lists agree — and it is what makes the coverage claim below
 * ("every kind the queue can hold is exercised") checkable rather than a hope.
 */
function declaredQueueKinds(): string[] {
  const source = readExtensionFile('background.js');
  const block = /const QUEUE_ENDPOINTS = \{([\s\S]*?)\n\};/.exec(source);
  if (!block) throw new Error('background.js no longer declares QUEUE_ENDPOINTS as an object literal');
  return [...block[1].matchAll(/^\s*'?([\w-]+)'?:/gm)].map((m) => m[1]);
}

function producedQueueKinds(): string[] {
  const source = readExtensionFile('background.js');
  // Every save path now goes through enqueueIfRetryable(kind, payload, err)
  // rather than calling enqueue() directly, so match both spellings — a direct
  // enqueue() reappearing is exactly the regression this list would hide.
  const kinds = [...source.matchAll(/\bawait enqueue(?:IfRetryable)?\(\s*'([\w-]+)'/g)].map((m) => m[1]);
  return [...new Set(kinds)].sort();
}

/* ============================== the basics =============================== */

describe('retry queue — a save the app could not take', () => {
  let h: BackgroundHarness;
  beforeEach(() => {
    h = bootBackground({ responder: APP_DOWN });
  });

  it('keeps the payload and reports success, not failure', async () => {
    const res = await saveWord(h, '猫が好き');
    // The user is told the save worked. That promise is only kept if the queue
    // survives the browser restart, which is why it lives in storage.local.
    expect(res.queued).toBe(true);
    expect(res.ok).toBe(true);
    expect(h.shared.formatSaveResultMessage(res)).toBe('Queued “猫が好き” — will sync when Gum is open');
  });

  it('stores the request whole, under the key the popup reads', async () => {
    await saveWord(h, '猫が好き');
    const stored = h.chrome.storage.local.data[RETRY_QUEUE_KEY] as QueuedItem[];
    expect(stored).toHaveLength(1);
    expect(stored[0].kind).toBe('mine');
    expect(stored[0].payload.text).toBe('猫が好き');
    // `at` exists but nothing ever reads it — see the ordering block below.
    expect(typeof stored[0].at).toBe('number');
  });

  it('counts the backlog for the popup header', async () => {
    await saveWord(h, 'one');
    await saveWord(h, 'two');
    const status = (await h.send({ type: 'status-summary' })) as { pending: number; app: boolean };
    expect(status.pending).toBe(2);
    expect(status.app).toBe(false);
  });

  it('re-arms the flush alarm on every queued save', async () => {
    const before = h.chrome.calls.filter((c) => c.api === 'alarms.create').length;
    await saveWord(h, 'one');
    // Without this, a save queued after the worker's last wake would sit until
    // the next browser start.
    expect(h.chrome.calls.filter((c) => c.api === 'alarms.create').length).toBeGreaterThan(before);
  });

  it('drains on the flush alarm, not just on a user gesture', async () => {
    await saveWord(h, 'one');
    h.respond(APP_UP);
    h.chrome.listeners.onAlarm[0]({ name: 'jpStudyFlushQueue' });
    await settle();
    expect(h.queue()).toHaveLength(0);
  });

  it('ignores an alarm that is not the flush alarm', async () => {
    await saveWord(h, 'one');
    h.respond(APP_UP);
    h.chrome.listeners.onAlarm[0]({ name: 'some-other-alarm' });
    await settle();
    expect(h.queue()).toHaveLength(1);
  });
});

/* =============================== the badge =============================== */

describe('retry queue — the toolbar badge', () => {
  it('shows nothing at zero, the count at one, and the raw count at many', async () => {
    const h = bootBackground({ responder: APP_DOWN });
    expect(h.badgeText()).toBe(null); // never touched before the first queued save

    await saveWord(h, 'one');
    expect(h.badgeText()).toBe('1');

    await saveWord(h, 'two');
    await saveWord(h, 'three');
    expect(h.badgeText()).toBe('3');

    h.respond(APP_UP);
    await h.send({ type: 'flush' });
    expect(h.badgeText()).toBe(''); // empty string, not '0'
  });

  it('paints the badge amber every time it writes it', async () => {
    const h = bootBackground({ responder: APP_DOWN });
    await saveWord(h, 'one');
    const colours = h.chrome.calls
      .filter((c) => c.api === 'action.setBadgeBackgroundColor')
      .map((c) => (c.args[0] as { color: string }).color);
    // MV3 loses the colour with the service worker, so it is re-set alongside
    // every text write rather than once at install. The first pair is the boot
    // repaint (fixed 2026-10-08: the badge used to be restored only on install).
    expect(colours.every((c) => c === '#946300')).toBe(true);
    expect(h.badgeHistory()).toEqual(['', '1']);
  });

  it('never abbreviates: a full queue reads as the number, not "40+"', async () => {
    const h = bootBackground({ responder: APP_DOWN });
    h.setQueue(Array.from({ length: MAX_QUEUE - 1 }, (_, i) => ({ kind: 'mine', payload: { text: `old ${i}` } })));
    await saveWord(h, 'newest');
    expect(h.badgeText()).toBe(String(MAX_QUEUE));
  });

  it('a flush of an already-empty queue corrects a stale badge', async () => {
    const h = bootBackground({ responder: APP_UP });
    await saveWord(h, 'one'); // succeeds, so nothing is queued
    // Fixed 2026-10-08: flushQueue used to return before writing the badge on an
    // empty queue, so a count left by a crashed write was never corrected.
    await h.chrome.action.setBadgeText({ text: '2' } as never);
    await h.send({ type: 'flush' });
    expect(h.badgeText()).toBe('');
  });

  it('AUDIT: the badge is only restored on install, never on a worker wake', () => {
    const source = readExtensionFile('background.js');
    // `queueCount().then(updateBadge)` sits inside the onInstalled listener,
    // and it is the only place a pending count is pushed to the badge without
    // a save or a flush happening first. Top-level code re-arms the alarm and
    // nothing else — so after a browser restart the toolbar reads empty with a
    // full queue behind it, until the one-minute alarm fires.
    const topLevel = source.slice(source.lastIndexOf('\n});') + 4);
    expect(topLevel).toContain('void ensureFlushAlarm();');
    expect(topLevel).not.toContain('updateBadge');
    expect(/onInstalled\.addListener\(\(\) => \{[\s\S]*?updateBadge/.test(source)).toBe(true);
  });
});

/* ============================== the ordering ============================== */

describe('retry queue — ordering', () => {
  it('replays the backlog in the order the saves were made', async () => {
    const h = bootBackground({ responder: APP_DOWN });
    for (const text of ['first', 'second', 'third']) await saveWord(h, text);
    expect(h.queue().map((q) => q.payload.text)).toEqual(['first', 'second', 'third']);

    h.respond(APP_UP);
    forgetFetches(h);
    const res = (await h.send({ type: 'flush' })) as FlushResult;
    expect(res).toEqual({ flushed: 3, left: 0, dropped: 0 });
    expect(postedTo(h, '/v1/mine').map((b) => b.text)).toEqual(['first', 'second', 'third']);
  });

  it('replays by array position, not by the timestamp it stores', async () => {
    const h = bootBackground({ responder: APP_UP });
    // Two items whose `at` says the opposite of their position. flushQueue
    // never sorts, so position wins — which also means same-millisecond saves
    // (the common case) have a defined order at all. Both are inside the age
    // bound; `at` decides expiry now, and nothing else.
    h.setQueue([
      aged('mine', { text: 'stored first' }, 2000),
      aged('mine', { text: 'stored second' }, 1000),
    ]);
    await h.send({ type: 'flush' });
    expect(postedTo(h, '/v1/mine').map((b) => b.text)).toEqual(['stored first', 'stored second']);
  });

  it('keeps the survivors of a partial flush in their original order', async () => {
    const h = bootBackground({ responder: APP_DOWN });
    for (const text of ['a', 'b', 'c', 'd']) await saveWord(h, text);

    // The app is back, but two of the four payloads hit a transient server
    // failure. A 5xx is the one answered failure that survives a flush — see
    // "which answered failures survive a flush" below.
    h.respond((_url, init) => {
      const body = JSON.parse(String(init.body)) as { text?: string };
      return body.text === 'b' || body.text === 'd'
        ? { status: 503, json: { error: 'Database is locked' } }
        : { status: 200, json: { ok: true } };
    });
    const res = (await h.send({ type: 'flush' })) as FlushResult;
    expect(res).toEqual({ flushed: 2, left: 2, dropped: 0 });
    expect(h.queue().map((q) => q.payload.text)).toEqual(['b', 'd']);
    expect(h.badgeText()).toBe('2');
  });

  it('AUDIT: a live save reaches the app before the backlog it is queued behind', async () => {
    const h = bootBackground({ responder: APP_DOWN });
    await saveWord(h, 'queued while offline');

    h.respond(APP_UP);
    forgetFetches(h);
    await saveWord(h, 'saved once back online');
    // saveText POSTs the new item first and only then calls flushQueue(), so
    // the app receives today's save before yesterday's. Every consumer that
    // orders by arrival (a "recent saves" list, an inbox) sees them inverted.
    // Swapping the two would mean an offline backlog blocks a live save, so
    // this is a real trade-off rather than an oversight — but it is a choice,
    // and it is undocumented in the file.
    expect(postedTo(h, '/v1/mine').map((b) => b.text)).toEqual([
      'saved once back online',
      'queued while offline',
    ]);
  });

  it('drains the backlog on the next successful save, without a user gesture', async () => {
    const h = bootBackground({ responder: APP_DOWN });
    await saveWord(h, 'queued');
    expect(h.queue()).toHaveLength(1);
    h.respond(APP_UP);
    await saveWord(h, 'live');
    expect(h.queue()).toHaveLength(0);
    expect(h.badgeText()).toBe('');
  });
});

/* ================================ the cap ================================ */

describe('retry queue — what a full queue discards', () => {
  it('never evicts a queued save: a full queue refuses the NEW save out loud', async () => {
    const h = bootBackground({ responder: APP_DOWN });
    // Fixed 2026-10-08. The queue used to drop its oldest save to make room, and
    // every one of those saves had been answered "Queued — will sync". Now the
    // saves already promised stay, and the one that does not fit says so.
    h.setQueue(Array.from({ length: MAX_QUEUE }, (_, i) => ({ kind: 'mine', payload: { text: `old ${i}` } })));
    const res = await saveWord(h, 'one too many');
    expect(res.ok).toBe(false);
    expect(res.queued).toBeUndefined();
    const queue = h.queue();
    expect(queue).toHaveLength(MAX_QUEUE);
    expect(queue[0].payload.text).toBe('old 0');
  });

  it('keeps every item of an over-long queue left by an older build', async () => {
    const h = bootBackground({ responder: APP_DOWN });
    h.setQueue(Array.from({ length: 60 }, (_, i) => ({ kind: 'mine', payload: { text: `old ${i}` } })));
    await saveWord(h, 'new');
    const queue = h.queue();
    expect(queue).toHaveLength(61);
    expect(queue[0].payload.text).toBe('old 0');
    expect(queue[queue.length - 1].payload.text).toBe('new');
  });

  it('a save made while a flush is in flight is neither lost nor sent twice', async () => {
    const h = bootBackground({ responder: APP_DOWN });
    for (const text of ['a', 'b']) await saveWord(h, text);
    // The app comes back slowly: the flush is still waiting on its first POST
    // when the user saves again (and the app is down for that save).
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let calls = 0;
    h.respond(() => {
      calls += 1;
      return { status: 200, json: { ok: true } };
    });
    const realFetch = (h.sandbox as unknown as { fetch: (...a: unknown[]) => Promise<unknown> }).fetch;
    (h.sandbox as unknown as { fetch: unknown }).fetch = async (...a: unknown[]) => {
      await gate;
      return realFetch(...a);
    };
    const flushing = h.send({ type: 'flush' });
    const second = h.send({ type: 'flush' }); // overlapping flush joins the first
    // Enqueue directly while the flush is mid-flight (the save itself would hit the gate too).
    await new Promise((r) => setTimeout(r, 0));
    const queueNow = h.queue();
    h.setQueue([...queueNow, { id: 'late', kind: 'mine', payload: { text: 'late' }, at: Date.now() } as never]);
    release();
    await Promise.all([flushing, second]);
    expect(calls).toBe(2); // a and b once each, not twice
    expect(h.queue().map((q) => q.payload.text)).toEqual(['late']);
  });

  it('does not trim while flushing, so a failing flush cannot shrink the queue', async () => {
    const h = bootBackground({ responder: APP_DOWN });
    h.setQueue(Array.from({ length: 60 }, (_, i) => ({ kind: 'mine', payload: { text: `old ${i}` } })));
    await h.send({ type: 'flush' });
    // flushQueue writes back exactly the items that failed; only enqueue()
    // enforces MAX_QUEUE.
    expect(h.queue()).toHaveLength(60);
  });
});

/* ====================== an item that never succeeds ====================== */

describe('retry queue — an item that can never succeed', () => {
  it('drops a permanently rejected payload on the first flush that sees the rejection', async () => {
    const h = bootBackground({ responder: APP_DOWN });
    await saveWord(h, 'poison');
    // Fixed 2026-08-02. A 400 is not a transient failure — this payload will be
    // rejected identically every time — but flushQueue's catch did not look at
    // the status and the item carried no attempt count or deadline, so it was
    // retried once a minute until 40 newer saves pushed it off the front.
    h.respond(() => ({ status: 400, json: { error: 'Malformed note' } }));
    const res = (await h.send({ type: 'flush' })) as FlushResult;
    expect(res).toEqual({ flushed: 0, left: 0, dropped: 1 });
    expect(h.queue()).toHaveLength(0);
    expect(h.badgeText()).toBe('');
    // Dropping is only defensible because it is said out loud somewhere the
    // user can find it. The activity list is that somewhere.
    expect(await activity(h)).toContainEqual(
      expect.objectContaining({ kind: 'mine', label: 'poison', dropped: 'rejected' }),
    );

    // A second flush has nothing left to do — no silent re-queue behind it.
    expect(await h.send({ type: 'flush' })).toEqual({ flushed: 0, left: 0, dropped: 0 });
  });

  it('drops the backlog when the token is stale, instead of retrying it forever', async () => {
    const h = bootBackground({ responder: APP_DOWN });
    for (const text of ['a', 'b']) await saveWord(h, text);
    h.respond(() => ({ status: 401, json: { error: 'Unauthorized' } }));
    const res = (await h.send({ type: 'flush' })) as FlushResult;
    // Fixed 2026-08-02. The app is running and reachable; the pairing token is
    // stale. Nothing in this loop used to distinguish that from "app is closed",
    // so the badge sat at 2 forever and the user was never told to re-pair.
    // Waiting cannot fix a refused token, so these are dropped and reported
    // under their own reason rather than the generic one.
    expect(res).toEqual({ flushed: 0, left: 0, dropped: 2 });
    expect(h.badgeText()).toBe('');
    // Both drops are announced under their own reason, alongside the two
    // "queued" entries the saves themselves left.
    expect((await activity(h)).filter((a) => a.dropped).map((a) => a.dropped)).toEqual([
      'auth',
      'auth',
    ]);
  });

  it('retries a 5xx, because the app agreed to the save and then fell over', async () => {
    const h = bootBackground({ responder: APP_DOWN });
    await saveWord(h, 'survives');
    // The save site reports a 500 rather than queueing it (the user is watching
    // a toast there). Once the item IS queued the calculus flips: nobody is
    // watching, we already promised it would sync, and a locked database or a
    // model still warming up clears on its own. So a queued item survives a
    // 5xx — bounded, see below.
    h.respond(() => ({ status: 500, json: { error: 'Database is locked' } }));
    const res = (await h.send({ type: 'flush' })) as FlushResult;
    expect(res).toEqual({ flushed: 0, left: 1, dropped: 0 });
    expect(h.queue()[0].payload.text).toBe('survives');

    h.respond(APP_UP);
    expect(await h.send({ type: 'flush' })).toEqual({ flushed: 1, left: 0, dropped: 0 });
  });

  it('gives up on a 5xx after MAX_QUEUE_ATTEMPTS, counting only answered failures', async () => {
    const h = bootBackground({ responder: APP_DOWN });
    await saveWord(h, 'never lands');

    // Ten minutes of a closed app must NOT consume the attempt budget — that is
    // the case the queue exists for, and the flush alarm fires once a minute.
    for (let i = 0; i < 15; i++) await h.send({ type: 'flush' });
    expect(h.queue()).toHaveLength(1);
    expect(h.queue()[0].attempts ?? 0).toBe(0);

    h.respond(() => ({ status: 503, json: { error: 'Still starting' } }));
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      const res = (await h.send({ type: 'flush' })) as FlushResult;
      expect({ i, ...res }).toEqual({ i, flushed: 0, left: 1, dropped: 0 });
      expect(h.queue()[0].attempts).toBe(i);
    }
    const last = (await h.send({ type: 'flush' })) as FlushResult;
    expect(last).toEqual({ flushed: 0, left: 0, dropped: 1 });
    expect(h.queue()).toHaveLength(0);
    expect(await activity(h)).toContainEqual(
      expect.objectContaining({ kind: 'mine', label: 'never lands', dropped: 'attempts' }),
    );
  });

  it('drops an item older than the age bound before it is even sent', async () => {
    const h = bootBackground({ responder: APP_UP });
    h.setQueue([
      aged('mine', { text: 'from last week' }, 8 * DAY_MS),
      aged('mine', { text: 'from yesterday' }, 1 * DAY_MS),
    ]);
    const res = (await h.send({ type: 'flush' })) as FlushResult;
    // No request is made for the expired one — a save the user made eight days
    // ago arriving now is not a favour, and the app may well have moved on.
    expect(res).toEqual({ flushed: 1, left: 0, dropped: 1 });
    expect(postedTo(h, '/v1/mine').map((b) => b.text)).toEqual(['from yesterday']);
    expect(await activity(h)).toContainEqual(
      expect.objectContaining({ label: 'from last week', dropped: 'expired' }),
    );
  });

  it('gives an undated legacy item an `at`, so the age bound covers it too', async () => {
    const h = bootBackground({ responder: APP_DOWN });
    // An older build stored items without a timestamp. Left alone these would be
    // the one shape no bound applies to — immortal by omission.
    h.setQueue([{ kind: 'mine', payload: { text: 'no timestamp' } }]);
    await h.send({ type: 'flush' });
    expect(h.queue()[0].at).toEqual(expect.any(Number));
    expect(Date.now() - (h.queue()[0].at as number)).toBeLessThan(60_000);
  });

  it('every attempt re-reads the token, so re-pairing fixes the backlog', async () => {
    const h = bootBackground({ responder: APP_DOWN });
    await saveWord(h, 'a');
    h.chrome.storage.local.data.jpStudyToken = 'fresh-token';
    h.respond((_url, init) => ({ status: 200, json: { ok: true, sawBody: init.body != null } }));
    await h.send({ type: 'flush' });
    const flushCall = h.fetches.filter((f) => f.url.endsWith('/v1/mine')).pop();
    expect(flushCall).toBeDefined();
    expect(h.queue()).toHaveLength(0);
  });
});

/* ===================== a locked app (HTTP 423 `locked`) ==================== */

/**
 * The app's lockscreen: /v1/health answers `{ locked }`, every content route
 * answers 423 `{ code: 'locked' }` while it is true (src/main/lockGuard.ts).
 */
function lockableApp(state: { locked: boolean }): Responder {
  return (url) => {
    if (url.endsWith('/v1/health')) return { status: 200, json: { ok: true, version: 1, locked: state.locked } };
    return state.locked
      ? { status: 423, json: { ok: false, code: 'locked', error: 'Gum is locked' } }
      : { status: 200, json: { ok: true } };
  };
}

/** Let a fire-and-forget alarm run its health probe and the flush behind it. */
async function settleLong(): Promise<void> {
  for (let i = 0; i < 5; i++) await settle();
}

describe('retry queue — a locked app is retried later, never dropped', () => {
  it('keeps every queued item through a 423 flush, uncounted, and stops at the first refusal', async () => {
    const h = bootBackground({ responder: APP_DOWN });
    for (const text of ['a', 'b', 'c']) await saveWord(h, text);
    const app = { locked: true };
    h.respond(lockableApp(app));
    forgetFetches(h);

    const res = (await h.send({ type: 'flush' })) as FlushResult & { locked?: boolean };
    // Was: a 423 is a 4xx, so all three were dropped as `rejected` on the spot.
    expect(res).toEqual({ flushed: 0, left: 3, dropped: 0, locked: true });
    expect(h.queue().map((q) => q.payload.text)).toEqual(['a', 'b', 'c']);
    expect(h.queue().every((q) => (q.attempts ?? 0) === 0)).toBe(true);
    // One refused POST, not one per item.
    expect(postedTo(h, '/v1/mine').map((b) => b.text)).toEqual(['a']);
    expect((await activity(h)).some((a) => a.dropped)).toBe(false);
    expect(h.badgeText()).toBe('3');
  });

  it('while locked, the alarm only asks /v1/health — once per tick — and sends nothing', async () => {
    const h = bootBackground({ responder: APP_DOWN });
    await saveWord(h, 'waiting');
    const app = { locked: true };
    h.respond(lockableApp(app));
    await h.send({ type: 'flush' }); // learns the lock from the 423
    forgetFetches(h);

    for (let i = 0; i < 3; i++) {
      h.chrome.listeners.onAlarm[0]({ name: 'jpStudyFlushQueue' });
      await settleLong();
    }
    expect(h.fetches.map((f) => new URL(f.url).pathname)).toEqual(['/v1/health', '/v1/health', '/v1/health']);
    expect(h.queue()).toHaveLength(1);
    // The flag survives a worker restart, so a woken worker does not replay first.
    expect(typeof h.chrome.storage.local.data.jpStudyAppLocked).toBe('number');
  });

  it('flushes in order on the first tick after /v1/health reports locked: false', async () => {
    const h = bootBackground({ responder: APP_DOWN });
    for (const text of ['first', 'second']) await saveWord(h, text);
    const app = { locked: true };
    h.respond(lockableApp(app));
    await h.send({ type: 'flush' });
    expect(h.queue()).toHaveLength(2);

    app.locked = false;
    forgetFetches(h);
    h.chrome.listeners.onAlarm[0]({ name: 'jpStudyFlushQueue' });
    await settleLong();
    expect(h.fetches[0].url.endsWith('/v1/health')).toBe(true);
    expect(postedTo(h, '/v1/mine').map((b) => b.text)).toEqual(['first', 'second']);
    expect(h.queue()).toHaveLength(0);
    expect(h.badgeText()).toBe('');
    expect(h.chrome.storage.local.data.jpStudyAppLocked).toBeUndefined();
  });

  it('a save made while locked is queued and says why, in the UI language', async () => {
    const app = { locked: true };
    const h = bootBackground({ responder: lockableApp(app) });
    const res = (await saveWord(h, '猫')) as SaveResult & { locked?: boolean };
    expect(res).toMatchObject({ ok: true, queued: true, locked: true });
    expect(h.shared.formatSaveResultMessage(res)).toBe(extensionMessage('common_queuedLocked'));
    expect(h.queue().map((q) => q.payload.text)).toEqual(['猫']);

    // Unlocking is noticed by the popup's status probe too, which drains at once.
    app.locked = false;
    await h.send({ type: 'status-summary' });
    await settleLong();
    expect(h.queue()).toHaveLength(0);
  });

  it('reading time waits for the unlock instead of being thrown away', async () => {
    const app = { locked: true };
    const h = bootBackground({ responder: lockableApp(app) });
    const res = await h.send({ type: 'immersion-visit', url: 'https://example.com/a', seconds: 30, chars: 100 });
    expect(res).toEqual({ ok: true, queued: true, locked: true });
    expect(h.chrome.storage.local.data.jpStudyImmersionQueue).toHaveLength(1);
  });
});

/* ============================ the kind mapping =========================== */

describe('retry queue — the kinds it knows how to replay', () => {
  const endpoints: Record<string, string> = {
    inbox: '/v1/inbox',
    mine: '/v1/mine',
    capture: '/v1/capture',
    playlist: '/v1/playlist',
    video: '/v1/video',
    download: '/v1/download',
    clipboard: '/v1/clipboard',
    'audio-save': '/v1/audio/save',
    'manga-import': '/v1/manga-import',
    immersion: '/v1/immersion/visit',
  };

  it('declares exactly these kinds', () => {
    expect(declaredQueueKinds()).toEqual(Object.keys(endpoints));
  });

  it('replays every declared kind to its own endpoint', async () => {
    const h = bootBackground({ responder: APP_UP });
    h.setQueue(Object.keys(endpoints).map((kind) => ({ kind, payload: { marker: kind } })));
    const res = (await h.send({ type: 'flush' })) as FlushResult;
    expect(res).toEqual({ flushed: Object.keys(endpoints).length, left: 0, dropped: 0 });
    expect(h.fetches.map((f) => new URL(f.url).pathname)).toEqual(Object.values(endpoints));
    // The stored payload is replayed verbatim — the queue is a request log,
    // not a model, so a payload shape change on the app side breaks old items.
    expect(postedTo(h, '/v1/mine')).toEqual([{ marker: 'mine' }]);
  });

  it('drops an item whose kind it no longer recognises, and counts the drop', async () => {
    const h = bootBackground({ responder: APP_UP });
    h.setQueue([
      { kind: 'mine', payload: { text: 'keep' } },
      { kind: 'some-kind-from-2024', payload: { text: 'lost' } },
    ]);
    const res = (await h.send({ type: 'flush' })) as FlushResult;
    // Dropping is deliberate — the alternative is an item that can never leave
    // the queue. It used to be counted as neither flushed nor left, so the
    // numbers the popup showed did not add up to what went in; now the three
    // sum to the queue length and the drop reaches the activity list.
    expect(res).toEqual({ flushed: 1, left: 0, dropped: 1 });
    expect(res.flushed + res.left + res.dropped).toBe(2);
    expect(h.queue()).toHaveLength(0);
    expect(h.fetches).toHaveLength(1);
    expect(await activity(h)).toContainEqual(
      expect.objectContaining({ kind: 'some-kind-from-2024', dropped: 'unknown-kind' }),
    );
  });

  it('four of the ten declared kinds are only reachable from an older build', () => {
    const produced = producedQueueKinds();
    expect(produced).toEqual([
      'audio-save',
      'capture',
      'clipboard',
      'download',
      'manga-import',
      'mine',
    ]);
    // inbox / playlist / video have endpoints but no enqueue() call anywhere,
    // and since 2026-10-08 reading time has its own merged store
    // (jpStudyImmersionQueue), so `immersion` items only exist in a queue an
    // older build left. They are kept so those stored items still replay.
    const orphans = declaredQueueKinds().filter((k) => !produced.includes(k));
    expect(orphans).toEqual(['inbox', 'playlist', 'video', 'immersion']);
    expect(produced.filter((k) => !declaredQueueKinds().includes(k))).toEqual([]);
  });
});

/* ====================== when the queue itself cannot ===================== */

describe('retry queue — storage that refuses the write', () => {
  /** Make the queue write fail the way a full 10 MB storage.local does. */
  function fillStorage(h: BackgroundHarness): void {
    const real = h.chrome.storage.local.set.bind(h.chrome.storage.local);
    h.chrome.storage.local.set = (items: Record<string, unknown>) =>
      RETRY_QUEUE_KEY in items
        ? Promise.reject(new Error('QUOTA_BYTES quota exceeded'))
        : real(items);
  }

  it('fails the save loudly instead of losing it to a rejected write', async () => {
    const h = bootBackground({ responder: APP_DOWN });
    fillStorage(h);
    const res = await saveWord(h, '猫が好き');
    // The unhandled rejection this used to be swallowed the payload *and* left
    // the "Queued — will sync" answer standing. This manifest asks for no
    // unlimitedStorage and a queued audio save carries a base64 data URL, so
    // the quota is reachable in ordinary use, not just in a test.
    expect(res.queued).toBeUndefined();
    expect(res.ok).toBe(false);
    expect(res.error).toBe(
      'Local storage is full — open Gum to sync the queued items, then retry.',
    );
    expect(h.queue()).toHaveLength(0);
  });

  it('leaves the badge alone when the write it would describe did not happen', async () => {
    const h = bootBackground({ responder: APP_DOWN });
    await saveWord(h, 'one');
    expect(h.badgeText()).toBe('1');
    fillStorage(h);
    await saveWord(h, 'two');
    // updateBadge sits after the set, so a badge of 2 over a stored queue of 1
    // is not reachable: the count on the toolbar still matches storage.
    expect(h.badgeText()).toBe('1');
    expect(h.queue()).toHaveLength(1);
  });
});

/* ========================= which failures queue ========================== */

describe('retry queue — which failures queue and which just fail', () => {
  it('queues a page capture and reports the page as saved', async () => {
    const h = bootBackground({
      responder: APP_DOWN,
      globals: {
        document: { title: 'An article', documentElement: { outerHTML: '<html></html>' } },
        location: { href: 'https://example.com/article' },
        window: { getSelection: () => '' },
      },
    });
    h.chrome.scripting.executeScript = ((opts: { func?: () => unknown }) =>
      Promise.resolve([{ result: opts.func ? opts.func() : null }])) as typeof h.chrome.scripting.executeScript;

    const res = (await h.send({ type: 'capture' })) as SaveResult;
    expect(res.queued).toBe(true);
    expect(h.shared.formatCaptureResultMessage(res)).toBe('Page queued — will sync when Gum is open');
    expect(h.queue().map((q) => q.kind)).toEqual(['capture']);
  });

  it('queues a clipboard add and reports it as added', async () => {
    const h = bootBackground({ responder: APP_DOWN });
    const res = (await h.send({ type: 'clipboard-text', text: 'メモ' })) as SaveResult;
    expect(res.queued).toBe(true);
    expect(h.shared.formatClipboardResultMessage(res)).toBe('Queued — will sync when Gum is open');
    expect(h.queue().map((q) => q.kind)).toEqual(['clipboard']);
  });

  it('queues a video download and answers queued, not failed', async () => {
    const h = bootBackground({
      responder: APP_DOWN,
      tab: { id: 7, windowId: 1, url: 'https://www.youtube.com/watch?v=abcdefghijk', title: 'A video', active: true },
      seed: { jpStudySettings: { version: 2, youtubeMode: 'download' } },
    });
    const res = (await h.send({ type: 'run-command', command: 'media.download' })) as SaveResult;
    // Fixed 2026-10-08: it used to re-throw after enqueueing, so the toast said
    // "failed" for a download that then ran.
    expect(res.ok).toBe(true);
    expect(res.queued).toBe(true);
    expect(h.queue().map((q) => q.kind)).toEqual(['download']);
  });

  it('queues a stored recording and answers queued', async () => {
    const h = bootBackground({
      responder: APP_DOWN,
      onTabMessage: (msg) =>
        msg.type === 'jp-get-audio-clipboard'
          ? { dataUrl: 'data:audio/webm;base64,AAAA', mimeType: 'audio/webm' }
          : { ok: true },
    });
    const res = (await h.send({ type: 'run-command', command: 'capture.audio.save' })) as SaveResult;
    expect(res.ok).toBe(true);
    expect(res.queued).toBe(true);
    expect(h.queue().map((q) => q.kind)).toEqual(['audio-save']);
    // The clip is cleared once queued, so a second Save cannot make a duplicate card.
    expect(h.sentToTab.map((s) => s.type)).toContain('jp-clear-audio-clipboard');
  });

  it('immersion logging queues only a genuine offline failure', async () => {
    const h = bootBackground({ responder: APP_DOWN });
    const queued = (await h.send({
      type: 'immersion-visit',
      url: 'https://example.com/a',
      seconds: 60,
      chars: 900,
    })) as SaveResult;
    expect(queued).toEqual({ ok: true, queued: true });
    // Reading time never enters the save queue (it used to evict real saves).
    expect(h.queue()).toEqual([]);
    expect(h.chrome.storage.local.data.jpStudyImmersionQueue).toEqual([
      expect.objectContaining({ url: 'https://example.com/a', seconds: 60 }),
    ]);

    // A 500 from a running app is not queued — it is reported. This is the
    // only enqueue site in the file that checks `err.offline` first, and it is
    // the behaviour the other six arguably want.
    h.respond(() => ({ status: 500, json: { error: 'Database is locked' } }));
    const failed = (await h.send({
      type: 'immersion-visit',
      url: 'https://example.com/b',
      seconds: 60,
      chars: 900,
    })) as SaveResult;
    expect(failed).toEqual({ ok: false, error: 'Database is locked' });
    expect(h.queue()).toHaveLength(0);
  });

  it('merges reading time per page instead of queueing one heartbeat per minute', async () => {
    const h = bootBackground({ responder: APP_DOWN });
    for (let i = 0; i < 5; i++) {
      await h.send({ type: 'immersion-visit', url: 'https://example.com/a', seconds: 60, chars: 900 });
    }
    const store = h.chrome.storage.local.data.jpStudyImmersionQueue as Array<{ seconds: number }>;
    expect(store).toHaveLength(1);
    expect(store[0].seconds).toBe(300);
    h.respond(APP_UP);
    await h.send({ type: 'flush' });
    expect(h.fetches.filter((f) => f.url.endsWith('/v1/immersion/visit') && f.method === 'POST').length).toBeGreaterThan(0);
    expect(h.chrome.storage.local.data.jpStudyImmersionQueue).toEqual([]);
  });

  it('a lookup is never queued — a stale answer is worth nothing', async () => {
    const h = bootBackground({ responder: APP_DOWN });
    const res = (await h.send({ type: 'lookup', query: '猫' })) as SaveResult & { offline?: boolean };
    expect(res.ok).toBe(false);
    expect(res.offline).toBe(true);
    expect(h.queue()).toHaveLength(0);
  });
});
