/**
 * Old-player retirement, step 1: do the `player` and `video` launchers actually land on
 * the adopted workspace now — and does `music` still land on the legacy shell?
 *
 * The routing swap is four lines in `AppSection.tsx`, and the unit tests that cover it read
 * source text. That catches a rename; it cannot see whether the section really renders the
 * workspace in a running app, and it cannot see the case this step was blocked on for
 * months.
 *
 * ## The case that matters: the rollback must not remove the media surface
 *
 * `MediaWorkspaceHost` returns `null` when the sidecar is `disabled`. Routing the two
 * launchers straight at it would mean `SEANIME_SIDECAR=0` — the documented rollback for the
 * default-on flip — leaves the app with **no media surface at all**, which is exactly the
 * objection `src/.coordination/study-mode/NEXT_ACTIONS.md` recorded when it blocked this
 * step. `MediaWorkspaceSectionView` is supposed to fall back to `MediaCenterView` instead.
 * Phase D is that claim, and it is the reason this harness runs a second Electron.
 *
 * ## Why `music` is a phase and not a footnote
 *
 * `MediaWorkspace.tsx` contains nothing music-shaped. Routing music into it would delete a
 * working feature rather than migrate one, so `music` deliberately did NOT move — and a
 * later well-meaning "finish the migration" change is exactly how that gets undone. Phase C
 * fails if music stops rendering the legacy shell.
 *
 * ## Reading a negative honestly
 *
 * Every phase asserts both what should be there and what should not. An assertion that
 * `.mc-root` is absent is worthless before the section has rendered anything, so each phase
 * waits for its positive marker first and only then reads the negative one.
 *
 * Safe to run beside the developer's app: own `--user-data-dir` (which also side-steps
 * `requestSingleInstanceLock()`) and own `--remote-debugging-port`. Needs the Vite dev
 * server up.
 *
 * Usage: node docs/migration/tools/media-routing-harness.mjs
 * Writes its record to docs/migration/proof/media-routing-<stamp>/.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');

const CDP_TIMEOUT_MS = 120_000;
const MOUNT_TIMEOUT_MS = 120_000;
const SECTION_TIMEOUT_MS = 60_000;

const log = (...parts) => console.log(`[media-routing] ${parts.join(' ')}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '');
const workRoot = path.join(os.tmpdir(), `media-routing-${stamp}`);

const record = {
  harness: 'media-routing-harness.mjs',
  question:
    'Do player/video route to the adopted workspace, does music stay legacy, and does '
    + 'SEANIME_SIDECAR=0 still leave a media surface?',
  startedAt: new Date().toISOString(),
  phases: {},
  probeCorrections: [
    'Phases A and B first waited on ".media-workspace-section, .seanime-host" — either '
      + 'marker. On the cold first open the workspace overlay won that race, so the run '
      + 'recorded handoffPanel:false for A and true for B and had proved only that '
      + '*something* opened, not that this change\'s own component rendered. Both phases '
      + 'now wait on the panel specifically, and A reports true. Do not relax this back '
      + 'to an either-marker wait.',
  ],
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
  const out = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' });
  return (out.stdout ?? '').includes(String(pid));
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

async function findPageTarget(cdpPort, deadline) {
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      const targets = await res.json();
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
      /* not up yet */
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
    if (msg.result?.exceptionDetails) {
      throw new Error(
        msg.result.exceptionDetails.exception?.description ?? 'evaluate threw',
      );
    }
    return msg.result?.result?.value;
  }

  close() {
    try {
      this.socket?.close();
    } catch {
      /* gone */
    }
  }
}

const live = [];

async function launch(label, envOverrides) {
  const cdpPort = await freePort();
  const userDataDir = path.join(workRoot, `${label}-userdata`);
  fs.mkdirSync(userDataDir, { recursive: true });

  const env = { ...process.env, ...envOverrides };
  // Deleted rather than left unset — an exported value in the developer's shell wins.
  if (envOverrides.SEANIME_SIDECAR === undefined) delete env.SEANIME_SIDECAR;
  delete env.SEANIME_EXE;
  delete env.SEANIME_DATADIR;

  log(`[${label}] SEANIME_SIDECAR in child env: ${JSON.stringify(env.SEANIME_SIDECAR ?? null)}`);
  const electron = spawn(
    electronBinary(),
    ['.', `--user-data-dir=${userDataDir}`, `--remote-debugging-port=${cdpPort}`],
    { cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  electron.stdout.on('data', () => {});
  electron.stderr.on('data', () => {});

  const target = await findPageTarget(cdpPort, Date.now() + CDP_TIMEOUT_MS);
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.open();
  const instance = { label, electron, cdp };
  live.push(instance);
  log(`[${label}] electron pid ${electron.pid}, attached`);
  return instance;
}

async function waitFor(cdp, expression, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cdp.evaluate(expression)) return true;
    await sleep(400);
  }
  throw new Error(label);
}

