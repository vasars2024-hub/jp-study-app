/**
 * Step 3: write approved assignments back into the grammar data files.
 *
 * Edits each `functions: [...]` in place rather than regenerating the files,
 * so hand-written comments and ordering survive. Points whose assignment is
 * unresolved are left exactly as they are — this script never writes 'other'
 * and never guesses.
 *
 *   node tools/grammar-classify/apply.cjs [--dry]
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const DATA_DIR = path.join(DIR, '..', '..', 'src', 'renderer', 'data', 'grammar');
const DRY = process.argv.includes('--dry');

const assignments = new Map();
for (const line of fs.readFileSync(path.join(DIR, 'assignments.jsonl'), 'utf-8').trim().split('\n')) {
  const r = JSON.parse(line);
  if (r.fn) assignments.set(r.id, r.fn);
}
console.log(`assignments to apply: ${assignments.size}`);

let changed = 0;
let missing = 0;
let inserted = 0;
/** Ids whose functions key was rewritten in place — never also insert one. */
const done = new Set();

for (const file of fs.readdirSync(DATA_DIR)) {
  if (!file.endsWith('.ts')) continue;
  const full = path.join(DATA_DIR, file);
  let src = fs.readFileSync(full, 'utf-8');
  // No `functions:` guard here — the hand-curated files have none yet, and
  // those are precisely the ones that need the key inserted.
  if (!src.includes("id: '")) continue;

  let fileChanged = 0;

  // Walk object literals by id, then rewrite the functions array that belongs
  // to that same object (i.e. before the next `id:` marker).
  src = src.replace(
    /id:\s*'([^']+)',([\s\S]*?)functions:\s*\[[^\]]*\]/g,
    (match, id, between) => {
      // A nested `id:` between the two means this functions array belongs to a
      // different object — leave it for that object's own match.
      if (/\bid:\s*'/.test(between)) return match;
      const fn = assignments.get(id);
      if (!fn) { missing += 1; return match; }
      done.add(id);
      fileChanged += 1;
      return match.replace(/functions:\s*\[[^\]]*\]/, `functions: ['${fn}']`);
    },
  );

  // The hand-curated files (n5.ts, n1-extra.ts, …) predate the supplement import and
  // carry `categories` but no `functions` key at all, so there is nothing to
  // rewrite — the field has to be inserted after the id line instead.
  src = src.replace(/^(\s*)id:\s*'([^']+)',$/gm, (match, indent, id) => {
    if (done.has(id)) return match;
    const fn = assignments.get(id);
    if (!fn) return match;
    done.add(id);
    inserted += 1;
    fileChanged += 1;
    return `${match}\n${indent}functions: ['${fn}'],`;
  });

  if (fileChanged > 0) {
    if (!DRY) fs.writeFileSync(full, src);
    changed += fileChanged;
    console.log(`  ${file}: ${fileChanged}`);
  }
}

console.log(`\n${DRY ? '[dry run] would update' : 'updated'} ${changed} points (${inserted} by inserting a new functions key)`);
console.log(`left untouched (no confident assignment): ${missing}`);
