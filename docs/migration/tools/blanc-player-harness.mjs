/**
 * Slices 15/16, and slice 23 which is what finally answers them: Blanc's toolbox player
 * WATCHED PLAYING A FILE, in Blanc's own window, at Blanc's own size.
 *
 * ## Why this file was rewritten (read this before trusting the old record)
 *
 * The 2026-07-31 23:25 run recorded six of its eight phases as INFO and still exited PASS,
 * and the handoff has carried "Blanc's toolbox player has never been watched playing a
 * file" ever since. The reason is not that the sidecar was off. It is that **the run never
 * looked at Blanc.**
 *
 * Blanc's toolbox is a **separate BrowserWindow** loading `blanc.html?blanc=1`
 * (`main.ts` `blancUrl()`), opened over IPC by `window.api.blancOpen()`. The old harness
 *   - dispatched `os:open` with detail `'blanc'`, which `DesktopShell`'s section bus does
 *     not handle at all — no window opens, nothing is routed; and
 *   - filtered CDP targets with `type === 'page' && !url.includes('?')`, which excludes
 *     the Blanc window **by construction**, because its URL is the one carrying `?blanc=1`.
 *
 * So every phase after A asserted on the MAIN window's DOM. `.blanc-study-player` was of
 * course absent there, and phase C's "a Blanc surface is present in this window" came from
 * the loose `[class*=blanc]` arm of its selector matching something that is not Blanc.
 * Phase B below records exactly what that matches rather than asserting the story: if a
 * real `.blanc-root` ever does exist in the main window, this run says so and fails.
 *
 * ## The two questions slice 15 left open, both only answerable with a file playing
 *
 *   1. **Geometry.** Blanc's toolbox window is 560x460 by default, and the adopted study
 *      dock and cue-loop overlay were laid out full-screen. `#media-workspace
 *      .blanc-study-player` in `theme/blanc-media.css` is supposed to bound them. Phase H
 *      measures the frame, the video and the dock against the real viewport.
 *   2. **Keymap collision.** `VideoCoreStudyOverlay` binds W/S/R/;/' through the catalog.
 *      Blanc has keydown handlers of its own (`BlancShell.tsx`: shortcut capture, the lock
 *      screen, the blocks game — the last one swallows `w`/`x`/`z`). Phase I counts what is
 *      registered in Blanc's window with the Media tab up, and presses `R` for real.
 *
 * ## Traps already paid for — all four apply here
 *
 * 1. The `--user-data-dir` is in the OS temp dir, NEVER in the repo: a Chromium profile
 *    under the repo makes Vite's watcher try to watch `<profile>/Network/Cookies`, throw
 *    `EBUSY`, and kill the dev server — including the developer's own.
 * 2. CDP target filters must test the **scheme**, or they match the `about:blank` Electron
 *    exposes before the window navigates, and every `localStorage` call fails with "Access
 *    is denied for this document". Here the Blanc filter is the *inverse* of the usual
 *    no-query-string rule, so both windows are matched deliberately and asserted by URL.
 * 3. `getComputedStyle` right after `focus()` returns the mid-transition value.
 * 4. A discriminator that can fail is what makes the run mean anything: phase B can falsify
 *    this file's own premise, phase G requires the clock to MOVE rather than the element to
 *    exist, and phase I's control key must produce no seek.
 *
 * ## Requirements
 *
 *   - The Vite renderer dev server on 5173 (`npx vite --config vite.renderer.config.ts`).
 *   - A prepared datadir, single-use per playback run:
 *       node docs/migration/tools/prepare-gplay-datadir.mjs <cue-probe-dual.mkv> <empty-dir>
 *       node docs/migration/tools/blanc-player-harness.mjs --datadir=<that dir>
 *     Without one the sidecar answers a local-file open with HTTP 500 — directstream has no
 *     scanned library to serve from. That is not the routing failing.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const DATA_DIR = flag('datadir', '') ? path.resolve(flag('datadir', '')) : null;
const DEFAULT_FILE = DATA_DIR
  ? path.join(DATA_DIR, 'cue-library', 'Sousou no Frieren - 01.mkv')
  : path.join(os.tmpdir(), 'cue-probe-dual.mkv');
const MEDIA_FILE = path.resolve(flag('file', DEFAULT_FILE));

const CDP_TIMEOUT_MS = 120_000;
const MOUNT_TIMEOUT_MS = 120_000;
const READY_TIMEOUT_MS = 180_000;
const PLAYBACK_TIMEOUT_MS = 120_000;

/**
 * The toolbox size the geometry question is asked at, passed explicitly to `blancOpen`.
 * (`main.ts`'s own default is 720x560 — `BLANC_DEFAULT_W`/`_H` — not the 560x460 the slice
 * -15 notes quote. This run pins the smaller box on purpose: it is the harder case for
 * "does the frame bound a surface laid out full-screen".)
 */
const BLANC_W = 560;
const BLANC_H = 460;
/**
 * How long the sidecar websocket is left alone before phase G re-requests. See the long
 * note at the retry loop: the first open is lost to React.StrictMode's double-mount, and
 * the recovery is a settled socket plus a new requestId, never a remount.
 */
