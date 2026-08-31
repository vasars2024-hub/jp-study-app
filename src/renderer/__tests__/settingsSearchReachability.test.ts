// @vitest-environment jsdom
/**
 * L8's gate — "every setting and scraper action remains searchable and keyboard
 * reachable" — has a searchable half that nothing measured.
 *
 * Searching is a two-step contract, and both steps can rot independently:
 *
 *   1. `searchSettings(label)` has to RETURN the entry at all. An entry whose
 *      titleKey resolves to text none of its own keywords contain is invisible.
 *   2. Picking it calls `onNavigate(entry.pageId, entry.id)`, which sets
 *      `focusSettingId`; the destination page then has to contain something that
 *      answers to that id — either an explicit `focusSettingId === '<id>'` or a
 *      `<SettingsCard id="<id>">`, which self-anchors. If the only answering
 *      component sits on a *different* page, the user is navigated to a page
 *      that does not contain what they searched for. That is the MAL-sync defect
 *      (`malSyncSettingsRouting.test.ts`) generalised to all 111 entries.
 *
 * Both steps are derived from source here rather than restated as literals, so
 * moving a card or renaming an id fails this instead of silently breaking search.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SETTINGS_NAV, SETTINGS_REGISTRY, searchSettings } from '../components/settings/settingsRegistry';
import { SCRAPER_REGISTRY } from '../components/scraper/scraperRegistry';
import { SettingsProvider } from '../components/settings/SettingsContext';
import SettingsCard from '../components/settings/SettingsCard';
import type { SettingsController } from '../components/settings/types';
import { en } from '../../shared/i18n/catalogs';

const SETTINGS_DIR = join(__dirname, '..', 'components', 'settings');
const t = (key: string): string => (en[key] as string) ?? key;

function sourceFiles(dir: string, out: Record<string, string> = {}): Record<string, string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out[full.slice(SETTINGS_DIR.length + 1).split('\\').join('/')] = readFileSync(full, 'utf8');
    }
  }
  return out;
}

const SRC = sourceFiles(SETTINGS_DIR);

/**
 * The Files-app system panels — gate 8's destination.
 *
 * Memory moved OUT of Settings (decision 1's one sanctioned migration), so the
 * cards that used to anchor inside `SETTINGS_DIR` now anchor here. Scanned as
 * its own map rather than folded into `SRC`, so a settings entry can only be
 * excused by this directory when it explicitly carries `movedTo: 'files'`.
 */
const PANELS_DIR = join(__dirname, '..', 'components', 'filesapp', 'panels');
const panelAnchors = ((): Map<string, Set<string>> => {
  const found = new Map<string, Set<string>>();
  for (const entry of readdirSync(PANELS_DIR, { withFileTypes: true })) {
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
    const text = readFileSync(join(PANELS_DIR, entry.name), 'utf8');
    const add = (id: string): void => {
      const bucket = found.get(id) ?? new Set<string>();
      bucket.add(entry.name);
      found.set(id, bucket);
    };
    for (const m of text.matchAll(/<FilesPanelCard\b[^>]*?\bid="([^"{]+)"/gs)) add(m[1]);
    for (const m of text.matchAll(/focusCardId === '([^']+)'/g)) add(m[1]);
  }
  return found;
})();

const SCRAPER_DIR = join(__dirname, '..', 'components', 'scraper');
const scraperSrc = ((): Record<string, string> => {
  const out: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        out[full] = readFileSync(full, 'utf8');
      }
    }
  };
  walk(SCRAPER_DIR);
  return out;
})();

