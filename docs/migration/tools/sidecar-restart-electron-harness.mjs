/**
 * What happens when the sidecar dies while the app is still using it?
 *
 * `keepalive-electron-harness.mjs` closed the case the keepalive was written for — the
 * workspace close no longer kills a healthy server. It left one thing owed, and
 * `NEXT_SESSION.md` names it: *"the crash / dev-panel-restart path.
 * `MediaWorkspaceHost.tsx:64`'s remount logic is BELIEVED to cover it but nothing has yet
 * killed a sidecar mid-session and watched the renderer re-provision."*
 *
 * This kills one. Twice, by the two routes that actually occur:
 *
 *  - **a crash** — `taskkill /F` on the child, from outside the app, so the supervisor
 *    learns about it the way it would learn about a real one: `child.on('exit')`;
 *  - **a dev-panel restart** — `seanimeStop()` then `seanimeStart()`, which is what the
 *    dev panel's two buttons do.
 *
 * ## The chain under test, and where each link could quietly fail
 *
 *   kill -> supervisor `child.on('exit')` -> `keepalive.stop()`, status `offline`
 *        -> host effect [open, status] sees a non-ready, non-starting kind -> `seanimeStart()`
 *        -> NEW ephemeral port and a NEW password hash
 *        -> host effect [open, status.kind, pid, port] re-runs `bootstrapSeanimeConnection()`
 *        -> the new token is written to `sea-server-auth-token`
 *        -> `MediaWorkspace` is keyed `seanime-<pid>-<port>`, so it REMOUNTS
 *        -> its layout effect pushes the token into `serverAuthTokenAtom`, and the
 *           `provisioning` gate holds the render until the atom agrees
 *
 * Three of those links are invisible from the outside and each has a plausible silent
 * failure, so each gets its own assertion rather than being inferred from "it looked fine":
 *
 * 1. **The keepalive must re-arm on the SECOND generation.** `startSeanime()` calls
 *    `keepalive.start()` on every `ready`, but nothing had ever checked the second one. If
 *    it armed only once per session, the fix would protect the first sidecar and silently
 *    hand every later one back to the dead-man switch — and a crash is precisely when a
 *    user is most likely to close the workspace. Phase D therefore closes the workspace
 *    after recovery and holds past the switch's window, which is the same test that failed
 *    for the unfixed build at ~14.3 s.
 * 2. **`atomWithStorage(..., {getOnInit: true})` snapshotted localStorage at MODULE-EVAL
 *    time**, which on a restart has long since happened. So writing the new token to
 *    localStorage cannot be enough on its own, and "the token in localStorage changed" is
 *    not evidence that the adopted client is using it. The server-side check is: does a
 *    renderer websocket connect to the NEW generation? `/events` validates `?token=`, so a
 *    client that still held the old hash would be refused. Phase C requires that line.
 * 3. **A `provisioning` gate that never clears looks exactly like a slow load.**
 *    `MediaWorkspace` returns the provisioning notice while `activeToken !== conn.token`.
 *    Phase C requires the library pane back on screen, not merely the absence of an error.
 *
 * ## Isolation
 *
 * Identical to the keepalive harness and for the same reasons: its own `--user-data-dir`
 * (which also side-steps `requestSingleInstanceLock()`), its own `SEANIME_DATADIR`, and
 * CDP over `--remote-debugging-port` rather than the debug bridge, which hardcodes 39273
 * and is normally held by the developer's instance. The only process this harness ever
 * kills is a pid the isolated instance itself reported.
 *
 * Usage: node docs/migration/tools/sidecar-restart-electron-harness.mjs [--hold-ms=35000]
 * Writes its record to docs/migration/proof/sidecar-restart-<stamp>/.
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

/** The switch needs 10s of continuous absence and polls every 5s; 35s clears it twice over. */
const HOLD_MS = Number(flag('hold-ms', '35000'));
const READY_TIMEOUT_MS = 180_000;
const RECOVER_TIMEOUT_MS = 180_000;
const CDP_TIMEOUT_MS = 120_000;

