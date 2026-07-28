/**
 * Seanime sidecar supervisor (Phase 1 — read-only architecture proof).
 *
 * Owns exactly one `seanime.exe` child: ephemeral loopback port, isolated temp
 * datadir, token auth, no external bind. It never reads or writes Study OS user
 * data — the sidecar's `--datadir` is a throwaway directory under the OS temp dir.
 *
 * Lifecycle is the thing Phase 1 is proving, so the kill path is deliberately
 * belt-and-braces: graceful quit, `will-quit`, and a synchronous `process.on('exit')`
 * sweep. On Windows a child is NOT reaped with its parent, so `taskkill /T /F` is the
 * backstop. `--desktop-sidecar` additionally arms Seanime's own dead-man switch, which
 * exits the server ~15s after the websocket drops.
 */

import { app } from 'electron';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { SEANIME_SIDECAR_ENABLED, type SeanimeStatus } from '../../shared/seanime';

/** Where the pinned build lives. Overridable so the path is not baked in. */
const SEANIME_EXE =
  process.env.SEANIME_EXE ?? 'C:/Users/Arseniy/Projects/seanime-upstream/seanime.exe';

const HEALTH_TIMEOUT_MS = 90_000;
const HEALTH_INTERVAL_MS = 500;
const LOG_TAIL_MAX = 40;

let child: ChildProcess | null = null;
// `disabled` is what the renderer keys off to hide the dev panel entirely, so the
// initial state must reflect the flag: armed-but-not-started is `stopped`.
let status: SeanimeStatus = emptyStatus(SEANIME_SIDECAR_ENABLED ? 'stopped' : 'disabled');
let token = '';
let dataDir: string | null = null;
/** True when the datadir came from SEANIME_DATADIR, so stop() must not delete it. */
let dataDirIsExternal = false;
let logTail: string[] = [];
let exitHookInstalled = false;
const listeners = new Set<(s: SeanimeStatus) => void>();

function emptyStatus(kind: SeanimeStatus['kind']): SeanimeStatus {
  return {
    kind,
    port: 0,
    pid: null,
    dataDir: null,
    version: null,
    simulatedUser: null,
    error: null,
    logTail: [],
  };
}

function setStatus(patch: Partial<SeanimeStatus>): void {
  status = { ...status, ...patch, logTail: logTail.slice(-LOG_TAIL_MAX) };
  for (const fn of listeners) {
    try {
      fn(status);
    } catch {
      /* a bad subscriber must not take down the supervisor */
    }
  }
}

export function getSeanimeStatus(): SeanimeStatus {
  return status;
}

export function onSeanimeStatus(cb: (s: SeanimeStatus) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Auth header value the server expects: sha256 hex of the configured password. */
export function seanimeAuthToken(): string {
  return token;
}

export function seanimeBaseUrl(): string | null {
  return status.port ? `http://127.0.0.1:${status.port}` : null;
}

/** Ask the OS for a free loopback port, then hand that number to the server. */
function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => (port ? resolve(port) : reject(new Error('no port'))));
    });
  });
}

function pushLog(chunk: Buffer | string): void {
  const text = String(chunk);
  for (const line of text.split(/\r?\n/)) {
    if (line.trim()) logTail.push(line);
  }
  if (logTail.length > LOG_TAIL_MAX * 4) logTail = logTail.slice(-LOG_TAIL_MAX);
}

