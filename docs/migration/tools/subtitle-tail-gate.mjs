#!/usr/bin/env node
// Does patch 0002 actually deliver the END of a subtitle track to the REAL client? — slice 47.
//
// `0002` has been recorded as closed since Phase 3, and slice 46 found out why that was not
// safe: every live proof of it ran against a purpose-built exe handed over through
// `SEANIME_EXE`, which nothing sets in normal operation. The binary the product launched was
// the bare pin. Slice 46 deployed the patched build; this measures what that changed, in the
// app, against the two binaries side by side.
//
// ## What the patch does, in one paragraph
//
// `startSubtitleStreamP`'s goroutine ends on a terminal signal from the parser. Upstream
// calls `subtitleStream.Stop(true)` and only THEN `flushBatch(false)`. `Stop` runs
// `cleanupFunc`, which is `subtitleCtxCancel` (`subtitles.go:424`), and `sendSubtitleEvents`
// returns false on its first line when `ctx.Err() != nil` (`subtitles.go:151`). So the last
// batch is assembled and thrown away. For a local file at offset 0 the flush interval is
// 300 ms and the batch cap is 50 (`subtitleFlushConfigFor`), and the fixture's whole track
// parses in well under one tick — so "the last batch" is most of the file.
//
// ## The discriminator is the LATEST CUE, not a count
//
// The patch only changes one of the goroutine's three exits: the terminal `errCh` branch.
// `ctx.Done()` drops the batch in both builds; both channels closing flushes in both builds.
// Which of the probe's two opens reaches the terminal branch varies run to run — the first
// open is routinely cancelled mid-parse by the StrictMode churn the probe was written to
// study — so a per-step or even a whole-run COUNT is not a stable quantity, and slice 47's
// two subject runs split 2/12 and 11/3 across the two steps while agreeing on the total.
//
// What is stable is `subtitlesRun.maxStartTimeMs`: the start time of the latest cue the
// client ever received. On a patched sidecar some open always reaches the end of the track;
// on an unpatched one none ever does. That is the assertion below.
//
// ## Why two binaries rather than a threshold
//
// "The client received cues up to 24 s" is only meaningful against "and the other binary
// stopped at 6.5 s on identical input". A threshold would encode this machine's timing; a
// differential does not. Same fixture, same probe, same app build, freshly prepared datadir
// per run — a datadir is single-use for playback, and a resumed position would change the
// subtitle offset and therefore the flush config, which would be a real confound.
//
// usage:
//   node docs/migration/tools/subtitle-tail-gate.mjs
//   node docs/migration/tools/subtitle-tail-gate.mjs --fixture=<dual-cue.mkv>
//   node docs/migration/tools/subtitle-tail-gate.mjs --subject=<a.exe> --control=<b.exe>
//
// NEEDS THE VITE DEV SERVER ON 5173. `.vite/build/main.js` resolves the renderer to
// `http://localhost:5173`, so without it every run dies as "the desktop never mounted" —
// which is slice 38's trap and says nothing about subtitles. The gate checks first and
// refuses to run rather than producing four useless records.
//
// Runs two full Electron sessions, ~3 minutes each.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');

const arg = (name, fallback = '') => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const UPSTREAM = path.resolve(REPO, '..', 'seanime-upstream');
/** What the app resolves on its own — `exePath.ts` falls through to the sibling checkout. */
const SUBJECT_EXE = path.resolve(arg('subject') || path.join(UPSTREAM, 'seanime.exe'));
/** The bare pin slice 46 replaced, preserved beside it. It is the control, not just a rollback. */
const CONTROL_EXE = path.resolve(
  arg('control') || path.join(UPSTREAM, 'seanime.exe.pre-patches-20260727'),
);
const FIXTURE = path.resolve(
  arg('fixture') || path.join(os.tmpdir(), 'gplay-dd-slice35', 'cue-library', 'Sousou no Frieren - 01.mkv'),
);

const NEEDLE_0002 = 'flushTerminalSubtitleBatch';

const stamp = process.env.RUN_STAMP
  ?? new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '');
const outDir = path.join(REPO, 'docs/migration/proof', `subtitle-tail-${stamp}`);

const say = (m) => console.log(`[subtitle-tail] ${m}`);

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/**
 * `0002` adds no string literal — it only reorders two calls — so it cannot be probed the way
 * `0004` can. Go keeps function names in pclntab for stack traces and `-ldflags=-s -w` strips
 * the symbol table, not that, so the function the patch introduces is the marker. (Slice 46.)
 */