/** Mirrors seanimeBootstrap.ts, which mirrors upstream's SERVER_AUTH_TOKEN_STORAGE_KEY. */
const TOKEN_KEY = 'sea-server-auth-token';

const log = (...parts) => console.log(`[sidecar-restart] ${parts.join(' ')}`);
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
    if (!port) return resolve(false);
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
      // every companion window carries one. Same rule as debugBridge.ts.
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

// Full second resolution: an hour-truncated stamp once made three runs share a working
// directory and one sidecar log, and the evidence had to be untangled by timestamp.
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '');
const workRoot = path.join(os.tmpdir(), `seanime-restart-${stamp}`);
const userDataDir = path.join(workRoot, 'userData');
const seanimeDataDir = path.join(workRoot, 'seanime-datadir');
fs.mkdirSync(userDataDir, { recursive: true });
fs.mkdirSync(seanimeDataDir, { recursive: true });

const record = {
  title: 'The sidecar crash and dev-panel-restart recovery path, inside a real Electron app',
  date: new Date().toISOString().slice(0, 10),
  why:
    'The keepalive proof closed the workspace-close case and explicitly left the crash / '
    + 'dev-panel-restart path unexercised: MediaWorkspaceHost.tsx:64 was BELIEVED to re-provision '
    + 'the renderer but nothing had killed a sidecar mid-session and watched it happen.',
  isolation: {
    userDataDir,
    seanimeDataDir,
    note: 'the developer instance and %APPDATA%/jp-study-app are untouched; the only process '
      + 'killed is a pid this instance itself reported',
  },
  generations: [],
  phases: {},
  verdict: null,
  /**
   * Two false readings this harness produced before it was correct. Recorded because both
   * are the shape the project record keeps warning about — a probe that is wrong being
   * written up as a defect — and because the guards that prevent them look like fussiness
   * until you know what they cost.
   */
  probeCorrections: [
    'SAMPLED THE LOG ONCE, TOO EARLY. `keepalive.start()` is called just BEFORE '
    + '`setStatus({kind:"ready"})`, so at the instant the renderer sees `ready` the socket is '
    + 'still in flight. A single read there reported `keepaliveReconnected: false` for a '
    + 'generation whose connect line landed one second later. Now polled by waitForKeepalive().',
    'READ A LOG FILE FROM A PROCESS THE HARNESS HAD JUST KILLED. An earlier cut closed the '
    + 'workspace ~1s after the revival and killed that sidecar seconds later; its log ended '
    + 'mid-startup with no client lines at all, which read as "the revived generation never '
    + 'gets a keepalive". It does — all four generations of a clean run log '
    + '`Client connected id=study-os-supervisor`. Absence of a line in a truncated log is not '
    + 'absence of the event.',
  ],
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

/** Reads the sidecar's own log files out of the isolated datadir, oldest name first. */
function sidecarLogText() {
  const dir = path.join(seanimeDataDir, 'logs');
  if (!fs.existsSync(dir)) return '';
  return fs
    .readdirSync(dir)
    .sort()
    .map((name) => {
      try {
        return fs.readFileSync(path.join(dir, name), 'utf8');
      } catch {
        return '';
      }
    })
    .join('\n');
}

/**
 * Every websocket connect/disconnect the server logged, stripped of ANSI.
 *
 * The server naming its own clients is the load-bearing evidence, not the supervisor's log
 * tail: `pushLog` keeps 40 lines and the sidecar writes dozens at startup, so the
 * `keepalive:` line is routinely pushed out before a poll can observe it.
 */
function sidecarConnectionLines() {
  return sidecarLogText()
    .split(/\r?\n/)
    .map((l) => l.replace(/\[[0-9;]*m/g, '').trim())
    .filter((l) => /\bws\b/.test(l) && /client|conn/i.test(l));
}

/**
 * Lines added since a snapshot.
 *
 * Not a plain `slice(before.length)`: a restart can open a NEW log file, and these are read
 * as one concatenation of a sorted directory. If the new file ever sorted before the old
 * one the index would be meaningless, so fall back to a set difference and RECORD which
 * branch ran rather than silently producing a wrong list.
 */
function linesSince(before, after) {
  const appended = before.every((line, i) => after[i] === line);
  if (appended) return { lines: after.slice(before.length), mode: 'append' };
  const seen = new Set(before);
  return { lines: after.filter((l) => !seen.has(l)), mode: 'set-difference' };
}

const CLIENT_ID_RE = /Client (connected|disconnected) id=([\w-]+)/;

function clientEvents(lines) {
  return lines
    .map((l) => {
      const m = CLIENT_ID_RE.exec(l);
      return m ? { event: m[1], id: m[2] } : null;
    })
    .filter(Boolean);
}

async function status() {
  return cdp.evaluate('window.api.seanimeStatus()');
}

async function connection() {
  return cdp.evaluate('window.api.seanimeConnection()');
}

async function storedToken() {
  return cdp.evaluate(`window.localStorage.getItem(${JSON.stringify(TOKEN_KEY)})`);
}

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

async function waitForStatus(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await status();
    if (predicate(last)) return last;
    await sleep(500);
  }
  throw new Error(`${label} — last status ${JSON.stringify(last)}`);
}

/**
 * Raises the app's own open event until the workspace is mounted. One dispatch is enough
 * once the listener exists, but React can still be committing the effect on the first tick
 * after the launcher paints.
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

async function closeWorkspace() {
  const how = await cdp.evaluate(`(() => {
    const btn = document.querySelector('.seanime-host-close');
    if (btn) { btn.click(); return 'close-button'; }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return 'escape';
  })()`);
  await sleep(4000);
  return how;
}

/**
 * Waits for the renderer's OWN websocket on the current generation.
 *
 * A precondition, not a nicety — the same trap the keepalive harness recorded. `MediaWorkspace`
 * is a lazy chunk that bootstraps its token before `WebsocketProvider` connects, and on a cold
 * profile that outlasts the sidecar's own startup. Without this, a phase could measure a
 * connection that never existed and pass vacuously.
 */
async function waitForRendererClient(sinceLines, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { lines } = linesSince(sinceLines, sidecarConnectionLines());
    const hit = clientEvents(lines).find(
      (e) => e.event === 'connected' && e.id !== 'study-os-supervisor',
    );
    if (hit) return hit.id;
    await sleep(1000);
  }
  throw new Error(label);
}

