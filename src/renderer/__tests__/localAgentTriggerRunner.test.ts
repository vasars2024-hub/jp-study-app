// @vitest-environment jsdom
/**
 * The renderer-side claim registry.
 *
 * Every assertion here is about a state main cannot see. Main's claim set is
 * keyed by `webContents.id`, so from its side two surfaces in one window and one
 * surface in one window are the same thing — which is exactly why the nesting
 * defect this module fixes was invisible from there.
 *
 * The refcount is the load-bearing half and the one a naive implementation gets
 * wrong: claim on mount / release on unmount, per surface, silently revokes the
 * whole window's claim the moment the first of two surfaces goes away.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentAutomation } from '../../shared/localAgentAutomation';
import {
  registerLocalAgentTriggerHandler,
  resetLocalAgentTriggerHandlersForTesting,
  selectLocalAgentTriggerHandler,
} from '../localAgentTriggerRunner';

const AUTOMATION: AgentAutomation = {
  id: 'auto-1',
  name: 'Morning review',
  objective: 'summarise yesterday',
  frequency: 'daily',
  time: '08:00',
  permission: 'read-only',
  enabled: true,
  createdAt: 1_700_000_000_000,
};

interface Harness {
  claim: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
  fire: (entry?: AgentAutomation) => void;
}

function harness(): Harness {
  let listener: ((entry: AgentAutomation) => void) | null = null;
  const unsubscribe = vi.fn(() => {
    listener = null;
  });
  const subscribe = vi.fn((cb: (entry: AgentAutomation) => void) => {
    listener = cb;
    return unsubscribe;
  });
  const claim = vi.fn(() => Promise.resolve(true));
  const release = vi.fn(() => Promise.resolve(true));
  (globalThis as Record<string, unknown>).api = {
    onLocalAgentTrigger: subscribe,
    localAgentClaimTriggers: claim,
    localAgentReleaseTriggers: release,
  };
  return {
    claim,
    release,
    subscribe,
    unsubscribe,
    fire: (entry = AUTOMATION) => listener?.(entry),
  };
}

describe('localAgentTriggerRunner', () => {
  let api: Harness;

  beforeEach(() => {
    resetLocalAgentTriggerHandlersForTesting();
    api = harness();
  });

  afterEach(() => {
    resetLocalAgentTriggerHandlersForTesting();
    delete (globalThis as Record<string, unknown>).api;
  });

  it('does not claim or subscribe until a handler registers', () => {
    // The negative control for every assertion below. Merely importing the
    // module must not make the window a claimant: main would then route a fire
    // to a renderer with nothing to run it and record it `delivered`.
    expect(api.subscribe).not.toHaveBeenCalled();
    expect(api.claim).not.toHaveBeenCalled();
    expect(selectLocalAgentTriggerHandler()).toBeNull();
  });

  it('claims exactly once for two handlers and releases only after both unregister', () => {
    const dropBackground = registerLocalAgentTriggerHandler('background', () => undefined);
    const dropInteractive = registerLocalAgentTriggerHandler('interactive', () => undefined);

    expect(api.claim).toHaveBeenCalledTimes(1);
    expect(api.subscribe).toHaveBeenCalledTimes(1);

    dropInteractive();
    // The defect this exists to prevent: one surface leaving must not revoke a
    // claim the surviving surface still depends on.
    expect(api.release).not.toHaveBeenCalled();
    expect(api.unsubscribe).not.toHaveBeenCalled();

    dropBackground();
    expect(api.release).toHaveBeenCalledTimes(1);
    expect(api.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('delivers one fire to exactly one handler, interactive over background', () => {
    const background = vi.fn();
    const interactive = vi.fn();
    registerLocalAgentTriggerHandler('background', background);
    registerLocalAgentTriggerHandler('interactive', interactive);

    api.fire();

    expect(interactive).toHaveBeenCalledTimes(1);
    expect(interactive).toHaveBeenCalledWith(AUTOMATION);
    expect(background).not.toHaveBeenCalled();
  });

  it('falls back to background once the interactive surface unmounts', () => {
    const background = vi.fn();
    const interactive = vi.fn();
    registerLocalAgentTriggerHandler('background', background);
    const dropInteractive = registerLocalAgentTriggerHandler('interactive', interactive);

    dropInteractive();
    api.fire();

    expect(background).toHaveBeenCalledTimes(1);
    expect(interactive).not.toHaveBeenCalled();
  });

  it('breaks a within-kind tie by registration order', () => {
    const first = vi.fn();
    const second = vi.fn();
    registerLocalAgentTriggerHandler('interactive', first);
    registerLocalAgentTriggerHandler('interactive', second);

    api.fire();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('ignores a repeated unregister rather than dropping a live claim', () => {
    const drop = registerLocalAgentTriggerHandler('background', () => undefined);
    const keep = registerLocalAgentTriggerHandler('interactive', () => undefined);

    drop();
    drop();

    // StrictMode double-invokes cleanups. A non-idempotent release would have
    // freed the claim `keep` is still relying on.
    expect(api.release).not.toHaveBeenCalled();
    expect(selectLocalAgentTriggerHandler()).not.toBeNull();
    keep();
    expect(api.release).toHaveBeenCalledTimes(1);
  });

  it('keeps delivering after a handler throws', () => {
    const thrower = vi.fn(() => {
      throw new Error('surface exploded');
    });
    const drop = registerLocalAgentTriggerHandler('interactive', thrower);

    expect(() => api.fire()).not.toThrow();

    const background = vi.fn();
    registerLocalAgentTriggerHandler('background', background);
    drop();
    api.fire();
    expect(background).toHaveBeenCalledTimes(1);
  });

  it('survives a rejected claim without throwing', async () => {
    resetLocalAgentTriggerHandlersForTesting();
    const rejected = vi.fn(() => Promise.reject(new Error('no ipc')));
    (globalThis as Record<string, unknown>).api = {
      onLocalAgentTrigger: () => () => undefined,
      localAgentClaimTriggers: rejected,
      localAgentReleaseTriggers: () => Promise.reject(new Error('no ipc')),
    };
    const drop = registerLocalAgentTriggerHandler('background', () => undefined);
    await Promise.resolve();
    expect(rejected).toHaveBeenCalledTimes(1);
    expect(() => drop()).not.toThrow();
    await Promise.resolve();
  });
});
