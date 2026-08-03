import { describe, expect, it } from 'vitest';
import { normalizeAgentKnowledge, searchAgentKnowledge } from '../localAgentKnowledge';

describe('local agent knowledge index', () => {
  const records = [
    {
      id: 'anime-1', kind: 'media' as const, title: 'Everyday Japanese',
      content: 'A gentle slice of life anime with simple dialogue.',
      tags: ['slice of life'], metadata: { level: 'N3' }, updatedAt: 20,
    },
    {
      id: 'word-1', kind: 'vocabulary' as const, title: '勉強',
      content: 'べんきょう · study · 学習', tags: ['N3'], metadata: { level: 'N3' }, updatedAt: 30,
    },
  ];

  it('normalizes records with bounded fields and duplicate IDs', () => {
    expect(normalizeAgentKnowledge([...records, { ...records[0], content: 'duplicate' }])).toHaveLength(2);
  });

  it('ranks phrase, alias, title, and metadata matches offline', () => {
    expect(searchAgentKnowledge(records, 'simple slice of life')).toMatchObject([
      { id: 'anime-1', matchedTerms: expect.arrayContaining(['simple', 'slice', 'of', 'life']) },
    ]);
    expect(searchAgentKnowledge(records, 'study', { kinds: ['vocabulary'], level: 'N3' })).toMatchObject([
      { id: 'word-1' },
    ]);
  });

  it('returns nothing for empty queries and respects caps', () => {
    expect(searchAgentKnowledge(records, '')).toEqual([]);
    expect(searchAgentKnowledge(records, 'anime', { limit: 0 })).toHaveLength(1);
  });
});
