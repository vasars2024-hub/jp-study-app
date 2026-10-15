// @vitest-environment node
/**
 * "Save problem report…" (main/problemReport.ts): the zip's layout, and the
 * redaction every text in it goes through: API keys, tokens and paths under the
 * user's home folder never reach the file. The save dialog itself is main's
 * (crashRecovery.ts); the headless e2e never opens it.
 */
import { describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));

import {
  buildProblemReportZip,
  createProblemReportRedactor,
  problemReportFileName,
  PROBLEM_REPORT_MAX_DUMPS,
  type ProblemReportInput,
} from '../problemReport';

const HOME = 'C:\\Users\\Rolli';

function input(over: Partial<ProblemReportInput> = {}): ProblemReportInput {
  return {
    appVersion: '1.1.0',
    os: 'win32 10.0.26200 x64',
    createdAt: new Date('2026-10-15T04:12:00Z'),
    homeDir: HOME,
    summary: { appVersion: '1.1.0', platform: 'win32', exe: 'C:\\Users\\Rolli\\AppData\\Local\\jp_study_app\\app-1.1.0\\Gum.exe' },
    log: [],
    settings: {},
    dumps: [],
    crashReportsOn: false,
    ...over,
  };
}

function unpack(zip: Uint8Array): Record<string, string> {
  const files = unzipSync(zip);
  return Object.fromEntries(Object.entries(files).map(([k, v]) => [k, k.endsWith('.dmp') ? `<${v.byteLength} bytes>` : strFromU8(v)]));
}

