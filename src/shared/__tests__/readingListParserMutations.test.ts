/**
 * P1's last done-when clause: "every parser rule has a **mutation test** that
 * proves the test fails when the rule is broken."
 *
 * The three controls landed on 2026-09-03 were per-DEFECT — they proved a
 * specific past bug stays fixed. This is per-RULE, and it is a real mutation
 * harness rather than a differential one: each row breaks the rule **in the
 * parser's own source**, loads the broken parser, and asserts the property the
 * real parser satisfies is now violated.
 *
 * Three things make that cheap enough to do for every rule at once:
 *
 *   · `readingListParser.ts` has exactly ONE import and it is `import type`, so
 *     the transpiled module has no runtime dependencies and can be evaluated
 *     in memory. No temp file is ever written into `src/`, which matters here:
 *     several suites in this repo scan the tree, and a mutant on disk during a
 *     full run fabricates failures in files nobody touched.
 *   · Every row asserts its own anchor is PRESENT before mutating. A control
 *     that silently fails to apply reads exactly like a passing test, and this
 *     repo has shipped one.
 *   · Every row asserts the property holds on the REAL parser first. Otherwise
 *     a row could "pass" by asserting something that was never true.
 *
 * Adding a parser rule means adding a row here. If the parser ever grows a
 * runtime import, `loadMutant` fails loudly rather than silently skipping.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { parseReadingList, type ParsedReadingList } from '../readingListParser';

const PARSER_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../readingListParser.ts',
);
const SOURCE = fs.readFileSync(PARSER_PATH, 'utf8');

type Parse = (rawText: string) => ParsedReadingList;

function loadMutant(source: string): Parse {
  const { code } = transformSync(source, {
    loader: 'ts',
    format: 'cjs',
    target: 'es2022',
  });
  const module = { exports: {} as Record<string, unknown> };
  const require = (id: string) => {
    throw new Error(
      `readingListParser.ts now has a runtime import (${id}); this harness assumes it has none.`,
    );
  };
  new Function('module', 'exports', 'require', code)(module, module.exports, require);
  const parse = module.exports.parseReadingList;
  if (typeof parse !== 'function') throw new Error('mutant exports no parseReadingList');
  return parse as Parse;
}

const WORKED_EXAMPLE = [
  'yo these are the ones i said',
  '',
  '1. Kino no Tabi',
  '2. 君の膵臓をたべたい',
  '3. Convenience Store Woman (コンビニ人間) — Murakami? no, Sayaka Murata',
  '- ハリー・ポッター 1〜3巻',
  'also 「夜は短し歩けよ乙女」 if u can find it lol',
  'https://example.com/list/1234',
].join('\n');

function titles(parsed: ParsedReadingList): string[] {
  return parsed.entries.map((entry) => entry.title);
}

/** One line, five equal-length clauses over 90 characters, three of them quoted. */
const OVERLONG_PROSE = [
  `「こころ」${'あ'.repeat(90)}`,
  `「雪国」${'あ'.repeat(91)}`,
  `「痴人」${'あ'.repeat(91)}`,
  'あ'.repeat(95),
  'あ'.repeat(95),
].join('、');

interface RuleMutation {
  /** The plan section the rule comes from, then the rule in a few words. */
  rule: string;
  /** Exact source text. Asserted present, so a stale anchor fails loudly. */
  find: string;
  replace: string;
  input: string;
  /** True on the real parser, false (or throwing) on the mutant. */
  holds: (parsed: ParsedReadingList) => boolean;
}

