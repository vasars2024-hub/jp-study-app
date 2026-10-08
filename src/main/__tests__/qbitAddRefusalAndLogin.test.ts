// @vitest-environment node
/**
 * qBittorrent 4.x refusals, the SID cookie name and the login back-off.
 *
 * - `200 Fails.` from `torrents/add` is 4.x refusing every link: it must fail
 *   each row and must not hand anything to the ingest ledger.
 * - The session cookie is the one named exactly `SID`, not `WEBUI_SID`.
 * - A refused login is not retried on every call: qBittorrent bans the IP.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TorrentRow } from '../../shared/scraperResults';

const scraperRequest = vi.fn();
const getScraperSecret = vi.fn();
const emitAcquisitionHandoff = vi.fn();

vi.mock('../scraper/http', () => ({
  scraperRequest: (...args: unknown[]) => scraperRequest(...args),
  MAX_BODY_BYTES_CEILING: 64 * 1024 * 1024,
  SCRAPER_USER_AGENT: 'test-agent',
}));

vi.mock('../scraper/credentials', () => ({
  getScraperSecret: (...args: unknown[]) => getScraperSecret(...args),
}));

vi.mock('../scraper/handoffs', () => ({
  emitAcquisitionHandoff: (...args: unknown[]) => emitAcquisitionHandoff(...args),
}));

vi.mock('../scraper/logBus', () => ({ scraperLog: () => undefined }));

// vi.mock is hoisted above this import, and the factories only touch the
// `vi.fn()`s when a call is made, by which time they exist.
import {
  QBIT_LOGIN_BACKOFF_MIN_MS,
  isLegacyAddRefusal,
  magnetInfoHash,
  qbitPollTorrents,
  qbitSend,
  qbitTest,
  resetQbitSessions,
  sidCookieOf,
} from '../scraper/qbittorrent';

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

const HASH = '0123456789abcdef0123456789abcdef01234567';

function row(id: string, magnet = `magnet:?xt=urn:btih:${HASH}`): TorrentRow {
  return {
    id,
    infoHash: '',
    name: `Show - ${id}`,
    releaseGroup: '',
    resolution: '1080p',
    seeders: 5,
    leechers: 0,
    availability: 1,
    tracker: 'nyaa',
    sizeBytes: 1,
    ageDays: 0,
    fileCount: 1,
    subtitleLanguages: [],
    isBatch: false,
    magnet,
  } as TorrentRow;
}

type Answer = { status: number; body?: string; rawSetCookie?: string };
/** Routes by path; login answers come from `loginAnswers` in order. */
function route(answers: { login?: Answer[]; add?: Answer; info?: Answer }) {
  const logins = [...(answers.login ?? [])];
  scraperRequest.mockReset();
  scraperRequest.mockImplementation(async (url: string) => {
    const reply = (a: Answer) => ({ status: a.status, body: a.body ?? '', rawSetCookie: a.rawSetCookie ?? '', truncated: false });
    if (url.endsWith('/api/v2/auth/login')) return reply(logins.shift() ?? { status: 401 });
    if (url.endsWith('/api/v2/torrents/add')) return reply(answers.add ?? { status: 200, body: 'Ok.' });
    if (url.includes('/api/v2/torrents/info')) return reply(answers.info ?? { status: 200, body: '[]' });
    return reply({ status: 200, body: 'v4.6.7' });
  });
}

const OK_LOGIN: Answer = { status: 200, body: 'Ok.', rawSetCookie: 'SID=good; HttpOnly; path=/' };

beforeEach(() => {
  resetQbitSessions();
  getScraperSecret.mockReset();
  getScraperSecret.mockResolvedValue('pw');
  emitAcquisitionHandoff.mockReset();
  vi.useRealTimers();
});

