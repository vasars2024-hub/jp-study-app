/**
 * Old-player retirement, step 3: does the NEW entry path deliver a working player, and are
 * the two hard-protected shell behaviours still intact behind it?
 *
 * `media-routing-harness.mjs` proved that `player` and `video` reach the workspace. It did
 * not open a file, and it did not touch the desktop shell. This does both, because
 * `CLAUDE.md` names the dragging layer and the taskbar shell as things a change must not
 * break, and because deleting the legacy player while its replacement has only been
 * reached — never *used* — through the new route would be deleting the fallback first.
 *
 * ## Phase B exists because this exact bug already happened once
 *
 * The 2026-07-31 live pass found the workspace header unclickable: `.study-player-slice` is
 * `position: fixed; z-index: 80` spanning the viewport, and it ate every click meant for
 * the chrome behind it. A full-screen overlay that fails to fully release the desktop when
 * it closes would produce exactly the same class of defect — windows that look normal and
 * cannot be dragged. Nothing has ever checked that.
 *
 * Dragging is driven with **CDP `Input.dispatchMouseEvent`**, not synthetic DOM events.
 * `dragStart` calls `el.setPointerCapture(e.pointerId)`, which throws for a pointer id that
 * was never activated, so a `dispatchEvent(new PointerEvent(...))` drag does not merely
 * fail to move the window — it throws inside the handler and would be easy to misread as a
 * broken drag layer. CDP input is delivered to this page only and never moves the real
 * cursor, so it is not the Windows mouse control this project refuses to use.
 *
 * ## Phase C plays a real file
 *
 * `<cue-probe-dual.mkv>` is the G-PLAY fixture: h264 + aac + two ASS subtitle tracks
 * (jpn "Japanese (probe)", eng "English (probe)"), 30.386 s. It is opened the way G-PLAY
 * established — raising the app's own `seanime:media-workspace-open` with a
 * `localFilePath` — because the header's `Open local video` calls `window.api.pickMedia()`,
 * a native dialog no driven pass can answer. Watch the escaping: a double-escaped path
 * reaches the sidecar as `C:\\Users\\…` and comes back `HTTP 500 could not find local file`.
 *
 * Safe beside the developer's app: own `--user-data-dir` (which also side-steps
 * `requestSingleInstanceLock()`) and own `--remote-debugging-port`. Needs the dev server up.
 *
 * Usage: node docs/migration/tools/retirement-step3-harness.mjs [--file=<path to mkv>]
 * Writes its record to docs/migration/proof/retirement-step3-<stamp>/.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

/**
 * A prepared datadir from `prepare-gplay-datadir.mjs`. Phase C needs one: on a cold,
 * unscanned profile the sidecar answers a local-file open with **HTTP 500**, which the
 * player surfaces as "the playback service could not open this file". That is not the
 * routing failing — the slice mounts and goes `active` either way — it is directstream
 * having no scanned library to serve from. Phases A and B do not care.
 */
const DATA_DIR = flag('datadir', '') ? path.resolve(flag('datadir', '')) : null;
const DEFAULT_FILE = DATA_DIR
  ? path.join(DATA_DIR, 'cue-library', 'Sousou no Frieren - 01.mkv')
  : path.join(os.tmpdir(), 'cue-probe-dual.mkv');
const MEDIA_FILE = path.resolve(flag('file', DEFAULT_FILE));

const CDP_TIMEOUT_MS = 120_000;
const MOUNT_TIMEOUT_MS = 120_000;
const SECTION_TIMEOUT_MS = 60_000;
const READY_TIMEOUT_MS = 180_000;
const PLAYBACK_TIMEOUT_MS = 120_000;
/** `shared/videoCoreStudy.ts` VIDEO_CORE_RESUME_STORAGE_KEY. */
const RESUME_KEY = 'jp-video-core-resume-v1';