const SETTLE_MS = 10_000;

const stamp = process.env.RUN_STAMP
  ?? new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '');
const workRoot = path.join(REPO, 'docs/migration/proof', `blanc-player-live-${stamp}`);
fs.mkdirSync(workRoot, { recursive: true });

/** NEVER inside the repo — trap 1. */
const scratchRoot = process.env.HARNESS_SCRATCH
  ?? path.join(os.tmpdir(), `jp-blanc-harness-${stamp}`);
fs.mkdirSync(scratchRoot, { recursive: true });

const logLines = [];
const log = (msg) => {
  const line = `[blanc-player] ${msg}`;
  logLines.push(line);
  console.log(line);
};
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

function electronBinary() {
  const local = path.join(REPO, 'node_modules', 'electron', 'dist', 'electron.exe');
  if (fs.existsSync(local)) return local;
  const which = spawnSync('where', ['electron'], { encoding: 'utf8' });
  const first = which.stdout?.split(/\r?\n/).find(Boolean);
  if (first) return first;
  throw new Error('electron binary not found');
}

/**
 * Trap 2. `match` decides WHICH window; the scheme test is not negotiable, and neither
 * window is identified by "the one without a query string" — the Blanc window is the one
 * WITH it.
 */
async function findTarget(port, deadline, match, label) {
  let seen = [];
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await res.json();
      seen = targets.filter((t) => t.type === 'page').map((t) => t.url);
      const page = targets.find((t) => t.type === 'page'
        && /^(https?|app):\/\//.test(t.url)
        && match(t.url));
      if (page?.webSocketDebuggerUrl) return page;
    } catch { /* not listening yet */ }
    await sleep(400);
  }
  throw new Error(`no CDP target for ${label}; page targets seen: ${JSON.stringify(seen)}`);
}

class Cdp {
  constructor(url) { this.url = url; this.nextId = 1; this.pending = new Map(); }

  async open() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener('message', (event) => {
      let msg;
      try { msg = JSON.parse(String(event.data)); } catch { return; }
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      entry.resolve(msg);
    });
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true });
    });
  }

  send(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve });
      this.socket.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.delete(id)) reject(new Error(`${method} timed out`)); }, 30_000);
    });
  }

  async evaluate(expression) {
    const msg = await this.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true, userGesture: true,
    });
    if (msg.result?.exceptionDetails) {
      throw new Error(msg.result.exceptionDetails.exception?.description ?? 'evaluate threw');
    }
    return msg.result?.result?.value;
  }

  /** A real, trusted key event — `dispatchEvent(new KeyboardEvent(...))` is untrusted and
   *  several handlers in this app ignore it. Lowercase on purpose: that is what an
   *  unshifted press produces, and it passes only while `effectiveKeys` normalizes. */
  async key(key, code) {
    for (const type of ['keyDown', 'char', 'keyUp']) {
      if (type === 'char' && key.length !== 1) continue;
      await this.send('Input.dispatchKeyEvent', {
        type, key, code, text: type === 'char' ? key : undefined,
        windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0),
        nativeVirtualKeyCode: key.toUpperCase().charCodeAt(0),
      });
    }
  }

  close() { try { this.socket?.close(); } catch { /* gone */ } }
}

const results = {
  harness: 'blanc-player-harness.mjs',
  question:
    "Does Blanc's toolbox player actually play a file, in Blanc's own window, bounded by "
    + "Blanc's own frame — and do Blanc's keys and the study overlay's keys collide?",
  startedAt: new Date().toISOString(),
  mediaFile: MEDIA_FILE,
  dataDir: DATA_DIR,
  phases: [],
};
function record(name, ok, detail) {
  results.phases.push({ name, result: ok ? 'PASS' : 'FAIL', detail });
  log(`${ok ? 'PASS' : 'FAIL'} — ${name}: ${detail}`);
  if (!ok) throw new Error(`${name} FAILED: ${detail}`);
}
// There is deliberately no `note()`/INFO helper any more. The 2026-07-31 run recorded six
// of eight phases as INFO and still exited PASS, and the handoff then carried "never
// watched playing a file" for two more slices without anything reading as a failure. Every
// phase here decides. A phase that genuinely cannot be decided must FAIL and say why.

async function waitFor(cdp, expression, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cdp.evaluate(expression)) return true;
    await sleep(400);
  }
  throw new Error(label);
}

let electron = null;
const sockets = [];

const FRAME = '#media-workspace.blanc-study-player';
const VIDEO = `${FRAME} [data-vc-element="video"]`;

