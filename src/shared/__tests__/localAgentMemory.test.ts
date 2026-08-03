import { describe, expect, it } from 'vitest';
import {
  clearAgentMemory,
  deleteAgentMemory,
  normalizeAgentMemory,
  selectAgentMemoryContext,
  upsertAgentMemory,
  type AgentMemoryStore,
} from '../localAgentMemory';

describe('local agent memory', () => {
  it('normalizes malformed and duplicate entries', () => {
    expect(normalizeAgentMemory({
      entries: [
        {
          id: 'genre',
          category: 'user-preference',
          key: 'Favorite genre',
          value: 'Slice of life',
          createdAt: 1,
          updatedAt: 2,
        },
        {
          id: 'genre',
          category: 'learning',
          key: 'Duplicate',
          value: 'Ignored',
        },
        { id: '', category: 'unknown', key: '', value: '' },
      ],
    }).entries).toHaveLength(1);
  });

  it('supports user-visible create, edit, delete, and category clear operations', () => {
    const created = upsertAgentMemory(
      { version: 1, entries: [] },
      {
        id: 'goal',
        category: 'learning',
        key: 'Current goal',
        value: 'Pass N3',
      },
      10,
    );
    const edited = upsertAgentMemory(
      created,
      {
        id: 'goal',
        category: 'learning',
        key: 'Current goal',
        value: 'Pass N2',
      },
      20,
    );
    expect(edited.entries[0]).toMatchObject({
      value: 'Pass N2',
      createdAt: 10,
      updatedAt: 20,
    });
    expect(deleteAgentMemory(edited, 'goal').entries).toEqual([]);

    const mixed = [
      upsertAgentMemory(created, {
        id: 'theme',
        category: 'application',
        key: 'Theme',
        value: 'Dark',
      }, 30),
    ][0];
    expect(clearAgentMemory(mixed, 'learning').entries.map((entry) => entry.id)).toEqual(['theme']);
    expect(clearAgentMemory(mixed).entries).toEqual([]);
  });

  it('selects relevant recent context within strict entry and character budgets', () => {
    let store: AgentMemoryStore = { version: 1, entries: [] };
    store = upsertAgentMemory(store, {
      id: 'genre',
      category: 'user-preference',
      key: 'Anime genre',
      value: 'Slice of life',
    }, 10);
    store = upsertAgentMemory(store, {
      id: 'grammar',
      category: 'learning',
      key: 'Weak grammar',
      value: 'Passive voice',
    }, 20);
    store = upsertAgentMemory(store, {
      id: 'source',
      category: 'application',
      key: 'Preferred source',
      value: 'Local library',
    }, 30);
    expect(selectAgentMemoryContext(store, 'Find slice of life anime')).toMatchObject([
      { id: 'genre' },
    ]);
    expect(selectAgentMemoryContext(store, '', { maxEntries: 2 }).map((entry) => entry.id)).toEqual([
      'source',
      'grammar',
    ]);
    expect(selectAgentMemoryContext(store, '', { maxCharacters: 1 })).toEqual([]);
  });
});