async function waitForShell(cdp, label) {
  await waitFor(
    cdp,
    "typeof window.api?.seanimeStatus === 'function'"
      + " && !!document.querySelector('.desktop-root')"
      + " && !!document.querySelector('.os-taskbar')",
    MOUNT_TIMEOUT_MS,
    `[${label}] the desktop shell never mounted`,
  );
}

/** The palette's own affordance — no synthetic input anywhere in this harness. */
const openSection = (cdp, id) =>
  cdp.evaluate(`(window.dispatchEvent(new CustomEvent('os:open',{detail:'${id}'})),1)`);

const has = (cdp, selector) => cdp.evaluate(`!!document.querySelector('${selector}')`);

/** Media Center's own sidebar nav labels, one entry per button. */
const mediaCenterNav = (cdp) => cdp.evaluate(
  "[...document.querySelectorAll('nav.mc-nav button')].map(b => (b.innerText || '').trim()).filter(Boolean)",
);
const navOffers = (nav, id) =>
  (nav ?? []).some((label) => label.toLowerCase().includes(id));

async function closeAllWindows(cdp) {
  // Leaving a section open would let the previous phase's DOM satisfy the next one's
  // positive marker, which is the shape that makes a routing harness lie.
  await cdp.evaluate(
    "(document.querySelectorAll('.fwin-close').forEach(b=>b.click()),1)",
  );
  await sleep(800);
}

async function quit(instance) {
  await instance.cdp.evaluate('window.close(), 1').catch(() => undefined);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && processAlive(instance.electron.pid)) await sleep(500);
  if (processAlive(instance.electron.pid)) {
    spawnSync('taskkill', ['/pid', String(instance.electron.pid), '/T', '/F'], {
      stdio: 'ignore',
    });
  }
  instance.cdp.close();
}

