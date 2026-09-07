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
    else if (a === '--pass') out.pass = argv[++i];
    else if (a === '--narrow') out.narrow = argv[++i];
    else if (a === '--delays') out.delays = String(argv[++i]).split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
    else if (a === '--reload') out.reload = true;
    else if (a === '--plant') out.plant = true;
  }
  return out;
}

const args = parseArgs(process.argv);
// `names` (class pass 1: accessible name + state) or `keyboard` (class pass 2).
const PASS = args.pass || 'names';
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

/**
 * Class pass 2 — keyboard reachability.
 *
 * The question this answers is the one that produced D91 (P1): is there anything a user
 * can CLICK that they cannot reach with Tab? `cursor: pointer` is the honest proxy —
 * the app paints it on exactly the things it wants clicked — and an element carrying it
 * that is neither focusable nor inside a focusable ancestor is mouse-only by
 * construction. On YouTube that was the video row, and because selecting a row is the
 * only writer of `selectedVideoIds`, two toolbar buttons were dead for a whole
 * keyboard-only session while telling the user to "Select at least one video first".
 *
 * Also flagged: a positive `tabindex`, which jumps the natural order and is a defect
 * even when every control is reachable.
 */
function keyboardExpression(scope) {
  const sel = JSON.stringify(scope);
  return `(() => {
    const root = document.querySelector(${sel});
    if (!root) return { missing: true };

    // A summary element is natively focusable and operable by Enter/Space. Leaving it out made
    // every collapsed disclosure on the Media Center rail read as mouse-only.
    const FOCUSABLE = 'a[href], button, summary, input:not([type=hidden]), select, textarea, [tabindex], [contenteditable=""], [contenteditable=true]';
    const focusable = (el) => {
      if (!el.matches(FOCUSABLE)) return false;
      if (el.hasAttribute('disabled')) return false;
      const ti = el.getAttribute('tabindex');
      if (ti !== null && Number(ti) < 0) return roving(el);
      return true;
    };

    /**
     * Roving tabindex: an ARIA composite (tablist, menu, radiogroup, listbox, tree,
     * toolbar) puts tabIndex 0 on the ACTIVE item and -1 on all the others, and moves
     * focus between them with the arrow keys. Every inactive item then looks unreachable
     * to a naive scan while being perfectly operable.
     *
     * Measured 2026-09-06: this alone accounted for 6 of the 7 findings on the first
     * run — the Reading workspace tablist is a textbook implementation
     * (ReadingWorkspaceView.tsx:215, role=tab + aria-selected + arrow-key handler), and
     * scoring it would have been a false report against correct code.
     */
    const ROVING_ROLES = ['tab', 'menuitem', 'menuitemradio', 'menuitemcheckbox', 'option', 'radio', 'treeitem'];
    const roving = (el) => {
      const role = el.getAttribute('role');
      if (!role || !ROVING_ROLES.includes(role)) return false;
      const group = el.closest('[role=tablist], [role=menu], [role=menubar], [role=radiogroup], [role=listbox], [role=tree], [role=toolbar]') || el.parentElement;
      if (!group) return false;
      // The group is a roving one only if exactly one peer holds the tab stop.
      return [...group.querySelectorAll('[tabindex="0"]')].some((p) => p.getAttribute('role') === role);
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

    const path = (el) => {
      const bits = [];
      for (let n = el; n && n !== root && bits.length < 4; n = n.parentElement) {
        const cls = String(n.className || '').split(/\\s+/).filter(Boolean).slice(0, 2).join('.');
        bits.unshift(n.tagName.toLowerCase() + (cls ? '.' + cls : ''));
      }
      return bits.join(' > ');
    };

    const mouseOnly = [];
    const flagged = [];
    const positiveTabindex = [];
    let pointerCount = 0; let focusableCount = 0;
    const seen = new Set();

    for (const el of root.querySelectorAll('*')) {
      if (inClosedDetails(el) || !visible(el)) continue;
      if (focusable(el)) {
        focusableCount += 1;
        const ti = Number(el.getAttribute('tabindex'));
        if (Number.isFinite(ti) && ti > 0) {
          positiveTabindex.push({ path: path(el), tabindex: ti });
        }
      }
      const cs = getComputedStyle(el);
      if (cs.cursor !== 'pointer') continue;
      pointerCount += 1;
      if (el.getAttribute('aria-hidden') === 'true') continue;
      // A DISABLED control is not mouse-only — it cannot be operated by either input.
      // Without this the Media Center transport (correctly disabled with nothing
      // playing) and the current workspace tab both read as keyboard traps.
      if (el.hasAttribute('disabled') || el.closest('[disabled]')) continue;
      // The svg, path and span INSIDE a flagged control inherit its cursor and are not
      // separate findings. Report the outermost node only.
      if (flagged.some((f) => f.contains(el))) continue;
      // Reachable if it or any ancestor inside the surface is focusable.
      let reach = false;
      for (let n = el; n && n !== root.parentElement; n = n.parentElement) {
        if (n.nodeType === 1 && focusable(n)) { reach = true; break; }
      }
      if (reach) continue;
      // A clickable whose own children are focusable is a container, not a control.
      if ([...el.querySelectorAll(FOCUSABLE)].some((c) => focusable(c))) continue;
      // A span inside a LABEL is operated through the label's own control, which is
      // focusable — clicking the text toggles the checkbox and Tab reaches the checkbox.
      // Without this the Video pane's toggle captions all read as mouse-only.
      const lab = el.closest('label');
      if (lab && [...lab.querySelectorAll(FOCUSABLE)].some((c) => focusable(c))) continue;
      // BEFORE the dedupe: a second identical control is not re-reported, but it must
      // still suppress its own svg/span children, which are not separate findings.
      flagged.push(el);
      const key = path(el) + '|' + String(el.className || '');
      if (seen.has(key)) continue;
      seen.add(key);
      mouseOnly.push({
        path: path(el),
        text: String(el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60),
        html: el.outerHTML.slice(0, 140),
      });
    }

    return { missing: false, focusableCount, pointerCount, mouseOnly, positiveTabindex };
  })()`;
}

