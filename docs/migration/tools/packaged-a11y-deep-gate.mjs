#!/usr/bin/env node
// The four accessibility items slice 47k deliberately did NOT cover — Phase 9 / slice 50.
//
// `progress.json` `phase9.untouched` carries: "Accessibility: keyboard walk, contrast, artwork
// surfaces, and the player overlay." Slice 47k measured the mechanical DOM floor (names, labels,
// ids, lang) and recorded, in its own words, that it "is a floor not a claim": no keyboard walk,
// no contrast, no artwork (`imagesWithoutAlt` was 0 out of **0 images**), no player surfaces.
// This gate is those four, and nothing else — `packaged-a11y-gate.mjs` still owns the floor.
//
// ## Each phase has to be able to fail for the right reason
//
// A. **Keyboard walk.** Real `Input.dispatchKeyEvent` Tab presses, not `el.focus()` in a loop.
//    A loop over `focus()` measures the DOM; only the browser's own sequential-navigation
//    algorithm measures the tab order a user gets. The discriminator is blunt: if the focused
//    element never changes across the whole walk, the KEYS DID NOT ARRIVE, and the run reports
//    an instrument failure rather than "the app is one giant focus trap". Electron will happily
//    swallow input for an unfocused window, which is exactly the shape of a false finding.
//
// B. **Contrast.** Computed numerically (WCAG 2.1 relative luminance) over the real painted
//    text, with alpha composited down the ancestor chain. It **self-tests first**: two probes
//    with known answers — #000 on #fff (21.00) and #777 on #888 (~1.24) — are injected, measured
//    and removed, and the phase refuses to report a single app number unless the measurer got
//    both right. Text sitting on a `background-image` is reported as UNMEASURABLE, never
//    silently attributed to the colour underneath it, because that is how a gradient becomes a
//    fake pass.
//
// C. **Artwork surfaces.** 47k's `imagesWithoutAlt: 0` was 0-out-of-0 — a check that never met
//    its subject. So this phase asserts on the SUBJECT FIRST: if it cannot find images, it
//    reports UNTESTED. It also asks the question the attribute check cannot: `alt=""` is correct
//    for decorative art and wrong for a poster that is the only identifier of a title, so each
//    image is scored against whether its own card carries the title as text.
//
// D. **Player overlay.** Opened through the app's own `os:open` route and recorded as found —
//    including "the overlay did not mount", which is a real answer about reachability and is
//    reported as such rather than as a pass.
//
// ## Traps this file is already written around
//
//   - **Viewport.** Anything that resets the window can leave the pane 0x0, at which point every
//     rect, every `visible()` test and every contrast sample is fiction. The gate sets explicit
//     device metrics and then RE-READS `document.documentElement.clientWidth`, recording it.
//   - **Mid-transition styles.** `getComputedStyle` immediately after focus returns the value
//     part-way through the transition; a 150 ms focus reveal reads as absent. Every style read
//     here waits out `SETTLE_MS`.
//   - **A warmed profile is not a first run.** The scratch profile is unique per process.
//
// ## Slice 55 additions
//
//   - **`distinctStops` is a STRING count and `focusableVisible` is an ELEMENT count.** Printing
//     them as "10 / 11" invented a missing tab stop that does not exist: `distinctStops` is a
//     `Set` keyed by `__describe(el) + '|' + __name(el)`, so two elements that render the same
//     description and carry the same accessible name collapse into one entry. On this app the
//     taskbar tray mounts `<NotificationBell />` TWICE (DesktopShell.tsx), the tray is in every
//     window, and that is the whole of slice 50's "every surface is exactly one short". The walk
//     already knew better — `unreachedByTab` was empty and `coveredAllFocusable` true on all four
//     surfaces — but the two readings sat next to each other unreconciled. `stopsReachedByIdentity`
//     and `describeCollisions` are added so the next off-by-one names itself.
//   - **Non-text contrast (WCAG 1.4.11).** Text contrast alone is half of 1.4.x. Interactive
//     controls are now measured at 3:1 for their visual boundary, and focus rings for theirs. A
//     control with no border and no background is reported as BOUNDARY-LESS and NOT scored,
//     because it is identified by its text and that is 1.4.3's job, not 1.4.11's — scoring it
//     either way would be a number about nothing.
//   - **An artwork FIXTURE (`--fixture`).** 47k's `imagesWithoutAlt: 0` was 0-out-of-0; slice 50's
//     was 3 distinct images. Neither is coverage. `--fixture` seeds `media.json` + real poster
//     bytes and `library.json` + real cover bytes into the scratch profile BEFORE launch, so the
//     poster grid and the book shelf actually paint. What was written is recorded, hashed, in the
//     output — a fixture that silently failed to load must not read as "the app has no art".
//   - **`SEANIME_DATADIR` is pinned into the scratch tree.** It was inherited before; an operator
//     with it exported would have pointed a throwaway run at a real datadir.
//
// usage:
//   node docs/migration/tools/packaged-a11y-deep-gate.mjs
//   node docs/migration/tools/packaged-a11y-deep-gate.mjs --exe=out/…/jp-study-app.exe
//   node docs/migration/tools/packaged-a11y-deep-gate.mjs --fixture

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');

const arg = (name, fallback = '') => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const EXE = path.resolve(arg('exe')
  || path.join(REPO, 'out', 'jp-study-app-win32-x64', 'jp-study-app.exe'));

const VIEWPORT = { width: 1600, height: 1000 };
/** Long enough for a 150 ms focus reveal to finish. See the trap note above. */
const SETTLE_MS = 320;
const TAB_BUDGET = Number(arg('tabs', '60'));
const WANT_FIXTURE = process.argv.slice(2).includes('--fixture');
/** `--theme=frutiger-aero` measures a non-default palette. See step 0a for why this exists. */
const THEME = arg('theme', '');
/**
 * `--pixels` turns on the slice-73 PIXEL sampler (`a11y-pixel-sampler.mjs`) alongside the CSS
 * colour path. OFF BY DEFAULT AND DELIBERATELY SO: without the flag this file behaves exactly as
 * it did before slice 73, so the measurer that produced every number on this track cannot be
 * disturbed by the new one.
 *
 * Why the new one exists: slice 72 ran B2 against `--theme=frutiger-aero` and it reported PASS on
 * 8 scored controls out of 251 — 97% UNMEASURABLE, because a glass theme's boundaries sit over
 * gradients and translucency and have no single CSS backdrop colour to resolve. The measurer was
 * right to decline; the problem is that an invisible failure and an absent failure produce
 * byte-identical output. The pixel path samples what is actually PAINTED, so glass stops being
 * invisible to the gate.
 *
 * BOTH paths are reported. Where they disagree, that disagreement is the finding: the CSS path
 * knows what was DECLARED, the pixel path knows what was PAINTED, and slice 62 found a ring
 * declared opaque that painted at 16% alpha. See `out.contrastPathDisagreement`.
 */
const WANT_PIXELS = process.argv.slice(2).includes('--pixels');

const stamp = process.env.RUN_STAMP
  ?? new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '');
const workRoot = path.join(REPO, 'docs/migration/proof', `packaged-a11y-deep-${stamp}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logLines = [];
const log = (m) => { const l = `[a11y-deep] ${m}`; logLines.push(l); console.log(l); };

const out = {
  gate: 'packaged-a11y-deep-gate.mjs',
  question: 'Keyboard walk, contrast, artwork surfaces and the player overlay — the four '
    + 'accessibility items slice 47k recorded as NOT covered.',
  startedAt: new Date().toISOString(),
  exe: EXE,
  viewportRequested: VIEWPORT,
  steps: [],
  keyboard: [],
  contrast: null,
  artwork: null,
  player: null,
};
function step(name, result, detail, extra = {}) {
  out.steps.push({ name, result, detail, ...extra });
  log(`${result} — ${name}: ${detail}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function findTarget(port, deadline, match, label) {
  let seen = [];
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await res.json();
      seen = targets.filter((t) => t.type === 'page').map((t) => t.url);
      // Test the SCHEME: Electron exposes an about:blank before the window navigates, and
      // evaluating against it fails as an access error that reads like a permissions problem.
      const page = targets.find((t) => t.type === 'page'
        && /^(https?|app):\/\//.test(t.url) && match(t.url));
      if (page?.webSocketDebuggerUrl) return page;
    } catch { /* not up */ }
    await sleep(400);
  }
  throw new Error(`no CDP target for ${label}; saw ${JSON.stringify(seen)}`);
}

class Cdp {
  constructor(url) { this.url = url; this.nextId = 1; this.pending = new Map(); }
  async open() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener('message', (event) => {
      let msg; try { msg = JSON.parse(String(event.data)); } catch { return; }
      if (msg.id == null) return;
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      entry.resolve(msg);
    });
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true });
    });
    return this;
  }
  send(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve });
      this.socket.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.delete(id)) reject(new Error(`${method} timed out`)); }, 60_000);
    });
  }
  async evaluate(expression) {
    const msg = await this.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true, userGesture: true,
    });
    if (msg.result?.exceptionDetails) {
      throw new Error(msg.result.exceptionDetails.exception?.description ?? 'evaluate threw');
    }
    return msg.result?.result?.value;
  }
  close() { try { this.socket?.close(); } catch { /* gone */ } }
}

// ────────────────────────────────────────────────────────────────────────────────
// Page-side helpers, shared by every phase. Written as plain concatenation rather
// than template literals so this file can embed them without escaping wars.
// ────────────────────────────────────────────────────────────────────────────────
const HELPERS = `
  const __visible = (el) => {
    if (!(el instanceof Element)) return false;
    if (el.closest('[aria-hidden="true"]')) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const __describe = (el) => {
    if (!el) return 'null';
    if (el === document.body) return 'body';
    const cls = typeof el.className === 'string' && el.className
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls;
  };
  const __name = (el) => {
    if (!el) return '';
    const aria = (el.getAttribute('aria-label') || '').trim();
    if (aria) return aria;
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const txt = by.split(/\\s+/).map((id) => (document.getElementById(id) || {}).textContent || '')
        .join(' ').trim();
      if (txt) return txt;
    }
    const title = (el.getAttribute('title') || '').trim();
    if (title) return title;
    const svgt = el.querySelector && el.querySelector('svg > title');
    if (svgt && svgt.textContent.trim()) return svgt.textContent.trim();
    return (el.textContent || '').trim().slice(0, 60);
  };
  /**
   * WHERE the name came from, not just whether there was one — added in slice 53.
   *
   * __name() above accepts \`title\`, one step before falling back to textContent. That is
   * defensible as a "would a user hear anything at all" floor, but it is NOT the accname
   * precedence that slice 52's source gate pins: \`title\` is only the last-resort fallback and
   * is not announced by every screen reader, so sliderAccessibleName.test.ts rejects it
   * outright. With only __name(), a control carrying title="Volume" and no aria-label reads
   * exactly like a correctly named one — which is precisely the state the music widget's
   * volume slider was in when slice 50 measured it and reported the name "Volume".
   *
   * Returning the SOURCE makes the two artifacts distinguishable on the one attribute the fix
   * actually changed, instead of collapsing them to the same string.
   */
  const __nameInfo = (el) => {
    if (!el) return { name: '', source: 'none' };
    const aria = (el.getAttribute('aria-label') || '').trim();
    if (aria) return { name: aria, source: 'aria-label' };
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const txt = by.split(/\\s+/).map((id) => (document.getElementById(id) || {}).textContent || '')
        .join(' ').trim();
      if (txt) return { name: txt, source: 'aria-labelledby' };
    }
    if (el.id) {
      const lf = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      const t = lf && (lf.textContent || '').trim();
      if (t) return { name: t, source: 'label[for]' };
    }
    const wrap = el.closest && el.closest('label');
    if (wrap && (wrap.textContent || '').trim()) {
      return { name: (wrap.textContent || '').trim().slice(0, 60), source: 'wrapping-label' };
    }
    const title = (el.getAttribute('title') || '').trim();
    if (title) return { name: title, source: 'title' };
    const ph = (el.getAttribute('placeholder') || '').trim();
    if (ph) return { name: ph, source: 'placeholder' };
    const txt = (el.textContent || '').trim();
    if (txt) return { name: txt.slice(0, 60), source: 'text' };
    return { name: '', source: 'none' };
  };
  /**
   * An ancestor chain, because __describe() renders a class-less <input> as bare "input" —
   * which is how slice 50's real finding (the media-center player bar's volume slider) and a
   * different nameless field became indistinguishable strings in the same array.
   */
  const __path = (el) => {
    const parts = [];
    let n = el;
    for (let i = 0; i < 4 && n && n !== document.body; i += 1) {
      parts.unshift(__describe(n));
      n = n.parentElement;
    }
    return parts.join(' > ');
  };
`;

/** WCAG maths + the ancestor composite. Used by the contrast phase and by its self-test. */
const CONTRAST_MATH = `
  const __parse = (s) => {
    const text = String(s);
    // color(srgb r g b / a) — Chrome emits this wherever a colour came through color-mix(),
    // which this app uses heavily. It was previously unparseable, so any boundary declared that
    // way scored as ABSENT rather than as a measured value: a silent null, not a visible gap.
    // Components are 0..1 here, unlike rgb().
    const cs = text.match(/color\\(\\s*srgb\\s+([^)]+)\\)/);
    if (cs) {
      const q = cs[1].split(/[\\s\\/]+/).filter(Boolean).map((v) => parseFloat(v));
      if (q.length >= 3 && !q.slice(0, 3).some((v) => Number.isNaN(v))) {
        return {
          r: q[0] * 255, g: q[1] * 255, b: q[2] * 255,
          a: q.length > 3 && !Number.isNaN(q[3]) ? q[3] : 1,
        };
      }
    }
    const m = text.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(/[,\\s\\/]+/).filter(Boolean).map((v) => parseFloat(v));
    if (p.length < 3 || p.some((v) => Number.isNaN(v))) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const __srcOver = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const __lum = (c) => {
    const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const __ratio = (a, b) => {
    const l1 = __lum(a); const l2 = __lum(b);
    const hi = Math.max(l1, l2); const lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  };
  /**
   * The effective background BEHIND an element: walk up compositing every semi-transparent
   * layer. Returns { color } or { unmeasurable: reason } — a background-image is NOT resolved
   * to the colour under it, because doing that is how a gradient scores a fake pass.
   *
   * It also returns opacityProduct: the product of every CSS opacity between the text and the
   * element that paints the opaque backdrop. THIS IS A FALSE-PASS FIX, not a refinement. The
   * first version read the color and composited its alpha but ignored opacity entirely, so a
   * label styled "opacity: .45" -- which is how this app mutes secondary text, and
   * renderer/styles.css does it at .4/.45/.5/.55/.65 in dozens of places -- was scored at full
   * strength. Every one of those samples was reported more legible than it is painted, and the
   * error runs in the direction that manufactures a pass.
   */
  const __backdrop = (el) => {
    const layers = [];
    let node = el;
    let opacityBelow1 = false;
    let opacityProduct = 1;
    while (node && node !== document) {
      const s = getComputedStyle(node);
      const o = parseFloat(s.opacity);
      if (!Number.isNaN(o) && o < 1) {
        opacityBelow1 = true;
        opacityProduct *= o;
      }
      if (s.backgroundImage && s.backgroundImage !== 'none') {
        return { unmeasurable: 'background-image on ' + __describe(node), opacityBelow1 };
      }
      const c = __parse(s.backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        // This node paints the opaque backdrop. Opacity applied AT or ABOVE it fades the
        // backdrop and the text together and does not change their ratio, so stop counting.
        if (c.a >= 0.999) break;
      }
      node = node.parentElement;
    }
    if (!layers.length || layers[layers.length - 1].a < 0.999) {
      // Nothing opaque was found before the root. Chrome paints the canvas white by default,
      // so that is the honest base, and the sample is flagged so it can be discounted.
      layers.push({ r: 255, g: 255, b: 255, a: 1 });
    }
    let acc = layers[layers.length - 1];
    for (let i = layers.length - 2; i >= 0; i -= 1) acc = __srcOver(layers[i], acc);
    return { color: acc, opacityBelow1, opacityProduct };
  };
`;

