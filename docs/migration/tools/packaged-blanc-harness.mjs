/**
 * Does Blanc's toolbox player work in a PACKAGED build — and does slice 24's recovery stay
 * out of the way there?
 *
 * ## The question, and why it is not the same as the dev one
 *
 * Slice 24 fixed Blanc's first open by recovering from a silently-cancelled directstream
 * preparation. Slice 25 showed with StrictMode removed that the cancel's dev trigger
 * disappears — one socket, no `video-terminated`, one POST, recovery inert. But "StrictMode
 * off in a dev build" is a model of production, not production: it says nothing about the
 * `app://` protocol, asar paths, or the packaged sidecar slot. This harness is the real
 * thing.
 *
 * So the assertions are the OPPOSITE shape to the dev harness's. There, phase G gates on
 * `openAttempts === 1` because the recovery has to work. Here the gates are that the
 * recovery is never NEEDED:
 *
 *   - exactly ONE `POST /api/v1/directstream/play/localfile` for the open
 *   - ZERO `video-terminated` frames before the `watch` that ends it
 *   - ONE websocket, never closed and reopened
 *
 * A packaged build that quietly relied on the recovery would pass a "does it play" check and
 * fail every one of these.
 *
 * ## Two things inherited rather than re-derived
 *
 * `packaged-sidecar-launch-harness.mjs` established both and neither is re-argued here:
 *
 *   - **The sidecar discriminator.** `resolveSeanimeExe` tries `SEANIME_EXE`, then the
 *     packaged slot, then the pinned sibling checkout — and that sibling EXISTS on this
 *     machine and is byte-identical. "The sidecar reached ready" therefore proves nothing on
 *     its own. `SEANIME_EXE` is deleted from the child environment, and the running
 *     `seanime.exe`'s own `ExecutablePath` is required to be inside the package.
 *   - **A scratch `--user-data-dir`.** It keeps `%APPDATA%/jp-study-app` untouched and it is
 *     what side-steps `requestSingleInstanceLock()`, without which a second copy just quits.
 *
 * And from `blanc-player-harness.mjs`: **a packaged build serves `app://bundle/index.html`,
 * never `file://` or http**, and Blanc is the one window whose URL carries a query string
 * (`blanc.html?blanc=1`), so a target filter of "no query string" excludes exactly the window
 * under test — the mistake that made slice 23's first attempt measure the main window's DOM.
 *
 * usage:
 *   node docs/migration/tools/prepare-gplay-datadir.mjs <cue-probe-dual.mkv> <empty-dir>
 *   node docs/migration/tools/packaged-blanc-harness.mjs --datadir=<that dir>
 *     [--app=out/jp-study-app-win32-x64/jp-study-app.exe]
 *
 * A prepared datadir is single-use for playback. No dev server is needed — that is the point.
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

const APP_EXE = path.resolve(REPO, flag('app', path.join('out', 'jp-study-app-win32-x64', 'jp-study-app.exe')));
const PACKAGE_ROOT = path.dirname(APP_EXE);
const EXPECTED_SIDECAR = path.join(PACKAGE_ROOT, 'resources', 'seanime', 'seanime.exe');
const DATA_DIR = flag('datadir', '') ? path.resolve(flag('datadir', '')) : null;
const MEDIA_FILE = path.resolve(flag('file', DATA_DIR
  ? path.join(DATA_DIR, 'cue-library', 'Sousou no Frieren - 01.mkv')
  : path.join(os.tmpdir(), 'cue-probe-dual.mkv')));

const BLANC_W = 560;
const BLANC_H = 460;
const READY_TIMEOUT_MS = 180_000;

const stamp = process.env.RUN_STAMP
  ?? new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '');
const workRoot = path.join(REPO, 'docs/migration/proof', `packaged-blanc-${stamp}`);
fs.mkdirSync(workRoot, { recursive: true });
/** NEVER inside the repo — a Chromium profile there kills any Vite watcher on this tree. */
const scratchRoot = path.join(os.tmpdir(), `jp-packaged-blanc-${stamp}`);
fs.mkdirSync(scratchRoot, { recursive: true });

const logLines = [];
const log = (m) => { const l = `[packaged-blanc] ${m}`; logLines.push(l); console.log(l); };
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

