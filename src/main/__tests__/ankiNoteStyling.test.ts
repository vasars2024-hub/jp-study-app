// Card styling reaches Anki (round-2 audit F, Anki item 10).
//
// Before: the CSS editor saved to the profile only, and `ensureModel` used the
// profile CSS only when it CREATED the note type — so an edit never reached an
// existing one, and there was no AnkiConnect `updateModelStyling` call at all.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: Array<[string, unknown]> = [];
let models: string[] = ['Kinomoto'];
let reachable = true;

vi.mock('../anki/client', async () => {
  const actual = await vi.importActual<typeof import('../anki/client')>('../anki/client');
  return {
    ...actual,
    invoke: async (action: string, params: unknown) => {
      if (!reachable) throw new actual.AnkiError('transport', action as 'version', 'ECONNREFUSED');
      calls.push([action, params]);
      if (action === 'modelNames') return models;
      return null;
    },
  };
});

const { configureNoteStylingQueue, flushPendingNoteStyling, pendingNoteStyling, pushNoteStyling } =
  await import('../anki/noteStyling');

function profile(id: string, css = '.card { color: red; }') {
  return { id, noteCss: css, anki: { modelName: 'Kinomoto' } } as never;
}

let saved: string[] = [];

beforeEach(() => {
  calls.length = 0;
  models = ['Kinomoto'];
  reachable = true;
  saved = [];
  configureNoteStylingQueue({ load: () => saved, save: (ids) => { saved = [...ids]; } });
});

describe('pushNoteStyling', () => {
  it('sends the saved CSS to the existing note type with updateModelStyling', async () => {
    const res = await pushNoteStyling(profile('p1'));
    expect(res).toEqual({ ok: true, status: 'updated', modelName: 'Kinomoto' });
    expect(calls).toContainEqual([
      'updateModelStyling',
      { model: { name: 'Kinomoto', css: '.card { color: red; }' } },
    ]);
  });

  it('queues when Anki is closed, persists the queue, and flushes it on connect', async () => {
    reachable = false;
    const res = await pushNoteStyling(profile('p1'));
    expect(res).toEqual({ ok: true, status: 'queued', modelName: 'Kinomoto' });
    expect(saved).toEqual(['p1']);

    // A restart reads the persisted queue.
    configureNoteStylingQueue({ load: () => saved, save: (ids) => { saved = [...ids]; } });
    expect(pendingNoteStyling()).toEqual(['p1']);

    reachable = true;
    const pushed = await flushPendingNoteStyling((id) => (id === 'p1' ? profile('p1') : null));
    expect(pushed).toBe(1);
    expect(calls.some(([action]) => action === 'updateModelStyling')).toBe(true);
    expect(saved).toEqual([]);
  });

  it('owes nothing for a note type that does not exist yet (it is created with the CSS)', async () => {
    models = [];
    const res = await pushNoteStyling(profile('p1'));
    expect(res).toEqual({ ok: true, status: 'not-created', modelName: 'Kinomoto' });
    expect(calls.some(([action]) => action === 'updateModelStyling')).toBe(false);
  });
});
