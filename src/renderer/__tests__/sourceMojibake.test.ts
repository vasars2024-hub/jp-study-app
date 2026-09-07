/**
 * No source file may contain a UTF-8-decoded-as-CP1252 artefact.
 *
 * Found live on 2026-09-07: eight characters the user actually reads had been through a
 * round of UTF-8 bytes decoded as CP1252 and re-encoded, and the corruption was committed.
 * `SettingsView`'s dictionary-priority buttons each drew three Latin letters and accents
 * instead of an arrow; the zoom-out button drew three instead of a minus sign; three widget
 * close buttons in `widgets/more.tsx` drew two instead of a multiplication sign, and the
 * World Clock's "time unavailable" fallback drew three instead of an em dash. The corrupt
 * text is deliberately not quoted here — see the last paragraph. Nothing caught it: the
 * files parse, the types check,
 * the tests pass, and `i18n-check` only compares catalog keys, so a literal glyph inside
 * JSX is outside every existing gate.
 *
 * The signature is what makes this checkable at all. When UTF-8 is misread as CP1252 the
 * lead byte of every multi-byte sequence surfaces as U+00C2, U+00C3 or U+00E2 — an A or an
 * a under a circumflex or a tilde.
 * None of those three is plausible in this repository's source: the product's languages are
 * English, Japanese, Chinese and Russian, and the two French/Portuguese words that could
 * legitimately carry them are not in the tree.
 *
 * The three characters are built from their code points rather than written out, so this
 * file is not its own counter-example and is scanned along with everything else. A raw-text
 * ban that must exempt itself is the shape that has published a false "closed" here before.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../..');
const REPO = resolve(SRC, '..');
const SCANNED = /\.(ts|tsx|css|html)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.vite']);

/** U+00C2, U+00C3, U+00E2 — never written literally, so this file scans clean under its own rule. */
const LEAD = new Set([0x00c2, 0x00c3, 0x00e2]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) sourceFiles(join(dir, entry.name), out);
    } else if (SCANNED.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

function mojibakeLines(file: string): string[] {
  const hits: string[] = [];
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      for (const char of line) {
        if (LEAD.has(char.codePointAt(0) ?? 0)) {
          hits.push(`${relative(REPO, file).split(sep).join('/')}:${index + 1}  ${line.trim().slice(0, 120)}`);
          return;
        }
      }
    });
  return hits;
}

describe('source carries no mis-decoded UTF-8', () => {
  const files = sourceFiles(SRC);

  it('scans a real population, so the rule below is not vacuous', () => {
    expect(files.length).toBeGreaterThan(1000);
    expect(files.some((f) => f.endsWith(`widgets${sep}more.tsx`))).toBe(true);
    expect(files.some((f) => f.endsWith(`views${sep}SettingsView.tsx`))).toBe(true);
    // This file must be inside its own population — see the header.
    expect(files.some((f) => f.endsWith(`__tests__${sep}sourceMojibake.test.ts`))).toBe(true);
  });

  it('finds no CP1252 lead artefact anywhere under src/', () => {
    expect(files.flatMap(mojibakeLines)).toEqual([]);
  });
});
