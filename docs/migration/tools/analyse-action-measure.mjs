// Press the analyse row action in a real window — Phase 6, the analyse slice.
//
// The action was carried unwired since slice 3 for a reason that was TRUE when written and
// is now STALE: "no analyse API is exposed in preload.ts at all". `preload.ts:1275` exposes
// `studyPrepare`, and `renderer/mediaStudyOrchestrator.ts` exposes `prepareStudyMediaById`.
// What is still true is that the `study:prepare` HANDLER lives in the untracked
// `main/mediaStudyOrchestrator.ts`, so the panel OFFERS the capability as an injected prop
// and never imports it. That design has one consequence worth measuring rather than
// asserting: the button exists only where somebody supplies the action, so "does it render
// and does pressing it do the stated thing" cannot be answered from the app at all — only
// from a surface that supplies one. The dev harness does.
//
// A jsdom test already covers the branches. This answers the different question those
// cannot: does it render and respond to a REAL click in a REAL Chromium, with the app's own
// stylesheet applied — the standing "nobody has pressed it" bar this track holds itself to.
//
//   npx vite --config vite.renderer.config.ts --port 5174
//   node docs/migration/tools/analyse-action-measure.mjs
//
// Exits non-zero if any scenario measures wrong, so it is a gate and not a readout.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const BASE = process.env.HARNESS_ORIGIN ?? 'http://127.0.0.1:5174';
const OUT = path.join(REPO, 'docs/migration/proof', `analyse-action-${stamp()}`);

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * Runs in the page: read the button, click it with a real MouseEvent, wait for the live
 * region to say something, read it back. Returns observations only — every decision is
 * made in Node below, next to the numbers it was made from.
 *
 * The status line is polled rather than awaited on a fixed delay: the harness action sleeps
 * 400 ms on purpose, and a fixed wait shorter than that would measure the BUSY state and
 * read as a broken action.
 */
