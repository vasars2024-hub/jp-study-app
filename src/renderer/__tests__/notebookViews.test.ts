import { describe, expect, it } from 'vitest';
import {
  ALL_NOTEBOOK_STREAMS,
  NOTEBOOK_VIEWS,
  VIEW_STREAMS,
  streamsForView,
  type NotebookViewId,
} from '../notebook/views';
import { NOTEBOOK_STREAM_ABSORPTION } from '../../shared/filesApp/notebookAbsorption';
import type { NotebookStream } from '../notebookTimeline';

// The full stream list, duplicated from `NotebookStream`. A union type has no
// runtime representation, so this is the one place a copy is unavoidable — and
// the drift guard below is exactly why it is worth writing down.
const ALL_STREAMS: NotebookStream[] = [
  'saved-words',
  'lookups',
  'flashcards',
  'anki',
  'mining',
  'known',
  'translations',
  'plan',
  'highlights',
  'ocr',
  'audio',
  'clipboard',
  'extension',
  'media',
  'transcript',
];

describe('notebook view partition', () => {
  it('assigns every stream to exactly one view', () => {
    const seen = new Map<NotebookStream, NotebookViewId[]>();
    for (const [view, streams] of Object.entries(VIEW_STREAMS)) {
      for (const s of streams) {
        seen.set(s, [...(seen.get(s) ?? []), view as NotebookViewId]);
      }
    }

    // Nothing unreachable: an unassigned stream would be invisible in every
    // named view while still inflating the Overview count.
    const unassigned = ALL_STREAMS.filter((s) => !seen.has(s));
    expect(unassigned).toEqual([]);

    // Nothing double-counted: a stream in two views is counted twice across
    // the tab strip and the totals stop summing to the notebook.
    const duplicated = [...seen.entries()].filter(([, views]) => views.length > 1);
    expect(duplicated).toEqual([]);
  });

  it('lists every stream once, media-assistant notes included', () => {
    // `media` is written by MediaStudyAssistantPanel and was absent from the
    // chip list and every view, so those notes could not be seen at all.
    expect(ALL_NOTEBOOK_STREAMS).toEqual(ALL_STREAMS);
    expect(VIEW_STREAMS.captures).toContain('media');
    for (const row of NOTEBOOK_STREAM_ABSORPTION) expect(ALL_NOTEBOOK_STREAMS).toContain(row.stream);
  });

  it('assigns no stream that does not exist', () => {
    const assigned = Object.values(VIEW_STREAMS).flat();
    const unknown = assigned.filter((s) => !ALL_STREAMS.includes(s));
    expect(unknown).toEqual([]);
  });

  it('view stream counts sum to the full stream list', () => {
    const total = Object.values(VIEW_STREAMS).reduce((n, s) => n + s.length, 0);
    expect(total).toBe(ALL_STREAMS.length);
  });

  it('overview shows every stream and owns none', () => {
    expect(streamsForView('overview', ALL_STREAMS)).toEqual(ALL_STREAMS);
    expect(Object.keys(VIEW_STREAMS)).not.toContain('overview');
  });

  it('every declared view is either overview or has streams', () => {
    for (const v of NOTEBOOK_VIEWS) {
      expect(streamsForView(v, ALL_STREAMS).length).toBeGreaterThan(0);
    }
  });

  it('exposes the six views the plan names, in order', () => {
    expect(NOTEBOOK_VIEWS).toEqual([
      'overview',
      'library',
      'words',
      'translations',
      'highlights',
      'captures',
    ]);
  });
});
