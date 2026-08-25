/**
 * Put the Video window into the LOADED state leg 2 has to be scored on.
 *
 * A restored media window comes back at 18 characters and 0 cards, and the rubric caps a
 * category measured on an empty harness at 0. This clicks Library, then the `Recently added`
 * shelf, and REFUSES with a count rather than reporting success if the shelf is still empty.
 *
 * Run: node src/.coordination/liquid-workplace/probes/l7v-load.cjs [--title Video]
 */
'use strict';
const fs = require('node:fs');

const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const idx = process.argv.indexOf('--title');
const TITLE = (idx >= 0 ? process.argv[idx + 1] : '') || 'Video';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const H = { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' };
const post = async (route, body) => (await fetch(`http://127.0.0.1:${cfg.port}${route}`, {
  method: 'POST', headers: H, body: JSON.stringify(body || {}),
})).json();
async function ev(js) {
  const t = await post('/eval', { js: js.replace(/\s*;\s*$/, '').trimEnd() });
  if (!t.ok) throw new Error(`eval failed: ${JSON.stringify(t).slice(0, 300)}`);
  return t.result;
}

const WIN = `([].slice.call(document.querySelectorAll('.fwin')).filter(function(w){
  var r = w.getBoundingClientRect();
  if (!(r.width > 0 && r.height > 0)) return false;
  var t = w.querySelector('.fwin-title-text, .fwin-title');
  return !!t && (t.textContent || '').indexOf(${JSON.stringify(TITLE)}) >= 0;
})[0])`;

const click = (sel, prefix) => `(function(){
  var w = ${WIN};
  if (!w) return JSON.stringify({ refuse: 'no window' });
  var t = [].slice.call(w.querySelectorAll(${JSON.stringify(sel)})).filter(function(el){
    var r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0 && el.checkVisibility({contentVisibilityAuto:true}))) return false;
    var n = (el.getAttribute('aria-label') || el.textContent || '').replace(/\\s+/g,' ').trim();
    return n.indexOf(${JSON.stringify(prefix)}) === 0;
  })[0];
  if (!t) return JSON.stringify({ clicked: false, why: ${JSON.stringify(prefix)} });
  t.click();
  return JSON.stringify({ clicked: true });
})()`;

const surface = `(function(){
  var w = ${WIN};
  if (!w) return JSON.stringify({ refuse: 'no window' });
  return JSON.stringify({
    shelf: (w.querySelector('.medialib-rail [aria-current="true"]') || {}).textContent || null,
    cards: w.querySelectorAll('.medialib-card').length,
    controls: w.querySelectorAll('button,a[href],[role="button"],[role="tab"]').length,
    nodes: w.querySelectorAll('*').length,
    chars: (w.textContent || '').replace(/\\s+/g, ' ').trim().length,
  });
})()`;

(async () => {
  await post('/focus', {});
  await sleep(400);
  console.log('library   ', await ev(click('.mc-sidebar button,nav button', 'Library')));
  await sleep(900);
  console.log('shelf     ', await ev(click('.medialib-rail button,.medialib-rail [role="button"]', 'Recently added')));
  await sleep(900);
  const s = JSON.parse(await ev(surface));
  console.log('surface   ', JSON.stringify(s));
  if (!s.cards) throw new Error(`REFUSE - ${s.cards} cards; an empty harness caps this category at 0`);
})().catch((e) => { console.error(String(e && e.stack ? e.stack : e)); process.exit(1); });
