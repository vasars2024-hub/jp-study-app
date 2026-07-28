// Prepare a persistent, isolated Seanime datadir for the Phase-3 one-run G-PLAY.
//
// This does not launch Electron and never touches Study OS userData. It starts the pinned
// patched sidecar against a caller-owned empty temp directory, copies the representative
// dual-subtitle fixture into a one-file library, scans it, seeds the simulated collection,
// writes a manifest, and stops the sidecar. The later Electron acceptance run reuses the
// datadir through SEANIME_DATADIR.
//
// usage:
//   $env:SEANIME_CUE_PROOF_EXE='C:\...\seanime-phase3-verified.exe'
//   node docs/migration/tools/prepare-gplay-datadir.mjs <dual-cue.mkv> <empty-datadir>

import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const SOURCE_MKV = path.resolve(process.argv[2] ?? '');
const DATA_DIR = path.resolve(process.argv[3] ?? '');
const EXE = path.resolve(
  process.env.SEANIME_CUE_PROOF_EXE
    ?? 'C:/Users/Arseniy/Projects/seanime-upstream/seanime.exe',
);

if (!fs.existsSync(EXE)) throw new Error(`missing Seanime sidecar: ${EXE}`);
if (!fs.existsSync(SOURCE_MKV)) throw new Error(`missing dual-cue MKV: ${SOURCE_MKV}`);
if (!process.argv[3]) throw new Error('missing destination datadir');
if (fs.existsSync(DATA_DIR)) {
  throw new Error(`destination already exists; refusing to overwrite: ${DATA_DIR}`);
}

const reservePort = () =>
  new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address();
      socket.close(() =>
        typeof address === 'object' && address
          ? resolve(address.port)
          : reject(new Error('could not reserve a loopback port')),
      );
    });
  });

const dataDirParent = path.dirname(DATA_DIR);
if (!fs.existsSync(dataDirParent)) {
  throw new Error(`destination parent does not exist: ${dataDirParent}`);
}

fs.mkdirSync(DATA_DIR);
const libraryPath = path.join(DATA_DIR, 'cue-library');
const mkvPath = path.join(libraryPath, 'Sousou no Frieren - 01.mkv');
const logPath = path.join(DATA_DIR, 'prepare-sidecar.log');
const manifestPath = path.join(DATA_DIR, 'gplay-manifest.json');
fs.mkdirSync(libraryPath);
fs.copyFileSync(SOURCE_MKV, mkvPath);

