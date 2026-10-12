#!/usr/bin/env node
/**
 * Headless end-to-end harness for the REAL Gum app.
 *
 *   npm run e2e                       all flows, in order
 *   npm run e2e -- --flows=setup,dictionary   only these flows (ids, see --list)
 *   npm run e2e -- --skip=extension,recorder  every flow but these
 *   npm run e2e -- --list             print the flow ids and titles, run nothing
 *   npm run e2e -- --keep             keep the temp profile + media for inspection
 *   npm run e2e -- --reuse-build      skip rebuilding the snapshot (use the newest complete one)
 *   npm run e2e -- --world-ai         start the fake AI server and preset the profile to it
 *                                     (automatic when a selected flow declares `world: { ai: true }`)
 *   npm run e2e -- --dev              drive `electron-forge start` instead (live dev server)
 *   npm run e2e -- --bridge-port=N --extension-port=N --vite-port=N
 *                                     fixed ports instead of free ephemeral ones (also
 *                                     GUM_E2E_BRIDGE_PORT / _EXTENSION_PORT / _VITE_PORT)
 *
 * Runs are isolated from each other (tools/e2e/isolation.cjs), so several agents can run
 * the harness at once: free ephemeral ports per run, output in tools/e2e/out/<run-id>/,
 * and each snapshot build in its own directory under tools/e2e/out/builds/, serialized by
 * a lock — a rebuild never replaces a snapshot another run is executing.
 *
 * What it runs: a PRODUCTION snapshot of the tree (tools/e2e/build.cjs — forge's own Vite
 * config, written to tools/e2e/out/builds/<build-id>/app, so the shared .vite/ is untouched),
 * launched with the repo's electron.exe. Not the dev server by default: other agents edit
 * this tree while a run is in flight, and Vite's HMR reloaded the page under a flow three
 * times in seven seconds. Environment:
 *
 *   GUM_E2E_HEADLESS=1      src/main/e2eHeadless.ts: every window hidden for life (still
 *                           rendered), no tray, OS dialogs / toasts / shell calls / native
 *                           menus / file choosers stubbed, downloads saved into the profile,
 *                           global shortcuts stubbed, DevTools never opened. Plus `--e2e`.
 *   JP_USER_DATA_DIR        a fresh temp profile per run
 *   JP_DEBUG_DIR/PORT       the debug bridge's bridge.json + port, private to this run
 *   JP_EXTENSION_PORT, PORT the run's extension-server port (and Vite port for --dev)
 *   SEANIME_EXE/_DATADIR    the media sidecar (default: the installed copy under
 *                           %USERPROFILE%\Apps\jp-study-app-win32-x64), datadir in the profile
 *
 * The world around it is the harness's (tools/e2e/world.cjs): AnkiConnect, qBittorrent, a
 * web site, a texthooker and the subtitle/metadata providers are fakes on ephemeral
 * loopback ports, and headless mode remaps the owner's well-known service ports onto them
 * or refuses them (GUM_E2E_LOOPBACK / GUM_E2E_REMOTE), so a run never reaches the owner's
 * Anki, torrent client, clipboard, screen or files.
 *
 * and drives it through the debug bridge (src/main/debugBridge.ts): `/eval` runs page JS in
 * the main window (`window: 'main'`), `/screenshot` is `webContents.capturePage()`, `/e2e`
 * reads back what headless mode stubbed and anything that reached the desktop anyway.
 *
 * Nothing reaches the desktop: the launcher is spawned with `windowsHide`, every helper
 * process too, and after every flow the run fails if any process in the app's tree owns a
 * visible top-level window or headless mode recorded a violation. Teardown kills exactly
 * the processes this script started (creation-time-checked descendants plus anything naming
 * the run's temp dir), one PID at a time.
 *
 * Output: tools/e2e/out/<run-id>/ — report.json + report.md, run.log, app.log, build.log,
 * screens/. The newest finished run's report is copied to tools/e2e/out/report.{md,json}
 * and named in tools/e2e/out/latest.json. Screenshots are also copied to
 * `%USERPROFILE%\Videos\Gum Showcase\screens\e2e-*.png`.
 */
'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */

const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const isolation = require('./isolation.cjs');

const REPO = path.resolve(__dirname, '..', '..');
/** Shared root: per-run folders, builds/, and the latest report copy. */
const OUT_ROOT = path.join(__dirname, 'out');
/** This run's id and its own output folder. */
const RUN_ID = isolation.makeRunId();
const OUT = path.join(OUT_ROOT, RUN_ID);
const SCREENS = path.join(os.homedir(), 'Videos', 'Gum Showcase', 'screens');
const FORGE_CLI = path.join(REPO, 'node_modules', '@electron-forge', 'cli', 'dist', 'electron-forge.js');
const DEFAULT_SEANIME = path.join(os.homedir(), 'Apps', 'jp-study-app-win32-x64', 'resources', 'seanime', 'seanime.exe');

