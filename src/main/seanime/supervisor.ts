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
import { createSeanimeLifecycle, isPermanentFailure } from './lifecycle';

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
/** First polls are tight: a warm datadir answers in ~0.7 s, and every poll gap is latency. */
const HEALTH_INTERVAL_MS = 100;
/** One lifecycle ping (`lifecycle.ts`) may take this long before it counts as missed. */
const PING_TIMEOUT_MS = 4_000;
const LOG_TAIL_MAX = 40;

let child: ChildProcess | null = null;
/** Children this file killed on purpose: their exit is not a crash. */
const expectedExits = new WeakSet<ChildProcess>();
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

async function pollHealth(port: number, deadline: number, owner: ChildProcess): Promise<SeanimeStatus['kind']> {
  let interval = HEALTH_INTERVAL_MS;
  while (Date.now() < deadline) {
    if (child !== owner || owner.exitCode !== null) return 'failed';
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
    await new Promise((r) => setTimeout(r, interval));
    // A first-run datadir (migrations, several seconds) should not cost a request per 100 ms.
    interval = Math.min(500, Math.round(interval * 1.25));
  }
  return 'failed';
}

/** One health request for the lifecycle's keep-warm loop. Never throws. */
async function pingSeanime(): Promise<boolean> {
  const port = status.port;
  if (!port || !child) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/status`, {
      headers: { 'X-Seanime-Token': token },
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
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

/**
 * Spawn ONE generation and resolve once it is ready or has failed. When to call it — and
 * what to do after a failure or a crash — is `lifecycle.ts`'s business, not this function's.
 */
async function spawnGeneration(): Promise<SeanimeStatus> {
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
    // A restart in progress stays a recovery to the UI until it is ready (or gives up).
    recovering: status.recovering === true,
  });

  const proc = spawn(
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
  child = proc;

  proc.stdout?.on('data', pushLog);
  proc.stderr?.on('data', pushLog);
  // Without this, a spawn failure (exe deleted, blocked by antivirus, EACCES)
  // is an unhandled 'error' event — an uncaught exception in main.
  proc.on('error', (err) => {
    if (child !== proc) return;
    child = null;
    keepalive.stop();
    pushLog(`spawn error: ${err.message}`);
    setStatus({ kind: 'failed', pid: null, error: `could not start the sidecar: ${err.message}`, errorCode: 'spawn-failed' });
  });
  proc.on('exit', (code) => {
    const expected = expectedExits.has(proc);
    if (child === proc) child = null;
    if (expected) return;
    // Release the client before anything else: a keepalive left running would retry
    // against a port with nothing behind it until the next start replaced it.
    keepalive.stop();
    const said = `sidecar exited with code ${code ?? 'null'}`;
    pushLog(said);
    if (status.kind === 'starting') {
      // A crash during the start: `pollHealth` sees it and the start reports the failure.
      setStatus({ error: said, errorCode: 'crashed' });
      return;
    }
    if (status.kind !== 'ready') return;
    // Not a silent stop and not an error screen: the lifecycle brings it back (`recovering`
    // keeps the player's loading frame up meanwhile) and only a run of failures is shown.
    // The status is held at `ready` for this one synchronous step so the next one the UI
    // sees is the recovery, never a flash of "offline".
    lifecycle.onUnexpectedExit(said);
    if (!lifecycle.snapshot().restartPending) {
      setStatus({ kind: 'offline', pid: null, port: 0, error: said, errorCode: 'crashed', recovering: false });
    }
  });

  setStatus({ pid: proc.pid ?? null });

  const kind = await pollHealth(port, Date.now() + HEALTH_TIMEOUT_MS, proc);
  if (child !== proc) {
    // Killed (stop) or crashed while starting; whatever ended it has said so.
    if (status.kind === 'starting') {
      setStatus({
        kind: 'failed',
        pid: null,
        port: 0,
        errorCode: status.errorCode ?? 'crashed',
        error: status.error ?? 'the sidecar exited while starting',
      });
    }
    return status;
  }
  if (kind === 'ready') {
    // Before the status goes out, so the log line it writes rides the same update and
    // the dev panel shows the client being held rather than reporting it a poll later.
    keepalive.start({ baseUrl: `http://127.0.0.1:${port}`, token });
    setStatus({ kind: 'ready', error: null, errorCode: null, recovering: false });
  } else if (status.kind === 'starting') {
    // Only a start still in progress timed out; a spawn error or an early exit
    // has already said what happened and must not be reworded as "unhealthy".
    setStatus({
      kind: 'failed',
      error: `sidecar did not become healthy within ${HEALTH_TIMEOUT_MS / 1000}s`,
      errorCode: 'unhealthy',
    });
    killChild();
  } else {
    killChild();
  }
  return status;
}

