// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * `fileRouterPlanning.ts` was split out of `fileRouter.ts` so the Files ingest
 * worker can share the drop router's decisions: recursive folder scans and
 * archive sniffing are too heavy for Electron's main event loop, but the
 * classification they feed must not fork into a second implementation.
 *
 * That only holds while the module stays Electron-free, and nothing about the
 * split enforces it — a later edit reaching for `ipcMain` or `app.getPath()`
 * would compile, pass every other suite, and silently make the module
 * unloadable in a utility process. So both halves of the contract are pinned:
 * the module imports with **no `electron` mock in scope**, and no file in its
 * local import closure names `electron` at all.
 *
 * Contrast `fileRouterSniff.test.ts`, which imports through `../fileRouter` and
 * therefore must `vi.mock('electron')` first. That mock is deliberately absent
 * here; adding one would void this test without failing it.
 */

const { planForPath } = await import('../fileRouterPlanning');

const mainDir = path.dirname(fileURLToPath(import.meta.url));
const planningEntry = path.join(mainDir, '..', 'fileRouterPlanning.ts');

/** Every local `.ts` file reachable from `entry` by relative import, including it. */
function localImportClosure(entry: string): string[] {
  const seen = new Set<string>();
  const stack = [path.resolve(entry)];
  while (stack.length) {
    const current = stack.pop() as string;
    if (seen.has(current)) continue;
    seen.add(current);
    const source = fs.readFileSync(current, 'utf8');
    for (const match of source.matchAll(/from\s+'(\.[^']*)'/g)) {
      const resolved = path.resolve(path.dirname(current), match[1]);
      const candidate = fs.existsSync(`${resolved}.ts`) ? `${resolved}.ts` : null;
      if (candidate) stack.push(candidate);
    }
  }
  return [...seen];
}

describe('fileRouterPlanning runs without Electron', () => {
  it('imports and plans with no electron mock in scope', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-planning-standalone-'));
    const file = path.join(dir, 'sample.txt');
    fs.writeFileSync(file, 'x', 'utf8');
    try {
      const plan = planForPath(file);
      expect(plan.name).toBe('sample.txt');
      expect(plan.isDirectory).toBe(false);
      expect(plan.candidates.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('has no electron import anywhere in its local closure', () => {
    const closure = localImportClosure(planningEntry);
    // Anti-vacuous: an empty or one-file closure would pass the assertion below
    // while measuring nothing, so pin the modules the split actually depends on.
    expect(closure.some((file) => file.endsWith('fileRouterPlanning.ts'))).toBe(true);
    expect(closure.some((file) => file.endsWith(path.join('shared', 'fileRouting.ts')))).toBe(true);
    expect(closure.some((file) => file.endsWith(path.join('shared', 'mediaKind.ts')))).toBe(true);

    const offenders = closure.filter((file) => /from\s+'electron'/.test(fs.readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

/**
 * The IPC half keeps the Electron import, and keeps re-exporting the planner so
 * every existing importer (`main.ts`, `preload.ts`, `window.d.ts`,
 * `DropRouter.tsx`) resolves through the same path it always did.
 */
describe('fileRouter still fronts the planner', () => {
  const routerSource = fs.readFileSync(path.join(mainDir, '..', 'fileRouter.ts'), 'utf8');

  it('imports electron and re-exports planForPath', () => {
    expect(routerSource).toMatch(/from\s+'electron'/);
    expect(routerSource).toMatch(/export\s+\{\s*planForPath\s*\}\s+from\s+'\.\/fileRouterPlanning'/);
    expect(routerSource).toMatch(/export\s+type\s+\{[^}]*DropPlan[^}]*\}\s+from\s+'\.\/fileRouterPlanning'/);
  });
});

afterAll(() => {
  // No shared fixture state; each case cleans its own temp directory.
});
