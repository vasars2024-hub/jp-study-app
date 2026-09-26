/**
 * GET /v1/extension-settings hands out the pairing token (audit robust #4).
 * It used to allow any caller with no Origin — a DNS-rebinding page's
 * same-origin fetch — and any chrome-extension origin.
 */
import { describe, expect, it } from 'vitest';
import { decideExtensionSettingsAccess, isWellFormedExtensionOrigin, mayEchoCors } from '../extensionPairing';

const GUM = `chrome-extension://${'a'.repeat(32)}`;
const OTHER = `chrome-extension://${'b'.repeat(32)}`;
const base = { host: '127.0.0.1:48971', port: 48971, authorized: false, pinnedOrigin: null as string | null };

describe('extension settings access', () => {
  it('refuses callers with no Origin (tools, DNS rebinding) and browser tabs', () => {
    expect(decideExtensionSettingsAccess({ ...base, origin: undefined }).allow).toBe(false);
    expect(decideExtensionSettingsAccess({ ...base, origin: 'https://evil.example' }).allow).toBe(false);
    expect(decideExtensionSettingsAccess({ ...base, origin: 'chrome-extension://short' }).allow).toBe(false);
  });

  it("pairs the real extension, whose Pull Chrome sends with no Origin (Sec-Fetch-Site: none, mode cors)", () => {
    const ext = { ...base, origin: undefined, secFetchSite: 'none', secFetchMode: 'cors' };
    expect(decideExtensionSettingsAccess({ ...ext, pairingOpen: true })).toEqual({ allow: true, pin: null });
    expect(decideExtensionSettingsAccess({ ...ext, authorized: true })).toEqual({ allow: true, pin: null });
    expect(decideExtensionSettingsAccess(ext)).toMatchObject({ allow: false, status: 401 });
    // An address-bar visit and a web page's fetch are still refused.
    expect(decideExtensionSettingsAccess({ ...ext, secFetchMode: 'navigate', pairingOpen: true }).allow).toBe(false);
    expect(decideExtensionSettingsAccess({ ...ext, secFetchSite: 'same-origin', pairingOpen: true }).allow).toBe(false);
    expect(decideExtensionSettingsAccess({ ...ext, host: 'evil.example:48971', pairingOpen: true }).allow).toBe(false);
  });

  it('refuses a rebinding Host even with an extension-looking Origin', () => {
    expect(decideExtensionSettingsAccess({ ...base, origin: GUM, host: 'evil.example:48971' }).allow).toBe(false);
    expect(decideExtensionSettingsAccess({ ...base, origin: GUM, host: '127.0.0.1:1' }).allow).toBe(false);
    expect(decideExtensionSettingsAccess({ ...base, origin: GUM, host: 'localhost:48971', pairingOpen: true }).allow).toBe(true);
  });

  it('the real extension still pulls: a pull during "Pair now" pins it, later pulls work without a token', () => {
    expect(decideExtensionSettingsAccess({ ...base, origin: GUM, pairingOpen: true })).toEqual({ allow: true, pin: GUM });
    expect(decideExtensionSettingsAccess({ ...base, origin: GUM, pinnedOrigin: GUM })).toEqual({ allow: true, pin: null });
  });

  it('nothing pinned is not an open door: without the pairing window or the token, nobody gets it', () => {
    // Every upgrade from a state file without a pin, and every "New token".
    expect(decideExtensionSettingsAccess({ ...base, origin: OTHER })).toMatchObject({ allow: false, status: 401 });
  });

  it('echoes CORS only for the paired extension, or any extension while pairing is open', () => {
    expect(mayEchoCors(GUM, GUM, false)).toBe(true);
    expect(mayEchoCors(OTHER, GUM, false)).toBe(false);
    expect(mayEchoCors(OTHER, null, false)).toBe(false);
    expect(mayEchoCors(OTHER, null, true)).toBe(true);
    expect(mayEchoCors('https://evil.example', null, true)).toBe(false);
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
