import { describe, expect, it } from 'vitest';
import {
  NOTEBOOK_TIMELINE_STORAGE_KEY,
  parseNotebookTimeline,
} from '../notebookTimeline';

describe('Notebook timeline persistence contract', () => {
  it('keeps the established key available to the Files migration', () => {
    expect(NOTEBOOK_TIMELINE_STORAGE_KEY).toBe('jp-grammarx-notebook-timeline-v1');
  });

  it('preserves every legacy row that the current Notebook reader accepts', () => {
    const legacy = [
      {
        id: 'note-complete',
        stream: 'highlights',
        title: 'A complete note',
        detail: 'kept verbatim',
        ts: 1_700_000_000_000,
      },
      { id: 'note-old-minimal' },
      null,
      { title: 'missing id' },
    ];

    expect(parseNotebookTimeline(JSON.stringify(legacy))).toEqual(legacy.slice(0, 2));
  });

  it.each([null, '', '{}', 'not-json'])(
    'returns an honest empty list for an unreadable store (%j)',
    (raw) => {
      expect(parseNotebookTimeline(raw)).toEqual([]);
    },
  );
});
