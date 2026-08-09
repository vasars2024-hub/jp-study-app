// @vitest-environment node
/**
 * The channel's shape is the security property, so these tests are mostly about
 * what the normalizer *refuses*: a request that names a destination is not
 * sanitized into a safe one, it is rejected outright.
 */
import { describe, expect, it } from 'vitest';
import {
  AGENT_NAVIGATION_CHANNELS,
  agentNavigationFailure,
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
  it('keeps a success whose section is on the allowlist', () => {
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

  it('names one invoke channel', () => {
    expect(AGENT_NAVIGATION_CHANNELS).toEqual({ run: 'agentNavigation:run' });
  });
});
