/**
 * Class 3b's gate: a dynamic i18n key whose catalog table has fallen behind the
 * string-union type that feeds it.
 *
 * The defect (D129, fixed `6bd06b89`): `VerifiedSiteSource` gained a fourth
 * member, the catalogs kept three, and a site whose source was `community`
 * rendered the literal text `verifiedSites.source.community` on screen — in all
 * four languages at once, through a shipped Import button.
 *
 * **No other gate in this repo can see that.** `i18n-check.cjs` compares the
 * four locales AGAINST EACH OTHER, so a key missing from all four is
 * unanimously consistent and reports exit 0 — it did, before and after the fix.
 * A missing-key scan resolves static `t('a.b')` literals and cannot evaluate a
 * template. So the detector is `src/.coordination/presweep/dynamic-i18n-key-scan.cjs`,
 * and this file is what makes it run: a `.cjs` under `.coordination` is executed
 * by nobody, and the class can return silently the moment the sweep ends.
 *
 * What is pinned here, in order: the repo is clean AND the binding heuristic is
 * still binding something (an assertion over an empty domain is vacuous); the
 * defect shape is caught; adding the key clears it; a single missing LOCALE is
 * named; and three of the five false shapes the scan was hardened against stay
 * suppressed, because a detector that fabricates rows is worse than none.
 *
 * KNOWN LIMIT, asserted rather than described: a prefix whose table is EMPTY in
 * every locale is skipped, not reported. That is a different class — nothing has
 * fallen behind, the labels were never written — and this gate's exit 0 must not
 * be read as covering it.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = path.join(__dirname, '..', '..', '..');
const SCAN = path.join(ROOT, 'src', '.coordination', 'presweep', 'dynamic-i18n-key-scan.cjs');
const LOCALES = ['en', 'ja', 'ru', 'zh'] as const;

interface Report {
  prefixesScanned: number;
  unionsHarvested: number;
  bound: number;
  findings: { key: string; union: string; missing: string[]; sites: string[] }[];
}

const made: string[] = [];
afterEach(() => {
  while (made.length) fs.rmSync(made.pop() as string, { recursive: true, force: true });
});

interface Fixture {
  /** The component source that declares the union and interpolates the key. */
  component: string;
  /** Suffixes the catalog spells, per locale. */
  table: Partial<Record<(typeof LOCALES)[number], string[]>>;
  /** Key prefix the table hangs off. */
  prefix?: string;
}

/**
 * A tree small enough to reason about and shaped exactly as the scan reads one.
 * The scan resolves its root from `__dirname/../../..`, so the script has to be
 * copied to the same path it occupies here or every scanned path comes out wrong.
 */
function build({ component, table, prefix = 'site.source.' }: Fixture): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dyn-i18n-'));
  made.push(dir);
  const presweep = path.join(dir, 'src', '.coordination', 'presweep');
  const catalogs = path.join(dir, 'src', 'shared', 'i18n', 'catalogs');
  fs.mkdirSync(presweep, { recursive: true });
  fs.mkdirSync(catalogs, { recursive: true });
  fs.mkdirSync(path.join(dir, 'src', 'renderer'), { recursive: true });
  fs.copyFileSync(SCAN, path.join(presweep, path.basename(SCAN)));
  fs.writeFileSync(path.join(dir, 'src', 'renderer', 'Widget.tsx'), component);

  for (const locale of LOCALES) {
    const rows = (table[locale] ?? [])
      .map((suffix) => `  '${prefix}${suffix}': '${locale}:${suffix}',`)
      .join('\n');
    fs.writeFileSync(
      path.join(catalogs, `${locale}.ts`),
      `export const ${locale} = {\n${rows}\n};\n`,
    );
  }
  return dir;
}

