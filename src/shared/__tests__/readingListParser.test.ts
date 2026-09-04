/**
 * The parser, against §2.1's worked example and against each rule on its own.
 *
 * §10.5 is the standard this has to meet: "A parser test that asserts a title
 * 'appears in the output' is not a test. Assert the exact entry count and each
 * field." So the worked example asserts the count and every field of every entry,
 * and each rule below is exercised by an input that isolates it.
 *
 * ## The worked example says 6 works and lists 5
 *
 * `docs/ACTIVE/READING_LISTS_PLAN.md` §2.1 heads its table "Expected: **6
 * works**, one flagged for triage" and then enumerates five, plus a sixth row for
 * the URL marked `—` and annotated "kept as `list.sourceUrl`, **not an entry**".
 * The itemised table is the specific half and the summary is the loose one, so
 * five entries and one `sourceUrl` is what is implemented. Recorded here and in
 * the plan so the next worker does not "fix" it back into six.
 */
import { describe, expect, it } from 'vitest';
import {
  extractVolume,
  hasJapanese,
  normalizeLine,
  pairTitles,
  parseReadingList,
  scoreSegmentation,
  splitAuthor,
  READING_LIST_EXAMPLE_MESSAGE,
  READING_LIST_PARSER_VERSION,
} from '../readingListParser';

/**
 * The literal moved to `readingListParser.ts` so §11.4's empty state can show
 * the user the exact input this file pins the output of. Imported rather than
 * re-typed: two copies would let the hint drift from the acceptance test, which
 * is the one thing showing a worked example in a UI must not do.
 */
const WORKED_EXAMPLE = READING_LIST_EXAMPLE_MESSAGE;

describe('§2.1 — this exact input must produce this exact list', () => {
  const parsed = parseReadingList(WORKED_EXAMPLE);

  it('produces exactly five entries and keeps the standalone URL off them', () => {
    expect(parsed.entries).toHaveLength(5);
    expect(parsed.sourceUrl).toBe('https://example.com/list/1234');
    expect(parsed.entries.some((entry) => entry.url)).toBe(false);
  });

  it('drops the greeting', () => {
    expect(parsed.entries.map((entry) => entry.title)).not.toContain(
      'yo these are the ones i said',
    );
    expect(parsed.dropped.join(' ')).toContain('yo these are the ones i said');
  });

  it('1 — Kino no Tabi, romaji, untouched', () => {
    const entry = parsed.entries[0];
    expect(entry.title).toBe('Kino no Tabi');
    expect(entry.titleEn).toBe('Kino no Tabi');
    expect(entry.titleJa).toBeUndefined();
    expect(entry.author).toBeUndefined();
    expect(entry.needsTriage).toBeUndefined();
  });

  it('2 — 君の膵臓をたべたい, Japanese', () => {
    const entry = parsed.entries[1];
    expect(entry.title).toBe('君の膵臓をたべたい');
    expect(entry.titleJa).toBe('君の膵臓をたべたい');
    expect(entry.titleEn).toBeUndefined();
  });

  it('3 — EN + JA in parens is ONE work, both titles, author corrected inline', () => {
    const entry = parsed.entries[2];
    expect(entry.title).toBe('コンビニ人間');
    expect(entry.titleJa).toBe('コンビニ人間');
    expect(entry.titleEn).toBe('Convenience Store Woman');
    expect(entry.author).toBe('Sayaka Murata');
    // The retracted first candidate is not silently accepted, and not silently
    // ignored either: the entry says it made a call.
    expect(entry.needsTriage).toBe('author-ambiguous');
  });

  it('4 — ハリー・ポッター 1〜3巻 is one entry with a range, not three', () => {
    const entry = parsed.entries[3];
    expect(entry.title).toBe('ハリー・ポッター');
    expect(entry.volume).toEqual({ from: 1, to: 3 });
  });

  it('5 — the quoted title survives prose, and the chatter does not', () => {
    const entry = parsed.entries[4];
    expect(entry.title).toBe('夜は短し歩けよ乙女');
    expect(entry.title).not.toContain('also');
    expect(entry.title).not.toContain('if u can find it');
    expect(entry.title).not.toContain('lol');
    // NOT flagged: a quoted span is the strongest title signal the parser has
    // (§2.3 step 3), and asking about the case it is most confident in is how a
    // triage strip stops being read.
    expect(entry.needsTriage).toBeUndefined();
  });

  it('flags exactly one entry for triage, as §2.1 says', () => {
    const flagged = parsed.entries.filter((entry) => entry.needsTriage);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].needsTriage).toBe('author-ambiguous');
  });

  it('reads the message as numbered, with the bulleted and prose lines recovered', () => {
    // §2.2: line-per-title applies only when nothing else matched. Offered here it
    // scored 0.533 against numbered's 0.343 and won — same five books by luck of
    // the chatter filter, wrong reported shape, and no luck on a message that
    // mixes a numbered list with real sentences.
    expect(parsed.segmentation).toBe('numbered');
  });

  it('keeps the raw line on every entry, so the preview can show its source', () => {
    for (const entry of parsed.entries) {
      expect(entry.rawLine.length).toBeGreaterThan(0);
      expect(WORKED_EXAMPLE.split('\n')[entry.lineIndex]).toBe(entry.rawLine);
    }
  });

  it('is a pure function of its input', () => {
    expect(parseReadingList(WORKED_EXAMPLE)).toEqual(parsed);
    expect(parsed.parserVersion).toBe(READING_LIST_PARSER_VERSION);
  });
});

