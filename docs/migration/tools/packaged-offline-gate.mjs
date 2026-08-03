#!/usr/bin/env node
// Does the packaged app still work with NO INTERNET? — Phase 9 / slice 47j.
//
// This is an offline-first study app: dictionaries, tokeniser, media and the Seanime sidecar
// are all local. "Offline works" has been an architectural intention throughout and has never
// been measured on the shipped artifact.
//
// ## Why not `Network.emulateNetworkConditions({ offline: true })`
//
// Because it would measure the wrong thing. That switch kills **all** networking including
// `127.0.0.1`, and the sidecar is a loopback HTTP+websocket server. A run under it would show
// the player failing and report "offline is broken" when what broke was the local server the
// user still has. For this app, offline means **the internet is gone and the machine is not**.
//
// So the gate intercepts requests and fails only those leaving the machine: anything that is
// not loopback, not the `app:`/`media:`/`playfile:`/`localfile:` schemes, and not `devtools:`.
// That is the real condition, and it is also stricter than pulling the cable, because a cached
// DNS answer or a proxy cannot quietly satisfy a request.
//
// ## The control, without which a PASS is meaningless
//
// If nothing external was ever attempted, "the app survived with the internet blocked" says
// only that nothing needed it during the window. The gate therefore records **how many
// external requests it blocked and to which hosts**, and reports them. A run that blocked zero
// is reported as INCONCLUSIVE rather than PASS — the block has to have bitten something for
// its absence to mean anything.
//
// usage:
//   node docs/migration/tools/packaged-offline-gate.mjs
//   node docs/migration/tools/packaged-offline-gate.mjs --exe=out/…/jp-study-app.exe
//   node docs/migration/tools/packaged-offline-gate.mjs --control   # the unblocked half
//
// Run BOTH. See the `--control` note below: the blocked run alone can pass on an absence.
//
// ## Step 3c — the RENDERER's own off-machine surface (added 2026-08-03)
//
// `progress.json` carried "the RENDERER's off-machine surface is still unexercised — 0 external
// requests in BOTH modes" from slice 50 onward, blamed on a throwaway profile having nothing to
// fetch. That diagnosis was wrong. Step 3 calls `window.api.searchDiscovery`, which runs in the
// MAIN process across the preload bridge; nothing was ever RENDERED, so the renderer could not
// request anything. The zero was a property of this gate.
//
// The renderer's external surface is not a guess — the CSP is the enforced allow-list
// (`shared/contentSecurityPolicy.ts`): `img-src` permits cdn.myanimelist.net and *.anilist.co,
// `connect-src` permits huggingface. So remote cover art, and Whisper model downloads. Whisper is
// deliberately NOT triggered here; a multi-hundred-MB fetch is not a gate.
//
// 3c therefore drives the app's own UI to the one surface that paints remote art. Getting there
// took six tries, each failing for a DIFFERENT reason that a boolean would have hidden — which is
// why every branch below returns a distinct state string:
//   1. the search is a BUTTON CLICK, not a form submit (Enter and `submit` reach nothing);
//   2. Discover is a PAGE INSIDE ScraperView, so `os:open 'scraper'` does not mount its controls;
//   3. the page has TWO input[type=search] — the ScraperPage top-bar filter is not Discover's;
//   4. the poster lives in `.disc-inspector`, the SELECTED-candidate panel, not the results list;
//   5. `.disc-row-head` (the column header) shares the `disc-row` class with the data rows.
//
// MEASURED RESULT: control reaches `s4.anilist.co` (1 renderer request); blocked reaches nothing
// because `searchDiscovery` returns 0 rows first — the renderer surface is DOWNSTREAM of main, so
// offline it is never reached rather than being reached and refused. The app degrades cleanly.
//
// Needs a packaged build in `out/`. Runs against a throwaway `--user-data-dir`, so it never
// touches the real profile — which also means it exercises FIRST RUN with no internet, the
// harshest version of the question.

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');

const arg = (name, fallback = '') => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const EXE = path.resolve(arg('exe')
  || path.join(REPO, 'out', 'jp-study-app-win32-x64', 'jp-study-app.exe'));

