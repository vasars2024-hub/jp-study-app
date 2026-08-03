// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const durable = vi.hoisted(() => new Map<string, unknown>());

vi.mock('../storage/db', () => ({
  kvGet: async (key: string) => durable.get(key),
  kvSet: async (key: string, value: unknown) => {
    durable.set(key, structuredClone(value));
  },
}));

describe('level-list persistence', () => {
  beforeEach(() => {
    durable.clear();
    localStorage.clear();
    vi.resetModules();
  });

  it('restores imported N-level words from the durable store after a restart', async () => {
    const first = await import('../levelLists');
    first.upsertSlotList('jlpt-n5', 'JLPT N5', 'jlpt', ['食べる', '見る']);
    await first.flushLevelListsPersistence();

    expect(durable.get('level-lists')).toMatchObject({
      version: 1,
      lists: [{ slot: 'jlpt-n5', words: ['食べる', '見る'] }],
    });

    localStorage.clear();
    vi.resetModules();
    const restarted = await import('../levelLists');
    await restarted.restoreLevelListsFromIdb();

    expect(restarted.getSlotList('jlpt-n5')?.words).toEqual(['食べる', '見る']);
    expect(localStorage.getItem('jp-level-lists')).toContain('食べる');
  });

  it('migrates the legacy localStorage array into the durable envelope', async () => {
    localStorage.setItem('jp-level-lists', JSON.stringify([{
      id: 'legacy-n4',
      label: 'JLPT N4',
      kind: 'jlpt',
      slot: 'jlpt-n4',
      words: ['始める', '始める', '終わる'],
    }]));

    const lists = await import('../levelLists');
    await lists.restoreLevelListsFromIdb();
    await lists.flushLevelListsPersistence();

    expect(lists.getSlotList('jlpt-n4')?.words).toEqual(['始める', '終わる']);
    expect(durable.get('level-lists')).toMatchObject({
      version: 1,
      lists: [{ slot: 'jlpt-n4', words: ['始める', '終わる'] }],
    });
  });
});
