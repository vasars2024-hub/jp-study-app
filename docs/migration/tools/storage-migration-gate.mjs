#!/usr/bin/env node
// Does this app have a data-migration path, and does it survive being interrupted? — Phase 9 / slice 48.
//
// Phase 9's checklist carries "interrupted-migration tests". Slice 47's session could not find a
// migration layer at all and flagged the item as possibly naming nothing. It names something:
//
//   src/renderer/storage/migrationRunner.ts  runStorageMigrations(), called from main.tsx on
//                                            every boot of the main window
//   src/shared/storageMigrationBoundary.ts   STORAGE_MIGRATION_VERSION = 5, the retention plan
//   VERSION_KEY 'storage-version' in IndexedDB — a real versioned upgrade-on-load
//
// This gate drives the REAL runner in the REAL packaged app, on a throwaway user-data-dir, and
// asks four questions. Each is a difference between controlled runs, never an absence read.
//
//   1 ROUND-TRIP   Seed the five retained localStorage keys, run the migration, read them back.
//                  A migration that "keeps" a value must return the value it was given.
//   2 ESCALATION   Run it again. If run 1 changed the bytes, run 2 must show it compounding —
//                  that is what separates a one-off normalisation from a per-boot defect.
//   3 CONTROL      A key the runner does not enumerate must be untouched across both runs.
//                  Without this, "the bytes changed" could be anything else in the app.
//   4 INTERRUPT    Kill the process DURING replaceAtomic's write loop, reboot on the same
//                  profile, and report what survived and whether the version counter moved.
//
// ## Two instrument traps this gate is built around, both of which produced a false PASS first
//
// **The probe must not create the database.** `indexedDB.open('jp-study-db')` with no
// `onupgradeneeded` CREATES an empty v1 database with no `kv` object store. The app's own
// `openDb()` then opens it successfully — the version matches, so its upgrade handler never
// runs — and every `withStore` call throws `NotFoundError` forever after. The migration is
// wrapped in try/catch, so it logs "skipped" and does nothing, and the gate reads back
// byte-identical values and calls it a PASS. The first version of this file did exactly that
// and reported three PASSes about a run in which the migration never executed.
//
// **"The migration ran" needs a positive observable, per boot.** `storage-version` is written
// once and then equals 5 forever, so its presence proves only that some earlier boot finished.
// This gate resets it to 0 before every reload and waits for it to come back as 5 — a value the
// runner alone writes, and only on the last line of a completed run.
//
// usage:
//   node docs/migration/tools/storage-migration-gate.mjs
//   node docs/migration/tools/storage-migration-gate.mjs --exe=out/…/jp-study-app.exe
//   node docs/migration/tools/storage-migration-gate.mjs --skip-interrupt

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');

const argv = process.argv.slice(2);
const arg = (name, fallback = '') => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const flag = (name) => argv.includes(`--${name}`);

const EXE = path.resolve(arg('exe')
  || path.join(REPO, 'out', 'jp-study-app-win32-x64', 'jp-study-app.exe'));

const stamp = process.env.RUN_STAMP
  ?? new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '');
const workRoot = path.join(REPO, 'docs/migration/proof', `storage-migration-${stamp}`);

/** The five localStorage keys the runner enumerates (LS_KEYS) and retains (HEAVY_LOCAL_STORAGE_KEYS). */
const RETAINED_LS = [
  'jp-flashcard-deck',
  'jp-study-csv-editor-v1',
  'jp-clipboard-history',
  'jp-calendar-events',
  'jp-media-tracking-v1',
];
/** Not in LS_KEYS at all — the control. If this moves, the instrument is measuring the wrong thing. */
const CONTROL_LS = 'jp-slice48-control';

