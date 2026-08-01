/**
 * Does the supervisor keepalive actually hold the sidecar inside a running Electron app?
 *
 * `sidecar-keepalive-harness.mjs` proved the module against the real `seanime.exe`, but it
 * supplied its own sockets and its own lifecycle. The supervisor wiring — start at `ready`,
 * release in `stopSeanime()` and on an unexpected child exit — was covered only by tests
 * that read `supervisor.ts` and assert its three call sites. `NEXT_SESSION.md` named the
 * gap: "the keepalive has never been seen inside a running Electron app."
 *
 * This closes it, and it closes the thing the fix exists for: **the media workspace is a
 * transient overlay**, so the run below opens it, closes it, waits past the dead-man
 * switch's window, and requires the same sidecar pid and port to still be there.
 *
 * ## Why it launches its own Electron rather than driving the developer's
 *
 * The app is normally running while this track is worked on, and two instances sharing
 * `%APPDATA%/jp-study-app` is exactly the hazard `CURRENT_STATE.md` records ("a second
 * Electron instance could have corrupted live user data"). So this instance gets:
 *
 *  - its own `--user-data-dir`, which also side-steps `requestSingleInstanceLock()` —
 *    the lock file lives in userData, so a second copy under the real one would simply
 *    quit on launch;
 *  - its own `SEANIME_DATADIR`, which `dataDir.ts` honours outright, so no leftover temp
 *    profile is adopted and the durable `<userData>/seanime` is never opened;
 *  - `--remote-debugging-port`, because `debugBridge.ts` hardcodes 39273 and a developer's
 *    instance is usually already holding it. CDP needs no free well-known port and no
 *    change to shipped code.
 *
 * Nothing here synthesizes Windows mouse or keyboard input; the renderer is driven by
 * raising the app's own events, the same way the 2026-07-31 live pass drove it.
 *
 * ## The phases, and what each one would look like if the fix were absent
 *
 *  A `ready`          — sidecar up, keepalive connected. Without the fix: identical.
 *  B workspace close  — the renderer's websocket drops. Without the fix this is the last
 *                       client, and the server begins its 10s countdown.
 *  C hold             — 35s later the same pid is still serving the same port. Without the
 *                       fix the process is gone (measured at ~14.3s in the module harness)
 *                       and the next open mints a new port and a new token.
 *  D reopen           — slice 7's real entry path. Same pid and port means the renderer's
 *                       stale-token failure mode cannot arise at all.
 *  E graceful quit    — `will-quit` → `stopSeanime()` → keepalive released → child killed.
 *                       Proves the held client does not prevent a stop.
 *
 * Usage: node docs/migration/tools/keepalive-electron-harness.mjs [--hold-ms=35000]
 * Writes its record to docs/migration/proof/sidecar-keepalive-electron-<stamp>/.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');

const args = process.argv.slice(2);
function flag(name, fallback) {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

/**
 * The switch needs 10s of continuous absence and polls every 5s, so the worst case is
 * ~15s. 35s is comfortably past it and past the 14.3s the module harness measured.
 */
const HOLD_MS = Number(flag('hold-ms', '35000'));
const READY_TIMEOUT_MS = 180_000;
const CDP_TIMEOUT_MS = 120_000;

