/**
 * Reading Lists P5, §8 — getting a list back OUT.
 *
 * §8's first bullet is the load-bearing one: *"Renders the list as a numbered
 * message — pasteable straight back into LINE, Discord, or a forum. The round
 * trip is the point: text in, text out."* So the gate on this file is not that
 * it produces plausible text; it is that `parseReadingList` reads its own
 * output back and recovers the same titles. `readingListExport.test.ts` asserts
 * exactly that, through the real parser, on the §2.1 worked example.
 *
 * Pure, like `readingListViews`. Nothing here reads the DOM, the clipboard or
 * the filesystem — the surfaces that copy or save call these and own the side
 * effect, so one shape of the text serves the copy button, the file save and
 * the round-trip test alike.
 */

import type {
  ReadingEntryState,
  ReadingList,
  ReadingListEntry,
  ReadingWorkRef,
} from './readingLists';
import { sortReadingListEntries } from './readingListViews';

export type ReadingListExportFormat = 'message' | 'markdown' | 'csv';

export interface ReadingListExportOptions {
  /**
   * Include the list's own `sourceUrl` as a trailing line.
   *
   * Default TRUE for `message`, because §2.1 treats a bare URL line as the
   * list's provenance and dropping it makes the round trip lose where the list
   * came from. A caller sharing a list onward can turn it off.
   */
  includeSourceUrl?: boolean;
  /**
   * States to leave out. Empty by default — a list exported with its finished
   * books silently missing is a different list, and §5.9 makes `abandoned`
   * first-class rather than shameful.
   */
  excludeStates?: readonly ReadingEntryState[];
}

/** One row, resolved once so all three formats agree about what a row IS. */
interface ExportRow {
  entry: ReadingListEntry;
  title: string;
  author: string | undefined;
  state: ReadingEntryState;
  finishedAt: number | undefined;
}

function exportRows(
  list: ReadingList,
  works: readonly ReadingWorkRef[],
  options: ReadingListExportOptions,
): ExportRow[] {
  const byId = new Map(works.map((work) => [work.id, work]));
  const excluded = new Set(options.excludeStates ?? []);
  const out: ExportRow[] = [];
  for (const entry of sortReadingListEntries(list)) {
    if (excluded.has(entry.state)) continue;
    const work = byId.get(entry.workId);
    // The same fallback chain `readingListRows` uses. A row the user can see
    // must be a row the user can export; falling back to the raw line is what
    // keeps an unparsed entry from vanishing out of its own list.
    const title = work?.titleRaw.trim() || entry.sourceRef?.rawLine.trim() || '';
    if (!title) continue;
    out.push({
      entry,
      title,
      author: work?.authorRaw?.trim() || undefined,
      state: entry.state,
      finishedAt: entry.finishedAt,
    });
  }
  return out;
}

/**
 * §8's numbered message. The format is chosen to be the parser's own best case.
 *
 * `1. Title` is `numbered` segmentation, which `scoreSegmentation` ranks first
 * and which survives every messaging client's reflow.
 *
 * The author goes in `【brackets】`, and the choice is forced rather than
 * stylistic. `splitAuthor` DELIBERATELY refuses to split a dash — *"'Title -
 * Author' and 'Author - Title' look identical, so it is left whole rather than
 * split on a coin flip"* (`readingListParser.ts:358`) — so `Title — Author`
 * round-trips with the author welded onto the TITLE. That leaves the three
 * markers the parser does read: a trailing ` by X`, `【X】`/`[X]`, and `X著`.
 * `【X】` is the only one that reads naturally in every script this app
 * handles, so it needs no decision about which language the connector word is
 * in. The round-trip test is what caught the em dash.
 *
 * Deliberately NOT included: state, progress and finish dates. §2 parses a
 * message from a friend, and a friend's message does not carry them; a line
 * reading `1. Kino no Tabi [finished]` comes back as a work titled
 * "Kino no Tabi [finished]". Markdown and CSV carry that detail instead.
 */
