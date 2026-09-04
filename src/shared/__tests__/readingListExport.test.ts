// @vitest-environment node
/**
 * P5 §8 — *"The round trip is the point: text in, text out."*
 *
 * So the gate here is not that the text looks plausible. It is that
 * `parseReadingList` — P1's real parser, not a stub — reads this file's own
 * output back and recovers the same titles, in the same order. A snapshot of
 * the rendered string would pass on a format the parser cannot read, which is
 * the whole failure §8 is written against.
 */

import { describe, expect, it } from 'vitest';
import {
  READING_LIST_EXAMPLE_MESSAGE,
  parseReadingList,
} from '../readingListParser';
import {
  readingListExport,
  readingListToCsv,
  readingListToMarkdown,
  readingListToMessage,
} from '../readingListExport';
import {
  addReadingListEntry,
  applyReadingListImport,
  createReadingList,
  createReadingListsMutationContext,
  sealReadingListsDocument,
} from '../readingListMutations';
import {
  emptyReadingListsDocument,
  type ReadingList,
  type ReadingListsDocument,
  type ReadingWorkRef,
} from '../readingLists';

const NOW = 1_770_000_000_000;

function only(document: ReadingListsDocument): {
  list: ReadingList;
  works: readonly ReadingWorkRef[];
} {
  const list = document.lists[0];
  if (!list) throw new Error('no list was created — the mutation layer changed shape');
  return { list, works: document.works };
}

/** A paste, through the product's own path: parse, then apply onto a new list. */
function imported(
  name: string,
  text: string,
  at = NOW,
): { list: ReadingList; works: readonly ReadingWorkRef[] } {
  let clock = at;
  const next = () => createReadingListsMutationContext((clock += 1));
  const created = createReadingList(emptyReadingListsDocument(), { name }, next());
  const applied = applyReadingListImport(
    created.document,
    created.listId,
    parseReadingList(text),
    { rawText: text },
    next(),
  );
  return only(sealReadingListsDocument(applied.document));
}

/** The §2.1 worked example. */
function fromExample(): { list: ReadingList; works: readonly ReadingWorkRef[] } {
  return imported('From a friend', READING_LIST_EXAMPLE_MESSAGE);
}

/** A hand-built list, so states and finish dates are under the test's control. */
function handBuilt(): { list: ReadingList; works: readonly ReadingWorkRef[] } {
  let clock = NOW;
  const next = () => createReadingListsMutationContext((clock += 1));
  let document: ReadingListsDocument = createReadingList(
    emptyReadingListsDocument(),
    { name: 'Book club', sourceUrl: 'https://example.com/list/9' },
    next(),
  ).document;
  const listId = document.lists[0].id;
  for (const input of [
    { title: 'Kino no Tabi', state: 'finished' as const },
    { title: 'コンビニ人間', author: 'Sayaka Murata', state: 'reading' as const },
    { title: 'A book, with a comma', state: 'wanted' as const },
    { title: 'A "quoted" book', state: 'abandoned' as const },
  ]) {
    document = addReadingListEntry(document, listId, input, next()).document;
  }
  // `normalizeEntry` demotes `finished` without a `finishedAt` (readingLists.ts:392),
  // so the date has to be set for the state to survive the seal at all.
  document = {
    ...document,
    lists: document.lists.map((list) => ({
      ...list,
      entries: list.entries.map((entry, index) =>
        index === 0 ? { ...entry, finishedAt: Date.UTC(2026, 2, 14, 22, 30) } : entry,
      ),
    })),
  };
  return only(sealReadingListsDocument(document));
}