/**
 * Pass 3 — reflow. The cross-cutting "resize narrow + maximize" pass that ~20 surface
 * rows in LIVE_DEFECTS_PRESWEEP.md defer to by name.
 *
 * What it looks for, and why this shape rather than "does it look bad":
 *   Every view renders inside a `.fwin` in ONE full-size renderer, so a
 *   `@media (max-width: N)` rule inside a view asks about the 1904px DESKTOP viewport,
 *   not the 420px window — it can never fire where it was meant to. The observable
 *   consequence is content wider than its box inside an ancestor that clips it, which
 *   makes a CONTROL unreachable by mouse. That is the finding; a stacked layout that
 *   merely looks cramped is not.
 *
 * Two exclusions, without which this fabricates findings on correct code:
 *   - `text-overflow: ellipsis` + `overflow: hidden` is the app's deliberate truncation
 *     idiom on ~every list row. Clipping there is the design, not a defect.
 *   - a clipping ancestor that CAN scroll horizontally (`overflow-x: auto|scroll` with
 *     real scrollWidth) still reaches its content. Only an unscrollable clip hides it.
 *
 * And one trap that voids the whole pass: an unfocused renderer delivers no
 * ResizeObserver callbacks, so a bridge-driven resize moves the box while every
 * observer-driven layout stays frozen at its old width — which reads exactly like a
 * layout defect. The driver focuses the window first and asserts the body width really
 * moved before it believes a single measurement.
 */
