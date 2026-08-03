#!/usr/bin/env node
// Does the COMPILED sidecar refuse a stale open generation OVER HTTP? — slice 46.
//
// Patch 0004 has three parts and only one of them has ever been tested:
//
//   1. `Manager.AcceptOpenGeneration` — the rule. Covered in-process by the patch's own
//      `open_generation_test.go` since slice 41.
//   2. `Generation int64 \`json:"generation"\`` on the handler's body struct — the field the
//      client's JSON has to land in. NEVER exercised.
//   3. `Generation: b.Generation` on the `PlayLocalFileOptions` the handler builds, and the
//      `AcceptOpenGeneration` call at the top of `PlayLocalFile`. NEVER exercised.
//
// A Go unit test constructs a `Manager` directly and calls the rule; it cannot show that a
// JSON body reaches it. `StudyPlayerSlice.tsx` has been sending `generation` since slice 44
// against a sidecar built before the patch existed, so the whole wire path — client id
// resolution included — is unmeasured. This runs the real binary and posts real HTTP at it.
//
// ## Why it needs TWO binaries
//
// A refusal has no positive observable. `PlayLocalFile` returns before `BeginOpen`, so the
// `defer` that would call `AbortOpen` is never even registered, and nothing is logged. Both
// outcomes answer HTTP 500 `{"message":"Internal Server Error"}` — echo's default error
// handler with `e.Debug = false` (`internal/core/echo.go:21`) replaces every non-`HTTPError`
// with that constant, so the response body cannot discriminate. Seanime installs no
// request-logging middleware either, so there is no access line to bracket the gap with.
//
// Reading a verdict out of "the marker did not appear" alone would be the absence-of-a-line
// trap this track has already paid for three times. So the same probe runs against the
// DEPLOYED, unpatched sidecar as a control: there, every step must be accepted. A step that
// is refused by one binary and accepted by the other, on byte-identical input, is a positive
// differential result — the absence is bracketed by its own HTTP response (proof the request
// reached the handler and the handler answered) and by the control's presence.
//
// ## The discriminator
//
//   accepted -> `BeginOpen` ran, the open failed later on a datadir with no anime collection,
//               and the deferred `AbortOpen` logs
//               "directstream: Signaling native player to abort stream preparation, reason: …"
//               (`internal/directstream/stream.go:234`, Debug — zerolog's global level is
//               left at Trace here, so Debug reaches stdout).
//   refused  -> that line cannot appear, because nothing ran.
//
// The datadir is a throwaway with no AniList collection ON PURPOSE: the open must fail fast
// and identically for every accepted step, so the only thing varying between steps is the
// generation. `--datadir` is always a fresh temp dir; this never touches `<userData>/seanime`.
//
// usage:
//   node docs/migration/tools/open-generation-wire-gate.mjs
//   node docs/migration/tools/open-generation-wire-gate.mjs --exe=<patched.exe> --control=<unpatched.exe>
//
// With no --exe it builds one via build-patched-sidecar.mjs into the OS temp dir. The control
// defaults to the sidecar this app actually launches (`../seanime-upstream/seanime.exe`),
// which is the binary the `patched-sidecar-not-deployed` row is about.

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');

/** The patch's own error text. `-ldflags=-s -w` strips symbols, never string literals. */
const PATCH_NEEDLE = 'stale open request: generation';
/** `AbortOpen`'s Debug line — emitted iff `BeginOpen` ran, i.e. iff the open was accepted. */
const ACCEPT_MARKER = 'Signaling native player to abort stream preparation';
/** How long an accepted open may take to reach `AbortOpen` before we call it refused. */
const MARKER_WAIT_MS = 4000;
const BOOT_TIMEOUT_MS = 90_000;

const arg = (name) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : '';
};

const DEFAULT_PATCHED = path.join(os.tmpdir(), 'studyos-sidecar-0004', 'seanime.exe');

/**
 * The control has to be a sidecar WITHOUT 0004, and which binary that is changed on
 * 2026-08-02: the deployed `../seanime-upstream/seanime.exe` was the unpatched pin when this
 * gate was written, and is the patched build since slice 46 deployed it. The bare pin it
 * replaced sits beside it as `seanime.exe.pre-patches-20260727`, so that is preferred when it
 * exists. The deployed exe stays as the fallback for a tree where no deployment has happened,
 * and `--control=` overrides both. A control that turns out to carry 0004 is a hard error
 * below rather than a silent no-op run — a control that behaves like the subject would make
 * every step agree and prove nothing.
 */