/** The on-disk path a running pid was launched from — the sidecar discriminator. */
function executablePathOf(pid) {
  const out = spawnSync('powershell', ['-NoProfile', '-Command',
    `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").ExecutablePath`],
  { encoding: 'utf8' });
  return (out.stdout ?? '').trim() || null;
}

async function findTarget(port, deadline, match, label) {
  let seen = [];
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await res.json();
      seen = targets.filter((t) => t.type === 'page').map((t) => t.url);
      // The scheme test matters twice over here: it rejects the `about:blank` Electron
      // exposes before navigation AND names the packaged protocol, which is `app://`.
      const page = targets.find((t) => t.type === 'page'
        && /^(https?|app):\/\//.test(t.url) && match(t.url));
      if (page?.webSocketDebuggerUrl) return page;
    } catch { /* not up yet */ }
    await sleep(400);
  }
  throw new Error(`no CDP target for ${label}; saw ${JSON.stringify(seen)}`);
}

const TRACED = new Set([
  'Network.webSocketCreated', 'Network.webSocketClosed',
  'Network.webSocketFrameSent', 'Network.webSocketFrameReceived',
  'Network.requestWillBeSent', 'Network.responseReceived',
  'Network.loadingFailed',
  // A packaged build serves everything over `app://`, and the media surface is behind a
  // `React.lazy`. A dynamic import that fails under a custom protocol throws where nothing
  // in the DOM records it: the Suspense fallback simply never resolves, no request is made,
  // and every DOM-shaped question answers "nothing there" — which is what the first run of
  // this harness saw. Exceptions are the only witness to that failure mode.
  'Runtime.exceptionThrown',
  // A CSP violation is not an exception and not a failed load: the request never reaches
  // the network stack, so `Network.*` says nothing, and `fetch` rejects with a plain
  // TypeError that application code catches. The browser's only report is a Log entry with
  // source `security`. Without this domain the failure is invisible in every other channel
  // — which is exactly how the first two runs of this harness looked.
  'Log.entryAdded',
]);

class Cdp {
  constructor(url) { this.url = url; this.nextId = 1; this.pending = new Map(); this.trace = []; this.recording = false; }
  async open() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener('message', (event) => {
      let msg; try { msg = JSON.parse(String(event.data)); } catch { return; }
      if (msg.id == null) {
        if (this.recording && TRACED.has(msg.method) && this.trace.length < 4000) {
          this.trace.push({ at: Date.now(), method: msg.method, params: msg.params });
        }
        return;
      }
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      entry.resolve(msg);
    });
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true });
    });
    return this;
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
  close() { try { this.socket?.close(); } catch { /* gone */ } }
}

async function waitFor(cdp, expression, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cdp.evaluate(expression)) return true;
    await sleep(400);
  }
  throw new Error(label);
}

const FRAME = '#media-workspace.blanc-study-player';
const VIDEO = `${FRAME} [data-vc-element="video"]`;

const results = {
  harness: 'packaged-blanc-harness.mjs',
  question: 'Does Blanc\'s player work in a PACKAGED build, and does slice 24\'s recovery stay '
    + 'unused there? The recovery being NEEDED is a failure here, not a success.',
  startedAt: new Date().toISOString(),
  app: APP_EXE,
  mediaFile: MEDIA_FILE,
  dataDir: DATA_DIR,
  phases: [],
};
const record = (name, ok, detail) => {
  results.phases.push({ name, result: ok ? 'PASS' : 'FAIL', detail });
  log(`${ok ? 'PASS' : 'FAIL'} — ${name}: ${detail}`);
};

let app = null;