/** settingId -> the files that can answer to it. */
const anchors = ((): Map<string, Set<string>> => {
  const found = new Map<string, Set<string>>();
  const add = (id: string, file: string): void => {
    const bucket = found.get(id) ?? new Set<string>();
    bucket.add(file);
    found.set(id, bucket);
  };
  for (const [file, text] of Object.entries(SRC)) {
    for (const m of text.matchAll(/focusSettingId === '([^']+)'/g)) add(m[1], file);
    // SettingsCard derives `is-highlight` from its own `id`, so an id'd card is
    // an anchor with no `highlight` prop at the call site.
    for (const m of text.matchAll(/<SettingsCard\b[^>]*?\bid="([^"{]+)"/gs)) add(m[1], file);
  }
  return found;
})();

/** pageId -> the component files that page can render, following local imports. */
const pageFiles = ((): Map<string, Set<string>> => {
  const app = SRC['SettingsApp.tsx'] ?? '';
  const route = new Map<string, string>();
  // `{page === 'id' && <Component />}` — anchored on the `&& <` so the many
  // `disabled={page === 'id'}` guards above cannot match instead.
  for (const m of app.matchAll(/page === '([a-z0-9-]+)' && <([A-Z][A-Za-z0-9]*)/g)) route.set(m[1], m[2]);
  // A route may name a wrapper declared in SettingsApp itself (Appearance is
  // deferred by a frame); follow it to the component it renders.
  for (const [pageId, comp] of [...route]) {
    const local = app.match(new RegExp(`function ${comp}\\([^)]*\\)[\\s\\S]{0,600}?<([A-Z][A-Za-z0-9]*)\\s*/>`));
    if (local && local[1] !== comp) route.set(pageId, local[1]);
  }

  const fileFor = (name: string): string | undefined =>
    Object.keys(SRC).find((f) => f.endsWith(`/${name}.tsx`) || f === `${name}.tsx`);

  const closure = (file: string | undefined, seen = new Set<string>()): Set<string> => {
    if (!file || seen.has(file)) return seen;
    seen.add(file);
    for (const m of (SRC[file] ?? '').matchAll(/from '(\.[^']+)'/g)) {
      const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
      const parts = (dir ? `${dir}/${m[1]}` : m[1]).split('/');
      const stack: string[] = [];
      for (const p of parts) {
        if (p === '.' || p === '') continue;
        if (p === '..') stack.pop();
        else stack.push(p);
      }
      const target = stack.join('/');
      for (const cand of [`${target}.tsx`, `${target}.ts`, `${target}/index.tsx`]) {
        if (SRC[cand]) closure(cand, seen);
      }
    }
    return seen;
  };

  const out = new Map<string, Set<string>>();
  for (const [pageId, comp] of route) out.set(pageId, closure(fileFor(comp)));
  return out;
})();

