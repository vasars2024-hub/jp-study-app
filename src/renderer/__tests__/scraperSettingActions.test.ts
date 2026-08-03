import { describe, expect, it } from 'vitest';
import { SCRAPER_FIELDS } from '../components/scraper/settings/fields';
import {
  normalizeScraperSettingList,
  resolveScraperSettingAction,
  SCRAPER_SETTING_ACTIONS,
} from '../components/scraper/settings/settingActions';

describe('scraper settings actions', () => {
  it('routes every declared field action to a concrete workflow', () => {
    const actions = SCRAPER_FIELDS.flatMap((field) => field.action ? [field.action] : []);

    expect(actions.length).toBeGreaterThan(0);
    expect(new Set(actions)).toEqual(new Set(Object.keys(SCRAPER_SETTING_ACTIONS)));
    for (const action of actions) {
      expect(resolveScraperSettingAction(action).kind).toMatch(
        /^(navigate|pairs|list|test|credential)$/,
      );
    }
  });

  it('keeps navigation actions pinned to their detailed manager pages', () => {
    expect(resolveScraperSettingAction('sources')).toEqual({
      kind: 'navigate',
      page: 'sources',
    });
    expect(resolveScraperSettingAction('schedules')).toEqual({
      kind: 'navigate',
      page: 'scheduled',
    });
  });

  it('normalizes editable tracker lists without changing their order', () => {
    expect(normalizeScraperSettingList([
      ' udp://tracker.one/announce ',
      '',
      'UDP://TRACKER.ONE/ANNOUNCE',
      'https://tracker.two/announce',
    ])).toEqual([
      'udp://tracker.one/announce',
      'https://tracker.two/announce',
    ]);
  });
});
