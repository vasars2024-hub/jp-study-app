// @vitest-environment node
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { resolveAppAsset } from '../appProtocolResolve';

/**
 * The `app://` handler used to call `net.fetch` on a path it had already
 * established did not exist. Electron rejects that with a bare
 * `net::ERR_FILE_NOT_FOUND` whose stack names neither the URL nor the path.
 *
 * Measured on a real production boot (`.vite/build/main.js`, isolated
 * userData, 2026-09-01): **twelve** identical anonymous stacks, and the only
 * way to identify them was to notice that `public/kuromoji/dict` holds exactly
 * twelve files. `public/kuromoji/` is gitignored (`.gitignore:106`), so a
 * production build from a clean branch checkout genuinely lacks them — the
 * condition is real, not a harness artifact, and it must be legible.
 *
 * These cases pin the decision table. The mutation controls each name the
 * regression they would reintroduce.
 */
const roots = {
  rendererRoot: path.resolve('/app/.vite/renderer/main_window'),
  publicRoot: path.resolve('/app/public'),
};

/** Only these two exist. Everything else is absent by construction. */
const PRESENT = new Set([
  path.join(roots.rendererRoot, '/index.html'),
  path.join(roots.publicRoot, 'kuromoji/dict/base.dat.bin'),
]);
const exists = (candidate: string): boolean => PRESENT.has(candidate);

describe('resolveAppAsset', () => {
  it('serves a renderer-bundle file', () => {
    expect(resolveAppAsset(roots, '/index.html', exists)).toEqual({
      kind: 'file',
      path: path.join(roots.rendererRoot, '/index.html'),
    });
  });

  it('treats a bare root as index.html', () => {
    // The renderer navigates to `app://bundle/` with no path; if this fell
    // through to `missing` the app would not boot at all.
    expect(resolveAppAsset(roots, '/', exists)).toEqual({
      kind: 'file',
      path: path.join(roots.rendererRoot, '/index.html'),
    });
    expect(resolveAppAsset(roots, '', exists)).toEqual({
      kind: 'file',
      path: path.join(roots.rendererRoot, '/index.html'),
    });
  });

  it('falls back to public/ when the renderer bundle has no such file', () => {
    expect(resolveAppAsset(roots, '/kuromoji/dict/base.dat.bin', exists)).toEqual({
      kind: 'file',
      path: path.join(roots.publicRoot, 'kuromoji/dict/base.dat.bin'),
    });
  });

  it('reports a missing bundled asset by name instead of resolving it', () => {
    // This is the case that produced twelve anonymous stacks. The `rel` is
    // what makes the log actionable, so assert on it and not merely on `kind`.
    const missing = resolveAppAsset(roots, '/kuromoji/dict/unk_pos.dat.bin', exists);
    expect(missing).toEqual({ kind: 'missing', rel: '/kuromoji/dict/unk_pos.dat.bin' });
    // MUTATION CONTROL: returning `{kind:'file'}` for an absent path — the old
    // behaviour — fails here, because a `file` decision carries no `rel`.
    expect(missing).not.toHaveProperty('path');
  });

  it('refuses traversal out of both roots, and does not label it missing', () => {
    // `missing` names the path in the log; `forbidden` must not, or a probe
    // could map the filesystem off-root by reading which 404s got logged.
    for (const attempt of ['/../../secrets.txt', '/../.git/config', '/../../../Windows/win.ini']) {
      expect(resolveAppAsset(roots, attempt, exists).kind).toBe('forbidden');
    }
  });

  it('refuses traversal even when the escaped target exists', () => {
    const escaped = path.resolve(roots.rendererRoot, '../../../secrets.txt');
    const permissive = (candidate: string): boolean => PRESENT.has(candidate) || candidate === escaped;
    // MUTATION CONTROL: dropping the containment check inside the `exists`
    // branch turns this into `{kind:'file'}` and leaks the file.
    expect(resolveAppAsset(roots, '/../../../secrets.txt', permissive).kind).toBe('forbidden');
  });

  it('never lets public/ shadow the renderer bundle', () => {
    // Both roots hold `/index.html`; the app's own output must win, or a
    // bundled data directory could replace the shell.
    const both = (candidate: string): boolean =>
      candidate === path.join(roots.rendererRoot, '/index.html')
      || candidate === path.join(roots.publicRoot, 'index.html');
    expect(resolveAppAsset(roots, '/index.html', both)).toEqual({
      kind: 'file',
      path: path.join(roots.rendererRoot, '/index.html'),
    });
  });
});