async function pollHealth(port: number, deadline: number): Promise<SeanimeStatus['kind']> {
  while (Date.now() < deadline) {
    if (!child || child.exitCode !== null) return 'failed';
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/status`, {
        headers: { 'X-Seanime-Token': token },
      });
      if (res.ok) {
        const body = (await res.json()) as {
          data?: { version?: string; user?: { isSimulated?: boolean } };
        };
        setStatus({
          version: body.data?.version ?? null,
          simulatedUser: body.data?.user?.isSimulated ?? null,
        });
        return 'ready';
      }
    } catch {
      /* not listening yet — keep polling until the deadline */
    }
    await new Promise((r) => setTimeout(r, HEALTH_INTERVAL_MS));
  }
  return 'failed';
}

/**
 * Windows does not reap children with their parent, so kill the whole tree.
 * Synchronous by design: this also runs from `process.on('exit')`, where async
 * work would never get a chance to flush.
 */
function killTree(pid: number): void {
  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
      return;
    } catch {
      /* fall through to signal */
    }
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    /* already gone */
  }
}

function installExitHook(): void {
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  // Covers a crash/forced exit, where `will-quit` never fires.
  process.on('exit', () => {
    if (child?.pid) killTree(child.pid);
  });
  app.on('will-quit', () => stopSeanime());
}

export async function startSeanime(): Promise<SeanimeStatus> {
  if (!SEANIME_SIDECAR_ENABLED) {
    setStatus({ ...emptyStatus('disabled'), error: 'SEANIME_SIDECAR is not set' });
    return status;
  }
  if (child && child.exitCode === null) return status;

  if (!fs.existsSync(SEANIME_EXE)) {
    logTail = [];
    setStatus({ ...emptyStatus('failed'), error: `seanime.exe not found at ${SEANIME_EXE}` });
    return status;
  }

  installExitHook();
  logTail = [];

  // Isolated datadir. Deliberately NOT under app.getPath('userData') in either branch.
  // SEANIME_DATADIR lets a Phase-1 session reuse one already-scanned dir across restarts
  // (a fresh mkdtemp starts with no settings and no library, so the grid would be empty);
  // it is then the caller's to delete, which is the documented rollback.
  const override = process.env.SEANIME_DATADIR?.trim();
  dataDirIsExternal = Boolean(override);
  if (override) {
    fs.mkdirSync(override, { recursive: true });
    dataDir = override;
  } else {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seanime-phase1-'));
  }
  const password = crypto.randomBytes(24).toString('hex');
  token = crypto.createHash('sha256').update(password).digest('hex');

  let port: number;
  try {
    port = await reservePort();
  } catch (err) {
    setStatus({ ...emptyStatus('failed'), error: `could not reserve a port: ${String(err)}` });
    return status;
  }

  setStatus({
    ...emptyStatus('starting'),
    port,
    dataDir,
  });

  child = spawn(
    SEANIME_EXE,
    [
      `--datadir=${dataDir}`,
      '--host=127.0.0.1', // loopback only — never binds an external interface
      `--port=${port}`,
      `--password=${password}`,
      '--desktop-sidecar', // arms Seanime's own no-websocket dead-man switch
    ],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );

  child.stdout?.on('data', pushLog);
  child.stderr?.on('data', pushLog);
  child.on('exit', (code) => {
    child = null;
    // A crash while we believed we were up is the "offline" state, not a silent stop.
    if (status.kind === 'ready' || status.kind === 'starting') {
      setStatus({
        kind: 'offline',
        pid: null,
        error: `sidecar exited with code ${code ?? 'null'}`,
      });
    }
  });

  setStatus({ pid: child.pid ?? null });

  const kind = await pollHealth(port, Date.now() + HEALTH_TIMEOUT_MS);
  if (kind === 'ready') {
    setStatus({ kind: 'ready', error: null });
  } else {
    setStatus({
      kind: 'failed',
      error: `sidecar did not become healthy within ${HEALTH_TIMEOUT_MS / 1000}s`,
    });
    stopSeanime();
  }
  return status;
}

/** Synchronous so it is safe from `will-quit` and `process.on('exit')`. */
export function stopSeanime(): void {
  const pid = child?.pid;
  child = null;
  if (pid) killTree(pid);
  if (dataDir && !dataDirIsExternal) {
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* temp dir; the OS reclaims it */
    }
  }
  dataDir = null;
  dataDirIsExternal = false;
  token = '';
  if (status.kind !== 'offline' && status.kind !== 'failed') {
    setStatus({ ...emptyStatus('stopped'), logTail: status.logTail });
  } else {
    setStatus({ pid: null, port: 0 });
  }
}