function reflowExpression(scope) {
  const sel = JSON.stringify(scope);
  return `(() => {
    const w = document.querySelector(${sel});
    if (!w) return { missing: true };
    const body = w.querySelector('.fwin-body') || w;
    const br = body.getBoundingClientRect();

    const path = (el) => {
      const bits = [];
      for (let n = el; n && n !== body && bits.length < 4; n = n.parentElement) {
        const cls = String(n.className || '').split(/\\s+/).filter(Boolean).slice(0, 2).join('.');
        bits.unshift(n.tagName.toLowerCase() + (cls ? '.' + cls : ''));
      }
      return bits.join(' > ');
    };
    const visible = (el) => {
      if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true })) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const canScrollX = (el) => {
      const ox = getComputedStyle(el).overflowX;
      return (ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 1;
    };
    const clips = (el) => {
      const ox = getComputedStyle(el).overflowX;
      return ox === 'hidden' || ox === 'clip';
    };

    const SEL = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=link], [role=checkbox], [role=switch], [role=menuitem], [role=option], [role=radio], [tabindex]:not([tabindex="-1"])';

    // 1. A control painted outside a clipping ancestor that cannot scroll to it.
    //
    // Two degrees, because the first version of this only had the second and it
    // reported "0 unreachable" on the Media Center player bar while 18 of the 26px
    // of "Add to Liked" sat past the clip edge — the control was still nominally
    // hit-testable on its surviving 8px sliver, so a wholly-outside test missed the
    // defect entirely. A control the user can see cut in half is a finding.
    const unreachable = [];
    const partiallyCut = [];
    let controls = 0;
    for (const el of body.querySelectorAll(SEL)) {
      if (!visible(el)) continue;
      controls += 1;
      const r = el.getBoundingClientRect();
      for (let n = el.parentElement; n && n !== body.parentElement; n = n.parentElement) {
        if (canScrollX(n)) break;               // reachable by scrolling
        if (!clips(n)) continue;
        const nr = n.getBoundingClientRect();
        const edgeR = nr.left + n.clientWidth;
        const outRight = r.left - edgeR;
        const outLeft = nr.left - r.right;
        if (outRight > -2 || outLeft > -2) {
          unreachable.push({
            path: path(el),
            text: String(el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 50),
            clipper: path(n),
            byPx: Math.round(Math.max(outRight, outLeft) + 2),
          });
          break;
        }
        // Partly clipped: more than a quarter of the control is past an edge.
        const lost = Math.max(r.right - edgeR, nr.left - r.left, 0);
        if (r.width > 0 && lost / r.width > 0.25) {
          partiallyCut.push({
            path: path(el),
            text: String(el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 50)
              || (el.getAttribute('aria-label') || el.getAttribute('title') || '').slice(0, 50),
            clipper: path(n),
            lostPx: Math.round(lost),
            ofPx: Math.round(r.width),
          });
          break;
        }
      }
    }

    // 2. Text clipped with no ellipsis and no scroll route — readable content lost.
    const textClipped = [];
    const flaggedBoxes = [];
    for (const el of body.querySelectorAll('*')) {
      const over = el.scrollWidth - el.clientWidth;
      if (over <= 4) continue;
      if (!visible(el)) continue;
      // A 1px box is the visually-hidden idiom (position:absolute; width:1px;
      // clip-path: inset(50%)), which this app uses heavily and DELIBERATELY - the
      // Media Center rail collapses its labels that way at narrow width precisely so
      // the accessible name survives. 14 of the first run's 22 hits were this.
      if (el.clientWidth <= 1 || el.clientHeight <= 1) continue;
      const cs = getComputedStyle(el);
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') continue;
      if (cs.overflowX === 'visible') continue;
      if (cs.textOverflow === 'ellipsis') continue;
      // Report the outermost clipper only; its descendants share the cause.
      if (flaggedBoxes.some((f) => f.contains(el))) continue;
      let anyScrollableAncestor = false;
      for (let n = el.parentElement; n && n !== body.parentElement; n = n.parentElement) {
        if (canScrollX(n)) { anyScrollableAncestor = true; break; }
      }
      if (anyScrollableAncestor) continue;
      flaggedBoxes.push(el);
      textClipped.push({
        path: path(el),
        box: el.clientWidth,
        content: el.scrollWidth,
        over,
        text: String(el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60),
      });
    }

    return {
      missing: false,
      bodyW: Math.round(br.width),
      bodyH: Math.round(br.height),
      winW: Math.round(w.getBoundingClientRect().width),
      controls,
      unreachable,
      partiallyCut,
      textClipped,
    };
  })()`;
}

const ALL_SURFACES = [
  'agent', 'library', 'novels', 'dictionary', 'grammar', 'translate', 'player', 'video',
  'music', 'anki', 'flashcards', 'games', 'stats', 'resources', 'settings', 'note',
  'visualizer', 'musicwidget', 'city', 'immersion', 'calendar', 'reading', 'youtube',
  'scraper', 'files',
];

/* ------------------------------------------------------------------ *
 * Cross-cutting pass: CLOSE A WINDOW MID-LOAD.
 *
 * A surface is opened and its own close button clicked again after `delay`
 * ms — inside the window between "the frame exists" and "the content and its
 * data have arrived". What that is looking for is the abort path: a fetch or
 * an IPC round-trip that resolves into a component that is no longer mounted,
 * a listener that is never removed, a spinner state promoted to the store, or
 * a later reopen that comes back broken because the aborted one poisoned it.
 *
 * Three things make this honest rather than theatre, all learned here:
 *  - The close must be PROVEN to have happened while the body was still
 *    loading. `armed.atClose` records the body's own text length and whether a
 *    Suspense fallback was still on screen; a run where the body was already
 *    full is reported as `late` and its silence proves nothing.
 *  - The collectors must catch what React and the platform actually emit:
 *    `unhandledrejection` (an aborted IPC promise), `error`, and
 *    `console.error` (React's unmounted-update and act warnings never throw).
 *  - Closing is not enough. Each surface is REOPENED afterwards and read for
 *    content, because the defect this pass exists to find is usually not a
 *    crash at close time but a surface that is dead the second time.
 * ------------------------------------------------------------------ */

/** Install the collectors once, on `window`, so they survive between /eval calls. */
function midloadInstallExpression() {
  return `(() => {
    if (window.__p2ml) return 'already installed';
    const state = { errs: [], rejs: [], cons: [] };
    state.onErr = (e) => { state.errs.push(String((e && e.message) || e)); };
    state.onRej = (e) => {
      const r = e && e.reason;
      state.rejs.push(String((r && (r.stack || r.message)) || r));
    };
    state.origConsoleError = console.error;
    console.error = function (...a) {
      try { state.cons.push(a.map((x) => String((x && x.message) || x)).join(' ').slice(0, 400)); } catch (_) {}
      return state.origConsoleError.apply(console, a);
    };
    window.addEventListener('error', state.onErr);
    window.addEventListener('unhandledrejection', state.onRej);
    window.__p2ml = state;
    return 'installed';
  })()`;
}

