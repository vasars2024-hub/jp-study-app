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
  const prev = rows.length ? rows[rows.length - 1] : m;
  rows.push({ step, ...m, dPriv: Number((m.privMB - prev.privMB).toFixed(1)), dHandles: m.handles - prev.handles, ...extra });
  console.log(JSON.stringify(rows[rows.length - 1]));
}
async function clickExact(text, waitMs) {
  const r = await ev(`(function(){var w=document.querySelector('.fwin');var bs=[].slice.call(w.querySelectorAll('button')).filter(function(b){return (b.textContent||'').trim()===${JSON.stringify(text)}});if(!bs.length)return 'no-match';bs[0].click();return 'clicked 1 of '+bs.length})()`);
  await sleep(waitMs);
  return r;
}
(async () => {
  console.log('back to Automatic:', await clickExact('Automatic', 5000));
  mark('automatic');
  const plays = await ev(`(function(){var w=document.querySelector('.fwin');return JSON.stringify([].slice.call(w.querySelectorAll('button')).map(function(b){return (b.getAttribute('aria-label')||b.textContent||'').trim()}).filter(function(t){return /^Play /.test(t)}))})()`);
  console.log('play controls:', JSON.stringify(plays));
  for (let i = 0; i < plays.length; i += 1) {
    const r = await ev(`(function(){var w=document.querySelector('.fwin');var bs=[].slice.call(w.querySelectorAll('button')).filter(function(b){return /^Play /.test((b.getAttribute('aria-label')||b.textContent||'').trim())});var b=bs[${i}];if(!b)return 'gone';var lab=(b.getAttribute('aria-label')||b.textContent||'').trim();b.click();return 'clicked '+lab})()`);
    await sleep(4000);
    mark(`play[${i}]`, { click: r });
  }
  console.log('\nSUMMARY');
  rows.forEach((r) => console.log(`${String(r.step).padEnd(14)} priv ${String(r.privMB).padStart(9)} MB  (${r.dPriv >= 0 ? '+' : ''}${r.dPriv})  handles ${r.handles} (${r.dHandles >= 0 ? '+' : ''}${r.dHandles})  ${r.click || ''}`));
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
