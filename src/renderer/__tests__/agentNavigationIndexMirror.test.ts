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

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AGENT_NAVIGATION_INDEX,
  type AgentNavigationIndexEntry,
} from '../../shared/agentNavigationIndex';
import {
  AGENT_NAVIGATION_SECTION_LABEL_KEYS,
  AGENT_SETTINGS_GUIDED_TARGETS,
} from '../../shared/agentNavigation';
import { SETTINGS_NAV, SETTINGS_REGISTRY } from '../components/settings/settingsRegistry';
import { en } from '../../shared/i18n/catalogs';

const catalog = en as unknown as Record<string, unknown>;

/**
 * Guided pairs the index deliberately does not carry, each mapped to the
 * coordinate that answers for it.
 *
 * Every one of these is the *same card* reachable under a second id or on a
 * second page. Indexing both would make every term they share ambiguous, and
 * ambiguity refuses — so adding the duplicate would remove an answer rather than
 * add one. Requiring a stand-in here is what stops this list from becoming a
 * place to park controls nobody got round to.
 */
const DUPLICATE_GUIDED_TARGETS: Readonly<Record<string, string>> = {
  // A second guided id for the Window chrome card, which highlights on either.
  'display/borderless': 'display/window-chrome',
  // Blanc Mode renders on Appearance and on Special; SETTINGS_REGISTRY registers
  // it on Special, so that is the coordinate the index can mirror.
  'appearance/blanc-mode': 'special/blanc-mode',
  // "Leave secret OS" renders on both pages. The Companions copy is the indexed
  // one because the Special page is Advanced-only.
  'special/secret-os-leave': 'companions/companions-leave-secret',
};

function indexedControls(): Set<string> {
  return new Set(
    AGENT_NAVIGATION_INDEX.filter((entry) => entry.controlId)
      .map((entry) => `${entry.page}/${entry.controlId}`),
  );
}

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

  it('indexes every guided control except the declared duplicates', () => {
    const indexed = indexedControls();
    const missing: string[] = [];
    for (const [page, controls] of Object.entries(AGENT_SETTINGS_GUIDED_TARGETS)) {
      for (const controlId of controls as readonly string[]) {
        const key = `${page}/${controlId}`;
        if (indexed.has(key) || key in DUPLICATE_GUIDED_TARGETS) continue;
        missing.push(key);
      }
    }
    expect(missing).toEqual([]);
  });

  it('answers for every duplicate it skipped, and skips every one it declared', () => {
    const indexed = indexedControls();
    for (const [skipped, coveredBy] of Object.entries(DUPLICATE_GUIDED_TARGETS)) {
      expect(indexed.has(skipped), `${skipped} is declared a duplicate but is indexed`)
        .toBe(false);
      expect(indexed.has(coveredBy), `${skipped} has no indexed stand-in`).toBe(true);
    }
  });

  it('proves the one duplicate that is not two cards is really one card', () => {
    // `display/borderless` has no card of its own — DisplayPage highlights the
    // Window chrome card for either id. If that ever stops being true, the entry
    // above becomes a control with no destination at all.
    const src = readFileSync('src/renderer/components/settings/pages/DisplayPage.tsx', 'utf8');
    expect(src).toContain("focusSettingId === 'window-chrome' || focusSettingId === 'borderless'");
  });
});
