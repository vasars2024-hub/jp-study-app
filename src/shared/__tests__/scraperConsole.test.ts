import { describe, expect, it, vi } from 'vitest';
import {
  SCRAPER_CONSOLE_COMMANDS,
  SCRAPER_CONSOLE_COMMAND_IDS,
  formatConsoleValue,
  resolveConsoleCommand,
  runConsoleCommand,
  type ScraperConsoleSource,
} from '../scraperConsole';
import { SCRAPER_METHODS } from '../scraperIpc';
import type {
  ExportRecord,
  LogLine,
  ScrapeJobSummary,
  SourceStatus,
} from '../scraperResults';

function job(id: string, stage: ScrapeJobSummary['stage']): ScrapeJobSummary {
  return {
    id,
    seriesId: 'series-1',
    titleEn: 'One Piece',
    titleJa: 'ワンピース',
    provider: 'nyaa',
    profile: 'balanced',
    stage,
    ageMinutes: 3,
    durationSec: 42,
    found: 28,
    failed: 0,
    bytes: 1_024,
    note: '',
  };
}

function source(overrides: Partial<ScraperConsoleSource> = {}): ScraperConsoleSource {
  const logs: LogLine[] = [
    { id: 'l1', offsetMs: 0, level: 'info', channel: 'system', message: 'ready', correlationId: '' },
  ];
  const sources: SourceStatus[] = [
    {
      id: 'nyaa',
      label: 'nyaa.si',
      host: 'nyaa.si',
      kind: 'torrent',
      enabled: true,
      priority: 1,
      fallbackIds: [],
      health: 'ok',
      latencyMs: 142,
      supportsSubtitles: false,
      requiresAuth: false,
      history: [1, 1],
    },
  ];
  const exports: ExportRecord[] = [
    { id: 'e1', format: 'json', destination: 'C:/tmp/a.json', records: 28, ageMinutes: 5, outcome: 'ok', note: '' },
  ];
  return {
    backendCapabilities: async () => [...SCRAPER_METHODS],
    systemStats: async () => ({ memoryMb: 152, cpuPercent: 2, activeJobs: 1 }),
    listJobs: async () => [job('job-1', 'fetching'), job('job-2', 'done')],
    listSources: async () => sources,
    listPlugins: async () => [],
    listExports: async () => exports,
    activeProfile: () => ({
      profileId: 'balanced',
      profileName: 'Balanced',
      preset: 'balanced',
      concurrentRequests: 4,
      requestTimeoutMs: 30_000,
      retryAttempts: 3,
      crawlDelayMs: 1_500,
      maxRequestsPerMinute: 30,
      respectRobotsTxt: true,
      cacheMode: 'standard',
      sourcesEnabled: 2,
    }),
    recentLogs: () => logs,
    ...overrides,
  };
}

describe('the console allow-list', () => {
  it('resolves every published id to itself', () => {
    for (const id of SCRAPER_CONSOLE_COMMAND_IDS) {
      expect(resolveConsoleCommand(id)?.id, id).toBe(id);
    }
  });

  it('accepts surrounding whitespace and casing, and nothing else', () => {
    expect(resolveConsoleCommand('  System.Stats  ')?.id).toBe('system.stats');
    expect(resolveConsoleCommand('system stats')).toBeNull();
    expect(resolveConsoleCommand('system.stats()')).toBeNull();
    expect(resolveConsoleCommand('')).toBeNull();
    expect(resolveConsoleCommand('   ')).toBeNull();
  });

  it('does not answer inherited Object properties', () => {
    // The previous implementation indexed a plain object literal, so typing
    // `constructor` handed back Object itself and `__proto__` handed back a
    // prototype. A console that "executes nothing" still leaked internals.
    for (const probe of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
      expect(resolveConsoleCommand(probe), probe).toBeNull();
    }
  });

  it('never resolves anything that is not a member of the frozen list', () => {
    const members = new Set<unknown>(SCRAPER_CONSOLE_COMMANDS);
    for (const probe of [
      'window.api',
      'require("fs")',
      'localStorage.clear()',
      'system.stats; drop table',
      'JOBS.ACTIVE ',
    ]) {
      const resolved = resolveConsoleCommand(probe);
      if (resolved) expect(members.has(resolved), probe).toBe(true);
    }
  });

  it('points every command at a port method that exists, or at renderer state', () => {
    const methods = new Set<string>(SCRAPER_METHODS);
    for (const command of SCRAPER_CONSOLE_COMMANDS) {
      if (!command.requires) continue;
      expect(methods.has(command.requires), command.id).toBe(true);
    }
  });
});

