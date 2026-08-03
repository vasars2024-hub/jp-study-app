#!/usr/bin/env node
// Is the Content-Security-Policy ACTUALLY APPLIED in a packaged build? — Phase 9 / slice 47h.
//
// `registerContentSecurityPolicy` attaches the header to the `app:` scheme's URLs, and that
// scheme only exists in a PACKAGED build — a dev run loads the renderer from the Vite origin,
// which the policy never touches. So every claim about this control has been an argument about
// source code. Slice 47g made the policy readable by a unit test, which pins what it SAYS.
// This asks the only remaining question: does a packaged app actually receive it, and does it
// actually constrain the renderer?
//
// ## Two independent readings, because a header is not an enforcement
//
//   1. **The header**, read from inside the page: `fetch(location.href)` on the app document
//      and `headers.get('content-security-policy')`. This proves the header was attached.
//   2. **The behaviour**: appending an inline `<script>` to the document. Under
//      `script-src 'self'` with no `'unsafe-inline'` it is refused and fires
//      `securitypolicyviolation`. This proves the policy is BEING ENFORCED rather than merely
//      present — a header that Chromium rejected as malformed would still read back fine from
//      `fetch`, and would constrain nothing.
//
//      **Not `eval`.** The first version of this gate used `eval` and reported it ALLOWED
//      against a build whose header is demonstrably correct. `Runtime.evaluate` is a debugger
//      action and bypasses the page's CSP by design, exactly as the DevTools console does. It
//      would have been a fabricated finding about a live security control.
//
// Reading only the first would be the "present therefore working" mistake; reading only the
// second would not distinguish "CSP blocks eval" from "something else broke eval". Together
// they bracket it.
//
// ## What a FAIL means
//
// A missing header on a packaged build is the chained High finding in PHASE_6_5_AUDIT.md §3
// being live in a shipped artifact, not a test problem.
//
// usage:
//   node docs/migration/tools/packaged-csp-gate.mjs
//   node docs/migration/tools/packaged-csp-gate.mjs --exe=out/some-other-build/jp-study-app.exe
//
// Needs a packaged build in `out/`. It does NOT need the dev server, and it runs the packaged
// app against a throwaway `--user-data-dir` so it never touches the real profile.

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');

const arg = (name, fallback = '') => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const EXE = path.resolve(arg('exe') || path.join(REPO, 'out', 'jp-study-app-win32-x64', 'jp-study-app.exe'));

const stamp = process.env.RUN_STAMP
  ?? new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '');