const log = (...parts) => console.log(`[keepalive-electron] ${parts.join(' ')}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** Windows has no kill(pid, 0) that distinguishes a live process reliably enough here. */
function processAlive(pid) {
  if (!pid) return false;
  if (process.platform === 'win32') {
    const out = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' });
    return (out.stdout ?? '').includes(String(pid));
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function portListening(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.setTimeout(2000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

// ---------------------------------------------------------------------------
// CDP — just enough of it to evaluate expressions in the main window.
// ---------------------------------------------------------------------------

async function findPageTarget(cdpPort, deadline) {
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      const targets = await res.json();
      // The main desktop window is the only one loading the SPA with no query string;
      // every companion (blanc, mini, lockscreen, popouts) carries one. Same rule as
      // `debugBridge.ts` `mainDesktopWindow()`.
      const page = targets.find((t) => {
        if (t.type !== 'page' || !t.webSocketDebuggerUrl) return false;
        try {
          const u = new URL(t.url);
          return u.port === '5173' && u.search === '';
        } catch {
          return false;
        }
      });
      if (page) return page;
    } catch {
      /* the debugger endpoint is not up yet */
    }
    await sleep(500);
  }
  throw new Error('no main-window CDP target appeared');
}

class Cdp {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
  }

  async open() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      entry.resolve(msg);
    });
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', () => reject(new Error('CDP socket failed')), {
        once: true,
      });
    });
  }

  send(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve });
      this.socket.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`${method} timed out`));
      }, 30_000);
    });
  }

  /** Evaluates in the page and returns the value, awaiting a promise if one comes back. */
  async evaluate(expression) {
    const msg = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    const result = msg.result;
    if (result?.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? 'evaluate threw');
    }
    return result?.result?.value;
  }

  close() {
    try {
      this.socket?.close();
    } catch {
      /* already gone */
    }
  }
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

// Full second resolution on purpose: an earlier cut truncated to the hour, so three runs
// shared one working directory and the sidecar appended to one log. The evidence then read
// as several overlapping sessions and had to be untangled by timestamp.
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '');
const workRoot = path.join(os.tmpdir(), `seanime-keepalive-electron-${stamp}`);
const userDataDir = path.join(workRoot, 'userData');
const seanimeDataDir = path.join(workRoot, 'seanime-datadir');
fs.mkdirSync(userDataDir, { recursive: true });
fs.mkdirSync(seanimeDataDir, { recursive: true });

const record = {
  title: 'The supervisor keepalive, inside a real Electron app',
  date: new Date().toISOString().slice(0, 10),
  why:
    'sidecar-keepalive-harness.mjs proved keepalive.ts against the real binary but supplied its own '
    + 'sockets and lifecycle. The supervisor wiring was covered only by source-reading tests. This '
    + 'runs the real app and closes the workspace, which is the action that used to kill the sidecar.',
  isolation: { userDataDir, seanimeDataDir, note: 'the developer instance and %APPDATA%/jp-study-app are untouched' },
  phases: {},
  verdict: null,
};

let electron = null;
let cdp = null;

function electronBinary() {
  const exe = path.join(
    REPO,
    'node_modules',
    'electron',
    'dist',
    process.platform === 'win32' ? 'electron.exe' : 'electron',
  );
  if (!fs.existsSync(exe)) throw new Error(`electron not found at ${exe}`);
  return exe;
}

/**
 * Every websocket connect/disconnect the server logged, stripped of ANSI.
 *
 * This is the load-bearing evidence, not the supervisor's own log tail: `pushLog` keeps
 * only the last 40 lines and the sidecar writes dozens during startup, so the
 * `keepalive: holding a websocket client` line is routinely pushed out before a poll can
 * observe it. The server naming its own clients is a stronger claim anyway.
 */
function sidecarConnectionLines() {
  return sidecarLogText()
    .split(/\r?\n/)
    .map((l) => l.replace(/\[[0-9;]*m/g, '').trim())
    .filter((l) => /\bws\b/.test(l) && /client|conn/i.test(l));
}

/** Reads the sidecar's own log files out of the isolated datadir. */
function sidecarLogText() {
  const dir = path.join(seanimeDataDir, 'logs');
  if (!fs.existsSync(dir)) return '';
  return fs
    .readdirSync(dir)
    .map((name) => {
      try {
        return fs.readFileSync(path.join(dir, name), 'utf8');
      } catch {
        return '';
      }
    })
    .join('\n');
}

async function status() {
  return cdp.evaluate('window.api.seanimeStatus()');
}

/** Polls a boolean expression in the page. */
async function waitFor(expression, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let value = false;
    try {
      value = await cdp.evaluate(expression);
    } catch {
      /* the page can be mid-navigation */
    }
    if (value) return true;
    await sleep(500);
  }
  throw new Error(label);
}

/**
 * Raises the app's own open event until the workspace is actually mounted. One dispatch
 * is enough once the listener exists, but React can still be committing the effect on the
 * very first tick after the launcher paints.
 */
async function openWorkspace() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await cdp.evaluate(
      "window.dispatchEvent(new CustomEvent('seanime:media-workspace-open')), 'dispatched'",
    );
    await sleep(1000);
    if (await cdp.evaluate("!!document.querySelector('.seanime-host')")) return attempt + 1;
  }
  throw new Error('the media workspace never opened');
}

async function waitForStatus(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await status();
    if (predicate(last)) return last;
    await sleep(1000);
  }
  throw new Error(`${label} — last status ${JSON.stringify(last)}`);
}

async function main() {
  const cdpPort = await freePort();
  log(`isolated userData ${userDataDir}`);
  log(`isolated SEANIME_DATADIR ${seanimeDataDir}`);
  log(`CDP on ${cdpPort}`);

  electron = spawn(
    electronBinary(),
    ['.', `--user-data-dir=${userDataDir}`, `--remote-debugging-port=${cdpPort}`],
    {
      cwd: REPO,
      env: {
        ...process.env,
        SEANIME_SIDECAR: '1',
        SEANIME_DATADIR: seanimeDataDir,
        // SEANIME_EXE deliberately left as-is: an unset value exercises exePath.ts's
        // pinned-sibling-checkout branch, which is the branch a normal dev run uses.
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const mainOut = [];
  electron.stdout.on('data', (c) => mainOut.push(String(c)));
  electron.stderr.on('data', (c) => mainOut.push(String(c)));

  record.electronPid = electron.pid;
  log(`electron pid ${electron.pid}`);

  const target = await findPageTarget(cdpPort, Date.now() + CDP_TIMEOUT_MS);
  log(`attached to ${target.url}`);
  cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.open();

  // A CDP page target exists as soon as the document does, which on a fresh profile is
  // well before React has mounted anything. `MediaWorkspaceHost` registers the
  // `seanime:media-workspace-open` listener in an effect, so a dispatch sent before that
  // lands on nothing and is silently lost — the first run of this harness sat at
  // `stopped` for the full three-minute timeout for exactly that reason. Wait for the
  // host's own launcher, which is the same "is the listener there?" test the command
  // palette uses (`mediaWorkspaceHostIsMounted()`).
  await waitFor(
    "typeof window.api?.seanimeStatus === 'function'"
      + " && !!document.querySelector('.seanime-host-launcher, .seanime-host')",
    120_000,
    'the media workspace host never mounted',
  );
  log('host mounted; the open listener is registered');

  // --- Phase A: open the workspace, which is what starts the sidecar -------------
  const before = await status();
  record.phases.A = { statusBeforeOpen: before };
  if (before?.kind === 'disabled') {
    throw new Error('SEANIME_SIDECAR did not reach the main process — status is `disabled`');
  }

  log('opening the media workspace (the app\'s own event, no synthetic input)');
  const openAttempts = await openWorkspace();
  record.phases.A.openAttempts = openAttempts;
  const ready = await waitForStatus(
    (s) => s?.kind === 'ready',
    READY_TIMEOUT_MS,
    'the sidecar never reached ready',
  );
  const sidecarPid = ready.pid;
  const sidecarPort = ready.port;
  log(`sidecar ready — pid ${sidecarPid}, port ${sidecarPort}`);

  const keepaliveLine = (ready.logTail ?? []).find((l) => l.includes('keepalive:'));
  const hostOpen = await cdp.evaluate("!!document.querySelector('.seanime-host')");
  record.phases.A = {
    ...record.phases.A,
    result: 'PASS',
    sidecarPid,
    sidecarPort,
    dataDir: ready.dataDir,
    version: ready.version,
    workspaceOpen: hostOpen,
    supervisorKeepaliveLogLine: keepaliveLine ?? null,
    supervisorLogTailNote: keepaliveLine
      ? null
      : 'absent from the 40-line supervisor tail because the sidecar\'s startup stdout '
        + 'overwrites it; see sidecarSawSupervisorClient for the server-side evidence',
    logTail: ready.logTail ?? [],
  };

  // Wait for the renderer's OWN websocket, not a fixed sleep.
  //
  // This is the difference between proving the fix and appearing to. `MediaWorkspace` is a
  // lazy chunk that bootstraps its auth token before `WebsocketProvider` connects, and on a
  // cold profile that takes appreciably longer than the sidecar takes to answer `/status`.
  // A run that closed the workspace before that client existed would drop nothing, leave the
  // keepalive as the only connection all along, and still sail through phase C — which is
  // exactly what an early cut of this harness did, on a reused profile whose localStorage
  // already held a client id. So the renderer's client is now a precondition, and its
  // absence is a failure rather than a shrug.
  const rendererClientDeadline = Date.now() + 90_000;
  let rendererClientId = null;
  while (Date.now() < rendererClientDeadline && !rendererClientId) {
    const hit = sidecarConnectionLines()
      .map((l) => /Client connected id=([\w-]+)/.exec(l)?.[1])
      .find((id) => id && id !== 'study-os-supervisor');
    if (hit) rendererClientId = hit;
    else await sleep(1000);
  }
  record.phases.A.rendererClientId = rendererClientId;
  if (!rendererClientId) {
    record.phases.A.result = 'FAIL';
    throw new Error(
      'the renderer never opened its own websocket, so closing the workspace would drop '
      + 'nothing and phase C would prove nothing',
    );
  }
  log(`renderer websocket connected as ${rendererClientId}`);

  const logAtReady = sidecarLogText();
  record.phases.A.sidecarSawSupervisorClient = logAtReady.includes('study-os-supervisor');
  record.phases.A.sidecarClientIdsSeen = [
    ...new Set([...logAtReady.matchAll(/id=([\w-]+)/g)].map((m) => m[1])),
  ].slice(0, 12);
  record.phases.A.connectionLinesAtReady = sidecarConnectionLines().slice(-12);
  if (!record.phases.A.sidecarSawSupervisorClient) {
    record.phases.A.result = 'FAIL';
    log('WARNING: the server never logged a study-os-supervisor client');
  }

  // --- Phase B: close the workspace ---------------------------------------------
  log('closing the media workspace — the action that used to kill the sidecar');
  const linesBeforeClose = sidecarConnectionLines();
  const closed = await cdp.evaluate(`(() => {
    const btn = document.querySelector('.seanime-host-close');
    if (btn) { btn.click(); return 'close-button'; }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return 'escape';
  })()`);
  await sleep(6000);
  const hostGone = await cdp.evaluate("!document.querySelector('.seanime-host')");
  // The whole premise is that closing the workspace drops a websocket client. If the
  // server logs no disconnection here then phase C proves nothing — the switch was never
  // given anything to react to.
  const linesAfterClose = sidecarConnectionLines();
  const newLines = linesAfterClose.slice(linesBeforeClose.length);
  const droppedAClient = newLines.some((l) => /disconnect/i.test(l));
  const droppedTheKeepalive = newLines.some(
    (l) => /disconnect/i.test(l) && l.includes('study-os-supervisor'),
  );
  record.phases.B = {
    result: hostGone && droppedAClient && !droppedTheKeepalive ? 'PASS' : 'FAIL',
    closedVia: closed,
    workspaceStillMounted: !hostGone,
    serverLoggedAClientDrop: droppedAClient,
    keepaliveAlsoDropped: droppedTheKeepalive,
    newConnectionLines: newLines,
    why:
      'A close that dropped no client would make phase C vacuous, and a close that dropped '
      + 'the keepalive too would mean the renderer had evicted it via a shared id (rule 1).',
  };
  log(
    `workspace closed via ${closed}; host unmounted ${hostGone}; `
    + `server saw a client drop ${droppedAClient}`,
  );

  // --- Phase C: hold past the dead-man switch's window --------------------------
  log(`holding ${HOLD_MS} ms with no workspace — the switch needs 10s of absence`);
  const holdStart = Date.now();
  await sleep(HOLD_MS);
  const held = Date.now() - holdStart;

  const alive = processAlive(sidecarPid);
  const listening = await portListening(sidecarPort);
  const afterHold = await status();
  record.phases.C = {
    result: alive && listening && afterHold?.kind === 'ready' ? 'PASS' : 'FAIL',
    heldMs: held,
    connectionLinesDuringHold: sidecarConnectionLines().slice(-12),
    sidecarProcessAlive: alive,
    sidecarPortStillListening: listening,
    statusKind: afterHold?.kind ?? null,
    pidUnchanged: afterHold?.pid === sidecarPid,
    portUnchanged: afterHold?.port === sidecarPort,
    controlNote:
      'The module harness measured the unfixed process exiting after 14,268 ms with code 1. '
      + 'Anything under ~15s here would have been dead.',
  };
  log(
    `after ${held} ms — alive ${alive}, listening ${listening}, `
    + `pid ${afterHold?.pid} port ${afterHold?.port} kind ${afterHold?.kind}`,
  );

  // --- Phase D: reopen, which is slice 7's real entry path -----------------------
  log('reopening the workspace');
  await openWorkspace();
  await sleep(4000);
  const reopened = await status();
  record.phases.D = {
    result:
      reopened?.kind === 'ready' && reopened.pid === sidecarPid && reopened.port === sidecarPort
        ? 'PASS'
        : 'FAIL',
    statusKind: reopened?.kind ?? null,
    samePid: reopened?.pid === sidecarPid,
    samePort: reopened?.port === sidecarPort,
    why:
      'A new pid or port here is the stale-token failure mode: the renderer would keep the old '
      + 'ones and the player would fail with Unrecoverable HLS error at readyState 0.',
  };
  log(`reopened — pid ${reopened?.pid}, port ${reopened?.port}, kind ${reopened?.kind}`);

  const logAfter = sidecarLogText();
  record.sidecarLogEvidence = {
    sawSupervisorClient: logAfter.includes('study-os-supervisor'),
    countdownStarted: /No connection detected\. Starting countdown/i.test(logAfter),
    countdownExited: /No connection detected for 10 seconds/i.test(logAfter),
    note:
      'countdownStarted true with countdownExited false would mean the switch armed and the '
      + 'keepalive reconnected inside the window. Both false is the expected shape.',
  };

  // --- Phase E: graceful quit ----------------------------------------------------
  log('quitting the app — will-quit must still stop the sidecar');
  await cdp.evaluate('window.close(), 1').catch(() => undefined);
  const quitDeadline = Date.now() + 30_000;
  while (Date.now() < quitDeadline && processAlive(electron.pid)) await sleep(500);
  await sleep(2000);
  const sidecarAfterQuit = processAlive(sidecarPid);
  record.phases.E = {
    result: !sidecarAfterQuit ? 'PASS' : 'FAIL',
    electronExited: !processAlive(electron.pid),
    sidecarOrphaned: sidecarAfterQuit,
    why: 'A keepalive released too late would keep the child alive past the app that owned it.',
  };
  log(`after quit — electron gone ${!processAlive(electron.pid)}, sidecar orphaned ${sidecarAfterQuit}`);

  record.mainProcessOutputTail = mainOut.join('').split(/\r?\n/).filter(Boolean).slice(-40);

  const phases = Object.values(record.phases);
  record.verdict = phases.every((p) => p.result === 'PASS') ? 'PASS' : 'FAIL';
}

let exitCode = 0;
try {
  await main();
} catch (err) {
  record.verdict = 'FAIL';
  record.error = String(err?.stack ?? err);
  exitCode = 1;
  log(`FAILED: ${err}`);
} finally {
  cdp?.close();
  // Never leave an instance behind, whatever happened above.
  if (electron?.pid && processAlive(electron.pid)) {
    log('force-stopping the harness Electron instance');
    spawnSync('taskkill', ['/pid', String(electron.pid), '/T', '/F'], { stdio: 'ignore' });
  }
  const outDir = path.join(REPO, 'docs', 'migration', 'proof', `sidecar-keepalive-electron-${stamp}`);
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'keepalive-inside-electron.json');
  fs.writeFileSync(outFile, JSON.stringify(record, null, 2));
  log(`verdict ${record.verdict} — ${outFile}`);
}

process.exit(exitCode);
