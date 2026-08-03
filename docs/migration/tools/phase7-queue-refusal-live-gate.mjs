#!/usr/bin/env node
// 47e's ORIGINAL STORY, DRIVEN LIVE — Phase 7 / slice 53.
//
// `evaluateAgentToolAccess`'s header states the defect it was written for:
//
//   "AgentTasks are persisted in AgentTaskQueue … so a task planned while a profile enabled
//    flashcard.delete-deck stayed executable after the user removed that operation from the
//    profile — the permission LEVEL was re-checked at execution and the per-operation
//    allow-list was not."
//
// That story was **unreachable until slice 51**. `nextRunnableAgentQueueItem` had no production
// caller; a queued task could be listed, paused, resumed and cancelled but never run, so the
// sentence "stayed executable after the user removed that operation" described a path with no
// executor at the end of it. Slice 51 wired the queue to `runAgentTaskStep`. This gate is the
// first time the whole story runs end to end against a packaged build:
//
//   1. plan a task LIVE, through the real local model, with the operation ENABLED
//   2. narrow the profile so that operation is no longer enabled
//   3. RESTART the process — the task must survive it, or there is no story
//   4. run the queued row
//   5. read the refusal
//
// ## Why this is a differential and not one green run
//
// A refusal read on its own proves nothing: a step can fail for a dozen reasons that have
// nothing to do with the allow-list (no model, no handler, a bad argument), and every one of
// them would also print a red line in the execution log. So the SAME persisted profile
// directory is planned once and then FORKED: one copy has the operation removed, the other is
// left alone. Both restart, both run the same queued row from the same plan. The verdict is the
// difference between the two arms, never the presence of an error message in one of them.
//
// ## Selectors are language-independent ON PURPOSE
//
// Slice 52 translated this panel, and slice 51's structural test had asserted the literal
// English word "Run" — it broke, and it deserved to. Nothing here matches UI prose. Navigation
// uses the app's own `toolbox:open-tool` CustomEvent, and controls are found by shape:
// `textarea[maxlength="500"]` is the objective box, the `.blanc-row-actions` holding exactly
// four buttons is the plan/run/confirm/run-queued group, and a queue row's Run button is the
// first button in that row's action cell. No new `data-` handles were needed, so this runs
// against the ALREADY-PACKAGED artifact rather than requiring a rebuild.
//
// usage:
//   node docs/migration/tools/phase7-queue-refusal-live-gate.mjs
//   node docs/migration/tools/phase7-queue-refusal-live-gate.mjs --exe=out/…/jp-study-app.exe

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

const EXE = path.resolve(arg('exe')
  || path.join(REPO, 'out', 'jp-study-app-win32-x64', 'jp-study-app.exe'));

const stamp = process.env.RUN_STAMP
  ?? new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '');
const workRoot = path.join(REPO, 'docs/migration/proof', `phase7-queue-refusal-${stamp}`);

const QUEUE_KEY = 'jp-study-local-agent-task-queue-v1';
const SETTINGS_KEY = 'jp-study-local-agent-settings-v1';
const PROFILES_KEY = 'jp-study-local-agent-profiles-v1';

/**
 * The operation the story is about. 47e's own header names `flashcard.delete-deck`; this gate
 * uses `flashcard.list-decks` instead, and the swap is deliberate — `delete-deck` is destructive
 * and Anki is live on a real ~82-deck collection on this machine. `list-decks` exercises the
 * identical code path (`evaluateAgentToolAccess` does not care what a tool DOES) while the
 * control arm, which is expected to SUCCEED, cannot damage anything when it does.
 */
/**
 * The objective is steered toward an operation that TAKES AN ARGUMENT, and that is not
 * cosmetic — it is a workaround for a real defect this gate found on its first run.
 *
 * `parseLocalAgentModelPlan` rejects the ENTIRE plan when a step omits `arguments`
 * (localAgentPrompt.ts:137), and it applies that rule to every operation including the ones
 * that take no arguments at all. Asked to "list every flashcard deck folder", Qwen3-1.7B chose
 * `flashcard.list-decks` — a legal, allow-listed, zero-argument operation, which cleared
 * `evaluateAgentToolAccess` two lines earlier — and then omitted the empty `arguments:{}` that
 * the operation does not need. Result: `Local model step 1 needs an arguments object.` and no
 * plan at all. See the write-up in NEXT_SESSION.md.
 *
 * The first fix aimed at `dictionary.search-knowledge`, whose obvious `query` argument a small
 * model emits naturally — and that got a plan that PARSED, but the model wrote `"arguments":{}`
 * with no `query` in it, so the handler threw `The operation needs query.` in BOTH arms and the
 * differential collapsed. Passing the parser is not the same as being runnable.
 *
 * Aiming instead at `calendar.list` — read-only, no confirmation, and a handler
 * (`() => ({ events: loadEvents().slice(0, 100) })`) that takes no arguments at all, so
 * `arguments:{}` would be *complete* rather than merely accepted — was worse, and the failure is
 * the finding: **5 attempts out of 5** were rejected with `Local model step 1 needs an arguments
 * object.` Together with `flashcard.list-decks` that is **6 rejections out of 6 across two
 * zero-argument operations**. The model omits `arguments` precisely when the operation needs
 * none, which is exactly when the parser insists on it.
 *
 * So the target has to be an operation that TAKES an argument — the model then emits the field —
 * and the gate retries until the model actually PUTS SOMETHING IN IT, because `arguments:{}`
 * parses fine and then dies in the handler.
 */
const PREFERRED_OPERATION = 'dictionary.search-knowledge';
const OBJECTIVE = 'Search my local knowledge using the query "neko" and show what you find.';

/**
 * A 1.7B model is stochastic; one sample is a coin flip, and a single malformed emission is not
 * evidence about the queue. Retrying the SAME objective is legitimate — the gate is not
 * re-rolling until it gets a particular operation, only until it gets a plan that parses, and
 * every attempt is recorded in the proof including the ones that failed.
 */
