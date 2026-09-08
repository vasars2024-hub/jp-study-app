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

  it('refuses an entry that is not this title, and never asks for its files', async () => {
    // The live case: `Shinreigari` came back as Madoka Magica with 33 files.
    // The second request not happening is the load-bearing half — it is what
    // makes the refusal free rather than a wasted call against a rate limit.
    replies = [{ status: 200, body: JSON.stringify([{ id: 7, name: 'Mahou Shoujo Madoka☆Magica' }]) }];

    const match = await jimakuSearchDetailed(undefined, 'Shinreigari', null);
    expect(urls).toHaveLength(1);
    expect(match.candidates).toEqual([]);
    expect(match.entry).toBeNull();
    expect(match.rejectedEntry).toBe('Mahou Shoujo Madoka☆Magica');
    // Not an outage: Jimaku answered perfectly well. Conflating the two would
    // tell the user to wait for something waiting cannot fix.
    expect(match.down).toBe(false);
  });

  it('does not report a rejection when the entry really is the title', async () => {
    replies = [
      { status: 200, body: ENTRY },
      { status: 200, body: JSON.stringify([{ name: 'Bakuman - 01.ja.srt', url: 'https://x/1.srt' }]) },
    ];

    const match = await jimakuSearchDetailed(undefined, 'Bakuman.', null);
    expect(match.rejectedEntry).toBeNull();
    expect(match.candidates).toHaveLength(1);
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

// D267. This lives here rather than in its own file because `episodeFromName`
// is private and the number it produces only matters as it reaches a candidate,
// which is exactly what this harness already drives. Every case asks with
// `episode = null` — an unnumbered target, the creditless-special case — so the
// number in the assertion can only have come from the NAME.
describe('candidate episode numbering — what the matcher is given', () => {
  /** One listing, one file, straight through the real client. */
  async function episodeOf(fileName: string): Promise<number | null> {
    replies = [
      { status: 200, body: ENTRY },
      { status: 200, body: JSON.stringify([{ name: fileName, url: 'https://x/1.srt' }]) },
    ];
    const match = await jimakuSearchDetailed(undefined, 'Bakuman.', null);
    expect(match.candidates).toHaveLength(1);
    return match.candidates[0].episode;
  }

  it.each([
    // The live D267 subject: Jimaku's own Bandai naming, which read as `null`.
    ['The Big O.E01.Bandai.ja.srt', 1],
    ['The Big O.E13.Bandai.ja.srt', 13],
    // `_` is a word character, so a `\b`-fenced pattern would miss this one.
    ['Show_E07_1080p.ja.srt', 7],
    ['[Group] Show E12 [1080p].srt', 12],
    ['Show (E4).ja.ass', 4],
    // The three patterns that already worked must keep working.
    ['Show.S02E05.1080p.srt', 5],
    ['Show Episode 3.ja.srt', 3],
    ['Bakuman - 01.ja.srt', 1],
  ])('reads %s as episode %i', async (name, expected) => {
    expect(await episodeOf(name)).toBe(expected);
  });

  it.each([
    // A CRC32 tag is the token bare `E` collides with, and it is in almost every
    // anime release name. Reading `[E0F1A2B3]` as episode 0 would attach a
    // special's file to episode 0 and block it from every unnumbered target.
    ['[Group] Show [E0F1A2B3].srt'],
    ['[Group] Show [1E2A3B4C].srt'],
    ['[Group] Show [DEAD10CC].srt'],
    // Codec and container tokens that carry a digit after an `e`.
    ['Show [E-AC3 2.0][x265].ja.srt'],
    ['Show.WEB-DL.DDPA5.1.ja.srt'],
  ])('does NOT invent an episode from %s', async (name) => {
    expect(await episodeOf(name)).toBeNull();
  });

  it('still falls back to the requested episode when the name says nothing', async () => {
    // The discriminating positive for the whole change: a numbered target must
    // keep the fallback that makes `?episode=` listings match at all. Without
    // this, "always null" passes every negative case above.
    replies = [
      { status: 200, body: ENTRY },
      { status: 200, body: JSON.stringify([{ name: 'Bakuman.ja.srt', url: 'https://x/1.srt' }]) },
    ];
    const match = await jimakuSearchDetailed(undefined, 'Bakuman.', 9);
    expect(match.candidates[0].episode).toBe(9);
  });
});
