/**
 * Blanc bundle budget (BLANC_REFINEMENT_PLAN.md Pillar 1, item 3).
 *
 * "Without a recorded baseline 'performance' is an adjective, not a target."
 * This measures what each renderer entry actually loads on boot — the entry
 * script plus everything its HTML preloads — and fails if Blanc regresses past
 * the recorded budget.
 *
 * It also asserts the structural half of the Pillar 1 definition of done: the
 * Blanc boot path must not contain the Study OS desktop shell, the city engine,
 * the widget registry, or the environment layers.
 *
 * Scope, honestly: this measures BYTES, which are deterministic and gateable.
 * Cold-open time to first paint is not measured here — it depends on the
 * machine and would make the gate flaky. Bytes are the proxy; if you want a
 * wall-clock number, take it manually and record it in the plan.
 *
 * Usage:
 *   node tools/blanc-budget.cjs            # build, measure, compare to budget
 *   node tools/blanc-budget.cjs --update   # rewrite the budget from this build
 *   node tools/blanc-budget.cjs --json
 *
 * Exit code 1 if a budget is exceeded or a forbidden subsystem appears in the
 * Blanc boot path.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const BUDGET_PATH = path.join(ROOT, 'blanc-budget.json');

/**
 * The gate when no blanc-budget.json exists (a fresh clone, CI). Recorded
 * 2026-10-08 from a production renderer build:
 *   Blanc     2,306,987 B boot (2.20 MiB) -> ceiling 2.3 MiB
 *   Study OS  8,621,931 B boot before perf2 (7.35 MB JS + 1.27 MB CSS),
 *             3,961,983 B after (3.27 MB JS + 0.69 MB CSS) -> ceiling 4.3 MB
 * The local JSON, when present, wins — `--update` rewrites it.
 */
const DEFAULT_BUDGET = {
  blanc: { maxBytes: 2_411_724 },
  studyOs: { maxBytes: 4_300_000 },
};

/** Subsystems that must never be in Blanc's boot path. */
const FORBIDDEN = {
  'city engine': /citySession|startCitySession|initCityState/,
  'desktop shell': /DesktopShell|initDesktopState/,
  'widget registry': /widgets\/registry|WIDGET_REGISTRY/,
  'environment layer': /bootEnvironment|installAmbientAudio/,
};

function build(outDir) {
  // Invoke Vite's JS entry with the current node binary rather than the `npx`
  // shim: on Windows, spawning `npx.cmd` without a shell fails with EINVAL on
  // modern Node, and enabling the shell would mean quoting a temp path.
  const viteBin = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  execFileSync(
    process.execPath,
    [viteBin, 'build', '--config', 'vite.renderer.config.ts', '--outDir', outDir],
    { cwd: ROOT, stdio: 'pipe' },
  );
}

/** Assets an entry HTML pulls in eagerly (script src + preload/stylesheet href). */
function entryAssets(distDir, htmlName) {
  const html = fs.readFileSync(path.join(distDir, htmlName), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+)"/g)].map((m) => m[1]);
  return [...new Set(refs)];
}

function totalBytes(distDir, assets) {
  return assets.reduce((n, a) => n + fs.statSync(path.join(distDir, a)).size, 0);
}