describe('segmentation', () => {
  it('prefers numbered over line-per-title when the message is numbered', () => {
    const parsed = parseReadingList('1. 蟹工船\n2. 人間失格\n3. こころ');
    expect(parsed.segmentation).toBe('numbered');
    expect(parsed.entries.map((entry) => entry.title)).toEqual(['蟹工船', '人間失格', 'こころ']);
  });

  it('handles ① and 一、 as numbering', () => {
    expect(parseReadingList('①こころ\n②人間失格\n③蟹工船').entries).toHaveLength(3);
    expect(parseReadingList('一、こころ\n二、人間失格\n三、蟹工船').entries).toHaveLength(3);
  });

  it('splits one comma run into titles', () => {
    const parsed = parseReadingList('こころ、人間失格、蟹工船、雪国');
    expect(parsed.segmentation).toBe('inline-separated');
    expect(parsed.entries.map((entry) => entry.title)).toEqual([
      'こころ',
      '人間失格',
      '蟹工船',
      '雪国',
    ]);
  });

  it('rejects a strategy that produces one enormous title', () => {
    const paragraph = `${'a'.repeat(400)}`;
    const many = ['こころ', '人間失格', '蟹工船'];
    expect(scoreSegmentation(many.map((text) => ({ text })))).toBeGreaterThan(
      scoreSegmentation([{ text: paragraph }]),
    );
  });

  it('scores nothing for an empty segmentation', () => {
    expect(scoreSegmentation([])).toBe(0);
  });

  it('returns no entries rather than guessing at unquoted prose', () => {
    const parsed = parseReadingList('I read a really good book last week and I liked it');
    expect(parsed.entries).toEqual([]);
    expect(parsed.dropped).toHaveLength(1);
  });
});

describe('per-line cleanup', () => {
  it('normalizes full-width digits and the ideographic space', () => {
    expect(normalizeLine('１２３　こころ')).toBe('123 こころ');
  });

  it('strips every leading marker shape', () => {
    for (const line of ['1. こころ', '1) こころ', '(1) こころ', '1 - こころ', '- こころ', '• こころ', '・こころ', '> こころ']) {
      expect(parseReadingList(`${line}\n2. 雪国\n3. 蟹工船`).entries[0].title).toBe('こころ');
    }
  });

  it('strips trailing chatter and the punctuation it leaves behind', () => {
    const parsed = parseReadingList('1. こころ maybe\n2. 雪国 lol!!\n3. 蟹工船 i think');
    expect(parsed.entries.map((entry) => entry.title)).toEqual(['こころ', '雪国', '蟹工船']);
  });

  it('keeps a per-line URL on its entry rather than on the list', () => {
    const parsed = parseReadingList(
      '1. こころ https://example.com/kokoro\n2. 雪国\n3. 蟹工船',
    );
    expect(parsed.entries[0].url).toBe('https://example.com/kokoro');
    expect(parsed.entries[0].title).toBe('こころ');
    expect(parsed.sourceUrl).toBeUndefined();
  });

  it('drops a whole-line greeting or sign-off that no opener rule would catch', () => {
    // Isolates the exact-line chatter set. Without it these lines are caught by
    // nothing: they have no opener prefix, so the prefix rule cannot see them.
    // Measured twice. Deleting the exact-line check left the §2.1 example green,
    // because its greeting happens to start with "yo "; it then left a NUMBERED
    // version of this input green too, because there the chatter lines carry no
    // marker and the recovery guard drops them for a different reason. Only an
    // unmarked list actually routes these two lines through `isChatter`.
    const parsed = parseReadingList('こころ\nthanks\n雪国\nenjoy\n蟹工船');
    expect(parsed.entries.map((entry) => entry.title)).toEqual(['こころ', '雪国', '蟹工船']);
  });

  it('does not treat a title that merely starts with a chatter word as chatter', () => {
    // "Kino **no** Tabi" and "so I finally read …" — the negative control for the
    // substring match this rule must not be.
    const parsed = parseReadingList('1. Kino no Tabi\n2. 雪国\n3. 蟹工船');
    expect(parsed.entries[0].title).toBe('Kino no Tabi');
  });
});

