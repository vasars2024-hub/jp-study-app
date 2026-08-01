/**
 * Does the sidecar come up in a PACKAGED build?
 *
 * This is the single never-proven step that old-player retirement opens with. Both
 * retirement blockers were closed on 2026-07-30 — `exePath.ts` resolves a packaged slot and
 * `forge.config.ts` ships the binary into it — and a real `npm run package` was verified to
 * place an sha256-identical `seanime.exe` at `<resources>/seanime/seanime.exe`. What was
 * never done is *launching* that package and watching the sidecar reach `ready`. The record
 * said driving a packaged run would need mouse control, which is a standing instruction never
 * to do with this app, so it was left as "one manual launch away".
 *
 * It does not need mouse control, and it does not need the developer to close anything.
 * Electron accepts `--remote-debugging-port` in a packaged build exactly as it does in dev,
 * and `window.api.seanimeStart()` is the same call `MediaWorkspaceHost` makes — so the run
 * below is CDP plus one IPC call, with no synthetic input anywhere.
 *
 * ## Why this is safe to run while the developer's app is open
 *
 * `--user-data-dir` points the packaged app at a scratch profile. That is what keeps
 * `%APPDATA%/jp-study-app` untouched (the hazard `CURRENT_STATE.md` records) and it is also
 * what side-steps `requestSingleInstanceLock()`, whose lock file lives in userData — without
 * it a second copy simply quits on launch. `SEANIME_DATADIR` is scratch for the same reason.
 *
 * ## The discriminator, which is the whole point
 *
 * `resolveSeanimeExe` tries `SEANIME_EXE`, then the packaged slot, then the pinned sibling
 * checkout. The pinned checkout EXISTS on this machine and is byte-identical to the packaged
 * copy, so "the sidecar reached ready" proves nothing on its own — a silent fallback to the
 * sibling checkout would look exactly the same, and that is the failure mode that would ship
 * a dead media surface to every other machine. So:
 *
 *   - `SEANIME_EXE` is explicitly DELETED from the child's environment, not merely left
 *     unset in this shell, because a developer shell may well have it exported;
 *   - the running `seanime.exe`'s own `ExecutablePath` is read from Windows and required to
 *     be the one inside `out/.../resources/seanime`.
 *
 * Without that second check this harness would be the "confident false pass" shape the record
 * keeps warning about.
 *
 * Usage: node docs/migration/tools/packaged-sidecar-launch-harness.mjs
 *        [--app=out/jp-study-app-win32-x64/jp-study-app.exe]
 * Writes its record to docs/migration/proof/packaged-sidecar-launch-<stamp>/.
 */

import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
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

const APP_EXE = path.resolve(
  REPO,
  flag('app', path.join('out', 'jp-study-app-win32-x64', 'jp-study-app.exe')),
);
const PACKAGE_ROOT = path.dirname(APP_EXE);
const EXPECTED_SIDECAR = path.join(PACKAGE_ROOT, 'resources', 'seanime', 'seanime.exe');
/** exePath.ts's last resort, and the thing a silent fallback would land on. */
const SIBLING_SIDECAR = path.resolve(REPO, '..', 'seanime-upstream', 'seanime.exe');
const READY_TIMEOUT_MS = 180_000;
const CDP_TIMEOUT_MS = 120_000;

const log = (...parts) => console.log(`[packaged-sidecar] ${parts.join(' ')}`);
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
  const out = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' });
  return (out.stdout ?? '').includes(String(pid));
}

/** The on-disk path a running pid was launched from. The discriminator; see the docblock. */
function executablePathOf(pid) {
  const out = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").ExecutablePath`,
    ],
    { encoding: 'utf8' },
  );
  return (out.stdout ?? '').trim() || null;
}

/**
 * Client-side established sockets pointing at `port`, with their owning process.
 *
 * `-RemotePort` deliberately, not `-LocalPort`: the latter returns the server end, whose
 * owner is always the sidecar itself and therefore says nothing about who connected.
 */
