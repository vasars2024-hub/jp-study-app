/**
 * Does the supervisor's keepalive actually stop the sidecar dying on workspace close?
 *
 * This drives the REAL pinned `seanime.exe` with the REAL `--desktop-sidecar` flag and
 * the REAL `src/main/seanime/keepalive.ts` module (imported directly — Node 24 strips
 * the types), so nothing about the mechanism is simulated. Electron is not involved,
 * which is the point: the claim is about the sidecar's dead-man switch and the socket
 * that holds it, and neither needs a window.
 *
 * Three phases, in order, each on its own throwaway datadir:
 *
 *   A. CONTROL — connect a workspace-shaped client, drop it, and time how long the
 *      sidecar survives. This is the defect: it must EXIT. Without this phase a passing
 *      phase B proves nothing, because a switch that never fires would also "pass".
 *   B. FIX — hold the supervisor keepalive, then connect and drop a workspace client on
 *      top of it. The sidecar must SURVIVE well past the window measured in A.
 *   C. RELEASE — stop the keepalive with no other client connected. The sidecar must
 *      EXIT again, proving the keepalive does not defeat a legitimate shutdown and that
 *      orphan protection is intact for a main process that dies without cleaning up.
 *
 * Self-cleaning: every datadir is created under the OS temp dir with a name that
 * `dataDir.ts` will never adopt (it only adopts `seanime-phase1-*`), every child is
 * killed with its tree, and the directories are removed on the way out.
 *
 *   node docs/migration/tools/sidecar-keepalive-harness.mjs [--out <file.json>]
 */

import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');

// `pathToFileURL`, not a bare path: a Windows absolute path starts `c:` and the ESM
// loader reads that as an unsupported URL scheme.
const { createSeanimeKeepalive, seanimeKeepaliveUrl, KEEPALIVE_CLIENT_ID } = await import(
  pathToFileURL(path.join(REPO, 'src/main/seanime/keepalive.ts')).href
);

const EXE = process.env.SEANIME_EXE
  || path.resolve(REPO, '..', 'seanime-upstream', 'seanime.exe');

/** Generous: phase A measured ~15-20s on the machine this was written on. */
const DEATH_TIMEOUT_MS = 45_000;
/** How long a held keepalive must keep the sidecar alive to count as surviving. */
const SURVIVAL_MS = 25_000;
const READY_TIMEOUT_MS = 60_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => (port ? resolve(port) : reject(new Error('no port'))));
    });
  });
}

function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    /* already gone */
  }
}

/** Spawns a sidecar exactly as `supervisor.ts` does, and waits for /api/v1/status. */
async function startSidecar(label) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seanime-keepalive-'));
  const password = crypto.randomBytes(24).toString('hex');
  const token = crypto.createHash('sha256').update(password).digest('hex');
  const port = await reservePort();

  const child = spawn(
    EXE,
    [
      `--datadir=${dataDir}`,
      '--host=127.0.0.1',
      `--port=${port}`,
      `--password=${password}`,
      '--desktop-sidecar',
    ],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );

  const log = [];
  // The sidecar colours its own output; the record is meant to be read, not replayed
  // into a terminal. The pattern is built rather than written as a literal so the ESC
  // byte does not sit in this source file as a raw control character.
  const ansi = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
  const stripAnsi = (line) => line.replace(ansi, '');
  const collect = (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (line.trim()) log.push(stripAnsi(line).trim());
    }
  };
  child.stdout?.on('data', collect);
  child.stderr?.on('data', collect);

  let exited = null;
  const exitedAt = { at: null };
  child.on('exit', (code) => {
    exited = code;
    exitedAt.at = Date.now();
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let ready = false;
  while (Date.now() < deadline && exited === null) {
    try {
      const res = await fetch(`${baseUrl}/api/v1/status`, {
        headers: { 'X-Seanime-Token': token },
      });
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      /* not listening yet */
    }
    await sleep(400);
  }
  if (!ready) {
    killTree(child.pid);
    throw new Error(`[${label}] sidecar never became ready. log:\n${log.slice(-15).join('\n')}`);
  }

  return {
    label,
    child,
    dataDir,
    port,
    token,
    baseUrl,
    log,
    isAlive: () => exited === null,
    exitCode: () => exited,
    exitedAt,
    dispose() {
      killTree(child.pid);
      try {
        fs.rmSync(dataDir, { recursive: true, force: true });
      } catch {
        /* the OS reclaims temp */
      }
    },
  };
}

/**
 * A client shaped like the media workspace's: its own claimed id, the same token, and
 * nothing else. `RemoveConn` keys on that id, which is why it must not be the
 * supervisor's — see keepalive.ts rule 1.
 */
function connectWorkspaceClient(sidecar, id = 'harness-workspace') {
  const url = new URL('/events', sidecar.baseUrl);
  url.protocol = 'ws:';
  url.searchParams.set('id', id);
  url.searchParams.set('token', sidecar.token);
  const socket = new WebSocket(url.toString());
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve(true));
    socket.addEventListener('error', () => reject(new Error('workspace client failed to open')));
  });
  socket.addEventListener('error', () => undefined);
  return { socket, opened, close: () => socket.close() };
}