const password = crypto.randomBytes(24).toString('hex');
const token = crypto.createHash('sha256').update(password).digest('hex');
const port = await reservePort();
const baseUrl = `http://127.0.0.1:${port}`;
const logStream = fs.createWriteStream(logPath, { flags: 'a' });
const sidecar = spawn(
  EXE,
  [
    `--datadir=${DATA_DIR}`,
    '--host=127.0.0.1',
    `--port=${port}`,
    `--password=${password}`,
  ],
  { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
);
sidecar.stdout.pipe(logStream);
sidecar.stderr.pipe(logStream);

let prepared = false;
let stopping = false;

function stopSidecar() {
  if (stopping) return;
  stopping = true;
  if (sidecar.exitCode === null && sidecar.pid) {
    spawnSync('taskkill', ['/pid', String(sidecar.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    });
  }
}

function api(url, init = {}) {
  return fetch(`${baseUrl}${url}`, {
    ...init,
    headers: {
      'X-Seanime-Token': token,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
}

process.once('SIGINT', () => {
  stopSidecar();
  process.exit(130);
});
process.once('SIGTERM', () => {
  stopSidecar();
  process.exit(143);
});

try {
  const deadline = Date.now() + 90_000;
  let statusBody = null;
  while (Date.now() < deadline && !statusBody) {
    try {
      const response = await api('/api/v1/status');
      if (response.ok) statusBody = await response.json();
    } catch {
      // The sidecar has not started listening yet.
    }
    if (!statusBody) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!statusBody) throw new Error(`sidecar did not become healthy; see ${logPath}`);

  const currentResponse = await api('/api/v1/settings');
  const hasSettings = currentResponse.ok;
  const current = hasSettings
    ? ((await currentResponse.json()).data ?? {})
    : {};
  const library = current.library ?? {};
  const settingsResponse = await api(hasSettings ? '/api/v1/settings' : '/api/v1/start', {
    method: hasSettings ? 'PATCH' : 'POST',
    body: JSON.stringify({
      library: {
        ...library,
        libraryPath,
        libraryPaths: [],
        torrentProvider: library.torrentProvider ?? 'none',
      },
      mediaPlayer: current.mediaPlayer ?? {},
      torrent: current.torrent ?? {},
      anilist: current.anilist ?? {},
      discord: current.discord ?? {},
      manga: current.manga ?? {},
      notifications: current.notifications ?? {},
      nakama: current.nakama ?? {},
      ...(hasSettings
        ? {}
        : {
            enableTranscode: false,
            enableTorrentStreaming: false,
            debridProvider: 'none',
          }),
    }),
  });
  if (!settingsResponse.ok) {
    throw new Error(
      `${hasSettings ? 'settings update' : 'initial setup'} failed: HTTP ${settingsResponse.status}`,
    );
  }

  const scanResponse = await api('/api/v1/library/scan', {
    method: 'POST',
    body: JSON.stringify({
      enhanced: true,
      enhanceWithOfflineDatabase: false,
      skipLockedFiles: false,
      skipIgnoredFiles: false,
    }),
  });
  const scanBody = await scanResponse.json();
  if (!scanResponse.ok || scanBody.error) {
    throw new Error(`library scan failed: HTTP ${scanResponse.status}`);
  }

  const localFiles = Array.isArray(scanBody.data) ? scanBody.data : [];
  const normalizedMkv = path.normalize(mkvPath).toLocaleLowerCase('en-US');
  const fixture = localFiles.find(
    (file) =>
      typeof file?.path === 'string'
      && path.normalize(file.path).toLocaleLowerCase('en-US') === normalizedMkv,
  );
  if (!fixture) {
    throw new Error(`scan did not register the fixture; registered ${localFiles.length} file(s)`);
  }
  if (!(fixture.mediaId > 0)) {
    throw new Error(`fixture was registered but not matched: ${JSON.stringify(fixture)}`);
  }

  const mediaIds = [
    ...new Set(localFiles.map((file) => file?.mediaId ?? 0).filter((mediaId) => mediaId > 0)),
  ];
  const seedResponse = await api('/api/v1/library/unknown-media', {
    method: 'POST',
    body: JSON.stringify({ mediaIds }),
  });
  if (!seedResponse.ok) {
    throw new Error(`collection seed failed: HTTP ${seedResponse.status}`);
  }

  // Let Seanime finish its asynchronous collection write before terminating the process.
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const manifest = {
    schemaVersion: 1,
    preparedAt: new Date().toISOString(),
    executable: EXE,
    dataDir: DATA_DIR,
    libraryPath,
    mkvPath,
    sourceMkv: SOURCE_MKV,
    mediaIds,
    fixture: {
      mediaId: fixture.mediaId,
      path: fixture.path,
    },
    serverVersion: statusBody.data?.version ?? null,
    simulatedUser: statusBody.data?.user?.isSimulated ?? null,
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  prepared = true;

  console.log(`GPLAY_DATADIR_READY ${JSON.stringify(manifest)}`);
  console.log(`SEANIME_SIDECAR=1`);
  console.log(`SEANIME_EXE=${EXE}`);
  console.log(`SEANIME_DATADIR=${DATA_DIR}`);
} finally {
  stopSidecar();
  await new Promise((resolve) => logStream.end(resolve));
  if (!prepared) {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }
}
