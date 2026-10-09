// A fixture "website" for the scraper pipeline E2E suite.
//
// Listens on 127.0.0.1 on an ephemeral port and serves only invented content
// (texts.ts). Each route stands for one thing a real site does that the scraper
// has to get right:
//
//   /robots.txt                 Disallows /private/.
//   /shows/gum-test-show        Episode table, two per page, `?page=2` and a
//                               `rel=next` link (also `a.next`) to follow.
//   /shows/broken-pages         Page 1 as above; its page 2 answers 503.
//   /sjis/header                Shift_JIS, charset in the Content-Type header.
//   /sjis/meta                  Shift_JIS, charset only in <meta http-equiv>.
//   /sjis/meta-charset          Shift_JIS, charset only in <meta charset>.
//   /entity-title               <title> written with numeric character references.
//   /flaky                      503 + Retry-After: 1 on the first hit, then 200.
//   /slow                       Never answers (until the server closes); for cancel.
//   /redirect-cross-host        302 to the same server under another host name
//                               (`localhost`), landing on /echo-headers.
//   /echo-headers               Echoes the cookie/authorization it received, as JSON.
//   /?page=rss&q=…              Nyaa-shaped RSS for whatever `q` names.
//   /rss-eucjp                  The same feed in EUC-JP, declared only by <?xml encoding?>.
//   /media/<name>               The generated test video.
//   /subs/<name>.srt|.ass       Subtitles: utf8-bom, sjis, utf16le variants.

import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import {
  ASS_JA,
  EPISODES,
  NUMBERED_SHOW,
  SHOW,
  SRT_JA,
  SRT_JA_PLAIN,
  encodeLegacy,
  encodeUtf16Le,
  releaseName,
  type FixtureEpisode,
} from './texts';

export interface FixtureSite {
  /** `http://127.0.0.1:<port>` */
  base: string;
  /** `127.0.0.1:<port>` */
  host: string;
  port: number;
  /** `METHOD /path?query` for every request, in order. */
  hits: string[];
  /** When each hit arrived (ms epoch), parallel to `hits`. */
  hitTimes: number[];
  /** Forgets the hit log and the per-route counters. */
  reset(): void;
  close(): Promise<void>;
}

function rowsHtml(eps: readonly FixtureEpisode[], base: string): string {
  return eps.map((e) => '<tr class="ep">'
    + `<th class="no">第${e.n}話</th>`
    + `<td class="title">${e.title}</td>`
    + `<td><a class="dl" href="${base}/media/${encodeURIComponent(`${SHOW} - 0${e.n}.mkv`)}">dl</a></td>`
    + `<td><a class="mag" href="magnet:?xt=urn:btih:${e.hash}&amp;dn=${encodeURIComponent(`${SHOW} - 0${e.n}`)}">magnet</a></td>`
    + '</tr>').join('\n');
}

function feedXml(show: string, base: string, encoding = 'utf-8'): string {
  const items = EPISODES.map((e) => '<item>'
    + `<title>${releaseName(show, e.n)}</title>`
    + `<link>${base}/torrent/${e.hash}.torrent</link>`
    + `<guid isPermaLink="true">${base}/view/${show === SHOW ? '' : 'n'}${e.n}</guid>`
    + '<pubDate>Mon, 01 Jan 2024 00:00:00 +0000</pubDate>'
    + `<nyaa:seeders>${10 - e.n}</nyaa:seeders>`
    + '<nyaa:leechers>0</nyaa:leechers>'
    + '<nyaa:downloads>1</nyaa:downloads>'
    // The numbered show gets distinct hashes so its rows never collide with the main show's.
    + `<nyaa:infoHash>${show === SHOW ? e.hash : e.hash.split('').reverse().join('')}</nyaa:infoHash>`
    + '<nyaa:size>5.9 MiB</nyaa:size>'
    + '</item>').join('');
  return `<?xml version="1.0" encoding="${encoding}"?>`
    + '<rss xmlns:nyaa="https://nyaa.si/xmlns/nyaa" version="2.0"><channel>'
    + `<title>${show} - fixture index</title>${items}</channel></rss>`;
}

