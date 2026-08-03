// Replay a harness run's recorded element samples through the REAL stage-2 decision — slice 32.
//
// The reverted stage-2 fix (slice 31) was destructive because it was driven before anyone had
// watched a HEALTHY open closely enough to know whether it passes through the failure's
// signature on the way up. `retirement-step3-harness.mjs` now records a 500 ms time series of
// the <video> for every open attempt, including the one that succeeds. This applies the rule to
// that series and answers the one question wiring depends on:
//
//   Does `directstreamMediaVerdict` ever reach `reopen` on an open that WORKED?
//
// It imports `src/shared/directstreamOpenRecovery.ts` itself, compiled on the fly with the
// esbuild that Vite already brings in. Nothing here reimplements the rule, so the control cannot
// silently drift from the code it is a control for.
//
// usage:
//   node docs/migration/tools/replay-media-verdict.mjs <proof-dir-or-record.json>
//   node docs/migration/tools/replay-media-verdict.mjs            # newest retirement-step3 run

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const PROOF = path.join(REPO, 'docs/migration/proof');
// Moved out of src/shared/ on 2026-08-02, when vitest.config.ts gained a src/media glob and
// the rule no longer had to live outside its component to be testable.
const MODULE = path.join(REPO, 'src/media/directstreamOpenRecovery.ts');

const newestRun = () => {
  const runs = fs
    .readdirSync(PROOF)
    .filter((d) => d.startsWith('retirement-step3-'))
    .sort();
  if (!runs.length) throw new Error('no retirement-step3 runs in docs/migration/proof');
  return path.join(PROOF, runs[runs.length - 1]);
};

const resolveRecord = (arg) => {
  const target = arg ? path.resolve(arg) : newestRun();
  if (fs.statSync(target).isDirectory()) {
    return path.join(target, 'new-route-plays-and-shell-survives.json');
  }
  return target;
};

/** Compile the real TypeScript module and import it — one source of truth. */
async function loadRule() {
  const { code } = await esbuild.transform(fs.readFileSync(MODULE, 'utf8'), {
    loader: 'ts',
    format: 'esm',
    target: 'node18',
  });
  const out = path.join(fs.mkdtempSync(path.join(REPO, 'node_modules/.replay-')), 'rule.mjs');
  fs.writeFileSync(out, code);
  try {
    return await import(pathToFileURL(out).href);
  } finally {
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
  }
}

/**
 * `playbackArrived` and `watchArrivedAt` are PROXIED by the first sample in which the element
 * exists, and the proxy is sound in one direction only — stated here rather than buried, since
 * the whole value of this control is that its assumptions are visible.
 *
 * The `<video>` carrying `data-vc-element` renders only once `playbackInfo` is set, which is
 * downstream of the `watch` payload. So "element present" IMPLIES the watch arrived, but it
 * may appear well after it: `watchArrivedAt` here is a LATE estimate.
 *
 * ## That makes this control OPTIMISTIC, not conservative — corrected 2026-08-01
 *
 * This comment first claimed a late `watchArrivedAt` "can only make the rule fire sooner …
 * a conservative result". **That is backwards, and the arithmetic is one line:** the rule
 * fires when `now - watchArrivedAt >= silenceMs`, so a LATER `watchArrivedAt` makes the
 * elapsed time SMALLER and the rule fires LATER here than in the product. A run in which it
 * never fires under replay is therefore weaker evidence than it looks, not stronger.
 *
 * Read every "never fired" below with that in mind. The wiring this tool was built to justify
 * was landed on the strength of it and reverted the same day — see the module header in
 * `src/shared/directstreamOpenRecovery.ts`.
 */
function replay(series, rule) {
  const { directstreamMediaVerdict, DIRECTSTREAM_MEDIA_SILENCE_MS } = rule;
  let watchArrivedAt = null;
  let elementEverObserved = false;
  const verdicts = [];

  for (const sample of series.samples) {
    if (sample.videoPresent) {
      elementEverObserved = true;
      if (watchArrivedAt === null) watchArrivedAt = sample.atMs;
    }
    const observation = sample.videoPresent
      ? {
          kind: 'element',
          readyState: sample.readyState,
          networkState: sample.networkState,
          bufferedRanges: sample.bufferedRanges,
        }
      : { kind: 'unreadable' };

    verdicts.push({
      atMs: sample.atMs,
      readyState: sample.videoPresent ? sample.readyState : null,
      networkState: sample.videoPresent ? sample.networkState : null,
      bufferedRanges: sample.videoPresent ? sample.bufferedRanges : null,
      verdict: directstreamMediaVerdict(
        {
          playbackArrived: elementEverObserved,
          watchArrivedAt: watchArrivedAt ?? sample.atMs,
          elementEverObserved,
          lastObservation: observation,
          stageAttempts: 0,
        },
        sample.atMs,
      ),
    });
  }
  return { verdicts, silenceMs: DIRECTSTREAM_MEDIA_SILENCE_MS };
}

const recordPath = resolveRecord(process.argv[2]);
const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
const rule = await loadRule();

console.log(`record   ${path.relative(REPO, recordPath)}`);
console.log(`verdict  ${record.verdict}   openAttempts ${record.openAttempts}`);

if (!record.mediaSamples?.length) {
  console.log('\nNo `mediaSamples` in this record — it predates the stage-2 sampler.');
  process.exit(2);
}

const stalledAttempts = new Set((record.openStalls ?? []).map((s) => `${s.label}#${s.attempt}`));
let firedOnHealthy = 0;
let firedOnStall = 0;

for (const series of record.mediaSamples) {
  const key = `${series.label}#${series.attempt}`;
  const stalled = stalledAttempts.has(key);
  const { verdicts } = replay(series, rule);
  const fired = verdicts.find((v) => v.verdict === 'reopen' || v.verdict === 'failed');
  const counts = verdicts.reduce((acc, v) => ({ ...acc, [v.verdict]: (acc[v.verdict] ?? 0) + 1 }), {});

  console.log(`\n${key}  —  ${stalled ? 'STALLED' : 'HEALTHY (this attempt opened)'}`);
  console.log(`  ${verdicts.length} samples over ${verdicts.at(-1)?.atMs ?? 0} ms`);
  console.log(`  verdicts: ${Object.entries(counts).map(([k, n]) => `${k}×${n}`).join('  ')}`);
  if (fired) {
    console.log(`  FIRST FIRE at ${fired.atMs} ms — readyState ${fired.readyState}, `
      + `networkState ${fired.networkState}, buffered ${fired.bufferedRanges}`);
    if (stalled) firedOnStall += 1;
    else firedOnHealthy += 1;
  } else {
    console.log('  never fired');
  }
}

console.log('\n--- the control ---');
console.log(`fired on a HEALTHY open: ${firedOnHealthy}   (must be 0)`);
console.log(`fired on a STALLED open: ${firedOnStall}   (rescue value; 0 means it would not have helped)`);
process.exit(firedOnHealthy === 0 ? 0 : 1);