async function main() {
  fs.mkdirSync(workRoot, { recursive: true });

  // ---- Phases A/B/C: a normal, default-on run --------------------------------
  const app = await launch('default', {});
  await waitForShell(app.cdp, 'default');

  // Phase A — `video`, the core of old-player retirement.
  await openSection(app.cdp, 'video');
  // Waiting on the PANEL specifically, not "panel or workspace". An earlier cut accepted
  // either, and on the first (cold) open the workspace overlay won the race — so the run
  // recorded `handoffPanel: false` and proved only that something opened. The panel is
  // this change's own component; it is the thing worth asserting.
  await waitFor(
    app.cdp,
    "!!document.querySelector('.media-workspace-section')",
    SECTION_TIMEOUT_MS,
    'phase A FAIL — `video` never rendered the handoff panel',
  );
  const aLegacy = await has(app.cdp, '.mc-root');
  record.phases.A = {
    what: "os:open 'video' on a default run",
    handoffPanel: await has(app.cdp, '.media-workspace-section'),
    workspaceOpen: await has(app.cdp, '.seanime-host'),
    legacyMediaCenterPresent: aLegacy,
    result: aLegacy ? 'FAIL' : 'PASS',
  };
  if (aLegacy) throw new Error('phase A FAIL — the legacy Media Center still rendered');
  log(`phase A PASS — video -> workspace (open=${record.phases.A.workspaceOpen})`);
  await closeAllWindows(app.cdp);

  // Phase B — `player`, the library launcher.
  await openSection(app.cdp, 'player');
  await waitFor(
    app.cdp,
    "!!document.querySelector('.media-workspace-section')",
    SECTION_TIMEOUT_MS,
    'phase B FAIL — `player` never rendered the handoff panel',
  );
  const bLegacy = await has(app.cdp, '.mc-root');
  record.phases.B = {
    what: "os:open 'player' (library) on a default run",
    handoffPanel: await has(app.cdp, '.media-workspace-section'),
    workspaceOpen: await has(app.cdp, '.seanime-host'),
    legacyMediaCenterPresent: bLegacy,
    result: bLegacy ? 'FAIL' : 'PASS',
  };
  if (bLegacy) throw new Error('phase B FAIL — the legacy Media Center still rendered');
  log('phase B PASS — player -> workspace');
  await closeAllWindows(app.cdp);

  // Phase C — `music` must NOT have moved.
  await openSection(app.cdp, 'music');
  await waitFor(
    app.cdp,
    "!!document.querySelector('.mc-root')",
    SECTION_TIMEOUT_MS,
    'phase C FAIL — music did not render the legacy Media Center shell',
  );
  const cHandoff = await has(app.cdp, '.media-workspace-section');
  // The Media Center's OWN nav must no longer offer Video or Library: `AppSection` stopped
  // routing to them, but this view still listed them, so the retired player and library
  // stayed one click away from Music — the one section that still renders this view.
  const navIds = await mediaCenterNav(app.cdp);
  const offersLegacy = navOffers(navIds, 'video') || navOffers(navIds, 'library');
  record.phases.C = {
    what: "os:open 'music' — deliberately NOT migrated; the workspace has no music surface",
    legacyMediaCenterPresent: true,
    handoffPanel: cHandoff,
    mediaCenterNav: navIds,
    stillOffersLegacyVideoOrLibrary: offersLegacy,
    result: !cHandoff && !offersLegacy ? 'PASS' : 'FAIL',
  };
  if (cHandoff) throw new Error('phase C FAIL — music was routed to the workspace');
  if (offersLegacy) {
    throw new Error(`phase C FAIL — Media Center still offers the legacy tabs: ${JSON.stringify(navIds)}`);
  }
  log(`phase C PASS — music on the legacy shell, nav ${JSON.stringify(navIds)}`);

  await quit(app);

  // ---- Phase D: the rollback still leaves a media surface ---------------------
  const off = await launch('optout', { SEANIME_SIDECAR: '0' });
  await waitForShell(off.cdp, 'optout');
  await openSection(off.cdp, 'video');
  await waitFor(
    off.cdp,
    "!!document.querySelector('.mc-root')",
    SECTION_TIMEOUT_MS,
    'phase D FAIL — SEANIME_SIDECAR=0 left the video section with no media surface',
  );
  const dHost = await has(off.cdp, '.seanime-host');
  const dNotice = await has(off.cdp, '.media-workspace-section-fallback');
  // With no workspace the legacy tabs must COME BACK — hiding them here would leave the
  // app with no video or library surface at all, which is the failure the fallback exists
  // to prevent. The same rule, read in the opposite direction.
  const offNav = await mediaCenterNav(off.cdp);
  const offersLegacyWhenDisabled = navOffers(offNav, 'video') && navOffers(offNav, 'library');
  record.phases.D = {
    what: 'SEANIME_SIDECAR=0 — the documented rollback must still have a media surface',
    legacyMediaCenterPresent: true,
    fallbackNoticeShown: dNotice,
    workspaceOpen: dHost,
    mediaCenterNav: offNav,
    legacyTabsRestored: offersLegacyWhenDisabled,
    result: !dHost && offersLegacyWhenDisabled ? 'PASS' : 'FAIL',
  };
  if (dHost) throw new Error('phase D FAIL — the workspace rendered despite the opt-out');
  if (!offersLegacyWhenDisabled) {
    throw new Error(
      `phase D FAIL — the legacy tabs did not come back: ${JSON.stringify(offNav)}`,
    );
  }
  log(`phase D PASS — fell back to the legacy shell (notice=${dNotice}), `
    + `legacy tabs restored: ${JSON.stringify(offNav)}`);

  await quit(off);
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
      spawnSync('taskkill', ['/pid', String(instance.electron.pid), '/T', '/F'], {
        stdio: 'ignore',
      });
    }
    try {
      instance.cdp?.close();
    } catch {
      /* gone */
    }
  }
  record.finishedAt = new Date().toISOString();
  const outDir = path.join(REPO, 'docs', 'migration', 'proof', `media-routing-${stamp}`);
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'player-video-route-to-workspace.json');
  fs.writeFileSync(outFile, `${JSON.stringify(record, null, 2)}\n`);
  log(`record written to ${path.relative(REPO, outFile)}`);
  process.exit(failure ? 1 : 0);
}