export async function startFixtureSite(opts: { mediaPath: string }): Promise<FixtureSite> {
  const hits: string[] = [];
  const hitTimes: number[] = [];
  const counters = new Map<string, number>();
  let base = '';
  let port = 0;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://fixture.invalid');
    hits.push(`${req.method} ${url.pathname}${url.search}`);
    hitTimes.push(Date.now());
    const count = (counters.get(url.pathname) ?? 0) + 1;
    counters.set(url.pathname, count);
    const html = (body: string | Buffer, contentType = 'text/html; charset=utf-8') => {
      res.writeHead(200, { 'content-type': contentType });
      res.end(body);
    };

    switch (url.pathname) {
      case '/robots.txt':
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('User-agent: *\nDisallow: /private/\n');
        return;
      case '/shows/gum-test-show': {
        const page = Number(url.searchParams.get('page') ?? '1');
        const eps = page === 1 ? EPISODES.slice(0, 2) : EPISODES.slice(2);
        const next = page === 1
          ? '<nav><a rel="next" class="next" href="/shows/gum-test-show?page=2">次へ</a></nav>'
          : '';
        html(`<!doctype html><html><head><title>${SHOW} — エピソード一覧</title></head>`
          + `<body><table class="eps">${rowsHtml(eps, base)}</table>${next}</body></html>`);
        return;
      }
      case '/shows/broken-pages': {
        // Page 1 links to page 2, which the server cannot serve (round 2: the
        // job summary must say so instead of only logging it).
        const page = Number(url.searchParams.get('page') ?? '1');
        if (page !== 1) {
          res.writeHead(503, { 'content-type': 'text/plain' });
          res.end('down');
          return;
        }
        html(`<!doctype html><html><head><title>${SHOW}</title></head><body><table class="eps">${rowsHtml(EPISODES.slice(0, 2), base)}</table>`
          + '<nav><a rel="next" href="/shows/broken-pages?page=2">next</a></nav></body></html>');
        return;
      }
      case '/sjis/header':
        html(
          encodeLegacy(`<html><head><title>${SHOW}</title></head><body><table class="eps">${rowsHtml(EPISODES.slice(0, 1), base)}</table></body></html>`, 'shift_jis'),
          'text/html; charset=Shift_JIS',
        );
        return;
      case '/sjis/meta':
        html(
          encodeLegacy('<html><head><meta http-equiv="Content-Type" content="text/html; charset=Shift_JIS">'
            + `<title>${SHOW}</title></head><body><table class="eps">${rowsHtml(EPISODES.slice(0, 1), base)}</table></body></html>`, 'shift_jis'),
          'text/html',
        );
        return;
      case '/sjis/meta-charset':
        html(
          encodeLegacy('<!doctype html><html><head><meta charset="shift_jis">'
            + `<title>${SHOW}</title></head><body><table class="eps">${rowsHtml(EPISODES.slice(0, 1), base)}</table></body></html>`, 'shift_jis'),
          'text/html',
        );
        return;
      case '/entity-title':
        // ガム = &#x30AC;&#x30E0; — a page title the catalogue query must read as Japanese.
        html('<html><head><title>&#x30AC;&#12512; Test Show</title></head><body></body></html>');
        return;
      case '/flaky':
        if (count === 1) {
          res.writeHead(503, { 'retry-after': '1', 'content-type': 'text/plain' });
          res.end('busy');
          return;
        }
        html(`<html><head><title>${SHOW}</title></head><body><table class="eps">${rowsHtml(EPISODES.slice(0, 1), base)}</table></body></html>`);
        return;
      case '/slow':
        // Never answered: the request stays open until it is aborted or the server closes.
        return;
      case '/redirect-cross-host':
        res.writeHead(302, { location: `http://localhost:${port}/echo-headers` });
        res.end();
        return;
      case '/echo-headers':
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          host: req.headers.host ?? '',
          cookie: req.headers.cookie ?? '',
          authorization: req.headers.authorization ?? '',
        }));
        return;
      case '/private/secret':
        html('<html><body>robots.txt forbids this page</body></html>');
        return;
      case '/rss-eucjp':
        res.writeHead(200, { 'content-type': 'application/rss+xml' });
        res.end(encodeLegacy(feedXml(`${SHOW} 日本語`, base, 'EUC-JP'), 'euc-jp'));
        return;
      case '/':
        if (url.searchParams.get('page') === 'rss') {
          const q = url.searchParams.get('q') ?? '';
          const show = q.includes('100') ? NUMBERED_SHOW : SHOW;
          res.writeHead(200, { 'content-type': 'application/rss+xml; charset=utf-8' });
          res.end(feedXml(show, base));
          return;
        }
        html('<html><head><title>fixture</title></head><body></body></html>');
        return;
      default:
        if (url.pathname.startsWith('/media/')) {
          const size = fs.statSync(opts.mediaPath).size;
          res.writeHead(200, { 'content-type': 'video/x-matroska', 'content-length': String(size) });
          fs.createReadStream(opts.mediaPath).pipe(res);
          return;
        }
        if (url.pathname.startsWith('/subs/') && url.pathname.endsWith('.srt')) {
          res.writeHead(200, { 'content-type': 'application/x-subrip' });
          if (url.pathname.includes('sjis')) res.end(encodeLegacy(SRT_JA_PLAIN, 'shift_jis'));
          else if (url.pathname.includes('utf16')) res.end(encodeUtf16Le(SRT_JA_PLAIN));
          else res.end(SRT_JA);
          return;
        }
        if (url.pathname.startsWith('/subs/') && url.pathname.endsWith('.ass')) {
          res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
          res.end(ASS_JA);
          return;
        }
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
  return {
    base,
    host: `127.0.0.1:${port}`,
    port,
    hits,
    hitTimes,
    reset() {
      hits.length = 0;
      hitTimes.length = 0;
      counters.clear();
    },
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}
