// Measure two dev-harness surfaces that no test can decide — slice 32.
//
// Two items had been carried for several slices with the same shape: "nobody has LOOKED at
// this". Both are geometry questions a jsdom test cannot answer, and both already had a dev
// harness built for a human to open in a browser — which is why they stayed open, because
// nobody opened one.
//
//   1. The stacked two-channel chart. Real data never produced a day with BOTH read and
//      watch time, so every column ever drawn had one segment. `study-ledger-harness.html`
//      `?state=mixed` seeds days that have both. The question its own header poses: do the
//      percentage heights RESOLVE, or does a percentage against an auto-height parent
//      silently become `auto` and collapse the bars?
//   2. The Continue-Watching widget at a NON-DEFAULT size. It computes its own row count
//      from the height `WidgetFrame` gives it, so "does a row fit" is only answerable at a
//      real size. `continue-watching-harness.html` renders it at three.
//
// This drives them with a plain Electron window rather than the app: no sidecar, no datadir,
// no CDP, and nothing of the product is touched. It needs the harness Vite server:
//
//   npx vite --config vite.renderer.config.ts --port 5174
//   node docs/migration/tools/devharness-measure.mjs
//
// Exits non-zero if either surface measures broken, so it is a gate and not a readout.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const BASE = process.env.HARNESS_ORIGIN ?? 'http://127.0.0.1:5174';
const OUT = path.join(REPO, 'docs/migration/proof', `devharness-measure-${stamp()}`);

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * Runs in the page. Returns geometry only — no assertions, so the decision lives here in
 * Node where it can be read next to the numbers it was made from.
 */
const MEASURE = `(() => {
  const num = (v) => Math.round(parseFloat(v) * 100) / 100;

  const bars = [...document.querySelectorAll('.stats-bar-track')].map((track) => {
    const stack = track.querySelector('.stats-bar-stack');
    const fills = [...track.querySelectorAll('.stats-bar-fill')].map((f) => ({
      channel: f.classList.contains('watch') ? 'watch' : 'read',
      declared: f.style.height,
      px: num(getComputedStyle(f).height),
    }));
    return {
      trackPx: num(getComputedStyle(track).height),
      stackPx: stack ? num(getComputedStyle(stack).height) : null,
      fills,
      sumPx: Math.round(fills.reduce((a, b) => a + b.px, 0) * 100) / 100,
    };
  });

  // The two harnesses label their frames with different classes, so ask for both rather
  // than silently recording nulls for one of them.
  const labels = [...document.querySelectorAll('.sl-label, .cw-harness-label')];
  const frames = [...document.querySelectorAll('.widget-body')].map((body, i) => {
    const label = labels[i];
    return {
      label: label ? label.textContent.trim() : null,
      clientH: body.clientHeight,
      scrollH: body.scrollHeight,
      overflowsPx: Math.max(0, body.scrollHeight - body.clientHeight),
      rows: body.querySelectorAll('.cw-row, .continue-watching-row, li').length,
    };
  });

  return { bars, frames, title: document.title, url: location.href };
})()`;

const MAIN = `
const { app, BrowserWindow } = require('electron');
app.disableHardwareAcceleration();
const [url, measure] = [process.env.PROBE_URL, process.env.PROBE_JS];
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1500, height: 1100, show: false });
  try {
    await win.loadURL(url);
    await new Promise((r) => setTimeout(r, 3000));
    const out = await win.webContents.executeJavaScript(measure);
    process.stdout.write('PROBE_RESULT ' + JSON.stringify(out) + '\\n');
  } catch (e) {
    process.stdout.write('PROBE_ERROR ' + String(e && e.message || e) + '\\n');
  }
  app.exit(0);
});
`;

const ELECTRON_EXE = path.join(
  REPO,
  'node_modules/electron/dist',
  process.platform === 'win32' ? 'electron.exe' : 'electron',
);
if (!fs.existsSync(ELECTRON_EXE)) throw new Error(`electron not found at ${ELECTRON_EXE}`);

