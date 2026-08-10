// @vitest-environment node
/**
 * The channel's shape is the security property, so these tests are mostly about
 * what the normalizer *refuses*: a request that names a destination is not
 * sanitized into a safe one, it is rejected outright.
 */
import { describe, expect, it } from 'vitest';
import {
  AGENT_NAVIGATION_CHANNELS,
  AGENT_SETTINGS_DELIVERY_ATTEMPT_MS,
  AGENT_SETTINGS_DELIVERY_BUDGET_MS,
  agentNavigationFailure,
  agentSettingsDeliveryDecision,
  normalizeAgentNavigationRequest,
  normalizeAgentNavigationResult,
} from '../agentNavigationBridge';

const request = (overrides: Record<string, unknown> = {}) => ({
  conversationId: 'chat-1',
  messageId: 'msg-1',
  cardId: 'card-1',
  actionId: 'act-1',
  approved: true,
  ...overrides,
});

describe('agent navigation request', () => {
  it('accepts four ids and an approval, and nothing else', () => {
    expect(normalizeAgentNavigationRequest(request())).toEqual({
      conversationId: 'chat-1',
      messageId: 'msg-1',
      cardId: 'card-1',
      actionId: 'act-1',
      approved: true,
    });
  });

  it('refuses — never strips — a payload carrying a destination', () => {
    for (const field of ['section', 'page', 'destination', 'route', 'url', 'target', 'controlId', 'effect']) {
      expect(normalizeAgentNavigationRequest(request({ [field]: 'settings' })))
        .toBeNull();
    }
    // Even an undefined value counts: the caller expressed an intent to steer.
    expect(normalizeAgentNavigationRequest(request({ section: undefined }))).toBeNull();
  });

  it('treats anything other than a literal true as "not approved"', () => {
    for (const value of [false, undefined, 'true', 1, {}, null]) {
      expect(normalizeAgentNavigationRequest(request({ approved: value }))?.approved)
        .toBe(false);
    }
  });

  it('refuses a request missing any id, and trims and bounds the ones it has', () => {
    for (const field of ['conversationId', 'messageId', 'cardId', 'actionId']) {
      expect(normalizeAgentNavigationRequest(request({ [field]: '   ' }))).toBeNull();
      expect(normalizeAgentNavigationRequest(request({ [field]: 42 }))).toBeNull();
    }
    const long = 'x'.repeat(400);
    expect(normalizeAgentNavigationRequest(request({ cardId: `  ${long}  ` }))?.cardId)
      .toHaveLength(240);
    expect(normalizeAgentNavigationRequest(null)).toBeNull();
    expect(normalizeAgentNavigationRequest([request()])).toBeNull();
  });
});

