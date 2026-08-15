import type { ScraperPageId } from '../../../../shared/scraperShell';

export const SCRAPER_SETTING_ACTIONS = {
  sources: { kind: 'navigate', page: 'sources' },
  schedules: { kind: 'navigate', page: 'scheduled' },
  headers: { kind: 'pairs' },
  cookies: { kind: 'pairs' },
  trackers: { kind: 'list' },
  'qbit-test': { kind: 'test' },
  'qbit-password': { kind: 'credential' },
  'qbit-apikey': { kind: 'credential' },
} as const satisfies Record<
  string,
  | { kind: 'navigate'; page: ScraperPageId }
  | { kind: 'pairs' }
  | { kind: 'list' }
  | { kind: 'test' }
  | { kind: 'credential' }
>;

export type ScraperSettingActionId = keyof typeof SCRAPER_SETTING_ACTIONS;
export type ScraperSettingAction = (typeof SCRAPER_SETTING_ACTIONS)[ScraperSettingActionId];

export function resolveScraperSettingAction(action: ScraperSettingActionId): ScraperSettingAction {
  return SCRAPER_SETTING_ACTIONS[action];
}

/** Clean a user-edited URL/list field while preserving its explicit order. */
export function normalizeScraperSettingList(rows: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const row of rows) {
    const value = row.trim();
    const key = value.toLocaleLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    normalized.push(value);
  }
  return normalized;
}
