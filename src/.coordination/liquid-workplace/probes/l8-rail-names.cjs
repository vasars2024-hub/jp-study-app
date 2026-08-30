/**
 * One-shot falsification for the Settings icon rail, category 1's half of the category-4 fix.
 *
 * NOT a new rubric probe (RULE 1): the eight parameterised category harnesses all score at a
 * surface's DEFAULT size, and the narrow tier this checks only exists below 420px of
 * `.os-set-body`. The claim under test is exactly one line of CSS — that clipping
 * `.os-set-nav-item > span` to 1x1 keeps every category button's accessible name, where
 * `display: none` (what `.scr-rail-label` does) would delete it. That claim cannot be
 * falsified by cat1 because cat1 never resizes.
 *
 * It resizes the Settings `.fwin` to the same 260x170 the category-4 harness uses, reads each
 * nav button's accessible name the way an AT would compute it (aria-label, else aria-labelledby,
 * else the subtree text of nodes that are not display:none/visibility:hidden), and restores the
 * inline style byte-for-byte. The negative control forces `display: none` on the same spans and
 * requires the names to DISAPPEAR — without it a run that never entered the narrow tier would
 * report all names present and read as a pass.
 *
 * Run: node src/.coordination/liquid-workplace/probes/l8-rail-names.cjs
 */
const fs = require('fs');
const path = require('path');

const cfg = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'debug', 'bridge.json'), 'utf8'),
);
const BASE = `http://127.0.0.1:${cfg.port}`;

async function evalJs(js) {
  const r = await fetch(`${BASE}/eval`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ js, window: 'main' }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`eval failed: ${JSON.stringify(j).slice(0, 400)}`);
  return j.result === undefined ? j.value : j.result;
}

const settle = (ms) => new Promise((res) => setTimeout(res, ms));

// Accessible-name computation, deliberately narrow: this rail uses neither aria-label nor
// aria-labelledby today, so the interesting branch is the subtree text, and the whole point is
// that `display: none` / `visibility: hidden` remove a node from that computation while a 1x1
// clip does not.
const READ = `(function(){
  var win=[].slice.call(document.querySelectorAll('.fwin')).filter(function(f){
    return f.querySelector('.os-set-nav-v2');
  })[0];
  if(!win) return {refuse:'no .fwin hosts .os-set-nav-v2'};
  var rail=win.querySelector('.os-set-nav-v2');
  var name=function(el){
    if(el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
    var lb=el.getAttribute('aria-labelledby');
    if(lb){ var t=document.getElementById(lb); if(t) return (t.textContent||'').trim(); }
    var out='';
    var walk=function(n){
      if(n.nodeType===3){ out+=n.textContent; return; }
      if(n.nodeType!==1) return;
      var cs=getComputedStyle(n);
      if(cs.display==='none'||cs.visibility==='hidden') return;
      if(n.getAttribute('aria-hidden')==='true') return;
      for(var i=0;i<n.childNodes.length;i+=1) walk(n.childNodes[i]);
    };
    for(var i=0;i<el.childNodes.length;i+=1) walk(el.childNodes[i]);
    return out.replace(/\\s+/g,' ').trim();
  };
  var items=[].slice.call(rail.querySelectorAll('.os-set-nav-item'));
  var adv=rail.querySelector('.os-set-advanced-btn');
  if(adv) items.push(adv);
  var rows=items.map(function(b){
    var r=b.getBoundingClientRect();
    return {cls:b.className.split(' ')[0], name:name(b), w:Math.round(r.width), h:Math.round(r.height),
            title:b.getAttribute('title')||null};
  });
  var railBox=rail.getBoundingClientRect();
  var pane=win.querySelector('.os-set-pane-v2');
  var pb=pane?pane.getBoundingClientRect():null;
  return {
    fwin: Math.round(win.getBoundingClientRect().width)+'x'+Math.round(win.getBoundingClientRect().height),
    railWidth: Math.round(railBox.width),
    paneWidth: pb?Math.round(pb.width):null,
    paneClientWidth: pane?pane.clientWidth:null,
    paneScrollWidth: pane?pane.scrollWidth:null,
    total: rows.length,
    named: rows.filter(function(r){return r.name.length>0}).length,
    unnamed: rows.filter(function(r){return r.name.length===0}).map(function(r){return r.cls}),
    titled: rows.filter(function(r){return r.title}).length,
    sample: rows.slice(0,4)
  };
})()`;

(async () => {
  const found = await evalJs(`(function(){
    var w=[].slice.call(document.querySelectorAll('.fwin')).filter(function(f){
      return f.querySelector('.os-set-nav-v2');
    })[0];
    if(!w) return {refuse:'no .fwin hosts .os-set-nav-v2'};
    window.__l8RailSave = w.getAttribute('style')||'';
    return {saved: window.__l8RailSave};
  })()`);
  if (found.refuse) throw new Error(`REFUSED: ${found.refuse}`);

  const wide = await evalJs(READ);

  await evalJs(`(function(){
    var w=[].slice.call(document.querySelectorAll('.fwin')).filter(function(f){
      return f.querySelector('.os-set-nav-v2');
    })[0];
    w.style.width='260px'; w.style.height='170px';
    return w.getBoundingClientRect().width;
  })()`);
  await settle(400);
  const narrow = await evalJs(READ);

  // Negative control: the alternative implementation, forced. `display: none` on the same spans
  // is what the Scraper rail does, and the names must collapse to prove this reader can see the
  // difference at all.
  await evalJs(`(function(){
    var s=document.createElement('style');
    s.id='l8-rail-control';
    s.textContent='.os-set-nav-v2 .os-set-nav-item > span:not([class]),.os-set-nav-v2 .os-set-advanced-label{display:none !important}';
    document.head.appendChild(s);
    return true;
  })()`);
  await settle(300);
  const control = await evalJs(READ);

  await evalJs(`(function(){
    var s=document.getElementById('l8-rail-control');
    if(s) s.remove();
    return !document.getElementById('l8-rail-control');
  })()`);
  await settle(300);
  const afterControl = await evalJs(READ);

  const restored = await evalJs(`(function(){
    var w=[].slice.call(document.querySelectorAll('.fwin')).filter(function(f){
      return f.querySelector('.os-set-nav-v2');
    })[0];
    if(window.__l8RailSave) w.setAttribute('style', window.__l8RailSave); else w.removeAttribute('style');
    var now=w.getAttribute('style')||'';
    var same = now===window.__l8RailSave;
    delete window.__l8RailSave;
    return {style: now, byteIdentical: same};
  })()`);
  await settle(300);
  const back = await evalJs(READ);

  const out = {
    label: 'l8-settings-rail-names',
    wide,
    narrow,
    control,
    afterControl,
    restored,
    back,
    verdict:
      narrow.railWidth < wide.railWidth &&
      narrow.named === narrow.total &&
      narrow.unnamed.length === 0 &&
      narrow.paneScrollWidth <= narrow.paneClientWidth + 1 &&
      control.named === 0 &&
      afterControl.named === afterControl.total &&
      restored.byteIdentical
        ? 'PASS'
        : 'FAIL',
  };
  const dest = path.join(__dirname, '..', 'baselines', 'l8-settings-rail-names.json');
  fs.writeFileSync(dest, `${JSON.stringify(out, null, 1)}\n`);
  console.log(JSON.stringify(out, null, 1));
})().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
