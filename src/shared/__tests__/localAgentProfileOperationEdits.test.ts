/**
 * Slice 63 — the write side of the profile operation delta.
 *
 * Slice 56 taught `normalizeAgentProfiles` to READ a delta
 * (`disabledOperations` / `addedOperations`) over a factory built-in, and slice 58 fixed the
 * empty-delta bug that made a stored `[]` mask a later plain edit. Phase 7 then proved
 * end-to-end that a narrowed profile really does refuse a step against shipped bytes.
 *
 * None of that was reachable. `disabledOperations` appeared nowhere in `src/renderer` — the
 * only way to narrow a built-in was to hand-edit localStorage, which is exactly what the
 * Phase 7 gate did. This file covers the function the new editor calls, so the UI writes the
 * delta form DIRECTLY and never leans on the legacy `enabledOperations` conversion.
 *
 * The three rules that carry weight here, each of which has already cost this track a slice:
 *
 *  1. An unedited profile must emit NO delta keys at all — not `disabledOperations: []`.
 *     That empty array is what slice 58 traced the live Phase 7 failure to: the legacy guard
 *     read `[]` as "already a delta" and dropped the real edit.
 *  2. Un-narrowing must DELETE the stale delta, not leave the old array behind under a
 *     recomputed `enabledOperations`. `{ ...profile }` carries the old keys forward, so this
 *     is a spread trap, not a hypothetical.
 *  3. An empty allow-list is a legitimate, maximally-restrictive choice. It is the exact case
 *     an "empty means unset" shortcut silently converts into "everything allowed".
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AGENT_PROFILES,
  agentProfileOperationsAreFactoryDefault,
  factoryAgentProfileOperations,
  getActiveAgentProfile,
  normalizeAgentProfiles,
  setAgentProfileOperations,
  type AgentProfile,
} from '../localAgentProfiles';
import { evaluateAgentToolAccess } from '../localAgent';
import type { AgentToolOperationId } from '../localAgent';

const TUTOR = 'study-tutor';

function factoryTutor(): AgentProfile {
  const found = DEFAULT_AGENT_PROFILES.find((profile) => profile.id === TUTOR);
  if (!found) throw new Error('the study-tutor built-in is gone; this suite is measuring nothing');
  return found;
}

/** The profile object the panel actually holds — normalize's OWN output, not a hand-written one. */
function bootedTutor(): AgentProfile {
  const store = normalizeAgentProfiles({});
  const found = store.profiles.find((profile) => profile.id === TUTOR);
  if (!found) throw new Error('study-tutor missing from a freshly normalized store');
  return found;
}

function reload(profile: AgentProfile): AgentProfile {
  // Through JSON, because that is what localStorage does to it: a key whose value is
  // `undefined` survives an object spread and does NOT survive a serialize/parse round trip,
  // so asserting on the in-memory object alone would miss half of rule 1.
  const store = normalizeAgentProfiles(JSON.parse(JSON.stringify({
    version: 1,
    activeProfileId: TUTOR,
    profiles: [profile],
  })));
  const found = store.profiles.find((entry) => entry.id === profile.id);
  if (!found) throw new Error(`${profile.id} missing after a reload`);
  return found;
}

