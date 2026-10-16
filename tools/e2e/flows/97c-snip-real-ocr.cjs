'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Snip to cards with the REAL OCR models, end to end, headless. Local runs only.
 *
 *   set GUM_E2E_OCR_MODELS=<copy of a profile's models folder>
 *   set GUM_E2E_SNIP_IMAGES=<dir with PNGs + truth.json>[;<another dir>]
 *   npm run e2e -- --flows=snip-real-ocr
 *
 * The models are seeded into the run's isolated profile before the app starts
 * (`tools/e2e/realModels.cjs`), so the app reads with installed PaddleOCR exactly as
 * on the owner's machine; nothing is downloaded. Each picture is put on the harness's
 * in-memory clipboard as a Win+Shift+S snip, and the flow checks the whole app path:
 * the snip is noticed, read by the accurate reader, put in the language its text is
 * in, and its cards are made in that language — never a card in another language,
 * and no kana readings (furigana) on a Chinese snip or its cards. Each snip's cards
 * are undone before the next, so every snip starts from the same deck.
 *
 * truth.json is `snip-synth.cjs`'s format ({ files: { "a.png": { text, lang } } });
 * a file with `lang: null` is read and reported, not scored. The pictures (the owner's
 * snips, synthetic ones drawn with Windows fonts) stay outside the repo.
 *
 * Without both variables the flow skips: the normal run has no models (the
 * model-less snip flow, 97b, covers the pipeline with the harness fake reader).
 * `GUM_E2E_SNIP_EVERY=n` reads every n-th picture of each folder (a quicker pass).
 */
const fs = require('node:fs');
const path = require('node:path');
const { ensureDictionaryReady, installHelpers, poll, pollAsync, DECK } = require('./_lib.cjs');

const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const PINYIN = /[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/iu;

function norm(s) {
  return String(s ?? '').normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '');
}

