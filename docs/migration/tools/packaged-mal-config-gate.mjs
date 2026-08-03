/**
 * packaged-mal-config-gate.mjs — does the CONFIGURED MyAnimeList path actually exist?
 *
 * Until 2026-08-03 there was no client id on this machine, so `status().configured`
 * was false and every OAuth call died in `requireClientId()` with `not-configured`.
 * 36 unit tests cover the client over a fake transport with zero network calls, so
 * the configured branch had never once been executed by the shipped bytes.
 *
 * WHAT THIS MEASURES, AND WHAT IT DELIBERATELY DOES NOT
 *
 *   It runs the PACKAGED app twice and DIFFS the two arms, because an absence read
 *   alone is not a verdict:
 *
 *     control  — the app launched WITHOUT JP_STUDY_MAL_CLIENT_ID in its environment.
 *                Expect configured:false and beginAuth rejected as `not-configured`.
 *     armed    — the app launched WITH it. Expect configured:true and a well-formed
 *                authorize URL.
 *
 *   `beginAuth()` is pure local URL construction (malSync.ts:457-472) — it builds a
 *   PKCE pair, stores it in memory and returns a string. It performs NO network I/O,
 *   which is why it is safe to call here.
 *
 *   It does NOT complete OAuth. `completeAuth(code, state)` needs a human to approve
 *   in a browser and paste the code back; there is no loopback listener and no
 *   protocol handler, so an automated run cannot do it and must not pretend to.
 *
 *   It does NOT touch the list endpoints. `mal:updateEntry` mutates the user's real
 *   MyAnimeList list. There is no auto-sync by design.
 *
 * THE CLIENT ID IS A SECRET AND NEVER LEAVES MEMORY
 *
 *   The value is read from the environment by the CHILD process only. This file
 *   never prints it, never writes it to the record, and asserts its SHAPE — that a
 *   `client_id` parameter is present and non-empty — by LENGTH. `redact()` below
 *   strips it from the URL before anything is recorded. Part 0 of this track runs
 *   `git add -A`, so a client id reaching a file under the repo would be committed.
 *
 * USAGE
 *   node docs/migration/tools/packaged-mal-config-gate.mjs            # runs BOTH arms
 *   node docs/migration/tools/packaged-mal-config-gate.mjs --selfcheck
 *
 *   The armed arm only means anything if JP_STUDY_MAL_CLIENT_ID is in THIS process's
 *   environment, which on Windows means a User environment variable is not enough —
 *   a shell started before it was set will not have it. The gate reports
 *   `armDidNotArm` rather than passing, if so.
 */
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');

const arg = (name, fallback = '') => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const EXE = path.resolve(
  arg('exe') || path.join(REPO, 'out', 'jp-study-app-win32-x64', 'jp-study-app.exe'),
);
const stamp = process.env.RUN_STAMP
  || new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const workRoot = path.join(REPO, 'docs/migration/proof', `packaged-mal-config-${stamp}`);

const CLIENT_ID_ENV = 'JP_STUDY_MAL_CLIENT_ID';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logLines = [];
const log = (m) => { const l = `[mal-config] ${m}`; logLines.push(l); console.log(l); };

const out = { stamp, exe: EXE, steps: [], arms: {} };
function step(name, result, detail, extra = {}) {
  out.steps.push({ name, result, detail, ...extra });
  log(`${result} — ${name}: ${detail}`);
}

/**
 * Remove the client id from anything about to be recorded or logged. Returns the
 * URL with client_id replaced by its length, which is all we ever assert on.
 */
function redact(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const id = u.searchParams.get('client_id');
    if (id) u.searchParams.set('client_id', `<redacted len=${id.length}>`);
    return u.toString();
  } catch {
    return '<unparseable url, withheld because it may carry the client id>';
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function findTarget(port, deadline, label) {
  let seen = [];
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await res.json();
      seen = targets.filter((t) => t.type === 'page').map((t) => t.url);
      // The scheme test matters: Electron exposes an about:blank BEFORE the window
      // navigates, and evaluating against it fails as an access error that reads
      // like a permissions problem and is not one.
      const page = targets.find((t) => t.type === 'page' && /^app:\/\//.test(t.url));
      if (page?.webSocketDebuggerUrl) return page;
    } catch { /* not up yet */ }
    await sleep(400);
  }
  throw new Error(`no CDP target for ${label}; saw ${JSON.stringify(seen)}`);
}

