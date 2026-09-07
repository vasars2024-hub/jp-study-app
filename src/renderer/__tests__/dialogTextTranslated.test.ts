/**
 * Pre-sweep D107 — a confirmation dialog nobody can read is the worst place in the app
 * for an untranslated string.
 *
 * Twelve `confirmDialog` / `alertDialog` / `promptDialog` calls across three files passed
 * raw English literals as their `title`, `message` and `confirmLabel`, so they rendered
 * verbatim in Japanese, Chinese and Russian. Four of them were DESTRUCTIVE — Reset
 * desktop, Shut down Secret OS, Clear media library, Delete playlist — which is precisely
 * where the user has to understand what they are about to lose.
 *
 * Neither existing guard could see this class:
 *   - `tools/i18n-hardcoded-check.cjs` asks whether a file ADOPTS i18n at all, and
 *     DesktopShell.tsx and PlaylistEditor.tsx both call `t()` hundreds of times.
 *   - `tools/i18n-partial-check.cjs` scores `label:` / `hint:` /
 *     `description:` object properties, not `title:` / `message:` / `confirmLabel:`.
 *
 * So the rule is pinned here instead, repo-wide rather than as a list of the twelve: any
 * dialog field a user reads must be an expression, not a literal. Template literals count
 * as literals — `message: \`Delete playlist "${name}"?\`` was one of the real defects, and
 * a scan that only rejected single quotes would have passed it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', '..');
const BACKTICK = String.fromCharCode(96);

/** Fields of the three dialog helpers that are rendered to the user verbatim. */
const USER_READ_FIELDS = ['title', 'message', 'confirmLabel', 'cancelLabel', 'okLabel'];

/**
 * `defaultValue` is deliberately NOT in that list. It seeds an editable input with a name
 * the user immediately replaces ("My playlist"), and the repo's i18n scope rule keeps
 * default seed values a user can rename out of the catalogs.
 */

type Hit = { file: string; line: number; field: string; text: string };

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name === '__devharness__') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const DIALOG_CALL = /\b(confirmDialog|alertDialog|promptDialog)\(\{/g;

/**
 * Collect every user-read field of every dialog call, with whether it is a literal.
 * The scan reads the call's own brace-balanced argument object rather than a fixed
 * number of following lines, so a long `message` cannot push `confirmLabel` out of view.
 */
function scanFile(file: string): { total: number; literals: Hit[] } {
  const src = readFileSync(file, 'utf8');
  const rel = file.slice(SRC.length + 1).replace(/\\/g, '/');
  const literals: Hit[] = [];
  let total = 0;

  DIALOG_CALL.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DIALOG_CALL.exec(src))) {
    // Walk from the opening brace to its match so nested objects stay inside.
    let depth = 0;
    let i = m.index + m[0].length - 1;
    const start = i;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    const body = src.slice(start, i + 1);
    const lineOf = (off: number) => src.slice(0, start + off).split('\n').length;

    for (const field of USER_READ_FIELDS) {
      const fieldRe = new RegExp('(^|[{,\\s])' + field + ':\\s*', 'g');
      let f: RegExpExecArray | null;
      while ((f = fieldRe.exec(body))) {
        const valueAt = f.index + f[0].length;
        // A value may sit on the next line; skip whitespace to the first real char.
        let v = valueAt;
        while (v < body.length && /\s/.test(body[v])) v++;
        const ch = body[v];
        total++;
        if (ch === "'" || ch === '"' || ch === BACKTICK) {
          literals.push({
            file: rel,
            line: lineOf(v),
            field,
            text: body.slice(v, v + 60).split('\n')[0],
          });
        }
      }
    }
  }
  return { total, literals };
}

const FILES = walk(SRC);
const RESULTS = FILES.map(scanFile);
const ALL_LITERALS = RESULTS.flatMap((r) => r.literals);
const TOTAL_FIELDS = RESULTS.reduce((n, r) => n + r.total, 0);

describe('dialog text — every string a confirm shows is translated', () => {
  it('finds enough dialog fields for the scan to mean anything', () => {
    // Non-vacuity: 39 dialog call sites existed when this was written. If a refactor
    // renames the helpers this floor fails loudly instead of passing over nothing.
    expect(TOTAL_FIELDS).toBeGreaterThanOrEqual(40);
  });

  it('no dialog title, message or button label is a raw literal', () => {
    const shown = ALL_LITERALS.map((h) => `${h.file}:${h.line} ${h.field}: ${h.text}`);
    expect(shown).toEqual([]);
  });

  it('the three repaired files still raise dialogs at all', () => {
    // Guards against the other way this test could go vacuous: someone deleting the
    // dialogs rather than translating them.
    for (const rel of [
      'renderer/components/DesktopShell.tsx',
      'renderer/components/MediaLibraryActions.tsx',
      'renderer/components/PlaylistEditor.tsx',
    ]) {
      const r = RESULTS[FILES.findIndex((f) => f.slice(SRC.length + 1).replace(/\\/g, '/') === rel)];
      expect(r, rel).toBeDefined();
      expect(r.total, rel).toBeGreaterThan(0);
    }
  });

  it('control: the pre-fix source of each repaired file is caught', () => {
    // The scanner is only worth its green if it goes red on what was really there.
    const preFix = [
      "confirmDialog({ title: 'Clear media library', message: 'x', confirmLabel: 'Clear' })",
      'confirmDialog({ title: t(1), message: ' + BACKTICK + 'Delete playlist ${n}?' + BACKTICK + ' })',
      "alertDialog({\n  title: 'Wallpaper',\n  message: t(1),\n})",
    ];
    for (const src of preFix) {
      DIALOG_CALL.lastIndex = 0;
      expect(DIALOG_CALL.test(src), src).toBe(true);
      const found = USER_READ_FIELDS.filter((field) =>
        new RegExp('(^|[{,\\s])' + field + ':\\s*([' + "'" + '"' + BACKTICK + '])').test(src),
      );
      expect(found.length, src).toBeGreaterThan(0);
    }
  });

  it('control: a translated call is NOT flagged', () => {
    // ...and the mirror, so the rule cannot pass by flagging everything.
    const ok = "confirmDialog({ title: t('a'), message: t('b', { n }), confirmLabel: t('c') })";
    const re = new RegExp('(title|message|confirmLabel):\\s*([' + "'" + '"' + BACKTICK + '])');
    expect(re.test(ok)).toBe(false);
  });
});
