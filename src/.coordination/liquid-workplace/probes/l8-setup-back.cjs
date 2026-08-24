/**
 * The re-measurement for the `AnkiSetup` reversibility fix, driven against the same refused port.
 *
 * The rubric forbids carrying a score across a fix, so this is the after-run, not an argument that
 * the before-run's defect is gone. It asserts the round trip the defect denied: results -> setup
 * panel -> Back -> THE SAME RESULTS, with no re-query. `entriesAfterBack` has to equal
 * `entriesBefore`; a fix that merely re-ran the lookup would also show 8 and would not be one.
 *
 * Run: node src/.coordination/liquid-workplace/probes/l8-setup-back.cjs
 */
'use strict';
const fs = require('node:fs');
const net = require('node:net');

const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TERM = String.fromCharCode(0x98df, 0x3079, 0x308b); // 食べる

async function ev(js) {
  const r = await fetch(`http://127.0.0.1:${cfg.port}/eval`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ js }),
  });
  const t = await r.json();
  if (!t.ok) throw new Error(`eval failed: ${JSON.stringify(t).slice(0, 300)}`);
  try {
    return JSON.parse(t.result);
  } catch {
    return t.result;
  }
}

function tcpProbe(port, host = '127.0.0.1', timeoutMs = 2000) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    const done = (v, d) => {
      sock.destroy();
      resolve({ verdict: v, detail: d });
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => done('LISTENING', 'connect succeeded'));
    sock.once('timeout', () => done('TIMEOUT', String(timeoutMs)));
    sock.once('error', (e) => done('REFUSED', e.code || e.message));
    sock.connect(port, host);
  });
}

const READ = `(() => {
  const win = document.querySelector('.fwin');
  if (!win) return JSON.stringify({ refuse: 'no .fwin' });
  return JSON.stringify({
    entries: win.querySelectorAll('.dict-entry').length,
    chars: (win.textContent || '').length,
    setup: [...win.querySelectorAll('.anki-setup-msg')].map((e) => (e.textContent || '').trim()),
    buttons: [...win.querySelectorAll('.anki-setup-actions button')].map((b) => (b.textContent || '').trim()),
  });
})()`;

async function search(term) {
  await ev(`(() => {
    const win = document.querySelector('.fwin');
    const input = [...win.querySelectorAll('input[type=text]')].find((i) => (i.placeholder || '').length > 8);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(term)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return 'set';
  })()`);
  await sleep(120);
  await ev(`(() => {
    const win = document.querySelector('.fwin');
    [...win.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Search').click();
    return 'clicked';
  })()`);
  await sleep(1800);
}

(async () => {
  const out = { at: new Date().toISOString(), induction: await tcpProbe(8765) };

  await search(TERM);
  const before = await ev(READ);
  out.entriesBefore = before.entries;
  out.charsBefore = before.chars;

  await ev(`(() => { document.querySelector('.fwin .dict-add').click(); return 'clicked'; })()`);
  await sleep(3000);
  const panel = await ev(READ);
  out.panel = { msg: panel.setup, buttons: panel.buttons, entries: panel.entries };
  out.backButtonPresent = panel.buttons.some((b) => /back/i.test(b));

  if (out.backButtonPresent) {
    const idx = panel.buttons.findIndex((b) => /back/i.test(b));
    await ev(`(() => {
      [...document.querySelectorAll('.fwin .anki-setup-actions button')][${idx}].click();
      return 'back';
    })()`);
    await sleep(900);
    const after = await ev(READ);
    out.entriesAfterBack = after.entries;
    out.charsAfterBack = after.chars;
    out.roundTripExact = after.entries === before.entries && after.chars === before.chars;
    out.stillOnPanel = after.setup.length > 0;
  }

  console.log(JSON.stringify(out, null, 1));
})().catch((e) => {
  console.error('PROBE FAILED', e.message);
  process.exit(1);
});
