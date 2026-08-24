'use strict';
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function ev(js) {
  const r = await fetch(`http://127.0.0.1:${cfg.port}/eval`, {
    method: 'POST', headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ js }),
  });
  const t = await r.json();
  if (!t.ok) throw new Error('eval failed: ' + JSON.stringify(t).slice(0, 200));
  try { return JSON.parse(t.result); } catch { return t.result; }
}
function mem() {
  const out = execFileSync('powershell', ['-NoProfile', '-Command',
    `$p=Get-Process -Id ${cfg.pid}; $p.Refresh(); '{0}|{1}' -f [math]::Round($p.PrivateMemorySize64/1MB,1), $p.HandleCount`,
  ], { encoding: 'utf8' }).trim().split('|');
  return { privMB: Number(out[0]), handles: Number(out[1]) };
}
const rows = [];
function mark(step, extra) {
  const m = mem();
  const prev = rows.length ? rows[rows.length - 1].privMB : m.privMB;
  const dH = rows.length ? m.handles - rows[rows.length - 1].handles : 0;
  rows.push({ step, ...m, dPriv: Number((m.privMB - prev).toFixed(1)), dHandles: dH, ...extra });
  console.log(JSON.stringify(rows[rows.length - 1]));
}
async function clickExact(text, waitMs) {
  const r = await ev(`(function(){var w=document.querySelector('.fwin');var bs=[].slice.call(w.querySelectorAll('button')).filter(function(b){return (b.textContent||'').trim()===${JSON.stringify(text)}});if(!bs.length)return 'no-match';bs[0].click();return 'clicked 1 of '+bs.length})()`);
  await sleep(waitMs);
  return r;
}
const SECTIONS = `(function(){var w=document.querySelector('.fwin');return JSON.stringify([].slice.call(w.querySelectorAll('details')).map(function(d){return {cls:d.className,open:d.open,buttons:[].slice.call(d.querySelectorAll('button')).map(function(b){return (b.textContent||'').trim().slice(0,32)})}}))})()`;
(async () => {
  mark('before-mode-switch');
  console.log('mode ->', await clickExact(process.argv[2] || 'Interlinear', 6000));
  mark('mode-switched');
  const secs = await ev(SECTIONS);
  console.log('sections:', JSON.stringify(secs));
  // open every details, then click the first button of each in turn
  await ev(`(function(){var w=document.querySelector('.fwin');[].slice.call(w.querySelectorAll('details')).forEach(function(d){d.open=true});return 'opened'})()`);
  await sleep(2500);
  mark('details-opened');
  const secs2 = await ev(SECTIONS);
  for (const s of secs2) {
    if (!s.buttons.length) continue;
    const label = s.buttons[0];
    if (/^(☆|Save|Forget|Copy|Add)/.test(label)) { console.log('skip destructive:', s.cls, label); continue; }
    console.log('->', s.cls, label, await clickExact(label, 12000));
    mark(`${s.cls}:${label}`);
  }
  console.log('\nSUMMARY');
  rows.forEach((r) => console.log(`${String(r.step).padEnd(44)} priv ${String(r.privMB).padStart(9)} MB  (${r.dPriv >= 0 ? '+' : ''}${r.dPriv})  handles ${r.handles} (${r.dHandles >= 0 ? '+' : ''}${r.dHandles})`));
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
