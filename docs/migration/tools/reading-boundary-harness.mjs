/**
 * Phase 5 — live harness for the provider-backed reading boundary.
 *
 * Exercises the REAL app modules (`main/reading/seanimeManga.ts`,
 * `main/reading/pageImage.ts`, `main/seanime/client.ts`) against a REAL
 * supervised sidecar. No Electron, no Anki, no Study OS userData.
 *
 * Two things make this possible outside Electron:
 *
 * 1. `seanime/supervisor.ts` imports `electron`, so it is aliased to a stub
 *    that reports the live base URL and token this script owns. Everything
 *    below the stub — the client's envelope handling, the projections, the
 *    ordering rules — is the shipped code, unmodified.
 * 2. The page fetch never touches Electron at all. It is plain Node `fetch` +
 *    `Buffer`, so it runs here as-is.
 *
 * The fake CDN is the point of the page half: it serves a real image ONLY when
 * the provider's `X-Phase5-Proof` header is present, and 403s otherwise. That
 * is exactly the failure `fetchReadingPageImage` exists to prevent, so a pass
 * here means the header actually survived main -> CDN.
 *
 * Usage:
 *   node docs/migration/tools/reading-boundary-harness.mjs [--keep]
 *
 * `--keep` leaves the sidecar running for manual poking. Default is full
 * cleanup: sidecar killed, CDN closed, temp build removed.
 */

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = path.resolve(import.meta.dirname, '../../..');

/** The isolated Phase 3/5 test profile — never Study OS userData. */
const DATA_DIR =
  process.env.SEANIME_DATADIR ||
  path.join(os.tmpdir(), 'seanime-phase3-gplay-20260728');

const EXE =
  process.env.SEANIME_EXE ||
  path.join(os.tmpdir(), 'seanime-phase3-verified.exe');

/** Fixed by the installed fixture extension's payload — it emits these URLs. */
const CDN_PORT = 18846;
const FIXTURE_PROVIDER = 'phase5-local-manga-proof';
const FIXTURE_MEDIA_ID = 30002;
const FIXTURE_PAGE_HEADER = 'X-Phase5-Proof';

/** A 1x1 GIF: small, but a real decodable image rather than random bytes. */
const REAL_IMAGE = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

const keepAlive = process.argv.includes('--keep');

