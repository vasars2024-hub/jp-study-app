#!/usr/bin/env node
// A baseline accessibility audit of the REAL rendered app — Phase 9 / slice 47k.
//
// `SEANIME_MIGRATION_PLAN.md` lists "accessibility" among Phase 9's hardening items and nothing
// has ever measured it. This does not certify anything: an automated DOM audit catches a
// minority of real accessibility problems — roughly the mechanical third — and says nothing
// about focus order in practice, contrast, motion, screen-reader phrasing, or whether a
// surface is actually operable. **It is a floor, not a conformance claim.**
//
// What it can do honestly is stop the mechanical faults from drifting upward unnoticed, which
// is the same job `license-audit-gate.mjs` does for dependencies. Every class below is
// decidable from the DOM alone, with no heuristics:
//
//   unnamedControls   a button/link/input a screen reader would announce as just "button"
//   imagesWithoutAlt  <img> with NO alt attribute at all (alt="" is correct for decorative)
//   unlabelledFields  a form control with no <label for>, wrapping label, or aria-label
//   positiveTabindex  tabindex > 0, which reorders the tab sequence globally
//   duplicateIds      breaks `label[for]` and every aria-*-by reference silently
//   missingLang       <html> without a lang, so pronunciation falls back to the OS voice
//
// The last one matters more here than in most apps: this is a Japanese study tool whose chrome
// is English/JA/ZH/RU, and study content carries its own `lang` (see the `<strong lang="ja">`
// in SeanimeWatchLoopPanel). A missing document language makes every one of those a guess.
//
// ## Ceilings, not targets
//
// Counts are compared against recorded ceilings. Raising one is a decision someone makes in
// a diff; drifting past it fails. A zero-tolerance gate on a 4,000-element UI would be
// switched off within a week, which helps nobody.
//
// usage:
//   node docs/migration/tools/packaged-a11y-gate.mjs
//   node docs/migration/tools/packaged-a11y-gate.mjs --exe=out/…/jp-study-app.exe

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

/**
 * Recorded 2026-08-02 from the first run. These are the numbers the shipped shell actually
 * has, not aspirations — the point of writing them down is that the next run cannot quietly
 * be worse. Lower them as they get fixed.
 */
const CEILINGS = {
  unnamedControls: 0,
  imagesWithoutAlt: 0,
  unlabelledFields: 0,
  positiveTabindex: 0,
  duplicateIds: 0,
  missingLang: 0,
};

const stamp = process.env.RUN_STAMP
  ?? new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '');