const PLAN_ATTEMPTS = 5;

/**
 * The operation is CHOSEN FROM THE PLAN THE MODEL ACTUALLY PRODUCED, not asserted in advance.
 *
 * A 1.7B model is not a fixture. Hard-coding the expected operation and failing when the model
 * picks a different one would turn a perfectly good live run into a red gate about nothing —
 * and, worse, tempt the next run to keep re-rolling until the model says the expected thing,
 * which is fitting the evidence to the claim. Any operation in the plan is a valid subject: the
 * planner already filters by the profile's allow-list, so whatever it planned is by construction
 * "an operation the active profile enables", which is exactly what the story calls for.
 *
 * Two constraints on the pick, both so the CONTROL arm can genuinely succeed and the difference
 * between the arms stays attributable to the allow-list alone:
 *   - `minimumPermission` must be within the session's permission level, or the control arm
 *     would be refused too — by a different rule, at the same call site.
 *   - it must not require confirmation, or the control arm would stop at `waiting-confirmation`
 *     rather than `completed`, and "not completed" would no longer mean what the verdict reads it
 *     to mean.
 */
const PERMISSION_RANK = { 'read-only': 0, 'limited-actions': 1, 'full-automation': 2 };
const SESSION_PERMISSION = 'limited-actions';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logLines = [];
const log = (m) => { const l = `[phase7-refusal] ${m}`; logLines.push(l); console.log(l); };

