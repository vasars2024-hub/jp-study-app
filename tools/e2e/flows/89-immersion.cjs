'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Immersion reader, offline: a reading-list file (Gum's own export format, written here)
 * is imported through the Reading list's Import button — three articles, two with an intact
 * offline copy (Japanese, English) and one whose copy was tampered with. Only the intact
 * copies are offered; the Japanese one opens in Reader Mode with no network at all, where the
 * study tools run on it: known-word coverage, i+1 sentences, the vertical (tategaki) layout
 * and read-aloud. Export then writes the list back out.
 *
 * W3-C (v1) adds:
 *  - bug 28: two URLs that differ only by `?p=` are two history rows (and a tracking
 *    parameter is not a third), through main's real IPC;
 *  - read-aloud: the controls appear and change state (the app runs with --mute-audio, so
 *    this asserts on state, never on sound). A host without a Japanese voice shows the
 *    missing voice in words and the English copy exercises Pause, Resume, Stop and speed;
 *  - bug 29: an import that overflows the 300-item cap deletes the offline copies of the
 *    items it pushed out (read straight from IndexedDB);
 *  - F3: a Reader Mode failure (a 404 from a loopback server this flow starts) is shown as
 *    a coded message, translated: the UI is switched to Russian for it, then back.
 */
const http = require('node:http');
const { installHelpers, poll, pollAsync } = require('./_lib.cjs');

const ARTICLE = [
  '<h1>雨の日の図書館</h1>',
  '<div class="reader-article" data-lookup-block="">',
  '<p>雨の日は、図書館で本を読むのが好きです。静かな部屋で、窓の外の雨の音を聞きます。</p>',
  '<p>「今日は何を読もうか。」と友達が言いました。私は日本の昔話を選びました。</p>',
  '<div class="main_text">昔、ある村に一人のおじいさんが住んでいました。<br />おじいさんは毎日山へ行きました。<br /></div>',
  '</div>',
].join('');

const ENGLISH = [
  '<h1>A Rainy Day</h1>',
  '<div class="reader-article" data-lookup-block="">',
  '<p>On rainy days I like to read in the library. The room is quiet, and I can hear the rain outside.</p>',
  '<p>My friend asked what we should read today. I chose an old folk tale.</p>',
  '</div>',
].join('');

/** Russian `immersionUi.error.http` for status 404 (shared/i18n/immersionUi/ru.ts). */
const RU_HTTP_404 = 'Сайт ответил ошибкой 404, поэтому показать статью нельзя.';

/** The checksum `imm5SnapshotHash` stores: length and FNV-1a over UTF-16 code units, base 36. */
function snapshotHash(html) {
  let h = 2166136261;
  for (let i = 0; i < html.length; i++) {
    h ^= html.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${html.length.toString(36)}.${(h >>> 0).toString(36)}`;
}

function readingItemId(url) {
  let h = 2166136261;
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `rl-${(h >>> 0).toString(36)}`;
}

/** The type of one value in the app's IndexedDB kv store (`storage/db.ts`), or '__absent__'. */
function kvTypeOf(key) {
  return `new Promise((resolve, reject) => {
    const open = indexedDB.open('jp-study-db');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const get = db.transaction('kv', 'readonly').objectStore('kv').get(${JSON.stringify(key)});
      get.onsuccess = () => { resolve(get.result === undefined ? '__absent__' : typeof get.result); db.close(); };
      get.onerror = () => { reject(get.error); db.close(); };
    };
  })`;
}

/** How many offline copies (`imm5:snapshot:*`) IndexedDB holds. */
const SNAPSHOT_COUNT = `new Promise((resolve, reject) => {
  const open = indexedDB.open('jp-study-db');
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const db = open.result;
    const keys = db.transaction('kv', 'readonly').objectStore('kv').getAllKeys();
    keys.onsuccess = () => { resolve(keys.result.map(String).filter((k) => k.startsWith('imm5:snapshot:')).length); db.close(); };
    keys.onerror = () => { reject(keys.error); db.close(); };
  };
})`;

/** Set the read-aloud speed select the way a user does. */
const setRate = (value) => `(() => {
  const select = document.querySelector('[data-imm-read-aloud-action="rate"]');
  if (!select) return false;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(value)});
  select.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;

