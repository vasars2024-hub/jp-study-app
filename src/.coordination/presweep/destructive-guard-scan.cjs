#!/usr/bin/env node
/**
 * Pre-sweep class 5 — does every destructive action ask first?
 *
 * The pin's own arithmetic: destructive-guard produced only 5 of the first 89 findings but
 * 1 of the 9 P1s, and count-vs-truth another 3 — the two classes a script cannot fully
 * judge are the ones carrying the highest value per finding. This does the half a script
 * CAN do: enumerate every call into a main-process route whose name says it destroys
 * something, and report whether the function that calls it asks the user first.
 *
 * It is a LEAD generator, exactly like `inert-settings-scan.cjs`. A hit is not a defect:
 *
 *   - the confirm may live one frame up, in the component that calls this handler;
 *   - the name may lie (`clearArtCache` frees memory, `removeFromDesktop` unpins an icon);
 *   - the action may be genuinely reversible, which is the documented alternative to a
 *     confirm in `FILES_APP_PLAN.md` — a soft delete with an undo window is BETTER than a
 *     modal, and must not be filed as a missing guard.
 *
 * So every hit is confirmed by hand before it is filed, and the row says how.
 *
 * Usage:
 *   node src/.coordination/presweep/destructive-guard-scan.cjs            # unguarded only
 *   node src/.coordination/presweep/destructive-guard-scan.cjs --all      # every call site
 */
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.resolve(__dirname, '..', '..');
const ARGS = process.argv.slice(2);
const SHOW_ALL = ARGS.includes('--all');

/**
 * Verbs that mean "the user loses something". `close`/`stop`/`cancel` are deliberately
 * absent: they end an activity, they do not destroy a stored thing.
 */
const DESTRUCTIVE = /(delete|clear|remove|reset|discard|purge|prune|wipe|trash|unlink|forget|erase)/i;

/**
 * Names that MATCH the verb pattern but destroy nothing the user owns — an in-memory
 * cache, a transient UI selection, a draft that is re-derived on the next render.
 * Excluded here rather than filtered later so the reported count means something.
 */
const NOT_USER_DATA = new Set([
  'clearArtCache',
  'clearThumbCache',
  'clearImageCache',
  'clearSelection',
  'clearStatus',
  'clearError',
  'clearFilter',
  'clearSearch',
  'clearHighlight',
  'clearToast',
  'clearWallpaper',
  'removeFromDesktop',
  'resetZoom',
  'resetView',
  'resetScroll',
  'resetForm',
]);

const GUARDS = /(confirmDialog|window\.confirm|\bconfirm\s*\(|confirmed|requireConfirm|dangerConfirm)/;
/** An undo route is the documented alternative to a modal, not a missing guard. */
const UNDO = /(undo|Undo|softDelete|trashItem|toTrash|recycle|restorable)/;

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name === 'chrome-extension') continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
}

/** Blank out comments and string bodies so neither can supply a fake guard or a fake call. */
function mask(src) {
  let out = '';
  let i = 0;
  const keepNl = (s) => s.replace(/[^\n]/g, ' ');
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '//') {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      out += keepNl(src.slice(i, stop));
      i = stop;
    } else if (two === '/*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += keepNl(src.slice(i, stop));
      i = stop;
    } else if (src[i] === "'" || src[i] === '"') {
      const q = src[i];
      let j = i + 1;
      while (j < src.length && src[j] !== q) j += src[j] === '\\' ? 2 : 1;
      out += q + keepNl(src.slice(i + 1, j)) + (src[j] === q ? q : '');
      i = j + 1;
    } else {
      out += src[i];
      i++;
    }
  }
  return out;
}

/**
 * The body of the function containing `idx`. Walks back to the nearest `{` that opens a
 * function-ish construct and forward to its match. Falls back to a generous window so a
 * top-level call still gets scanned rather than silently reported unguarded.
 */
function enclosingBody(src, idx) {
  let depth = 0;
  let i = idx;
  for (; i >= 0; i--) {
    if (src[i] === '}') depth++;
    else if (src[i] === '{') {
      if (depth === 0) break;
      depth--;
    }
  }
  if (i < 0) return src.slice(Math.max(0, idx - 1500), idx + 500);
  const head = src.slice(Math.max(0, i - 220), i);
  // Climb one more level when the brace we found is an object literal or a block inside
  // the handler (an `if`, a `try`), not the handler itself.
  if (!/(=>|function|\basync\b|\)\s*$)/.test(head.replace(/\s+$/, '')) && i > 0) {
    const outer = enclosingBody(src, i - 1);
    if (outer.length > 0) return outer;
  }
  let d = 0;
  let j = i;
  for (; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') {
      d--;
      if (d === 0) break;
    }
  }
  return head + src.slice(i, j + 1);
}

const CALL = /window\.api\.([A-Za-z0-9_]+)\s*\(/g;

const rows = [];
for (const file of walk(SRC)) {
  const raw = fs.readFileSync(file, 'utf8');
  const src = mask(raw);
  const rel = path.relative(SRC, file).replace(/\\/g, '/');
  CALL.lastIndex = 0;
  let m;
  while ((m = CALL.exec(src))) {
    const fn = m[1];
    if (!DESTRUCTIVE.test(fn) || NOT_USER_DATA.has(fn)) continue;
    const body = enclosingBody(src, m.index);
    const line = src.slice(0, m.index).split('\n').length;
    rows.push({
      rel,
      line,
      fn,
      guarded: GUARDS.test(body),
      undo: UNDO.test(body),
    });
  }
}

const unguarded = rows.filter((r) => !r.guarded && !r.undo);
const byFile = new Map();
for (const r of SHOW_ALL ? rows : unguarded) {
  if (!byFile.has(r.rel)) byFile.set(r.rel, []);
  byFile.get(r.rel).push(r);
}

for (const [rel, list] of [...byFile].sort()) {
  console.log(`${rel}`);
  for (const r of list) {
    const tag = r.guarded ? 'guarded' : r.undo ? 'undo route' : 'NO GUARD';
    console.log(`  :${String(r.line).padEnd(5)} ${tag.padEnd(10)} window.api.${r.fn}`);
  }
}

console.log(
  `\n${rows.length} destructive call site(s) — ` +
    `${rows.filter((r) => r.guarded).length} confirm, ` +
    `${rows.filter((r) => !r.guarded && r.undo).length} offer an undo route, ` +
    `${unguarded.length} do NEITHER and are leads to confirm by hand.`,
);
