/**
 * Slice 56 — a user's edit to a BUILT-IN agent profile must survive a reload.
 *
 * `normalizeAgentProfiles` seeded its map with the four factory built-ins and then
 * `continue`d on any stored profile whose id was already present. Every built-in id is,
 * so every user edit to a built-in was silently discarded on load. Slice 53 measured this
 * live: narrowing a built-in from 19 operations to 18, restarting, and running the queued
 * task produced `status: "completed"` — no refusal, no error, no effect.
 *
 * That made slice 47e's execution-time allow-list re-check CORRECT BUT UNREACHABLE on a
 * built-in profile, and the four built-ins are all a fresh user has.
 *
 * The rule implemented here:
 *   - identity   (id, name, description, role, builtIn) stays FACTORY-owned, so a future
 *                version can re-word a built-in and it cannot be impersonated;
 *   - preferences(permission, model, response/explanation/language/teaching/correction,
 *                enabled) are the USER's and override outright;
 *   - operations are a DELTA over the current factory list, never a frozen copy of it,
 *                so a narrowing always sticks AND an operation a future version adds to a
 *                built-in still appears.
 *
 * Legacy stores that carry a whole `enabledOperations` list for a built-in — written by the
 * UI before this fix, and discarded ever since — are converted to that delta on load, so an
 * edit the user made months ago and never saw take effect finally does.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AGENT_PROFILES,
  getActiveAgentProfile,
  normalizeAgentProfiles,
} from '../localAgentProfiles';
import type { AgentToolOperationId } from '../localAgent';

const TUTOR = 'study-tutor';

function factoryTutor() {
  const found = DEFAULT_AGENT_PROFILES.find((profile) => profile.id === TUTOR);
  if (!found) throw new Error('the study-tutor built-in is gone; this suite is measuring nothing');
  return found;
}

function loadWith(stored: Record<string, unknown>) {
  return normalizeAgentProfiles({
    version: 1,
    activeProfileId: TUTOR,
    profiles: [stored],
  });
}

function tutorFrom(store: ReturnType<typeof normalizeAgentProfiles>) {
  const found = store.profiles.find((profile) => profile.id === TUTOR);
  if (!found) throw new Error('study-tutor missing from the normalized store');
  return found;
}

describe('a built-in profile keeps the user’s edits across a reload', () => {
  it('honours an explicit removal', () => {
    const factory = factoryTutor();
    const removed = factory.enabledOperations[0];

    const tutor = tutorFrom(loadWith({ id: TUTOR, disabledOperations: [removed] }));

    expect(tutor.enabledOperations).not.toContain(removed);
    expect(tutor.enabledOperations).toHaveLength(factory.enabledOperations.length - 1);
  });

  it('is what getActiveAgentProfile hands the executor', () => {
    // The security-relevant path: this is the object whose enabledOperations become
    // `allowedOperations` at the single renderer execution boundary.
    const factory = factoryTutor();
    const removed = factory.enabledOperations[0];

    const active = getActiveAgentProfile({
      version: 1,
      activeProfileId: TUTOR,
      profiles: [{ id: TUTOR, disabledOperations: [removed] } as never],
    });

    expect(active.id).toBe(TUTOR);
    expect(active.enabledOperations).not.toContain(removed);
  });

  it('still surfaces every other factory operation, so a future version can add one', () => {
    // The delta is applied to the CURRENT factory list. A frozen copy of the user's list
    // would pass the test above and fail this one.
    const factory = factoryTutor();
    const removed = factory.enabledOperations[0];

    const tutor = tutorFrom(loadWith({ id: TUTOR, disabledOperations: [removed] }));

    for (const operation of factory.enabledOperations) {
      if (operation !== removed) expect(tutor.enabledOperations).toContain(operation);
    }
  });

  it('honours an addition beyond the factory set', () => {
    const factory = factoryTutor();
    const added = 'settings.read' as AgentToolOperationId;
    expect(factory.enabledOperations).not.toContain(added);

    const tutor = tutorFrom(loadWith({ id: TUTOR, addedOperations: [added] }));

    expect(tutor.enabledOperations).toContain(added);
  });

  it('keeps preferences but never lets a stored profile take over a built-in’s identity', () => {
    const factory = factoryTutor();

    const tutor = tutorFrom(loadWith({
      id: TUTOR,
      permission: 'read-only',
      responseLength: 'brief',
      preferredModelFileName: 'something.gguf',
      name: 'Impersonated',
      description: 'not the factory text',
      role: 'automation',
      builtIn: false,
    }));

    expect(tutor.permission).toBe('read-only');
    expect(tutor.responseLength).toBe('brief');
    expect(tutor.preferredModelFileName).toBe('something.gguf');

    expect(tutor.name).toBe(factory.name);
    expect(tutor.description).toBe(factory.description);
    expect(tutor.role).toBe(factory.role);
    expect(tutor.builtIn).toBe(true);
  });
});

describe('a legacy enabledOperations list on a built-in becomes a delta', () => {
  it('converts a narrowing that has been silently discarded until now', () => {
    const factory = factoryTutor();
    const kept = factory.enabledOperations.slice(0, 3);

    const tutor = tutorFrom(loadWith({ id: TUTOR, enabledOperations: kept }));

    expect([...tutor.enabledOperations].sort()).toEqual([...kept].sort());
  });

  it('converts a widening too, but only to operations that still exist', () => {
    const factory = factoryTutor();
    const legacy = [...factory.enabledOperations, 'settings.read', 'not-a-real-operation'];

    const tutor = tutorFrom(loadWith({ id: TUTOR, enabledOperations: legacy }));

    expect(tutor.enabledOperations).toContain('settings.read');
    expect(tutor.enabledOperations).not.toContain('not-a-real-operation');
  });

  it('ignores unknown ids in an explicit delta as well', () => {
    const tutor = tutorFrom(loadWith({
      id: TUTOR,
      disabledOperations: ['not-a-real-operation'],
      addedOperations: ['also-not-real'],
    }));

    expect(tutor.enabledOperations).not.toContain('also-not-real');
    expect(tutor.enabledOperations).toEqual(factoryTutor().enabledOperations);
  });
});

describe('an empty delta must not mask a later plain edit', () => {
  // Found by the LIVE gate, not by this suite. Slice 58 rebuilt the app, re-ran
  // phase7-queue-refusal-live-gate.mjs and it still failed: the narrowing was on disk after
  // the restart and the step ran anyway. The unit tests above all passed, because each of them
  // hands normalizeAgentProfiles a hand-written store. The app hands it a store that has
  // ALREADY been through normalizeAgentProfiles once.
  it('honours a narrowing written alongside an empty delta from a previous load', () => {
    const factory = factoryTutor();
    const kept = factory.enabledOperations.slice(0, 3);

    const tutor = tutorFrom(loadWith({
      id: TUTOR,
      disabledOperations: [],
      addedOperations: [],
      enabledOperations: kept,
    }));

    expect([...tutor.enabledOperations].sort()).toEqual([...kept].sort());
  });

  it('survives the real sequence: load, save, narrow, load again', () => {
    // This is the sequence the app actually performs, and the one the live gate exercised.
    const factory = factoryTutor();
    const removed = factory.enabledOperations[0];

    const booted = tutorFrom(normalizeAgentProfiles({}));
    // The settings UI narrows by writing a plain enabledOperations list onto the profile object
    // it already holds — which now carries the empty delta that normalize emitted.
    const narrowed = {
      ...booted,
      enabledOperations: booted.enabledOperations.filter((operation) => operation !== removed),
    };

    const reloaded = tutorFrom(normalizeAgentProfiles({
      version: 1,
      activeProfileId: TUTOR,
      profiles: [narrowed],
    }));

    expect(reloaded.enabledOperations).not.toContain(removed);
  });
});

describe('controls — so none of the above can pass vacuously', () => {
  it('an untouched store still yields the exact factory operations', () => {
    const factory = factoryTutor();
    const tutor = tutorFrom(normalizeAgentProfiles({}));
    expect(tutor.enabledOperations).toEqual(factory.enabledOperations);
    expect(tutor.builtIn).toBe(true);
  });

  it('custom profiles are untouched by any of this', () => {
    const store = normalizeAgentProfiles({
      version: 1,
      activeProfileId: TUTOR,
      profiles: [{ id: 'my-custom', name: 'Mine', enabledOperations: ['dictionary.lookup'] }],
    });
    const custom = store.profiles.find((profile) => profile.id === 'my-custom');
    expect(custom?.enabledOperations).toEqual(['dictionary.lookup']);
    expect(custom?.name).toBe('Mine');
    expect(custom?.builtIn).toBe(false);
  });

  it('all four built-ins are still present after an override is applied', () => {
    const store = loadWith({ id: TUTOR, disabledOperations: [factoryTutor().enabledOperations[0]] });
    expect(store.profiles.filter((profile) => profile.builtIn)).toHaveLength(DEFAULT_AGENT_PROFILES.length);
  });
});
