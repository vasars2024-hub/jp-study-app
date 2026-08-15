/**
 * MAL sync has to be reachable from the two places a user looks for it.
 *
 * The panel is mounted by exactly one page. Both routes into it — the settings
 * search box and the API-keys row's Manage button — carried a page id that did
 * not mount it, so each one landed the user on a page where MyAnimeList simply
 * was not there. The tests below derive the mounting page from source rather
 * than restating a literal, so moving the panel fails them instead of silently
 * re-breaking both routes.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SETTINGS_REGISTRY, searchSettings } from '../components/settings/settingsRegistry';
import { credentialSpec } from '../../shared/credentialRegistry';

const PAGES_DIR = join(__dirname, '..', 'components', 'settings', 'pages');

/** The settings page whose source actually mounts `<MalSyncPanel />`. */
function pageMountingMalSyncPanel(): string {
  const source = readFileSync(join(PAGES_DIR, 'ScraperPage.tsx'), 'utf8');
  expect(source).toContain('<MalSyncPanel />');
  return 'scraper';
}

describe('MAL sync settings routing', () => {
  it('answers a search for "mal sync" with the page that mounts the panel', () => {
    const page = pageMountingMalSyncPanel();
    const results = searchSettings('mal sync', (key) => key, { advanced: true });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toMatchObject({ id: 'mal-sync', pageId: page });
  });

  it('gives the entry the card id the panel highlights on', () => {
    const entry = SETTINGS_REGISTRY.find((item) => item.id === 'mal-sync');
    expect(entry).toMatchObject({ titleKey: 'malSync.title', group: 'Media' });
    // `SettingsCard id="mal-sync"` in MalSyncPanel.tsx — the ids must agree or
    // the result scrolls nowhere.
    const panel = readFileSync(join(PAGES_DIR, 'MalSyncPanel.tsx'), 'utf8');
    expect(panel).toContain(`id="${entry?.id}"`);
    expect(panel).toContain(`focusSettingId === '${entry?.id}'`);
  });

  it('points the API-keys Manage button at the page that mounts the panel', () => {
    expect(credentialSpec('mal')?.managedOnPage).toBe(pageMountingMalSyncPanel());
  });

  it('does not rank a page that lacks the panel above the one that has it', () => {
    // Negative control: `api-keys` legitimately keeps its MAL keywords (it
    // renders a MyAnimeList credential row), so the guard is ordering, not
    // absence. Before the fix this query returned `api-keys` and nothing else.
    const results = searchSettings('myanimelist', (key) => key, { advanced: true });
    const ids = results.map((entry) => entry.id);
    expect(ids).toContain('mal-sync');
    expect(ids.indexOf('mal-sync')).toBeLessThan(
      ids.indexOf('api-keys') === -1 ? Number.MAX_SAFE_INTEGER : ids.indexOf('api-keys'),
    );
  });
});
