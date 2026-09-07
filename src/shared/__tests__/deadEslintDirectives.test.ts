import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Pre-sweep D146 — a lint directive for a rule this repo does not load.
 *
 * `.eslintrc.json` extends `eslint:recommended`, `@typescript-eslint` and
 * `import` and nothing else; `eslint-plugin-react-hooks` is not a dependency.
 * ESLint does not ignore a directive naming an unknown rule — it reports
 * "Definition for rule 'x' was not found" as an ERROR. So ten committed source
 * files failed `npx eslint`, the repo's own per-turn gate, on 13 errors that
 * belonged to nobody, and any turn touching one of them had to prove that
 * before it could read its own result.
 *
 * The second half is the one that matters more: the rule never ran, so those
 * dependency arrays were never actually checked, while the comment beside them
 * claimed a deliberate exemption from a check that does not exist. Several of
 * them are exactly the `lang`, never `t` case CLAUDE.md §6 calls the number-one
 * review item for new i18n code.
 *
 * Four files had already worked this out and written the corrective note
 * ("No eslint-disable: ... the directive would itself be reported as an
 * error"). This finishes that convention across the other six and pins it.
 *
 * DELIBERATELY NOT DONE: installing `eslint-plugin-react-hooks`. That is the
 * textbook repair and it is the wrong size — it adds a root dependency and
 * turns a new rule on across ~2,600 modules, two days before release, to fix a
 * gate that a comment change fixes today. Recorded so it is not re-proposed as
 * an oversight. If it is ever installed, this test is the list of places whose
 * deps then want a real look.
 */
const ROOT = resolve(__dirname, '..', '..', '..');

/**
 * An actual directive, not prose that mentions one.
 *
 * ESLint only honours a directive that OPENS the comment, and everything after
 * it up to the rule name is a rule list — word characters, `@`, `/`, `-` and
 * commas, never a sentence. Anchoring on the comment opener and restricting the
 * span is what separates a directive from the four different corrective notes
 * already in the tree, three of which a looser first version scored as
 * offenders: "NOTE: no eslint-disable here. `react-hooks/exhaustive-deps` is not
 * loaded" is prose about a directive and is exactly what a passing file looks
 * like now.
 */
const DIRECTIVE = /(?:\/\/|\/\*)\s*eslint-disable(?:-next-line|-line)?[ \t]+[\w@/,\s-]*react-hooks\//;

/** Every rule prefix ESLint can actually resolve here, from `.eslintrc.json`. */
const LOADED_PLUGINS = ['@typescript-eslint/', 'import/'];

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'vendor') sources(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('no eslint directive names a rule this config cannot load', () => {
  const files = sources(resolve(ROOT, 'src'));

  it('finds a real file set to scan', () => {
    expect(files.length).toBeGreaterThan(500);
  });

  it('no source disables react-hooks/*, which is not a loaded plugin', () => {
    const offenders = files
      // This file's own fixtures below ARE the thing being looked for, so it is
      // the one file that cannot be scanned by it.
      .filter((f) => !f.endsWith('deadEslintDirectives.test.ts'))
      .filter((f) => DIRECTIVE.test(readFileSync(f, 'utf8')))
      .map((f) => f.replace(/\\/g, '/').slice(ROOT.replace(/\\/g, '/').length + 1));
    expect(offenders).toEqual([]);
  });

  it('the matcher scores a directive and spares the note that replaced it', () => {
    expect(DIRECTIVE.test('  // eslint-disable-next-line react-hooks/exhaustive-deps')).toBe(true);
    expect(DIRECTIVE.test('  [lang], // eslint-disable-line react-hooks/exhaustive-deps')).toBe(true);
    expect(DIRECTIVE.test('/* eslint-disable react-hooks/rules-of-hooks */')).toBe(true);
    expect(DIRECTIVE.test('// No eslint-disable: react-hooks/exhaustive-deps is not configured')).toBe(false);
    // The three older wordings already in the tree, verbatim. A looser matcher
    // scored all three as offenders, which would have "repaired" correct files.
    expect(DIRECTIVE.test('  // NOTE: no eslint-disable here. `react-hooks/exhaustive-deps` is not loaded')).toBe(false);
    expect(DIRECTIVE.test('  // NOTE: no eslint-disable here — `react-hooks/exhaustive-deps` isn\'t loaded')).toBe(false);
    expect(DIRECTIVE.test('  // No eslint-disable: `react-hooks/exhaustive-deps` is not a configured rule here, so')).toBe(false);
    // A directive for a rule that IS loaded is none of this test's business.
    expect(DIRECTIVE.test('// eslint-disable-next-line @typescript-eslint/no-explicit-any')).toBe(false);
  });

  it('the plugins this config does load are still spelled the way the rules assume', () => {
    const config = JSON.parse(readFileSync(resolve(ROOT, '.eslintrc.json'), 'utf8')) as {
      extends: string[];
    };
    // If someone adds `plugin:react-hooks/recommended` here, the directives become
    // legal again and this whole test should be deleted rather than worked around.
    expect(config.extends.some((e) => e.includes('react-hooks'))).toBe(false);
    for (const prefix of LOADED_PLUGINS) {
      expect(config.extends.some((e) => e.includes(prefix.replace('/', '')))).toBe(true);
    }
  });
});