class Cdp {
  constructor(url) { this.url = url; this.nextId = 1; this.pending = new Map(); }
  async open() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener('message', (event) => {
      let msg; try { msg = JSON.parse(String(event.data)); } catch { return; }
      if (msg.id == null) return;
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      entry.resolve(msg);
    });
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true });
    });
    return this;
  }
  send(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve });
      this.socket.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.delete(id)) reject(new Error(`${method} timed out`)); }, 60_000);
    });
  }
  async evaluate(expression) {
    const msg = await this.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true, userGesture: true,
    });
    if (msg.result?.exceptionDetails) {
      throw new Error(msg.result.exceptionDetails.exception?.description ?? 'evaluate threw');
    }
    return msg.result?.result?.value;
  }
  close() { try { this.socket?.close(); } catch { /* gone */ } }
}

/*
 * The page-side probe. Built by concatenation with NO backticks: a backtick here
 * ends the probe string and the file stops parsing with an error that points at
 * prose. That has caught four separate authors on this track.
 *
 * It returns the IPC results verbatim; the redaction happens on the node side,
 * because the renderer has no reason to be trusted with deciding that.
 */
const PROBE = '(async () => {'
  + ' const r = { hasApi: !!(window.api && window.api.malStatus) };'
  + ' if (!r.hasApi) return JSON.stringify(r);'
  + ' try { r.status = await window.api.malStatus(); }'
  + ' catch (e) { r.statusThrew = String((e && e.message) || e); }'
  + ' try { r.begin = await window.api.malBeginAuth(); }'
  + ' catch (e) { r.beginThrew = String((e && e.message) || e); }'
  + ' return JSON.stringify(r);'
  + '})()';

async function runArm(armName, withClientId) {
  const userDataDir = path.join(os.tmpdir(), `jp-mal-cfg-${stamp}-${armName}-${process.pid}`);
  if (fs.existsSync(userDataDir)) throw new Error(`scratch profile ${userDataDir} already exists`);
  fs.mkdirSync(userDataDir, { recursive: true });

  // A fresh scratch profile has no mal-sync.json, so the environment is the ONLY
  // source of a client id. That is what makes the two arms differ by one variable.
  const env = { ...process.env };
  if (!withClientId) delete env[CLIENT_ID_ENV];

  const cdpPort = await freePort();
  const child = spawn(EXE, [`--user-data-dir=${userDataDir}`, `--remote-debugging-port=${cdpPort}`], {
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env,
  });
  child.stdout.resume();
  child.stderr.resume();

  try {
    const target = await findTarget(cdpPort, Date.now() + 180_000, `the ${armName} arm window`);
    const cdp = await new Cdp(target.webSocketDebuggerUrl).open();

    // The CDP target exists as soon as the window does, which is BEFORE the document
    // is usable — and before preload has exposed window.api.
    const deadline = Date.now() + 120_000;
    let ready = null;
    while (Date.now() < deadline) {
      ready = await cdp.evaluate(
        'JSON.stringify({ ready: document.readyState, api: !!(window.api && window.api.malStatus) })',
      ).catch(() => null);
      if (ready && JSON.parse(ready).ready === 'complete' && JSON.parse(ready).api) break;
      await sleep(500);
    }
    if (!ready || !JSON.parse(ready).api) {
      throw new Error(`the ${armName} arm never exposed window.api.malStatus (${ready})`);
    }

    const raw = await cdp.evaluate(PROBE);
    cdp.close();
    const parsed = JSON.parse(raw);

    // Redact BEFORE this value can reach the record or a log line.
    const authorizeUrl = parsed.begin?.data?.authorizeUrl;
    const arm = {
      profile: userDataDir,
      hasApi: parsed.hasApi,
      status: parsed.status ?? null,
      statusThrew: parsed.statusThrew ?? null,
      beginOk: parsed.begin?.ok ?? null,
      beginErrorCode: parsed.begin?.errorCode ?? null,
      beginMessage: parsed.begin?.message ?? null,
      beginThrew: parsed.beginThrew ?? null,
      authorizeUrlRedacted: authorizeUrl ? redact(authorizeUrl) : null,
      returnedState: typeof parsed.begin?.data?.state === 'string'
        ? { length: parsed.begin.data.state.length } : null,
    };

    if (authorizeUrl) {
      const u = new URL(authorizeUrl);
      const p = u.searchParams;
      const clientId = p.get('client_id') ?? '';
      const challenge = p.get('code_challenge') ?? '';
      const urlState = p.get('state') ?? '';
      arm.shape = {
        origin: u.origin,
        pathname: u.pathname,
        params: [...p.keys()].sort(),
        responseType: p.get('response_type'),
        codeChallengeMethod: p.get('code_challenge_method'),
        redirectUri: p.get('redirect_uri'),
        // LENGTHS ONLY. The value is never recorded.
        clientIdPresent: clientId.length > 0,
        clientIdLength: clientId.length,
        codeChallengeLength: challenge.length,
        stateLength: urlState.length,
        // The state in the URL must be the state handed back to the caller, or the
        // CSRF check in completeAuth() can never match.
        stateMatchesReturned: urlState.length > 0
          && urlState === (parsed.begin?.data?.state ?? null),
      };
    }
    out.arms[armName] = arm;
    return arm;
  } finally {
    try { child.kill(); } catch { /* already gone */ }
    await sleep(1500);
  }
}