/**
 * THE SELF-TEST. Two probes with arithmetic answers nobody has to trust: black on white is
 * exactly 21, and #777 on #888 is ~1.24 (a real WCAG failure). If the measurer disagrees with
 * either, every app number it produces afterwards is fiction, so the phase stops.
 */
const CONTRAST_SELFTEST = `(() => {
${HELPERS}
${CONTRAST_MATH}
  const host = document.createElement('div');
  host.id = '__a11y_selftest';
  host.setAttribute('style', 'position:fixed;left:0;top:0;z-index:2147483647;');
  host.innerHTML = '<div style="background:#ffffff"><span id="__st_pass" style="color:#000000;font-size:16px">pass probe</span></div>'
    + '<div style="background:#888888"><span id="__st_fail" style="color:#777777;font-size:16px">fail probe</span></div>'
    + '<div style="background-image:linear-gradient(#000,#fff)"><span id="__st_img" style="color:#ffffff;font-size:16px">image probe</span></div>'
    // White on black at opacity .5 is 5.28, not 21. This probe exists because the first
    // version of this gate scored it 21 -- it read the color and ignored opacity entirely.
    + '<div style="background:#000000"><span id="__st_op" style="color:#ffffff;opacity:0.5;font-size:16px">opacity probe</span></div>';
  document.body.appendChild(host);
  const read = (id) => {
    const el = document.getElementById(id);
    const back = __backdrop(el);
    if (back.unmeasurable) return { unmeasurable: back.unmeasurable };
    const fg = __parse(getComputedStyle(el).color);
    const alpha = fg.a * (back.opacityProduct ?? 1);
    const painted = __srcOver({ r: fg.r, g: fg.g, b: fg.b, a: alpha }, back.color);
    return {
      ratio: Math.round(__ratio(painted, back.color) * 100) / 100,
      opacityProduct: back.opacityProduct ?? 1,
    };
  };
  const result = {
    blackOnWhite: read('__st_pass'),
    greyOnGrey: read('__st_fail'),
    overImage: read('__st_img'),
    whiteOnBlackAtHalfOpacity: read('__st_op'),
  };
  host.remove();
  return JSON.stringify(result);
})()`;

/** The contrast sweep over the real painted text of the current surface. */
const CONTRAST_SWEEP = `(() => {
${HELPERS}
${CONTRAST_MATH}
  const samples = [];
  const unmeasurable = [];
  const all = document.querySelectorAll('body *');
  for (const el of all) {
    // Only elements that PAINT text themselves. A wrapper whose text comes from a child
    // would be counted once per level of nesting and drown the real samples.
    let text = '';
    for (const n of el.childNodes) if (n.nodeType === 3) text += n.nodeValue;
    text = text.replace(/\\s+/g, ' ').trim();
    if (!text) continue;
    if (!__visible(el)) continue;
    const s = getComputedStyle(el);
    const fg = __parse(s.color);
    if (!fg) continue;
    if (fg.a === 0) continue;
    const size = parseFloat(s.fontSize) || 16;
    const weight = parseInt(s.fontWeight, 10) || 400;
    // WCAG "large text": >=24px, or >=18.66px when bold.
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    // Start at el, NOT at its parent. An element's own background-color is painted behind its
    // own text, and its own opacity fades that text -- starting at the parent discarded both.
    // (Passing the parent also meant a span carrying its own background was scored against
    // whatever was behind the span.)
    const back = __backdrop(el);
    // WCAG 1.4.3 exempts "inactive user interface components" outright. A disabled control's
    // text is allowed to be low contrast, so it is measured and reported like everything else
    // but tagged, and the headline failure count subtracts it rather than quietly keeping a
    // number the standard does not ask for.
    const inactive = !!el.closest('[disabled], [aria-disabled="true"], fieldset[disabled]');
    const entry = {
      el: __describe(el),
      path: __path(el),
      text: text.slice(0, 40),
      color: s.color,
      fontSize: size,
      fontWeight: weight,
      large,
      inactive,
    };
    if (back.unmeasurable) {
      unmeasurable.push(Object.assign(entry, { reason: back.unmeasurable }));
      continue;
    }
    // The alpha that is actually PAINTED: the colour's own alpha times every opacity between
    // the text and its opaque backdrop.
    const effectiveAlpha = fg.a * (back.opacityProduct ?? 1);
    const painted = __srcOver({ r: fg.r, g: fg.g, b: fg.b, a: effectiveAlpha }, back.color);
    const r = __ratio(painted, back.color);
    const naive = __ratio(__srcOver(fg, back.color), back.color);
    samples.push(Object.assign(entry, {
      background: 'rgb(' + Math.round(back.color.r) + ', ' + Math.round(back.color.g)
        + ', ' + Math.round(back.color.b) + ')',
      // DECLARED vs COMPOSITED, both kept. The color field above is what the stylesheet says;
      // this is what the pixel ends up being after its own alpha and every ancestor opacity.
      // Quoting a ratio without saying which one produced it is how a contrast number becomes
      // fiction.
      colorPainted: 'rgb(' + Math.round(painted.r) + ', ' + Math.round(painted.g)
        + ', ' + Math.round(painted.b) + ')',
      ratio: Math.round(r * 100) / 100,
      // What this sample WOULD have scored without the opacity term, kept so the size of the
      // correction is visible in the record rather than asserted in prose.
      ratioIgnoringOpacity: Math.round(naive * 100) / 100,
      opacityProduct: Math.round((back.opacityProduct ?? 1) * 1000) / 1000,
      required: large ? 3 : 4.5,
      passes: r >= (large ? 3 : 4.5),
      opacityBelow1: !!back.opacityBelow1,
    }));
  }
  return JSON.stringify({ samples, unmeasurable });
})()`;

/**
 * NON-TEXT CONTRAST — WCAG 1.4.11, 3:1 — slice 55.
 *
 * Text contrast is only half of 1.4.x, and the half this gate already had. 1.4.11 asks a
 * different question: can you SEE the control at all — its boundary against what surrounds it.
 *
 * Three things this probe refuses to fake:
 *
 *  - **A control with no border and no background is not a failure, it is out of scope.** A bare
 *    text button is identified by its text, and its text is 1.4.3's business. Scoring its
 *    invisible boundary at 1.00 would manufacture dozens of failures that the standard does not
 *    ask for; scoring it as a pass would hide the ones that are real. It is reported as
 *    `boundaryKind: 'none'` and excluded from the denominator, which is a third answer and the
 *    only honest one.
 *  - **The backdrop is the one OUTSIDE the control**, composited, taken from the parent up — the
 *    control's own background is the foreground here, not part of the backdrop.
 *  - **Ancestor opacity is deliberately NOT applied.** An opacity above the control fades the
 *    control and its surroundings together and cannot change the ratio between them; only the
 *    control's OWN opacity can, and only that is applied. (This is the opposite of the text
 *    case, where the ancestor fades the text but not the backdrop it is measured against, and
 *    getting it backwards in either direction invents a number.)
 */
const NONTEXT_CONTRAST = `(() => {
${HELPERS}
${CONTRAST_MATH}
  const SEL = 'button, a[href], input:not([type="hidden"]), select, textarea, '
    + '[role="button"], [role="tab"], [role="checkbox"], [role="switch"], [role="slider"], '
    + '[role="radio"], [role="menuitem"]';
  const rows = [];
  for (const el of document.querySelectorAll(SEL)) {
    if (!__visible(el)) continue;
    const s = getComputedStyle(el);
    const parent = el.parentElement || document.body;
    const outside = __backdrop(parent);
    /**
     * WHAT THE BOUNDARY IS CARRYING. A single "below 3:1" count is not a WCAG verdict, and
     * reporting one would be the same error as the 10/11 tab reading.
     *
     * 1.4.11 asks for 3:1 on "visual information REQUIRED TO IDENTIFY user interface components
     * and states". A text button with a barely-there fill is identified by its text — 1.4.3
     * covers that, and the faint fill is decoration. But three cases are genuinely load-bearing:
     *
     *   identity   — no text at all, so the box IS the control (icon buttons, empty targets)
     *   affordance — select/input/textarea, where the box is what says "you can type/choose here"
     *   state      — the fill or border is the ONLY thing marking active/selected/pressed
     *
     * Those three carry the verdict; the rest is reported next to it and not counted as a
     * failure, so the number that appears in a handoff is one somebody can act on.
     */
    const ownText = (el.textContent || '').replace(/\\s+/g, ' ').trim();
    const tag = el.tagName.toLowerCase();
    const formControl = tag === 'select' || tag === 'input' || tag === 'textarea';
    const cls = typeof el.className === 'string' ? el.className : '';
    const stateful = /(^|\\s|-)(active|selected|current|on)(\\s|$)/.test(cls)
      || el.getAttribute('aria-selected') === 'true'
      || el.getAttribute('aria-pressed') === 'true'
      || el.getAttribute('aria-checked') === 'true'
      || el.getAttribute('aria-current') != null;
    const role = formControl ? 'affordance'
      : !ownText ? 'identity'
      : stateful ? 'state'
      : 'decorative';
    const base = {
      el: __describe(el),
      path: __path(el),
      name: __nameInfo(el).name.slice(0, 40),
      inactive: !!(el.disabled || el.getAttribute('aria-disabled') === 'true'),
      hasText: !!ownText,
      boundaryRole: role,
    };
    if (outside.unmeasurable) {
      rows.push(Object.assign(base, { unmeasurable: outside.unmeasurable }));
      continue;
    }
    if (s.backgroundImage && s.backgroundImage !== 'none') {
      rows.push(Object.assign(base, { unmeasurable: 'background-image on the control itself' }));
      continue;
    }
    const selfOpacity = Number.isNaN(parseFloat(s.opacity)) ? 1 : parseFloat(s.opacity);
    const back = outside.color;
    const sides = ['Top', 'Right', 'Bottom', 'Left'];
    let border = null;
    let borderWidth = 0;
    let borderSide = null;
    for (const side of sides) {
      const w = parseFloat(s['border' + side + 'Width']) || 0;
      const style = s['border' + side + 'Style'];
      if (w <= 0 || style === 'none' || style === 'hidden') continue;
      const c = __parse(s['border' + side + 'Color']);
      if (!c || c.a === 0) continue;
      if (w > borderWidth) { borderWidth = w; border = c; borderSide = side; }
    }
    const own = __parse(s.backgroundColor);
    const ownVisible = own && own.a > 0.02;
    /**
     * A PSEUDO-ELEMENT MARKER is a boundary too, and missing it manufactured FIFTEEN failures.
     *
     * Slice 62 reported 15 load-bearing state failures on the taskbar — .os-desktop-switch.active
     * and .os-task-win.active, scored at 1.35:1 on an 11 percent --text wash. Every one was wrong.
     * shell.css overrides the baseline rules, explicitly sets box-shadow: none and border-color:
     * transparent on the active state, and draws the actual indicator as an ::after pseudo-element:
     * a 16x2px full-opacity var(--accent) pill at the bottom centre, the Windows 11 taskbar
     * underline. getComputedStyle(el) cannot see a pseudo-element, so the probe scored the quiet
     * wash the design intends as a backing surface and never saw the cue a user actually reads.
     *
     * This is the same error as the ring, one layer further out, and it is worth stating why it
     * kept happening: each version of this probe scored the layers it knew about and reported a
     * confident number, and a control whose indicator lives somewhere unexamined is indistinguish-
     * able from a control with no indicator. The fix is not "add one more layer" but to keep
     * asking, of every failure, WHICH LAYER IS THE DESIGN USING - see the raw* fields below.
     *
     * Scored against the control's OWN painted fill, not the outside backdrop: this marker sits
     * inside the control, so the fill is the adjacent colour 1.4.11 asks about. That is the
     * stricter of the two readings (3.55:1 here versus 4.79:1 against the taskbar).
     */
    const markerOf = () => {
      let best = null;
      for (const which of ['::after', '::before']) {
        const ps = getComputedStyle(el, which);
        if (!ps) continue;
        // A pseudo that was never generated reports content 'none' and size 'auto'.
        if (!ps.content || ps.content === 'none' || ps.content === 'normal') continue;
        const c = __parse(ps.backgroundColor);
        if (!c || c.a <= 0.02) continue;
        const w = parseFloat(ps.width) || 0;
        const h = parseFloat(ps.height) || 0;
        if (w <= 0 || h <= 0) continue;
        if (!best || c.a > best.colour.a) best = { colour: c, which, w: w, h: h };
      }
      return best;
    };
    const marker = markerOf();
    if (!border && !ownVisible && !marker) {
      rows.push(Object.assign(base, {
        boundaryKind: 'none',
        note: 'no border, background or pseudo-element marker — identified by its text, so 1.4.3 '
          + 'covers it and 1.4.11 does not apply; NOT scored',
      }));
      continue;
    }
    /**
     * THE BEST of fill and border, not the first one found.
     *
     * The first version scored the border whenever there was one, and it manufactured failures:
     * this app's buttons routinely pair a solid, high-contrast FILL with a 1px hairline border at
     * something like rgba(255,255,255,0.06). The hairline is nowhere near 3:1 and does not need
     * to be — 1.4.11 asks for the visual information REQUIRED TO IDENTIFY the component, and the
     * fill already supplies it. Scoring the hairline reported a control that is perfectly
     * visible as a contrast failure. Both are measured, the stronger one carries the verdict,
     * and the loser is kept in the record so the choice is auditable rather than asserted.
     */
    const scoreOf = (c) => {
      if (!c) return null;
      const painted = __srcOver({ r: c.r, g: c.g, b: c.b, a: c.a * selfOpacity }, back);
      return {
        painted: 'rgb(' + Math.round(painted.r) + ', ' + Math.round(painted.g) + ', '
          + Math.round(painted.b) + ')',
        ratio: Math.round(__ratio(painted, back) * 100) / 100,
      };
    };
    /**
     * A RING drawn with box-shadow is a boundary too, and missing it manufactured failures.
     *
     * Slice 58 reported 4 load-bearing "state" failures. All four were wrong: this app marks a
     * selected control with an accent RING — .gram-level-btn.active sets
     * box-shadow: inset 0 0 0 1px var(--accent) together with border-color: var(--accent) —
     * and scoring only backgroundColor read the unchanged --panel-2 fill at 1.29:1 while the
     * actual state indicator sits at 5.33:1, a number this same gate measures in B3. Reporting a
     * clearly-marked control as a state-contrast failure is the same class of error the
     * fill-vs-border note above already fixed once: scoring a boundary the design does not use.
     *
     * Only a CRISP ring counts. A soft glow is not a boundary, so blur must be small and the
     * spread must actually paint. Computed form: rgb(r, g, b) Xpx Ypx BLURpx SPREADpx [inset].
     *
     * NOTE: this block lives inside a template literal. No backticks anywhere in it — a backtick
     * here ends the probe string and the file stops parsing, with the error pointing at prose.
     */
    const ringOf = (decl) => {
      if (!decl || decl === 'none') return null;
      // EVERY layer, not the first. Computed box-shadow is comma-separated and this app routinely
      // puts a soft drop shadow FIRST and the indicator second — the first version read
      // rgba(0,0,0,0.14) 0 1px 2px 0 (a drop shadow), rejected it, and never looked further.
      // A layer counts as a boundary when it is crisp (small blur) and actually paints an edge:
      // either a spread, or an OFFSET, which is how a left-bar indicator is drawn.
      // DOUBLE backslashes: this whole function lives inside a template literal that is sent to
      // the page, so a single \\s reaches the browser as a bare 's'. The first version used single
      // ones and emitted /(rgba?([^)]*)|color([^)]*))s+(-?[d.]+)px.../ — a regex that matches
      // nothing, silently. ringRatio was null in every run and the state count never moved, which
      // reads exactly like "this app has no rings" rather than "this probe is broken".
      const rx = /(rgba?\\([^)]*\\)|color\\([^)]*\\))\\s+(-?[\\d.]+)px\\s+(-?[\\d.]+)px\\s+(-?[\\d.]+)px\\s+(-?[\\d.]+)px/g;
      let best = null;
      let m;
      while ((m = rx.exec(decl))) {
        const dx = parseFloat(m[2]);
        const dy = parseFloat(m[3]);
        const blur = parseFloat(m[4]);
        const spread = parseFloat(m[5]);
        // A SPREAD may carry a little blur and still read as a ring. An OFFSET may not: an
        // offset with blur IS a drop shadow, and this app's standard one --
        // rgba(0,0,0,0.14) 0 1px 2px 0 -- would otherwise qualify (blur 2, dy 1) and hand a
        // ~1.1:1 candidate to controls that legitimately have no boundary at all, turning
        // "identified by its text, NOT scored" into a manufactured failure.
        const isRing = spread >= 1 && blur <= 2;
        const isBar = blur === 0 && (Math.abs(dx) >= 1 || Math.abs(dy) >= 1);
        if (!isRing && !isBar) continue;
        const c = __parse(m[1]);
        if (!c || c.a <= 0.02) continue;
        const cand = { colour: c, spread, dx, dy };
        // Keep the most opaque qualifying layer; a 16% wash and a solid bar are both "rings"
        // syntactically, and only the stronger one can be what identifies the control.
        if (!best || c.a > best.colour.a) best = cand;
      }
      return best;
    };
    const ring = ringOf(s.boxShadow);

    const borderScore = scoreOf(border);
    const fillScore = ownVisible ? scoreOf(own) : null;
    const ringScore = ring ? scoreOf(ring.colour) : null;
    // What the control's fill ACTUALLY paints as — the marker sits on top of this, not on the
    // backdrop outside the control, so this is the adjacent colour for a marker.
    const ownPainted = ownVisible
      ? __srcOver({ r: own.r, g: own.g, b: own.b, a: own.a * selfOpacity }, back)
      : back;
    const markerScore = !marker ? null : (() => {
      const m = marker.colour;
      const painted = __srcOver({ r: m.r, g: m.g, b: m.b, a: m.a * selfOpacity }, ownPainted);
      return {
        painted: 'rgb(' + Math.round(painted.r) + ', ' + Math.round(painted.g) + ', '
          + Math.round(painted.b) + ')',
        ratio: Math.round(__ratio(painted, ownPainted) * 100) / 100,
      };
    })();
    // The STRONGEST of the four carries the verdict; the losers stay in the record so the choice
    // is auditable rather than asserted.
    const candidates = [
      borderScore ? { kind: 'border', score: borderScore } : null,
      fillScore ? { kind: 'background', score: fillScore } : null,
      ringScore ? { kind: 'ring', score: ringScore } : null,
      markerScore ? { kind: 'marker', score: markerScore } : null,
    ].filter(Boolean);
    if (!candidates.length) {
      rows.push(Object.assign(base, {
        boundaryKind: 'none',
        note: 'no border, background or ring — identified by its text; NOT scored',
      }));
      continue;
    }
    const winner = candidates.reduce((a, b) => (b.score.ratio > a.score.ratio ? b : a));
    const best = winner.score;
    const kind = winner.kind;
    const useBorder = kind === 'border';
    rows.push(Object.assign(base, {
      boundaryKind: kind,
      borderSide: border ? borderSide : null,
      borderWidth: border ? Math.round(borderWidth * 100) / 100 : null,
      declared: kind === 'border' ? s['border' + borderSide + 'Color']
        : kind === 'ring' ? s.boxShadow
          : kind === 'marker' ? marker.which + ' background ' + getComputedStyle(el, marker.which).backgroundColor
            : s.backgroundColor,
      ringRatio: ringScore ? ringScore.ratio : null,
      markerRatio: markerScore ? markerScore.ratio : null,
      // Which pseudo carried it and how big it is, so a 2px underline can be told from a full
      // overlay, and so a null markerRatio can be told apart from a marker the probe failed to see.
      rawMarker: marker ? (marker.which + ' ' + marker.w + 'x' + marker.h + ' '
        + getComputedStyle(el, marker.which).backgroundColor) : null,
      // Raw inputs to the boundary decision, so a null ratio can be told apart from a boundary
      // the probe failed to parse. Slice 60 added ring scoring to clear 4 'state' failures whose
      // source CSS sets box-shadow AND border-color, and the count did not move: both borderRatio
      // and ringRatio came back null, i.e. the probe saw NEITHER at runtime. Whether that is a
      // theme overriding the rule, a zero border-width making border-color inert, or a parse
      // miss is not decidable from the outside — these three fields decide it on the next run.
      rawBoxShadow: s.boxShadow,
      rawBorderWidths: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth].join(' '),
      rawBorderStyles: [s.borderTopStyle, s.borderRightStyle, s.borderBottomStyle, s.borderLeftStyle].join(' '),
      painted: best.painted,
      against: 'rgb(' + Math.round(back.r) + ', ' + Math.round(back.g) + ', '
        + Math.round(back.b) + ')',
      selfOpacity,
      ratio: best.ratio,
      // The rejected candidate, kept so "the fill carried it" is checkable.
      borderRatio: borderScore ? borderScore.ratio : null,
      fillRatio: fillScore ? fillScore.ratio : null,
      required: 3,
      passes: best.ratio >= 3,
    }));
  }
  return JSON.stringify(rows);
})()`;

