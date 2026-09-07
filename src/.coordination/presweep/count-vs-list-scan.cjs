#!/usr/bin/env node
/**
 * Pre-sweep class 4 — count-vs-truth, the SECOND mechanical shape.
 *
 * `discarded-result-scan.cjs` covers one half of class 4: a mutation whose answer is dropped,
 * so the store moves and the screen does not. This covers the other half, which is the shape
 * that actually produced the class's P1s:
 *
 *   THE COUNT AND THE LIST BESIDE IT READ DIFFERENT ARRAYS.
 *
 * A component computes a narrowed array — `const shown = items.filter(...)` — renders
 * `shown.map(...)`, and then labels it with `items.length`. The badge says 6, the table has 4,
 * and nothing in the code looks wrong at either site. That is D32 ("Plan says 6 and lists 4")
 * and it is invisible to every gate in this repo: both expressions type-check, both render,
 * and no test asserts that the two agree.
 *
 * Method — no hand-maintained map:
 *   1. Collect NARROWING bindings per file: `const A = <…>B.filter(…)`, `.slice(`, `.splice(`,
 *      including through `useMemo(() => …)`. A is then a subset of B, transitively.
 *   2. Collect COUNT reads: an `X.length` that reaches the screen (a JSX child, a template
 *      literal, a text-bearing attribute, or a `t()` argument) rather than gating a branch.
 *   3. Collect LIST renders: `Y.map(` inside JSX.
 *   4. Report a LEAD when a count's array and a rendered list's array are related by narrowing
 *      and are not the same array.
 *
 * THE OUTPUT IS LEADS, NOT DEFECTS. Three shapes are legitimate and must be read, not filed:
 *   - "Showing 4 of 6" — the wide count is deliberate and the sentence says so;
 *   - the count labels a DIFFERENT region than the list (a sidebar total beside a filtered pane);
 *   - the narrowing is a no-op at render time (a filter that cannot exclude anything).
 * Read the two lines the report prints before filing anything.
 *
 * Usage:
 *   node src/.coordination/presweep/count-vs-list-scan.cjs
 *   node src/.coordination/presweep/count-vs-list-scan.cjs --file NovelsContent
 *   node src/.coordination/presweep/count-vs-list-scan.cjs --all      # include same-array pairs
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.resolve(__dirname, '..', '..');

const args = process.argv.slice(2);
const only = (() => {
  const i = args.indexOf('--file');
  return i >= 0 ? args[i + 1] : null;
})();
const showAll = args.includes('--all');

/** Every .tsx that can render — the renderer, the media shell and Blanc all do. */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === '.coordination') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/** Strip line and block comments so prose about `.filter(` cannot supply a binding. */
function stripComments(text) {
  let out = '';
  let i = 0;
  let mode = 'code';
  while (i < text.length) {
    const c = text[i];
    const n = text[i + 1];
    if (mode === 'code') {
      if (c === '/' && n === '/') { mode = 'line'; out += '  '; i += 2; continue; }
      if (c === '/' && n === '*') { mode = 'block'; out += '  '; i += 2; continue; }
      out += c; i += 1; continue;
    }
    if (mode === 'line') {
      if (c === '\n') { mode = 'code'; out += '\n'; i += 1; continue; }
      out += ' '; i += 1; continue;
    }
    if (c === '*' && n === '/') { mode = 'code'; out += '  '; i += 2; continue; }
    out += c === '\n' ? '\n' : ' '; i += 1;
  }
  return out;
}

/**
 * `A` narrows `B` when A is bound to an expression that filters or slices B.
 * The base is the identifier the chain starts from, so `items.filter(f).slice(0, n)` and
 * `useMemo(() => items.filter(f), [items])` both give `items`.
 */
const NARROW_CALL = /\.(filter|slice|splice)\s*\(/;

function narrowingEdges(text) {
  const edges = new Map(); // child -> Set(parent)
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^\s*const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const child = m[1];
    // The binding may span lines; take enough of them to see the chain, stopping at the
    // next top-level `const`/`return`/`}` so one statement cannot borrow the next one's text.
    let body = m[2];
    for (let j = i + 1; j < Math.min(i + 25, lines.length); j += 1) {
      if (/^\s*(const|let|return|function|export|\}\s*;?\s*$)/.test(lines[j])) break;
      body += '\n' + lines[j];
    }
    if (!NARROW_CALL.test(body)) continue;
    const at = body.search(NARROW_CALL);
    // Walk back over the member chain immediately preceding the narrowing call.
    const before = body.slice(0, at);
    const base = /([A-Za-z_$][\w$]*)\s*(?:\.[A-Za-z_$][\w$]*\s*)*$/.exec(before.replace(/\)\s*$/, ''));
    if (!base) continue;
    const parent = base[1];
    if (parent === child) continue;
    if (!/^[a-z_$]/.test(parent)) continue; // a Type or a constant chain is not an array binding
    if (!edges.has(child)) edges.set(child, new Set());
    edges.get(child).add(parent);
  }
  return edges;
}

