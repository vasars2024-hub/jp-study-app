/**
 * The main and preload bundles must not reach renderer-only code.
 *
 * WHY THIS EXISTS, and it is a measured correction rather than a hypothetical.
 * A handoff reported that "main/preload Vite builds are blocked by the unresolved
 * MediaWorkspace import `@/app/(main)/_features/anime-library/_lib/handle-library-collection`".
 * Re-derived 2026-08-29: that is FALSE as a statement about the main build, and the way it
 * became convincing is worth pinning. Running
 *
 *     npx vite build --config vite.main.config.ts
 *
 * with no entry does NOT build the main process. `vite.main.config.ts` declares no
 * `build.lib`, so Vite falls back to the repo-root `index.html` — the RENDERER — and builds
 * it under a config that lacks ADR-004's `@` alias, which only `vite.renderer.config.ts`
 * defines. The failure is real, reproducible, and about the wrong bundle. Built with the
 * entries `forge.config.ts` actually passes, both succeed:
 *
 *     vite build -c vite.main.config.ts    --ssr src/main.ts      ->  389+ modules, OK
 *     vite build -c vite.preload.config.ts --ssr src/preload.ts   ->   25  modules, OK
 *
 * The underlying fragility the false report pointed at IS real, though, which is what this
 * file guards. `@`-aliased and renderer-only modules resolve in exactly one of the three
 * build configs. Nothing stops someone importing one from a main-process module: the editor
 * resolves it (tsconfig carries the alias), the dev server resolves it (Forge serves the
 * renderer through the aliased config), vitest resolves it — and the break surfaces only at
 * `npm run make`, in packaging, which is the most expensive place to learn it.
 *
 * So the property asserted is the one that makes an alias-less `vite.main.config.ts`
 * sufficient: walking the real entries over static and dynamic imports, nothing reached
 * lives under `src/renderer/`, `src/media/` or `vendor/`, and nothing reached names a `@/`
 * specifier. `src/shared/` is explicitly allowed — that is what it is for.
 *
 * THE CONTROL is the `walker can actually see` block. A resolver that silently returns null
 * reports "reaches nothing forbidden" for every input and passes forever; the same shape of
 * dead guard that `mediaSurfaceImportGraph.test.ts` documents. It asserts the walk reaches a
 * substantial graph and that a known renderer-only specifier IS classified as forbidden.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

const REPO = resolve(__dirname, '../..', '..');
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'];

/**
 * Directories a main-process or preload module may never reach.
 *
 * `vendor/seanime-web` and not `vendor/`: measured, the main graph legitimately reaches
 * `vendor/seanime/generated/types` from three modules (`seanimeManga.ts`,
 * `studyLibrary.ts` and one more). That is the generated wire-type contract for a service
 * main talks to — types only, erased by the bundler, no alias, and it builds. The adopted
 * WEB tree next to it is the renderer-only half, and it is the half `@` points at.
 */
const FORBIDDEN_ROOTS = ['src/renderer', 'src/media', 'vendor/seanime-web'];

const posix = (p: string): string => relative(REPO, p).split('\\').join('/');

function resolveRelative(specifier: string, fromFile: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), specifier);
  for (const ext of EXTENSIONS) if (existsSync(base + ext)) return base + ext;
  if (existsSync(base) && statSync(base).isDirectory()) {
    for (const ext of EXTENSIONS) {
      const index = resolve(base, `index${ext}`);
      if (existsSync(index)) return index;
    }
  }
  return existsSync(base) && statSync(base).isFile() ? base : null;
}

/**
 * Every specifier the bundler would follow. `import type` is deliberately included: Vite
 * strips it, but a type-only edge into `src/renderer` is still a design error here, and
 * distinguishing them would mean parsing rather than scanning.
 */
function specifiersOf(source: string): string[] {
  const found: string[] = [];
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
  ];
  for (const re of patterns) {
    let m = re.exec(source);
    while (m) {
      found.push(m[1]);
      m = re.exec(source);
    }
  }
  return found;
}

interface Walk {
  reached: string[];
  forbidden: Array<{ file: string; specifier: string; reason: string }>;
}

function walk(entry: string): Walk {
  const start = resolve(REPO, entry);
  const seen = new Set<string>([start]);
  const queue = [start];
  const forbidden: Walk['forbidden'] = [];

  while (queue.length) {
    const file = queue.shift() as string;
    const source = readFileSync(file, 'utf8');
    for (const specifier of specifiersOf(source)) {
      if (specifier.startsWith('@/')) {
        forbidden.push({ file: posix(file), specifier, reason: 'renderer-only @ alias' });
        continue;
      }
      const target = resolveRelative(specifier, file);
      if (!target) continue; // a bare package specifier; node_modules is out of scope
      const rel = posix(target);
      const root = FORBIDDEN_ROOTS.find((r) => rel === r || rel.startsWith(`${r}/`));
      if (root) {
        forbidden.push({ file: posix(file), specifier, reason: `reaches ${root}/` });
        continue;
      }
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return { reached: [...seen].map(posix).sort(), forbidden };
}

describe('main/preload build graph boundary', () => {
  it('walker can actually see the graph, and does classify a renderer edge', () => {
    const main = walk('src/main.ts');
    // A resolver that returns null for everything would report a clean graph forever.
    expect(main.reached.length).toBeGreaterThan(100);
    expect(main.reached).toContain('src/main.ts');
    expect(main.reached.some((f) => f.startsWith('src/main/'))).toBe(true);
    expect(main.reached.some((f) => f.startsWith('src/shared/'))).toBe(true);

    // THE NEGATIVE CONTROL, and it uses the exact specifier the false report named. Walking
    // from a renderer surface must FLAG what walking from src/main.ts finds nothing of;
    // otherwise `forbidden: []` above is a property of the walker, not of the main graph.
    expect(existsSync(resolve(REPO, 'src/media/MediaWorkspace.tsx'))).toBe(true);
    const control = walk('src/media/MediaWorkspace.tsx');
    expect(control.forbidden.length).toBeGreaterThan(0);
    expect(control.forbidden.map((f) => f.specifier)).toContain(
      '@/app/(main)/_features/anime-library/_lib/handle-library-collection',
    );
  });

  it('src/main.ts reaches no renderer-only module', () => {
    expect(walk('src/main.ts').forbidden).toEqual([]);
  });

  it('src/preload.ts reaches no renderer-only module', () => {
    expect(walk('src/preload.ts').forbidden).toEqual([]);
  });

  it('every extra main-process entry Forge builds stays inside the boundary', () => {
    // Named in forge.config.ts's `build` list alongside src/main.ts, and each is bundled
    // with the same alias-less vite.main.config.ts, so each needs the same property.
    const entries = [
      'src/main/dictionary/importWorker.ts',
      'src/main/anki/apkgReadWorker.ts',
      'src/main/llamaHostWorker.ts',
    ].filter((e) => existsSync(resolve(REPO, e)));
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect({ entry, forbidden: walk(entry).forbidden }).toEqual({ entry, forbidden: [] });
    }
  });
});
