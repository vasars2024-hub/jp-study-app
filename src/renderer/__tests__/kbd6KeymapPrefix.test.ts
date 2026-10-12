// @vitest-environment jsdom
/**
 * kbd6 — prefix clashes in the keymap editor. A single chord that is the first step
 * of another entry's sequence shadows one of them (the dispatcher lets the prefix
 * win), so `findConflicts` and `conflictMap` report it as overlapping, with
 * `prefix: true` and the shorter keys as `lead`.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { KeymapEntry } from '../keymapEditor';

type KS = typeof import('../keyboardShortcuts');
type KE = typeof import('../keymapEditor');
let ks: KS;
let ke: KE;

beforeAll(async () => {
  const api = new Proxy(
    {},
    {
      get: (_target, prop) =>
        typeof prop === 'string' && prop.startsWith('on') ? () => () => undefined : () => Promise.resolve(null),
    },
  );
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
  ks = await import('../keyboardShortcuts');
  ke = await import('../keymapEditor');
});

beforeEach(() => {
  localStorage.clear();
  ks.resetAllBindings();
});

const entry = (id: string, scope: KeymapEntry['scope'], chords: string[]): KeymapEntry => ({
  id,
  source: 'app',
  scope,
  chords,
  editable: true,
});

describe('sequenceLead', () => {
  it('is the shorter keys when they start the longer, else null', () => {
    expect(ke.sequenceLead('Ctrl+K', 'Ctrl+K S')).toBe('Ctrl+K');
    expect(ke.sequenceLead('Ctrl+K S D', 'Ctrl+K S')).toBe('Ctrl+K S');
    expect(ke.sequenceLead('Ctrl+K', 'Ctrl+K')).toBeNull();
    expect(ke.sequenceLead('Ctrl+K', 'Ctrl+J S')).toBeNull();
    expect(ke.sequenceLead('S', 'Ctrl+K S')).toBeNull();
  });
});

describe('findConflicts', () => {
  const entries = [
    entry('a.palette', 'app', ['Ctrl+K']),
    entry('a.sequence', 'app', ['Ctrl+K S']),
    entry('r.reader', 'reader', ['Ctrl+K R']),
    entry('f.cards', 'flashcards', ['Ctrl+J']),
  ];

  it('a single chord that starts another entry’s sequence is an overlapping prefix clash', () => {
    const list = ke.findConflicts('f.cards', 'Ctrl+K', entries);
    const seq = list.find((c) => c.id === 'a.sequence');
    expect(seq).toMatchObject({ prefix: true, lead: 'Ctrl+K', chord: 'Ctrl+K S', overlapping: true });
    // The exact clash keeps its old shape.
    expect(list.find((c) => c.id === 'a.palette')).toEqual({
      id: 'a.palette',
      scope: 'app',
      source: 'app',
      chord: 'Ctrl+K',
      overlapping: true,
      editable: true,
    });
    // Flashcards and reader never share a keypress.
    expect(list.find((c) => c.id === 'r.reader')?.overlapping).toBe(false);
  });

  it('a sequence whose first step is another entry’s chord clashes the other way round', () => {
    const list = ke.findConflicts('f.cards', 'Ctrl+K X', entries);
    expect(list.find((c) => c.id === 'a.palette')).toMatchObject({ prefix: true, lead: 'Ctrl+K', chord: 'Ctrl+K' });
    expect(list.some((c) => c.id === 'a.sequence')).toBe(false);
  });
});

describe('conflictMap', () => {
  it('reports a prefix clash on both rows, and only between overlapping scopes', () => {
    const map = ke.conflictMap([
      entry('a.palette', 'app', ['Ctrl+K']),
      entry('a.sequence', 'app', ['Ctrl+K S']),
      entry('f.cards', 'flashcards', ['Ctrl+J']),
      entry('r.reader', 'reader', ['Ctrl+J S']),
      entry('x.chrome', 'extension', ['Ctrl+K']),
    ]);
    expect(map.get('a.palette')?.find((c) => c.id === 'a.sequence')).toMatchObject({ prefix: true, lead: 'Ctrl+K', chord: 'Ctrl+K S' });
    expect(map.get('a.sequence')?.find((c) => c.id === 'a.palette')).toMatchObject({ prefix: true, lead: 'Ctrl+K', chord: 'Ctrl+K' });
    // Flashcards and the reader are separate surfaces: no clash.
    expect(map.get('f.cards')).toBeUndefined();
    expect(map.get('r.reader')).toBeUndefined();
    // Chrome hears nothing of the app's keys.
    expect(map.get('a.sequence')?.some((c) => c.id === 'x.chrome')).toBe(false);
  });

  it('a sequence against a longer sequence is reported once per side', () => {
    const map = ke.conflictMap([entry('a.one', 'app', ['Ctrl+K S']), entry('a.two', 'app', ['Ctrl+K S D'])]);
    expect(map.get('a.one')).toHaveLength(1);
    expect(map.get('a.two')).toHaveLength(1);
    expect(map.get('a.one')?.[0]).toMatchObject({ id: 'a.two', lead: 'Ctrl+K S' });
  });

  it('the live keymap reports a bound sequence against the palette’s Ctrl+K', () => {
    ks.setBinding('nav.widgets', 'Ctrl+K W');
    const map = ke.conflictMap();
    expect(map.get('nav.palette')?.some((c) => c.id === 'nav.widgets' && c.prefix)).toBe(true);
  });
});

describe('bindWithResolution', () => {
  it('replace takes the clashing sequence away from the other command', () => {
    ks.setBinding('nav.widgets', 'Ctrl+K W|F9');
    const res = ke.bindWithResolution('nav.settings', 'Ctrl+K', 'replace', 'replace');
    expect(res.ok).toBe(true);
    expect(ks.effectiveKeys('nav.settings')).toBe('Ctrl+K');
    expect(ks.effectiveKeys('nav.widgets')).toBe('F9');
  });
});
