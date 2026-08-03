/**
 * summarize-a11y-proofs.mjs — turn every packaged-a11y-deep-RUN record
 * (proof/packaged-a11y-deep-RUN/packaged-a11y-deep.json) into ONE table with the
 * denominators kept. Note the path is written without a wildcard on purpose: the
 * two characters that spell a glob for that directory also close this comment.
 *
 * Why it prints denominators and not verdicts: the two most expensive mistakes on this
 * track were a "PASS" on 8 samples of 251, and an `imagesWithoutAlt: 0` that was 0 out
 * of 0. A bare verdict hides both. Every column here is "n of N" wherever an N exists.
 *
 * It reads records only. It never launches anything and never edits a gate.
 *
 * Usage: node docs/migration/tools/summarize-a11y-proofs.mjs [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROOF = path.resolve(HERE, '../proof');

const rows = [];
for (const dir of fs.readdirSync(PROOF).sort()) {
  if (!dir.startsWith('packaged-a11y-deep-')) continue;
  const file = path.join(PROOF, dir, 'packaged-a11y-deep.json');
  if (!fs.existsSync(file)) { rows.push({ run: dir, error: 'no record written' }); continue; }
  let r;
  try { r = JSON.parse(fs.readFileSync(file, 'utf-8')); }
  catch (e) { rows.push({ run: dir, error: `unparseable: ${e.message}` }); continue; }

  const stepBy = (prefix) => (r.steps || []).find((s) => s.name.startsWith(prefix));
  const kt = r.keyboardTotals || {};
  const ct = r.contrast || {};
  const nt = r.nonTextContrast || {};
  const fr = r.focusRingContrast || {};

  rows.push({
    run: dir.replace('packaged-a11y-deep-', ''),
    // The theme block only exists when --theme was passed; its absence IS the default run.
    theme: r.theme?.requested ?? 'study-os (default)',
    verdict: r.verdict ?? r.result ?? '?',
    trustworthy: r.trustworthy,
    // A2: reached by Tab, over focusable total.
    tab: kt.focusableTotal != null
      ? `${kt.stopsReachedByIdentity ?? kt.distinctStops}/${kt.focusableTotal}`
      : '—',
    tabStep: stepBy('A2')?.result ?? '—',
    // B1: `totalFailing` counts everything below AA INCLUDING controls that are exempt
    // under 1.4.3 because they are inactive. `failingExcludingInactive` is the real number.
    textReal: ct.failingExcludingInactive ?? null,
    textBelow: ct.totalFailing ?? null,
    textSamples: ct.totalMeasured ?? null,
    textStep: stepBy('B1')?.result ?? '—',
    // B2: the scored fraction is the whole point — `boundaryLessNotScored` controls paint no
    // boundary and are never scored, so "scored of seen" is the honest denominator, and
    // `failing` (load-bearing) is what actually carries the verdict, not `belowThreeRaw`.
    nonTextScored: nt.scored ?? null,
    nonTextTotal: nt.controlsSeen ?? null,
    nonTextBelow: nt.belowThreeRaw ?? null,
    nonTextLoadBearing: nt.failing ?? null,
    nonTextStep: stepBy('B2')?.result ?? '—',
    // B3: ringed stops measured on the real Tab walk, and how many fell below 3:1.
    ringMeasured: fr.stopsWithARingMeasured ?? null,
    ringBelow: fr.failing ?? null,
    ringStep: stepBy('B3')?.result ?? '—',
    c0: stepBy('C0')?.result ?? '—',
    e1: stepBy('E1')?.result ?? '—',
    failedSteps: (r.failedSteps || []).length,
    proof: path.join('docs/migration/proof', dir),
  });
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const cell = (v) => (v == null ? '—' : String(v));
  console.log('| run | theme | verdict | A2 tab | B1 text (real/belowAA/samples) | B2 non-text (below/scored of total, load-bearing) | B3 ring (below/measured) | C0 | E1 | failed |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    if (r.error) { console.log(`| ${r.run} | — | ERROR | ${r.error} | | | | | | |`); continue; }
    console.log(`| ${r.run} | ${r.theme} | ${r.verdict}${r.trustworthy === false ? ' (NOT TRUSTWORTHY)' : ''} `
      + `| ${r.tabStep} ${r.tab} `
      + `| ${r.textStep} ${cell(r.textReal)}/${cell(r.textBelow)}/${cell(r.textSamples)} `
      + `| ${r.nonTextStep} ${cell(r.nonTextBelow)}/${cell(r.nonTextScored)} of ${cell(r.nonTextTotal)}, lb=${cell(r.nonTextLoadBearing)} `
      + `| ${r.ringStep} ${cell(r.ringBelow)}/${cell(r.ringMeasured)} `
      + `| ${r.c0} | ${r.e1} | ${r.failedSteps} |`);
  }
  console.log(`\n${rows.length} run(s). Proof dirs under docs/migration/proof/.`);
}