function carries0002(file) {
  return fs.readFileSync(file).includes(Buffer.from(NEEDLE_0002));
}

function run(cmd, args, label, extraEnv = {}) {
  say(`${label}: ${cmd} ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`);
  const res = spawnSync(cmd, args, {
    cwd: REPO,
    encoding: 'utf8',
    windowsHide: true,
    // The probe takes its stamp from `process.env.RUN_STAMP`, so an inherited one makes BOTH
    // children write to the same proof directory and the second silently overwrite the first.
    // That happened on this gate's first run; it is set per child from here on.
    env: { ...process.env, ...extraEnv },
  });
  if (res.error) throw new Error(`${label} failed to spawn: ${res.error.message}`);
  return res;
}

/** One probe session against one binary, on its own freshly prepared datadir. */
function probeOnce(exe, label) {
  const dataDir = path.join(os.tmpdir(), `subtitle-tail-${stamp}-${label}`);
  fs.rmSync(dataDir, { recursive: true, force: true });
  const prep = run(process.execPath,
    [path.join(HERE, 'prepare-gplay-datadir.mjs'), FIXTURE, dataDir], `${label} datadir`);
  if (prep.status !== 0) {
    throw new Error(`${label}: datadir preparation exited ${prep.status}\n${prep.stderr?.slice(-2000)}`);
  }

  const runStamp = `${stamp}-${label}`;
  const recordDir = path.join(REPO, 'docs/migration/proof', `blanc-open-retry-${runStamp}`);
  // Never read a directory this run did not create. The first version of this gate did, and
  // an earlier manual run happened to have used the same name — so it reported `n/a` from a
  // record written before the field existed, while the run it had just made was sitting in
  // another directory saying 6500 against 24148. Refusing beats silently reading the wrong file.
  if (fs.existsSync(recordDir)) {
    throw new Error(`${label}: ${path.relative(REPO, recordDir)} already exists. This gate will `
      + 'not read a record it did not just write. Pass a different RUN_STAMP, or move it aside.');
  }
  const args = [path.join(HERE, 'blanc-player-open-retry-probe.mjs'), `--datadir=${dataDir}`];
  // The subject is deliberately run WITHOUT `--exe`: the whole question is what the app
  // launches when nobody tells it. Only the control names a binary.
  if (label === 'control') args.push(`--exe=${exe}`);
  const res = run(process.execPath, args, `${label} probe`, { RUN_STAMP: runStamp });
  process.stdout.write(res.stdout ?? '');

  const recordPath = path.join(recordDir, 'blanc-open-retry.json');
  if (!fs.existsSync(recordPath)) {
    throw new Error(`${label}: probe left no record at ${recordPath}\n${res.stderr?.slice(-2000)}`);
  }
  const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
  return { label, exe, dataDir, recordPath, record };
}