const CONTROL_EXE = (() => {
  if (arg('control')) return path.resolve(arg('control'));
  const upstream = path.join(REPO, '..', 'seanime-upstream');
  const preserved = path.join(upstream, 'seanime.exe.pre-patches-20260727');
  return path.resolve(fs.existsSync(preserved) ? preserved : path.join(upstream, 'seanime.exe'));
})();

/**
 * The sequence, and what each row is for. Every row posts the same bogus path, so the only
 * thing that varies is the client id and the generation.
 *
 * `expected` is what a PATCHED sidecar must do. The control must accept all seven — that is
 * the control's whole job, and a control that refuses anything means the probe is measuring
 * something other than the patch.
 */
const STEPS = [
  { name: 'first open sets the bar', client: 'alpha', generation: 2, expected: 'accepted' },
  { name: 'an older generation is refused', client: 'alpha', generation: 1, expected: 'refused' },
  { name: 'the equal generation is the recovery', client: 'alpha', generation: 2, expected: 'accepted' },
  { name: 'another client is ordered independently', client: 'beta', generation: 1, expected: 'accepted' },
  { name: 'no generation field behaves as before', client: 'alpha', generation: null, expected: 'accepted' },
  { name: 'a newer generation moves the bar', client: 'alpha', generation: 3, expected: 'accepted' },
  { name: 'the moved bar refuses what it used to accept', client: 'alpha', generation: 2, expected: 'refused' },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function reservePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => (port ? resolve(port) : reject(new Error('no port'))));
    });
  });
}

function carriesPatch(exe) {
  return fs.readFileSync(exe).includes(Buffer.from(PATCH_NEEDLE));
}

function killTree(pid) {
  if (!pid) return;
  spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
}