function main() {
  const asJson = process.argv.includes('--json');
  const update = process.argv.includes('--update');

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-budget-'));
  let report;
  try {
    build(outDir);

    const blancAssets = entryAssets(outDir, 'blanc.html');
    const mainAssets = entryAssets(outDir, 'index.html');
    const blancBytes = totalBytes(outDir, blancAssets);
    const mainBytes = totalBytes(outDir, mainAssets);

    // Only .js in the Blanc boot path can carry a subsystem.
    const violations = [];
    for (const asset of blancAssets.filter((a) => a.endsWith('.js'))) {
      const src = fs.readFileSync(path.join(outDir, asset), 'utf8');
      for (const [label, re] of Object.entries(FORBIDDEN)) {
        if (re.test(src)) violations.push(`${label} found in ${asset}`);
      }
    }

    const ofType = (assets, ext) => totalBytes(outDir, assets.filter((a) => a.endsWith(ext)));
    report = {
      blanc: { bytes: blancBytes, files: blancAssets.length, js: ofType(blancAssets, '.js'), css: ofType(blancAssets, '.css') },
      studyOs: { bytes: mainBytes, files: mainAssets.length, js: ofType(mainAssets, '.js'), css: ofType(mainAssets, '.css') },
      ratio: Number((blancBytes / mainBytes).toFixed(3)),
      violations,
    };
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }

  if (update) {
    // A ceiling, not a mirror: the recorded size plus 5% headroom, so the next
    // unrelated commit does not fail on a few bytes of churn.
    const ceil = (n) => Math.ceil((n * 1.05) / 1024) * 1024;
    const next = {
      $comment:
        'Recorded by tools/blanc-budget.cjs --update. blanc.maxBytes and studyOs.maxBytes are the ' +
        'gates: each window\'s boot payload (entry script + everything its HTML preloads) must not ' +
        'exceed them. Raise one only with a reason.',
      blanc: { maxBytes: ceil(report.blanc.bytes), recordedBytes: report.blanc.bytes, js: report.blanc.js, css: report.blanc.css },
      studyOs: { maxBytes: ceil(report.studyOs.bytes), recordedBytes: report.studyOs.bytes, js: report.studyOs.js, css: report.studyOs.css },
      recordedAt: new Date().toISOString().slice(0, 10),
    };
    fs.writeFileSync(BUDGET_PATH, `${JSON.stringify(next, null, 2)}\n`);
    console.log(
      `Recorded budget: Blanc ${(report.blanc.bytes / 1024 / 1024).toFixed(2)} MB, ` +
        `Study OS ${(report.studyOs.bytes / 1024 / 1024).toFixed(2)} MB.`,
    );
    return;
  }

  // blanc-budget.json is a machine-local report (.gitignore), so a fresh clone
  // or CI never has one. It used to skip the byte check there; DEFAULT_BUDGET
  // now stands in, so the gate means the same thing on every machine.
  const recorded = fs.existsSync(BUDGET_PATH) ? JSON.parse(fs.readFileSync(BUDGET_PATH, 'utf8')) : null;
  const budget = {
    blanc: { maxBytes: recorded?.blanc?.maxBytes ?? DEFAULT_BUDGET.blanc.maxBytes },
    studyOs: { maxBytes: recorded?.studyOs?.maxBytes ?? DEFAULT_BUDGET.studyOs.maxBytes },
  };
  const max = budget.blanc.maxBytes;
  const over = report.blanc.bytes > max;
  const studyMax = budget.studyOs.maxBytes;
  const studyOver = report.studyOs.bytes > studyMax;
  const failed = over || studyOver || report.violations.length > 0;

  if (asJson) {
    console.log(JSON.stringify({ ...report, budget: max, studyOsBudget: studyMax, over, studyOver }, null, 2));
    process.exitCode = failed ? 1 : 0;
    return;
  }

  const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
  const split = (r) => `${mb(r.js)} JS + ${mb(r.css)} CSS`;
  console.log(`Blanc boot payload:    ${mb(report.blanc.bytes)} (${split(report.blanc)}) across ${report.blanc.files} files`);
  console.log(`Study OS boot payload: ${mb(report.studyOs.bytes)} (${split(report.studyOs)}) across ${report.studyOs.files} files`);
  console.log(`Blanc is ${Math.round((1 - report.ratio) * 100)}% smaller than Study OS.`);
  console.log(`Budgets: Blanc ${mb(max)}, Study OS ${mb(studyMax)}${recorded ? '' : ' (built-in defaults; no blanc-budget.json)'}\n`);

  if (report.violations.length) {
    console.log(`PILLAR 1 VIOLATIONS — Study OS subsystems in Blanc's boot path (${report.violations.length}):`);
    for (const v of report.violations) console.log(`    ${v}`);
    console.log('');
  }

  if (over) {
    console.log(`BLANC OVER BUDGET by ${mb(report.blanc.bytes - max)}. Either code-split the regression or raise the budget deliberately with --update.`);
  }
  if (studyOver) {
    console.log(`STUDY OS OVER BUDGET by ${mb(report.studyOs.bytes - studyMax)}. See src/renderer/__tests__/studyOsBootGraph.test.ts for the edges that used to cost the most.`);
  }
  if (!failed) {
    console.log('Within budget, and Blanc boots none of the Study OS desktop subsystems.');
  }

  process.exitCode = failed ? 1 : 0;
}

main();
