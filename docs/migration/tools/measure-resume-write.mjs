// Does a resume write still know how to delete a position the user really reached? — slice 35.
//
// Three questions, in the order that makes the answer worth anything:
//
//   1. WIRED — is the rule in the shipped component's persist path, called from all four
//      triggers including the effect TEARDOWN? A pure rule nobody calls is a rule that
//      changes nothing, and slice 32 shipped exactly that on purpose once (report-only
//      stage 2), so "the module exists" is not evidence.
//   2. DECIDED — replayed through the REAL compiled `resumeWriteAction`, do the two
//      sequences that used to zero a stored position now leave it alone? The pre-slice rule
//      is modelled alongside, so the difference is MEASURED rather than asserted.
//   3. COSTED — through the REAL `seanimeContinueWatching`, what did a zeroed entry cost?
//
// Every rule under test is compiled from `src/shared/**` with the esbuild Vite already
// brings in, the way `replay-media-verdict.mjs` does it, so nothing here can drift from the
// code it is a control for.
//
// NOT a live run. No sidecar, no Electron, no dev server: this decides what the shipped
// decision returns, never what a real <video> does. The live confirmation is a separate,
// named next step — see NEXT_SESSION.md, slice 35.
//
// usage:
//   node docs/migration/tools/measure-resume-write.mjs [--out=<proof-dir>]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const PROOF = path.join(REPO, 'docs/migration/proof');
const SLICE = path.join(REPO, 'src/media/StudyPlayerSlice.tsx');