/** Runs the whole sequence against one binary and returns its record. */
async function probe(exe, label) {
  const port = await reservePort();
  const password = crypto.randomBytes(16).toString('hex');
  // `X-Seanime-Token` is the sha256 of the password, NOT the password — the server compares
  // it to `App.ServerPasswordHash` (`internal/core/app.go:232`, `util.HashSHA256Hex`) and the
  // app derives it the same way (`main/seanime/supervisor.ts`). Sending the password itself
  // gets 401 `UNAUTHENTICATED` on every route except `/api/v1/status`, which answers 200 with
  // its fields REDACTED — so a probe that only checks "did status answer" reads as connected
  // while every real call is rejected. The same hash is the `/events?token=` value.
  const token = crypto.createHash('sha256').update(password).digest('hex');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), `studyos-opengen-${label}-`));
  const base = `http://127.0.0.1:${port}`;
  const log = [];
  const frames = [];
  const record = {
    label,
    exe,
    exeBuilt: fs.statSync(exe).mtime.toISOString(),
    exeCarriesPatchString: carriesPatch(exe),
    port,
    dataDir,
    steps: [],
  };

  // The same argv the app spawns — `main/seanime/supervisor.ts`. `--desktop-sidecar` is kept
  // so this is the same server the app talks to; its dead-man switch only arms after the
  // first websocket connection, and one is attached below and held for the whole run.
  const child = spawn(
    exe,
    [
      `--datadir=${dataDir}`,
      '--host=127.0.0.1',
      `--port=${port}`,
      `--password=${password}`,
      '--desktop-sidecar',
    ],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const collect = (buf) => {
    for (const line of String(buf).split(/\r?\n/)) {
      if (line.trim()) log.push({ at: Date.now(), line: line.trim() });
    }
  };
  child.stdout?.on('data', collect);
  child.stderr?.on('data', collect);
  let exited = null;
  child.on('exit', (code) => { exited = code; });

  let socket = null;
  try {
    const deadline = Date.now() + BOOT_TIMEOUT_MS;
    let up = false;
    while (Date.now() < deadline && exited === null) {
      try {
        const res = await fetch(`${base}/api/v1/status`, {
          headers: { 'X-Seanime-Token': token },
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          record.status = await res.json().then((j) => ({
            version: j?.data?.version ?? null,
            isDesktopSidecar: j?.data?.isDesktopSidecar ?? null,
          })).catch(() => null);
          up = true;
          break;
        }
      } catch { /* not up yet */ }
      await sleep(250);
    }
    if (!up) {
      record.error = exited === null
        ? `sidecar did not answer /api/v1/status within ${BOOT_TIMEOUT_MS} ms`
        : `sidecar exited with code ${exited} during boot`;
      record.logTail = log.slice(-40).map((e) => e.line);
      return record;
    }

    // Attach a client, exactly as the renderer does (`seanimeSocketPool.ts` — `/events?token=`).
    // Corroboration only: the verdict never depends on a frame arriving.
    socket = new WebSocket(`ws://127.0.0.1:${port}/events?token=${encodeURIComponent(token)}`);
    socket.addEventListener('message', (event) => {
      frames.push({ at: Date.now(), data: String(event.data).slice(0, 400) });
    });
    await Promise.race([
      new Promise((resolve) => socket.addEventListener('open', resolve, { once: true })),
      sleep(5000),
    ]);
    record.websocketOpen = socket.readyState === WebSocket.OPEN;

    for (const step of STEPS) {
      const body = { path: 'C:\\studyos-open-generation-probe\\not-a-real-file.mkv', clientId: step.client };
      if (step.generation !== null) body.generation = step.generation;

      const seenBefore = log.filter((e) => e.line.includes(ACCEPT_MARKER)).length;
      const framesBefore = frames.length;
      const started = Date.now();
      let http = null;
      try {
        const res = await fetch(`${base}/api/v1/directstream/play/localfile`, {
          method: 'POST',
          headers: {
            'X-Seanime-Token': token,
            'X-Seanime-Client-Id': step.client,
            'X-Seanime-Client-Platform': 'web',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15_000),
        });
        http = { status: res.status, body: (await res.text()).slice(0, 300) };
      } catch (err) {
        http = { status: 0, body: `transport: ${String(err)}` };
      }

      // Wait for the accept marker, not for a fixed delay: a slow accept must not read as a
      // refusal. A refusal pays the full wait, which is what makes the gap deliberate.
      let observed = 'refused';
      const until = Date.now() + MARKER_WAIT_MS;
      while (Date.now() < until) {
        if (log.filter((e) => e.line.includes(ACCEPT_MARKER)).length > seenBefore) {
          observed = 'accepted';
          break;
        }
        await sleep(50);
      }

      const newMarkers = log
        .filter((e) => e.line.includes(ACCEPT_MARKER))
        .slice(seenBefore)
        .map((e) => e.line);
      record.steps.push({
        name: step.name,
        clientId: step.client,
        generation: step.generation,
        expected: step.expected,
        observed,
        // The bracket that makes an absence readable: the server received this exact request
        // and answered it. An absent marker with no response would be inconclusive, not a
        // refusal, and the gate fails such a step below.
        http,
        elapsedMs: Date.now() - started,
        abortMarkers: newMarkers,
        framesAfter: frames.slice(framesBefore).map((f) => f.data),
      });
    }
  } finally {
    try { socket?.close(); } catch { /* already gone */ }
    killTree(child.pid);
    await sleep(400);
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* windows lock */ }
  }

  record.dataDirRemoved = !fs.existsSync(dataDir);
  record.logLines = log.length;
  return record;
}

// ---------------------------------------------------------------------------------------

let patchedExe = arg('exe') ? path.resolve(arg('exe')) : '';
const buildLog = [];
if (!patchedExe) {
  patchedExe = DEFAULT_PATCHED;
  if (!fs.existsSync(patchedExe) || !carriesPatch(patchedExe)) {
    buildLog.push(`building ${patchedExe}`);
    const built = spawnSync(
      process.execPath,
      [path.join(HERE, 'build-patched-sidecar.mjs'), patchedExe],
      { encoding: 'utf8', stdio: 'pipe', windowsHide: true },
    );
    buildLog.push(`${built.stdout ?? ''}${built.stderr ?? ''}`.trim().split(/\r?\n/).slice(-4).join('\n'));
    if (built.status !== 0) {
      console.error(buildLog.join('\n'));
      process.exit(1);
    }
  } else {
    buildLog.push(`reusing ${patchedExe}`);
  }
}