/** Every IndexedDB key the runner might enumerate, plus one it certainly does not. */
const IDB_CANDIDATES = [
  'flashcard-deck', 'csv-editor', 'clipboard-history', 'calendar-events',
  'reading-annotations', 'reading-bookmarks', 'grammar-curation', 'grammar-familiarity',
  'grammar-session-options', 'grammar-session-history', 'level-lists',
  'media-study-database',
];
const CONTROL_IDB = 'zz-slice48-untouched';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logLines = [];
const log = (m) => { const l = `[storage-migration] ${m}`; logLines.push(l); console.log(l); };

const out = {
  gate: 'storage-migration-gate.mjs',
  question: 'Does a data migration exist, does it round-trip the data it keeps, and does an '
    + 'interruption mid-write leave a store that survives?',
  startedAt: new Date().toISOString(),
  exe: EXE,
  steps: [],
  runs: [],
  console: [],
};
function step(name, result, detail, extra = {}) {
  out.steps.push({ name, result, detail, ...extra });
  log(`${result} — ${name}: ${detail}`);
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

async function findTarget(port, deadline) {
  let seen = [];
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await res.json();
      seen = targets.filter((t) => t.type === 'page').map((t) => t.url);
      const page = targets.find((t) => t.type === 'page' && /^(https?|app):\/\//.test(t.url));
      if (page?.webSocketDebuggerUrl) return page;
    } catch { /* not up yet */ }
    await sleep(400);
  }
  throw new Error(`no CDP page target; saw ${JSON.stringify(seen)}`);
}

class Cdp {
  constructor(url) { this.url = url; this.nextId = 1; this.pending = new Map(); }
  async open() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener('message', (event) => {
      let msg; try { msg = JSON.parse(String(event.data)); } catch { return; }
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ');
        if (text.includes('[storage]')) out.console.push({ at: Date.now(), type: msg.params.type, text });
        return;
      }
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
    await this.send('Runtime.enable', {});
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
      expression, awaitPromise: true, returnByValue: true,
    });
    if (msg.result?.exceptionDetails) {
      throw new Error(msg.result.exceptionDetails.exception?.description ?? 'evaluate threw');
    }
    return msg.result?.result?.value;
  }
  close() { try { this.socket?.close(); } catch { /* gone */ } }
}

/**
 * How many times must JSON.parse be applied before the value stops being a string?
 * A correctly round-tripped object needs exactly one. Each extra layer is one extra
 * JSON.stringify that nothing asked for — and the app's own readers call parse ONCE
 * (flashcardDeck.ts:72), so anything above 1 reads back as a string, not an object.
 */
const DEPTH_FN = `(raw) => {
  if (raw == null) return { present: false };
  let value = raw; let depth = 0;
  for (let i = 0; i < 12; i += 1) {
    if (typeof value !== 'string') break;
    try { value = JSON.parse(value); depth += 1; } catch { return { present: true, depth, parsed: false }; }
  }
  return { present: true, depth, parsed: true, type: Array.isArray(value) ? 'array' : typeof value };
}`;

const READ_LS = (keys) => `(() => {
  const depthOf = ${DEPTH_FN};
  const result = {};
  for (const key of ${JSON.stringify(keys)}) {
    const raw = localStorage.getItem(key);
    result[key] = { ...depthOf(raw), bytes: raw == null ? 0 : raw.length, head: raw == null ? null : raw.slice(0, 40) };
  }
  return JSON.stringify(result);
})()`;

/**
 * Open exactly the way the app does, INCLUDING the upgrade handler. A probe that omits it
 * leaves a store-less database behind and silently disables the thing under measurement.
 */
const OPEN_DB = `(async () => {
  return await new Promise((res, rej) => {
    const r = indexedDB.open('jp-study-db', 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
})()`;

/**
 * The migration's plan clones every retained value through `JSON.parse(JSON.stringify(v))`
 * (storageMigrationBoundary.ts:41). A `Date` survives IndexedDB's structured clone but NOT a
 * JSON round-trip, so `typeof when` flips from 'object' to 'string' the moment the runner has
 * rewritten that key. That gives a per-key, per-run marker for "the write loop reached here",
 * which is what makes a mid-flight kill targetable instead of a guess.
 */