describe('agent navigation result', () => {
  it('keeps a success whose section is on the allowlist and preserves its review page', () => {
    expect(normalizeAgentNavigationResult({
      ok: true,
      destination: { section: 'dictionary', page: 'entry/猫' },
      opened: true,
    })).toEqual({
      ok: true,
      destination: { section: 'dictionary', page: 'entry/猫' },
      opened: true,
    });
  });

  it('keeps an exact registered Settings page and highlighted control', () => {
    expect(normalizeAgentNavigationResult({
      ok: true,
      destination: {
        section: 'settings',
        page: 'appearance',
        controlId: 'theme',
        highlight: true,
      },
      opened: true,
    })).toEqual({
      ok: true,
      destination: {
        section: 'settings',
        page: 'appearance',
        controlId: 'theme',
        highlight: true,
      },
      opened: true,
    });
  });

  it('rejects control and highlight coordinates outside Settings', () => {
    for (const destination of [
      { section: 'dictionary', controlId: 'search' },
      { section: 'dictionary', highlight: true },
    ]) {
      expect(normalizeAgentNavigationResult({ ok: true, destination, opened: true }))
        .toEqual(agentNavigationFailure('invalid-request'));
    }
  });

  it('refuses a success naming a section the allowlist does not have', () => {
    expect(normalizeAgentNavigationResult({
      ok: true,
      destination: { section: 'admin' },
      opened: true,
    })).toEqual(agentNavigationFailure('invalid-request'));
    expect(normalizeAgentNavigationResult({
      ok: true,
      destination: { section: 'note' },
      opened: true,
    })).toEqual(agentNavigationFailure('invalid-request'));
  });

  it('reports an unopened review resolution as unopened', () => {
    expect(normalizeAgentNavigationResult({
      ok: true,
      destination: { section: 'stats' },
    })).toEqual({ ok: true, destination: { section: 'stats' }, opened: false });
  });

  it('keeps a known failure code and rejects an invented one', () => {
    expect(normalizeAgentNavigationResult({ ok: false, code: 'stale-provenance' }))
      .toEqual(agentNavigationFailure('stale-provenance'));
    expect(normalizeAgentNavigationResult({ ok: false, code: 'granted' }))
      .toEqual(agentNavigationFailure('invalid-request'));
    expect(normalizeAgentNavigationResult(undefined))
      .toEqual(agentNavigationFailure('invalid-request'));
  });

  it('names the invoke and renderer-delivery channels', () => {
    expect(AGENT_NAVIGATION_CHANNELS).toEqual({
      run: 'agentNavigation:run',
      settingsDelivery: 'agentNavigation:settings-delivery',
    });
  });
});

describe('Settings delivery finality', () => {
  const BUDGET = AGENT_SETTINGS_DELIVERY_BUDGET_MS;

  it('accepts as soon as Settings acknowledges', () => {
    expect(agentSettingsDeliveryDecision('accepted', 0, BUDGET)).toBe('accept');
    // Even past the budget: an acknowledgement that arrived is an acknowledgement.
    expect(agentSettingsDeliveryDecision('accepted', BUDGET * 4, BUDGET)).toBe('accept');
  });

  it('never re-offers a destination Settings judged invalid', () => {
    // The security property: a rejected destination must not become a success
    // because main asked a second time. True at every point in the budget.
    expect(agentSettingsDeliveryDecision('invalid', 0, BUDGET)).toBe('fail');
    expect(agentSettingsDeliveryDecision('invalid', 1, BUDGET)).toBe('fail');
    expect(agentSettingsDeliveryDecision('invalid', BUDGET - 1, BUDGET)).toBe('fail');
  });

  it('retries a window that has not mounted or cannot answer yet', () => {
    // The cold-open fix. Both of these were previously indistinguishable from
    // `invalid`, which is what made an approved cold open report failure.
    expect(agentSettingsDeliveryDecision('unhandled', 0, BUDGET)).toBe('retry');
    expect(agentSettingsDeliveryDecision('not-ready', 0, BUDGET)).toBe('retry');
    expect(agentSettingsDeliveryDecision('not-ready', BUDGET - 1, BUDGET)).toBe('retry');
  });

  it('fails honestly once the budget is spent rather than retrying forever', () => {
    expect(agentSettingsDeliveryDecision('not-ready', BUDGET, BUDGET)).toBe('fail');
    expect(agentSettingsDeliveryDecision('unhandled', BUDGET, BUDGET)).toBe('fail');
    expect(agentSettingsDeliveryDecision('not-ready', BUDGET + 1, BUDGET)).toBe('fail');
  });

  it('defaults to the shared budget, so main and this gate cannot drift', () => {
    expect(agentSettingsDeliveryDecision('not-ready', BUDGET - 1)).toBe('retry');
    expect(agentSettingsDeliveryDecision('not-ready', BUDGET)).toBe('fail');
    // A per-attempt wait longer than the whole budget could never retry once.
    expect(AGENT_SETTINGS_DELIVERY_ATTEMPT_MS).toBeLessThan(BUDGET);
  });
});
