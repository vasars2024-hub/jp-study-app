import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Blanc's startup import graph.
 *
 * Blanc exists to be the cheap way into the study app, so what its entry pulls
 * in before first paint is the product, not an implementation detail. Measured
 * 2026-10-07: one static import in BlancShell (`BlancReadyToolPanels`) reached
 * `agentToolRegistry` → `studyAgentHandlers` → `mediaStudyOrchestrator` →
 * `data/grammar`, which put ~2 MB of grammar data — and, via that module's
 * load-time `void import(...studyos-compat.css)`, the whole 500 KB Study OS
 * stylesheet — into Blanc's startup. Startup went from a planned 0.9 MB to
 * 5.7 MB and nothing failed.
 *
 * This walks the STATIC imports reachable from `blancMain.tsx` (type-only
 * imports and dynamic `import()` are not startup cost and are skipped) and
 * forbids the heavy subsystems a toolbox window must never pay for up front.
 * The walk reads real source files, so a new eager edge anywhere in the graph
 * fails here, at the file that introduced it.
 */

const RENDERER = resolve(__dirname, '..');
const ENTRY = resolve(RENDERER, 'blancMain.tsx');
const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
}

/** Static, value-carrying import/export-from specifiers of one module. */
function staticSpecifiers(source: string): string[] {
  const code = stripComments(source);
  const out: string[] = [];
  const re = /(?:^|[;\n])\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]|(?:^|[;\n])\s*import\s+['"]([^'"]+)['"]/g;
  for (const m of code.matchAll(re)) {
    if (m[5]) {
      out.push(m[5]);
      continue;
    }
    if (m[2]) continue; // `import type … from` / `export type … from`
    const clause = m[3] ?? '';
    // `import { type A, type B } from` carries no runtime edge either.
    const braced = clause.match(/^\{([\s\S]*)\}$/);
    if (braced && braced[1].split(',').map((s) => s.trim()).filter(Boolean).every((s) => s.startsWith('type '))) continue;
    out.push(m[4]);
  }
  return out;
}

function resolveLocal(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

interface Graph {
  files: Map<string, string[]>; // file -> chain from entry
  packages: Map<string, string[]>; // bare package -> chain
}

function walk(): Graph {
  const files = new Map<string, string[]>();
  const packages = new Map<string, string[]>();
  const queue: Array<[string, string[]]> = [[ENTRY, [rel(ENTRY)]]];
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

function rel(file: string): string {
  return relative(resolve(RENDERER, '..'), file).replace(/\\/g, '/');
}

const FORBIDDEN_FILES: Array<[RegExp, string]> = [
  [/\/data\/grammar(\/|\.ts$|$)/, 'the grammar data set (~2 MB built)'],
  [/\/agentToolRegistry\.ts$/, 'the agent tool registry (reaches the study orchestrator and grammar data)'],
  [/\/renderer\/mediaStudyOrchestrator\.ts$/, 'the media study orchestrator (imports the grammar data)'],
  [/\/city\//, 'the city engine'],
  // The environment LAYERS. Two tiny data modules in that folder are shared
  // (`companionEvents` is an event-name bus the deck emits on, `types` holds the
  // storage defaults) and cost a few KB; the stage, weather, wallpaper and
  // companion surfaces are what Blanc must never mount.
  [/\/environment\/(?!companionEvents\.ts$|types\.ts$)/, 'the Study OS environment layer'],
  [/particle/i, 'the particle engine'],
  [/\/widgets\/registry\.tsx?$/, 'the Study OS widget registry'],
  [/\/components\/DesktopShell\.tsx$/, 'the Study OS desktop shell'],
  [/\/ocr\.ts$/, 'the OCR stack'],
];

const FORBIDDEN_PACKAGES: Array<[RegExp, string]> = [
  [/^tesseract\.js/, 'tesseract.js'],
  [/^@huggingface\/transformers/, 'transformers.js'],
  [/^onnxruntime/, 'onnxruntime'],
  [/^pdfjs-dist/, 'pdf.js'],
  // kuromoji's CODE (~40 KB with `async`) is allowed: the global lookup gesture
  // asks `tokenizerReady()`, and making the library a dynamic import breaks the
  // IIFE worker build that shares `tokenizer.ts` (measured: Rollup refuses
  // code-splitting for `studyWords.worker`). Its 20 MB DICTIONARY is fetched on
  // first use, never at startup. Only the bundled full build is forbidden.
  [/^kuromoji$|kuromoji\/build\//, 'the bundled kuromoji build'],
];

describe('Blanc startup import graph', () => {
  const graph = walk();

  it('reads the real entry and a non-trivial graph', () => {
    // A walker that resolves nothing would pass every assertion below.
    expect(graph.files.size).toBeGreaterThan(40);
    expect([...graph.files.keys()].some((f) => f.endsWith('BlancShell.tsx'))).toBe(true);
  });

  it('reaches none of the heavy Study OS subsystems', () => {
    const hits: string[] = [];
    for (const [file, chain] of graph.files) {
      const name = rel(file);
      for (const [pattern, what] of FORBIDDEN_FILES) {
        if (pattern.test(`/${name}`)) hits.push(`${what}: ${chain.join(' -> ')}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('reaches none of the heavy packages', () => {
    const hits: string[] = [];
    for (const [pkg, chain] of graph.packages) {
      for (const [pattern, what] of FORBIDDEN_PACKAGES) {
        if (pattern.test(pkg)) hits.push(`${what}: ${chain.join(' -> ')}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('has no load-time import of the Study OS stylesheet in a startup module', () => {
    // A module-level `void import('…studyos-compat.css')` runs the moment its
    // module evaluates, so in a startup module it is startup CSS (~500 KB).
    const hits: string[] = [];
    for (const [file, chain] of graph.files) {
      if (!/\.(t|j)sx?$/.test(file)) continue;
      const code = stripComments(readFileSync(file, 'utf8'));
      if (/^\s*(void\s+)?import\(\s*['"][^'"]*studyos-compat[^'"]*['"]\s*\)/m.test(code)) {
        hits.push(chain.join(' -> '));
      }
    }
    expect(hits).toEqual([]);
  });
});