describe('formatConsoleValue', () => {
  it('passes a string through and pretty-prints structure', () => {
    expect(formatConsoleValue('done')).toBe('done');
    expect(formatConsoleValue({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it('renders nothing-shaped values without producing "undefined"', () => {
    expect(formatConsoleValue(undefined)).toBe('null');
    expect(formatConsoleValue(null)).toBe('null');
    expect(formatConsoleValue(() => 1)).not.toBe('undefined');
  });

  it('survives a value JSON cannot express', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => formatConsoleValue(cyclic)).not.toThrow();
  });
});

describe('runConsoleCommand', () => {
  it('reports unknown input as a miss and runs nothing', async () => {
    const stub = source();
    const spies = {
      systemStats: vi.spyOn(stub, 'systemStats'),
      listJobs: vi.spyOn(stub, 'listJobs'),
      listSources: vi.spyOn(stub, 'listSources'),
    };
    const result = await runConsoleCommand('alert(1)', stub);
    expect(result.status).toBe('unknown-command');
    expect(result.id).toBe('');
    expect(result.output).toBe('');
    expect(result.input).toBe('alert(1)');
    for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
  });

  it('answers system.stats from the live reading', async () => {
    const result = await runConsoleCommand('system.stats', source());
    expect(result.status).toBe('ok');
    expect(result.live).toBe(true);
    expect(JSON.parse(result.output)).toEqual({ memoryMb: 152, cpuPercent: 2, activeJobs: 1 });
  });

  it('counts only jobs that have not reached a terminal stage as active', async () => {
    const active = JSON.parse((await runConsoleCommand('jobs.active', source())).output);
    expect(active.count).toBe(1);
    expect(active.jobs[0].id).toBe('job-1');

    const recent = JSON.parse((await runConsoleCommand('jobs.recent', source())).output);
    expect(recent.count).toBe(2);
  });

  it('splits the capability list into implemented and sample-data halves', async () => {
    const stub = source({ backendCapabilities: async () => ['systemStats', 'listJobs'] });
    const answer = JSON.parse((await runConsoleCommand('backend.capabilities', stub)).output);
    // Reported in SCRAPER_METHODS order, not in the order main happened to list.
    expect(answer.implemented).toEqual(['listJobs', 'systemStats']);
    expect(answer.sampleData).not.toContain('systemStats');
    expect(answer.sampleData.length).toBe(SCRAPER_METHODS.length - 2);
  });

  it('marks a reading as sample data when its backend method is missing', async () => {
    const stub = source({ backendCapabilities: async () => [] });
    const result = await runConsoleCommand('sources.health', stub);
    expect(result.status).toBe('ok');
    expect(result.live).toBe(false);
  });

  it('treats a backend that cannot report capabilities as not live', async () => {
    const stub = source({
      backendCapabilities: async () => {
        throw new Error('no bridge');
      },
    });
    const result = await runConsoleCommand('system.stats', stub);
    expect(result.status).toBe('ok');
    expect(result.live).toBe(false);
  });

  it('answers renderer-local commands live even with no backend at all', async () => {
    const stub = source({ backendCapabilities: async () => [] });
    for (const id of ['help', 'profile.active'] as const) {
      const result = await runConsoleCommand(id, stub);
      expect(result.status, id).toBe('ok');
      expect(result.live, id).toBe(true);
    }
  });

  it('reports a failed read instead of throwing at the page', async () => {
    const stub = source({
      listSources: async () => {
        throw new Error('probe timed out');
      },
    });
    const result = await runConsoleCommand('sources.health', stub);
    expect(result.status).toBe('failed');
    expect(result.detail).toBe('probe timed out');
    expect(result.output).toBe('');
  });

  it('lists exactly the published ids in help', async () => {
    const answer = JSON.parse((await runConsoleCommand('help', source())).output);
    expect(answer.commands).toEqual([...SCRAPER_CONSOLE_COMMAND_IDS]);
  });

  it('reads the log tail the page is holding', async () => {
    const lines = JSON.parse((await runConsoleCommand('logs.tail', source())).output);
    expect(lines).toEqual([{ level: 'info', channel: 'system', message: 'ready' }]);
  });
});