describe('volumes', () => {
  it('reads every range shape and removes it from the title', () => {
    const cases: [string, { from: number; to?: number }][] = [
      ['ハリー・ポッター 1-3', { from: 1, to: 3 }],
      ['ハリー・ポッター 1〜3巻', { from: 1, to: 3 }],
      ['ハリー・ポッター vol 1-5', { from: 1, to: 5 }],
      ['ハリー・ポッター 第1-3巻', { from: 1, to: 3 }],
      ['ハリー・ポッター #1-3', { from: 1, to: 3 }],
      ['ハリー・ポッター 第2巻', { from: 2 }],
    ];
    for (const [input, volume] of cases) {
      const result = extractVolume(normalizeLine(input));
      expect(result.volume, input).toEqual(volume);
      expect(result.line, input).toBe('ハリー・ポッター');
    }
  });

  it('repairs a backwards range instead of dropping the work', () => {
    expect(extractVolume('X 3-1').volume).toEqual({ from: 1, to: 3 });
  });

  it('leaves a title with no volume alone', () => {
    expect(extractVolume('こころ')).toEqual({ line: 'こころ' });
  });
});

describe('EN/JA pairing', () => {
  it('merges a cross-script parenthetical into one work, Japanese canonical', () => {
    expect(pairTitles('Convenience Store Woman (コンビニ人間)')).toEqual({
      title: 'コンビニ人間',
      titleJa: 'コンビニ人間',
      titleEn: 'Convenience Store Woman',
    });
    expect(pairTitles('コンビニ人間 (Convenience Store Woman)')).toEqual({
      title: 'コンビニ人間',
      titleJa: 'コンビニ人間',
      titleEn: 'Convenience Store Woman',
    });
  });

  it('does NOT merge a same-script parenthetical, which is a note', () => {
    // The negative control: without the script check this would produce a work
    // whose English title is "the anime one".
    const paired = pairTitles('Kino no Tabi (the anime one)');
    expect(paired.titleEn).toBeUndefined();
    expect(paired.title).toBe('Kino no Tabi (the anime one)');
  });

  it('classifies script correctly', () => {
    expect(hasJapanese('こころ')).toBe(true);
    expect(hasJapanese('雪国')).toBe(true);
    expect(hasJapanese('Kokoro')).toBe(false);
  });
});

describe('authors', () => {
  it('reads every marker shape', () => {
    expect(splitAuthor('こころ by 夏目漱石')).toEqual({ line: 'こころ', author: '夏目漱石' });
    expect(splitAuthor('こころ 【夏目漱石】')).toEqual({ line: 'こころ', author: '夏目漱石' });
    expect(splitAuthor('こころ 夏目漱石著')).toEqual({ line: 'こころ', author: '夏目漱石' });
  });

  it('takes the correction in `X? no, Y` and admits it guessed', () => {
    expect(splitAuthor('Convenience Store Woman — Murakami? no, Sayaka Murata')).toEqual({
      line: 'Convenience Store Woman',
      author: 'Sayaka Murata',
      triage: 'author-ambiguous',
    });
  });

  it('leaves a bare `A - B` line whole rather than splitting on a coin flip', () => {
    expect(splitAuthor('こころ - 夏目漱石')).toEqual({ line: 'こころ - 夏目漱石' });
  });
});

describe('the empty and degenerate inputs', () => {
  it('parses an empty message to an empty list, not a crash', () => {
    expect(parseReadingList('').entries).toEqual([]);
    expect(parseReadingList('   \n\n  ').entries).toEqual([]);
  });

  it('drops a line that is nothing but punctuation', () => {
    const parsed = parseReadingList('1. こころ\n2. !!!\n3. 蟹工船');
    expect(parsed.entries.map((entry) => entry.title)).toEqual(['こころ', '蟹工船']);
  });

  it('keeps a URL-only message as a source URL with no entries', () => {
    const parsed = parseReadingList('https://example.com/list/1');
    expect(parsed.sourceUrl).toBe('https://example.com/list/1');
    expect(parsed.entries).toEqual([]);
  });
});
