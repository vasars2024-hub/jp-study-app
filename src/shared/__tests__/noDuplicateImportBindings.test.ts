/**
 * D159 guard: a module that imports the same binding twice is a redeclaration.
 *
 * Vitest's transform and the production bundle both tolerated
 * `import { useT } from '../../i18n'` appearing twice in BlancAppDrawerPanel.tsx,
 * but the dev server's React (Babel) transform rejects it with "Identifier 'useT'
 * has already been declared" — and because BlancShell imports that panel, the whole
 * renderer module graph failed and `npm start` showed an empty window with nothing
 * in the console. No unit test imports the renderer entry, so nothing caught it.
 * This scans every source module for a local name bound by more than one import.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Local names bound by static import declarations (type-only imports excluded). */
export function importedBindings(source: string): string[] {
  const names: string[] = [];
  const decl = /^import\s+(?!type\s)([\s\S]*?)\s+from\s+['"][^'"]+['"]/gm;
  for (const m of source.matchAll(decl)) {
    const clause = m[1];
    const braces = /\{([\s\S]*)\}/.exec(clause);
    if (braces) {
      for (const part of braces[1].split(',')) {
        const p = part.trim();
        if (!p || p.startsWith('type ')) continue;
        const local = p.split(/\s+as\s+/).pop()!.trim();
        if (local) names.push(local);
      }
    }
    const head = clause.replace(/\{[\s\S]*\}/, '').replace(/,/g, ' ').trim();
    const ns = /\*\s+as\s+([\w$]+)/.exec(head);
    if (ns) names.push(ns[1]);
    const def = head.replace(/\*\s+as\s+[\w$]+/, '').trim();
    if (def) names.push(def);
  }
  return names;
}

describe('no module binds the same import twice (D159)', () => {
  it('detects the D159 shape', () => {
    const src = "import { useT } from '../../i18n';\nimport { a } from './a';\nimport { useT } from '../../i18n';\n";
    const names = importedBindings(src);
    expect(names.filter((n) => n === 'useT')).toHaveLength(2);
  });

  it('holds for every source module', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const names = importedBindings(readFileSync(file, 'utf8'));
      const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
      if (dupes.length) offenders.push(`${relative(SRC, file)}: ${dupes.join(', ')}`);
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