/**
 * Waits for the supervisor's own client on the current generation.
 *
 * Polled rather than sampled once, because the first cut read the log immediately after
 * `ready` and reported `false` for a generation whose connect line landed a second later —
 * `keepalive.start()` is called just BEFORE `setStatus({kind:'ready'})`, so the socket is
 * only in flight when the renderer learns the sidecar is up. A single read there measures
 * scheduling, not behaviour. Returns false on timeout so the caller can record a real
 * absence rather than throw.
 */
async function waitForKeepalive(sinceLines, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { lines } = linesSince(sinceLines, sidecarConnectionLines());
    const hit = clientEvents(lines).some(
      (e) => e.event === 'connected' && e.id === 'study-os-supervisor',
    );
    if (hit) return true;
    await sleep(500);
  }
  return false;
}

/** The status stream, recorded in the page so no transition is missed between polls. */
const INSTALL_PROBE = `(() => {
  window.__restartProbe = { events: [] };
  window.api.onSeanimeStatus((s) => {
    window.__restartProbe.events.push({
      at: Date.now(), kind: s.kind, pid: s.pid, port: s.port, error: s.error ?? null,
    });
  });
  return 'installed';
})()`;

async function probeEvents() {
  return cdp.evaluate('window.__restartProbe ? window.__restartProbe.events : []');
}