function levenshtein(a, b) {
  const A = [...a];
  const B = [...b];
  let prev = Array.from({ length: B.length + 1 }, (_, i) => i);
  for (let i = 1; i <= A.length; i++) {
    const cur = [i];
    for (let j = 1; j <= B.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[B.length];
}

/** The pictures to snip: every PNG of each folder (every n-th with GUM_E2E_SNIP_EVERY). */
function snipImages() {
  const every = Math.max(1, Number(process.env.GUM_E2E_SNIP_EVERY) || 1);
  const out = [];
  for (const dir of String(process.env.GUM_E2E_SNIP_IMAGES || '').split(path.delimiter).filter(Boolean)) {
    const truthFile = path.join(dir, 'truth.json');
    const truth = fs.existsSync(truthFile) ? JSON.parse(fs.readFileSync(truthFile, 'utf8')) : {};
    const files = fs.readdirSync(dir).filter((f) => /\.png$/i.test(f)).sort();
    files.forEach((file, i) => {
      if (i % every) return;
      out.push({ file, dir: path.basename(dir), path: path.join(dir, file), truth: (truth.files ?? truth)[file] ?? null });
    });
  }
  return out;
}

/** Why a card is in the wrong language, or ''. */
function wrongCard(card, lang) {
  const cardLang = card.studyLang || 'ja';
  if (lang && cardLang !== lang) return `card in ${cardLang}, text is ${lang}`;
  if (cardLang === 'zh' && card.reading && KANA.test(card.reading)) return `kana reading ${card.reading} on a Chinese card`;
  if (cardLang === 'ja' && card.reading && PINYIN.test(card.reading) && !KANA.test(card.reading)) return `pinyin reading ${card.reading} on a Japanese card`;
  return '';
}

module.exports = {
  id: 'snip-real-ocr',
  title: 'Snip to cards with the real OCR models: snip -> notice -> read -> language -> cards (local runs)',
  async run(ctx) {
    const { eval: ev, result } = ctx;
    if (!process.env.GUM_E2E_OCR_MODELS || !process.env.GUM_E2E_SNIP_IMAGES) {
      result.skip('local runs only: set GUM_E2E_OCR_MODELS (a copy of a models folder) and GUM_E2E_SNIP_IMAGES');
      return;
    }
    await installHelpers(ctx);
    const dict = await ensureDictionaryReady(ctx);
    result.check('the built-in dictionary is ready for lookups', dict.ready, dict);

    const status = await ev(`window.api.snipGetStatus()`, { await: true });
    result.note(`readers: ${JSON.stringify(status?.readers)}; study language ${status?.studyLang}`);
    result.check('the seeded models are installed in the run\'s profile (detector + Japanese + Chinese recognisers)',
      status?.readers?.det === true && status.readers.paddle.includes('ja') && status.readers.paddle.includes('zh'), status?.readers);

    const on = await ev(`window.api.snipSetSettings({ enabled: true, autoAdd: true, maxWords: 12 })`, { await: true });
    result.check('Snip to cards is on, adding automatically', on?.enabled === true && on?.watching === true, on);

    const images = snipImages();
    result.note(`${images.length} pictures from ${[...new Set(images.map((i) => i.dir))].join(', ')}`);
    const rows = [];
    let n = 0;
    for (const image of images) {
      n += 1;
      const before = ((await ev(`window.api.snipHistoryList({})`, { await: true })) ?? []).map((e) => e.id);
      await ctx.e2e('clipboard', { set: { text: `snip ${n}` } });
      await ctx.sleep(700);
      await ctx.e2e('clipboard', { set: { imagePath: image.path } });
      const entry = await pollAsync(ctx, `window.api.snipHistoryList({}).then((list) => (list || []).find((e) => !${JSON.stringify(before)}.includes(e.id) && e.status !== 'processing') || null)`, 180000, 400);
      const row = { file: `${image.dir}/${image.file}`, truth: image.truth, noticed: Boolean(entry) };
      if (entry) {
        const cards = entry.cardIds.length
          ? (await ev(`(() => { const ids = ${JSON.stringify(entry.cardIds)}; return ${DECK}.filter((c) => ids.includes(c.id)).map((c) => ({ word: c.word, reading: c.reading || '', studyLang: c.studyLang || '' })); })()`)) ?? []
          : [];
        const lang = image.truth?.lang ?? null;
        Object.assign(row, {
          id: entry.id,
          status: entry.status,
          error: entry.error,
          lang: entry.lang,
          engine: entry.engine,
          engines: entry.engines,
          confidence: entry.confidence,
          text: entry.text,
          review: entry.review,
          words: (entry.words || []).filter((w) => w.status === 'candidate' || w.status === 'added').map((w) => `${w.lemma || w.surface}[${w.reading || ''}]`),
          cards,
          wrongCards: cards.map((c) => ({ c, why: wrongCard(c, lang) })).filter((x) => x.why).map((x) => `${x.c.word}[${x.c.reading}]: ${x.why}`),
          // Furigana over a Chinese snip's text: a kana reading on any of its words.
          kanaOnChinese: entry.lang === 'zh' ? (entry.words || []).filter((w) => KANA.test(`${w.reading || ''}${w.surfaceReading || ''}`)).map((w) => w.surface) : [],
          langOk: lang ? entry.lang === lang : null,
          edits: lang && image.truth.text ? Math.min(levenshtein(norm(entry.text), norm(image.truth.text)), [...norm(image.truth.text)].length) : 0,
          chars: lang && image.truth.text ? [...norm(image.truth.text)].length : 0,
        });
        result.note(`${row.file}: ${entry.status}${entry.error ? ` (${entry.error})` : ''} [${entry.lang}${lang ? `, truth ${lang}` : ''}] by ${entry.engine} ${typeof entry.confidence === 'number' ? entry.confidence.toFixed(2) : ''} ${JSON.stringify(entry.text).slice(0, 60)} -> ${cards.map((c) => `${c.word}[${c.reading}]`).join(' ') || 'no cards'}`);
        if (entry.cardIds.length) {
          await ev(`window.api.snipAction({ id: ${JSON.stringify(entry.id)}, action: 'undo' })`, { await: true });
          await pollAsync(ctx, `window.api.snipHistoryGet(${JSON.stringify(entry.id)}).then((e) => e && e.undone ? e : null)`, 30000, 300);
        }
      } else {
        result.note(`${row.file}: not read within 3 minutes`);
      }
      rows.push(row);
    }

    const scored = rows.filter((r) => r.truth?.lang);
    const wrong = rows.flatMap((r) => (r.wrongCards || []).map((w) => `${r.file}: ${w}`));
    const kana = rows.filter((r) => r.kanaOnChinese?.length).map((r) => `${r.file}: ${r.kanaOnChinese.join(' ')}`);
    const chars = scored.reduce((s, r) => s + (r.chars || 0), 0);
    const edits = scored.reduce((s, r) => s + (r.edits || 0), 0);
    const summary = {
      snips: rows.length,
      noticed: rows.filter((r) => r.noticed).length,
      scored: scored.length,
      langCorrect: scored.filter((r) => r.langOk).length,
      charAccuracy: +(1 - edits / Math.max(1, chars)).toFixed(4),
      cards: rows.reduce((s, r) => s + (r.cards?.length || 0), 0),
      wrongLanguageCards: wrong.length,
      kanaOnChinese: kana.length,
    };
    fs.writeFileSync(path.join(ctx.outDir, 'snip-real-ocr.json'), JSON.stringify({ summary, rows }, null, 1));
    result.note(`summary ${JSON.stringify(summary)}`);
    result.check('every snip was noticed and read by the running app', summary.noticed === rows.length, rows.filter((r) => !r.noticed).map((r) => r.file));
    result.check('every snip was read by the accurate reader (PaddleOCR), not the bundled fallback',
      rows.filter((r) => r.noticed && r.truth?.lang && r.truth.lang !== 'ru').every((r) => r.engine === 'web'),
      rows.filter((r) => r.noticed && r.engine !== 'web').map((r) => `${r.file}: ${r.engine}`));
    const langMisses = scored.filter((r) => r.noticed && !r.langOk && r.truth.lang !== 'ru');
    result.check('each Japanese and Chinese snip is put in the language its text is in',
      langMisses.length === 0, langMisses.map((r) => `${r.file}: ${r.lang} (truth ${r.truth.lang}) ${r.text}`));
    result.check('no card is made in a language the snip is not in (wrong-language cards: 0)', wrong.length === 0, wrong);
    result.check('no furigana on Chinese: no kana reading on any word of a Chinese snip', kana.length === 0, kana);
    // A Russian snip with no Russian reader installed: never Japanese or Chinese cards.
    const ru = rows.filter((r) => r.truth?.lang === 'ru');
    if (ru.length) {
      result.check('a Russian snip with no Russian reader makes no cards in another language',
        ru.every((r) => !(r.cards || []).length), ru.map((r) => `${r.file}: ${r.status} ${r.error || ''} ${r.lang}`));
    }

    // The Snips view shows a Chinese snip's text without kana furigana.
    const zh = rows.find((r) => r.lang === 'zh' && r.status === 'done');
    if (zh) {
      await ev(`__e2e.open('snips')`);
      const shown = await poll(ctx, `(() => {
        const item = [...document.querySelectorAll('.snip-app .snip-history-open')].find((b) => b.textContent.includes(${JSON.stringify(String(zh.text).slice(0, 4))}));
        if (item) item.click();
        const text = document.querySelector('.snip-app .snip-text');
        return text ? { rt: [...text.querySelectorAll('rt')].map((x) => x.textContent), text: text.textContent.slice(0, 40) } : null;
      })()`, 20000);
      result.check('the Snips view shows a Chinese snip with no kana furigana', Boolean(shown) && !shown.rt.some((t) => KANA.test(t)), shown);
    }

    const off = await ev(`window.api.snipSetSettings({ enabled: false })`, { await: true });
    result.check('turning it off again stops watching', off?.enabled === false, off);
    await ctx.e2e('clipboard', { set: { text: '' } });
  },
};
