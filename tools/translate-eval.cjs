/**
 * Translation quality harness for the Translate workbench's engines.
 *
 * Scores one engine against a small bundled test set of invented Japanese
 * sentences with reference English translations
 * (`src/shared/__tests__/fixtures/translateEvalJaEn.json`: keigo, omission,
 * idiom, counter, onomatopoeia — eight each), with chrF implemented here, no
 * dependencies. chrF (Popovic 2015) is character n-gram F-score; it follows
 * sacreBLEU's definition (orders 1..6, beta 2, whitespace ignored, per-order F
 * averaged over the orders both sides actually have, the best reference per
 * sentence), so a number from here is comparable in kind to a published chrF.
 *
 * It is run by hand, never by the test suite: scoring a cloud engine sends the
 * test sentences to that provider and spends from the key's account. The unit
 * tests (`src/shared/__tests__/translateEvalMetric.test.ts`) exercise only the
 * metric and the `file` provider, which reads hypotheses from disk.
 *
 * The prompts are the app's own: `src/shared/translateProviders.ts` and
 * `src/shared/translateCore.ts` are bundled with esbuild (as tools/fusion-eval.cjs
 * does), so the harness measures what the product sends, not a second copy.
 *
 * Usage:
 *   node tools/translate-eval.cjs --provider file --hyp hyps.json
 *   node tools/translate-eval.cjs --provider deepl            (key: JPSTUDY_KEY_DEEPL)
 *   node tools/translate-eval.cjs --provider gemini-2.5-flash (key: JPSTUDY_KEY_GEMINI)
 *   node tools/translate-eval.cjs --provider deepseek-v4-flash|deepseek-v4-pro (key: JPSTUDY_KEY_DEEPSEEK)
 *   node tools/translate-eval.cjs --provider local --model C:\path\Qwen3-1.7B-Q8_0.gguf
 *   node tools/translate-eval.cjs --provider reference        (sanity: scores the first reference, ~100)
 * Options:
 *   --set <path>       another test set with the same shape
 *   --category <name>  only that category
 *   --limit <n>        only the first n items
 *   --out <path>       write hypotheses + scores as JSON (re-score later with --provider file --hyp)
 *   --json             print the JSON report instead of the table
 *
 * Hypothesis file: an array of strings in item order, or an object { "<item id>": "<translation>" },
 * or a previous `--out` report (its `items[].hypothesis` are used).
 */
'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- a CommonJS node script, run directly by `node` */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_SET = path.join(ROOT, 'src', 'shared', '__tests__', 'fixtures', 'translateEvalJaEn.json');
const CHRF_ORDER = 6;
const CHRF_BETA = 2;
const EPS = 1e-16;

// ---------------------------------------------------------------------------
// chrF
// ---------------------------------------------------------------------------

function charNgrams(text, n) {
  const chars = Array.from(String(text).replace(/\s+/gu, ''));
  const counts = new Map();
  for (let i = 0; i + n <= chars.length; i += 1) {
    const gram = chars.slice(i, i + n).join('');
    counts.set(gram, (counts.get(gram) || 0) + 1);
  }
  return counts;
}

/**
 * Sufficient statistics for one hypothesis/reference pair: for each order
 * 1..`order`, [hypothesis n-grams, reference n-grams, matched n-grams].
 */
function chrfStats(hypothesis, reference, order = CHRF_ORDER) {
  const stats = [];
  for (let n = 1; n <= order; n += 1) {
    const hyp = charNgrams(hypothesis, n);
    const ref = charNgrams(reference, n);
    let hypCount = 0;
    let refCount = 0;
    let match = 0;
    for (const count of hyp.values()) hypCount += count;
    for (const count of ref.values()) refCount += count;
    for (const [gram, count] of hyp) match += Math.min(count, ref.get(gram) || 0);
    stats.push([hypCount, refCount, match]);
  }
  return stats;
}

/** chrF (0..100) from summed statistics, sacreBLEU's formula. */
function chrfFromStats(stats, beta = CHRF_BETA) {
  const factor = beta * beta;
  let score = 0;
  let effectiveOrder = 0;
  for (const [hypCount, refCount, match] of stats) {
    const precision = hypCount > 0 ? match / hypCount : EPS;
    const recall = refCount > 0 ? match / refCount : EPS;
    const denom = factor * precision + recall;
    score += denom > 0 ? ((1 + factor) * precision * recall) / denom : EPS;
    if (hypCount > 0 && refCount > 0) effectiveOrder += 1;
  }
  if (effectiveOrder === 0) return 0;
  return (100 * score) / effectiveOrder;
}

function addStats(total, stats) {
  if (!total) return stats.map((row) => row.slice());
  return total.map((row, i) => row.map((value, j) => value + stats[i][j]));
}

