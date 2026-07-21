/**
 * Step 4: write approved register assignments into the grammar data files.
 *
 * Every record written here gets `registerSource: 'classified'` alongside its
 * register. That pairing is the whole contract of this pass: the label becomes
 * visible and attributable, but `trusted()` in normalize.ts still excludes it,
 * so the "verified tags only" filter keeps hiding it by default. Writing the
 * register without the provenance marker would launder a guess into a fact,
 * which is the bug the register system was rebuilt to remove.
 *
 * Edits object literals in place rather than regenerating files, so hand-written
 * comments and ordering survive. Operates per-record (not per-line) and always
 * strips any existing `register:`/`provenance:` fields before writing fresh
 * ones, so re-running this against the same assignments is a no-op rather than
 * stacking duplicate keys — earlier versions of this script were not
 * idempotent and left several files with 2-3x duplicated `provenance:` lines.
 *
 *   node tools/grammar-register/apply.cjs [--dry]
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const DATA_DIR = path.join(DIR, '..', '..', 'src', 'renderer', 'data', 'grammar');
const DRY = process.argv.includes('--dry');

const REGISTER_LINE = /^\s*register:\s*'[a-z]+',?$/;
const PROVENANCE_LINE = /^\s*provenance:\s*\{[^}]*\},?$/;

const assignments = new Map();
for (const line of fs.readFileSync(path.join(DIR, 'assignments.jsonl'), 'utf-8').trim().split('\n')) {
  const r = JSON.parse(line);
  if (r.register) assignments.set(r.id, r.register);
}
console.log(`assignments to apply: ${assignments.size}`);

let touched = 0;
let unchanged = 0;
let skipped = 0;

for (const file of fs.readdirSync(DATA_DIR)) {
  if (!file.endsWith('.ts')) continue;
  const full = path.join(DATA_DIR, file);
  const raw = fs.readFileSync(full, 'utf-8');
  if (!raw.includes("id: '")) continue;

  // A few generated files (the Mazii imports) are CRLF while the rest are LF.
  // Normalize to LF for matching so the record-boundary regex below doesn't
  // silently miss every record in a CRLF file, then restore CRLF on write if
  // that's what the file started with.
  const usesCRLF = raw.includes('\r\n');
  const src = usesCRLF ? raw.replace(/\r\n/g, '\n') : raw;

  let fileChanged = 0;

  /*
   * Top-level record blocks look like "  {\n ... \n  },". Nested content
   * (examples arrays, the provenance object itself) is either indented >=6
   * spaces or kept on one line, so a line that is exactly "  }," at 2-space
   * indent always closes a record and never appears inside one.
   */
  // The trailing comma is optional: the last record in each array omits it.
  const next = src.replace(/ {2}\{\n([\s\S]*?)\n {2}\},?/g, (fullMatch, body) => {
    const idMatch = body.match(/id:\s*'([^']+)'/);
    if (!idMatch) return fullMatch;
    const id = idMatch[1];
    const reg = assignments.get(id);
    if (!reg) {
      skipped += 1;
      return fullMatch;
    }

    const bodyLines = body.split('\n');
    const idIdx = bodyLines.findIndex((l) => /^\s*id:\s*'/.test(l));
    const indent = (bodyLines[idIdx].match(/^\s*/) || [''])[0];

    // Carry forward any other field already inside provenance (e.g. categorySource
    // from the HSK import) — this pass only ever owns registerSource.
    let extra = '';
    const provMatch = body.match(/provenance:\s*\{([^}]*)\}/);
    if (provMatch) {
      const others = provMatch[1]
        .split(',')
        .map((s) => s.trim())
        .filter((f) => f && !f.startsWith('registerSource'));
      if (others.length) extra = `, ${others.join(', ')}`;
    }

    const alreadyCorrect =
      new RegExp(`register:\\s*'${reg}'`).test(body) &&
      body.includes(`registerSource: 'classified'${extra}`) &&
      (body.match(REGISTER_LINE) || []).length <= 1 &&
      bodyLines.filter((l) => PROVENANCE_LINE.test(l)).length <= 1;
    if (alreadyCorrect) {
      unchanged += 1;
      return fullMatch;
    }

    const firstRegIdx = bodyLines.findIndex((l) => REGISTER_LINE.test(l));
    const insertBefore = firstRegIdx === -1 ? idIdx + 1 : firstRegIdx;

    const newLines = [];
    bodyLines.forEach((l, i) => {
      if (i === insertBefore) {
        newLines.push(`${indent}register: '${reg}',`);
        newLines.push(`${indent}provenance: { registerSource: 'classified'${extra} },`);
      }
      if (REGISTER_LINE.test(l) || PROVENANCE_LINE.test(l)) return;
      newLines.push(l);
    });
    if (insertBefore >= bodyLines.length) {
      newLines.push(`${indent}register: '${reg}',`);
      newLines.push(`${indent}provenance: { registerSource: 'classified'${extra} },`);
    }

    touched += 1;
    fileChanged += 1;
    return `  {\n${newLines.join('\n')}\n  },`;
  });

  if (fileChanged > 0) {
    if (!DRY) fs.writeFileSync(full, usesCRLF ? next.replace(/\n/g, '\r\n') : next);
    console.log(`  ${file}: ${fileChanged}`);
  }
}

console.log(`\n${DRY ? '[dry run] would update' : 'updated'} ${touched} points`);
console.log(`already correct (no-op):          ${unchanged}`);
console.log(`left untouched (no assignment):   ${skipped}`);
console.log('\nthen: npx vitest run && node tools/grammar-audit.cjs');
