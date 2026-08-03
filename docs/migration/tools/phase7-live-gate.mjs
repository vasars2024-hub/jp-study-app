#!/usr/bin/env node
// How much of Phase 7 can be driven live WITHOUT the local model? — Phase 7 / slice 48.
//
// The record says: "preview/confirm/cancel/audit all exist in code and no Phase 7 surface has
// been driven live", with the live half blocked on a multi-GB GGUF download. That is only half
// true, and the point of this gate is to make the remaining block a known quantity rather than
// an open-ended one.
//
// The gate boots the packaged app on a throwaway profile and drives the real Local AI Agent
// panel (Blanc tool `local-agent`, `BlancReadyToolPanels.tsx`) with no model installed:
//
//   QUEUE      A persisted AgentTaskQueue is seeded into localStorage — the same key the panel
//              loads at mount — and pause / resume / cancel / prioritize are driven with real
//              clicks, then read back out of storage. None of it touches the model.
//   MODEL GATE Two controlled `localAgentPlan` calls, one with the agent enabled and one
//              disabled, to show WHERE the model requirement bites and that the refusal is the
//              model's absence rather than a generic failure. A refusal has no positive
//              observable on its own, which is why this is a difference and not one call.
//   RUNNER     Whether the step-level controls become usable once a task exists in the queue.
//              They are rendered always and DISABLED on `!task`, so this is a positive read of
//              `disabled`, not an argument from an absent button.
//
// usage:
//   node docs/migration/tools/phase7-live-gate.mjs
//   node docs/migration/tools/phase7-live-gate.mjs --exe=out/…/jp-study-app.exe

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');

const argv = process.argv.slice(2);
const arg = (name, fallback = '') => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const EXE = path.resolve(arg('exe')
  || path.join(REPO, 'out', 'jp-study-app-win32-x64', 'jp-study-app.exe'));

const stamp = process.env.RUN_STAMP
  ?? new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '');
const workRoot = path.join(REPO, 'docs/migration/proof', `phase7-live-${stamp}`);

const QUEUE_KEY = 'jp-study-local-agent-task-queue-v1';
const SETTINGS_KEY = 'jp-study-local-agent-settings-v1';
const LAST_TOOL_KEY = 'jp-study.blanc.toolbox.lastTool';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logLines = [];
const log = (m) => { const l = `[phase7] ${m}`; logLines.push(l); console.log(l); };

