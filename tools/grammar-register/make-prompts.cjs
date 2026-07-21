/**
 * Step 2: emit self-contained register-classification prompts.
 *
 * The single most important thing in this file is the instruction that
 * `neutral` is the expected answer for most patterns. Without it a model
 * spreads its answers across all four values to look useful, and the result is
 * the gloss-regex bug wearing a new hat — a corpus where every record carries a
 * confident register and none of them mean anything.
 *
 *   node tools/grammar-register/make-prompts.cjs
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const OUT = path.join(DIR, 'prompts');
// Four values instead of 128 category labels, so the menu costs nothing and the
// batch can be much larger than the function pass used.
const BATCH = 150;

const rows = fs
  .readFileSync(path.join(DIR, 'points.jsonl'), 'utf-8')
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l));

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

/*
 * Batch within a language, never across one. `extract` emits in file order, so
 * a naive slice puts hsk1-* and n1x-* in the same batch — and the prompt then
 * tells the model to "judge from the Chinese form" while showing it Japanese,
 * with a Japanese worked example under a Chinese heading. Every instruction
 * that names a language has to be true for every line beneath it.
 */
const batches = [];
for (const lang of ['ja', 'zh']) {
  const forLang = rows.filter((r) => r.lang === lang);
  for (let i = 0; i < forLang.length; i += BATCH) batches.push(forLang.slice(i, i + BATCH));
}

batches.forEach((batch, n) => {
  const isZh = batch[0] && batch[0].lang === 'zh';
  const lang = isZh ? 'Chinese' : 'Japanese';
  const neutralExample = isZh
    ? '因为…所以… is the same pair in speech and in a written report, so it is neutral.'
    : 'Japanese politeness is carried by the sentence-final predicate, not by the\n  grammar pattern. 〜ながら is identical in 食べながら見た and 食べながら見ました,\n  so it is neutral.';
  const items = batch
    .map((r) => [r.id, r.title, r.structure, r.meaning].join('\t'))
    .join('\n');

  const text = `You are labelling ${lang} grammar patterns by REGISTER — the speech level a
pattern belongs to. Batch ${n + 1} of ${batches.length}.

## The four values

neutral   - works at any speech level. THE DEFAULT AND MOST COMMON ANSWER.
casual    - only natural in informal speech between equals or intimates
            (contractions, blunt sentence-final particles, slang endings).
business  - honorific / humble / formal-polite. Would appear in a business
            email, an announcement, or speech to a customer or superior.
literary  - written or classical. Would appear in an essay, a legal notice, or
            fiction, but sounds archaic or stiff spoken aloud.

## Rules — read these before answering

- **Most patterns are neutral, and neutral is a real answer, not a fallback.**
  ${neutralExample}
  If you find yourself labelling more than about a fifth of a batch as
  non-neutral, you are over-assigning.
- Do NOT infer register from the English meaning text. A gloss reading "a less
  formal way to say X" describes the pattern's *meaning*; it does not make the
  pattern casual. Judge from the ${lang} form itself.
- Politeness is not register. ${
    isZh
      ? 'A pattern that takes 您 or 请 is still neutral unless\n  the pattern *itself* belongs to formal or written language.'
      : 'A pattern shown in its 〜ます form is still\n  neutral unless the pattern *itself* is honorific or humble.'
  }
- If you are unsure, answer neutral and append "?" to flag it for review.
  A flagged guess is useful; a confident wrong answer is not.
- Every input line must produce exactly one output line. Do not skip, merge,
  or reorder.

## Patterns (id, then pattern, then structure, then meaning)

${items}

## Output format

Return ONLY lines of \`id<TAB>register\`, one per input line, no header, no
commentary, no code fence. Example:

n3m-g-1a2b3c\tneutral
n1m-g-0f01e6\tliterary
n2m-g-b0bf1e\tcasual?
`;

  const file = path.join(OUT, `batch-${String(n + 1).padStart(2, '0')}.txt`);
  fs.writeFileSync(file, text);
  console.log(`${path.basename(file)}  ${batch.length} points  ${(text.length / 1000).toFixed(1)}k chars`);
});

console.log(`\n${rows.length} points across ${batches.length} prompt files in ${OUT}`);
console.log('Paste each into a chat model, save the reply as replies/<same-name>.txt,');
console.log('then run: node tools/grammar-register/ingest.cjs');
