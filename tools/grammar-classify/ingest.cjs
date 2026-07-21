/**
 * Read classification replies back in.
 *
 * Drop each reply into tools/grammar-classify/replies/ as a .txt file (any
 * name) and run this. Everything is validated before it lands: unknown ids,
 * unknown category ids, duplicates and points that were never in the tail are
 * all rejected and reported rather than silently written.
 *
 *   node tools/grammar-classify/ingest.cjs [--apply]
 */
const fs = require('fs');
const path = require('path');
const { CANONICAL, resolve } = require('./labels.cjs');

const DIR = __dirname;
const REPLIES = path.join(DIR, 'replies');
const FILE = path.join(DIR, 'assignments.jsonl');
const APPLY = process.argv.includes('--apply');

if (!fs.existsSync(REPLIES)) {
  fs.mkdirSync(REPLIES, { recursive: true });
  console.log(`created ${REPLIES} — drop the reply .txt files there and re-run.`);
  process.exit(0);
}

const rows = fs.readFileSync(FILE, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
const byId = new Map(rows.map((r) => [r.id, r]));
const wanted = new Set(rows.filter((r) => !r.fn).map((r) => r.id));

const accepted = new Map();
const problems = { unknownPoint: [], unknownCategory: [], alreadyTagged: [], duplicate: [], malformed: 0 };

for (const file of fs.readdirSync(REPLIES)) {
  if (!file.endsWith('.txt')) continue;
  const lines = fs.readFileSync(path.join(REPLIES, file), 'utf-8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('```')) continue;

    const parts = line.split(/\t|\s{2,}|,/).map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) { problems.malformed += 1; continue; }

    const [id, rawCat] = parts;
    // A trailing "?" is the reply's own low-confidence marker — keep the flag
    // rather than discarding it, so it can be surfaced in review.
    const flagged = rawCat.endsWith('?');
    const cat = resolve(rawCat.replace(/\?$/, ''));

    if (!byId.has(id)) { problems.unknownPoint.push(`${file}: ${id}`); continue; }
    if (!cat || !CANONICAL[cat]) { problems.unknownCategory.push(`${id} -> ${rawCat}`); continue; }
    if (!wanted.has(id)) { problems.alreadyTagged.push(id); continue; }
    if (accepted.has(id)) { problems.duplicate.push(id); continue; }

    accepted.set(id, { cat, flagged });
  }
}

console.log(`accepted:            ${accepted.size} / ${wanted.size} unplaced`);
console.log(`still unplaced:      ${wanted.size - accepted.size}`);
console.log(`flagged "?" by model: ${[...accepted.values()].filter((a) => a.flagged).length}`);
for (const [k, v] of Object.entries(problems)) {
  const n = Array.isArray(v) ? v.length : v;
  if (!n) continue;
  console.log(`\n${k}: ${n}`);
  if (Array.isArray(v)) v.slice(0, 15).forEach((x) => console.log(`  ${x}`));
}

if (!APPLY) {
  console.log('\n(dry run — re-run with --apply to write into assignments.jsonl)');
  process.exit(0);
}

for (const [id, { cat, flagged }] of accepted) {
  const rec = byId.get(id);
  rec.fn = cat;
  rec.via = flagged ? 'external-flagged' : 'external';
  rec.confidence = flagged ? 'low' : 'medium';
}
fs.writeFileSync(FILE, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log(`\nwrote ${accepted.size} assignments`);
console.log(`total assigned: ${rows.filter((r) => r.fn).length} / ${rows.length}`);
