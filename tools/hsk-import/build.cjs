/**
 * Turn tools/hsk-import/source.tsv into src/renderer/data/grammar/hsk-import.ts.
 *
 * The source is a chat model's output, not a published syllabus, so nothing
 * here is allowed to look verified. Three rules enforce that:
 *
 *  - every record ships `verification: 'imported-unreviewed'`, which puts it in
 *    the curation queue and out of "Ready to study";
 *  - `categorySource` is 'imported' — the list's function names are its own
 *    vocabulary, mapped here, not authored against this taxonomy;
 *  - `registerSource` is 'classified', the same untrusted tier the LLM register
 *    pass uses, so the register filter hides these until the user turns
 *    "verified tags only" off.
 *
 * Anything the mapping cannot place is reported and skipped rather than guessed
 * into the nearest bucket.
 *
 *   node tools/hsk-import/build.cjs [--dry]
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const esbuild = require('esbuild');

const DIR = __dirname;
const ROOT = path.join(DIR, '..', '..');
const DATA_DIR = path.join(ROOT, 'src', 'renderer', 'data', 'grammar');
const SOURCE = path.join(DIR, 'source.tsv');
const OUT = path.join(DATA_DIR, 'hsk-import.ts');
const DRY = process.argv.includes('--dry');

/*
 * The source list's function vocabulary mapped onto this app's 82 canonical
 * categories. Written out in full rather than fuzzy-matched: a near-miss here
 * is a mis-tagged record, and the whole point of the canonical taxonomy is that
 * a category means one thing.
 */
const FUNCTION_MAP = {
  Negation: ['emphasis.negation'],
  Emphasis: ['emphasis.emphasize'],
  Sequence: ['time.sequence'],
  Listing: ['examples.listing'],
  Amount: ['quantity.amount'],
  'Point in time': ['time.point'],
  Relation: ['space.relation'],
  Request: ['request.ask'],
  'Invitation & suggestion': ['request.invite'],
  Location: ['space.location'],
  Description: ['state.description'],
  Definition: ['explanation.definition'],
  Direction: ['space.direction'],
  Permission: ['possibility.permission'],
  Ability: ['possibility.ability'],
  Intention: ['purpose.intention'],
  Desire: ['volition.desire'],
  Means: ['method.means'],
  Prohibition: ['obligation.prohibition'],
  Extreme: ['degree.extreme'],
  Conjecture: ['judgment.conjecture'],
  Approximation: ['degree.approximation'],
  'Ongoing action': ['state.ongoing'],
  Duration: ['time.duration'],
  Completion: ['time.completion'],
  'Repetition & habit': ['time.repetition'],
  Limitation: ['degree.limit'],
  Consequence: ['cause.result'],
  Simultaneous: ['time.simultaneous'],
  Extent: ['degree.extent'],
  Similarity: ['comparison.similarity'],
  Comparison: ['comparison.compare'],
  Degree: ['degree.extent'],
  Alternatives: ['examples.alternative'],
  Opposition: ['contrast.opposition'],
  Vagueness: ['discourse.vagueness'],
  Change: ['state.change'],
  Experience: ['time.experience'],
  Exclamation: ['emotion.exclamation'],
  Range: ['space.range'],
  Obligation: ['obligation.necessity'],
  Certainty: ['judgment.certainty'],
  Minimizing: ['degree.minimal'],
  Frequency: ['quantity.frequency'],
  Possibility: ['possibility.ability'],
  'Resulting state': ['state.result'],
  Reason: ['cause.reason'],
  Immediacy: ['time.immediate'],
  Concession: ['contrast.concession'],
  Condition: ['condition.general'],
  Hypothesis: ['condition.hypothetical'],
  Requirement: ['condition.requirement'],
  Exception: ['contrast.exception'],
  Evaluation: ['judgment.evaluation'],
  Topic: ['discourse.topic'],
  Purpose: ['purpose.goal'],
  Proportion: ['comparison.proportion'],
  Necessity: ['obligation.necessity'],
  'Grounds & basis': ['cause.grounds'],
  Premise: ['cause.premise'],
  'Unexpected outcome': ['contrast.unexpected'],
  Surprise: ['emotion.surprise'],
  Feeling: ['emotion.feeling'],
  Advice: ['request.advice'],
  Decision: ['purpose.decision'],
  Command: ['volition.command'],
  Passive: ['voice.passive'],
  'Voice & transformation': ['voice.form'],
  'Form change': ['voice.form'],
  Perspective: ['method.perspective'],
  Communication: ['method.communication'],
  'Giving & receiving': ['method.means'],
  'Rules & standards': ['obligation.rules'],
  Conclusion: ['explanation.conclusion'],
  Explanation: ['explanation.explain'],
  Preference: ['comparison.compare'],
  Plan: ['purpose.plan'],
  Coincidence: ['judgment.certainty'],
  Manner: ['state.description'],
  Rhetorical: ['judgment.conjecture'],
  'Effort & attempt': ['state.effort'],
  Regret: ['emotion.regret'],
};

const REGISTER_MAP = { N: 'neutral', C: 'casual', L: 'literary', F: 'business' };

/** Load the shipped corpus so imported rows can be deduped against it. */
function loadCorpus() {
  const { outputFiles } = esbuild.buildSync({
    entryPoints: [path.join(DATA_DIR, 'index.ts')],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    logLevel: 'silent',
  });
  const mod = { exports: {} };
  vm.runInNewContext(outputFiles[0].text, { module: mod, exports: mod.exports, require });
  return mod.exports;
}

const corpus = loadCorpus();

