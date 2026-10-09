#!/usr/bin/env node
/**
 * Headless end-to-end harness for the REAL Gum app.
 *
 *   npm run e2e                       all flows, in order
 *   npm run e2e -- --flows=setup,dictionary
 *   npm run e2e -- --keep             keep the temp profile + media for inspection
 *   npm run e2e -- --reuse-build      skip rebuilding the snapshot
 *   npm run e2e -- --dev              drive `electron-forge start` instead (live dev server)
 *
 * What it runs: a PRODUCTION snapshot of the tree (tools/e2e/build.cjs — forge's own Vite
 * config, written to tools/e2e/out/app, so the shared .vite/ is untouched), launched with
 * the repo's electron.exe. Not the dev server by default: other agents edit this tree while
 * a run is in flight, and Vite's HMR reloaded the page under a flow three times in seven
 * seconds. Environment:
 *
 *   GUM_E2E_HEADLESS=1      src/main/e2eHeadless.ts: every window hidden for life (still
 *                           rendered), no tray, OS dialogs / toasts / shell calls / native
 *                           menus / file choosers stubbed, downloads saved into the profile,
 *                           global shortcuts stubbed, DevTools never opened. Plus `--e2e`.
 *   JP_USER_DATA_DIR        a fresh temp profile per run
 *   JP_DEBUG_DIR/PORT       the debug bridge's bridge.json + port, private to this run
 *   JP_EXTENSION_PORT, PORT a private extension-server port (and Vite port for --dev)
 *   SEANIME_EXE/_DATADIR    the media sidecar (default: the installed copy under
 *                           %USERPROFILE%\Apps\jp-study-app-win32-x64), datadir in the profile
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
 * Output: tools/e2e/out/report.json + report.md, app stdout in out/app.log, screenshots in
 * `%USERPROFILE%\Videos\Gum Showcase\screens\e2e-*.png`.
 */
'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */

const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'out');
const SCREENS = path.join(os.homedir(), 'Videos', 'Gum Showcase', 'screens');
const FORGE_CLI = path.join(REPO, 'node_modules', '@electron-forge', 'cli', 'dist', 'electron-forge.js');
const DEFAULT_SEANIME = path.join(os.homedir(), 'Apps', 'jp-study-app-win32-x64', 'resources', 'seanime', 'seanime.exe');

const PORTS = { bridge: 39391, vite: 5191, extension: 18791 };

