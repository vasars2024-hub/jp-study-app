/**
 * Seanime sidecar supervisor.
 *
 * Owns exactly one `seanime.exe` child: ephemeral loopback port, token auth, no
 * external bind, and a datadir the sidecar alone owns. That datadir was a throwaway
 * temp directory for Phase 1 and is now durable — `<userData>/seanime`, or whatever
 * `SEANIME_DATADIR` names. See `dataDir.ts` for why the change was required and for
 * the sense in which Study OS data is still untouched (its own subdirectory; no
 * shared file).
 *
 * Lifecycle is the thing Phase 1 is proving, so the kill path is deliberately
 * belt-and-braces: graceful quit, `will-quit`, and a synchronous `process.on('exit')`
 * sweep. On Windows a child is NOT reaped with its parent, so `taskkill /T /F` is the
 * backstop. `--desktop-sidecar` additionally arms Seanime's own dead-man switch, which
 * exits the server ~10s after the last websocket client drops.
 *
 * That switch is why this file holds a websocket of its own — see `keepalive.ts`. The
 * only client used to live inside the media workspace, a transient overlay, so closing
 * the workspace killed a healthy server the app still owned. The supervisor now holds
 * the client for as long as the app runs, which is the lifetime the switch was written
 * to track; it is released before the child is killed so a stop still stops.
 */

import { app } from 'electron';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { SEANIME_SIDECAR_ENABLED, type SeanimeStatus } from '../../shared/seanime';
import {
  resolveSeanimeDataDir,
  seanimeDataDirLogLine,
  type SeanimeDataDirIo,
} from './dataDir';
import {
  resolveSeanimeExe,
  seanimeExeMissingMessage,
  type SeanimeExeResolution,
} from './exePath';
import {
  createSeanimeKeepalive,
  type SeanimeKeepaliveIo,
} from './keepalive';

/**
 * Where the binary comes from. Resolved per start rather than at module load, so
 * a proof harness can set `SEANIME_EXE` after import, and so `app.isPackaged` /
 * `app.getAppPath()` are read when they are meaningful. See `exePath.ts` for the
 * order and for the packaging slot this deliberately names.
 */
function currentExe(): SeanimeExeResolution {
  return resolveSeanimeExe(
    {
      envOverride: process.env.SEANIME_EXE,
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      appPath: app.getAppPath(),
    },
    (candidate) => fs.existsSync(candidate),
  );
}

/**
 * The filesystem surface `dataDir.ts` asks for. `copyDir` skips a segment by name so an
 * adopted profile brings its settings, library and extensions but not another run's logs.
 */
const dataDirIo: SeanimeDataDirIo = {
  exists: (target) => fs.existsSync(target),
  isDirectory: (target) => {
    try {
      return fs.statSync(target).isDirectory();
    } catch {
      return false;
    }
  },
  mkdirp: (target) => fs.mkdirSync(target, { recursive: true }),
  readDirNames: (target) => fs.readdirSync(target),
  mtimeMs: (target) => {
    try {
      return fs.statSync(target).mtimeMs;
    } catch {
      return 0;
    }
  },
  copyDir: (from, to, skip) =>
    fs.cpSync(from, to, {
      recursive: true,
      filter: (src) => !skip.includes(path.basename(src)),
    }),
};

/**
 * The real socket and clock behind `keepalive.ts`.
 *
 * `WebSocket` is a global in Electron 42's Node 24 runtime; the guard is not defensive
 * about that so much as about the module being loaded somewhere it is not, in which case
 * rule 5 applies and the sidecar simply behaves as it did before. No `message` listener
 * is attached on purpose — this client exists to be counted, not to be talked to, and
 * `SendEvent` broadcasts every progress event to every connection.
 */
const keepaliveIo: SeanimeKeepaliveIo = {
  connect: (url, handlers) => {
    if (typeof WebSocket !== 'function') {
      throw new Error('no WebSocket in this runtime');
    }
    const socket = new WebSocket(url);
    socket.addEventListener('open', () => handlers.onOpen());
    socket.addEventListener('close', () => handlers.onClose());
    // An `error` is always followed by `close`, so this listener exists only so the
    // event has a handler rather than to duplicate the terminal path.
    socket.addEventListener('error', () => undefined);
    return () => socket.close();
  },
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  log: (line) => pushLog(line),
};

const keepalive = createSeanimeKeepalive(keepaliveIo);

const HEALTH_TIMEOUT_MS = 90_000;
const HEALTH_INTERVAL_MS = 500;
const LOG_TAIL_MAX = 40;