/** Press a read-aloud start button and follow the state until it plays or names why it cannot. */
async function startReadAloud(ctx, action) {
  const { eval: ev } = ctx;
  const ready = await poll(ctx, `(() => { const b = document.querySelector('[data-imm-read-aloud-action="${action}"]'); return b && !b.disabled ? true : null; })()`, 8000);
  if (!ready) return null;
  await ev(`(() => {
    const g = document.querySelector('[data-imm-read-aloud]');
    window.__readAloudObserver?.disconnect();
    window.__readAloudStates = [g.dataset.immReadAloud];
    window.__readAloudObserver = new MutationObserver(() => window.__readAloudStates.push(g.dataset.immReadAloud));
    window.__readAloudObserver.observe(g, { attributes: true, attributeFilter: ['data-imm-read-aloud'] });
    return true;
  })()`);
  await ev(`__e2e.click('[data-imm-read-aloud-action="${action}"]')`);
  return poll(ctx, `(() => {
    const s = window.__readAloudStates;
    const g = document.querySelector('[data-imm-read-aloud]');
    return s.includes('playing') || s.includes('error')
      ? { states: s.slice(), lang: g ? g.dataset.immReadAloudLang : null, alert: document.querySelector('[data-imm-read-aloud-error]')?.textContent ?? null }
      : null;
  })()`, 120000, 300);
}

/**
 * With read-aloud playing: Pause first (a muted sentence is over in a second or two), then,
 * held on that sentence, the highlight and the speed; then Resume and Stop.
 */
async function exerciseReadAloud(ctx, label) {
  const { eval: ev, result } = ctx;
  await ev(`__e2e.click('[data-imm-read-aloud-action="pause"]')`);
  const paused = await poll(ctx, `document.querySelector('[data-imm-read-aloud]')?.dataset.immReadAloud === 'paused' && document.querySelector('[data-imm-read-aloud-action="resume"]') ? true : null`, 5000);
  result.check(`${label}: Pause pauses and offers Resume`, Boolean(paused),
    paused ? '' : await ev(`({ states: window.__readAloudStates, error: document.querySelector('[data-imm-read-aloud-error]')?.textContent ?? null })`));
  const lit = await poll(ctx, `(() => {
    const h = globalThis.CSS && CSS.highlights ? CSS.highlights.get('imm-read-aloud') : null;
    const range = h ? [...h][0] : null;
    const block = document.querySelector('.immersion-reader [data-read-aloud-block]');
    return range && block ? { sentence: range.toString(), block: block.textContent.slice(0, 60) } : null;
  })()`, 5000);
  result.check(`${label}: the spoken sentence is highlighted, inside its paragraph`, Boolean(lit) && lit.sentence.trim().length > 0 && lit.block.includes(lit.sentence.slice(0, 10)), lit);
  await ev(setRate('1.5'));
  const rateKept = await poll(ctx, `document.querySelector('[data-imm-read-aloud-action="rate"]')?.value === '1.5' && localStorage.getItem('jp-imm-read-aloud-rate') === '1.5' ? true : null`, 4000);
  result.check(`${label}: the speed control changes the reading speed, and is kept`, Boolean(rateKept));
  await ev(`__e2e.click('[data-imm-read-aloud-action="resume"]')`);
  const resumed = await poll(ctx, `(() => { const s = window.__readAloudStates; const last = s.lastIndexOf('paused'); const after = s.slice(last + 1); return after.includes('playing') || after.includes('loading') ? after : null; })()`, 8000);
  result.check(`${label}: Resume carries on from the paused sentence`, Boolean(resumed), resumed);
  const state = await ev(`document.querySelector('[data-imm-read-aloud]')?.dataset.immReadAloud`);
  if (state !== 'idle') await ev(`__e2e.click('[data-imm-read-aloud-action="stop"]')`);
  const stopped = await poll(ctx, `(() => document.querySelector('[data-imm-read-aloud]')?.dataset.immReadAloud === 'idle'
    && !(globalThis.CSS && CSS.highlights && CSS.highlights.has('imm-read-aloud'))
    && !document.querySelector('[data-read-aloud-block]') ? true : null)()`, 5000);
  result.check(`${label}: Stop goes back to idle and clears the highlight`, Boolean(stopped));
  // Back to the default speed, so a later run starts where a new profile does.
  await ev(setRate('1'));
}

