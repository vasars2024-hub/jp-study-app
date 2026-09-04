/**
 * §2.5's model. Every assertion runs against the REAL parser output for the
 * §2.1 worked example, not a hand-built draft, so a parser change that would
 * break the preview breaks these too.
 */
import { describe, expect, it } from 'vitest';
import {
  beginReadingListPreview,
  editPreviewRow,
  readingPreviewImport,
  resetPreviewToParse,
  revertPreviewRow,
  setPreviewRowIncluded,
  summarizeReadingPreview,
  undoPreviewEdits,
  READING_PREVIEW_UNDO_DEPTH,
} from '../readingListPreview';
import { applyReadingListImport, createReadingList, createReadingListsMutationContext } from '../readingListMutations';
import { emptyReadingListsDocument } from '../readingLists';

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

function draft() {
  return beginReadingListPreview(WORKED_EXAMPLE);
}

/** The parser assigns line indexes; never assume they are 0..n. */
function lineIndexOf(d: ReturnType<typeof draft>, title: string): number {
  const row = d.rows.find((r) => r.title === title);
  if (!row) throw new Error(`no row titled ${title}; have ${d.rows.map((r) => r.title).join(' | ')}`);
  return row.lineIndex;
}

describe('beginReadingListPreview', () => {
  it('opens over the real parse, with every entry ticked', () => {
    const d = draft();
    expect(d.rows).toHaveLength(5);
    expect(d.rows.every((r) => r.included)).toBe(true);
    expect(d.rows.every((r) => r.edited)).toBe(false);
    expect(d.rawText).toBe(WORKED_EXAMPLE);
  });

  it('keeps the raw line beside every row, so provenance survives the sheet', () => {
    for (const row of draft().rows) expect(row.rawLine.length).toBeGreaterThan(0);
  });

  it('leaves a triage row INCLUDED — §2.5 flags it, it does not drop it', () => {
    const d = draft();
    const flagged = d.rows.filter((r) => r.needsTriage);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].needsTriage).toBe('author-ambiguous');
    expect(flagged[0].included).toBe(true);
    expect(summarizeReadingPreview(d).triage).toBe(1);
  });

  it('carries the chatter the parser threw away, for the disclosure', () => {
    expect(summarizeReadingPreview(draft()).droppedLines).toBeGreaterThan(0);
  });
});

describe('editing a row', () => {
  it('changes the field and marks the row edited', () => {
    const d = draft();
    const i = lineIndexOf(d, 'Kino no Tabi');
    const next = editPreviewRow(d, i, { title: 'キノの旅' });
    const row = next.rows.find((r) => r.lineIndex === i);
    expect(row?.title).toBe('キノの旅');
    expect(row?.edited).toBe(true);
    // The parse itself is never touched — §2.4 re-parses from it.
    expect(d.parsed.entries.find((e) => e.lineIndex === i)?.title).toBe('Kino no Tabi');
  });

  it('is a no-op — same reference — when the value did not change', () => {
    const d = draft();
    const i = lineIndexOf(d, 'Kino no Tabi');
    expect(editPreviewRow(d, i, { title: 'Kino no Tabi' })).toBe(d);
    expect(editPreviewRow(d, 9999, { title: 'nope' })).toBe(d);
  });

  it('drops an emptied optional field rather than storing an empty string', () => {
    const d = draft();
    const withAuthor = d.rows.find((r) => r.author);
    expect(withAuthor).toBeDefined();
    const next = editPreviewRow(d, withAuthor!.lineIndex, { author: '' });
    expect(next.rows.find((r) => r.lineIndex === withAuthor!.lineIndex)).not.toHaveProperty('author');
  });

  it('un-marks edited when the value is typed back to the parse', () => {
    const d = draft();
    const i = lineIndexOf(d, 'Kino no Tabi');
    const changed = editPreviewRow(d, i, { title: 'x' });
    const back = editPreviewRow(changed, i, { title: 'Kino no Tabi' });
    expect(back.rows.find((r) => r.lineIndex === i)?.edited).toBe(false);
  });
});

describe('dropping a row', () => {
  it('keeps the row, unticked, so it can be put back', () => {
    const d = draft();
    const i = lineIndexOf(d, '君の膵臓をたべたい');
    const dropped = setPreviewRowIncluded(d, i, false);
    expect(dropped.rows).toHaveLength(5);
    expect(dropped.rows.find((r) => r.lineIndex === i)?.included).toBe(false);
    const summary = summarizeReadingPreview(dropped);
    expect(summary.included).toBe(4);
    expect(summary.dropped).toBe(1);
    expect(setPreviewRowIncluded(dropped, i, true).rows.find((r) => r.lineIndex === i)?.included).toBe(
      true,
    );
  });

  it('is a no-op when the row is already in that state', () => {
    const d = draft();
    expect(setPreviewRowIncluded(d, lineIndexOf(d, 'Kino no Tabi'), true)).toBe(d);
  });
});