const workRoot = path.join(REPO, 'docs/migration/proof', `packaged-csp-${stamp}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logLines = [];
const log = (m) => { const l = `[packaged-csp] ${m}`; logLines.push(l); console.log(l); };

const out = {
  gate: 'packaged-csp-gate.mjs',
  question: 'Does a PACKAGED build actually receive the Content-Security-Policy, and does it '
    + 'actually constrain the renderer?',
  startedAt: new Date().toISOString(),
  exe: EXE,
  steps: [],
};
function step(name, result, detail, extra = {}) {
  out.steps.push({ name, result, detail, ...extra });
  log(`${result} — ${name}: ${detail}`);
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

async function findTarget(port, deadline, match, label) {
  let seen = [];
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await res.json();
      seen = targets.filter((t) => t.type === 'page').map((t) => t.url);
      // The scheme test matters: Electron exposes an `about:blank` before the window
      // navigates, and evaluating against it fails as an access error that reads like a
      // permissions problem and is not one.
      const page = targets.find((t) => t.type === 'page'
        && /^(https?|app):\/\//.test(t.url) && match(t.url));
      if (page?.webSocketDebuggerUrl) return page;
    } catch { /* not up */ }
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

let child = null;

async function main() {
  if (!fs.existsSync(EXE)) {
    throw new Error(`no packaged build at ${EXE}. Build one with \`npm run package\` (the dev `
      + 'server must be DOWN — a Chromium profile under the repo makes Vite throw EBUSY), or '
      + 'pass --exe=.');
  }
  out.exeBuiltAt = fs.statSync(EXE).mtime.toISOString();
  fs.mkdirSync(workRoot, { recursive: true });

  const userDataDir = path.join(os.tmpdir(), `jp-packaged-csp-${stamp}`);
  fs.mkdirSync(userDataDir, { recursive: true });
  const cdpPort = await freePort();

  child = spawn(EXE, [`--user-data-dir=${userDataDir}`, `--remote-debugging-port=${cdpPort}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.resume();
  child.stderr.resume();

  // The packaged renderer loads from the `app:` scheme. If this ever finds an http:// target
  // instead, the build under test is a dev build and the whole run means nothing — so the
  // match is on the scheme, and the URL is recorded.
  const target = await findTarget(cdpPort, Date.now() + 180_000,
    (url) => url.startsWith('app://'), 'the packaged app window');
  out.documentUrl = target.url;
  const cdp = await new Cdp(target.webSocketDebuggerUrl).open();
  step('0 the packaged window is on the app: origin', 'PASS', target.url);

  // The CDP target exists as soon as the window does, which is BEFORE the document is usable.
  // Probing then gives `Failed to fetch` and a null `document.head` — findings about timing
  // that read as findings about the policy. Wait for the document itself.
  {
    const deadline = Date.now() + 120_000;
    let state = null;
    while (Date.now() < deadline) {
      state = await cdp.evaluate(
        "JSON.stringify({ ready: document.readyState, head: !!document.head })",
      ).catch(() => null);
      if (state && JSON.parse(state).ready === 'complete' && JSON.parse(state).head) break;
      await sleep(500);
    }
    out.documentReady = state ? JSON.parse(state) : null;
    if (!out.documentReady?.head) throw new Error(`the packaged document never became usable (${state})`);
    step('0b the document finished loading', 'PASS', state);
  }

  // ── 1. The header, read from inside the document ────────────────────────────────
  const header = await (async () => {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const value = await cdp.evaluate(
        `fetch(location.href, { cache: 'no-store' })
           .then(r => r.headers.get('content-security-policy') || '')
           .catch(e => 'FETCH-FAILED: ' + String(e))`,
      ).catch(() => null);
      if (value) return value;
      await sleep(500);
    }
    return '';
  })();
  out.header = header;
  const headerPresent = !!header && !header.startsWith('FETCH-FAILED');
  step('1 the document answers with a Content-Security-Policy header',
    headerPresent ? 'PASS' : 'FAIL',
    headerPresent ? `${header.length} chars` : `no header (${header || 'empty'})`);

  const directives = headerPresent
    ? Object.fromEntries(header.split(';').map((d) => {
      const parts = d.trim().split(/\s+/);
      return [parts[0], parts.slice(1)];
    }))
    : {};
  out.directives = directives;

  const scriptSrc = directives['script-src'] ?? [];
  const scriptSelfOnly = scriptSrc.length === 1 && scriptSrc[0] === "'self'";
  step('2 script-src is self only, with no unsafe-eval anywhere',
    scriptSelfOnly && !header.includes('unsafe-eval') ? 'PASS' : 'FAIL',
    `script-src ${JSON.stringify(scriptSrc)}; unsafe-eval present: ${header.includes('unsafe-eval')}`);

  // ── 2. The behaviour — a header Chromium rejected would still read back fine ─────
  //
  // DO NOT TEST THIS WITH `eval`. The first version of this gate did, and it reported
  // `eval-allowed` against a build whose header is demonstrably correct — a FABRICATED
  // finding about a live security control. `Runtime.evaluate` is a debugger action and
  // **bypasses the page's CSP by design**, exactly as the DevTools console does; the same
  // applies to `Page.addScriptToEvaluateOnNewDocument`. Anything the harness executes
  // directly is the wrong instrument here.
  //
  // What IS subject to CSP is the page's own DOM. Appending an inline <script> is refused
  // under `script-src 'self'` (no `'unsafe-inline'`), and the refusal fires a
  // `securitypolicyviolation` event. The element is created from a bypassing context, but
  // the LOAD of it is the page's, so this measures the document's policy rather than the
  // debugger's privileges.
  const enforcement = await cdp.evaluate(
    `new Promise((resolve) => {
      let violated = null;
      const onViolation = (event) => { violated = event.violatedDirective || 'unknown'; };
      document.addEventListener('securitypolicyviolation', onViolation);
      window.__cspProbeRan = false;
      const script = document.createElement('script');
      script.textContent = 'window.__cspProbeRan = true;';
      document.head.appendChild(script);
      setTimeout(() => {
        document.removeEventListener('securitypolicyviolation', onViolation);
        script.remove();
        resolve(JSON.stringify({
          violatedDirective: violated,
          inlineScriptRan: window.__cspProbeRan === true,
        }));
      }, 1000);
    })`,
  );
  out.enforcement = JSON.parse(enforcement);
  const enforced = !out.enforcement.inlineScriptRan && !!out.enforcement.violatedDirective;
  step('3 the policy is ENFORCED, not merely present: an inline script is refused',
    enforced ? 'PASS' : 'FAIL',
    `violatedDirective ${out.enforcement.violatedDirective ?? 'none'}, `
    + `inline script ran: ${out.enforcement.inlineScriptRan}`);

  // Corroboration, not a verdict: an off-machine fetch should be refused by connect-src.
  // Recorded because a network failure and a CSP refusal look alike from a promise rejection,
  // so this can support the reading above but must not carry it.
  out.offMachineFetch = await cdp.evaluate(
    `fetch('https://example.invalid/probe', { mode: 'no-cors' })
       .then(() => 'resolved').catch(e => 'rejected:' + (e && e.name))`,
  ).catch((err) => `threw:${String(err?.message ?? err)}`);

  out.verdict = headerPresent && scriptSelfOnly && !header.includes('unsafe-eval') && enforced
    ? 'PASS' : 'FAIL';
  cdp.close();
  return out.verdict;
}

main()
  .then((verdict) => { out.result = verdict; })
  .catch((err) => { out.result = 'ERROR'; out.error = String(err?.message ?? err); log(`ERROR ${out.error}`); })
  .finally(() => {
    out.finishedAt = new Date().toISOString();
    out.log = logLines;
    if (child?.pid) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'],
        { stdio: 'ignore', windowsHide: true });
    }
    fs.mkdirSync(workRoot, { recursive: true });
    fs.writeFileSync(path.join(workRoot, 'packaged-csp.json'), `${JSON.stringify(out, null, 2)}\n`);
    console.log(`\nrecord: ${path.join(workRoot, 'packaged-csp.json')}`);
    process.exitCode = out.result === 'PASS' ? 0 : 1;
  });
