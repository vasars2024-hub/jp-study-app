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
import { DESKTOP_WIN_SECTIONS } from '../desktop';
import {
  FILES_APP_CONTROL_KEYS,
  FILES_PERMITTED_MIGRATIONS,
  FILES_ROUTE_PARITY,
  filesParityRow,
  filesParityViolations,
  type FilesParityRow,
} from '../filesApp/routeParity';

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
    const declared = FILES_ROUTE_PARITY.map((r) => r.capability).filter(
      (c) => !c.startsWith('action:'),
    );
    expect(new Set(declared).size).toBe(declared.length);
    expect([...new Set(sources)].sort()).toEqual([...declared].sort());
    // Control: dropping any one row must break the equality above.
    expect([...new Set(sources)].sort()).not.toEqual([...declared].slice(1).sort());
  });

  it('re-derives every preserved route from the file it names', () => {
    const failures = FILES_ROUTE_PARITY.map((row) => [row.capability, checkRow(row)] as const)
      .filter(([, problems]) => problems.length > 0);
    expect(failures).toEqual([]);
  });

  it('has no capability that became Files-app-only', () => {
    expect(filesParityViolations()).toEqual([]);
    // Gate 6 is measured before gate 8 lands, so the permitted exception is not
    // in use yet. When memory/statistics migrate, this flips to 2 and the rows
    // must be present — it cannot silently stay at 0.
    const migrated = FILES_ROUTE_PARITY.filter((r) => r.status === 'migrated');
    expect(migrated.map((r) => r.capability).sort()).toEqual([]);
    expect(FILES_PERMITTED_MIGRATIONS).toEqual(['memory', 'statistics']);
  });

  it('accounts for every interactive control the Files app renders', () => {
    const rendered = new Set<string>();
    for (const m of FILES_APP.matchAll(/'(filesApp\.(?:action|sort|search|entry)\.[A-Za-z]+)'/g)) {
      rendered.add(m[1]);
    }
    expect([...rendered].sort()).toEqual([...FILES_APP_CONTROL_KEYS].sort());
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
      expect(filesParityViolations([{ ...rogue, capability: 'memory' }])).toEqual([]);
    });
  });
});