/** Bundle a shared module and import it — one source of truth for every rule below. */
async function load(relative) {
  const dir = fs.mkdtempSync(path.join(REPO, 'node_modules/.resume-write-'));
  const out = path.join(dir, 'module.mjs');
  await esbuild.build({
    entryPoints: [path.join(REPO, relative)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node18',
    outfile: out,
    logLevel: 'silent',
  });
  try {
    return await import(pathToFileURL(out).href);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The block a `const NAME = (` … `};` declaration spans, matched on its own indentation so a
 * nested arrow cannot end it early. Textual on purpose: the question is what the SHIPPED file
 * says, and a parser that resolved imports would answer a different one.
 */
function declarationBlock(source, name) {
  const start = source.indexOf(`    const ${name} = (`);
  if (start === -1) return null;
  const end = source.indexOf('\n    };', start);
  return end === -1 ? null : source.slice(start, end + 7);
}

/** The `return () => {` … `};` cleanup of the effect that owns `persist`. */
function teardownBlock(source) {
  const start = source.indexOf('    return () => {\n      video.removeEventListener');
  if (start === -1) return null;
  const end = source.indexOf('\n    };', start);
  return end === -1 ? null : source.slice(start, end + 7);
}

function measureWiring() {
  const source = fs.readFileSync(SLICE, 'utf8');
  const persist = declarationBlock(source, 'persist');
  const teardown = teardownBlock(source);
  const observed = {
    persistFound: persist !== null,
    persistCallsTheRule: !!persist?.includes('resumeWriteAction({'),
    persistCanSkip: !!persist?.includes("if (action === 'skip') return;"),
    teardownFound: teardown !== null,
    teardownPersists: !!teardown?.includes('persist();'),
    listeners: ['timeupdate', 'pause', 'ended']
      .filter((event) => source.includes(`video.addEventListener('${event}'`)),
    hasMediaFromElement: source.includes(
      "video.readyState > 0 || video.currentSrc !== ''",
    ),
  };
  return {
    observed,
    checks: {
      ruleIsInThePersistPath: observed.persistCallsTheRule && observed.persistCanSkip,
      teardownGoesThroughIt: observed.teardownFound && observed.teardownPersists,
      allFourTriggers: observed.listeners.length === 3 && observed.teardownPersists,
      emptinessComesFromTheElement: observed.hasMediaFromElement,
    },
  };
}

/** The pre-slice rule, transcribed from `git show HEAD` of the same block. */
function preSliceAction({ positionSec, durationSec, finished }) {
  if (!Number.isFinite(positionSec)) return 'skip';
  const atEnd = finished
    || (Number.isFinite(durationSec) && durationSec > 0 && positionSec >= durationSec - 5);
  return atEnd ? 'clear' : 'save';
}

/**
 * One session over one key, driven through whichever rule it is given. Only the TRIGGERS are
 * modelled; the decision is the argument.
 */
function replay(rule, steps) {
  let sessionMaxSec = 0;
  let stored = null;
  const trace = [];
  for (const step of steps) {
    const { positionSec, hasMedia, durationSec = Number.NaN, finished = false, what } = step;
    if (hasMedia && Number.isFinite(positionSec)) {
      sessionMaxSec = Math.max(sessionMaxSec, positionSec);
    }
    const action = rule({ positionSec, hasMedia, sessionMaxSec, durationSec, finished });
    if (action === 'save') stored = positionSec;
    else if (action === 'clear') stored = null;
    trace.push({ what, positionSec, hasMedia, action, stored });
  }
  return { stored, trace };
}

const SEQUENCES = [
  {
    id: 'open-then-leave',
    question:
      'An episode with a stored position is opened and closed before a frame decodes — the '
      + 'silent-open stall, or a user who changed their mind. Does the stored point survive?',
    seededSec: 8.8,
    steps: [
      { what: 'element mounted, stream never decoded', positionSec: 0, hasMedia: true, durationSec: 1400 },
      { what: 'effect teardown', positionSec: 0, hasMedia: true, durationSec: 1400 },
    ],
    expect: 'seed',
  },
  {
    id: 'teardown-after-empty',
    question:
      'A teardown lands after video-core.tsx §965-970 emptied the element. Does the reset '
      + 'clock get to speak for the file?',
    seededSec: null,
    steps: [
      { what: 'played to 8:48', positionSec: 528, hasMedia: true, durationSec: 1400 },
      { what: 'element emptied by the lifecycle effect', positionSec: 0, hasMedia: false },
      { what: 'effect teardown', positionSec: 0, hasMedia: false },
    ],
    expect: 528,
  },
  {
    id: 'deliberate-rewind',
    question: 'A session that really started goes back to 0:00 and leaves. Is that honoured?',
    note:
      'The one sequence where the two rules AGREE in effect: the pre-slice rule stores 0 and '
      + 'the shipped one removes the entry, and every reader in the app treats those the same '
      + '(resolveVideoCoreResumePosition returns 0 below 1 s). Reported as changed because the '
      + 'store differs; do not quote it as a behaviour difference.',
    seededSec: null,
    steps: [
      { what: 'played to 8:48', positionSec: 528, hasMedia: true, durationSec: 1400 },
      { what: 'rewound to the top', positionSec: 0, hasMedia: true, durationSec: 1400 },
      { what: 'effect teardown', positionSec: 0, hasMedia: true, durationSec: 1400 },
    ],
    expect: null,
  },
  {
    id: 'watched-to-the-end',
    question: 'An episode finishes. Is its point still cleared?',
    seededSec: null,
    steps: [
      { what: 'played to 23:19', positionSec: 1399, hasMedia: true, durationSec: 1400 },
      { what: 'ended', positionSec: 1400, hasMedia: true, durationSec: 1400, finished: true },
    ],
    expect: null,
  },
];

async function main() {
  const startedAt = new Date().toISOString();
  const { resumeWriteAction } = await load('src/shared/videoCoreResumeWrite.ts');
  const { seanimeContinueWatching } = await load('src/shared/seanimeContinueWatching.ts');

  const wiring = measureWiring();

  const sequences = SEQUENCES.map((sequence) => {
    const seed = (run) => (run.stored === null ? sequence.seededSec : run.stored);
    const shipped = replay(resumeWriteAction, sequence.steps);
    const preSlice = replay(preSliceAction, sequence.steps);
    const expected = sequence.expect === 'seed' ? sequence.seededSec : sequence.expect;
    return {
      id: sequence.id,
      question: sequence.question,
      ...(sequence.note ? { note: sequence.note } : {}),
      seededSec: sequence.seededSec,
      shipped: { stored: seed(shipped), trace: shipped.trace },
      preSlice: { stored: seed(preSlice), trace: preSlice.trace },
      expected,
      changed: seed(shipped) !== seed(preSlice),
      result: seed(shipped) === expected ? 'PASS' : 'FAIL',
    };
  });

  const row = (positionSec) => seanimeContinueWatching({
    resumePositions: [{ key: 'file:c:/media/ep1.mkv', positionSec, updatedAt: 5000 }],
  }).length;
  const cost = {
    question: 'What did a zeroed entry cost the user, through the real Continue Watching join?',
    rowsAt620Sec: row(620),
    rowsAt0Sec: row(0),
    result: row(620) === 1 && row(0) === 0 ? 'PASS' : 'FAIL',
  };

  const wiringResult = Object.values(wiring.checks).every(Boolean) ? 'PASS' : 'FAIL';
  const record = {
    tool: 'measure-resume-write.mjs',
    slice: 35,
    startedAt,
    live: false,
    liveNote:
      'Static + replay only. Nothing here observed a real <video>; the live confirmation is '
      + 'the stated next step and was not run — another session was writing src/ throughout '
      + '(slice 21 hazard).',
    wiring: { ...wiring, result: wiringResult },
    sequences,
    cost,
    result: wiringResult === 'PASS'
      && cost.result === 'PASS'
      && sequences.every((sequence) => sequence.result === 'PASS')
      ? 'PASS'
      : 'FAIL',
  };

  const outArg = process.argv.find((arg) => arg.startsWith('--out='));
  // Local time, like every other proof directory in this tree — a UTC stamp reads as a run
  // that happened three hours before the session it belongs to.
  const local = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  const stamp = `${local.getFullYear()}${pad(local.getMonth() + 1)}${pad(local.getDate())}`
    + `${pad(local.getHours())}${pad(local.getMinutes())}${pad(local.getSeconds())}`;
  const dir = outArg ? path.resolve(outArg.slice(6)) : path.join(PROOF, `resume-write-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'resume-write.json');
  fs.writeFileSync(file, `${JSON.stringify(record, null, 1)}\n`);

  for (const sequence of sequences) {
    console.log(
      `${sequence.result.padEnd(4)} ${sequence.id.padEnd(22)} shipped ${String(sequence.shipped.stored)}`
      + `   pre-slice ${String(sequence.preSlice.stored)}`,
    );
  }
  console.log(`${wiringResult.padEnd(4)} wiring                 ${JSON.stringify(wiring.checks)}`);
  console.log(`${cost.result.padEnd(4)} continue-watching      620s -> ${cost.rowsAt620Sec} row(s), 0s -> ${cost.rowsAt0Sec}`);
  console.log(`\n${record.result}  ${path.relative(REPO, file)}`);
  process.exit(record.result === 'PASS' ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