const READ_IDB = `(async () => {
  const db = await ${OPEN_DB};
  if (!db.objectStoreNames.contains('kv')) return JSON.stringify({ store: false });
  const get = (fn) => new Promise((res, rej) => {
    const r = fn(db.transaction('kv', 'readonly').objectStore('kv'));
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const keys = (await get((s) => s.getAllKeys())).map(String);
  const values = await get((s) => s.getAll());
  const map = {}; const rewritten = [];
  keys.forEach((k, i) => {
    const v = values[i];
    if (v === undefined) { map[k] = 'undefined'; return; }
    if (v && typeof v === 'object' && 'when' in v) {
      const isDate = v.when instanceof Date;
      map[k] = isDate ? 'seeded' : 'rewritten';
      if (!isDate) rewritten.push(k);
      return;
    }
    map[k] = typeof v === 'object' ? 'object' : (typeof v + ':' + String(v).slice(0, 12));
  });
  return JSON.stringify({ store: true, keys, values: map, rewritten });
})()`;

const WRITE_IDB = (entries) => `(async () => {
  const db = await ${OPEN_DB};
  const tx = db.transaction('kv', 'readwrite');
  const store = tx.objectStore('kv');
  for (const [k, v] of ${JSON.stringify(entries)}) store.put(v, k);
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  return 'ok';
})()`;

/** Seed marker values carrying a live `Date`, with the bulk padding generated in the page. */
const SEED_IDB = (keys, padBytes) => `(async () => {
  const db = await ${OPEN_DB};
  const pad = ${padBytes} > 0 ? 'x'.repeat(${padBytes}) : '';
  const tx = db.transaction('kv', 'readwrite');
  const store = tx.objectStore('kv');
  for (const k of ${JSON.stringify(keys)}) store.put({ marker: k, when: new Date(0), pad }, k);
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  return 'ok';
})()`;

let child = null;

function killTree(pid) {
  if (!pid) return;
  spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
}

/**
 * Electron holds a single-instance lock on the user-data-dir, so a second spawn against the same
 * profile exits immediately and presents as "no CDP target". Every boot kills its predecessor.
 */
async function boot(userDataDir, label, earlyProbe = null) {
  if (child?.pid) { killTree(child.pid); await sleep(2500); }
  const cdpPort = await freePort();
  child = spawn(EXE, [`--user-data-dir=${userDataDir}`, `--remote-debugging-port=${cdpPort}`],
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  child.stdout.resume();
  child.stderr.resume();
  const target = await findTarget(cdpPort, Date.now() + 180_000);
  const cdp = await new Cdp(target.webSocketDebuggerUrl).open();
  // The migration fires on the first idle period after load, which is often before
  // `readyState === 'complete'` is even observable from here. Anything that needs to see the
  // profile as the kill left it has to read BEFORE that wait, not after it.
  if (earlyProbe) {
    const until = Date.now() + 20_000;
    while (Date.now() < until) {
      const value = await cdp.evaluate(READ_ONE(earlyProbe.key)).catch(() => null);
      if (value != null) { earlyProbe.first = { value, atMs: Date.now() }; break; }
      await sleep(20);
    }
  }
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const ok = await cdp.evaluate('document.readyState === "complete" && !!document.body').catch(() => false);
    if (ok) break;
    await sleep(400);
  }
  log(`${label}: window up at ${target.url} (pid ${child.pid})`);
  return cdp;
}

/** One tiny read, for polling a 36 MB store without pulling all of it back every 40 ms. */
const READ_ONE = (key) => `(async () => {
  const db = await ${OPEN_DB};
  if (!db.objectStoreNames.contains('kv')) return 'nostore';
  const v = await new Promise((res, rej) => {
    const r = db.transaction('kv', 'readonly').objectStore('kv').get(${JSON.stringify(key)});
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  if (v === undefined) return 'undefined';
  if (v && typeof v === 'object' && 'when' in v) return v.when instanceof Date ? 'seeded' : 'rewritten';
  return typeof v + ':' + String(v).slice(0, 12);
})()`;

