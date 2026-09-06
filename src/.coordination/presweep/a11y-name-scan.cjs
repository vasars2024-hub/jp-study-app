#!/usr/bin/env node
/**
 * Pre-sweep class pass 1 — accessible name + state, across every surface.
 *
 * Written 2026-09-06 for the live defect hunt, after 89 filed defects showed that
 * 49 of them (55%) were one mechanical class: a control with no accessible name, or
 * a toggle whose selected state is visual-only. That class is identical on every
 * surface, so hand-walking 25 surfaces to rediscover it is O(surfaces x classes).
 * This walks it once, parameterised by surface.
 *
 * Usage:
 *   node src/.coordination/presweep/a11y-name-scan.cjs \
 *     --bridge C:\path\to\debug\bridge.json \
 *     --surfaces agent,library,novels        (or --all)
 *     [--open]      open a surface's window if it is not on the desk, and close it after
 *     [--settle 1200]
 *     [--json out.json]
 *
 * Traps this encodes, each of which produced a FALSE reading for a previous worker:
 *   - `innerText` is empty mid-render while `textContent` is not, so a settled re-scan
 *     is mandatory and only elements unnamed in BOTH passes are reported (youtube, D90's
 *     walk, reported 4 unnamed where the truth was 1).
 *   - A collapsed <details> reports a rect for its hidden children and their text is
 *     empty; those are counted separately, never as unnamed.
 *   - An entry animation holds `opacity: 0` with `fill: both` in an unfocused window,
 *     so visibility is decided by `checkVisibility` + rect, not by opacity alone.
 *   - `os:open` takes the section as the detail STRING, not `{ section }`.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

function parseArgs(argv) {
  const out = { settle: 1200, surfaces: [], open: false, all: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--all') out.all = true;
    else if (a === '--open') out.open = true;
    else if (a === '--bridge') out.bridge = argv[++i];
    else if (a === '--surfaces') out.surfaces = String(argv[++i]).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--settle') out.settle = Number(argv[++i]);
    else if (a === '--json') out.json = argv[++i];
    else if (a === '--window') out.window = argv[++i];
  }
  return out;
}

const args = parseArgs(process.argv);
const bridgePath = args.bridge || path.join(process.cwd(), 'debug', 'bridge.json');
if (!fs.existsSync(bridgePath)) {
  console.error(`no bridge.json at ${bridgePath}`);
  process.exit(2);
}
// Read fresh every run — a require-cached bridge.json points at a dead instance.
const bridge = JSON.parse(fs.readFileSync(bridgePath, 'utf8'));

function post(route, body) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body ?? {}), 'utf8');
    const req = http.request(
      {
        host: '127.0.0.1',
        port: bridge.port,
        path: route,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bridge.token}`,
          'Content-Type': 'application/json',
          'Content-Length': payload.length,
        },
        timeout: 30000,
      },
      (res) => {
        let buf = '';
        res.on('data', (d) => { buf += d; });
        res.on('end', () => {
          try { resolve(JSON.parse(buf)); } catch (e) { reject(new Error(`${route}: ${buf.slice(0, 200)}`)); }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`${route} timed out`)));
    req.end(payload);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function evalJs(js) {
  const body = { js };
  if (args.window) body.window = args.window;
  const r = await post('/eval', body);
  if (!r.ok) throw new Error(`eval failed: ${r.error}`);
  return r.result;
}

/**
 * The scan itself, as one synchronous expression — `/eval` wraps the code in
 * `(() => ...)` and serializes the result, so a Promise would come back as `{}`.
 *
 * `scope` is a CSS selector for the surface root. Everything is measured inside it.
 */
