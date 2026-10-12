'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Immersion reader, offline: a reading-list file (Gum's own export format, written here)
 * is imported through the Reading list's Import button — two articles, one with an intact
 * offline copy and one whose copy was tampered with. Only the intact copy is offered; it
 * opens in Reader Mode with no network at all, where the study tools run on it: known-word
 * coverage, i+1 sentences, and the vertical (tategaki) layout. Export then writes the list
 * back out. Nothing here loads a web page.
 */
const { installHelpers, poll } = require('./_lib.cjs');

const ARTICLE = [
  '<h1>雨の日の図書館</h1>',
  '<div class="reader-article" data-lookup-block="">',
  '<p>雨の日は、図書館で本を読むのが好きです。静かな部屋で、窓の外の雨の音を聞きます。</p>',
  '<p>「今日は何を読もうか。」と友達が言いました。私は日本の昔話を選びました。</p>',
  '<div class="main_text">昔、ある村に一人のおじいさんが住んでいました。<br />おじいさんは毎日山へ行きました。<br /></div>',
  '</div>',
].join('');

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

module.exports = {
  id: 'immersion',
  title: 'Immersion: reading list import -> verified offline copy -> reader coverage, i+1, vertical -> export',
  async run(ctx) {
    const { eval: ev, result } = ctx;
    await installHelpers(ctx);
    const now = Date.now();
    const good = { url: 'https://example.invalid/library-rain', title: 'E2E 雨の日の図書館' };
    const bad = { url: 'https://example.invalid/tampered', title: 'E2E 壊れたコピー' };
    const goodId = readingItemId(good.url);
    const badId = readingItemId(bad.url);
    const doc = {
      kind: 'gum-reading-list',
      version: 1,
      exportedAt: now,
      items: [
        { id: goodId, ...good, host: 'example.invalid', savedAt: now - 1000, excerpt: '雨の日は、図書館で本を読むのが好きです。', snapshotChars: 120, snapshotHash: snapshotHash(ARTICLE) },
        { id: badId, ...bad, host: 'example.invalid', savedAt: now - 2000, excerpt: '壊れた', snapshotChars: 120, snapshotHash: snapshotHash(ARTICLE) },
      ],
      snapshots: { [goodId]: ARTICLE, [badId]: ARTICLE.replace('図書館', '博物館') },
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
    result.check('importing the file adds both articles', Boolean(notice) && /2 new articles/.test(notice), notice);
    const offers = await poll(ctx, `(() => { const g = document.querySelector('[data-imm5-reading="${goodId}"]'); const b = document.querySelector('[data-imm5-reading="${badId}"]'); return g && b ? { good: !!g.querySelector('[data-imm5-action="offline"]'), bad: !!b.querySelector('[data-imm5-action="offline"]') } : null; })()`, 8000);
    result.check('only the intact offline copy is offered; the tampered one was refused on import', Boolean(offers) && offers.good && !offers.bad, offers);
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

    // Out of Focus (offline reading opens there), back to the rail and its Reading list.
    await ev(`__e2e.click('.immersion-focus-exit')`);
    await poll(ctx, `document.querySelector('[data-view="reading"]') ? true : null`, 5000);
    await ev(`__e2e.click('[data-view="reading"]')`);
    await poll(ctx, `document.querySelector('[data-imm5-action="export"]') ? true : null`, 5000);
    await ev(`__e2e.click('[data-imm5-action="export"]')`);
    const exported = await poll(ctx, `(() => { const n = document.querySelector('[data-imm5-reading-notice]'); return n && /Exported/.test(n.innerText) ? n.innerText : null; })()`, 8000);
    result.check('Export writes the list with its offline copies', Boolean(exported) && /2 articles/.test(exported), exported);
  },
};