async function main() {
  if (!fs.existsSync(APP_EXE)) throw new Error(`packaged app not found: ${APP_EXE}`);
  if (!fs.existsSync(MEDIA_FILE)) throw new Error(`fixture not found: ${MEDIA_FILE}`);
  if (!fs.existsSync(EXPECTED_SIDECAR)) {
    throw new Error(`package has no sidecar at ${EXPECTED_SIDECAR}`);
  }

  const userDataDir = path.join(scratchRoot, 'userdata');
  fs.mkdirSync(userDataDir, { recursive: true });
  const cdpPort = await freePort();

  const env = { ...process.env };
  // Deleted, not merely unset: a developer shell may export it, and it is the first thing
  // `resolveSeanimeExe` tries. Without this the run cannot tell the packaged sidecar from
  // the pinned sibling checkout, which exists here and is byte-identical.
  delete env.SEANIME_EXE;
  delete env.SEANIME_SIDECAR;
  delete env.SEANIME_DATADIR;
  if (DATA_DIR) env.SEANIME_DATADIR = DATA_DIR;

  app = spawn(APP_EXE, [`--user-data-dir=${userDataDir}`, `--remote-debugging-port=${cdpPort}`],
    { cwd: PACKAGE_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  app.stdout.resume();
  app.stderr.resume();

  // ── A: the packaged main window ────────────────────────────────────────────────────
  const mainTarget = await findTarget(cdpPort, Date.now() + 180_000,
    (url) => !url.includes('?') && !url.includes('blanc'), 'the packaged main window');
  const main = await new Cdp(mainTarget.webSocketDebuggerUrl).open();
  await waitFor(main, "typeof window.api?.seanimeStatus === 'function'"
    + " && !!document.querySelector('.desktop-root')", 180_000, 'the desktop never mounted');
  const declined = await main.evaluate(
    "(()=>{const b=document.querySelector('.consent-no');if(b){b.click();return 1;}return 0;})()",
  );
  results.mainUrl = mainTarget.url;
  record('A the packaged app boots and the desktop mounts', mainTarget.url.startsWith('app://'),
    `pid ${app.pid}, ${mainTarget.url}, consent declined: ${declined === 1}`);

  // ── B: the sidecar, and that it is the PACKAGED one ────────────────────────────────
  await main.evaluate('window.api.seanimeStart().then(()=>1).catch(()=>0)');
  let ready = null;
  for (const deadline = Date.now() + READY_TIMEOUT_MS; Date.now() < deadline && !ready;) {
    const s = await main.evaluate('window.api.seanimeStatus()');
    if (s?.kind === 'ready') ready = s; else await sleep(500);
  }
  if (!ready) throw new Error('the packaged sidecar never reached ready');
  const exePath = executablePathOf(ready.pid);
  const fromPackage = !!exePath
    && path.normalize(exePath).toLowerCase() === path.normalize(EXPECTED_SIDECAR).toLowerCase();
  results.sidecar = { pid: ready.pid, port: ready.port, version: ready.version, exePath, fromPackage };
  record('B the sidecar is the one inside the package', fromPackage,
    `pid ${ready.pid}, port ${ready.port}, v${ready.version}, exe ${exePath}`);

  // ── C: Blanc's own window ──────────────────────────────────────────────────────────
  await main.evaluate(`window.api.blancOpen({width:${BLANC_W},height:${BLANC_H}})`);
  const blancTarget = await findTarget(cdpPort, Date.now() + 120_000,
    (url) => url.includes('blanc=1'), "Blanc's window");
  const blanc = await new Cdp(blancTarget.webSocketDebuggerUrl).open();
  await waitFor(blanc, "!!document.querySelector('.blanc-root')", 120_000, 'Blanc never mounted');
  const id = JSON.parse(await blanc.evaluate(
    'JSON.stringify({ search: location.search, title: document.title, proto: location.protocol })',
  ));
  results.blancUrl = blancTarget.url;
  record('C Blanc opens as its own packaged window',
    id.search === '?blanc=1' && id.proto === 'app:',
    `${blancTarget.url}; ${JSON.stringify(id)}`);

  // ── D: open the file — first try, no retry anywhere ────────────────────────────────
  const seeded = JSON.parse(await blanc.evaluate(
    `window.api.addMediaPaths([${JSON.stringify(MEDIA_FILE)}]).then(items => JSON.stringify(
       items.map(i => ({ id: i.id, fileName: i.fileName }))))`,
  ));
  results.libraryItems = seeded;
  await blanc.evaluate("(window.dispatchEvent(new CustomEvent('blanc:select-tab',{detail:'media'})),1)");
  await waitFor(blanc, "!!document.querySelector('.media-card')", 60_000, 'no library card');

  await blanc.send('Network.enable', { maxPostDataSize: 4096 });
  await blanc.send('Runtime.enable', {});
  await blanc.send('Log.enable', {});
  blanc.recording = true;
  const t0 = Date.now();
  const clicked = await blanc.evaluate(`(() => {
    const card = [...document.querySelectorAll('.media-card')]
      .find(c => (c.textContent ?? '').includes(${JSON.stringify(path.basename(MEDIA_FILE))}));
    if (!card) return 0;
    card.click();
    return 1;
  })()`);
  if (!clicked) throw new Error('no card matched the fixture');

  let played = false;
  try {
    await waitFor(blanc, `!!document.querySelector('${FRAME}')`, 60_000, 'the frame never mounted');
    await waitFor(blanc, `(()=>{const v=document.querySelector('${VIDEO}');`
      + 'return !!v && v.readyState >= 2;})()', 90_000, 'the video never loaded');
    played = true;
  } catch (err) {
    log(`  D: ${err.message}`);
    // What the window actually shows, and what threw. Recorded on the failure path only.
    results.failureDiagnosis = {
      dom: JSON.parse(await blanc.evaluate(`(() => JSON.stringify({
        statusRows: [...document.querySelectorAll('.blanc-status-row')].map(n => n.innerText),
        legends: [...document.querySelectorAll('legend')].map(n => n.textContent),
        anyMediaWorkspace: document.querySelectorAll('#media-workspace').length,
        blancFrame: document.querySelectorAll('${FRAME}').length,
        studyPlayerSlice: document.querySelector('.study-player-slice')
          ?.getAttribute('data-study-player') ?? null,
        mediaPanelText: (document.querySelector('.blanc-media-panels')?.innerText
          ?? document.body.innerText).slice(0, 400),
      }))()`)),
      exceptions: blanc.trace
        .filter((e) => e.method === 'Runtime.exceptionThrown')
        .map((e) => ({
          text: e.params?.exceptionDetails?.text,
          description: e.params?.exceptionDetails?.exception?.description?.slice(0, 400),
          url: e.params?.exceptionDetails?.url,
        })),
      failedLoads: blanc.trace
        .filter((e) => e.method === 'Network.loadingFailed')
        .map((e) => ({ error: e.params?.errorText, type: e.params?.type })),
      // The browser's only report of a CSP block: a Log entry with source `security`. It is
      // the one channel that names both the blocked URI and the directive that blocked it,
      // so it is what turns "no request was made" into a cause rather than an inference.
      cspViolations: blanc.trace
        .filter((e) => e.method === 'Log.entryAdded' && e.params?.entry?.source === 'security')
        .map((e) => ({ text: e.params.entry.text, url: e.params.entry.url })),
    };
    log(`  D: csp ${JSON.stringify(results.failureDiagnosis.cspViolations).slice(0, 600)}`);
    log(`  D: exceptions ${JSON.stringify(results.failureDiagnosis.exceptions).slice(0, 500)}`);
    log(`  D: dom ${JSON.stringify(results.failureDiagnosis.dom).slice(0, 500)}`);
  }

  let shot = null;
  if (played) {
    const before = await blanc.evaluate(`document.querySelector('${VIDEO}').currentTime`);
    await blanc.evaluate(`(document.querySelector('${VIDEO}').play?.(),1)`).catch(() => undefined);
    await sleep(4000);
    shot = JSON.parse(await blanc.evaluate(`(() => {
      const v = document.querySelector('${VIDEO}');
      return JSON.stringify({ currentTime: v.currentTime, duration: v.duration,
        videoWidth: v.videoWidth, videoHeight: v.videoHeight, readyState: v.readyState,
        inBlancFrame: !!v.closest('${FRAME}'),
        windowIsBlanc: new URLSearchParams(location.search).get('blanc') === '1' });
    })()`));
    shot.startedAt = before;
    results.playback = shot;
  }
  record('D a file plays in the packaged Blanc, first try', played && shot
    && shot.currentTime > shot.startedAt && shot.videoWidth > 0 && shot.inBlancFrame,
    played
      ? `${shot.startedAt.toFixed(3)} -> ${shot.currentTime.toFixed(3)}s, `
        + `${shot.videoWidth}x${shot.videoHeight}, inside the Blanc frame: ${shot.inBlancFrame}`
      : 'never loaded');

  // ── E: THE POINT — the recovery was never needed ───────────────────────────────────
  blanc.recording = false;
  const rows = [];
  for (const { at, method, params } of blanc.trace) {
    const ms = at - t0;
    if (method === 'Network.requestWillBeSent') {
      const url = params.request?.url ?? '';
      if (/\/api\/v1\/directstream\/play/.test(url) && params.request.method === 'POST') {
        // Two POSTs 3ms apart are not the recovery — that runs on a 1s interval — so the
        // question is which call site fired twice. The initiator stack is the only thing
        // that answers it without guessing; the body distinguishes "same file re-opened"
        // from "two different requests".
        rows.push({
          ms,
          kind: 'post',
          body: String(params.request.postData ?? '').slice(0, 200),
          initiator: (params.initiator?.stack?.callFrames ?? [])
            .slice(0, 6).map((f) => `${f.functionName || '(anon)'}@${f.url.split('/').pop()}:${f.lineNumber}`),
        });
      }
      continue;
    }
    if (method === 'Network.webSocketCreated') { rows.push({ ms, kind: 'ws-open' }); continue; }
    if (method === 'Network.webSocketClosed') { rows.push({ ms, kind: 'ws-close' }); continue; }
    const payload = String(params?.response?.payloadData ?? '');
    if (method === 'Network.webSocketFrameSent' && payload.includes('video-terminated')) {
      rows.push({ ms, kind: 'terminated' });
    }
    if (method === 'Network.webSocketFrameReceived' && payload.includes('"type":"watch"')) {
      rows.push({ ms, kind: 'watch' });
    }
  }
  const count = (k) => rows.filter((r) => r.kind === k).length;
  const watchAt = rows.find((r) => r.kind === 'watch')?.ms ?? null;
  const terminatedBeforeWatch = rows.filter((r) => r.kind === 'terminated'
    && (watchAt == null || r.ms < watchAt)).length;
  results.productionShape = {
    directstreamPosts: count('post'),
    socketsOpened: count('ws-open'),
    socketsClosed: count('ws-close'),
    videoTerminatedBeforeWatch: terminatedBeforeWatch,
    watchAtMs: watchAt,
    rows,
  };
  record('E the recovery was never needed — one POST, one socket, no terminate',
    count('post') === 1 && count('ws-open') === 1 && count('ws-close') === 0
      && terminatedBeforeWatch === 0,
    `POSTs ${count('post')} (want 1), sockets ${count('ws-open')} opened / `
    + `${count('ws-close')} closed (want 1/0), video-terminated before watch `
    + `${terminatedBeforeWatch} (want 0), watch at ${watchAt}ms`);

  // ── F: the frame still bounds the surface, and is not collapsed ────────────────────
  if (played) {
    const g = JSON.parse(await blanc.evaluate(`(() => {
      const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.y) }; };
      const frame = document.querySelector('${FRAME}');
      return JSON.stringify({ viewport: { w: innerWidth, h: innerHeight },
        frame: box(frame), video: box(document.querySelector('${VIDEO}')),
        legacy: document.querySelectorAll('.media-video, .media-player-stage').length });
    })()`));
    results.geometry = g;
    // Non-degeneracy FIRST — slice 23's lesson: a zero-height box satisfies every bounds test.
    record('F the toolbox frame bounds the surface without collapsing it',
      g.frame && g.frame.h > 0 && g.video.h > 0 && g.frame.w <= g.viewport.w && g.legacy === 0,
      `viewport ${g.viewport.w}x${g.viewport.h}, frame ${g.frame?.w}x${g.frame?.h}, `
      + `video ${g.video?.w}x${g.video?.h}, legacy player nodes ${g.legacy}`);
  }

  // ── G: the two PRESSABLE video.* rows, in the packaged build ───────────────────────
  //
  // Slices 19-22 each carried the same open item: the `video.*` rows that do not seek have
  // never been pressed. `retirement-step3-harness.mjs` phase H was written for this and
  // cannot run — its phase E regressed under another session's concurrent edits to the tree
  // (slice 29). This harness is the way around that, and the reason is worth stating: it
  // drives a PACKAGED artifact, which is frozen at build time and does not move when the
  // working tree does. A dev-route harness re-reads the tree on every run; this one cannot.
  //
  // Only `;` and `'` are pressable at all. The other five rows ship `defaultKeys: ''`, so
  // `chordMatches` is false for every chord and they are unpressable BY DESIGN until bound.
  //
  // The instrument is the `<output>` in the subtitle-offset cluster — which lives in the
  // `study-control-primary` row and is therefore NOT behind the expand toggle. Matched by
  // TEXT SHAPE, not by its aria-label, because every label here goes through `useT()` and
  // this app ships four UI languages. NOT `data-timing-delay`: that attribute only exists
  // while drift tracking is active, so a phase built on it reads null in an ordinary run and
  // looks like a broken shortcut.
  if (played) {
    const readDelay = async () => blanc.evaluate(`(() => {
      const outs = [...document.querySelectorAll('.study-control-cluster output')];
      const hit = outs.map((o) => (o.textContent ?? '').trim())
        .find((t) => /^[+-]?\\d+(\\.\\d+)?s$/.test(t));
      return hit == null ? null : Number.parseFloat(hit);
    })()`);

    // `;` and `'` are not letters: a `KeyX`-shaped code with a letter VK is dispatched
    // happily and matches nothing, which reads as "the binding does not fire".
    const KEYS = {
      ';': { code: 'Semicolon', vk: 186 },
      "'": { code: 'Quote', vk: 222 },
      x: { code: 'KeyX', vk: 88 },
    };
    const press = async (key) => {
      // A focused input suppresses unmodified chords by design (`isTypingTarget`), so a stray
      // focus would read as "the shortcut does nothing".
      await blanc.evaluate("(() => { const el = document.activeElement;"
        + " if (el && el !== document.body) el.blur?.(); return 1; })()");
      const before = await readDelay();
      const common = {
        key,
        code: KEYS[key].code,
        windowsVirtualKeyCode: KEYS[key].vk,
        nativeVirtualKeyCode: KEYS[key].vk,
      };
      await blanc.send('Input.dispatchKeyEvent', { type: 'keyDown', text: key, ...common });
      await blanc.send('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
      let after = before;
      for (let i = 0; i < 12; i += 1) {
        await sleep(200);
        after = await readDelay();
        if (after !== before) break;
      }
      return { key, before, after };
    };

    const present = await readDelay();
    if (present == null) {
      record('G the two pressable video.* rows move the subtitle offset', false,
        'the subtitle-offset output is not in the packaged Blanc DOM — the instrument, not '
        + 'the binding, is what failed here');
    } else {
      const earlier = await press(';');
      const later = await press("'");
      // The control, for the same reason phase G of the dev harness has one: two deltas alone
      // would prove only that SOMETHING moves the delay while keys are being pressed. `x` is
      // free in BOTH the catalog and the adopted player's own keymap.
      const control = await press('x');
      const closeTo = (a, b) => a != null && b != null && Math.abs(a - b) < 0.001;
      const earlierOk = closeTo(earlier.after, earlier.before - 0.1);
      const laterOk = closeTo(later.after, later.before + 0.1);
      const controlQuiet = closeTo(control.after, control.before);
      results.shortcutPresses = {
        delayAtStart: present, subEarlierSemicolon: earlier, subLaterQuote: later,
        unboundKeyX: control,
        theOtherFiveRows: "subEarlierLarge, subLaterLarge, toggleAutoPause, toggleLoop and "
          + "toggleFurigana ship defaultKeys: '' — unpressable by design until bound, so the "
          + 'untested claim there is bind-then-press through ShortcutSettings, not a keypress',
      };
      record('G the two pressable video.* rows move the subtitle offset', earlierOk && laterOk
        && controlQuiet,
        `; ${earlier.before} -> ${earlier.after} (want ${(earlier.before - 0.1).toFixed(1)}), `
        + `' ${later.before} -> ${later.after} (want ${(later.before + 0.1).toFixed(1)}), `
        + `unbound x ${control.before} -> ${control.after} (want unchanged)`);
    }
  }

  return { main, blanc };
}

let handles = null;
main()
  .then((h) => { handles = h; })
  .catch((err) => {
    results.error = String(err?.message ?? err);
    log(`ERROR ${results.error}`);
  })
  .finally(async () => {
    results.result = results.error || results.phases.some((p) => p.result === 'FAIL')
      ? 'FAIL' : 'PASS';
    results.finishedAt = new Date().toISOString();
    results.log = logLines;
    fs.writeFileSync(path.join(workRoot, 'packaged-blanc.json'),
      `${JSON.stringify(results, null, 2)}\n`);
    handles?.blanc?.close();
    handles?.main?.close();
    if (app && !app.killed) app.kill();
    await sleep(500);
    // Windows does not reap a grandchild with its parent, and the sidecar is one.
    if (app?.pid) {
      spawnSync('taskkill', ['/pid', String(app.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    }
    console.log(`\nrecord: ${path.join(workRoot, 'packaged-blanc.json')}`);
    process.exit(results.result === 'PASS' ? 0 : 1);
  });
