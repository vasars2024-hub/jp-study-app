import { describe, expect, it } from 'vitest';
import {
  buildNhkArticleHtml,
  isNhkNewsArticleUrl,
  markedBlocksToHtml,
  nhkArticleLooksHydrated,
} from '../nhkArticle';

describe('isNhkNewsArticleUrl', () => {
  it('detects news.web.nhk article pages', () => {
    expect(isNhkNewsArticleUrl('https://news.web.nhk/newsweb/na/na-k10015174811000')).toBe(true);
    expect(isNhkNewsArticleUrl('https://news.web.nhk/newsweb/na/na-k10015174811000?_reload=1')).toBe(true);
    expect(isNhkNewsArticleUrl('https://www.web.nhk/newsweb/na/na-k10015174811000')).toBe(true);
    expect(isNhkNewsArticleUrl('https://news.web.nhk/newsweb/')).toBe(false);
    expect(isNhkNewsArticleUrl('https://www3.nhk.or.jp/news/html/K10015174811/K10015174811.html')).toBe(false);
  });
});

describe('nhkArticleLooksHydrated', () => {
  it('requires section markers or long prose', () => {
    const teaser = 'イランの革命防衛隊は12日、ホルムズ海峡で船舶がイラン側が定める航路を通らなかったとして、警告射撃を行い、海峡を封鎖すると主張しました。';
    expect(nhkArticleLooksHydrated(teaser)).toBe(false);
    expect(nhkArticleLooksHydrated(`${teaser} イギリスの海事機関はホルムズ海峡のオマーンに近い海域で12日、コンテナ船が攻撃を受け`)).toBe(true);
  });
});

describe('markedBlocksToHtml', () => {
  it('renders paragraph and heading blocks', () => {
    const html = buildNhkArticleHtml(
      [
        { type: 'heading', depth: 2, children: [{ type: 'text', value: 'イランメディア' }] },
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'イランの複数のメディアは、南部で爆発があったと伝えています。' }],
        },
      ],
      [{ type: 'paragraph', children: [{ type: 'text', value: 'リード文です。' }] }],
    );
    expect(html).toContain('<p>リード文です。</p>');
    expect(html).toContain('<h2>イランメディア</h2>');
    expect(html).toContain('爆発があった');
    expect(markedBlocksToHtml(null)).toBe('');
  });
});