/** Transitive closure, so `shown ⊑ filtered ⊑ items` relates `shown` to `items`. */
function ancestors(edges, name, seen = new Set()) {
  for (const parent of edges.get(name) || []) {
    if (seen.has(parent)) continue;
    seen.add(parent);
    ancestors(edges, parent, seen);
  }
  return seen;
}

/**
 * A `.length` that reaches the screen. Excluded: a length that gates a branch
 * (`=== 0`, `> 0`, `? :`, `&&`, `!x.length`), which is a condition and not a number the
 * user reads. Excluded too: `key=`, `className=`, `style=` — attributes that render nothing.
 */
const GATE_AFTER = /^\s*(===|!==|==|!=|>=|<=|>|<|\?|&&|\|\||\)\s*(&&|\?|\|\|))/;
const DEAD_ATTR = /\b(key|className|style|id|data-[\w-]+)=\{[^}]*$/;

/**
 * Walk backwards from a `.length` over a balanced member chain and return its base identifier
 * plus whether the chain itself narrows. This is what catches the inline form —
 * `epubCards.filter((c) => !c.folder).length` — which a "an identifier immediately precedes
 * `.length`" regex cannot see at all, because the character before the dot is `)`.
 * Single-line chains only; a chain wrapped across lines is not reached.
 */