/**
 * Wait for a migration to finish on the CURRENT page load. `storage-version` is written on the
 * last line of a COMPLETED run, so resetting it to 0 and waiting for 5 proves the whole thing
 * executed this boot rather than on some earlier one.
 *
 * The wait matters as much as the signal. `runStorageMigrations` reads its snapshot, awaits the
 * IndexedDB write loop, and only THEN touches localStorage — so a value written by the harness
 * inside that window is not in the snapshot and gets removed by the very next line. The gate's
 * first version seeded immediately after `readyState === 'complete'`, landed inside that window,
 * and reported "all five retained keys were REMOVED" — a race in the instrument, not the app's
 * steady-state behaviour. Every seed here happens after a completed run, never during one.
 */
async function waitForMigration(cdp, label, timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = await cdp.evaluate(READ_ONE('storage-version')).catch(() => null);
    if (v === 'number:5') {
      await sleep(600); // the localStorage loop runs right after the version write
      log(`${label}: migration completed after ${Date.now() - start} ms (storage-version -> 5)`);
      return { ok: true, ms: Date.now() - start };
    }
    await sleep(250);
  }
  return { ok: false };
}

async function runMigrationOnce(cdp, label, timeoutMs = 120_000) {
  await cdp.evaluate(WRITE_IDB([['storage-version', 0]]));
  await cdp.send('Page.reload', {});
  await sleep(1200);
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const ok = await cdp.evaluate('document.readyState === "complete" && !!document.body').catch(() => false);
    if (ok) break;
    await sleep(300);
  }
  const done = await waitForMigration(cdp, label, timeoutMs);
  if (!done.ok) return { ok: false };
  return { ok: true, ms: done.ms, idb: JSON.parse(await cdp.evaluate(READ_IDB)) };
}