function midloadUninstallExpression() {
  return `(() => {
    const s = window.__p2ml;
    if (!s) return 'not installed';
    window.removeEventListener('error', s.onErr);
    window.removeEventListener('unhandledrejection', s.onRej);
    if (s.origConsoleError) console.error = s.origConsoleError;
    delete window.__p2ml;
    return 'uninstalled';
  })()`;
}

/**
 * Open `surface` and schedule its own close button `delay` ms later, recording
 * what the body looked like at the instant of the click. Both halves run in the
 * renderer: doing the close from a second /eval would let React flush the whole
 * mount first, and the pass would only ever measure a settled window.
 */
function midloadArmExpression(surface, delay) {
  const s = JSON.stringify(surface);
  return `(() => {
    const st = window.__p2ml;
    st.errs.length = 0; st.rejs.length = 0; st.cons.length = 0;
    st.done = false; st.atClose = null; st.closed = null;
    const sel = '.fwin[data-section=' + JSON.stringify(${s}) + ']';
    const fire = () => {
      const w = document.querySelector(sel);
      const body = w && w.querySelector('.fwin-body');
      const loader = w ? w.querySelector('.lq-loading, .liquid-loading, [class*="loading"], [class*="skeleton"], [aria-busy="true"]') : null;
      st.atClose = {
        hadWindow: !!w,
        bodyChars: body ? (body.textContent || '').trim().length : -1,
        bodyNodes: body ? body.querySelectorAll('*').length : -1,
        loaderOnScreen: !!loader,
        loaderClass: loader ? String(loader.className).slice(0, 80) : null,
        atMs: Math.round(performance.now() - st.t0),
      };
      const b = w && w.querySelector('.fwin-close');
      st.closed = b ? 'clicked' : (w ? 'no close button' : 'no window ever appeared');
      if (b) b.click();
      st.done = true;
    };
    st.t0 = performance.now();
    window.dispatchEvent(new CustomEvent('os:open', { detail: ${s} }));
    // delay 0 means "the very first frame the window exists" — a bare
    // setTimeout(0) runs BEFORE React has committed the window and closes
    // nothing, which is how the first version of this pass left four windows
    // on the desk and reported them as clean.
    const deadlineMs = ${Number(delay)};
    const spin = () => {
      const late = performance.now() - st.t0 >= deadlineMs;
      const there = !!document.querySelector(sel);
      if (late && there) { fire(); return; }
      if (performance.now() - st.t0 > deadlineMs + 3000) { fire(); return; }
      requestAnimationFrame(spin);
    };
    requestAnimationFrame(spin);
    ${args.plant ? `
    // POSITIVE CONTROL. Fires AFTER the close, which is exactly when a real
    // aborted IPC would land: a promise nobody is left to catch, plus the
    // console.error React uses for an update on an unmounted component.
    // A run with --plant that still reports 0 is measuring nothing.
    setTimeout(() => {
      Promise.reject(new Error('PLANT: rejection after unmount'));
      console.error('PLANT: Warning: Cannot update a component while unmounted');
    }, ${Number(delay)} + 250);` : ''}
    return 'armed';
  })()`;
}

/** Read the collectors plus the desk, and reopen the surface to see if it survived. */
function midloadReadExpression() {
  return `(() => {
    const s = window.__p2ml;
    return {
      done: !!s.done,
      atClose: s.atClose,
      closed: s.closed,
      errs: s.errs.slice(0, 8),
      rejs: s.rejs.slice(0, 8),
      cons: s.cons.slice(0, 8),
      fwins: [...document.querySelectorAll('.fwin')].map((w) => w.getAttribute('data-section')),
      taskbar: document.querySelectorAll('.os-task, .taskbar-item, [data-taskbar-item]').length,
    };
  })()`;
}

/* ------------------------------------------------------------------ *
 * Cross-cutting pass: UI LANGUAGE SWITCH, live half.
 *
 * The source scans (`partial-i18n-scan.cjs`, `i18n-hardcoded-check.cjs`)
 * answer "is this string routed through t()". They cannot answer the two
 * questions that actually reach the user, and both have already produced a
 * real defect here:
 *   - a string that IS translated but is rendered in the wrong LOCALE
 *     (D114: `toLocaleTimeString(LANG_TAGS[lang], { hour12: true })` — the tag
 *     is right there in the source and reads correct);
 *   - a string that is simply still English on screen in a non-en UI.
 *
 * So this reads the rendered text of a surface with the app genuinely switched,
 * and flags two things: Latin-script runs, and locale-format tells. Content is
 * NOT chrome — deck names, book titles and mined sentences are deliberately not
 * translated — so every hit is a LEAD to read, never a defect on its own.
 * ------------------------------------------------------------------ */
