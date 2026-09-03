import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOGS, en } from '../i18n/catalogs/all';
import { translate, type UiLang } from '../i18n/core';

/**
 * A `toFixed()` string handed to `t()` opts that number out of i18n entirely.
 *
 * `interpolate` (shared/i18n/core.ts:62) branches on `typeof value === 'number'`:
 * a number goes through `Intl.NumberFormat(LANG_TAGS[lang])`, and anything else
 * is substituted verbatim. `toFixed` returns a STRING, so the value skips Intl
 * and keeps the ASCII decimal point — a Russian reader gets "3.2" in a sentence
 * where every neighbouring number on the same panel says "3,2".
 *
 * **No existing gate can see this class**, and that is why it went unnoticed on
 * nine live call sites. `i18n-check.cjs` compares the four catalogs against each
 * other and a number is not a catalog key; `i18n-hardcoded-check.cjs` asks only
 * whether a file adopted `useT()` at all, and every one of the nine had; and
 * `i18n-locale-arg-check.cjs` covers the neighbouring `toLocale*String()` class,
 * which is the opposite mistake — calling Intl with no locale rather than not
 * reaching Intl at all.
 *
 * The fix is to round as a NUMBER (`Math.round(x * 100) / 100`) and let `t()`
 * format it, which is what `FilesApp.tsx` already did for its watch-arrival
 * seconds with a comment saying exactly this. Rounding also drops trailing
 * zeros natively, so two call sites lost a hand-rolled `.replace(/0+$/, '')`.
 *
 * RATCHET, and it bites in both directions. Measured 2026-09-03: 9 offending
 * call sites, 7 repaired here. The remaining 2 are in `VideoCoreStudyOverlay.tsx`,
 * left alone only because another worker held that file open for the S5
 * virtualisation fix at the time. `KNOWN_OFFENDERS` must SHRINK: a file with no
 * remaining hits fails this test until its entry is deleted, so the debt cannot
 * be paid and then silently re-accrued behind a stale allowance.
 */

const ROOT = path.join(__dirname, '..', '..');

/** Files still allowed to hand `t()` a `toFixed` string, with the count owed. */
const KNOWN_OFFENDERS: Record<string, number> = {
  'media/VideoCoreStudyOverlay.tsx': 2,
};

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!/^(node_modules|__tests__)$/.test(entry.name)) sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Every `t(...)` call span in `source` whose arguments build a value with
 * `.toFixed(`. Paren-matched rather than line-matched, because these calls are
 * routinely spread over five or six lines and a line regex sees only the head.
 *
 * The leading dot is load-bearing. Prose ABOUT this defect necessarily writes
 * the word `toFixed`, and several of the repaired call sites carry exactly such
 * a comment inside the `t(` span they explain; requiring `.toFixed(` keeps the
 * check reading code rather than the commentary about it.
 */
export function offendingCalls(source: string): number {
  let count = 0;
  const opener = /\bt\(/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(source))) {
    let depth = 0;
    let end = -1;
    for (let i = match.index + match[0].length - 1; i < source.length; i += 1) {
      const ch = source[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) continue;
    if (source.slice(match.index, end + 1).includes('.toFixed(')) count += 1;
  }
  return count;
}

describe('numbers reach Intl (shared/i18n/core.ts:62)', () => {
  it('never hands a t() slot a toFixed string, outside the ledgered files', () => {
    const unexpected: string[] = [];
    const paid: string[] = [];

    for (const file of sourceFiles(ROOT)) {
      const rel = path.relative(ROOT, file).split(path.sep).join('/');
      const found = offendingCalls(fs.readFileSync(file, 'utf8'));
      const allowed = KNOWN_OFFENDERS[rel] ?? 0;
      if (found > allowed) unexpected.push(`${rel}: ${found} call(s), ${allowed} allowed`);
      if (rel in KNOWN_OFFENDERS && found === 0) paid.push(rel);
    }

    expect(unexpected, 'new call sites bypassing Intl').toEqual([]);
    expect(paid, 'debt paid — delete these from KNOWN_OFFENDERS').toEqual([]);
  });

  it('renders the repaired values with the locale decimal separator', () => {
    // The receipt at the product's own API. Russian groups with a comma; the
    // pre-fix string form returned the ASCII point regardless of language.
    const t = (key: string, lang: UiLang, vars: Record<string, string | number>) =>
      translate(key, vars, { lang, catalog: CATALOGS[lang], fallback: en });

    expect(t('settings.motion.effective', 'ru', { velocity: 1.25 })).toContain('1,25');
    expect(t('settings.motion.effective', 'en', { velocity: 1.25 })).toContain('1.25');
    expect(t('settings.monitors.scaleLabel', 'ru', { scale: 1.5 })).toContain('1,5');
  });

  describe('negative control — the scanner can fail', () => {
    it('sees a toFixed inside a multi-line t() call', () => {
      expect(offendingCalls('t("k", {\n  rate: x.toFixed(2),\n})')).toBe(1);
    });

    it('ignores a toFixed that is not inside a t() call', () => {
      expect(offendingCalls('const label = x.toFixed(2);\nt("k", { rate })')).toBe(0);
    });

    it('ignores prose about toFixed inside the call it explains', () => {
      expect(offendingCalls('t("k", {\n  // a number, not toFixed(2)\n  rate,\n})')).toBe(0);
    });
  });
});
