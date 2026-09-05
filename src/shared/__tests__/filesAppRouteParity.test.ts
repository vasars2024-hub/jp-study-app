/**
 * Gate 6's own gate.
 *
 * None of these assertions restate `FILES_ROUTE_PARITY`. Each re-derives its
 * side of the claim from a file the table does not own:
 *
 * - the store list from BOTH enumerator registries, so a new enumerator with no
 *   parity row fails here rather than shipping unaccounted for;
 * - the section route from `AppSection.tsx`'s own switch;
 * - every named symbol from the file the row points at;
 * - the control set from `FilesApp.tsx`'s own `t(...)` calls.
 *
 * A source scan is used because the things being checked are call sites and
 * JSX, not runtime values — and because importing the main-process enumerators
 * here would drag in `electron`.
 *
 * `checkRow` is the one checker, and the negative-control block runs it over
 * fabricated rows to prove it can actually fail. A parity matrix whose checker
 * passes everything is worth nothing.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DESKTOP_WIN_SECTIONS, normalizeWinSection } from '../desktop';
import {
  FILES_APP_CONTROL_KEYS,
  FILES_PERMITTED_MIGRATIONS,
  FILES_ROUTE_PARITY,
  filesParityRow,
  filesParityViolations,
  filesReachability,
  isEnumeratorCapability,
  type FilesParityRow,
} from '../filesApp/routeParity';
import { FILES_SYSTEM_PANEL_CARDS, filesPanelForCard } from '../filesApp/systemPanels';

const ROOT = join(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

const APP_SECTION = read('src/renderer/components/AppSection.tsx');
const FILES_APP = read('src/renderer/components/filesapp/FilesApp.tsx');

/** Every `source: '<id>'` literal in a registry file. */
function scanSources(rel: string): string[] {
  const out = new Set<string>();
  for (const m of read(rel).matchAll(/\bsource:\s*'([a-z0-9-]+)'/g)) out.add(m[1]);
  return [...out].sort();
}

function checkRow(row: FilesParityRow): string[] {
  const problems: string[] = [];
  if (row.status === 'preserved') {
    if (!row.section) {
      problems.push('preserved row names no section');
    } else if (row.section === 'global') {
      // Mounted outside the section switch. The module+symbol below still has
      // to hold, so this is not an escape hatch — only a different container.
    } else if (!(DESKTOP_WIN_SECTIONS as readonly string[]).includes(row.section)) {
      problems.push(`section '${row.section}' is not a DesktopWinSection`);
    } else if (!APP_SECTION.includes(`case '${row.section}':`)) {
      problems.push(`section '${row.section}' has no case in AppSection.tsx`);
    }
    if (!row.module) problems.push('preserved row names no module');
    else if (!existsSync(join(ROOT, row.module))) problems.push(`module missing: ${row.module}`);
    else if (!row.symbol) problems.push('preserved row names no symbol');
    else if (!read(row.module).includes(row.symbol)) {
      problems.push(`symbol '${row.symbol}' absent from ${row.module}`);
    }
  } else {
    // A `new` or `migrated` row claiming a section is claiming a route it does
    // not have — exactly the shape that would hide a regression.
    if (row.section !== null) problems.push(`status '${row.status}' must not name a section`);
    if (row.module || row.symbol) problems.push(`status '${row.status}' must not name a module`);
    if (row.note.trim().length < 20) problems.push('non-preserved row needs a real note');
  }
  return problems;
}

