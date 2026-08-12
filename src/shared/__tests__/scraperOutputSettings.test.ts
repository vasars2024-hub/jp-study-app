import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCRAPER_DEVELOPER_SETTINGS,
  DEFAULT_SCRAPER_EXPORT_SETTINGS,
  DEFAULT_SCRAPER_IMAGE_SETTINGS,
  DEFAULT_SCRAPER_LOGGING_SETTINGS,
  DEFAULT_SCRAPER_METADATA_SETTINGS,
  DEFAULT_SCRAPER_NOTIFICATION_SETTINGS,
  DEFAULT_SCRAPER_PERFORMANCE_SETTINGS,
  DEFAULT_SCRAPER_SCHEDULER_SETTINGS,
  DEFAULT_SCRAPER_VALIDATION_SETTINGS,
  cloneScraperOutputGroup,
  validateScraperDeveloperSettings,
  validateScraperExportSettings,
  validateScraperImageSettings,
  validateScraperLoggingSettings,
  validateScraperMetadataSettings,
  validateScraperNotificationSettings,
  validateScraperPerformanceSettings,
  validateScraperSchedulerSettings,
  validateScraperValidationSettings,
} from '../scraperOutputSettings';
import type { ScraperSettingsIssue } from '../scraperSettingsPrimitives';

function run<T>(
  fn: (input: unknown, fallback: T, issues: ScraperSettingsIssue[], p: string) => T,
  input: unknown,
  fallback: T,
) {
  const issues: ScraperSettingsIssue[] = [];
  const value = fn(input, fallback, issues, 'g');
  return { value, issues, paths: issues.map((i) => i.path) };
}

describe('image settings', () => {
  it('clamps dimensions to real display bounds', () => {
    const { value } = run(
      validateScraperImageSettings,
      { minWidth: 99_999, minHeight: -4 },
      DEFAULT_SCRAPER_IMAGE_SETTINGS,
    );
    expect(value.minWidth).toBe(7_680);
    expect(value.minHeight).toBe(0);
  });

  it('rejects an unsupported format', () => {
    const { value } = run(validateScraperImageSettings, { preferredFormat: 'bmp' }, DEFAULT_SCRAPER_IMAGE_SETTINGS);
    expect(value.preferredFormat).toBe(DEFAULT_SCRAPER_IMAGE_SETTINGS.preferredFormat);
  });
});

describe('metadata settings', () => {
  it('slugifies and caps the provider order', () => {
    const { value } = run(
      validateScraperMetadataSettings,
      { providerOrder: ['Jikan!', 'Ani List', ...Array.from({ length: 20 }, (_, i) => `p${i}`)] },
      DEFAULT_SCRAPER_METADATA_SETTINGS,
    );
    expect(value.providerOrder.slice(0, 2)).toEqual(['jikan', 'anilist']);
    expect(value.providerOrder.length).toBeLessThanOrEqual(10);
  });

  it('rejects an invented title language or merge strategy', () => {
    const { value } = run(
      validateScraperMetadataSettings,
      { titleLanguage: 'klingon', mergeStrategy: 'vibes' },
      DEFAULT_SCRAPER_METADATA_SETTINGS,
    );
    expect(value.titleLanguage).toBe(DEFAULT_SCRAPER_METADATA_SETTINGS.titleLanguage);
    expect(value.mergeStrategy).toBe(DEFAULT_SCRAPER_METADATA_SETTINGS.mergeStrategy);
  });
});

describe('performance settings', () => {
  it('keeps concurrency inside limits a desktop can survive', () => {
    const { value } = run(
      validateScraperPerformanceSettings,
      { maxParallelJobs: 500, maxParallelDownloads: 0, memoryBudgetMb: 1, cpuThrottlePercent: 500 },
      DEFAULT_SCRAPER_PERFORMANCE_SETTINGS,
    );
    expect(value.maxParallelJobs).toBe(16);
    expect(value.maxParallelDownloads).toBe(1);
    expect(value.memoryBudgetMb).toBe(128);
    expect(value.cpuThrottlePercent).toBe(100);
  });
});