const RULES: RuleMutation[] = [
  {
    rule: '§2.2 numbered lines are a segmentation strategy',
    find: 'const NUMBERED_LINE = /^\\s*(?:\\(?\\d{1,3}[.)、]|\\d{1,3}\\s+-\\s|[①-⑳]|[一二三四五六七八九十]{1,3}、)/u;',
    replace: 'const NUMBERED_LINE = /^(?!)/u;',
    input: WORKED_EXAMPLE,
    holds: (parsed) => parsed.segmentation === 'numbered' && titles(parsed).includes('Kino no Tabi'),
  },
  {
    rule: '§2.2 bulleted lines are a segmentation strategy',
    find: 'const BULLETED_LINE = /^\\s*(?:[•・→＞]\\s*|[-*]\\s+|>>?\\s+)\\S/;',
    replace: 'const BULLETED_LINE = /^(?!)/u;',
    input: '- こころ\n- 雪国\n- 鼻',
    holds: (parsed) => parsed.segmentation === 'bulleted' && parsed.entries.length === 3,
  },
  {
    rule: '§2.2 line-per-title only when nothing else matched',
    find: 'if (indexed.length >= 3 && !numbered.length && !bulleted.length) {',
    replace: 'if (indexed.length >= 3) {',
    input: WORKED_EXAMPLE,
    holds: (parsed) => parsed.segmentation === 'numbered',
  },
  {
    rule: '§2.2 inline-separated splits one line of titles',
    find: 'if (pieces.length >= 3 && pieces.length > indexed.length) {',
    replace: 'if (false && pieces.length >= 3 && pieces.length > indexed.length) {',
    // Every piece is ≥2 characters on purpose: the split drops a one-character
    // piece, so a run ending in 「鼻」 yields two pieces and never reaches the
    // threshold. That is the strategy's own floor, not the rule under test.
    input: 'こころ、雪国、痴人の愛',
    holds: (parsed) => parsed.segmentation === 'inline-separated' && parsed.entries.length === 3,
  },
  {
    rule: '§2.2 URLs come out BEFORE the inline split (`/` is a separator)',
    find: "const joined = indexed.map((line) => line.text.replace(URL_PATTERN, ' ')).join(' ');",
    replace: "const joined = indexed.map((line) => line.text).join(' ');",
    // The recorded defect verbatim: a message whose only content is a link.
    // A numbered list would recover on its own, so it cannot show this rule.
    input: 'check this https://example.com/list/1234',
    holds: (parsed) => parsed.entries.length === 0,
  },
  {
    rule: '§2.2 quoted spans are the prose fallback',
    find: "if (quoted.length) out.push({ strategy: 'quoted-prose', lines: quoted });",
    replace: "if (false) out.push({ strategy: 'quoted-prose', lines: quoted });",
    input: 'also 「夜は短し歩けよ乙女」 if u can find it lol',
    holds: (parsed) => titles(parsed).includes('夜は短し歩けよ乙女'),
  },
  {
    rule: '§2.2 a list of one loses to a list of five',
    find: 'return lengths.length < 2 ? score * 0.25 : score;',
    replace: 'return score;',
    // The COUNT survives the mutation — the "other marked lines still get a
    // pass" fallback below recovers the numbered books even when `bulleted`
    // wins the score. What does not survive is the reported SHAPE, and the
    // shape is what §2.4's re-parse diff and the preview's provenance read.
    input: WORKED_EXAMPLE,
    holds: (parsed) => parsed.segmentation === 'numbered',
  },
  {
    rule: '§2.2 a 400-character "title" is penalised',
    find: 'const overlong = lengths.filter((n) => n > 90).length / lengths.length;',
    replace: 'const overlong = 0;',
    // Five 95-character clauses beat three short quoted titles on count and
    // uniformity alone; only the length penalty makes the quoted reading win.
    // The competitor has to exist, or the row proves nothing — an input with no
    // separators offers `quoted-prose` no rival and passes either way.
    input: OVERLONG_PROSE,
    holds: (parsed) => parsed.segmentation === 'quoted-prose' && parsed.entries.length === 3,
  },
  {
    rule: '§2.3.1 a URL is stripped from a title and kept on the entry',
    find: "if (urls.length) text = normalizeLine(text.replace(URL_PATTERN, ' '));",
    replace: 'if (urls.length) text = normalizeLine(text);',
    input: '1. こころ https://x.example/a\n2. 雪国\n3. 鼻',
    holds: (parsed) => parsed.entries[0]?.title === 'こころ' && !!parsed.entries[0]?.url,
  },
  {
    rule: '§2.3.2 trailing chatter is stripped',
    find: 'if (lowered.endsWith(phrase)) {',
    replace: 'if (false && lowered.endsWith(phrase)) {',
    input: '1. こころ lol\n2. 雪国\n3. 鼻',
    holds: (parsed) => parsed.entries[0]?.title === 'こころ',
  },
  {
    rule: '§2.3.2 an emoji run is chatter',
    find: '[!?！？~〜.,、。\\s\\p{Extended_Pictographic}]',
    replace: '[!?！？~〜.,、。\\s]',
    input: '1. 呪術廻戦 😭\n2. 雪国\n3. 鼻',
    holds: (parsed) => parsed.entries[0]?.title === '呪術廻戦',
  },
  {
    rule: '§2.3.3 a quoted span wins outright',
    find: 'if (quoted) text = normalizeLine(quoted[1]);',
    replace: 'if (false) text = normalizeLine(quoted[1]);',
    input: '1. 前に読んだ「こころ」だよ\n2. 雪国\n3. 鼻',
    holds: (parsed) => parsed.entries[0]?.title === 'こころ',
  },
  {
    rule: '§2.3.4 `by X` splits an author off the end',
    find: '/\\s+by\\s+([^,;]{2,40})$/iu,',
    replace: '/^(?!)/u,',
    input: '1. Kokoro by Natsume Soseki\n2. Snow Country\n3. The Nose',
    holds: (parsed) =>
      parsed.entries[0]?.title === 'Kokoro' && parsed.entries[0]?.author === 'Natsume Soseki',
  },
  {
    rule: '§2.3.4 the `著者著 タイトル` prefix form',
    find: 'const prefixed = AUTHOR_PREFIX.exec(line);',
    replace: "const prefixed = AUTHOR_PREFIX.exec('');",
    input: '1. 夏目漱石著 こころ\n2. 雪国\n3. 鼻',
    holds: (parsed) =>
      parsed.entries[0]?.title === 'こころ' && parsed.entries[0]?.author === '夏目漱石',
  },
  {
    rule: '§2.3.4 a retracted author is read as a correction and flagged',
    find: '/\\s*[-–—:]\\s*([^?？]{2,40})[?？]\\s*(?:no|nope|違う|いや)\\s*,?\\s*([^,;]{2,40})$/iu',
    replace: '/^(?!)/u',
    input: WORKED_EXAMPLE,
    holds: (parsed) => {
      const entry = parsed.entries.find((row) => row.author === 'Sayaka Murata');
      return entry?.needsTriage === 'author-ambiguous';
    },
  },
  {
    rule: '§2.3.5 a volume range is one work, not three entries',
    find: 'for (const pattern of patterns) {',
    replace: 'for (const pattern of patterns.slice(0, 0)) {',
    input: WORKED_EXAMPLE,
    holds: (parsed) => {
      const entry = parsed.entries.find((row) => row.title === 'ハリー・ポッター');
      return entry?.volume?.from === 1 && entry.volume.to === 3;
    },
  },
  {
    rule: '§2.3.5 a bare range only counts at the very end of a line',
    find: '/\\s+(\\d{1,4})\\s*[-–—~〜]\\s*(\\d{1,4})\\s*$/u,',
    replace: '/(\\d{1,4})\\s*[-–—~〜]\\s*(\\d{1,4})/u,',
    input: '1. Q&A 1-3 の話\n2. 雪国\n3. 鼻',
    holds: (parsed) => parsed.entries[0]?.title === 'Q&A 1-3 の話' && !parsed.entries[0]?.volume,
  },
  {
    rule: '§2.3.6 `English (日本語)` is ONE work with both titles',
    find: 'const match = /^(.+?)\\s*[（(]\\s*([^）)]{2,60})\\s*[）)]\\s*$/u.exec(line);',
    replace: 'const match: RegExpExecArray | null = null;',
    input: WORKED_EXAMPLE,
    holds: (parsed) => {
      const entry = parsed.entries.find((row) => row.title === 'コンビニ人間');
      return entry?.titleEn === 'Convenience Store Woman';
    },
  },
  {
    rule: '§2.3.6 a same-script parenthetical is a note, not a title',
    find: 'if (outsideJa === insideJa) return outsideJa ? { title: line, titleJa: line } : { title: line };',
    replace:
      'if (false) return outsideJa ? { title: line, titleJa: line } : { title: line };',
    input: '1. Kino no Tabi (the anime one)\n2. Snow Country\n3. The Nose',
    holds: (parsed) => parsed.entries[0]?.title === 'Kino no Tabi (the anime one)',
  },
  {
    rule: '§2.3.7 NFKC folds full-width digits before the marker rules run',
    find: "return raw.normalize('NFKC').replace(/\\s+/gu, ' ').trim();",
    replace: "return raw.replace(/\\s+/gu, ' ').trim();",
    input: '１．こころ\n２．雪国\n３．鼻',
    holds: (parsed) => parsed.entries.length === 3 && parsed.entries[0]?.title === 'こころ',
  },
  {
    rule: '§2.3.7 the circled numeral is stripped BEFORE NFKC folds it to a digit',
    find: 'let text = normalizeLine(source.replace(CIRCLED_MARKER, ${EMPTY}));',
    replace: 'let text = normalizeLine(source);',
    input: '①こころ\n②雪国\n③鼻',
    holds: (parsed) => parsed.entries[0]?.title === 'こころ',
  },
  {
    rule: '§2.3.8 a greeting or sign-off is dropped',
    find: 'if (CHATTER_LINES.has(lowered)) return true;',
    replace: 'if (false) return true;',
    input: '- こころ\n- 雪国\n- 鼻\n- thanks',
    holds: (parsed) => parsed.entries.length === 3 && !titles(parsed).includes('thanks'),
  },
  {
    rule: '§2.3.8 an opener only counts when what follows is short and not Japanese',
    find: '(prefix) => lowered.startsWith(prefix) && lowered.length <= 40 && !hasJapanese(line),',
    replace: '(prefix) => lowered.startsWith(prefix),',
    input: '- so I finally read 夜は短し歩けよ乙女\n- こころ\n- 雪国',
    holds: (parsed) => parsed.entries.length === 3,
  },
  {
    rule: '§2.1 a URL alone on its line belongs to the LIST, not an entry',
    find: 'if (/^https?:\\/\\/\\S+$/.test(trimmed)) {',
    replace: 'if (false) {',
    input: WORKED_EXAMPLE,
    holds: (parsed) => parsed.sourceUrl === 'https://example.com/list/1234',
  },
  {
    rule: 'the winner sets the shape, but other marked lines still get a pass',
    find: 'const marked = NUMBERED_LINE.test(normalized) || BULLETED_LINE.test(normalized);',
    replace: 'const marked = false;',
    input: WORKED_EXAMPLE,
    holds: (parsed) => titles(parsed).includes('ハリー・ポッター'),
  },
  {
    rule: 'a title too short to be plausible is flagged, never dropped',
    find: "(title.length < 3 ? 'very-short' : undefined) ??",
    replace: "(false ? 'very-short' : undefined) ??",
    input: '1. AB\n2. 雪国\n3. 鼻',
    holds: (parsed) => parsed.entries[0]?.needsTriage === 'very-short',
  },
];