const MEASURE = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const status = () => document.querySelector('.study-lib-status')?.textContent?.trim() ?? null;

  const rows = [...document.querySelectorAll('.study-lib-row')].map((row) => ({
    state: row.getAttribute('data-state'),
    hasAnalyse: !!row.querySelector('.study-lib-analyse'),
  }));

  const button = document.querySelector('.study-lib-analyse');
  // The title the ROW actually shows. Do not hardcode it here or in the expectations:
  // entryTitle() prefers the Seanime collection title over the Study OS item title, so the
  // harness row reads "Sousou no Frieren" while the media item is "Sousou no Frieren 01".
  // A hardcoded expectation fails on that difference and reads exactly like a broken action.
  // (No backticks in this comment on purpose — it lives inside a template literal.)
  const row = button?.closest('.study-lib-row');
  const title = row?.querySelector('.study-lib-row-main strong')?.textContent?.trim() ?? null;
  if (!button) {
    return { rows, title, button: null, statusBefore: status(), statusAfter: null, busyLabel: null };
  }

  const before = {
    label: button.textContent.trim(),
    ariaLabel: button.getAttribute('aria-label'),
    disabled: button.disabled,
    // Proof the app's own stylesheet is applied — a harness measuring an unstyled page
    // would happily "pass" while the real surface was broken.
    visible: button.getBoundingClientRect().width > 0 && button.getBoundingClientRect().height > 0,
  };
  const statusBefore = status();

  button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

  // Catch the in-flight label while the injected action is still sleeping.
  await sleep(120);
  const live = document.querySelector('.study-lib-analyse');
  const busyLabel = live ? { label: live.textContent.trim(), disabled: live.disabled } : null;

  let statusAfter = null;
  for (let i = 0; i < 60; i++) {
    await sleep(100);
    const now = status();
    if (now && now !== statusBefore) { statusAfter = now; break; }
  }

  return { rows, title, button: before, statusBefore, statusAfter, busyLabel };
})()`;

const ELECTRON_EXE = path.join(
  REPO,
  'node_modules/electron/dist',
  process.platform === 'win32' ? 'electron.exe' : 'electron',
);
if (!fs.existsSync(ELECTRON_EXE)) throw new Error(`electron not found at ${ELECTRON_EXE}`);

// `executeJavaScript` resolves the promise the snippet returns, so the async IIFE is awaited
// for us. NEVER put a --user-data-dir inside the repo: Vite's watcher chokes on the locked
// Chromium `Cookies` file and kills the dev server. This one sets none at all.
const MAIN = `
const { app, BrowserWindow } = require('electron');
app.disableHardwareAcceleration();
const [url, measure] = [process.env.PROBE_URL, process.env.PROBE_JS];
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1500, height: 1100, show: false });
  try {
    await win.loadURL(url);
    await new Promise((r) => setTimeout(r, 3000));
    const out = await win.webContents.executeJavaScript(measure, true);
    process.stdout.write('PROBE_RESULT ' + JSON.stringify(out) + '\\n');
  } catch (e) {
    process.stdout.write('PROBE_ERROR ' + String(e && e.message || e) + '\\n');
  }
  app.exit(0);
});
`;

const mainPath = path.join(REPO, 'node_modules', '.analyse-action-probe.cjs');
fs.writeFileSync(mainPath, MAIN);

function probe(url) {
  return new Promise((resolve, reject) => {
    // The binary directly, never `npx`: Node 24 refuses to spawn a `.cmd` without a shell.
    const child = spawn(
      ELECTRON_EXE,
      [mainPath],
      { cwd: REPO, env: { ...process.env, PROBE_URL: url, PROBE_JS: MEASURE }, shell: false },
    );
    let out = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', () => {});
    child.on('close', () => {
      const line = out.split('\n').find((l) => l.startsWith('PROBE_RESULT '));
      if (!line) {
        reject(new Error(out.split('\n').find((l) => l.startsWith('PROBE_ERROR ')) ?? `no result from ${url}`));
        return;
      }
      resolve(JSON.parse(line.slice('PROBE_RESULT '.length)));
    });
    child.on('error', reject);
  });
}

const url = (state) => `${BASE}/src/renderer/__devharness__/study-library-harness.html?state=${state}`;

const SCENARIOS = [
  {
    state: 'populated',
    expect: (title) => `Analysed ${title} — 137 study words found.`,
    why: 'the ordinary outcome — a prepared analysis states how many study words it found',
  },
  {
    state: 'analyse-queued',
    expect: (title) => `${title} has no Japanese subtitles yet, so transcription was queued instead.`,
    why: 'the branch most likely to be misread as a failure. It must NOT say "Analysed"',
  },
  {
    state: 'analyse-failure',
    expect: () => 'The tokenizer is not available.',
    why: 'a rejected action must surface its reason AND release the row, not leave it busy',
  },
];

const results = [];
for (const scenario of SCENARIOS) {
  const target = url(scenario.state);
  console.log('probing', target);
  const observed = await probe(target);

  const analysableRows = observed.rows.filter((r) => r.state === 'unanalyzed' || r.state === 'stale');
  const wrongRows = observed.rows.filter(
    (r) => r.hasAnalyse !== (r.state === 'unanalyzed' || r.state === 'stale'),
  );
  const button = observed.button;
  const checks = {
    buttonRendered: !!button,
    buttonVisible: !!button?.visible,
    buttonNamedByTitle: /Frieren/.test(button?.ariaLabel ?? ''),
    offeredOnExactlyTheRightRows: analysableRows.length > 0 && wrongRows.length === 0,
    // Only the ordinary scenario is slow enough to observe mid-flight reliably.
    busyWhileRunning: scenario.state !== 'populated' || observed.busyLabel?.disabled === true,
    saidTheRightThing: observed.statusAfter === scenario.expect(observed.title),
    // The failure scenario's whole point: `finally` released the row.
    releasedTheRow: scenario.state !== 'analyse-failure' || button?.disabled === false,
  };
  const pass = Object.values(checks).every(Boolean);
  results.push({
    state: scenario.state,
    why: scenario.why,
    expected: scenario.expect(observed.title),
    url: target,
    observed,
    checks,
    result: pass ? 'PASS' : 'FAIL',
  });

  console.log(`  rows ${observed.rows.length} (${analysableRows.length} analysable, ${wrongRows.length} wrong)`);
  console.log(`  button ${JSON.stringify(button?.label)} visible=${button?.visible} busy=${JSON.stringify(observed.busyLabel)}`);
  console.log(`  said   ${JSON.stringify(observed.statusAfter)}`);
  console.log(`  -> ${pass ? 'PASS' : 'FAIL'}${pass ? '' : ` ${JSON.stringify(checks)}`}`);
}

const verdict = results.every((r) => r.result === 'PASS') ? 'PASS' : 'FAIL';
const record = {
  harness: 'analyse-action-measure.mjs',
  question:
    'Does the injected analyse row action render on exactly the rows whose next step is '
    + 'analysis, and does pressing it in a real Chromium state the right outcome for each '
    + 'of its three branches?',
  startedAt: new Date().toISOString(),
  scenarios: results,
  verdict,
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'analyse-action.json'), `${JSON.stringify(record, null, 2)}\n`);
fs.rmSync(mainPath, { force: true });

console.log(`\nrecord ${path.relative(REPO, OUT)}\nverdict ${verdict}`);
process.exit(verdict === 'PASS' ? 0 : 1);