const out = {
  gate: 'phase7-queue-refusal-live-gate.mjs',
  question: "47e's original story, driven live for the first time: does narrowing a profile "
    + 'take effect on work that was already planned, queued and survived a process restart?',
  startedAt: new Date().toISOString(),
  exe: EXE,
  preferredOperation: PREFERRED_OPERATION,
  chosenOperation: null,
  objective: OBJECTIVE,
  steps: [],
  arms: {},
};
function step(name, result, detail, extra = {}) {
  out.steps.push({ name, result, detail, ...extra });
  log(`${result} — ${name}: ${detail}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on('error', reject);
  });
}

async function findTarget(port, deadline, match, label) {
  let seen = [];
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await res.json();
      seen = list.map((t) => `${t.type}:${t.url}`);
      // The scheme is required, not just "a page": Electron exposes an about:blank target
      // BEFORE the window navigates, and attaching to it makes every localStorage read fail
      // with "Access is denied for this document" — a permissions-shaped symptom with an
      // attached-to-the-wrong-document cause. See NEXT_SESSION.md's harness-trap header.
      const hit = list.find((t) => t.type === 'page'
        && /^(app|file|https?):/.test(t.url) && match(t.url));
      if (hit) return hit;
    } catch { /* the port is not up yet */ }
    await sleep(400);
  }
  throw new Error(`timed out waiting for ${label}; targets seen: ${JSON.stringify(seen)}`);
}

class Cdp {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); }
  open() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.addEventListener('open', () => resolve(this));
      this.ws.addEventListener('error', reject);
      this.ws.addEventListener('message', (event) => {
        const msg = JSON.parse(event.data);
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
        else p.resolve(msg.result);
      });
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description ?? 'evaluate threw');
    }
    return r.result.value;
  }
  close() { try { this.ws.close(); } catch { /* already gone */ } }
}

// ── page-side expressions ─────────────────────────────────────────────────────

/** The agent panel, identified by SHAPE: the only surface with a full-automation option. */
const READ_PANEL = `(() => {
  const root = [...document.querySelectorAll('.blanc-tool-detail')].find((el) =>
    [...el.querySelectorAll('option')].some((o) => o.value === 'full-automation'));
  if (!root) {
    return JSON.stringify({ panel: false,
      details: document.querySelectorAll('.blanc-tool-detail').length,
      legends: [...document.querySelectorAll('legend')].map((l) => l.textContent.trim()).slice(0, 20) });
  }
  // The action group is the .blanc-row-actions holding exactly four buttons:
  // [create plan, run next, confirm step, run next queued]. Identified by arity, not prose.
  const actionRow = [...root.querySelectorAll('.blanc-row-actions')]
    .find((el) => el.querySelectorAll(':scope > button').length === 4);
  const actions = actionRow
    ? [...actionRow.querySelectorAll(':scope > button')]
      .map((b, i) => ({ i, text: b.textContent.trim(), disabled: b.disabled }))
    : [];
  // A queue row is a table row whose cells contain an action group; a plan row never does.
  const queueRows = [...root.querySelectorAll('table.blanc-table tbody tr')]
    .filter((tr) => tr.querySelector('.blanc-row-actions'))
    .map((tr) => ({
      objective: (tr.querySelector('td')?.textContent ?? '').trim(),
      cells: [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()),
      buttons: [...tr.querySelectorAll('.blanc-row-actions > button')]
        .map((b) => ({ text: b.textContent.trim(), disabled: b.disabled })),
    }));
  const planRows = [...root.querySelectorAll('table.blanc-table tbody tr')]
    .filter((tr) => !tr.querySelector('.blanc-row-actions'))
    .map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()));
  return JSON.stringify({
    panel: true,
    actions,
    queueRows,
    planRows,
    status: [...root.querySelectorAll('.blanc-status')].map((el) => el.textContent.trim()),
    events: [...root.querySelectorAll('.blanc-note-list li')].map((el) => el.textContent.trim()),
    textareas: root.querySelectorAll('textarea[maxlength="500"]').length,
  });
})()`;

/**
 * PERSIST THE PROFILE STORE by driving the panel's own profile picker.
 *
 * `loadLocalAgentProfiles()` falls back to the built-in profiles IN MEMORY and does not write
 * them, so on a fresh install `jp-study-local-agent-profiles-v1` does not exist in localStorage
 * at all — the first run of this gate read `activeProfileId: null` and would have narrowed
 * nothing, reporting `no-profiles` and calling it a story. You cannot remove an operation from a
 * profile that was never saved.
 *
 * Rather than hard-coding the default store here — which would duplicate app data and silently
 * rot the day the defaults change — this switches the picker to another profile and back, which
 * is a real user action and makes `changeProfile` call `saveLocalAgentProfiles` for us. The
 * store that lands on disk is therefore the app's own, not the gate's idea of it.
 */
const PERSIST_PROFILES = `(() => {
  const root = [...document.querySelectorAll('.blanc-tool-detail')].find((el) =>
    [...el.querySelectorAll('option')].some((o) => o.value === 'full-automation'));
  if (!root) return 'no-panel';
  // The profile picker is the only <select> whose options are not a fixed enum.
  const enums = ['read-only', 'battery-saver', 'lite'];
  const select = [...root.querySelectorAll('select')].find((s) =>
    ![...s.options].some((o) => enums.includes(o.value)));
  if (!select) return 'no-profile-select';
  const options = [...select.options].map((o) => o.value);
  if (options.length < 2) return 'only-one-profile:' + options.join(',');
  const original = select.value;
  const other = options.find((v) => v !== original);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  const pick = (value) => {
    setter.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  };
  pick(other);
  pick(original);
  return 'persisted:' + original + ' via ' + other + ' (' + options.length + ' profiles)';
})()`;

/** React owns the textarea's value, so a bare `.value =` is reverted on the next render. */
const TYPE_OBJECTIVE = (text) => `(() => {
  // rows="4" as well as the length cap: the scheduled-automation section carries a SECOND
  // textarea[maxlength="500"], and typing the objective into that one plans nothing.
  const area = document.querySelector('.blanc-tool-detail textarea[maxlength="500"][rows="4"]');
  if (!area) return 'no-textarea';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(area, ${JSON.stringify(text)});
  area.dispatchEvent(new Event('input', { bubbles: true }));
  return 'typed';
})()`;

/** Click the nth button of the four-button action group. 0 = create plan, 3 = run next queued. */
const CLICK_ACTION = (index) => `(() => {
  const root = [...document.querySelectorAll('.blanc-tool-detail')].find((el) =>
    [...el.querySelectorAll('option')].some((o) => o.value === 'full-automation'));
  if (!root) return 'no-panel';
  const row = [...root.querySelectorAll('.blanc-row-actions')]
    .find((el) => el.querySelectorAll(':scope > button').length === 4);
  if (!row) return 'no-action-row';
  const button = [...row.querySelectorAll(':scope > button')][${index}];
  if (!button) return 'no-button';
  if (button.disabled) return 'disabled';
  button.click();
  return 'clicked';
})()`;

/**
 * Click the per-row Run button. It is the FIRST button in a queued row's action cell — the
 * panel renders Run, Pause, Cancel, Prioritize in that order and renders Run only for
 * `status === 'queued'`, so position is a safe handle where prose is not. The row is matched by
 * its objective, which is study content this gate wrote itself and is therefore never translated.
 */
const CLICK_ROW_RUN = (objectiveFragment) => `(() => {
  const root = [...document.querySelectorAll('.blanc-tool-detail')].find((el) =>
    [...el.querySelectorAll('option')].some((o) => o.value === 'full-automation'));
  if (!root) return 'no-panel';
  const tr = [...root.querySelectorAll('table.blanc-table tbody tr')]
    .filter((row) => row.querySelector('.blanc-row-actions'))
    .find((row) => row.textContent.includes(${JSON.stringify(objectiveFragment)}));
  if (!tr) return 'no-row';
  const buttons = [...tr.querySelectorAll('.blanc-row-actions > button')];
  if (!buttons.length) return 'no-buttons';
  if (buttons[0].disabled) return 'disabled';
  const label = buttons[0].textContent.trim();
  buttons[0].click();
  return 'clicked:' + label;
})()`;

/**
 * The operation catalogue, parsed from `src/shared/localAgent.ts`.
 *
 * This is used ONLY to CHOOSE a subject — which operation is worth narrowing, given that the
 * control arm has to be able to complete. It is deliberately not used to decide anything the
 * gate reports: every verdict below is read out of the running packaged app. Reading source to
 * describe an artifact is the exact trap slices 46 and 49 paid for, so the boundary is worth
 * stating rather than assuming.
 */
function operationCatalogue() {
  const file = path.join(REPO, 'src/shared/localAgent.ts');
  const text = fs.readFileSync(file, 'utf8');
  const catalogue = new Map();
  const re = /operation\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*(?:,\s*'([^']+)'\s*)?\)/g;
  let m;
  while ((m = re.exec(text))) {
    catalogue.set(m[1], {
      id: m[1], category: m[2], label: m[3], minimumPermission: m[4], confirmation: m[5] ?? null,
    });
  }
  return catalogue;
}

const READ_STORAGE = (TARGET_OPERATION) => `(() => {
  const queue = localStorage.getItem(${JSON.stringify(QUEUE_KEY)});
  const profiles = localStorage.getItem(${JSON.stringify(PROFILES_KEY)});
  const q = queue ? JSON.parse(queue) : null;
  const p = profiles ? JSON.parse(profiles) : null;
  const active = p ? p.profiles.find((x) => x.id === p.activeProfileId) : null;
  return JSON.stringify({
    queuePresent: !!q,
    items: q ? q.items.map((i) => ({
      id: i.id, status: i.status, priority: i.priority,
      objective: i.task.objective,
      steps: i.task.steps.map((s) => ({ id: s.id, status: s.status,
        operation: s.request.operation, error: s.error ?? null,
        // Recorded because "the plan parsed" and "the step can run" are different claims: the
        // model happily emits arguments:{} for an operation whose handler requires a field.
        args: s.request.arguments ?? null,
        argCount: Object.keys(s.request.arguments ?? {}).length })),
    })) : [],
    activeProfileId: p ? p.activeProfileId : null,
    activeProfileOps: active ? active.enabledOperations : null,
    targetEnabled: active ? active.enabledOperations.includes(${JSON.stringify(TARGET_OPERATION)}) : null,
  });
})()`;

/** Remove one operation from the ACTIVE profile — the narrowing the story turns on. */
const NARROW_PROFILE = (TARGET_OPERATION) => `(() => {
  const raw = localStorage.getItem(${JSON.stringify(PROFILES_KEY)});
  if (!raw) return 'no-profiles';
  const store = JSON.parse(raw);
  const active = store.profiles.find((p) => p.id === store.activeProfileId);
  if (!active) return 'no-active';
  const before = active.enabledOperations.length;
  active.enabledOperations = active.enabledOperations
    .filter((op) => op !== ${JSON.stringify(TARGET_OPERATION)});
  localStorage.setItem(${JSON.stringify(PROFILES_KEY)}, JSON.stringify(store));
  // The same notification saveLocalAgentProfiles() emits, so a mounted panel picks the
  // narrowing up the way it would if a user had made the change through the UI.
  window.dispatchEvent(new CustomEvent('jp-study-local-agent-profiles-changed', { detail: store }));
  return 'narrowed:' + before + '->' + active.enabledOperations.length;
})()`;

function compileCheck() {
  const expressions = {
    READ_PANEL,
    PERSIST_PROFILES,
    READ_STORAGE: READ_STORAGE('x.y'),
    NARROW_PROFILE: NARROW_PROFILE('x.y'),
    TYPE_OBJECTIVE: TYPE_OBJECTIVE('x'),
    CLICK_ACTION: CLICK_ACTION(0),
    CLICK_ROW_RUN: CLICK_ROW_RUN('x'),
  };
  const broken = [];
  for (const [name, source] of Object.entries(expressions)) {
    try { new Function(`return (${source});`); } catch (err) {
      broken.push(`${name}: ${String(err?.message ?? err)}`);
    }
  }
  return broken;
}

// ── session plumbing ──────────────────────────────────────────────────────────

const children = new Set();
function killTree(pid) {
  if (!pid) return;
  spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
}

/**
 * Launch the packaged app against a given profile directory and drive to the agent panel.
 *
 * `SEANIME_DATADIR` is pinned into the scratch tree and the Chromium profile lives in the OS
 * temp dir — never inside the repo, where Vite's watcher would hit Chromium's lock on
 * `Network/Cookies`, throw EBUSY and take the dev server with it.
 */
async function openSession(userDataDir, label) {
  const cdpPort = await freePort();
  const dataDir = path.join(userDataDir, 'seanime-data');
  fs.mkdirSync(dataDir, { recursive: true });
  const child = spawn(EXE, [`--user-data-dir=${userDataDir}`, `--remote-debugging-port=${cdpPort}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: { ...process.env, SEANIME_DATADIR: dataDir },
  });
  children.add(child);
  child.stdout.resume();
  child.stderr.resume();

  const mainTarget = await findTarget(cdpPort, Date.now() + 180_000,
    (url) => !url.includes('blanc=1'), `${label}: the main window`);
  const main = await new Cdp(mainTarget.webSocketDebuggerUrl).open();
  for (let i = 0; i < 200; i += 1) {
    if (await main.evaluate('document.readyState === "complete" && !!document.body').catch(() => false)) break;
    await sleep(300);
  }
  await main.evaluate("(()=>{const b=document.querySelector('.consent-no');if(b){b.click();return 1;}return 0;})()")
    .catch(() => null);
  await sleep(800);
  return { child, cdpPort, main, mainTarget };
}

