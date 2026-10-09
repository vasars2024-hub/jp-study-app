// @vitest-environment node
/** dict2 — the read-only "already in Anki?" check behind the dictionary's In Anki marker. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Impl = (action: string, params: unknown) => Promise<unknown>;

// A plain delegating function rather than a `vi.fn` with an async throw: the
// rejection is part of the scenario, and only the code under test should see it.
const client = vi.hoisted(() => ({
  impl: (async () => null) as Impl,
  calls: [] as Array<[string, unknown]>,
}));
vi.mock('../anki/client', () => ({
  invoke: (action: string, params: unknown) => {
    client.calls.push([action, params]);
    return client.impl(action, params);
  },
  isUnreachable: (err: unknown) => err instanceof Error && err.message === 'ECONNREFUSED',
}));

import { checkAnkiDuplicatesFromIpc } from '../anki/extensionDuplicates';

beforeEach(() => {
  client.impl = async () => null;
  client.calls = [];
});

describe('checkAnkiDuplicatesFromIpc', () => {
  it('asks canAddNotes on the sort field of the target note type and reports refusals as duplicates', async () => {
    client.impl = async (action, params) => {
      if (action === 'modelFieldNames') return ['Expression', 'Meaning'];
      if (action === 'canAddNotes') {
        return (params as { notes: Array<{ fields: Record<string, string> }> }).notes.map((note) => note.fields.Expression !== '猫');
      }
      return null;
    };
    const result = await checkAnkiDuplicatesFromIpc(['猫', '犬', 7, ''], { deckName: 'Mining', modelName: 'Lapis' });
    expect(result).toEqual({ ok: true, duplicates: { 猫: true, 犬: false } });
    const params = client.calls[1][1] as { notes: Array<{ deckName: string; options: unknown }> };
    expect(params.notes.map((note) => note.deckName)).toEqual(['Mining', 'Mining']);
    expect(params.notes[0].options).toEqual({ allowDuplicate: false });
  });

  it('never calls Anki for a malformed request', async () => {
    expect(await checkAnkiDuplicatesFromIpc('猫', null)).toEqual({ ok: true, duplicates: {} });
    expect(await checkAnkiDuplicatesFromIpc(['猫'], { deckName: 3, modelName: 'Lapis' })).toEqual({ ok: true, duplicates: {} });
    expect(client.calls).toEqual([]);
  });

  it('reports an unreachable Anki without claiming anything is a duplicate', async () => {
    client.impl = async () => {
      throw new Error('ECONNREFUSED');
    };
    const result = await checkAnkiDuplicatesFromIpc(['猫'], { deckName: 'Mining', modelName: 'Lapis' });
    expect(result).toMatchObject({ ok: false, duplicates: {}, unreachable: true });
  });
});