function establishedClientsTo(port) {
  const out = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Get-NetTCPConnection -State Established -RemotePort ${port} -ErrorAction SilentlyContinue`
        + ' | ForEach-Object { "$($_.OwningProcess) $((Get-Process -Id $_.OwningProcess'
        + ' -ErrorAction SilentlyContinue).ProcessName)" }',
    ],
    { encoding: 'utf8' },
  );
  return (out.stdout ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [pid, ...name] = l.split(/\s+/);
      return { pid: Number(pid), process: name.join(' ') || null };
    })
    .filter((s) => Number.isFinite(s.pid));
}

/** The app's process tree. Electron spreads across several pids; the keepalive is in main. */
function descendantPids(rootPid) {
  const out = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      '$all = Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId; '
        + `$acc = @(${rootPid}); $added = $true; `
        + 'while ($added) { $added = $false; foreach ($p in $all) { '
        + 'if ($acc -contains $p.ParentProcessId -and $acc -notcontains $p.ProcessId) '
        + '{ $acc += $p.ProcessId; $added = $true } } }; $acc',
    ],
    { encoding: 'utf8' },
  );
  return (out.stdout ?? '')
    .split(/\r?\n/)
    .map((l) => Number(l.trim()))
    .filter(Number.isFinite);
}

function sidecarLogText(dataDir) {
  const dir = path.join(dataDir, 'logs');
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
 * In Node rather than through PowerShell: the shelled-out `Get-FileHash` returned an empty
 * string here and put a bare `null` in the record next to the word "sha256", which reads as a
 * mismatch rather than as a broken helper. A proof field that cannot be produced reliably is
 * worse than no field.
 */
function sha256(file) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// CDP
// ---------------------------------------------------------------------------

/**
 * Scheme-agnostic on purpose.
 *
 * The dev harnesses match `port === '5173'` because the dev build loads from the Vite
 * server. The first cut of this file assumed a packaged build therefore loads from
 * `file://` — it does not. This one registers a custom protocol and the main window is
 * `app://bundle/index.html`, so the run sat at the CDP attach for its full timeout with a
 * perfectly healthy app on screen. Do not re-derive that: match on the SHAPE that actually
 * distinguishes the main desktop window — a page target with no query string — which is the
 * same rule `debugBridge.ts` uses, since every companion window (blanc, mini, lockscreen,
 * popouts) carries one.
 */
async function findPageTarget(cdpPort, deadline) {
  let lastSeen = [];
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      const targets = await res.json();
      lastSeen = targets.map((t) => `${t.type} ${t.url}`);
      const page = targets.find((t) => {
        if (t.type !== 'page' || !t.webSocketDebuggerUrl) return false;
        if (t.url.startsWith('devtools://')) return false;
        return !t.url.includes('?');
      });
      if (page) return page;
    } catch {
      /* the debugger endpoint is not up yet */
    }
    await sleep(500);
  }
  throw new Error(`no main-window CDP target appeared; saw ${JSON.stringify(lastSeen)}`);
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
      }, 60_000);
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

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '');
const workRoot = path.join(os.tmpdir(), `seanime-packaged-${stamp}`);
const userDataDir = path.join(workRoot, 'userData');
const seanimeDataDir = path.join(workRoot, 'seanime-datadir');
fs.mkdirSync(userDataDir, { recursive: true });
fs.mkdirSync(seanimeDataDir, { recursive: true });

const record = {
  title: 'The sidecar reaching ready inside a PACKAGED build',
  date: new Date().toISOString().slice(0, 10),
  why:
    'The one never-proven step old-player retirement opens with. Both blockers were closed on '
    + '2026-07-30 and the binary was verified present in the package, but the packaged app was '
    + 'never launched to watch the sidecar come up — the record assumed that needed mouse '
    + 'control. It does not: --remote-debugging-port works in a packaged build and '
    + 'window.api.seanimeStart() is the same call MediaWorkspaceHost makes.',
  package: { appExe: APP_EXE, expectedSidecar: EXPECTED_SIDECAR },
  isolation: {
    userDataDir,
    seanimeDataDir,
    note: 'scratch --user-data-dir keeps %APPDATA%/jp-study-app untouched AND side-steps '
      + 'requestSingleInstanceLock(), so a developer instance may stay open',
  },
  phases: {},
  verdict: null,
};

let app = null;
let cdp = null;