async function main() {
  if (!fs.existsSync(MEDIA_FILE)) {
    throw new Error(`media fixture not found: ${MEDIA_FILE} (pass --file= or --datadir=)`);
  }
  results.mediaBytes = fs.statSync(MEDIA_FILE).size;

  const userDataDir = path.join(scratchRoot, 'userdata');
  fs.mkdirSync(userDataDir, { recursive: true });

  const cdpPort = await freePort();
  const env = { ...process.env };
  // Deleted from the CHILD's environment rather than left unset: an inherited value would
  // make a pass mean nothing. The sidecar flag stays deleted so this runs on the shipped
  // default; only the datadir is overridden, and only when one was prepared.
  delete env.SEANIME_EXE;
  delete env.SEANIME_SIDECAR;
  delete env.SEANIME_DATADIR;
  if (DATA_DIR) env.SEANIME_DATADIR = DATA_DIR;

  electron = spawn(
    electronBinary(),
    ['.', `--user-data-dir=${userDataDir}`, `--remote-debugging-port=${cdpPort}`],
    { cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  electron.stdout.resume();
  electron.stderr.resume();

  // ── A: attach to the MAIN window ────────────────────────────────────────────────────
  const mainTarget = await findTarget(
    cdpPort, Date.now() + CDP_TIMEOUT_MS,
    (url) => !url.includes('?') && !url.includes('blanc'), 'the main window',
  );
  const main = new Cdp(mainTarget.webSocketDebuggerUrl);
  await main.open();
  sockets.push(main);
  await waitFor(
    main,
    "typeof window.api?.seanimeStatus === 'function'"
      + " && !!document.querySelector('.desktop-root') && !!document.querySelector('.os-taskbar')",
    MOUNT_TIMEOUT_MS,
    'A FAIL — the desktop shell never mounted',
  );
  const consent = await main.evaluate(
    "(()=>{const b=document.querySelector('.consent-no');if(!b)return false;b.click();return true;})()",
  );
  if (consent) {
    await waitFor(main, "!document.querySelector('.consent')", 15_000,
      'A FAIL — the consent screen did not dismiss');
  }
  record('A attach main window', true,
    `electron pid ${electron.pid}, ${mainTarget.url}, consent declined: ${consent}`);

  // ── B: what the OLD run was actually looking at ─────────────────────────────────────
  // Reproduce its two moves exactly, then measure. This can falsify the premise of this
  // rewrite: if `.blanc-root` really is in the main window, the old reading was right.
  await main.evaluate("(window.dispatchEvent(new CustomEvent('os:open',{detail:'blanc'})),1)");
  await sleep(2500);
  const mainAudit = await main.evaluate(`(() => {
    const loose = [...document.querySelectorAll('[class*=blanc]')];
    return JSON.stringify({
      blancRoot: !!document.querySelector('.blanc-root'),
      blancShell: !!document.querySelector('.blanc-shell'),
      blancStudyPlayer: !!document.querySelector('${FRAME}'),
      looseSelectorMatches: loose.length,
      looseFirst: loose.slice(0, 3).map(n => n.tagName.toLowerCase() + '[' + n.className + ']'),
      oldSelectorSaysPresent: !!document.querySelector('.blanc-root, .blanc-shell, [class*=blanc]'),
    });
  })()`);
  const audit = JSON.parse(mainAudit);
  results.mainWindowAudit = audit;
  record("B os:open 'blanc' does not open Blanc", !audit.blancRoot && !audit.blancShell,
    `${mainAudit} — the old phase C's PASS came from the loose [class*=blanc] arm`);

  // ── C: open Blanc's real window and attach to ITS target ────────────────────────────
  const opened = await main.evaluate(
    `window.api.blancOpen({width:${BLANC_W},height:${BLANC_H}}).then(r=>JSON.stringify(r))`,
  );
  const blancTarget = await findTarget(
    cdpPort, Date.now() + CDP_TIMEOUT_MS, (url) => url.includes('blanc=1'), "Blanc's window",
  );
  const blanc = new Cdp(blancTarget.webSocketDebuggerUrl);
  await blanc.open();
  sockets.push(blanc);
  await waitFor(blanc, "!!document.querySelector('.blanc-root')", MOUNT_TIMEOUT_MS,
    'C FAIL — Blanc never mounted its shell');
  const identity = await blanc.evaluate(`JSON.stringify({
    search: location.search, title: document.title,
    isBlancWindow: new URLSearchParams(location.search).get('blanc') === '1',
  })`);
  const id = JSON.parse(identity);
  record('C attach Blanc window', id.isBlancWindow && id.title === 'Blanc Toolbox',
    `blancOpen -> ${opened}; ${blancTarget.url}; ${identity}`);

  // ── D: the instrument check for phase H ─────────────────────────────────────────────
  // Every geometry claim below is worthless if the window is not at toolbox size.
  const viewport = JSON.parse(await blanc.evaluate(`JSON.stringify({
    innerWidth: window.innerWidth, innerHeight: window.innerHeight,
    outerWidth: window.outerWidth, outerHeight: window.outerHeight,
    dpr: window.devicePixelRatio,
  })`));
  results.viewport = viewport;
  const toolboxSized = viewport.outerWidth === BLANC_W && viewport.outerHeight === BLANC_H;
  record('D toolbox is at its default size', toolboxSized,
    `outer ${viewport.outerWidth}x${viewport.outerHeight} (expected ${BLANC_W}x${BLANC_H}), `
    + `viewport ${viewport.innerWidth}x${viewport.innerHeight}`);

  // ── E: seed the library and open the file the way a user does ───────────────────────
  const added = await blanc.evaluate(
    `window.api.addMediaPaths([${JSON.stringify(MEDIA_FILE)}]).then(items => JSON.stringify(
       items.map(i => ({ id: i.id, title: i.title, fileName: i.fileName }))))`,
  );
  const items = JSON.parse(added);
  results.libraryItems = items;
  if (items.length === 0) throw new Error('E FAIL — addMediaPaths registered nothing');

  const statusBeforePlayer = await blanc.evaluate(
    'window.api.seanimeStatus().then(s => s && s.kind)',
  );
  results.sidecarBeforePlayer = statusBeforePlayer;

  const selectMedia = () => blanc.evaluate(
    "(window.dispatchEvent(new CustomEvent('blanc:select-tab',{detail:'media'})),1)",
  );
  const clickCard = () => blanc.evaluate(`(() => {
    const card = [...document.querySelectorAll('.media-card')]
      .find(c => (c.textContent ?? '').includes(${JSON.stringify(path.basename(MEDIA_FILE))}));
    if (!card) return 0;
    card.click();
    return 1;
  })()`);

  await selectMedia();
  await waitFor(blanc, "!!document.querySelector('.media-card')", 30_000,
    'E FAIL — the seeded item never rendered in Blanc\'s library grid');
  if (!(await clickCard())) throw new Error('E FAIL — no card matched the fixture');
  await waitFor(
    blanc,
    "(()=>{const l=[...document.querySelectorAll('legend')].map(n=>n.textContent);"
    + "return l.includes('Player');})()",
    30_000, 'E FAIL — the Player fieldset never appeared',
  );
  record('E open the file in Blanc', true,
    `${items.length} item(s) seeded; the Player fieldset mounted; sidecar was `
    + `'${statusBeforePlayer}' before it`);

  // ── F: the sidecar Blanc's player asks for ──────────────────────────────────────────
  const ready = await (async () => {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    let last = null;
    while (Date.now() < deadline) {
      last = await blanc.evaluate('window.api.seanimeStatus()');
      if (last?.kind === 'ready') return last;
      await sleep(500);
    }
    const rows = await blanc.evaluate(
      "JSON.stringify([...document.querySelectorAll('.blanc-status-row')].map(n=>n.innerText))",
    );
    throw new Error(`F FAIL — sidecar never ready (last ${JSON.stringify(last)}, rows ${rows})`);
  })();
  results.sidecar = { pid: ready.pid, port: ready.port, version: ready.version };
  record('F sidecar ready for Blanc', true,
    `pid ${ready.pid}, port ${ready.port}, version ${ready.version}`);

  // ── G: THE OPEN ITEM — a file actually playing, in Blanc's window ───────────────────
  // Retried with the count recorded. Opening a local file is a POST plus two websocket
  // messages and directstream preparation is intermittent (`StudyPlayerSlice.tsx` says so
  // in a comment). A silent retry would hide a regression behind that flakiness; three
  // consecutive stalls is a real failure. The retry is a REMOUNT — leaving the tab drops
  // `current`, so coming back and clicking again issues a genuinely new request.
  //
  // **The retry must NOT be a remount, and this is the whole finding of 2026-08-01.** A
  // tab-switch retry was tried first and failed three times for three runs across three
  // independently prepared datadirs (proof/blanc-player-live-20260801023530,
  // -20260801054500, and probe -20260801055000 step 1). The sidecar log says why, every
  // time:
  //
  //   ws > Client connected     id=c79…      <- socket 1
  //   ws > Client connected     id=c79…      <- socket 2, SAME client id
  //   ws > Client disconnection id=c79…      <- socket 1 goes away
  //   ws > Sending "{open-and-await Loading stream...}" to=c79…
  //   directstream > Skipping open step for cancelled preparation clientId=c79…
  //   POST /api/v1/directstream/play/localfile 200      <- 200, having done nothing
  //
  // **The paragraph that used to be here named the wrong cause — corrected 2026-08-01,
  // slice 24.** It said the sidecar cancels the preparation when the released socket's
  // disconnect arrives. It does not: `internal/handlers/websocket.go` calls `RemoveConn(id)`
  // on a read error and nothing else, and there is no other disconnect path to
  // `cancelPreparationLocked`. The disconnect above is a co-symptom of the same double-mount,
  // not the cause. The cancel is a **`video-terminated` frame the CLIENT sends 190 ms later**,
  // from the adopted lifecycle effect's `if (!state.playbackInfo)` branch — measured frame by
  // frame in proof/blanc-open-retry-20260801072500/. Order in a log is not causation.
  //
  // `React.StrictMode` (blancMain.tsx, as in main.tsx) double-invokes effects ON MOUNT, which
  // is what runs that branch spuriously; Blanc mounts the surface and issues the open in the
  // same commit, so it lost the race every time. The main window escapes it because the open
  // arrives there as an event at a session whose adopted lifecycle settled long ago.
  //
  // **The product recovers from this by itself now** (`shared/directstreamOpenRecovery.ts`:
  // 8 s of silence on the native-player channel -> one re-open -> a real error), so
  // `openAttempts === 1` is a GATE below rather than a number to report. The loop is kept as
  // a safety net so a regression is diagnosable rather than a bare timeout, and the retry it
  // performs is still the right one: NOT a remount — that reproduces the double-mount — but a
  // change of REQUEST. `hashRequestId` derives the id from `(item.id, item.positionSec)`, so
  // writing a resume position through the app's own `media:setPosition` and re-clicking
  // yields a new requestId on the session that is already mounted.
  const itemId = items[0]?.id;
  let attempts = 0;
  let loaded = false;
  for (attempts = 1; attempts <= 3 && !loaded; attempts += 1) {
    try {
      await waitFor(blanc, `!!document.querySelector('${FRAME}')`, 45_000, 'no frame');
      await waitFor(
        blanc,
        `(()=>{const v=document.querySelector('${VIDEO}');return !!v && v.readyState >= 2;})()`,
        attempts === 1 ? 45_000 : 60_000, 'stalled',
      );
      loaded = true;
    } catch {
      const where = await blanc.evaluate(
        "JSON.stringify([...document.querySelectorAll('.blanc-status-row')].map(n=>n.innerText)"
        + ".concat((document.querySelector('.study-player-slice')?.innerText ?? '').slice(0,80)))",
      );
      log(`  G: attempt ${attempts}/3 stalled at ${where}`);
      if (attempts < 3) {
        // Ten seconds of quiet is what lets the double-mount's second socket become the
        // only socket before the next request rides it.
        await sleep(SETTLE_MS);
        await blanc.evaluate(
          `window.api.setMediaPosition(${JSON.stringify(itemId)}, ${attempts * 3})`
          + '.then(()=>1).catch(()=>0)',
        );
        await clickCard();
        await sleep(1500);
      }
    }
  }
  results.openAttempts = loaded ? attempts - 1 : null;
  if (!loaded) {
    const diag = await blanc.evaluate(`(() => {
      const v = document.querySelector('${VIDEO}') || document.querySelector('[data-vc-element="video"]');
      const slice = document.querySelector('.study-player-slice');
      return JSON.stringify({
        frame: !!document.querySelector('${FRAME}'), videoPresent: !!v,
        src: v ? (v.currentSrc || v.src || null) : null,
        readyState: v?.readyState ?? null, networkState: v?.networkState ?? null,
        errorMessage: v?.error?.message ?? null,
        sliceState: slice?.getAttribute('data-study-player') ?? null,
        rows: [...document.querySelectorAll('.blanc-status-row')].map(n => n.innerText),
      });
    })()`);
    record('G a file plays in Blanc', false, diag);
  }

  const t0 = await blanc.evaluate(`document.querySelector('${VIDEO}').currentTime`);
  await blanc.evaluate(`(document.querySelector('${VIDEO}').play?.(),1)`).catch(() => undefined);
  await sleep(4000);
  const shot = JSON.parse(await blanc.evaluate(`(() => {
    const v = document.querySelector('${VIDEO}');
    return JSON.stringify({
      currentTime: v.currentTime, duration: v.duration, readyState: v.readyState,
      paused: v.paused, videoWidth: v.videoWidth, videoHeight: v.videoHeight,
      textTracks: v.textTracks?.length ?? 0,
      inBlancFrame: !!v.closest('${FRAME}'),
      windowIsBlanc: new URLSearchParams(location.search).get('blanc') === '1',
    });
  })()`));
  results.playback = { startedAt: t0, ...shot, openAttempts: results.openAttempts };
  // `openAttempts === 1` is a GATE as of slice 24, not just a recorded number. The retry
  // below stays as a safety net so a regression is diagnosable rather than a bare timeout,
  // but needing it is now a failure: the product recovers from a silently-cancelled
  // preparation by itself (`shared/directstreamOpenRecovery.ts`), and the whole point of
  // that work was to stop the harness compensating for the app.
  const playing = shot.currentTime > t0 && shot.videoWidth > 0
    && shot.inBlancFrame && shot.windowIsBlanc && results.openAttempts === 1;
  record('G a file plays in Blanc', playing,
    `${t0.toFixed(3)} -> ${shot.currentTime.toFixed(3)}s, ${shot.videoWidth}x${shot.videoHeight}, `
    + `duration ${Number(shot.duration).toFixed(3)}, inside the Blanc frame: ${shot.inBlancFrame}, `
    + `open attempts ${results.openAttempts}`);

  // ── H: question 1, geometry, with the video really on screen ────────────────────────
  const geometry = JSON.parse(await blanc.evaluate(`(() => {
    const frame = document.querySelector('${FRAME}');
    const video = document.querySelector('${VIDEO}');
    const dockAnchor = document.querySelector('[data-study-action="toggle-study-controls"]');
    const dock = dockAnchor ? dockAnchor.closest('div') : null;
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height),
        right: Math.round(r.right), bottom: Math.round(r.bottom),
      };
    };
    const cs = getComputedStyle(frame);
    return JSON.stringify({
      viewport: { w: window.innerWidth, h: window.innerHeight },
      frame: box(frame), video: box(video), dock: box(dock),
      maxHeight: cs.maxHeight, overflowY: cs.overflowY, contain: cs.contain,
      position: cs.position,
      scrollHeight: frame.scrollHeight, clientHeight: frame.clientHeight,
      framesOwnScroll: frame.scrollHeight > frame.clientHeight,
      docScrollsHorizontally: document.documentElement.scrollWidth > window.innerWidth,
    });
  })()`));
  results.geometry = geometry;
  const g = geometry;
  // **A bounds check alone cannot tell "bounded" from "collapsed", and on 2026-08-01 it
  // did not.** This phase PASSED against `frame 392x0, scrollHeight 0, clientHeight 0`
  // (proof/blanc-player-live-20260801060000) because a ZERO-HEIGHT box satisfies
  // `right <= viewport.w` and `h <= 45vh` trivially — while the video, decoding at
  // 1920x1080 with the clock advancing, painted nothing at all. The non-degeneracy test
  // below has to come first, and it is the assertion that actually answers slice 15.
  const nonDegenerate = g.frame.w > 0 && g.frame.h > 0 && g.video.w > 0 && g.video.h > 0;
  const frameInside = g.frame.right <= g.viewport.w + 1 && g.frame.w <= g.viewport.w
    && g.frame.h <= g.viewport.h + 1;
  const videoInFrame = g.video.right <= g.frame.right + 1
    && g.video.h <= Math.round(g.viewport.h * 0.45) + 1
    && g.video.y >= g.frame.y - 1
    && g.video.bottom <= g.frame.bottom + 1;
  const dockInFrame = !g.dock
    || (g.dock.right <= g.frame.right + 1 && g.dock.bottom <= g.frame.bottom + 1);
  record('H the toolbox frame bounds the adopted surface',
    nonDegenerate && frameInside && videoInFrame && dockInFrame && !g.docScrollsHorizontally,
    `non-degenerate: ${nonDegenerate}; `
    + `viewport ${g.viewport.w}x${g.viewport.h}; frame ${g.frame.w}x${g.frame.h} `
    + `(max-height ${g.maxHeight}, overflow-y ${g.overflowY}, contain "${g.contain}"); `
    + `video ${g.video.w}x${g.video.h}; dock ${g.dock ? `${g.dock.w}x${g.dock.h}` : 'not mounted'}; `
    + `frame owns its scroll: ${g.framesOwnScroll}; page scrolls sideways: `
    + `${g.docScrollsHorizontally}`);

  // ── I: question 2, the keymap, live ────────────────────────────────────────────────
  // The overlay's cue commands need cues, so the subtitle track is selected first — the
  // advanced section is COLLAPSED by default (2026-07-30 UI pass), so a run that skips the
  // expand finds no select and reads it as "there are no subtitle tracks".
  await blanc.evaluate(
    "(document.querySelector('[data-study-action=\"toggle-study-controls\"]')?.click(),1)",
  );
  let cueState = null;
  try {
    await waitFor(blanc, "!!document.querySelector('.study-control-row select')", 20_000,
      'no track selector');
    // **DO NOT touch the selector.** This fixture flags a `(default)` track that is already
    // selected on load, and switching one MID-PLAYBACK makes directstream start a new
    // subtitle stream: retirement-step3 recorded cue delivery stopping outright after cue 0
    // when it tried, with `next-cue` returning cue 0 from a playhead of 12 s. Read it only.
    cueState = await blanc.evaluate(`(() => {
      const label = [...document.querySelectorAll('.study-control-row label')]
        .find(l => (l.textContent ?? '').includes('Subtitle track'));
      const sel = label?.querySelector('select') ?? document.querySelector('.study-control-row select');
      if (!sel) return JSON.stringify({ error: 'no select' });
      const opt = sel.selectedOptions[0];
      return JSON.stringify({
        options: [...sel.options].map(o => ({ value: o.value, label: o.textContent })),
        selected: { value: sel.value, label: opt ? opt.textContent : null },
      });
    })()`);
  } catch (err) {
    cueState = JSON.stringify({ error: String(err.message ?? err) });
  }
  results.subtitleTracks = cueState;

  // **Cues stream in progressively.** Pressing a cue key straight after the open concludes
  // "replay does nothing" because `allCues` holds only cue 0 — there is nothing to address
  // yet. Play the timeline in first, then park inside cue 1. Ground truth from the fixture,
  // per track: the two tracks are offset by 0.15 s, so asserting the wrong set fails by
  // exactly that and reads like seek drift.
  const track = JSON.parse(cueState ?? '{}');
  const isJa = /jpn|japanese/i.test(track?.selected?.label ?? '');
  const CUES = isJa
    ? [2.15, 6.65, 11.15, 16.15, 21.15, 24.15]
    : [2.00, 6.50, 11.00, 16.00, 21.00, 24.00];
  const PARK = 7.3;                       // inside cue 1
  const near = (a, b) => a != null && Math.abs(a - b) < 0.25;
  await blanc.evaluate(`(() => { const v = document.querySelector('${VIDEO}');
    v.currentTime = 0; v.play?.(); return 1; })()`);
  try {
    await waitFor(blanc, `(document.querySelector('${VIDEO}')?.currentTime ?? 0) > 22`,
      120_000, 'the timeline never played in far enough to deliver the cues');
  } catch (err) { log(`  I: ${err.message}`); }

  // Instrument: capture-phase `seeked`, the same one slice 22 used. A polled `currentTime`
  // reads the cue start PLUS whatever played since, and an earlier session concluded a
  // working control was broken on exactly that.
  await blanc.evaluate(`(() => {
    const v = document.querySelector('${VIDEO}');
    window.__seeks = [];
    v.addEventListener('seeked', () => window.__seeks.push(v.currentTime), true);
    window.__keyProbe = { document: 0, window: 0 };
    for (const target of [document, window]) {
      const original = target.addEventListener.bind(target);
      const label = target === document ? 'document' : 'window';
      target.addEventListener = function (type, ...rest) {
        if (type === 'keydown') window.__keyProbe[label] += 1;
        return original(type, ...rest);
      };
    }
    return 1;
  })()`);

  const pauseVideo = () => blanc.evaluate(`(document.querySelector('${VIDEO}').pause(),1)`);
  const nowAt = () => blanc.evaluate(`document.querySelector('${VIDEO}')?.currentTime ?? null`);
  /** Which toolbox tab is up — the collision half of the question. */
  const tabNow = () => blanc.evaluate(
    "document.querySelector('.blanc-nav-btn.active')?.textContent?.trim() ?? null",
  );

  const pressKey = async (key, code) => {
    await blanc.evaluate('(window.__seeks = [], 1)');
    // `isTypingTarget()` suppresses unmodified chords by design, so a stray focused input
    // would read as "the shortcut does nothing". Blur and RECORD what it was.
    const focus = await blanc.evaluate(`(() => {
      const el = document.activeElement;
      if (el && el !== document.body) el.blur?.();
      return document.activeElement?.tagName ?? 'NONE';
    })()`);
    const tabBefore = await tabNow();
    const before = await nowAt();
    await blanc.key(key, code);
    let seekedTo = null;
    for (let i = 0; i < 12 && seekedTo == null; i += 1) {
      const seeks = await blanc.evaluate('window.__seeks ?? []');
      if (seeks.length) seekedTo = seeks[seeks.length - 1];
      else await sleep(250);
    }
    await sleep(600);
    return { key, focus, before, seekedTo, after: await nowAt(), tabBefore, tabAfter: await tabNow() };
  };

  await pauseVideo();
  await blanc.evaluate(`(() => { const v = document.querySelector('${VIDEO}');
    v.pause(); v.currentTime = ${PARK}; return 1; })()`);
  await sleep(1200);

  // **The precondition, made explicit.** `video.replayLine` replays the ACTIVE line, so
  // with no active cue "R did nothing" is correct behaviour and says nothing about the
  // keymap. The overlay publishes the active cue on `.study-cue-overlay`
  // (`data-cue-index` / `-start-ms`), so the precondition is readable rather than assumed.
  //
  // It is not assumed because it is not reliable: a seek makes directstream start a NEW
  // subtitle stream from that position, and each stream here delivers ONE event before the
  // parser goroutine finishes. Whether cue 1 is known at the park is therefore a race, and
  // a run that lost it read as "R -> null, S -> the wrong cue" — i.e. as a broken keymap.
  // Both sidecar logs say the same thing about delivery (`blanc-final-datadir-h` from the
  // slice-23 PASS and `blanc-fix-datadir-a` from the run that failed here), so the
  // difference between those runs is timing, not behaviour.
  const cueAtPark = async () => JSON.parse(await blanc.evaluate(`(() => {
    const o = document.querySelector('.study-cue-overlay');
    return JSON.stringify({
      index: o?.getAttribute('data-cue-index') ?? null,
      startMs: o?.getAttribute('data-cue-start-ms') ?? null,
      endMs: o?.getAttribute('data-cue-end-ms') ?? null,
    });
  })()`));
  // **The nudge loop that used to live here WAS THE BUG — fixed 2026-08-01, slice 32.**
  //
  // It re-seeked +/-0.05 s up to 20 times "to re-trigger delivery", and phase I still failed
  // in roughly 40% of runs. It was not unlucky; it was self-defeating, and the sidecar's
  // source says so exactly:
  //
  //   `SeekedEvent` -> `startSubtitleStreamForTime` (stream.go:553)
  //     -> `beginSubtitleSeek` (subtitles.go:316) — STOPS every active subtitle stream
  //     -> restart at `subtitleOffsetForTime(...)` (subtitles.go:206)
  //
  // and that offset applies a **10 second preroll** before snapping to an MKV cue position:
  // `max(currentTime - 10, 0)`. At a 7.3 s park that is **0** — the start of the file — and
  // +/-0.05 s cannot change it. So every nudge stopped the in-flight parser and restarted it
  // from byte 0, where it delivers cue 0 again. Twenty nudges, twenty restarts, cue 1 never
  // reached. The loop re-created the state it was written to escape.
  //
  // `retirement-step3-harness.mjs` parks at the same 7.3 s, seeks ONCE, waits quietly, and
  // its equivalent phase passes 7 of 7. So: wait, do not nudge. The parser needs to be left
  // alone, which is the one thing the old loop never did.
  let parked = await cueAtPark();
  for (let i = 0; i < 20 && parked.startMs == null; i += 1) {
    await sleep(500);
    parked = await cueAtPark();
  }
  results.parkedCue = parked;
  log(`  I: active cue at the ${PARK}s park: ${JSON.stringify(parked)}`);

  const keyReplay = await pressKey('r', 'KeyR');   // video.replayLine: cue 1 -> cue 1 start
  await pauseVideo();
  const keyPrev = await pressKey('w', 'KeyW');     // video.prevLine:   cue 1 -> cue 0
  await pauseVideo();
  const keyNext = await pressKey('s', 'KeyS');     // video.nextLine:   cue 0 -> cue 1
  await pauseVideo();
  // The control, and it is what makes the other three mean anything: without it they prove
  // only that SOMETHING seeks while keys are pressed. `x` is free in BOTH keymaps — this
  // app's catalog and the adopted player's own `vc_defaultKeybindings`. Slice 22's first
  // run used `q`, which the vendor binds, and it seeked to 0. Blanc's blocks game also
  // swallows w/x/z, but it is not mounted on the Media tab — which phase I also checks, by
  // recording the active tab across every press.
  const keyUnbound = await pressKey('x', 'KeyX');

  const keyProbe = await blanc.evaluate('JSON.stringify(window.__keyProbe)');
  const replayOk = near(keyReplay.seekedTo, CUES[1]);
  const prevOk = near(keyPrev.seekedTo, CUES[0]);
  const nextOk = near(keyNext.seekedTo, CUES[1]);
  const controlOk = keyUnbound.seekedTo == null;
  const noTabHijack = [keyReplay, keyPrev, keyNext, keyUnbound]
    .every((k) => k.tabBefore === k.tabAfter);
  results.keymap = {
    cueStartsFromFile: CUES, parkedAt: PARK, subtitleTracks: cueState,
    presses: { r: keyReplay, w: keyPrev, s: keyNext, x: keyUnbound },
    checks: { replayOk, prevOk, nextOk, controlOk, noTabHijack },
    keydownListenersRegisteredAfterInstrumenting: keyProbe,
    measuredBy: 'capture-phase `seeked` events, not polled currentTime — the cue controls '
      + 'resume playback, so a polled reading returns the cue start plus whatever played since.',
  };
  // The precondition is reported separately from the verdict, and it comes FIRST, because
  // "no line was active" and "the key did not reach the overlay" are different findings and
  // only one of them is about the keymap.
  const hadALine = parked.startMs != null && near(Number(parked.startMs) / 1000, CUES[1]);
  record('I video.* keys reach the overlay in Blanc, and Blanc does not eat them',
    hadALine && replayOk && prevOk && nextOk && controlOk && noTabHijack,
    (hadALine
      ? `active cue at the park: ${parked.startMs}ms; `
      : `NO CUE WAS ACTIVE AT THE ${PARK}s PARK (${JSON.stringify(parked)}) — the overlay `
        + 'never received cue 1, so R having nothing to replay is correct behaviour and this '
        + 'run says nothing about the keymap; ')
    + `R -> ${keyReplay.seekedTo} (cue1 ${CUES[1]}), W -> ${keyPrev.seekedTo} (cue0 ${CUES[0]}), `
    + `S -> ${keyNext.seekedTo} (cue1 ${CUES[1]}), control x -> ${keyUnbound.seekedTo}; `
    + `toolbox tab unchanged: ${noTabHijack}; keydown listeners since instrumenting ${keyProbe}`);

  // ── J: the legacy player is absent from BOTH windows ────────────────────────────────
  const legacySel = "'.media-video, .media-shadowing-error, .media-player-stage'";
  const legacyBlanc = await blanc.evaluate(`document.querySelectorAll(${legacySel}).length`);
  const legacyMain = await main.evaluate(`document.querySelectorAll(${legacySel}).length`);
  record('J legacy player absent in both windows', legacyBlanc === 0 && legacyMain === 0,
    `Blanc ${legacyBlanc}, main ${legacyMain}`);
}

main()
  .then(() => { results.result = 'PASS'; })
  .catch((err) => { results.result = 'FAIL'; results.error = String(err?.message ?? err); })
  .finally(async () => {
    results.finishedAt = new Date().toISOString();
    results.log = logLines;
    fs.writeFileSync(
      path.join(workRoot, 'blanc-player-live.json'),
      `${JSON.stringify(results, null, 2)}\n`,
    );
    for (const socket of sockets) socket.close();
    if (electron && !electron.killed) electron.kill();
    await sleep(500);
    console.log(`\nrecord: ${path.join(workRoot, 'blanc-player-live.json')}`);
    process.exit(results.result === 'PASS' ? 0 : 1);
  });