describe('logging settings', () => {
  it('drops an unknown log channel', () => {
    const { value } = run(
      validateScraperLoggingSettings,
      { channels: ['engine', 'telepathy', 'qbit'] },
      DEFAULT_SCRAPER_LOGGING_SETTINGS,
    );
    expect(value.channels).toEqual(['engine', 'qbit']);
  });

  it('drops the pre-2026-08-05 channel names, which named nothing real', () => {
    // 'network' and 'extraction' were the shipped default and no call site has
    // ever passed either to scraperLog. They are unknown values now, which is
    // the correct reading — and the reason the default is [] (= every channel)
    // rather than an enumerated list.
    const { value } = run(
      validateScraperLoggingSettings,
      { channels: ['network', 'extraction', 'browser'] },
      DEFAULT_SCRAPER_LOGGING_SETTINGS,
    );
    expect(value.channels).toEqual([]);
  });

  it('rejects an unknown level', () => {
    const { value, paths } = run(validateScraperLoggingSettings, { level: 'shout' }, DEFAULT_SCRAPER_LOGGING_SETTINGS);
    expect(value.level).toBe(DEFAULT_SCRAPER_LOGGING_SETTINGS.level);
    expect(paths).toContain('g.level');
  });

  it('leaves redaction on unless explicitly turned off', () => {
    expect(run(validateScraperLoggingSettings, {}, DEFAULT_SCRAPER_LOGGING_SETTINGS).value.redactCookies).toBe(true);
    expect(
      run(validateScraperLoggingSettings, { redactCookies: 'no' }, DEFAULT_SCRAPER_LOGGING_SETTINGS).value.redactCookies,
    ).toBe(true);
  });
});

describe('validation settings', () => {
  it('bounds duration and title length', () => {
    const { value } = run(
      validateScraperValidationSettings,
      { minEpisodeDurationSec: -1, maxTitleLength: 4 },
      DEFAULT_SCRAPER_VALIDATION_SETTINGS,
    );
    expect(value.minEpisodeDurationSec).toBe(0);
    expect(value.maxTitleLength).toBe(16);
  });

  it('rejects an invented failure mode', () => {
    expect(
      run(validateScraperValidationSettings, { onFailure: 'panic' }, DEFAULT_SCRAPER_VALIDATION_SETTINGS).value.onFailure,
    ).toBe(DEFAULT_SCRAPER_VALIDATION_SETTINGS.onFailure);
  });
});

describe('export settings', () => {
  it('de-duplicates the column list', () => {
    const { value } = run(
      validateScraperExportSettings,
      { includeColumns: ['title', 'title', 'size'] },
      DEFAULT_SCRAPER_EXPORT_SETTINGS,
    );
    expect(value.includeColumns).toEqual(['title', 'size']);
  });

  it('rejects an unsupported format', () => {
    expect(run(validateScraperExportSettings, { format: 'parquet' }, DEFAULT_SCRAPER_EXPORT_SETTINGS).value.format).toBe(
      DEFAULT_SCRAPER_EXPORT_SETTINGS.format,
    );
  });
});

