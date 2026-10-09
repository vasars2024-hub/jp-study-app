// @vitest-environment node
//
// dict3 — "in Anki" for a profile that writes the term into a field other than
// the note type's first: `canAddNotes` only compares the first field, so that
// target is checked with a read-only `findNotes` on the mapped field instead.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('../anki/client', () => ({ invoke, isUnreachable: () => false }));

import { ankiSearchLiteral, checkAnkiDuplicates, checkAnkiDuplicatesFromIpc } from '../anki/extensionDuplicates';

beforeEach(() => {
  invoke.mockReset();
});

describe('mapped term field', () => {
  it('searches the mapped field within the note type', async () => {
    invoke.mockImplementation(async (action: string, params: { query?: string }) => {
      if (action === 'modelFieldNames') return ['Sentence', 'Word'];
      if (action === 'findNotes') return params.query?.includes('"Word:猫"') ? [42] : [];
      throw new Error(`unexpected ${action}`);
    });
    const out = await checkAnkiDuplicates(['猫', '犬'], { deckName: 'Sentences', modelName: 'Sentence', termField: 'Word' });
    expect(out).toEqual({ ok: true, duplicates: { 猫: true, 犬: false } });
    expect(invoke).toHaveBeenCalledWith('findNotes', { query: '"note:Sentence" "Word:猫"' });
    expect(invoke.mock.calls.some(([action]) => action === 'canAddNotes')).toBe(false);
  });

  it('keeps canAddNotes when the mapped field is the first field, or does not exist', async () => {
    invoke.mockImplementation(async (action: string) => {
      if (action === 'modelFieldNames') return ['Word', 'Meaning'];
      if (action === 'canAddNotes') return [false];
      throw new Error(`unexpected ${action}`);
    });
    expect((await checkAnkiDuplicates(['猫'], { deckName: 'V', modelName: 'M', termField: 'Word' })).duplicates).toEqual({ 猫: true });
    expect((await checkAnkiDuplicates(['猫'], { deckName: 'V', modelName: 'M', termField: 'Missing' })).duplicates).toEqual({ 猫: true });
  });

  it('accepts the field from IPC only as a bounded string', async () => {
    invoke.mockImplementation(async (action: string) => (action === 'modelFieldNames' ? ['Word'] : [true]));
    await checkAnkiDuplicatesFromIpc(['猫'], { deckName: 'V', modelName: 'M', termField: 7 });
    expect(invoke).toHaveBeenCalledWith('canAddNotes', expect.anything());
  });

  it('escapes the search syntax so a word matches literally', () => {
    expect(ankiSearchLiteral('Word', 'a_b*"c\\')).toBe('"Word:a\\_b\\*\\"c\\\\"');
  });
});