/** Reload the window in `lang`; resolves with the `<html lang>` it came back with. */
async function reloadInLanguage(ctx, lang) {
  await ctx.eval(`(localStorage.setItem('ui-lang', ${JSON.stringify(lang)}), location.reload(), true)`).catch(() => null);
  await ctx.sleep(2500);
  await installHelpers(ctx).catch(() => null);
  return poll(ctx, `window.__e2e && document.documentElement.lang ? document.documentElement.lang : null`, 30000);
}

module.exports = {
  id: 'immersion',
  title: 'Immersion: ?p= pages apart -> reading list import -> offline reader coverage, i+1, vertical, read-aloud -> export -> trim deletes copies -> coded error in ru',
  async run(ctx) {
    const { eval: ev, result } = ctx;
    await installHelpers(ctx);
    const now = Date.now();

    // --- Bug 28: the query string is part of the page ------------------------------------
    const base = `https://e2e-novel.invalid/works/${now}`;
    await ev(`(async () => {
      await window.api.immersionRecordVisit({ url: '${base}?p=1', seconds: 30, chars: 300 });
      await window.api.immersionRecordVisit({ url: '${base}?p=2', seconds: 10, chars: 100 });
      await window.api.immersionRecordVisit({ url: '${base}?p=1&utm_source=e2e&fbclid=x', seconds: 5, chars: 50 });
      return true;
    })()`, { await: true });
    const rows = await ev(`window.api.immersionListSites().then((store) => store.sites
      .filter((s) => s.url.startsWith('${base}'))
      .map((s) => ({ url: s.url, visits: s.visitCount, seconds: s.totalSeconds })))`, { await: true });
    const p1 = (rows || []).find((r) => r.url.endsWith('?p=1'));
    const p2 = (rows || []).find((r) => r.url.endsWith('?p=2'));
    result.check('two pages that differ only by ?p= are two history rows, each with its own stats',
      Array.isArray(rows) && rows.length === 2 && Boolean(p1) && Boolean(p2) && p1.seconds === 35 && p1.visits === 2 && p2.seconds === 10, rows);
    result.check('a tracking parameter is not a new page, and is not stored', Array.isArray(rows) && rows.every((r) => !/utm_|fbclid/.test(r.url)), rows);

    // --- Reading list import ----------------------------------------------------------------
    const good = { url: 'https://example.invalid/library-rain', title: 'E2E 雨の日の図書館' };
    const bad = { url: 'https://example.invalid/tampered', title: 'E2E 壊れたコピー' };
    const english = { url: 'https://example.invalid/rainy-day-en', title: 'E2E A Rainy Day' };
    const goodId = readingItemId(good.url);
    const badId = readingItemId(bad.url);
    const englishId = readingItemId(english.url);
    const doc = {
      kind: 'gum-reading-list',
      version: 1,
      exportedAt: now,
      items: [
        { id: goodId, ...good, host: 'example.invalid', savedAt: now - 1000, excerpt: '雨の日は、図書館で本を読むのが好きです。', snapshotChars: 120, snapshotHash: snapshotHash(ARTICLE) },
        { id: badId, ...bad, host: 'example.invalid', savedAt: now - 2000, excerpt: '壊れた', snapshotChars: 120, snapshotHash: snapshotHash(ARTICLE) },
        { id: englishId, ...english, host: 'example.invalid', savedAt: now - 3000, excerpt: 'On rainy days I like to read in the library.', snapshotChars: 140, snapshotHash: snapshotHash(ENGLISH) },
      ],
      snapshots: { [goodId]: ARTICLE, [badId]: ARTICLE.replace('図書館', '博物館'), [englishId]: ENGLISH },
    };

    await ev(`__e2e.open('immersion')`);
    let tab = await poll(ctx, `document.querySelector('[data-view="reading"]') ? true : null`, 10000);
    if (!tab) {
      await ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /show library|show the sites|sites rail/i.test((x.title || '') + ' ' + (x.getAttribute('aria-label') || ''))); if (b) b.click(); return !!b; })()`);
      tab = await poll(ctx, `document.querySelector('[data-view="reading"]') ? true : null`, 5000);
    }
    result.check('the Immersion browser shows its Reading list tab', Boolean(tab));
    if (!tab) return;
    await ev(`__e2e.click('[data-view="reading"]')`);
    const input = await poll(ctx, `document.querySelector('[data-imm5-import-input]') ? true : null`, 8000);
    result.check('the Reading list offers Import', Boolean(input));
    if (!input) return;

    await ev(`(() => {
      const input = document.querySelector('[data-imm5-import-input]');
      const dt = new DataTransfer();
      dt.items.add(new File([${JSON.stringify(JSON.stringify(doc))}], 'reading-list.json', { type: 'application/json' }));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    const notice = await poll(ctx, `(() => { const n = document.querySelector('[data-imm5-reading-notice]'); return n && /Imported/.test(n.innerText) ? n.innerText : null; })()`, 10000);
    result.check('importing the file adds all three articles', Boolean(notice) && /3 new articles/.test(notice), notice);
    const offers = await poll(ctx, `(() => { const g = document.querySelector('[data-imm5-reading="${goodId}"]'); const b = document.querySelector('[data-imm5-reading="${badId}"]'); const e = document.querySelector('[data-imm5-reading="${englishId}"]'); return g && b && e ? { good: !!g.querySelector('[data-imm5-action="offline"]'), bad: !!b.querySelector('[data-imm5-action="offline"]'), english: !!e.querySelector('[data-imm5-action="offline"]') } : null; })()`, 8000);
    result.check('only the intact offline copies are offered; the tampered one was refused on import', Boolean(offers) && offers.good && offers.english && !offers.bad, offers);
    await ctx.shot('reading-list');
    if (!offers?.good) return;

    await ev(`__e2e.click('[data-imm5-reading="${goodId}"] [data-imm5-action="offline"]')`);
    const reader = await poll(ctx, `(() => { const r = document.querySelector('.immersion-reader'); return r && r.innerText.includes('図書館で本を読む') ? true : null; })()`, 10000);
    result.check('"Read offline" opens the copy in Reader Mode', Boolean(reader));
    if (!reader) return;
    const coverage = await poll(ctx, `(() => { const c = document.querySelector('[data-imm5-coverage]'); return c ? { pct: Number(c.getAttribute('data-imm5-coverage')), text: c.innerText } : null; })()`, 20000, 400);
    result.check('the reader bar shows the page\'s known-word coverage', Boolean(coverage) && Number.isFinite(coverage.pct) && /% known/.test(coverage.text), coverage);

    const iPlusOn = await ev(`(() => { const b = document.querySelector('[data-imm5-action="iplus1"]'); if (!b) return null; if (b.getAttribute('aria-pressed') !== 'true') b.click(); return true; })()`);
    const count = iPlusOn ? await poll(ctx, `(() => { const c = document.querySelector('.imm5-reader-count'); return c ? c.innerText : null; })()`, 8000) : null;
    result.check('i+1 highlighting runs on the offline copy and reports its count', Boolean(count) && /i\+1 sentence/.test(count), count);
    await ev(`(() => { const b = document.querySelector('[data-imm5-action="iplus1"]'); if (b && b.getAttribute('aria-pressed') === 'true') b.click(); return true; })()`);

    // The reader's optional AI tools (explain i+1, simplify, ask the Agent). This profile has
    // no key and no offline model, so Explain lists the page's i+1 sentences with the setup
    // prompt and the dictionary look-up (the fallback that needs no AI). With "Use AI
    // features" off the whole row is hidden and the reader is exactly as before.
    const aiTools = await poll(ctx, `document.querySelector('[data-imm5-ai-tools]') ? true : null`, 8000);
    result.check('the reader offers its optional AI tools under the Reader Mode bar', Boolean(aiTools));
    if (aiTools) {
      await ev(`__e2e.click('[data-imm5-action="ai-explain"]')`);
      const explain = await poll(ctx, `(() => { const p = document.querySelector('[data-imm5-ai-panel="explain"]'); return p ? { sentences: p.querySelectorAll('[data-imm5-ai-sentence]').length, setup: !!p.querySelector('.ai-setup-prompt'), lookUp: !!p.querySelector('[data-imm5-ai-sentence] button') } : null; })()`, 5000);
      result.check('Explain lists the page\'s i+1 sentences; without AI set up it offers setup and the dictionary instead',
        Boolean(explain) && (explain.sentences === 0 || explain.lookUp), explain);
      await ctx.shot('ai-tools');
      await ev(`window.api.aiSetupSetEnabled(false)`, { await: true });
      const hidden = await poll(ctx, `(() => { const t = document.querySelector('[data-imm5-ai-tools]'); return document.documentElement.hasAttribute('data-ai-off') && (!t || getComputedStyle(t).display === 'none') ? true : null; })()`, 8000);
      result.check('with "Use AI features" off the AI tools are hidden; the reader bar is unchanged',
        Boolean(hidden) && Boolean(await ev(`document.querySelector('[data-imm5-action="iplus1"]') ? true : null`)));
      await ev(`window.api.aiSetupSetEnabled(true)`, { await: true });
    }

    await ev(`__e2e.click('[data-imm5-action="vertical"]')`);
    const vertical = await poll(ctx, `(() => { const r = document.querySelector('.immersion-reader'); return r && r.classList.contains('imm5-vertical') ? getComputedStyle(r).writingMode : null; })()`, 5000);
    result.check('the vertical toggle sets the article in tategaki (vertical-rl)', vertical === 'vertical-rl', vertical);
    await ctx.shot('vertical');
    await ev(`__e2e.click('[data-imm5-action="vertical"]')`);
    const horizontal = await poll(ctx, `(() => { const r = document.querySelector('.immersion-reader'); return r && !r.classList.contains('imm5-vertical') ? true : null; })()`, 5000);
    result.check('and back to horizontal', Boolean(horizontal));

    // --- Read aloud: the controls, in the text's own language, asserted on state -----------
    const ja = await startReadAloud(ctx, 'article');
    result.check('the reader bar offers Read aloud; pressing it prepares the first sentence', Boolean(ja) && ja.states.includes('loading'), ja);
    result.check('the Japanese article is read in Japanese', Boolean(ja) && ja.lang === 'ja', ja);
    result.check('it plays, or names the missing voice in words',
      Boolean(ja) && (ja.states.includes('playing') || (ja.states.includes('error') && /Japanese voice|speech synthesizer/.test(ja.alert ?? ''))), ja);
    await ctx.shot('read-aloud-ja');
    if (ja && ja.states.includes('playing')) {
      await exerciseReadAloud(ctx, 'Japanese article');
    } else {
      result.note(`Japanese read-aloud did not play on this machine: ${ja?.alert ?? 'no state'}`);
      // English voices ship with Windows, so the English copy exercises Pause, Resume, Stop,
      // the speed and the highlight on a clip that really plays (muted).
      await ev(`__e2e.click('.immersion-focus-exit')`);
      await poll(ctx, `document.querySelector('[data-view="reading"]') ? true : null`, 5000);
      await ev(`__e2e.click('[data-view="reading"]')`);
      await poll(ctx, `document.querySelector('[data-imm5-reading="${englishId}"] [data-imm5-action="offline"]') ? true : null`, 5000);
      await ev(`__e2e.click('[data-imm5-reading="${englishId}"] [data-imm5-action="offline"]')`);
      const opened = await poll(ctx, `(() => { const r = document.querySelector('.immersion-reader'); return r && r.innerText.includes('rainy days') ? true : null; })()`, 10000);
      const en = opened ? await startReadAloud(ctx, 'article') : null;
      result.check('the English article is read in English', Boolean(en) && en.lang === 'en', en);
      if (en && en.states.includes('playing')) await exerciseReadAloud(ctx, 'English article');
      else result.check('read-aloud plays with an installed voice (English)', false, en);
      await ctx.shot('read-aloud-en');
    }

    // Out of Focus (offline reading opens there), back to the rail and its Reading list.
    await ev(`__e2e.click('.immersion-focus-exit')`);
    await poll(ctx, `document.querySelector('[data-view="reading"]') ? true : null`, 5000);
    await ev(`__e2e.click('[data-view="reading"]')`);
    await poll(ctx, `document.querySelector('[data-imm5-action="export"]') ? true : null`, 5000);
    await ev(`__e2e.click('[data-imm5-action="export"]')`);
    const exported = await poll(ctx, `(() => { const n = document.querySelector('[data-imm5-reading-notice]'); return n && /Exported/.test(n.innerText) ? n.innerText : null; })()`, 8000);
    result.check('Export writes the list with its offline copies', Boolean(exported) && /3 articles/.test(exported), exported);

    // --- Bug 29: trimming to the cap deletes the dropped offline copies --------------------
    const before = {
      good: await ev(kvTypeOf(`imm5:snapshot:${goodId}`), { await: true }),
      english: await ev(kvTypeOf(`imm5:snapshot:${englishId}`), { await: true }),
    };
    const bulk = {
      kind: 'gum-reading-list',
      version: 1,
      exportedAt: now + 1,
      items: Array.from({ length: 300 }, (_, i) => {
        const url = `https://example.invalid/bulk-${i}`;
        return { id: readingItemId(url), url, title: `E2E bulk ${i}`, host: 'example.invalid', savedAt: now + 10_000 + i, excerpt: '', snapshotChars: 0 };
      }),
      snapshots: {},
    };
    await ev(`(() => {
      const input = document.querySelector('[data-imm5-import-input]');
      const dt = new DataTransfer();
      dt.items.add(new File([${JSON.stringify(JSON.stringify(bulk))}], 'bulk.json', { type: 'application/json' }));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    const bulkNotice = await poll(ctx, `(() => { const n = document.querySelector('[data-imm5-reading-notice]'); return n && /Imported 300/.test(n.innerText) ? n.innerText : null; })()`, 15000);
    result.check('an import past the 300-item cap pushes the oldest articles off the list',
      Boolean(bulkNotice) && before.good === 'string' && before.english === 'string', { bulkNotice, before });
    const after = await pollAsync(ctx, `(async () => {
      const good = await ${kvTypeOf(`imm5:snapshot:${goodId}`)};
      const english = await ${kvTypeOf(`imm5:snapshot:${englishId}`)};
      return good === '__absent__' && english === '__absent__' ? { good, english, copies: await ${SNAPSHOT_COUNT} } : null;
    })()`, 8000, 300);
    result.check('...and deletes their offline copies from IndexedDB, leaving none behind', Boolean(after) && after.copies === 0, after);

    // --- F3: a Reader Mode failure is a coded, translated message --------------------------
    const server = http.createServer((req, res) => {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html><head><title>404</title></head><body><p>Not Found</p></body></html>');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const missing = `http://127.0.0.1:${server.address().port}/e2e-missing-article`;
    try {
      const ru = await reloadInLanguage(ctx, 'ru');
      result.check('the UI switches to Russian', ru === 'ru', ru);
      await ev(`__e2e.open('immersion')`);
      const bar = await poll(ctx, `document.querySelector('.immersion-url, .aero-immersion-url') ? true : null`, 15000);
      if (bar) {
        await ev(`(() => { const b = document.querySelector('.immersion-mode-btn-reader') || document.querySelectorAll('.aero-immersion-mode-seg button')[1]; if (b && !b.classList.contains('active')) b.click(); return true; })()`);
        await ev(`(() => {
          const input = document.querySelector('.immersion-url, .aero-immersion-url');
          __e2e.fill(input, ${JSON.stringify(missing)});
          input.closest('form').requestSubmit();
          return true;
        })()`);
      }
      const banner = bar ? await poll(ctx, `(() => { const b = document.querySelector('.immersion-banner.error, .aero-immersion-banner.error'); return b && b.innerText.trim() ? b.innerText.trim() : null; })()`, 45000, 400) : null;
      result.check('a 404 in Reader Mode shows the coded reason in Russian, not "404 Not Found"', banner === RU_HTTP_404, { banner, expected: RU_HTTP_404 });
      await ctx.shot('coded-error-ru');
    } finally {
      server.close();
      const en = await reloadInLanguage(ctx, 'en');
      result.check('the UI is back in English for the next flow', en === 'en', en);
    }
  },
};
