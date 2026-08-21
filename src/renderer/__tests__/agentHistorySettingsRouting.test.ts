/**
 * The Agent's durable operation history has to be findable, and its strings have
 * to exist in every language.
 *
 * Both halves have failed here before and neither is caught by the usual gates.
 * A registry entry pointing at a page that does not mount the card lands the
 * user somewhere the thing simply is not (the MAL Sync defect, and the reason
 * `malSyncSettingsRouting.test.ts` exists). And `tools/i18n-check.cjs` compares
 * catalogs to each other, so a key a component calls but no catalog defines is
 * green on every gate and renders as its own id in the running app.
 *
 * Everything below is derived from source rather than restated, so moving the
 * card fails these tests instead of silently re-breaking the route.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SETTINGS_REGISTRY, searchSettings } from '../components/settings/settingsRegistry';
import { AGENT_SETTINGS_GUIDED_TARGETS } from '../../shared/agentNavigation';
import { AGENT_NAVIGATION_INDEX } from '../../shared/agentNavigationIndex';
import { en, ja, ru, zh } from '../../shared/i18n/catalogs/all';

const MEMORY_PAGE = readFileSync(
  join(__dirname, '..', 'components', 'settings', 'pages', 'MemoryPage.tsx'),
  'utf8',
);

/** Every `t('…')` key the history card asks for, read off the page itself. */
function cardTranslationKeys(): string[] {
  const keys = new Set<string>();
  for (const match of MEMORY_PAGE.matchAll(/t\('((?:search|settings\.memory)\.agentHistory[^']*)'/g)) {
    keys.add(match[1]);
  }
  // The claim label is built from the entry, so the literal never appears whole.
  for (const claim of ['created', 'updated', 'deleted', 'read']) {
    keys.add(`settings.memory.agentHistory.claim.${claim}`);
  }
  return [...keys];
}

describe('agent operation history settings routing', () => {
  it('is mounted as a card on the page its registry entry names', () => {
    const entry = SETTINGS_REGISTRY.find((item) => item.id === 'agent-history');
    expect(entry).toMatchObject({ pageId: 'memory', titleKey: 'search.agentHistory' });
    expect(MEMORY_PAGE).toContain(`id="${entry?.id}"`);
    expect(MEMORY_PAGE).toContain(`focusSettingId === '${entry?.id}'`);
  });

  it('answers a search for what the agent did', () => {
    const results = searchSettings('operation history', (key) => key, { advanced: true });
    expect(results.map((item) => item.id)).toContain('agent-history');
  });

  // Negative control: the new entry shares most of its vocabulary with the older
  // agent-memory card, and a search that stopped finding that one would be a
  // regression this file caused rather than a feature it added.
  it('does not displace the agent memory card for a memory query', () => {
    const results = searchSettings('agent memory', (key) => key, { advanced: true });
    expect(results[0]?.id).toBe('agent-memory');
  });

  it('is a guided target and a navigation destination on the memory page', () => {
    expect(AGENT_SETTINGS_GUIDED_TARGETS.memory).toContain('agent-history');
    const destination = AGENT_NAVIGATION_INDEX.find(
      (row) => row.section === 'settings' && row.controlId === 'agent-history',
    );
    expect(destination).toMatchObject({ page: 'memory', titleKey: 'search.agentHistory' });
  });
});

describe('agent operation history strings', () => {
  it('asks for keys the card actually renders', () => {
    // Guards the extraction above: a regex that matched nothing would make every
    // assertion below vacuously true.
    expect(cardTranslationKeys().length).toBeGreaterThanOrEqual(12);
  });

  it('defines every one of them in all four catalogs', () => {
    const missing: string[] = [];
    for (const [lang, catalog] of Object.entries({ en, ja, ru, zh })) {
      for (const key of cardTranslationKeys()) {
        if (!(key in catalog)) missing.push(`${lang}:${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('translates them rather than echoing the English', () => {
    // `i18n-check` baselines a set of keys that legitimately render English
    // verbatim; none of these are on it, so an untranslated one is an omission.
    const echoed: string[] = [];
    for (const [lang, catalog] of Object.entries({ ja, ru, zh })) {
      for (const key of cardTranslationKeys()) {
        if (catalog[key] === en[key]) echoed.push(`${lang}:${key}`);
      }
    }
    expect(echoed).toEqual([]);
  });
});