/**
 * Artwork. The point is NOT to re-run `imagesWithoutAlt`; 47k did that and got 0 out of 0.
 * The point is to reach a surface that HAS images and then ask whether the art is announced
 * or silently dropped — `alt=""` is right for decoration and wrong for the only label a card
 * has. So each image is scored against the text its own card carries.
 */
const ARTWORK = `(() => {
${HELPERS}
  const imgs = [...document.querySelectorAll('img')].filter(__visible);
  const scored = imgs.map((img) => {
    const alt = img.getAttribute('alt');
    // The nearest thing a user would call "the card this picture belongs to".
    //
    // START AT THE PARENT. Element.closest() begins at the element ITSELF, and this app names its
    // poster image medialib-card__img -- which matches [class*="card"]. So the "card" found for
    // every poster WAS the <img>, an element whose textContent is '' by definition, and the metric
    // reported 13 "images in a card with no text at all" on a run where the keyboard walk recorded
    // twelve div.medialib-card stops with accessible names "Fixture Title 1..12". Two readings of
    // one run disagreed, and the CSS selector was the wrong one. Any <img> whose own class contains
    // card/tile/row/item hit this. Verified on the slice-68 proof: 9 of 10 examples had
    // cardEl === el.
    //
    // NO BACKTICKS IN THIS BLOCK -- it lives inside a template literal sent to the page, and a
    // backtick here ends the probe string and the file stops parsing with the error pointing at
    // prose. That is documented ten lines below and it still caught the author of this comment.
    const card = img.parentElement?.closest('a, button, li, article, [role="listitem"], [role="button"], [class*="card"], [class*="tile"], [class*="row"], [class*="item"]') ?? null;
    const cardText = card ? (card.textContent || '').replace(/\\s+/g, ' ').trim() : '';
    const fullSrc = img.currentSrc || img.getAttribute('src') || '';
    // A DEDUPE KEY MUST NOT TRUNCATE. The first version keyed on describe + the first 80
    // characters of the src, and slice 50's "3 distinct images" was really 4: two different
    // placeholder posters both start data:image/svg+xml;base64,PHN2ZyB4bWxucz0i and stay
    // identical for far more than 80 characters, so they collapsed into one. The sample was
    // already tiny; a dedupe that undercounts it made it smaller still. Same class of error as
    // the distinctStops reading in the keyboard walk.
    let h = 0x811c9dc5;
    for (let i = 0; i < fullSrc.length; i += 1) {
      h ^= fullSrc.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return {
      el: __describe(img),
      path: __path(img),
      src: fullSrc.slice(0, 80),
      srcLength: fullSrc.length,
      srcKey: (h >>> 0).toString(16),
      hasAltAttr: alt !== null,
      alt: alt === null ? null : alt,
      naturalWidth: img.naturalWidth,
      complete: img.complete,
      cardEl: card ? __describe(card) : null,
      cardTextLength: cardText.length,
      cardText: cardText.slice(0, 60),
    };
  });
  // Artwork painted as CSS background carries no alt slot at all; count it so the record does
  // not read as "this surface has 4 images" when it has 4 images and 30 painted panels.
  const cssArt = [...document.querySelectorAll('body *')].filter((el) => {
    if (!__visible(el)) return false;
    const bi = getComputedStyle(el).backgroundImage;
    return bi && bi !== 'none' && /url\\(/.test(bi);
  }).map((el) => {
    // The URL matters, not just the count: C0b has to tell fixture art from chrome art, and a
    // cover painted as a CSS background has no src attribute for it to match on. Slice 62's C0b
    // reported "the app did not read the seeded stores" while the app had in fact read
    // library.json and painted 8 covers this way — it was only ever looking at <img>.
    const bi = getComputedStyle(el).backgroundImage;
    const m = bi.match(/url\\(["']?([^"')]+)["']?\\)/);
    // __describe returns a STRING. The first version wrote Object.assign(__describe(el), {bgUrl}),
    // which builds a String WRAPPER object — and JSON.stringify collapses a String wrapper back to
    // the bare string, silently dropping bgUrl. No error; the field simply arrived undefined and
    // read as "no fixture backgrounds on screen", which is the same silent-loss shape as the ring
    // regex. Build the object explicitly.
    return { el: __describe(el), bgUrl: m ? m[1] : null };
  });
  return JSON.stringify({
    imageCount: imgs.length,
    images: scored,
    cssBackgroundArtCount: cssArt.length,
    cssBackgroundArt: cssArt.slice(0, 20),
  });
})()`;

/** What is actually on screen when the player route is opened. */
const PLAYER_PROBE = `(() => {
${HELPERS}
  const sel = (s) => [...document.querySelectorAll(s)].filter(__visible);
  const overlay = document.querySelector('.study-cue-overlay');
  const video = document.querySelector('video');
  return JSON.stringify({
    studyCueOverlay: !!overlay,
    studyCueOverlayVisible: overlay ? __visible(overlay) : false,
    videoElements: document.querySelectorAll('video').length,
    videoVisible: video ? __visible(video) : false,
    videoReadyState: video ? video.readyState : null,
    videoSrc: video ? String(video.currentSrc || video.src || '').slice(0, 80) : null,
    blancStudyPlayer: !!document.querySelector('.blanc-study-player'),
    mediaWorkspace: !!document.querySelector('#media-workspace'),
    seanimeHost: !!document.querySelector('.seanime-host'),
    playerLikeSurfaces: [...new Set(sel('[class*="player"], [class*="overlay"], [class*="cue"]')
      .map(__describe))].slice(0, 30),
    visibleControls: sel('button, a[href], [role="button"], [role="tab"], [role="slider"], input, select, textarea').length,
  });
})()`;

/**
 * SLIDER CENSUS — slice 53.
 *
 * The Tab walk cannot answer this question on its own. Slice 50 recorded that the media-center
 * SEEK slider is `disabled` with nothing playing, so sequential navigation skips it entirely;
 * a walk-only reading therefore reports its name as absent-because-unreached, which is not the
 * same claim as absent-because-nameless and must never be written down as a pass.
 *
 * So every `input[type=range]` in the document is enumerated directly — reachable or not,
 * visible or not — and each one records its name, WHERE the name came from, whether it is
 * disabled, and whether it would be Tab-reachable. The three states are then separable:
 * NAMED / NAMELESS / NOT-REACHABLE-BUT-NAMED.
 */
const SLIDER_CENSUS = `(() => {
${HELPERS}
  const els = [...document.querySelectorAll('input[type="range"]')];
  return JSON.stringify(els.map((el) => {
    const ni = __nameInfo(el);
    const r = el.getBoundingClientRect();
    return {
      el: __describe(el),
      path: __path(el),
      name: ni.name,
      nameSource: ni.source,
      ariaLabel: (el.getAttribute('aria-label') || '').trim(),
      ariaLabelledby: (el.getAttribute('aria-labelledby') || '').trim(),
      title: (el.getAttribute('title') || '').trim(),
      // Slice 52's rule: aria-label / aria-labelledby / a real <label> only. title does not count.
      namedStrictly: ni.source === 'aria-label' || ni.source === 'aria-labelledby'
        || ni.source === 'label[for]' || ni.source === 'wrapping-label',
      disabled: !!el.disabled,
      visible: __visible(el),
      tabReachable: !el.disabled && __visible(el) && el.getAttribute('tabindex') !== '-1',
      rect: { w: Math.round(r.width), h: Math.round(r.height) },
    };
  }));
})()`;

/**
 * PREFLIGHT: compile every page-side expression before the app is launched.
 *
 * Most of the `cdp.evaluate` calls below are guarded with `.catch(() => null)` so one dead
 * surface cannot abort a nine-surface sweep. That guard also swallows a SYNTAX ERROR in the
 * expression itself, which would show up as "this surface had no text / no images" — an
 * absence that reads exactly like a finding. `new Function` parses without executing, so this
 * separates "the page said no" from "the probe never ran".
 *
 *   node docs/migration/tools/packaged-a11y-deep-gate.mjs --selfcheck
 */
function pageExpressions() {
  return {
    CONTRAST_SELFTEST, CONTRAST_SWEEP, ARTWORK, PLAYER_PROBE, FOCUS_READ, SLIDER_CENSUS,
    NONTEXT_CONTRAST,
    verifyIndicator: verifyIndicator(0),
  };
}

function compileCheck() {
  const expressions = pageExpressions();
  const broken = [];
  for (const [name, source] of Object.entries(expressions)) {
    try { new Function(`return (${source});`); } catch (err) {
      broken.push(`${name}: ${String(err?.message ?? err)}`);
    }
  }
  return broken;
}