describe('setAgentProfileOperations writes a delta, never a frozen list', () => {
  it('records a narrowing as disabledOperations and nothing else', () => {
    const factory = factoryTutor();
    const removed = factory.enabledOperations[0];
    const kept = factory.enabledOperations.filter((operation) => operation !== removed);

    const edited = setAgentProfileOperations(bootedTutor(), kept);

    expect(edited.disabledOperations).toEqual([removed]);
    expect(edited.addedOperations).toBeUndefined();
    expect(edited.enabledOperations).toEqual(kept);
  });

  it('records a widening as addedOperations and nothing else', () => {
    const factory = factoryTutor();
    const added = 'settings.read' as AgentToolOperationId;
    expect(factory.enabledOperations).not.toContain(added);

    const edited = setAgentProfileOperations(bootedTutor(), [...factory.enabledOperations, added]);

    expect(edited.addedOperations).toEqual([added]);
    expect(edited.disabledOperations).toBeUndefined();
    expect(edited.enabledOperations).toContain(added);
  });

  it('keeps the delta rather than a copy, so a future factory addition still appears', () => {
    // The whole point of the delta form. A UI that stored the user's resulting list would pass
    // the two tests above and fail this one.
    const factory = factoryTutor();
    const removed = factory.enabledOperations[0];
    const edited = setAgentProfileOperations(bootedTutor(), factory.enabledOperations.slice(1));

    const grown: AgentProfile = {
      ...factory,
      enabledOperations: [...factory.enabledOperations, 'settings.read' as AgentToolOperationId],
    };
    // Re-apply the stored delta against a LARGER factory list, the way a future app version
    // would on first load after shipping a new operation on this built-in.
    const disabled = new Set(edited.disabledOperations ?? []);
    const merged = grown.enabledOperations.filter((operation) => !disabled.has(operation));

    expect(merged).not.toContain(removed);
    expect(merged).toContain('settings.read');
  });

  it('drops unknown operation ids instead of persisting them', () => {
    const edited = setAgentProfileOperations(bootedTutor(), [
      'dictionary.lookup',
      'not-a-real-operation',
    ] as AgentToolOperationId[]);

    expect(edited.enabledOperations).toEqual(['dictionary.lookup']);
    expect(edited.disabledOperations).not.toContain('not-a-real-operation');
    expect(edited.addedOperations).toBeUndefined();
  });
});

describe('an unedited profile writes no delta fields at all', () => {
  it('emits neither key when the selection equals the factory list', () => {
    const factory = factoryTutor();

    const edited = setAgentProfileOperations(bootedTutor(), factory.enabledOperations);

    // `toBeUndefined` is not enough: the key must be ABSENT, because `'x' in profile` is what
    // decides whether the next load sees a delta.
    expect(Object.hasOwn(edited, 'disabledOperations')).toBe(false);
    expect(Object.hasOwn(edited, 'addedOperations')).toBe(false);
  });

  it('stores indistinguishably from a profile that was never touched', () => {
    const factory = factoryTutor();
    const untouched = bootedTutor();

    const edited = setAgentProfileOperations(untouched, factory.enabledOperations);

    // Same keys and same values after a serialize/parse round trip — the shape on disk itself
    // must not change the meaning of the NEXT load.
    const stored = JSON.parse(JSON.stringify(edited));
    const control = JSON.parse(JSON.stringify(untouched));
    expect(Object.keys(stored).sort()).toEqual(Object.keys(control).sort());
    expect(stored).toEqual(control);
  });

  it('un-narrowing DELETES the stale delta rather than leaving it behind', () => {
    // The `{ ...profile }` trap. A spread-based implementation carries the previous
    // `disabledOperations` array forward under a freshly recomputed `enabledOperations`, and
    // the next load applies the stale delta and undoes the user's re-enable.
    const factory = factoryTutor();
    const narrowed = setAgentProfileOperations(bootedTutor(), factory.enabledOperations.slice(1));
    expect(narrowed.disabledOperations).toHaveLength(1);

    const restored = setAgentProfileOperations(narrowed, factory.enabledOperations);

    expect(Object.hasOwn(restored, 'disabledOperations')).toBe(false);
    expect(reload(restored).enabledOperations).toEqual(factory.enabledOperations);
  });
});

