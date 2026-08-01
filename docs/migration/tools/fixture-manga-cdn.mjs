/**
 * The fixture manga provider's CDN, standalone.
 *
 * `phase5LocalMangaProvider.json` hardcodes `http://127.0.0.1:18846/...` in the
 * page URLs it emits, so a live UI run of the provider chapter browser needs
 * something answering on that port. `reading-boundary-harness.mjs` starts its
 * own copy; this is the same server on its own, for when the *app* is driving
 * rather than the harness.
 *
 * It enforces the provider header on purpose. A page fetched without
 * `X-Phase5-Proof` gets a 403 — the same failure a renderer `<img src>` would
 * hit — so a page that renders in the app is proof the header made it through
 * main, not proof that the CDN was lenient.
 *
 * **Page bytes.** If `make-manga-fixture-pages.mjs` has been run, the readable
 * rendered pages are served for any URL ending `page-<n>.<ext>` — that is what
 * the OCR/mining gate needs, since the 1x1 GIF below cannot be read by anything.
 * The GIF remains the fallback for the cover and for any other path, so the
 * older transport proofs still reproduce unchanged.
 *
 * Usage:  node docs/migration/tools/fixture-manga-cdn.mjs [--pages <dir>]
 */

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const PORT = 18846;
const HEADER = 'x-phase5-proof';
const EXPECTED = 'manga-page-header';

/** A 1x1 GIF — small, but a real decodable image rather than random bytes. */
const IMAGE = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

const pagesArgIndex = process.argv.indexOf('--pages');
const PAGES_DIR = path.resolve(
  pagesArgIndex >= 0 && process.argv[pagesArgIndex + 1]
    ? process.argv[pagesArgIndex + 1]
    : path.join(os.tmpdir(), 'phase5-manga-fixture-pages'),
);

/** `page-1.jpg` -> the rendered `page-1.png`, when one exists. */
function readablePage(url) {
  const match = /\/(page-\d+)\.[a-z0-9]+$/i.exec(url.split('?')[0]);
  if (!match) return null;
  const file = path.join(PAGES_DIR, `${match[1]}.png`);
  if (!fs.existsSync(file)) return null;
  return { file, bytes: fs.readFileSync(file), contentType: 'image/png' };
}

let served = 0;
let refused = 0;

const server = http.createServer((req, res) => {
  const header = req.headers[HEADER] ?? null;

  if (header !== EXPECTED) {
    refused += 1;
    console.log(`[fixture-cdn] 403 ${req.url} (header: ${header ?? 'absent'})`);
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('missing provider header');
    return;
  }

  const page = readablePage(req.url);
  const body = page ? page.bytes : IMAGE;
  const contentType = page ? page.contentType : 'image/gif';

  served += 1;
  console.log(
    `[fixture-cdn] 200 ${req.url} (${body.byteLength} bytes${page ? `, ${path.basename(page.file)}` : ', 1x1 gif'})`,
  );
  res.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store' });
  res.end(body);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[fixture-cdn] listening on http://127.0.0.1:${PORT} — requires ${HEADER}: ${EXPECTED}`);
  console.log(
    fs.existsSync(PAGES_DIR)
      ? `[fixture-cdn] readable pages from ${PAGES_DIR}`
      : `[fixture-cdn] no rendered pages at ${PAGES_DIR} — serving the 1x1 GIF for every path`,
  );
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`[fixture-cdn] served ${served}, refused ${refused}`);
    server.close(() => process.exit(0));
  });
}