function i18nLiveExpression(scope) {
  const sel = JSON.stringify(scope);
  return `(() => {
    const root = document.querySelector(${sel});
    if (!root) return { missing: true };
    // Proper nouns, brands, file formats and units: translating these would be
    // the defect. Kept explicit so the list is arguable rather than magic.
    const ALLOW = /^(anki|ankiconnect|youtube|epub|pdf|srt|ass|vtt|mkv|mp3|mp4|json|csv|html|css|url|uri|api|ai|ui|os|id|ok|mal|myanimelist|qbittorrent|nyaa|jimaku|kitsunekko|jp|en|ja|zh|ru|gb|mb|kb|tb|px|ms|fps|cpu|gpu|ram|http|https|localhost|whisper|openai|anthropic|claude|gpt|gemini|ollama|blanc|aero|liquid|jlpt|n1|n2|n3|n4|n5|srs|ocr|tts|asr|vn|cd|dvd|rss|xml|sqlite|leveldb|electron|vite|seanime|textractor|tatoeba|kanjidic|jmdict|kaikki|wanikani|bunpro|discord|github|reddit|nhk|wikipedia)$/i;
    const out = [];
    const seen = new Set();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const raw = (n.nodeValue || '').trim();
      if (!raw || raw.length < 3) continue;
      const el = n.parentElement;
      if (!el) continue;
      // Only what is actually on screen.
      if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true })) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (el.closest('input, textarea, script, style')) continue;
      if (seen.has(raw)) continue;
      seen.add(raw);
      const path = (() => {
        const p = [];
        let e = el;
        for (let i = 0; e && i < 3; i += 1, e = e.parentElement) p.unshift(e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : ''));
        return p.join(' > ');
      })();
      // (1) Latin-script run with no CJK and no Cyrillic — a candidate English string.
      const hasCyr = /[\\u0400-\\u04FF]/.test(raw);
      const hasCjk = /[\\u3040-\\u30ff\\u3400-\\u9fff\\uf900-\\ufaff]/.test(raw);
      const latinWords = raw.match(/[A-Za-z][A-Za-z'’\\-]{2,}/g) || [];
      if (!hasCyr && !hasCjk && latinWords.length && latinWords.some((w) => !ALLOW.test(w))) {
        out.push({ kind: 'latin', text: raw.slice(0, 120), path });
      }
      // (2) Locale-format tells that survive translation, which is D114's class.
      if (/\\b(AM|PM)\\b/.test(raw)) out.push({ kind: 'clock-12h', text: raw.slice(0, 120), path });
      if (/\\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\b/.test(raw)) out.push({ kind: 'month-en', text: raw.slice(0, 120), path });
      if (/\\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\\b/.test(raw)) out.push({ kind: 'weekday-en', text: raw.slice(0, 120), path });
    }
    return { counted: seen.size, hits: out.slice(0, 60) };
  })()`;
}

function midloadReopenExpression(surface) {
  const s = JSON.stringify(surface);
  return `(() => {
    const w = document.querySelector('.fwin[data-section=' + JSON.stringify(${s}) + ']');
    if (!w) return { reopened: false };
    const body = w.querySelector('.fwin-body');
    return {
      reopened: true,
      bodyChars: body ? (body.textContent || '').trim().length : -1,
      bodyNodes: body ? body.querySelectorAll('*').length : -1,
      controls: w.querySelectorAll('button, a, input, select, textarea, [role="button"]').length,
      errorBoundary: !!w.querySelector('.app-error-boundary, [data-error-boundary]'),
    };
  })()`;
}

async function openSections() {
  return evalJs(`[...document.querySelectorAll('.fwin')].map(w => w.getAttribute('data-section'))`);
}

const NARROW_PX = Number(args.narrow || 420);

/**
 * Drive one surface through rest -> narrow -> restore -> maximized -> restore, measuring
 * at each stop. Geometry is put back by writing the ORIGINAL style attribute verbatim:
 * `removeProperty('width')` deletes the app's own persisted value, not the override.
 */
