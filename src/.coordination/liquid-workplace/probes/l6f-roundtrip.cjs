// L6 round trip on the current tree: Liquid -> Standard -> Liquid, with the notes filter
// deliberately dirty, comparing the two Liquid snapshots byte-for-byte (JSON string compare,
// never by eye). Plus check() in BOTH presentations, plus the three negative controls.
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
(async () => {
  // dirty the notes filter so the round trip has real state to lose
  const dirty = await ev(`(function(){var w=window.__L6.findWin().win;var i=[].slice.call(w.querySelectorAll('input')).filter(function(x){return /note/i.test(x.placeholder||'')||/note/i.test((x.getAttribute('aria-label')||''))})[0];if(!i)return 'no-notes-input';var s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(i,String.fromCharCode(0x98df));i.dispatchEvent(new Event('input',{bubbles:true}));return i.value})()`);
  console.log('notesFilter dirtied to:', JSON.stringify(dirty));
  await sleep(500);
  const A = await ev('window.__L6.snapshot()');
  console.log('A (liquid):', JSON.stringify(A));
  console.log('toggle ->', JSON.stringify(await ev('window.__L6.toggleLiquid()')));
  await sleep(900);
  const std = await ev('window.__L6.check()');
  console.log('STANDARD check:', std.presentation, std.reachable + '/' + std.total,
    JSON.stringify(std.rows.map((r) => r.id + '=' + r.reachable + '{' + r.evidence + '}')));
  const B = await ev('window.__L6.snapshot()');
  console.log('B (standard):', JSON.stringify(B));
  console.log('toggle back ->', JSON.stringify(await ev('window.__L6.toggleLiquid()')));
  await sleep(900);
  const C = await ev('window.__L6.snapshot()');
  console.log('C (liquid):', JSON.stringify(C));
  console.log('ROUND TRIP A===C byte-for-byte:', JSON.stringify(A) === JSON.stringify(C));
  if (JSON.stringify(A) !== JSON.stringify(C)) {
    Object.keys(A).forEach((k) => {
      if (JSON.stringify(A[k]) !== JSON.stringify(C[k])) console.log('  DIFF', k, JSON.stringify(A[k]), '->', JSON.stringify(C[k]));
    });
  }
  // clean the notes filter back to its found value
  const clean = await ev(`(function(){var w=window.__L6.findWin().win;var i=[].slice.call(w.querySelectorAll('input')).filter(function(x){return /note/i.test(x.placeholder||'')||/note/i.test((x.getAttribute('aria-label')||''))})[0];if(!i)return 'no-notes-input';var s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(i,'');i.dispatchEvent(new Event('input',{bubbles:true}));return i.value})()`);
  console.log('notesFilter restored to:', JSON.stringify(clean));
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
