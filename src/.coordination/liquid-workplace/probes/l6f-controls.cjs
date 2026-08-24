// The three L6 negative controls on the current tree: each must flip exactly its own row
// (7 -> 6) and nothing else, then restore to 7.
'use strict';
const fs = require('node:fs');
const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function ev(expr) {
  const js = `(()=>{try{return JSON.stringify(${expr});}catch(e){return 'THREW: '+e.message;}})()`;
  const r = await fetch(`http://127.0.0.1:${cfg.port}/eval`, {
    method: 'POST', headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ js }),
  });
  const t = await r.json();
  if (!t.ok) throw new Error('eval failed: ' + JSON.stringify(t).slice(0, 200));
  return JSON.parse(t.result);
}
const fails = (c) => c.rows.filter((r) => !r.reachable).map((r) => r.id + ' (' + r.evidence + ')');
(async () => {
  const base = await ev('window.__L6.check()');
  console.log('baseline:', base.reachable + '/' + base.total);
  for (const which of ['notesFilter', 'sourceSwitch', 'windowLifecycle']) {
    console.log('--', which, JSON.stringify(await ev(`window.__L6.mutate(${JSON.stringify(which)})`)));
    await sleep(300);
    const c = await ev('window.__L6.check()');
    console.log('   live:', c.reachable + '/' + c.total, 'failing rows:', JSON.stringify(fails(c)),
      '| exactly one row flipped:', c.reachable === base.total - 1 && fails(c).length === 1 && fails(c)[0].startsWith(which));
    console.log('   restore:', JSON.stringify(await ev('window.__L6.restore()')));
    await sleep(300);
    const back = await ev('window.__L6.check()');
    console.log('   after restore:', back.reachable + '/' + back.total);
  }
  const ledger = JSON.parse(fs.readFileSync('src/.coordination/liquid-workplace/parity-ledger.json', 'utf8'));
  const rows = (ledger.rows || ledger).filter ? (ledger.rows || ledger) : [];
  const dict = rows.filter((r) => r.app === 'dictionary');
  console.log('LEDGER dictionary rows:', dict.length,
    '| both:', dict.filter((r) => r.status === 'both').length,
    '| with non-empty observed:', dict.filter((r) => r.observed && String(r.observed).trim()).length);
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
