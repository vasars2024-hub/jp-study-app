#!/usr/bin/env node
/**
 * L8 GATE harness — the LIVE half.
 *
 * `l8-searchability.cjs` reads source: which entries exist, where their anchors
 * live, which cards no entry names. It cannot see what the shipped renderer
 * actually offers a user, and one whole defect class only exists there — a card
 * gated on the ACTIVE THEME is anchored in exactly the right file and still is
 * not on screen, so file-closure scoring calls it landed.
 *
 * Surface is a PARAMETER, not a second probe: `--surface scraper` drives the
 * Scraper app's own search box with the same steps. A new searchable app costs
 * a RUN and a row in SURFACES, never a new file.
 *
 *   node l8-searchability-live.cjs --query pillarbox --theme frutiger-aero \
 *                                  --control wallpaper
 *   node l8-searchability-live.cjs --query "wired arcade" --discover wired \
 *                                  --control "aero arcade"
 *
 * `--discover` swaps the moved axis from the active theme to a secret shell's
 * discovery flag, which is the OTHER thing a Special-page card renders behind.
 *
 * Reported numbers (never adjectives):
 *   queryBefore    result titles for --query in the state the app is already in
 *   queryAfter     the same query after the moved axis changes
 *   queryBack      the same query after it is put back  (the reversal)
 *   control*       the same readings for --control, which must NOT move
 *
 * A run whose control moves is VOID: it proves the search box changed, not that
 * the gate did. A run whose `--query` reading is identical under both themes is
 * a FINDING, not a pass.
 *
 * Non-persistent by construction, which is why it is safe to run against the
 * user's real app: Advanced Mode is asserted by adding the `settings-advanced`
 * class the component already reads rather than clicking the button that writes
 * it to storage, and the theme is moved by dispatching the same
 * `jp-theme-changed` event `applyTheme` fires rather than writing the theme key.
 * Both are reverted and the revert is RE-READ, never assumed.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};

const SURFACES = {
  settings: {
    input: '.os-set-search-input',
    title: '.os-set-search-item-title',
    empty: '.os-set-search-empty',
  },
  scraper: {
    input: '.scr-search-input',
    title: '.scr-search-hit-title',
    empty: '.scr-search-empty',
  },
};

const SURFACE = SURFACES[opt('--surface', 'settings')];
if (!SURFACE) {
  console.error(`unknown --surface; expected one of ${Object.keys(SURFACES).join(', ')}`);
  process.exit(2);
}
const QUERY = opt('--query', 'pillarbox');
const CONTROL = opt('--control', 'wallpaper');
const THEME = opt('--theme', 'frutiger-aero');

const bridge = JSON.parse(fs.readFileSync(path.join(ROOT, 'debug', 'bridge.json'), 'utf8'));
const BASE = `http://127.0.0.1:${bridge.port}`;
const HEADERS = { Authorization: `Bearer ${bridge.token}`, 'Content-Type': 'application/json' };

async function evalJs(js) {
  const r = await fetch(`${BASE}/eval`, { method: 'POST', headers: HEADERS, body: JSON.stringify({ js }) });
  const j = await r.json();
  if (!j.ok) throw new Error(`eval failed: ${JSON.stringify(j)}`);
  return j.result;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* React listens for `input`, so the value goes through the native setter — an
 * assignment to `.value` alone changes the box and tells the component nothing. */
const type = (q) =>
  `(()=>{const i=document.querySelector(${JSON.stringify(SURFACE.input)});if(!i)return{err:'no input'};` +
  `const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;` +
  `i.focus();s.call(i,${JSON.stringify(q)});i.dispatchEvent(new Event('input',{bubbles:true}));return{typed:i.value}})()`;

const read =
  `(()=>({titles:[...document.querySelectorAll(${JSON.stringify(SURFACE.title)})].map(e=>e.textContent.trim()),` +
  `empty:!!document.querySelector(${JSON.stringify(SURFACE.empty)})}))()`;

const moveTheme = (id) =>
  `(()=>{window.dispatchEvent(new CustomEvent('jp-theme-changed',{detail:${JSON.stringify(id)}}));return 1})()`;

/* The DISCOVERY axis. Unlike the theme, this one has no event that carries the
 * value -- the modules re-read localStorage when notified -- so the key really
 * is written. It is therefore captured first and restored to the exact prior
 * value (including "absent", which is not the same as ''), and the restore is
 * re-read before the run reports anything. */