async function main() {
  if (!fs.existsSync(EXE)) throw new Error(`no packaged build at ${EXE}`);
  out.exeBuiltAt = fs.statSync(EXE).mtime.toISOString();
  fs.mkdirSync(workRoot, { recursive: true });

  const armedAvailable = (process.env[CLIENT_ID_ENV] ?? '').trim().length > 0;
  out.clientIdVisibleToThisProcess = armedAvailable;
  out.clientIdLength = (process.env[CLIENT_ID_ENV] ?? '').trim().length;

  // ── control arm ───────────────────────────────────────────────────────────────
  const control = await runArm('control', false);
  step('1 control: an app with no client id reports itself unconfigured',
    control.status?.data?.configured === false ? 'PASS' : 'FAIL',
    JSON.stringify({ configured: control.status?.data?.configured }));
  step('2 control: beginAuth is refused with not-configured',
    control.beginOk === false && control.beginErrorCode === 'not-configured' ? 'PASS' : 'FAIL',
    JSON.stringify({ ok: control.beginOk, code: control.beginErrorCode }));

  // ── armed arm ─────────────────────────────────────────────────────────────────
  if (!armedAvailable) {
    step('3 armed: the configured path', 'UNTESTED',
      `${CLIENT_ID_ENV} is not in this process's environment, so the armed arm would `
      + 'have measured the control arm again. On Windows a User env var set after this '
      + 'shell started is not inherited. Re-run from a shell that has it.');
    out.armDidNotArm = true;
  } else {
    const armed = await runArm('armed', true);
    const s = armed.shape;
    step('3 armed: status() reports configured:true',
      armed.status?.data?.configured === true ? 'PASS' : 'FAIL',
      JSON.stringify({ configured: armed.status?.data?.configured }));
    step('4 armed: the not-configured error path no longer fires',
      armed.beginOk === true ? 'PASS' : 'FAIL',
      JSON.stringify({ ok: armed.beginOk, code: armed.beginErrorCode }));
    step('5 armed: the authorize URL has the right SHAPE (values never asserted)',
      s && s.responseType === 'code' && s.codeChallengeMethod === 'plain'
        && s.clientIdPresent && s.stateLength > 0 && s.stateMatchesReturned ? 'PASS' : 'FAIL',
      JSON.stringify(s));
    step('6 the two arms actually differ (a verdict is a difference, not an absence)',
      control.status?.data?.configured === false && armed.status?.data?.configured === true
        ? 'PASS' : 'FAIL',
      JSON.stringify({
        control: control.status?.data?.configured,
        armed: armed.status?.data?.configured,
      }));
  }

  step('7 OAuth completion and list writes', 'NOT-REACHABLE',
    'completeAuth needs a human to approve in a browser and paste the code back — there is no '
    + 'loopback listener and no protocol handler. mal:updateEntry mutates the real list and is '
    + 'never called here by design.');

  const record = path.join(workRoot, 'packaged-mal-config.json');
  fs.writeFileSync(record, JSON.stringify(out, null, 2), 'utf-8');
  fs.writeFileSync(path.join(workRoot, 'packaged-mal-config.log'), logLines.join('\n'), 'utf-8');
  log(`record: ${record}`);

  const failed = out.steps.filter((s) => s.result === 'FAIL');
  if (failed.length) {
    log(`FAILED steps: ${failed.map((s) => s.name).join('; ')}`);
    process.exitCode = 1;
  }
}

if (process.argv.slice(2).includes('--selfcheck')) {
  // Compile the page-side probe without launching anything.
  // eslint-disable-next-line no-new-func
  new Function(`return ${PROBE}`);
  new Function(`return ${'JSON.stringify({ ready: document.readyState })'}`);
  console.log('all page-side probes compile');
  process.exit(0);
}

main().catch((error) => {
  log(`ERROR ${error?.stack || error}`);
  try {
    fs.mkdirSync(workRoot, { recursive: true });
    fs.writeFileSync(path.join(workRoot, 'packaged-mal-config.json'),
      JSON.stringify({ ...out, error: String(error?.message || error) }, null, 2), 'utf-8');
  } catch { /* nothing more to do */ }
  process.exit(1);
});
