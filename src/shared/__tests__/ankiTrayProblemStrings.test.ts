/**
 * Every tray problem code must have an English catalog entry.
 *
 * **Why this test exists.** `DeckWorkbenchTray` renders each problem through a
 * key it builds at runtime — `t(`ankiWorkbench.tray.problem.${problem.code}`)`.
 * Nothing else can see that. `tools/i18n-check.cjs` compares en against ja/zh/ru
 * and is silent about a key no catalog defines at all; the tray's own tests stub
 * `t` so it echoes the key, so an absent string still makes their assertions
 * pass. And `translate()` returns the raw key when English lacks it too
 * (`i18n/core.ts:94`), so the user is shown the literal text
 * `ankiWorkbench.tray.problem.split-moved`.
 *
 * That is not hypothetical. Recipe 13 shipped all eight of its `split-*` codes
 * with no string in any catalog, past a green suite, a green i18n-check and a
 * live walk — this test was written because it did.
 *
 * **Why a source scan.** Both unions are TypeScript types with no runtime form,
 * and the catalog is composed from spreads. Reading the sources is the only way
 * to compare the codes that exist against the strings that exist.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SHARED = join(__dirname, '..');
const TRAY_SOURCE = join(SHARED, 'ankiChangeTray.ts');
const EN_CATALOG = join(SHARED, 'i18n', 'catalogs', 'en.ts');

/**
 * The members of `export type Name = 'a' | 'b' | ...`.
 *
 * Comments are stripped first, and that is load-bearing rather than tidy: every
 * member of these two unions is documented, and one of those sentences ends
 * "have all left the new queue;" — slicing to the first `;` stops there and
 * silently returns 34 of the 60 codes. The threshold assertions below exist
 * because that truncation looked exactly like a passing scan.
 */
function unionMembers(source: string, name: string): string[] {
  const bare = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const start = bare.indexOf(`export type ${name} =`);
  if (start === -1) throw new Error(`no union named ${name}`);
  const body = bare.slice(start, bare.indexOf(';', start));
  return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** Every `  'some.key':` defined in the English catalog. */
function englishKeys(): Set<string> {
  const keys = new Set<string>();
  for (const line of readFileSync(EN_CATALOG, 'utf8').split('\n')) {
    const key = /^\s+'([^']+)':/.exec(line)?.[1];
    if (key) keys.add(key);
  }
  return keys;
}

describe('anki tray strings', () => {
  const source = readFileSync(TRAY_SOURCE, 'utf8');

  it('gives every TrayProblemCode an English string', () => {
    const codes = unionMembers(source, 'TrayProblemCode');
    const keys = englishKeys();
    // The scan is only meaningful if it found both halves.
    expect(codes.length, 'the union was parsed').toBeGreaterThan(50);
    expect(keys.size, 'the catalog was parsed').toBeGreaterThan(1000);
    const missing = codes.filter((code) => !keys.has(`ankiWorkbench.tray.problem.${code}`));
    expect(missing, 'no problem code renders as a raw key at the user').toEqual([]);
  });

  it('gives every TrayActionKind an English name', () => {
    const kinds = unionMembers(source, 'TrayActionKind');
    const keys = englishKeys();
    expect(kinds.length, 'the union was parsed').toBeGreaterThan(10);
    const missing = kinds.filter((kind) => !keys.has(`ankiWorkbench.tray.kind.${kind}`));
    expect(missing, 'no action kind renders as a raw key at the user').toEqual([]);
  });
});

/**
 * Step 7's two error codes, built into a key the same runtime way
 * (`DeckWorkbenchApply.tsx:242` and `:155`). Same class of defect and the same
 * blind spot: recipe 13's live refusal shipped with no `liveError` string, so a
 * refused split showed the user the literal key. That code has since been
 * replaced by a real write path, which is exactly why this guard runs against
 * the union rather than against a list — the members keep changing.
 */
describe('anki apply error strings', () => {
  /** `cancelled` is filtered out before the panel renders (`DeckWorkbenchApply.tsx:80`). */
  const NEVER_RENDERED = new Set(['cancelled']);

  it('gives every ApkgExportErrorCode an English string', () => {
    const codes = unionMembers(
      readFileSync(join(SHARED, 'ankiApkgExport.ts'), 'utf8'),
      'ApkgExportErrorCode',
    ).filter((code) => !NEVER_RENDERED.has(code));
    const keys = englishKeys();
    expect(codes.length, 'the union was parsed').toBeGreaterThan(10);
    const missing = codes.filter((code) => !keys.has(`ankiWorkbench.apply.error.${code}`));
    expect(missing, 'no export refusal renders as a raw key at the user').toEqual([]);
  });

  it('gives every ConnectCommitErrorCode an English string', () => {
    const codes = unionMembers(
      readFileSync(join(SHARED, 'ankiConnectCommit.ts'), 'utf8'),
      'ConnectCommitErrorCode',
    ).filter((code) => !NEVER_RENDERED.has(code));
    const keys = englishKeys();
    expect(codes.length, 'the union was parsed').toBeGreaterThan(10);
    const missing = codes.filter((code) => !keys.has(`ankiWorkbench.apply.liveError.${code}`));
    expect(missing, 'no live-commit refusal renders as a raw key at the user').toEqual([]);
  });
});
