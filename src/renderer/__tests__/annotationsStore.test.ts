// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ANNOTATIONS_STORAGE_PREFIX,
  annotationStorageKey,
  collectAllAnnotationsMap,
  loadAnnotations,
  parseAnnotations,
} from '../annotations';

beforeEach(() => {
  localStorage.clear();
});

describe('annotation persistence contract', () => {
  it('shares the established per-book key with Files catalogue consumers', () => {
    expect(ANNOTATIONS_STORAGE_PREFIX).toBe('jp-annotations:');
    expect(annotationStorageKey('book-1')).toBe('jp-annotations:book-1');
  });

  it('preserves every legacy row the reader accepts and skips malformed rows', () => {
    const rows = [
      { id: 'mark-1', text: '猫' },
      null,
      { text: 'missing id' },
      { id: 42, text: 'numeric id' },
    ];
    expect(parseAnnotations(JSON.stringify(rows))).toEqual([rows[0]]);
    expect(parseAnnotations('{}')).toEqual([]);
    expect(parseAnnotations('not-json')).toEqual([]);
  });

  it('enumerates every non-empty per-book store through the same parser', () => {
    localStorage.setItem(annotationStorageKey('book-a'), JSON.stringify([
      { id: 'a-1', text: 'first' },
      { text: 'missing id' },
    ]));
    localStorage.setItem(annotationStorageKey('book-b'), JSON.stringify([
      { id: 'b-1', text: 'second' },
      { id: 'b-2', text: 'third' },
    ]));
    localStorage.setItem(annotationStorageKey('broken'), 'not-json');
    localStorage.setItem('unrelated', JSON.stringify([{ id: 'nope' }]));

    expect(loadAnnotations('book-a')).toEqual([{ id: 'a-1', text: 'first' }]);
    expect(collectAllAnnotationsMap()).toEqual({
      'book-a': [{ id: 'a-1', text: 'first' }],
      'book-b': [
        { id: 'b-1', text: 'second' },
        { id: 'b-2', text: 'third' },
      ],
    });
  });
});
