// Copy a computed import closure from the pinned seanime-web checkout into vendor/seanime-web.
//
// Written in Phase 3 so the adoption step is reproducible rather than a one-off shell
// incantation (Phase 2's copy logic lived in a scratchpad and was lost).
//
// Reuses the same resolver as import-graph.mjs. Substitution files listed in KEEP are
// preserved: they are our whole-file replacements and must survive a re-copy. Anything
// else is overwritten verbatim from upstream.
//
// usage: node adopt-closure.mjs <entry-rel-path>... [--dry]

import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'C:/Users/Arseniy/Projects/seanime-upstream/seanime-web/src';
const DEST = 'C:/Users/Arseniy/Projects/jp-study-app/vendor/seanime-web';

// Whole-file substitutions that must NOT be overwritten by a re-copy.
// media-preview-modal.tsx is deliberately absent: adopting the entry surface restores it.
const KEEP = [
  'api/client/server-url.ts',
  'components/shared/sea-link.tsx',
  'lib/navigation.ts',
  'app/(main)/_features/mpv-core/mpv-core.atoms.ts',
  'app/(main)/_features/video-core/video-core-media-captions.ts',
  'app/(main)/_features/video-core/video-core-subtitles.ts',
];

const dry = process.argv.includes('--dry');
const entries = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!entries.length) throw new Error('need at least one entry path relative to src/');

const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.css'];

function resolveFile(p) {
  if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  for (const e of EXTS) if (fs.existsSync(p + e)) return p + e;
  for (const e of EXTS) {
    const idx = path.join(p, 'index' + e);
    if (fs.existsSync(idx)) return idx;
  }
  return null;
}

const IMPORT_RE =
  /(?:^|[\s;}])(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const localFiles = new Set();
const queue = [];
for (const e of entries) {
  const f = resolveFile(path.join(ROOT, e));
  if (!f) throw new Error(`entry not found: ${e}`);
  queue.push(f);
  localFiles.add(f);
}

while (queue.length) {
  const file = queue.pop();
  if (/\.(css|json)$/.test(file)) continue;
  let src;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  src = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  IMPORT_RE.lastIndex = 0;
  let m;
  while ((m = IMPORT_RE.exec(src))) {
    const spec = m[1] || m[2] || m[3];
    if (!spec) continue;
    let target = null;
    if (spec.startsWith('@/')) target = path.join(ROOT, spec.slice(2));
    else if (spec.startsWith('.')) target = path.join(path.dirname(file), spec);
    else continue;
    const resolved = resolveFile(target);
    if (resolved && !localFiles.has(resolved)) {
      localFiles.add(resolved);
      queue.push(resolved);
    }
  }
}

const rel = [...localFiles].map((f) => path.relative(ROOT, f).replace(/\\/g, '/')).sort();

let added = 0, overwritten = 0, kept = 0, unchanged = 0;
for (const r of rel) {
  const from = path.join(ROOT, r);
  const to = path.join(DEST, r);
  if (KEEP.includes(r)) {
    kept++;
    continue;
  }
  const exists = fs.existsSync(to);
  if (exists && fs.readFileSync(from).equals(fs.readFileSync(to))) {
    unchanged++;
    continue;
  }
  if (!dry) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
  if (exists) overwritten++;
  else added++;
}

// Files already in vendor that are NOT in the new closure (should normally be none).
const inClosure = new Set(rel);
const stale = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else {
      const r = path.relative(DEST, p).replace(/\\/g, '/');
      if (r !== 'ADOPTION.md' && !inClosure.has(r)) stale.push(r);
    }
  }
})(DEST);

console.log(`${dry ? '[DRY RUN] ' : ''}closure     : ${rel.length} files`);
console.log(`added       : ${added}`);
console.log(`overwritten : ${overwritten}`);
console.log(`unchanged   : ${unchanged}`);
console.log(`kept (subs) : ${kept}  ${KEEP.filter((k) => inClosure.has(k)).length}/${KEEP.length} in closure`);
if (stale.length) console.log(`\nSTALE in vendor, not in closure (${stale.length}):\n${stale.join('\n')}`);