describe('scheduler settings', () => {
  const entry = (over: Record<string, unknown> = {}) => ({
    id: 'nightly',
    label: 'Nightly',
    cron: '0 3 * * *',
    targetUrl: 'https://example.test/anime',
    profileId: 'thorough',
    ...over,
  });

  it('accepts a five-field cron and rejects other arities', () => {
    expect(run(validateScraperSchedulerSettings, { entries: [entry()] }, DEFAULT_SCRAPER_SCHEDULER_SETTINGS).value.entries[0].cron).toBe(
      '0 3 * * *',
    );
    const four = run(validateScraperSchedulerSettings, { entries: [entry({ cron: '0 3 * *' })] }, DEFAULT_SCRAPER_SCHEDULER_SETTINGS);
    expect(four.value.entries[0].cron).toBe('0 3 * * *');
    expect(four.issues.some((i) => i.path.includes('cron'))).toBe(true);

    const six = run(validateScraperSchedulerSettings, { entries: [entry({ cron: '0 0 3 * * *' })] }, DEFAULT_SCRAPER_SCHEDULER_SETTINGS);
    expect(six.issues.some((i) => i.path.includes('cron'))).toBe(true);
  });

  it('collapses irregular whitespace in a cron expression', () => {
    const { value } = run(
      validateScraperSchedulerSettings,
      { entries: [entry({ cron: '  0   3  *  *  * ' })] },
      DEFAULT_SCRAPER_SCHEDULER_SETTINGS,
    );
    expect(value.entries[0].cron).toBe('0 3 * * *');
  });

  it('ignores a schedule with a duplicate id', () => {
    const { value } = run(
      validateScraperSchedulerSettings,
      { entries: [entry(), entry({ label: 'copy' })] },
      DEFAULT_SCRAPER_SCHEDULER_SETTINGS,
    );
    expect(value.entries).toHaveLength(1);
  });

  it('accepts quiet hours as HH:MM or empty, and nothing else', () => {
    expect(
      run(validateScraperSchedulerSettings, { quietHoursStart: '23:30' }, DEFAULT_SCRAPER_SCHEDULER_SETTINGS).value.quietHoursStart,
    ).toBe('23:30');
    expect(
      run(validateScraperSchedulerSettings, { quietHoursStart: '' }, DEFAULT_SCRAPER_SCHEDULER_SETTINGS).value.quietHoursStart,
    ).toBe('');
    const bad = run(validateScraperSchedulerSettings, { quietHoursStart: '25:00' }, DEFAULT_SCRAPER_SCHEDULER_SETTINGS);
    expect(bad.value.quietHoursStart).toBe(DEFAULT_SCRAPER_SCHEDULER_SETTINGS.quietHoursStart);
    expect(bad.paths).toContain('g.quietHoursStart');
  });

  it('caps the schedule list at fifty', () => {
    const many = Array.from({ length: 80 }, (_, i) => entry({ id: `s${i}` }));
    expect(run(validateScraperSchedulerSettings, { entries: many }, DEFAULT_SCRAPER_SCHEDULER_SETTINGS).value.entries.length)
      .toBeLessThanOrEqual(50);
  });
});

describe('notification settings', () => {
  it('bounds the digest window to a day', () => {
    expect(
      run(validateScraperNotificationSettings, { digestMinutes: 99_999 }, DEFAULT_SCRAPER_NOTIFICATION_SETTINGS).value.digestMinutes,
    ).toBe(1_440);
  });
});

describe('developer settings', () => {
  it('drops a non-boolean experiment flag', () => {
    const { value, issues } = run(
      validateScraperDeveloperSettings,
      { experimentFlags: { goodFlag: true, badFlag: 'yes' } },
      DEFAULT_SCRAPER_DEVELOPER_SETTINGS,
    );
    expect(value.experimentFlags).toEqual({ goodflag: true });
    expect(issues.some((i) => i.path.includes('experimentFlags'))).toBe(true);
  });

  it('keeps the script console locked unless explicitly unlocked', () => {
    expect(run(validateScraperDeveloperSettings, {}, DEFAULT_SCRAPER_DEVELOPER_SETTINGS).value.allowScriptConsole).toBe(false);
  });
});

describe('cloneScraperOutputGroup', () => {
  it('copies nested arrays so two profiles cannot share one', () => {
    const original = { channels: ['network'], flags: { a: true } };
    const copy = cloneScraperOutputGroup(original, ['channels'], ['flags']);
    copy.channels.push('qbit');
    copy.flags.a = false;
    expect(original.channels).toEqual(['network']);
    expect(original.flags.a).toBe(true);
  });

  it('copies objects inside an array, not just the array', () => {
    const original = { entries: [{ id: 'a' }] };
    const copy = cloneScraperOutputGroup(original, ['entries']);
    copy.entries[0].id = 'b';
    expect(original.entries[0].id).toBe('a');
  });
});
