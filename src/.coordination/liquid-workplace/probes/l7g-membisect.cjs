// Bisect the ~6.5 GB main-process retention seen on two consecutive boots: click ONE Dictionary
// control at a time and sample main's private bytes between clicks. Node reads the counters via
// PowerShell so the click and the sample are in one ordered script.
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
    `$p=Get-Process -Id ${cfg.pid}; $p.Refresh(); '{0}|{1}|{2}' -f [math]::Round($p.PrivateMemorySize64/1MB,1), $p.HandleCount, [math]::Round($p.WorkingSet64/1MB,1)`,
  ], { encoding: 'utf8' }).trim().split('|');
  return { privMB: Number(out[0]), handles: Number(out[1]), rssMB: Number(out[2]) };
}
const STAT = `(function(){var w=document.querySelector('.fwin');return JSON.stringify({chars:(w.textContent||'').length,nodes:w.querySelectorAll('*').length,entries:w.querySelectorAll('.dict-entry').length})})()`;
const rows = [];
function mark(step, extra) {
  const m = mem();
  const prev = rows.length ? rows[rows.length - 1].privMB : m.privMB;
  rows.push({ step, ...m, dPriv: Number((m.privMB - prev).toFixed(1)), ...extra });
  console.log(JSON.stringify(rows[rows.length - 1]));
}
async function click(pat, waitMs) {
  const r = await ev(`(function(){var w=document.querySelector('.fwin');var re=new RegExp(${JSON.stringify(pat)});var bs=[].slice.call(w.querySelectorAll('button')).filter(function(b){return re.test((b.textContent||'').trim())});if(!bs.length)return 'no-match';bs[0].click();return 'clicked 1 of '+bs.length})()`);
  await sleep(waitMs);
  return r;
}
(async () => {
  mark('boot-idle');
  // real search through the product's own box
  await ev(`(function(){var w=document.querySelector('.fwin');var i=w.querySelector('input[type="text"], input:not([type]), input[type="search"]');var s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(i, String.fromCharCode(0x98df,0x3079,0x308b));i.dispatchEvent(new Event('input',{bubbles:true}));return i.value})()`);
  await sleep(500);
  await click('^Search', 3500);
  mark('search', { stat: await ev(STAT) });
  for (const pat of ['^Find containing words', '^Find phrases', '^Find example sentences', '^Find shared senses']) {
    const r = await click(pat, 9000);
    mark(pat.slice(1), { click: r, stat: await ev(STAT) });
  }
  console.log('\nSUMMARY');
  rows.forEach((r) => console.log(`${String(r.step).padEnd(24)} priv ${String(r.privMB).padStart(8)} MB  (${r.dPriv >= 0 ? '+' : ''}${r.dPriv})  handles ${r.handles}`));
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