const out = {
  gate: 'phase7-live-gate.mjs',
  question: 'Which Phase 7 surfaces are reachable and observable in the real app with NO local '
    + 'model installed, and which genuinely require one?',
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
      const page = targets.find((t) => t.type === 'page'
        && /^(https?|app):\/\//.test(t.url) && match(t.url));
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
      setTimeout(() => { if (this.pending.delete(id)) reject(new Error(`${method} timed out`)); }, 120_000);
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

/** A plan the model never produced: the shape `parseLocalAgentModelPlan` emits, written by hand. */
const now = Date.now();
const task = (id, objective, steps) => ({
  id, objective, status: 'pending', steps, createdAt: now, updatedAt: now,
});
const stepOf = (id, operation, args, status = 'pending') => ({
  id, status, request: { callId: `call-${id}`, operation, arguments: args },
});

const SEED_QUEUE = {
  version: 1,
  items: [
    {
      id: 'slice48-queued',
      task: task('slice48-queued', 'Summarise today\'s vocabulary review', [
        stepOf('s1', 'study.preview-cards', {}),
        stepOf('s2', 'flashcard.delete-deck', { folder: 'nope' }),
      ]),
      priority: 0, status: 'queued', createdAt: now, updatedAt: now,
    },
    {
      id: 'slice48-paused',
      task: task('slice48-paused', 'Rebuild the grammar drill list', [stepOf('s1', 'study.preview-anki', {})]),
      priority: 0, status: 'paused', createdAt: now - 1, updatedAt: now - 1,
    },
  ],
};

/** Read the queue panel out of the DOM: rows, statuses, and the buttons actually offered. */
const READ_PANEL = `(() => {
  const legend = [...document.querySelectorAll('legend')].find((el) => el.textContent.trim() === 'Task queue');
  if (!legend) return JSON.stringify({ panel: false, legends: [...document.querySelectorAll('legend')].map((l) => l.textContent.trim()) });
  const fieldset = legend.closest('fieldset');
  const rows = [...fieldset.querySelectorAll('tbody tr')].map((tr) => {
    const cells = [...tr.querySelectorAll('td')].map((td) => td.textContent.trim());
    return {
      objective: cells[0], status: cells[1], priority: cells[2],
      buttons: [...tr.querySelectorAll('button')].map((b) => b.textContent.trim()),
    };
  });
  const runners = [...document.querySelectorAll('button')]
    .filter((b) => /Run next approved step|Confirm sensitive step/.test(b.textContent))
    .map((b) => ({ label: b.textContent.trim(), disabled: b.disabled }));
  const stepRows = [...document.querySelectorAll('legend')]
    .filter((el) => /Plan|Step/i.test(el.textContent))
    .map((el) => el.textContent.trim());
  return JSON.stringify({ panel: true, rows, runners, stepRows });
})()`;

const CLICK_ROW_BUTTON = (objectiveFragment, label) => `(() => {
  const legend = [...document.querySelectorAll('legend')].find((el) => el.textContent.trim() === 'Task queue');
  const tr = [...legend.closest('fieldset').querySelectorAll('tbody tr')]
    .find((row) => row.textContent.includes(${JSON.stringify(objectiveFragment)}));
  if (!tr) return 'no-row';
  const button = [...tr.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)});
  if (!button) return 'no-button';
  button.click();
  return 'clicked';
})()`;

/** Click the first visible control whose trimmed text matches exactly. */
const CLICK_TEXT = (text) => `(() => {
  const wanted = ${JSON.stringify(text)};
  const candidates = [...document.querySelectorAll('button, [role="button"], [role="tab"], li, a')];
  const hit = candidates.find((el) => el.textContent.trim() === wanted && el.getBoundingClientRect().width > 0);
  if (!hit) return 'not-found';
  hit.click();
  return 'clicked';
})()`;

/** React owns the textarea's value, so a bare `.value =` is reverted on the next render. */
const TYPE_OBJECTIVE = (text) => `(() => {
  const area = [...document.querySelectorAll('textarea')]
    .find((el) => (el.placeholder || '').includes('Find a simple anime'));
  if (!area) return 'no-textarea';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(area, ${JSON.stringify(text)});
  area.dispatchEvent(new Event('input', { bubbles: true }));
  return 'typed';
})()`;

/** Drive a labelled <select> the way React expects, by option text. */
const SELECT_BY_LABEL = (labelText, optionText) => `(() => {
  const label = [...document.querySelectorAll('label')]
    .find((el) => el.textContent.trim().startsWith(${JSON.stringify(labelText)}));
  const select = label?.querySelector('select');
  if (!select) return 'no-select';
  const option = [...select.options].find((o) => o.textContent.trim() === ${JSON.stringify(optionText)});
  if (!option) return 'no-option:' + [...select.options].map((o) => o.textContent.trim()).join('/');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(select, option.value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
  return 'set:' + option.textContent.trim();
})()`;

/** The three fieldsets Phase 7 calls preview / audit, plus the status line. */
const READ_PLAN_SURFACE = `(() => {
  const bySection = (name) => {
    const legend = [...document.querySelectorAll('legend')].find((el) => el.textContent.trim() === name);
    return legend ? legend.closest('fieldset') : null;
  };
  const planTable = bySection('Task plan');
  const steps = planTable ? [...planTable.querySelectorAll('tbody tr')].map((tr) =>
    [...tr.querySelectorAll('td')].map((td) => td.textContent.trim())) : [];
  const logList = bySection('Execution log');
  const events = logList ? [...logList.querySelectorAll('li')].map((li) => li.textContent.trim()) : [];
  const summary = bySection('Plan summary');
  const buttons = [...document.querySelectorAll('button')]
    .filter((b) => /Create local plan|Working|Run next approved step|Confirm sensitive step/.test(b.textContent))
    .map((b) => ({ label: b.textContent.trim(), disabled: b.disabled }));
  const status = [...document.querySelectorAll('.blanc-status, .blanc-note')]
    .map((el) => el.textContent.trim()).filter((t) => /Runtime:|Model:|Plan ready|could not|No approved|Models found/.test(t));
  return JSON.stringify({
    hasPlan: !!planTable, steps, events, buttons, status,
    summary: summary ? summary.textContent.replace('Plan summary', '').trim().slice(0, 300) : null,
  });
})()`;

const READ_QUEUE_STORAGE = `(() => {
  const raw = localStorage.getItem(${JSON.stringify(QUEUE_KEY)});
  if (!raw) return JSON.stringify({ present: false });
  const parsed = JSON.parse(raw);
  return JSON.stringify({
    present: true,
    items: parsed.items.map((i) => ({ id: i.id, status: i.status, priority: i.priority })),
  });
})()`;

let child = null;
function killTree(pid) {
  if (!pid) return;
  spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
}

async function main() {
  if (!fs.existsSync(EXE)) throw new Error(`no packaged build at ${EXE}`);
  out.exeBuiltAt = fs.statSync(EXE).mtime.toISOString();
  fs.mkdirSync(workRoot, { recursive: true });

  const userDataDir = path.join(os.tmpdir(), `jp-phase7-${stamp}-${process.pid}`);
  fs.rmSync(userDataDir, { recursive: true, force: true });
  fs.mkdirSync(userDataDir, { recursive: true });
  out.userDataDir = userDataDir;

  // A throwaway profile has no models directory, and `resolveModelPath` also looks in the real
  // ~/Downloads. Record what it would find so "no model" is a measured precondition.
  const downloads = path.join(os.homedir(), 'Downloads');
  const ggufInDownloads = fs.existsSync(downloads)
    ? fs.readdirSync(downloads).filter((f) => /\.gguf$/i.test(f))
    : [];
  step('precondition',
    'OK',
    ggufInDownloads.length
      ? `~/Downloads already holds ${ggufInDownloads.length} .gguf file(s), which resolveModelPath `
        + `searches: ${ggufInDownloads.join(', ')} — so the "multi-GB download" this record calls a `
        + 'blocker has already happened on this machine'
      : 'no .gguf in the throwaway profile or ~/Downloads, so the model gate is genuinely shut',
    { ggufInDownloads });

  const cdpPort = await freePort();
  child = spawn(EXE, [`--user-data-dir=${userDataDir}`, `--remote-debugging-port=${cdpPort}`],
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  child.stdout.resume();
  child.stderr.resume();

  const main1 = await findTarget(cdpPort, Date.now() + 180_000,
    (url) => !url.includes('blanc=1'), 'the main window');
  const cdp = await new Cdp(main1.webSocketDebuggerUrl).open();
  for (let i = 0; i < 200; i += 1) {
    if (await cdp.evaluate('document.readyState === "complete" && !!document.body').catch(() => false)) break;
    await sleep(300);
  }
  log(`main window up at ${main1.url}`);

  // Seed the persisted queue, enable the agent, and pin the Blanc shell to open on `local-agent`.
  await cdp.evaluate(`(() => {
    localStorage.setItem(${JSON.stringify(QUEUE_KEY)}, ${JSON.stringify(JSON.stringify(SEED_QUEUE))});
    localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, JSON.stringify({
      version: 1, enabled: true, backend: 'local-gguf', modelFileName: '', modelMode: 'standard',
      acceleration: 'auto', contextSize: 8192, memoryLimitMb: 2048, resourceMode: 'balanced',
      cpuLimitPct: 80, gpuLimitPct: 80, maxConcurrentTasks: 1, backgroundProcessing: false,
      permission: 'limited-actions', memoryEnabled: false, privacyMode: true, debugMode: false,
    }));
    localStorage.setItem(${JSON.stringify(LAST_TOOL_KEY)}, 'local-agent');
    return 'ok';
  })()`);
  step('seed-queue', 'OK',
    `two tasks persisted into ${QUEUE_KEY} (one queued, one paused) — the model was never involved`);

  await cdp.evaluate('window.api.blancOpen().then(() => 1)');
  const blancTarget = await findTarget(cdpPort, Date.now() + 120_000,
    (url) => url.includes('blanc=1'), 'the Blanc window');
  const blanc = await new Cdp(blancTarget.webSocketDebuggerUrl).open();
  for (let i = 0; i < 200; i += 1) {
    if (await blanc.evaluate('document.readyState === "complete" && !!document.body').catch(() => false)) break;
    await sleep(300);
  }
  log(`blanc window up at ${blancTarget.url}`);

  // Blanc opens on its Read tab; `lastTool` only decides which TOOL the Toolbox tab shows.
  // Navigate the way a user does rather than assuming the seed put us on the right surface.
  // The two clicks are retried because the tool list mounts lazily — a single pass caught the
  // shell mid-mount once and reported "the panel never rendered" about a panel that was fine.
  let panel = { panel: false };
  const trail = [];
  for (let attempt = 0; attempt < 12 && !panel.panel; attempt += 1) {
    trail.push(await blanc.evaluate(CLICK_TEXT('Toolbox')));
    await sleep(1200);
    panel = JSON.parse(await blanc.evaluate(READ_PANEL).catch(() => '{"panel":false}'));
    if (panel.panel) break;
    trail.push(await blanc.evaluate(CLICK_TEXT('Local AI Agent')));
    await sleep(1500);
    panel = JSON.parse(await blanc.evaluate(READ_PANEL).catch(() => '{"panel":false}'));
  }
  step('navigate', panel.panel ? 'OK' : 'FAIL',
    `Toolbox -> Local AI Agent after ${trail.length} click(s): ${trail.join(',')}`);
  out.panelAtOpen = panel;
  step('queue-renders',
    panel.panel && panel.rows.length === 2 ? 'PASS' : 'FAIL',
    panel.panel
      ? `the Task queue table rendered ${panel.rows.length} persisted task(s) with no model: `
        + panel.rows.map((r) => `[${r.status}] ${r.buttons.join('/')}`).join('  ')
      : `the Local AI Agent panel did not render; legends seen: ${JSON.stringify(panel.legends ?? []).slice(0, 300)}`,
    { rows: panel.rows });

  if (!panel.panel) throw new Error('the agent panel never rendered — nothing below can be measured');

  // ── cancel / resume / prioritize, driven with real clicks. ───────────────────
  const before = JSON.parse(await blanc.evaluate(READ_QUEUE_STORAGE));
  const clicks = [];
  for (const [fragment, label] of [
    ['Summarise today', 'Prioritize'],
    ['Rebuild the grammar', 'Resume'],
    ['Summarise today', 'Cancel'],
  ]) {
    const result = await blanc.evaluate(CLICK_ROW_BUTTON(fragment, label));
    await sleep(500);
    clicks.push({ fragment, label, result, storage: JSON.parse(await blanc.evaluate(READ_QUEUE_STORAGE)) });
    log(`clicked ${label} on "${fragment}…" -> ${result}`);
  }
  const after = clicks[clicks.length - 1].storage;
  const cancelled = after.items.find((i) => i.id === 'slice48-queued');
  const resumed = after.items.find((i) => i.id === 'slice48-paused');
  const prioritised = clicks[0].storage.items.find((i) => i.id === 'slice48-queued');
  out.clicks = clicks;
  step('cancel-resume-prioritize',
    cancelled?.status === 'cancelled' && resumed?.status === 'queued' && prioritised?.priority === 100
      ? 'PASS' : 'FAIL',
    `after real clicks, persisted state is: queued task -> ${cancelled?.status} `
    + `(priority ${prioritised?.priority} after Prioritize), paused task -> ${resumed?.status}. `
    + `Before: ${JSON.stringify(before.items)}`,
    { before: before.items, after: after.items });

  const panelAfter = JSON.parse(await blanc.evaluate(READ_PANEL));
  out.panelAfterClicks = panelAfter;
  step('cancel-is-terminal',
    panelAfter.rows.find((r) => r.status === 'cancelled')?.buttons.length === 0 ? 'PASS' : 'FAIL',
    `the cancelled row now offers ${JSON.stringify(panelAfter.rows.find((r) => r.status === 'cancelled')?.buttons ?? [])} `
    + '— cancel is terminal in the UI, not a toggle');

  // ── Does a queued task make the step runner usable? ──────────────────────────
  step('queue-does-not-feed-the-runner',
    panelAfter.runners.every((r) => r.disabled) ? 'PASS' : 'FAIL',
    'with two tasks in the persisted queue, the step controls read '
    + panelAfter.runners.map((r) => `${JSON.stringify(r.label)} disabled=${r.disabled}`).join(', ')
    + ' — they are gated on the in-memory `task`, which only `plan()` ever sets, so a queued '
    + 'task cannot be run, previewed step-by-step, confirmed, or audited.',
    { runners: panelAfter.runners });

  // ── Where exactly does the model requirement bite? Three controlled calls. ───
  const planCall = (enabled, modelFileName) => `(async () => {
    const r = await window.api.localAgentPlan({
      objective: 'Preview five study cards',
      settings: { version: 1, enabled: ${enabled}, backend: 'local-gguf',
        modelFileName: ${JSON.stringify(modelFileName)},
        modelMode: 'standard', acceleration: 'auto', contextSize: 2048, memoryLimitMb: 2048,
        resourceMode: 'balanced', cpuLimitPct: 80, gpuLimitPct: 80, maxConcurrentTasks: 1,
        backgroundProcessing: false, permission: 'limited-actions', memoryEnabled: false,
        privacyMode: true, debugMode: false },
      memories: [],
    });
    return JSON.stringify(r);
  })()`;
  const disabledPlan = JSON.parse(await blanc.evaluate(planCall(false, '')));
  const noModelPlan = JSON.parse(await blanc.evaluate(planCall(true, 'slice48-no-such-model.gguf')));
  out.planCalls = { disabled: disabledPlan, noModel: noModelPlan };
  step('model-gate',
    noModelPlan.ok === false && /GGUF model/i.test(noModelPlan.error ?? '')
      && disabledPlan.error !== noModelPlan.error ? 'PASS' : 'FAIL',
    `agent disabled -> ${JSON.stringify(disabledPlan.error)} (${disabledPlan.elapsedMs} ms); `
    + `enabled but pointed at a model that does not exist -> ${JSON.stringify(noModelPlan.error)} `
    + `(${noModelPlan.elapsedMs} ms). Two DIFFERENT refusals from the same call is what makes the `
    + 'second one the model gate rather than a generic failure — a refusal on its own has no '
    + 'positive observable.',
    { disabled: disabledPlan, noModel: noModelPlan });

  // ── The model is already on this machine, so drive the whole chain. ──────────
  const models = JSON.parse(await blanc.evaluate('window.api.localAgentModels().then((m) => JSON.stringify(m))'));
  step('model-present',
    models.length ? 'OK' : 'SKIP',
    models.length
      ? `the app itself finds ${models.length} local model(s): `
        + models.map((m) => `${m.fileName} (${(m.sizeBytes / 1e9).toFixed(2)} GB, ${m.location})`).join(', ')
      : 'no local model is installed — the plan/preview/confirm/audit chain cannot be driven',
    { models });

  if (models.length) {
    // Point the panel's own settings at the model and drive its own button.
    await blanc.evaluate(`(() => {
      const raw = JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}));
      raw.modelFileName = ${JSON.stringify(models[0].fileName)};
      raw.contextSize = 2048;
      localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, JSON.stringify(raw));
      return 'ok';
    })()`);
    await blanc.send('Page.reload', {});
    await sleep(3000);
    for (let i = 0; i < 200; i += 1) {
      if (await blanc.evaluate('document.readyState === "complete" && !!document.body').catch(() => false)) break;
      await sleep(300);
    }
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await blanc.evaluate(CLICK_TEXT('Toolbox'));
      await sleep(1200);
      if (JSON.parse(await blanc.evaluate(READ_PANEL).catch(() => '{"panel":false}')).panel) break;
      await blanc.evaluate(CLICK_TEXT('Local AI Agent'));
      await sleep(1500);
      if (JSON.parse(await blanc.evaluate(READ_PANEL).catch(() => '{"panel":false}')).panel) break;
    }

    const typed = await blanc.evaluate(TYPE_OBJECTIVE('Preview five study cards from my deck'));
    await sleep(400);
    const planClicked = await blanc.evaluate(CLICK_TEXT('Create local plan'));
    step('plan-clicked', planClicked === 'clicked' ? 'OK' : 'FAIL',
      `objective ${typed}, "Create local plan" ${planClicked} — the panel's own button, not an IPC call`);

    // Loading a 1.2 GB model and running inference takes real time; PLAN_TIMEOUT_MS is 90 s.
    let surface = null;
    const planDeadline = Date.now() + 240_000;
    while (Date.now() < planDeadline) {
      surface = JSON.parse(await blanc.evaluate(READ_PLAN_SURFACE).catch(() => '{}'));
      if (surface.hasPlan || surface.status?.some((s) => /could not|No approved/.test(s))) break;
      await sleep(2000);
    }
    out.planSurface = surface;
    step('preview',
      surface?.hasPlan ? 'PASS' : 'FAIL',
      surface?.hasPlan
        ? `the Task plan table rendered ${surface.steps.length} step(s) BEFORE anything ran: `
          + surface.steps.map((s) => `${s[1]}=${s[2]}`).join(', ')
          + `; summary ${JSON.stringify((surface.summary ?? '').slice(0, 120))}`
        : `no plan surface appeared; status ${JSON.stringify(surface?.status ?? [])}`,
      { steps: surface?.steps, status: surface?.status });

    if (surface?.hasPlan) {
      await blanc.evaluate(CLICK_TEXT('Run next approved step'));
      await sleep(3000);
      const afterRun = JSON.parse(await blanc.evaluate(READ_PLAN_SURFACE));
      out.afterRun = afterRun;
      step('audit',
        afterRun.events.length ? 'PASS' : 'FAIL',
        afterRun.events.length
          ? `the Execution log rendered ${afterRun.events.length} audit event(s): ${afterRun.events.join(' | ')}`
          : 'no audit events appeared after running a step',
        { events: afterRun.events, steps: afterRun.steps });

      const confirmButton = afterRun.buttons.find((b) => b.label === 'Confirm sensitive step');
      if (confirmButton && !confirmButton.disabled) {
        await blanc.evaluate(CLICK_TEXT('Confirm sensitive step'));
        await sleep(3000);
        const afterConfirm = JSON.parse(await blanc.evaluate(READ_PLAN_SURFACE));
        out.afterConfirm = afterConfirm;
        step('confirm', 'PASS',
          `a step required confirmation and the confirmed run produced: ${afterConfirm.events.join(' | ')}`,
          { events: afterConfirm.events, steps: afterConfirm.steps });
      } else {
        step('confirm-first-attempt', 'NOT-REACHED',
          'the plan this model produced contained no step whose operation carries a confirmation '
          + 'reason. Every confirming operation in AGENT_TOOL_OPERATIONS needs full-automation, '
          + 'and evaluateAgentToolAccess checks the permission level BEFORE the confirmation '
          + 'reason — so under limited-actions such a step is DENIED, never held for confirmation.',
          { confirmButton });

        // Second pass, aimed at the confirmation path: the built-in Automation Assistant profile
        // carries full-automation and enables settings.apply-theme, whose confirmation reason is
        // 'major-change'. Both selects are driven as a user drives them.
        const profileSet = await blanc.evaluate(SELECT_BY_LABEL('Assistant profile', 'Automation Assistant'));
        await sleep(800);
        const permissionSet = await blanc.evaluate(SELECT_BY_LABEL('Permission', 'Full automation'));
        await sleep(800);
        step('profile-and-permission', 'OK',
          `active profile -> ${profileSet}, permission -> ${permissionSet}; `
          + 'the authorization inputs are themselves a live Phase 7 surface');

        await blanc.evaluate(TYPE_OBJECTIVE('Apply a dark theme to the app'));
        await sleep(400);
        await blanc.evaluate(CLICK_TEXT('Create local plan'));
        let second = null;
        const secondDeadline = Date.now() + 240_000;
        while (Date.now() < secondDeadline) {
          second = JSON.parse(await blanc.evaluate(READ_PLAN_SURFACE).catch(() => '{}'));
          if (second.hasPlan || second.status?.some((s) => /could not|No approved/.test(s))) break;
          await sleep(2000);
        }
        out.secondPlan = second;
        if (second?.hasPlan) {
          await blanc.evaluate(CLICK_TEXT('Run next approved step'));
          await sleep(3000);
          const afterSecondRun = JSON.parse(await blanc.evaluate(READ_PLAN_SURFACE));
          out.afterSecondRun = afterSecondRun;
          const confirmNow = afterSecondRun.buttons.find((b) => b.label === 'Confirm sensitive step');
          const held = afterSecondRun.steps.some((s) => /confirm/i.test(s[2] ?? ''));
          if (confirmNow && !confirmNow.disabled) {
            await blanc.evaluate(CLICK_TEXT('Confirm sensitive step'));
            await sleep(3000);
            const afterConfirm = JSON.parse(await blanc.evaluate(READ_PLAN_SURFACE));
            out.afterConfirm = afterConfirm;
            step('confirm', 'PASS',
              `a step was held for confirmation and the confirmed run produced: `
              + `${afterConfirm.events.join(' | ')}`,
              { steps: afterConfirm.steps, events: afterConfirm.events });
          } else {
            step('confirm', 'NOT-REACHED',
              `under full-automation the model proposed ${JSON.stringify(afterSecondRun.steps.map((s) => s[1]))}; `
              + `no step reached waiting-confirmation (held=${held}). The confirm path depends on WHAT a `
              + '1.7B model proposes, which is not something this gate can force without faking a plan.',
              { steps: afterSecondRun.steps, events: afterSecondRun.events });
          }
        } else {
          step('confirm', 'NOT-REACHED',
            `the second plan did not render; status ${JSON.stringify(second?.status ?? [])}`);
        }
      }
    }
  }

  blanc.close();
  cdp.close();
  out.finishedAt = new Date().toISOString();
  out.verdict = out.steps.some((s) => s.result === 'FAIL') ? 'FAIL' : 'PASS';
}

main()
  .catch((err) => {
    step('gate', 'ERROR', err instanceof Error ? err.message : String(err));
    out.verdict = 'ERROR';
  })
  .finally(() => {
    killTree(child?.pid);
    fs.mkdirSync(workRoot, { recursive: true });
    fs.writeFileSync(path.join(workRoot, 'phase7-live.json'), JSON.stringify(out, null, 2));
    fs.writeFileSync(path.join(workRoot, 'run.log'), logLines.join('\n') + '\n');
    log(`verdict ${out.verdict} — ${workRoot}`);
    process.exit(out.verdict === 'PASS' ? 0 : 1);
  });