const mainPath = path.join(REPO, 'node_modules', '.devharness-probe.cjs');
fs.writeFileSync(mainPath, MAIN);

function probe(url) {
  return new Promise((resolve, reject) => {
    // The binary directly, never `npx`: Node 24 refuses to spawn a `.cmd` without a shell
    // (EINVAL), and `shell: true` would then need every path quoted. Same resolution the
    // other harnesses in this directory use.
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
        const err = out.split('\n').find((l) => l.startsWith('PROBE_ERROR '));
        reject(new Error(err ?? `no result from ${url}`));
        return;
      }
      resolve(JSON.parse(line.slice('PROBE_RESULT '.length)));
    });
    child.on('error', reject);
  });
}

const ledgerUrl = `${BASE}/src/renderer/__devharness__/study-ledger-harness.html?state=mixed`;
const cwUrl = `${BASE}/src/renderer/__devharness__/continue-watching-harness.html?state=populated`;

console.log('probing', ledgerUrl);
const ledger = await probe(ledgerUrl);
console.log('probing', cwUrl);
const cw = await probe(cwUrl);

// ---- the two decisions -------------------------------------------------------------

const twoChannel = ledger.bars.filter((b) => b.fills.length === 2);
const collapsed = ledger.bars.filter((b) => b.fills.some((f) => f.px === 0));
// A stack may legitimately equal its track (the peak column). Only a real overrun counts.
const overflowing = ledger.bars.filter((b) => b.sumPx > b.trackPx + 0.5);

const chartOk = twoChannel.length > 0 && collapsed.length === 0 && overflowing.length === 0;

const overflowingFrames = cw.frames.filter((f) => f.overflowsPx > 0);
const widgetOk = cw.frames.length > 0 && overflowingFrames.length === 0;

const verdict = chartOk && widgetOk ? 'PASS' : 'FAIL';
const record = {
  harness: 'devharness-measure.mjs',
  question:
    'Does the stacked two-channel chart resolve its percentage heights on a day that has '
    + 'BOTH channels, and does the Continue-Watching widget fit its rows at a non-default size?',
  startedAt: new Date().toISOString(),
  stackedChart: {
    url: ledgerUrl,
    totalBars: ledger.bars.length,
    barsWithBothChannels: twoChannel.length,
    collapsedSegments: collapsed.length,
    stacksOverflowingTheirTrack: overflowing.length,
    sample: twoChannel.slice(0, 4),
    result: chartOk ? 'PASS' : 'FAIL',
  },
  continueWatchingWidget: {
    url: cwUrl,
    frames: cw.frames,
    framesOverflowing: overflowingFrames.length,
    result: widgetOk ? 'PASS' : 'FAIL',
  },
  verdict,
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'devharness-measure.json'), `${JSON.stringify(record, null, 2)}\n`);
fs.rmSync(mainPath, { force: true });

console.log(`\nstacked chart : ${ledger.bars.length} bars, ${twoChannel.length} with BOTH channels, `
  + `${collapsed.length} collapsed, ${overflowing.length} overflowing -> ${record.stackedChart.result}`);
for (const b of twoChannel.slice(0, 3)) {
  console.log(`   track ${b.trackPx}px  stack ${b.stackPx}px  `
    + b.fills.map((f) => `${f.channel} ${f.declared}=${f.px}px`).join('  '));
}
console.log(`\ncontinue-watching: ${cw.frames.length} frames, ${overflowingFrames.length} overflowing `
  + `-> ${record.continueWatchingWidget.result}`);
for (const f of cw.frames) {
  console.log(`   ${JSON.stringify(f.label)}  body ${f.clientH}px  content ${f.scrollH}px  rows ${f.rows}`);
}
console.log(`\nrecord ${path.relative(REPO, OUT)}\nverdict ${verdict}`);
process.exit(verdict === 'PASS' ? 0 : 1);