function scanExpression(scope) {
  const sel = JSON.stringify(scope);
  return `(() => {
    const root = document.querySelector(${sel});
    if (!root) return { missing: true };

    const txt = (el) => (el ? String(el.textContent || '').replace(/\\s+/g, ' ').trim() : '');
    const byIds = (ids) => String(ids || '')
      .split(/\\s+/).filter(Boolean)
      .map((id) => txt(document.getElementById(id)))
      .filter(Boolean).join(' ');

    const labelFor = (el) => {
      let s = '';
      if (el.id) {
        s = [...root.ownerDocument.querySelectorAll('label[for=' + JSON.stringify(el.id) + ']')]
          .map(txt).filter(Boolean).join(' ');
      }
      if (!s) { const anc = el.closest('label'); if (anc) s = txt(anc); }
      return s;
    };

    // Accessible name, in specification order, stopping at the first non-empty source.
    const nameOf = (el) => {
      const lb = byIds(el.getAttribute('aria-labelledby'));
      if (lb) return { name: lb, from: 'aria-labelledby' };
      const al = (el.getAttribute('aria-label') || '').trim();
      if (al) return { name: al, from: 'aria-label' };
      const tag = el.tagName.toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') {
        const lf = labelFor(el);
        if (lf) return { name: lf, from: 'label' };
        const v = (el.getAttribute('value') || '').trim();
        const t = (el.getAttribute('type') || '').toLowerCase();
        if (v && (t === 'button' || t === 'submit' || t === 'reset')) return { name: v, from: 'value' };
      }
      const alt = (el.getAttribute('alt') || '').trim();
      if (alt) return { name: alt, from: 'alt' };
      // Text content, counting the alt text of any icon images inside.
      let t1 = txt(el);
      if (!t1) {
        t1 = [...el.querySelectorAll('img[alt], svg title')].map((n) =>
          (n.getAttribute ? (n.getAttribute('alt') || '') : '') || txt(n)).join(' ').trim();
      }
      if (t1) return { name: t1, from: 'text' };
      const ti = (el.getAttribute('title') || '').trim();
      if (ti) return { name: ti, from: 'title' };
      const ph = (el.getAttribute('placeholder') || '').trim();
      if (ph) return { name: ph, from: 'placeholder' };
      return { name: '', from: 'none' };
    };

    const inClosedDetails = (el) => {
      for (let d = el.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) {
        if (!d.open) return true;
      }
      return false;
    };

    const visible = (el) => {
      if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true })) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };

    const SEL = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=link], [role=checkbox], [role=switch], [role=menuitem], [role=option], [role=radio], [tabindex]:not([tabindex="-1"])';
    const all = [...root.querySelectorAll(SEL)];

    const path = (el) => {
      const bits = [];
      for (let n = el; n && n !== root && bits.length < 4; n = n.parentElement) {
        const cls = String(n.className || '').split(/\\s+/).filter(Boolean).slice(0, 2).join('.');
        bits.unshift(n.tagName.toLowerCase() + (cls ? '.' + cls : ''));
      }
      return bits.join(' > ');
    };

    const unnamed = [];
    const visualOnly = [];
    let counted = 0; let hidden = 0; let closed = 0;

    // A class that means "this one is chosen" — the app's own idiom across 28 sites.
    const STATE_CLASS = /(^|\\s)(active|is-active|selected|is-selected|is-current|current|checked|is-checked|on)(\\s|$)/;
    const STATE_ATTR = ['aria-pressed', 'aria-selected', 'aria-current', 'aria-checked', 'aria-expanded'];

    for (const el of all) {
      if (inClosedDetails(el)) { closed += 1; continue; }
      if (!visible(el)) { hidden += 1; continue; }
      counted += 1;

      const n = nameOf(el);
      if (!n.name) {
        unnamed.push({ tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 80), path: path(el), html: el.outerHTML.slice(0, 160) });
      }

      const cls = String(el.className || '');
      if (STATE_CLASS.test(cls) && el.tagName.toLowerCase() !== 'a') {
        const has = STATE_ATTR.some((a) => el.hasAttribute(a));
        if (!has) {
          visualOnly.push({ tag: el.tagName.toLowerCase(), name: n.name.slice(0, 60), cls: cls.slice(0, 80), path: path(el) });
        }
      }
      // A tab without aria-selected is unannounceable regardless of its class.
      if (el.getAttribute('role') === 'tab' && !el.hasAttribute('aria-selected')) {
        visualOnly.push({ tag: 'role=tab', name: n.name.slice(0, 60), cls: cls.slice(0, 80), path: path(el) });
      }
    }

    return { missing: false, counted, hidden, closed, unnamed, visualOnly, title: document.title };
  })()`;
}

