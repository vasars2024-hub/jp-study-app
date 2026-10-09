import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

/**
 * Static import graph walker for boot-graph guards (perf2).
 *
 * Follows value-carrying `import … from`, `export … from` and bare side-effect
 * `import '…'` edges between local files. Type-only imports and dynamic
 * `import()` are skipped: neither is startup cost. Same rules as
 * blancBootGraph.test.ts, shared so the Study OS guard cannot drift from it.
 */

const SRC = resolve(__dirname, '..', '..');
const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];

export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
}

export function staticSpecifiers(source: string): string[] {
  const code = stripComments(source);
  const out: string[] = [];
  const re = /(?:^|[;\n])\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]|(?:^|[;\n])\s*import\s+['"]([^'"]+)['"]/g;
  for (const m of code.matchAll(re)) {
    if (m[5]) {
      out.push(m[5]);
      continue;
    }
    if (m[2]) continue;
    const clause = m[3] ?? '';
    const braced = clause.match(/^\{([\s\S]*)\}$/);
    if (braced && braced[1].split(',').map((s) => s.trim()).filter(Boolean).every((s) => s.startsWith('type '))) continue;
    out.push(m[4]);
  }
  return out;
}

function resolveLocal(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec.split('?')[0]);
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

export function rel(file: string): string {
  return relative(resolve(SRC, '..'), file).replace(/\\/g, '/');
}

export interface ImportGraph {
  /** file -> chain of files from the entry */
  files: Map<string, string[]>;
  /** bare package -> chain */
  packages: Map<string, string[]>;
}

export function walkImportGraph(entry: string): ImportGraph {
  const files = new Map<string, string[]>();
  const packages = new Map<string, string[]>();
  const queue: Array<[string, string[]]> = [[entry, [rel(entry)]]];
  for (let next = queue.shift(); next; next = queue.shift()) {
    const [file, chain] = next;
    if (files.has(file)) continue;
    files.set(file, chain);
    if (!/\.(t|j)sx?$/.test(file)) continue;
    for (const spec of staticSpecifiers(readFileSync(file, 'utf8'))) {
      if (spec.startsWith('.')) {
        const target = resolveLocal(file, spec);
        if (target && !files.has(target)) queue.push([target, [...chain, rel(target)]]);
      } else if (!packages.has(spec)) {
        packages.set(spec, [...chain, spec]);
      }
    }
  }
  return { files, packages };
}

/** Bytes of local source reachable at boot — a stable proxy for the bundle. */
export function graphSourceBytes(graph: ImportGraph): number {
  let total = 0;
  for (const file of graph.files.keys()) total += statSync(file).size;
  return total;
}