describe('torrents/add body classification', () => {
  it('treats Ok. and an empty body as success, anything else as a refusal', () => {
    expect(isLegacyAddRefusal('Ok.')).toBe(false);
    expect(isLegacyAddRefusal(' Ok.\n')).toBe(false);
    expect(isLegacyAddRefusal('')).toBe(false);
    expect(isLegacyAddRefusal('Fails.')).toBe(true);
    expect(isLegacyAddRefusal('Something else')).toBe(true);
  });

  it('fails every row of a 200 Fails. and hands nothing off', async () => {
    route({ login: [OK_LOGIN], add: { status: 200, body: 'Fails.' } });
    const report = await qbitSend({ config: CONFIG, rows: [row('1'), row('2', 'magnet:?xt=urn:btih:' + 'b'.repeat(40))], ingest: { hint: { title: 'Show' } } });
    expect(report.sent).toBe(0);
    expect(report.failed).toBe(2);
    expect(report.details[0].reason).toBe('qBittorrent answered 200: Fails.');
    expect(emitAcquisitionHandoff).not.toHaveBeenCalled();
  });

  it('names a 200 Fails. duplicate as already present', async () => {
    route({ login: [OK_LOGIN], add: { status: 200, body: 'Fails.' }, info: { status: 200, body: JSON.stringify([{ hash: HASH.toUpperCase() }]) } });
    const report = await qbitSend({ config: CONFIG, rows: [row('1')] });
    expect(report.details[0].reason).toBe('Already in qBittorrent.');
  });

  it('still hands off a 200 Ok. send', async () => {
    route({ login: [OK_LOGIN], add: { status: 200, body: 'Ok.' } });
    const report = await qbitSend({ config: CONFIG, rows: [row('1')], ingest: { hint: { title: 'Show' } } });
    expect(report.sent).toBe(1);
    expect(emitAcquisitionHandoff).toHaveBeenCalledTimes(1);
  });
});

describe('the session cookie', () => {
  it('reads the cookie named exactly SID', () => {
    expect(sidCookieOf('WEBUI_SID=decoy; path=/; SID=real; HttpOnly')).toBe('SID=real');
    expect(sidCookieOf('SID=abc; path=/')).toBe('SID=abc');
    expect(sidCookieOf('QBT_SID_8080=x; path=/')).toBe('');
    expect(sidCookieOf('a=b, SID=z; path=/')).toBe('SID=z');
    expect(sidCookieOf('')).toBe('');
  });

  it('logs in with SID even when a *_SID cookie comes first', async () => {
    route({ login: [{ status: 204, rawSetCookie: 'WEBUI_SID=decoy; path=/; SID=real; HttpOnly' }], info: { status: 200, body: '[]' } });
    expect((await qbitPollTorrents({ config: CONFIG })).ok).toBe(true);
    const infoCall = scraperRequest.mock.calls.find(([url]) => String(url).includes('torrents/info'));
    expect((infoCall?.[1] as { headers: Record<string, string> }).headers.cookie).toBe('SID=real');
  });
});

describe('magnetInfoHash', () => {
  it('decodes a base32 btih to hex', () => {
    expect(magnetInfoHash(`magnet:?xt=urn:btih:${'A'.repeat(32)}&dn=x`)).toBe('0'.repeat(40));
    expect(magnetInfoHash(`magnet:?xt=urn:btih:${HASH.toUpperCase()}`)).toBe(HASH);
    expect(magnetInfoHash('magnet:?xt=urn:btih:cc')).toBe('');
  });
});

describe('login back-off after a refusal', () => {
  const loginCalls = () => scraperRequest.mock.calls.filter(([url]) => String(url).endsWith('/auth/login')).length;

  it('does not log in again within the window for the same password', async () => {
    route({ login: [{ status: 200, body: 'Fails.' }, OK_LOGIN] });
    const first = await qbitPollTorrents({ config: CONFIG });
    expect(first.ok).toBe(false);
    const second = await qbitPollTorrents({ config: CONFIG });
    expect(second).toMatchObject({ ok: false, status: 'unauthorized' });
    expect(loginCalls()).toBe(1);
  });

  it('tries again after the window, and for a different password at once', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    route({ login: [{ status: 401 }, OK_LOGIN, OK_LOGIN] });
    await qbitPollTorrents({ config: CONFIG });
    getScraperSecret.mockResolvedValue('new-pw');
    expect((await qbitPollTorrents({ config: CONFIG })).ok).toBe(true);
    expect(loginCalls()).toBe(2);

    resetQbitSessions();
    route({ login: [{ status: 401 }, OK_LOGIN] });
    await qbitPollTorrents({ config: CONFIG });
    vi.setSystemTime(Date.now() + QBIT_LOGIN_BACKOFF_MIN_MS + 1);
    expect((await qbitPollTorrents({ config: CONFIG })).ok).toBe(true);
    expect(loginCalls()).toBe(2);
  });

  it('lets an explicit Test through the back-off', async () => {
    route({ login: [{ status: 401 }, { status: 401 }] });
    await qbitPollTorrents({ config: CONFIG });
    await qbitTest({ config: CONFIG });
    expect(loginCalls()).toBe(2);
  });
});