async function reflowSurface(surface, scope) {
  // An unfocused renderer runs no ResizeObserver, so the resize would move the box while
  // every observer-driven layout stayed frozen. Focus first, always.
  if (args.window) { try { await post('/focus', { window: Number(args.window) }); } catch { /* best effort */ } }

  const original = await evalJs(`(() => { const w = document.querySelector(${JSON.stringify(scope)}); return w ? w.getAttribute('style') : null; })()`);
  if (original == null) return { surface, skipped: 'no window' };

  const states = [];
  const measure = async (label) => {
    const m = await evalJs(reflowExpression(scope));
    if (m.missing) { states.push({ label, skipped: 'window vanished' }); return null; }
    states.push({ label, ...m });
    return m;
  };

  const rest = await measure('rest');
  if (!rest) return { surface, states, original };

  // NARROW
  await evalJs(`(() => { const w = document.querySelector(${JSON.stringify(scope)}); w.style.width = '${NARROW_PX}px'; return w.style.width; })()`);
  await sleep(700);
  const narrow = await measure(`narrow ${NARROW_PX}px`);
  // The resize is only believable if the body actually moved. If it did not, the
  // renderer never laid out and any finding here would be an instrument artifact.
  if (narrow && narrow.bodyW >= rest.bodyW) {
    narrow.suspect = `body did not shrink (${rest.bodyW} -> ${narrow.bodyW}) — resize did not take, findings VOID`;
    narrow.unreachable = [];
    narrow.partiallyCut = [];
    narrow.textClipped = [];
  }
  await evalJs(`(() => { const w = document.querySelector(${JSON.stringify(scope)}); w.setAttribute('style', ${JSON.stringify(original)}); return w.getAttribute('style'); })()`);
  await sleep(400);

  // MAXIMIZED — through the window's own control, which is the only route that writes
  // the restore point. The maximize button is the one aria-pressed button that is not
  // the Liquid toggle; keying on the label would break in ja/zh/ru.
  const maxSel = `${scope} .fwin-bar button[aria-pressed]:not(.fwin-b-liquid)`;
  const hasMax = await evalJs(`!!document.querySelector(${JSON.stringify(maxSel)})`);
  if (!hasMax) {
    states.push({ label: 'maximized', skipped: 'surface renders no maximize control' });
  } else {
    await evalJs(`(() => { document.querySelector(${JSON.stringify(maxSel)}).click(); return 'clicked'; })()`);
    await sleep(800);
    const max = await measure('maximized');
    if (max && max.bodyW <= rest.bodyW) {
      max.suspect = `body did not grow (${rest.bodyW} -> ${max.bodyW}) — maximize did not take, findings VOID`;
      max.unreachable = [];
      max.partiallyCut = [];
      max.textClipped = [];
    }
    await evalJs(`(() => { const b = document.querySelector(${JSON.stringify(maxSel)}); if (b) b.click(); return 'restored'; })()`);
    await sleep(600);
  }

  await sleep(300);
  const finalStyle = await evalJs(`(() => { const w = document.querySelector(${JSON.stringify(scope)}); return w ? w.getAttribute('style') : null; })()`);
  // Compare GEOMETRY only. `z-index` is restacked by every raise and differing on it
  // would report a forced restore on every surface while nothing had actually moved.
  const geom = (s) => String(s || '').replace(/z-index:[^;]*;?/g, '').replace(/\s+/g, ' ').trim();
  const restored = geom(finalStyle) === geom(original);
  if (!restored) {
    await evalJs(`(() => { const w = document.querySelector(${JSON.stringify(scope)}); if (w) w.setAttribute('style', ${JSON.stringify(original)}); return 'forced'; })()`);
  }
  return { surface, states, original, finalStyle, restoredCleanly: restored };
}

const MIDLOAD_DELAYS = args.delays && args.delays.length ? args.delays : [0, 60, 200, 600];
// `note` opens by CREATING a note and its close raises a delete confirm; `city` is
// out of scope by the pin. Neither may be opened-and-closed by a script.
const MIDLOAD_SKIP = new Set(['note', 'city']);

async function midloadSurface(surface) {
  const rows = [];
  for (const delay of MIDLOAD_DELAYS) {
    await evalJs(midloadArmExpression(surface, delay));
    await sleep(delay + 900);
    const r = await evalJs(midloadReadExpression());
    // Reopen and read it: the defect this pass hunts is usually the SECOND open.
    await evalJs(`(window.dispatchEvent(new CustomEvent('os:open', { detail: ${JSON.stringify(surface)} })), 'sent')`);
    await sleep(args.settle);
    const again = await evalJs(midloadReopenExpression(surface));
    const post = await evalJs(midloadReadExpression());
    await evalJs(`(() => { const b = document.querySelector('.fwin[data-section="${surface}"] .fwin-close'); if (b) { b.click(); return 'closed'; } return 'no close button'; })()`);
    await sleep(400);
    rows.push({
      delay,
      atClose: r.atClose,
      closed: r.closed,
      // Anything the reopen itself produced counts too — `post` is cumulative
      // because the collector is only cleared when the next delay is armed.
      errs: post.errs, rejs: post.rejs, cons: post.cons,
      leftOnDesk: r.fwins,
      reopen: again,
    });
  }
  return { surface, rows };
}