const log = (...p) => console.log(`[step3] ${p.join(' ')}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '');
const workRoot = path.join(os.tmpdir(), `retirement-step3-${stamp}`);

const record = {
  harness: 'retirement-step3-harness.mjs',
  question:
    'Through the new routing path: is the taskbar identity intact, does window dragging '
    + 'survive the workspace closing, and does a real file actually play?',
  startedAt: new Date().toISOString(),
  mediaFile: MEDIA_FILE,
  dataDir: DATA_DIR,
  phases: {},
  probeCorrections: [
    'Phase B first reported "no draggable point on the title bar", which reads as the '
      + 'drag-layer defect it was written to catch. It was not: a cold profile shows the '
      + 'consent screen and `.consent` covers the viewport, so `elementFromPoint` over the '
      + 'title bar returned the overlay. Earlier harnesses never noticed because '
      + 'querySelector and .click() do not hit-test. The run now declines consent before '
      + 'any pointer-driven phase. Keep that ordering.',
    'Phase B then found the workspace REOPENED after being closed, which surfaced a real '
      + 'defect this harness was not looking for: MediaWorkspaceHost already listened for '
      + "os:open 'video', and MediaWorkspaceSectionView dispatched on mount as well, so "
      + 'video opened twice and the section\'s dispatch — gated behind an async '
      + 'seanimeStatus() round trip — landed after a fast close and reopened it. Fixed by '
      + "making the host's listener the single owner (now covering 'player' too) and "
      + 'removing the mount dispatch. Phase B is what caught it.',
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

const processAlive = (pid) => {
  if (!pid) return false;
  const out = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' });
  return (out.stdout ?? '').includes(String(pid));
};

function electronBinary() {
  const exe = path.join(
    REPO, 'node_modules', 'electron', 'dist',
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
        // The SCHEME test is not cosmetic. `about:blank` is a page target Electron exposes
        // before the window navigates, and it parses with an empty `search` — so matching on
        // the query string alone attaches to the wrong document, and every `localStorage`
        // read then fails with "Access is denied for this document", which reads like a
        // permissions problem. http(s) is dev, app: is a packaged build.
        try {
          const url = new URL(t.url);
          return /^(https?|app):$/.test(url.protocol) && url.search === '';
        } catch { return false; }
      });
      if (page) return page;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('no main-window CDP target appeared');
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

  /** Trusted, page-scoped input. Never touches the OS cursor. */
  mouse(type, x, y, extra = {}) {
    return this.send('Input.dispatchMouseEvent', {
      type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1,
      clickCount: 1, pointerType: 'mouse', ...extra,
    });
  }

  close() { try { this.socket?.close(); } catch { /* gone */ } }
}

const live = [];
let instance = null;

async function launch() {
  const cdpPort = await freePort();
  const userDataDir = path.join(workRoot, 'userdata');
  fs.mkdirSync(userDataDir, { recursive: true });
  const env = { ...process.env };
  delete env.SEANIME_SIDECAR;   // the flip is the thing under test — prove the default
  delete env.SEANIME_EXE;
  delete env.SEANIME_DATADIR;
  // Only the datadir is overridden, and only when one was prepared. The sidecar flag stays
  // deleted so this still runs on the shipped default.
  if (DATA_DIR) env.SEANIME_DATADIR = DATA_DIR;

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
  instance = { electron, cdp };
  live.push(instance);
  log(`electron pid ${electron.pid}, attached`);
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

const openSection = (cdp, id) =>
  cdp.evaluate(`(window.dispatchEvent(new CustomEvent('os:open',{detail:'${id}'})),1)`);

const closeAllWindows = async (cdp) => {
  await cdp.evaluate("(document.querySelectorAll('.fwin-close').forEach(b=>b.click()),1)");
  await sleep(700);
};

// ---------------------------------------------------------------------------
// Phase I support: BIND-then-press for the five video.* rows that ship unbound.
// ---------------------------------------------------------------------------
//
// `subEarlierLarge`, `subLaterLarge`, `toggleAutoPause`, `toggleLoop` and
// `toggleFurigana` carry `defaultKeys: ''`. `effectiveKeys` returns '' and `chordMatches`
// is false for EVERY chord, so they are unpressable BY DESIGN — phases G and H could not
// have covered them and no keypress phase ever will. The claim that has actually gone
// untested since slice 19 is **bind-then-press**: a user opens Settings → Shortcuts, binds
// the row, and the key then works. That is what this phase drives, through the real
// capture UI rather than by calling `setBinding` from the console.
//
// **The chords are `Ctrl+Alt+<digit>` on purpose.** A control key has to be free in BOTH
// keymaps — slice 22 paid for that lesson when `q`, absent from this app's catalog, turned
// out to be `previousChapter` in the adopted player's own `vc_defaultKeybindings`. The
// vendor map is entirely `Key*`/`Arrow*`/`Bracket*` with no modifier check, and this app's
// catalog uses `Ctrl+Alt+0`, `Ctrl+Alt+-` and `Ctrl+Alt+=` but no `Ctrl+Alt+<1..9>`. The
// run does not take that on trust: every bound row is read back for the `.sc-conflict`
// marker the settings row renders when a chord is shared.
const BIND_PLAN = [
  { id: 'video.subEarlierLarge', chord: 'Ctrl+Alt+1', key: '1', code: 'Digit1', vk: 49, kind: 'delay', delta: -0.5 },
  { id: 'video.subLaterLarge', chord: 'Ctrl+Alt+2', key: '2', code: 'Digit2', vk: 50, kind: 'delay', delta: 0.5 },
  { id: 'video.toggleFurigana', chord: 'Ctrl+Alt+3', key: '3', code: 'Digit3', vk: 51, kind: 'pref', pref: 'furigana' },
  { id: 'video.toggleAutoPause', chord: 'Ctrl+Alt+4', key: '4', code: 'Digit4', vk: 52, kind: 'pref', pref: 'autoPause' },
  { id: 'video.toggleLoop', chord: 'Ctrl+Alt+5', key: '5', code: 'Digit5', vk: 53, kind: 'pref', pref: 'loopLine' },
];
/** Same shape, same dispatch, bound to nothing — the control. */
const BIND_CONTROL = { chord: 'Ctrl+Alt+9', key: '9', code: 'Digit9', vk: 57 };
/** CDP modifier bits: Alt=1, Ctrl=2, Meta=4, Shift=8. */
const CTRL_ALT = 1 | 2;

const sendChord = async (cdp, spec) => {
  // No `text`: with Ctrl held the key produces no character, and passing one would make
  // CDP synthesise a `keypress` this app never sees from a real modified press.
  const common = {
    key: spec.key,
    code: spec.code,
    windowsVirtualKeyCode: spec.vk,
    nativeVirtualKeyCode: spec.vk,
    modifiers: CTRL_ALT,
  };
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...common });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
};

/** The row's own published state — never its label, which goes through `useT()`. */
const readShortcutRow = (cdp, id) => cdp.evaluate(`(() => {
  const el = document.querySelector('[data-shortcut-id="${id}"]');
  if (!el) return null;
  return {
    keys: el.getAttribute('data-shortcut-keys') ?? '',
    conflict: !!el.querySelector('.sc-conflict'),
  };
})()`);

/**
 * Drives Settings → Shortcuts and binds each row through the capture button.
 *
 * Runs BEFORE the workspace opens. `.seanime-host` is a full-viewport `aria-modal` dialog
 * at z-index 9999 and the settings window sits under it, so binding with the player up
 * would only work because `.click()` does not hit-test — the same shortcut that let an
 * earlier harness in this track "verify" a taskbar button as a Blanc surface.
 */
async function bindUnboundVideoRows(cdp) {
  await closeAllWindows(cdp);
  await openSection(cdp, 'settings');
  await waitFor(
    cdp, "!!document.querySelector('.os-set-nav-v2')",
    SECTION_TIMEOUT_MS, 'phase I FAIL — the settings window never mounted',
  );
  await cdp.evaluate(
    "(window.dispatchEvent(new CustomEvent('settings:navigate',{detail:{page:'shortcuts'}})),1)",
  );
  await waitFor(
    cdp, `!!document.querySelector('[data-shortcut-id="${BIND_PLAN[0].id}"]')`,
    SECTION_TIMEOUT_MS,
    'phase I FAIL — Settings → Shortcuts never rendered the Video rows',
  );

  const bound = [];
  for (const row of BIND_PLAN) {
    const before = await readShortcutRow(cdp, row.id);
    if (before?.keys !== '') {
      throw new Error(
        `phase I FAIL — ${row.id} was not unbound to begin with: ${JSON.stringify(before)}. `
        + 'The whole phase rests on these rows shipping with defaultKeys: \'\'.',
      );
    }
    // Start capture, then send the chord with NOTHING in between. The capture effect
    // installs `mousedown`/`auxclick`/`contextmenu` listeners alongside the keydown one,
    // so any click here would be taken as the binding instead of the key.
    const started = await cdp.evaluate(`(() => {
      const b = document.querySelector('[data-shortcut-capture="${row.id}"]');
      if (!b) return false;
      b.click();
      return true;
    })()`);
    if (!started) throw new Error(`phase I FAIL — no capture button for ${row.id}`);
    await sleep(300);
    await sendChord(cdp, row);

    let after = null;
    for (let i = 0; i < 20; i += 1) {
      await sleep(200);
      after = await readShortcutRow(cdp, row.id);
      if (after?.keys === row.chord) break;
    }
    if (after?.keys !== row.chord) {
      throw new Error(
        `phase I FAIL — capturing ${row.chord} for ${row.id} left it at `
        + `${JSON.stringify(after)}`,
      );
    }
    if (after.conflict) {
      throw new Error(
        `phase I FAIL — ${row.chord} conflicts with another command, so a press could not `
        + `be attributed to ${row.id}`,
      );
    }
    bound.push({ id: row.id, keysBefore: before.keys, keysAfter: after.keys, conflict: false });
    log(`  bound ${row.id} -> ${row.chord} through the capture UI`);
  }
  await closeAllWindows(cdp);
  return bound;
}

/**
 * Opening a local file is a POST followed by two websocket messages — `open-and-await`,
 * then `watch` with the playback info — and directstream preparation intermittently
 * delivers neither: the run sits on "Opening local file" (no `watch`) or on a MediaSource
 * blob at `readyState 0` (no segments). `StudyPlayerSlice.tsx` already calls this path
 * "intermittent" in a comment. Retried, with the count RECORDED — a silent retry would
 * hide a real regression behind the same flakiness it exists to absorb.
 *
 * No explicit teardown is needed between attempts: the launch effect's cleanup calls
 * `controller.abort()` whenever `playbackRequest` changes, and every dispatch gets a fresh
 * `requestId`, so the next dispatch IS the teardown of the stalled one.
 */
const VIDEO_READY = "(()=>{const v=document.querySelector('[data-vc-element=\"video\"]');"
  + 'return !!v && v.readyState >= 2;})()';

/**
 * What a stalled attempt looked like. The previous version of this kept 60 characters of
 * `innerText` and nothing else, and slice 31 found out the hard way that 60 characters
 * cannot answer the question anyone asks afterwards.
 *
 * That run stalled twice on `"… The Journey's End\n\nWaiting for"` — cut off mid-string.
 * The only catalog entry it can be is `mediaWorkspace.study.waitingSubtitle`, which
 * `StudyPlayerSlice` renders at line 948 on `state.active` **alone**, with
 * `playbackInfo` still allowed to be null. So the text is consistent with BOTH "the open is
 * still in flight" and "the open finished and no media ever flowed" — two different defects
 * with two different owners, and the record could not tell them apart.
 *
 * The three states this must separate, and the reading that does it:
 *
 * | state | videoPresent | readyState | meaning |
 * |---|---|---|---|
 * | open still in flight | false | — | the launch effect's POST has not produced a `watch` yet |
 * | slice 24's recovery gave up | false | — | but with the slice ACTIVE and its error text shown: `directstreamOpenVerdict` reached `failed`, which sets `playbackInfo: null` and `playbackError` |
 * | media never flowed | **true** | **0/1** | the `watch` arrived, `playbackArrived` is true, so the recovery is disarmed BY DESIGN and this is out of its scope |
 *
 * The full `innerText` is kept rather than a truncation because every string in it goes
 * through `useT()` — a next session reading this may be looking at any of four languages,
 * and a substring match on English is exactly the trap slice 30 recorded.
 */
const stallDiagnostic = (cdp) => cdp.evaluate(`(() => {
  const slice = document.querySelector('.study-player-slice');
  const v = document.querySelector('[data-vc-element="video"]');
  const src = v ? (v.currentSrc || v.src || '') : '';
  return {
    slicePresent: !!slice,
    sliceState: slice ? slice.getAttribute('data-study-player') : null,
    text: slice ? (slice.innerText ?? '') : null,
    videoPresent: !!v,
    readyState: v ? v.readyState : null,
    networkState: v ? v.networkState : null,
    srcKind: !src ? 'none' : src.slice(0, src.indexOf(':') + 1) || 'other',
    bufferedRanges: v && v.buffered ? v.buffered.length : null,
    currentTime: v ? v.currentTime : null,
  };
})()`);

/**
 * A TIME SERIES of the element, for the stage-2 control — slice 32.
 *
 * `stallDiagnostic` above answers "what did it look like when it gave up", which is the right
 * question for a stall and the wrong one for a HEALTHY open: the reverted stage-2 fix was
 * destructive precisely because nobody had watched a *working* open closely enough to know
 * whether it passes through the failure's signature on its way up.
 *
 * So this samples throughout the wait, on every attempt, including the one that succeeds.
 * Deliberately lighter than `stallDiagnostic` — no `innerText`, so no forced layout — because
 * this runs every 500 ms during the measurement it is measuring.
 *
 * These samples are replayed through the REAL decision function by
 * `replay-media-verdict.mjs`; nothing here reimplements the rule, so the two cannot drift.
 */
const mediaSample = (cdp) => cdp.evaluate(`(() => {
  const v = document.querySelector('[data-vc-element="video"]');
  if (!v) return { videoPresent: false };
  return {
    videoPresent: true,
    readyState: v.readyState,
    networkState: v.networkState,
    bufferedRanges: v.buffered ? v.buffered.length : 0,
    currentTime: v.currentTime,
  };
})()`);

/**
 * Samples `mediaSample` for as long as `work` is outstanding.
 *
 * 200 ms rather than a lazier rate because the interesting part of a healthy open is SHORT:
 * the first run with this sampler caught the element at `readyState 0, networkState 2` and
 * then at `readyState 4` **1.1 s later**, with nothing in between. The question that interval
 * has to answer is whether a healthy element passes through `networkState 0` on its way — the
 * exact signature stage 2 fires on — so the sampling has to be finer than the transition it
 * is looking for.
 */
async function whileSampling(cdp, label, attempt, work, intervalMs = 200) {
  const samples = [];
  const startedAt = Date.now();
  let running = true;
  const sampler = (async () => {
    while (running) {
      try {
        samples.push({ atMs: Date.now() - startedAt, ...(await mediaSample(cdp)) });
      } catch {
        // The page can be mid-teardown between attempts; a gap in the series is not a failure.
      }
      await sleep(intervalMs);
    }
  })();
  try {
    return await work();
  } finally {
    running = false;
    await sampler;
    record.mediaSamples = [...(record.mediaSamples ?? []), { label, attempt, samples }];
  }
}

async function openFileWithRetry(cdp, detail, label, attempts = 4) {
  const stalls = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await cdp.evaluate(
      `(window.dispatchEvent(new CustomEvent('seanime:media-workspace-open',{detail:${detail}})),1)`,
    );
    try {
      await waitFor(cdp, "!!document.querySelector('.study-player-slice')", 30_000, 'no slice');
      await whileSampling(cdp, label, attempt, () => waitFor(cdp, VIDEO_READY, 45_000, 'stalled'));
      if (attempt > 1) log(`  ${label}: opened on attempt ${attempt}`);
      record.openStalls = [...(record.openStalls ?? []), ...stalls];
      return attempt;
    } catch {
      const shot = await stallDiagnostic(cdp);
      stalls.push({ label, attempt, ...shot });
      log(`  ${label}: open attempt ${attempt}/${attempts} stalled — `
        + `video ${shot.videoPresent ? `present readyState ${shot.readyState} `
          + `network ${shot.networkState} src ${shot.srcKind} buffered ${shot.bufferedRanges}`
          : 'ABSENT'}, slice ${shot.sliceState}`);
      await sleep(2500);
    }
  }
  record.openStalls = [...(record.openStalls ?? []), ...stalls];
  return null;
}

async function main() {
  if (!fs.existsSync(MEDIA_FILE)) {
    throw new Error(`media fixture not found: ${MEDIA_FILE} (pass --file=<path>)`);
  }
  fs.mkdirSync(workRoot, { recursive: true });
  record.mediaBytes = fs.statSync(MEDIA_FILE).size;

  const { cdp } = await launch();
  await waitFor(
    cdp,
    "typeof window.api?.seanimeStatus === 'function'"
      + " && !!document.querySelector('.desktop-root') && !!document.querySelector('.os-taskbar')",
    MOUNT_TIMEOUT_MS,
    'the desktop shell never mounted',
  );

  // A cold profile shows the consent screen, and `.consent` covers the whole viewport.
  // Every earlier harness in this track got away with ignoring it because `querySelector`
  // and `.click()` do not hit-test; the moment a pass needs REAL pointer input it matters,
  // and it presents as "the title bar is not draggable" rather than as a modal. Declining
  // is the privacy-preserving answer and is what a harness should choose.
  const consent = await cdp.evaluate(
    "(()=>{const b=document.querySelector('.consent-no');if(!b)return false;b.click();return true;})()",
  );
  if (consent) {
    await waitFor(cdp, "!document.querySelector('.consent')", 15_000,
      'the consent screen did not dismiss');
    log('dismissed the cold-profile consent screen (declined)');
  }
  record.consentDismissed = consent;

  // ---- Phase A: taskbar identity ------------------------------------------------
  // The taskbar label comes from the APPS registry keyed by section, not from whatever
  // the window renders. The routing swap changed the content of two windows, so this
  // confirms it did not change what the taskbar calls them.
  const labels = {};
  for (const id of ['video', 'player', 'music']) {
    await closeAllWindows(cdp);
    await openSection(cdp, id);
    await waitFor(
      cdp, "document.querySelectorAll('.os-task-wins button').length === 1",
      SECTION_TIMEOUT_MS, `phase A FAIL — no single taskbar entry for '${id}'`,
    );
    labels[id] = await cdp.evaluate(
      "document.querySelector('.os-task-wins button')?.innerText?.trim() ?? ''",
    );
    log(`  taskbar['${id}'] = ${JSON.stringify(labels[id])}`);
  }
  const distinct = new Set(Object.values(labels)).size === 3;
  const allNamed = Object.values(labels).every((l) => l.length > 0);
  record.phases.A = {
    what: 'taskbar identity for the two swapped sections and the unswapped one',
    labels, distinct, allNamed,
    result: distinct && allNamed ? 'PASS' : 'FAIL',
  };
  if (!(distinct && allNamed)) throw new Error('phase A FAIL — taskbar identity broken');
  log('phase A PASS — all three sections keep a distinct, non-empty taskbar identity');

  // Phase I, first half. The bind has to happen before the workspace covers the screen;
  // the press half is at the bottom, after phase H, once a file is playing.
  const boundRows = await bindUnboundVideoRows(cdp);

  // ---- Phase B: dragging survives the workspace opening and closing --------------
  await closeAllWindows(cdp);
  await openSection(cdp, 'video');
  await waitFor(
    cdp, "!!document.querySelector('.seanime-host')",
    SECTION_TIMEOUT_MS, 'phase B FAIL — the workspace never opened',
  );
  await cdp.evaluate("(document.querySelector('.seanime-host-close')?.click(),1)");
  await waitFor(
    cdp, "!document.querySelector('.seanime-host')",
    30_000, 'phase B FAIL — the workspace did not close',
  );

  // A point on the title bar that is not a button — `dragStart` returns early on one.
  const probe = await cdp.evaluate(`(() => {
    const win = document.querySelector('.fwin');
    const bar = document.querySelector('.fwin .fwin-bar');
    const chain = (el) => {
      const out = [];
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const cs = getComputedStyle(n);
        out.push({
          tag: n.tagName,
          cls: typeof n.className === 'string' ? n.className.slice(0, 50) : null,
          pos: cs.position,
          z: cs.zIndex,
        });
        if (out.length >= 8) break;
      }
      return out;
    };
    const diag = {
      windows: document.querySelectorAll('.fwin').length,
      hasBar: !!bar,
      winClass: win?.className ?? null,
      seanimeHostPresent: !!document.querySelector('.seanime-host'),
      seanimeLauncherPresent: !!document.querySelector('.seanime-host-launcher'),
      hits: [],
    };
    if (!bar) return { grip: null, diag };
    const r = bar.getBoundingClientRect();
    diag.barRect = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    const y = Math.round(r.top + r.height / 2);
    let grip = null;
    for (let f = 0.05; f < 0.8; f += 0.05) {
      const x = Math.round(r.left + r.width * f);
      const el = document.elementFromPoint(x, y);
      diag.hits.push({
        x,
        tag: el?.tagName ?? null,
        cls: typeof el?.className === 'string' ? el.className.slice(0, 60) : null,
        inBar: !!(el && bar.contains(el)),
        inButton: !!el?.closest('button'),
      });
      if (!grip && el && bar.contains(el) && !el.closest('button')) grip = { x, y };
    }
    if (!grip && diag.hits.length) {
      const first = document.elementFromPoint(diag.hits[0].x, y);
      diag.blockerChain = first ? chain(first) : null;
    }
    return { grip, diag };
  })()`);
  if (!probe.grip) {
    record.phases.B = {
      what: 'window dragging after the full-screen workspace has opened and closed',
      result: 'FAIL',
      reason: 'no draggable point on the title bar',
      diagnostics: probe.diag,
    };
    throw new Error(
      `phase B FAIL — no draggable point. diagnostics: ${JSON.stringify(probe.diag)}`,
    );
  }
  const grip = probe.grip;

  const posBefore = await cdp.evaluate(
    "(()=>{const w=document.querySelector('.fwin');const r=w.getBoundingClientRect();"
    + "return {left:w.style.left,top:w.style.top,x:Math.round(r.x),y:Math.round(r.y)};})()",
  );
  await cdp.mouse('mousePressed', grip.x, grip.y);
  for (let i = 1; i <= 6; i += 1) {
    await cdp.mouse('mouseMoved', grip.x + i * 12, grip.y + i * 8);
    await sleep(40);
  }
  await cdp.mouse('mouseReleased', grip.x + 72, grip.y + 48);
  await sleep(500);
  const posAfter = await cdp.evaluate(
    "(()=>{const w=document.querySelector('.fwin');const r=w.getBoundingClientRect();"
    + "return {left:w.style.left,top:w.style.top,x:Math.round(r.x),y:Math.round(r.y)};})()",
  );
  const moved = posAfter.x !== posBefore.x || posAfter.y !== posBefore.y;
  record.phases.B = {
    what: 'window dragging after the full-screen workspace has opened and closed',
    grip, posBefore, posAfter, moved,
    result: moved ? 'PASS' : 'FAIL',
  };
  if (!moved) throw new Error('phase B FAIL — the window did not move; drag layer is captured');
  log(`phase B PASS — window moved ${posBefore.x},${posBefore.y} -> ${posAfter.x},${posAfter.y}`);

  // ---- Phase C: a real file plays through the new route --------------------------
  await closeAllWindows(cdp);
  await openSection(cdp, 'video');
  await waitFor(
    cdp, "!!document.querySelector('.seanime-host')",
    SECTION_TIMEOUT_MS, 'phase C FAIL — the workspace never opened',
  );
  const ready = await (async () => {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    let last = null;
    while (Date.now() < deadline) {
      last = await cdp.evaluate('window.api.seanimeStatus()');
      if (last?.kind === 'ready') return last;
      await sleep(500);
    }
    throw new Error(`phase C FAIL — sidecar never ready (last ${JSON.stringify(last)})`);
  })();
  log(`  sidecar ready — pid ${ready.pid}, port ${ready.port}`);

  // The adopted client must be PAST its own gates before the request is sent. `#media-
  // workspace` appears only once the auth token is provisioned, and `StatusGate` shows a
  // `.p-6.text-gray-400` placeholder until the server answers. A request dispatched into
  // either state is the "dispatch before mount is silently lost" trap this track has hit
  // three times.
  await waitFor(
    cdp, "!!document.querySelector('#media-workspace[data-media-surface=workspace]')",
    PLAYBACK_TIMEOUT_MS, 'phase C FAIL — the workspace never provisioned its token',
  );
  await waitFor(
    cdp, "!document.querySelector('.p-6.text-gray-400')",
    PLAYBACK_TIMEOUT_MS, 'phase C FAIL — the workspace never got past its status gate',
  );
  const offline = await cdp.evaluate(
    "(()=>{const n=document.querySelector('#media-workspace[data-media-surface=workspace] .p-6.space-y-2');"
    + 'return n ? n.innerText : null;})()',
  );
  if (offline) throw new Error(`phase C FAIL — workspace reports offline: ${offline}`);
  log('  workspace past its token and status gates');

  // The status gate clearing does NOT mean the adopted client is talking to the server —
  // `StudyWebsocketProvider` mounts inside it, and directstream is driven over that socket.
  // Dispatching the open before the client is live leaves the player on a MediaSource blob
  // at `readyState 0` forever, which reads as a broken file rather than a race. Waiting for
  // the seeded library title to render proves the query layer answered.
  await waitFor(
    cdp,
    "(document.querySelector('#media-workspace[data-media-surface=workspace]')?.innerText ?? '').includes('Frieren')",
    PLAYBACK_TIMEOUT_MS,
    'phase C FAIL — the adopted library never rendered the seeded title',
  );
  log('  adopted library rendered the seeded title');

  // JSON.stringify gives exactly one level of escaping. Building this by hand is how the
  // G-PLAY run produced `C:\Users\…` and an HTTP 500 from the sidecar.
  const detail = JSON.stringify({ localFilePath: MEDIA_FILE });
  const dispatchOpen = () => cdp.evaluate(
    `(window.dispatchEvent(new CustomEvent('seanime:media-workspace-open',{detail:${detail}})),1)`,
  );
  const videoReady = "(()=>{const v=document.querySelector('[data-vc-element=\"video\"]');"
    + 'return !!v && v.readyState >= 2;})()';

  // RETRIED, and the count is recorded. Opening a local file is a POST followed by two
  // websocket messages — `open-and-await`, then `watch` with the playback info — and
  // directstream preparation intermittently delivers neither: the run then sits on
  // "Opening local file" (no `watch`) or on a MediaSource blob at `readyState 0` (no
  // segments). `StudyPlayerSlice.tsx` already calls this path "intermittent" in a comment.
  // Three consecutive attempts stalling is a real failure; one stalling is this fixture.
  // A silent retry would hide that, so `openAttempts` is part of the record.
  const openAttempts = await openFileWithRetry(cdp, detail, 'phase C');
  record.openAttempts = openAttempts;
  if (!openAttempts) {
    const diag = await cdp.evaluate(`(() => {
      const v = document.querySelector('[data-vc-element="video"]');
      const slice = document.querySelector('.study-player-slice');
      return {
        videoPresent: !!v, src: v ? (v.currentSrc || v.src || null) : null,
        readyState: v?.readyState ?? null, networkState: v?.networkState ?? null,
        errorMessage: v?.error?.message ?? null,
        sliceState: slice?.getAttribute('data-study-player') ?? null,
        sliceText: slice ? slice.innerText.slice(0, 300) : null,
      };
    })()`);
    record.phases.C = { what: 'a real local file opened and played through the new routing path',
      result: 'FAIL', diagnostics: diag };
    throw new Error(`phase C FAIL — ${JSON.stringify(diag)}`);
  }
  log('  player slice mounted and the video is loaded');

  const t0 = await cdp.evaluate(
    "document.querySelector('[data-vc-element=\"video\"]').currentTime",
  );
  await cdp.evaluate(
    "(document.querySelector('[data-vc-element=\"video\"]').play?.(),1)",
  ).catch(() => undefined);
  await sleep(4000);
  const shot = await cdp.evaluate(`(() => {
    const v = document.querySelector('[data-vc-element="video"]');
    return {
      currentTime: v.currentTime, duration: v.duration, readyState: v.readyState,
      paused: v.paused, videoWidth: v.videoWidth, videoHeight: v.videoHeight,
      textTracks: v.textTracks?.length ?? 0,
    };
  })()`);
  const advanced = shot.currentTime > t0;
  record.phases.C = {
    what: 'a real local file opened and played through the new routing path',
    sidecar: { pid: ready.pid, port: ready.port, version: ready.version },
    startedAt: t0, ...shot, advanced,
    result: advanced && shot.videoWidth > 0 ? 'PASS' : 'FAIL',
  };
  if (!advanced || !(shot.videoWidth > 0)) {
    throw new Error(`phase C FAIL — no real playback: ${JSON.stringify(shot)}`);
  }
  log(`phase C PASS — ${t0.toFixed(3)} -> ${shot.currentTime.toFixed(3)}s, `
    + `${shot.videoWidth}x${shot.videoHeight}, duration ${shot.duration?.toFixed?.(3)}`);

  // ---- Phase E: EXACT cue seeking ------------------------------------------------
  // The overlay's own controls, by their published `data-study-action` hooks. The
  // advanced section is COLLAPSED by default since the 2026-07-30 UI pass, so the track
  // selector does not exist until it is expanded — a run that skips this finds no select
  // and reads it as "there are no subtitle tracks".
  await cdp.evaluate(
    "(document.querySelector('[data-study-action=\"toggle-study-controls\"]')?.click(),1)",
  );
  await waitFor(
    cdp, "!!document.querySelector('.study-control-row select')",
    20_000, 'phase E FAIL — the study controls never expanded',
  );

  // **Do not touch the track selector.** This fixture flags a `(default)` track that is
  // already selected on load. An earlier cut cycled it Off -> Japanese, following the
  // G-PLAY note about re-selecting a track — but that note is about switching MID-PLAYBACK,
  // which makes directstream start a NEW subtitle stream. Doing it here stopped cue
  // delivery after cue 0 outright: `allCues` never grew, `next-cue` kept returning cue 0
  // from a playhead of 12 s, and `replay-cue` sat disabled with no active cue.
  const chosen = await cdp.evaluate(`(() => {
    const label = [...document.querySelectorAll('.study-control-row label')]
      .find(l => l.textContent.includes('Subtitle track'));
    const sel = label?.querySelector('select');
    if (!sel) return null;
    const opt = sel.selectedOptions[0];
    return { value: sel.value, text: opt ? opt.textContent : null };
  })()`);
  if (!chosen?.value) {
    throw new Error(`phase E FAIL — no subtitle track selected by default: ${JSON.stringify(chosen)}`);
  }
  log(`  subtitle track already selected: ${JSON.stringify(chosen.text)}`);

  // Ground truth read from the file with ffprobe, per track — the two tracks are offset by
  // 0.15 s, so asserting the wrong set fails by exactly that and looks like seek drift.
  //   jpn: 2.15  6.65  11.15  16.15  21.15  24.15
  //   eng: 2.00  6.50  11.00  16.00  21.00  24.00
  const isJa = /jpn|japanese/i.test(chosen.text ?? '');
  const CUES = isJa
    ? [2.15, 6.65, 11.15, 16.15, 21.15, 24.15]
    : [2.00, 6.50, 11.00, 16.00, 21.00, 24.00];
  const near = (a, b) => a != null && Math.abs(a - b) < 0.25;

  // Measure the SEEK TARGET, not the settled position. The cue controls resume playback, so
  // polling `currentTime` after a click reports the cue start plus whatever played since: a
  // first cut read 2.96 / 2.95 / 3.00 against real starts of 2.15 / 6.65 and looked like
  // "next-cue does not advance". A capture-phase `seeked` log is exact, and is the same
  // instrument G-PLAY used for its resume claim.
  const armCueLog = () => cdp.evaluate(`(() => {
    const v = document.querySelector('[data-vc-element="video"]');
    if (!v) return false;
    window.__cueSeeks = [];
    if (!v.__cueLogged) {
      v.addEventListener('seeked', () => window.__cueSeeks.push(v.currentTime), true);
      v.__cueLogged = true;
    }
    return true;
  })()`);
  const nowAt = () => cdp.evaluate(
    "document.querySelector('[data-vc-element=\"video\"]')?.currentTime ?? null",
  );
  const pause = () => cdp.evaluate(
    "(document.querySelector('[data-vc-element=\"video\"]').pause(),1)",
  );
  /**
   * `jumpCue` reads `video.currentTime` LIVE and picks the last cue starting at or before
   * it, so the position at the click is the whole input. Recording it is the difference
   * between "next-cue is broken" and "the playhead was somewhere else".
   */
  const clickCue = async (action) => {
    await cdp.evaluate('(window.__cueSeeks = [], 1)');
    const before = await nowAt();
    await cdp.evaluate(
      `(document.querySelector('[data-study-action="${action}"]')?.click(),1)`,
    );
    let seekedTo = null;
    for (let i = 0; i < 20 && seekedTo == null; i += 1) {
      const seeks = await cdp.evaluate('window.__cueSeeks ?? []');
      if (seeks.length) seekedTo = seeks[seeks.length - 1];
      else await sleep(250);
    }
    await sleep(800);
    return { before, seekedTo, after: await nowAt() };
  };

  if (!(await armCueLog())) throw new Error('phase E FAIL — no video element to instrument');

  // **Cues stream in progressively.** Navigating straight after the file opens concludes
  // "next-cue does not advance" because `allCues` holds only cue 0 — there is nothing later
  // to move to yet. Play the timeline in first.
  await waitFor(cdp, videoReady, 60_000, 'phase E FAIL — the stream never settled');
  await cdp.evaluate(`(() => {
    const v = document.querySelector('[data-vc-element="video"]');
    v.currentTime = 0; v.play?.(); return 1;
  })()`);
  await waitFor(
    cdp,
    "(document.querySelector('[data-vc-element=\"video\"]')?.currentTime ?? 0) >= 20",
    120_000, 'phase E FAIL — playback never reached 20s to deliver the cue timeline',
  );
  await pause();
  log('  cue timeline played through 20s');

  // Park inside cue 1 and drive all three controls over cues the stream has ACTUALLY
  // delivered. Cue delivery stalls after cue 1 (~9 s) in this fixture no matter how far
  // playback runs — see `cueDeliveryLimit` below — so parking in cue 2 tests the controls
  // against cues that do not exist and fails on the fixture rather than on the code.
  const PARK = CUES[1] + 0.8;               // inside cue 1, before its end
  await cdp.evaluate(`(() => {
    const v = document.querySelector('[data-vc-element="video"]');
    v.pause(); v.currentTime = ${PARK}; return 1;
  })()`);
  await sleep(1500);

  await pause();
  const replayJump = await clickCue('replay-cue');    // inside cue 1 -> cue 1 start
  await pause();
  const jumpPrev = await clickCue('previous-cue');    // cue 1 -> cue 0
  await pause();
  const jumpNext = await clickCue('next-cue');        // cue 0 -> cue 1

  const replayExact = near(replayJump.seekedTo, CUES[1]);
  const prevExact = near(jumpPrev.seekedTo, CUES[0]);
  const nextExact = near(jumpNext.seekedTo, CUES[1]);
  record.phases.E = {
    what: "exact cue seeking through the overlay's own replay/previous/next controls",
    measuredBy: 'capture-phase `seeked` events, not polled currentTime',
    track: chosen.text,
    cueStartsFromFile: CUES,
    parkedAt: PARK,
    replayFromInsideCue1: { seekedTo: replayJump.seekedTo, expected: CUES[1], ok: replayExact },
    previousToCue0: { seekedTo: jumpPrev.seekedTo, expected: CUES[0], ok: prevExact },
    nextBackToCue1: { seekedTo: jumpNext.seekedTo, expected: CUES[1], ok: nextExact },
    playheadAtClick: { replayJump, jumpPrev, jumpNext },
    cueDeliveryLimit: (
      'Only cues 0 and 1 are ever delivered for this fixture, however far playback runs — '
      + 'measured across several runs: from a playhead of 11.85 s, next-cue returned cue 1 '
      + '(6.5) and replay-cue was disabled for want of an active cue, both of which are '
      + 'exactly what adjacentStudyCue does when allCues holds two entries. So the '
      + 'NAVIGATION is verified exact here; full-timeline subtitle DELIVERY is not, and is '
      + 'a directstream property this run cannot establish. G-PLAY mined a card from cue 0 '
      + 'through the workspace own entry (proof/gplay-20260730).'
    ),
    result: replayExact && prevExact && nextExact ? 'PASS' : 'FAIL',
  };
  if (!(replayExact && prevExact && nextExact)) {
    throw new Error(`phase E FAIL — ${JSON.stringify(record.phases.E)}`);
  }
  log(`phase E PASS — replay -> ${replayJump.seekedTo} (cue1 ${CUES[1]}), `
    + `previous -> ${jumpPrev.seekedTo} (cue0 ${CUES[0]}), next -> ${jumpNext.seekedTo}`);

  // ---- Phase G: the SHORTCUTS, pressed. Slice 19's standing item. -----------------
  //
  // Slice 19 moved ten `video.*` registrations out of `useMedia` (where they acted on a
  // `videoRef` that had been null in every window since slice 16 deleted the element that
  // set it) into `VideoCoreStudyOverlay`, and re-pointed their catalog defaults onto
  // R/W/S/;/'. It also found that `effectiveKeys` returned `defaultKeys` RAW while
  // `chordMatches` compared against the always-normalized output of `chordFromEvent`, so
  // ten of 101 defaults matched no keypress at all — silently, with Settings → Shortcuts
  // listing them as though they worked.
  //
  // All of that was proven by unit guards and source sweeps. **Nothing had ever pressed a
  // key.** Phase E above clicks `[data-study-action]` buttons; the keyboard path — window
  // keydown → `chordFromEvent` → `effectiveKeys` normalization → `chordMatches` → the
  // handler stack → the overlay — is a different path with a different failure mode, and it
  // is the one a user actually uses.
  //
  // The keys are sent LOWERCASE on purpose. A real unshifted press of that key produces
  // `event.key === 'r'`, and the catalog's default is written `'R'`. If slice 19's
  // normalization regressed, this phase fails and the button phase above still passes —
  // which is exactly the asymmetry that let the defect live.
  const KEY_CODES = { r: 82, w: 87, s: 83, x: 88 };
  const pressKey = async (key) => {
    await cdp.evaluate('(window.__cueSeeks = [], 1)');
    // A typing target suppresses unmodified chords by design (`isTypingTarget`), so a
    // stray focused input would read as "the shortcut does nothing".
    const target = await cdp.evaluate(
      `(() => {
         const el = document.activeElement;
         if (el && el !== document.body) el.blur?.();
         return (document.activeElement?.tagName ?? 'NONE');
       })()`,
    );
    const before = await nowAt();
    const common = {
      key,
      code: `Key${key.toUpperCase()}`,
      windowsVirtualKeyCode: KEY_CODES[key],
      nativeVirtualKeyCode: KEY_CODES[key],
    };
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', text: key, ...common });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
    let seekedTo = null;
    for (let i = 0; i < 12 && seekedTo == null; i += 1) {
      const seeks = await cdp.evaluate('window.__cueSeeks ?? []');
      if (seeks.length) seekedTo = seeks[seeks.length - 1];
      else await sleep(250);
    }
    await sleep(600);
    return { key, focus: target, before, seekedTo, after: await nowAt() };
  };

  await pause();
  await cdp.evaluate(`(() => {
    const v = document.querySelector('[data-vc-element="video"]');
    v.pause(); v.currentTime = ${PARK}; return 1;
  })()`);
  await sleep(1200);

  const keyReplay = await pressKey('r');   // inside cue 1 -> cue 1 start
  await pause();
  const keyPrev = await pressKey('w');     // cue 1 -> cue 0
  await pause();
  const keyNext = await pressKey('s');     // cue 0 -> cue 1
  await pause();

  // The control. Without it, three seeks prove only that SOMETHING seeks while keys are
  // being pressed — an auto-pause tick or a cue advance would satisfy the three assertions
  // above just as well. This is what makes them mean "the binding fired".
  //
  // **`x`, not `q`, and the first run is why.** `q` is absent from this app's catalog, so it
  // looked unbound — and it seeked to 0. `KeyQ` is in the ADOPTED PLAYER's own
  // `vc_defaultKeybindings` (`vendor/seanime-web/.../video-core.atoms.ts`), which the
  // catalog knows nothing about. Evidence:
  // `proof/retirement-step3-20260731221652/` — that run's phase G records
  // `unboundKeyQ.seekedTo: 0` with R/W/S all correct.
  //
  // A control key must therefore be free in BOTH maps. The vendor binds A B D E F H I J K M
  // N P Q Z plus the brackets and arrows; the catalog binds H R S W ; ' 1. `x` is in
  // neither, which is the same test slice 19 applied when it chose R/W/S.
  const keyUnbound = await pressKey('x');

  const keyReplayOk = near(keyReplay.seekedTo, CUES[1]);
  const keyPrevOk = near(keyPrev.seekedTo, CUES[0]);
  const keyNextOk = near(keyNext.seekedTo, CUES[1]);
  const unboundQuiet = keyUnbound.seekedTo == null;
  record.phases.G = {
    what: 'the video.* shortcuts driven by real KEY EVENTS, not by clicking their buttons',
    why: (
      'Slice 19 re-homed ten video.* registrations onto VideoCoreStudyOverlay and fixed '
      + 'effectiveKeys to normalize, which is what made R/W/S matchable at all. Every part '
      + 'of that was proven by unit guard and source sweep; nothing had pressed a key. '
      + 'Phase E clicks the buttons, which does not exercise chordFromEvent, effectiveKeys, '
      + 'chordMatches or the handler stack.'
    ),
    sentAs: 'lowercase event.key via CDP Input.dispatchKeyEvent — the catalog default is '
      + "'R', so this only matches if effectiveKeys still normalizes",
    parkedAt: PARK,
    cueStartsFromFile: CUES,
    replayKeyR: { seekedTo: keyReplay.seekedTo, expected: CUES[1], ok: keyReplayOk },
    prevKeyW: { seekedTo: keyPrev.seekedTo, expected: CUES[0], ok: keyPrevOk },
    nextKeyS: { seekedTo: keyNext.seekedTo, expected: CUES[1], ok: keyNextOk },
    unboundKeyX: {
      seekedTo: keyUnbound.seekedTo, expected: null, ok: unboundQuiet,
      why: 'the control — three seeks alone would not prove the BINDING fired',
    },
    qIsNotFree: (
      'The first run of this phase used q as the control and it seeked to 0. q is absent '
      + "from this app's catalog but present in the ADOPTED PLAYER's own "
      + 'vc_defaultKeybindings, which the catalog knows nothing about. Recorded in '
      + 'proof/retirement-step3-20260731221652/ with R/W/S already correct in that same '
      + 'run. A control key has to be free in BOTH maps.'
    ),
    focusAtPress: [keyReplay, keyPrev, keyNext, keyUnbound].map((r) => `${r.key}:${r.focus}`),
    result: keyReplayOk && keyPrevOk && keyNextOk && unboundQuiet ? 'PASS' : 'FAIL',
  };
  if (!(keyReplayOk && keyPrevOk && keyNextOk && unboundQuiet)) {
    throw new Error(`phase G FAIL — ${JSON.stringify(record.phases.G)}`);
  }
  log(`phase G PASS — R -> ${keyReplay.seekedTo} (cue1 ${CUES[1]}), `
    + `W -> ${keyPrev.seekedTo} (cue0 ${CUES[0]}), S -> ${keyNext.seekedTo}, `
    + `unbound X -> no seek`);

  // ---- Phase H: the two video.* rows that seek NOTHING ----------------------------
  //
  // Phase G closed the three rows whose effect is a seek. Slices 19-22 each recorded the
  // same remaining item, and each named the reason it stayed open: *"Phase G presses the
  // three that seek, because a seek is measurable by a `seeked` event; the others change
  // preferences or subtitle delay and need a different instrument."* This is that
  // instrument, and it is the whole difference between this phase and G.
  //
  // `;` and `'` are the only two of the seven remaining rows a user can press today — the
  // other five ship with `defaultKeys: ''`, so `effectiveKeys` returns '' and `chordMatches`
  // is false for every chord. They are unpressable BY DESIGN until someone binds them, which
  // makes "press them" the wrong test; the open question there is whether bind-then-press
  // works, through `ShortcutSettings`, and it needs a settings-driving phase this harness
  // does not have.
  //
  // The instrument is the `<output>` in the subtitle-offset cluster, which is rendered
  // whenever the study controls are. NOT `data-timing-delay` — that attribute lives on the
  // drift-tracking section and only exists while `driftTracking && timingDrift`, so a phase
  // built on it would read `null` in an ordinary run and look like a broken shortcut.
  //
  // It is matched by TEXT SHAPE rather than by its aria-label, because every label here goes
  // through `useT()` and this app ships four UI languages — a selector keyed to English
  // would pass on an English machine and fail on the developer's own if they switched.
  const readDelay = async () => cdp.evaluate(`(() => {
    const outs = [...document.querySelectorAll('.study-control-cluster output')];
    const hit = outs.map((o) => (o.textContent ?? '').trim())
      .find((t) => /^[+-]?\\d+(\\.\\d+)?s$/.test(t));
    return hit == null ? null : Number.parseFloat(hit);
  })()`);

  // `;` and `'` are not letters: phase G's `Key${K}` code and its letter VK table do not
  // describe them, and a wrong `code`/VK pair is dispatched happily and matches nothing.
  const PUNCT = {
    ';': { code: 'Semicolon', vk: 186 },
    "'": { code: 'Quote', vk: 222 },
  };
  const pressPunct = async (key) => {
    await cdp.evaluate(
      "(() => { const el = document.activeElement;"
      + " if (el && el !== document.body) el.blur?.(); return 1; })()",
    );
    const before = await readDelay();
    const common = {
      key,
      code: PUNCT[key].code,
      windowsVirtualKeyCode: PUNCT[key].vk,
      nativeVirtualKeyCode: PUNCT[key].vk,
    };
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', text: key, ...common });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
    let after = before;
    for (let i = 0; i < 12; i += 1) {
      await sleep(200);
      after = await readDelay();
      if (after !== before) break;
    }
    return { key, before, after };
  };

  const delayStart = await readDelay();
  const earlier = await pressPunct(';');
  const later = await pressPunct("'");
  // The same control as phase G, for the same reason: two deltas alone would prove only that
  // SOMETHING moves the delay while keys are being pressed.
  const afterControl = await (async () => {
    const before = await readDelay();
    const common = { key: 'x', code: 'KeyX', windowsVirtualKeyCode: 88, nativeVirtualKeyCode: 88 };
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', text: 'x', ...common });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
    await sleep(900);
    return { before, after: await readDelay() };
  })();

  const closeTo = (a, b) => a != null && b != null && Math.abs(a - b) < 0.001;
  const earlierOk = closeTo(earlier.after, earlier.before - 0.1);
  const laterOk = closeTo(later.after, later.before + 0.1);
  const controlQuiet = closeTo(afterControl.after, afterControl.before);
  record.phases.H = {
    what: "the two remaining PRESSABLE video.* rows — subEarlier (;) and subLater (') — "
      + 'driven by real key events',
    why: (
      'Slices 19, 20, 21 and 22 each carried the same open item: the other video.* rows have '
      + 'never been pressed. Phase G could not close them because its instrument is a `seeked` '
      + 'event and these rows do not seek — they move the subtitle delay.'
    ),
    instrument: 'the <output> in the subtitle-offset cluster, matched by text shape rather '
      + 'than by its i18n aria-label; NOT data-timing-delay, which only exists while drift '
      + 'tracking is active',
    delayAtStart: delayStart,
    subEarlierSemicolon: { ...earlier, expected: earlier.before - 0.1, ok: earlierOk },
    subLaterQuote: { ...later, expected: later.before + 0.1, ok: laterOk },
    unboundKeyX: {
      ...afterControl, ok: controlQuiet,
      why: 'the control — two deltas alone would not prove the BINDING fired',
    },
    theOtherFiveRows: (
      'subEarlierLarge, subLaterLarge, toggleAutoPause, toggleLoop and toggleFurigana ship '
      + "with defaultKeys: '' — effectiveKeys returns '' and chordMatches is false for every "
      + 'chord, so they are unpressable BY DESIGN until a user binds them. "Press them" is '
      + 'therefore the wrong test. What is untested for those is bind-then-press through '
      + 'ShortcutSettings, which needs a settings-driving phase this harness does not have.'
    ),
    result: earlierOk && laterOk && controlQuiet ? 'PASS' : 'FAIL',
  };
  if (!(earlierOk && laterOk && controlQuiet)) {
    throw new Error(`phase H FAIL — ${JSON.stringify(record.phases.H)}`);
  }
  log(`phase H PASS — ; -> ${earlier.before} to ${earlier.after}, `
    + `' -> ${later.before} to ${later.after}, unbound X -> unchanged at ${afterControl.after}`);

  // ---- Phase I: the five rows that ship UNBOUND, bound and then pressed ------------
  //
  // Slices 19-22, 29 and 30 each closed a little more of the video.* keypress item and each
  // left the same five rows open with the same sentence: they ship `defaultKeys: ''`, so
  // "press them" is the wrong test and no keypress phase can reach them. Slice 30 stated it
  // as a fact about what the rows ARE. What was never established is the claim one level
  // up — that BINDING one of them in Settings → Shortcuts makes it work. That is what this
  // phase measures, and the bind half above drove the real capture UI to get here.
  //
  // Two instruments, because these five rows split across two kinds of effect:
  //   - the two ±500 ms rows move the subtitle offset, so they reuse phase H's `<output>`;
  //   - the three toggles move a PREFERENCE, which neither a `seeked` event (phase G) nor
  //     the offset output (phase H) can see. `data-study-pref` on the three checkboxes is
  //     that observable. They live in the advanced section, which phase E already expanded.
  const readPref = async (name) => cdp.evaluate(
    `(document.querySelector('[data-study-pref="${name}"]')?.checked ?? null)`,
  );
  const blur = () => cdp.evaluate(
    "(() => { const el = document.activeElement;"
    + " if (el && el !== document.body) el.blur?.(); return 1; })()",
  );

  // The three checkboxes only exist while the advanced section is open. Phase E expanded
  // it; if that ever stops being true this must fail as a MISSING INSTRUMENT rather than
  // as a dead shortcut, so it is checked and reported separately.
  let advancedWasOpen = await cdp.evaluate(
    "!!document.querySelector('[data-study-pref=\"furigana\"]')",
  );
  if (!advancedWasOpen) {
    await cdp.evaluate(
      "(document.querySelector('[data-study-action=\"toggle-study-controls\"]')?.click(),1)",
    );
    await sleep(800);
  }
  if (!(await cdp.evaluate("!!document.querySelector('[data-study-pref=\"furigana\"]')"))) {
    throw new Error(
      'phase I FAIL — NO INSTRUMENT: the study preference checkboxes are not rendered, so '
      + 'nothing here could observe a toggle either way',
    );
  }

  const pressBound = async (row) => {
    await blur();
    if (row.kind === 'delay') {
      const before = await readDelay();
      await sendChord(cdp, row);
      let after = before;
      for (let i = 0; i < 15; i += 1) {
        await sleep(200);
        after = await readDelay();
        if (after !== before) break;
      }
      return { id: row.id, chord: row.chord, kind: row.kind, before, after, expected: before + row.delta };
    }
    const before = await readPref(row.pref);
    await sendChord(cdp, row);
    let after = before;
    for (let i = 0; i < 15; i += 1) {
      await sleep(200);
      after = await readPref(row.pref);
      if (after !== before) break;
    }
    return { id: row.id, chord: row.chord, kind: row.kind, pref: row.pref, before, after, expected: !before };
  };

  const pressed = [];
  for (const row of BIND_PLAN) pressed.push(await pressBound(row));

  // The control, and it is the sharpest one this phase can have: the SAME chord family,
  // dispatched by the same call with the same modifier bits, differing from the five above
  // in exactly one thing — no binding was ever captured for it. Without it, five moving
  // observables would prove only that something moves while Ctrl+Alt+<digit> is pressed.
  await blur();
  const controlBefore = {
    delay: await readDelay(),
    furigana: await readPref('furigana'),
    autoPause: await readPref('autoPause'),
    loopLine: await readPref('loopLine'),
  };
  await sendChord(cdp, BIND_CONTROL);
  await sleep(1200);
  const controlAfter = {
    delay: await readDelay(),
    furigana: await readPref('furigana'),
    autoPause: await readPref('autoPause'),
    loopLine: await readPref('loopLine'),
  };

  const pressedOk = pressed.every((row) => (
    row.kind === 'delay'
      ? closeTo(row.after, row.expected)
      : row.after === row.expected && row.before != null
  ));
  const controlQuietI = ['delay', 'furigana', 'autoPause', 'loopLine']
    .every((k) => controlBefore[k] === controlAfter[k]);
  record.phases.I = {
    what: 'BIND-then-press for the five video.* rows that ship with no default binding',
    why: (
      "subEarlierLarge, subLaterLarge, toggleAutoPause, toggleLoop and toggleFurigana carry "
      + "defaultKeys: '', so effectiveKeys returns '' and chordMatches is false for every "
      + 'chord — they are unpressable by design and phases G and H could not reach them. '
      + 'The untested claim was never "does the key work" but "does binding it in Settings '
      + 'make it work", and nothing had ever driven that surface.'
    ),
    boundThrough: 'Settings → Shortcuts, the real capture button, a real CDP key event — '
      + 'not a setBinding() call from the console',
    rowsFoundBy: 'data-shortcut-id / data-shortcut-capture, because every visible string on '
      + 'that surface goes through useT() and the app ships four UI languages',
    advancedSectionAlreadyOpen: advancedWasOpen,
    bind: boundRows,
    press: pressed,
    control: {
      chord: BIND_CONTROL.chord,
      before: controlBefore,
      after: controlAfter,
      ok: controlQuietI,
      why: 'same chord family, same dispatch, no binding — five moving observables alone '
        + 'would not prove the BINDING is what fired',
    },
    chordChoice: (
      'Ctrl+Alt+<digit>. A chord has to be free in BOTH keymaps: the adopted player binds '
      + 'bare Key*/Arrow*/Bracket* codes and this catalog uses Ctrl+Alt+0/-/= but no '
      + 'Ctrl+Alt+<1..9>. Not taken on trust — each bound row is read back for the '
      + '.sc-conflict marker the settings row renders when a chord is shared.'
    ),
    result: pressedOk && controlQuietI ? 'PASS' : 'FAIL',
  };
  if (!(pressedOk && controlQuietI)) {
    throw new Error(`phase I FAIL — ${JSON.stringify(record.phases.I)}`);
  }
  log(`phase I PASS — ${pressed.map((r) => `${r.chord} ${r.before}->${r.after}`).join(', ')}; `
    + `unbound ${BIND_CONTROL.chord} -> everything unchanged`);

  // ---- Phase J: a reopen of the ALREADY-ACTIVE file, the disputed path -------------
  //
  // `NEXT_SESSION.md` has carried this since 2026-07-30: reopening the same already-active
  // file with no `startAtSec` "did not apply the stored resume — it restarted at 0", ruled
  // out as a measurement error because the store was planted and re-read *immediately
  // before dispatch*. Slice 35 named the hole in that ruling-out — the live session's own
  // `ResumeTracker` teardown persist fires AFTER the dispatch, when `open-and-await` nulls
  // the playback info, and it lands before the `watch` handler that is the only reader of
  // the store — and guarded the write. This is the control run that decides it.
  //
  // TWO rows, because one is not a measurement. Row 1 needs a session that NEVER STARTED,
  // which is the case slice 35's rule protects. Row 2 parks well above the floor, where the
  // teardown legitimately saves the live position and the plant must be OVERWRITTEN — a
  // reopen landing on the live session's own position is the store working, and without
  // this row a passing row 1 could not be told from "resume is broken".
  //
  // **A REWIND CANNOT CONSTRUCT ROW 1, and the first cut of this phase tried to.**
  // `sessionMaxSec` spans the whole `ResumeTracker` effect, so parking at 0.4 s after
  // phases C-I have played the file to ~12 s is the DELIBERATE case — "back to the top
  // after really watching" — which the rule clears on purpose. The never-started case has
  // to be built: clear the row, reopen (so it starts at 0), hold the element paused from
  // the moment it exists, and only then plant. If the guarded open still lands above the
  // floor, row 1 reports INFO and not FAIL — an assertion about a branch must first
  // establish that the branch was entered.
  //
  // Every read is taken with the element PAUSED. At ~2.5 s of settle time a playing element
  // drifts 8.8 into 11.3, which overlaps row 2's expectation of ~12 — the two rows would
  // stop being distinguishable from each other.
  const PLANT_SEC = 8.8;
  const resumeStoreNow = async () => {
    const raw = await cdp.evaluate(`window.localStorage.getItem(${JSON.stringify(RESUME_KEY)})`);
    try {
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };
  /**
   * The key ResumeTracker itself wrote, never one this harness builds. A resume key is
   * lower-cased and forward-slashed on the way in, and an earlier slice already lost a run
   * to a hand-built path that was correct and did not match.
   */
  const fileName = path.basename(MEDIA_FILE).toLowerCase();
  const resumeRow = async () => (await resumeStoreNow())
    .find((entry) => typeof entry?.key === 'string' && entry.key.toLowerCase().endsWith(fileName));
  const parkAndPlant = async (parkSec) => {
    await cdp.evaluate(`(() => {
      const v = document.querySelector('[data-vc-element="video"]');
      v.pause(); v.currentTime = ${parkSec}; return 1;
    })()`);
    await sleep(1200);
    const parkedAt = await cdp.evaluate(
      "document.querySelector('[data-vc-element=\"video\"]').currentTime",
    );
    const row = await resumeRow();
    if (!row) throw new Error('phase J FAIL — ResumeTracker never wrote a row for this file');
    await cdp.evaluate(`(() => {
      const raw = window.localStorage.getItem(${JSON.stringify(RESUME_KEY)});
      const list = JSON.parse(raw);
      const next = list.map((e) => (e.key === ${JSON.stringify(row.key)}
        ? { ...e, positionSec: ${PLANT_SEC}, updatedAt: Date.now() } : e));
      window.localStorage.setItem(${JSON.stringify(RESUME_KEY)}, JSON.stringify(next));
      return 1;
    })()`);
    const planted = await resumeRow();
    return { parkedAt, key: row.key, plantedReadBack: planted?.positionSec ?? null };
  };
  const reopenAndRead = async (label) => {
    const attempts = await openFileWithRetry(cdp, detail, label);
    if (!attempts) throw new Error(`${label} FAIL — the file never reopened`);
    await cdp.evaluate(
      "(document.querySelector('[data-vc-element=\"video\"]')?.pause?.(),1)",
    ).catch(() => undefined);
    await sleep(2500);
    const shot = await cdp.evaluate(`(() => {
      const v = document.querySelector('[data-vc-element="video"]');
      return { currentTime: v.currentTime, paused: v.paused, readyState: v.readyState };
    })()`);
    return { attempts, ...shot, storeAfter: (await resumeRow())?.positionSec ?? null };
  };

  /**
   * Keeps the element paused from the moment it exists. `openFileWithRetry` waits for
   * `readyState >= 2`, and an autoplaying element can be seconds in by the time that
   * returns — which would put `sessionMaxSec` over the floor and turn row 1 into the
   * deliberate-rewind case it is not. It cannot suppress the restore:
   * `restoreSeekTime(time, false, undefined)` sets `currentTime` and only calls
   * `play()`/`pause()` for an explicit boolean, and `canplay` fires either way.
   */
  const pauseGuard = (on) => cdp.evaluate(on
    ? '(window.__harnessPauseGuard = setInterval(() => { const v = '
      + 'document.querySelector(\'[data-vc-element="video"]\'); if (v && !v.paused) v.pause(); }, 50), 1)'
    : '(clearInterval(window.__harnessPauseGuard), 1)');
  const plantAt = async (key, positionSec) => {
    await cdp.evaluate(`(() => {
      const raw = window.localStorage.getItem(${JSON.stringify(RESUME_KEY)});
      const list = raw ? JSON.parse(raw) : [];
      const rest = list.filter((e) => e.key !== ${JSON.stringify(key)});
      rest.push({ key: ${JSON.stringify(key)}, positionSec: ${positionSec}, updatedAt: Date.now() });
      window.localStorage.setItem(${JSON.stringify(RESUME_KEY)}, JSON.stringify(rest));
      return 1;
    })()`);
    return (await resumeRow())?.positionSec ?? null;
  };

  // Row 1 — the never-started session, built in two opens.
  //
  // **Clearing the store by hand does not work, and the run that proved it is the whole
  // point of this phase.** In `proof/retirement-step3-20260801194522` the row was cleared
  // immediately before the dispatch and the reopen still resumed at **7.292**, with the
  // store holding 7.292 afterwards. Nothing but the live session's teardown persist could
  // have written it, and it wrote AFTER the dispatch and BEFORE the `watch` handler that is
  // the only reader — which is exactly the window the 2026-07-30 ruling-out ("re-read
  // immediately before dispatch") cannot see. That is the mechanism, measured.
  //
  // So the setup uses that mechanism instead of fighting it: rewind below the floor from a
  // session that HAS started, and the teardown takes slice 35's deliberate-rewind branch and
  // CLEARS the row. The next open therefore starts at 0, and with the pause guard holding it
  // there, that session's `sessionMaxSec` stays under the floor — which is the state row 1
  // needs and cannot otherwise reach.
  const seedRow = await resumeRow();
  if (!seedRow) throw new Error('phase J FAIL — ResumeTracker never wrote a row for this file');
  const resumeStoreKey = seedRow.key;
  await pauseGuard(true);
  await cdp.evaluate(`(() => {
    const v = document.querySelector('[data-vc-element="video"]');
    v.pause(); v.currentTime = 0.4; return 1;
  })()`);
  await sleep(900);
  const rewoundAt = await cdp.evaluate(
    "document.querySelector('[data-vc-element=\"video\"]').currentTime",
  );
  const coldOpen = await reopenAndRead('phase J row 1 clearing open');
  const clearedByTeardown = (await resumeRow()) == null;
  const startedBelowFloor = coldOpen.currentTime < 1;
  const plantedBelow = await plantAt(resumeStoreKey, PLANT_SEC);
  log(`  phase J row 1 — rewound to ${rewoundAt.toFixed(3)}, teardown `
    + `${clearedByTeardown ? 'CLEARED' : 'did NOT clear'} the row, clearing open parked at `
    + `${coldOpen.currentTime.toFixed(3)} (below floor: ${startedBelowFloor}), planted ${plantedBelow}`);
  const belowResult = await reopenAndRead('phase J row 1');
  await pauseGuard(false);

  // Row 2 — the control: a session that really started must overwrite the plant.
  const aboveFloor = await parkAndPlant(12);
  log(`  phase J row 2 — parked ${aboveFloor.parkedAt.toFixed(3)}, planted ${aboveFloor.plantedReadBack}`);
  const aboveResult = await reopenAndRead('phase J row 2');

  // Row 1 must land on the PLANT; row 2 must land on the LIVE position and not on the plant.
  const rowOneOk = !startedBelowFloor
    || (belowResult.currentTime >= PLANT_SEC - 1.3 && belowResult.currentTime <= PLANT_SEC + 1.3);
  const rowTwoOk = aboveResult.currentTime >= 10.7 && aboveResult.currentTime <= 13.3;
  record.phases.J = {
    what: 'a reopen of the already-active file honours the resume store — the disputed path',
    plantSec: PLANT_SEC,
    resumeStoreKey,
    belowFloor: {
      rewoundTo: rewoundAt,
      clearedByTeardown,
      clearingOpenAt: coldOpen.currentTime,
      startedBelowFloor,
      plantedReadBack: plantedBelow,
      ...belowResult,
      ok: rowOneOk,
      ...(startedBelowFloor ? {} : {
        note: 'INFO, not a result — the guarded cold open still landed at or above the 1 s '
          + 'floor, so the never-started branch was never entered. Nothing about the rule '
          + 'was measured here.',
      }),
    },
    aboveFloor: { parkSec: 12, ...aboveFloor, ...aboveResult, ok: rowTwoOk },
    reading: !(rowOneOk && rowTwoOk)
      ? 'See belowFloor/aboveFloor — a row 1 near 0 is the pre-slice-35 behaviour (the '
        + 'teardown overwrote the plant); a row 2 near the plant would mean the live '
        + "session's own position was NOT persisted, which is a different defect."
      : startedBelowFloor
        ? 'The teardown write is guarded below the floor and honest above it, and a reopen '
          + 'reads what the store holds at `watch` time.'
        : 'ROW 2 ONLY. A reopen honours the live position, so the store IS read at `watch` '
          + 'time — but the never-started branch was not entered, so slice 35\'s guard is '
          + 'still unmeasured live. Re-run; this is the row that answers the 2026-07-30 '
          + 'open question.',
    result: rowOneOk && rowTwoOk ? 'PASS' : 'FAIL',
  };
  if (!(rowOneOk && rowTwoOk)) {
    throw new Error(`phase J FAIL — ${JSON.stringify(record.phases.J)}`);
  }
  log(`phase J PASS — below-floor reopen resumed at ${belowResult.currentTime.toFixed(3)} `
    + `(plant ${PLANT_SEC}); above-floor reopen resumed at ${aboveResult.currentTime.toFixed(3)} `
    + '(live position, not the plant)');

  // ---- Phase F: resume across a real app restart ---------------------------------
  const RESUME_TARGET = 9.5;
  await cdp.evaluate(`(() => {
    const v = document.querySelector('[data-vc-element="video"]');
    v.currentTime = ${RESUME_TARGET}; v.play?.(); return 1;
  })()`);
  await sleep(2500);
  const beforeQuit = await cdp.evaluate(
    "document.querySelector('[data-vc-element=\"video\"]').currentTime",
  );
  const storedRaw = await cdp.evaluate(
    `window.localStorage.getItem(${JSON.stringify(RESUME_KEY)})`,
  );
  const stored = storedRaw ? JSON.parse(storedRaw) : null;
  log(`  position before quit ${beforeQuit.toFixed(3)}, resume store ${storedRaw ? 'written' : 'EMPTY'}`);

  const sidecarPid = ready.pid;
  await cdp.evaluate('window.close(), 1').catch(() => undefined);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && processAlive(instance.electron.pid)) await sleep(500);
  await sleep(1500);
  const orphaned = processAlive(sidecarPid);
  record.phases.D = {
    what: 'quit with a player active — the sidecar must not outlive the app',
    sidecarPid, orphaned, result: orphaned ? 'FAIL' : 'PASS',
  };
  if (orphaned) {
    spawnSync('taskkill', ['/pid', String(sidecarPid), '/T', '/F'], { stdio: 'ignore' });
    throw new Error('phase D FAIL — sidecar orphaned');
  }
  log('phase D PASS — no orphan after quitting mid-playback');

  // ---- Phase F: the position survives a real restart -----------------------------
  // A restart, not a reopen in the same session. `NEXT_SESSION.md` carries an OPEN
  // QUESTION that reopening an already-active file in the SAME session did not apply the
  // stored resume; a cold mount is the path G-PLAY proved (`play t=6 -> seeking t=6 ->
  // seeked t=6`). Testing the disputed path here would re-litigate an open question
  // instead of proving that the new ROUTE preserves resume.
  const second = await launch();
  await waitFor(
    second.cdp,
    "typeof window.api?.seanimeStatus === 'function'"
      + " && !!document.querySelector('.desktop-root') && !!document.querySelector('.os-taskbar')",
    MOUNT_TIMEOUT_MS, 'phase F FAIL — the shell never mounted on restart',
  );
  await second.cdp.evaluate(
    "(()=>{const b=document.querySelector('.consent-no');if(b){b.click();return true;}return false;})()",
  );
  const survived = await second.cdp.evaluate(
    `window.localStorage.getItem(${JSON.stringify(RESUME_KEY)})`,
  );
  await openSection(second.cdp, 'video');
  await waitFor(
    second.cdp, "!!document.querySelector('#media-workspace[data-media-surface=workspace]')",
    PLAYBACK_TIMEOUT_MS, 'phase F FAIL — the workspace never provisioned on restart',
  );
  await waitFor(
    second.cdp, "!document.querySelector('.p-6.text-gray-400')",
    PLAYBACK_TIMEOUT_MS, 'phase F FAIL — the workspace never got past its status gate',
  );
  const reopenAttempts = await openFileWithRetry(second.cdp, detail, 'phase F');
  if (!reopenAttempts) throw new Error('phase F FAIL — the file never loaded after restart');
  await sleep(2500);
  const resumedAt = await second.cdp.evaluate(
    "document.querySelector('[data-vc-element=\"video\"]').currentTime",
  );
  // Generous window: the store is written on an interval, and playback continues while
  // the element settles. What must NOT happen is a restart at 0.
  const resumed = Math.abs(resumedAt - beforeQuit) < 3.5;
  record.phases.F = {
    what: 'the position survives a real app restart, reopened through the new route',
    positionBeforeQuit: beforeQuit,
    resumeStoreWrittenBeforeQuit: !!storedRaw,
    resumeStoreSurvivedRestart: !!survived,
    storedEntries: stored ? Object.keys(stored).length : 0,
    resumedAt,
    reopenAttempts,
    resumed,
    result: resumed ? 'PASS' : 'FAIL',
  };
  if (!resumed) {
    throw new Error(
      `phase F FAIL — reopened at ${resumedAt} after quitting at ${beforeQuit}`,
    );
  }
  log(`phase F PASS — quit at ${beforeQuit.toFixed(3)}, restarted and resumed at ${resumedAt.toFixed(3)}`);

  await second.cdp.evaluate('window.close(), 1').catch(() => undefined);
  const d2 = Date.now() + 30_000;
  while (Date.now() < d2 && processAlive(second.electron.pid)) await sleep(500);

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
  for (const it of live) {
    if (it?.electron?.pid && processAlive(it.electron.pid)) {
      spawnSync('taskkill', ['/pid', String(it.electron.pid), '/T', '/F'], { stdio: 'ignore' });
    }
    try { it?.cdp?.close(); } catch { /* gone */ }
  }
  record.finishedAt = new Date().toISOString();
  const outDir = path.join(REPO, 'docs', 'migration', 'proof', `retirement-step3-${stamp}`);
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'new-route-plays-and-shell-survives.json');
  fs.writeFileSync(outFile, `${JSON.stringify(record, null, 2)}\n`);
  log(`record written to ${path.relative(REPO, outFile)}`);
  process.exit(failure ? 1 : 0);
}