/*
 * Match the dedupe key the app itself uses, so a row this script accepts cannot
 * be one the Explorer would immediately hide as a duplicate. Punctuation and
 * the ellipsis placeholder vary between sources for the same pattern
 * (因为…所以… / 因为...所以...), so both are stripped.
 */
function titleKey(title) {
  return title.replace(/[…\.。，,、\s()（）]/g, '').trim();
}

/*
 * The dedupe baseline is every Chinese record EXCEPT this module's own previous
 * output. Without that exclusion the script is not idempotent: the second run
 * loads the file it wrote on the first, finds every row already present, and
 * emits an empty module.
 */
const existing = new Map();
for (const p of corpus.GRAMMAR) {
  if (p.lang !== 'zh') continue;
  if (p.provenance && p.provenance.source === 'imported:hsk-list') continue;
  existing.set(titleKey(p.title), p);
}

/*
 * Stable id from the pattern, so re-running never renumbers anything.
 *
 * Hashed rather than a hex prefix of the title: Chinese characters are three
 * bytes in UTF-8, so a 10-character hex slice discriminates on barely one and a
 * half characters and collided seven times across the list (每 vs 比, 的 vs 到).
 */
function makeId(level, title) {
  const slug = crypto.createHash('sha1').update(title, 'utf8').digest('hex').slice(0, 8);
  return `${level.toLowerCase().replace(/[^a-z0-9]/g, '')}-i-${slug}`;
}

const rows = [];
const problems = { unmappedFunction: [], badRegister: [], duplicateInSource: [], alreadyInCorpus: [] };
const seen = new Set();

for (const raw of fs.readFileSync(SOURCE, 'utf-8').split('\n')) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;

  const [level, title, meaning, fn, reg] = line.split('\t').map((s) => (s || '').trim());
  if (!level || !title || !meaning) continue;

  const categories = FUNCTION_MAP[fn];
  if (!categories) {
    problems.unmappedFunction.push(`${title} -> "${fn}"`);
    continue;
  }
  const register = REGISTER_MAP[reg];
  if (!register) {
    problems.badRegister.push(`${title} -> "${reg}"`);
    continue;
  }

  const key = titleKey(title);
  if (seen.has(key)) {
    problems.duplicateInSource.push(title);
    continue;
  }
  seen.add(key);

  if (existing.has(key)) {
    problems.alreadyInCorpus.push(`${title} (have ${existing.get(key).id})`);
    continue;
  }

  rows.push({ id: makeId(level, title), level, title, meaning, categories, register });
}

/*
 * Refuse to emit colliding ids. The first version of makeId produced seven of
 * them and the file was written anyway — the corpus audit caught it two steps
 * later, which is two steps too late. An id collision silently drops records
 * from anything that keys by id, including saved familiarity state.
 */
const idCounts = new Map();
for (const r of rows) idCounts.set(r.id, (idCounts.get(r.id) || 0) + 1);
const collisions = [...idCounts.entries()].filter(([, n]) => n > 1);
if (collisions.length) {
  console.error(`\n!! ${collisions.length} duplicate ids — refusing to write.`);
  for (const [id] of collisions) {
    console.error(`  ${id}: ${rows.filter((r) => r.id === id).map((r) => r.title).join(', ')}`);
  }
  process.exit(1);
}

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const body = rows
  .map(
    (r) => `  {
    id: '${r.id}',
    lang: 'zh',
    level: '${r.level}',
    title: '${esc(r.title)}',
    meaning: '${esc(r.meaning)}',
    structure: '',
    explanation: '',
    categories: [${r.categories.map((c) => `'${c}'`).join(', ')}],
    register: '${r.register}',
    examples: [],
    provenance: { registerSource: 'classified', categorySource: 'imported' },
  },`,
  )
  .join('\n');

const file = `import type { GrammarPoint } from './types';

/**
 * HSK grammar imported from a supplied list. GENERATED — do not hand-edit.
 *
 * Regenerate with: node tools/hsk-import/build.cjs
 *
 * The source (tools/hsk-import/source.tsv) is a chat model's output, not a
 * published syllabus, and the header of that file records what was dropped from
 * it and why. Roughly a quarter of the original rows were vocabulary rather
 * than grammar, and several carried wrong pinyin or a wrong gloss.
 *
 * So every record here is deliberately weak-provenance:
 *
 *  - \`examples\` is empty, which makes \`verificationFor\` return 'missing' and
 *    keeps these out of "Ready to study". That is accurate — a pattern and a
 *    gloss is not study material, and the list supplied nothing else.
 *  - \`categorySource: 'imported'\` — the categories are a mapping of the list's
 *    own function names, not tags authored against this taxonomy.
 *  - \`registerSource: 'classified'\` — the same untrusted tier the LLM register
 *    pass writes, so the register filter hides these unless the user turns
 *    "verified tags only" off.
 *
 * Records whose title already existed in the corpus were dropped at build time
 * rather than merged, so this module can never shadow an authored point.
 */
export const HSK_IMPORT: GrammarPoint[] = [
${body}
];
`;

if (!DRY) fs.writeFileSync(OUT, file);

console.log(`${DRY ? '[dry run] would write' : 'wrote'} ${rows.length} records to ${path.relative(ROOT, OUT)}`);
const byLevel = {};
for (const r of rows) byLevel[r.level] = (byLevel[r.level] || 0) + 1;
console.log('by level:', byLevel);

for (const [k, v] of Object.entries(problems)) {
  if (!v.length) continue;
  console.log(`\n${k}: ${v.length}`);
  v.slice(0, 12).forEach((x) => console.log(`  ${x}`));
  if (v.length > 12) console.log(`  … and ${v.length - 12} more`);
}
