// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * D260 — the Files app's context entry points, against their own callers.
 *
 * `filesAppScope.ts` declares ten helpers under a heading calling them "the
 * callers' vocabulary", each with a doc comment naming the surface meant to call
 * it. Five of them had NO caller of any kind — not a product one, not a test one
 * — so "Show in Files" existed only in the reader while the code for five other
 * surfaces sat written and unreachable. Nothing caught it: the helpers compile,
 * they are exported, and `openFilesAppScoped` beneath them is well tested.
 *
 * This is a ratchet over that split, not a demand that all ten be wired. Four are
 * deliberately still unwired and D260 says why for each; the point is that the
 * set cannot change silently in either direction — a sixth helper losing its
 * caller fails here, and wiring one of the four fails here too, which is the
 * prompt to close that half of D260 rather than leave the register stale.
 */

const SRC = resolve(__dirname, '..', '..');
const SCOPE = resolve(SRC, 'renderer', 'components', 'filesapp', 'filesAppScope.ts');

/**
 * Comments are stripped before searching. Without this the gate is satisfied by
 * prose: `MediaDetailPanel.tsx` carries a comment that names
 * `openFilesAppForMedia` while explaining the fix, and a raw text search cannot
 * tell that apart from the call two lines below it. The `reads the CALL and not
 * the comment` case below proves the stripping is doing real work.
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/**
 * Import statements are stripped too, and that is not tidiness — it is the
 * difference between a gate and a decoration. Removing the CALL while leaving
 * `import { openFilesAppForMedia }` in place left this suite green on the first
 * mutation run: the import alone read as a caller. An import is a declaration
 * that a file *may* use a helper; only a call site is evidence that it does.
 */
function stripImports(text: string): string {
  return text
    .replace(/^\s*import\s+type\s[\s\S]*?from\s*['"][^'"]+['"];?/gm, ' ')
    .replace(/^\s*import\s[\s\S]*?from\s*['"][^'"]+['"];?/gm, ' ');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === '__tests__' || ent.name === '__devharness__' || ent.name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(ent.name) && !/\.test\.tsx?$/.test(ent.name)) {
      out.push(full);
    }
  }
  return out;
}

const RENDERER_FILES = [
  ...walk(resolve(SRC, 'renderer')),
  ...walk(resolve(SRC, 'media')),
].filter((f) => f !== SCOPE);

const STRIPPED = new Map(
  RENDERER_FILES.map((f) => [f, stripImports(stripComments(readFileSync(f, 'utf8')))]),
);

/** Every `openFilesAppFor*` the module actually exports, read from the module. */
function declaredHelpers(): string[] {
  const source = readFileSync(SCOPE, 'utf8');
  return [...source.matchAll(/export function (openFilesAppFor\w+)\(/g)].map((m) => m[1]).sort();
}

function callersOf(name: string): string[] {
  const re = new RegExp(`\\b${name}\\b`);
  return [...STRIPPED.entries()]
    .filter(([, text]) => re.test(text))
    .map(([file]) => file.slice(SRC.length + 1).split(sep).join('/'))
    .sort();
}

/** Wired on purpose, with the surface each reaches from. */
const WIRED = [
  'openFilesAppForBook',
  'openFilesAppForManga',
  'openFilesAppForMedia',
  'openFilesAppForMemory',
  'openFilesAppForSystemCard',
];

/**
 * Audit r2 #7 closed D260: the four helpers nobody called
 * (`openFilesAppForDecks`, `…ForDictionaries`, `…ForStatistics`,
 * `…ForTranscript`) were deleted rather than kept as dead vocabulary — the
 * assistant now reaches every category through the navigation index, and the
 * Files rail reaches them in one click. The list stays, empty, so a new
 * unwired helper has to be declared here to pass.
 */
const UNWIRED: string[] = [];

describe('Files app context entry — the callers vocabulary', () => {
  it('scans a real renderer tree, so an empty scan cannot pass vacuously', () => {
    expect(RENDERER_FILES.length).toBeGreaterThan(500);
    expect(declaredHelpers().length).toBe(WIRED.length + UNWIRED.length);
  });

  it('accounts for every declared helper exactly once', () => {
    expect(declaredHelpers()).toEqual([...WIRED, ...UNWIRED].sort());
  });

  it('keeps every wired entry point wired', () => {
    for (const name of WIRED) {
      expect(callersOf(name), `${name} lost its caller`).not.toHaveLength(0);
    }
  });

  it('records the unwired entry points, so wiring one is a prompt to close D260', () => {
    for (const name of UNWIRED) {
      expect(callersOf(name), `${name} gained a caller — update D260 and this list`).toHaveLength(0);
    }
  });

  it('reaches the media library from `openFilesAppForMedia`', () => {
    expect(callersOf('openFilesAppForMedia')).toContain(
      'renderer/components/media/library/MediaDetailPanel.tsx',
    );
  });

  it('reads the CALL and not the comment beside it', () => {
    const raw = readFileSync(
      resolve(SRC, 'renderer/components/media/library/MediaDetailPanel.tsx'),
      'utf8',
    );
    // The comment names the helper too, so a gate that did not strip comments
    // would pass on prose alone. Both halves are asserted: the comment exists,
    // and the stripped source STILL carries the name — which can only be the call.
    const commentBlocks = raw.match(/\/\*[\s\S]*?\*\//g) ?? [];
    expect(commentBlocks.some((c) => c.includes('openFilesAppForMedia'))).toBe(true);
    expect(raw).toContain("import { openFilesAppForMedia }");
    expect(stripImports(stripComments(raw))).toContain('openFilesAppForMedia(entry.primary.id)');
  });
});