describe('readingListToMessage — §8, text in, text out', () => {
  it('round-trips the §2.1 example back through the real parser', () => {
    const { list, works } = fromExample();
    const titles = list.entries.map(
      (entry) => works.find((work) => work.id === entry.workId)?.titleRaw ?? '',
    );
    expect(titles.length).toBe(5);

    const message = readingListToMessage(list, works);
    const reparsed = parseReadingList(message);

    // Same titles, same order. This is the assertion §8 exists for.
    expect(reparsed.entries.map((entry) => entry.title)).toEqual(titles);
    // And the parser's best case, not merely a case it survives.
    expect(reparsed.segmentation).toBe('numbered');
    // Nothing was dropped and nothing was invented on the way out and back.
    expect(reparsed.entries).toHaveLength(5);
  });

  it('re-importing its own output produces the same list, not a longer one', () => {
    // The end-to-end shape a user actually performs: copy the list, paste it
    // into a new one. A format that round-trips by luck at the parser level can
    // still split or merge entries once the mutation layer builds works.
    const { list, works } = fromExample();
    const round = imported('Pasted back', readingListToMessage(list, works), NOW + 1_000);
    expect(round.list.entries).toHaveLength(list.entries.length);
    expect(
      round.list.entries.map((entry) =>
        round.works.find((work) => work.id === entry.workId)?.titleRaw,
      ),
    ).toEqual(
      list.entries.map((entry) => works.find((work) => work.id === entry.workId)?.titleRaw),
    );
  });

  it('keeps the author on the separator the parser reads back', () => {
    const { list, works } = handBuilt();
    const message = readingListToMessage(list, works);
    expect(message).toContain('コンビニ人間【Sayaka Murata】');
    const reparsed = parseReadingList(message);
    const konbini = reparsed.entries.find((entry) => entry.title.includes('コンビニ人間'));
    // The author must come back as an AUTHOR. A `by ` prefix or a parenthesis
    // round-trips as part of the title, which is the defect this pins.
    expect(konbini?.author).toBe('Sayaka Murata');
    expect(konbini?.title).toBe('コンビニ人間');
  });

  it('carries the list name and the source url, and can be asked not to', () => {
    const { list, works } = handBuilt();
    expect(readingListToMessage(list, works)).toContain('https://example.com/list/9');
    // §2.1 reads a bare URL line as the LIST's provenance, so the round trip
    // keeps where the list came from rather than losing it.
    expect(parseReadingList(readingListToMessage(list, works)).sourceUrl).toBe(
      'https://example.com/list/9',
    );
    expect(readingListToMessage(list, works, { includeSourceUrl: false })).not.toContain(
      'example.com',
    );
  });

  it('exports every state by default and only the ones it was told to drop', () => {
    const { list, works } = handBuilt();
    // A list exported with its finished books silently missing is a different
    // list, and §5.9 makes `abandoned` first-class rather than shameful.
    expect(readingListToMessage(list, works).split('\n').filter((l) => /^\d+\. /u.test(l)))
      .toHaveLength(4);
    const trimmed = readingListToMessage(list, works, {
      excludeStates: ['finished', 'abandoned'],
    });
    expect(trimmed).not.toContain('Kino no Tabi');
    expect(trimmed).not.toContain('A "quoted" book');
    // Renumbered from 1, not left with holes where the dropped rows were.
    expect(trimmed).toContain('1. コンビニ人間【Sayaka Murata】');
    expect(trimmed).toContain('2. A book, with a comma');
  });
});

describe('readingListExport — the rows it draws from', () => {
  it("exports in the USER's order, not the array's", () => {
    // `order` is what §11.4's drag-to-reorder writes. An export that reads
    // `list.entries` gives back the insertion order, so the file disagrees with
    // the list the user is looking at — and every row is present, so nothing
    // about the output looks wrong.
    const { list, works } = handBuilt();
    // The ARRAY is reversed and every `order` is KEPT. Rewriting `order` to
    // match the new positions makes the two agree again, and the test then
    // passes with the sort deleted — which is what it did on the first pass.
    const shuffled: ReadingList = { ...list, entries: [...list.entries].reverse() };
    expect(shuffled.entries[0].order).toBe(3);

    const numbered = readingListToMessage(shuffled, works)
      .split('\n')
      .filter((line) => /^\d+\. /u.test(line));
    expect(numbered[0]).toContain('Kino no Tabi');
    expect(numbered[3]).toContain('A "quoted" book');
  });

  it('falls back to the raw pasted line when an entry has lost its work', () => {
    // A dangling `workId` is reachable: a work can be dropped by a repair or by
    // a `normalizeWork` rejection while its entry survives. Without the
    // fallback that row is simply ABSENT from the export — the file is short by
    // one book and says nothing about it, which is the quietest way to lose data.
    const { list, works } = handBuilt();
    const orphaned: ReadingList = {
      ...list,
      entries: list.entries.map((entry, index) =>
        index === 1
          ? {
              ...entry,
              workId: 'work-that-is-gone',
              sourceRef: { importId: 'imp-1', rawLine: '2. コンビニ人間', lineIndex: 1 },
            }
          : entry,
      ),
    };
    const message = readingListToMessage(orphaned, works);
    expect(message.split('\n').filter((line) => /^\d+\. /u.test(line))).toHaveLength(4);
    expect(message).toContain('2. コンビニ人間');
  });

  it('honours includeSourceUrl in Markdown as well as in the message', () => {
    const { list, works } = handBuilt();
    expect(readingListToMarkdown(list, works)).toContain('<https://example.com/list/9>');
    expect(readingListToMarkdown(list, works, { includeSourceUrl: false })).not.toContain(
      'example.com',
    );
  });
});