const args = process.argv.slice(2);
const argValue = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const KEEP = args.includes('--keep');
/** `--dev`: drive `electron-forge start` (live dev server) instead of the production snapshot. */
const DEV = args.includes('--dev');
/** `--reuse-build`: skip rebuilding the snapshot when tools/e2e/out/app already has one. */
const REUSE_BUILD = args.includes('--reuse-build');
const BUILD_APP = path.join(OUT, 'app');
const ELECTRON = path.join(REPO, 'node_modules', 'electron', 'dist', 'electron.exe');
const ONLY = (argValue('flows') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

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
    this.runId = stamp();
    this.runDir = path.join(os.tmpdir(), `gum-e2e-${this.runId}`);
    this.profile = path.join(this.runDir, 'profile');
    this.debugDir = path.join(this.runDir, 'debug');
    this.mediaDir = path.join(this.runDir, 'media');
    this.child = null;
    this.bridge = null;
    this.desktopLeaks = [];
    this.screens = [];
    this.appLog = null;
  }

  env() {
    const env = {
      ...process.env,
      GUM_E2E_HEADLESS: '1',
      JP_USER_DATA_DIR: this.profile,
      JP_DEBUG_DIR: this.debugDir,
      JP_DEBUG_PORT: String(PORTS.bridge),
      JP_EXTENSION_PORT: String(PORTS.extension),
      PORT: String(PORTS.vite),
      SEANIME_DATADIR: path.join(this.profile, 'seanime-e2e'),
    };
    const seanime = process.env.SEANIME_EXE || DEFAULT_SEANIME;
    if (fs.existsSync(seanime)) env.SEANIME_EXE = seanime;
    delete env.ELECTRON_RUN_AS_NODE;
    return env;
  }

  /** Build the production snapshot (tools/e2e/build.cjs) unless --reuse-build finds one. */
  async ensureBuild() {
    const info = path.join(BUILD_APP, 'build-info.json');
    if (REUSE_BUILD && fs.existsSync(info) && fs.existsSync(path.join(BUILD_APP, '.vite', 'build', 'main.js'))) {
      log(`reusing build from ${JSON.parse(fs.readFileSync(info, 'utf8')).builtAt}`);
      return;
    }
    log('building the production snapshot (tools/e2e/build.cjs)…');
    const t0 = Date.now();
    const code = await new Promise((resolve) => {
      const p = spawn(process.execPath, ['--max-old-space-size=8192', path.join(__dirname, 'build.cjs')], {
        cwd: REPO,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'production' },
      });
      const buildLog = fs.createWriteStream(path.join(OUT, 'build.log'), { flags: 'w' });
      p.stdout.pipe(buildLog);
      p.stderr.pipe(buildLog);
      p.on('exit', resolve);
    });
    if (code !== 0) throw new Error(`build failed (exit ${code}); see tools/e2e/out/build.log`);
    log(`build done in ${Math.round((Date.now() - t0) / 1000)} s`);
  }

  async start() {
    for (const dir of [this.profile, this.debugDir, this.mediaDir, OUT, SCREENS]) fs.mkdirSync(dir, { recursive: true });
    log(`run dir ${this.runDir}`);
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
      require('./build.cjs').linkResources();
      this.linked = true;
      this.appLog = fs.createWriteStream(path.join(OUT, 'app.log'), { flags: 'w' });
      this.child = spawn(ELECTRON, [BUILD_APP, ...appArgs], {
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
    const p = spawn(ELECTRON, [BUILD_APP, '--e2e', `--e2e-run=${this.runDir}`, ...extraArgs], {
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
    const target = path.join(SCREENS, `e2e-${name}.png`);
    fs.copyFileSync(r.path, target);
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
    // The app is gone: take the junctions out of tools/e2e/out/app again (build.cjs).
    if (this.linked) {
      try {
        require('./build.cjs').unlinkResources();
      } catch (err) {
        log(`could not remove the out/app junctions: ${err}`);
      }
      this.linked = false;
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
  return loadFlowsAll().filter((flow) => !ONLY.length || ONLY.includes(flow.id));
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
    extensionPort: PORTS.extension,
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
    `Desktop leaks: ${meta.desktopLeaks.length ? `**${meta.desktopLeaks.length}**` : 'none'}; processes left after teardown: ${meta.teardown?.leftAfterKill ?? '?'}`,
    '',
    '| Flow | Result | Checks | Notes |',
    '| --- | --- | --- | --- |',
  ];
  for (const r of results) {
    const passed = r.checks.filter((c) => c.ok).length;
    lines.push(`| ${r.title} | ${r.status} | ${passed}/${r.checks.length} | ${(r.skipReason ?? r.notes.join('; ')).replace(/\|/g, '/')} |`);
  }
  for (const r of results) {
    lines.push('', `## ${r.title} — ${r.status}`, '');
    if (r.skipReason) lines.push(`Skipped: ${r.skipReason}`, '');
    for (const c of r.checks) lines.push(`- ${c.ok ? 'PASS' : '**FAIL**'} ${c.name}${c.detail ? ` — ${c.detail.slice(0, 400)}` : ''}`);
    for (const n of r.notes) lines.push(`- note: ${n}`);
    for (const s of r.screens) lines.push(`- screenshot: ${s}`);
  }
  fs.writeFileSync(path.join(OUT, 'report.md'), `${lines.join('\n')}\n`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'run.log'), '');
  const flows = loadFlows();
  if (!flows.length) throw new Error(`no flows match ${ONLY.join(',')}`);
  const h = new Harness();
  const meta = { runId: h.runId, startedAt: new Date().toISOString(), runDir: h.runDir, profile: h.profile };
  const results = [];
  let fatal = null;
  try {
    await h.start();
    for (const flow of flows) {
      const result = new FlowResult(flow);
      log(`flow ${flow.id}: ${flow.title}`);
      const ctx = makeCtx(h, flow, result);
      const t0 = Date.now();
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
    } catch {
      /* bridge gone */
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
    writeReport(results.map((r) => ({ ...r })), meta);
    h.cleanup();
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
  const stopFile = path.join(OUT, 'stop');
  fs.rmSync(stopFile, { force: true });
  const h = new Harness();
  try {
    await h.start();
    fs.writeFileSync(path.join(OUT, 'session.json'), JSON.stringify({ bridge: h.bridge, runDir: h.runDir, launcher: h.child.pid }, null, 2));
    log('serving; create out/stop (or run --stop) to tear down');
    while (!fs.existsSync(stopFile) && h.child.exitCode === null) await sleep(1000);
  } catch (err) {
    log(`serve failed: ${err && err.stack ? err.stack : err}`);
  } finally {
    log(`teardown ${JSON.stringify(await h.stop())}`);
    fs.rmSync(path.join(OUT, 'session.json'), { force: true });
    fs.rmSync(stopFile, { force: true });
    h.cleanup();
  }
}

async function client() {
  const session = JSON.parse(fs.readFileSync(path.join(OUT, 'session.json'), 'utf8'));
  const h = new Harness();
  h.bridge = session.bridge;
  if (args.includes('--stop')) {
    fs.writeFileSync(path.join(OUT, 'stop'), '');
    return;
  }
  const runId = argValue('run');
  if (runId) {
    // One flow against the served app, for authoring. Same ctx as a full run.
    const flow = loadFlowsAll().find((f) => f.id === runId);
    if (!flow) throw new Error(`no flow ${runId}`);
    h.runDir = session.runDir;
    h.profile = path.join(session.runDir, 'profile');
    h.mediaDir = path.join(session.runDir, 'media');
    const result = new FlowResult(flow);
    try {
      await flow.run(makeCtx(h, flow, result));
    } catch (err) {
      result.check('flow ran to completion', false, String(err && err.stack ? err.stack : err));
    }
    console.log(JSON.stringify({ status: result.status, checks: result.checks, notes: result.notes }, null, 2));
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

if (require.main === module && args.includes('--serve')) {
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
