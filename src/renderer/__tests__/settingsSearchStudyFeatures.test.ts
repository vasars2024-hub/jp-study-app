// @vitest-environment node
/**
 * Settings search finds the study features by the words people use for them
 * (round-4 journeys audit, measured on the packaged app in the standard view):
 *
 * - "live captions" and "system audio" found nothing — the Live captions card
 *   lives on Transcription, which was an Advanced-only page, so neither the rail
 *   nor search could reach it without switching Advanced on;
 * - "furigana" found nothing and "russian" found only the UI-language card:
 *   the study-language card (which also holds the reading aid) listed Japanese
 *   and Chinese keywords only;
 * - the guided tour had no entry at all.
 */
import { describe, expect, it } from 'vitest';
import { CATALOGS } from '../../shared/i18n/catalogs/all';
import { SETTINGS_NAV, searchSettings } from '../components/settings/settingsRegistry';

const t = (key: string): string => String(CATALOGS.en[key] ?? key);
const ids = (query: string): string[] => searchSettings(query, t, { advanced: false }).map((e) => e.id);

describe('Settings search in the standard (non-Advanced) view', () => {
  it.each([
    ['live captions', 'live-captions'],
    ['system audio', 'live-captions'],
    ['furigana', 'study-language'],
    ['pinyin', 'study-language'],
    ['stress marks', 'study-language'],
    ['russian', 'study-language'],
    ['tutorial', 'guided-tour'],
    ['guided tour', 'guided-tour'],
  ])('"%s" finds %s', (query, id) => {
    expect(ids(query)).toContain(id);
  });

  it('the page holding live captions is in the standard rail', () => {
    expect(SETTINGS_NAV.find((page) => page.id === 'transcription')?.advanced).toBeFalsy();
  });
});