/** Kill the running generation on purpose (its exit is not reported as a crash). */
function killChild(): void {
  // First, and synchronously: while this client is held the dead-man switch will never
  // fire, so a stop that killed the child without releasing it would leave the one thing
  // that could still finish the job holding a socket to a dead port.
  keepalive.stop();
  const proc = child;
  child = null;
  if (!proc) return;
  expectedExits.add(proc);
  if (proc.pid) killTree(proc.pid);
}

const lifecycle = createSeanimeLifecycle({
  spawn: spawnGeneration,
  kill: () => {
    killChild();
    if (status.kind === 'ready' || status.kind === 'starting') {
      setStatus({ pid: null, port: 0 });
    }
  },
  isRunning: () => child !== null && child.exitCode === null,
  status: () => status,
  ping: pingSeanime,
  report: (event) => {
    if (event.kind === 'recovering') {
      // The player keeps its frame and its queued request; nothing to explain yet.
      setStatus({
        kind: 'starting',
        pid: null,
        port: 0,
        recovering: true,
        error: `restarting (attempt ${event.attempt}) — ${event.reason}`,
        errorCode: null,
      });
      return;
    }
    setStatus({
      kind: 'failed',
      pid: null,
      port: 0,
      recovering: false,
      error: event.reason,
      errorCode: status.errorCode ?? 'crashed',
    });
  },
  setTimer: (fn, ms) => {
    const handle = setTimeout(fn, ms);
    // A pending warm or restart must never hold the process open at quit.
    (handle as { unref?: () => void }).unref?.();
    return handle;
  },
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  log: (line) => pushLog(line),
});

/**
 * Start the sidecar (or join the start in flight) and resolve once it is ready or has
 * failed. This is the user's Start / Retry: it also restarts the failure count, so a
 * sidecar that gave up gets its full run of attempts again.
 */
export function startSeanime(): Promise<SeanimeStatus> {
  if (isPermanentFailure(status) && status.errorCode === 'missing-exe') {
    // Look again: a reinstall (or a harness setting SEANIME_EXE) may have fixed it.
    setStatus({ ...emptyStatus('stopped') });
  }
  return lifecycle.ensure({ manual: true, reason: 'start requested' });
}

/**
 * "Something will want the media server soon": start it without waiting, now or after
 * `delayMs`. A player opening calls this with 0, the app a few seconds after its first
 * paint, a media surface when it comes into view. A no-op when it is already up, already
 * starting, or cannot start (missing binary, opted out).
 */
export function warmSeanime(delayMs = 0, reason = 'warm'): SeanimeStatus {
  // A sidecar that gave up (or can never start) waits for the user's Retry: a warm must not
  // quietly restart the loop that just failed five times.
  if (status.kind === 'disabled' || status.kind === 'failed') return status;
  if (delayMs <= 0) {
    void lifecycle.ensure({ reason }).catch(() => undefined);
  } else {
    lifecycle.warm(delayMs, reason);
  }
  return status;
}

/**
 * Answer "is there a binary?" before anything is spawned, so a missing install is a stated
 * failure from the first status read instead of something discovered on the first play.
 */
export function primeSeanimeStatus(): SeanimeStatus {
  if (status.kind !== 'stopped' || child) return status;
  const exe = currentExe();
  if (!exe.exists) {
    setStatus({ ...emptyStatus('failed'), error: seanimeExeMissingMessage(exe), errorCode: 'missing-exe' });
  }
  return status;
}

/** For tests and the dev panel: the lifecycle's own view. */
export function seanimeLifecycleSnapshot(): ReturnType<typeof lifecycle.snapshot> {
  return lifecycle.snapshot();
}

/** Synchronous so it is safe from `will-quit` and `process.on('exit')`. */
export function stopSeanime(): void {
  lifecycle.stop();
  // The datadir deliberately survives: it holds the sidecar's settings, library and any
  // installed provider extension. Phase 1 deleted it here, which is exactly what made a
  // normal run start empty every time.
  dataDir = null;
  token = '';
  if (status.kind !== 'offline' && status.kind !== 'failed') {
    setStatus({ ...emptyStatus('stopped'), logTail: status.logTail });
  } else {
    setStatus({ pid: null, port: 0, recovering: false });
  }
}
