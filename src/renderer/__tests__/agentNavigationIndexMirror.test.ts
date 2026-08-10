/**
 * The drift gate for `shared/agentNavigationIndex.ts`.
 *
 * That index has to live in `src/shared` — main resolves navigation, and the
 * architecture audit forbids `shared` from reaching into `renderer` — so it
 * cannot import the Settings registry it describes. This test is the seam: it
 * asserts every indexed coordinate still exists in `SETTINGS_REGISTRY` on the
 * page it claims, and that every search term the index matches on was taken from
 * that entry rather than invented here.
 *
 * A renamed control, a moved card or a keyword the Agent made up on its own all
 * fail here instead of silently routing a user to a place that no longer exists.
 */

import { describe, expect, it } from 'vitest';
import {
  AGENT_NAVIGATION_INDEX,
  type AgentNavigationIndexEntry,
} from '../../shared/agentNavigationIndex';
import { AGENT_NAVIGATION_SECTION_LABEL_KEYS } from '../../shared/agentNavigation';
import { SETTINGS_NAV, SETTINGS_REGISTRY } from '../components/settings/settingsRegistry';
import { en } from '../../shared/i18n/catalogs';

const catalog = en as unknown as Record<string, unknown>;

function words(value: string): string[] {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
}

function englishText(key: string | undefined): string {
  if (!key) return '';
  const value = catalog[key];
  return typeof value === 'string' ? value : '';
}

/** Every word the entry is allowed to be matched by. */
function allowedWords(entry: AgentNavigationIndexEntry): Set<string> {
  const out = new Set<string>();
  const add = (value: string): void => {
    for (const word of words(value)) out.add(word);
  };

  if (!entry.page) {
    add(entry.section);
    add(englishText(AGENT_NAVIGATION_SECTION_LABEL_KEYS[entry.section]));
    return out;
  }

  // A settings destination may also be named by the app it lives in — "settings"
  // is how a user asks for the Home page.
  add(englishText(AGENT_NAVIGATION_SECTION_LABEL_KEYS.settings));

  if (!entry.controlId) {
    const page = SETTINGS_NAV.find((nav) => nav.id === entry.page);
    add(entry.page);
    add(englishText(page?.labelKey));
    add(englishText(page?.descKey));
    return out;
  }

  const registered = SETTINGS_REGISTRY.find((candidate) => candidate.id === entry.controlId);
  add(entry.controlId);
  add(englishText(registered?.titleKey));
  for (const keyword of registered?.keywords ?? []) add(keyword);
  return out;
}

describe('agent navigation index mirrors the live Settings surface', () => {
  it('points every control at a registry entry on the same page', () => {
    for (const entry of AGENT_NAVIGATION_INDEX) {
      if (!entry.controlId) continue;
      const registered = SETTINGS_REGISTRY.find(
        (candidate) => candidate.id === entry.controlId,
      );
      expect(registered, `${entry.page}/${entry.controlId} is not in SETTINGS_REGISTRY`)
        .toBeDefined();
      expect(registered?.pageId, `${entry.controlId} moved page`).toBe(entry.page);
    }
  });

  it('points every page at a real sidebar page', () => {
    for (const entry of AGENT_NAVIGATION_INDEX) {
      if (!entry.page || entry.controlId) continue;
      expect(
        SETTINGS_NAV.some((nav) => nav.id === entry.page),
        `${entry.page} is not in SETTINGS_NAV`,
      ).toBe(true);
    }
  });

  it('matches only on words the destination already uses', () => {
    for (const entry of AGENT_NAVIGATION_INDEX) {
      const allowed = allowedWords(entry);
      const label = `${entry.section}/${entry.page ?? '-'}/${entry.controlId ?? '-'}`;
      for (const term of entry.terms) {
        for (const word of words(term)) {
          expect(allowed.has(word), `${label}: "${word}" is not a word of that destination`)
            .toBe(true);
        }
      }
    }
  });

  it('indexes every page the sidebar shows', () => {
    const indexed = new Set(
      AGENT_NAVIGATION_INDEX.filter((entry) => entry.page && !entry.controlId)
        .map((entry) => entry.page),
    );
    for (const nav of SETTINGS_NAV) {
      expect(indexed.has(nav.id), `${nav.id} has no index entry`).toBe(true);
    }
  });
});