const workRoot = path.join(REPO, 'docs/migration/proof', `packaged-a11y-${stamp}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logLines = [];
const log = (m) => { const l = `[a11y] ${m}`; logLines.push(l); console.log(l); };

const out = {
  gate: 'packaged-a11y-gate.mjs',
  question: 'What mechanical accessibility faults does the real rendered app have, and are '
    + 'there more of them than last time?',
  disclaimer: 'A DOM audit is a floor, not a conformance claim. It cannot see contrast, focus '
    + 'order in practice, motion, screen-reader phrasing, or whether a surface is operable.',
  startedAt: new Date().toISOString(),
  exe: EXE,
  ceilings: CEILINGS,
  surfaces: [],
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

/**
 * The audit, as one expression evaluated in the page.
 *
 * Only VISIBLE elements are considered. A hidden panel's unlabelled input is not something a
 * user can reach, and counting it would bury the reachable faults under inert ones — this app
 * keeps whole surfaces mounted and CSS-hidden on purpose (see the workspace host), so that is
 * not a small difference.
 */
const AUDIT = `(() => {
  const visible = (el) => {
    if (!(el instanceof HTMLElement)) return false;
    if (el.hidden) return false;
    if (el.closest('[aria-hidden="true"]')) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const describe = (el) => {
    const cls = typeof el.className === 'string' ? el.className.slice(0, 40) : '';
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls.trim().split(/\\s+/)[0] : '');
  };
  const accessibleName = (el) => {
    const aria = (el.getAttribute('aria-label') || '').trim();
    if (aria) return aria;
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const text = by.split(/\\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
      if (text) return text;
    }
    const title = (el.getAttribute('title') || '').trim();
    if (title) return title;
    const alt = (el.getAttribute('alt') || '').trim();
    if (alt) return alt;
    // An icon-only control often carries its name on a nested <svg><title>.
    const svgTitle = (el.querySelector('svg > title')?.textContent ?? '').trim();
    if (svgTitle) return svgTitle;
    return (el.textContent || '').trim();
  };

  const controls = [...document.querySelectorAll(
    'button, a[href], [role="button"], [role="link"], [role="tab"], [role="menuitem"], summary'
  )].filter(visible);
  const unnamedControls = controls.filter((el) => !accessibleName(el)).map(describe);

  const images = [...document.querySelectorAll('img')].filter(visible);
  // A MISSING alt attribute is the fault; alt="" is the correct marking for decorative art.
  const imagesWithoutAlt = images.filter((el) => !el.hasAttribute('alt')).map(describe);

  const fields = [...document.querySelectorAll(
    'input:not([type="hidden"]), select, textarea'
  )].filter(visible);
  const unlabelledFields = fields.filter((el) => {
    if (accessibleName(el)) return false;
    if (el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]')) return false;
    if (el.closest('label')) return false;
    if ((el.getAttribute('placeholder') || '').trim()) return false;  // weak, but not nameless
    return true;
  }).map(describe);

  const positiveTabindex = [...document.querySelectorAll('[tabindex]')]
    .filter((el) => Number(el.getAttribute('tabindex')) > 0).map(describe);

  const seen = new Map();
  for (const el of document.querySelectorAll('[id]')) {
    seen.set(el.id, (seen.get(el.id) ?? 0) + 1);
  }
  const duplicateIds = [...seen.entries()].filter(([, n]) => n > 1).map(([id, n]) => id + ' x' + n);

  const lang = (document.documentElement.getAttribute('lang') || '').trim();

  return JSON.stringify({
    counted: { controls: controls.length, images: images.length, fields: fields.length,
               elements: document.querySelectorAll('*').length },
    unnamedControls, imagesWithoutAlt, unlabelledFields, positiveTabindex, duplicateIds,
    lang,
  });
})()`;

let child = null;

async function main() {
  if (!fs.existsSync(EXE)) throw new Error(`no packaged build at ${EXE}`);
  out.exeBuiltAt = fs.statSync(EXE).mtime.toISOString();
  fs.mkdirSync(workRoot, { recursive: true });

  const userDataDir = path.join(os.tmpdir(), `jp-a11y-${stamp}`);
  fs.mkdirSync(userDataDir, { recursive: true });
  const cdpPort = await freePort();

  child = spawn(EXE, [`--user-data-dir=${userDataDir}`, `--remote-debugging-port=${cdpPort}`],
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  child.stdout.resume();
  child.stderr.resume();

  const target = await findTarget(cdpPort, Date.now() + 180_000,
    (url) => url.startsWith('app://'), 'the packaged app window');
  const cdp = await new Cdp(target.webSocketDebuggerUrl).open();

  await (async () => {
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      const ok = await cdp.evaluate(
        "!!document.querySelector('.desktop-root') && document.readyState === 'complete'",
      ).catch(() => false);
      if (ok) return;
      await sleep(1000);
    }
    throw new Error('the desktop never mounted');
  })();
  step('0 the packaged desktop is up', 'PASS', target.url);

  // Surface 1: the first-launch consent gate, which every user meets before anything else and
  // which no later run can see again.
  out.surfaces.push({ name: 'first-launch consent gate', ...JSON.parse(await cdp.evaluate(AUDIT)) });

  await cdp.evaluate("(()=>{const b=document.querySelector('.consent-no');if(b){b.click();return 1;}return 0;})()");
  await sleep(2500);
  out.surfaces.push({ name: 'desktop shell', ...JSON.parse(await cdp.evaluate(AUDIT)) });

  // Surface 3: the media workspace, which is what this whole migration built.
  const opened = await cdp.evaluate(
    `(() => {
      const launcher = document.querySelector('.seanime-host-launcher');
      if (launcher) { launcher.click(); return 'launcher'; }
      return document.querySelector('.seanime-host') ? 'already-open' : 'not-found';
    })()`,
  ).catch(() => 'threw');
  if (opened === 'launcher' || opened === 'already-open') {
    await sleep(3000);
    out.surfaces.push({ name: 'media workspace', ...JSON.parse(await cdp.evaluate(AUDIT)) });
  }
  out.workspaceOpened = opened;

  /**
   * MORE SURFACES, because the first run's coverage made two checks vacuous.
   *
   * That run examined 80–102 elements per surface with **0 form fields and 0 images**, and
   * still reported a clean sweep — a PASS on `unlabelledFields` that had seen no field is not
   * a result. The desktop shell is icons and a taskbar; the form-heavy surfaces are the app
   * sections, opened here the way the command palette opens them (`os:open` with a section id,
   * `DesktopShell.tsx:1091`), which is the app's own route rather than a synthetic mount.
   *
   * Coverage is recorded per surface so a future clean sweep can be read against how much it
   * actually looked at.
   */
  for (const section of ['settings', 'dictionary', 'anki', 'library', 'reading', 'notebook']) {
    const shown = await cdp.evaluate(
      `(() => { window.dispatchEvent(new CustomEvent('os:open', { detail: ${JSON.stringify(section)} })); return 1; })()`,
    ).catch(() => 0);
    if (!shown) continue;
    await sleep(2200);
    const audited = JSON.parse(await cdp.evaluate(AUDIT).catch(() => 'null'));
    if (audited) out.surfaces.push({ name: `section:${section}`, ...audited });
  }

  // Union across surfaces — a fault is a fault wherever it was first seen, and counting per
  // surface would let one move between them unnoticed.
  const union = (key) => [...new Set(out.surfaces.flatMap((s) => s[key] ?? []))];
  const findings = {
    unnamedControls: union('unnamedControls'),
    imagesWithoutAlt: union('imagesWithoutAlt'),
    unlabelledFields: union('unlabelledFields'),
    positiveTabindex: union('positiveTabindex'),
    duplicateIds: union('duplicateIds'),
    missingLang: out.surfaces.some((s) => !s.lang) ? ['<html> has no lang'] : [],
  };
  out.findings = findings;
  out.counts = Object.fromEntries(Object.entries(findings).map(([k, v]) => [k, v.length]));

  const over = Object.entries(out.counts)
    .filter(([key, count]) => count > (CEILINGS[key] ?? 0))
    .map(([key, count]) => `${key}: ${count} > ceiling ${CEILINGS[key] ?? 0} — `
      + `${(findings[key] ?? []).slice(0, 8).join(', ')}${findings[key].length > 8 ? ' …' : ''}`);

  for (const [key, count] of Object.entries(out.counts)) {
    step(`1 ${key}`, count > (CEILINGS[key] ?? 0) ? 'FAIL' : 'PASS',
      `${count} (ceiling ${CEILINGS[key] ?? 0})`
      + (count ? ` — ${(findings[key] ?? []).slice(0, 6).join(', ')}` : ''));
  }

  out.verdict = over.length === 0 ? 'PASS' : 'FAIL';
  out.over = over;
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
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    }
    fs.mkdirSync(workRoot, { recursive: true });
    fs.writeFileSync(path.join(workRoot, 'packaged-a11y.json'), `${JSON.stringify(out, null, 2)}\n`);
    console.log(`\nrecord: ${path.join(workRoot, 'packaged-a11y.json')}`);
    process.exitCode = out.result === 'PASS' ? 0 : 1;
  });