async function main() {
  if (!fs.existsSync(APP_EXE)) {
    throw new Error(`no packaged app at ${APP_EXE} — run \`npm run package\` first`);
  }
  if (!fs.existsSync(EXPECTED_SIDECAR)) {
    throw new Error(
      `the package has no sidecar at ${EXPECTED_SIDECAR}; forge.config.ts's staging plugin `
      + 'should make a missing binary FAIL the build, so this package predates it',
    );
  }

  const cdpPort = await freePort();
  log(`packaged app ${APP_EXE}`);
  log(`isolated userData ${userDataDir}`);
  log(`CDP on ${cdpPort}`);

  // SEANIME_EXE is DELETED rather than left alone: a developer shell may export it, and it
  // wins outright in exePath.ts, which would make the packaged slot untested while every
  // assertion still passed.
  const env = { ...process.env, SEANIME_SIDECAR: '1', SEANIME_DATADIR: seanimeDataDir };
  delete env.SEANIME_EXE;
  record.seanimeExeInEnv = Object.prototype.hasOwnProperty.call(env, 'SEANIME_EXE');

  app = spawn(APP_EXE, [`--user-data-dir=${userDataDir}`, `--remote-debugging-port=${cdpPort}`], {
    cwd: PACKAGE_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const appOut = [];
  app.stdout.on('data', (c) => appOut.push(String(c)));
  app.stderr.on('data', (c) => appOut.push(String(c)));
  record.appPid = app.pid;
  log(`app pid ${app.pid}`);

  const target = await findPageTarget(cdpPort, Date.now() + CDP_TIMEOUT_MS);
  log(`attached to ${target.url}`);
  cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.open();

  // --- Phase A: the flag reached a packaged main process -------------------------
  const deadline = Date.now() + 120_000;
  let before = null;
  while (Date.now() < deadline) {
    try {
      if (await cdp.evaluate("typeof window.api?.seanimeStatus === 'function'")) {
        before = await cdp.evaluate('window.api.seanimeStatus()');
        break;
      }
    } catch {
      /* preload not up yet */
    }
    await sleep(500);
  }
  record.phases.A = {
    // `disabled` would mean SEANIME_SIDECAR never reached the packaged main process, which
    // is a different failure from the sidecar failing to start and must not be conflated.
    result: before && before.kind !== 'disabled' ? 'PASS' : 'FAIL',
    statusBeforeStart: before,
    why: '`disabled` here would mean the env flag did not reach the packaged main process.',
  };
  log(`status before start: ${before?.kind}`);
  if (!before || before.kind === 'disabled') {
    throw new Error(`SEANIME_SIDECAR did not arm the packaged app — status ${before?.kind}`);
  }

  // --- Phase B: it reaches ready --------------------------------------------------
  log('calling window.api.seanimeStart() — the same call MediaWorkspaceHost makes');
  const startedAt = Date.now();
  await cdp.evaluate('window.api.seanimeStart()');
  let ready = null;
  const readyDeadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < readyDeadline) {
    const s = await cdp.evaluate('window.api.seanimeStatus()');
    if (s?.kind === 'ready' || s?.kind === 'failed') {
      ready = s;
      break;
    }
    await sleep(1000);
  }
  record.phases.B = {
    result: ready?.kind === 'ready' ? 'PASS' : 'FAIL',
    msToReady: ready ? Date.now() - startedAt : null,
    statusKind: ready?.kind ?? null,
    pid: ready?.pid ?? null,
    port: ready?.port ?? null,
    version: ready?.version ?? null,
    dataDir: ready?.dataDir ?? null,
    error: ready?.error ?? null,
    logTail: (ready?.logTail ?? []).slice(-15),
  };
  log(`sidecar ${ready?.kind} — pid ${ready?.pid}, port ${ready?.port}, v${ready?.version}`);
  if (ready?.kind !== 'ready') {
    throw new Error(`the packaged sidecar did not reach ready: ${ready?.error ?? 'no error'}`);
  }

  // --- Phase C: it is the PACKAGED binary, not the sibling checkout ---------------
  const actualPath = executablePathOf(ready.pid);
  const samePath = actualPath
    && path.resolve(actualPath).toLowerCase() === path.resolve(EXPECTED_SIDECAR).toLowerCase();
  record.phases.C = {
    result: samePath ? 'PASS' : 'FAIL',
    runningExecutablePath: actualPath,
    expected: EXPECTED_SIDECAR,
    seanimeExeWasUnset: !record.seanimeExeInEnv,
    packagedSha256: sha256(EXPECTED_SIDECAR),
    // Recorded so the claim below is self-evidencing rather than asserted: if these two
    // hashes match, the binary itself genuinely cannot distinguish the two resolution paths.
    pinnedSiblingSha256: sha256(SIBLING_SIDECAR),
    pinnedSiblingPath: SIBLING_SIDECAR,
    why:
      'The whole point. The pinned sibling checkout exists on this machine and is '
      + 'byte-identical, so "it reached ready" is satisfied just as well by a silent fallback '
      + 'to it — and that fallback is exactly what would ship a dead media surface to every '
      + 'other machine. Only the running process\'s own path can tell the two apart.',
  };
  log(`running from ${actualPath}`);
  log(`packaged slot resolved: ${samePath}`);

  // --- Phase D: the keepalive holds in a packaged build too -----------------------
  //
  // Measured from the OS, not from the sidecar's log.
  //
  // The first cut read `logs/*` for `Client connected id=study-os-supervisor` and reported
  // false. That is the SAME false alarm the restart harness already produced once: this run
  // kills the sidecar ~30s after it starts, and a force-killed process leaves a log that ends
  // mid-startup, so a missing line there is not evidence of a missing connection. An
  // established loopback socket, on the other hand, exists or it does not, and Windows will
  // say which — no flush, no buffering, nothing to truncate.
  //
  // With no media workspace open, the supervisor's keepalive is the ONLY thing that should be
  // holding a connection to the sidecar's port, so the client-side owner is the discriminator.
  let sockets = [];
  const kaDeadline = Date.now() + 25_000;
  while (Date.now() < kaDeadline) {
    sockets = establishedClientsTo(ready.port);
    if (sockets.length) break;
    await sleep(1000);
  }
  const appPids = new Set(descendantPids(app.pid));
  const heldByTheApp = sockets.filter((s) => appPids.has(s.pid));
  // Corroboration only, and allowed to be absent — see the note above.
  const logText = sidecarLogText(seanimeDataDir);
  record.phases.D = {
    result: heldByTheApp.length > 0 ? 'PASS' : 'FAIL',
    establishedClientSockets: sockets,
    socketsOwnedByTheApp: heldByTheApp,
    sidecarLogMentionsKeepalive: /Client connected id=study-os-supervisor/.test(logText),
    sidecarLogMentionsKeepaliveNote:
      'Corroboration only. This run kills the sidecar ~30s in, and a force-killed process '
      + 'leaves a truncated log — a missing line here is NOT evidence of a missing connection. '
      + 'The socket check above is the claim.',
    why:
      'The keepalive was proven in dev. A packaged main process runs the same code through a '
      + 'different bundle, and a sidecar without it is on the dead-man switch\'s 10s fuse the '
      + 'moment a workspace closes — so the build that would actually ship gets its own check.',
  };
  log(
    `keepalive socket held by the app: ${heldByTheApp.length > 0} `
    + `(${sockets.length} established client socket(s) on port ${ready.port})`,
  );

  // --- Phase E: quit leaves no orphan ---------------------------------------------
  log('quitting');
  await cdp.evaluate('window.close(), 1').catch(() => undefined);
  const quitDeadline = Date.now() + 45_000;
  while (Date.now() < quitDeadline && processAlive(app.pid)) await sleep(500);
  await sleep(2000);
  const orphan = processAlive(ready.pid);
  record.phases.E = {
    result: !orphan ? 'PASS' : 'FAIL',
    appExited: !processAlive(app.pid),
    sidecarOrphaned: orphan,
    why:
      'A packaged build is where an orphan matters most: it would sit on the durable datadir\'s '
      + 'SQLite database while the next launch spawned a second server against the same file.',
  };
  log(`after quit — app gone ${!processAlive(app.pid)}, orphan ${orphan}`);

  record.appOutputTail = appOut.join('').split(/\r?\n/).filter(Boolean).slice(-30);
  record.verdict = Object.values(record.phases).every((p) => p.result === 'PASS')
    ? 'PASS'
    : 'FAIL';
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
  if (app?.pid && processAlive(app.pid)) {
    log('force-stopping the packaged instance');
    spawnSync('taskkill', ['/pid', String(app.pid), '/T', '/F'], { stdio: 'ignore' });
  }
  const outDir = path.join(REPO, 'docs', 'migration', 'proof', `packaged-sidecar-launch-${stamp}`);
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'packaged-sidecar-reaches-ready.json');
  fs.writeFileSync(outFile, JSON.stringify(record, null, 2));
  log(`verdict ${record.verdict} — ${outFile}`);
}

process.exit(exitCode);
