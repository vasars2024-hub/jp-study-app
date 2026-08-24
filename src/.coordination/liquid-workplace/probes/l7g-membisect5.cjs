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
const toggle = `(function(){var w=document.querySelector('.fwin');var b=w.querySelector('.fwin-b-liquid');if(!b)return 'no-liquid-button';var before=w.getAttribute('data-presentation');b.click();return 'clicked from '+before})()`;
(async () => {
  mark('baseline');
  for (let i = 1; i <= 6; i += 1) {
    console.log(`toggle ${i}:`, await ev(toggle));
    await sleep(2500);
    mark(`toggle${i}`, { presentation: await ev(`document.querySelector('.fwin').getAttribute('data-presentation')`) });
  }
  console.log('\nSUMMARY');
  rows.forEach((r) => console.log(`${String(r.step).padEnd(12)} priv ${String(r.privMB).padStart(9)} MB  (${r.dPriv >= 0 ? '+' : ''}${r.dPriv})  handles ${r.handles} (${r.dHandles >= 0 ? '+' : ''}${r.dHandles})  ${r.presentation || ''}`));
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
