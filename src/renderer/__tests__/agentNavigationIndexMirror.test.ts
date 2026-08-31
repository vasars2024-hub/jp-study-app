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
import {
  SETTINGS_NAV,
  SETTINGS_REGISTRY,
  settingsPageMovedToFiles,
} from '../components/settings/settingsRegistry';
import { LEGACY_WIN_SECTION_ALIASES } from '../../shared/desktop';
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
    // ...and the id of any section this one absorbed. Gate 7b deleted the
    // Notebook into the Files app, so "notebook" is a name the destination
    // genuinely answers to — but only because the alias table says so. Read
    // from `LEGACY_WIN_SECTION_ALIASES` rather than listed here, so a term
    // cannot be excused by a synonym nobody actually wired up.
    for (const [legacy, target] of Object.entries(LEGACY_WIN_SECTION_ALIASES)) {
      if (target === entry.section) add(legacy);
    }
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
    // Gate 8: a MOVED page has no sidebar row, so its label and description are
    // gone as a source of words. What the destination actually holds now is the
    // set of cards that still name it, and those are read from the registry
    // rather than listed here — a term is excused only by a card that exists.
    if (settingsPageMovedToFiles(entry.page)) {
      add(englishText(entry.titleKey));
      // The same `<labelKey>.desc` convention every SETTINGS_NAV row follows,
      // applied to the index entry's own key. The strings that described the
      // page still describe the destination; only the sidebar row is gone.
      add(englishText(`${entry.titleKey}.desc`));
      for (const card of SETTINGS_REGISTRY) {
        if (card.pageId !== entry.page) continue;
        add(englishText(card.titleKey));
        add(englishText(card.descKey));
        for (const keyword of card.keywords) add(keyword);
      }
    }
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

  it('gives every destination the title key its own surface uses', () => {
    // `titleKey` is what a non-English question resolves through, and `shared`
    // cannot import the registry to look it up. So it is copied — and a copy is
    // only safe while something holds it to the original.
    for (const entry of AGENT_NAVIGATION_INDEX) {
      const coord = entry.page
        ? `${entry.page}${entry.controlId ? `/${entry.controlId}` : ''}`
        : entry.section;
      expect(entry.titleKey, `${coord} carries no titleKey`).toBeTruthy();

      if (entry.controlId) {
        const registered = SETTINGS_REGISTRY.find((c) => c.id === entry.controlId);
        expect(entry.titleKey, `${coord} titleKey drifted from SETTINGS_REGISTRY`)
          .toBe(registered?.titleKey);
      } else if (entry.page) {
        if (settingsPageMovedToFiles(entry.page)) {
          // Gate 8: the page moved to the Files app, so it has no SETTINGS_NAV
          // row to drift from. Its label key must still resolve, which the
          // catalog test below enforces for every entry including this one.
          expect(entry.titleKey, `${coord} carries no titleKey after its move`)
            .toBeTruthy();
          continue;
        }
        const nav = SETTINGS_NAV.find((p) => p.id === entry.page);
        expect(entry.titleKey, `${coord} titleKey drifted from SETTINGS_NAV`)
          .toBe(nav?.labelKey);
      } else {
        expect(entry.titleKey, `${coord} titleKey drifted from the section labels`)
          .toBe(AGENT_NAVIGATION_SECTION_LABEL_KEYS[entry.section]);
      }
    }
  });

  it('resolves every title key against the English catalog', () => {
    // A key that names nothing translates to nothing, and the destination would
    // simply be unreachable in ja/zh/ru while looking perfectly indexed here.
    for (const entry of AGENT_NAVIGATION_INDEX) {
      const value = entry.titleKey ? catalog[entry.titleKey] : undefined;
      expect(typeof value, `${entry.titleKey} is not a string in the en catalog`)
        .toBe('string');
    }
  });

  it('points every page at a real sidebar page', () => {
    for (const entry of AGENT_NAVIGATION_INDEX) {
      if (!entry.page || entry.controlId) continue;
      // A page that MOVED is still a real coordinate — `SettingsApp.navigate`
      // redirects it into the Files app — but it is deliberately not a sidebar
      // row any more. Only that named set is exempt; an unlisted page with no
      // sidebar row is still the rot this assertion exists to catch.
      if (settingsPageMovedToFiles(entry.page)) continue;
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
