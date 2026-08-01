/**
 * Does a NORMAL run — nothing set in the environment — now have a media surface?
 *
 * `SEANIME_SIDECAR` flipped to on-by-default on 2026-07-31, which is the first of the two
 * steps old-player retirement consists of. Every previous proof in this track set
 * `SEANIME_SIDECAR=1` explicitly, so the thing the flip actually changes — what happens
 * when nobody sets anything — had never been observed. That is what this runs.
 *
 * ## The discriminator, which is the whole point
 *
 * "status came back `stopped` and the launcher was in the DOM" is satisfied just as well by
 * a bug that hardcoded `stopped`, or by an inherited `SEANIME_SIDECAR=1` in the developer's
 * shell. Both would look exactly like a working flip. So:
 *
 *   - `SEANIME_SIDECAR` is **deleted from the child's environment**, not merely left unset
 *     here — a developer shell may export it, and it would win silently. Same lesson the
 *     packaged-sidecar harness records about `SEANIME_EXE`.
 *   - phase D relaunches with `SEANIME_SIDECAR=0` and requires the opposite result:
 *     `disabled`, and **no launcher in the DOM**. A run that cannot produce the negative
 *     has not established the positive.
 *
 * Phase D is also the only test of the rollback. The flip's entire safety story is "set
 * `SEANIME_SIDECAR=0`", and a rollback nobody has exercised is a claim, not an escape hatch.
 *
 * ## Asserting an absence honestly
 *
 * Phase D asserts something is *not* in the DOM, which is worthless if measured before the
 * app renders — it would pass on a blank page. So it waits for `.desktop-root` **and**
 * `.os-taskbar` first and only then reads the launcher. Same rule the keepalive harness
 * learned the hard way: check that the instrument can see the thing before believing it.
 *
 * ## Why this is safe to run while the developer's app is open
 *
 * Its own `--user-data-dir` keeps `%APPDATA%/jp-study-app` untouched and side-steps
 * `requestSingleInstanceLock()`, whose lock file lives in userData — without it a second
 * copy just quits. It attaches over its own `--remote-debugging-port` rather than the debug
 * bridge, which hardcodes 39273 and is normally held by the developer's instance.
 *
 * `SEANIME_DATADIR` is deliberately **not** set: the scratch userData already isolates the
 * datadir, and letting it default exercises `dataDir.ts`'s `<userData>/seanime` branch —
 * which is the branch a normal run takes, and therefore the one under test here.
 *
 * Requires the Vite dev server to be up (the renderer loads from :5173), which is the
 * ordinary development state.
 *
 * Usage: node docs/migration/tools/sidecar-default-on-harness.mjs
 * Writes its record to docs/migration/proof/sidecar-default-on-<stamp>/.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');

const READY_TIMEOUT_MS = 180_000;
const CDP_TIMEOUT_MS = 120_000;
const MOUNT_TIMEOUT_MS = 120_000;

const log = (...parts) => console.log(`[default-on] ${parts.join(' ')}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '');
const workRoot = path.join(os.tmpdir(), `seanime-default-on-${stamp}`);

const record = {
  harness: 'sidecar-default-on-harness.mjs',
  question: 'With nothing set in the environment, does the app have a media surface?',
  startedAt: new Date().toISOString(),
  repo: REPO,
  phases: {},
  probeCorrections: [],
};

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

/** The sidecar's own ExecutablePath, read back from Windows rather than assumed. */
function executablePathOf(pid) {
  if (process.platform !== 'win32' || !pid) return null;
  const out = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").ExecutablePath`,
    ],
    { encoding: 'utf8' },
  );
  const value = (out.stdout ?? '').trim();
  return value || null;
}

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

// ---------------------------------------------------------------------------
// CDP — just enough to evaluate expressions in the main window.
// ---------------------------------------------------------------------------

