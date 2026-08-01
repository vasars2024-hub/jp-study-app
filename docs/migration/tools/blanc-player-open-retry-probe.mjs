/**
 * A narrow diagnostic, not a harness: WHY does Blanc's toolbox player never open a file,
 * and does one specific change make it open?
 *
 * ## What is already established (do not re-derive)
 *
 * `blanc-player-harness.mjs` reaches phase G — Blanc's own window, at toolbox size, with
 * the sidecar `ready` and `#media-workspace.blanc-study-player` mounted — and then stalls
 * with `data-study-player="idle"` and no `<video>` at all. Two independent runs against two
 * independently prepared datadirs failed identically:
 *
 *   proof/blanc-player-live-20260801023530/   (datadir blanc-gplay-20260801053137)
 *   proof/blanc-player-live-20260801054500/   (datadir blanc-player-datadir-20260801054000)
 *
 * So it is not a consumed datadir, and it is not the documented directstream
 * intermittency: the SERVER log says what happens, and it says it every time.
 *
 * ```
 * ws > Client connected    id=c79...        <- socket 1
 * ws > Client connected    id=c79...        <- socket 2, SAME client id
 * ws > Client disconnection id=c79...       <- socket 1 goes away
 * directstream > Signaling native player that a new stream is starting
 * ws > Sending "{open-and-await Loading stream...}" to=c79...
 * directstream > Skipping open step for cancelled preparation clientId=c79...   <-- here
 * POST /api/v1/directstream/play/localfile 200
 * ```
 *
 * The sidecar cancels the in-flight preparation when a socket bearing that client id
 * disconnects, and the POST then returns 200 having done nothing. On later attempts the
 * parse completes and "Signaling player that stream is ready" fires, but TWO POSTs land
 * back to back and the second cancels the first's playback context, after which the client
 * reports `Video terminated`.
 *
 * ## The hypothesis this probe exists to test
 *
 * The duplication is `React.StrictMode`, which `blancMain.tsx` (like `main.tsx`) wraps the
 * tree in, and which double-invokes every effect **on mount**. `seanimeSocketPool.ts`
 * already prevents two CONCURRENT sockets — that is what it was extracted for — but it
 * cannot prevent a release/re-acquire cycle, and the sidecar treats the released socket's
 * disconnect as the client going away.
 *
 * Why the main window's workspace does not hit this, though it is under StrictMode too:
 * there, `StudyPlayerSession` is already mounted and settled when the open is dispatched as
 * an EVENT, so its launch effect re-runs on a prop change — once. In Blanc the
 * `playbackRequest` is non-null at first mount, so the launch effect fires inside the
 * double-mount, racing the socket churn it is riding on.
 *
 * If that is right, then the same session, once settled, should open the file on a SECOND
 * request — because a `playbackRequest` change is a dependency change, not a remount.
 *
 * Step 2 provokes exactly that with no source edit and no synthetic event: `hashRequestId`
 * derives the request id from `(item.id, item.positionSec)`, so writing a new resume
 * position through the app's own `media:setPosition` and re-clicking the card yields a new
 * requestId on the ALREADY-MOUNTED session.
 *
 * `A_ONLY=1` skips step 2, to confirm step 1 fails on its own on this datadir.
 *
 * ## Step 1b, added 2026-08-01 (slice 24): WHICH of the two moves actually cancels it
 *
 * The hypothesis above names the socket churn, and the write-up of slice 23 repeats it. But
 * the pinned sidecar has **no** disconnect-cancels-preparation path — `handlers/websocket.go`
 * calls `RemoveConn(id)` on a read error and nothing else. The only thing that sets
 * `preparationCanceled` is `cancelPreparationLocked`, reached from `CancelOpen`, `CloseOpen`,
 * or a **`player.TerminatedEvent`** in `directstream/stream.go`'s listener — and that event
 * originates in the *client*, as `video-terminated` (`video-core-events.ts:324`). So "the
 * socket disconnected" and "the client said the video terminated" are two different causes
 * that produce the same server log, and they need different fixes.
 *
 * Step 1b decides it from the browser's own record: CDP `Network.webSocket*` events, captured
 * from before the click that mounts the tree. No page patching — hooking
 * `WebSocket.prototype.send` would have to happen before the adopted tree's first mount, and
 * that mount is the thing being measured.
 *
 * usage:
 *   node docs/migration/tools/prepare-gplay-datadir.mjs <cue-probe-dual.mkv> <empty-dir>
 *   node docs/migration/tools/blanc-player-open-retry-probe.mjs --datadir=<that dir>
 *
 * Traps inherited from the harnesses this borrows from, all already paid for: the
 * userData-inside-the-repo trap (a Chromium profile under the repo makes Vite's watcher
 * throw EBUSY and KILLS the dev server), the about:blank CDP target trap, and the fact
 * that Blanc's window is the one target whose URL DOES carry a query string.
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
const MEDIA_FILE = path.resolve(flag('file', DATA_DIR
  ? path.join(DATA_DIR, 'cue-library', 'Sousou no Frieren - 01.mkv')
  : path.join(os.tmpdir(), 'cue-probe-dual.mkv')));
const A_ONLY = process.env.A_ONLY === '1';
/**
 * Hold Blanc's first `/api/v1/status` for this many ms — slice 25's forcing of the
 * PRODUCTION route to the same defect.
 *
 * `waitForWatchHistory` and `shouldWaitForWatchHistory` both derive from
 * `serverStatus.settings.library.enableWatchContinuity` (`continuity.hooks.ts:107,125`) and
 * are two of the three deps of the adopted lifecycle effect that dispatches
 * `video-terminated`. So that query resolving AFTER the open was issued runs the effect's
 * `if (!state.playbackInfo)` branch with an open in flight — no StrictMode required.
 *
 * In an ordinary probe run the query resolves at ~1.5 s and the card is clicked at ~1.9 s,
 * so the flip has already happened and cannot be observed. Holding the response is how the
 * ordering a real user hits (open Blanc on a loaded source, or a slow/restarting sidecar)
 * is made deterministic. Only the FIRST status request is held: holding all of them would
 * deadlock surfaces that poll it, and one flip is the whole experiment.
 */
