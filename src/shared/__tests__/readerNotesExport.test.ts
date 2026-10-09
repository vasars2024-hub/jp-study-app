import { describe, expect, it } from 'vitest';
import { readerNotesMarkdown } from '../readerNotesExport';

const headings = { bookmarks: 'Bookmarks', highlights: 'Highlights' };

describe('readerNotesMarkdown', () => {
  it('lists bookmarks by position and highlights by chapter, keeping the book text as written', () => {
    const md = readerNotesMarkdown({
      title: 'こころ',
      bookmarks: [
        { label: '先生と私', percent: 0.5, createdAt: 2 },
        { label: '冒頭', percent: 0.01, createdAt: 1 },
      ],
      highlights: [
        { text: '私はその人を常に先生と\n呼んでいた。', color: 'yellow', part: 0, createdAt: 5 },
        { text: '精神的に向上心のないものは馬鹿だ。', color: 'pink', part: 7, createdAt: 3 },
      ],
      chapterOf: (part) => (part < 5 ? '上 先生と私' : '下 先生と遺書'),
      headings,
    });
    expect(md).toBe([
      '# こころ',
      '',
      '## Bookmarks',
      '',
      '- 1% — 冒頭',
      '- 50% — 先生と私',
      '',
      '## Highlights',
      '',
      '### 上 先生と私',
      '',
      '> 私はその人を常に先生と 呼んでいた。',
      '',
      '### 下 先生と遺書',
      '',
      '> 精神的に向上心のないものは馬鹿だ。',
      '',
    ].join('\n'));
  });

  it('is empty when there is nothing to export, and escapes a line that would become a heading', () => {
    expect(readerNotesMarkdown({ title: 'x', bookmarks: [], highlights: [], headings })).toBe('');
    const md = readerNotesMarkdown({
      title: 'x',
      bookmarks: [{ label: '# not a heading', percent: 0, createdAt: 0 }],
      highlights: [],
      headings,
    });
    expect(md).toContain('- 0% — \\# not a heading');
  });
});
