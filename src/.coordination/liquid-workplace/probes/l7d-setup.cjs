/**
 * L7-D setup: put the ONE cold boot into the real functional state category 7 must be
 * measured in, and report the numbers that prove it — before any timing runs.
 *
 * Why this is its own file rather than three ad-hoc evals: the previous category-7 passes
 * were voided twice by state, not by timing. Once because the gesture probe targets the
 * LARGEST visible `.fwin` and Scraper and Dictionary are both 820x580, so it silently drove
 * the wrong window; once because a window measured while unfocused fabricates zeros. Both
 * are asserted here, at the top of the run, so a bad state cannot reach the numbers.
 *
 *   node src/.coordination/liquid-workplace/probes/l7d-setup.cjs
 */
'use strict';
const fs = require('node:fs');

const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ev(js) {
  const r = await fetch(`http://127.0.0.1:${cfg.port}/eval`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ js }),
  });
  const t = await r.json();
  if (!t.ok) throw new Error(`eval failed: ${JSON.stringify(t).slice(0, 300)}`);
  try {
    return JSON.parse(t.result);
  } catch {
    return t.result;
  }
}

const CENSUS = `(function(){
  var wins = [].slice.call(document.querySelectorAll('.fwin')).map(function(w){
    var t = w.querySelector('.fwin-title, .fwin-bar');
    var r = w.getBoundingClientRect();
    return {
      title: (t && t.textContent || '').trim().slice(0, 30),
      box: Math.round(r.width) + 'x' + Math.round(r.height),
      display: w.style.display || '',
      presentation: w.getAttribute('data-presentation'),
      entries: w.querySelectorAll('.dict-entry').length,
    };
  });
  return JSON.stringify({
    wins: wins,
    theme: document.documentElement.getAttribute('data-theme'),
    perf: document.documentElement.getAttribute('data-perf'),
    overlays: {
      consent: !!document.querySelector('[class*="consent" i]'),
      tour: !!document.querySelector('[class*="tour" i], [class*="onboard" i]'),
    },
  });
})()`;

async function main() {
  console.log('census before:', JSON.stringify(await ev(CENSUS)));

  // Hide every .fwin whose title is not Dictionary. `display:none` and never minimise —
  // minimise persists into desktop-layout.json and would leave the tree's state changed.
  const hidden = await ev(`(function(){
    var out = [];
    [].slice.call(document.querySelectorAll('.fwin')).forEach(function(w){
      var t = w.querySelector('.fwin-title, .fwin-bar');
      var title = (t && t.textContent || '').trim();
      if (!/Dictionary|辞書/i.test(title)) { w.style.display = 'none'; out.push(title.slice(0,24)); }
    });
    return JSON.stringify(out);
  })()`);
  console.log('hidden non-Dictionary windows:', JSON.stringify(hidden));

  const after = await ev(CENSUS);
  const visible = after.wins.filter((w) => w.display !== 'none');
  if (visible.length !== 1) {
    throw new Error(`REFUSING: ${visible.length} visible .fwin, need exactly 1 — ${JSON.stringify(visible)}`);
  }
  if (!/Dictionary/i.test(visible[0].title)) {
    throw new Error(`REFUSING: the single visible window is "${visible[0].title}", not Dictionary`);
  }
  console.log('census after:', JSON.stringify(after));

  if (visible[0].entries === 0) {
    console.log('no entries — driving a real search (食べる) so nothing is measured on an empty harness');
    await ev(`(function(){
      var win = document.querySelector('.fwin');
      var input = win.querySelector('input[type="text"], input:not([type]), input[type="search"]');
      var set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      set.call(input, '\\u98df\\u3079\\u308b');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return 'typed';
    })()`);
    await sleep(400);
    await ev(`(function(){
      var win = document.querySelector('.fwin');
      var b = [].slice.call(win.querySelectorAll('button')).filter(function(x){
        return /^(Search|\\u691c\\u7d22)/.test((x.textContent||'').trim());
      })[0];
      if (!b) return 'no-search-button';
      b.click(); return 'clicked';
    })()`);
    await sleep(2500);
  }

  const final = await ev(`(function(){
    var win = [].slice.call(document.querySelectorAll('.fwin')).filter(function(w){ return w.style.display !== 'none'; })[0];
    var r = win.getBoundingClientRect();
    return JSON.stringify({
      title: (win.querySelector('.fwin-title, .fwin-bar').textContent || '').trim().slice(0,30),
      presentation: win.getAttribute('data-presentation'),
      liquidClass: win.classList.contains('fwin-liquid'),
      entries: win.querySelectorAll('.dict-entry').length,
      chars: (win.textContent || '').length,
      nodes: win.querySelectorAll('*').length,
      controls: win.querySelectorAll('button,a[href],input,select,textarea,[role="button"],[role="tab"],summary').length,
      box: Math.round(r.width) + 'x' + Math.round(r.height),
      theme: document.documentElement.getAttribute('data-theme'),
      perf: document.documentElement.getAttribute('data-perf'),
    });
  })()`);
  if (final.entries === 0) {
    throw new Error('REFUSING: 0 dict entries after a real search — an empty harness caps category 7 at 0');
  }
  console.log('STATE:', JSON.stringify(final));
}

main().catch((e) => {
  console.error(String(e.message || e));
  process.exit(1);
});
