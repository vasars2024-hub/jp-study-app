// @vitest-environment node
//
// The provider HTTP layer under P4/P7: an oversized body is an error rather than
// a silently cut success, a 429 is waited out as its Retry-After says (and a
// daily-quota wait is not), requests to one host are spaced, and a Jimaku entry
// that only files a season archive yields the archive's members.

import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Reply { status: number; headers?: Record<string, string>; chunks: Buffer[] }

const net = vi.hoisted(() => ({
  replies: [] as Reply[],
  calls: [] as { url: string; at: number }[],
}));

vi.mock('electron', () => ({
  app: { getPath: () => '.' },
  safeStorage: { isEncryptionAvailable: () => false },
  net: {
    request: ({ url }: { url: string }) => {
      net.calls.push({ url, at: Date.now() });
      const req = new EventEmitter() as EventEmitter & Record<string, unknown>;
      let aborted = false;
      req.setHeader = () => undefined;
      req.write = () => undefined;
      req.abort = () => { aborted = true; };
      req.end = () => {
        const reply = net.replies.shift() ?? { status: 500, chunks: [] };
        setImmediate(() => {
          const response = new EventEmitter() as EventEmitter & Record<string, unknown>;
          response.statusCode = reply.status;
          response.headers = reply.headers ?? {};
          req.emit('response', response);
          for (const chunk of reply.chunks) {
            if (aborted) return;
            response.emit('data', chunk);
          }
          response.emit('end');
        });
      };
      return req;
    },
  },
}));
vi.mock('../credentials/subtitles', () => ({
  readSubtitleProviderSecret: () => 'test-key',
  writeSubtitleProviderSecret: () => ({ ok: true }),
}));
vi.mock('../credentials/vault', () => ({ recordTestResult: () => undefined }));

const archive = vi.hoisted(() => ({
  files: [] as { name: string; sizeBytes: number; text: string }[],
  opened: [] as string[],
}));
vi.mock('../subtitleArchive', () => ({
  isExtractableArchive: (name: string) => /\.(zip|7z|tar)$/i.test(name),
  extractSubtitlesFromArchive: async (at: string) => {
    archive.opened.push(at);
    return { ok: true, files: archive.files, unpackedBytes: 1, skippedNonSubtitle: 0, unreadable: 0 };
  },
}));

const { fetchSubtitleCandidateDetailed, jimakuSearchDetailed } = await import('../subtitleProviderClients');

const SRT = '1\n00:00:01,000 --> 00:00:02,000\nテスト\n';

function jimakuCandidate(url: string) {
  return {
    providerId: 'jimaku' as const, providerItemId: url, language: 'ja', format: 'srt' as const,
    releaseName: 'x.srt', season: null, episode: 1, releaseGroup: null, hearingImpaired: false,
    hashMatch: false, downloads: null, fetchToken: url,
  };
}
const fetchText = async (url: string) => (await fetchSubtitleCandidateDetailed(jimakuCandidate(url))).text;
const ok = (body: string | Buffer, headers?: Record<string, string>): Reply =>
  ({ status: 200, headers, chunks: [Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf-8')] });

beforeEach(() => {
  net.replies.length = 0;
  net.calls.length = 0;
  archive.files = [];
  archive.opened.length = 0;
});

describe('a subtitle body over 16 MB', () => {
  it('is a failed download, not a cut-off success', async () => {
    const nine = Buffer.alloc(9 * 1024 * 1024, 0x41);
    net.replies.push({ status: 200, chunks: [nine, nine] });
    expect(await fetchText('https://big.example/a.srt')).toBeNull();
  });

  it('while a body under the cap still arrives whole', async () => {
    net.replies.push(ok(SRT));
    expect(await fetchText('https://small.example/a.srt')).toContain('テスト');
  });
});

describe('rate limits', () => {
  it('waits out a 429 for as long as Retry-After says, then retries', async () => {
    net.replies.push({ status: 429, headers: { 'retry-after': '1' }, chunks: [] }, ok(SRT));
    expect(await fetchText('https://limited.example/a.srt')).toContain('テスト');
    expect(net.calls).toHaveLength(2);
    expect(net.calls[1].at - net.calls[0].at).toBeGreaterThanOrEqual(900);
  });

  it('does not wait out a Retry-After that is a quota, not a burst', async () => {
    net.replies.push({ status: 429, headers: { 'retry-after': '3600' }, chunks: [] }, ok(SRT));
    expect(await fetchText('https://quota.example/a.srt')).toBeNull();
    expect(net.calls).toHaveLength(1);
  });

  it('spaces two requests to the same host', async () => {
    net.replies.push(ok(SRT), ok(SRT));
    await Promise.all([fetchText('https://spaced.example/1.srt'), fetchText('https://spaced.example/2.srt')]);
    expect(net.calls).toHaveLength(2);
    expect(Math.abs(net.calls[1].at - net.calls[0].at)).toBeGreaterThanOrEqual(250);
  });
});

describe('a Jimaku entry that files only a season archive', () => {
  it('offers the archive members as candidates, each fetched from the unpacked text', async () => {
    net.replies.push(
      ok(JSON.stringify([{ id: 42, name: 'Gum Show' }])),
      ok(JSON.stringify([{ name: 'Gum Show S1.zip', url: 'https://cdn.jimaku.example/s1.zip' }])),
      ok(Buffer.from('PK\u0003\u0004')),
    );
    archive.files = [
      { name: 'Gum Show/Gum Show - 07.ja.srt', sizeBytes: 10, text: SRT.replace('テスト', '七話') },
      { name: 'Gum Show/Gum Show - 08.ja.srt', sizeBytes: 10, text: SRT.replace('テスト', '八話') },
      { name: 'Gum Show/notes.txt', sizeBytes: 10, text: 'not a subtitle' },
    ];
    const match = await jimakuSearchDetailed(1234, 'Gum Show', 7);
    expect(archive.opened).toHaveLength(1);
    expect(match.down).toBe(false);
    expect(match.candidates.map((c) => [c.releaseName, c.episode, c.format])).toEqual([
      ['Gum Show - 07.ja.srt', 7, 'srt'],
      ['Gum Show - 08.ja.srt', 8, 'srt'],
    ]);
    const seventh = match.candidates[0];
    expect((await fetchSubtitleCandidateDetailed(seventh)).text).toContain('七話');
  });

  it('leaves the archive closed when a loose file already answers the episode', async () => {
    net.replies.push(
      ok(JSON.stringify([{ id: 43, name: 'Gum Show' }])),
      ok(JSON.stringify([
        { name: 'Gum Show - 07.ja.srt', url: 'https://cdn.jimaku.example/07.srt' },
        { name: 'Gum Show S1.zip', url: 'https://cdn.jimaku.example/s1.zip' },
      ])),
    );
    const match = await jimakuSearchDetailed(1235, 'Gum Show', 7);
    expect(archive.opened).toHaveLength(0);
    expect(match.candidates.map((c) => c.releaseName)).toEqual(['Gum Show - 07.ja.srt']);
  });
});
