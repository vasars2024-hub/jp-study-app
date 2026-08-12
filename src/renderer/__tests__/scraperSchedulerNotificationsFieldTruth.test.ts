import { describe, expect, it } from 'vitest';
import { SCRAPER_FIELDS } from '../components/scraper/settings/fields';

describe('Scraper Scheduler and Notifications settings truthfulness', () => {
  const schedulerFields = SCRAPER_FIELDS.filter((field) => field.group === 'scheduler');
  const notificationFields = SCRAPER_FIELDS.filter((field) => field.group === 'notifications');

  it('marks the unavailable metered-network signal as the only inert scheduler field', () => {
    expect(
      schedulerFields.filter((field) => field.inert).map((field) => field.path),
    ).toEqual(['scheduler.requireUnmeteredNetwork']);

    expect(
      schedulerFields.filter((field) => !field.inert).map((field) => [field.path, field.toPath]),
    ).toEqual([
      ['scheduler.enabled', undefined],
      ['scheduler.entries', undefined],
      ['scheduler.maxConcurrentScheduled', undefined],
      ['scheduler.skipIfRunning', undefined],
      ['scheduler.missedRunPolicy', undefined],
      ['scheduler.quietHoursStart', 'scheduler.quietHoursEnd'],
      ['scheduler.requireExternalPower', undefined],
    ]);
  });

  it('does not present the legacy coalescing mode as backlog replay', () => {
    const policy = schedulerFields.find((field) => field.path === 'scheduler.missedRunPolicy');
    expect(policy?.options?.find((option) => option.value === 'run-all')?.label).toBe(
      'Run once after downtime (legacy)',
    );
  });

  it('keeps all eight notification controls active', () => {
    expect(notificationFields.some((field) => field.inert)).toBe(false);
    expect(notificationFields.map((field) => field.path)).toEqual([
      'notifications.channel',
      'notifications.onComplete',
      'notifications.onError',
      'notifications.onNewEpisode',
      'notifications.onStudyReady',
      'notifications.onScheduleRun',
      'notifications.soundEnabled',
      'notifications.digestMinutes',
    ]);
  });
});