// ────────────────────────────────────────────────────────────────────────────────
// THE ARTWORK FIXTURE — slice 55.
//
// 47k reported `imagesWithoutAlt: 0` out of 0 images. Slice 50 reported it out of 3, all of them
// placeholders belonging to one surface. Neither is coverage of "poster and cover-art grids", and
// saying so was the honest half of both slices. This is the other half: put real artwork on the
// two grids that carry it, from a fixture written before the app boots.
//
// It seeds the two on-disk stores the packaged app reads at startup, both of which are plain JSON
// under `app.getPath('userData')` — which `--user-data-dir` already points at the scratch tree:
//
//   media.json   -> { items: MediaItem[], relationships: [] }, each item carrying `posterPath`,
//                   a userData-RELATIVE path. `media:artwork` mints a `playfile://` token for it
//                   at request time, so no ffmpeg, no provider and no network are involved.
//   library.json -> a BARE LibraryItem[] with `coverPath`, resolved as `media://<id>/<coverPath>`
//                   out of `<userData>/library/<id>/`.
//
// The PNGs are generated here rather than copied from the repo so the fixture has no dependency
// on any asset that might move, and so each poster is visibly distinct on screen.
//
// ── SLICE 65 — WHAT THIS FIXTURE CANNOT DO, MEASURED ────────────────────────────
//
// The first `--fixture` run wrote all 34 files and C0b still found ZERO fixture images on
// screen. The obvious reading — "the app did not read the seeded stores" — is WRONG, and the
// loaders say so: both file names, both locations and both envelopes above are exactly what the
// main process opens (media.ts `dbPath`/`readDb`, library.ts `dbPath`/`readDb`), neither loader
// validates or version-gates anything, and `media:list` returns its items unfiltered. Slice 65
// proved this against the real handlers in `src/main/__tests__/artworkFixture.test.ts`, which
// feeds them these exact bytes. The bytes are right. The READERS moved:
//
//  1. THE POSTER GRID IS NOT ON THE `player` ROUTE ANY MORE. Old-player retirement (2026-07-31)
//     repointed `player` at `MediaWorkspaceSectionView` (renderer/components/AppSection.tsx),
//     which renders a launcher button when the Seanime sidecar is available, while
//     `MediaWorkspaceHost` answers the same `os:open` with the full-screen Seanime workspace —
//     a surface fed by the SIDECAR and AniList, not by media.json. The slice-62 control records
//     it: `player` -> 0 images, `mediaWorkspace: true, seanimeHost: true`. `MediaCenterView`
//     also hides its own Library and Video tabs while the workspace exists, so `music` is not a
//     way back in either. NOTHING the gate opens turns media.json into an <img>.
//
//     The fixture's media half is therefore correct but surface-less UNLESS the run also sets
//     `SEANIME_SIDECAR=0`, which is the documented rollback: with it, `player` falls back to
//     `MediaCenterView initialTab="library"` -> MediaLibraryShell -> MediaArtwork -> a
//     `playfile://` <img> per card, which is precisely what C0b counts. That flag is the
//     coordinator's call and lives on the spawn below, not in here.
//
//  2. BOOK COVERS ARE NEVER <img> ELEMENTS. `renderer/utils/coverArt.ts` paints every cover as
//     a CSS `background-image: url("media://...")` on a <div>. C0b filters
//     `document.querySelectorAll('img')`, so a perfectly seeded book library contributes 0 to
//     it BY CONSTRUCTION and always will. What the book half does move is
//     `cssBackgroundArtCount` on the `library` surface — 0 in the slice-62 control, >= 8 here.
//     That is the only artwork signal this half can produce, and it is a real one.
//
// Both facts are returned in the manifest below so the run record carries them, rather than
// leaving a future reader to re-derive "correct fixture" vs "correct fixture, no surface" from
// a C0b FAIL. See docs/migration/SLICE_65_ARTWORK_FIXTURE.md.
// ────────────────────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A real, decodable 8-bit truecolour PNG. No dependency, and no placeholder SVG data: URI. */
function encodePng(width, height, pixel) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let o = 0;
  for (let y = 0; y < height; y += 1) {
    raw[o] = 0; // filter: none
    o += 1;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(x, y);
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
      o += 3;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A poster that is obviously artwork on screen: a per-index hue with a diagonal band. */
function posterBytes(index, width, height) {
  const hue = (index * 47) % 360;
  const hsl = (h, s, l) => {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    const [r1, g1, b1] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
      : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
    const m = l - c / 2;
    return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
  };
  return encodePng(width, height, (x, y) => {
    const t = y / height;
    const band = ((x + y) % 96) < 12;
    return hsl(band ? (hue + 40) % 360 : hue, 0.42, 0.16 + t * 0.28);
  });
}

const FIXTURE_MEDIA_COUNT = 12;
const FIXTURE_BOOK_COUNT = 8;

/**
 * Writes the fixture into a scratch userData directory. Returns a manifest — every file, its
 * size and its sha256 — because "the app showed no artwork" and "the fixture never landed" are
 * different findings and only the manifest separates them. It is recorded in the output.
 *
 * Slice 65 added a third finding the manifest now has to separate from those two: "the fixture
 * landed, the store loaded, and no surface on this route renders it." The `reads` block below
 * states, per store, who consumes it and what has to be true for C0b to be able to see it —
 * see the block comment above this section for the evidence. It is data rather than a comment
 * so that it lands in packaged-a11y-deep.json next to the C0b verdict it explains.
 */
function seedArtworkFixture(userDataDir) {
  const written = [];
  const put = (rel, bytes) => {
    const abs = path.join(userDataDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, bytes);
    written.push({
      rel: rel.replace(/\\/g, '/'),
      bytes: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16),
    });
    return abs;
  };

  // ── the media library: a poster grid ──────────────────────────────────────────
  const mediaItems = [];
  for (let i = 0; i < FIXTURE_MEDIA_COUNT; i += 1) {
    const id = `a11yfix-media-${String(i + 1).padStart(2, '0')}`;
    const fileName = `Fixture Title ${i + 1} - 01.mp4`;
    // The item's `path` must exist on disk: a library that lists a file it cannot find is a
    // different surface (broken-file badges) from the one under measurement.
    const filePath = put(path.join('fixture-media', fileName), Buffer.alloc(1024));
    put(path.join('artwork', `${id}.png`), posterBytes(i, 300, 450));
    mediaItems.push({
      id,
      title: `Fixture Title ${i + 1}`,
      path: filePath,
      fileName,
      addedAt: Date.now() - i * 60_000,
      kind: 'video',
      durationSec: 1440 + i * 30,
      lang: 'ja',
      // userData-RELATIVE, per the comment on MediaItem.posterPath in shared/types.ts.
      posterPath: `artwork/${id}.png`,
    });
  }
  put('media.json', Buffer.from(`${JSON.stringify({ items: mediaItems, relationships: [] }, null, 2)}\n`, 'utf8'));

  // ── the book library: a cover grid, painted as CSS background-image ───────────
  const bookItems = [];
  for (let i = 0; i < FIXTURE_BOOK_COUNT; i += 1) {
    const id = `a11yfix-book-${String(i + 1).padStart(2, '0')}`;
    put(path.join('library', id, 'cover.png'), posterBytes(i + 20, 240, 340));
    bookItems.push({
      id,
      title: `Fixture Book ${i + 1}`,
      kind: 'book',
      createdAt: Date.now() - i * 90_000,
      coverPath: 'cover.png',
    });
  }
  put('library.json', Buffer.from(`${JSON.stringify(bookItems, null, 2)}\n`, 'utf8'));

  return {
    mediaItems: mediaItems.length,
    bookItems: bookItems.length,
    files: written.length,
    totalBytes: written.reduce((n, f) => n + f.bytes, 0),
    manifest: written,
    /**
     * Who reads each store, and what C0b can see of it. Verified against the main-process
     * loaders and the renderer call sites in slice 65, and re-checked by
     * `src/main/__tests__/artworkFixture.test.ts` on every vitest run.
     */
    reads: {
      'media.json': {
        loadedBy: 'main/media.ts readDb -> media:list (unfiltered) -> media:artwork playfile://',
        paintedBy: 'MediaLibraryShell -> MediaPosterCard -> MediaArtwork (an <img>)',
        visibleToC0b: 'ONLY with SEANIME_SIDECAR=0. Otherwise `player` and `video` route to the '
          + 'Seanime workspace (sidecar + AniList) and MediaCenterView hides its Library tab, so '
          + 'no opened surface renders this store at all.',
        sidecarOptOutPresent: (process.env.SEANIME_SIDECAR ?? '') === '0'
          || ['false', 'off'].includes((process.env.SEANIME_SIDECAR ?? '').toLowerCase()),
      },
      'library.json': {
        loadedBy: 'main/library.ts readDb -> library:sync (returns it verbatim with no watch folder)',
        paintedBy: 'LibraryView cover tiles via renderer/utils/coverArt.ts',
        visibleToC0b: 'NEVER. Covers are CSS background-image on a <div>, and C0b filters <img>. '
          + 'This half is measured by artwork.perSurface[library].cssBackgroundArt instead '
          + '(0 in the slice-62 empty-profile control).',
        sidecarOptOutPresent: null,
      },
    },
  };
}

let child = null;

