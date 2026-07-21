/**
 * Step 3: read replies back in, validating everything before it lands.
 *
 * Drop each reply into tools/grammar-register/replies/ as a .txt file (any
 * name) and run this. Unknown ids, unknown register values, duplicates and
 * points that were never in the batch are all rejected and reported rather
 * than silently written.
 *
 *   node tools/grammar-register/ingest.cjs [--apply]
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const REPLIES = path.join(DIR, 'replies');
const POINTS = path.join(DIR, 'points.jsonl');
const OUT = path.join(DIR, 'assignments.jsonl');
const APPLY = process.argv.includes('--apply');

const VALID = new Set(['neutral', 'casual', 'business', 'literary']);
/** Words a model reaches for that mean one of the four. Mapped, not guessed. */
const ALIASES = {
  formal: 'business',
  polite: 'business',
  honorific: 'business',
  humble: 'business',
  informal: 'casual',
  colloquial: 'casual',
  spoken: 'casual',
  written: 'literary',
  classical: 'literary',
  archaic: 'literary',
  standard: 'neutral',
  plain: 'neutral',
};

if (!fs.existsSync(REPLIES)) {
  fs.mkdirSync(REPLIES, { recursive: true });
  console.log(`created ${REPLIES} — drop the reply .txt files there and re-run.`);
  process.exit(0);
}

const rows = fs.readFileSync(POINTS, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
const wanted = new Set(rows.map((r) => r.id));
const byId = new Map(rows.map((r) => [r.id, r]));

const accepted = new Map();
const problems = {
  unknownPoint: [],
  unknownRegister: [],
  duplicate: [],
  malformed: 0,
};

for (const file of fs.readdirSync(REPLIES)) {
  if (!file.endsWith('.txt')) continue;
  for (const raw of fs.readFileSync(path.join(REPLIES, file), 'utf-8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('```')) continue;

    const parts = line.split(/\t|\s{2,}|,/).map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) { problems.malformed += 1; continue; }

    const [id, rawReg] = parts;
    // A trailing "?" is the model's own low-confidence marker. Keep the flag
    // rather than discarding it — it is the only signal about which of these
    // labels deserve a human's attention first.
    const flagged = rawReg.endsWith('?');
    const key = rawReg.replace(/\?$/, '').toLowerCase();
    const reg = VALID.has(key) ? key : ALIASES[key];

    if (!wanted.has(id)) { problems.unknownPoint.push(`${file}: ${id}`); continue; }
    if (!reg) { problems.unknownRegister.push(`${id} -> ${rawReg}`); continue; }
    if (accepted.has(id)) { problems.duplicate.push(id); continue; }

    accepted.set(id, { reg, flagged });
  }
}

const dist = {};
for (const { reg } of accepted.values()) dist[reg] = (dist[reg] || 0) + 1;
const nonNeutral = accepted.size - (dist.neutral || 0);

console.log(`accepted:      ${accepted.size} / ${wanted.size}`);
console.log(`still unlabelled: ${wanted.size - accepted.size}`);
console.log(`flagged "?":   ${[...accepted.values()].filter((a) => a.flagged).length}`);
console.log('\ndistribution:');
for (const [k, v] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(10)} ${v}`);
}

/*
 * The prompt says most patterns are neutral. If a reply comes back with half
 * the batch marked formal or casual, the model ignored that instruction and
 * the labels are noise — better to catch it here than after it is written into
 * the data files.
 */
if (accepted.size >= 50 && nonNeutral / accepted.size > 0.35) {
  console.log(`\n!! ${Math.round((nonNeutral / accepted.size) * 100)}% non-neutral — implausibly high.`);
  console.log('   Register is carried by the predicate, not the pattern, so most');
  console.log('   patterns are genuinely neutral. Re-run these batches with the');
  console.log('   neutral-is-normal instruction made more emphatic before applying.');
}

for (const [k, v] of Object.entries(problems)) {
  const n = Array.isArray(v) ? v.length : v;
  if (!n) continue;
  console.log(`\n${k}: ${n}`);
  if (Array.isArray(v)) v.slice(0, 15).forEach((x) => console.log(`  ${x}`));
}

if (!APPLY) {
  console.log('\n(dry run — re-run with --apply to write assignments.jsonl)');
  process.exit(0);
}

const out = [];
for (const [id, { reg, flagged }] of accepted) {
  const p = byId.get(id);
  out.push({
    id,
    title: p.title,
    file: p.file,
    register: reg,
    via: flagged ? 'external-flagged' : 'external',
    confidence: flagged ? 'low' : 'medium',
  });
}
fs.writeFileSync(OUT, out.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log(`\nwrote ${out.length} assignments to ${OUT}`);
console.log('next: node tools/grammar-register/apply.cjs --dry');
