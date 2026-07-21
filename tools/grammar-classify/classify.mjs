/**
 * Step 2: assign one canonical function id to every grammar point.
 *
 * Two stages on purpose. The tagger this replaces failed because it matched
 * English glosses with one flat regex pass and fell back to 'other' — so here
 * a deterministic stage runs first on the *Japanese pattern* (which is far more
 * reliable than the gloss), and the LLM is only asked to break ties among a
 * short candidate list. Asking a 1.7B model to pick blind from 128 labels
 * produces confident garbage; picking from ~12 is a task it can actually do.
 *
 * Nothing here writes to src/. Output is a reviewable JSONL + a summary.
 *
 *   node tools/grammar-classify/classify.mjs [--limit N] [--no-llm]
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { CANONICAL, CANONICAL_IDS, resolve } = require('./labels.cjs');

const DIR = path.dirname(fileURLToPath(import.meta.url));
const POINTS = path.join(DIR, 'points.jsonl');
const OUT = path.join(DIR, 'assignments.jsonl');

const args = process.argv.slice(2);
const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
const USE_LLM = !args.includes('--no-llm');

/* ------------------------------------------------------------------ *
 * Stage 1 — morphology rules over the Japanese pattern.
 * Ordered: the first match wins, so put narrow patterns above broad ones.
 * ------------------------------------------------------------------ */
const RULES = [
  [/ばよかった|たらよかった|ばい{0,1}いのに/, 'regret'],
  [/たとたん|やいなや|next いなや|とたんに/, 'immediately-after'],
  [/たことがある/, 'experience'],
  [/ことがある(?!る)/, 'repeat-habits'],
  [/ものだ$|ものです$/, 'repeat-habits'],
  [/たびに|ごとに/, 'frequency'],
  [/うちに|ないうちに/, 'short-time'],
  // ならない is shared with なければならない (obligation), so the ban forms must
  // be listed with their own preceding particle rather than matched loosely.
  [/てはいけない|てはならない|ことはならない|べからず|てはだめ/, 'ban'],
  [/なければならない|なくてはならない|ないといけない|ねばならない/, 'necessary-obligation'],
  [/たほうがいい|べきだ|べきです/, 'advice'],
  [/てもいいですか|てもよろしい/, 'request-permission'],
  [/てもいい|てもかまわない/, 'allow'],
  [/てください|てほしい|ていただけ/, 'request'],
  [/ませんか|ましょう/, 'invite-suggest'],
  [/なさい|命令/, 'order'],
  [/たい$|たいです|ほしい/, 'desire'],
  [/つもり|ようとおもう/, 'intent'],
  [/ことにする|に決める/, 'decision'],
  [/ことになる|ことになっている/, 'results-state'],
  [/予定/, 'plan'],
  [/かもしれない|だろう|でしょう|らしい$|みたいだ/, 'speculation'],
  [/そうだ$|そうです$|ということだ|とのこと/, 'heard'],
  [/はずだ|に決まっている/, 'of-course'],
  [/わけだ|わけです|ということになる/, 'conclude'],
  [/のだ$|んです/, 'explain'],
  [/とは$|というのは/, 'definition'],
  [/ば.*ほど|につれて|にしたがって|とともに.*変/, 'proportional'],
  [/さえ.*ば|さえすれば/, 'condition-requirement'],
  [/としたら|とすれば|とすると|仮に/, 'condition-assumption'],
  [/ば.*のに|たら.*のに/, 'condition-contrary'],
  [/場合/, 'case'],
  // Titles write optional particles as 「ながら(も)」, so the も must tolerate
  // the parentheses or the concessive falls through to plain 'simultaneous'.
  [/ても|でも$|ながら\(?も\)?|にもかかわらず|くせに|といえども/, 'concessions'],
  [/のに$/, 'unexpected-outcome'],
  [/^もし|ば$|たら$|なら$|と$/, 'condition'],
  [/だけ|しか|ばかり|のみ|きり/, 'limit'],
  [/はもちろん|どころか|はおろか|まして/, 'much-less-on-level'],
  [/すら|でさえ|まで.*も/, 'extreme-example'],
  [/こそ|からこそ/, 'emphasize'],
  [/まったく.*ない|ちっとも|少しも|一つも|わけではない|というわけでもない/, 'emphasize-negative'],
  [/てから|あとで|前に|以来/, 'time-sequence'],
  [/ながら|と同時に|一方で.*同時/, 'simultaneous'],
  [/つつある/, 'process'],
  [/つづける|続ける|ままで|っぱなし/, 'continuity'],
  [/てしまう|終わる|きる$/, 'finish'],
  [/かけ|途中/, 'halfway'],
  [/てみる|ようとする/, 'action-effort'],
  [/てある|ておく/, 'action-status'],
  [/てくれる|てもらう|てあげる/, 'benefit'],
  [/させる|させられる/, 'forced'],
  [/られる|(?:こと|事)ができる/, 'ability'],
  [/によって|に基づいて|をもとに/, 'standard'],
  [/を通じて|を通して/, 'through'],
  [/にわたって|に渡って/, 'range'],
  [/として$|としての/, 'as'],
  [/にとって|から見ると|から言うと/, 'perspective-way'],
  [/ため|ように$|には$/, 'purpose-goal'],
  [/から$|ので|それで|そのため/, 'cause-reason'],
  [/からには|以上は|上は/, 'grounds'],
  [/よう[だな]|みたい|ごとく/, 'similarity-degree'],
  [/ほど|くらい|ぐらい/, 'level'],
  [/より/, 'compare'],
  [/っぽい|がち|ぎみ|傾向/, 'trend'],
  [/をのぞいて|以外/, 'exception'],
  [/とか|なんか|など/, 'denote-by-example'],
  [/たり|し$/, 'queue-listing'],
  [/うえに|ばかりでなく|だけでなく|のみならず/, 'add'],
  [/といえば|というと|ば$/, 'story-topic'],
  [/おそれがある|ないように/, 'warning'],
  [/あげく|結果|末に/, 'result'],
  [/間|中に|中は/, 'period'],
  [/において|における/, 'place'],
  [/ない$|ません/, 'negative'],
];