const args = process.argv.slice(2);
const argValue = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const KEEP = args.includes('--keep');
/** `--dev`: drive `electron-forge start` (live dev server) instead of the production snapshot. */
const DEV = args.includes('--dev');
/** `--reuse-build`: skip rebuilding the snapshot when a complete one exists (out/builds/latest.json). */
const REUSE_BUILD = args.includes('--reuse-build');
const ELECTRON = path.join(REPO, 'node_modules', 'electron', 'dist', 'electron.exe');
const ONLY = (argValue('flows') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const SKIP = (argValue('skip') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(...parts) {
  const line = `[e2e ${new Date().toISOString().slice(11, 19)}] ${parts.join(' ')}`;
  console.log(line);
  try {
    fs.appendFileSync(path.join(OUT, 'run.log'), `${line}\n`);
  } catch {
    /* out dir not there yet */
  }
}

/** One hidden PowerShell, no profile, no console window. */
function powershell(script, timeout = 30000) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => resolve({ ok: !err, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') }),
    );
  });
}

/** Every process descended from `rootPid`, plus any whose command line names the run dir. */
async function processTree(rootPid, marker) {
  const script = `
$all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine, @{n='Created';e={ if ($_.CreationDate) { $_.CreationDate.ToFileTimeUtc() } else { 0 } }}
$all | ConvertTo-Json -Compress -Depth 3`;
  const r = await powershell(script);
  let rows = [];
  try {
    rows = JSON.parse(r.stdout || '[]');
  } catch {
    rows = [];
  }
  if (!Array.isArray(rows)) rows = [rows];
  const children = new Map();
  for (const row of rows) {
    const list = children.get(row.ParentProcessId) ?? [];
    list.push(row);
    children.set(row.ParentProcessId, list);
  }
  const found = new Map();
  const queue = rootPid ? [rootPid] : [];
  const root = rows.find((r) => r.ProcessId === rootPid);
  if (root) found.set(root.ProcessId, root);
  while (queue.length) {
    const pid = queue.shift();
    const parent = found.get(pid);
    for (const child of children.get(pid) ?? []) {
      // Windows reuses PIDs: a process whose real parent died long ago "belongs" to
      // whatever got that PID next. A child cannot predate its parent, so such rows are
      // not ours (measured: a 9 PM msedge.exe showed up under this run's Vite worker).
      if (parent && child.Created && parent.Created && child.Created < parent.Created) continue;
      if (!found.has(child.ProcessId)) {
        found.set(child.ProcessId, child);
        queue.push(child.ProcessId);
      }
    }
  }
  if (marker) {
    for (const row of rows) {
      if (row.CommandLine && row.CommandLine.toLowerCase().includes(marker.toLowerCase())) found.set(row.ProcessId, row);
    }
  }
  return [...found.values()];
}

