// @vitest-environment jsdom
/**
 * Reader Mode extraction against saved Japanese page layouts (written for the
 * test, shaped like the real sites): NHK NEWS WEB, NEWS WEB EASY (ruby on every
 * kanji), Aozora Bunko (one div of <br> lines, ruby with rb/rp, a colophon),
 * an Ameba blog (a div per line) and a note.com article. Each must come out as
 * its article — title, first and last paragraph, furigana intact — without the
 * navigation, promos, related lists, rankings and footers around it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractReadableArticleFromHtml } from '../readabilityArticle';

const FIXTURES = path.join(__dirname, 'fixtures', 'reader');

async function extract(name: string, url: string) {
  const html = fs.readFileSync(path.join(FIXTURES, name), 'utf8');
  const article = await extractReadableArticleFromHtml(html, url);
  const holder = document.createElement('div');
  holder.innerHTML = article.html;
  const withoutRuby = holder.cloneNode(true) as HTMLElement;
  withoutRuby.querySelectorAll('rt, rp').forEach((el) => el.remove());
  return {
    article,
    holder,
    text: (withoutRuby.textContent ?? '').replace(/\s+/g, ''),
  };
}

function expectAbsent(text: string, junk: readonly string[]): void {
  for (const piece of junk) expect(text, `should not contain ${piece}`).not.toContain(piece);
}

describe('reader extraction on Japanese layouts', () => {
  it('NHK NEWS WEB: the article without tags, 注目ワード, related news or the ranking', async () => {
    const { article, text } = await extract('nhk-news.html', 'https://www3.nhk.or.jp/news/html/20260703/k10000000001000.html');
    expect(article.title).toContain('各地で記録的な大雨');
    expect(text).toContain('西日本を中心に記録的な大雨となり');
    expect(text).toContain('広島県では1時間に80ミリを超える猛烈な雨が観測され');
    expect(text).toContain('低い土地の浸水や川の増水に警戒するよう呼びかけています。');
    expectAbsent(text, ['注目ワード', '円相場', '関連ニュース', '台風5号沖縄に接近', 'アクセスランキング', 'Copyright', 'ビジネス']);
  });

  it('NEWS WEB EASY: every paragraph, with its furigana', async () => {
    const { article, holder, text } = await extract('nhk-easy.html', 'https://www3.nhk.or.jp/news/easy/k10000000001000/k10000000001000.html');
    expect(article.title).toContain('どこへ');
    expect(text).toContain('今年の夏、旅行に行く人が増えそうです。');
    expect(text).toContain('早めに予約したほうがいいと話しています。');
    expect(holder.querySelectorAll('ruby rt').length).toBeGreaterThanOrEqual(10);
    expectAbsent(text, ['ほかのニュース', 'パンダの', 'ふりがなをけす', 'このサイトについて']);
  });

  it('Aozora Bunko: the whole text with its ruby, without the colophon', async () => {
    const { article, holder, text } = await extract('aozora.html', 'https://www.aozora.gr.jp/cards/000148/files/789_14547.html');
    expect(article.title).toContain('吾輩は猫である');
    expect(text).toContain('吾輩は猫である。名前はまだ無い。');
    expect(text).toContain('フワフワした感じがあったばかりである。');
    const rts = [...holder.querySelectorAll('rt')].map((rt) => rt.textContent);
    expect(rts).toContain('わがはい');
    // The <br> lines survive as lines, so sentences and i+1 still see the breaks.
    expect(holder.querySelectorAll('br').length).toBeGreaterThanOrEqual(4);
    expectAbsent(text, ['底本', '入力：', '青空文庫作成ファイル']);
  });

  it('Ameba blog: the entry body, not the sidebar, reblog/like buttons or related entries', async () => {
    const { article, text } = await extract('ameblo.html', 'https://ameblo.jp/yurutto/entry-12800000000.html');
    expect(article.title).toContain('週末のパン作り');
    expect(text).toContain('今日は久しぶりにパンを焼きました。');
    expect(text).toContain('コメントで教えてください。');
    expectAbsent(text, ['リブログ', 'いいね！', '関連記事', '先週のカレー', 'プロフィール', 'ブログを始める', 'CyberAgent']);
  });

  it('puts back a short Japanese lead paragraph that sits beside the body', async () => {
    const body = Array.from({ length: 5 }, (_, i) => `<p>本文の第${i + 1}段落です。今日も各地で雨が降り、川の水位が上がっていると伝えられています。</p>`).join('');
    const html = `<html><head><title>見出し</title></head><body><main><div class="wrap"><div class="box"><h1>見出し</h1></div>
      <div class="detail"><p class="lead">短いリード文です。</p><div class="body-text">${body}</div></div></div></main></body></html>`;
    const article = await extractReadableArticleFromHtml(html, 'https://example.jp/news/1');
    const text = article.html.replace(/<[^>]+>/g, '').replace(/\s+/g, '');
    expect(text).toContain('本文の第1段落です。');
    // Under 15 characters: too short to be trusted as a lead, so it stays out.
    expect(text).not.toContain('短いリード文です。');
  });

  it('note: the article with its heading and figure, not the support box or recommendations', async () => {
    const { article, holder, text } = await extract('note.html', 'https://note.com/hanako/n/n0000000000');
    expect(article.title).toContain('独学で日本語を一年勉強して分かったこと');
    expect(text).toContain('ちょうど一年がたちました。');
    expect(text).toContain('毎日続けたこと');
    expect(text).toContain('楽しく続けることをおすすめします。');
    expect(holder.querySelector('img')).not.toBeNull();
    expectAbsent(text, ['サポートをしてみませんか', 'おすすめ記事', '在宅ワークのコツ', '利用規約', '会員登録']);
  });
});
