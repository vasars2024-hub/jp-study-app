import { describe, expect, it } from 'vitest';
import { qbitCredentialGap, qbitCredentialRef } from '../subtitleNyaa';

const PASSWORD = {
  authMode: 'password' as const,
  username: 'admin',
  passwordRef: 'qbit/webui',
  apiKeyRef: '',
};

const KEY = {
  authMode: 'apiKey' as const,
  username: '',
  passwordRef: '',
  apiKeyRef: 'qbit/apikey',
};

describe('qbitCredentialGap', () => {
  it('passes a fully configured profile in either mode', () => {
    expect(qbitCredentialGap({ qbittorrent: PASSWORD, secretStored: true })).toBeNull();
    expect(qbitCredentialGap({ qbittorrent: KEY, secretStored: true })).toBeNull();
  });

  it('names the missing piece rather than failing generically', () => {
    expect(
      qbitCredentialGap({ qbittorrent: { ...PASSWORD, username: '' }, secretStored: true })?.detail,
    ).toMatch(/no username has been entered/);
    expect(
      qbitCredentialGap({ qbittorrent: { ...PASSWORD, passwordRef: '' }, secretStored: false })?.detail,
    ).toMatch(/no password has been entered/);
    expect(
      qbitCredentialGap({ qbittorrent: { ...KEY, apiKeyRef: '' }, secretStored: false })?.detail,
    ).toMatch(/no key has been entered/);
  });

  it('separates "never entered" from "entered, then lost from the store"', () => {
    const never = qbitCredentialGap({ qbittorrent: { ...PASSWORD, passwordRef: '' }, secretStored: false });
    const lost = qbitCredentialGap({ qbittorrent: PASSWORD, secretStored: false });
    expect(never?.detail).not.toBe(lost?.detail);
    expect(lost?.detail).toMatch(/no longer in this machine/);
  });

  it('reads only the mode in force', () => {
    // NEGATIVE CONTROL for the whole point of the mode split: key mode with a
    // stored key must pass while the password side is completely empty, and
    // password mode must not be rescued by a stored key.
    expect(
      qbitCredentialGap({
        qbittorrent: { authMode: 'apiKey', username: '', passwordRef: '', apiKeyRef: 'qbit/apikey' },
        secretStored: true,
      }),
    ).toBeNull();
    expect(
      qbitCredentialGap({
        qbittorrent: { authMode: 'password', username: 'admin', passwordRef: '', apiKeyRef: 'qbit/apikey' },
        secretStored: true,
      })?.mode,
    ).toBe('password');
  });

  it('treats a config predating the field as password, matching main', () => {
    const legacy = { username: 'admin', passwordRef: '', apiKeyRef: '' } as unknown as typeof PASSWORD;
    expect(qbitCredentialGap({ qbittorrent: legacy, secretStored: false })?.mode).toBe('password');
  });

  it('does not accept whitespace as a configured ref or username', () => {
    expect(qbitCredentialGap({ qbittorrent: { ...PASSWORD, username: '   ' }, secretStored: true })).not.toBeNull();
    expect(qbitCredentialGap({ qbittorrent: { ...KEY, apiKeyRef: '  ' }, secretStored: true })).not.toBeNull();
  });
});

describe('qbitCredentialRef', () => {
  it('returns the ref the mode in force actually reads', () => {
    expect(qbitCredentialRef(PASSWORD)).toBe('qbit/webui');
    expect(qbitCredentialRef(KEY)).toBe('qbit/apikey');
  });

  it('returns empty when there is nothing to ask the vault about', () => {
    expect(qbitCredentialRef({ ...PASSWORD, passwordRef: '  ' })).toBe('');
    expect(qbitCredentialRef({ ...KEY, apiKeyRef: '' })).toBe('');
  });
});
