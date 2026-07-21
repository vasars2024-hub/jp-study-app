/**
 * Emit self-contained classification prompts for the unplaced tail, sized so a
 * chat model can answer without truncating, and formatted so the reply can be
 * parsed straight back in by ingest.cjs.
 *
 *   node tools/grammar-classify/make-prompts.cjs
 */
const fs = require('fs');
const path = require('path');
const { CANONICAL, CANONICAL_IDS } = require('./labels.cjs');

const DIR = __dirname;
const OUT = path.join(DIR, 'prompts');
const BATCH = 90;

const rows = fs.readFileSync(path.join(DIR, 'assignments.jsonl'), 'utf-8')
  .trim().split('\n').map((l) => JSON.parse(l));
const todo = rows.filter((r) => !r.fn);

const categories = CANONICAL_IDS
  .map((id) => `${id}\t${CANONICAL[id].label} — ${CANONICAL[id].hint}`)
  .join('\n');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const batches = [];
for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));

batches.forEach((batch, n) => {
  const items = batch.map((r) => `${r.id}\t${r.title}\t${r.meaning}`).join('\n');
  const text = `You are classifying Japanese grammar points by their grammatical FUNCTION.

Assign exactly one category to each grammar point below. Batch ${n + 1} of ${batches.length}.

## Rules

- Choose based on what the pattern DOES grammatically, not on surface vocabulary in the English gloss.
- You must use one of the category IDs listed below, spelled exactly. Do not invent new ones.
- If a point is not really a grammar function (e.g. a bare vocabulary word, a verb
  conjugation name like "volitional form", or a structural label like "N1 の N2"),
  still pick the closest functional category rather than leaving it blank —
  but append a "?" after the id so it can be flagged for review.
- Every input line must produce exactly one output line. Do not skip, merge, or reorder.

## Categories (id, then label — description)

${categories}

## Grammar points (id, then pattern, then meaning)

${items}

## Output format

Return ONLY lines of \`id<TAB>category-id\`, one per input line, no header, no
commentary, no code fence. Example:

n1x-gurumi\tcompanion
n2m-g-b0bf1e\tstandard?
`;
  const file = path.join(OUT, `batch-${String(n + 1).padStart(2, '0')}.txt`);
  fs.writeFileSync(file, text);
  console.log(`${path.basename(file)}  ${batch.length} points  ${(text.length / 1000).toFixed(1)}k chars`);
});

console.log(`\n${todo.length} unplaced points across ${batches.length} prompt files in ${OUT}`);