/** One real Tab press through the browser's own sequential-navigation path. */
async function pressTab(cdp, shift = false) {
  const base = {
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
    key: 'Tab',
    code: 'Tab',
    modifiers: shift ? 8 : 0,
  };
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

const FOCUS_READ = `(() => {
${HELPERS}
${CONTRAST_MATH}
  const el = document.activeElement;
  if (!el || el === document.body) {
    return JSON.stringify({ el: el === document.body ? 'body' : 'null', leftDocument: true });
  }
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  let focusVisible = null;
  try { focusVisible = el.matches(':focus-visible'); } catch (e) { focusVisible = 'unsupported'; }
  const outlineW = parseFloat(s.outlineWidth) || 0;
  const hasOutline = s.outlineStyle !== 'none' && outlineW > 0;
  const hasShadow = s.boxShadow && s.boxShadow !== 'none';
  // A field whose only name is a placeholder is NOT nameless, but it is weaker than WCAG
  // wants: the placeholder disappears the moment the user types. 47k exempted these on
  // purpose and recorded that as a known gap; separating them here is what turns that
  // recorded choice back into a number.
  const ph = (el.getAttribute('placeholder') || '').trim();
  const labelled = !!(el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]'))
    || !!el.closest('label');
  const __ni = __nameInfo(el);
  /**
   * IS THE RING VISIBLE, not merely present — measured on the element the browser's OWN
   * sequential navigation just focused, and after the walk's SETTLE_MS, so this is the ring at
   * rest on the stop a keyboard user is actually on.
   *
   * Doing it here rather than in a separate el.focus() pass is the whole point. Chromium only
   * matches :focus-visible when it believes the focus came from the keyboard, so a scripted
   * focus() sweep found an outline on 5 of 80 controls while the real Tab walk finds one on
   * every stop. A ring measured on 5 controls and quoted as a result about the app would have
   * been a sampling artifact wearing a WCAG number.
   */
  let ringRatio = null;
  let ringPainted = null;
  let ringAgainst = null;
  let ringNote = null;
  if (hasOutline) {
    const outsideBack = __backdrop(el.parentElement || document.body);
    const ring = __parse(s.outlineColor);
    if (outsideBack.unmeasurable) ringNote = outsideBack.unmeasurable;
    else if (!ring) ringNote = 'outline colour unparsable';
    else {
      const selfOpacity = Number.isNaN(parseFloat(s.opacity)) ? 1 : parseFloat(s.opacity);
      const painted = __srcOver({ r: ring.r, g: ring.g, b: ring.b, a: ring.a * selfOpacity },
        outsideBack.color);
      ringRatio = Math.round(__ratio(painted, outsideBack.color) * 100) / 100;
      ringPainted = 'rgb(' + Math.round(painted.r) + ', ' + Math.round(painted.g) + ', '
        + Math.round(painted.b) + ')';
      ringAgainst = 'rgb(' + Math.round(outsideBack.color.r) + ', '
        + Math.round(outsideBack.color.g) + ', ' + Math.round(outsideBack.color.b) + ')';
    }
  }
  return JSON.stringify({
    ringRatio,
    ringPainted,
    ringAgainst,
    ringNote,
    ringDeclared: s.outlineColor,
    el: __describe(el),
    path: __path(el),
    tag: el.tagName.toLowerCase(),
    inputType: el.tagName.toLowerCase() === 'input' ? (el.getAttribute('type') || 'text') : null,
    focusableIndex: el.getAttribute('data-a11y-focusable'),
    name: __name(el),
    // The accname-precedence reading, kept SEPARATE from __name's floor reading. A stop with
    // nameSource 'title' is nameless by slice 52's rule and named by __name's.
    nameStrict: __ni.source === 'title' || __ni.source === 'placeholder' || __ni.source === 'text'
      ? '' : __ni.name,
    nameSource: __ni.source,
    ariaLabel: (el.getAttribute('aria-label') || '').trim(),
    placeholder: ph,
    hasRealLabel: labelled,
    role: el.getAttribute('role') || '',
    tabindex: el.getAttribute('tabindex'),
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    inViewport: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth,
    zeroSize: r.width === 0 || r.height === 0,
    focusVisible,
    outline: s.outlineStyle + ' ' + s.outlineWidth + ' ' + s.outlineColor,
    boxShadow: String(s.boxShadow).slice(0, 80),
    hasOutline,
    hasShadow,
    indicator: hasOutline ? 'outline' : hasShadow ? 'box-shadow' : 'none-detected',
  });
})()`;

/**
 * The verification pass for every element the walk saw with NO detected indicator. Focusing it
 * directly and diffing the computed style against its own unfocused style is a differential:
 * "the ring is invisible" and "the ring is drawn by something this probe does not read" are
 * different findings, and only this separates them.
 */
function verifyIndicator(selectorIndex) {
  return `(async () => {
${HELPERS}
    const el = document.querySelector('[data-a11y-walk="${selectorIndex}"]');
    if (!el) return JSON.stringify({ missing: true });
    const props = ['outlineStyle', 'outlineWidth', 'outlineColor', 'boxShadow',
      'backgroundColor', 'borderTopColor', 'borderTopWidth', 'color', 'textDecorationLine',
      'transform', 'filter'];
    const snap = () => { const s = getComputedStyle(el); const o = {}; for (const p of props) o[p] = String(s[p]); return o; };
    el.blur();
    await new Promise((r) => setTimeout(r, ${SETTLE_MS}));
    const before = snap();
    el.focus();
    await new Promise((r) => setTimeout(r, ${SETTLE_MS}));
    const after = snap();
    const changed = props.filter((p) => before[p] !== after[p]);
    return JSON.stringify({ el: __describe(el), changed, before, after });
  })()`;
}

async function walkSurface(cdp, name) {
  // Start from a known place so the sequence is reproducible, and clear any marks from a
  // previous surface so indices never collide.
  await cdp.evaluate(`(() => {
    for (const el of document.querySelectorAll('[data-a11y-walk]')) el.removeAttribute('data-a11y-walk');
    for (const el of document.querySelectorAll('[data-a11y-focusable]')) el.removeAttribute('data-a11y-focusable');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    return 1;
  })()`);
  await sleep(150);

  /**
   * Tag every element the walk OUGHT to reach, so "29 of 30" can name the missing one.
   *
   * The first isolated run came up exactly one short on all four surfaces — 10/11, 43/44,
   * 29/30, 39/40. A constant off-by-one across unrelated surfaces is a property of the
   * instrument or of one repeated element, not four coincidences, and a count alone cannot
   * tell which. This turns the gap into a named element.
   */
  const inventory = JSON.parse(await cdp.evaluate(`(() => {
${HELPERS}
    const els = [...document.querySelectorAll('button, a[href], [role="button"], [role="tab"], [role="menuitem"], input:not([type="hidden"]), select, textarea, [tabindex]')]
      .filter(__visible).filter((el) => el.getAttribute('tabindex') !== '-1' && !el.disabled);
    els.forEach((el, i) => el.setAttribute('data-a11y-focusable', String(i)));
    return JSON.stringify(els.map((el, i) => ({
      i, el: __describe(el), name: __name(el).slice(0, 40), path: __path(el),
    })));
  })()`).catch(() => '[]'));

  const seen = [];
  const order = [];
  let repeats = 0;
  for (let i = 0; i < TAB_BUDGET; i += 1) {
    await pressTab(cdp);
    await sleep(SETTLE_MS);
    const raw = await cdp.evaluate(FOCUS_READ).catch(() => null);
    if (!raw) break;
    const info = JSON.parse(raw);
    info.index = i;
    if (!info.leftDocument) {
      await cdp.evaluate(
        `(() => { const el = document.activeElement; if (el && el.setAttribute) el.setAttribute('data-a11y-walk', '${i}'); return 1; })()`,
      ).catch(() => null);
    }
    const prev = order[order.length - 1];
    if (prev && prev.el === info.el && prev.name === info.name) repeats += 1;
    order.push(info);
    seen.push(info.el);
  }

  const distinct = new Set(order.filter((o) => !o.leftDocument).map((o) => o.el + '|' + o.name));
  const moved = distinct.size > 1;

  const totals = { focusableVisible: inventory.length };
  // Which tagged elements did Tab never land on? Named, not counted.
  const reachedIdx = new Set(order.filter((o) => o.focusableIndex != null)
    .map((o) => Number(o.focusableIndex)));
  const unreached = inventory.filter((entry) => !reachedIdx.has(entry.i));

  /**
   * WHY `distinctStops` IS NOT A COVERAGE NUMBER — slice 55.
   *
   * `distinct` above is a Set of `describe|name` STRINGS; `focusableVisible` is a count of
   * ELEMENTS. Two elements that describe identically and carry the same accessible name are one
   * entry in the Set and two in the inventory, so the pair reads as a missing tab stop that was
   * never missing. That is the entirety of slice 50's "every surface is exactly one short": the
   * taskbar tray mounts `<NotificationBell />` twice and the tray is in every window.
   *
   * `stopsReachedByIdentity` counts what Tab actually landed on, by the per-element index the
   * inventory stamped — the only one of the two that answers "did the keyboard reach everything".
   * `describeCollisions` names every pair that the string reading would fold together, so the
   * difference between the two numbers is never again a mystery to be explained in prose.
   */
  const collisionGroups = new Map();
  for (const entry of inventory) {
    const key = `${entry.el}|${entry.name}`;
    if (!collisionGroups.has(key)) collisionGroups.set(key, []);
    collisionGroups.get(key).push(entry);
  }
  const describeCollisions = [...collisionGroups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({
      key,
      count: group.length,
      indices: group.map((entry) => entry.i),
      paths: group.map((entry) => entry.path ?? null),
    }));
  const collapsedByDescribe = describeCollisions.reduce((n, c) => n + (c.count - 1), 0);

  const noIndicator = order.filter((o) => !o.leftDocument && o.indicator === 'none-detected');
  const verified = [];
  for (const candidate of noIndicator.slice(0, 12)) {
    const raw = await cdp.evaluate(verifyIndicator(candidate.index)).catch(() => null);
    if (raw) verified.push({ index: candidate.index, el: candidate.el, ...JSON.parse(raw) });
  }

  return {
    surface: name,
    tabPresses: TAB_BUDGET,
    stopsRecorded: order.length,
    distinctStops: distinct.size,
    focusableVisible: totals.focusableVisible,
    /**
     * The honest "stops reached": inventory elements Tab landed on, counted by the per-element
     * index, not by a description string. Compare THIS with `focusableVisible`, never
     * `distinctStops`.
     */
    stopsReachedByIdentity: totals.focusableVisible - unreached.length,
    /** `focusableVisible - distinctStops` is exactly this, and it is an instrument artifact. */
    collapsedByDescribe,
    describeCollisions,
    inventory,
    instrumentMovedFocus: moved,
    /**
     * Did the budget actually cover the surface? `distinctStops < focusableVisible` with no
     * cycle observed means the walk RAN OUT OF TABS, not that controls are unreachable — the
     * difference matters, and without this flag a truncated walk reads as a coverage claim.
     */
    tabBudgetExhaustedBeforeCycling: distinct.size >= TAB_BUDGET - 2,
    coveredAllFocusable: unreached.length === 0,
    unreachedCount: unreached.length,
    unreachedByTab: unreached.slice(0, 15),
    consecutiveRepeats: repeats,
    leftDocumentCount: order.filter((o) => o.leftDocument).length,
    offscreenStops: order.filter((o) => !o.leftDocument && !o.inViewport).map((o) => o.el),
    zeroSizeStops: order.filter((o) => !o.leftDocument && o.zeroSize).map((o) => o.el),
    unnamedStops: order.filter((o) => !o.leftDocument && !o.name && !o.placeholder && !o.hasRealLabel)
      .map((o) => o.el),
    placeholderOnlyStops: order
      .filter((o) => !o.leftDocument && !o.name && !!o.placeholder && !o.hasRealLabel)
      .map((o) => `${o.el} placeholder="${String(o.placeholder).slice(0, 40)}"`),
    indicatorCounts: order.reduce((acc, o) => {
      if (o.leftDocument) return acc;
      acc[o.indicator] = (acc[o.indicator] ?? 0) + 1;
      return acc;
    }, {}),
    noIndicatorVerified: verified,
    /** Ring contrast on the stops the real Tab walk landed on. Deduped by element + colour. */
    ringSamples: [...new Map(order
      .filter((o) => !o.leftDocument && typeof o.ringRatio === 'number')
      .map((o) => [`${o.el}|${o.ringDeclared}`, {
        el: o.el,
        path: o.path,
        declared: o.ringDeclared,
        painted: o.ringPainted,
        against: o.ringAgainst,
        ratio: o.ringRatio,
        required: 3,
        passes: o.ringRatio >= 3,
      }])).values()],
    ringUnmeasurable: [...new Set(order
      .filter((o) => !o.leftDocument && o.ringNote).map((o) => o.ringNote))],
    order: order.map((o) => (o.leftDocument
      ? { i: o.index, el: o.el, leftDocument: true }
      : {
        i: o.index, el: o.el, name: o.name.slice(0, 40), indicator: o.indicator,
        focusVisible: o.focusVisible, inViewport: o.inViewport,
        // The per-element identity, so a stop can be traced back to one inventory row even
        // when two rows print the same description.
        fi: o.focusableIndex == null ? null : Number(o.focusableIndex),
      })),
  };
}

/**
 * CLOSE EVERY OPEN WINDOW. This is the difference between measuring a surface and measuring a
 * pile of them.
 *
 * `os:open` opens a desktop WINDOW and leaves the previous ones open, so the first version of
 * this gate measured "the desktop with sections 1..n stacked up" while labelling each reading
 * with the name of the last section opened. The tell was in the data: per-surface contrast
 * sample counts rose monotonically (138, 150, 196, 196, 260, 260, 286) and the "player" walk
 * tabbed through the SETTINGS window — 0 of its 51 stops were player controls. Every
 * per-surface number was a running total wearing a surface's name, and the player phase was
 * auditing the wrong surface entirely.
 *
 * Returns the before/after window counts so a run can prove the close actually happened. An
 * assertion about an action has to establish the action had something to act on.
 */
async function closeAllWindows(cdp) {
  const before = await cdp.evaluate("document.querySelectorAll('.fwin').length").catch(() => null);
  await cdp.evaluate(`(() => {
    let n = 0;
    for (const b of document.querySelectorAll('.fwin .fwin-close')) { b.click(); n += 1; }
    return n;
  })()`).catch(() => 0);
  await sleep(900);
  const after = await cdp.evaluate("document.querySelectorAll('.fwin').length").catch(() => null);
  return { before, after };
}

async function openSection(cdp, section, settle = 2200, isolate = true) {
  if (isolate) {
    const closed = await closeAllWindows(cdp);
    if (closed.after !== 0) {
      log(`  WARNING: ${closed.after} window(s) still open before opening ${section} `
        + `(was ${closed.before}) — this surface's numbers include them`);
    }
  }
  const ok = await cdp.evaluate(
    `(() => { window.dispatchEvent(new CustomEvent('os:open', { detail: ${JSON.stringify(section)} })); return 1; })()`,
  ).catch(() => 0);
  if (ok) await sleep(settle);
  const windows = await cdp.evaluate(
    `JSON.stringify([...document.querySelectorAll('.fwin')].map((w) => (w.className || '').slice(0, 60)))`,
  ).catch(() => '[]');
  return { opened: !!ok, windowsOpen: JSON.parse(windows).length };
}

async function main() {
  const broken = compileCheck();
  /**
   * The sampler's page-side probes go through the SAME parse-before-launch guard, built with the
   * real HELPERS and CONTRAST_MATH they will actually be sent with rather than with a stub. A
   * syntax error in one of them would otherwise surface as "this surface had no controls" — an
   * absence that reads exactly like a finding. (`--selfcheck` below is synchronous and does not
   * cover them; `a11y-pixel-sampler.mjs --selfcheck` is their own equivalent.)
   */
  if (WANT_PIXELS) {
    try {
      const mod = await import('./a11y-pixel-sampler.mjs');
      for (const [name, source] of Object.entries(mod.pageExpressions(HELPERS, CONTRAST_MATH))) {
        try { new Function(`return (${source});`); } catch (err) {
          broken.push(`sampler ${name}: ${String(err?.message ?? err)}`);
        }
      }
    } catch (err) {
      broken.push(`sampler module import: ${String(err?.message ?? err)}`);
    }
  }
  out.pageExpressionsCompiled = broken.length === 0;
  step('P0 every page-side probe compiles', broken.length === 0 ? 'PASS' : 'FAIL',
    broken.length === 0
      ? `${Object.keys(pageExpressions()).length} expressions parsed`
      : `broken probes would have read as absent findings: ${broken.join(' | ')}`);
  if (broken.length) throw new Error('a page-side probe does not compile');

  if (!fs.existsSync(EXE)) throw new Error(`no packaged build at ${EXE}`);
  out.exeBuiltAt = fs.statSync(EXE).mtime.toISOString();
  fs.mkdirSync(workRoot, { recursive: true });

  const userDataDir = path.join(os.tmpdir(), `jp-a11y-deep-${stamp}-${process.pid}`);
  if (fs.existsSync(userDataDir)) throw new Error(`scratch profile ${userDataDir} already exists`);
  fs.mkdirSync(userDataDir, { recursive: true });
  out.userDataDir = userDataDir;

  /**
   * The fixture is written BEFORE the first launch, because both stores are read at startup and
   * a store seeded afterwards would need a reload nobody would remember to do.
   */
  out.fixtureRequested = WANT_FIXTURE;
  if (WANT_FIXTURE) {
    out.fixture = seedArtworkFixture(userDataDir);
    step('P1 the artwork fixture is on disk before the app starts', 'PASS',
      `${out.fixture.files} files / ${out.fixture.totalBytes} bytes — `
      + `${out.fixture.mediaItems} media items with real poster PNGs, `
      + `${out.fixture.bookItems} library books with real cover PNGs, into ${userDataDir}`);
  } else {
    step('P1 artwork fixture', 'SKIPPED',
      'no --fixture: a throwaway profile has no library, so any artwork number below describes '
      + 'an empty app and must not be quoted as coverage');
  }

  const cdpPort = await freePort();

  /**
   * `SEANIME_DATADIR` is PINNED, not inherited. Left alone it defaults to `<userData>/seanime`
   * — already scratch — but an operator with the variable exported in their shell would have
   * silently pointed a throwaway run at a real datadir, and nothing in the output would have
   * said so.
   */
  const env = { ...process.env, SEANIME_DATADIR: path.join(userDataDir, 'seanime-scratch') };
  out.seanimeDataDir = env.SEANIME_DATADIR;

  child = spawn(EXE, [`--user-data-dir=${userDataDir}`, `--remote-debugging-port=${cdpPort}`],
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env });
  child.stdout.resume();
  child.stderr.resume();

  const target = await findTarget(cdpPort, Date.now() + 180_000,
    (url) => url.startsWith('app://'), 'the packaged app window');
  const cdp = await new Cdp(target.webSocketDebuggerUrl).open();
  await cdp.send('Page.enable', {});
  await cdp.send('DOM.enable', {});

  await (async () => {
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      const ok = await cdp.evaluate(
        "!!document.querySelector('.desktop-root') && document.readyState === 'complete'",
      ).catch(() => false);
      if (ok) return;
      await sleep(1000);
    }
    throw new Error('the desktop never mounted');
  })();
  step('0 the packaged desktop is up', 'PASS', target.url);

  /**
   * 0a THEME SELECTION — every accessibility number in this file until 2026-08-03 was measured on
   * the DEFAULT palette only. The app ships twelve, and `frutiger-aero` is a glass aesthetic built
   * on translucency — which is exactly what 1.4.11 cannot survive: a boundary at 12% alpha over
   * --panel-2 composites to 2.86:1 even when the colour is pure white. So "the app passes B2" was
   * a claim about one theme wearing the name of all of them.
   *
   * The theme is `localStorage['jp-os-theme']`, read once at boot by `theme/engine.ts:107`, so it
   * must be set and the document RELOADED — setting it on a running page changes nothing that has
   * already been stamped onto <html>.
   *
   * The applied value is read back off the DOM rather than trusted, because `applyTheme`
   * (`theme/engine.ts:145`) falls back to the DEFAULT theme when an id is not registered — so a
   * typo'd id would otherwise silently measure the default palette and report it as aero.
   *
   * WHICH ATTRIBUTE IS THE EVIDENCE — corrected 2026-08-03, slice 76.
   *
   * This check used to require `data-materials`. That is only stamped when a theme declares a
   * `materialSet` (`engine.ts:127`), and **no base theme declares one** — it exists for the glass
   * aesthetics. So the check passed for `frutiger-aero`, which is the only theme it was ever tried
   * on, and hard-failed all twelve base themes *even when the theme had applied perfectly*. The
   * first sweep run (`classic-light`) reported
   * `{"storedId":"classic-light","materials":null,"themeAttr":"classic-light"}` as a FAILURE and
   * threw, which would have aborted all twelve runs and reported twelve phantom defects.
   *
   * The real evidence is `data-theme`, which `applyTheme` sets to the resolved theme's own id
   * (`engine.ts:150`) and REMOVES for the default (`:148`). A typo therefore cannot pass: it
   * resolves to the default and the attribute goes absent. `storedId` alone is NOT sufficient —
   * `loadThemeId()` (`:107`) returns the default when the stored id is unregistered, so localStorage
   * can hold the typo while the screen shows the default palette. Both are checked.
   * `materials` is still recorded, because for aero it is the difference between the glass
   * material set loading and not — it is simply no longer a pass condition for every theme.
   */
  if (THEME) {
    await cdp.evaluate(`(() => { localStorage.setItem('jp-os-theme', ${JSON.stringify(THEME)}); return 1; })()`)
      .catch(() => 0);
    await cdp.evaluate('(() => { location.reload(); return 1; })()').catch(() => 0);
    await sleep(2500);
    await (async () => {
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        const ok = await cdp.evaluate(
          "!!document.querySelector('.desktop-root') && document.readyState === 'complete'",
        ).catch(() => false);
        if (ok) return;
        await sleep(1000);
      }
      throw new Error('the desktop never came back after the theme reload');
    })();
    out.theme = JSON.parse(await cdp.evaluate(
      `JSON.stringify({ requested: ${JSON.stringify(THEME)},
        storedId: localStorage.getItem('jp-os-theme'),
        materials: document.documentElement.getAttribute('data-materials'),
        themeAttr: document.documentElement.getAttribute('data-theme') })`,
    ));
    // `data-theme` is absent for the default theme by design, present and equal to the id for
    // every other. Both branches are spelled out so the default can be swept too.
    const isDefaultTheme = THEME === 'study-os';
    out.theme.expectedThemeAttr = isDefaultTheme ? null : THEME;
    const applied = out.theme.storedId === THEME
      && (isDefaultTheme ? out.theme.themeAttr === null : out.theme.themeAttr === THEME);
    step('0a the requested THEME is the one on screen', applied ? 'PASS' : 'FAIL',
      JSON.stringify(out.theme));
    if (!applied) throw new Error(`theme ${THEME} did not apply; every number below would be about a different palette`);
  }

  /**
   * THE VIEWPORT, PINNED AND THEN RE-READ. Every rect, every visibility test and every
   * contrast sample below is taken in this box; if the pane were 0x0 all of them would be
   * fiction, so the measured width is recorded next to the requested one.
   */
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: 1, mobile: false,
  });
  await sleep(600);
  out.viewportMeasured = JSON.parse(await cdp.evaluate(
    `JSON.stringify({ clientWidth: document.documentElement.clientWidth,
      clientHeight: document.documentElement.clientHeight,
      innerWidth: window.innerWidth, innerHeight: window.innerHeight })`,
  ));
  const viewportOk = out.viewportMeasured.clientWidth === VIEWPORT.width
    && out.viewportMeasured.clientHeight === VIEWPORT.height;
  step('0b the viewport is the one that was asked for', viewportOk ? 'PASS' : 'FAIL',
    `requested ${VIEWPORT.width}x${VIEWPORT.height}, measured `
    + `${out.viewportMeasured.clientWidth}x${out.viewportMeasured.clientHeight}`);
  if (!viewportOk) throw new Error('viewport override did not take; every geometry number would be fiction');

  // Keyboard input goes nowhere useful if the page does not believe it has focus.
  await cdp.send('Page.bringToFront', {}).catch(() => null);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => null);

  await cdp.evaluate("(()=>{const b=document.querySelector('.consent-no');if(b){b.click();return 1;}return 0;})()");
  await sleep(2500);

  // ── PHASE A — the keyboard walk ────────────────────────────────────────────────
  const walkSurfaces = [
    ['desktop shell', null],
    ['section:settings', 'settings'],
    ['section:library', 'library'],
    ['section:notebook', 'notebook'],
  ];
  for (const [label, section] of walkSurfaces) {
    // The bare desktop is a surface too, and it is only itself once the windows are shut.
    const opened = section ? await openSection(cdp, section) : { ...(await closeAllWindows(cdp)), windowsOpen: 0 };
    const result = await walkSurface(cdp, label);
    result.windowsOpen = opened.windowsOpen ?? null;
    out.keyboard.push(result);
    log(`  walk ${label}: ${result.distinctStops} distinct stops / ${result.focusableVisible} focusable, `
      + `${result.windowsOpen} window(s) open, indicators ${JSON.stringify(result.indicatorCounts)}, `
      + `unnamed ${result.unnamedStops.length}, placeholder-only ${result.placeholderOnlyStops.length}`);
  }

  const anyMoved = out.keyboard.some((k) => k.instrumentMovedFocus);
  step('A0 the Tab keys ACTUALLY ARRIVED (the walk is not measuring a dead input path)',
    anyMoved ? 'PASS' : 'INSTRUMENT-FAILED',
    anyMoved
      ? `focus moved across ${out.keyboard.map((k) => k.distinctStops).join('/')} distinct stops per surface`
      : 'focus never changed on any surface — the keys did not reach the renderer, so nothing '
        + 'below is a finding about the app');
  if (!anyMoved) throw new Error('Tab never moved focus; refusing to report keyboard findings');

  const walkTotals = {
    distinctStops: out.keyboard.reduce((n, k) => n + k.distinctStops, 0),
    noIndicator: out.keyboard.reduce((n, k) => n + (k.indicatorCounts['none-detected'] ?? 0), 0),
    outline: out.keyboard.reduce((n, k) => n + (k.indicatorCounts.outline ?? 0), 0),
    boxShadow: out.keyboard.reduce((n, k) => n + (k.indicatorCounts['box-shadow'] ?? 0), 0),
    leftDocument: out.keyboard.reduce((n, k) => n + k.leftDocumentCount, 0),
    offscreen: out.keyboard.reduce((n, k) => n + k.offscreenStops.length, 0),
    zeroSize: out.keyboard.reduce((n, k) => n + k.zeroSizeStops.length, 0),
    unnamed: out.keyboard.reduce((n, k) => n + k.unnamedStops.length, 0),
    placeholderOnly: out.keyboard.reduce((n, k) => n + k.placeholderOnlyStops.length, 0),
    placeholderOnlyExamples: [...new Set(out.keyboard.flatMap((k) => k.placeholderOnlyStops))].slice(0, 15),
    unnamedExamples: [...new Set(out.keyboard.flatMap((k) => k.unnamedStops))].slice(0, 15),
  };
  // A stop whose style provably does not change on focus has no indicator; one whose style
  // does change has one this probe simply did not classify. Only the verification pass tells
  // them apart, so the headline number is the VERIFIED one.
  const trulyNoIndicator = out.keyboard.flatMap((k) => k.noIndicatorVerified)
    .filter((v) => !v.missing && Array.isArray(v.changed) && v.changed.length === 0);
  walkTotals.verifiedNoVisibleFocusChange = trulyNoIndicator.length;
  walkTotals.verifiedSampleSize = out.keyboard.flatMap((k) => k.noIndicatorVerified).length;
  walkTotals.surfacesFullyCovered = out.keyboard.filter((k) => k.coveredAllFocusable).length;
  walkTotals.surfacesTruncatedByBudget = out.keyboard
    .filter((k) => !k.coveredAllFocusable).map((k) => `${k.surface} (${k.distinctStops}/${k.focusableVisible})`);
  walkTotals.unreachedByTab = out.keyboard.flatMap((k) => (k.unreachedByTab ?? [])
    .map((u) => `${k.surface}: ${u.el} "${u.name}"`));
  walkTotals.stopsReachedByIdentity = out.keyboard.reduce((n, k) => n + k.stopsReachedByIdentity, 0);
  walkTotals.focusableTotal = out.keyboard.reduce((n, k) => n + k.focusableVisible, 0);
  walkTotals.collapsedByDescribe = out.keyboard.reduce((n, k) => n + k.collapsedByDescribe, 0);
  walkTotals.describeCollisions = [...new Set(out.keyboard
    .flatMap((k) => k.describeCollisions.map((c) => `${k.surface}: ${c.key} x${c.count}`)))];
  out.keyboardTotals = walkTotals;
  step('A1 keyboard walk measured', 'MEASURED', JSON.stringify(walkTotals));

  /**
   * A2 — the one-short gap, resolved rather than restated.
   *
   * This step exists because slice 50 reported "10/11, 43/44, 29/30, 39/40" as a coverage
   * finding for two slices running. It is not one: every focusable element was reached on every
   * surface. The shortfall is `distinctStops` folding duplicate `describe|name` pairs together,
   * and it PASSES only when the element-level reading says nothing was missed — so a real
   * unreachable control still fails here, with a name attached.
   */
  const everythingReached = out.keyboard.every((k) => k.unreachedCount === 0);
  step('A2 every focusable element is REACHED BY TAB (element identity, not description strings)',
    everythingReached ? 'PASS' : 'FAIL',
    everythingReached
      ? `${walkTotals.stopsReachedByIdentity}/${walkTotals.focusableTotal} across `
        + `${out.keyboard.length} surfaces; the ${walkTotals.collapsedByDescribe} unit(s) by which `
        + 'distinctStops falls short are DUPLICATE describe|name pairs, not missing stops: '
        + (walkTotals.describeCollisions.join(' , ') || 'none')
      : `unreached: ${walkTotals.unreachedByTab.join(' , ')}`);

  // ── PHASE B — contrast ─────────────────────────────────────────────────────────
  const selftest = JSON.parse(await cdp.evaluate(CONTRAST_SELFTEST));
  out.contrastSelfTest = selftest;
  /**
   * The expected values are ARITHMETIC, not remembered. #777 on #888 is 1.26, not the "~1.24"
   * the first version of this file asserted with a +/-0.05 tolerance: relative luminance of
   * 0x77 is 0.1844 and of 0x88 is 0.2462, so the ratio is (0.2462+0.05)/(0.1844+0.05) = 1.264.
   * The loose tolerance meant the self-test passed while its own stated expectation was wrong —
   * a self-test that can absorb a wrong expectation is only half a self-test. Tightened to
   * +/-0.01 so it now pins the value rather than a neighbourhood of it.
   */
  const selftestOk = Math.abs((selftest.blackOnWhite.ratio ?? 0) - 21) < 0.01
    && Math.abs((selftest.greyOnGrey.ratio ?? 0) - 1.26) < 0.01
    && Math.abs((selftest.whiteOnBlackAtHalfOpacity.ratio ?? 0) - 5.28) < 0.02
    && !!selftest.overImage.unmeasurable;
  step('B0 the contrast measurer gets known answers right before it is believed',
    selftestOk ? 'PASS' : 'FAIL',
    `#000 on #fff -> ${selftest.blackOnWhite.ratio} (expect 21.00); #777 on #888 -> `
    + `${selftest.greyOnGrey.ratio} (expect 1.26); #fff on #000 at opacity .5 -> `
    + `${selftest.whiteOnBlackAtHalfOpacity.ratio} (expect 5.28, and 21.00 if opacity is ignored); `
    + `text over a gradient -> `
    + `${selftest.overImage.unmeasurable ? 'UNMEASURABLE as designed' : 'WRONGLY GIVEN A NUMBER'}`);
  if (!selftestOk) throw new Error('contrast self-test failed; refusing to report app numbers');

  /**
   * ── PHASE B0p — PROVE THE PIXEL SAMPLER BEFORE BELIEVING A SINGLE NUMBER FROM IT ──
   *
   * Same discipline as B0 above, applied to a harder instrument. A sampler that reads the wrong
   * rectangle, or reads a STALE frame, produces confident numbers about nothing — and this track
   * has been burned by exactly that shape five times (an offline gate that never attempted a
   * request; a focus ring passing on 2 of 52; a Tab count comparing strings to elements; a regex
   * matching nothing; a closest() that matched the element itself).
   *
   * `pixelSelfTest` runs, in order: the offline PNG-codec / WCAG-maths / scale-detector proof, then
   * the CSS-pixel to image-pixel mapping DERIVED from planted fiducials, then a stale-frame
   * DIFFERENTIAL, then known-answer swatches. Each is a precondition for the next being meaningful
   * — a swatch that reads correctly through an unverified mapping proves nothing.
   *
   * `pixelsTrusted` gates every pixel number below. If any part of the proof fails, this run
   * reports the failure and produces NO pixel numbers at all. The import is dynamic and guarded so
   * that a broken sampler degrades to "pixel path unavailable" instead of taking the gate down.
   */
  let pixels = null;
  let pixelsTrusted = false;
  let pixelMapping = null;
  const pixelNonText = [];
  const pixelText = [];
  const pixelSurfaceNotes = [];
  out.pixelRequested = WANT_PIXELS;
  if (WANT_PIXELS) {
    try {
      pixels = await import('./a11y-pixel-sampler.mjs');
    } catch (err) {
      step('B0p the pixel sampler module loads', 'FAIL',
        `import failed, so the pixel path is unavailable and the CSS path below is unaffected: ${String(err?.message ?? err)}`);
    }
    if (pixels) {
      try {
        const proof = await pixels.pixelSelfTest(cdp, { sleep });
        out.pixelSelfTest = proof;
        for (const s of proof.steps) step(s.name, s.ok ? 'PASS' : 'FAIL', s.detail);
        pixelsTrusted = proof.ok;
        pixelMapping = proof.mapping ?? null;
        out.pixelMapping = pixelMapping;
      } catch (err) {
        step('B0p the pixel sampler self-test ran at all', 'FAIL',
          `the self-test threw: ${String(err?.message ?? err)}`);
      }
      if (!pixelsTrusted) {
        step('B0p the pixel sampler is TRUSTED', 'FAIL',
          'the pixel self-test did not pass, so NO pixel number is reported by this run. That is '
          + 'the whole point: a half-wired sampler returning garbage silently is worse than an '
          + 'absent one. The CSS-colour path below is untouched and still valid.');
      }
    }
  }

  // `null` is the bare desktop shell — the taskbar, the start button and the icon grid, which
  // no previous run had ever contrast-swept because every surface in the list was a window.
  const contrastSurfaces = [null, 'settings', 'dictionary', 'anki', 'library', 'reading', 'notebook', 'stats'];
  const bySurface = [];
  const allSamples = [];
  const allUnmeasurable = [];
  const allNonText = [];
  const allFocusRings = [];
  for (const section of contrastSurfaces) {
    const opened = section === null
      ? { ...(await closeAllWindows(cdp)), opened: true, windowsOpen: 0 }
      : await openSection(cdp, section);
    if (!opened.opened) continue;
    const label = section ?? 'desktop shell';
    const raw = await cdp.evaluate(CONTRAST_SWEEP).catch(() => null);
    // WCAG 1.4.11 and the focus ring, on the same surface, in the same viewport, at rest.
    const nonTextRaw = await cdp.evaluate(NONTEXT_CONTRAST).catch(() => null);
    if (nonTextRaw) {
      for (const row of JSON.parse(nonTextRaw)) allNonText.push({ ...row, surface: label });
    }
    /**
     * The PIXEL pass for this surface — same surface, same viewport, same moment as the CSS pass
     * directly above, which is what makes the two comparable at all.
     *
     * Order is deliberate: read the sample points, read the text points, CAPTURE, then re-read the
     * rects. Any control whose rect moved across that whole window is dropped as `moved` rather
     * than scored, because a hover transition or a spinner makes geometry and pixels describe
     * different moments — silently, and in whichever direction the animation happened to be going.
     */
    if (pixelsTrusted) {
      try {
        const targetsRaw = await cdp.evaluate(pixels.nonTextPixelTargets(HELPERS));
        const textRaw = await cdp.evaluate(pixels.textBackdropTargets(HELPERS, CONTRAST_MATH));
        const frame = await pixels.capture(cdp);
        const afterRaw = await cdp.evaluate(pixels.rectSnapshot(HELPERS));
        // The mapping was verified once, on the first surface. It is a property of the capture
        // pipeline rather than of page content, so it carries — but only while the capture
        // geometry is unchanged. If the window resized, refuse this surface instead of reading
        // every rectangle through a mapping that no longer describes the frame.
        if (frame.width !== pixelMapping.imageSize.width
          || frame.height !== pixelMapping.imageSize.height) {
          pixelSurfaceNotes.push(`${label}: SKIPPED — capture is ${frame.width}x${frame.height}, `
            + `but the verified mapping was derived on ${pixelMapping.imageSize.width}x`
            + `${pixelMapping.imageSize.height}`);
        } else {
          const targets = JSON.parse(targetsRaw);
          const afterByIdx = new Map(JSON.parse(afterRaw).map((r) => [r.idx, r]));
          const moved = new Set();
          for (const t of targets) {
            const a = afterByIdx.get(t.idx);
            if (!a) { moved.add(t.idx); continue; }
            if (Math.abs(a.x - t.rect.x) > 0.5 || Math.abs(a.y - t.rect.y) > 0.5
              || Math.abs(a.w - t.rect.w) > 0.5 || Math.abs(a.h - t.rect.h) > 0.5) moved.add(t.idx);
          }
          const sample = pixels.makeSampler(frame, pixelMapping);
          for (const r of pixels.scoreNonTextPixels(targets, sample, moved)) {
            pixelNonText.push({ ...r, surface: label });
          }
          for (const r of pixels.scoreTextBackdrops(JSON.parse(textRaw), sample)) {
            pixelText.push({ ...r, surface: label });
          }
          pixelSurfaceNotes.push(`${label}: ${targets.length} controls targeted, ${moved.size} `
            + 'dropped for moving across the capture');
        }
      } catch (err) {
        pixelSurfaceNotes.push(`${label}: pixel pass FAILED — ${String(err?.message ?? err)}`);
      }
    }
    if (!raw) continue;
    const { samples, unmeasurable } = JSON.parse(raw);
    const fails = samples.filter((s) => !s.passes);
    bySurface.push({
      surface: label,
      windowsOpen: opened.windowsOpen,
      measured: samples.length,
      failing: fails.length,
      unmeasurable: unmeasurable.length,
      worst: samples.slice().sort((a, b) => a.ratio - b.ratio).slice(0, 5)
        .map((s) => ({ el: s.el, text: s.text, ratio: s.ratio, required: s.required, color: s.color, background: s.background })),
    });
    for (const s of samples) allSamples.push({ ...s, surface: label });
    for (const u of unmeasurable) allUnmeasurable.push({ ...u, surface: label });
  }
  const failing = allSamples.filter((s) => !s.passes);
  // Dedupe by the thing that actually needs fixing: a colour pair at a size, not an instance.
  const byPair = new Map();
  for (const s of failing) {
    const key = `${s.color} on ${s.background} @${s.fontSize}px/${s.fontWeight}`;
    const hit = byPair.get(key) ?? { key, ratio: s.ratio, required: s.required, count: 0, examples: [] };
    hit.count += 1;
    if (hit.examples.length < 3) hit.examples.push(`${s.el} "${s.text}"`);
    byPair.set(key, hit);
  }
  out.contrast = {
    surfacesSwept: bySurface.map((b) => b.surface),
    totalMeasured: allSamples.length,
    totalFailing: failing.length,
    failingPct: allSamples.length ? Math.round((failing.length / allSamples.length) * 1000) / 10 : null,
    totalUnmeasurable: allUnmeasurable.length,
    unmeasurableReasons: [...new Set(allUnmeasurable.map((u) => u.reason))].slice(0, 20),
    // How much the opacity term moved things. If this is 0 the correction was inert here and
    // the number should not be quoted as if it did work.
    samplesWithReducedOpacity: allSamples.filter((s) => (s.opacityProduct ?? 1) < 1).length,
    failingOnlyBecauseOfOpacity: failing
      .filter((s) => s.ratioIgnoringOpacity >= s.required).length,
    distinctFailingPairs: [...byPair.values()].sort((a, b) => a.ratio - b.ratio),
    worstOverall: allSamples.slice().sort((a, b) => a.ratio - b.ratio).slice(0, 15),
    /**
     * 1.4.3 exempts inactive components. Both numbers are kept: the raw one so the record is
     * complete, and the exemption-aware one because reporting a disabled button as a WCAG
     * failure is as wrong as hiding a real one.
     */
    failingExcludingInactive: failing.filter((s) => !s.inactive).length,
    failingInactiveExempt: failing.filter((s) => s.inactive).length,
    failingDetail: failing.map((s) => ({
      surface: s.surface,
      el: s.el,
      path: s.path,
      text: s.text,
      declared: s.color,
      painted: s.colorPainted,
      background: s.background,
      opacityProduct: s.opacityProduct,
      ratio: s.ratio,
      ratioIgnoringOpacity: s.ratioIgnoringOpacity,
      required: s.required,
      inactive: s.inactive,
    })),
    bySurface,
  };
  step('B1 contrast measured over the real painted text', 'MEASURED',
    `${allSamples.length} text samples, ${failing.length} below WCAG AA `
    + `(${out.contrast.failingPct}%), of which ${out.contrast.failingInactiveExempt} are on `
    + `INACTIVE controls and exempt under 1.4.3 -> ${out.contrast.failingExcludingInactive} real; `
    + `${allUnmeasurable.length} unmeasurable, ${byPair.size} distinct failing colour pairs`);

  // ── PHASE B2 — non-text contrast, WCAG 1.4.11 at 3:1 ──────────────────────────
  const scoredNonText = allNonText.filter((r) => r.boundaryKind && r.boundaryKind !== 'none');
  const LOAD_BEARING = new Set(['identity', 'affordance', 'state']);
  const belowThree = scoredNonText.filter((r) => !r.passes && !r.inactive);
  const nonTextFail = belowThree.filter((r) => LOAD_BEARING.has(r.boundaryRole));
  const decorativeBelowThree = belowThree.filter((r) => !LOAD_BEARING.has(r.boundaryRole));
  const nonTextFailInactive = scoredNonText.filter((r) => !r.passes && r.inactive);
  const nonTextByPair = new Map();
  for (const r of nonTextFail) {
    const key = `${r.boundaryRole} ${r.boundaryKind} ${r.painted} on ${r.against}`;
    const hit = nonTextByPair.get(key)
      ?? { key, role: r.boundaryRole, ratio: r.ratio, declared: r.declared, count: 0, examples: [] };
    hit.count += 1;
    if (hit.examples.length < 4) hit.examples.push(`${r.surface} ${r.path} "${r.name}"`);
    nonTextByPair.set(key, hit);
  }
  const decorativePairs = new Map();
  for (const r of decorativeBelowThree) {
    const key = `${r.boundaryKind} ${r.painted} on ${r.against}`;
    const hit = decorativePairs.get(key)
      ?? { key, ratio: r.ratio, declared: r.declared, count: 0, examples: [] };
    hit.count += 1;
    if (hit.examples.length < 3) hit.examples.push(`${r.surface} ${r.path} "${r.name}"`);
    decorativePairs.set(key, hit);
  }
  out.nonTextContrast = {
    controlsSeen: allNonText.length,
    scored: scoredNonText.length,
    boundaryLessNotScored: allNonText.filter((r) => r.boundaryKind === 'none').length,
    unmeasurable: allNonText.filter((r) => r.unmeasurable).length,
    /** Everything under 3:1, before the question of what the boundary was carrying. */
    belowThreeRaw: belowThree.length,
    /** The subset where the boundary is load-bearing. THIS is the WCAG 1.4.11 number. */
    failing: nonTextFail.length,
    failingByRole: ['identity', 'affordance', 'state'].reduce((acc, role) => {
      acc[role] = nonTextFail.filter((r) => r.boundaryRole === role).length;
      return acc;
    }, {}),
    /**
     * Text-identified controls whose fill or hairline is under 3:1. NOT counted as failures —
     * the text identifies the control and 1.4.3 already passed on it — but recorded, because
     * "this app draws almost no visible button boundaries" is a true statement about it and
     * dropping the number entirely would hide that.
     */
    decorativeBelowThree: decorativeBelowThree.length,
    decorativeBelowThreePairs: [...decorativePairs.values()].sort((a, b) => a.ratio - b.ratio),
    failingInactiveExempt: nonTextFailInactive.length,
    distinctFailingPairs: [...nonTextByPair.values()].sort((a, b) => a.ratio - b.ratio),
    worst: scoredNonText.slice().sort((a, b) => a.ratio - b.ratio).slice(0, 15),
  };
  step('B2 non-text contrast of interactive control BOUNDARIES (WCAG 1.4.11, 3:1)',
    scoredNonText.length === 0 ? 'UNTESTED' : nonTextFail.length === 0 ? 'PASS' : 'FAIL',
    scoredNonText.length === 0
      ? 'no control on any surface paints a border or a background — nothing to score, and a '
        + 'green here would be about nothing'
      : `${scoredNonText.length} boundaries scored, ${belowThree.length} below 3:1 — of which `
        + `${nonTextFail.length} are LOAD-BEARING `
        + `(${JSON.stringify(out.nonTextContrast.failingByRole)}) and carry this verdict, and `
        + `${decorativeBelowThree.length} sit on controls identified by their own text, where the `
        + 'faint fill is decoration and 1.4.3 already covers the label; '
        + `${out.nonTextContrast.boundaryLessNotScored} controls paint no boundary at all and are `
        + `not scored; ${nonTextFailInactive.length} failing boundaries are on inactive controls`);

  /**
   * ── PHASE B2p / B1p — THE SAME TWO QUESTIONS, ASKED OF THE PAINTED PIXELS ──────
   *
   * This is the phase that exists because "B2 PASS" on aero meant "PASS on 8 samples of 251".
   * It only runs when B0p proved the sampler against known answers.
   */
  if (WANT_PIXELS && pixelsTrusted) {
    out.pixelSurfaceNotes = pixelSurfaceNotes;

    const pxScored = pixelNonText.filter((r) => typeof r.ratio === 'number');
    const pxUnmeasurable = pixelNonText.filter((r) => r.unmeasurable);
    const pxBelow = pxScored.filter((r) => !r.passes && !r.inactive);
    out.nonTextPixelContrast = {
      method: 'boundary and backdrop pixels sampled from Page.captureScreenshot, through a '
        + 'mapping derived from planted fiducials and cross-checked four ways (see out.pixelMapping)',
      scoring: 'max over boundary colours of (min over adjacent colours) — the strongest '
        + 'identifying feature carries the verdict, but must hold against the weakest-contrasting '
        + 'adjacent colour, which is the strict reading over a gradient. bestPairRatio is kept '
        + 'beside it so the choice is auditable.',
      controlsSeen: pixelNonText.length,
      scored: pxScored.length,
      unmeasurable: pxUnmeasurable.length,
      unmeasurableReasons: [...new Set(pxUnmeasurable.map((r) => r.unmeasurable))].slice(0, 20),
      belowThree: pxBelow.length,
      failingInactiveExempt: pxScored.filter((r) => !r.passes && r.inactive).length,
      worst: pxScored.slice().sort((a, b) => a.ratio - b.ratio).slice(0, 20),
      /** A wide backdrop luminance span is what a gradient — or an undetected occluder — looks
       *  like from the outside. Recorded so an implausible reading is visible, not silent. */
      withWideBackdropSpan: pxScored.filter((r) => (r.outsideLuminanceSpan ?? 0) > 0.1).length,
      /**
       * `belowThree` uses the STRICT reading — strongest boundary against the WEAKEST-contrasting
       * adjacent colour. Over a gradient that reading nearly always fails, because somewhere along
       * the gradient there is a colour close to the boundary's. On the first aero run, 156 of 231
       * scored controls had a wide backdrop span and `belowThree` was 217 — a number nobody should
       * read as 217 defects.
       *
       * These two split it. A control failing BOTH readings is invisible against *every* part of
       * its backdrop and is an unambiguous defect; one that fails only the strict reading is
       * visible against most of its backdrop and is a judgement call about the worst spot.
       *
       * Added because the record kept only the worst 20 rows, so the split could not be recovered
       * from a finished proof — the summary has to carry it or the run has to be repeated.
       */
      belowThreeOnBothReadings: pxBelow.filter(
        (r) => typeof r.bestPairRatio === 'number' && r.bestPairRatio < 3,
      ).length,
      belowThreeStrictOnly: pxBelow.filter(
        (r) => typeof r.bestPairRatio === 'number' && r.bestPairRatio >= 3,
      ).length,
      /**
       * THE NUMBER TO ACT ON. Everything above counts all 251 controls flat; 1.4.11 governs
       * boundaries that IDENTIFY a control, so a nav item named by its own text is not a failure
       * because its fill is faint — 1.4.3 covers that label. The CSS path has always made this
       * split (it excludes 68 such controls on the default theme); B2p did not, which is why its
       * raw 217 over-counted.
       *
       * Load-bearing AND invisible against the entire backdrop is the intersection that means
       * "a user cannot tell this control is there", which is the actual claim of 1.4.11.
       */
      loadBearingBelowThreeOnBothReadings: pxBelow.filter(
        (r) => LOAD_BEARING.has(r.boundaryRole)
          && typeof r.bestPairRatio === 'number' && r.bestPairRatio < 3,
      ).length,
      byRoleBelowThreeOnBothReadings: ['identity', 'affordance', 'state', 'decorative']
        .reduce((acc, role) => {
          acc[role] = pxBelow.filter(
            (r) => r.boundaryRole === role
              && typeof r.bestPairRatio === 'number' && r.bestPairRatio < 3,
          ).length;
          return acc;
        }, {}),
      /**
       * THE ROWS BEHIND THE ACTIONABLE COUNT — without these the count is not actionable.
       *
       * `worst` keeps the 20 lowest-ratio rows, and on aero every one of those was `decorative`
       * (a nav item naming itself, whose faint fill is not a 1.4.11 failure). The 23 load-bearing
       * failures were all LESS extreme, so none of them appeared, and "23 failures" named no
       * control anyone could go and fix. Kept separately, and capped, so the count and the
       * evidence for it always travel together.
       */
      worstLoadBearing: pxBelow
        .filter((r) => LOAD_BEARING.has(r.boundaryRole)
          && typeof r.bestPairRatio === 'number' && r.bestPairRatio < 3)
        .sort((a, b) => a.bestPairRatio - b.bestPairRatio)
        .slice(0, 30),
    };
    step('B2p non-text contrast of control boundaries from PAINTED PIXELS (WCAG 1.4.11, 3:1)',
      pxScored.length === 0 ? 'UNTESTED' : pxBelow.length === 0 ? 'PASS' : 'FAIL',
      pxScored.length === 0
        ? 'no control yielded a valid boundary/backdrop pixel pair — nothing to score, and a green '
          + 'here would be about nothing'
        : `${pxScored.length} of ${pixelNonText.length} controls scored from real pixels `
          + `(the CSS-colour path scored ${out.nonTextContrast.scored} of `
          + `${out.nonTextContrast.controlsSeen}); ${pxBelow.length} below 3:1; `
          + `${pxUnmeasurable.length} still unmeasurable`);

    const txScored = pixelText.filter((r) => typeof r.ratioWorstBackdrop === 'number');
    const txBelow = txScored.filter((r) => !r.passes && !r.inactive);
    out.textPixelContrast = {
      method: 'HYBRID and deliberately weaker than B2p: the FOREGROUND is what CSS declares '
        + '(composited with its own alpha and the ancestor opacity product, via the already '
        + 'self-tested maths), and only the BACKDROP is sampled from pixels. Reading glyph colour '
        + 'off an antialiased screen would bias every result in whichever direction the hinting '
        + 'went. THIS IS NOT A PIXEL-TRUTH READING OF TEXT CONTRAST and must not be quoted as one.',
      samples: pixelText.length,
      scored: txScored.length,
      unmeasurable: pixelText.filter((r) => r.unmeasurable).length,
      belowAA: txBelow.length,
      failingInactiveExempt: txScored.filter((r) => !r.passes && r.inactive).length,
      /** Where glyphs dominated the sampled rect the backdrop estimate is weak — surfaced rather
       *  than averaged away. */
      withHeavyGlyphCoverage: txScored.filter((r) => (r.glyphPixelFraction ?? 0) > 0.5).length,
      worst: txScored.slice().sort((a, b) => a.ratioWorstBackdrop - b.ratioWorstBackdrop).slice(0, 20),
    };
    step('B1p text contrast against the PAINTED backdrop (declared foreground, sampled backdrop)',
      txScored.length === 0 ? 'UNTESTED' : 'MEASURED',
      `${txScored.length} of ${pixelText.length} text samples scored against a sampled backdrop `
      + `(the CSS path measured ${out.contrast.totalMeasured} and could not measure `
      + `${out.contrast.totalUnmeasurable}); ${txBelow.length} below AA against the WORST sampled `
      + `backdrop; ${out.textPixelContrast.withHeavyGlyphCoverage} had glyphs over half the sampled `
      + 'points and their backdrop estimate is correspondingly weak');

    /**
     * THE DISAGREEMENT — the finding this phase is most likely to produce.
     *
     * The CSS path knows what was DECLARED; the pixel path knows what was PAINTED. Slice 62 found
     * a ring declared opaque that painted at 16% alpha, and that class of defect is visible ONLY
     * as a difference between the two. Joins are unambiguous-only: a key appearing more than once
     * on either side is excluded and counted rather than matched by position and hoped for.
     */
    out.contrastPathDisagreement = pixels.joinPaths(allNonText, pixelNonText);
    const d = out.contrastPathDisagreement.counts;
    step('B2d what the CSS-DECLARED path and the PIXEL-PAINTED path say about the same controls',
      'MEASURED',
      `${d.cssUnmeasurablePixelScored} control(s) the CSS path could NOT measure are scored from `
      + `pixels (this is the aero hole closing); ${d.bothScoredDisagree} scored by both but `
      + `differing by more than 0.5 (declared is not painted — a slice-62-shaped finding); `
      + `${d.cssScoredPixelUnmeasurable} the CSS path scored and pixels could not (occluded or `
      + `off-screen); ${d.bothUnmeasurable} invisible to both; ${d.bothScoredAgree} agree; `
      + `${out.contrastPathDisagreement.ambiguousJoin} keys were ambiguous and are NOT joined`);
  } else if (WANT_PIXELS) {
    step('B2p non-text contrast from PAINTED PIXELS', 'FAIL',
      'NOT REPORTED — the pixel sampler did not pass its own known-answer self-test above, so it '
      + 'produced no numbers. The CSS-colour path results above are unaffected and still stand.');
  }

  // ── PHASE B3 — is the focus ring itself visible? ──────────────────────────────
  // Sourced from the KEYBOARD WALK, not from a scripted focus() sweep. See the note in
  // FOCUS_READ: Chromium only draws a :focus-visible ring for focus it believes came from the
  // keyboard, so a focus() sweep measures the wrong state on most controls.
  for (const k of out.keyboard) {
    for (const r of (k.ringSamples ?? [])) allFocusRings.push({ ...r, surface: k.surface });
  }
  const ringScored = allFocusRings.filter((r) => typeof r.ratio === 'number');
  const ringFail = ringScored.filter((r) => !r.passes);
  out.focusRingContrast = {
    source: 'the keyboard walk (real Tab presses), read after SETTLE_MS at rest',
    stopsWithARingMeasured: ringScored.length,
    unmeasurableReasons: [...new Set(out.keyboard.flatMap((k) => k.ringUnmeasurable ?? []))],
    failing: ringFail.length,
    distinctRingColours: [...new Set(ringScored
      .map((r) => `${r.declared} painted ${r.painted} on ${r.against} -> ${r.ratio}:1`))],
    failingDetail: ringFail.slice(0, 15),
    worst: ringScored.slice().sort((a, b) => a.ratio - b.ratio).slice(0, 10),
  };
  step('B3 the focus RING is not merely present but visible (3:1 against what it sits on)',
    ringScored.length === 0 ? 'UNTESTED' : ringFail.length === 0 ? 'PASS' : 'FAIL',
    ringScored.length === 0
      ? 'no walk stop carried a measurable outline — presence was measured by phase A, and this '
        + 'phase has nothing to score'
      : `${ringScored.length} distinct ringed stops measured on the real Tab walk, `
        + `${ringFail.length} below 3:1; `
        + out.focusRingContrast.distinctRingColours.slice(0, 6).join(' | '));

  // ── PHASE C — artwork surfaces ─────────────────────────────────────────────────
  // 47k could not reach one. These are the routes whose art is LOCAL, so an empty library and
  // no sidecar do not decide the answer.
  // `player` is the Media Center LIBRARY — the poster grid (`MediaArtwork` -> `medialib-card__img`)
  // that the phrase "poster and cover-art grids" actually names. Slice 50's list did not contain
  // it, so the one surface whose whole job is artwork was never asked. Added here.
  const artworkSurfaces = ['scraper', 'reading', 'music', 'immersion', 'novels', 'library', 'city', 'player'];
  const art = [];
  for (const section of artworkSurfaces) {
    const opened = await openSection(cdp, section, 3000);
    if (!opened.opened) continue;
    const raw = await cdp.evaluate(ARTWORK).catch(() => null);
    if (!raw) continue;
    const parsed = JSON.parse(raw);
    art.push({ surface: section, windowsOpen: opened.windowsOpen, ...parsed });
  }
  /**
   * DISTINCT images, not image-sightings. With the windows now closed between surfaces this
   * should barely matter, but the first run reported "22 visible <img> across 7 surfaces" when
   * the same 3 images were being re-counted on every surface — roughly 4 distinct. Keeping the
   * dedupe means the headline number cannot drift back into a sighting count.
   */
  const seenImage = new Map();
  for (const a of art) {
    for (const i of a.images) {
      const key = `${i.path ?? i.el}|${i.srcKey ?? i.src}`;
      if (!seenImage.has(key)) seenImage.set(key, { ...i, surfaces: [] });
      seenImage.get(key).surfaces.push(a.surface);
    }
  }
  const allImages = [...seenImage.values()];
  const imageSightings = art.reduce((n, a) => n + a.imageCount, 0);
  const loaded = allImages.filter((i) => i.complete && i.naturalWidth > 0);
  const noAltAttr = allImages.filter((i) => !i.hasAltAttr);
  const emptyAlt = allImages.filter((i) => i.hasAltAttr && i.alt === '');
  // The judgement the attribute check cannot make: decorative is fine, but an image marked
  // decorative inside a card that carries no text at all leaves that card nameless.
  const emptyAltNoCardText = emptyAlt.filter((i) => i.cardTextLength === 0);
  out.artwork = {
    surfacesOpened: art.map((a) => ({
      surface: a.surface, images: a.imageCount, cssBackgroundArt: a.cssBackgroundArtCount,
    })),
    totalImages: allImages.length,
    imageSightings,
    imagesActuallyLoaded: loaded.length,
    missingAltAttribute: noAltAttr.length,
    missingAltExamples: noAltAttr.slice(0, 10),
    decorativeEmptyAlt: emptyAlt.length,
    decorativeInsideTextlessCard: emptyAltNoCardText.length,
    decorativeInsideTextlessCardExamples: emptyAltNoCardText.slice(0, 10),
    describedAlt: allImages.filter((i) => i.hasAltAttr && i.alt !== '').length,
    cssBackgroundArtTotal: art.reduce((n, a) => n + a.cssBackgroundArtCount, 0),
    perSurface: art,
  };
  /**
   * Fixture art can arrive as a CSS BACKGROUND, and the cover grid does exactly that
   * (`LibraryView.tsx:1297` paints `.cover` with a background-image and only falls back to a text
   * title when there is no cover). A background has no `src`, so the `<img>` filter below cannot
   * see it. Counting only images made C0b assert "the app did not read the seeded stores" while
   * the app had read `library.json` and painted all 8 covers — the same wrong-layer mistake this
   * gate has now made about borders, rings, pseudo-elements and here about background art.
   *
   * Kept as a SEPARATE count rather than folded into one number, because the two answer different
   * questions: 8 covers landing and 12 posters not landing is a precise finding, and a single
   * "fixture landed: true" would hide the half that is still broken.
   */
  const fixtureBg = art
    .flatMap((a) => a.cssBackgroundArt || [])
    .filter((b) => /^(playfile|media):\/\//.test(b.bgUrl || ''));
  out.artwork.fixtureBackgroundArtOnScreen = fixtureBg.length;
  out.artwork.fixtureBackgroundArtExamples = fixtureBg.slice(0, 6);
  // AN ASSERTION ABOUT IMAGES MUST FIRST ESTABLISH THAT IMAGES EXISTED. This is the exact
  // failure 47k recorded against itself, so it is a hard gate here rather than a footnote.
  const artworkTested = allImages.length > 0;
  step('C0 the artwork check met its subject',
    artworkTested ? 'PASS' : 'UNTESTED',
    artworkTested
      ? `${allImages.length} DISTINCT visible <img> across ${art.length} surfaces `
        + `(${imageSightings} sightings), ${loaded.length} decoded`
      : 'ZERO visible <img> on every surface opened — the alt-text checks below are vacuous, '
        + 'exactly as in slice 47k, and are reported as UNTESTED rather than passing');

  /**
   * C0b — DID THE FIXTURE ACTUALLY LAND ON SCREEN?
   *
   * Writing a fixture and measuring afterwards is not the same as measuring the fixture. If the
   * poster grid ignored `media.json`, the artwork numbers would be the same empty-profile
   * numbers as slice 50's, and the run would report them under a heading that says "with a real
   * library" — a worse lie than admitting it is unmeasurable. So the fixture's own images are
   * counted separately, by their `playfile://` / `media://` scheme, and the coverage claim below
   * is only allowed to be made when they are on screen.
   */
  const fixtureImages = allImages.filter((i) => /^(playfile|media):\/\//.test(i.src || ''));
  const fixtureLanded = !WANT_FIXTURE ? null : (fixtureImages.length + fixtureBg.length) > 0;
  out.artwork.fixtureImagesOnScreen = fixtureImages.length;
  out.artwork.fixtureImageExamples = fixtureImages.slice(0, 6).map((i) => ({
    el: i.el, path: i.path, alt: i.alt, cardText: i.cardText, cardTextLength: i.cardTextLength,
  }));
  if (WANT_FIXTURE) {
    step('C0b the seeded artwork is ACTUALLY PAINTED, not merely on disk',
      fixtureLanded ? 'PASS' : 'FAIL',
      fixtureLanded
        ? `${fixtureImages.length} of ${allImages.length} distinct <img> and ${fixtureBg.length} `
          + 'CSS-background element(s) are fixture art (playfile:// / media:// scheme), so the '
          + 'alt-text reading below is about real poster/cover tiles rather than an empty profile'
          + (fixtureImages.length === 0
            ? ' — NOTE: every one arrived as a CSS BACKGROUND, which has no alt slot, so the '
              + 'alt-text numbers below still describe only the non-fixture images'
            : '')
        : `the fixture wrote ${out.fixture?.files ?? 0} files but NOT ONE of the ${allImages.length} `
          + `images nor any CSS background on screen came from it — the app did not read the `
          + 'seeded stores, and every artwork number here is still the empty-profile number');
  }

  if (artworkTested) {
    step('C1 artwork text alternatives', 'MEASURED',
      `${noAltAttr.length} with NO alt attribute, ${emptyAlt.length} marked decorative `
      + `(alt=""), of which ${emptyAltNoCardText.length} sit in a card carrying no text at all; `
      + `${out.artwork.describedAlt} carry a description; CSS background art (no alt slot at all) `
      + `on ${out.artwork.cssBackgroundArtTotal} elements`);
  }

  // ── PHASE D — the player overlay ───────────────────────────────────────────────
  const player = [];
  for (const section of ['player', 'video', 'music']) {
    const opened = await openSection(cdp, section, 4000);
    if (!opened.opened) continue;
    const raw = await cdp.evaluate(PLAYER_PROBE).catch(() => null);
    if (!raw) continue;
    const probe = JSON.parse(raw);
    probe.windowsOpen = opened.windowsOpen;
    // Census FIRST, before the walk: it is a direct DOM enumeration and does not care whether
    // Tab can reach anything, so it still answers on a surface the walk finds empty.
    probe.sliderCensus = JSON.parse(await cdp.evaluate(SLIDER_CENSUS).catch(() => 'null')) ?? [];
    // Only audit a11y of a surface that is actually there — otherwise this is 47k's mistake
    // with a different subject.
    if (probe.visibleControls > 0) {
      const walk = await walkSurface(cdp, `player:${section}`);
      probe.keyboardWalk = {
        distinctStops: walk.distinctStops,
        focusableVisible: walk.focusableVisible,
        coveredAllFocusable: walk.coveredAllFocusable,
        indicatorCounts: walk.indicatorCounts,
        unnamedStops: walk.unnamedStops,
        placeholderOnlyStops: walk.placeholderOnlyStops,
        // Kept, because "no indicator detected" and "no indicator" are different claims and
        // only the verification pass separates them.
        noIndicatorVerified: walk.noIndicatorVerified,
        order: walk.order,
      };
      const contrastRaw = await cdp.evaluate(CONTRAST_SWEEP).catch(() => null);
      if (contrastRaw) {
        const { samples, unmeasurable } = JSON.parse(contrastRaw);
        probe.contrast = {
          measured: samples.length,
          failing: samples.filter((s) => !s.passes).length,
          unmeasurable: unmeasurable.length,
          worst: samples.slice().sort((a, b) => a.ratio - b.ratio).slice(0, 5),
        };
      }
    }
    player.push({ surface: section, ...probe });
  }
  out.player = player;
  const overlayFound = player.some((p) => p.studyCueOverlayVisible);
  const videoFound = player.some((p) => p.videoVisible);
  step('D0 the player STUDY OVERLAY is reachable on this profile',
    overlayFound ? 'PASS' : 'NOT-REACHABLE',
    overlayFound
      ? 'the .study-cue-overlay is mounted and visible'
      : 'no .study-cue-overlay mounted on player/video/music with an empty library, no sidecar '
        + 'and no media — its accessibility is NOT measured by this run, and saying otherwise '
        + `would be a claim about a surface that was never on screen (video elements: ${videoFound})`);
  step('D1 what the player routes DO put on screen', 'MEASURED',
    player.map((p) => `${p.surface}: ${p.visibleControls} controls, video=${p.videoElements}, `
      + `overlay=${p.studyCueOverlay}`).join(' | ') || 'no player route opened');

  /**
   * ── PHASE E — the slider census (slice 53) ────────────────────────────────────
   *
   * Deduped across surfaces by DOM path, because the same player bar is mounted on all three
   * player routes and counting sightings would inflate every number by 3x — the same mistake
   * the artwork phase already corrects for.
   */
  const sliderByPath = new Map();
  for (const p of player) {
    for (const s of (p.sliderCensus ?? [])) {
      const key = `${s.path}|${s.el}`;
      if (!sliderByPath.has(key)) sliderByPath.set(key, { ...s, surfaces: [] });
      sliderByPath.get(key).surfaces.push(p.surface);
    }
  }
  const sliders = [...sliderByPath.values()];
  const namedStrictly = sliders.filter((s) => s.namedStrictly);
  const titleOnly = sliders.filter((s) => s.nameSource === 'title');
  const nameless = sliders.filter((s) => s.nameSource === 'none');
  const unreachable = sliders.filter((s) => !s.tabReachable);
  out.sliders = {
    distinct: sliders.length,
    namedStrictly: namedStrictly.length,
    titleOnly: titleOnly.length,
    nameless: nameless.length,
    notTabReachable: unreachable.length,
    /** Named but skipped by Tab — a real state, and NOT the same claim as "passes". */
    namedButNotTabReachable: sliders.filter((s) => s.namedStrictly && !s.tabReachable).length,
    namelessExamples: nameless.map((s) => s.path).slice(0, 10),
    titleOnlyExamples: titleOnly.map((s) => `${s.path} title="${s.title}"`).slice(0, 10),
    all: sliders,
  };
  // 47k's mistake, guarded: an assertion about sliders must first establish sliders existed.
  step('E0 the slider census met its subject', sliders.length > 0 ? 'PASS' : 'UNTESTED',
    sliders.length > 0
      ? `${sliders.length} distinct input[type=range] across ${player.length} player routes`
      : 'ZERO range inputs found on any player route — every slider claim below would be '
        + 'vacuous and is reported as UNTESTED rather than as a pass');
  if (sliders.length > 0) {
    step('E1 range inputs carrying an accessible name by accname precedence',
      nameless.length === 0 ? 'PASS' : 'FAIL',
      `${namedStrictly.length}/${sliders.length} named via aria-label|aria-labelledby|label; `
      + `${titleOnly.length} title-ONLY (nameless by slice 52's rule); `
      + `${nameless.length} with no name at all`
      + (nameless.length ? ` -> ${nameless.map((s) => s.path).join(' , ')}` : ''));
    step('E2 sliders Tab cannot reach on this profile',
      unreachable.length === 0 ? 'PASS' : 'NOT-REACHABLE',
      unreachable.length === 0
        ? 'every range input is Tab-reachable'
        : `${unreachable.length} skipped by sequential navigation (disabled/hidden) — their names `
          + 'are read from the DOM, NOT from a keyboard stop: '
          + unreachable.map((s) => `${s.path} [disabled=${s.disabled} visible=${s.visible} `
            + `named=${s.namedStrictly}]`).join(' , '));
  }

  /**
   * THE VERDICT. This gate is a MEASUREMENT, and its exit code says whether the measurement is
   * trustworthy — not whether the app is accessible. Findings with numbers are the product;
   * turning them into a pass/fail ceiling is the next slice's job, once someone has decided
   * which of them are accepted.
   */
  out.verdict = 'MEASURED';
  out.trustworthy = {
    tabKeysArrived: anyMoved,
    contrastSelfTestPassed: selftestOk,
    viewportPinned: viewportOk,
    artworkMetItsSubject: artworkTested,
    /**
     * `null` when no fixture was asked for. That is deliberately NOT `false`: "no artwork was
     * seeded" and "artwork was seeded and never appeared" are different states and collapsing
     * them is how a 3-image sample gets quoted as coverage.
     */
    artworkFixtureLanded: fixtureLanded,
    keyboardReachedEveryFocusable: everythingReached,
    nonTextContrastScored: (out.nonTextContrast?.scored ?? 0) > 0,
    focusRingContrastScored: (out.focusRingContrast?.stopsWithARingMeasured ?? 0) > 0,
    /**
     * `null` when --pixels was not asked for. Deliberately NOT `false`: "the pixel path was not
     * run" and "the pixel path ran and could not prove itself" are different states, and
     * collapsing them is how an unproven instrument gets quoted as a measurement.
     */
    pixelSamplerProven: WANT_PIXELS ? pixelsTrusted : null,
    pixelNonTextScored: WANT_PIXELS && pixelsTrusted
      ? (out.nonTextPixelContrast?.scored ?? 0) > 0 : null,
    playerOverlayReached: overlayFound,
    sliderCensusMetItsSubject: sliders.length > 0,
  };
  cdp.close();
  return out.verdict;
}

if (process.argv.slice(2).includes('--selfcheck')) {
  const broken = compileCheck();
  console.log(broken.length ? `BROKEN:\n${broken.join('\n')}` : 'all page-side probes compile');
  process.exit(broken.length ? 1 : 0);
}

main()
  .then((verdict) => { out.result = verdict; })
  .catch((err) => { out.result = 'ERROR'; out.error = String(err?.message ?? err); log(`ERROR ${out.error}`); })
  .finally(() => {
    out.finishedAt = new Date().toISOString();
    out.log = logLines;
    if (child?.pid) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    }
    /**
     * The exit code is deliberately about MEASUREMENT TRUSTWORTHINESS, not conformance — see THE
     * VERDICT above. That distinction is right and it stays. But it does mean `$?` is 0 while
     * steps are FAILing, and slice 62 briefly mistook that for a bug: an operator who reads only
     * the exit code, or only the last line, would call this run green while B2 reported a WCAG
     * failure. Naming the failures costs nothing and removes the need to know any of this.
     *
     * MUST be computed BEFORE the record is written. The first version of this block sat after
     * writeFileSync, so the console line was right while `failedSteps` never reached the JSON at
     * all — it read as `undefined` in the record, i.e. indistinguishable from "this field was
     * never added". Same silent-loss shape as the other three in this slice, and it looked like it
     * worked because the half that is visible on a terminal did.
     */
    const failedSteps = (out.steps || []).filter((s) => s.result === 'FAIL');
    out.failedSteps = failedSteps.map((s) => s.name);
    fs.mkdirSync(workRoot, { recursive: true });
    fs.writeFileSync(path.join(workRoot, 'packaged-a11y-deep.json'), `${JSON.stringify(out, null, 2)}\n`);
    console.log(`\nrecord: ${path.join(workRoot, 'packaged-a11y-deep.json')}`);
    if (failedSteps.length) {
      console.log(`\n${failedSteps.length} step(s) FAILED. The exit code below reports whether the `
        + `MEASUREMENT is trustworthy, NOT whether the app conforms — do not read 0 as a pass:`);
      for (const s of failedSteps) console.log(`  FAIL  ${s.name}`);
    }
    process.exitCode = out.result === 'MEASURED' ? 0 : 1;
  });
