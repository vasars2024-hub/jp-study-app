import { describe, expect, it } from 'vitest';
import {
  hasAgentMarkdown,
  parseAgentMarkdown,
  parseAgentMarkdownSpans,
  type AgentMarkdownSpan,
} from '../agentMarkdown';

/** Flattens spans to `kind:text` pairs so a case reads as what a user sees. */
const flat = (spans: AgentMarkdownSpan[]): string[] => spans.map((s) => `${s.kind}:${s.text}`);

describe('parseAgentMarkdownSpans', () => {
  it('lifts bold, italic and code out of a line', () => {
    expect(flat(parseAgentMarkdownSpans('a **b** c *d* e `f` g'))).toEqual([
      'text:a ',
      'bold:b',
      'text: c ',
      'italic:d',
      'text: e ',
      'code:f',
      'text: g',
    ]);
  });

  it('keeps the exact answer this defect was found on', () => {
    // The literal first line of the local Qwen answer that produced D391.
    const line = 'The Japanese verb **「食べる」** means **"to eat"**.';
    expect(flat(parseAgentMarkdownSpans(line))).toEqual([
      'text:The Japanese verb ',
      'bold:「食べる」',
      'text: means ',
      'bold:"to eat"',
      'text:.',
    ]);
    // The point of the whole change: no asterisk survives into what is read.
    expect(parseAgentMarkdownSpans(line).map((s) => s.text).join('')).not.toContain('*');
  });

  it('leaves an unclosed delimiter literal, because answers render while they stream', () => {
    expect(flat(parseAgentMarkdownSpans('half a **bold'))).toEqual(['text:half a **bold']);
    expect(flat(parseAgentMarkdownSpans('open `code'))).toEqual(['text:open `code']);
  });

  it('leaves arithmetic and identifiers alone', () => {
    expect(flat(parseAgentMarkdownSpans('2 * 3 * 4'))).toEqual(['text:2 * 3 * 4']);
    expect(flat(parseAgentMarkdownSpans('some_var_name here'))).toEqual(['text:some_var_name here']);
  });

  it('renders a link as label plus bare URL, never an anchor', () => {
    const spans = parseAgentMarkdownSpans('see [the docs](https://example.test/a) now');
    expect(flat(spans)).toEqual(['text:see the docs (https://example.test/a) now']);
    expect(spans.every((s) => s.kind === 'text')).toBe(true);
  });
});

describe('parseAgentMarkdown', () => {
  it('splits paragraphs, a bullet list and an ordered list', () => {
    const blocks = parseAgentMarkdown('Intro line\n\n- one\n- two\n\n1. first\n2. second');
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'list', 'list']);
    const bullets = blocks[1];
    const ordered = blocks[2];
    if (bullets.kind !== 'list' || ordered.kind !== 'list') throw new Error('shape');
    expect(bullets.ordered).toBe(false);
    expect(bullets.items.map((i) => i[0].text)).toEqual(['one', 'two']);
    expect(ordered.ordered).toBe(true);
    expect(ordered.items.map((i) => i[0].text)).toEqual(['first', 'second']);
  });

  it('reads a heading without emitting a document-outline level', () => {
    const blocks = parseAgentMarkdown('### Other forms\ntext');
    expect(blocks[0]).toEqual({
      kind: 'heading',
      level: 3,
      spans: [{ kind: 'text', text: 'Other forms' }],
    });
  });

  it('keeps a fenced code block verbatim, including its blank lines', () => {
    const blocks = parseAgentMarkdown('before\n\n```ts\nconst a = 1;\n\nconst b = 2;\n```\nafter');
    const code = blocks.find((b) => b.kind === 'code');
    if (!code || code.kind !== 'code') throw new Error('no code block');
    expect(code.language).toBe('ts');
    expect(code.text).toBe('const a = 1;\n\nconst b = 2;');
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'code', 'paragraph']);
  });

  it('keeps an unterminated fence as code, because that is a streaming answer', () => {
    const blocks = parseAgentMarkdown('```\npartial');
    expect(blocks).toEqual([{ kind: 'code', text: 'partial', language: '' }]);
  });

  it('never loses text: every non-empty input yields at least one block', () => {
    for (const sample of ['   x   ', '***', '- ', '#', '`']) {
      expect(parseAgentMarkdown(sample).length).toBeGreaterThan(0);
    }
    expect(parseAgentMarkdown('')).toEqual([]);
    expect(parseAgentMarkdown('   \n  ')).toEqual([]);
  });

  it('produces no field that could be handed to innerHTML', () => {
    const blocks = parseAgentMarkdown('**a** <img src=x onerror=alert(1)>\n- <b>b</b>');
    const texts: string[] = [];
    for (const block of blocks) {
      if (block.kind === 'code') texts.push(block.text);
      else if (block.kind === 'list') for (const item of block.items) for (const s of item) texts.push(s.text);
      else for (const s of block.spans) texts.push(s.text);
    }
    // The angle brackets survive as *text*, which is the guarantee: they are
    // rendered as characters by React, never parsed as markup.
    expect(texts.join(' ')).toContain('<img src=x onerror=alert(1)>');
    expect(texts.join(' ')).toContain('<b>b</b>');
  });
});

describe('hasAgentMarkdown', () => {
  it('is false for the plain answers that must keep their single paragraph', () => {
    expect(hasAgentMarkdown('Just a sentence with no markup at all.')).toBe(false);
    expect(hasAgentMarkdown('昨日寿司を食べました。')).toBe(false);
    expect(hasAgentMarkdown('')).toBe(false);
  });

  it('is true for each construct the renderer can show', () => {
    expect(hasAgentMarkdown('a **b**')).toBe(true);
    expect(hasAgentMarkdown('a `b`')).toBe(true);
    expect(hasAgentMarkdown('- item')).toBe(true);
    expect(hasAgentMarkdown('1. item')).toBe(true);
    expect(hasAgentMarkdown('## head')).toBe(true);
    expect(hasAgentMarkdown('[x](y)')).toBe(true);
  });
});
