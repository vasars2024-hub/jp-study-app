// Did the report-only stage 2 actually FIRE, and can it be told apart from stage 1? — slice 32.
//
// Both stages surface the same `mediaWorkspace.openStalled` string, so the text on screen is
// not the discriminator. Two things together are:
//
//   1. WHEN the element vanishes. Stage 2's `failed` branch sets `playbackInfo: null`, which
//      unmounts VideoCore. So on a stalled attempt the <video> should disappear one window
//      after the signature appears — versus persisting until the harness gives up at ~20.9 s,
//      which is what every pre-wiring run shows.
//   2. THAT the element existed at all. Stage 1 disarms the moment `playbackArrived` flips
//      true, and the `data-vc-element` video only renders once `playbackInfo` is set. So a
//      stall message on an attempt whose element MOUNTED cannot be stage 1's.
//
// Deliberately not a fixed millisecond band. An early version required the gap to be >= 8 000
// ms and read `proof/retirement-step3-20260801105658` (gap 7 975) as a non-sighting — a false
// negative from a made-up threshold, on a run that had plainly fired. The gap is
// `silenceMs - (signature - watch)` and the signature lands 1.5-3.5 s after the element
// mounts, so it is inherently 6.5-9 s; what actually separates the cases is unmounting EARLY
// (stage 2) versus at the harness's own teardown (not stage 2).
//
// Two modes, because they answer different questions:
//
//   node docs/migration/tools/stage2-sighting.mjs                 # ONE run -> a GATE
//   node docs/migration/tools/stage2-sighting.mjs <run-dir>       # a specific run -> a GATE
//   node docs/migration/tools/stage2-sighting.mjs --all           # every run -> the history
//
// The gate is conditional on its own precondition, which is what makes it sound despite the
// defect being intermittent: it asserts nothing unless a series actually reached the failure
// signature, and if one did, it requires the report. So a run where the stall simply did not
// happen passes quietly, and a run where it happened and went unreported FAILS. That is the
// regression this locks down — the shipped behaviour is "a watch with no media gets SAID", and
// nothing else in the suite can see it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const PROOF = path.join(REPO, 'docs/migration/proof');

/** Part of the English `mediaWorkspace.openStalled` string; the harness records full text. */
const STALL_TEXT = 'stopped preparing it';
/** The harness abandons a stalled attempt at ~20.9 s. An unmount at or after that is its doing. */
const HARNESS_TEARDOWN_MS = 18_000;

const arg = process.argv[2];
const all = arg === '--all';
const everyRun = fs.readdirSync(PROOF).filter((d) => d.startsWith('retirement-step3-')).sort();
const targets = all
  ? everyRun
  : [arg ? path.basename(path.resolve(arg)) : everyRun[everyRun.length - 1]];

const rows = [];
for (const run of targets) {
  const f = path.join(PROOF, run, 'new-route-plays-and-shell-survives.json');
  if (!fs.existsSync(f)) continue;
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (!j.mediaSamples?.length) continue;

  for (const s of j.mediaSamples) {
    let firstPresent = null;
    let sigFrom = null;
    let absentAt = null;
    let sawPresent = false;
    for (const x of s.samples) {
      if (x.videoPresent) {
        sawPresent = true;
        if (firstPresent === null) firstPresent = x.atMs;
        if (sigFrom === null && x.readyState === 0 && x.networkState === 0 && x.bufferedRanges === 0) {
          sigFrom = x.atMs;
        }
      } else if (sawPresent && absentAt === null) {
        absentAt = x.atMs;
      }
    }
    if (sigFrom === null) continue;   // never reached the defect; nothing for stage 2 to say

    const unmountedEarly = absentAt !== null && absentAt < HARNESS_TEARDOWN_MS;
    const stall = (j.openStalls ?? []).find((o) => o.attempt === s.attempt);
    const message = typeof stall?.text === 'string' && stall.text.includes(STALL_TEXT);

    rows.push({
      run,
      series: `${s.label}#${s.attempt}`,
      sigFrom,
      absentAt,
      gap: absentAt === null ? null : absentAt - sigFrom,
      message,
      fired: unmountedEarly && message,
    });
  }
}

const fired = rows.filter((r) => r.fired);
const held = rows.filter((r) => !r.fired);

console.log('series that reached the failure signature:', rows.length);
console.log('\n--- STAGE 2 FIRED (element unmounted early AND the stall message was on screen) ---');
for (const r of fired) {
  console.log(`  ${r.run.replace('retirement-step3-', '')}  ${r.series}  `
    + `sig@${r.sigFrom}ms  absent@${r.absentAt}ms  gap=${r.gap}ms`);
}
console.log('\n--- signature held, no stage-2 report (the control) ---');
for (const r of held) {
  console.log(`  ${r.run.replace('retirement-step3-', '')}  ${r.series}  `
    + `sig@${r.sigFrom}ms  absent@${r.absentAt ?? 'never'}  message=${r.message}`);
}
console.log(`\nfired ${fired.length} / ${rows.length} series that reached the signature`);

if (all) {
  console.log('\n--all is the history, not a gate. Run without it to gate a single run.');
  process.exit(0);
}

// The gate, conditional on its own precondition. Nothing reached the signature -> nothing to
// assert, and that is a pass rather than a skip: the run genuinely did not exercise this.
console.log(`\ngating ${targets[0]}`);
if (rows.length === 0) {
  console.log('no series reached the failure signature — nothing for stage 2 to report. PASS');
  process.exit(0);
}
const unreported = rows.filter((r) => !r.fired);
if (unreported.length === 0) {
  console.log(`every one of the ${rows.length} series that reached it was REPORTED. PASS`);
  process.exit(0);
}
console.log(`FAIL — ${unreported.length} series reached the failure signature and were NOT `
  + 'reported. A watch with no media must be SAID, not left spinning:');
for (const r of unreported) {
  console.log(`  ${r.series}  sig@${r.sigFrom}ms  absent@${r.absentAt ?? 'never'}  `
    + `message=${r.message}`);
}
process.exit(1);