function ruleMatch(p) {
  const hay = `${p.title} ${p.structure}`;
  for (const [re, id] of RULES) if (re.test(hay)) return id;
  return null;
}

/* ------------------------------------------------------------------ *
 * Candidate shortlist — keyword overlap between the gloss and label hints.
 * Used only to narrow the LLM's choices, never to decide on its own.
 * ------------------------------------------------------------------ */
const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'in', 'is', 'it', 'that', 'and', 'or',
  'for', 'on', 'with', 'as', 'be', 'not', 'by', 'at', 'from', 'this', 'something', 'someone']);

const LABEL_TOKENS = Object.fromEntries(
  CANONICAL_IDS.map((id) => {
    const text = `${CANONICAL[id].label} ${CANONICAL[id].hint}`.toLowerCase();
    const toks = text.match(/[a-z]+/g) || [];
    return [id, new Set(toks.filter((t) => t.length > 2 && !STOP.has(t)))];
  }),
);

function shortlist(p, n = 18) {
  const text = `${p.meaning} ${p.explanation}`.toLowerCase();
  const toks = new Set((text.match(/[a-z]+/g) || []).filter((t) => t.length > 2 && !STOP.has(t)));
  const jp = `${p.title} ${p.structure}`;
  const scored = CANONICAL_IDS.map((id) => {
    let score = 0;
    for (const t of LABEL_TOKENS[id]) if (toks.has(t)) score += 1;
    // A hint that names the actual Japanese pattern is much stronger evidence
    // than an English word overlap, so weight it heavily.
    for (const m of CANONICAL[id].hint.match(/[ぁ-んァ-ン一-龯]+/g) || []) {
      if (m.length > 1 && jp.includes(m)) score += 3;
    }
    return { id, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
  return scored.map((s) => s.id);
}

/* ------------------------------------------------------------------ *
 * Stage 2 — LLM tie-break over the shortlist.
 * ------------------------------------------------------------------ */
function modelPath() {
  const downloads = path.join(os.homedir(), 'Downloads');
  for (const n of ['Qwen_Qwen3-1.7B-Q4_K_M.gguf', 'Qwen3-1.7B-Q4_K_M.gguf', 'qwen3-1.7b-q4_k_m.gguf']) {
    const c = path.join(downloads, n);
    if (fs.existsSync(c)) return c;
  }
  const stored = path.join(process.env.APPDATA || '', 'jp-study-app', 'models', 'Qwen3-1.7B.gguf');
  return fs.existsSync(stored) ? stored : null;
}

async function main() {
  const points = fs.readFileSync(POINTS, 'utf-8').trim().split('\n')
    .map((l) => JSON.parse(l)).slice(0, LIMIT);

  const results = [];
  const needLlm = [];

  for (const p of points) {
    const rule = ruleMatch(p);
    if (rule) {
      results.push({ id: p.id, title: p.title, meaning: p.meaning, fn: rule, via: 'rule', confidence: 'high' });
    } else {
      needLlm.push(p);
    }
  }

  console.log(`rule-matched: ${results.length} / ${points.length}`);
  console.log(`needing LLM:  ${needLlm.length}`);

  if (!USE_LLM || needLlm.length === 0) {
    finish(results, needLlm);
    return;
  }

  const mp = modelPath();
  if (!mp) {
    console.error('Qwen3 model not found — rerun with the gguf in ~/Downloads.');
    finish(results, needLlm);
    return;
  }

  const { getLlama, LlamaChatSession } = await import('node-llama-cpp');
  const llama = await getLlama();
  const model = await llama.loadModel({ modelPath: mp });
  console.log(`model loaded: ${path.basename(mp)}`);

  // One context for the whole run. Allocating a fresh context per point cost
  // more than the inference itself (~4x slower end to end); resetting the chat
  // history gives the same isolation — no point can bias the next — for free.
  const context = await model.createContext({ contextSize: 2048 });
  const session = new LlamaChatSession({ contextSequence: context.getSequence() });

  let done = 0;
  for (const p of needLlm) {
    const cands = shortlist(p);
    if (cands.length === 0) {
      results.push({ id: p.id, title: p.title, meaning: p.meaning, fn: null, via: 'none', confidence: 'none' });
      done += 1;
      continue;
    }
    if (cands.length === 1) {
      results.push({ id: p.id, title: p.title, meaning: p.meaning, fn: cands[0], via: 'shortlist-1', confidence: 'medium' });
      done += 1;
      continue;
    }

    const menu = cands.map((c, i) => `${i + 1}. ${CANONICAL[c].label} — ${CANONICAL[c].hint}`).join('\n');
    const prompt = `Japanese grammar point: ${p.title}
Meaning: ${p.meaning}

Which single function best describes it?
${menu}
0. None of these fit

Reply with only the number. /no_think`;

    session.setChatHistory([]);
    let pick = null;
    let declined = false;
    try {
      const raw = await session.prompt(prompt, { maxTokens: 8, temperature: 0 });
      const n = Number((raw.match(/\d+/) || [])[0]);
      // 0 means the shortlist missed the right label. Forcing a pick there is
      // how the old tagger produced confident nonsense — flag it for review
      // instead of silently taking the least-bad candidate.
      if (n === 0) declined = true;
      else if (n >= 1 && n <= cands.length) pick = cands[n - 1];
    } catch { /* fall through to review */ }

    results.push({
      id: p.id, title: p.title, meaning: p.meaning,
      fn: pick,
      via: pick ? 'llm' : declined ? 'llm-declined' : 'llm-unparsed',
      confidence: pick ? 'medium' : 'none',
      candidates: cands,
    });

    done += 1;
    if (done % 25 === 0) console.log(`  ${done}/${needLlm.length}`);
  }

  finish(results, []);
}

function finish(results, unresolved) {
  for (const p of unresolved) {
    results.push({ id: p.id, title: p.title, meaning: p.meaning, fn: null, via: 'skipped', confidence: 'none' });
  }
  fs.writeFileSync(OUT, results.map((r) => JSON.stringify(r)).join('\n') + '\n');

  const byVia = {};
  const byFn = {};
  for (const r of results) {
    byVia[r.via] = (byVia[r.via] || 0) + 1;
    if (r.fn) byFn[r.fn] = (byFn[r.fn] || 0) + 1;
  }
  console.log('\n--- by method ---');
  for (const [k, v] of Object.entries(byVia).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
  console.log(`\nunassigned: ${results.filter((r) => !r.fn).length}`);
  console.log(`distinct functions used: ${Object.keys(byFn).length} / ${CANONICAL_IDS.length}`);
  console.log('\ntop buckets:');
  for (const [k, v] of Object.entries(byFn).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${CANONICAL[k].label}: ${v}`);
  }
  console.log(`\nwrote ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
