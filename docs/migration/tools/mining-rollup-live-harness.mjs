#!/usr/bin/env node
// Mine ONE real card through the app's own UI, then look at the rollup in the app — slice 47.
//
// `rollup-unseen-in-the-app` has been the standing OPEN row since slice 42. The reason
// recorded on 2026-08-02 was measured, not guessed: the dev server was up, the panel was
// reachable and Anki was answering, and what was missing was the HISTORY —
// `jp-video-core-mining-history-v1` in the renderer's localStorage was `[]`, because nobody
// had ever mined a card through VideoCore on this machine. The row then said only the user
// could create one.
//
// That last step does not follow. Writing a fixture into that store and calling it an in-app
// proof is what slice 42 refused, and rightly — but driving the app's OWN mining button with
// a real click, on a real cue, against live Anki, is not a fixture. It is the same code path
// a user's click takes, and every byte in the store afterwards was put there by the app.
// This harness does that, and then reads the rollup back out of the real Review panel.
//
// ## What makes this an in-app proof rather than a seeded one
//
//   * The history entry is written by `VideoCoreMiningPanel`'s own effect, from the result of
//     the app's own `window.api.ankiMineNote`. Nothing here calls `localStorage.setItem`.
//   * The cue comes from the sidecar, over the websocket, during real playback.
//   * The rollup is read from the DOM of the real `SeanimeWatchLoopPanel`, reached by
//     clicking the launcher and the Review segment — not from `seanimeWatchLoopCards` called
//     directly. `seanimeWatchLoopCards` counts only entries whose status is `exported` AND
//     whose `noteId` is a real number (`seanimeWatchLoop.ts:187`), so a failed mine cannot
//     produce a green reading here.
//
// ## Blanc and the main window share a localStorage
//
// The card is mined in Blanc's window (its player is the one with six passing steps behind
// it) and the rollup is read in the main window. Both load from `http://localhost:5173` and
// differ only by query string, so they are the same origin and the same store. That is why
// this works, and it is worth knowing before wondering whether the number crossed a process.
//
// ## Safety — it writes to the user's real Anki collection
//
// One note, into `StudyOS::_MigrationProbe`, typed into the panel's own destination field
// before mining. It is deleted by ID afterwards through the app's own `ankiDeleteNotes`, the
// probe deck is removed, and the deck count is recorded before and after. The prior contents
// of the mining-history store are snapshotted and RESTORED, so a user who had a real history
// gets it back untouched. Cleanup runs in `finally` and reports what it did.
//
// A mining RULE may override the typed destination (`result.deckOverriddenByRule`). That is
// recorded rather than fought: the note is deleted by id either way, but the record will say
// the card did not land where this harness asked, and the deck cleanup is skipped so nothing
// of the user's is removed.
//
// usage:
//   node docs/migration/tools/prepare-gplay-datadir.mjs <fixture.mkv> <empty-dir>
//   node docs/migration/tools/mining-rollup-live-harness.mjs --datadir=<that dir>
//
// NEEDS: the Vite dev server on 5173, and Anki running with AnkiConnect on 8765.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
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
/**
 * Namespaced so nothing of the user's can be confused for it, and so cleanup is decidable.
 *
 * `--deck=` (empty) leaves the panel's destination field alone, so the app's own profile
 * rule picks the deck — which is what a user's mine actually does. That is the only way to
 * get a STAGE on the card in this panel: a namespaced probe deck sits outside the profile's
 * sync query, so the interval snapshot never covers it and every card reads `untracked`.
 * The panel says so itself, which is how slice 47 found out. Either way the note is deleted
 * by id; only a deck this harness created is ever removed.
 */
const PROBE_DECK = flag('deck', 'StudyOS::_MigrationProbe');
const ANKI_URL = 'http://127.0.0.1:8765';

const BLANC_W = 560;
const BLANC_H = 460;

const stamp = process.env.RUN_STAMP
  ?? new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '');
const workRoot = path.join(REPO, 'docs/migration/proof', `mining-rollup-live-${stamp}`);
fs.mkdirSync(workRoot, { recursive: true });
/** NEVER inside the repo — a Chromium profile there makes Vite's watcher throw EBUSY. */
const scratchRoot = path.join(os.tmpdir(), `jp-mining-rollup-${stamp}`);
fs.mkdirSync(scratchRoot, { recursive: true });