async function openAgentPanel(session, label) {
  await session.main.evaluate('window.api.blancOpen().then(() => 1)');
  const blancTarget = await findTarget(session.cdpPort, Date.now() + 120_000,
    (url) => url.includes('blanc=1'), `${label}: the Blanc window`);
  const blanc = await new Cdp(blancTarget.webSocketDebuggerUrl).open();
  for (let i = 0; i < 200; i += 1) {
    if (await blanc.evaluate('document.readyState === "complete" && !!document.body').catch(() => false)) break;
    await sleep(300);
  }
  // The app's OWN navigation event, so nothing here depends on the UI language. BlancShell
  // listens for it, switches to the tools tab and re-broadcasts `toolbox:select-tool`.
  let panel = { panel: false };
  for (let attempt = 0; attempt < 15 && !panel.panel; attempt += 1) {
    await blanc.evaluate(
      "(()=>{window.dispatchEvent(new CustomEvent('toolbox:open-tool',{detail:'local-agent'}));return 1;})()",
    ).catch(() => null);
    await sleep(1200);
    panel = JSON.parse(await blanc.evaluate(READ_PANEL).catch(() => '{"panel":false}'));
  }
  return { blanc, panel };
}

/**
 * Shut the app down CLEANLY, and treat that as load-bearing rather than housekeeping.
 *
 * The first version closed only the main window and force-killed 15 s later. Both arms then came
 * back from the restart with `row=MISSING` — and that read exactly like "the persisted queue does
 * not persist", which is the claim under test. It was the harness. Chromium's localStorage is
 * LevelDB-backed and flushed asynchronously; the PROFILE store survived (it was written ~10
 * minutes before shutdown) while the QUEUE, written seconds before the kill, did not. A harness
 * that force-kills the process it is testing persistence through cannot tell those apart.
 *
 * So: close every page target through DevTools' own `/json/close`, which runs the normal
 * window-close path and lets Chromium flush, then wait a long time for a real exit before
 * resorting to force — and SAY SO in the log when force was needed, because a forced shutdown
 * makes the next restart's storage reading untrustworthy rather than merely unlucky.
 */
