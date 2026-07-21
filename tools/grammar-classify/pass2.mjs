/**
 * Second pass over the points stage 1 could not place.
 *
 * Those failed for one of two reasons: the keyword shortlist found no candidate
 * at all (the gloss shares no vocabulary with any hint), or it offered a list
 * and the model declined it. Both are shortlist failures, not model failures —
 * so this pass drops the shortlist and shows the full canonical menu. It is
 * slower per point, which is why it runs only on the remainder.
 *
 *   node tools/grammar-classify/pass2.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { CANONICAL, CANONICAL_IDS } = require('./labels.cjs');

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(DIR, 'assignments.jsonl');

const rows = fs.readFileSync(FILE, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
const todo = rows.filter((r) => !r.fn);
console.log(`second pass over ${todo.length} unplaced points`);

const MENU = CANONICAL_IDS.map((id, i) => `${i + 1}. ${CANONICAL[id].label}`).join('\n');

function modelPath() {
  const downloads = path.join(os.homedir(), 'Downloads');
  for (const n of ['Qwen_Qwen3-1.7B-Q4_K_M.gguf', 'Qwen3-1.7B-Q4_K_M.gguf', 'qwen3-1.7b-q4_k_m.gguf']) {
    const c = path.join(downloads, n);
    if (fs.existsSync(c)) return c;
  }
  return null;
}

const { getLlama, LlamaChatSession } = await import('node-llama-cpp');
const llama = await getLlama();
const model = await llama.loadModel({ modelPath: modelPath() });
const context = await model.createContext({ contextSize: 4096 });
const session = new LlamaChatSession({ contextSequence: context.getSequence() });

const byId = new Map(rows.map((r) => [r.id, r]));
let placed = 0;
let confirmedCount = 0;
let done = 0;

for (const r of todo) {
  const prompt = `Japanese grammar point: ${r.title}
Meaning: ${r.meaning}

Choose the single best grammatical function from this list:
${MENU}

Reply with only the number. /no_think`;

  session.setChatHistory([]);
  try {
    const raw = await session.prompt(prompt, { maxTokens: 8, temperature: 0 });
    const n = Number((raw.match(/\d+/) || [])[0]);
    if (n >= 1 && n <= CANONICAL_IDS.length) {
      const fn = CANONICAL_IDS[n - 1];

      // Verification turn. Picking from a 129-item menu is easy to do sloppily;
      // re-asking as a yes/no about one specific label is a much sharper
      // question, and disagreement between the two is the signal that this
      // point needs a human rather than a tag.
      session.setChatHistory([]);
      const check = await session.prompt(
        `Japanese grammar point: ${r.title}\nMeaning: ${r.meaning}\n\n` +
        `Does "${CANONICAL[fn].label}" (${CANONICAL[fn].hint}) correctly describe its grammatical function?\n` +
        `Answer only yes or no. /no_think`,
        { maxTokens: 6, temperature: 0 },
      );
      const confirmed = /\byes\b/i.test(check);

      const rec = byId.get(r.id);
      rec.fn = fn;
      rec.via = confirmed ? 'llm-pass2-confirmed' : 'llm-pass2-unconfirmed';
      rec.confidence = confirmed ? 'medium' : 'low';
      placed += 1;
      if (confirmed) confirmedCount += 1;
    }
  } catch { /* leave unplaced */ }

  done += 1;
  if (done % 50 === 0) console.log(`  ${done}/${todo.length} (placed ${placed})`);
}

fs.writeFileSync(FILE, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log(`\nplaced ${placed} of ${todo.length} (${confirmedCount} survived verification)`);
console.log(`still unplaced: ${rows.filter((r) => !r.fn).length}`);
console.log(`total assigned: ${rows.filter((r) => r.fn).length} / ${rows.length}`);