function log(...parts) {
  console.log('[reading-harness]', ...parts);
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

// ---------------------------------------------------------------- fake CDN

function startFakeCdn() {
  const requests = [];
  const server = http.createServer((req, res) => {
    const header = req.headers[FIXTURE_PAGE_HEADER.toLowerCase()] ?? null;
    requests.push({ url: req.url, header });

    if (req.url.startsWith('/no-header-check/')) {
      res.writeHead(200, { 'content-type': 'image/gif' });
      res.end(REAL_IMAGE);
      return;
    }
    if (req.url.startsWith('/not-an-image')) {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html>blocked</html>');
      return;
    }
    // The behaviour this whole design exists for: a CDN that refuses a request
    // arriving without the provider's header.
    if (header !== 'manga-page-header') {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('missing provider header');
      return;
    }
    res.writeHead(200, { 'content-type': 'image/gif' });
    res.end(REAL_IMAGE);
  });

  return new Promise((resolve) => {
    server.listen(CDN_PORT, '127.0.0.1', () => resolve({ server, requests }));
  });
}

// ---------------------------------------------------------------- sidecar

async function startSidecar() {
  if (!fs.existsSync(EXE)) throw new Error(`Sidecar binary not found: ${EXE}`);
  if (!fs.existsSync(DATA_DIR)) throw new Error(`Datadir not found: ${DATA_DIR}`);

  const password = crypto.randomBytes(24).toString('hex');
  const token = crypto.createHash('sha256').update(password).digest('hex');
  const port = await freePort();

  // NOTE: no `--desktop-sidecar`. That arms Seanime's no-websocket dead-man
  // switch, which would exit the server ~15s in — this harness holds no
  // websocket, so it must own the kill path itself.
  const child = spawn(
    EXE,
    [
      `--datadir=${DATA_DIR}`,
      '--host=127.0.0.1',
      `--port=${port}`,
      `--password=${password}`,
    ],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );

  const logLines = [];
  child.stdout.on('data', (d) => logLines.push(String(d)));
  child.stderr.on('data', (d) => logLines.push(String(d)));

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  let status = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/v1/status`, {
        headers: { 'X-Seanime-Token': token },
      });
      if (res.ok) {
        status = await res.json();
        break;
      }
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!status) {
    throw new Error(`Sidecar did not become ready.\n${logLines.join('').slice(-2000)}`);
  }

  return { child, baseUrl, token, status, logLines, port };
}

function killSidecar(child) {
  if (!child || child.killed) return;
  try {
    // On Windows a child is not reaped with its parent.
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    });
  } catch {
    child.kill('SIGKILL');
  }
}

// ------------------------------------------------- build the real modules

async function buildRealModules(baseUrl, token) {
  const esbuild = await import(pathToFileURL(path.join(REPO, 'node_modules/esbuild/lib/main.js')));
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reading-harness-'));

  const stubPath = path.join(outDir, 'supervisor-stub.mjs');
  fs.writeFileSync(
    stubPath,
    [
      `export const getSeanimeStatus = () => ({ kind: 'ready' });`,
      `export const seanimeBaseUrl = () => ${JSON.stringify(baseUrl)};`,
      `export const seanimeAuthToken = () => ${JSON.stringify(token)};`,
      `export const SEANIME_SIDECAR_ENABLED = true;`,
    ].join('\n'),
  );

  const entryPath = path.join(outDir, 'entry.ts');
  fs.writeFileSync(
    entryPath,
    [
      `export {`,
      `  fetchMangaProviders,`,
      `  fetchMangaEntry,`,
      `  fetchMangaChapters,`,
      `  fetchMangaChapterPages,`,
      `  readingWorkFromMangaEntry,`,
      `  readingEditionFromMangaEntry,`,
      `} from ${JSON.stringify(path.join(REPO, 'src/main/reading/seanimeManga.ts').replace(/\\/g, '/'))};`,
      `export { fetchReadingPageImage } from ${JSON.stringify(path.join(REPO, 'src/main/reading/pageImage.ts').replace(/\\/g, '/'))};`,
    ].join('\n'),
  );

  const outFile = path.join(outDir, 'bundle.mjs');
  await esbuild.build({
    entryPoints: [entryPath],
    outfile: outFile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
    // No `alias` here: esbuild aliases must be package-style names, and the
    // relative `./client` / `./supervisor` imports resolve on their own once
    // the supervisor is redirected below.
    plugins: [
      {
        name: 'stub-supervisor',
        setup(build) {
          build.onResolve({ filter: /seanime\/supervisor$|[\\/]supervisor$/ }, () => ({
            path: stubPath,
          }));
        },
      },
    ],
  });

  return { module: await import(pathToFileURL(outFile)), outDir };
}

// ------------------------------------------------------------------- run

const results = {
  proof: 'Phase 5 — provider list and page-image fetch, exercised live',
  date: new Date().toISOString().slice(0, 10),
  tool: 'docs/migration/tools/reading-boundary-harness.mjs',
  method:
    'The shipped main-process modules were bundled with only seanime/supervisor stubbed (it imports electron) and run against a real supervised sidecar plus a fake provider CDN that refuses requests missing the provider header.',
};

let sidecar = null;
let cdn = null;
let buildDir = null;

try {
  cdn = await startFakeCdn();
  log(`fake CDN listening on 127.0.0.1:${CDN_PORT}`);

  sidecar = await startSidecar();
  log(`sidecar ready on ${sidecar.baseUrl} (version ${sidecar.status?.serverVersion ?? '?'})`);
  results.sidecar = {
    dataDir: DATA_DIR,
    // The status route wraps its payload in the `{ data }` envelope, same as
    // every other route — read through it rather than off the top level.
    serverVersion:
      sidecar.status?.data?.serverVersion ?? sidecar.status?.serverVersion ?? null,
    statusKeys: Object.keys(sidecar.status?.data ?? sidecar.status ?? {}),
    note: 'Isolated Phase 3/5 test profile. Study OS userData untouched.',
  };

  const built = await buildRealModules(sidecar.baseUrl, sidecar.token);
  buildDir = built.outDir;
  const api = built.module;

  // ---- 1. providers: the new route, through the real projection ----------
  const providers = await api.fetchMangaProviders();
  log(`providers: ${providers.map((p) => p.id).join(', ') || '(none)'}`);
  results.readingMangaProviders = {
    state: 'ready',
    count: providers.length,
    providers,
    sortedByName: providers.map((p) => p.name),
    fixturePresent: providers.some((p) => p.id === FIXTURE_PROVIDER),
    note: 'GET /api/v1/extensions/list/manga-provider through the shipped fetchMangaProviders, including its sort-by-display-name rule.',
  };

  // ---- 2. entry + chapters + pages, to locate a real page URL ------------
  const entry = await api.fetchMangaEntry(FIXTURE_MEDIA_ID);
  const work = api.readingWorkFromMangaEntry(entry);
  const chapters = await api.fetchMangaChapters(FIXTURE_MEDIA_ID, FIXTURE_PROVIDER);
  const pages = await api.fetchMangaChapterPages(
    FIXTURE_MEDIA_ID,
    FIXTURE_PROVIDER,
    chapters[0].chapterId,
    false,
  );
  log(`work "${work.title}" -> ${chapters.length} chapters -> ${pages.length} pages`);
  results.chapterFeed = {
    work: { title: work.title, titleNative: work.titleNative, workId: work.workId },
    chapterOrder: chapters.map((c) => `${c.number}@index${c.index}`),
    pageOrder: pages.map((p) => p.index),
    firstPageHeaders: Object.keys(pages[0]?.headers ?? {}),
  };

  // ---- 3. the page image, with and without its header --------------------
  const page = pages[0];
  const image = await api.fetchReadingPageImage({ url: page.url, headers: page.headers });
  log(`page image: ${image.byteLength} bytes, ${image.contentType}`);
  results.readingMangaPageImage = {
    state: 'ready',
    url: page.url,
    byteLength: image.byteLength,
    contentType: image.contentType,
    dataUrlPrefix: image.dataUrl.slice(0, 32),
    decodesToSameBytes:
      Buffer.from(image.dataUrl.split(',')[1], 'base64').equals(REAL_IMAGE),
    note: 'The CDN 403s any request without the provider header, so a 200 here proves the header survived the boundary into main and out to the CDN.',
  };

  // The negative: same URL, headers dropped. This is what a renderer <img>
  // would have produced, and it must fail rather than render blank.
  let withoutHeaders = null;
  try {
    await api.fetchReadingPageImage({ url: page.url, headers: {} });
    withoutHeaders = 'UNEXPECTED PASS — the CDN did not enforce its header';
  } catch (error) {
    withoutHeaders = error.message;
  }
  log(`without headers: ${withoutHeaders}`);
  results.headerNegativeControl = {
    result: withoutHeaders,
    note: 'Exactly what an <img src> in the renderer would have done. It fails loudly instead of rendering a blank page.',
  };

  // ---- 4. the guards, against the real server ----------------------------
  const guards = {};
  try {
    await api.fetchReadingPageImage({
      url: `http://127.0.0.1:${CDN_PORT}/not-an-image`,
      headers: { [FIXTURE_PAGE_HEADER]: 'manga-page-header' },
    });
    guards.htmlBody = 'UNEXPECTED PASS';
  } catch (error) {
    guards.htmlBody = error.message;
  }
  try {
    await api.fetchReadingPageImage({ url: 'file:///C:/Windows/win.ini', headers: {} });
    guards.fileUrl = 'UNEXPECTED PASS';
  } catch (error) {
    guards.fileUrl = error.message;
  }
  results.guards = guards;
  log(`guards: html=${guards.htmlBody} | file=${guards.fileUrl}`);

  results.cdnRequests = cdn.requests;
  results.verdict = 'PASS';
} catch (error) {
  results.verdict = 'FAIL';
  results.error = error instanceof Error ? `${error.message}\n${error.stack}` : String(error);
  console.error('[reading-harness] FAILED:', error);
} finally {
  if (!keepAlive) {
    killSidecar(sidecar?.child);
    cdn?.server.close();
    if (buildDir) fs.rmSync(buildDir, { recursive: true, force: true });
    log('cleaned up: sidecar killed, CDN closed, temp build removed');
  } else {
    log(`left running: sidecar ${sidecar?.baseUrl}, CDN 127.0.0.1:${CDN_PORT}`);
  }
}

const outPath = process.env.HARNESS_OUT;
if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(results, null, 2)}\n`);
  log(`wrote ${outPath}`);
} else {
  console.log(JSON.stringify(results, null, 2));
}

process.exit(results.verdict === 'PASS' ? 0 : 1);
