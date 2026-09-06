/**
 * Live defect pre-sweep — Scraper > Torrent Manager, D74.
 *
 * The connection pill read `qbit.connectionStatus`, which defaults to
 * `'not-configured'` and is written ONLY by an explicit Test Connection. So the
 * user's real, working, API-key-authenticated client was announced as "not
 * configured" beside its own stored key and address, and stayed that way until
 * they happened to press the button.
 *
 * Measured live 2026-09-06 on the profile that owns the store: `balanced`,
 * `enabled: true`, `authMode: 'apiKey'`, `apiKeyRef: 'qbittorent'`.
 *
 * The honest idle answer is `'unknown'` — configured, not yet checked. The rule
 * therefore has to fail in BOTH directions: a genuinely empty block must still
 * say `'not-configured'`, or the fix would simply have moved the lie.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCRAPER_QBITTORRENT_SETTINGS,
  isScraperQbitConfigured,
  scraperQbitIdleStatus,
  type ScraperQbittorrentSettings,
} from '../scraperSourceSettings';

function qbit(
  patch: Partial<ScraperQbittorrentSettings>,
): ScraperQbittorrentSettings {
  return { ...DEFAULT_SCRAPER_QBITTORRENT_SETTINGS, ...patch };
}

/** The user's actual configuration, as read out of the running app. */
const LIVE = qbit({
  enabled: true,
  authMode: 'apiKey',
  apiKeyRef: 'qbittorent',
  passwordRef: '',
  host: 'localhost',
  port: 8080,
});

describe('scraperQbitIdleStatus (D74)', () => {
  it("does not call the user's working client 'not configured'", () => {
    expect(isScraperQbitConfigured(LIVE)).toBe(true);
    expect(LIVE.connectionStatus).toBe('not-configured'); // never tested this session
    expect(scraperQbitIdleStatus(LIVE)).toBe('unknown');
  });

  it('still says not-configured when nothing has actually been set up', () => {
    expect(isScraperQbitConfigured(DEFAULT_SCRAPER_QBITTORRENT_SETTINGS)).toBe(
      false,
    );
    expect(scraperQbitIdleStatus(DEFAULT_SCRAPER_QBITTORRENT_SETTINGS)).toBe(
      'not-configured',
    );
  });

  it('a disabled client is not configured however complete its fields are', () => {
    expect(scraperQbitIdleStatus(qbit({ ...LIVE, enabled: false }))).toBe(
      'not-configured',
    );
  });

  it('only the credential for the mode in force counts', () => {
    // apiKey mode with a leftover password and no key: the drawer HIDES the
    // password row in this mode, so treating it as configured would point the
    // user at a field they cannot see. This is the shape that produced the
    // "needs the WebUI password" misdiagnosis twice.
    const keyModeNoKey = qbit({
      enabled: true,
      authMode: 'apiKey',
      apiKeyRef: '',
      passwordRef: 'qbittorent',
    });
    expect(scraperQbitIdleStatus(keyModeNoKey)).toBe('not-configured');

    const passwordModeWithPassword = qbit({
      enabled: true,
      authMode: 'password',
      apiKeyRef: '',
      passwordRef: 'qbit/webui',
    });
    expect(scraperQbitIdleStatus(passwordModeWithPassword)).toBe('unknown');
  });

  it('a real test result is never overwritten by the idle guess', () => {
    for (const recorded of ['connected', 'unauthorized', 'unreachable'] as const) {
      expect(scraperQbitIdleStatus(qbit({ ...LIVE, connectionStatus: recorded }))).toBe(
        recorded,
      );
    }
  });
});