async function closeSession(session, label) {
  await sleep(2500); // let the last React write reach localStorage before anything closes
  try {
    const res = await fetch(`http://127.0.0.1:${session.cdpPort}/json/list`);
    const list = await res.json();
    // Blanc first, main last: closing main can tear the app down under the other window.
    const pages = list.filter((t) => t.type === 'page')
      .sort((a, b) => Number(b.url.includes('blanc=1')) - Number(a.url.includes('blanc=1')));
    for (const t of pages) {
      await fetch(`http://127.0.0.1:${session.cdpPort}/json/close/${t.id}`).catch(() => null);
      await sleep(500);
    }
  } catch { /* the port may already be gone, which is the outcome we want anyway */ }

  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline && session.child.exitCode === null) await sleep(500);
  session.forced = session.child.exitCode === null;
  if (session.forced) {
    log(`${label}: WARNING — the app did not exit on its own; forcing. A forced shutdown can lose `
      + 'the last localStorage flush, so a missing row after this restart is NOT evidence about '
      + 'the app.');
    killTree(session.child.pid);
    await sleep(2000);
  } else {
    log(`${label}: exited cleanly (code ${session.child.exitCode})`);
  }
  children.delete(session.child);
  await sleep(1500);
}

function copyProfile(from, to) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
}

// ── the run ───────────────────────────────────────────────────────────────────