async function findPageTarget(cdpPort, deadline) {
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      const targets = await res.json();
      // The main desktop window is the only page with no query string; every companion
      // (blanc, mini, lockscreen, popouts) carries one. Same rule as `debugBridge.ts`.
      const page = targets.find((t) => {
        if (t.type !== 'page' || !t.webSocketDebuggerUrl) return false;
        try {
          return new URL(t.url).search === '';
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
// One supervised Electron instance.
// ---------------------------------------------------------------------------

const live = [];

async function launch(label, envOverrides) {
  const cdpPort = await freePort();
  const userDataDir = path.join(workRoot, `${label}-userdata`);
  fs.mkdirSync(userDataDir, { recursive: true });

  const env = { ...process.env, ...envOverrides };
  // Deleted, not left unset: an exported value in the developer's shell would win and
  // this harness would silently prove the opposite of what it claims.
  if (envOverrides.SEANIME_SIDECAR === undefined) delete env.SEANIME_SIDECAR;
  // A normal dev run resolves the pinned sibling checkout; keep that branch deterministic.
  delete env.SEANIME_EXE;
  delete env.SEANIME_DATADIR;

  log(`[${label}] launching — userData ${userDataDir}, CDP ${cdpPort}`);
  log(`[${label}] SEANIME_SIDECAR in child env: ${JSON.stringify(env.SEANIME_SIDECAR ?? null)}`);

  const electron = spawn(
    electronBinary(),
    ['.', `--user-data-dir=${userDataDir}`, `--remote-debugging-port=${cdpPort}`],
    { cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const out = [];
  electron.stdout.on('data', (c) => out.push(String(c)));
  electron.stderr.on('data', (c) => out.push(String(c)));

  const target = await findPageTarget(cdpPort, Date.now() + CDP_TIMEOUT_MS);
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.open();

  const instance = { label, electron, cdp, out, userDataDir };
  live.push(instance);
  log(`[${label}] electron pid ${electron.pid}, attached to ${target.url}`);
  return instance;
}

async function waitFor(cdp, expression, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cdp.evaluate(expression)) return true;
    await sleep(500);
  }
  throw new Error(label);
}

/**
 * The app is only "up" once the shell has actually rendered. Everything this harness
 * asserts — especially phase D's absence — is meaningless before this returns.
 */
async function waitForAppMounted(cdp, label) {
  await waitFor(
    cdp,
    "typeof window.api?.seanimeStatus === 'function'"
      + " && !!document.querySelector('.desktop-root')"
      + " && !!document.querySelector('.os-taskbar')",
    MOUNT_TIMEOUT_MS,
    `[${label}] the desktop shell never mounted`,
  );
}

const statusOf = (cdp) => cdp.evaluate('window.api.seanimeStatus()');
const launcherPresent = (cdp) =>
  cdp.evaluate("!!document.querySelector('.seanime-host-launcher, .seanime-host')");

async function waitForStatus(cdp, predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await statusOf(cdp);
    if (predicate(last)) return last;
    await sleep(500);
  }
  throw new Error(`${label} — last status ${JSON.stringify(last)}`);
}

async function quit(instance) {
  const { label, electron, cdp } = instance;
  // `window.close()` on the main window is what reaches `will-quit` → `stopSeanime()`.
  await cdp.evaluate('window.close(), 1').catch(() => undefined);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && processAlive(electron.pid)) await sleep(500);
  if (processAlive(electron.pid)) {
    spawnSync('taskkill', ['/pid', String(electron.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(1500);
  }
  cdp.close();
  log(`[${label}] quit — electron gone ${!processAlive(electron.pid)}`);
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

async function main() {
  fs.mkdirSync(workRoot, { recursive: true });

  // --- Phases A/B/C: nothing set in the environment ---------------------------
  const normal = await launch('default', {});
  await waitForAppMounted(normal.cdp, 'default');

  // Phase A — the flip itself.
  const before = await statusOf(normal.cdp);
  const launcherAtRest = await launcherPresent(normal.cdp);
  record.phases.A = {
    what: 'a run with SEANIME_SIDECAR deleted from the environment',
    status: before,
    launcherInDom: launcherAtRest,
  };
  if (before?.kind === 'disabled') {
    throw new Error('phase A FAIL — status is `disabled`, so the default did not reach main');
  }
  if (!launcherAtRest) {
    throw new Error('phase A FAIL — no media surface in the DOM on a default run');
  }
  record.phases.A.result = 'PASS';
  log(`phase A PASS — status ${before.kind}, launcher present`);

  // Phase B — it is not merely reachable, it starts.
  log('phase B — starting the sidecar the same way MediaWorkspaceHost does');
  await normal.cdp.evaluate('window.api.seanimeStart()');
  const ready = await waitForStatus(
    normal.cdp,
    (s) => s?.kind === 'ready',
    READY_TIMEOUT_MS,
    'phase B FAIL — the sidecar never reached ready',
  );
  const exePath = executablePathOf(ready.pid);
  record.phases.B = {
    what: 'seanimeStart() on a default run',
    result: 'PASS',
    pid: ready.pid,
    port: ready.port,
    version: ready.version,
    dataDir: ready.dataDir,
    simulatedUser: ready.simulatedUser,
    executablePath: exePath,
    // Sampled ONCE, at `ready`. `keepalive.start()` runs just before `setStatus(ready)`,
    // so the socket is normally still in flight here and this is `null` on a healthy run —
    // and `pushLog` keeps 40 lines, which the sidecar's startup stdout overruns anyway.
    // **A null here is not evidence of a missing keepalive.** The keepalive is proven by
    // its own harnesses; this field is incidental context, never a gate.
    keepaliveLineAtReady: (ready.logTail ?? []).find((l) => l.includes('keepalive:')) ?? null,
  };
  log(`phase B PASS — ready pid ${ready.pid}, port ${ready.port}, v${ready.version}`);
  log(`  datadir ${ready.dataDir}`);
  log(`  running from ${exePath}`);

  // Phase C — a default run must not leak the sidecar on quit.
  const sidecarPid = ready.pid;
  await quit(normal);
  await sleep(2000);
  const orphaned = processAlive(sidecarPid);
  record.phases.C = {
    what: 'graceful quit of a default run',
    result: orphaned ? 'FAIL' : 'PASS',
    sidecarPid,
    orphaned,
  };
  if (orphaned) {
    spawnSync('taskkill', ['/pid', String(sidecarPid), '/T', '/F'], { stdio: 'ignore' });
    throw new Error('phase C FAIL — the sidecar outlived the app');
  }
  log('phase C PASS — no orphan');

  // --- Phase D: the rollback, which is what makes A mean anything -------------
  const optedOut = await launch('optout', { SEANIME_SIDECAR: '0' });
  await waitForAppMounted(optedOut.cdp, 'optout');
  const offStatus = await statusOf(optedOut.cdp);
  const offLauncher = await launcherPresent(optedOut.cdp);
  record.phases.D = {
    what: 'a run with SEANIME_SIDECAR=0 — the documented rollback',
    status: offStatus,
    launcherInDom: offLauncher,
    // Recorded so the absence above is readable as measured, not assumed.
    shellMarkersPresent: await optedOut.cdp.evaluate(
      "!!document.querySelector('.desktop-root') && !!document.querySelector('.os-taskbar')",
    ),
  };
  const dPass = offStatus?.kind === 'disabled' && offLauncher === false;
  record.phases.D.result = dPass ? 'PASS' : 'FAIL';
  await quit(optedOut);
  if (!dPass) {
    throw new Error(
      `phase D FAIL — rollback did not disable: ${JSON.stringify({ offStatus, offLauncher })}`,
    );
  }
  log(`phase D PASS — status disabled, no launcher, shell rendered`);

  record.verdict = 'PASS';
}

let failure = null;
try {
  await main();
} catch (err) {
  failure = err instanceof Error ? err.message : String(err);
  record.verdict = 'FAIL';
  record.error = failure;
  log(`FAILED — ${failure}`);
} finally {
  for (const instance of live) {
    if (instance.electron?.pid && processAlive(instance.electron.pid)) {
      log(`cleanup — killing ${instance.label} pid ${instance.electron.pid}`);
      spawnSync('taskkill', ['/pid', String(instance.electron.pid), '/T', '/F'], {
        stdio: 'ignore',
      });
    }
    try {
      instance.cdp?.close();
    } catch {
      /* already gone */
    }
  }
  record.finishedAt = new Date().toISOString();
  const outDir = path.join(REPO, 'docs', 'migration', 'proof', `sidecar-default-on-${stamp}`);
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'default-on-has-a-media-surface.json');
  fs.writeFileSync(outFile, `${JSON.stringify(record, null, 2)}\n`);
  log(`record written to ${path.relative(REPO, outFile)}`);
  process.exit(failure ? 1 : 0);
}
