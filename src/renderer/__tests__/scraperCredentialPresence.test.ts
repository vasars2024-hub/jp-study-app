import { describe, expect, it } from 'vitest';
import {
  CREDENTIAL_PRESENCE_TONE,
  KEY_PRESENCE_TEXT,
  PASSWORD_PRESENCE_TEXT,
  resolveCredentialPresence,
  type CredentialPresence,
} from '../components/scraper/data/credentialPresence';
import { SCRAPER_TEXT } from '../components/scraper/strings';

describe('scraper credential presence', () => {
  it('reports orphaned when a ref is configured and the store is empty', () => {
    // The defect this exists for: the Torrent Manager pill read `passwordRef`
    // and said "password stored" while `scraperHasCredential('qbit/webui')`
    // answered false.
    expect(resolveCredentialPresence({ ref: 'qbit/webui', vaultHas: false })).toBe('orphaned');
  });

  it('reports stored only when main confirms the secret exists', () => {
    expect(resolveCredentialPresence({ ref: 'qbit/apikey', vaultHas: true })).toBe('stored');
  });

  it('never claims stored from a non-empty ref alone', () => {
    // Negative control for the exact substitution that produced the lie: every
    // answer other than `true` must refuse to say "stored", with the ref set.
    for (const vaultHas of [false, null, 'error'] as const) {
      expect(resolveCredentialPresence({ ref: 'qbit/webui', vaultHas })).not.toBe('stored');
    }
  });

  it('separates in-flight from answered-no', () => {
    expect(resolveCredentialPresence({ ref: 'qbit/webui', vaultHas: null })).toBe('checking');
    expect(resolveCredentialPresence({ ref: 'qbit/webui', vaultHas: false })).not.toBe('checking');
  });

  it('reports unset from an empty or whitespace ref without consulting the store', () => {
    expect(resolveCredentialPresence({ ref: '', vaultHas: true })).toBe('unset');
    expect(resolveCredentialPresence({ ref: '   ', vaultHas: true })).toBe('unset');
    expect(resolveCredentialPresence({ ref: undefined, vaultHas: null })).toBe('unset');
    expect(resolveCredentialPresence({ ref: null, vaultHas: false })).toBe('unset');
  });

  it('reports unknown when the probe itself failed, rather than guessing', () => {
    expect(resolveCredentialPresence({ ref: 'qbit/webui', vaultHas: 'error' })).toBe('unknown');
  });

  it('tones orphaned worse than unset, and claims nothing while checking', () => {
    expect(CREDENTIAL_PRESENCE_TONE.orphaned).toBe('bad');
    expect(CREDENTIAL_PRESENCE_TONE.unset).toBe('warn');
    expect(CREDENTIAL_PRESENCE_TONE.stored).toBe('good');
    expect(CREDENTIAL_PRESENCE_TONE.checking).toBe('neutral');
    expect(CREDENTIAL_PRESENCE_TONE.unknown).toBe('neutral');
  });

  it('has a distinct, resolvable scraper string for every state, in both modes', () => {
    const states: CredentialPresence[] = ['checking', 'stored', 'unset', 'orphaned', 'unknown'];
    for (const map of [PASSWORD_PRESENCE_TEXT, KEY_PRESENCE_TEXT]) {
      // Every state maps somewhere, and the target key really exists in the
      // scraper's text table — a typo'd key would render as `undefined`.
      const texts = states.map((state) => {
        const value = SCRAPER_TEXT[map[state]];
        expect(typeof value, map[state]).toBe('string');
        return value as string;
      });
      expect(new Set(texts).size).toBe(states.length);
      expect(Object.keys(map).sort()).toEqual([...states].sort());
    }
    // The two modes never share wording: "no password" under key auth was the
    // original complaint.
    for (const state of states) {
      expect(PASSWORD_PRESENCE_TEXT[state]).not.toBe(KEY_PRESENCE_TEXT[state]);
    }
  });
});
