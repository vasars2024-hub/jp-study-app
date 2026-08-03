#!/usr/bin/env node
// One question, measured instead of guessed: WHAT PAINTS THE BORDER of the two aero inputs that
// still fail WCAG 1.4.11?
//
// The pixel sampler reports them at 2.03:1 and 2.12:1, painting rgb(117,174,201) — a blue. That
// colour is NOT derivable from the source:
//   * neither aero rule sets a border at all (aero-apps.css:2461 and :2635 set only
//     min-height / padding / border-radius / background),
//   * the base rules use `border: 1px solid var(--border)`, and the --control-edge rule in
//     styles.css repoints --border on inputs to #767380 = rgb(118,115,128),
//   * the CSS-colour path cannot help, because on aero it scores 8 of 251 controls.
//
// Two attempts to derive the composite by hand were wrong, so this reads the runtime instead.
// It reports the whole cascade-visible surface — border, outline, box-shadow, and the same
// values on the ::before/::after pseudo-elements — because the last four findings on this track
// were all "the thing that paints is not the thing the source declares".
//
// usage: node docs/migration/tools/probe-aero-input-border.mjs
//        node docs/migration/tools/probe-aero-input-border.mjs --theme=<id>

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
const EXE = path.resolve(arg('exe')
  || path.join(REPO, 'out', 'jp-study-app-win32-x64', 'jp-study-app.exe'));
const THEME = arg('theme', 'frutiger-aero');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function findTarget(port, deadline) {
  let seen = [];
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await res.json();
      seen = targets.filter((t) => t.type === 'page').map((t) => t.url);
      const page = targets.find((t) => t.type === 'page' && t.url.startsWith('app://'));
      if (page?.webSocketDebuggerUrl) return page;
    } catch { /* not up yet */ }
    await sleep(400);
  }
  throw new Error(`no app:// CDP target; saw ${JSON.stringify(seen)}`);
}

class Cdp {
  constructor(url) { this.url = url; this.nextId = 1; this.pending = new Map(); }
  async open() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener('message', (event) => {
      let msg; try { msg = JSON.parse(String(event.data)); } catch { return; }
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
  close() { try { this.socket.close(); } catch { /* already gone */ } }
}

const userDataDir = path.join(os.tmpdir(), `jp-aero-probe-${Date.now()}-${process.pid}`);
fs.mkdirSync(userDataDir, { recursive: true });

let child = null;
try {
  const cdpPort = await freePort();
  const env = { ...process.env, SEANIME_DATADIR: path.join(userDataDir, 'seanime-scratch') };
  child = spawn(EXE, [`--user-data-dir=${userDataDir}`, `--remote-debugging-port=${cdpPort}`],
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env });
  child.stdout.resume();
  child.stderr.resume();

  const target = await findTarget(cdpPort, Date.now() + 180_000);
  const cdp = await new Cdp(target.webSocketDebuggerUrl).open();
  await cdp.send('Page.enable', {});

  const ready = async () => {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const ok = await cdp.evaluate(
        "!!document.querySelector('.desktop-root') && document.readyState === 'complete'",
      ).catch(() => false);
      if (ok) return;
      await sleep(1000);
    }
    throw new Error('the desktop never mounted');
  };
  await ready();

  // The theme is read ONCE at boot (theme/engine.ts:107), so it must be set and the page reloaded.
  await cdp.evaluate(`(() => { localStorage.setItem('jp-os-theme', ${JSON.stringify(THEME)}); return 1; })()`);
  await cdp.evaluate('(() => { location.reload(); return 1; })()').catch(() => 0);
  await sleep(2500);
  await ready();
  const applied = await cdp.evaluate("document.documentElement.getAttribute('data-materials')");
  console.log(`theme applied: data-materials=${applied} (requested ${THEME})`);
  if (!applied) throw new Error('the theme did not apply; every value below would be a different palette');

  // Open the two surfaces the failures were measured on.
  for (const section of ['settings', 'dictionary']) {
    await cdp.evaluate(
      `(() => { window.dispatchEvent(new CustomEvent('os:open', { detail: ${JSON.stringify(section)} })); return 1; })()`,
    ).catch(() => 0);
    await sleep(2600);

    const report = await cdp.evaluate(`JSON.stringify((() => {
      const sels = ['input.os-set-search-input', 'form.dict-search input', '.dict-view input'];
      const out = [];
      for (const sel of sels) {
        for (const el of document.querySelectorAll(sel)) {
          const s = getComputedStyle(el);
          const b = getComputedStyle(el, '::before');
          const a = getComputedStyle(el, '::after');
          out.push({
            sel: sel,
            cls: el.className || '(no class)',
            focused: document.activeElement === el,
            borderColors: [s.borderTopColor, s.borderRightColor, s.borderBottomColor, s.borderLeftColor],
            borderWidths: s.borderWidth,
            borderStyles: s.borderStyle,
            outline: s.outline,
            outlineColor: s.outlineColor,
            boxShadow: String(s.boxShadow).slice(0, 200),
            background: String(s.backgroundColor),
            backgroundImage: String(s.backgroundImage).slice(0, 120),
            varBorder: s.getPropertyValue('--border').trim(),
            varControlEdge: s.getPropertyValue('--control-edge').trim(),
            beforeContent: b.content, beforeBg: b.backgroundColor,
            afterContent: a.content, afterBg: a.backgroundColor,
          });
        }
      }
      return { section: document.documentElement.getAttribute('data-materials'), found: out.length, out };
    })())`).catch((e) => JSON.stringify({ error: String(e && e.message || e).slice(0, 160) }));

    console.log(`\n=== section: ${section} ===`);
    const parsed = JSON.parse(report);
    if (parsed.error) { console.log('  probe threw:', parsed.error); continue; }
    if (!parsed.found) { console.log('  no matching input on screen'); continue; }
    for (const r of parsed.out) {
      console.log(`  ${r.sel}  cls=${r.cls}  focused=${r.focused}`);
      console.log(`     borderColors : ${r.borderColors.join(' | ')}`);
      console.log(`     widths/styles: ${r.borderWidths} / ${r.borderStyles}`);
      console.log(`     --border=${r.varBorder || '(unset)'}   --control-edge=${r.varControlEdge || '(unset)'}`);
      console.log(`     outline      : ${r.outline}  (${r.outlineColor})`);
      console.log(`     boxShadow    : ${r.boxShadow}`);
      console.log(`     background   : ${r.background}   image: ${r.backgroundImage}`);
      console.log(`     ::before     : content=${r.beforeContent} bg=${r.beforeBg}`);
      console.log(`     ::after      : content=${r.afterContent} bg=${r.afterBg}`);
    }
  }
  cdp.close();
} finally {
  if (child && !child.killed) { try { child.kill(); } catch { /* already gone */ } }
}
