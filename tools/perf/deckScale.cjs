#!/usr/bin/env node
/**
 * Run the 20,000-card / 200,000-row deck benchmark headlessly and print it.
 *
 *   node tools/perf/deckScale.cjs [label] [--compare <otherLabel>]
 *
 * Seeds the real renderer modules (jsdom + the suite's in-memory IndexedDB),
 * times deck load, due lists, a review, search, the Deck Workbench browser,
 * stats aggregation, known-word updates and the dictionary's in-deck lookup,
 * and writes `tools/perf/results/deckScale-<label>.json`. With `--compare`
 * it prints a before/after table against another saved run.
 *
 * Environment: PERF_CARDS (default 20000), PERF_LOG_ROWS (default 200000).
 */
'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- a plain Node CommonJS script */

const { spawnSync } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const ROOT = resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const compareAt = args.indexOf('--compare');
const compareLabel = compareAt >= 0 ? args[compareAt + 1] : null;
const label = args.find((arg, i) => !arg.startsWith('--') && (compareAt < 0 || i !== compareAt + 1)) || 'run';

const vitest = resolve(ROOT, 'node_modules', 'vitest', 'vitest.mjs');
const run = spawnSync(
  process.execPath,
  [vitest, 'run', '--config', resolve(__dirname, 'vitest.perf.config.mts'), '--reporter', 'dot'],
  {
    cwd: ROOT,
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, PERF_LABEL: label },
  },
);
if (run.status !== 0) process.exit(run.status ?? 1);

if (compareLabel) {
  const read = (name) => {
    const file = resolve(__dirname, 'results', `deckScale-${name}.json`);
    if (!existsSync(file)) throw new Error(`no saved run ${file}`);
    return JSON.parse(readFileSync(file, 'utf8'));
  };
  const before = read(compareLabel);
  const after = read(label);
  const byOp = new Map(before.results.map((m) => [m.op, m]));
  console.log(`\n[deckScale] ${compareLabel} -> ${label} (median ms; cold in brackets)`);
  for (const m of after.results) {
    const b = byOp.get(m.op);
    const was = b ? `${b.medianMs.toFixed(2)} [${b.coldMs.toFixed(2)}]` : 'n/a';
    const ratio = b && m.medianMs > 0 ? `${(b.medianMs / m.medianMs).toFixed(1)}x` : '';
    console.log(`  ${m.op.padEnd(62)} ${was.padStart(22)} -> ${`${m.medianMs.toFixed(2)} [${m.coldMs.toFixed(2)}]`.padEnd(22)} ${ratio}`);
  }
}