function chainBefore(line, dotIndex) {
  let i = dotIndex;
  let sawCall = false;
  for (;;) {
    while (i > 0 && /\s/.test(line[i - 1])) i -= 1;
    if (i > 0 && line[i - 1] === ')') {
      let depth = 0;
      let j = i - 1;
      for (; j >= 0; j -= 1) {
        if (line[j] === ')') depth += 1;
        else if (line[j] === '(') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      if (j < 0) return null;
      i = j;
      sawCall = true;
      while (i > 0 && /\s/.test(line[i - 1])) i -= 1;
    }
    let k = i;
    while (k > 0 && /[\w$]/.test(line[k - 1])) k -= 1;
    if (k === i) return null; // no identifier here — not a member chain
    const ident = line.slice(k, i);
    i = k;
    if (i > 0 && line[i - 1] === '.') {
      i -= 1;
      continue;
    }
    return { base: ident, start: i, chain: line.slice(i, dotIndex), sawCall };
  }
}

function countReads(text) {
  const hits = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const re = /\.length\b/g;
    let m;
    while ((m = re.exec(line))) {
      const chain = chainBefore(line, m.index);
      if (!chain) continue;
      const name = chain.base;
      if (!/^[a-z_$]/.test(name)) continue;
      const inlineNarrow = /\.(filter|slice)\s*\(/.test(chain.chain);
      const after = line.slice(m.index + m[0].length);
      const before = line.slice(0, chain.start);
      if (GATE_AFTER.test(after)) continue;
      if (/[!]\s*$/.test(before)) continue;
      if (DEAD_ATTR.test(before)) continue;
      // Must plausibly reach the screen: a JSX child, a template literal, a t() argument,
      // or a text-bearing attribute.
      const inJsxChild = /[>{]\s*$/.test(before) || /\{\s*$/.test(before);
      const inTemplate = (before.match(/`/g) || []).length % 2 === 1 || /\$\{[^}]*$/.test(before);
      const inCall = /\bt\(|aria-label=|aria-rowcount=|title=|placeholder=|alt=|setStatus\(|setMessage\(/.test(before);
      if (!inJsxChild && !inTemplate && !inCall) continue;
      hits.push({ name, inlineNarrow, line: i + 1, text: line.trim() });
    }
  }
  return hits;
}

function listRenders(text) {
  const hits = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const re = /\.map\s*\(/g;
    let m;
    while ((m = re.exec(line))) {
      const chain = chainBefore(line, m.index);
      if (!chain) continue;
      if (!/^[a-z_$]/.test(chain.base)) continue;
      const before = line.slice(0, chain.start);
      // A render, not a data transform: it sits in a JSX child position.
      if (!/[>{]\s*$/.test(before) && !/\{\s*$/.test(before)) continue;
      hits.push({
        name: chain.base,
        inlineNarrow: /\.(filter|slice)\s*\(/.test(chain.chain),
        line: i + 1,
        text: line.trim(),
      });
    }
  }
  return hits;
}

/**
 * Pass 2 — SILENT TRUNCATION. `X.slice(0, N).map(…)` renders N rows out of X. That is only
 * honest if the surface says so. The repo does it both ways in the same week:
 *
 *   discloses  VisualNovelScriptImportPanel.tsx:93  "Showing the first 200 of {lines.length}"
 *   silent     GameArenaContent.tsx:360/550         badge count says N, eight badges render
 *
 * A disclosure is any of: the cap identifier or literal used again OUTSIDE the slice within
 * the same region, a `length -` remainder, a `length >` comparison, or an i18n key whose name
 * carries more/showing/rest/remaining/truncat/overflow. Anything else is a lead.
 */
const DISCLOSE_KEY = /(more|showing|shown|rest|remaining|truncat|overflow|others|hidden|topN|firstN)/i;

function truncatedRenders(text) {
  const lines = text.split('\n');
  const hits = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const re = /\.map\s*\(/g;
    let m;
    while ((m = re.exec(line))) {
      const chain = chainBefore(line, m.index);
      if (!chain || !/^[a-z_$]/.test(chain.base)) continue;
      const before = line.slice(0, chain.start);
      if (!/[>{]\s*$/.test(before) && !/\{\s*$/.test(before)) continue;
      const sliceCall = /\.slice\s*\(([^)]*)\)/.exec(chain.chain);
      if (!sliceCall) continue;
      const arg = sliceCall[1].trim();
      if (arg === '') continue; // `.slice()` is a copy, not a truncation
      const cap = /(-?[\w$]+)\s*$/.exec(arg.split(',').pop().trim());
      if (!cap) continue;
      const capText = cap[1];
      if (/^-?0$/.test(capText)) continue;
      // Look for a disclosure in the region around the render.
      const from = Math.max(0, i - 30);
      const to = Math.min(lines.length, i + 30);
      let disclosed = false;
      for (let j = from; j < to; j += 1) {
        if (j === i) continue;
        const l = lines[j];
        if (DISCLOSE_KEY.test(l) && /length|count|\{/.test(l)) { disclosed = true; break; }
        if (/\.length\s*[-]/.test(l)) { disclosed = true; break; }
        if (/\.length\s*[><]/.test(l)) { disclosed = true; break; }
        if (!/^-?\d+$/.test(capText) && l.includes(capText.replace(/^-/, '')) && !l.includes('.slice')) {
          disclosed = true;
          break;
        }
      }
      hits.push({ base: chain.base, cap: capText, line: i + 1, text: line.trim(), disclosed });
    }
  }
  return hits;
}

if (args.includes('--truncation')) {
  const all = walk(path.join(SRC, 'renderer'))
    .concat(fs.existsSync(path.join(SRC, 'media')) ? walk(path.join(SRC, 'media')) : [])
    .filter((f) => (only ? f.includes(only) : true));
  let silent = 0;
  let total = 0;
  for (const file of all) {
    const hits = truncatedRenders(stripComments(fs.readFileSync(file, 'utf8')));
    if (!hits.length) continue;
    total += hits.length;
    const leads = hits.filter((h) => !h.disclosed);
    if (!leads.length) continue;
    console.log(`\n${path.relative(SRC, file).replace(/\\/g, '/')}`);
    for (const h of leads) {
      silent += 1;
      console.log(`  :${h.line}  ${h.base} capped at ${h.cap}  ${h.text.slice(0, 130)}`);
    }
  }
  console.log(`\n${all.length} files · ${total} truncated renders · ${silent} with NO disclosure nearby`);
  process.exit(0);
}

const files = walk(path.join(SRC, 'renderer'))
  .concat(fs.existsSync(path.join(SRC, 'media')) ? walk(path.join(SRC, 'media')) : [])
  .filter((f) => (only ? f.includes(only) : true));

let leadCount = 0;
let fileCount = 0;
let countTotal = 0;
let mapTotal = 0;
let edgeTotal = 0;

for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');
  const text = stripComments(raw);
  const edges = narrowingEdges(text);
  if (!edges.size) continue;
  const counts = countReads(text);
  const maps = listRenders(text);
  if (!counts.length || !maps.length) continue;
  countTotal += counts.length;
  mapTotal += maps.length;
  edgeTotal += edges.size;

  const leads = [];
  for (const c of counts) {
    for (const l of maps) {
      const cUp = ancestors(edges, c.name);
      const lUp = ancestors(edges, l.name);
      let relation = null;
      if (c.name === l.name) {
        // Same array, but one side narrows inline and the other does not — the count
        // counts a predicate the list beside it does not apply, or the reverse.
        if (c.inlineNarrow && !l.inlineNarrow) relation = 'count narrows INLINE, list does not';
        else if (!c.inlineNarrow && l.inlineNarrow) relation = 'list narrows INLINE, count does not';
        else if (!showAll) continue;
        else relation = 'same array';
      } else if (lUp.has(c.name)) relation = 'list NARROWS count';
      else if (cUp.has(l.name)) relation = 'count NARROWS list';
      if (!relation) continue;
      leads.push({ ...c, listName: l.name, listLine: l.line, listText: l.text, relation });
    }
  }
  if (!leads.length) continue;
  fileCount += 1;
  console.log(`\n${path.relative(SRC, file).replace(/\\/g, '/')}`);
  for (const lead of leads) {
    leadCount += 1;
    console.log(`  ${lead.relation}`);
    console.log(`    count  :${lead.line}  ${lead.name}.length   ${lead.text.slice(0, 140)}`);
    console.log(`    list   :${lead.listLine}  ${lead.listName}.map    ${lead.listText.slice(0, 140)}`);
  }
}

console.log(
  `\n${files.length} files scanned · ${edgeTotal} narrowing bindings · ${countTotal} screen counts · ` +
    `${mapTotal} rendered lists · ${leadCount} leads in ${fileCount} files`,
);