describe('readingListToMarkdown and readingListToCsv — §8, with states and finish dates', () => {
  it('renders a Markdown checklist with the state and the finish day', () => {
    const { list, works } = handBuilt();
    const md = readingListToMarkdown(list, works);
    expect(md.split('\n')[0]).toBe('# Book club');
    expect(md).toContain('- [x] Kino no Tabi · _finished_ · 2026-03-14');
    expect(md).toContain('- [ ] コンビニ人間【Sayaka Murata】 · _reading_');
    // Unfinished rows carry no date rather than an epoch or a blank field.
    expect(md).not.toContain('_reading_ · ');
  });

  it('quotes every CSV field, so a comma or a quote in a title cannot shift a column', () => {
    const { list, works } = handBuilt();
    const csv = readingListToCsv(list, works);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('"position","title","author","state","finished"');
    expect(lines[1]).toBe('"1","Kino no Tabi","","finished","2026-03-14"');
    // The two cases a conditional quote gets wrong.
    expect(lines[3]).toBe('"3","A book, with a comma","","wanted",""');
    expect(lines[4]).toBe('"4","A ""quoted"" book","","abandoned",""');
    // Every row has the same column count — the real test of the quoting.
    for (const line of lines.filter(Boolean)) {
      expect(line.split('","')).toHaveLength(5);
    }
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('uses the ONE author separator, and a checklist line still does not round-trip', () => {
    const { list, works } = handBuilt();
    const line = readingListToMarkdown(list, works)
      .split('\n')
      .find((candidate) => candidate.includes('コンビニ人間'));
    expect(line).toBeDefined();
    // One separator across both text formats, so there is a single rule.
    expect(line).toContain('コンビニ人間【Sayaka Murata】');

    // But the limitation, pinned rather than assumed: `AUTHOR_MARKERS`'s
    // bracket rule is anchored at END of line (`readingListParser.ts:324`), and
    // a checklist line carries `· _reading_` after the title. So pasting a
    // Markdown ROW back does not recover the author — the message format is
    // the round-trip one, and CSV is the structured re-import. If this ever
    // starts passing, Markdown became a round-trip format and §8 should say so.
    expect(parseReadingList(line!.replace('- [ ] ', '- ')).entries[0]?.author).toBeUndefined();

    // What DOES work is the title portion, which is what a user copying a
    // single book out of the checklist actually selects.
    const titleOnly = line!.replace('- [ ] ', '- ').split(' · ')[0];
    const reparsed = parseReadingList(`${titleOnly}\n- ${'Kino no Tabi'}`);
    expect(reparsed.entries[0]?.author).toBe('Sayaka Murata');
    expect(reparsed.entries[0]?.title).toBe('コンビニ人間');
  });

  it('routes each format through one entry point', () => {
    const { list, works } = handBuilt();
    expect(readingListExport('message', list, works)).toBe(readingListToMessage(list, works));
    expect(readingListExport('markdown', list, works)).toBe(readingListToMarkdown(list, works));
    expect(readingListExport('csv', list, works)).toBe(readingListToCsv(list, works));
  });
});
