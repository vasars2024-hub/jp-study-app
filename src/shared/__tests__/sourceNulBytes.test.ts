// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * A raw U+0000 must never reach a source file.
 *
 * Four have shipped, from two separate commits, and none was caught by
 * anything: `lexiconWild.ts`, then `mediaLibraryEntries.ts`,
 * `seanimeSocketOwnership.ts` and `studyFilterRecipe.ts` together, then
 * `DictionaryResults.tsx`. Every one is the same accident — the author writes
 * the escape `\0` as a separator inside a template literal and the writing
 * tool emits the byte it denotes instead of the two characters that denote it.
 *
 * Runtime behaviour is identical, which is why it survives every test: a raw
 * U+0000 in a template literal is a legal source character producing exactly
 * the string `\0` would have produced. What it destroys is *searchability*.
 * git's binary heuristic reads only the first 8000 bytes, so a NUL past that
 * offset does not even show up as a binary diff — but grep and ripgrep read
 * the whole file, decide it is binary, and print "Binary file ... matches"
 * instead of the matching lines. `DictionaryResults.tsx` is 1,100 lines in
 * Blanc's boot path with 13 `window.api.*` call sites, and for as long as the
 * byte was there a repo-wide search for one of those calls silently returned
 * four hits instead of five. Sweeps, audits and agents in this repo run on
 * that search constantly.
 *
 * So the criterion is a test rather than an audit finding, and it fails the
 * suite the same day rather than the next time somebody counts bytes by hand.
 *
 * If you are here because this test is failing: write the two-character escape
 * `\0`, not the byte. Repair an existing one from PowerShell — `node -e` has
 * been observed to no-op on these files.
 */

const SRC = join(fileURLToPath(new URL('../../', import.meta.url)));

/** Text formats where a NUL is always an accident, never payload. */
const SCANNED = new Set(['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs', '.css']);

/**
 * Measurement scaffolding under `src/.coordination/` is skipped along with
 * every other dot-directory: those are probe scripts and their JSON output,
 * not shipped source, and the point of the gate is what the app ships.
 */
const skipDirectory = (name: string): boolean => name.startsWith('.') || name === 'node_modules';

function collect(directory: string, found: string[]): string[] {
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      if (!skipDirectory(entry)) collect(full, found);
      continue;
    }
    const dot = entry.lastIndexOf('.');
    if (dot > 0 && SCANNED.has(entry.slice(dot))) found.push(full);
  }
  return found;
}

describe('source files carry no raw NUL byte', () => {
  it('finds none anywhere under src/', () => {
    const files = collect(SRC, []);

    /*
     * Read as bytes and search for the byte. Spelling the character out in
     * this file would put the very thing being banned into the scanner, so
     * `indexOf(0)` on the buffer is the only honest way to write the check.
     */
    const offenders = files
      .map((file) => ({ file, at: readFileSync(file).indexOf(0) }))
      .filter((hit) => hit.at !== -1)
      .map((hit) => `${relative(SRC, hit.file).split(sep).join('/')} (byte ${hit.at})`);

    expect(offenders).toEqual([]);
  });

  it('scans a meaningful number of files, so a broken walk cannot pass empty', () => {
    // A walk that silently returns nothing would satisfy the assertion above.
    expect(collect(SRC, []).length).toBeGreaterThan(500);
  });
});