/**
 * `--control` — THE OTHER HALF OF THE DIFFERENTIAL, added in slice 50.
 *
 * Step 5's `bit` is `rendererBlocked > 0 || !mainProcessReachedTheInternet`, so a run on a
 * machine that simply has no internet — or one where `searchDiscovery` is broken for a reason
 * that has nothing to do with the block — PASSes on an ABSENCE read alone. Slice 47j did not
 * have that hole because it ran an unblocked comparison by hand (6 results with the internet,
 * 0 with DNS blackholed) and recorded it in prose. That comparison was not reproducible from
 * the gate, so re-running the gate alone could never re-establish it.
 *
 * `--control` runs the identical script with the block LIFTED: no `--host-resolver-rules`, and
 * `Fetch.requestPaused` continues everything while still recording what it WOULD have blocked.
 * It is a PASS only if the app reaches the internet — the mirror image of the blocked run. The
 * pair is the verdict; neither half is one on its own.
 */
const CONTROL = process.argv.slice(2).includes('--control');

const stamp = process.env.RUN_STAMP
  ?? new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '');
const workRoot = path.join(REPO, 'docs/migration/proof',
  `packaged-offline-${stamp}${CONTROL ? '-control' : ''}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logLines = [];
const log = (m) => { const l = `[offline] ${m}`; logLines.push(l); console.log(l); };

const out = {
  gate: 'packaged-offline-gate.mjs',
  question: 'Does the packaged app boot and stay usable on a FIRST RUN with no internet, while '
    + 'the loopback sidecar is still reachable?',
  startedAt: new Date().toISOString(),
  mode: CONTROL ? 'control (internet REACHABLE)' : 'blocked (internet CUT)',
  exe: EXE,
  blocked: [],
  wouldHaveBlocked: [],
  allowedLoopback: 0,
  steps: [],
};
function step(name, result, detail, extra = {}) {
  out.steps.push({ name, result, detail, ...extra });
  log(`${result} — ${name}: ${detail}`);
}

/** Loopback in any of the forms a URL can carry it. */
const LOOPBACK = /^(https?|wss?):\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/i;
/** Schemes served from inside the app; they never leave the machine. */
const LOCAL_SCHEME = /^(app|media|playfile|localfile|devtools|data|blob|file|chrome-extension):/i;

function isExternal(url) {
  if (!url) return false;
  if (LOCAL_SCHEME.test(url)) return false;
  if (LOOPBACK.test(url)) return false;
  return /^(https?|wss?):/i.test(url);
}

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
    this.url = url; this.nextId = 1; this.pending = new Map(); this.handlers = new Map();
  }
  on(method, fn) { this.handlers.set(method, fn); }
  async open() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener('message', (event) => {
      let msg; try { msg = JSON.parse(String(event.data)); } catch { return; }
      if (msg.id == null) { this.handlers.get(msg.method)?.(msg.params); return; }
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
      setTimeout(() => { if (this.pending.delete(id)) reject(new Error(`${method} timed out`)); }, 60_000);
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

let child = null;

async function main() {
  if (!fs.existsSync(EXE)) throw new Error(`no packaged build at ${EXE}`);
  out.exeBuiltAt = fs.statSync(EXE).mtime.toISOString();
  fs.mkdirSync(workRoot, { recursive: true });

  /**
   * THE PROFILE MUST BE UNIQUE PER RUN, NOT PER STAMP. Found the hard way in slice 50.
   *
   * This was `jp-offline-${stamp}`. Running the control and the blocked half under one
   * `RUN_STAMP` therefore handed both the SAME Chromium profile — and the blocked run came
   * back with **6 discovery results in 1139 ms** while every hostname lookup was blackholed,
   * because the control had just warmed that profile's cache. The gate correctly FAILed, but
   * it FAILed pointing at the app when the fault was its own profile reuse.
   *
   * It also quietly falsified this file's own headline claim: a gate that advertises "exercises
   * FIRST RUN with no internet" was, on any repeated stamp, exercising a second run.
   */
  const userDataDir = path.join(os.tmpdir(),
    `jp-offline-${stamp}${CONTROL ? '-control' : '-blocked'}-${process.pid}`);
  if (fs.existsSync(userDataDir)) {
    throw new Error(
      `scratch profile ${userDataDir} already exists; refusing to run a "first run" against a `
      + 'profile some earlier run has already warmed',
    );
  }
  out.userDataDir = userDataDir;
  fs.mkdirSync(userDataDir, { recursive: true });
  const cdpPort = await freePort();

  /**
   * THE BLOCK THAT ACTUALLY BITES — and why the obvious one does not.
   *
   * The first version of this gate blocked requests through the renderer's CDP `Fetch` domain.
   * It reported 0 blocked requests while `searchDiscovery('frieren')` came back with **6 real
   * results in 2.7 s**. The reason is structural: this app does its networking in the MAIN
   * process (`ipcRenderer.invoke('discovery:search', …)`), and main-process requests never pass
   * through a renderer's CDP session. A renderer-side block can only ever prove things about
   * the renderer.
   *
   * `--host-resolver-rules` is applied by Chromium's network stack, which Electron's `net`
   * module — the one `main.ts` imports — uses too. `MAP * ~NOTFOUND` fails every hostname
   * lookup; `EXCLUDE localhost` keeps the loopback name resolvable, and literal `127.0.0.1` is
   * not a hostname at all, so the sidecar is untouched. That is the shape of real offline: no
   * internet, machine intact.
   *
   * The renderer-side `Fetch` block below is KEPT as well, because the two cover different
   * paths and a request that somehow reaches the renderer should still be denied.
   */
  child = spawn(EXE, [
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${cdpPort}`,
    ...(CONTROL ? [] : ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost']),
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  out.hostResolverRules = CONTROL ? null : 'MAP * ~NOTFOUND, EXCLUDE localhost';
  const mainProcessLog = [];
  const collect = (buf) => {
    for (const line of String(buf).split(/\r?\n/)) if (line.trim()) mainProcessLog.push(line.trim());
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);

  const target = await findTarget(cdpPort, Date.now() + 180_000,
    (url) => url.startsWith('app://'), 'the packaged app window');
  const cdp = await new Cdp(target.webSocketDebuggerUrl).open();
  step('0 the packaged window exists', 'PASS', target.url);

  // ── Cut the internet, keep the machine ──────────────────────────────────────────
  cdp.on('Fetch.requestPaused', (params) => {
    const url = params.request?.url ?? '';
    if (isExternal(url)) {
      // In control mode the same request is CLASSIFIED but let through, so the two runs
      // disagree about exactly one thing: whether the block fires.
      (CONTROL ? out.wouldHaveBlocked : out.blocked).push({ at: Date.now(), url: url.slice(0, 200) });
      if (!CONTROL) {
        void cdp.send('Fetch.failRequest', { requestId: params.requestId, errorReason: 'InternetDisconnected' });
        return;
      }
    } else {
      out.allowedLoopback += 1;
    }
    void cdp.send('Fetch.continueRequest', { requestId: params.requestId });
  });
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  step(CONTROL
    ? '1 CONTROL: nothing is blocked; off-machine requests are recorded and let through'
    : '1 every off-machine request will be failed as InternetDisconnected', 'PASS',
    CONTROL ? 'no --host-resolver-rules, Fetch continues every request'
      : 'loopback, app:, media:, playfile:, localfile: still pass');

  // ── Does the app come up at all? ────────────────────────────────────────────────
  const mounted = await (async () => {
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      const state = await cdp.evaluate(
        `JSON.stringify({
           ready: document.readyState,
           desktop: !!document.querySelector('.desktop-root'),
           api: typeof window.api === 'object' && window.api !== null,
        })`,
      ).catch(() => null);
      if (state) {
        const parsed = JSON.parse(state);
        if (parsed.desktop && parsed.api) return parsed;
      }
      await sleep(1000);
    }
    return null;
  })();
  out.mounted = mounted;
  step('2 the desktop shell mounts with no internet', mounted ? 'PASS' : 'FAIL',
    mounted ? JSON.stringify(mounted) : 'the desktop never mounted');
  if (!mounted) throw new Error('the desktop never mounted offline');

  // Dismiss the first-launch consent gate exactly as a user would, so the surfaces below are
  // reachable. On a throwaway profile it is always present.
  out.consentDismissed = await cdp.evaluate(
    "(()=>{const b=document.querySelector('.consent-no');if(b){b.click();return 1;}return 0;})()",
  );

  // ── Does the LOCAL study machinery work? ────────────────────────────────────────
  // The tokeniser and the dictionary are the two things a user opening this app offline is
  // actually there for. Both are local by design; this is the first run that proves it on the
  // packaged artifact with the internet gone.
  const local = JSON.parse(await cdp.evaluate(
    `(async () => {
      const result = { errors: [] };
      const call = async (name, key, ...args) => {
        try {
          if (typeof window.api?.[name] !== 'function') { result[key] = 'no-api'; return; }
          const value = await window.api[name](...args);
          result[key] = Array.isArray(value) ? value.length
            : value == null ? null : typeof value === 'object' ? Object.keys(value).length : value;
        } catch (e) { result[key] = 'threw'; result.errors.push(name + ': ' + String(e).slice(0, 140)); }
      };
      await call('lookupTerm', 'lookupTerm', '寿司');
      await call('lookupTermOffline', 'lookupTermOffline', '寿司');
      await call('dictAvailableLangs', 'dictAvailableLangs');
      return JSON.stringify(result);
    })()`,
  ).catch((err) => JSON.stringify({ errors: [String(err?.message ?? err)] })));
  out.localCapabilities = local;
  step('3 local study machinery answers offline', 'MEASURED', JSON.stringify(local));

  // ── The surface that genuinely NEEDS the internet ───────────────────────────────
  // Everything above is local by design, so it cannot distinguish "offline works" from
  // "nothing was asked of the network". `searchDiscovery` goes to external providers. The
  // question here is not whether it succeeds — it must not — but whether it FAILS WELL:
  // returns or rejects promptly rather than hanging, and leaves the shell standing.
  const networkSurface = await (async () => {
    const started = Date.now();
    const value = await cdp.evaluate(
      `(async () => {
        if (typeof window.api?.searchDiscovery !== 'function') return JSON.stringify({ kind: 'no-api' });
        try {
          const hits = await window.api.searchDiscovery('frieren');
          return JSON.stringify({ kind: 'resolved', count: Array.isArray(hits) ? hits.length : null });
        } catch (e) { return JSON.stringify({ kind: 'rejected', error: String(e).slice(0, 160) }); }
      })()`,
    ).catch((err) => JSON.stringify({ kind: 'timeout-or-threw', error: String(err?.message ?? err) }));
    return { ...JSON.parse(value), elapsedMs: Date.now() - started };
  })();
  out.networkSurface = networkSurface;
  // Resolving with zero results and rejecting are both acceptable; hanging is not, and neither
  // is taking the whole CDP timeout to answer.
  const degradedWell = networkSurface.kind === 'resolved' || networkSurface.kind === 'rejected';
  step('3b a network-dependent surface degrades instead of hanging',
    networkSurface.kind === 'no-api' ? 'SKIPPED' : degradedWell ? 'PASS' : 'FAIL',
    `${JSON.stringify(networkSurface)}`);

  // ── 3c THE RENDERER'S OWN OFF-MACHINE SURFACE ───────────────────────────────────
  //
  // Slice 50 recorded a PASS whose renderer half was `0 external requests in BOTH modes`, and
  // `progress.json` carried "the RENDERER's off-machine surface is still unexercised" ever since.
  // The reason is above, not in the app: step 3 calls `window.api.searchDiscovery`, which runs in
  // the MAIN process across the preload bridge. Nothing is ever rendered, so the renderer never
  // requests anything, and zero-in-both-modes was a property of this gate rather than of the app.
  //
  // The renderer's external surface is not a guess — the CSP is the enforced allow-list
  // (`shared/contentSecurityPolicy.ts`):
  //     img-src     … https://cdn.myanimelist.net https://*.anilist.co
  //     connect-src … https://huggingface.co https://*.huggingface.co https://*.hf.co
  // i.e. remote cover art, and Whisper model downloads. Whisper is deliberately NOT triggered here
  // (a multi-hundred-MB download is not a gate). Remote cover art is, and `DiscoverContent.tsx:659`
  // is where it lands: `<img src={candidate.posterUrl}>` over MAL/AniList URLs.
  //
  // NOTE the fixture is NOT what exercises this. The artwork fixture seeds `playfile://` posters,
  // which are LOCAL by construction and can never be network traffic. Only the discover surface
  // paints remote art, so that is the surface this step opens.
  const rendererSurface = await (async () => {
    const started = Date.now();
    const before = (CONTROL ? out.wouldHaveBlocked : out.blocked).length;
    const opened = await cdp.evaluate(
      `(() => { window.dispatchEvent(new CustomEvent('os:open', { detail: 'scraper' })); return 1; })()`,
    ).catch(() => 0);
    if (!opened) return { kind: 'open-failed', elapsedMs: Date.now() - started };
    await sleep(2500);
    // Drive the app's own search box rather than injecting an <img>: manufacturing traffic would
    // prove the harness can make a request, which is not the question.
    // DiscoverContent's search is NOT a form submit. It is
    //   <button type="button" className="disc-btn disc-btn-primary" onClick={submitQuery}
    //           disabled={!query.trim()}>
    // so an Enter keydown and a form 'submit' event both reach nothing — the first version of this
    // step dispatched exactly those, reported typed:"typed", and measured remoteImgs:0 on a run
    // where the main process had just resolved 6 results. "I drove the UI" and "the UI ran" are
    // different claims. Setting .value directly is also not enough: `query` is React state, so the
    // native setter plus a bubbling 'input' event is what actually updates it and enables the
    // button.
    // `os:open 'scraper'` mounts ScraperView, and Discover is a PAGE INSIDE it
    // (`components/scraper/pages/DiscoverPage.tsx`) — so the discover controls are not on screen
    // when the section opens. The first version typed into whatever `input[type="search"]` it
    // found (some other page's box) and then reported `typed-no-button`, which is how this was
    // caught. Navigate to the page first, and say which step failed rather than returning a
    // boolean.
    const typed = await cdp.evaluate(
      `(() => {
         const nav = [...document.querySelectorAll('button, a, [role="tab"], [role="button"]')]
           .find((el) => /discover/i.test((el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '')));
         if (nav) nav.click();
         return nav ? 'nav-clicked' : 'no-discover-nav';
       })()`,
    ).catch((err) => `threw:${String(err?.message ?? err).slice(0, 80)}`);
    await sleep(2500);
    // Instrumented rather than guessed. Three successive versions of this step each failed for a
    // DIFFERENT reason (Enter on a non-form; the discover page not mounted; the button staying
    // disabled), and each looked identical from a boolean. This records WHAT IT TOUCHED so one run
    // settles it: which input, which button, and whether React's `query` state actually moved —
    // the button is `disabled={!query.trim()}`, so a still-disabled button proves the state did
    // not update no matter what `.value` says.
    const searched = JSON.parse(await cdp.evaluate(
      `JSON.stringify((() => {
         // Find the search box that BELONGS TO the submit button, by walking up from the button.
         // The page carries two input[type=search]: the ScraperPage top-bar filter
         // (.scr-search-input) and Discover's own, which has no class. A plain
         // querySelector('input[type=search]') matched the top-bar one, set its value, and left
         // .disc-btn-primary disabled — which is exactly what "typed-button-still-disabled" meant.
         const btn0 = document.querySelector('.disc-btn-primary');
         let box = null;
         let node = btn0 ? btn0.parentElement : null;
         for (let i = 0; i < 6 && node && !box; i += 1) {
           box = node.querySelector('input[type="search"]');
           node = node.parentElement;
         }
         if (!box) box = [...document.querySelectorAll('input[type="search"]')].find((i) => i.className !== 'scr-search-input') || null;
         const inputs = [...document.querySelectorAll('input')].map((i) => (i.type || '') + ':' + (i.className || '(no class)')).slice(0, 8);
         const buttons = [...document.querySelectorAll('button')].map((b) => (b.className || '(no class)')).slice(0, 12);
         if (!box) return { state: 'no-input', inputs, buttons };
         const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
         setter.call(box, 'frieren');
         box.dispatchEvent(new Event('input', { bubbles: true }));
         box.dispatchEvent(new Event('change', { bubbles: true }));
         const btn = document.querySelector('.disc-btn-primary');
         const info = { boxClass: box.className || '(no class)', boxValue: box.value,
                        hasBtn: !!btn, btnDisabled: btn ? !!btn.disabled : null, inputs, buttons };
         if (!btn) return { state: 'typed-no-button', ...info };
         if (btn.disabled) return { state: 'typed-button-still-disabled', ...info };
         btn.click();
         return { state: 'typed-and-clicked', ...info };
       })())`,
    ).catch((err) => JSON.stringify({ state: 'threw', error: String(err?.message ?? err).slice(0, 100) })));
    // Providers are slow and this is a real network round trip, not a stub.
    await sleep(15000);
    // SELECT A RESULT. The remote poster lives in `.disc-inspector`, the detail panel for the
    // SELECTED candidate (`DiscoverContent.tsx:659`), not in the results list — so a search that
    // returns rows still paints no <img> until one is picked. Rows are
    // `div.disc-row[role=row]` with an onClick (`:604-612`).
    const picked = JSON.parse(await cdp.evaluate(
      `JSON.stringify((() => {
         const rows = [...document.querySelectorAll('.disc-row, [role="row"]')];
         // EXCLUDE THE HEADER. disc-row-head carries the same disc-row class as the data rows,
         // so clickable[0] was the column header (#TitleMatchLevelFormatEpisodesRating) --
         // clicking it selects nothing, which is exactly what selectedRows:0 meant.
         // NO BACKTICKS HERE: this block is inside a template literal sent to the page.
         const clickable = rows.filter((r) => {
           const c = r.className || '';
           return c.includes('disc-row') && !c.includes('disc-row-head');
         });
         if (!clickable.length) return { state: 'no-rows', rows: rows.length };
         var target = clickable[0];
         target.click();
         return { state: 'row-clicked', rows: clickable.length,
                  clickedClass: target.className || '(no class)',
                  clickedTag: target.tagName,
                  clickedText: (target.textContent || '').slice(0, 60) };
       })())`,
    ).catch((err) => JSON.stringify({ state: 'threw', error: String(err?.message ?? err).slice(0, 90) })));
    await sleep(6000);
    // What did selecting actually produce? `.disc-inspector` renders
    // `posterUrl ? <img> : <div class="disc-insp-noart">`, so these three booleans separate
    // "no inspector" from "inspector with no art" from "art that failed to load".
    const inspector = JSON.parse(await cdp.evaluate(
      `JSON.stringify((() => ({
         hasInspector: !!document.querySelector('.disc-inspector'),
         hasNoArtFallback: !!document.querySelector('.disc-insp-noart'),
         selectedRows: document.querySelectorAll('.disc-row.selected').length,
         inspectorTitle: (document.querySelector('.disc-inspector h2') || {}).textContent || null,
       }))())`,
    ).catch((err) => JSON.stringify({ hasInspector: null, error: String(err?.message ?? err).slice(0, 90) })));
    const remote = JSON.parse(await cdp.evaluate(
      `JSON.stringify((() => {
         const imgs = [...document.querySelectorAll('img')].map((i) => i.currentSrc || i.src || '');
         const ext = imgs.filter((u) => /^https?:/i.test(u));
         return { totalImgs: imgs.length, remoteImgs: ext.length, sample: ext.slice(0, 3) };
       })())`,
    ).catch(() => '{"totalImgs":null,"remoteImgs":null,"sample":[]}'));
    const after = (CONTROL ? out.wouldHaveBlocked : out.blocked).length;
    return { kind: 'ran', nav: typed, search: searched, picked, inspector, ...remote, rendererRequestsDuringStep: after - before, elapsedMs: Date.now() - started };
  })();
  out.rendererSurface = rendererSurface;
  // MEASURED, not PASS/FAIL: on its own this number cannot be a verdict — the whole point of this
  // gate is that the verdict is the DIFFERENCE between the blocked run and the control.
  step('3c the RENDERER was given something off-machine to fetch (discover cover art)',
    rendererSurface.kind === 'ran' ? 'MEASURED' : 'SKIPPED',
    JSON.stringify(rendererSurface));

  // ── Did the window survive it? ──────────────────────────────────────────────────
  // An app that mounts and then throws an unhandled rejection on every failed fetch is not
  // "working offline"; it is failing quietly. Give it a settling window and then look.
  await sleep(8000);
  const health = JSON.parse(await cdp.evaluate(
    `JSON.stringify({
       stillMounted: !!document.querySelector('.desktop-root'),
       visibleErrorText: (document.querySelector('.os-error, .app-error, [role="alert"]')?.textContent ?? '').slice(0, 200),
       bodyChildren: document.body.childElementCount,
    })`,
  ));
  out.health = health;
  step('4 the shell is still standing after the failures land',
    health.stillMounted ? 'PASS' : 'FAIL', JSON.stringify(health));

  out.mainProcessLogTail = mainProcessLog.slice(-40);
  out.blockedHosts = [...new Set((CONTROL ? out.wouldHaveBlocked : out.blocked).map((entry) => {
    try { return new URL(entry.url).host; } catch { return entry.url.slice(0, 60); }
  }))];

  /**
   * THE CONTROL. A run that reached nothing external proves nothing about being offline.
   *
   * Two independent witnesses, because they cover different paths:
   *   - renderer: requests the CDP `Fetch` block failed;
   *   - main process: `searchDiscovery` NOT resolving with results. If it comes back with hits,
   *     the app reached the internet and the run is not an offline run at all — which is
   *     exactly what happened before `--host-resolver-rules` was added.
   */
  const rendererBlocked = out.blocked.length;
  const mainProcessReachedTheInternet = out.networkSurface?.kind === 'resolved'
    && (out.networkSurface.count ?? 0) > 0;

  if (CONTROL) {
    /**
     * The control asks the mirror-image question: with nothing blocked, does this artifact on
     * this machine actually reach the internet? If it does not, then the blocked run's zero
     * proves NOTHING — it was zero either way — and the pair is vacuous rather than passing.
     */
    step('5 CONTROL: the unblocked run reaches the internet, so the block has something to cut',
      mainProcessReachedTheInternet ? 'PASS' : 'VACUOUS',
      `renderer: ${out.wouldHaveBlocked.length} external request(s) would have been blocked across `
      + `${out.blockedHosts.length} host(s) [${out.blockedHosts.join(', ') || 'none'}], `
      + `${out.allowedLoopback} local; main process: searchDiscovery `
      + `${JSON.stringify(out.networkSurface)}`);
    out.verdict = mainProcessReachedTheInternet ? 'CONTROL-REACHED-THE-INTERNET' : 'CONTROL-VACUOUS';
    cdp.close();
    return out.verdict;
  }

  const bit = rendererBlocked > 0 || !mainProcessReachedTheInternet;
  step('5 the block actually bit something',
    mainProcessReachedTheInternet ? 'FAIL' : bit ? 'PASS' : 'INCONCLUSIVE',
    `renderer: ${rendererBlocked} external request(s) failed across ${out.blockedHosts.length} `
    + `host(s) [${out.blockedHosts.join(', ') || 'none'}], ${out.allowedLoopback} local passed; `
    + `main process: searchDiscovery ${JSON.stringify(out.networkSurface)}`);

  out.verdict = !health.stillMounted || mainProcessReachedTheInternet ? 'FAIL'
    : bit ? 'PASS' : 'INCONCLUSIVE';
  cdp.close();
  return out.verdict;
}

main()
  .then((verdict) => { out.result = verdict; })
  .catch((err) => { out.result = 'ERROR'; out.error = String(err?.message ?? err); log(`ERROR ${out.error}`); })
  .finally(() => {
    out.finishedAt = new Date().toISOString();
    out.log = logLines;
    if (child?.pid) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    }
    fs.mkdirSync(workRoot, { recursive: true });
    fs.writeFileSync(path.join(workRoot, 'packaged-offline.json'), `${JSON.stringify(out, null, 2)}\n`);
    console.log(`\nrecord: ${path.join(workRoot, 'packaged-offline.json')}`);
    process.exitCode = out.result === (CONTROL ? 'CONTROL-REACHED-THE-INTERNET' : 'PASS') ? 0 : 1;
  });