const STATUS_DELAY_MS = Number(process.env.STATUS_DELAY_MS ?? 0);
/**
 * `COLD_SECOND=1` makes step 2 open a **different, never-opened file** instead of
 * re-requesting the one already playing — slice 26.
 *
 * Slice 25 measured the A-to-B route in halves: the `video-terminated` DOES fire into the
 * open window with StrictMode off (POST 32 ms, terminate 64 ms), but the preparation had
 * been warm — 33 ms end to end — and finished 1 ms ahead of it. Run A measured a COLD
 * preparation at 5.27 s. So the combination that should actually break is a cold second
 * file, and that is the one thing neither slice observed.
 *
 * **No StrictMode control is needed for this.** StrictMode double-invokes effects on MOUNT;
 * step 2 happens long after, and the effect that dispatches the terminate here fires on a
 * dependency change, once, in either mode. That is why slice 25's run D and this run are
 * both production-shaped at step 2 while differing at step 1.
 */
const COLD_SECOND = process.env.COLD_SECOND === '1';

/** The toolbox size the geometry question is asked at. */
const BLANC_W = 560;
const BLANC_H = 460;
/** How long the socket is left alone to settle before the second request. */
const SETTLE_MS = 10_000;

const stamp = process.env.RUN_STAMP
  ?? new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '');
const workRoot = path.join(REPO, 'docs/migration/proof', `blanc-open-retry-${stamp}`);
fs.mkdirSync(workRoot, { recursive: true });
/** NEVER inside the repo. */
const scratchRoot = path.join(os.tmpdir(), `jp-blanc-probe-${stamp}`);
fs.mkdirSync(scratchRoot, { recursive: true });

const logLines = [];
const log = (m) => { const l = `[probe] ${m}`; logLines.push(l); console.log(l); };
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

async function findTarget(port, deadline, match, label) {
  let seen = [];
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await res.json();
      seen = targets.filter((t) => t.type === 'page').map((t) => t.url);
      const page = targets.find((t) => t.type === 'page'
        && /^(https?|app):\/\//.test(t.url) && match(t.url));
      if (page?.webSocketDebuggerUrl) return page;
    } catch { /* not up */ }
    await sleep(400);
  }
  throw new Error(`no CDP target for ${label}; saw ${JSON.stringify(seen)}`);
}

