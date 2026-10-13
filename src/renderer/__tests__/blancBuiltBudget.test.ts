import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Blanc's BUILT boot bundle, gated.
 *
 * `blancBootGraph.test.ts` walks the source import graph and forbids named
 * subsystems; `studyOsBootGraph.test.ts` bounds source bytes. Neither measures
 * what ships, and on 2026-10-12 the built Blanc boot payload (entry chunk + every
 * chunk and stylesheet blanc.html preloads) was 2,538,528 B against the
 * 2,411,724 B gate in `tools/blanc-budget.cjs` while both stayed green — the
 * tool was never run by anything. This runs it.
 *
 * It does one production renderer build into a temp dir (~45 s; the same build
 * the tool and the release do), so it is the slowest test in the suite on
 * purpose: bytes after Rollup's chunking and minification are the only honest
 * number, and a Blanc-only build chunks differently (measured 34 KB smaller).
 *
 * Only Blanc is asserted here. The tool also reports the Study OS window against
 * its own ceiling; that one has its own work package (docs/SCORECARD.md).
 */

const ROOT = resolve(__dirname, '../../..');
const TOOL = resolve(ROOT, 'tools/blanc-budget.cjs');

interface BudgetReport {
  blanc: { bytes: number; files: number; js: number; css: number };
  studyOs: { bytes: number };
  violations: string[];
  budget: number;
  studyOsBudget: number;
  over: boolean;
}

function runTool(): Promise<BudgetReport> {
  // The child is a production build: it must not inherit vitest's NODE_ENV=test
  // (Vite would bundle React's development build and every number would be off).
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key === 'NODE_ENV' || key === 'TEST' || key.startsWith('VITEST')) continue;
    env[key] = value;
  }
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [TOOL, '--json'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString('utf8')));
    child.on('error', fail);
    child.on('close', (code) => {
      // Exit 1 is a verdict (over budget), not a crash; the JSON says which.
      const start = out.indexOf('{');
      if (start < 0) {
        fail(new Error(`blanc-budget.cjs exited ${code} without a report:\n${err.slice(-4000)}`));
        return;
      }
      try {
        done(JSON.parse(out.slice(start)) as BudgetReport);
      } catch (e) {
        fail(new Error(`blanc-budget.cjs printed an unreadable report (exit ${code}): ${String(e)}\n${err.slice(-4000)}`));
      }
    });
  });
}

describe('Blanc built boot bundle (tools/blanc-budget.cjs)', () => {
  it('stays within its byte budget and boots no Study OS subsystem', async () => {
    const report = await runTool();
    // A build that resolved nothing would pass every assertion below.
    expect(report.blanc.files).toBeGreaterThan(1);
    expect(report.blanc.bytes).toBeGreaterThan(500_000);

    expect(report.violations).toEqual([]);
    expect(
      report.blanc.bytes,
      `Blanc boot is ${report.blanc.bytes} B against ${report.budget} B ` +
        `(${report.blanc.js} B JS + ${report.blanc.css} B CSS). Make the new eager import lazy ` +
        '(see blancBootGraph.test.ts for the patterns), or raise the budget deliberately with ' +
        '`node tools/blanc-budget.cjs --update`.',
    ).toBeLessThanOrEqual(report.budget);
  }, 300_000);
});