/** Processes of ours that own a visible top-level window — must always be empty. */
async function visibleWindowsOf(pids) {
  if (!pids.length) return [];
  const script = `
$ids = @(${pids.join(',')})
Get-Process -Id $ids -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } |
  Select-Object Id, ProcessName, MainWindowTitle | ConvertTo-Json -Compress`;
  const r = await powershell(script);
  if (!r.stdout.trim()) return [];
  try {
    const parsed = JSON.parse(r.stdout);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

class Harness {
  constructor() {
    this.runId = RUN_ID;
    this.runDir = path.join(os.tmpdir(), `gum-e2e-${this.runId}`);
    /** This run's ports (isolation.resolvePorts), set by start(). */
    this.ports = null;
    /** The snapshot this run executes (isolation.prepareBuild). */
    this.appDir = null;
    this.profile = path.join(this.runDir, 'profile');
    this.debugDir = path.join(this.runDir, 'debug');
    this.mediaDir = path.join(this.runDir, 'media');
    this.child = null;
    this.bridge = null;
    this.desktopLeaks = [];
    this.screens = [];
    this.appLog = null;
    /** The fakes (tools/e2e/world.cjs), started before the app. */
    this.world = null;
  }

  env() {
    const env = {
      ...process.env,
      GUM_E2E_HEADLESS: '1',
      JP_USER_DATA_DIR: this.profile,
      JP_DEBUG_DIR: this.debugDir,
      JP_DEBUG_PORT: String(this.ports.bridge),
      JP_EXTENSION_PORT: String(this.ports.extension),
      PORT: String(this.ports.vite),
      SEANIME_DATADIR: path.join(this.profile, 'seanime-e2e'),
      ...(this.world ? this.world.env() : {}),
    };
    const seanime = process.env.SEANIME_EXE || DEFAULT_SEANIME;
    if (fs.existsSync(seanime)) env.SEANIME_EXE = seanime;
    delete env.ELECTRON_RUN_AS_NODE;
    return env;
  }

  /**
   * The production snapshot this run executes (tools/e2e/build.cjs): the newest complete
   * one with --reuse-build, otherwise a fresh build in its own directory. Concurrent runs
   * are safe: builds are serialized by a lock, and no build replaces a snapshot in use
   * (tools/e2e/isolation.cjs).
   */
  async ensureBuild() {
    const requestedAt = Date.now();
    const build = await isolation.prepareBuild({
      outRoot: OUT_ROOT,
      reuse: REUSE_BUILD,
      requestedAt,
      log,
      runBuild: async (appDir, id) => {
        log(`building the production snapshot ${id} (tools/e2e/build.cjs)…`);
        const t0 = Date.now();
        const buildLogFile = path.join(OUT, 'build.log');
        const code = await new Promise((resolve) => {
          const p = spawn(process.execPath, ['--max-old-space-size=8192', path.join(__dirname, 'build.cjs'), `--out=${appDir}`], {
            cwd: REPO,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, NODE_ENV: 'production' },
          });
          const buildLog = fs.createWriteStream(buildLogFile, { flags: 'w' });
          p.stdout.pipe(buildLog);
          p.stderr.pipe(buildLog);
          p.on('exit', resolve);
        });
        if (code !== 0) throw new Error(`build failed (exit ${code}); see ${path.relative(REPO, buildLogFile)}`);
        log(`build done in ${Math.round((Date.now() - t0) / 1000)} s`);
      },
    });
    this.appDir = build.appDir;
    this.buildId = build.id;
  }

  /** `worldOptions`: what the selected flows need of the world (`worldOptionsFor`). */
  async start(worldOptions = {}) {
    for (const dir of [this.profile, this.debugDir, this.mediaDir, OUT, path.join(OUT, 'screens'), SCREENS]) fs.mkdirSync(dir, { recursive: true });
    this.ports = await isolation.resolvePorts(args);
    log(`run ${this.runId}: dir ${this.runDir}, output ${path.relative(REPO, OUT)}, ports ${JSON.stringify(this.ports)}`);
    const t0 = Date.now();
    this.world = await require('./world.cjs').startWorld(this.mediaDir, { outDir: OUT, ...worldOptions });
    this.world.seedProfile(this.profile);
    log(`world up in ${Date.now() - t0} ms: ${JSON.stringify(this.world.ports())}`);
    const appArgs = ['--e2e', `--e2e-run=${this.runDir}`];
    if (DEV) {
      // The live dev server: convenient while writing a flow, but another agent's save
      // reloads the page under it (see build.cjs).
      this.appLog = fs.createWriteStream(path.join(OUT, 'app.log'), { flags: 'w' });
      this.child = spawn(process.execPath, [FORGE_CLI, 'start', '--', ...appArgs], {
        cwd: REPO,
        env: this.env(),
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } else {
      await this.ensureBuild();
      // Registered as a user of the snapshot: its junctions stay until the last run using
      // it has finished, whichever run that is.
      await isolation.acquireSnapshot(this.appDir, this.runId, require('./build.cjs').linkResources);
      this.linked = true;
      this.appLog = fs.createWriteStream(path.join(OUT, 'app.log'), { flags: 'w' });
      this.child = spawn(ELECTRON, [this.appDir, ...appArgs], {
        cwd: REPO,
        env: this.env(),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    }
    this.child.stdout.on('data', (d) => this.appLog.write(d));
    this.child.stderr.on('data', (d) => this.appLog.write(d));
    this.child.on('exit', (code) => log(`launcher exited (${code})`));
    log(`launcher pid ${this.child.pid}`);

    const deadline = Date.now() + 6 * 60_000;
    const bridgeFile = path.join(this.debugDir, 'bridge.json');
    while (Date.now() < deadline) {
      if (this.child.exitCode !== null) throw new Error('the app exited during boot (see out/app.log)');
      if (fs.existsSync(bridgeFile)) {
        try {
          this.bridge = JSON.parse(fs.readFileSync(bridgeFile, 'utf8'));
          break;
        } catch {
          /* half-written */
        }
      }
      await sleep(1000);
    }
    if (!this.bridge) throw new Error('debug bridge never came up');
    log(`bridge on ${this.bridge.port} (app pid ${this.bridge.pid})`);
    await this.waitFor(`!!(window.api && document.readyState === 'complete' && document.querySelector('#root, body > div'))`, {
      timeout: 4 * 60_000,
      label: 'renderer boot',
    });
    const e2e = await this.e2e('status');
    if (!e2e.active) throw new Error('headless mode is NOT active in the app — refusing to continue');
    await this.request('/focus', { window: 'main' });
    await this.checkDesktop('boot');
  }

  /**
   * Launch the app a second time with `extraArgs`, as a Startup hotkey or "Open with"
   * would. It finds the single-instance lock held, hands its argv to the running app
   * (`second-instance`) and quits; it never creates a window. Same env and profile.
   */
  async secondInstance(extraArgs = []) {
    if (DEV) return { skipped: 'second instance needs the production snapshot' };
    const p = spawn(ELECTRON, [this.appDir, '--e2e', `--e2e-run=${this.runDir}`, ...extraArgs], {
      cwd: REPO,
      env: this.env(),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    const code = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        execFile('taskkill.exe', ['/PID', String(p.pid), '/F'], { windowsHide: true }, () => resolve('killed after 30 s'));
      }, 30_000);
      p.on('exit', (c) => {
        clearTimeout(timer);
        resolve(c);
      });
    });
    return { code, output: out.slice(-2000) };
  }

  request(route, body = {}, timeout = 120_000) {
    const payload = JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: this.bridge.port,
          path: route,
          method: 'POST',
          // One connection per request. Node's default agent keeps sockets alive, and the
          // bridge's server closes idle ones after 5 s: a request that reuses a socket the
          // server is closing dies with ECONNRESET (measured, mid-flow, on a live app).
          agent: false,
          headers: {
            connection: 'close',
            authorization: `Bearer ${this.bridge.token}`,
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(payload),
          },
          timeout,
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch (err) {
              reject(err);
            }
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error(`bridge ${route} timed out`)));
      req.on('error', reject);
      req.end(payload);
    });
  }

  /** Page JS in the main window. `await: true` settles a Promise. Throws on page errors. */
  async eval(js, { await: settle = false, window = 'main' } = {}) {
    const r = await this.request('/eval', { js, await: settle, window });
    if (!r.ok) throw new Error(`eval failed: ${r.error}`);
    if (r.result && typeof r.result === 'object' && r.result.__error) throw new Error(`page error: ${r.result.__error}`);
    return r.result;
  }

  async evalAsync(js, opts = {}) {
    return this.eval(`(async () => { ${js} })()`, { ...opts, await: true });
  }

  async waitFor(expr, { timeout = 30_000, interval = 250, label = expr } = {}) {
    const deadline = Date.now() + timeout;
    let last;
    while (Date.now() < deadline) {
      try {
        last = await this.eval(expr);
        if (last) return last;
      } catch (err) {
        last = String(err);
      }
      await sleep(interval);
    }
    throw new Error(`timed out waiting for ${label} (last: ${JSON.stringify(last)?.slice(0, 300)})`);
  }

  async e2e(action, extra = {}) {
    return this.request('/e2e', { action, ...extra });
  }

  async screenshot(name, { window = 'main' } = {}) {
    const r = await this.request('/screenshot', { window });
    if (!r.ok) throw new Error(`screenshot failed: ${r.error}`);
    // The run's own copy is the record; the showcase folder gets one too, as before.
    const target = path.join(OUT, 'screens', `e2e-${name}.png`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(r.path, target);
    try {
      fs.copyFileSync(r.path, path.join(SCREENS, `e2e-${name}.png`));
    } catch {
      /* the showcase copy is a convenience */
    }
    this.screens.push(target);
    return target;
  }

  /** Fails loudly if anything of ours is on the desktop. */
  async checkDesktop(label) {
    const tree = await processTree(this.child?.pid, this.runDir);
    const visible = await visibleWindowsOf(tree.map((p) => p.ProcessId));
    let violations = [];
    try {
      const status = await this.e2e('status');
      violations = status.violations ?? [];
      if (status.visibleWindows) visible.push({ ProcessName: 'electron', MainWindowTitle: `${status.visibleWindows} BrowserWindow(s) visible` });
    } catch {
      /* bridge down: the OS check still stands */
    }
    if (visible.length || violations.length) {
      this.desktopLeaks.push({ label, visible, violations });
      log(`DESKTOP LEAK at ${label}: ${JSON.stringify({ visible, violations })}`);
    }
    return { visible, violations };
  }

  /**
   * Kill exactly what this run started: the launcher's verified descendants (creation
   * time checked, see `processTree`) plus anything naming this run's temp dir. Each PID
   * is killed on its own — never `taskkill /T`, whose tree walk trusts reused PIDs.
   */
  async stop() {
    const root = this.child?.pid;
    const before = (await processTree(root, this.runDir)).filter((p) => p.ProcessId !== process.pid);
    const killAll = async (rows) => {
      // Leaves first, so a parent cannot respawn a child mid-teardown.
      for (const p of [...rows].reverse()) {
        await new Promise((r) => execFile('taskkill.exe', ['/PID', String(p.ProcessId), '/F'], { windowsHide: true }, () => r()));
      }
    };
    await killAll(before);
    await sleep(1500);
    const ids = new Set(before.map((p) => `${p.ProcessId}:${p.Created}`));
    const recheck = async () => {
      const r = await powershell(`Get-CimInstance Win32_Process | Select-Object ProcessId, CommandLine, @{n='Created';e={ if ($_.CreationDate) { $_.CreationDate.ToFileTimeUtc() } else { 0 } }} | ConvertTo-Json -Compress`);
      let rows = [];
      try {
        rows = JSON.parse(r.stdout || '[]');
      } catch {
        rows = [];
      }
      if (!Array.isArray(rows)) rows = [rows];
      return rows.filter((p) => p.ProcessId !== process.pid
        && (ids.has(`${p.ProcessId}:${p.Created}`) || (p.CommandLine ?? '').toLowerCase().includes(this.runDir.toLowerCase())));
    };
    let left = await recheck();
    if (left.length) {
      await killAll(left);
      await sleep(1000);
      left = await recheck();
    }
    this.appLog?.end();
    // The app is gone: release the snapshot. Its junctions are removed only when no other
    // live run still uses it (build.cjs, isolation.cjs).
    if (this.linked) {
      try {
        const unlinked = await isolation.releaseSnapshot(this.appDir, this.runId, require('./build.cjs').unlinkResources);
        if (!unlinked) log(`left the snapshot's junctions for another run still using ${this.buildId}`);
      } catch (err) {
        log(`could not release the snapshot's junctions: ${err}`);
      }
      this.linked = false;
    }
    try {
      await this.world?.close();
    } catch (err) {
      log(`could not close the fakes: ${err}`);
    }
    return { started: before.length, leftAfterKill: left.length, left: left.map((p) => p.ProcessId) };
  }

  cleanup() {
    if (KEEP) {
      log(`--keep: run dir left at ${this.runDir}`);
      return;
    }
    for (let i = 0; i < 5; i++) {
      try {
        fs.rmSync(this.runDir, { recursive: true, force: true });
        return;
      } catch {
        /* a handle still closing */
      }
    }
    log(`could not fully delete ${this.runDir}`);
  }
}