/** A compact `ready(pid) -> offline -> starting -> ready(pid)` trace. */
function transitions(events) {
  const out = [];
  for (const e of events) {
    const label = e.pid ? `${e.kind}(pid ${e.pid}, port ${e.port})` : e.kind;
    if (out[out.length - 1] !== label) out.push(label);
  }
  return out;
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
        // SEANIME_EXE left as-is on purpose: unset exercises exePath.ts's pinned-sibling
        // branch, which is the branch a normal dev run uses.
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

  // A CDP page target exists as soon as the document does, long before React mounts the
  // host and registers its open listener in an effect — a dispatch sent before that lands
  // on nothing and is silently lost. Same wait, and the same reason, as the keepalive
  // harness: `.seanime-host-launcher` is what `mediaWorkspaceHostIsMounted()` looks for.
  await waitFor(
    "typeof window.api?.seanimeStatus === 'function'"
      + " && !!document.querySelector('.seanime-host-launcher, .seanime-host')",
    120_000,
    'the media workspace host never mounted',
  );
  await cdp.evaluate(INSTALL_PROBE);
  log('host mounted; status probe installed');

  const before = await status();
  if (before?.kind === 'disabled') {
    throw new Error('SEANIME_SIDECAR did not reach the main process — status is `disabled`');
  }

  // --- Setup: generation 1 -------------------------------------------------------
  log('opening the media workspace');
  await openWorkspace();
  const gen1 = await waitForStatus(
    (s) => s?.kind === 'ready',
    READY_TIMEOUT_MS,
    'the sidecar never reached ready',
  );
  log(`generation 1 ready — pid ${gen1.pid}, port ${gen1.port}`);

  const linesAtGen1 = [];
  const gen1Client = await waitForRendererClient(
    linesAtGen1,
    90_000,
    'the renderer never opened its own websocket on generation 1, so nothing downstream '
      + 'could distinguish a recovery from a page that was never connected',
  );
  const gen1Token = await storedToken();
  const gen1Conn = await connection();
  record.generations.push({
    generation: 1,
    pid: gen1.pid,
    port: gen1.port,
    rendererClientId: gen1Client,
    storedTokenMatchesSupervisor: gen1Token === JSON.stringify(gen1Conn.token),
  });
  log(`renderer websocket ${gen1Client}; token provisioned`);

  const linesBeforeKill = sidecarConnectionLines();

  // --- Phase A: the crash --------------------------------------------------------
  log(`killing sidecar pid ${gen1.pid} from outside the app — this is the crash`);
  const killedAt = Date.now();
  spawnSync('taskkill', ['/pid', String(gen1.pid), '/T', '/F'], { stdio: 'ignore' });

  const offline = await waitForStatus(
    (s) => s?.kind !== 'ready' && s?.kind !== null,
    30_000,
    'the supervisor never noticed the sidecar had died',
  );
  const sawOffline = (await probeEvents()).some((e) => e.kind === 'offline');
  record.phases.A = {
    // `offline` specifically: `stopped` would mean the supervisor thought IT had stopped
    // the child, which is a different (and wrong) reading of a crash.
    result: sawOffline && !processAlive(gen1.pid) ? 'PASS' : 'FAIL',
    killedPid: gen1.pid,
    sidecarProcessGone: !processAlive(gen1.pid),
    reportedOffline: sawOffline,
    firstStatusAfterKill: { kind: offline?.kind ?? null, error: offline?.error ?? null },
    why: 'A crash must be reported as `offline` with the child\'s exit code, not as `stopped` — '
      + 'the supervisor did not initiate this, and the auto-start effect keys off the kind.',
  };
  log(`sidecar dead; supervisor reported ${offline?.kind} (${offline?.error ?? 'no error'})`);

  // --- Phase B: the app recovers on its own --------------------------------------
  log('waiting for the host to restart it — nobody is clicking anything');
  const gen2 = await waitForStatus(
    (s) => s?.kind === 'ready' && s?.pid && s.pid !== gen1.pid,
    RECOVER_TIMEOUT_MS,
    'the sidecar never came back after the crash',
  );
  const recoveryMs = Date.now() - killedAt;
  record.phases.B = {
    result: gen2.pid !== gen1.pid ? 'PASS' : 'FAIL',
    recoveryMs,
    newPid: gen2.pid,
    newPort: gen2.port,
    pidChanged: gen2.pid !== gen1.pid,
    portChanged: gen2.port !== gen1.port,
    unattended: true,
    why: 'MediaWorkspaceHost\'s [open, status] effect calls seanimeStart() for any kind that is '
      + 'not ready/starting/disabled. No user action and no harness click is involved.',
  };
  log(`generation 2 ready after ${recoveryMs} ms — pid ${gen2.pid}, port ${gen2.port}`);

  // --- Phase C: the renderer re-provisioned --------------------------------------
  const gen2Conn = await connection();

  // The token write happens in an effect after `ready`; give it the same polling courtesy
  // as everything else rather than a fixed sleep.
  let tokenNow = null;
  const tokenDeadline = Date.now() + 60_000;
  while (Date.now() < tokenDeadline) {
    tokenNow = await storedToken();
    if (tokenNow && tokenNow === JSON.stringify(gen2Conn.token)) break;
    await sleep(500);
  }

  // The decisive check is server-side. localStorage changing proves only that
  // seanimeBootstrap ran; `atomWithStorage(getOnInit:true)` already snapshotted the OLD
  // token at module-eval, so the adopted client could still be holding it. `/events`
  // validates `?token=`, so a websocket accepted by generation 2 could only have carried
  // generation 2's hash.
  const gen2Client = await waitForRendererClient(
    linesBeforeKill,
    90_000,
    'no renderer websocket ever connected to the restarted sidecar — the adopted client '
      + 'never re-provisioned, which is the exact failure this harness exists to detect',
  ).catch((err) => ({ error: String(err) }));

  // Polled, not read once. `.seanime-host-state` is also the Suspense fallback's class, so a
  // single early read cannot tell "the provisioning gate is stuck" from "the lazy chunk has
  // not resolved yet" — the same ambiguity the slice-6 host tests recorded.
  const paneBack = await waitFor(
    "!!document.querySelector('.seanime-host-pane[data-active=\"true\"]')"
      + " && !document.querySelector('.seanime-host-state')",
    60_000,
    'the workspace pane never came back after the restart',
  ).catch(() => false);
  const tokenChanged = tokenNow !== gen1Token;
  const tokenMatches = tokenNow === JSON.stringify(gen2Conn.token);
  record.phases.C = {
    result:
      tokenChanged && tokenMatches && typeof gen2Client === 'string' && paneBack
        ? 'PASS'
        : 'FAIL',
    storedTokenChanged: tokenChanged,
    storedTokenMatchesNewGeneration: tokenMatches,
    rendererClientIdOnGeneration2: gen2Client,
    rendererClientIsNew: typeof gen2Client === 'string' && gen2Client !== gen1Client,
    provisioningGateCleared: paneBack,
    why:
      'Three independent links: bootstrapSeanimeConnection wrote the new token; a websocket '
      + 'the new server ACCEPTED proves the adopted client is using it rather than the '
      + 'module-eval snapshot; and the pane being back proves MediaWorkspace\'s provisioning '
      + 'gate cleared instead of parking on its notice.',
  };
  log(
    `re-provisioned — token changed ${tokenChanged}, matches ${tokenMatches}, `
    + `renderer client ${JSON.stringify(gen2Client)}, pane back ${paneBack}`,
  );

  // --- Phase D: the keepalive re-armed on generation 2 ---------------------------
  const keepaliveRearmed = await waitForKeepalive(linesBeforeKill, 25_000);
  const { lines: sinceKill, mode } = linesSince(linesBeforeKill, sidecarConnectionLines());
  record.phases.D = {
    lineDiffMode: mode,
    connectionLinesSinceKill: sinceKill.slice(-16),
    keepaliveReconnectedAfterRestart: keepaliveRearmed,
  };
  log(`keepalive re-armed on generation 2: ${keepaliveRearmed}`);

  log('closing the workspace and holding past the dead-man switch — on the RESTARTED sidecar');
  const closedVia = await closeWorkspace();
  const holdStart = Date.now();
  await sleep(HOLD_MS);
  const heldMs = Date.now() - holdStart;
  const gen2Alive = processAlive(gen2.pid);
  const gen2Listening = await portListening(gen2.port);
  const afterHold = await status();
  record.phases.D = {
    ...record.phases.D,
    result:
      keepaliveRearmed
      && gen2Alive
      && gen2Listening
      && afterHold?.kind === 'ready'
      && afterHold?.pid === gen2.pid
        ? 'PASS'
        : 'FAIL',
    closedVia,
    heldMs,
    sidecarProcessAlive: gen2Alive,
    sidecarPortStillListening: gen2Listening,
    pidUnchanged: afterHold?.pid === gen2.pid,
    portUnchanged: afterHold?.port === gen2.port,
    statusKind: afterHold?.kind ?? null,
    why:
      'startSeanime() calls keepalive.start() on every ready, but only the FIRST generation had '
      + 'ever been observed. If it armed once per session the fix would protect one sidecar and '
      + 'quietly hand every later one back to the switch. The module harness measured an '
      + 'unprotected server exiting after 14,268 ms, so anything under ~15s here would be dead.',
  };
  log(
    `after ${heldMs} ms on the restarted sidecar — alive ${gen2Alive}, `
    + `listening ${gen2Listening}, pid ${afterHold?.pid} kind ${afterHold?.kind}`,
  );

  // --- Phase E0: an explicit stop while the workspace is OPEN --------------------
  //
  // Recorded because the first cut of this harness ran phase E with the workspace open and
  // its "explicit stop, then explicit start" never happened: the host's own recovery effect
  // had already restarted the sidecar before the first poll, so the explicit start landed on
  // a child that was up and early-returned. That is not a defect — `[open, status]` restarts
  // for any non-ready, non-starting kind, and an open workspace is exactly when the app wants
  // a media server — but it has a consequence worth stating: while the workspace is open the
  // dev panel's Stop button cannot stop the sidecar. Measure it rather than trip over it.
  log('reopening the workspace, then stopping — does the host undo it?');
  await openWorkspace();
  await waitForStatus((s) => s?.kind === 'ready', 60_000, 'the workspace reopen lost the sidecar');
  const linesBeforeE0 = sidecarConnectionLines();
  const openStopAt = Date.now();
  await cdp.evaluate('window.api.seanimeStop()');
  let revived = null;
  try {
    revived = await waitForStatus(
      (s) => s?.kind === 'starting' || s?.kind === 'ready',
      15_000,
      'no revival',
    );
  } catch {
    revived = null;
  }
  // Does the REVIVED generation get a keepalive? The first run of this harness said no: its
  // generation 2b logged `Monitoring connection as desktop sidecar` and then nothing at all
  // for the ten seconds it lived — no supervisor client and no renderer client, despite the
  // workspace being open. Instrument it rather than infer it.
  const e0Ready = await waitForStatus(
    (s) => s?.kind === 'ready',
    60_000,
    'the revived sidecar never reached ready',
  ).catch(() => null);
  const e0Keepalive = await waitForKeepalive(linesBeforeE0, 25_000);
  const e0Client = await waitForRendererClient(linesBeforeE0, 25_000, 'no renderer client')
    .catch(() => null);
  const e0Status = await status();
  record.phases.E0 = {
    result: e0Keepalive ? 'PASS' : 'FAIL',
    revivedWithoutAnyStartCall: revived !== null,
    msUntilRevived: revived ? Date.now() - openStopAt : null,
    statusAfterStop: revived?.kind ?? null,
    revivedPid: e0Ready?.pid ?? null,
    revivedPort: e0Ready?.port ?? null,
    keepaliveHeldOnRevivedGeneration: e0Keepalive,
    rendererClientOnRevivedGeneration: e0Client,
    // Where keepalive.ts's rule-5 failure line goes: pushLog, i.e. the supervisor's tail.
    supervisorLogTail: (e0Status?.logTail ?? []).slice(-25),
    keepaliveLogLines: (e0Status?.logTail ?? []).filter((l) => l.includes('keepalive:')),
    keepaliveLogLinesNote:
      'Routinely EMPTY, and that is not evidence of anything: pushLog keeps 40 lines and the '
      + 'sidecar writes dozens during startup, so the `keepalive:` line is pushed out before a '
      + 'poll can see it. The same caveat is recorded in keepalive-electron-harness.mjs. Read '
      + 'keepaliveHeldOnRevivedGeneration instead — it comes from the SERVER naming its own '
      + 'clients, which nothing in the supervisor can flatter.',
    whyItMatters:
      'A generation with no keepalive is exposed to the dead-man switch again — the exact '
      + 'condition the keepalive was written to remove. It survives only for as long as no '
      + 'websocket client has EVER connected to it, because the switch arms on the first '
      + 'connect; the moment the workspace reconnects and then closes, it is on a 10s fuse.',
    finding:
      revived !== null
        ? 'With the media workspace OPEN, an explicit seanimeStop() is reversed by '
          + 'MediaWorkspaceHost\'s recovery effect within the poll interval — the dev panel\'s '
          + 'Stop button cannot stop the sidecar while the workspace is on screen. The harness '
          + 'issued no start call of its own here.'
        : 'An explicit stop with the workspace open was NOT reversed, so the recovery effect '
          + 'does not fire for a supervisor-initiated stop.',
  };
  log(`stop with workspace open -> ${revived?.kind ?? 'stayed stopped'} `
    + `(${record.phases.E0.msUntilRevived ?? 'n/a'} ms, no start call from the harness)`);

  // --- Phase E: the dev-panel restart path, with the workspace CLOSED ------------
  //
  // The real cycle. Closed, `open` is false, the recovery effect does not fire, and the
  // status can actually come to rest at `stopped` — so the start that follows is genuinely
  // the thing that starts the sidecar.
  log('closing the workspace, then stop + start — the dev panel\'s two buttons for real');
  await closeWorkspace();
  await waitForStatus((s) => s?.kind === 'ready', 30_000, 'the close lost the sidecar');
  const linesBeforeCycle = sidecarConnectionLines();
  const pidBeforeCycle = (await status())?.pid;

  await cdp.evaluate('window.api.seanimeStop()');
  const stopped = await waitForStatus(
    (s) => s?.kind === 'stopped',
    30_000,
    'seanimeStop() never reached `stopped` with the workspace closed',
  );
  // It must STAY stopped: a resting state is what makes the next start meaningful.
  await sleep(5000);
  const restedStopped = (await status())?.kind === 'stopped';
  const gen2GoneAfterStop = !processAlive(pidBeforeCycle);
  await cdp.evaluate('window.api.seanimeStart()');
  const gen3 = await waitForStatus(
    // Compared against the pid that was actually running when the cycle began, not gen2's:
    // phase E0's revival already replaced it, so gen2's pid is two generations stale here.
    (s) => s?.kind === 'ready' && s?.pid && s.pid !== pidBeforeCycle,
    READY_TIMEOUT_MS,
    'the sidecar never came back after an explicit stop/start',
  );
  const gen3Keepalive = await waitForKeepalive(linesBeforeCycle, 25_000);

  // Only now reopen. With the workspace closed the renderer has no websocket and no reason
  // to re-provision, so asking for either before this point would be asking for something
  // the app is correct not to do.
  log('reopening the workspace onto the new generation');
  await openWorkspace();
  const gen3Conn = await connection();
  let gen3Token = null;
  const gen3Deadline = Date.now() + 60_000;
  while (Date.now() < gen3Deadline) {
    gen3Token = await storedToken();
    if (gen3Token === JSON.stringify(gen3Conn.token)) break;
    await sleep(500);
  }
  const gen3Client = await waitForRendererClient(
    linesBeforeCycle,
    90_000,
    'no renderer websocket connected after the explicit stop/start',
  ).catch((err) => ({ error: String(err) }));
  const gen3Pane = await waitFor(
    "!!document.querySelector('.seanime-host-pane[data-active=\"true\"]')"
      + " && !document.querySelector('.seanime-host-state')",
    60_000,
    'the workspace pane never came back after the stop/start cycle',
  ).catch(() => false);

  record.phases.E = {
    result:
      gen2GoneAfterStop
      && restedStopped
      && gen3.pid !== pidBeforeCycle
      && gen3Token === JSON.stringify(gen3Conn.token)
      && typeof gen3Client === 'string'
      && gen3Keepalive
      && gen3Pane
        ? 'PASS'
        : 'FAIL',
    statusAfterStop: stopped?.kind ?? null,
    stayedStoppedFor5s: restedStopped,
    pidBeforeCycle,
    childGoneAfterStop: gen2GoneAfterStop,
    newPid: gen3.pid,
    newPort: gen3.port,
    storedTokenMatchesNewGeneration: gen3Token === JSON.stringify(gen3Conn.token),
    rendererClientIdOnGeneration3: gen3Client,
    provisioningGateCleared: gen3Pane,
    keepaliveReconnected: gen3Keepalive,
    why:
      'The dev panel has no single restart button — a restart is Stop then Start. It differs from '
      + 'a crash in that the supervisor initiates it, so `stopped` (not `offline`) is the correct '
      + 'kind and the keepalive is released deliberately rather than by a child exit. Run with the '
      + 'workspace CLOSED so the status can rest at `stopped`; see phase E0 for what happens when '
      + 'it is open.',
  };
  record.generations.push(
    {
      generation: 2,
      pid: gen2.pid,
      port: gen2.port,
      via: 'crash recovery',
      rendererClientId: gen2Client,
    },
    {
      generation: '2b',
      pid: pidBeforeCycle,
      via: 'revived by the host after an explicit stop with the workspace open (phase E0)',
    },
    {
      generation: 3,
      pid: gen3.pid,
      port: gen3.port,
      via: 'dev-panel stop + start, workspace closed',
      rendererClientId: gen3Client,
    },
  );
  log(`generation 3 ready — pid ${gen3.pid}, port ${gen3.port}, keepalive ${gen3Keepalive}`);

  record.statusTransitions = transitions(await probeEvents());
  record.sidecarLogEvidence = {
    countdownStarted: /No connection detected\. Starting countdown/i.test(sidecarLogText()),
    countdownExited: /No connection detected for 10 seconds/i.test(sidecarLogText()),
    note:
      'Both false is the expected shape. countdownStarted true with countdownExited false would '
      + 'mean the switch armed and a keepalive reconnected inside its 10s window.',
  };

  // --- Phase F: no orphan from any generation ------------------------------------
  log('quitting the app');
  await cdp.evaluate('window.close(), 1').catch(() => undefined);
  const quitDeadline = Date.now() + 30_000;
  while (Date.now() < quitDeadline && processAlive(electron.pid)) await sleep(500);
  await sleep(2000);
  const spawned = [...new Set([gen1.pid, gen2.pid, pidBeforeCycle, gen3.pid])].filter(Boolean);
  const survivors = spawned.filter((pid) => processAlive(pid));
  record.phases.F = {
    result: survivors.length === 0 && !processAlive(electron.pid) ? 'PASS' : 'FAIL',
    electronExited: !processAlive(electron.pid),
    sidecarPidsSpawned: spawned,
    survivingSidecarPids: survivors,
    generationsSpawned: spawned.length,
    why:
      'Four sidecars were spawned in one session. A restart path that leaked even one would '
      + 'leave it holding the durable datadir\'s SQLite database while the next launch spawned '
      + 'another against the same file — the exact hazard --desktop-sidecar is kept for.',
  };
  log(`after quit — electron gone ${!processAlive(electron.pid)}, orphans ${survivors.length}`);

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
  const outDir = path.join(REPO, 'docs', 'migration', 'proof', `sidecar-restart-${stamp}`);
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'crash-and-restart-recovery.json');
  fs.writeFileSync(outFile, JSON.stringify(record, null, 2));
  log(`verdict ${record.verdict} — ${outFile}`);
}

process.exit(exitCode);
