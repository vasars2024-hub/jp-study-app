// @vitest-environment node
/**
 * The qBittorrent completion poller, on a fake clock with a scripted client.
 * The properties that matter are the ones that protect the user's client: a
 * refused login stops polling, an unreachable client backs off, the first poll
 * is a baseline, and a finished torrent is imported exactly once.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SCRAPER_QBITTORRENT_SETTINGS, type ScraperQbittorrentSettings } from '../../shared/scraperSourceSettings';
import type { MediaIngestHint, QbitTorrentSnapshot } from '../../shared/mediaIngest';
import { ingestPathKey } from '../../shared/mediaIngest';
import {
  QBIT_BACKOFF_MIN_MS,
  QBIT_POLL_ACTIVE_MS,
  QBIT_POLL_IDLE_MS,
  QBIT_UNRESOLVED_RETRIES,
  createQbitCompletionPoller,
  type QbitPollerDeps,
  type QbitPollerState,
} from '../mediaIngestQbit';
import type { QbitPollOutcome } from '../scraper/qbittorrent';

let clock = 0;
let queue: { fn: () => void; at: number; cancelled: boolean }[] = [];
let state: QbitPollerState;
let polls: Array<QbitPollOutcome<QbitTorrentSnapshot[]>>;
let pollCount: number;
let ingested: Array<{ paths: string[]; hint: MediaIngestHint | undefined; hash: string }>;
let savePaths: string[];
let ledger: Map<string, MediaIngestHint>;
let enabled: boolean;
let credential: boolean;

const config: ScraperQbittorrentSettings = {
  ...DEFAULT_SCRAPER_QBITTORRENT_SETTINGS,
  enabled: true,
  host: '127.0.0.1',
  authMode: 'apiKey',
  apiKeyRef: 'qbit/key',
};

function schedule(fn: () => void, ms: number) {
  const job = { fn, at: clock + ms, cancelled: false };
  queue.push(job);
  return { cancel: () => { job.cancelled = true; } };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

async function advance(ms: number): Promise<void> {
  const until = clock + ms;
  for (;;) {
    await flush();
    const due = queue.filter((job) => !job.cancelled && job.at <= until).sort((a, b) => a.at - b.at)[0];
    if (!due) break;
    clock = Math.max(clock, due.at);
    due.cancelled = true;
    due.fn();
  }
  clock = until;
  await flush();
}

function torrent(patch: Partial<QbitTorrentSnapshot> = {}): QbitTorrentSnapshot {
  return {
    hash: 'a'.repeat(40),
    name: 'Show - 01',
    rawState: 'uploading',
    progress: 1,
    savePath: 'D:\\Downloads',
    contentPath: 'D:\\Downloads\\Show - 01.mkv',
    category: '',
    tags: [],
    ...patch,
  };
}

function deps(patch: Partial<QbitPollerDeps> = {}): QbitPollerDeps {
  return {
    now: () => clock,
    schedule,
    getConfig: () => config,
    isEnabled: () => enabled,
    hasCredential: async () => credential,
    poll: async () => {
      pollCount += 1;
      return (polls.length > 1 ? polls.shift() : undefined) ?? polls[0];
    },
    files: async () => ({ ok: true, value: [] }),
    defaultSavePath: async () => ({ ok: true, value: 'D:\\Downloads' }),
    state,
    saveState: () => undefined,
    ledgerHashes: () => new Set(ledger.keys()),
    ledgerHint: (hash) => ledger.get(hash),
    resolveFiles: (t) => [t.contentPath],
    ingest: async (paths, hint, t) => { ingested.push({ paths, hint, hash: t.hash }); },
    onSavePath: (savePath) => { savePaths.push(savePath); },
    onStatus: () => undefined,
    ignoreCategories: new Set(['jp-study-subtitles']),
    keyOf: (value) => ingestPathKey(value),
    ...patch,
  };
}

beforeEach(() => {
  clock = 0;
  queue = [];
  state = { handled: new Set(), baselined: false };
  polls = [{ ok: true, value: [] }];
  pollCount = 0;
  ingested = [];
  savePaths = [];
  ledger = new Map();
  enabled = true;
  credential = true;
});

describe('the first poll', () => {
  it('is a baseline: old finished torrents are recorded, not imported', async () => {
    polls = [{ ok: true, value: [torrent()] }];
    const poller = createQbitCompletionPoller(deps());
    poller.start();
    await poller.firstPoll();
    expect(ingested).toEqual([]);
    expect(state.baselined).toBe(true);
    expect(state.handled.has('a'.repeat(40))).toBe(true);
    expect(poller.status()).toBe('watching');
    // …and registers qBittorrent's save path as a watch folder.
    expect(savePaths).toEqual(['D:\\Downloads']);
  });

  it('still imports a torrent the app itself handed off', async () => {
    const hash = 'b'.repeat(40);
    ledger.set(hash, { malId: 52_991, episodes: [5] });
    polls = [{ ok: true, value: [torrent({ hash })] }];
    const poller = createQbitCompletionPoller(deps());
    poller.start();
    await poller.firstPoll();
    expect(ingested).toEqual([{ paths: ['D:\\Downloads\\Show - 01.mkv'], hint: { malId: 52_991, episodes: [5] }, hash }]);
  });
});

describe('after the baseline', () => {
  it('imports a torrent when it finishes, once, with the identity from its tags', async () => {
    state.baselined = true;
    const downloading = torrent({ progress: 0.4, rawState: 'downloading', tags: ['gum', 'gum:al:154587'] });
    polls = [
      { ok: true, value: [downloading] },
      { ok: true, value: [{ ...downloading, progress: 1, rawState: 'stalledUP' }] },
    ];
    const poller = createQbitCompletionPoller(deps());
    poller.start();
    await poller.firstPoll();
    expect(ingested).toEqual([]);
    // Something is downloading, so the next look comes on the short interval.
    await advance(QBIT_POLL_ACTIVE_MS);
    expect(ingested).toHaveLength(1);
    expect(ingested[0].hint).toEqual({ anilistId: 154_587, provider: 'tags', category: 'anime' });
    await advance(QBIT_POLL_IDLE_MS * 3);
    expect(ingested).toHaveLength(1);
  });

  it('claims a file inside an unfinished torrent so no watch folder imports it early', async () => {
    state.baselined = true;
    polls = [{ ok: true, value: [torrent({ progress: 0.5, rawState: 'downloading', contentPath: 'D:\\Downloads\\Batch' })] }];
    const poller = createQbitCompletionPoller(deps());
    poller.start();
    await poller.firstPoll();
    expect(poller.claims('d:/downloads/batch/01.mkv')).toBe(true);
    expect(poller.claims('D:\\Downloads\\other.mkv')).toBe(false);
  });

  it('claims the subtitle fetches’ files but never imports them', async () => {
    state.baselined = true;
    polls = [{ ok: true, value: [torrent({ category: 'jp-study-subtitles' })] }];
    const poller = createQbitCompletionPoller(deps());
    poller.start();
    await poller.firstPoll();
    expect(ingested).toEqual([]);
    expect(poller.claims('D:\\Downloads\\Show - 01.mkv')).toBe(true);
  });
});

describe('protecting the user’s client', () => {
  it('stops polling after a refused login instead of risking a WebUI ban', async () => {
    polls = [{ ok: false, reason: 'rejected', status: 'unauthorized' }];
    const poller = createQbitCompletionPoller(deps());
    poller.start();
    await poller.firstPoll();
    expect(poller.status()).toBe('unauthorized');
    await advance(60 * 60_000);
    expect(pollCount).toBe(1);
  });

  it('backs off while qBittorrent is not answering, doubling the wait', async () => {
    polls = [{ ok: false, reason: 'refused', status: 'unreachable' }];
    const poller = createQbitCompletionPoller(deps());
    poller.start();
    await poller.firstPoll();
    expect(pollCount).toBe(1);
    await advance(QBIT_BACKOFF_MIN_MS);
    expect(pollCount).toBe(2);
    await advance(QBIT_BACKOFF_MIN_MS);
    expect(pollCount).toBe(2);
    await advance(QBIT_BACKOFF_MIN_MS);
    expect(pollCount).toBe(3);
    expect(poller.status()).toBe('unreachable');
    // Nothing is claimed while the list is unknown: the watch folders carry on.
    expect(poller.claims('D:\\Downloads\\Show - 01.mkv')).toBe(false);
  });

  it('does not call the client at all without a stored credential', async () => {
    credential = false;
    const poll = vi.fn();
    const poller = createQbitCompletionPoller(deps({ poll }));
    poller.start();
    await poller.firstPoll();
    expect(poll).not.toHaveBeenCalled();
    expect(poller.status()).toBe('not-configured');
  });

  it('is silent while automatic import is off', async () => {
    enabled = false;
    const poll = vi.fn();
    const poller = createQbitCompletionPoller(deps({ poll }));
    poller.start();
    await poller.firstPoll();
    expect(poll).not.toHaveBeenCalled();
    expect(poller.status()).toBe('off');
  });

  it('polls early on request only while the client is answering', async () => {
    state.baselined = true;
    const poller = createQbitCompletionPoller(deps());
    poller.start();
    await poller.firstPoll();
    await poller.refresh(0);
    expect(pollCount).toBe(2);
    // A snapshot younger than the limit is reused.
    await poller.refresh(5_000);
    expect(pollCount).toBe(2);
  });
});

describe('a finished torrent whose files are not found', () => {
  it('is retried on later polls, logged and counted, not marked handled on the first miss', async () => {
    const hash = 'c'.repeat(40);
    ledger.set(hash, { malId: 1 });
    polls = [{ ok: true, value: [torrent({ hash })] }];
    let found = false;
    const logs: string[] = [];
    const poller = createQbitCompletionPoller(deps({
      resolveFiles: (t) => (found ? [t.contentPath] : []),
      log: (message) => { logs.push(message); },
    }));
    poller.start();
    await poller.firstPoll();
    expect(ingested).toEqual([]);
    expect(state.handled.has(hash)).toBe(false);
    expect(poller.unresolvedCount()).toBe(1);
    expect(logs).toHaveLength(1);
    // Still claimed, so a watch folder does not import it without its identity.
    expect(poller.claims('D:\\Downloads\\Show - 01.mkv')).toBe(true);
    // The files appear (a share mounted, a mapping added): the next poll imports.
    found = true;
    await advance(QBIT_POLL_IDLE_MS);
    expect(ingested).toHaveLength(1);
    expect(state.handled.has(hash)).toBe(true);
    expect(poller.unresolvedCount()).toBe(0);
  });

  it('gives up after the retry cap and marks it handled', async () => {
    const hash = 'd'.repeat(40);
    ledger.set(hash, { malId: 1 });
    polls = [{ ok: true, value: [torrent({ hash })] }];
    const logs: string[] = [];
    const poller = createQbitCompletionPoller(deps({ resolveFiles: () => [], log: (m) => { logs.push(m); } }));
    poller.start();
    await poller.firstPoll();
    await advance(QBIT_POLL_IDLE_MS * (QBIT_UNRESOLVED_RETRIES + 2));
    expect(state.handled.has(hash)).toBe(true);
    expect(poller.unresolvedCount()).toBe(0);
    expect(logs).toHaveLength(2);
    expect(logs[1]).toMatch(/path mapping/);
  });
});