async function main() {
  for (const [what, file] of [['subject', SUBJECT_EXE], ['control', CONTROL_EXE], ['fixture', FIXTURE]]) {
    if (!fs.existsSync(file)) throw new Error(`missing ${what}: ${file}`);
  }

  // A control that carries the patch would make both sides agree and prove nothing; a subject
  // that does not carry it would make the gate fail for a reason that is not a regression.
  // Both are refusals to run, not findings — the same rule slice 46's gate applies to 0004.
  const subjectHas = carries0002(SUBJECT_EXE);
  const controlHas = carries0002(CONTROL_EXE);
  if (!subjectHas) {
    throw new Error(`the subject does not carry 0002 (no ${NEEDLE_0002}): ${SUBJECT_EXE}\n`
      + 'Nothing here would mean anything. Deploy a patched build first, or pass --subject=.');
  }
  if (controlHas) {
    throw new Error(`the control CARRIES 0002: ${CONTROL_EXE}\n`
      + 'A control that behaves like the subject makes every reading agree. Pass --control=.');
  }

  const devServer = await fetch('http://127.0.0.1:5173/', { signal: AbortSignal.timeout(3000) })
    .then((r) => r.status).catch(() => null);
  if (devServer === null) {
    throw new Error('nothing is listening on 5173. `.vite/build/main.js` resolves the renderer '
      + 'to http://localhost:5173, so both runs would die as "the desktop never mounted" — '
      + 'slice 38\'s trap, and nothing to do with subtitles. Start Vite first:\n'
      + '  npx vite --config vite.renderer.config.ts --port 5173 --strictPort');
  }

  fs.mkdirSync(outDir, { recursive: true });
  const out = {
    gate: 'subtitle-tail-gate.mjs',
    question: 'Does the deployed sidecar deliver the END of a subtitle track to the real client, '
      + 'and did the binary it replaced fail to?',
    discriminator: 'subtitlesRun.maxStartTimeMs — the start time of the latest cue the client '
      + 'received anywhere in the run. Counts are not stable; see the header.',
    startedAt: new Date().toISOString(),
    fixture: FIXTURE,
    devServerStatus: devServer,
    binaries: {
      subject: { path: SUBJECT_EXE, sha256: sha256(SUBJECT_EXE), carries0002: subjectHas,
        builtAt: fs.statSync(SUBJECT_EXE).mtime.toISOString() },
      control: { path: CONTROL_EXE, sha256: sha256(CONTROL_EXE), carries0002: controlHas,
        builtAt: fs.statSync(CONTROL_EXE).mtime.toISOString() },
    },
    runs: [],
  };

  // Control first. If an ordering effect exists at all, running the control first is the
  // arrangement that would hide the patch's advantage rather than manufacture it.
  for (const [label, exe] of [['control', CONTROL_EXE], ['subject', SUBJECT_EXE]]) {
    const r = probeOnce(exe, label);
    const tally = r.record.subtitlesRun ?? null;
    out.runs.push({
      label,
      exe,
      recordPath: path.relative(REPO, r.recordPath).replace(/\\/g, '/'),
      dataDir: r.dataDir,
      result: r.record.result ?? null,
      sidecarExe: r.record.sidecarExe ?? null,
      subtitlesRun: tally,
      subtitlesStep1: r.record.subtitlesStep1 ?? null,
      subtitlesStep2: r.record.subtitlesStep2 ?? null,
    });
    say(`${label}: result=${r.record.result} latest cue=${tally?.maxStartTimeMs ?? 'n/a'} ms `
      + `over ${tally?.events ?? 0} cues`);
  }

  const control = out.runs.find((r) => r.label === 'control');
  const subject = out.runs.find((r) => r.label === 'subject');
  const controlMax = control?.subtitlesRun?.maxStartTimeMs ?? null;
  const subjectMax = subject?.subtitlesRun?.maxStartTimeMs ?? null;

  const reasons = [];
  if (control?.result !== 'DONE' && control?.result !== 'PASS') {
    reasons.push(`the control run did not complete (result ${control?.result})`);
  }
  if (subject?.result !== 'DONE' && subject?.result !== 'PASS') {
    reasons.push(`the subject run did not complete (result ${subject?.result})`);
  }
  // Both runs must actually have received subtitles, or the comparison is between two
  // silences and the gate would "pass" on a sidecar that sent nothing at all.
  if (!controlMax) reasons.push('the control received no subtitle cues at all');
  if (!subjectMax) reasons.push('the subject received no subtitle cues at all');
  if (controlMax && subjectMax && !(subjectMax > controlMax)) {
    reasons.push(`the subject's latest cue (${subjectMax} ms) is not later than the control's `
      + `(${controlMax} ms) — the terminal batch is not arriving`);
  }
  // The control's own sidecarExe is what proves the override took; a run that silently fell
  // through to the deployed binary would compare the patched build against itself.
  if (control?.sidecarExe?.carries0002 !== false) {
    reasons.push('the control run did not actually use an unpatched binary');
  }
  if (subject?.sidecarExe?.overridden !== false) {
    reasons.push('the subject run was overridden and is therefore not "what the app launches"');
  }

  out.verdict = reasons.length === 0 ? 'PASS' : 'FAIL';
  out.reasons = reasons;
  out.summary = {
    controlLatestCueMs: controlMax,
    subjectLatestCueMs: subjectMax,
    controlLastText: control?.subtitlesRun?.lastText ?? null,
    subjectLastText: subject?.subtitlesRun?.lastText ?? null,
    controlCues: control?.subtitlesRun?.events ?? null,
    subjectCues: subject?.subtitlesRun?.events ?? null,
  };
  out.finishedAt = new Date().toISOString();

  fs.writeFileSync(path.join(outDir, 'subtitle-tail.json'), `${JSON.stringify(out, null, 2)}\n`);
  say(`verdict ${out.verdict}`);
  for (const r of reasons) say(`  - ${r}`);
  say(`record: ${path.join(outDir, 'subtitle-tail.json')}`);
  process.exitCode = out.verdict === 'PASS' ? 0 : 1;
}

main().catch((err) => {
  console.error(`[subtitle-tail] ERROR ${err?.message ?? err}`);
  process.exitCode = 1;
});
