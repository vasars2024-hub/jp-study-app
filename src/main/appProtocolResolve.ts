/**
 * The `app://` scheme's path decision, lifted out of `main.ts` so it can be
 * tested without importing a 1,600-line module that opens windows.
 *
 * Why it exists at all: the handler used to hand a path it had ALREADY
 * established did not exist straight to `net.fetch`, which rejects with a bare
 * `net::ERR_FILE_NOT_FOUND` whose stack names neither the request URL nor the
 * resolved path. Measured on a production boot 2026-09-01: twelve identical
 * anonymous stacks in `main.log`, every one of them a `/kuromoji/dict/*.dat.bin`
 * that a clean branch checkout cannot have — `public/kuromoji/` is gitignored
 * (`.gitignore:106`) along with `models/`, `ort/`, `cedict/` and `tesseract/`.
 * A missing bundled asset is a release-blocking condition, so it has to be
 * legible from the log rather than inferable only by counting stacks.
 *
 * The `exists` probe is injected rather than calling `fs` here so the decision
 * table is testable without a fixture tree on disk.
 */
import path from 'node:path';

export type AppAssetResolution =
  /** Serve this absolute path. */
  | { kind: 'file'; path: string }
  /** Escaped both roots — never read it, and never say why. */
  | { kind: 'forbidden' }
  /** Inside a root but absent. `rel` is the request path, for the log. */
  | { kind: 'missing'; rel: string };

export interface AppAssetRoots {
  /** Built renderer output — `.vite/renderer/<name>`. */
  rendererRoot: string;
  /** Bundled runtime blobs — `public/`, or `resources/public` when packaged. */
  publicRoot: string;
}

/**
 * Resolve one `app://` request pathname against the two roots.
 *
 * Order is renderer-first then public, because the renderer bundle is the
 * app's own output and `public/` is third-party data that must never be able
 * to shadow it.
 */
export function resolveAppAsset(
  roots: AppAssetRoots,
  pathname: string,
  exists: (candidate: string) => boolean,
): AppAssetResolution {
  const { rendererRoot, publicRoot } = roots;
  const rel = !pathname || pathname === '/' ? '/index.html' : pathname;

  const fromRenderer = path.join(rendererRoot, rel);
  if (exists(fromRenderer)) {
    // Still confirm containment: `rel` can carry `..` segments, and
    // `path.join` resolves them before we ever look at the result.
    return isUnder(rendererRoot, fromRenderer)
      ? { kind: 'file', path: fromRenderer }
      : { kind: 'forbidden' };
  }

  const fromPublic = path.join(publicRoot, rel.replace(/^\//, ''));
  if (exists(fromPublic)) {
    return isUnder(publicRoot, fromPublic)
      ? { kind: 'file', path: fromPublic }
      : { kind: 'forbidden' };
  }

  // Absent. A traversal attempt that lands outside both roots is reported as
  // forbidden rather than missing, so a probe cannot use the 404 body to map
  // which paths exist off-root.
  if (!isUnder(rendererRoot, fromRenderer) && !isUnder(publicRoot, fromPublic)) {
    return { kind: 'forbidden' };
  }
  return { kind: 'missing', rel };
}

function isUnder(root: string, target: string): boolean {
  const r = path.resolve(root);
  const t = path.resolve(target);
  return t === r || t.startsWith(r + path.sep);
}