describe('revert and undo', () => {
  it('revert puts one row back without re-ticking a dropped one', () => {
    const d = draft();
    const i = lineIndexOf(d, 'Kino no Tabi');
    const messy = setPreviewRowIncluded(editPreviewRow(d, i, { title: 'wrong' }), i, false);
    const reverted = revertPreviewRow(messy, i);
    const row = reverted.rows.find((r) => r.lineIndex === i);
    expect(row?.title).toBe('Kino no Tabi');
    expect(row?.edited).toBe(false);
    expect(row?.included).toBe(false);
  });

  it('undo pops exactly one frame, and stops at the original parse', () => {
    const d = draft();
    const i = lineIndexOf(d, 'Kino no Tabi');
    const a = editPreviewRow(d, i, { title: 'one' });
    const b = editPreviewRow(a, i, { title: 'two' });
    const back = undoPreviewEdits(b);
    expect(back.rows.find((r) => r.lineIndex === i)?.title).toBe('one');
    const start = undoPreviewEdits(back);
    expect(start.rows.find((r) => r.lineIndex === i)?.title).toBe('Kino no Tabi');
    expect(undoPreviewEdits(start)).toBe(start);
  });

  it('caps the undo stack rather than growing without bound', () => {
    let d = draft();
    const i = lineIndexOf(d, 'Kino no Tabi');
    for (let n = 0; n < READING_PREVIEW_UNDO_DEPTH + 12; n++) d = editPreviewRow(d, i, { title: `t${n}` });
    expect(d.history.length).toBe(READING_PREVIEW_UNDO_DEPTH);
  });

  it('reset restores the parse in one step, and is a no-op on a clean draft', () => {
    const d = draft();
    const i = lineIndexOf(d, 'Kino no Tabi');
    const messy = setPreviewRowIncluded(editPreviewRow(d, i, { title: 'wrong' }), i, false);
    const reset = resetPreviewToParse(messy);
    expect(reset.rows.map((r) => r.title)).toEqual(d.rows.map((r) => r.title));
    expect(reset.rows.every((r) => r.included && !r.edited)).toBe(true);
    expect(resetPreviewToParse(d)).toBe(d);
  });
});

describe('blockers', () => {
  it('refuses an empty selection', () => {
    let d = draft();
    for (const row of d.rows) d = setPreviewRowIncluded(d, row.lineIndex, false);
    expect(summarizeReadingPreview(d).blockers).toEqual(['nothing-selected']);
  });

  it('refuses a title edited down to whitespace, and never imports it', () => {
    const d = draft();
    const i = lineIndexOf(d, 'Kino no Tabi');
    const blank = editPreviewRow(d, i, { title: '   ' });
    const summary = summarizeReadingPreview(blank);
    expect(summary.blankTitles).toBe(1);
    expect(summary.blockers).toContain('blank-title');
    // The exclusion is in the model, not only in the button.
    expect(readingPreviewImport(blank).excludeLineIndexes).toContain(i);
  });
});

describe('readingPreviewImport → applyReadingListImport', () => {
  function importInto(d: ReturnType<typeof draft>) {
    const ctx = createReadingListsMutationContext(1_700_000_000_000);
    const created = createReadingList(emptyReadingListsDocument(), { name: 'From a friend' }, ctx);
    const payload = readingPreviewImport(d);
    return applyReadingListImport(
      created.document,
      created.listId,
      payload.parsed,
      { rawText: payload.rawText, excludeLineIndexes: payload.excludeLineIndexes },
      ctx,
    );
  }

  it('lands exactly the ticked rows, with the hand edit applied', () => {
    const d = draft();
    const i = lineIndexOf(d, 'Kino no Tabi');
    const edited = editPreviewRow(d, i, { title: 'キノの旅' });
    const dropped = setPreviewRowIncluded(edited, lineIndexOf(d, '君の膵臓をたべたい'), false);

    const result = importInto(dropped);
    expect(result.added).toBe(4);
    const titles = result.document.works.map((w) => w.titleRaw);
    expect(titles).toContain('キノの旅');
    expect(titles).not.toContain('Kino no Tabi');
    expect(titles).not.toContain('君の膵臓をたべたい');
  });

  it('keeps the raw text and the original line beside every landed entry', () => {
    const result = importInto(draft());
    const list = result.document.lists[0];
    expect(list.imports[0].rawText).toBe(WORKED_EXAMPLE);
    for (const entry of list.entries) {
      expect(entry.sourceRef?.rawLine.length).toBeGreaterThan(0);
      expect(typeof entry.sourceRef?.lineIndex).toBe('number');
    }
  });

  it('carries the standalone URL to the list, not to an entry', () => {
    const result = importInto(draft());
    expect(result.document.lists[0].sourceUrl).toBe('https://example.com/list/1234');
  });
});