describe('files app route parity (gate 6)', () => {
  it('covers every enumerator source, main and renderer, exactly once', () => {
    const sources = [
      ...scanSources('src/main/filesApp/enumerators.ts'),
      ...scanSources('src/renderer/components/filesapp/rendererEnumerators.ts'),
    ];
    // 17 main + 8 renderer. Gate 1 closed at 17 + 3; gate 7 added five renderer
    // stores the Notebook aggregated. Asserted as a number so a regex that
    // silently stops matching cannot pass by comparing two empty lists.
    expect(sources).toHaveLength(25);
    const declared = FILES_ROUTE_PARITY.map((r) => r.capability).filter(isEnumeratorCapability);
    expect(new Set(declared).size).toBe(declared.length);
    expect([...new Set(sources)].sort()).toEqual([...declared].sort());
    // Control: dropping any one row must break the equality above.
    expect([...new Set(sources)].sort()).not.toEqual([...declared].slice(1).sort());
    // Control on the filter itself. `isEnumeratorCapability` is what keeps the
    // `action:`/`panel:` rows out of the equality, so if it ever started
    // returning true for everything the equality would fail — but if it started
    // returning FALSE for everything, `declared` would be empty and `sources`
    // would have to be empty too for the test to pass. Pin both directions.
    expect(declared.length).toBe(25);
    expect(FILES_ROUTE_PARITY.filter((r) => !isEnumeratorCapability(r.capability)).length)
      .toBeGreaterThan(0);
    expect(isEnumeratorCapability('panel:system/memory')).toBe(false);
    expect(isEnumeratorCapability('action:reveal')).toBe(false);
    expect(isEnumeratorCapability('transcripts')).toBe(true);
  });

  it('re-derives every preserved route from the file it names', () => {
    const failures = FILES_ROUTE_PARITY.map((row) => [row.capability, checkRow(row)] as const)
      .filter(([, problems]) => problems.length > 0);
    expect(failures).toEqual([]);
  });

  it('has no capability that became Files-app-only without permission', () => {
    expect(filesParityViolations()).toEqual([]);
    // Gate 7b migrated `notebook`; gate 8 migrated the memory PANEL and nothing
    // else. Asserted as the exact list rather than a count: a third silent
    // migration cannot hide behind a `>= 2`.
    const migrated = FILES_ROUTE_PARITY.filter((r) => r.status === 'migrated');
    expect(migrated.map((r) => r.capability).sort()).toEqual([
      'notebook',
      'panel:system/memory',
    ]);
    expect(FILES_PERMITTED_MIGRATIONS).toEqual(['panel:system/memory', 'notebook']);
    // The permission is not a waiver: a migrated row still has to explain where
    // the capability went, and gate 7b's own note names three destinations.
    const notebook = filesParityRow('notebook')!;
    expect(notebook.note).toMatch(/ReadingCapturesView/);
    expect(notebook.note.length).toBeGreaterThan(200);
  });

  it('gate 8: memory migrated, statistics did not, and the difference is derived', () => {
    // The claim the two rows make, checked against the files rather than against
    // each other. Memory's page is gone; statistics' section is not.
    expect(existsSync(join(ROOT, 'src/renderer/components/settings/pages/MemoryPage.tsx')))
      .toBe(false);
    const registry = read('src/renderer/components/settings/settingsRegistry.ts');
    // The page is out of the sidebar and out of the page switch...
    expect(registry).not.toMatch(/\{ id: 'memory',/);
    expect(read('src/renderer/components/settings/SettingsApp.tsx'))
      .not.toMatch(/case 'memory':/);
    // ...but `pageId: 'memory'` DELIBERATELY survives on the entries, and this
    // assertion is the right way round. The id is the historical coordinate the
    // agent index and stale deep links still speak; `SettingsApp.navigate`
    // redirects it. Deleting the entries would cost a user who types "factory
    // reset" the ability to find it at all — capability lost, not moved.
    // Both counted on the trailing comma, which is what makes them entry FIELDS
    // — the bare `movedTo: 'files'` also appears inside the explanatory comment
    // above SETTINGS_NAV, and counting that made this read 10.
    expect([...registry.matchAll(/pageId: 'memory',/g)]).toHaveLength(9);
    expect([...registry.matchAll(/movedTo: 'files',/g)]).toHaveLength(9);
    expect(registry).toMatch(/factory reset/i);
    expect(registry).toMatch(/SETTINGS_PAGES_MOVED_TO_FILES = \['memory'\] as const/);

    // Statistics: the section route is intact, so `preserved` is not a courtesy.
    expect(APP_SECTION).toMatch(/case 'stats':/);
    expect((DESKTOP_WIN_SECTIONS as readonly string[]).includes('stats')).toBe(true);
    const stats = filesParityRow('panel:system/statistics')!;
    expect(stats.status).toBe('preserved');
    expect(checkRow(stats)).toEqual([]);
    // Control: the same checker on the same row with the section removed must
    // fail, so the pass above is the route and not an empty check.
    expect(checkRow({ ...stats, section: null })).not.toEqual([]);

    // Every card the panels claim to own is routed by the table, nothing else is.
    const memoryCards = FILES_SYSTEM_PANEL_CARDS.filter(
      (c) => c.categoryId === 'system/memory',
    );
    expect(memoryCards).toHaveLength(9);
    expect(filesPanelForCard('factory-reset')).toBe('system/memory');
    expect(filesPanelForCard('appearance')).toBe(null);
  });

  it('the Notebook section is really gone from every registry it was in', () => {
    // The deletion half of gate 7b, re-derived from the files themselves rather
    // than from the row above — the row is a claim, these are the call sites.
    expect(APP_SECTION).not.toContain("case 'notebook':");
    expect(existsSync(join(ROOT, 'src/renderer/views/NotebookView.tsx'))).toBe(false);
    expect((DESKTOP_WIN_SECTIONS as readonly string[]).includes('notebook')).toBe(false);
    for (const rel of [
      'src/shared/agentNavigation.ts',
      'src/renderer/components/CommandPalette.tsx',
      'src/renderer/components/DesktopShell.tsx',
      'src/renderer/desktopIconPresets.ts',
      'src/main/osHotkeyHelper.ts',
    ]) {
      expect(read(rel), `${rel} still names the notebook section`).not.toMatch(/'notebook'/);
    }
    // The navigation index keeps the WORD, deliberately: `notebook` is a search
    // term on the `files` entry so a user who still asks for it by name lands
    // where their material is. What must be gone is the section entry itself.
    const navIndex = read('src/shared/agentNavigationIndex.ts');
    expect(navIndex).not.toMatch(/section: 'notebook'/);
    expect(navIndex).toMatch(/section: 'files'[^\n]*'notebook'/);
    // ...and the alias is what stops a persisted `section: 'notebook'` window
    // from becoming an unavailable state on every existing install.
    expect(normalizeWinSection('notebook')).toBe('files');
    // Control: a section id that was never real still resolves to null, so the
    // assertion above is testing the alias and not a function that says `files`
    // to everything.
    expect(normalizeWinSection('zzznotasection')).toBe(null);
  });

  it('accounts for every interactive control the Files app renders', () => {
    const rendered = new Set<string>();
    for (const m of FILES_APP.matchAll(/'(filesApp\.(?:action|sort|search|entry)\.[A-Za-z]+)'/g)) {
      rendered.add(m[1]);
    }
    expect([...rendered].sort()).toEqual([...FILES_APP_CONTROL_KEYS].sort());
    // Gate 10's ranked list labels its buttons with the DROP ROUTER's own
    // target names rather than a second set. Asserted here because those keys
    // are outside the `filesApp.*` prefix the scan above covers, so without
    // this line they would be controls nothing accounts for.
    expect(FILES_APP).toContain('targetLabelKey(candidate.target)');
    expect(read('src/shared/fileRouting.ts')).toContain('`fileDrop.target.${target}`');
  });

  it('names the mine action once per mineable kind', () => {
    // `mineabilityOf` admits exactly these three kinds; each needs its own row
    // because they came from three different places (or, for transcript, none).
    for (const kind of ['book', 'subtitle', 'transcript']) {
      expect(filesParityRow(`action:mine.${kind}`)).toBeDefined();
    }
  });

  describe('negative control — the checker can fail', () => {
    const base: FilesParityRow = {
      capability: 'control',
      status: 'preserved',
      section: 'library',
      module: 'src/renderer/views/LibraryView.tsx',
      symbol: 'LibraryView',
      note: 'the control row itself must pass, or the falsifications prove nothing',
    };

    it('passes on the honest row', () => {
      expect(checkRow(base)).toEqual([]);
    });

    it('fails on a module that does not exist', () => {
      expect(checkRow({ ...base, module: 'src/renderer/views/NoSuchView.tsx' })).toHaveLength(1);
    });

    it('fails on a symbol the named module does not contain', () => {
      expect(checkRow({ ...base, symbol: 'zzNotARealExportName' })).toHaveLength(1);
    });

    it('fails on a section AppSection does not route', () => {
      // Not a DesktopWinSection at all, and not a case in the switch.
      expect(checkRow({ ...base, section: 'nope' as never })).toHaveLength(1);
    });

    it('fails on a `new` row that smuggles in a section', () => {
      expect(checkRow({ ...base, status: 'new' }).length).toBeGreaterThan(0);
    });

    it('reports a migrated capability outside the whitelist', () => {
      const rogue: FilesParityRow = {
        capability: 'grammar',
        status: 'migrated',
        section: null,
        module: '',
        symbol: '',
        note: 'a capability that left its old home without permission',
      };
      expect(filesParityViolations([rogue])).toEqual([rogue]);
      expect(filesParityViolations([{ ...rogue, capability: 'panel:system/memory' }]))
        .toEqual([]);
      // And the near-miss: the whitelist is matched whole, so the BARE `memory`
      // that gate 8 rejected in favour of the prefixed id is still a violation.
      // Without this the spelling decision could silently regress.
      expect(filesParityViolations([{ ...rogue, capability: 'memory' }]))
        .toEqual([{ ...rogue, capability: 'memory' }]);
    });
  });
  /*
   * `filesReachability` is what turned this table from test-only evidence into
   * something the product says out loud. Every assertion below re-derives its
   * expectation from the table or from `FilesApp.tsx`'s own source, never from
   * a hand-copied list, and the last block is the negative control.
   */
  describe('filesReachability — the per-item route the inspector renders', () => {
    it('answers for every bare enumerator capability, and the arm matches the row', () => {
      const bare = FILES_ROUTE_PARITY.filter((row) => isEnumeratorCapability(row.capability));
      expect(bare.length).toBeGreaterThan(15);
      for (const row of bare) {
        const reach = filesReachability(row.capability);
        if (row.status === 'new') {
          // Nothing existed before, so there is no prior route to name.
          expect(reach, row.capability).toBeNull();
        } else if (row.status === 'migrated') {
          expect(reach, row.capability).toEqual({ kind: 'only-here' });
        } else if (row.section === 'global') {
          expect(reach, row.capability).toEqual({ kind: 'global' });
        } else {
          expect(reach, row.capability).toEqual({ kind: 'section', section: row.section });
        }
      }
    });

    it('every section it can name has a `palette.section.*` label in the English catalog', () => {
      // The inspector labels the `section` arm with `palette.section.<id>`, so a
      // section this function can return but the catalog cannot name would render
      // a raw key. Re-derived from the catalog file, not from a list here.
      const en = read('src/shared/i18n/catalogs/en.ts');
      const named = FILES_ROUTE_PARITY
        .filter((row) => isEnumeratorCapability(row.capability))
        .map((row) => filesReachability(row.capability))
        .filter((r): r is { kind: 'section'; section: string } => r?.kind === 'section');
      expect(named.length).toBeGreaterThan(10);
      for (const r of named) {
        expect(en, r.section).toContain(`'palette.section.${r.section}':`);
      }
    });

    it('refuses to invent a route for a capability the table does not carry', () => {
      expect(filesReachability('not-a-store')).toBeNull();
      expect(filesReachability('')).toBeNull();
    });

    it('is actually rendered by the inspector, beside the item source', () => {
      // Gate 6's promise is only kept if the product SAYS it. This pins the call
      // site, the three keys and the fact that no row is emitted when the answer
      // is null -- a `<dt>` with an empty `<dd>` reads as a claim that failed.
      expect(FILES_APP).toContain('filesReachability(selected.source)');
      expect(FILES_APP).toContain("t('filesApp.details.alsoIn')");
      expect(FILES_APP).toContain('filesApp.details.alsoInGlobal');
      expect(FILES_APP).toContain('filesApp.details.onlyHere');
      expect(FILES_APP).toContain('`palette.section.${reachability.section}`');
      expect(FILES_APP).toMatch(/reachability \? \(/);
    });

    it('NEGATIVE CONTROL: each arm is distinguishable, and a wrong status changes the answer', () => {
      // Without this, a `filesReachability` that returned one constant would pass
      // every assertion above that only checks "not null".
      const kinds = new Set(
        FILES_ROUTE_PARITY
          .map((row) => filesReachability(row.capability)?.kind ?? 'none')
          .values(),
      );
      expect(kinds).toEqual(new Set(['section', 'global', 'only-here', 'none']));

      // And the two capabilities that genuinely moved must NOT be reported as
      // reachable elsewhere -- that is the exact lie this line exists to prevent.
      for (const moved of FILES_PERMITTED_MIGRATIONS) {
        const reach = filesReachability(moved);
        if (reach) expect(reach.kind, moved).toBe('only-here');
      }
      expect(filesReachability('notebook')).toEqual({ kind: 'only-here' });
      expect(filesReachability('library')).toEqual({ kind: 'section', section: 'library' });
      expect(filesReachability('lookups')).toEqual({ kind: 'global' });
      expect(filesReachability('transcripts')).toBeNull();
    });
  });
});