async function main() {
  const surfaces = args.all ? ALL_SURFACES : args.surfaces;
  if (!surfaces.length) { console.error('give --surfaces a,b or --all'); process.exit(2); }

  const before = await openSections();
  console.log(`desk at start: ${before.length} windows [${before.join(', ')}]`);

  if (PASS === 'midload') {
    // A warm renderer renders `library` in full inside 60 ms, so every delay lands
    // AFTER the load and the pass measures nothing. `--reload` makes the FIRST open
    // of each surface a genuinely cold one: the lazy chunk is refetched and the data
    // IPC has not run. Only ever pass it for a window whose desk is empty and yours.
    if (args.reload) {
      if (before.length) { console.error(`refusing --reload: the desk has ${before.length} window(s) on it`); process.exit(2); }
      await post('/reload', args.window ? { window: Number(args.window) } : {});
      for (let i = 0; i < 60; i += 1) {
        await sleep(1000);
        try { if (await evalJs(`!!document.querySelector('.os-taskbar, .taskbar, [class*="taskbar"]')`)) break; } catch { /* still navigating */ }
      }
      console.log('reloaded — every first open below is a COLD chunk');
    }
    console.log(await evalJs(midloadInstallExpression()));
    const results = [];
    let noisy = 0; let late = 0; let dead = 0;
    for (const s of surfaces) {
      if (MIDLOAD_SKIP.has(s)) { console.log(`${s}: SKIPPED by list (destructive to open/close from a script)`); results.push({ surface: s, skipped: 'skip list' }); continue; }
      const openNow = await openSections();
      if (openNow.includes(s)) { console.log(`${s}: SKIPPED — already on the desk, and closing it would be someone else's window`); results.push({ surface: s, skipped: 'already open' }); continue; }
      let row;
      try { row = await midloadSurface(s); } catch (e) { results.push({ surface: s, error: String(e.message) }); console.log(`${s}: ERROR ${e.message}`); continue; }
      results.push(row);
      for (const r of row.rows) {
        const ac = r.atClose || {};
        // Three outcomes, and only the first two are evidence:
        //   MID-LOAD    a Suspense fallback was on screen, or the body was empty.
        //   FIRST-FRAME the surface renders its shell synchronously, so there is no
        //               loading state to catch and this is as early as it gets.
        //   LATE        a non-zero delay landed after the load; silence proves nothing.
        let kind = 'MID-LOAD';
        if (!ac.hadWindow) kind = 'NO WINDOW';
        else if (!(ac.loaderOnScreen || ac.bodyChars < 40)) kind = r.delay === 0 ? 'FIRST-FRAME' : 'LATE';
        if (kind === 'LATE' || kind === 'NO WINDOW') late += 1;
        const n = r.errs.length + r.rejs.length + r.cons.length;
        if (n) noisy += 1;
        const reopenDead = r.reopen && r.reopen.reopened && r.reopen.errorBoundary;
        if (reopenDead) dead += 1;
        console.log(
          `  ${s} @ +${r.delay}ms: close=${r.closed} @${ac.atMs}ms [${kind}${ac.loaderOnScreen ? ' loader' : ''}] | at close ${ac.bodyChars} chars / ${ac.bodyNodes} nodes | errors ${r.errs.length} rejections ${r.rejs.length} console.error ${r.cons.length} | left on desk [${r.leftOnDesk.join(', ')}] | reopen ${r.reopen.reopened ? `${r.reopen.bodyChars} chars / ${r.reopen.controls} controls${r.reopen.errorBoundary ? ' ERROR BOUNDARY' : ''}` : 'DID NOT REOPEN'}`,
        );
        for (const e of r.rejs) console.log(`      UNHANDLED REJECTION: ${e.slice(0, 220)}`);
        for (const e of r.errs) console.log(`      ERROR: ${e.slice(0, 220)}`);
        for (const e of r.cons) console.log(`      console.error: ${e.slice(0, 220)}`);
      }
    }
    console.log(await evalJs(midloadUninstallExpression()));
    const after2 = await openSections();
    console.log(`desk at end: ${after2.length} windows [${after2.join(', ')}]`);
    console.log(`\nTOTAL: ${noisy} noisy close/reopen cycles, ${dead} reopens into an error boundary, ${late} cycles that landed after the load (those prove nothing)`);
    if (args.json) {
      fs.writeFileSync(args.json, JSON.stringify({ at: new Date().toISOString(), pass: 'midload', delays: MIDLOAD_DELAYS, before, after: after2, results }, null, 2));
      console.log(`wrote ${args.json}`);
    }
    return;
  }

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

    if (PASS === 'reflow') {
      let row;
      try { row = await reflowSurface(s, scope); } catch (e) { results.push({ surface: s, error: String(e.message) }); continue; }
      row.opened = opened;
      results.push(row);
      if (row.skipped) {
        console.log(`${s}: SKIPPED — ${row.skipped}`);
      } else {
        for (const st of row.states) {
          if (st.skipped) { console.log(`  ${s} @ ${st.label}: SKIPPED — ${st.skipped}`); continue; }
          console.log(
            `  ${s} @ ${st.label} (body ${st.bodyW}px): ${st.controls} controls | UNREACHABLE ${st.unreachable.length} | part-cut ${(st.partiallyCut || []).length} | text clipped ${st.textClipped.length}`,
          );
          for (const u of st.unreachable) console.log(`      UNREACHABLE "${u.text}" ${u.byPx}px past ${u.clipper}  <- ${u.path}`);
          for (const c of st.partiallyCut || []) console.log(`      PART-CUT "${c.text}" loses ${c.lostPx} of ${c.ofPx}px at ${c.clipper}  <- ${c.path}`);
          for (const t2 of st.textClipped) console.log(`      CLIPPED ${t2.box}px box / ${t2.content}px content  ${t2.path}  "${t2.text}"`);
        }
      }
      if (opened) {
        await evalJs(`(() => { const b = document.querySelector('.fwin[data-section="${s}"] .fwin-close'); if (b) { b.click(); return 'closed'; } return 'no close button'; })()`);
        await sleep(400);
      }
      continue;
    }

    if (PASS === 'i18nlive') {
      let r;
      try { r = await evalJs(i18nLiveExpression(scope)); } catch (e) { results.push({ surface: s, error: String(e.message) }); continue; }
      if (r.missing) {
        console.log(`${s}: window did not render`);
        results.push({ surface: s, skipped: 'no window' });
      } else {
        results.push({ surface: s, ...r, opened });
        const byKind = r.hits.reduce((a, h) => { a[h.kind] = (a[h.kind] || 0) + 1; return a; }, {});
        console.log(`${s}: ${r.counted} distinct text runs | ${r.hits.length} leads ${JSON.stringify(byKind)}`);
        for (const h of r.hits) console.log(`    ${h.kind.toUpperCase().padEnd(11)} "${h.text}"   <- ${h.path}`);
      }
      if (opened) {
        await evalJs(`(() => { const b = document.querySelector('.fwin[data-section="${s}"] .fwin-close'); if (b) { b.click(); return 'closed'; } return 'no close button'; })()`);
        await sleep(400);
      }
      continue;
    }

    if (PASS === 'keyboard') {
      let kb;
      try { kb = await evalJs(keyboardExpression(scope)); } catch (e) { results.push({ surface: s, error: String(e.message) }); continue; }
      if (kb.missing) {
        console.log(`${s}: window did not render`);
        results.push({ surface: s, skipped: 'no window' });
      } else {
        results.push({ surface: s, ...kb, opened });
        console.log(
          `${s}: ${kb.focusableCount} focusable | ${kb.pointerCount} clickable | MOUSE-ONLY ${kb.mouseOnly.length} | positive tabindex ${kb.positiveTabindex.length}`,
        );
        for (const m of kb.mouseOnly) console.log(`    MOUSE-ONLY ${m.path}  "${m.text}"`);
        for (const p2 of kb.positiveTabindex) console.log(`    TABINDEX ${p2.tabindex}  ${p2.path}`);
      }
      if (opened) {
        await evalJs(`(() => { const b = document.querySelector('.fwin[data-section="${s}"] .fwin-close'); if (b) { b.click(); return 'closed'; } return 'no close button'; })()`);
        await sleep(400);
      }
      continue;
    }

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

  if (PASS === 'reflow') {
    let un = 0; let pc = 0; let tc = 0; let voided = 0; let noRestore = 0;
    for (const r of results) {
      for (const st of r.states || []) {
        if (st.suspect) { voided += 1; continue; }
        un += (st.unreachable || []).length;
        pc += (st.partiallyCut || []).length;
        tc += (st.textClipped || []).length;
      }
      if (r.states && r.restoredCleanly === false) noRestore += 1;
    }
    console.log(`\nTOTAL: ${un} unreachable controls, ${pc} partly-cut controls, ${tc} clipped text boxes across ${results.length} surfaces (${voided} states VOID, ${noRestore} needed a forced geometry restore)`);
    return;
  }
  if (PASS === 'i18nlive') {
    const tot = results.reduce((a, r) => a + (r.hits ? r.hits.length : 0), 0);
    const kinds = {};
    for (const r of results) for (const h of r.hits || []) kinds[h.kind] = (kinds[h.kind] || 0) + 1;
    console.log(`\nTOTAL: ${tot} leads across ${results.length} surfaces ${JSON.stringify(kinds)} — every one is a LEAD to read, not a defect: study CONTENT is deliberately untranslated.`);
    return;
  }
  if (PASS === 'keyboard') {
    const mo = results.reduce((a, r) => a + (r.mouseOnly ? r.mouseOnly.length : 0), 0);
    const pt = results.reduce((a, r) => a + (r.positiveTabindex ? r.positiveTabindex.length : 0), 0);
    console.log(`
TOTAL: ${mo} mouse-only controls, ${pt} positive tabindex across ${results.length} surfaces`);
    return;
  }
  const totUn = results.reduce((a, r) => a + (r.unnamed ? r.unnamed.length : 0), 0);
  const totVo = results.reduce((a, r) => a + (r.visualOnly ? r.visualOnly.length : 0), 0);
  console.log(`\nTOTAL: ${totUn} unnamed controls, ${totVo} visual-only states across ${results.length} surfaces`);
}

main().catch((e) => { console.error(String(e && e.stack || e)); process.exit(1); });