let child: ChildProcess | null = null;
// `disabled` is what the renderer keys off to hide the dev panel entirely, so the
// initial state must reflect the flag: armed-but-not-started is `stopped`.
let status: SeanimeStatus = emptyStatus(SEANIME_SIDECAR_ENABLED ? 'stopped' : 'disabled');
let token = '';
let dataDir: string | null = null;
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
    errorCode: null,
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
    // The flag is on by default now, so the only way to be here is an explicit opt-out.
    setStatus({ ...emptyStatus('disabled'), error: 'SEANIME_SIDECAR=0 disables the sidecar', errorCode: 'disabled' });
    return status;
  }
  if (child && child.exitCode === null) return status;

  const exe = currentExe();
  if (!exe.exists) {
    logTail = [];
    setStatus({ ...emptyStatus('failed'), error: seanimeExeMissingMessage(exe), errorCode: 'missing-exe' });
    return status;
  }

  installExitHook();
  logTail = [];

  // Durable datadir: SEANIME_DATADIR when a harness names one, else <userData>/seanime,
  // with a one-time adoption of a leftover Phase 1 temp datadir. Never disposable —
  // see dataDir.ts. The log line makes an adoption or a failed one visible in the dev
  // panel instead of silent.
  const resolvedDataDir = resolveSeanimeDataDir(
    {
      envOverride: process.env.SEANIME_DATADIR,
      userDataPath: app.getPath('userData'),
      tmpDir: os.tmpdir(),
    },
    dataDirIo,
  );
  dataDir = resolvedDataDir.dataDir;
  pushLog(seanimeDataDirLogLine(resolvedDataDir));

  const password = crypto.randomBytes(24).toString('hex');
  token = crypto.createHash('sha256').update(password).digest('hex');

  let port: number;
  try {
    port = await reservePort();
  } catch (err) {
    setStatus({ ...emptyStatus('failed'), error: `could not reserve a port: ${String(err)}`, errorCode: 'port' });
    return status;
  }

  setStatus({
    ...emptyStatus('starting'),
    port,
    dataDir,
  });

  child = spawn(
    exe.exePath,
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
  // Without this, a spawn failure (exe deleted, blocked by antivirus, EACCES)
  // is an unhandled 'error' event — an uncaught exception in main.
  child.on('error', (err) => {
    child = null;
    keepalive.stop();
    pushLog(`spawn error: ${err.message}`);
    setStatus({ kind: 'failed', pid: null, error: `could not start the sidecar: ${err.message}`, errorCode: 'spawn-failed' });
  });
  child.on('exit', (code) => {
    child = null;
    // Release the client before anything else: a keepalive left running would retry
    // against a port with nothing behind it until the next start replaced it.
    keepalive.stop();
    // A crash while we believed we were up is the "offline" state, not a silent stop.
    if (status.kind === 'ready' || status.kind === 'starting') {
      setStatus({
        kind: 'offline',
        pid: null,
        error: `sidecar exited with code ${code ?? 'null'}`,
        errorCode: 'crashed',
      });
    }
  });

  setStatus({ pid: child.pid ?? null });

  const kind = await pollHealth(port, Date.now() + HEALTH_TIMEOUT_MS);
  if (kind === 'ready') {
    // Before the status goes out, so the log line it writes rides the same update and
    // the dev panel shows the client being held rather than reporting it a poll later.
    keepalive.start({ baseUrl: `http://127.0.0.1:${port}`, token });
    setStatus({ kind: 'ready', error: null, errorCode: null });
  } else if (status.kind === 'starting') {
    // Only a start still in progress timed out; a spawn error or an early exit
    // has already said what happened and must not be reworded as "unhealthy".
    setStatus({
      kind: 'failed',
      error: `sidecar did not become healthy within ${HEALTH_TIMEOUT_MS / 1000}s`,
      errorCode: 'unhealthy',
    });
    stopSeanime();
  } else {
    stopSeanime();
  }
  return status;
}

/** Synchronous so it is safe from `will-quit` and `process.on('exit')`. */
export function stopSeanime(): void {
  // First, and synchronously: while this client is held the dead-man switch will never
  // fire, so a stop that killed the child without releasing it would leave the one thing
  // that could still finish the job holding a socket to a dead port.
  keepalive.stop();
  const pid = child?.pid;
  child = null;
  if (pid) killTree(pid);
  // The datadir deliberately survives: it holds the sidecar's settings, library and any
  // installed provider extension. Phase 1 deleted it here, which is exactly what made a
  // normal run start empty every time.
  dataDir = null;
  token = '';
  if (status.kind !== 'offline' && status.kind !== 'failed') {
    setStatus({ ...emptyStatus('stopped'), logTail: status.logTail });
  } else {
    setStatus({ pid: null, port: 0 });
  }
}
