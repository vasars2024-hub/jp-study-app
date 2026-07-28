// Live browser harness for the Phase-3 subtitle-manager acceptance.
//
// Starts an isolated seanime.exe datadir and the existing media-harness.html through
// Vite. The renderer uses the adopted WebsocketProvider, scans/seeds the private fixture,
// starts directstream with the provider's real client id, pulls the parser stream, and
// plays the fixture's h264/aac MP4 remux through the real VideoCore.
//
// usage:
//   node docs/migration/tools/cue-manager-harness.mjs <cue-probe.mkv> <cue-probe.mp4>

import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const EXE =
  process.env.SEANIME_CUE_PROOF_EXE ??
  path.resolve(REPO, '../seanime-upstream/seanime.exe');
const MKV = path.resolve(process.argv[2] ?? '');
const MP4 = path.resolve(process.argv[3] ?? '');

if (!fs.existsSync(EXE)) throw new Error(`missing Seanime sidecar: ${EXE}`);
if (!fs.existsSync(MKV)) throw new Error(`missing MKV fixture: ${MKV}`);
if (!fs.existsSync(MP4)) throw new Error(`missing MP4 fixture: ${MP4}`);

const reservePort = () =>
  new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address();
      socket.close(() =>
        typeof address === 'object' && address
          ? resolve(address.port)
          : reject(new Error('could not reserve port')),
      );
    });
  });

function fixturePlugin() {
  return {
    name: 'cue-proof-fixture',
    configureServer(server) {
      server.middlewares.use('/cue-probe.mp4', (request, response) => {
        const stat = fs.statSync(MP4);
        const range = request.headers.range;
        response.setHeader('Accept-Ranges', 'bytes');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Content-Type', 'video/mp4');

        if (!range) {
          response.statusCode = 200;
          response.setHeader('Content-Length', stat.size);
          fs.createReadStream(MP4).pipe(response);
          return;
        }

        const match = /^bytes=(\d+)-(\d*)$/.exec(range);
        if (!match) {
          response.statusCode = 416;
          response.setHeader('Content-Range', `bytes */${stat.size}`);
          response.end();
          return;
        }

        const start = Number(match[1]);
        const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
        if (start > end || start >= stat.size) {
          response.statusCode = 416;
          response.setHeader('Content-Range', `bytes */${stat.size}`);
          response.end();
          return;
        }
        response.statusCode = 206;
        response.setHeader('Content-Length', end - start + 1);
        response.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
        fs.createReadStream(MP4, { start, end }).pipe(response);
      });
    },
  };
}

const sidecarPort = await reservePort();
const vitePort = await reservePort();
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seanime-cue-manager-'));
const fixtureLibrary = path.join(dataDir, 'cue-library');
const serverMkv = path.join(fixtureLibrary, 'Sousou no Frieren - 01.mkv');
fs.mkdirSync(fixtureLibrary, { recursive: true });
fs.copyFileSync(MKV, serverMkv);
const password = crypto.randomBytes(24).toString('hex');
const token = crypto.createHash('sha256').update(password).digest('hex');
const baseUrl = `http://127.0.0.1:${sidecarPort}`;
const logPath = path.join(
  os.tmpdir(),
  `seanime-cue-manager-${new Date().toISOString().replace(/[:.]/g, '-')}.log`,
);
const logStream = fs.createWriteStream(logPath, { flags: 'a' });

const sidecar = spawn(
  EXE,
  [
    `--datadir=${dataDir}`,
    '--host=127.0.0.1',
    `--port=${sidecarPort}`,
    `--password=${password}`,
  ],
  { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
);
sidecar.stdout.pipe(logStream);
sidecar.stderr.pipe(logStream);

const api = (url) =>
  fetch(`${baseUrl}${url}`, {
    headers: { 'X-Seanime-Token': token },
  });

const deadline = Date.now() + 90_000;
let healthy = false;
while (Date.now() < deadline && !healthy) {
  try {
    healthy = (await api('/api/v1/status')).ok;
  } catch {
    // The port is not accepting connections yet.
  }
  if (!healthy) await new Promise((resolve) => setTimeout(resolve, 500));
}
if (!healthy) {
  throw new Error(`sidecar did not become healthy; log: ${logPath}`);
}

process.chdir(REPO);
const vite = await createViteServer({
  configFile: path.join(REPO, 'vite.renderer.config.ts'),
  root: REPO,
  appType: 'mpa',
  server: {
    host: '127.0.0.1',
    port: vitePort,
    strictPort: true,
  },
  define: {
    global: 'globalThis',
    __SEANIME_CONN__: JSON.stringify({ baseUrl, token }),
    __CUE_PROOF_CONFIG__: JSON.stringify({
      // Keep the library disposable and single-file. Scanning the scratch directory
      // directly presents an MP4 remux with the same basename; Seanime deduplicates the
      // pair and can leave the MKV LocalFile unmatched.
      mkvPath: serverMkv,
      videoUrl: '/cue-probe.mp4',
    }),
    'import.meta.env.SEA_PUBLIC_PLATFORM': JSON.stringify('web'),
  },
  plugins: [fixturePlugin()],
});
await vite.listen();

let closing = false;
async function cleanup() {
  if (closing) return;
  closing = true;
  await vite.close().catch(() => {});
  if (sidecar.exitCode === null) {
    spawnSync('taskkill', ['/pid', String(sidecar.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    });
  }
  await new Promise((resolve) => logStream.end(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
}

process.once('SIGINT', () => void cleanup().finally(() => process.exit(0)));
process.once('SIGTERM', () => void cleanup().finally(() => process.exit(0)));
process.once('uncaughtException', (error) => {
  console.error(error);
  void cleanup().finally(() => process.exit(1));
});

console.log(
  `HARNESS_READY ${JSON.stringify({
    url: `http://127.0.0.1:${vitePort}/media-harness.html`,
    sidecarPid: sidecar.pid,
    sidecarPort,
    logPath,
    dataDir,
  })}`,
);

await new Promise(() => {});