const DISCOVERY_KEYS = { aero: 'jp-aero-discovered', wired: 'jp-wired-discovered-v1' };
const DISCOVERY_EVENTS = { aero: 'jp-aero-discovered-changed', wired: 'jp-wired-discovered-changed' };
const setDiscovery = (shell, value) =>
  `(()=>{const k=${JSON.stringify(DISCOVERY_KEYS[shell])};` +
  (value === null ? `localStorage.removeItem(k);` : `localStorage.setItem(k,${JSON.stringify(value)});`) +
  `window.dispatchEvent(new CustomEvent(${JSON.stringify(DISCOVERY_EVENTS[shell])}));` +
  `return localStorage.getItem(k)})()`;

const SHELL = opt('--discover', null);
if (SHELL && !DISCOVERY_KEYS[SHELL]) {
  console.error(`unknown --discover; expected one of ${Object.keys(DISCOVERY_KEYS).join(', ')}`);
  process.exit(2);
}

/* One typed query read on both sides of the move. Separate /eval calls: a single
 * batched call would type and read inside one React flush and always report the
 * pre-render DOM. */
async function sweep(query, move) {
  await evalJs(type(query));
  await sleep(250);
  const before = await evalJs(read);
  await evalJs(move);
  await sleep(250);
  const after = await evalJs(read);
  return { before, after };
}

(async () => {
  const currentTheme = await evalJs(`document.documentElement.getAttribute('data-theme')`);
  const advancedWasOn = await evalJs(`document.documentElement.classList.contains('settings-advanced')`);
  if (!advancedWasOn) {
    await evalJs(`(()=>{document.documentElement.classList.add('settings-advanced');return 1})()`);
  }

  // What the run moves, and what puts it back. The discovery leg flips whatever
  // the profile currently holds, so it always restores to the truth.
  let priorDiscovery = null;
  let move;
  let restore;
  if (SHELL) {
    priorDiscovery = await evalJs(`localStorage.getItem(${JSON.stringify(DISCOVERY_KEYS[SHELL])})`);
    move = setDiscovery(SHELL, priorDiscovery === '1' ? null : '1');
    restore = setDiscovery(SHELL, priorDiscovery);
  } else {
    move = moveTheme(THEME);
    restore = moveTheme(currentTheme);
  }

  const gated = await sweep(QUERY, move);
  await evalJs(restore);
  await sleep(250);
  gated.back = await evalJs(read);

  const control = await sweep(CONTROL, move);
  await evalJs(restore);
  await sleep(250);
  control.back = await evalJs(read);

  await evalJs(type(''));
  if (!advancedWasOn) {
    await evalJs(`(()=>{document.documentElement.classList.remove('settings-advanced');return 1})()`);
  }
  await sleep(200);
  const restored = await evalJs(
    `({theme:document.documentElement.getAttribute('data-theme'),` +
      `adv:document.documentElement.classList.contains('settings-advanced'),` +
      `query:(document.querySelector(${JSON.stringify(SURFACE.input)})||{}).value,` +
      (SHELL ? `discovery:localStorage.getItem(${JSON.stringify(DISCOVERY_KEYS[SHELL])})` : `discovery:null`) +
      `})`,
  );

  const same = (a, b) => a.titles.join('|') === b.titles.join('|');
  const result = {
    surface: opt('--surface', 'settings'),
    axis: SHELL ? `discovery:${SHELL}` : `theme:${THEME}`,
    currentTheme,
    priorDiscovery,
    query: QUERY,
    queryBefore: gated.before.titles.length,
    queryAfter: gated.after.titles.length,
    queryBack: gated.back.titles.length,
    queryTitlesBefore: gated.before.titles,
    queryTitlesAfter: gated.after.titles,
    gateMoves: !same(gated.before, gated.after),
    gateReverses: same(gated.before, gated.back),
    control: CONTROL,
    controlBefore: control.before.titles.length,
    controlAfter: control.after.titles.length,
    controlHeld: same(control.before, control.after),
    restored,
    restoredClean:
      restored.theme === currentTheme &&
      restored.adv === advancedWasOn &&
      restored.query === '' &&
      (!SHELL || restored.discovery === priorDiscovery),
  };
  console.log(JSON.stringify(result, null, 2));
  const out = opt('--out', null);
  if (out) fs.writeFileSync(path.resolve(ROOT, out), JSON.stringify(result, null, 2));
  // VOID when the control moved; FAIL when the gate did not, or did not reverse.
  process.exit(result.controlHeld && result.gateMoves && result.gateReverses && result.restoredClean ? 0 : 1);
})().catch((e) => {
  console.error(e.message);
  process.exit(2);
});
