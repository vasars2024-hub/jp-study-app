/**
 * qBittorrent's login answers 204, and the client used to call that a failure.
 *
 * Measured 2026-09-03 against the user's own running daemon, with the WebUI on
 * 127.0.0.1:8080 and `WebUI\LocalHostAuth=true`:
 *
 *   correct password  -> 204, no body      (the app reported "unreachable")
 *   wrong password    -> 401               (probed twice, once with the
 *                                           scraper's own User-Agent, so the
 *                                           status is the credential's verdict
 *                                           and not a header artefact)
 *
 * The old code accepted only `200` with the body `Ok.`, so every CORRECT
 * password fell into the catch-all and told the user to check their host and
 * port while the connection was fine. These cases pin the fix, and the third
 * one pins what the fix must NOT become: a 204 is still only a login if
 * qBittorrent set a session cookie.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const scraperRequest = vi.fn();
const getScraperSecret = vi.fn();

vi.mock('../scraper/http', () => ({
  scraperRequest: (...args: unknown[]) => scraperRequest(...args),
  SCRAPER_USER_AGENT: 'test-agent',
}));

vi.mock('../scraper/credentials', () => ({
  getScraperSecret: (...args: unknown[]) => getScraperSecret(...args),
}));

const { qbitTest } = await import('../scraper/qbittorrent');

const CONFIG = {
  enabled: true,
  scheme: 'http',
  host: '127.0.0.1',
  port: 8080,
  authMode: 'password',
  username: 'admin',
  passwordRef: 'qbittorrent',
  apiKeyRef: '',
} as never;

/** The login answer, then the `/app/version` answer the test makes next. */
function respondWith(login: { status: number; body?: string; rawSetCookie?: string }) {
  scraperRequest.mockReset();
  scraperRequest
    .mockResolvedValueOnce({
      status: login.status,
      body: login.body ?? '',
      rawSetCookie: login.rawSetCookie ?? '',
      truncated: false,
    })
    .mockResolvedValue({ status: 200, body: '5.2.3', rawSetCookie: '', truncated: false });
}

describe('qbitTest login status handling', () => {
  beforeEach(() => {
    getScraperSecret.mockReset();
    getScraperSecret.mockResolvedValue('a-stored-password');
  });

  it('treats 204 with a session cookie as a connection, not "unreachable"', async () => {
    respondWith({ status: 204, rawSetCookie: 'SID=abc123; path=/' });
    const report = await qbitTest({ config: CONFIG });
    expect(report.status).toBe('connected');
    expect(report.message).not.toMatch(/answered 204/);
  });

  it('still accepts the legacy 200 "Ok." contract', async () => {
    respondWith({ status: 200, body: 'Ok.', rawSetCookie: 'SID=abc123; path=/' });
    expect((await qbitTest({ config: CONFIG })).status).toBe('connected');
  });

  // The fix must not become "any 204 is a login".
  it('refuses a 204 that carries no session cookie', async () => {
    respondWith({ status: 204, rawSetCookie: '' });
    const report = await qbitTest({ config: CONFIG });
    expect(report.status).not.toBe('connected');
    expect(report.message).toMatch(/no session cookie/i);
  });

  it('still reads 401 as a rejected credential', async () => {
    respondWith({ status: 401 });
    const report = await qbitTest({ config: CONFIG });
    expect(report.status).toBe('unauthorized');
    expect(report.message).toMatch(/username or password was rejected/i);
  });

  it('still reads an unexpected status as unreachable, naming it', async () => {
    respondWith({ status: 502 });
    const report = await qbitTest({ config: CONFIG });
    expect(report.status).toBe('unreachable');
    expect(report.message).toMatch(/answered 502/);
  });
});