for (const [name, exe] of [['patched', patchedExe], ['control', CONTROL_EXE]]) {
  if (!fs.existsSync(exe)) throw new Error(`${name} sidecar not found: ${exe}`);
}
if (!carriesPatch(patchedExe)) throw new Error(`the "patched" exe has no 0004: ${patchedExe}`);
if (carriesPatch(CONTROL_EXE)) {
  throw new Error(
    `the control exe ALREADY carries 0004: ${CONTROL_EXE}. `
    + 'It is meant to be the unpatched binary this app launches; pass --control= a real one.',
  );
}

const patched = await probe(patchedExe, 'patched');
const control = await probe(CONTROL_EXE, 'control');

const problems = [];
if (patched.error) problems.push(`patched run: ${patched.error}`);
if (control.error) problems.push(`control run: ${control.error}`);

for (const [run, expect] of [[patched, (s) => s.expected], [control, () => 'accepted']]) {
  if (run.error) continue;
  if (run.steps.length !== STEPS.length) problems.push(`${run.label}: ${run.steps.length}/${STEPS.length} steps ran`);
  for (const step of run.steps) {
    const want = expect(step);
    if (step.observed !== want) {
      problems.push(`${run.label}: "${step.name}" observed ${step.observed}, expected ${want}`);
    }
    // An absent marker only means "refused" when the server demonstrably answered.
    if (step.observed === 'refused' && !(step.http && step.http.status > 0)) {
      problems.push(`${run.label}: "${step.name}" is INCONCLUSIVE — no marker and no response`);
    }
  }
}

// The differential itself, stated as a fact rather than inferred by a reader.
const differing = patched.steps
  .map((s, i) => ({ name: s.name, patched: s.observed, control: control.steps[i]?.observed }))
  .filter((row) => row.patched !== row.control);
if (!patched.error && !control.error && differing.length === 0) {
  problems.push('the two binaries behaved identically — this probe measured nothing');
}

const deployed = path.resolve(REPO, '..', 'seanime-upstream', 'seanime.exe');
const record = {
  tool: 'open-generation-wire-gate.mjs',
  slice: 46,
  patch: 'patches/seanime/0004-directstream-open-generation.patch',
  build: buildLog,
  runs: { patched, control },
  differingSteps: differing,
  // The `patched-sidecar-not-deployed` row, measured rather than asserted.
  deployedSidecar: fs.existsSync(deployed)
    ? {
      path: deployed,
      built: fs.statSync(deployed).mtime.toISOString(),
      carriesPatch: carriesPatch(deployed),
    }
    : { path: deployed, missing: true },
  // Recorded because it is a finding, not an incidental: over HTTP the two outcomes are
  // indistinguishable, so a client cannot tell a benign stale-generation refusal from a
  // real open failure.
  httpResponsesAreIdentical: (() => {
    const bodies = new Set(patched.steps.map((s) => `${s.http?.status} ${s.http?.body}`));
    return { distinctResponses: [...bodies], indistinguishable: bodies.size === 1 };
  })(),
  problems,
  result: problems.length === 0 ? 'PASS' : 'FAIL',
};

const now = new Date();
const p2 = (n) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}`
  + `${p2(now.getHours())}${p2(now.getMinutes())}${p2(now.getSeconds())}`;
const outDir = path.join(REPO, 'docs/migration/proof', `open-generation-wire-${stamp}`);
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'open-generation-wire.json');
fs.writeFileSync(outFile, `${JSON.stringify(record, null, 1)}\n`);

for (const run of [patched, control]) {
  console.log(`\n${run.label}  ${run.exe}`);
  if (run.error) { console.log(`  ERROR ${run.error}`); continue; }
  console.log(`  sidecar v${run.status?.version ?? '?'} · websocket ${run.websocketOpen ? 'open' : 'closed'} · ${run.logLines} log lines`);
  for (const step of run.steps) {
    const want = run.label === 'patched' ? step.expected : 'accepted';
    console.log(`  ${step.observed === want ? 'PASS' : 'FAIL'}  ${step.observed.padEnd(8)} gen=${String(step.generation).padEnd(4)} ${step.clientId.padEnd(5)} ${step.name}`);
  }
}
console.log('\ndiffering steps (patched vs control):');
for (const row of differing) console.log(`  ${row.patched} / ${row.control}   ${row.name}`);
for (const problem of problems) console.log(`\nPROBLEM  ${problem}`);
console.log(`\n${record.result}  ${path.relative(REPO, outFile)}`);
process.exit(record.result === 'PASS' ? 0 : 1);