/** The best reference's statistics for one sentence (sacreBLEU's multi-reference rule). */
function bestStats(hypothesis, references) {
  let best = null;
  let bestScore = -1;
  for (const reference of references) {
    const stats = chrfStats(hypothesis, reference);
    const score = chrfFromStats(stats);
    if (score > bestScore) {
      best = stats;
      bestScore = score;
    }
  }
  return { stats: best || chrfStats(hypothesis, ''), score: Math.max(0, bestScore) };
}

function sentenceChrf(hypothesis, references) {
  const refs = Array.isArray(references) ? references : [references];
  return bestStats(hypothesis, refs).score;
}

/** Corpus chrF: statistics summed over sentences, then one score. */
function corpusChrf(hypotheses, referenceLists) {
  let total = null;
  hypotheses.forEach((hypothesis, i) => {
    const refs = Array.isArray(referenceLists[i]) ? referenceLists[i] : [referenceLists[i]];
    total = addStats(total, bestStats(hypothesis || '', refs).stats);
  });
  return total ? chrfFromStats(total) : 0;
}

// ---------------------------------------------------------------------------
// Test set and scoring
// ---------------------------------------------------------------------------

function loadEvalSet(file = DEFAULT_SET) {
  const set = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!set || !Array.isArray(set.items)) throw new Error(`${file} is not a translation eval set`);
  return set;
}

/** Per-item, per-category and overall chrF for one engine's hypotheses (in item order). */
function scoreHypotheses(items, hypotheses) {
  const rows = items.map((item, i) => {
    const hypothesis = typeof hypotheses[i] === 'string' ? hypotheses[i] : '';
    return {
      id: item.id,
      category: item.category,
      source: item.source,
      hypothesis,
      chrf: Number(sentenceChrf(hypothesis, item.references).toFixed(2)),
    };
  });
  const categories = {};
  for (const category of [...new Set(items.map((item) => item.category))]) {
    const idx = items.map((item, i) => (item.category === category ? i : -1)).filter((i) => i >= 0);
    categories[category] = {
      items: idx.length,
      chrf: Number(corpusChrf(idx.map((i) => rows[i].hypothesis), idx.map((i) => items[i].references)).toFixed(2)),
    };
  }
  const overall = Number(corpusChrf(rows.map((row) => row.hypothesis), items.map((item) => item.references)).toFixed(2));
  const empty = rows.filter((row) => !row.hypothesis.trim()).length;
  return { overall, categories, empty, items: rows };
}

function readHypothesisFile(file, items) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (Array.isArray(data)) return items.map((_, i) => (typeof data[i] === 'string' ? data[i] : ''));
  if (data && Array.isArray(data.items)) {
    const byId = new Map(data.items.map((row) => [row.id, row.hypothesis]));
    return items.map((item) => (typeof byId.get(item.id) === 'string' ? byId.get(item.id) : ''));
  }
  if (data && typeof data === 'object') return items.map((item) => (typeof data[item.id] === 'string' ? data[item.id] : ''));
  throw new Error(`${file}: expected an array, an id map, or a previous --out report`);
}

// ---------------------------------------------------------------------------
// Engines (manual runs only — these make real network calls / load a model)
// ---------------------------------------------------------------------------

function bundleShared() {
  const esbuild = require('esbuild');
  const entry = path.join(ROOT, 'src', 'shared', 'translateProviders.ts');
  const core = path.join(ROOT, 'src', 'shared', 'translateCore.ts');
  const load = (file) => {
    const { outputFiles } = esbuild.buildSync({
      entryPoints: [file], bundle: true, write: false, format: 'cjs', platform: 'node', target: 'node18', logLevel: 'silent',
    });
    const mod = { exports: {} };
    // eslint-disable-next-line no-new-func -- trusted local source, not user input
    new Function('module', 'exports', 'require', outputFiles[0].text)(mod, mod.exports, require);
    return mod.exports;
  };
  return { providers: load(entry), core: load(core) };
}

function envKey(name) {
  const value = (process.env[name] || '').trim();
  if (!value) throw new Error(`Set ${name} to run this provider (the same variable the app reads).`);
  return value;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runDeepl(items, set) {
  const { providers } = bundleShared();
  const key = envKey('JPSTUDY_KEY_DEEPL');
  const response = await fetch(`${providers.deeplApiBase(key)}/v2/translate`, {
    method: 'POST',
    headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: items.map((item) => item.source),
      source_lang: providers.deeplLangCode(set.source, 'source'),
      target_lang: providers.deeplLangCode(set.target, 'target'),
    }),
  });
  if (!response.ok) throw new Error(`DeepL returned ${response.status}`);
  const out = providers.parseDeeplTranslations(await response.json(), items.length);
  if (!out) throw new Error('DeepL returned an unexpected body');
  return out;
}