async function main() {
  const broken = compileCheck();
  step('P0 every page-side probe compiles', broken.length === 0 ? 'PASS' : 'FAIL',
    broken.length === 0 ? '7 expressions parsed'
      : `a broken probe reads as an absent finding: ${broken.join(' | ')}`);
  if (broken.length) throw new Error('a page-side probe does not compile');

  if (!fs.existsSync(EXE)) throw new Error(`no packaged build at ${EXE}`);
  out.exeBuiltAt = fs.statSync(EXE).mtime.toISOString();
  fs.mkdirSync(workRoot, { recursive: true });

  const models = path.join(os.homedir(), 'Downloads');
  const gguf = fs.existsSync(models)
    ? fs.readdirSync(models).filter((f) => /\.gguf$/i.test(f)) : [];
  step('0 the model precondition', gguf.length ? 'OK' : 'BLOCKED',
    gguf.length ? `~/Downloads holds ${gguf.join(', ')} — resolveModelPath searches there`
      : 'no .gguf on disk; a LIVE plan cannot be produced', { gguf });
  if (!gguf.length) throw new Error('no local model; refusing to fake a plan');
  const modelFileName = gguf.find((f) => /qwen/i.test(f)) ?? gguf[0];

  const base = path.join(os.tmpdir(), `jp-p7ref-${stamp}-${process.pid}`);
  fs.rmSync(base, { recursive: true, force: true });
  fs.mkdirSync(base, { recursive: true });
  const seedDir = path.join(base, 'seed');
  out.scratchRoot = base;

  // ── PHASE 1 — plan LIVE, once, with the operation ENABLED ────────────────────
  const s1 = await openSession(seedDir, 'seed');
  await s1.main.evaluate(`(() => {
    localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, JSON.stringify({
      version: 1, enabled: true, backend: 'local-gguf',
      modelFileName: ${JSON.stringify(modelFileName)}, modelMode: 'standard',
      acceleration: 'auto', contextSize: 8192, memoryLimitMb: 2048, resourceMode: 'balanced',
      cpuLimitPct: 80, gpuLimitPct: 80, maxConcurrentTasks: 1, backgroundProcessing: false,
      permission: 'limited-actions', memoryEnabled: false, privacyMode: true, debugMode: false,
    }));
    return 'ok';
  })()`);
  const seeded = await openAgentPanel(s1, 'seed');
  step('1 the agent panel rendered', seeded.panel.panel ? 'PASS' : 'FAIL',
    seeded.panel.panel
      ? `found by shape (a full-automation option), ${seeded.panel.actions.length} action buttons, `
        + `${seeded.panel.textareas} objective textarea(s) — no UI prose was matched`
      : `no panel; ${JSON.stringify(seeded.panel).slice(0, 300)}`);
  if (!seeded.panel.panel) throw new Error('the agent panel never rendered');

  const persisted = await seeded.blanc.evaluate(PERSIST_PROFILES);
  await sleep(900);
  const before = JSON.parse(await seeded.blanc.evaluate(READ_STORAGE(PREFERRED_OPERATION)));
  step('2 the profile store is ON DISK, so there is something to narrow',
    before.activeProfileId && (before.activeProfileOps?.length ?? 0) > 0 ? 'PASS' : 'FAIL',
    `${persisted}; active profile ${before.activeProfileId} carries `
    + `${before.activeProfileOps?.length} operations. The operation under test is chosen from the `
    + 'plan the model produces, not asserted here.',
    { activeProfileOps: before.activeProfileOps });
  if (!before.activeProfileId || !(before.activeProfileOps?.length > 0)) {
    throw new Error('the profile store never reached localStorage; narrowing it would be a no-op');
  }

  await seeded.blanc.evaluate(TYPE_OBJECTIVE(OBJECTIVE));
  await sleep(400);

  /**
   * A plan is only USABLE if its first step carries at least one argument. `arguments:{}` parses
   * and then dies in the handler with a message about a missing field, which failed identically
   * in both arms once already and destroyed the differential. Keep sampling until the model
   * fills the field in — and if it never does, take the last plan anyway and let the verdict
   * report the weak form rather than pretending the run did not happen.
   */
  const usable = (storage) => {
    const item = storage?.items?.[storage.items.length - 1];
    return !!item && (item.steps[0]?.argCount ?? 0) > 0;
  };

  let planned = null;
  let lastPlanned = null;
  const planAttempts = [];
  for (let attempt = 1; attempt <= PLAN_ATTEMPTS && !planned; attempt += 1) {
    const planClick = await seeded.blanc.evaluate(CLICK_ACTION(0));
    log(`plan attempt ${attempt}/${PLAN_ATTEMPTS} -> ${planClick}`);
    if (planClick !== 'clicked') { planAttempts.push({ attempt, planClick }); await sleep(2000); continue; }
    // The panel disables the plan button while `busy`, so "button enabled again AND a status
    // line is set" is the model's own finished signal — far better than waiting out a timeout,
    // which cannot tell a slow plan from a rejected one.
    const deadline = Date.now() + 420_000;
    let finalStatus = null;
    let thisPlan = null;
    const seenBefore = lastPlanned?.items?.length ?? 0;
    while (Date.now() < deadline) {
      await sleep(4000);
      const storage = JSON.parse(await seeded.blanc.evaluate(READ_STORAGE(PREFERRED_OPERATION)));
      if (storage.items.length > seenBefore) { thisPlan = storage; break; }
      const p = JSON.parse(await seeded.blanc.evaluate(READ_PANEL));
      if (p.panel && p.actions[0] && !p.actions[0].disabled && (p.status ?? []).length) {
        finalStatus = p.status;
        break;
      }
    }
    const item = thisPlan?.items?.[thisPlan.items.length - 1] ?? null;
    if (thisPlan) lastPlanned = thisPlan;
    if (thisPlan && usable(thisPlan)) planned = thisPlan;
    planAttempts.push({
      attempt,
      planClick,
      status: finalStatus,
      produced: !!item,
      operation: item?.steps?.[0]?.operation ?? null,
      argCount: item?.steps?.[0]?.argCount ?? null,
      args: item?.steps?.[0]?.args ?? null,
      usable: !!thisPlan && usable(thisPlan),
    });
    log(`  attempt ${attempt}: ${item
      ? `plan produced — ${item.steps[0]?.operation} args=${JSON.stringify(item.steps[0]?.args)}`
        + `${usable(thisPlan) ? ' (USABLE)' : ' (empty arguments — resampling)'}`
      : `rejected — ${JSON.stringify(finalStatus)}`}`);
    if (!planned) await sleep(2500);
  }
  // Nothing usable in the budget: fall back to the last plan that at least parsed, so the run
  // still measures something and the verdict labels it honestly.
  if (!planned && lastPlanned?.items?.length) {
    planned = lastPlanned;
    log('  no attempt produced a populated arguments object; falling back to the last parsed plan');
  }

  const panelAfterPlan = JSON.parse(await seeded.blanc.evaluate(READ_PANEL));
  out.planAttempts = planAttempts;
  out.panelAfterPlan = panelAfterPlan;
  const plannedItem = planned?.items?.[planned.items.length - 1] ?? null;
  step('3 a LIVE plan was produced by the real local model',
    plannedItem ? 'PASS' : 'FAIL',
    plannedItem
      ? `queued item ${plannedItem.id} "${plannedItem.objective}" with `
        + `${plannedItem.steps.length} step(s): `
        + plannedItem.steps.map((s) => `${s.operation}[${s.status}]`).join(', ')
        + ` (after ${planAttempts.length} attempt(s))`
      : `no queue item after ${planAttempts.length} attempt(s); the model's own rejections were: `
        + JSON.stringify(planAttempts.map((a) => a.status)),
    { item: plannedItem, planAttempts });
  if (!plannedItem) throw new Error('no live plan; nothing below can be measured');

  // ── choose the subject FROM the plan, with the two constraints from the header ──
  const catalogue = operationCatalogue();
  const profileOps = new Set(before.activeProfileOps ?? []);
  const candidates = plannedItem.steps.map((s) => s.operation)
    .filter((id, i, all) => all.indexOf(id) === i)
    .map((id) => ({ id, def: catalogue.get(id) }))
    .filter(({ id, def }) => def
      && profileOps.has(id)
      && PERMISSION_RANK[def.minimumPermission] <= PERMISSION_RANK[SESSION_PERMISSION]
      && !def.confirmation);
  const TARGET_OPERATION = (candidates.find((c) => c.id === PREFERRED_OPERATION) ?? candidates[0])?.id
    ?? null;
  out.chosenOperation = TARGET_OPERATION;
  out.operationCandidates = plannedItem.steps.map((s) => ({
    operation: s.operation,
    inProfile: profileOps.has(s.operation),
    def: catalogue.get(s.operation) ?? null,
  }));
  step('4 the operation under test, chosen from the plan the model actually produced',
    TARGET_OPERATION ? 'PASS' : 'INCONCLUSIVE',
    TARGET_OPERATION
      ? `${TARGET_OPERATION} ("${catalogue.get(TARGET_OPERATION).label}", minimum `
        + `${catalogue.get(TARGET_OPERATION).minimumPermission}, no confirmation) — it is in the `
        + `plan, in the profile's allow-list, and runnable at ${SESSION_PERMISSION}, so the control `
        + 'arm can complete it and the only thing separating the arms is the narrowing'
      : `the model planned ${plannedItem.steps.map((s) => s.operation).join(', ')}, none of which is `
        + `both in the profile allow-list and runnable at ${SESSION_PERMISSION} without confirmation. `
        + 'Narrowing any of them would produce a refusal the control arm could not distinguish from '
        + 'a permission refusal, so this run is INCONCLUSIVE rather than green.',
    { candidates: candidates.map((c) => c.id) });
  if (!TARGET_OPERATION) throw new Error('no suitable operation in the live plan; refusing to report a differential');

  await closeSession(s1, 'seed');
  out.seedForced = s1.forced === true;
  step('5 the process that planned the task has exited',
    s1.forced ? 'DEGRADED' : 'OK',
    s1.forced
      ? 'the app had to be FORCE-KILLED. Chromium may not have flushed the queue write, so a '
        + 'missing row after the restart would be this harness, not the app — read step 7 with that '
        + 'in mind rather than as a persistence finding.'
      : 'the app exited cleanly, so the queue must now come back from disk rather than from '
        + 'component state');

  // ── PHASE 2 — fork the persisted profile: one narrowed, one untouched ────────
  const narrowedDir = path.join(base, 'narrowed');
  const controlDir = path.join(base, 'control');
  copyProfile(seedDir, narrowedDir);
  copyProfile(seedDir, controlDir);
  step('6 the persisted profile was forked into two identical copies', 'OK',
    `${narrowedDir} and ${controlDir} — both restart from the SAME plan, so the only variable `
    + 'below is whether the operation was removed');

  const arms = [
    { name: 'narrowed', dir: narrowedDir, narrow: true },
    { name: 'control', dir: controlDir, narrow: false },
  ];

  /**
   * ORDER MATTERS, and getting it wrong cost this slice a whole run.
   *
   * 47e's story is *plan → narrow → RESTART → run*, and the first version narrowed AFTER the
   * restart, inside the session that then clicked Run. It did not bite: `LocalAgentPanel` reads
   * the profile store once, in a `useState` initializer, and the attempt to force a remount by
   * switching tools did nothing (`calculator` is not in `BLANC_TOOL_IDS`, so the panel never
   * unmounted). Both arms therefore ran with the ORIGINAL 19-operation profile and produced
   * byte-identical errors — which the differential correctly refused to call a pass.
   *
   * So each arm now gets TWO sessions: one that applies the narrowing and exits, and a second
   * that is the restart the story is actually about. The control arm takes the same two sessions
   * with the narrowing skipped, so the arms differ in one thing and not in how many times the
   * process was restarted.
   */
  for (const armSpec of arms) {
    // ── session A — narrow the profile, then quit ─────────────────────────────
    const sA = await openSession(armSpec.dir, `${armSpec.name}/narrow`);
    const openedA = await openAgentPanel(sA, `${armSpec.name}/narrow`);
    const narrowResult = armSpec.narrow
      ? await openedA.blanc.evaluate(NARROW_PROFILE(TARGET_OPERATION))
      : 'not-narrowed';
    const afterNarrow = JSON.parse(await openedA.blanc.evaluate(READ_STORAGE(TARGET_OPERATION)));
    log(`${armSpec.name}: ${narrowResult}, ${TARGET_OPERATION} enabled=${afterNarrow.targetEnabled}`);
    await closeSession(sA, `${armSpec.name}/narrow`);

    // ── session B — THE RESTART, then run the queued row ──────────────────────
    const sB = await openSession(armSpec.dir, `${armSpec.name}/run`);
    const openedB = await openAgentPanel(sB, `${armSpec.name}/run`);
    const restored = JSON.parse(await openedB.blanc.evaluate(READ_STORAGE(TARGET_OPERATION)));
    const row = restored.items.find((i) => i.id === plannedItem.id) ?? null;

    // Match the row by the objective the model actually stored, not by what was typed in — if
    // the planner rewrote it, matching the typed text would report "no-row" about a row that is
    // sitting right there.
    const clicked = await openedB.blanc.evaluate(
      CLICK_ROW_RUN(plannedItem.objective.slice(0, 30)));
    let ran = null;
    const runDeadline = Date.now() + 240_000;
    while (Date.now() < runDeadline) {
      await sleep(2500);
      ran = JSON.parse(await openedB.blanc.evaluate(READ_STORAGE(TARGET_OPERATION)));
      const item = ran.items.find((i) => i.id === plannedItem.id);
      if (item && item.steps.some((s) => s.status !== 'pending')) break;
    }
    const panelAfterRun = JSON.parse(await openedB.blanc.evaluate(READ_PANEL));
    const finalRow = ran?.items?.find((i) => i.id === plannedItem.id) ?? null;

    out.arms[armSpec.name] = {
      dir: armSpec.dir,
      narrowResult,
      targetEnabledAfterNarrow: afterNarrow.targetEnabled,
      activeProfileOpsAfterNarrow: afterNarrow.activeProfileOps,
      narrowSessionForced: sA.forced === true,
      // Read AFTER the restart, in the process that will run the row.
      queueSurvivedRestart: !!row,
      rowAtRestart: row,
      targetEnabledAfterRestart: restored.targetEnabled,
      clicked,
      rowAfterRun: finalRow,
      status: panelAfterRun.status,
      events: panelAfterRun.events,
      planRows: panelAfterRun.planRows,
    };
    log(`${armSpec.name}: restart row=${row ? row.status : 'MISSING'} `
      + `targetEnabled=${restored.targetEnabled} click=${clicked} `
      + `-> ${JSON.stringify(finalRow?.steps ?? [])}`);
    await closeSession(sB, `${armSpec.name}/run`);
  }

  // ── the verdict ─────────────────────────────────────────────────────────────
  const narrowed = out.arms.narrowed;
  const control = out.arms.control;

  const survived = narrowed.queueSurvivedRestart && control.queueSurvivedRestart;
  step('7 the queued task SURVIVED the process restart',
    survived ? 'PASS' : (out.seedForced ? 'INCONCLUSIVE' : 'FAIL'),
    `narrowed arm: ${narrowed.queueSurvivedRestart ? `row present, status ${narrowed.rowAtRestart.status}` : 'ROW MISSING'}; `
    + `control arm: ${control.queueSurvivedRestart ? `row present, status ${control.rowAtRestart.status}` : 'ROW MISSING'}. `
    + (survived
      ? 'Without this, nothing below is about persistence.'
      : out.seedForced
        ? 'The planning process had to be force-killed (step 5), so this is INCONCLUSIVE: an '
          + 'unflushed localStorage write and a queue that does not persist look identical from '
          + 'here, and only a clean shutdown separates them.'
        : 'The app exited CLEANLY and the row is still gone — that is a real persistence finding.'));

  step('8 the narrowing actually took, AND SURVIVED THE RESTART',
    narrowed.targetEnabledAfterNarrow === false && narrowed.targetEnabledAfterRestart === false
      && control.targetEnabledAfterRestart === true
      ? 'PASS' : 'FAIL',
    `narrowed arm: ${narrowed.narrowResult}, ${TARGET_OPERATION} enabled = `
    + `${narrowed.targetEnabledAfterNarrow} before the restart and `
    + `${narrowed.targetEnabledAfterRestart} after it; control arm untouched, enabled = `
    + `${control.targetEnabledAfterRestart} after its restart. The post-restart reading is the one `
    + 'that matters: the panel reads the profile store once, in a useState initializer, so a '
    + 'narrowing applied to a RUNNING panel is not the narrowing the run will see.');

  const stepOf = (arm) => arm.rowAfterRun?.steps?.find((s) => s.operation === TARGET_OPERATION)
    ?? arm.rowAfterRun?.steps?.[0] ?? null;
  const nStep = stepOf(narrowed);
  const cStep = stepOf(control);
  const refusal = nStep?.error ?? null;
  const expected = /is not enabled for the active agent profile\.$/.test(refusal ?? '');

  out.refusal = refusal;
  out.controlStep = cStep;
  step('9 the queued row was RUN, not merely listed',
    /^clicked/.test(narrowed.clicked) && /^clicked/.test(control.clicked) ? 'PASS' : 'FAIL',
    `narrowed arm click -> ${narrowed.clicked}; control arm click -> ${control.clicked}. `
    + 'Before slice 51 there was no such button to click.');

  const controlError = cStep?.error ?? null;
  const controlAlsoRefused = /is not enabled for the active agent profile\.$/.test(controlError ?? '');
  const armsDiffer = (nStep?.error ?? null) !== controlError || nStep?.status !== cStep?.status;
  // The strong form. Anything less is reported as what it is, not rounded up.
  const strong = nStep?.status === 'failed' && expected && cStep?.status === 'completed';

  step('10 THE DIFFERENTIAL — same plan, same restart, one variable',
    strong ? 'PASS' : (expected && !controlAlsoRefused && armsDiffer ? 'PASS-WEAK' : 'FAIL'),
    `narrowed: step ${nStep?.operation} -> ${nStep?.status}, error ${JSON.stringify(refusal)}; `
    + `control: step ${cStep?.operation} -> ${cStep?.status}, error ${JSON.stringify(controlError)}. `
    + (strong
      ? 'The allow-list refusal appears in the narrowed arm and the control arm COMPLETED the very '
        + 'same step from the very same persisted plan — the strong form: the narrowing is the only '
        + 'thing that can account for the difference.'
      : expected && !controlAlsoRefused && armsDiffer
        ? 'The allow-list refusal appears ONLY in the narrowed arm, so the narrowing is still the '
          + 'attributable cause — but the control arm did not reach `completed`, it failed for an '
          + 'unrelated reason, so this is the WEAK form and is labelled as such.'
        : 'No usable difference between the arms — the narrowing never reached the code that runs '
          + 'the step, so this is NOT evidence that the allow-list is unenforced. '
          + (narrowed.targetEnabledAfterRestart === false && nStep?.status === 'completed'
            ? 'WHAT IS OBSERVED, and no more: the narrowing is ON DISK after the restart '
              + `(targetEnabled=${narrowed.targetEnabledAfterRestart}) and the step ran anyway. `
              + 'Note what that field is and is not — `targetEnabled` is computed by READ_STORAGE '
              + 'from raw localStorage, so it establishes that the narrowing persisted and says '
              + 'NOTHING about the allow-list the running panel actually computed. Those are two '
              + 'different quantities and only the first has been measured here. '
              + 'To split them: `node docs/migration/tools/agent-profile-narrowing-probe.mjs` '
              + 'exercises the store layer (normalizeAgentProfiles -> getActiveAgentProfile) '
              + 'against the SOURCE modules with a custom-profile control. If the probe says '
              + 'NOT-REPRODUCED while this gate still fails, the store layer is fine and the fault '
              + 'is between the panel and the executor — instrument what the panel passes as '
              + '`allowedOperations` at the moment of the run, which nothing here observes. '
              + 'DO NOT name a cause in this string. It used to name one; slice 56 fixed that '
              + 'cause and the message went on asserting it with full confidence, which cost a '
              + 'later session a wrong-turn diagnosis. A message that cannot re-derive its claim '
              + 'must report the observation and stop.'
            : 'Check whether the narrowing survived the restart before reading anything into this.')));

  out.verdict = strong ? 'PASS' : (expected && !controlAlsoRefused && armsDiffer ? 'PASS-WEAK' : 'FAIL');
  return out.verdict;
}

const finish = (code) => {
  out.finishedAt = new Date().toISOString();
  out.log = logLines;
  fs.mkdirSync(workRoot, { recursive: true });
  fs.writeFileSync(path.join(workRoot, 'phase7-queue-refusal.json'), JSON.stringify(out, null, 2));
  log(`proof written to ${workRoot}`);
  for (const c of children) killTree(c.pid);
  process.exit(code);
};

if (process.argv.slice(2).includes('--selfcheck')) {
  const broken = compileCheck();
  console.log(broken.length ? `BROKEN:\n${broken.join('\n')}` : 'all page-side probes compile');
  process.exit(broken.length ? 1 : 0);
}

main()
  .then((verdict) => {
    out.result = verdict;
    finish(verdict === 'PASS' || verdict === 'PASS-WEAK' ? 0 : 1);
  })
  .catch((err) => {
    out.result = 'ERROR';
    out.error = err instanceof Error ? err.stack : String(err);
    step('gate', 'ERROR', err instanceof Error ? err.message : String(err));
    finish(1);
  });