const logLines = [];
const log = (m) => { const l = `[mining] ${m}`; logLines.push(l); console.log(l); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const out = {
  harness: 'mining-rollup-live-harness.mjs',
  question: 'Can the per-row mining rollup be seen non-zero in the real Review panel, against '
    + 'a card the app itself mined through its own button?',
  startedAt: new Date().toISOString(),
  mediaFile: MEDIA_FILE,
  dataDir: DATA_DIR,
  probeDeck: PROBE_DECK,
  steps: [],
};
function step(name, result, detail, extra = {}) {
  out.steps.push({ name, result, detail, ...extra });
  log(`${result} — ${name}: ${detail}`);
}

async function anki(action, params = {}) {
  const res = await fetch(ANKI_URL, {
    method: 'POST',
    body: JSON.stringify({ action, version: 6, params }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json();
  if (body.error) throw new Error(`AnkiConnect ${action}: ${body.error}`);
  return body.result;
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
      // The scheme test matters: Electron exposes an `about:blank` before the window
      // navigates, and every localStorage read against it fails as "Access is denied for
      // this document", which reads like a permissions problem and is not one.
      const page = targets.find((t) => t.type === 'page'
        && /^(https?|app):\/\//.test(t.url) && match(t.url));
      if (page?.webSocketDebuggerUrl) return page;
    } catch { /* not up */ }
    await sleep(400);
  }
  throw new Error(`no CDP target for ${label}; saw ${JSON.stringify(seen)}`);
}

class Cdp {
  constructor(url) { this.url = url; this.nextId = 1; this.pending = new Map(); }
  async open() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener('message', (event) => {
      let msg; try { msg = JSON.parse(String(event.data)); } catch { return; }
      if (msg.id == null) return;
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

async function waitFor(cdp, expression, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await cdp.evaluate(expression);
    if (last) return last;
    await sleep(400);
  }
  throw new Error(`${label} (last value ${JSON.stringify(last)})`);
}

/**
 * React owns the value of a controlled input, so assigning `el.value` and firing `input`
 * is silently reverted on the next render: React's onChange reads the value from its own
 * tracker, sees no change, and does nothing. The native setter is what moves the tracker.
 * This is the standard workaround, and it is the reason the deck field is set this way
 * rather than with `el.value = …`.
 */
const SET_REACT_INPUT = `(el, value) => {
  const proto = Object.getPrototypeOf(el);
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value); else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}`;

let electron = null;

async function main() {
  if (!fs.existsSync(MEDIA_FILE)) throw new Error(`fixture not found: ${MEDIA_FILE}`);

  // ── Preconditions, each failing with its own cause ──────────────────────────────
  const vite = await fetch('http://127.0.0.1:5173/', { signal: AbortSignal.timeout(3000) })
    .then((r) => r.status).catch(() => null);
  if (vite === null) {
    throw new Error('nothing is listening on 5173. `.vite/build/main.js` resolves the renderer '
      + 'there, so the desktop would never mount — slice 38\'s trap. Start Vite:\n'
      + '  npx vite --config vite.renderer.config.ts --port 5173 --strictPort');
  }
  const ankiVersion = await anki('version').catch((err) => { throw new Error(
    `AnkiConnect is not answering on 8765 (${err.message}). This harness mines a REAL card; `
    + 'without Anki there is nothing to mine into.'); });
  const decksBefore = await anki('deckNames');
  // The NAMES, not just the count. Mining through the profile rule can create a deck this
  // harness never named, and a count tells you that happened without telling you which one —
  // which is exactly the position slice 47's second run ended in.
  out.decksBeforeList = decksBefore;
  out.anki = { version: ankiVersion, decksBefore: decksBefore.length };
  step('0a Anki answers and the deck list is recorded', 'PASS',
    `AnkiConnect v${ankiVersion}, ${decksBefore.length} decks`);

  const userDataDir = path.join(scratchRoot, 'userdata');
  fs.mkdirSync(userDataDir, { recursive: true });
  const cdpPort = await freePort();
  const env = { ...process.env };
  delete env.SEANIME_EXE;      // the shipped default is what is under test
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

  const mainTarget = await findTarget(cdpPort, Date.now() + 120_000,
    (url) => !url.includes('?') && !url.includes('blanc'), 'the main window');
  const main = await new Cdp(mainTarget.webSocketDebuggerUrl).open();
  await waitFor(main, "typeof window.api?.seanimeStatus === 'function'"
    + " && !!document.querySelector('.desktop-root')", 120_000, 'the desktop never mounted');
  await main.evaluate(
    "(()=>{const b=document.querySelector('.consent-no');if(b){b.click();return 1;}return 0;})()",
  );

  // ── Step 0b: what the store held BEFORE, so it can be put back ──────────────────
  const historyBefore = await main.evaluate(
    "localStorage.getItem('jp-video-core-mining-history-v1')",
  );
  out.historyBefore = historyBefore;
  const parsedBefore = (() => { try { return JSON.parse(historyBefore ?? '[]'); } catch { return null; } })();
  out.historyBeforeCount = Array.isArray(parsedBefore) ? parsedBefore.length : null;
  step('0b the mining history before anything is driven', 'MEASURED',
    `${out.historyBeforeCount} entr${out.historyBeforeCount === 1 ? 'y' : 'ies'}`
    + `${out.historyBeforeCount === 0 ? ' — this is the state the OPEN row described' : ''}`);

  // ── Step 0c: the sidecar, up before anything is clicked ─────────────────────────
  await main.evaluate('window.api.seanimeStart().then(()=>1).catch(()=>0)');
  let ready = null;
  for (const deadline = Date.now() + 180_000; Date.now() < deadline && !ready;) {
    const s = await main.evaluate('window.api.seanimeStatus()');
    if (s?.kind === 'ready') ready = s; else await sleep(500);
  }
  if (!ready) throw new Error('sidecar never reached ready');
  out.sidecar = { pid: ready.pid, port: ready.port, version: ready.version };
  step('0c sidecar ready', 'PASS', `pid ${ready.pid}, port ${ready.port}, v${ready.version}`);

  // ── Step 1: play the fixture in Blanc ───────────────────────────────────────────
  await main.evaluate(`window.api.blancOpen({width:${BLANC_W},height:${BLANC_H}})`);
  const blancTarget = await findTarget(cdpPort, Date.now() + 120_000,
    (url) => url.includes('blanc=1'), "Blanc's window");
  const blanc = await new Cdp(blancTarget.webSocketDebuggerUrl).open();
  await waitFor(blanc, "!!document.querySelector('.blanc-root')", 120_000, 'Blanc never mounted');

  const seeded = JSON.parse(await blanc.evaluate(
    `window.api.addMediaPaths([${JSON.stringify(MEDIA_FILE)}]).then(items => JSON.stringify(
       items.map(i => ({ id: i.id, fileName: i.fileName }))))`,
  ));
  const item = seeded.find((i) => i.fileName === path.basename(MEDIA_FILE)) ?? seeded[0];
  out.item = item;

  await blanc.evaluate("(window.dispatchEvent(new CustomEvent('blanc:select-tab',{detail:'media'})),1)");
  await waitFor(blanc, "document.querySelectorAll('.media-card').length", 60_000,
    'no library card in Blanc');
  const clicked = await blanc.evaluate(
    `(() => {
      const card = [...document.querySelectorAll('.media-card')]
        .find(c => (c.textContent ?? '').includes(${JSON.stringify(path.basename(MEDIA_FILE))}));
      if (!card) return 0;
      card.click();
      return 1;
    })()`,
  );
  if (!clicked) throw new Error('the library card was never clicked');

  // Blanc's first open is historically the flaky one, and this harness is not about that.
  // A second request on the settled session is the documented reliable path (slice 23), so
  // one retry is allowed here and RECORDED — it is not a silent retry loop.
  let playing = null;
  out.openAttempts = 0;
  for (let attempt = 1; attempt <= 2 && !playing; attempt += 1) {
    out.openAttempts = attempt;
    try {
      playing = await waitFor(blanc,
        `(() => { const v = document.querySelector('#media-workspace.blanc-study-player [data-vc-element="video"]');
           return v && v.readyState >= 3 ? JSON.stringify({ readyState: v.readyState, duration: v.duration }) : 0; })()`,
        attempt === 1 ? 90_000 : 60_000, 'the video never became playable');
    } catch (err) {
      if (attempt === 2) throw err;
      log(`  first open did not become playable (${err.message}); re-requesting once`);
      await sleep(4000);
      await blanc.evaluate(
        `(() => {
          const card = [...document.querySelectorAll('.media-card')]
            .find(c => (c.textContent ?? '').includes(${JSON.stringify(path.basename(MEDIA_FILE))}));
          if (card) card.click();
          return 1;
        })()`,
      );
    }
  }
  step('1 the fixture is playing in Blanc', 'PASS',
    `${playing} after ${out.openAttempts} open attempt(s)`);

  // ── Step 2: a real cue reaches the mining panel ─────────────────────────────────
  // The panel's draft is built from the ACTIVE cue, so this waits for the panel's own term
  // field to carry text rather than for a cue event: what matters is that the button has
  // something to mine, which is the same condition `onMine` checks.
  const draft = JSON.parse(await waitFor(blanc,
    `(() => {
      const panel = document.querySelector('.study-mining-actions');
      if (!panel) return 0;
      const btn = document.querySelector('[data-study-action="mine-card"]');
      if (!btn || btn.disabled) return 0;
      const fields = [...document.querySelectorAll('.study-mining-grid textarea, .study-mining-grid input')];
      return JSON.stringify({
        fields: fields.length,
        firstText: (fields[0] && fields[0].value || '').slice(0, 80),
      });
    })()`, 120_000, 'the mining panel never offered a mineable cue'));
  out.draft = draft;
  step('2 the mining panel has a real cue to mine', 'PASS',
    `button enabled, term "${draft.firstText}"`);

  // ── Step 3: type the destination, exactly as a user would ───────────────────────
  if (PROBE_DECK) {
    const deckSet = await blanc.evaluate(
      `(() => {
        const setNative = ${SET_REACT_INPUT};
        const input = document.querySelector('.study-mining-grid input[list="video-core-anki-decks"]');
        if (!input) return 0;
        setNative(input, ${JSON.stringify(PROBE_DECK)});
        return 1;
      })()`,
    );
    if (!deckSet) throw new Error('the destination field was not found');
    const deckReadBack = await waitFor(blanc,
      `(() => { const i = document.querySelector('.study-mining-grid input[list="video-core-anki-decks"]');
         return i && i.value === ${JSON.stringify(PROBE_DECK)} ? 1 : 0; })()`,
      10_000, 'React reverted the destination field');
    step('3 the destination is set through the real input', 'PASS',
      `${PROBE_DECK} (read back: ${deckReadBack})`);
  } else {
    step('3 the destination is left to the app', 'MEASURED',
      'the field is untouched, so the profile rule chooses — the same thing a user gets');
  }

  // ── Step 4: the click ───────────────────────────────────────────────────────────
  const beforeLen = await blanc.evaluate(
    "JSON.parse(localStorage.getItem('jp-video-core-mining-history-v1') ?? '[]').length",
  );
  await blanc.evaluate("(document.querySelector('[data-study-action=\"mine-card\"]').click(),1)");
  const entryJson = await waitFor(blanc,
    `(() => {
      const h = JSON.parse(localStorage.getItem('jp-video-core-mining-history-v1') ?? '[]');
      if (h.length <= ${beforeLen}) return 0;
      return JSON.stringify(h[0]);
    })()`, 120_000, 'the mine produced no history entry');
  const entry = JSON.parse(entryJson);
  out.entry = {
    id: entry.id, status: entry.status, noteId: entry.noteId,
    destination: entry.destination, error: entry.error,
    term: entry.term, sentence: entry.sentence,
    mediaFilenames: entry.mediaFilenames,
    localFilePath: entry.provenance?.source?.localFilePath,
  };
  out.panelMessage = await blanc.evaluate(
    "(document.querySelector('.study-mining-message')?.textContent ?? '').slice(0,200)",
  );
  const mined = entry.status === 'exported' && typeof entry.noteId === 'number' && entry.noteId > 0;
  step('4 the app mined a real card through its own button',
    mined ? 'PASS' : 'FAIL',
    `status ${entry.status}, noteId ${entry.noteId ?? 'none'}, destination `
    + `${entry.destination ?? '—'}${entry.error ? `, error ${entry.error}` : ''}`);
  if (!mined) throw new Error(`the mine did not export: ${entry.status} ${entry.error ?? ''}`);

  // The note must actually exist in the collection — a history entry is the app's account of
  // what happened, and this is Anki's.
  const info = await anki('notesInfo', { notes: [entry.noteId] });
  const noteExists = Array.isArray(info) && info.length === 1 && info[0]?.noteId === entry.noteId;
  out.ankiNote = noteExists
    ? { noteId: info[0].noteId, modelName: info[0].modelName, tags: info[0].tags,
        fields: Object.keys(info[0].fields ?? {}) }
    : null;
  const cardsOfNote = noteExists ? await anki('cardsInfo', { cards: info[0].cards ?? [] }) : [];
  out.ankiDeckOfNote = cardsOfNote[0]?.deckName ?? null;
  step('4b Anki confirms the note by id', noteExists ? 'PASS' : 'FAIL',
    noteExists
      ? `noteId ${entry.noteId}, model ${info[0].modelName}, deck ${out.ankiDeckOfNote}`
      : 'notesInfo returned nothing for that id');

  // ── Step 5: the rollup, in the real Review panel, in the main window ────────────
  const opened = await main.evaluate(
    `(() => {
      const launcher = document.querySelector('.seanime-host-launcher');
      if (launcher) { launcher.click(); return 'launcher'; }
      return document.querySelector('.seanime-host') ? 'already-open' : 'not-found';
    })()`,
  );
  if (opened === 'not-found') throw new Error('the media workspace host is not mounted');
  await waitFor(main, "!!document.querySelector('.seanime-host-views')", 60_000,
    'the workspace never opened');
  const onReview = await main.evaluate(
    `(() => {
      const btns = [...document.querySelectorAll('.seanime-host-views .seanime-host-btn')];
      if (btns.length < 3) return 0;
      btns[2].click();
      return btns[2].getAttribute('aria-pressed') === 'true' ? 'was-pressed' : 'clicked';
    })()`,
  );
  await waitFor(main,
    "(() => { const b=[...document.querySelectorAll('.seanime-host-views .seanime-host-btn')];"
    + " return b[2] && b[2].getAttribute('aria-pressed')==='true' ? 1 : 0; })()",
    30_000, 'the Review segment never became the pressed one');
  step('5 the Review segment is open in the real workspace', 'PASS',
    `host ${opened}, review ${onReview}`);

  /**
   * WAIT FOR THE SNAPSHOT, or the stage is meaningless.
   *
   * The panel reads the mining history SYNCHRONOUSLY and renders cards immediately, then
   * fetches `ankiStatus` and `ankiGetIntervals` and re-renders (`SeanimeWatchLoopPanel.tsx`
   * :107-142). Sampling as soon as `.study-loop-card` exists therefore reads the pre-snapshot
   * frame, where `snapshot` is still `null` and EVERY card is `untracked` by construction.
   *
   * Slice 47's first two runs did exactly that and recorded `untracked` twice — which is not
   * a finding about the app, it is a finding about when the harness looked. `loading` is the
   * panel's own answer and it is exposed on the refresh button's `disabled`.
   *
   * It is MEASURED rather than fatal: a panel that never settles is itself a finding, and
   * failing here would throw away the reading that shows it.
   */
  const settleStart = Date.now();
  let settled = 0;
  for (const deadline = Date.now() + 90_000; Date.now() < deadline && !settled;) {
    settled = await main.evaluate(
      "(() => { const b = document.querySelector('.seanime-host .study-lib-refresh');"
      + ' return b ? (b.disabled ? 0 : 1) : -1; })()',
    );
    if (settled !== 1) { settled = 0; await sleep(500); }
  }
  out.snapshotSettleMs = settled ? Date.now() - settleStart : null;
  const settleDiag = await main.evaluate(
    `(() => {
      const host = document.querySelector('.seanime-host');
      const btn = host && host.querySelector('.study-lib-refresh');
      const status = host && host.querySelector('.study-lib-status');
      return JSON.stringify({
        hostPresent: !!host,
        refreshPresent: !!btn,
        refreshDisabled: btn ? !!btn.disabled : null,
        statusText: (status?.textContent ?? '').slice(0, 120),
      });
    })()`,
  );
  out.settleDiag = JSON.parse(settleDiag);
  // What the panel is actually waiting on, asked directly. `ankiGetIntervals` walks the
  // profile's sync query, which on this machine is 84 decks.
  out.bridgeTimings = JSON.parse(await main.evaluate(
    `(async () => {
      const time = async (fn) => {
        const t0 = Date.now();
        try { const v = await fn(); return { ms: Date.now() - t0, ok: true,
          shape: v == null ? 'null' : Array.isArray(v) ? 'array:' + v.length : typeof v }; }
        catch (e) { return { ms: Date.now() - t0, ok: false, error: String(e).slice(0, 200) }; }
      };
      const status = await time(() => window.api.ankiStatus());
      const intervals = await time(() => window.api.ankiGetIntervals());
      return JSON.stringify({ ankiStatus: status, ankiGetIntervals: intervals });
    })()`,
  ).catch((err) => JSON.stringify({ error: String(err?.message ?? err) })));
  step('5b the panel finished loading its Anki snapshot',
    settled ? 'PASS' : 'MEASURED',
    settled
      ? `refresh re-enabled after ${out.snapshotSettleMs} ms — anything read before this has no stage`
      : `NOT settled in 90 s: ${settleDiag}; bridge ${JSON.stringify(out.bridgeTimings)}`);

  const rollup = JSON.parse(await waitFor(main,
    `(() => {
      const host = document.querySelector('.seanime-host');
      if (!host) return 0;
      const empty = host.querySelector('.study-lib-empty');
      const cards = [...host.querySelectorAll('.study-loop-card')];
      const stats = [...host.querySelectorAll('.study-loop-stat')].map(s => ({
        label: (s.querySelector('dt')?.textContent ?? '').trim(),
        value: (s.querySelector('dd')?.textContent ?? '').trim(),
      }));
      if (!cards.length && !empty) return 0;   // still rendering
      return JSON.stringify({
        empty: !!empty,
        cards: cards.length,
        stages: cards.map(c => c.getAttribute('data-stage')),
        terms: cards.map(c => (c.querySelector('strong')?.textContent ?? '').slice(0, 60)),
        stats,
        note: (host.querySelector('.study-loop-note')?.textContent ?? '').slice(0, 160),
      });
    })()`, 90_000, 'the Review panel never rendered either cards or its empty state'));
  out.rollup = rollup;
  const sawCard = !rollup.empty && rollup.cards > 0
    && rollup.terms.some((term) => term && entry.term.includes(term.trim().slice(0, 10)));
  step('6 the rollup shows the mined card in the app',
    sawCard ? 'PASS' : 'FAIL',
    rollup.empty
      ? 'the panel rendered its EMPTY state'
      : `${rollup.cards} card(s), stages ${JSON.stringify(rollup.stages)}, `
        + `stats ${JSON.stringify(rollup.stats)}`);

  out.verdict = sawCard ? 'PASS' : 'FAIL';
  return { blanc, main, noteId: entry.noteId, mediaFilenames: entry.mediaFilenames ?? [] };
}

let handles = null;
main()
  .then((h) => { handles = h; out.result = out.verdict ?? 'DONE'; })
  .catch((err) => { out.result = 'ERROR'; out.error = String(err?.message ?? err); log(`ERROR ${out.error}`); })
  .finally(async () => {
    // ── Cleanup, which runs whatever happened above ────────────────────────────────
    out.cleanup = {};
    try {
      // The note, by id, through the app's own gateway when the app is still up — the same
      // path the panel's Undo button takes — and directly otherwise.
      const noteId = handles?.noteId ?? out.entry?.noteId;
      if (typeof noteId === 'number' && noteId > 0) {
        let deleted = null;
        if (handles?.main) {
          deleted = await handles.main.evaluate(
            `window.api.ankiDeleteNotes([${noteId}], ${JSON.stringify(handles.mediaFilenames ?? [])})
               .then(r => JSON.stringify(r)).catch(e => JSON.stringify({ ok:false, error:String(e) }))`,
          ).catch(() => null);
        }
        if (!deleted) { await anki('deleteNotes', { notes: [noteId] }); deleted = '{"ok":true,"via":"ankiconnect"}'; }
        out.cleanup.noteDeleted = deleted;
        // `notesInfo` answers `[{}]` — an array holding an EMPTY OBJECT — for a note that no
        // longer exists, and `{}` is truthy. The first version of this counted that as a
        // survivor and reported `residualNotes: 1` about a collection that was already clean.
        // A residual note is one that still has an id.
        const still = await anki('notesInfo', { notes: [noteId] }).catch(() => []);
        out.cleanup.residualNotes = Array.isArray(still)
          ? still.filter((n) => n && typeof n.noteId === 'number').length : null;
      }
      // The deck, only if the card actually landed in OURS. A mining rule that redirected it
      // means the deck belongs to the user and must not be touched.
      if (out.ankiDeckOfNote === PROBE_DECK || out.entry?.destination === PROBE_DECK) {
        await anki('deleteDecks', { decks: [PROBE_DECK], cardsToo: true });
        out.cleanup.probeDeckRemoved = true;
      } else {
        out.cleanup.probeDeckRemoved = false;
        out.cleanup.probeDeckNote = `the card landed in ${out.ankiDeckOfNote ?? 'an unknown deck'}`
          + ', which is not this harness\'s to remove';
      }
      const decksAfter = await anki('deckNames').catch(() => null);
      out.cleanup.decksAfter = decksAfter ? decksAfter.length : null;
      out.cleanup.deckCountUnchanged = decksAfter
        ? decksAfter.length === out.anki?.decksBefore : null;
      // Named, so a leftover is actionable rather than a number that went up. A deck the
      // PROFILE RULE created is deliberately NOT removed: it is the user's own configured
      // destination, a real mine would have created it too, and deleting a deck out of
      // someone's collection is not a harness's call to make. It is reported instead.
      if (decksAfter && Array.isArray(out.decksBeforeList)) {
        const before = new Set(out.decksBeforeList);
        out.cleanup.decksCreatedAndLeftBehind = decksAfter.filter((d) => !before.has(d));
        if (out.cleanup.decksCreatedAndLeftBehind.length) {
          out.cleanup.decksNote = 'These decks did not exist before the run and are still here. '
            + 'They were created by the app\'s own mining profile, not named by this harness, '
            + 'so removing them is the user\'s decision.';
        }
      }
    } catch (err) { out.cleanup.error = String(err?.message ?? err); }

    try {
      // The store goes back to exactly what it held. The point of this run is the READING,
      // not leaving a card behind — and a user with real history must get it back.
      if (handles?.main && out.historyBefore !== undefined) {
        await handles.main.evaluate(
          out.historyBefore === null
            ? "(localStorage.removeItem('jp-video-core-mining-history-v1'),1)"
            : `(localStorage.setItem('jp-video-core-mining-history-v1', ${JSON.stringify(out.historyBefore)}),1)`,
        );
        out.cleanup.historyRestored = await handles.main.evaluate(
          "localStorage.getItem('jp-video-core-mining-history-v1')",
        ) === out.historyBefore;
      }
    } catch (err) { out.cleanup.historyError = String(err?.message ?? err); }

    out.finishedAt = new Date().toISOString();
    out.log = logLines;
    try {
      const logDir = DATA_DIR && path.join(DATA_DIR, 'logs');
      if (logDir && fs.existsSync(logDir)) {
        const newest = fs.readdirSync(logDir)
          .map((f) => ({ f, m: fs.statSync(path.join(logDir, f)).mtimeMs }))
          .sort((a, b) => b.m - a.m)[0];
        if (newest) {
          fs.copyFileSync(path.join(logDir, newest.f), path.join(workRoot, `sidecar-${newest.f}`));
          out.sidecarLog = `sidecar-${newest.f}`;
        }
      }
    } catch (err) { out.sidecarLogError = String(err?.message ?? err); }

    handles?.blanc?.close();
    handles?.main?.close();
    // Windows does not reap a grandchild with its parent, and the sidecar is one.
    if (electron?.pid) {
      spawnSync('taskkill', ['/pid', String(electron.pid), '/T', '/F'],
        { stdio: 'ignore', windowsHide: true });
    }
    fs.writeFileSync(path.join(workRoot, 'mining-rollup-live.json'),
      `${JSON.stringify(out, null, 2)}\n`);
    console.log(`\nrecord: ${path.join(workRoot, 'mining-rollup-live.json')}`);
    process.exitCode = out.result === 'PASS' ? 0 : 1;
  });
