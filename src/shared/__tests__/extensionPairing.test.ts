/**
 * GET /v1/extension-settings hands out the pairing token (audit robust #4).
 * It used to allow any caller with no Origin — a DNS-rebinding page's
 * same-origin fetch — and any chrome-extension origin.
 */
import { describe, expect, it } from 'vitest';
import { decideExtensionSettingsAccess, isWellFormedExtensionOrigin } from '../extensionPairing';

const GUM = `chrome-extension://${'a'.repeat(32)}`;
const OTHER = `chrome-extension://${'b'.repeat(32)}`;
const base = { host: '127.0.0.1:48971', port: 48971, authorized: false, pinnedOrigin: null as string | null };

describe('extension settings access', () => {
  it('refuses callers with no Origin (tools, DNS rebinding) and browser tabs', () => {
    expect(decideExtensionSettingsAccess({ ...base, origin: undefined }).allow).toBe(false);
    expect(decideExtensionSettingsAccess({ ...base, origin: 'https://evil.example' }).allow).toBe(false);
    expect(decideExtensionSettingsAccess({ ...base, origin: 'chrome-extension://short' }).allow).toBe(false);
  });

  it('refuses a rebinding Host even with an extension-looking Origin', () => {
    expect(decideExtensionSettingsAccess({ ...base, origin: GUM, host: 'evil.example:48971' }).allow).toBe(false);
    expect(decideExtensionSettingsAccess({ ...base, origin: GUM, host: '127.0.0.1:1' }).allow).toBe(false);
    expect(decideExtensionSettingsAccess({ ...base, origin: GUM, host: 'localhost:48971' }).allow).toBe(true);
  });

  it('the real extension still pulls: first pull pins it, later pulls from it work without a token', () => {
    expect(decideExtensionSettingsAccess({ ...base, origin: GUM })).toEqual({ allow: true, pin: GUM });
    expect(decideExtensionSettingsAccess({ ...base, origin: GUM, pinnedOrigin: GUM })).toEqual({ allow: true, pin: null });
  });

  it('another extension cannot pull once Gum is paired, unless it has the token', () => {
    expect(decideExtensionSettingsAccess({ ...base, origin: OTHER, pinnedOrigin: GUM })).toMatchObject({ allow: false, status: 401 });
    expect(decideExtensionSettingsAccess({ ...base, origin: OTHER, pinnedOrigin: GUM, authorized: true })).toEqual({ allow: true, pin: OTHER });
  });

  it('validates extension origins strictly', () => {
    expect(isWellFormedExtensionOrigin(GUM)).toBe(true);
    expect(isWellFormedExtensionOrigin(`${GUM}/x`)).toBe(false);
    expect(isWellFormedExtensionOrigin(`chrome-extension://${'z'.repeat(32)}`)).toBe(false);
  });
});
