// @vitest-environment node
/**
 * The release-notes Markdown subset (shared/releaseMarkdown.ts): what becomes
 * structure, what stays text (all HTML), and which links may be opened (this
 * project's GitHub pages only; everything else is shown as text with its address).
 */
import { describe, expect, it } from 'vitest';
import { isProjectGithubUrl, parseInline, parseReleaseMarkdown, type MdBlock, type MdInline } from '../releaseMarkdown';

const plain = (nodes: MdInline[]): string =>
  nodes.map((n) => (n.t === 'text' || n.t === 'code' ? n.v : n.t === 'br' ? '\n' : n.t === 'link' ? plain(n.c) : plain(n.c))).join('');

describe('links', () => {
  it('only https github.com pages of this project', () => {
    expect(isProjectGithubUrl('https://github.com/vasars2024-hub/jp-study-app/releases/tag/v1.0.2')).toBe(true);
    expect(isProjectGithubUrl('https://github.com/vasars2024-hub/jp-study-app')).toBe(true);
    expect(isProjectGithubUrl('https://GitHub.com/Vasars2024-hub/JP-study-app/issues/3')).toBe(true);
    expect(isProjectGithubUrl('http://github.com/vasars2024-hub/jp-study-app')).toBe(false);
    expect(isProjectGithubUrl('https://github.com/someone-else/jp-study-app')).toBe(false);
    expect(isProjectGithubUrl('https://github.com/vasars2024-hub/jp-study-app-evil')).toBe(false);
    expect(isProjectGithubUrl('https://github.com.evil.example/vasars2024-hub/jp-study-app')).toBe(false);
    expect(isProjectGithubUrl('https://user:pw@github.com/vasars2024-hub/jp-study-app')).toBe(false);
    expect(isProjectGithubUrl('javascript:alert(1)')).toBe(false);
    expect(isProjectGithubUrl('https://github.com:8443/vasars2024-hub/jp-study-app')).toBe(false);
  });

  it('an allowed link is a link; any other is its text plus the address, as text', () => {
    const ok = parseInline('[issue](https://github.com/vasars2024-hub/jp-study-app/issues/1)');
    expect(ok).toEqual([{ t: 'link', href: 'https://github.com/vasars2024-hub/jp-study-app/issues/1', c: [{ t: 'text', v: 'issue' }] }]);
    const other = parseInline('see [here](https://evil.example/x) now');
    expect(other.every((n) => n.t !== 'link')).toBe(true);
    expect(plain(other)).toBe('see here (https://evil.example/x) now');
    expect(parseInline('[x](javascript:alert(1))').some((n) => n.t === 'link')).toBe(false);
    // Bare and angle-bracket addresses follow the same rule.
    expect(parseInline('https://github.com/vasars2024-hub/jp-study-app/pull/9.')[0]).toMatchObject({ t: 'link', href: 'https://github.com/vasars2024-hub/jp-study-app/pull/9' });
    expect(parseInline('<https://evil.example/a>').some((n) => n.t === 'link')).toBe(false);
  });
});

describe('inline', () => {
  it('bold, italic, code; snake_case and lone stars stay text', () => {
    expect(parseInline('**bold** and *it* and `a<b>`')).toEqual([
      { t: 'strong', c: [{ t: 'text', v: 'bold' }] },
      { t: 'text', v: ' and ' },
      { t: 'em', c: [{ t: 'text', v: 'it' }] },
      { t: 'text', v: ' and ' },
      { t: 'code', v: 'a<b>' },
    ]);
    expect(plain(parseInline('snake_case_name and 2 * 3 * 4'))).toBe('snake_case_name and 2 * 3 * 4');
    expect(parseInline('snake_case_name').every((n) => n.t === 'text')).toBe(true);
    expect(plain(parseInline('\\*not italic\\*'))).toBe('*not italic*');
    expect(plain(parseInline('**unclosed'))).toBe('**unclosed');
  });
});

describe('blocks', () => {
  it('headings, lists (one nested level), code, quotes, rules, paragraphs', () => {
    const blocks = parseReleaseMarkdown([
      '# Gum 1.1.0',
      '',
      'Intro line one',
      'line two',
      '',
      '## Fixes',
      '- first',
      '  - nested',
      '- second',
      '  continues',
      '',
      '3. three',
      '4. four',
      '',
      '```',
      '<b>raw</b>',
      '```',
      '> quoted',
      '---',
    ].join('\n'));
    expect(blocks.map((b) => b.t)).toEqual(['heading', 'paragraph', 'heading', 'list', 'list', 'code', 'quote', 'rule']);
    const list = blocks[3] as Extract<MdBlock, { t: 'list' }>;
    expect(list.ordered).toBe(false);
    expect(list.items.map((i) => plain(i.c))).toEqual(['first', 'second continues']);
    expect(list.items[0]!.sub?.items.map((i) => plain(i.c))).toEqual(['nested']);
    const ordered = blocks[4] as Extract<MdBlock, { t: 'list' }>;
    expect(ordered).toMatchObject({ ordered: true, start: 3 });
    expect(blocks[5]).toEqual({ t: 'code', v: '<b>raw</b>' });
    const para = blocks[1] as Extract<MdBlock, { t: 'paragraph' }>;
    expect(para.c.some((n) => n.t === 'br')).toBe(true);
  });

  it('HTML is text, never structure; comments are dropped', () => {
    const blocks = parseReleaseMarkdown('<script>alert("x")</script>\n<img src=x onerror="alert(1)">\n<!-- hidden -->');
    expect(blocks).toHaveLength(1);
    const text = plain((blocks[0] as Extract<MdBlock, { t: 'paragraph' }>).c);
    expect(text).toContain('<script>alert("x")</script>');
    expect(text).toContain('<img src=x onerror="alert(1)">');
    expect(text).not.toContain('hidden');
  });

  it('never throws on hostile input and stays fast on a long body', () => {
    const nasty = '*'.repeat(5000) + '_'.repeat(5000) + '['.repeat(2000) + '`'.repeat(3000);
    const t0 = Date.now();
    expect(() => parseReleaseMarkdown(nasty)).not.toThrow();
    expect(() => parseReleaseMarkdown('**'.repeat(4000))).not.toThrow();
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});
