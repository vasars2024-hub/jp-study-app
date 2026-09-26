// @vitest-environment node
/**
 * The public tree ships no third-party character art and names none of the
 * fan-made companion packs that used to be bundled. Those packs now live only
 * in the owner's git-ignored `private-assets/`.
 *
 * The names are stored encoded so this file does not trip its own scan.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = path.resolve(__dirname, '../../..');

/** base64 of each retired pack / character name; decoded into word patterns. */
const ENCODED = ['cmVtaWxpYQ==', 'ZmF0ZWJ1cm4=', 'dGFtYW1v', 'a29ub2hh', 'Ym9uemk=', 'bWFrYQ==', 'ZW5l', 'bWlrbw=='];
const NAMES = ENCODED.map(decode);
/** base64 of the retired image files and the old sprite folder, which no source may point at. */
const RETIRED_PATHS = [
  'd2lyZWQtbGFpbi1yZWZlcmVuY2U=',
  'c2VjcmV0LW9zLWRlZmF1bHQtd2FsbHBhcGVy',
  'c2VjcmV0LWFlcm8tbmV0d29yay13YWxscGFwZXI=',
  'bHVmZnktMDE=',
  'YXNzZXRzL3NoaW1lamkv',
].map(decode);
// Short names only as whole words (identifier boundaries), long ones anywhere.
const PATTERNS = [
  ...NAMES.map((n) => (n.length <= 4 ? new RegExp(`(^|[^a-z0-9])${n}([^a-z0-9]|$)`, 'i') : new RegExp(n, 'i'))),
  // The owner's git-ignored private-assets/shimeji/ is the new home and may be named.
  ...RETIRED_PATHS.map((p) => new RegExp(`(?<!private-)${p.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`, 'i')),
];
/** One pass over a whole file first; lines are only split when it matches. */
const ANY = new RegExp(PATTERNS.map((re) => re.source).join('|'), 'im');

function decode(b64: string): string {
  return Buffer.from(b64, 'base64').toString('utf8');
}

const TEXT = /\.(ts|tsx|js|cjs|mjs|json|css|md|html|txt|xml|svg|ya?ml)$/i;

function trackedAndNew(dir: string): string[] {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', dir], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return out.split('\0').filter(Boolean);
}

describe('no third-party companion art in the public tree', () => {
  const files = trackedAndNew('src');

  it('no source, data or i18n file under src/ names a retired character or points at a retired file', () => {
    const hits: string[] = [];
    for (const rel of files) {
      if (!TEXT.test(rel)) continue;
      let text: string;
      try {
        text = fs.readFileSync(path.join(REPO, rel), 'utf8');
      } catch {
        continue; // deleted in the working tree
      }
      if (!ANY.test(text)) continue;
      text.split(/\r?\n/).forEach((line, i) => {
        if (PATTERNS.some((re) => re.test(line))) hits.push(`${rel}:${i + 1}`);
      });
    }
    expect(hits).toEqual([]);
  }, 180_000);

  it('the old sprite folders and reference images are not tracked', () => {
    const all = trackedAndNew('.');
    expect(all.filter((f) => f.startsWith(`src/renderer/${RETIRED_PATHS[4]}`))).toEqual([]);
    const retired = RETIRED_PATHS.slice(0, 4);
    expect(all.filter((f) => !f.startsWith('vendor/') && retired.some((r) => f.split('/').pop()?.startsWith(`${r}.`)))).toEqual([]);
    expect(all.filter((f) => f.startsWith('private-assets/'))).toEqual([]);
  });
});