describe('an empty allow-list is a choice, and it sticks', () => {
  it('survives a save and a reload on a built-in', () => {
    const edited = setAgentProfileOperations(bootedTutor(), []);

    expect(edited.enabledOperations).toEqual([]);
    // Non-empty on purpose: this is what makes the reload read it as a real delta.
    expect(edited.disabledOperations).toEqual(factoryTutor().enabledOperations);
    expect(reload(edited).enabledOperations).toEqual([]);
  });

  it('survives a second reload, because normalize consumes its own output', () => {
    // Slice 56's 11 tests all passed while the live app was broken, because they fed the
    // function hand-written stores and the app feeds it the function's own output.
    const once = reload(setAgentProfileOperations(bootedTutor(), []));
    const twice = reload(once);

    expect(twice.enabledOperations).toEqual([]);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it('denies at the execution boundary rather than reading as "unrestricted"', () => {
    // The failure this suite exists to prevent: `if (!allowed?.length)` anywhere on this path
    // turns the most restrictive setting in the app into the least restrictive one.
    const store = normalizeAgentProfiles(JSON.parse(JSON.stringify({
      version: 1,
      activeProfileId: TUTOR,
      profiles: [setAgentProfileOperations(bootedTutor(), [])],
    })));
    const active = getActiveAgentProfile(store);

    expect(active.enabledOperations).toEqual([]);
    const decision = evaluateAgentToolAccess(
      { callId: 'slice-63', operation: 'dictionary.lookup', arguments: { term: 'x' }, confirmed: true },
      'full-automation',
      active.enabledOperations,
    );
    expect(decision.status).toBe('denied');
  });

  it('empties a custom profile too, without inventing a delta for it', () => {
    const store = normalizeAgentProfiles({
      version: 1,
      activeProfileId: TUTOR,
      profiles: [{ id: 'my-custom', name: 'Mine', enabledOperations: ['dictionary.lookup'] }],
    });
    const custom = store.profiles.find((profile) => profile.id === 'my-custom');
    if (!custom) throw new Error('the custom profile did not survive normalization');

    const emptied = setAgentProfileOperations(custom, []);

    expect(emptied.enabledOperations).toEqual([]);
    expect(Object.hasOwn(emptied, 'disabledOperations')).toBe(false);
    expect(Object.hasOwn(emptied, 'addedOperations')).toBe(false);
    expect(reload(emptied).enabledOperations).toEqual([]);
  });
});

describe('every built-in is narrowable, not just the tutor', () => {
  // Slice 56's defect was scoped to built-ins, and the four built-ins are all a fresh user has.
  for (const factory of DEFAULT_AGENT_PROFILES) {
    it(`${factory.id} keeps a narrowing across a reload`, () => {
      const store = normalizeAgentProfiles({});
      const booted = store.profiles.find((profile) => profile.id === factory.id);
      if (!booted) throw new Error(`${factory.id} missing from a freshly normalized store`);
      expect(booted.builtIn).toBe(true);

      const removed = factory.enabledOperations[0];
      const edited = setAgentProfileOperations(
        booted,
        factory.enabledOperations.filter((operation) => operation !== removed),
      );

      const reloaded = reload(edited);
      expect(reloaded.enabledOperations).not.toContain(removed);
      expect(reloaded.enabledOperations).toHaveLength(factory.enabledOperations.length - 1);
    });
  }
});

describe('the helpers the editor needs to render "modified" and "reset"', () => {
  it('reports an untouched built-in as factory-default', () => {
    expect(agentProfileOperationsAreFactoryDefault(bootedTutor())).toBe(true);
  });

  it('reports a narrowed built-in as modified', () => {
    const narrowed = setAgentProfileOperations(bootedTutor(), factoryTutor().enabledOperations.slice(1));
    expect(agentProfileOperationsAreFactoryDefault(narrowed)).toBe(false);
  });

  it('hands back the factory list a reset must restore', () => {
    expect(factoryAgentProfileOperations(TUTOR)).toEqual(factoryTutor().enabledOperations);
    expect(factoryAgentProfileOperations('my-custom')).toBeUndefined();
  });
});

describe('controls — so none of the above can pass vacuously', () => {
  it('an untouched store still yields the exact factory operations', () => {
    expect(bootedTutor().enabledOperations).toEqual(factoryTutor().enabledOperations);
  });

  it('a narrowing is a real difference from the control, not a shared answer', () => {
    // Without this a normalizer that returned the factory list for everything would be green
    // forever: the assertion is that the two arms DIFFER.
    const narrowed = reload(setAgentProfileOperations(bootedTutor(), factoryTutor().enabledOperations.slice(1)));
    expect(narrowed.enabledOperations).not.toEqual(bootedTutor().enabledOperations);
  });

  it('all four built-ins are still present after an edit is applied', () => {
    const store = normalizeAgentProfiles(JSON.parse(JSON.stringify({
      version: 1,
      activeProfileId: TUTOR,
      profiles: [setAgentProfileOperations(bootedTutor(), [])],
    })));
    expect(store.profiles.filter((profile) => profile.builtIn)).toHaveLength(DEFAULT_AGENT_PROFILES.length);
  });
});