/** Polls until the sidecar exits, or gives up. Returns ms survived, or null. */
async function waitForExit(sidecar, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!sidecar.isAlive()) return Date.now() - start;
    await sleep(500);
  }
  return null;
}

const results = { tool: 'sidecar-keepalive-harness', exe: EXE, phases: {} };
/** What the shipped module reported through its own log sink. */
const keepaliveLog = [];
let failures = 0;

function record(name, payload, ok) {
  results.phases[name] = { ...payload, verdict: ok ? 'PASS' : 'FAIL' };
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${payload.summary}`);
}

// ── Phase A — the control. The defect must reproduce. ────────────────────────────────
{
  const sidecar = await startSidecar('control');
  try {
    const client = connectWorkspaceClient(sidecar);
    await client.opened;
    await sleep(1_000);
    client.close();
    const died = await waitForExit(sidecar, DEATH_TIMEOUT_MS);
    record(
      'A-control-workspace-close-kills-the-sidecar',
      {
        what: 'One workspace-shaped client connects and disconnects; nothing else holds a socket.',
        diedAfterMs: died,
        exitCode: sidecar.exitCode(),
        watchdogLog: sidecar.log.filter((line) => /desktop sidecar|No connection/i.test(line)),
        summary: died === null
          ? `still alive after ${DEATH_TIMEOUT_MS}ms — the switch did not fire, so phase B would prove nothing`
          : `sidecar exited after ${died}ms with code ${sidecar.exitCode()}`,
      },
      died !== null,
    );
  } finally {
    sidecar.dispose();
  }
}

// ── Phase B — the fix, using the shipped module. ─────────────────────────────────────
{
  const sidecar = await startSidecar('fix');
  const keepalive = createSeanimeKeepalive({
    connect: (url, handlers) => {
      const socket = new WebSocket(url);
      socket.addEventListener('open', () => handlers.onOpen());
      socket.addEventListener('close', () => handlers.onClose());
      socket.addEventListener('error', () => undefined);
      return () => socket.close();
    },
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (handle) => clearTimeout(handle),
    log: (line) => keepaliveLog.push(line),
  });

  try {
    keepalive.start({ baseUrl: sidecar.baseUrl, token: sidecar.token });
    const connectDeadline = Date.now() + 10_000;
    while (!keepalive.connected() && Date.now() < connectDeadline) await sleep(100);
    if (!keepalive.connected()) throw new Error('the keepalive never connected');

    const client = connectWorkspaceClient(sidecar);
    await client.opened;
    await sleep(1_000);
    client.close();

    const died = await waitForExit(sidecar, SURVIVAL_MS);
    record(
      'B-keepalive-holds-the-sidecar-through-a-workspace-close',
      {
        what: 'The supervisor keepalive is held; a workspace client connects on top of it and leaves.',
        url: seanimeKeepaliveUrl({ baseUrl: sidecar.baseUrl, token: '<redacted>' }),
        clientId: KEEPALIVE_CLIENT_ID,
        survivedMs: died === null ? SURVIVAL_MS : null,
        diedAfterMs: died,
        keepaliveStillConnected: keepalive.connected(),
        // Two distinct ids is rule 1 holding on the real server: a shared id would make
        // the workspace's disconnect evict the supervisor's connection via RemoveConn.
        clientsTheServerSaw: sidecar.log.filter((line) => line.includes('Client connected')),
        keepaliveLog: [...keepaliveLog],
        summary: died === null
          ? `sidecar alive after ${SURVIVAL_MS}ms with the keepalive still connected`
          : `sidecar exited after ${died}ms — the keepalive did NOT hold it`,
      },
      died === null && keepalive.connected(),
    );

    // ── Phase C — releasing the client must let it die. ──────────────────────────────
    keepalive.stop();
    const diedAfterRelease = await waitForExit(sidecar, DEATH_TIMEOUT_MS);
    record(
      'C-releasing-the-keepalive-lets-the-switch-finish',
      {
        what: 'keepalive.stop() with no other client connected — the orphan protection path.',
        diedAfterMs: diedAfterRelease,
        exitCode: sidecar.exitCode(),
        summary: diedAfterRelease === null
          ? `still alive ${DEATH_TIMEOUT_MS}ms after release — the keepalive defeats shutdown`
          : `sidecar exited ${diedAfterRelease}ms after release with code ${sidecar.exitCode()}`,
      },
      diedAfterRelease !== null,
    );
  } finally {
    keepalive.stop();
    sidecar.dispose();
  }
}

const outFlag = process.argv.indexOf('--out');
if (outFlag !== -1 && process.argv[outFlag + 1]) {
  const out = path.resolve(process.argv[outFlag + 1]);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`\nwrote ${out}`);
}

console.log(`\n${failures === 0 ? 'ALL PHASES PASSED' : `${failures} PHASE(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