const ALL_SURFACES = [
  'agent', 'library', 'novels', 'dictionary', 'grammar', 'translate', 'player', 'video',
  'music', 'anki', 'flashcards', 'games', 'stats', 'resources', 'settings', 'note',
  'visualizer', 'musicwidget', 'city', 'immersion', 'calendar', 'reading', 'youtube',
  'scraper', 'files',
];

async function openSections() {
  return evalJs(`[...document.querySelectorAll('.fwin')].map(w => w.getAttribute('data-section'))`);
}

async function main() {
  const surfaces = args.all ? ALL_SURFACES : args.surfaces;
  if (!surfaces.length) { console.error('give --surfaces a,b or --all'); process.exit(2); }

  const before = await openSections();
  console.log(`desk at start: ${before.length} windows [${before.join(', ')}]`);

  const results = [];
  for (const s of surfaces) {
    const openNow = await openSections();
    let opened = false;
    if (!openNow.includes(s)) {
      if (!args.open) { console.log(`${s}: NOT OPEN (pass --open to open it)`); results.push({ surface: s, skipped: 'not open' }); continue; }
      // os:open takes the section as the detail STRING, not an object.
      await evalJs(`(window.dispatchEvent(new CustomEvent('os:open', { detail: ${JSON.stringify(s)} })), 'sent')`);
      opened = true;
      await sleep(args.settle);
    }

    const scope = `.fwin[data-section="${s}"]`;
    // First pass, then a settled re-scan: only what is unnamed in BOTH is real.
    let first;
    try { first = await evalJs(scanExpression(scope)); } catch (e) { results.push({ surface: s, error: String(e.message) }); continue; }
    await sleep(args.settle);
    let second;
    try { second = await evalJs(scanExpression(scope)); } catch (e) { results.push({ surface: s, error: String(e.message) }); continue; }

    if (second.missing) {
      console.log(`${s}: window did not render`);
      results.push({ surface: s, skipped: 'no window' });
    } else {
      const firstKeys = new Set((first.unnamed || []).map((u) => u.html));
      const stable = (second.unnamed || []).filter((u) => firstKeys.has(u.html));
      const row = {
        surface: s,
        counted: second.counted,
        hidden: second.hidden,
        inClosedDetails: second.closed,
        unnamedFirstPass: (first.unnamed || []).length,
        unnamed: stable,
        visualOnly: second.visualOnly || [],
        opened,
      };
      results.push(row);
      console.log(
        `${s}: ${row.counted} controls | unnamed ${stable.length} (first pass said ${row.unnamedFirstPass}) | visual-only state ${row.visualOnly.length} | hidden ${row.hidden} | in closed <details> ${row.inClosedDetails}`,
      );
      for (const u of stable) console.log(`    UNNAMED  ${u.path}  ${u.html.replace(/\s+/g, ' ').slice(0, 120)}`);
      for (const v of row.visualOnly) console.log(`    NO-STATE ${v.path}  "${v.name}"  [${v.cls}]`);
    }

    if (opened) {
      // There is NO `os:close` event — the only close route is the window's own
      // button, so drive that. `note` is deliberately never auto-opened: its close
      // raises a delete confirm and would destroy content.
      await evalJs(
        `(() => { const b = document.querySelector('.fwin[data-section="${s}"] .fwin-close'); if (b) { b.click(); return 'closed'; } return 'no close button'; })()`,
      );
      await sleep(400);
    }
  }

  const after = await openSections();
  console.log(`desk at end: ${after.length} windows [${after.join(', ')}]`);
  if (after.length !== before.length) console.log('WARNING: desk window count changed — restore it before ending the turn');

  if (args.json) {
    fs.writeFileSync(args.json, JSON.stringify({ at: new Date().toISOString(), before, after, results }, null, 2));
    console.log(`wrote ${args.json}`);
  }

  const totUn = results.reduce((a, r) => a + (r.unnamed ? r.unnamed.length : 0), 0);
  const totVo = results.reduce((a, r) => a + (r.visualOnly ? r.visualOnly.length : 0), 0);
  console.log(`\nTOTAL: ${totUn} unnamed controls, ${totVo} visual-only states across ${results.length} surfaces`);
}

main().catch((e) => { console.error(String(e && e.stack || e)); process.exit(1); });