async function runLlm(providerId, items, set) {
  const { providers, core } = bundleShared();
  const gemini = providerId.startsWith('gemini');
  const key = envKey(gemini ? 'JPSTUDY_KEY_GEMINI' : 'JPSTUDY_KEY_DEEPSEEK');
  const out = [];
  for (const item of items) {
    // Each item is one passage, exactly as the workbench sends one.
    const sentences = core.splitTranslationSentences(item.source);
    const prompt = providers.buildCloudTranslatePrompt(sentences, set.source, set.target, 'natural', []);
    let text = '';
    if (gemini) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: providers.CLOUD_TRANSLATE_SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 4096, temperature: 0.2, thinkingConfig: { thinkingBudget: 1024 } },
        }),
      });
      if (!res.ok) throw new Error(`Gemini returned ${res.status}`);
      const json = await res.json();
      text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    } else {
      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: providerId,
          messages: [
            { role: 'system', content: providers.CLOUD_TRANSLATE_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          max_tokens: 2048,
          temperature: 0.2,
        }),
      });
      if (!res.ok) throw new Error(`DeepSeek returned ${res.status}`);
      const json = await res.json();
      text = json?.choices?.[0]?.message?.content || '';
    }
    const parsed = providers.parseCloudTranslateLines(text, sentences.length);
    out.push(sentences.map((_, i) => parsed.get(i) || '').filter(Boolean).join(' '));
    process.stderr.write('.');
    await sleep(300);
  }
  process.stderr.write('\n');
  return out;
}

async function runLocal(items, set, modelPath) {
  if (!modelPath) throw new Error('--provider local needs --model <path to a .gguf>');
  const { core } = bundleShared();
  let llama;
  try {
    llama = await import('node-llama-cpp');
  } catch {
    throw new Error('node-llama-cpp is not installed in this checkout; score the app\'s output with --provider file instead.');
  }
  const runtime = await llama.getLlama();
  const model = await runtime.loadModel({ modelPath });
  const context = await model.createContext({ contextSize: 8192 });
  const session = new llama.LlamaChatSession({ contextSequence: context.getSequence() });
  const out = [];
  try {
    for (const item of items) {
      const parts = [];
      for (const sentence of core.splitTranslationSentences(item.source)) {
        session.resetChatHistory();
        const raw = await session.prompt(core.buildSentencePrompt(sentence, set.source, set.target), { maxTokens: 400 });
        parts.push(core.cleanLlmOutput(raw));
      }
      out.push(parts.join(' '));
      process.stderr.write('.');
    }
  } finally {
    process.stderr.write('\n');
    await context.dispose();
    await model.dispose();
  }
  return out;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg.startsWith('--')) {
      args[arg.slice(2)] = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function printTable(provider, report) {
  const lines = [`Translation eval — provider: ${provider}`, ''];
  lines.push(`  overall chrF  ${report.overall.toFixed(2)}   (${report.items.length} items, ${report.empty} empty)`);
  for (const [category, row] of Object.entries(report.categories)) {
    lines.push(`  ${category.padEnd(14)}${row.chrf.toFixed(2).padStart(6)}   (${row.items})`);
  }
  lines.push('', '  lowest-scoring items:');
  for (const row of [...report.items].sort((a, b) => a.chrf - b.chrf).slice(0, 5)) {
    lines.push(`    ${row.chrf.toFixed(1).padStart(5)}  ${row.id}  ${row.hypothesis || '(empty)'}`);
  }
  console.log(lines.join('\n'));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const provider = args.provider;
  if (!provider) {
    console.error('Usage: node tools/translate-eval.cjs --provider <file|reference|deepl|gemini-2.5-flash|deepseek-v4-flash|deepseek-v4-pro|local> [options]');
    process.exit(2);
  }
  const set = loadEvalSet(args.set ? path.resolve(args.set) : DEFAULT_SET);
  let items = set.items;
  if (args.category) items = items.filter((item) => item.category === args.category);
  if (args.limit) items = items.slice(0, Math.max(1, Number(args.limit) || items.length));

  let hypotheses;
  if (provider === 'file') {
    if (!args.hyp) throw new Error('--provider file needs --hyp <path>');
    hypotheses = readHypothesisFile(path.resolve(args.hyp), items);
  } else if (provider === 'reference') {
    hypotheses = items.map((item) => item.references[0]);
  } else if (provider === 'deepl') {
    hypotheses = await runDeepl(items, set);
  } else if (provider === 'gemini-2.5-flash' || provider === 'deepseek-v4-flash' || provider === 'deepseek-v4-pro') {
    hypotheses = await runLlm(provider, items, set);
  } else if (provider === 'local') {
    hypotheses = await runLocal(items, set, args.model);
  } else {
    throw new Error(`Unknown provider "${provider}"`);
  }

  const report = { provider, set: path.relative(ROOT, args.set ? path.resolve(args.set) : DEFAULT_SET), metric: 'chrF (n=6, beta=2)', ...scoreHypotheses(items, hypotheses) };
  if (args.out) fs.writeFileSync(path.resolve(args.out), `${JSON.stringify(report, null, 2)}\n`);
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printTable(provider, report);
}

module.exports = {
  DEFAULT_SET,
  chrfStats,
  chrfFromStats,
  sentenceChrf,
  corpusChrf,
  loadEvalSet,
  scoreHypotheses,
  readHypothesisFile,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