/** Collects checks for one flow. */
class FlowResult {
  constructor(flow) {
    this.id = flow.id;
    this.title = flow.title;
    this.checks = [];
    this.notes = [];
    this.screens = [];
    this.status = 'PASS';
    this.skipReason = null;
  }
  check(name, ok, detail = '') {
    this.checks.push({ name, ok: Boolean(ok), detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
    if (!ok) this.status = 'FAIL';
    log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`.slice(0, 600));
    return Boolean(ok);
  }
  note(text) {
    this.notes.push(text);
    log(`  note: ${text}`);
  }
  skip(reason) {
    this.status = 'SKIP';
    this.skipReason = reason;
    log(`  SKIP: ${reason}`);
  }
}

function loadFlowsAll() {
  const dir = path.join(__dirname, 'flows');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.cjs') && !f.startsWith('_'))
    .sort()
    .map((f) => require(path.join(dir, f)));
}

function loadFlows() {
  const all = loadFlowsAll();
  const unknown = [...ONLY, ...SKIP].filter((id) => !all.some((f) => f.id === id));
  if (unknown.length) throw new Error(`unknown flow id(s): ${unknown.join(', ')} (see --list)`);
  // `boot` always runs: it is what proves headless mode and the isolation are in place.
  return all.filter((flow) => flow.id === 'boot' || ((!ONLY.length || ONLY.includes(flow.id)) && !SKIP.includes(flow.id)));
}

/**
 * The opt-in parts of the world the selected flows ask for (a flow's `world` field), plus
 * `--world-ai` for `--serve`. `ai`: the fake AI server and the profile preset pointing at
 * it (tools/e2e/world.cjs) — only when a flow that needs it runs.
 */
function worldOptionsFor(flows) {
  return { ai: args.includes('--world-ai') || flows.some((flow) => Boolean(flow.world && flow.world.ai)) };
}

/** Loopback port -> who listens there (the harness's fakes and the app's own servers). */
function ownerLabels(h) {
  return {
    ...(h.world ? h.world.ports() : {}),
    ...(h.ports ? { [h.ports.bridge]: 'app debug bridge', [h.ports.extension]: 'app extension server' } : {}),
  };
}

/**
 * The isolation verdict for one flow: every loopback connection the app made while it
 * ran, named by owner. A protected port (the owner's Anki, torrent client, texthooker …)
 * contacted without being remapped to a fake or refused is a leak and fails the flow.
 */
function isolationVerdict(status, sinceTs, owners) {
  const iso = status?.isolation ?? {};
  const conns = (iso.loopback?.connections ?? []).filter((c) => c.ts >= sinceTs);
  const protect = iso.loopback?.config?.protect ?? {};
  const leaked = conns.filter((c) => protect[c.port] && c.verdict === 'allowed');
  const byPort = {};
  for (const c of conns) {
    const key = `${c.port} ${owners[c.port] ?? protect[c.port] ?? 'app-owned'} (${c.verdict}${c.to ? ` -> ${c.to}` : ''})`;
    byPort[key] = (byPort[key] ?? 0) + 1;
  }
  return { leaked, refused: conns.filter((c) => c.verdict === 'refused'), byPort, missing: iso.missing ?? [] };
}

/** What a flow gets: the harness, its result sheet, and short names for the bridge calls. */
function makeCtx(h, flow, result) {
  return {
    h,
    result,
    log,
    sleep,
    repo: REPO,
    runDir: h.runDir,
    mediaDir: h.mediaDir,
    profile: h.profile,
    eval: (js, o) => h.eval(js, o),
    evalAsync: (js, o) => h.evalAsync(js, o),
    waitFor: (expr, o) => h.waitFor(expr, o),
    e2e: (a, x) => h.e2e(a, x),
    request: (r, b, t) => h.request(r, b, t),
    secondInstance: (args) => h.secondInstance(args),
    /** The run's own extension-server port (ephemeral unless overridden). */
    extensionPort: h.ports?.extension,
    /** The run's output folder (tools/e2e/out/<run-id>/). */
    outDir: OUT,
    world: h.world,
    shot: async (name, opts) => {
      if (opts && opts.window) {
        const file = await h.screenshot(`${flow.id}-${name}`, opts);
        result.screens.push(file);
        return file;
      }
      const file = await h.screenshot(`${flow.id}-${name}`);
      result.screens.push(file);
      return file;
    },
  };
}

function writeReport(results, meta) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ ...meta, results }, null, 2));
  const lines = [
    `# Gum headless E2E report`,
    '',
    `Run ${meta.runId} — ${meta.startedAt} → ${meta.finishedAt}`,
    '',
    `Output tools/e2e/out/${meta.runId}/; snapshot ${meta.buildId ?? '(dev server)'}; ports ${JSON.stringify(meta.ports ?? {})}`,
    '',
    `Desktop leaks: ${meta.desktopLeaks.length ? `**${meta.desktopLeaks.length}**` : 'none'}; owner-service leaks: ${meta.isolation ? (meta.isolation.leaked ? `**${meta.isolation.leaked}**` : 'none') : '?'}; processes left after teardown: ${meta.teardown?.leftAfterKill ?? '?'}`,
    '',
    `Total ${Math.round((Date.parse(meta.finishedAt) - Date.parse(meta.startedAt)) / 1000)} s; ${results.filter((r) => r.status === 'PASS').length} PASS, ${results.filter((r) => r.status === 'FAIL').length} FAIL, ${results.filter((r) => r.status === 'SKIP').length} SKIP`,
    '',
    '| Flow | Id | Result | Checks | Time | Notes |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const r of results) {
    const passed = r.checks.filter((c) => c.ok).length;
    const secs = r.durationMs != null ? `${Math.round(r.durationMs / 1000)} s` : '';
    lines.push(`| ${r.title} | ${r.id} | ${r.status} | ${passed}/${r.checks.length} | ${secs} | ${(r.skipReason ?? r.notes.join('; ')).replace(/\|/g, '/').replace(/\n/g, ' ').slice(0, 300)} |`);
  }
  if (meta.isolation) {
    const iso = meta.isolation;
    lines.push('', '## Isolation', '');
    lines.push(`Stubs: ${(iso.stubs ?? []).map((s) => `${s.installed ? '' : '**MISSING** '}${s.name}`).join('; ')}`, '');
    lines.push('| Loopback port contacted | Connections |', '| --- | --- |');
    for (const [k, n] of Object.entries(iso.loopbackByPort ?? {})) lines.push(`| ${k} | ${n} |`);
    lines.push('', `Clipboard (in-memory): ${JSON.stringify(iso.clipboard ?? {})}`);
    lines.push(`Screen capture (synthetic): ${JSON.stringify(iso.capture ?? {})}`);
    if ((iso.shimNotes ?? []).length) lines.push(`Page shim notes: ${iso.shimNotes.join(' / ').slice(0, 600)}`);
    lines.push(`Off-machine hosts requested (witnessed, not faked): ${(iso.offMachineHosts ?? []).join(', ') || 'none'}`);
    if (meta.world) lines.push('', `Fakes: \`${JSON.stringify(meta.world).slice(0, 1500)}\``);
  }
  for (const r of results) {
    lines.push('', `## ${r.title} — ${r.status}`, '');
    if (r.skipReason) lines.push(`Skipped: ${r.skipReason}`, '');
    for (const c of r.checks) lines.push(`- ${c.ok ? 'PASS' : '**FAIL**'} ${c.name}${c.detail ? ` — ${c.detail.slice(0, 400)}` : ''}`);
    for (const n of r.notes) lines.push(`- note: ${n}`);
    if (r.isolation && Object.keys(r.isolation).length) lines.push(`- loopback: ${Object.entries(r.isolation).map(([k, n]) => `${k} ×${n}`).join('; ')}`);
    for (const s of r.screens) lines.push(`- screenshot: ${s}`);
  }
  fs.writeFileSync(path.join(OUT, 'report.md'), `${lines.join('\n')}\n`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'run.log'), '');
  isolation.writeJsonAtomic(path.join(OUT, 'run.json'), { runId: RUN_ID, pid: process.pid, startedAt: new Date().toISOString(), args });
  const flows = loadFlows();
  if (!flows.length) throw new Error(`no flows match ${ONLY.join(',')}`);
  const h = new Harness();
  const meta = { runId: h.runId, startedAt: new Date().toISOString(), runDir: h.runDir, profile: h.profile };
  const results = [];
  let fatal = null;
  try {
    await h.start(worldOptionsFor(flows));
    for (const flow of flows) {
      const result = new FlowResult(flow);
      log(`flow ${flow.id}: ${flow.title}`);
      const ctx = makeCtx(h, flow, result);
      const t0 = Date.now();
      // Loopback connections are judged per flow, from this instant (bridge clock = ours).
      const isoSince = t0 - 50;
      try {
        // Every flow starts on the desktop, whatever the previous one left open.
        if (flow.id !== 'boot' && flow.id !== 'setup') await require('./flows/_lib.cjs').toDesktop(ctx);
        await flow.run(ctx);
      } catch (err) {
        result.check('flow ran to completion', false, String(err && err.stack ? err.stack.split('\n').slice(0, 3).join(' ') : err));
        try {
          result.screens.push(await h.screenshot(`${flow.id}-error`));
        } catch {
          /* window gone */
        }
      }
      const desk = await h.checkDesktop(flow.id);
      result.check('nothing reached the desktop', desk.visible.length === 0 && desk.violations.length === 0, desk.visible.length || desk.violations.length ? desk : '');
      try {
        const iso = isolationVerdict(await h.e2e('status'), isoSince, ownerLabels(h));
        result.isolation = iso.byPort;
        result.check("nothing touched the owner's services (loopback guard)", iso.leaked.length === 0 && iso.missing.length === 0,
          iso.leaked.length || iso.missing.length ? { leaked: iso.leaked, missingStubs: iso.missing } : '');
        if (iso.refused.length) result.note(`refused (owner ports, no fake): ${[...new Set(iso.refused.map((c) => `${c.port} ${c.service}`))].join(', ')}`);
      } catch (err) {
        result.check("nothing touched the owner's services (loopback guard)", false, `status unreadable: ${err}`);
      }
      result.durationMs = Date.now() - t0;
      results.push(result);
      if (h.child.exitCode !== null) {
        fatal = 'the app exited mid-run';
        break;
      }
    }
    try {
      const status = await h.e2e('status');
      meta.stubbedCalls = status.calls?.length ?? 0;
      meta.stubbedApis = [...new Set((status.calls ?? []).map((c) => c.api))];
      meta.patchFailures = status.patchFailures;
      // Per-flow verdicts are the record (a flow may `clear` the app's log mid-run), so the
      // run's totals are their sum.
      const byPort = {};
      for (const r of results) for (const [k, n] of Object.entries(r.isolation ?? {})) byPort[k] = (byPort[k] ?? 0) + n;
      const leaked = results.reduce((n, r) => n + (r.checks.some((c) => c.name.startsWith("nothing touched the owner's services") && !c.ok) ? 1 : 0), 0);
      meta.isolation = {
        stubs: status.isolation?.stubs ?? [],
        loopbackByPort: byPort,
        leaked,
        clipboard: status.isolation?.clipboard,
        capture: status.isolation?.capture,
        shimNotes: (status.isolation?.shimNotes ?? []).slice(-20),
        offMachineHosts: [...new Set((status.network ?? []).map((n) => { try { return new URL(n.detail).host; } catch { return n.detail; } }))],
      };
    } catch {
      /* bridge gone */
    }
    try {
      meta.world = h.world?.summary();
    } catch {
      /* fakes gone */
    }
  } catch (err) {
    fatal = String(err && err.stack ? err.stack : err);
    log(`FATAL ${fatal}`);
  } finally {
    meta.teardown = await h.stop();
    log(`teardown ${JSON.stringify(meta.teardown)}`);
    meta.finishedAt = new Date().toISOString();
    meta.desktopLeaks = h.desktopLeaks;
    meta.screens = h.screens;
    meta.fatal = fatal;
    meta.ports = h.ports;
    meta.buildId = h.buildId;
    writeReport(results.map((r) => ({ ...r })), meta);
    h.cleanup();
    // This run's report becomes "the latest"; old run folders and snapshots are pruned
    // (never one a live run is using).
    try {
      isolation.publishLatest(OUT_ROOT, OUT, RUN_ID);
      isolation.writeJsonAtomic(path.join(OUT, 'run.json'), { runId: RUN_ID, pid: process.pid, startedAt: meta.startedAt, finishedAt: meta.finishedAt, args });
      isolation.pruneRunDirs(OUT_ROOT, { exceptRunId: RUN_ID });
      await isolation.pruneBuilds(OUT_ROOT, { unlink: require('./build.cjs').unlinkResources, log });
    } catch (err) {
      log(`could not publish/prune: ${err}`);
    }
  }
  const failed = results.filter((r) => r.status === 'FAIL').length;
  log(`done: ${results.map((r) => `${r.id}=${r.status}`).join(' ')}${fatal ? ` FATAL: ${fatal.split('\n')[0]}` : ''}`);
  process.exitCode = fatal || failed || h.desktopLeaks.length ? 1 : 0;
}

/**
 * Flow-authoring aids (not part of a normal run):
 *   --serve                  boot the headless app and hold it until out/stop exists
 *   --eval=<js> [--await]    run page JS against the served app, print the JSON result
 *   --shot=<name>            screenshot the served app
 *   --stop                   ask the served app to tear down
 */
async function serve() {
  fs.mkdirSync(OUT, { recursive: true });
  isolation.writeJsonAtomic(path.join(OUT, 'run.json'), { runId: RUN_ID, pid: process.pid, startedAt: new Date().toISOString(), args, serve: true });
  const stopFile = path.join(OUT, 'stop');
  fs.rmSync(stopFile, { force: true });
  const h = new Harness();
  try {
    await h.start(worldOptionsFor([]));
    const session ={ bridge: h.bridge, runDir: h.runDir, launcher: h.child.pid, outDir: OUT, ports: h.ports };
    fs.writeFileSync(path.join(OUT, 'session.json'), JSON.stringify(session, null, 2));
    // The pointer a client (`--eval`, `--run`, `--stop`) finds the newest served app by.
    isolation.writeJsonAtomic(path.join(OUT_ROOT, 'session.json'), session);
    log('serving; create out/stop (or run --stop) to tear down; `--run=<flow>` runs a flow in here');
    const requestFile = path.join(OUT, 'run-request.json');
    while (!fs.existsSync(stopFile) && h.child.exitCode === null) {
      // A flow run requested by a client (`--run=<id>`): executed in THIS process, which
      // owns the fakes (ctx.world), and answered in out/run-result-<nonce>.json.
      if (fs.existsSync(requestFile)) {
        let req = null;
        try {
          req = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
        } catch {
          /* half-written */
        }
        if (req) {
          fs.rmSync(requestFile, { force: true });
          // Authoring: pick up edits to the flows and fixtures since the last request.
          for (const key of Object.keys(require.cache)) {
            if (key.startsWith(path.join(__dirname, 'flows')) || key === path.join(__dirname, 'fixtures.cjs')) delete require.cache[key];
          }
          const flow = loadFlowsAll().find((f) => f.id === req.flow);
          const result = new FlowResult(flow ?? { id: req.flow, title: req.flow });
          const t0 = Date.now();
          try {
            if (!flow) throw new Error(`no flow ${req.flow}`);
            if (flow.id !== 'boot' && flow.id !== 'setup') await require('./flows/_lib.cjs').toDesktop(makeCtx(h, flow, result));
            await flow.run(makeCtx(h, flow, result));
          } catch (err) {
            result.check('flow ran to completion', false, String(err && err.stack ? err.stack : err));
          }
          try {
            const iso = isolationVerdict(await h.e2e('status'), t0 - 50, ownerLabels(h));
            result.check("nothing touched the owner's services (loopback guard)", iso.leaked.length === 0 && iso.missing.length === 0, iso.leaked.length ? iso.leaked : '');
            result.isolation = iso.byPort;
          } catch {
            /* bridge gone */
          }
          result.durationMs = Date.now() - t0;
          fs.writeFileSync(path.join(OUT, `run-result-${req.nonce}.json`), JSON.stringify({ ...result, world: h.world?.summary() }, null, 2));
        }
      }
      await sleep(500);
    }
  } catch (err) {
    log(`serve failed: ${err && err.stack ? err.stack : err}`);
  } finally {
    log(`teardown ${JSON.stringify(await h.stop())}`);
    fs.rmSync(path.join(OUT, 'session.json'), { force: true });
    // Only this serve's pointer; a newer serve may have replaced it.
    if (isolation.readJson(path.join(OUT_ROOT, 'session.json'))?.outDir === OUT) fs.rmSync(path.join(OUT_ROOT, 'session.json'), { force: true });
    fs.rmSync(stopFile, { force: true });
    h.cleanup();
  }
}

async function client() {
  // `--session=<run-id>` picks a served app; otherwise the newest one (out/session.json).
  const sessionId = argValue('session');
  const session = JSON.parse(fs.readFileSync(sessionId ? path.join(OUT_ROOT, sessionId, 'session.json') : path.join(OUT_ROOT, 'session.json'), 'utf8'));
  // The served app's own output folder holds its control files.
  const OUT = session.outDir;
  const h = new Harness();
  h.bridge = session.bridge;
  if (args.includes('--stop')) {
    fs.writeFileSync(path.join(OUT, 'stop'), '');
    return;
  }
  const runId = argValue('run');
  if (runId) {
    // One flow against the served app, for authoring. It runs inside the serving process
    // (which owns the fakes), with the same ctx as a full run.
    if (!loadFlowsAll().some((f) => f.id === runId)) throw new Error(`no flow ${runId}`);
    const nonce = `${Date.now()}-${process.pid}`;
    const answer = path.join(OUT, `run-result-${nonce}.json`);
    fs.writeFileSync(path.join(OUT, 'run-request.json'), JSON.stringify({ flow: runId, nonce }));
    const deadline = Date.now() + 15 * 60_000;
    while (!fs.existsSync(answer) && Date.now() < deadline) await sleep(500);
    if (!fs.existsSync(answer)) throw new Error('the served app never answered the run request');
    const result = JSON.parse(fs.readFileSync(answer, 'utf8'));
    fs.rmSync(answer, { force: true });
    console.log(JSON.stringify({ status: result.status, durationMs: result.durationMs, checks: result.checks, notes: result.notes, isolation: result.isolation, world: result.world }, null, 2));
    return;
  }
  const shot = argValue('shot');
  if (shot) {
    console.log(await h.screenshot(shot));
    return;
  }
  const raw = args.find((a) => a.startsWith('--eval='));
  const file = argValue('eval-file');
  const js = file ? fs.readFileSync(file, 'utf8') : raw.slice('--eval='.length);
  const r = await h.request('/eval', { js, await: args.includes('--await'), window: argValue('window') ?? 'main' });
  console.log(JSON.stringify(r.ok ? r.result : r, null, 2));
}

if (require.main === module && args.includes('--list')) {
  for (const flow of loadFlowsAll()) console.log(`${flow.id.padEnd(14)} ${flow.title}`);
} else if (require.main === module && args.includes('--serve')) {
  serve();
} else if (require.main === module && (args.some((a) => a.startsWith('--eval')) || args.includes('--stop') || argValue('shot') || argValue('run'))) {
  client().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
} else if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { Harness, FlowResult };