describe('problem report redaction', () => {
  const r = createProblemReportRedactor({ homeDir: HOME });

  it('strips API keys and tokens in any shape', () => {
    const line = 'POST failed: x-goog-api-key: AIzaSyA1234567890abcdefghijklmnop Bearer abcdefghijklmnop123 apiKey="sk-ant-api03-abcdefghijklmnopqrstuv" token=9f8e7d6c5b4a39281706f5e4d3c2b1a0';
    const out = r.text(line);
    expect(out).not.toMatch(/AIzaSy|abcdefghijklmnop123|sk-ant-api03|9f8e7d6c5b4a/);
    expect(out).toMatch(/\[redacted/);
  });

  it('replaces every path under the home folder, in any spelling', () => {
    const out = r.text(
      [
        'open C:\\Users\\Rolli\\Documents\\My Books\\Secret Novel.epub failed',
        'cwd c:/users/rolli/dev/jp-study-app',
        '{"dir":"C:\\\\Users\\\\Rolli\\\\Music"}',
        'other profile D:\\x and C:\\Users\\someone\\Desktop\\a.txt',
      ].join('\n'),
    );
    expect(out).not.toMatch(/Rolli|rolli|Secret Novel|My Books|someone/i);
    expect(out).toContain('open [home-path] failed');
    expect(out).toContain('cwd [home-path]');
    // A path outside the home folder is not personal: kept.
    expect(out).toContain('D:\\x');
  });

  it('does not touch a different user that only starts with the same name', () => {
    expect(createProblemReportRedactor({ homeDir: 'C:\\Users\\Ann' }).text('E:\\Users2\\Anna\\x')).toBe('E:\\Users2\\Anna\\x');
  });

  it('a POSIX home is matched too', () => {
    const posix = createProblemReportRedactor({ homeDir: '/home/rolli' });
    expect(posix.text('read /home/rolli/.config/gum/x.json: ENOENT')).toBe('read [home-path]: ENOENT');
  });

  it('settings fields named like secrets are removed whatever their value', () => {
    const v = r.value({
      channel: 'beta',
      apiKey: 'short',
      nested: { refresh_token: 'x', pinHash: 'scrypt1:abc', password: 12345, enabled: true, cookieJar: { a: 1 } },
      list: ['C:\\Users\\Rolli\\x.txt', 'plain'],
      tokensEnabled: false,
    }) as Record<string, unknown>;
    expect(v).toEqual({
      channel: 'beta',
      apiKey: '[redacted]',
      nested: { refresh_token: '[redacted]', pinHash: '[redacted]', password: '[redacted]', enabled: true, cookieJar: '[redacted]' },
      list: ['[home-path]', 'plain'],
      tokensEnabled: false,
    });
  });
});

describe('problem report zip', () => {
  it('has the report, summary, log, allowlisted settings and dumps, all redacted', () => {
    const big = new Uint8Array(30 * 1024 * 1024);
    const { zip, files } = buildProblemReportZip(
      input({
        log: [
          { ts: '2026-10-15T04:00:00Z', severity: 'error', subsystem: 'ai', operation: 'call', detail: 'HTTP 401 apiKey=sk-or-v1-abcdefghijklmnopqrstuvwxyz at C:\\Users\\Rolli\\AppData\\x.json' },
        ],
        settings: {
          'app-update-state.json': JSON.stringify({ channel: 'stable', autoCheck: true, token: 'abcdef123456' }),
          'config.json': '{"libraryDir":"C:\\\\Users\\\\Rolli\\\\Gum Library"}',
          // Not on the allowlist: never included, even if a caller passes it.
          'mal-tokens.json': JSON.stringify({ access_token: 'x'.repeat(40) }),
          'lockscreen-lock.json': JSON.stringify({ pinHash: 'scrypt1:zzz' }),
        },
        ui: { lang: 'ja', materials: 'aero' },
        dumps: [
          { name: 'abc.dmp', data: new Uint8Array([1, 2, 3]) },
          { name: 'huge.dmp', data: big },
        ],
        crashReportsOn: true,
      }),
    );
    expect(files[0]).toBe('report.txt');
    expect(files.sort()).toEqual(
      ['crashes/abc.dmp', 'log.txt', 'report.txt', 'settings/app-update-state.json', 'settings/config.json', 'settings/ui.json', 'summary.json'].sort(),
    );
    const out = unpack(zip);
    const all = Object.values(out).join('\n');
    expect(all).not.toMatch(/Rolli|sk-or-v1|abcdef123456|scrypt1|Gum Library/);
    expect(out['report.txt']).toMatch(/Gum version: 1\.1\.0/);
    expect(out['report.txt']).toMatch(/OS: win32 10\.0\.26200 x64/);
    expect(out['report.txt']).toMatch(/Crash files included: 1/);
    expect(out['report.txt']).toMatch(/not been sent anywhere/);
    expect(out['log.txt']).toMatch(/ERROR ai\/call: HTTP 401/);
    expect(JSON.parse(out['settings/app-update-state.json']!)).toEqual({ channel: 'stable', autoCheck: true, token: '[redacted]' });
    expect(JSON.parse(out['settings/config.json']!)).toEqual({ libraryDir: '[home-path]' });
    expect(JSON.parse(out['summary.json']!).exe).toBe('[home-path]');
    expect(out['crashes/abc.dmp']).toBe('<3 bytes>');
  });

  it('keeps at most a few dumps, survives a torn settings file and an empty log', () => {
    const dumps = Array.from({ length: PROBLEM_REPORT_MAX_DUMPS + 3 }, (_, i) => ({ name: `d${i}.dmp`, data: new Uint8Array([i + 1]) }));
    const { files, zip } = buildProblemReportZip(input({ dumps, settings: { 'config.json': '{"dir":"C:\\Users\\Rolli\\x' } }));
    expect(files.filter((f) => f.startsWith('crashes/'))).toHaveLength(PROBLEM_REPORT_MAX_DUMPS);
    const out = unpack(zip);
    expect(out['settings/config.json']).not.toMatch(/Rolli/);
    expect(out['report.txt']).toMatch(/not valid JSON/);
    expect(out['log.txt']).toMatch(/empty/);
  });

  it('names the file by date', () => {
    expect(problemReportFileName(new Date(2026, 9, 15, 4, 7))).toBe('gum-problem-report-2026-10-15-0407.zip');
  });
});