export function readingListToMessage(
  list: ReadingList,
  works: readonly ReadingWorkRef[],
  options: ReadingListExportOptions = {},
): string {
  const rows = exportRows(list, works, options);
  const lines: string[] = [];
  const name = list.name.trim();
  if (name) lines.push(name, '');
  rows.forEach((row, index) => {
    lines.push(`${index + 1}. ${titleWithAuthor(row)}`);
  });
  if ((options.includeSourceUrl ?? true) && list.sourceUrl?.trim()) {
    lines.push('', list.sourceUrl.trim());
  }
  return lines.join('\n');
}

/** §8's Markdown, "with states and finish dates". */
export function readingListToMarkdown(
  list: ReadingList,
  works: readonly ReadingWorkRef[],
  options: ReadingListExportOptions = {},
): string {
  const rows = exportRows(list, works, options);
  const lines: string[] = [`# ${list.name.trim() || 'Reading list'}`, ''];
  for (const row of rows) {
    // A GitHub-flavoured task box, so the file is readable as a checklist in
    // any Markdown viewer without a legend.
    const done = row.state === 'finished' ? 'x' : ' ';
    const parts = [titleWithAuthor(row), `_${row.state}_`];
    if (row.finishedAt) parts.push(isoDay(row.finishedAt));
    lines.push(`- [${done}] ${parts.join(' · ')}`);
  }
  if ((options.includeSourceUrl ?? true) && list.sourceUrl?.trim()) {
    lines.push('', `<${list.sourceUrl.trim()}>`);
  }
  return lines.join('\n');
}

const CSV_HEADER = ['position', 'title', 'author', 'state', 'finished'] as const;

/**
 * §8's CSV. RFC 4180 quoting, and every field is quoted rather than only the
 * ones that need it — a conditional quote is where the comma inside a Japanese
 * title gets missed, and the cost of always quoting is bytes.
 */
export function readingListToCsv(
  list: ReadingList,
  works: readonly ReadingWorkRef[],
  options: ReadingListExportOptions = {},
): string {
  const rows = exportRows(list, works, options);
  const lines = [CSV_HEADER.map(csvField).join(',')];
  rows.forEach((row, index) => {
    lines.push(
      [
        String(index + 1),
        row.title,
        row.author ?? '',
        row.state,
        row.finishedAt ? isoDay(row.finishedAt) : '',
      ]
        .map(csvField)
        .join(','),
    );
  });
  // A trailing newline: a CSV without one is a file every spreadsheet opens and
  // some line-based tool silently truncates.
  return lines.join('\r\n') + '\r\n';
}

/**
 * Title and author in the one form `splitAuthor` reads back.
 *
 * Shared by `message` and `markdown` rather than each choosing its own, so
 * there is a single rule to know. It does NOT make Markdown a round-trip
 * format: `AUTHOR_MARKERS`'s bracket rule is anchored at end of line
 * (`readingListParser.ts:324`) and a checklist row carries `· _state_` after
 * the title, so a whole row pasted back keeps the title and loses the author.
 * The title PORTION does round-trip, which is what someone copying one book
 * out of the checklist actually selects. `readingListExport.test.ts` pins both
 * halves of that. CSV keeps the two in separate columns and does not need this.
 */
function titleWithAuthor(row: ExportRow): string {
  return row.author ? `${row.title}【${row.author}】` : row.title;
}

function csvField(value: string): string {
  return `"${value.replace(/"/gu, '""')}"`;
}

/** UTC calendar day. A local day would put the same finish on two dates. */
function isoDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

export function readingListExport(
  format: ReadingListExportFormat,
  list: ReadingList,
  works: readonly ReadingWorkRef[],
  options: ReadingListExportOptions = {},
): string {
  if (format === 'markdown') return readingListToMarkdown(list, works, options);
  if (format === 'csv') return readingListToCsv(list, works, options);
  return readingListToMessage(list, works, options);
}