class Cdp {
  constructor(url) {
    this.url = url; this.nextId = 1; this.pending = new Map();
    /** CDP *events* (no `id`), kept only while `recording` is on. See `startTrace`. */
    this.trace = [];
    this.recording = false;
    /** One handler per CDP event method. Used by the `/api/v1/status` hold below. */
    this.handlers = new Map();
  }
  on(method, fn) { this.handlers.set(method, fn); }
  async open() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener('message', (event) => {
      let msg; try { msg = JSON.parse(String(event.data)); } catch { return; }
      if (msg.id == null) {
        if (this.recording && TRACED_METHODS.has(msg.method) && this.trace.length < 4000) {
          this.trace.push({ at: Date.now(), method: msg.method, params: msg.params });
        }
        this.handlers.get(msg.method)?.(msg.params);
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

/**
 * What the browser itself saw, rather than what the page can be persuaded to admit.
 *
 * The whole question of step 1 is *who* cancelled the directstream preparation. The sidecar
 * log names the symptom (`Skipping open step for cancelled preparation`) and the two
 * hypotheses on the table — the released socket's disconnect, or a `video-terminated` the
 * client sent — are indistinguishable from the *server* side, because both arrive on the
 * same connection from the same client id. They are trivially distinguishable from the
 * *client* side: one is a socket close, the other is an outgoing frame. CDP reports both
 * without patching anything in the page, which matters here — `WebSocket.prototype.send`
 * would have to be hooked before the adopted tree's first mount, and that mount is the
 * thing under measurement.
 */
const TRACED_METHODS = new Set([
  'Network.webSocketCreated',
  'Network.webSocketClosed',
  'Network.webSocketFrameSent',
  'Network.webSocketFrameReceived',
  'Network.webSocketFrameError',
  'Network.requestWillBeSent',
  'Network.responseReceived',
]);

/** One line per traced event, small enough to read in the record. */
function summariseTrace(trace, t0) {
  const rows = [];
  for (const { at, method, params } of trace) {
    const ms = at - t0;
    const short = method.replace('Network.', '');
    // Every sidecar API call, not just directstream. `/api/v1/status` is in here on
    // purpose: `waitForWatchHistory` and `shouldWaitForWatchHistory` are both derived from
    // `serverStatus.settings.library.enableWatchContinuity` (continuity.hooks.ts:107,125)
    // and they are two of the three deps of the adopted lifecycle effect that dispatches
    // `video-terminated`. When that query resolves is therefore load-bearing, and it is
    // invisible in a websocket-only trace.
    if (method === 'Network.requestWillBeSent') {
      const { url, method: verb } = params.request ?? {};
      if (!/\/api\/v1\//.test(url ?? '')) continue;
      rows.push({ ms, event: `HTTP ${verb} ${String(url).replace(/^https?:\/\/[^/]+/, '')}` });
      continue;
    }
    if (method === 'Network.responseReceived') {
      const { url, status } = params.response ?? {};
      if (!/\/api\/v1\//.test(url ?? '')) continue;
      rows.push({ ms, event: `HTTP ${status} ${String(url).replace(/^https?:\/\/[^/]+/, '')}` });
      continue;
    }
    if (method === 'Network.webSocketCreated') {
      // The token is a secret and the id is the whole point, so keep the query keys but
      // not their values — except `id`, which is what "two sockets, one client id" means.
      const url = new URL(params.url);
      rows.push({
        ms,
        event: `ws OPEN ${url.pathname} id=${url.searchParams.get('id') ?? '?'}`,
        requestId: params.requestId,
      });
      continue;
    }
    if (method === 'Network.webSocketClosed') {
      rows.push({ ms, event: 'ws CLOSE', requestId: params.requestId });
      continue;
    }
    const payload = params.response?.payloadData ?? '';
    let type = '';
    try { type = JSON.parse(payload)?.type ?? ''; } catch { type = payload.slice(0, 40); }
    if (type === 'ping' || type === 'pong') continue;   // heartbeat, never the answer
    rows.push({
      ms,
      event: `ws ${short === 'webSocketFrameSent' ? 'SEND' : 'RECV'} ${type}`,
      requestId: params.requestId,
      payload: payload.length > 240 ? `${payload.slice(0, 240)}…` : payload,
    });
  }
  return rows;
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

const out = {
  probe: 'blanc-player-open-retry-probe.mjs',
  hypothesis:
    "Blanc's player loses its first directstream open to React.StrictMode's double-mount "
    + '(two sockets on one client id; the sidecar cancels the preparation when the released '
    + 'one disconnects). A SECOND request on the already-mounted session should succeed, '
    + 'because a playbackRequest change is a dependency change rather than a remount.',
  hypothesisCorrection:
    'Half right, and the wrong half is the half that names a fix. Step 1b (slice 24) measured '
    + 'the frames: the disconnect is a co-symptom, and the cancel is a `video-terminated` the '
    + 'CLIENT sends ~190ms later from the adopted lifecycle effect. A socket-lifetime fix '
    + 'would have changed nothing. See docs/migration/proof/blanc-player-live-20260801075500/'
    + 'slice-24.json.',
  startedAt: new Date().toISOString(),
  mediaFile: MEDIA_FILE,
  dataDir: DATA_DIR,
  steps: [],
};
const step = (name, result, detail, extra) => {
  out.steps.push({ name, result, detail, ...(extra ?? {}) });
  log(`${result} — ${name}: ${detail}`);
};

let electron = null;

const videoShot = (cdp) => cdp.evaluate(`(() => {
  const v = document.querySelector('${VIDEO}');
  const slice = document.querySelector('.study-player-slice');
  if (!v) return JSON.stringify({
    videoPresent: false,
    frame: !!document.querySelector('${FRAME}'),
    sliceState: slice?.getAttribute('data-study-player') ?? null,
    sliceText: (slice?.innerText ?? '').slice(0, 120),
  });
  return JSON.stringify({
    videoPresent: true, readyState: v.readyState, networkState: v.networkState,
    currentTime: v.currentTime, duration: v.duration, paused: v.paused,
    videoWidth: v.videoWidth, videoHeight: v.videoHeight,
    sliceState: slice?.getAttribute('data-study-player') ?? null,
  });
})()`);

async function main() {
  if (!fs.existsSync(MEDIA_FILE)) throw new Error(`fixture not found: ${MEDIA_FILE}`);

  const userDataDir = path.join(scratchRoot, 'userdata');
  fs.mkdirSync(userDataDir, { recursive: true });
  const cdpPort = await freePort();
  const env = { ...process.env };
  delete env.SEANIME_EXE;
  delete env.SEANIME_SIDECAR;   // the shipped default is what is under test
  delete env.SEANIME_DATADIR;
  if (DATA_DIR) env.SEANIME_DATADIR = DATA_DIR;

  electron = spawn(
    electronBinary(),
    ['.', `--user-data-dir=${userDataDir}`, `--remote-debugging-port=${cdpPort}`],
    { cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  electron.stdout.resume();
  electron.stderr.resume();

  const mainTarget = await findTarget(cdpPort, Date.now() + 120_000,
    (url) => !url.includes('?') && !url.includes('blanc'), 'the main window');
  const main = await new Cdp(mainTarget.webSocketDebuggerUrl).open();
  await waitFor(main, "typeof window.api?.seanimeStatus === 'function'"
    + " && !!document.querySelector('.desktop-root')", 120_000, 'the desktop never mounted');
  await main.evaluate(
    "(()=>{const b=document.querySelector('.consent-no');if(b){b.click();return 1;}return 0;})()",
  );

  // ── Step 0: the sidecar, started FIRST and verified up ──────────────────────────
  // Blanc's player would start it lazily on mount. Starting it here instead removes a
  // whole class of ambiguity from every later reading: a stall cannot be "the server was
  // still booting".
  const kindBefore = await main.evaluate('window.api.seanimeStatus().then(s=>s&&s.kind)');
  await main.evaluate('window.api.seanimeStart().then(()=>1).catch(()=>0)');
  let ready = null;
  for (const deadline = Date.now() + 180_000; Date.now() < deadline && !ready;) {
    const s = await main.evaluate('window.api.seanimeStatus()');
    if (s?.kind === 'ready') ready = s;
    else await sleep(500);
  }
  if (!ready) throw new Error('sidecar never reached ready');
  out.sidecar = { pid: ready.pid, port: ready.port, version: ready.version };
  step('0 sidecar ready before anything is driven', 'PASS',
    `${kindBefore} -> ready, pid ${ready.pid}, port ${ready.port}, v${ready.version}`);

  // ── Open Blanc's real window ────────────────────────────────────────────────────
  await main.evaluate(`window.api.blancOpen({width:${BLANC_W},height:${BLANC_H}})`);
  const blancTarget = await findTarget(cdpPort, Date.now() + 120_000,
    (url) => url.includes('blanc=1'), "Blanc's window");
  const blanc = await new Cdp(blancTarget.webSocketDebuggerUrl).open();

  if (STATUS_DELAY_MS > 0) {
    let held = false;
    out.statusHold = { requestedMs: STATUS_DELAY_MS };
    blanc.on('Fetch.requestPaused', (params) => {
      const first = !held && /\/api\/v1\/status/.test(params.request?.url ?? '');
      if (!first) {
        void blanc.send('Fetch.continueRequest', { requestId: params.requestId });
        return;
      }
      held = true;
      out.statusHold.heldAt = Date.now();
      log(`  holding ${params.request.url} for ${STATUS_DELAY_MS} ms`);
      setTimeout(() => {
        out.statusHold.releasedAt = Date.now();
        void blanc.send('Fetch.continueRequest', { requestId: params.requestId });
      }, STATUS_DELAY_MS);
    });
    // Narrow pattern on purpose: intercepting `*` would pause the video stream too.
    await blanc.send('Fetch.enable', {
      patterns: [{ urlPattern: '*/api/v1/status*', requestStage: 'Request' }],
    });
  }

  await waitFor(blanc, "!!document.querySelector('.blanc-root')", 120_000, 'Blanc never mounted');

  const seeded = JSON.parse(await blanc.evaluate(
    `window.api.addMediaPaths([${JSON.stringify(MEDIA_FILE)}]).then(items => JSON.stringify(
       items.map(i => ({ id: i.id, fileName: i.fileName, positionSec: i.positionSec }))))`,
  ));
  const item = seeded.find((i) => i.fileName === path.basename(MEDIA_FILE)) ?? seeded[0];
  out.item = item;

  const selectMedia = () => blanc.evaluate(
    "(window.dispatchEvent(new CustomEvent('blanc:select-tab',{detail:'media'})),1)",
  );
  const clickCard = (fileName = path.basename(MEDIA_FILE)) => blanc.evaluate(
    `(() => {
      const card = [...document.querySelectorAll('.media-card')]
        .find(c => (c.textContent ?? '').includes(${JSON.stringify(fileName)}));
      if (!card) return 0;
      card.click();
      return 1;
    })()`,
  );

  await selectMedia();
  await waitFor(blanc, "!!document.querySelector('.media-card')", 30_000, 'no library card');

  // ── Step 1: the first open — the one that has never worked ──────────────────────
  // Recording starts BEFORE the click, because the sockets under suspicion are opened by
  // the mount the click causes. Turning it on after would measure the aftermath.
  await blanc.send('Network.enable', { maxPostDataSize: 4096 });
  blanc.recording = true;
  const traceT0 = Date.now();
  if (!(await clickCard())) throw new Error('no card matched the fixture');
  await waitFor(blanc, `!!document.querySelector('${FRAME}')`, 60_000, 'the frame never mounted');
  let first = 'never became ready';
  try {
    await waitFor(blanc, `(()=>{const v=document.querySelector('${VIDEO}');`
      + 'return !!v && v.readyState >= 2;})()', 45_000, 'stalled');
    first = 'ready';
  } catch { /* expected */ }
  const firstShot = JSON.parse(await videoShot(blanc));
  step('1 first open (fresh mount, inside the StrictMode double-mount)',
    first === 'ready' ? 'PASS' : 'FAIL', JSON.stringify(firstShot), { shot: firstShot });

  // ── Step 1b: WHO cancelled it — the socket close, or a frame the client sent? ────
  blanc.recording = false;
  const rows = summariseTrace(blanc.trace, traceT0);
  const sockets = rows.filter((r) => r.event.startsWith('ws OPEN'));
  const closes = rows.filter((r) => r.event === 'ws CLOSE');
  // The frame's own `type` is `videocore`; `video-terminated` is the type of the payload
  // INSIDE it. The first cut of this counter matched on the outer type and read 0 while the
  // rows it was summarising held two of them — an assertion that looked right and meant
  // nothing, in a probe written to correct exactly that class of mistake.
  const terminated = rows.filter((r) => (r.payload ?? '').includes('video-terminated'));
  const posts = rows.filter((r) => r.event.startsWith('HTTP POST'));
  out.trace = rows;
  out.traceSummary = {
    socketsOpened: sockets.length,
    socketsClosed: closes.length,
    directstreamPosts: posts.length,
    videoTerminatedFramesSent: terminated.length,
    firstCloseAtMs: closes[0]?.ms ?? null,
    firstPostAtMs: posts[0]?.ms ?? null,
    firstTerminatedAtMs: terminated[0]?.ms ?? null,
  };
  // Deliberately not a PASS/FAIL: this step asks a question whose answer is a fact about
  // the run, and forcing it into a verdict would invite the next reader to treat one of the
  // two hypotheses as the expected one.
  step('1b what the client actually did during the failing open', 'MEASURED',
    JSON.stringify(out.traceSummary), { rows: rows.length });
  blanc.trace.length = 0;

  if (A_ONLY) {
    out.conclusion = 'A_ONLY: step 2 deliberately skipped.';
    return { blanc, main };
  }

  // ── Step 2: the same session, settled, asked again ──────────────────────────────
  // No remount and no synthetic event: a new resume position through the app's own
  // `media:setPosition` changes `hashRequestId(item.id, item.positionSec)`, which is the
  // whole of `playbackRequest`'s identity. The session stays mounted, so its launch
  // effect re-runs exactly once.
  log(`  letting the socket settle for ${SETTLE_MS} ms`);
  await sleep(SETTLE_MS);
  const settled = JSON.parse(await blanc.evaluate(
    `JSON.stringify({ frame: !!document.querySelector('${FRAME}'),`
    + " sliceState: document.querySelector('.study-player-slice')?.getAttribute('data-study-player') ?? null })",
  ));
  out.settled = settled;

  // Slice 25 keeps the trace running through this step, because with step 1 now SUCCEEDING
  // (slice 24's recovery) step 2 is no longer "a second try at a dead open" — it is the
  // A-to-B case: **a new open issued while a file is already playing**. That is the one
  // ordering in which the adopted lifecycle effect's null branch is reachable without
  // StrictMode: `open-and-await` sets `state.playbackInfo` to null by design (see the
  // comment on that handler), so `state.playbackInfo?.id` changes from the playing file's
  // id to `undefined`, the effect re-runs, and it dispatches `video-terminated` at a
  // preparation that is in flight. Continue-watching, the palette's resume and Statistics'
  // By-show rows all do exactly this.
  // COLD_SECOND makes step 2 a genuinely different file. A copy of the fixture under a new
  // name is enough: the sidecar's metadata parse is per-file, so the second open cannot be
  // served from whatever the first one warmed. Seeded through the app's own
  // `addMediaPaths`, the same call step 1 used.
  let coldName = null;
  if (COLD_SECOND) {
    // The datadir must have been prepared with GPLAY_SECOND_EPISODE=1, so the sidecar's own
    // scan registered this file. Copying it in here instead answers HTTP 500 — see that
    // flag's comment in prepare-gplay-datadir.mjs.
    const copy = path.join(path.dirname(MEDIA_FILE), 'Sousou no Frieren - 02.mkv');
    if (!fs.existsSync(copy)) {
      throw new Error(`COLD_SECOND needs a datadir prepared with GPLAY_SECOND_EPISODE=1; ${copy} is missing`);
    }
    coldName = path.basename(copy);
    const seededCold = JSON.parse(await blanc.evaluate(
      `window.api.addMediaPaths([${JSON.stringify(copy)}]).then(items => JSON.stringify(
         items.map(i => ({ id: i.id, fileName: i.fileName }))))`,
    ));
    out.coldSecondItem = seededCold.find((i) => i.fileName === coldName) ?? null;
    await waitFor(blanc, `[...document.querySelectorAll('.media-card')]`
      + `.some(c => (c.textContent ?? '').includes(${JSON.stringify(coldName)}))`,
      30_000, 'the second file never appeared in the grid');
  }

  const traceT1 = Date.now();
  blanc.recording = true;
  if (coldName) {
    if (!(await clickCard(coldName))) throw new Error('the cold second card was not clickable');
  } else {
    const NEW_POS = 3;
    await blanc.evaluate(
      `window.api.setMediaPosition(${JSON.stringify(item.id)}, ${NEW_POS}).then(()=>1).catch(()=>0)`,
    );
    if (!(await clickCard())) throw new Error('card vanished before the second open');
  }

  // **`readyState >= 2` is vacuous here as of slice 24** and was silently so in this probe's
  // first slice-25 run: step 1 now succeeds, so the OLD video is already loaded and the wait
  // returned in ~30 ms, closing the trace window before the new open had done anything. The
  // completion condition for a SECOND open has to be about the second open — a `watch` frame
  // for it — not about a video element that never went away.
  const sawWatch = async () => blanc.trace.some((e) =>
    e.method === 'Network.webSocketFrameReceived'
    && String(e.params?.response?.payloadData ?? '').includes('"type":"watch"'));
  let second = 'no `watch` for the second open';
  for (const deadline = Date.now() + 60_000; Date.now() < deadline;) {
    if (await sawWatch()) { second = 'ready'; break; }
    await sleep(300);
  }
  // The element is replaced across the transition, so give it a moment to come back before
  // anything reads it — the first run threw `Cannot read properties of null` right here.
  if (second === 'ready') {
    try {
      await waitFor(blanc, `(()=>{const v=document.querySelector('${VIDEO}');`
        + 'return !!v && v.readyState >= 2;})()', 30_000, 'element never returned');
    } catch { second = '`watch` arrived but the element never came back'; }
  }
  const secondShot = JSON.parse(await videoShot(blanc));
  step('2 second open (same mounted session, new requestId)',
    second === 'ready' ? 'PASS' : 'FAIL', JSON.stringify(secondShot), { shot: secondShot });

  // ── Step 2b: was the A-to-B open cancelled the same way? ────────────────────────
  blanc.recording = false;
  const rows2 = summariseTrace(blanc.trace, traceT1);
  const posts2 = rows2.filter((r) => r.event.startsWith('HTTP POST')
    && r.event.includes('directstream'));
  const terminated2 = rows2.filter((r) => (r.payload ?? '').includes('video-terminated'));
  const watch2 = rows2.filter((r) => (r.payload ?? '').includes('"type":"watch"'));
  out.traceStep2 = rows2;
  out.traceStep2Summary = {
    directstreamPosts: posts2.length,
    videoTerminatedFramesSent: terminated2.length,
    firstPostAtMs: posts2[0]?.ms ?? null,
    firstTerminatedAtMs: terminated2[0]?.ms ?? null,
    firstWatchAtMs: watch2[0]?.ms ?? null,
    // The discriminator: a terminate BETWEEN the POST and the `watch` is the defect;
    // one before the POST is the previous playback tidying up and is harmless, because
    // `BeginOpen` clears `preparationCanceled`.
    terminatedInsideTheOpenWindow: terminated2.some((t) => posts2[0] && t.ms > posts2[0].ms
      && (!watch2[0] || t.ms < watch2[0].ms)),
    recoveryFired: posts2.length > 1,
  };
  step('2b was the A-to-B open cancelled the same way', 'MEASURED',
    JSON.stringify(out.traceStep2Summary), { rows: rows2.length });
  await blanc.send('Network.disable', {}).catch(() => undefined);

  // ── Step 3: does it actually PLAY? ──────────────────────────────────────────────
  if (second === 'ready') {
    const t0 = await blanc.evaluate(`document.querySelector('${VIDEO}')?.currentTime ?? null`);
    await blanc.evaluate(`(document.querySelector('${VIDEO}').play?.(),1)`).catch(() => undefined);
    await sleep(4000);
    const play = JSON.parse(await videoShot(blanc));
    const advanced = play.currentTime > t0 && play.videoWidth > 0;
    out.playback = { startedAt: t0, ...play };
    step('3 the clock moves and there are real pixels', advanced ? 'PASS' : 'FAIL',
      `${t0.toFixed(3)} -> ${play.currentTime.toFixed(3)}s, ${play.videoWidth}x${play.videoHeight}`);
  } else {
    step('3 the clock moves and there are real pixels', 'SKIPPED', 'depends on step 2');
  }

  // ── Step 4: is the playing video actually ON SCREEN? ────────────────────────────
  //
  // This step exists because the full harness's geometry phase PASSED on a degenerate
  // measurement: it recorded `frame 392x0`, `scrollHeight 0`, `clientHeight 0` and then
  // asserted `frame.right <= viewport.w` and `video.h <= 45vh`, both of which a ZERO-HEIGHT
  // box satisfies trivially (proof/blanc-player-live-20260801060000). "Bounded" and
  // "collapsed" are not the same answer, and a bounds check alone cannot tell them apart.
  //
  // So the question is asked the other way round: hit-test the point where the video claims
  // to be, and walk the ancestor chain to find where the height goes to zero.
  if (second === 'ready') {
    const geom = JSON.parse(await blanc.evaluate(`(() => {
      const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          tag: el.tagName.toLowerCase(),
          cls: (typeof el.className === 'string' ? el.className : '').slice(0, 60),
          x: Math.round(r.x), y: Math.round(r.y),
          w: Math.round(r.width), h: Math.round(r.height),
          position: cs.position, display: cs.display, overflow: cs.overflow,
          contain: cs.contain, maxHeight: cs.maxHeight, height: cs.height,
          minHeight: cs.minHeight, visibility: cs.visibility, opacity: cs.opacity,
          scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
        };
      };
      const frame = document.querySelector('${FRAME}');
      const slice = document.querySelector('.study-player-slice');
      const video = document.querySelector('${VIDEO}');
      // The chain from the video up to the frame is where a collapse has to happen.
      const chain = [];
      for (let el = video; el && el !== frame.parentElement; el = el.parentElement) {
        chain.push(box(el));
      }
      const vr = video.getBoundingClientRect();
      const cx = Math.round(vr.x + vr.width / 2);
      const cy = Math.round(vr.y + vr.height / 2);
      const hit = document.elementFromPoint(cx, cy);
      // The nav hit-test read false BOTH before and after the frame collapse was fixed
      // (proof/blanc-open-retry-20260801061000 vs -20260801062000), so it is not evidence
      // about the player. Record enough to say what it IS: a button scrolled out of the
      // 544x421 viewport hit-tests as null and looks identical to a covered one.
      // (No backticks in comments inside this template literal — they close it.)
      const nav = document.querySelector('.blanc-nav-btn');
      const nrect = nav?.getBoundingClientRect();
      const navPoint = nrect
        ? { x: Math.round(nrect.x + nrect.width / 2), y: Math.round(nrect.y + nrect.height / 2) }
        : null;
      const navHit = navPoint ? document.elementFromPoint(navPoint.x, navPoint.y) : null;
      const navDiag = {
        navFound: !!nav,
        navRect: nrect && { x: Math.round(nrect.x), y: Math.round(nrect.y),
                            w: Math.round(nrect.width), h: Math.round(nrect.height) },
        navPoint,
        navPointInsideViewport: !!navPoint && navPoint.x >= 0 && navPoint.y >= 0
          && navPoint.x <= innerWidth && navPoint.y <= innerHeight,
        whatIsAtNavPoint: navHit
          ? navHit.tagName.toLowerCase() + '.' + String(navHit.className).slice(0, 50)
          : null,
        navPointIsOverThePlayerFrame: !!(navHit && frame.contains(navHit)),
        scroll: { x: window.scrollX, y: window.scrollY },
      };
      return JSON.stringify({
        viewport: { w: innerWidth, h: innerHeight },
        frame: box(frame), slice: box(slice), video: box(video),
        chainFromVideoToFrame: chain,
        videoRendersPixels: typeof video.checkVisibility === 'function'
          ? video.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
          : null,
        videoCentre: { x: cx, y: cy },
        whatIsPaintedThere: hit ? hit.tagName.toLowerCase()
          + '.' + String(hit.className).slice(0, 40) : null,
        videoIsTheThingPaintedThere: hit === video || (!!hit && video.contains(hit)),
        // closest('.blanc-nav') was the first cut and it was WRONG, not a finding: the
        // first .blanc-nav-btn in the document is BlancShell's taskbar toggle, which
        // carries the class but sits OUTSIDE the nav element. It reported "nav not
        // clickable" in every run including the one where the frame was 392x0 and could
        // not have covered anything. The right question is whether the point over the
        // button we measured still hit-tests back to that same button.
        // (Again: no backticks in comments inside this template literal.)
        navStillClickable: !!(navHit && nav && navHit.closest('.blanc-nav-btn') === nav),
        navDiag,
        docScrollsSideways: document.documentElement.scrollWidth > innerWidth,
      });
    })()`));
    out.geometry = geom;
    const visible = geom.video.w > 0 && geom.video.h > 0;
    const insideFrame = visible && geom.frame.h > 0
      && geom.video.y >= geom.frame.y - 1
      && geom.video.y + geom.video.h <= geom.frame.y + geom.frame.h + 1;
    // The pass condition is about the PLAYER's geometry. The nav hit-test is recorded and
    // reported but deliberately not part of it: it read the same `false` when the frame was
    // 392x0 and could not have been covering anything, so it carries no information about
    // the player either way. `navDiag` is what makes it decidable on its own terms.
    step('4 the playing video occupies real space inside the toolbox frame',
      visible && insideFrame ? 'PASS' : 'FAIL',
      `frame ${geom.frame.w}x${geom.frame.h} (scrollHeight ${geom.frame.scrollHeight}), `
      + `slice ${geom.slice ? `${geom.slice.w}x${geom.slice.h} ${geom.slice.position}` : 'absent'}, `
      + `video ${geom.video.w}x${geom.video.h} at y ${geom.video.y}, visible=${geom.videoRendersPixels}`);
    const nd = geom.navDiag;
    step('5 Blanc\'s own nav is still reachable behind the player',
      geom.navStillClickable ? 'PASS' : 'FAIL',
      `nav rect ${JSON.stringify(nd.navRect)}, point ${JSON.stringify(nd.navPoint)} `
      + `inside viewport: ${nd.navPointInsideViewport}; at that point: ${nd.whatIsAtNavPoint}; `
      + `is that the player frame: ${nd.navPointIsOverThePlayerFrame}`);
  } else {
    step('4 the playing video occupies real space inside the toolbox frame', 'SKIPPED',
      'depends on step 2');
  }

  return { blanc, main };
}

let handles = null;
main()
  .then((h) => { handles = h; out.result = out.steps.some((s) => s.result === 'FAIL' && s.name.startsWith('2')) ? 'HYPOTHESIS-NOT-CONFIRMED' : 'DONE'; })
  .catch((err) => { out.result = 'ERROR'; out.error = String(err?.message ?? err); log(`ERROR ${out.error}`); })
  .finally(async () => {
    out.finishedAt = new Date().toISOString();
    out.log = logLines;
    // The server's own account of the same seconds. Copied rather than summarised: the
    // client trace says what the client did, and only this says what the sidecar made of
    // it. Taken in `finally` so it survives a step that throws.
    try {
      const logDir = DATA_DIR && path.join(DATA_DIR, 'logs');
      if (logDir && fs.existsSync(logDir)) {
        const newest = fs.readdirSync(logDir)
          .filter((f) => f.startsWith('seanime-') && f.endsWith('.log'))
          .map((f) => ({ f, m: fs.statSync(path.join(logDir, f)).mtimeMs }))
          .sort((a, b) => b.m - a.m)[0];
        if (newest) {
          fs.copyFileSync(path.join(logDir, newest.f), path.join(workRoot, `sidecar-${newest.f}`));
          out.sidecarLog = `sidecar-${newest.f}`;
        }
      }
    } catch (err) { out.sidecarLogError = String(err?.message ?? err); }
    fs.writeFileSync(path.join(workRoot, 'blanc-open-retry.json'), `${JSON.stringify(out, null, 2)}\n`);
    handles?.blanc?.close();
    handles?.main?.close();
    if (electron && !electron.killed) electron.kill();
    await sleep(500);
    // Windows does not reap a grandchild with its parent, and the sidecar is one.
    if (electron?.pid) {
      spawnSync('taskkill', ['/pid', String(electron.pid), '/T', '/F'],
        { windowsHide: true, stdio: 'ignore' });
    }
    console.log(`\nrecord: ${path.join(workRoot, 'blanc-open-retry.json')}`);
    process.exit(0);
  });
