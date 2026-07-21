import { describe, expect, it } from 'vitest';
import {
  classifyMineSelection,
  contentCategoryLabel,
  detectArticleSubtype,
  detectContentCategory,
  detectPageKind,
  extractMineTerm,
  parseYoutubeVideoId,
  primaryCaptureAction,
} from '../extensionCapture';

describe('extensionCapture', () => {
  it('detects YouTube playlist vs video vs article', () => {
    expect(detectPageKind('https://www.youtube.com/playlist?list=PLabc123')).toBe('youtube-playlist');
    expect(detectPageKind('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube-video');
    expect(detectPageKind('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc')).toBe('youtube-video');
    expect(detectPageKind('https://youtu.be/dQw4w9WgXcQ')).toBe('youtube-video');
    expect(detectPageKind('https://syosetu.com/n1234/1/')).toBe('article');
  });

  it('detects content categories (heuristic)', () => {
    expect(detectContentCategory('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube');
    expect(detectContentCategory('https://www.nhk.or.jp/news/html/20240101/k100.html')).toBe('news');
    expect(detectContentCategory('https://www.asahi.com/articles/x')).toBe('news');
    expect(detectContentCategory('https://syosetu.com/n1234/1/')).toBe('novel');
    expect(detectContentCategory('https://kakuyomu.jp/works/117735405488123')).toBe('novel');
    expect(
      detectContentCategory('https://example.com/reader', { title: 'One Piece 漫画' }),
    ).toBe('manga');
    expect(detectContentCategory('https://comic-days.com/episode/123')).toBe('manga');
    expect(detectContentCategory('https://www.webtoons.com/en/comedy/x/list')).toBe('manga');
    expect(detectContentCategory('https://mangadex.org/chapter/abc')).toBe('manga');
    expect(detectContentCategory('https://example.com/webtoon/episode/1')).toBe('manga');
    expect(detectContentCategory('https://example.com/page')).toBe('other');
    expect(
      detectContentCategory('https://note.com/user/n/abc', {
        html: '<meta property="og:type" content="article">',
      }),
    ).toBe('article');
  });

  it('labels categories for FAB chrome', () => {
    expect(contentCategoryLabel('news')).toBe('News');
    expect(contentCategoryLabel('youtube')).toBe('YouTube');
  });

  it('detects article subtypes from meta / host', () => {
    expect(
      detectArticleSubtype(
        '<meta property="og:type" content="article"><script type="application/ld+json">{"@type":"NewsArticle"}</script>',
        'https://www.asahi.com/articles/x',
      ),
    ).toBe('news');
    expect(
      detectArticleSubtype('<meta property="og:type" content="article">', 'https://note.com/user/n/abc'),
    ).toBe('blog');
    expect(detectArticleSubtype('<html></html>', 'https://example.com/page')).toBe('other');
  });

  it('maps page kind to primary capture action', () => {
    expect(primaryCaptureAction('youtube-playlist')).toBe('playlist');
    expect(primaryCaptureAction('youtube-video')).toBe('video');
    expect(primaryCaptureAction('article')).toBe('inbox');
  });

  it('parses youtube video ids', () => {
    expect(parseYoutubeVideoId('https://www.youtube.com/watch?v=abcdef12345')).toBe('abcdef12345');
    expect(parseYoutubeVideoId('https://youtu.be/abcdef12345')).toBe('abcdef12345');
    expect(parseYoutubeVideoId('https://www.youtube.com/shorts/abcdef12345')).toBe('abcdef12345');
  });

  it('classifies word vs sentence selections', () => {
    expect(classifyMineSelection('食べる')).toBe('word');
    expect(classifyMineSelection('美味しい')).toBe('word');
    expect(classifyMineSelection('今日はいい天気ですね。')).toBe('sentence');
    expect(classifyMineSelection('This is a longer English sentence')).toBe('sentence');
    expect(classifyMineSelection('hello')).toBe('word');
  });

  it('extracts mine terms', () => {
    expect(extractMineTerm('食べる', 'word')).toBe('食べる');
    expect(extractMineTerm('今日はいい天気ですね。', 'sentence')).toBe('今日はいい天気ですね');
  });
});