// The one anchor that cannot be written literally: the source contains a real
// empty-string literal whose quotes would end this file's own string. Spelled
// as a placeholder and substituted once, so the anchor still matches exactly.
const EMPTY_LITERAL = "''";

function anchorOf(rule: RuleMutation): string {
  return rule.find.replace('${EMPTY}', EMPTY_LITERAL);
}

describe('every parser rule is load-bearing (P1 mutation gate)', () => {
  it('covers every rule with a distinct anchor', () => {
    const anchors = RULES.map(anchorOf);
    expect(new Set(anchors).size).toBe(RULES.length);
    expect(RULES.length).toBeGreaterThanOrEqual(20);
  });

  it('the mutant loader refuses a parser that grew a runtime import', () => {
    expect(() => loadMutant("import { x } from './readingLists';\nexport const y = x;")).toThrow(
      /runtime import/,
    );
  });

  for (const rule of RULES) {
    it(`${rule.rule}`, () => {
      const anchor = anchorOf(rule);

      // 1. The mutation must actually apply. A silent no-op reads as a PASS.
      const occurrences = SOURCE.split(anchor).length - 1;
      expect(occurrences, `anchor not found verbatim in readingListParser.ts:\n${anchor}`).toBe(1);

      // 2. The property must hold on the real parser, or the row proves nothing.
      expect(rule.holds(parseReadingList(rule.input)), 'property is false on the REAL parser').toBe(
        true,
      );

      // 3. Broken, the property must fail.
      const mutant = loadMutant(SOURCE.replace(anchor, rule.replace));
      let brokenHolds: boolean;
      try {
        brokenHolds = rule.holds(mutant(rule.input));
      } catch {
        // A rule whose absence throws is still a rule that was load-bearing.
        brokenHolds = false;
      }
      expect(brokenHolds, 'the property SURVIVED the mutation — the rule is not tested').toBe(
        false,
      );
    });
  }
});
