/**
 * Gate 1, the renderer half: the Notebook lives in localStorage, so main's
 * index cannot see it and `outputs/notes` read 0 against a populated store.
 */
import { describe, expect, it } from 'vitest';
import {
  notebookFilesItems,
  withRendererItems,
} from '../components/filesapp/rendererEnumerators';
import { NOTEBOOK_TIMELINE_STORAGE_KEY, type NotebookTimelineEntry } from '../notebookTimeline';
import { countByCategory, type FilesIndexSnapshot } from '../../shared/filesApp/catalog';

function entry(over: Partial<NotebookTimelineEntry>): NotebookTimelineEntry {
  return { id: 'nb-1', stream: 'lookups', title: 'A lookup', ts: 100, ...over };
}

function emptySnapshot(): FilesIndexSnapshot {
  return { items: [], counts: countByCategory([]), enumerators: [], builtAt: 0 };
}

describe('files app — renderer-owned enumerators', () => {
  it('turns notebook entries into rows under notes and highlights', () => {
    const items = notebookFilesItems([
      entry({ id: 'a', stream: 'lookups', title: 'Looked up 猫' }),
      entry({ id: 'b', stream: 'highlights', title: 'Highlighted a line' }),
      entry({ id: 'c', stream: 'saved-words', title: 'Saved 犬' }),
    ]);

    expect(items.map((i) => i.categoryId)).toEqual([
      'outputs/notes',
      'outputs/highlights',
      'outputs/highlights',
    ]);
    expect(items[0].location).toEqual({
      store: 'localStorage',
      key: NOTEBOOK_TIMELINE_STORAGE_KEY,
      pointer: 'a',
    });
    // A timeline entry has no byte size; borrowing its detail length would put
    // a number meaning something else into the size column.
    expect(items.every((i) => i.sizeBytes === null)).toBe(true);
    expect(items[0].createdAt).toBe(100);
  });

  it('merges into a main-built snapshot and recomputes the counts', () => {
    const merged = withRendererItems({
      ...emptySnapshot(),
      enumerators: [{ source: 'library', itemCount: 0, elapsedMs: 1 }],
    });

    // Nothing in localStorage under vitest: an honest zero, with the reader
    // still named so a failed read stays distinguishable from an empty one.
    expect(merged.enumerators.map((r) => r.source)).toEqual(['library', 'notebook']);
    const notes = merged.counts.find((c) => c.categoryId === 'outputs/notes');
    expect(notes?.total).toBe(0);
  });

  it('never produces a second row for an id the main index already carries', () => {
    const existing = notebookFilesItems([entry({ id: 'dup' })]);
    const merged = withRendererItems({
      ...emptySnapshot(),
      items: existing,
      counts: countByCategory(existing),
    });

    expect(merged.items.filter((i) => i.id === 'notebook:dup')).toHaveLength(1);
  });

  it('a store that throws is reported by name rather than blanking the merge', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage disabled');
      },
    });
    try {
      const merged = withRendererItems(emptySnapshot());
      const report = merged.enumerators.find((r) => r.source === 'notebook');
      // `loadNotebookTimeline` swallows its own failure, so the honest outcome
      // here is zero items from a reader that ran — never a missing report.
      expect(report).toBeDefined();
      expect(report?.itemCount).toBe(0);
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });
});
