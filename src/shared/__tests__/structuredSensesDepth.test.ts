// @vitest-environment node
/**
 * risk4: structured content from an imported dictionary is untrusted input. A
 * pathologically deep tree used to recurse until the stack overflowed in the
 * process parsing it; every walk is now bounded by MAX_STRUCTURED_DEPTH.
 */
import { describe, expect, it } from 'vitest';
import { extractStructuredSenses, MAX_STRUCTURED_DEPTH } from '../structuredSenses';

function nest(depth: number, leaf: unknown): unknown {
  let node: unknown = leaf;
  for (let i = 0; i < depth; i += 1) node = { tag: 'span', content: [node] };
  return node;
}

const sense = (inner: unknown) => ({
  tag: 'div',
  data: { content: 'sense' },
  content: [
    { tag: 'span', data: { content: 'part-of-speech-info', code: 'n' }, content: 'noun' },
    { tag: 'ul', data: { content: 'glossary' }, content: [{ tag: 'li', content: inner }] },
  ],
});

describe('structured senses: recursion depth', () => {
  it('a normal sense still parses', () => {
    const out = extractStructuredSenses(sense('cat'));
    expect(out).toEqual([expect.objectContaining({ partsOfSpeech: ['n'], definitions: ['cat'] })]);
  });

  it('a 100k-deep tree does not overflow the stack', () => {
    const deep = nest(100_000, 'bottom');
    expect(() => extractStructuredSenses(sense(deep))).not.toThrow();
    expect(() => extractStructuredSenses(deep)).not.toThrow();
    expect(extractStructuredSenses(deep)).toBeNull();
  });

  it('text deeper than the limit is left out, text within it is kept', () => {
    const shallow = extractStructuredSenses(sense(nest(10, 'kept')));
    expect(shallow?.[0]?.definitions).toEqual(['kept']);
    const tooDeep = extractStructuredSenses(sense(nest(MAX_STRUCTURED_DEPTH * 2, 'dropped')));
    expect(JSON.stringify(tooDeep ?? [])).not.toContain('dropped');
  });
});
