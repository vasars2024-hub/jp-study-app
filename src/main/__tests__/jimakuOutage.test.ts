// @vitest-environment node
//
// The root cause, at its own seam.
//
// `subtitleHarvestNyaa.test.ts` stands `jimakuSearchDetailed` in, so it proves
// what `listSubtitleHarvest` does with a `down` match and nothing about who
// sets it. Deleting the `reply.value === null` branch leaves that suite fully
// green — measured 2026-08-17, 19/19 passed under exactly that mutation. This
// file is the control for it, and drives the real client over a stubbed
// `electron.net`.
//
// Live evidence for why it matters: eight of the user's own titles reported
// "Jimaku has no Japanese subtitles filed for this title" back-to-back and
// returned 125/57/168/36/95/48/60/47 files when the identical requests were
// spaced 6 s apart.

import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** What the next `net.request` should do. One entry consumed per request. */
let replies: Array<{ status: number; body: string } | { throws: string }> = [];
const urls: string[] = [];

class FakeRequest extends EventEmitter {
  setHeader(): void { /* headers are asserted through `urls` only */ }
  write(): void { /* no request in this file has a body */ }
  abort(): void { /* the timeout path is not exercised here */ }

  end(): void {
    const next = replies.shift() ?? { status: 200, body: '[]' };
    // Asynchronous on purpose: `request` attaches its listeners after
    // `net.request` returns, and a synchronous emit would reach nobody.
    setTimeout(() => {
      if ('throws' in next) {
        this.emit('error', new Error(next.throws));
        return;
      }
      const response = new EventEmitter() as EventEmitter & { statusCode: number };
      response.statusCode = next.status;
      this.emit('response', response);
      response.emit('data', Buffer.from(next.body, 'utf-8'));
      response.emit('end');
    }, 0);
  }
}

vi.mock('electron', () => ({
  net: {
    request: (options: { url: string }) => {
      urls.push(options.url);
      return new FakeRequest();
    },
  },
}));

vi.mock('../credentials/subtitles', () => ({
  readSubtitleProviderSecret: () => 'test-key',
  writeSubtitleProviderSecret: () => undefined,
}));
vi.mock('../credentials/vault', () => ({ recordTestResult: () => undefined }));

const { jimakuSearchDetailed } = await import('../subtitleProviderClients');

const ENTRY = JSON.stringify([{ id: 42, name: 'Bakuman.' }]);

beforeEach(() => {
  replies = [];
  urls.length = 0;
});

describe('jimakuSearchDetailed — down is set by who actually knows', () => {
  it('marks a rate-limited search as down and names the status', async () => {
    replies = [{ status: 429, body: 'Too Many Requests' }];

    const match = await jimakuSearchDetailed(undefined, 'Bakuman.', null);
    expect(match.down).toBe(true);
    expect(match.downStatus).toBe(429);
    expect(match.candidates).toEqual([]);
    expect(match.entry).toBeNull();
    // It must not have gone on to ask for files against an entry it never got.
    expect(urls).toHaveLength(1);
  });

  it('does NOT mark a genuine empty catalogue as down', async () => {
    // The discriminating positive. Without it, "always down" passes every other
    // test in this file and is exactly as dishonest in the other direction.
    replies = [{ status: 200, body: '[]' }];

    const match = await jimakuSearchDetailed(undefined, 'Nothing Filed', null);
    expect(match.down).toBe(false);
    expect(match.downStatus).toBe(0);
    expect(match.candidates).toEqual([]);
  });

  it('marks a rate-limited FILE listing as down, not as an entry with no files', async () => {
    // The worse half: the search succeeded, so the panel has an entry name to
    // show, and an empty file list then reads as "this entry has nothing" with
    // a matched title vouching for it.
    replies = [
      { status: 200, body: ENTRY },
      { status: 429, body: 'Too Many Requests' },
    ];

    const match = await jimakuSearchDetailed(undefined, 'Bakuman.', null);
    expect(urls).toHaveLength(2);
    expect(match.down).toBe(true);
    expect(match.downStatus).toBe(429);
    expect(match.entry).toBeNull();
  });

  it('marks a transport failure as down with status 0', async () => {
    replies = [{ throws: 'getaddrinfo ENOTFOUND jimaku.cc' }];

    const match = await jimakuSearchDetailed(undefined, 'Bakuman.', null);
    expect(match.down).toBe(true);
    expect(match.downStatus).toBe(0);
  });

  it('is not down on a real listing, and still returns the files', async () => {
    replies = [
      { status: 200, body: ENTRY },
      { status: 200, body: JSON.stringify([{ name: 'Bakuman - 01.ja.srt', url: 'https://x/1.srt' }]) },
    ];

    const match = await jimakuSearchDetailed(undefined, 'Bakuman.', null);
    expect(match.down).toBe(false);
    expect(match.entry).toEqual({ id: 42, name: 'Bakuman.' });
    expect(match.candidates).toHaveLength(1);
    expect(match.candidates[0].format).toBe('srt');
  });

  it('treats a 200 carrying non-JSON as the provider misbehaving, not as empty', async () => {
    // A captive portal or an HTML error page served with a 200 is the case a
    // status check alone misses.
    replies = [{ status: 200, body: '<html>maintenance</html>' }];

    const match = await jimakuSearchDetailed(undefined, 'Bakuman.', null);
    expect(match.down).toBe(true);
    expect(match.downStatus).toBe(200);
  });
});