describe('settings search reachability', () => {
  it('routes every settings page id to a component it can actually render', () => {
    // Guards the derivation the two tests below depend on: if this drops, they
    // would start passing vacuously.
    const navPages = SETTINGS_NAV.map((p) => p.id);
    const unrouted = navPages.filter((id) => !pageFiles.get(id)?.size);
    expect(unrouted).toEqual([]);
    expect(pageFiles.size).toBeGreaterThanOrEqual(navPages.length);
  });

  it('returns every registry entry when its own title is searched', () => {
    const invisible: string[] = [];
    for (const entry of SETTINGS_REGISTRY) {
      const label = t(entry.titleKey).trim();
      if (!label) continue;
      // A gated entry is searchable only in the state whose cards it names, so
      // it is searched there — asking for it from the default state would prove
      // the gate works, which is `settingsSearchThemeGate.test.ts`'s job, not
      // coverage.
      const results = searchSettings(label, t, {
        advanced: true,
        themeId: entry.themes?.[0],
        discovered: entry.discovered ? { [entry.discovered]: true } : undefined,
      });
      if (!results.some((r) => r.id === entry.id)) invisible.push(`${entry.id} ("${label}")`);
    }
    expect(invisible).toEqual([]);
  });

  it('lands every registry entry on a page that answers to its id', () => {
    const misrouted: string[] = [];
    const unanchored: string[] = [];
    const migrated: string[] = [];
    for (const entry of SETTINGS_REGISTRY) {
      if (entry.id.startsWith('page-')) continue; // navigates to the page itself
      // Gate 8: an entry whose card MOVED must anchor in a Files-app panel.
      // `SettingsApp.navigate` redirects `pageId: 'memory'` into the Files app
      // carrying this id, so the anchor is what makes the hit land on the row
      // instead of merely on the app — the gate's own FAIL condition.
      if (entry.movedTo === 'files') {
        if (!panelAnchors.get(entry.id)?.size) migrated.push(`${entry.id} -> files (no panel card)`);
        continue;
      }
      const owners = anchors.get(entry.id);
      const reachable = pageFiles.get(entry.pageId);
      if (!owners?.size) unanchored.push(`${entry.id} -> '${entry.pageId}'`);
      else if (!reachable || ![...owners].some((o) => reachable.has(o))) {
        misrouted.push(`${entry.id} -> '${entry.pageId}' but anchored only in ${[...owners].join(', ')}`);
      }
    }
    expect(misrouted).toEqual([]);
    expect(unanchored).toEqual([]);
    expect(migrated).toEqual([]);
    // Vacuity guard: the migration is real, so the branch above must have run.
    expect(SETTINGS_REGISTRY.filter((e) => e.movedTo === 'files').length).toBeGreaterThan(0);
  });

  /**
   * The gate names two things — "every setting AND SCRAPER ACTION" — and the
   * Scraper app implements the same contract under its own names: ScraperSearch
   * calls `ctl.navigate(hit.pageId, hit.id)` and ScraperApp stores it as
   * `focusSettingId`, exactly as Settings does.
   *
   * Its registry is a PAGE index: 17 of its 18 entries carry a page's own nav
   * labelKey, so navigating to the page is the whole answer and no card anchor
   * is owed. Only an entry that names something INSIDE a page needs one. Scoring
   * the page entries as unanchored is what made a first run read 1 of 18.
   */
  it('routes every scraper registry entry to a page, and anchors the ones inside a page', () => {
    const navSrc = readFileSync(join(SCRAPER_DIR, 'scraperPages.ts'), 'utf8');
    const navLabelKeys = new Set([...navSrc.matchAll(/labelKey: '([^']+)'/g)].map((m) => m[1]));
    const navIds = new Set([...navSrc.matchAll(/id: '([a-z0-9-]+)'/g)].map((m) => m[1]));
    expect(navLabelKeys.size).toBeGreaterThan(0);

    const scraperAnchors = new Set<string>();
    for (const text of Object.values(scraperSrc)) {
      for (const m of text.matchAll(/<ScrCard\b[^>]*?\bid="([^"{]+)"/gs)) scraperAnchors.add(m[1]);
      for (const m of text.matchAll(/focusSettingId === '([^']+)'/g)) scraperAnchors.add(m[1]);
    }

    const offPage: string[] = [];
    const unanchored: string[] = [];
    let insidePageEntries = 0;
    for (const entry of SCRAPER_REGISTRY) {
      if (!navIds.has(entry.pageId)) offPage.push(`${entry.id} -> unknown page '${entry.pageId}'`);
      if (navLabelKeys.has(entry.titleKey)) continue; // page entry: the page is the answer
      insidePageEntries += 1;
      if (!scraperAnchors.has(entry.id)) unanchored.push(`${entry.id} -> '${entry.pageId}'`);
    }
    expect(offPage).toEqual([]);
    expect(unanchored).toEqual([]);
    // Vacuity guard: if every entry were skipped as a page entry the assertions
    // above would pass having checked nothing.
    expect(insidePageEntries).toBeGreaterThan(0);
    expect(scraperAnchors.size).toBeGreaterThan(0);
  });

  /**
   * The test above reads `<SettingsCard id="x">` as an anchor. That is only true
   * while SettingsCard actually derives its highlight from its own id, and the
   * source scan cannot see whether it still does — removing the derivation left
   * all three tests above green. So assert the behaviour, not the pattern.
   */
  describe('SettingsCard honours its own id', () => {
    let root: Root | null = null;

    afterEach(async () => {
      if (root) {
        await act(async () => root?.unmount());
        root = null;
      }
    });

    async function mountCard(id: string, focusSettingId: string | null): Promise<Element> {
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
      // jsdom has no scrollIntoView, and a focused card calls it on mount.
      Element.prototype.scrollIntoView = function scrollIntoView() {
        /* jsdom has no layout; the call itself is all this needs to survive. */
      };
      document.body.innerHTML = '<div id="host"></div>';
      const host = document.getElementById('host');
      if (!host) throw new Error('Missing test host');
      const controller = { advancedMode: false, focusSettingId } as unknown as SettingsController;
      const created = createRoot(host);
      root = created;
      await act(async () => {
        created.render(
          createElement(
            SettingsProvider,
            { value: controller },
            createElement(SettingsCard, { id, title: 'Card' }),
          ),
        );
      });
      const card = host.querySelector('.os-set-card');
      if (!card) throw new Error('SettingsCard did not render');
      return card;
    }

    it('highlights when focusSettingId matches its id and no highlight prop is passed', async () => {
      const card = await mountCard('unified-search', 'unified-search');
      expect(card.className).toContain('is-highlight');
      expect(card.getAttribute('data-setting-id')).toBe('unified-search');
    });

    it('does not highlight a card the search did not target', async () => {
      const card = await mountCard('unified-search', 'media-providers');
      expect(card.className).not.toContain('is-highlight');
    });
  });
});
