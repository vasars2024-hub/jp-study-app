/**
 * Third pass over the tail pass 2 could not place honestly.
 *
 * Pass 2 showed a 129-item menu and the model answered by menu position, not by
 * meaning — 35% of its picks were a single early slot. So this pass never shows
 * more than CHUNK labels at once, and shuffles both the chunk order and the
 * order within each chunk per point, so a positional habit cannot concentrate
 * on any one label. Survivors of the chunk round go to a small runoff, then the
 * same yes/no verification that caught pass 2's failure.
 *
 *   node tools/grammar-classify/pass3.mjs
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
const CHUNK = 15;

const rows = fs.readFileSync(FILE, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
const argv = process.argv.slice(2);
const LIMIT = argv.includes('--limit') ? Number(argv[argv.indexOf('--limit') + 1]) : Infinity;
const DRY = argv.includes('--dry'); // score a sample without writing
const todo = rows.filter((r) => !r.fn).slice(0, LIMIT);
console.log(`third pass over ${todo.length} unplaced points (chunks of ${CHUNK})`);

function modelPath() {
  const d = path.join(os.homedir(), 'Downloads');
  for (const n of ['Qwen_Qwen3-1.7B-Q4_K_M.gguf', 'Qwen3-1.7B-Q4_K_M.gguf', 'qwen3-1.7b-q4_k_m.gguf']) {
    const c = path.join(d, n);
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/** Deterministic per-point shuffle: reproducible, but different for each point. */
function shuffle(arr, seed) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const hash = (str) => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) & 0x7fffffff, 7);

const { getLlama, LlamaChatSession } = await import('node-llama-cpp');
const llama = await getLlama();
const model = await llama.loadModel({ modelPath: modelPath() });
const context = await model.createContext({ contextSize: 2048 });
const session = new LlamaChatSession({ contextSequence: context.getSequence() });

async function ask(header, ids) {
  const menu = ids.map((id, i) => `${i + 1}. ${CANONICAL[id].label} — ${CANONICAL[id].hint}`).join('\n');
  session.setChatHistory([]);
  const raw = await session.prompt(
    `${header}\n\nWhich of these best describes its grammatical function?\n${menu}\n0. None of these\n\nReply with only the number. /no_think`,
    { maxTokens: 6, temperature: 0 },
  );
  const n = Number((raw.match(/\d+/) || [])[0]);
  return n >= 1 && n <= ids.length ? ids[n - 1] : null;
}

let placed = 0;
let done = 0;
const byId = new Map(rows.map((r) => [r.id, r]));

for (const r of todo) {
  const header = `Japanese grammar point: ${r.title}\nMeaning: ${r.meaning}`;
  const seed = hash(r.id);
  const pool = shuffle(CANONICAL_IDS, seed);

  try {
    // Round 1 — every label seen exactly once, in small groups.
    const survivors = [];
    for (let i = 0; i < pool.length; i += CHUNK) {
      const pick = await ask(header, shuffle(pool.slice(i, i + CHUNK), seed + i));
      if (pick) survivors.push(pick);
    }

    let fn = null;
    if (survivors.length === 1) fn = survivors[0];
    else if (survivors.length > 1) fn = await ask(header, shuffle(survivors, seed + 99));

    if (fn) {
      session.setChatHistory([]);
      const check = await session.prompt(
        `${header}\n\nDoes "${CANONICAL[fn].label}" (${CANONICAL[fn].hint}) correctly describe its grammatical function?\nAnswer only yes or no. /no_think`,
        { maxTokens: 6, temperature: 0 },
      );
      if (/\byes\b/i.test(check)) {
        const rec = byId.get(r.id);
        rec.fn = fn;
        rec.via = 'llm-pass3';
        rec.confidence = 'medium';
        placed += 1;
      }
    }
  } catch { /* leave unplaced */ }

  done += 1;
  if (done % 25 === 0) {
    console.log(`  ${done}/${todo.length} (placed ${placed})`);
    // Checkpoint: pass 2 wrote only at exit, so a late crash would have lost
    // the whole run.
    if (!DRY) fs.writeFileSync(FILE, rows.map((x) => JSON.stringify(x)).join('\n') + '\n');
  }
}

fs.writeFileSync(FILE, rows.map((x) => JSON.stringify(x)).join('\n') + '\n');
console.log(`\nplaced ${placed} of ${todo.length}`);
console.log(`total assigned: ${rows.filter((x) => x.fn).length} / ${rows.length}`);
