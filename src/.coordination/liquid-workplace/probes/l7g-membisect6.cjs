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
  const o = execFileSync('powershell', ['-NoProfile', '-Command',
    `$p=Get-Process -Id ${cfg.pid}; $p.Refresh(); '{0}|{1}' -f [math]::Round($p.PrivateMemorySize64/1MB,1), $p.HandleCount`,
  ], { encoding: 'utf8' }).trim().split('|');
  return { privMB: Number(o[0]), handles: Number(o[1]) };
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
  // settle: the renderer remounts shortly after boot and drops a value typed too early
  await sleep(6000);
  await ev(`(function(){var w=document.querySelector('.fwin');var i=w.querySelector('input[type="text"], input:not([type]), input[type="search"]');var s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(i, String.fromCharCode(0x98df,0x3079,0x308b));i.dispatchEvent(new Event('input',{bubbles:true}));return i.value})()`);
  await sleep(600);
  await clickExact('Search', 4000);
  mark('searched', { entries: await ev(`document.querySelector('.fwin').querySelectorAll('.dict-entry').length`) });
  console.log('summary Example sentences:', await ev(`(function(){var w=document.querySelector('.fwin');var s=[].slice.call(w.querySelectorAll('summary')).filter(function(x){return /Example sentences/.test((x.textContent||'').trim())})[0];if(!s)return 'no-summary';s.click();return 'clicked'})()`));
  await sleep(6000);
  mark('summary:Example sentences');
  console.log('Dictionary lens:', await clickExact('Dictionary', 12000));
  mark('lens:Dictionary', { entries: await ev(`document.querySelector('.fwin').querySelectorAll('.dict-entry').length`) });
  console.log('Automatic lens:', await clickExact('Automatic', 8000));
  mark('lens:Automatic');
  console.log('\nSUMMARY');
  rows.forEach((r) => console.log(`${String(r.step).padEnd(26)} priv ${String(r.privMB).padStart(9)} MB  (${r.dPriv >= 0 ? '+' : ''}${r.dPriv})  handles ${r.handles} (${r.dHandles >= 0 ? '+' : ''}${r.dHandles})`));
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
