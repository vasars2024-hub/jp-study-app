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
const askLab = `(function(){var w=document.querySelector('.fwin');var b=w.querySelector('.lexicon-explain-ask');return JSON.stringify({ask:b?(b.textContent||'').trim():null,answer:(w.querySelector('.lexicon-explain-summary')||{}).textContent?(w.querySelector('.lexicon-explain-summary').textContent||'').trim().length:0})})()`;
(async () => {
  mark('before');
  // fixture word: a first explain is a pure create, undone by Forget afterwards
  await ev(`(function(){var w=document.querySelector('.fwin');var i=w.querySelector('input[type="text"], input:not([type]), input[type="search"]');var s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(i, String.fromCharCode(0x732b));i.dispatchEvent(new Event('input',{bubbles:true}));return i.value})()`);
  await sleep(500);
  await ev(`(function(){var w=document.querySelector('.fwin');var b=[].slice.call(w.querySelectorAll('button')).filter(function(x){return /^Search/.test((x.textContent||'').trim())})[0];b.click();return 'clicked'})()`);
  await sleep(4000);
  mark('searched-fixture');
  await ev(`(function(){var w=document.querySelector('.fwin');var d=w.querySelector('details.lexicon-explain-entry');if(d)d.open=true;return d?'opened':'none'})()`);
  await sleep(1500);
  console.log('panel:', await ev(askLab));
  console.log('click ask:', await ev(`(function(){var b=document.querySelector('.fwin .lexicon-explain-ask');if(!b)return 'none';b.click();return 'clicked'})()`));
  for (let i = 0; i < 12; i += 1) {
    await sleep(2500);
    const s = await ev(askLab);
    mark(`ask+${(i + 1) * 2.5}s`, { panel: s });
    if (s.ask === 'Explain again' && s.answer > 0) break;
  }
  await sleep(3000);
  mark('after-settle');
  console.log('forget:', await ev(`(function(){var b=document.querySelector('.fwin .lexicon-explain-forget');if(!b)return 'none';b.click();return 'clicked'})()`));
  await sleep(2500);
  mark('after-forget', { panel: await ev(askLab) });
  console.log('\nSUMMARY');
  rows.forEach((r) => console.log(`${String(r.step).padEnd(18)} priv ${String(r.privMB).padStart(9)} MB  (${r.dPriv >= 0 ? '+' : ''}${r.dPriv})  handles ${r.handles} (${r.dHandles >= 0 ? '+' : ''}${r.dHandles})`));
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