function run(dir: string): { status: number; report: Report } {
  const script = path.join(dir, 'src', '.coordination', 'presweep', path.basename(SCAN));
  try {
    const stdout = execFileSync(process.execPath, [script, '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, report: JSON.parse(stdout) as Report };
  } catch (err) {
    const e = err as { status?: number; stdout?: string };
    return { status: e.status ?? -1, report: JSON.parse(e.stdout ?? '{}') as Report };
  }
}

/** The D129 shape: a four-member union behind a three-row table. */
const FOUR_MEMBER_UNION = `
export type SiteSource = 'builtin' | 'user' | 'imported' | 'community';

export function Widget({ source }: { source: SiteSource }) {
  return <span>{t(\`site.source.\${source}\`)}</span>;
}
`;

const THREE = ['builtin', 'user', 'imported'];
const ALL_FOUR = [...THREE, 'community'];
const everyLocale = (suffixes: string[]) =>
  Object.fromEntries(LOCALES.map((l) => [l, suffixes])) as Fixture['table'];

describe('class 3b — a dynamic t() key whose union outgrew its catalog table', () => {
  it('reports the member no locale defines, and fails', () => {
    const { status, report } = run(build({ component: FOUR_MEMBER_UNION, table: everyLocale(THREE) }));
    expect(report.findings.map((f) => f.key)).toEqual(['site.source.community']);
    expect(report.findings[0].union).toBe('SiteSource');
    expect(report.findings[0].missing).toEqual([...LOCALES]);
    // `path.relative` gives backslashes here, so the citation is normalized
    // rather than matched raw — the scan's own report text is unchanged.
    expect(report.findings[0].sites.map((s) => s.replace(/\\/g, '/'))).toEqual([
      'src/renderer/Widget.tsx',
    ]);
    expect(status).toBe(1);
  });

  it('MUTATION CONTROL: writing the fourth row in all four locales clears it', () => {
    // Same tree, one difference. Without this the assertion above could be
    // satisfied by a scan that reports every prefix it ever binds.
    const { status, report } = run(build({ component: FOUR_MEMBER_UNION, table: everyLocale(ALL_FOUR) }));
    expect(report.findings).toEqual([]);
    expect(report.bound).toBe(1); // it still bound the prefix; it simply found no gap
    expect(status).toBe(0);
  });

  it('names the ONE locale a key is missing from, not just "somewhere"', () => {
    const { status, report } = run(
      build({
        component: FOUR_MEMBER_UNION,
        table: { en: ALL_FOUR, ja: ALL_FOUR, zh: ALL_FOUR, ru: THREE },
      }),
    );
    expect(report.findings.map((f) => f.missing)).toEqual([['ru']]);
    expect(status).toBe(1);
  });

  it('does NOT bind a table the union fails to contain — overlap alone is not a domain', () => {
    // The first false shape: with overlap-only binding this reported 75 keys,
    // most of them nonsense, because generic member names recur across unrelated
    // unions. A table carrying a suffix the union has never heard of is not that
    // union's label table, and a member it happens to lack is not a defect.
    const { status, report } = run(
      build({ component: FOUR_MEMBER_UNION, table: everyLocale([...THREE, 'legacy']) }),
    );
    expect(report.bound).toBe(0);
    expect(report.findings).toEqual([]);
    expect(status).toBe(0);
  });

  it('does NOT report a member the call site compares against by hand', () => {
    // Second false shape, measured on DeckWorkbench (`verdict !== 'ok'`) and
    // MediaProviderPanel (`status === 'ready'`): a member guarded out before the
    // template is built can never reach the catalog, so its absence is correct.
    const guarded = `
export type SiteSource = 'builtin' | 'user' | 'imported' | 'community';

export function Widget({ source }: { source: SiteSource }) {
  if (source === 'community') return <CommunityBadge />;
  return <span>{t(\`site.source.\${source}\`)}</span>;
}
`;
    const { status, report } = run(build({ component: guarded, table: everyLocale(THREE) }));
    expect(report.findings).toEqual([]);
    expect(status).toBe(0);
  });

  it('does NOT report a member absent from the literal array the call site iterates', () => {
    // Third false shape: BlancShell maps over four of its five reset categories
    // deliberately, and `FILE_KINDS` omits the machine-initiated `relabel`. Where
    // an array IS the domain, the union overstates it.
    const iterated = `
export type SiteSource = 'builtin' | 'user' | 'imported' | 'community';

const SHOWN: SiteSource[] = ['builtin', 'user', 'imported'];

export function Widget() {
  return <>{SHOWN.map((source) => <span key={source}>{t(\`site.source.\${source}\`)}</span>)}</>;
}
`;
    const { status, report } = run(build({ component: iterated, table: everyLocale(THREE) }));
    expect(report.findings).toEqual([]);
    expect(status).toBe(0);
  });

  it('SKIPS a prefix with no table at all — the limit, so exit 0 is not over-read', () => {
    // Not a pass and not a bug: nothing has fallen behind, the labels were never
    // written. It is a different class and this gate does not cover it. Asserted
    // here so the boundary is a fact in the suite rather than a line in a doc.
    const { status, report } = run(build({ component: FOUR_MEMBER_UNION, table: {} }));
    expect(report.prefixesScanned).toBe(1);
    expect(report.bound).toBe(0);
    expect(report.findings).toEqual([]);
    expect(status).toBe(0);
  });

  it(
    'leaves THIS repo with no buildable key that any locale is missing',
    () => {
      const out = execFileSync(process.execPath, [SCAN, '--json'], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const report = JSON.parse(out) as Report;
      expect(report.findings).toEqual([]);
      // Non-vacuity. If the binding heuristic ever breaks — a refactor renames the
      // union export form, the catalog stops being a flat object literal — `bound`
      // collapses to 0 and the assertion above becomes true of nothing. 110 prefixes
      // were bound when this landed; the floor is deliberately far below that, so it
      // catches a collapse without going red on ordinary churn.
      expect(report.bound).toBeGreaterThan(50);
      expect(report.prefixesScanned).toBeGreaterThan(100);
    },
    60_000,
  );
});
