/**
 * Undo `l7d-setup.cjs`'s window hiding, in one command.
 *
 * That probe sets an inline `style.display = 'none'` on every `.fwin` that is not the Dictionary,
 * so the instrument drives the scored surface and cannot type a search into a neighbouring window
 * (measured 2026-08-24: it typed into the hidden Media window and then refused with "0 dict entries
 * after a real search"). The hiding is inline style on live DOM nodes — nothing is persisted, and a
 * renderer reload clears it — but a turn that ends without reloading hands the next worker a desk
 * with three invisible windows and no obvious cause.
 *
 * Clearing the inline value rather than assigning 'block' matters: `.fwin`'s own rule supplies the
 * display mode, and hardcoding one here would change the layout of every window it touches.
 *
 * Run: node src/.coordination/liquid-workplace/probes/l7d-restore.cjs
 */
'use strict';
const fs = require('node:fs');

const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));

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

(async () => {
  const out = await ev(`(() => {
    const wins = [...document.querySelectorAll('.fwin')];
    const cleared = [];
    for (const w of wins) {
      if (w.style.display === 'none') {
        w.style.removeProperty('display');
        const t = w.querySelector('.fwin-title-text, .fwin-title');
        cleared.push((t ? t.textContent : '').trim().slice(0, 24));
      }
    }
    return JSON.stringify({
      cleared,
      // Report the resulting desk, so "restored" is a measurement and not a claim.
      desk: wins.map((w) => {
        const t = w.querySelector('.fwin-title-text, .fwin-title');
        const r = w.getBoundingClientRect();
        return {
          title: (t ? t.textContent : '').trim().slice(0, 24),
          box: Math.round(r.width) + 'x' + Math.round(r.height),
          presentation: w.getAttribute('data-presentation'),
        };
      }),
    });
  })()`);
  console.log(JSON.stringify(out, null, 1));
  const stillHidden = out.desk.filter((w) => w.box === '0x0');
  if (stillHidden.length) {
    console.error(`STILL 0x0 after clearing display: ${JSON.stringify(stillHidden)}`);
    process.exit(1);
  }
})().catch((e) => {
  console.error('RESTORE FAILED', e.message);
  process.exit(1);
});