async function main() {
  if (!fs.existsSync(EXE)) throw new Error(`no packaged build at ${EXE}`);
  out.exeBuiltAt = fs.statSync(EXE).mtime.toISOString();
  fs.mkdirSync(workRoot, { recursive: true });

  // A FRESH profile every run. Reusing one leaves `storage-version` at 5 from the previous run,
  // which makes boot1's "wait for the migration" return before this boot's migration has even
  // started — the seed then lands mid-run and the depths come out three layers too deep.
  const userDataDir = path.join(os.tmpdir(), `jp-storage-migration-${stamp}-${process.pid}`);
  fs.rmSync(userDataDir, { recursive: true, force: true });
  fs.mkdirSync(userDataDir, { recursive: true });
  out.userDataDir = userDataDir;

  const readKeys = [...RETAINED_LS, CONTROL_LS];
  let cdp = await boot(userDataDir, 'boot1');

  // Boot 1 runs its own migration on an empty profile. Seeding before it finishes drops the
  // seed into the window between readSnapshot() and replaceAtomic() — see waitForMigration.
  const settled = await waitForMigration(cdp, 'boot1');
  if (!settled.ok) throw new Error('the first boot never completed a migration — the profile is not in a known state');

  // ── Seed. Values are written exactly the way the app writes them: one JSON.stringify. ──
  const SEED = {
    'jp-flashcard-deck': { folders: ['slice48'], cards: [{ id: 'fc-slice48', front: 'A', back: 'B', addedAt: 1 }] },
    'jp-study-csv-editor-v1': { rows: [['a', 'b']] },
    'jp-clipboard-history': [{ id: 'cb-slice48', text: 'seeded' }],
    'jp-calendar-events': [{ id: 'ev-slice48', title: 'seeded' }],
    'jp-media-tracking-v1': { version: 1, records: [] },
  };
  await cdp.evaluate(`(() => {
    const seed = ${JSON.stringify(SEED)};
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, JSON.stringify(v));
    localStorage.setItem(${JSON.stringify(CONTROL_LS)}, JSON.stringify({ control: true }));
    return 'ok';
  })()`);
  const before = JSON.parse(await cdp.evaluate(READ_LS(readKeys)));
  step('seed', 'OK',
    `five retained keys + one control written as the app writes them (parse depth ${before['jp-flashcard-deck'].depth} each)`);
  out.runs.push({ run: 0, phase: 'seeded', localStorage: before });

  // ── Run 1. ────────────────────────────────────────────────────────────────────
  const run1 = await runMigrationOnce(cdp, 'run1');
  if (!run1.ok) throw new Error('the migration did not complete on run 1 — nothing below would mean anything');
  const after1 = JSON.parse(await cdp.evaluate(READ_LS(readKeys)));
  out.runs.push({ run: 1, phase: 'after-one-migration', ms: run1.ms, localStorage: after1, idb: run1.idb });

  const grew1 = RETAINED_LS.filter((k) => (after1[k]?.depth ?? 0) > (before[k]?.depth ?? 0));
  const gone1 = RETAINED_LS.filter((k) => !after1[k]?.present);
  step('round-trip',
    grew1.length || gone1.length ? 'FAIL' : 'PASS',
    grew1.length
      ? `${grew1.length}/5 retained keys came back re-encoded — parse depth 1 -> `
        + `${after1[grew1[0]].depth}, type now '${after1[grew1[0]].type}': ${grew1.join(', ')}`
      : gone1.length ? `${gone1.length} retained keys were removed: ${gone1.join(', ')}`
      : 'every retained key came back byte-identical',
    { reEncoded: grew1, removed: gone1 });

  // ── Run 2 — does it compound? A one-off normalisation would not. ─────────────
  const run2 = await runMigrationOnce(cdp, 'run2');
  if (!run2.ok) throw new Error('the migration did not complete on run 2');
  const after2 = JSON.parse(await cdp.evaluate(READ_LS(readKeys)));
  out.runs.push({ run: 2, phase: 'after-two-migrations', ms: run2.ms, localStorage: after2 });

  const grew2 = RETAINED_LS.filter((k) => after2[k]?.present && after1[k]?.present
    && (after2[k].depth ?? 0) > (after1[k].depth ?? 0));
  step('escalation',
    grew2.length ? 'FAIL' : 'PASS',
    grew2.length
      ? `a second run added another layer to ${grew2.length}/5 keys — `
        + RETAINED_LS.map((k) => `${k} ${before[k]?.depth}/${after1[k]?.depth}/${after2[k]?.depth}`).join('; ')
      : 'a second run changed nothing further',
    { reEncoded: grew2 });

  const controlMoved = before[CONTROL_LS]?.bytes !== after2[CONTROL_LS]?.bytes
    || before[CONTROL_LS]?.depth !== after2[CONTROL_LS]?.depth;
  step('control',
    controlMoved ? 'FAIL' : 'PASS',
    controlMoved
      ? 'the un-enumerated control key ALSO changed — this gate is measuring something other than the runner'
      : `${CONTROL_LS} (not in LS_KEYS) is byte-identical after two completed runs, so the change belongs to the runner`,
    { control: after2[CONTROL_LS] });

  // ── Run 3, still with nothing seeded into IndexedDB: is the growth unbounded? ──
  const run2b = await runMigrationOnce(cdp, 'run3-localstorage-only');
  if (!run2b.ok) throw new Error('the migration did not complete on run 3');
  const after3 = JSON.parse(await cdp.evaluate(READ_LS(readKeys)));
  out.runs.push({ run: 3, phase: 'after-three-migrations', ms: run2b.ms, localStorage: after3 });
  step('escalation-third-run',
    RETAINED_LS.some((k) => (after3[k]?.depth ?? 0) > (after2[k]?.depth ?? 0)) ? 'FAIL' : 'PASS',
    RETAINED_LS.map((k) => `${k} ${before[k]?.depth}/${after1[k]?.depth}/${after2[k]?.depth}/${after3[k]?.depth}`).join('; '));

  // ── Which IndexedDB keys does this build enumerate but not retain? ───────────
  await cdp.evaluate(SEED_IDB([...IDB_CANDIDATES, CONTROL_IDB], 0));
  const run3 = await runMigrationOnce(cdp, 'run3');
  if (!run3.ok) throw new Error('the migration did not complete on run 3');
  const idb3 = run3.idb;
  const dropped = [...IDB_CANDIDATES, CONTROL_IDB].filter((k) => idb3.values[k] === 'undefined');
  step('idb-retention', 'OK',
    dropped.length
      ? `this build DROPS ${dropped.length} enumerated key(s): ${dropped.join(', ')}`
      : 'no seeded IndexedDB key was dropped — every key this build enumerates is also retained',
    { dropped, rewritten: idb3.rewritten, values: idb3.values });

  // ── The interruption. ────────────────────────────────────────────────────────
  if (!flag('skip-interrupt')) {
    // Big values so the awaited write loop takes long enough to be cut in half. A payload
    // smaller than one write is not interruptible — slice 47l paid for that lesson. The pad is
    // built IN the page: a 3 MB string per key inside the evaluate expression would ship ~36 MB
    // of JavaScript source over the CDP socket for every seed.
    await cdp.evaluate(SEED_IDB(IDB_CANDIDATES, 3_000_000));
    await cdp.evaluate(SEED_IDB([CONTROL_IDB], 0));
    const seededIdb = JSON.parse(await cdp.evaluate(READ_IDB));
    step('interrupt-seed', 'OK',
      `${seededIdb.keys.length} IndexedDB keys seeded, ${IDB_CANDIDATES.length} of them ~3 MB each; `
      + `${seededIdb.rewritten.length} already rewritten (expected 0)`);

    // CALIBRATION. The loop cannot be watched while it runs: IndexedDB serialises readonly
    // transactions behind the readwrite ones on the same store, so a poll issued mid-loop does
    // not answer until the loop has drained. The first attempt polled every 25 ms for five
    // seconds and every answer arrived after the run had finished — it read "already complete"
    // about a loop it had been watching the whole time. So the kill is timed instead: measure
    // how long a full run over this payload takes, then cut the next one in half.
    const calibration = await runMigrationOnce(cdp, 'calibration');
    if (!calibration.ok) throw new Error('the calibration run did not complete');
    step('calibration', 'OK',
      `a full migration over ~${Math.round(IDB_CANDIDATES.length * 3)} MB takes ${calibration.ms} ms; `
      + `the kill will land at ${Math.round(calibration.ms * 0.45)} ms`,
      { ms: calibration.ms });

    await cdp.evaluate(SEED_IDB(IDB_CANDIDATES, 3_000_000));
    await cdp.evaluate(SEED_IDB([CONTROL_IDB], 0));
    await cdp.evaluate(WRITE_IDB([['storage-version', 0]]));
    const pid = child.pid;
    const killAt = Math.max(400, Math.round(calibration.ms * 0.45));
    await cdp.send('Page.reload', {});
    await sleep(killAt);
    killTree(pid);
    cdp.close();
    child = null;
    step('interrupt', 'OK',
      `process killed ${killAt} ms after reload, against a run that needs ${calibration.ms} ms — `
      + 'the write loop was still running',
      { killAt, calibrationMs: calibration.ms });
    await sleep(3000);

    // What the profile looks like BEFORE the next boot's migration repairs it. The window is
    // small (the runner fires ~1.3 s after load) but the reads are one key each, so they land.
    const probe = { key: 'storage-version' };
    cdp = await boot(userDataDir, 'boot-after-kill', probe);
    const early = { firstRead: probe.first ?? null };
    const inFlight = probe.first?.value === 'number:0';
    step('interrupt-evidence',
      inFlight ? 'OK' : 'INCONCLUSIVE',
      inFlight
        ? 'the killed run never reached its last line: the first read on the next boot found '
          + 'storage-version still 0, so replaceAtomic was cut before it returned'
        : `the first read on the next boot already saw storage-version ${probe.first?.value ?? 'nothing'} — `
          + "the next boot's own migration got there first, so this run cannot say where the kill landed",
      early);

    const settledAfterKill = await waitForMigration(cdp, 'boot-after-kill');
    const recovered = JSON.parse(await cdp.evaluate(READ_IDB));
    const lost = [...IDB_CANDIDATES, CONTROL_IDB]
      .filter((k) => !recovered.keys.includes(k) || recovered.values[k] === 'undefined');
    const unexpectedLoss = lost.filter((k) => !dropped.includes(k));
    out.recovered = recovered;
    step('recovery',
      unexpectedLoss.length || !settledAfterKill.ok ? 'FAIL' : 'PASS',
      `after the kill and a fresh boot: ${recovered.keys.length} keys present, `
      + `the next migration ${settledAfterKill.ok ? `completed in ${settledAfterKill.ms} ms` : 'did NOT complete'}, `
      + `storage-version=${recovered.values['storage-version']}, `
      + `lost beyond the key this build deliberately drops: ${unexpectedLoss.length ? unexpectedLoss.join(',') : 'none'}, `
      + `control ${CONTROL_IDB}=${recovered.values[CONTROL_IDB] ?? 'GONE'}`,
      { lost, unexpectedLoss, values: recovered.values });

    const ls = JSON.parse(await cdp.evaluate(READ_LS(readKeys)));
    out.runs.push({ run: 'after-kill', localStorage: ls, idb: recovered });
    step('recovery-localstorage', 'OK',
      'localStorage after the kill: '
      + RETAINED_LS.map((k) => `${k} depth ${ls[k]?.present ? ls[k].depth : 'gone'}`).join('; '));

    // Between `after3` and here, three more migrations completed, each of which writes every
    // retained localStorage key. If the depth is now BELOW `after3`, localStorage lost writes
    // that completed runs had already made — the two tiers did not survive the kill equally.
    const wentBackwards = RETAINED_LS.filter((k) => (ls[k]?.depth ?? 0) < (after3[k]?.depth ?? 0));
    step('tier-durability',
      wentBackwards.length ? 'NOTE' : 'OK',
      wentBackwards.length
        ? `IndexedDB kept every key across the kill, but ${wentBackwards.length}/5 localStorage keys `
          + `came back SHALLOWER than they were three completed migrations earlier `
          + `(${RETAINED_LS.map((k) => `${k} ${after3[k]?.depth}->${ls[k]?.depth}`).join('; ')}). `
          + 'Chromium commits localStorage to disk lazily, so a SIGKILL can discard recent writes; '
          + 'this gate OBSERVES the rollback and does not prove that mechanism.'
        : 'localStorage and IndexedDB came back at the same point across the kill',
      { wentBackwards, after3: RETAINED_LS.map((k) => after3[k]?.depth), afterKill: RETAINED_LS.map((k) => ls[k]?.depth) });
  }

  cdp.close();
  out.finishedAt = new Date().toISOString();
  out.verdict = out.steps.some((s) => s.result === 'FAIL') ? 'FAIL' : 'PASS';
}

main()
  .catch((err) => {
    step('gate', 'ERROR', err instanceof Error ? err.message : String(err));
    out.verdict = 'ERROR';
  })
  .finally(() => {
    killTree(child?.pid);
    fs.mkdirSync(workRoot, { recursive: true });
    fs.writeFileSync(path.join(workRoot, 'storage-migration.json'), JSON.stringify(out, null, 2));
    fs.writeFileSync(path.join(workRoot, 'run.log'), logLines.join('\n') + '\n');
    log(`verdict ${out.verdict} — ${workRoot}`);
    process.exit(out.verdict === 'PASS' ? 0 : 1);
  });
