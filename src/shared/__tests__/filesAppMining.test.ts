/**
 * Gate 3, the pure half: what may be mined, what a refusal says, and the four
 * buckets every passage that did not become a card lands in.
 *
 * The arithmetic invariant is the load-bearing one — `drafts.length` plus the
 * three skip counts MUST equal `passagesRead`. A silently-dropped passage is
 * exactly the "count of 0 with no explanation" the plan calls a FINDING, and
 * only this identity catches it.
 */
import { describe, expect, it } from 'vitest';
import {
  FILES_MINEABLE_KINDS,
  FILES_MINE_MAX_CARDS,
  buildFilesMineDrafts,
  buildFilesMineNoteRequest,
  deckProvenanceFor,
  deckSourceFor,
  existingDeckKeys,
  mineBookIdFor,
  mineabilityOf,
  type FilesMinePassage,
} from '../filesApp/mining';
import { FILES_PROVENANCES, type FilesItem, type FilesItemKind } from '../filesApp/catalog';

function item(overrides: Partial<FilesItem> = {}): FilesItem {
  return {
    id: 'transcript:ep1',
    name: 'Episode 1',
    kind: 'transcript',
    categoryId: 'transcripts',
    provenance: 'whisper-transcript',
    source: 'yt-transcripts',
    sizeBytes: 1024,
    createdAt: null,
    modifiedAt: null,
    location: { store: 'file', path: 'C:\\t\\ep1.json' },
    flags: {},
    ...overrides,
  } as FilesItem;
}

const cue = (index: number, text: string, startMs?: number): FilesMinePassage => ({
  index,
  text,
  ...(startMs === undefined ? {} : { startMs }),
});

describe('mineabilityOf', () => {
  it('offers mining for exactly the three kinds that carry text', () => {
    for (const kind of FILES_MINEABLE_KINDS) {
      expect(mineabilityOf(item({ kind }))).toEqual({ mineable: true });
    }
  });

  it('refuses a video by naming the transcript, not by claiming the kind is unknown', () => {
    // The distinction matters: a video IS indexed and its transcript IS
    // mineable, so a generic "no text" message sends the user nowhere.
    const refusal = mineabilityOf(item({ kind: 'video' }));
    expect(refusal).toEqual({
      mineable: false,
      reasonKey: 'filesApp.mine.refuse.mediaHasNoText',
    });
  });

  it('checks the broken link BEFORE the kind, so a missing file says so', () => {
    const refusal = mineabilityOf(item({ kind: 'video', flags: { brokenLink: true } }));
    expect(refusal).toEqual({ mineable: false, reasonKey: 'filesApp.mine.refuse.brokenLink' });
  });

  it('refuses a non-file store as not-file-backed', () => {
    const refusal = mineabilityOf(
      item({ kind: 'transcript', location: { store: 'sqlite', database: 'dict.db', table: 'words' } }),
    );
    expect(refusal).toEqual({ mineable: false, reasonKey: 'filesApp.mine.refuse.notFileBacked' });
  });

  it('refuses every other kind with the kind-has-no-text reason', () => {
    const others: FilesItemKind[] = ['dictionary', 'deck'];
    for (const kind of others) {
      const refusal = mineabilityOf(item({ kind }));
      expect(refusal).toEqual({ mineable: false, reasonKey: 'filesApp.mine.refuse.kindHasNoText' });
    }
  });
});

describe('deckProvenanceFor', () => {
  it('maps the four recorded origins and leaves the three unknown ones ABSENT', () => {
    expect(deckProvenanceFor('human-subs')).toBe('human-subs');
    expect(deckProvenanceFor('auto-captions')).toBe('auto-captions');
    expect(deckProvenanceFor('whisper-transcript')).toBe('transcript');
    expect(deckProvenanceFor('book-text')).toBe('book-text');
    // Never defaulted to a human value: a fabricated trust mark is worse than none.
    expect(deckProvenanceFor('app-generated')).toBeUndefined();
    expect(deckProvenanceFor('installed')).toBeUndefined();
    expect(deckProvenanceFor('unknown')).toBeUndefined();
  });

  it('handles every provenance the catalogue can produce', () => {
    // Guards the switch against a new FILES_PROVENANCES entry silently falling
    // through to undefined without anyone deciding that it should.
    for (const provenance of FILES_PROVENANCES) {
      expect(() => deckProvenanceFor(provenance)).not.toThrow();
    }
  });
});

describe('buildFilesMineDrafts', () => {
  it('carries the transcript mark onto every card', () => {
    const plan = buildFilesMineDrafts(item(), [cue(1, 'これはペンです')]);
    expect(plan.drafts).toHaveLength(1);
    expect(plan.drafts[0].textProvenance).toBe('transcript');
    expect(plan.drafts[0].bookId).toBe('files:transcript:ep1');
    expect(plan.drafts[0].source).toBe('media');
  });

  it('leaves textProvenance absent rather than inventing one', () => {
    const plan = buildFilesMineDrafts(item({ provenance: 'unknown' }), [cue(1, '走る')]);
    expect('textProvenance' in plan.drafts[0]).toBe(false);
  });

  it('counts every dropped passage into a named bucket, summing to passagesRead', () => {
    const passages = [
      cue(1, '猫が好き'),
      cue(2, '[Music]'),
      cue(3, ''),
      cue(4, '猫 が 好き'), // same text once whitespace is folded
      cue(5, '犬も好き'),
    ];
    const plan = buildFilesMineDrafts(item(), passages);
    expect(plan.passagesRead).toBe(5);
    expect(plan.drafts).toHaveLength(2);
    expect(plan.skippedNotJapanese).toBe(2);
    expect(plan.skippedDuplicate).toBe(1);
    expect(plan.skippedOverCap).toBe(0);
    expect(
      plan.drafts.length + plan.skippedNotJapanese + plan.skippedDuplicate + plan.skippedOverCap,
    ).toBe(plan.passagesRead);
  });

  it('reports truncation with a number instead of a quiet success', () => {
    const passages = Array.from({ length: 7 }, (_, i) => cue(i + 1, `文${i}です`));
    const plan = buildFilesMineDrafts(item(), passages, { maxCards: 3 });
    expect(plan.drafts).toHaveLength(3);
    expect(plan.skippedOverCap).toBe(4);
    expect(plan.drafts.length + plan.skippedOverCap).toBe(plan.passagesRead);
  });

  it('honours cards already in the deck through the SAME fold', () => {
    const existingWords = existingDeckKeys(['猫 が  好き']);
    const plan = buildFilesMineDrafts(item(), [cue(1, '猫が好き'), cue(2, '犬も好き')], {
      existingWords,
    });
    expect(plan.drafts.map((d) => d.word)).toEqual(['犬も好き']);
    expect(plan.skippedDuplicate).toBe(1);
  });

  it('keeps a playback position only where the source carries one', () => {
    const plan = buildFilesMineDrafts(item(), [cue(1, '時間です', 3_723_000), cue(2, '無し')]);
    expect(plan.drafts[0].sceneReference).toBe('1:02:03');
    expect('sceneReference' in plan.drafts[1]).toBe(false);
  });

  it('caps at FILES_MINE_MAX_CARDS by default', () => {
    const passages = Array.from({ length: FILES_MINE_MAX_CARDS + 5 }, (_, i) =>
      cue(i + 1, `第${i}文です`),
    );
    const plan = buildFilesMineDrafts(item(), passages);
    expect(plan.drafts).toHaveLength(FILES_MINE_MAX_CARDS);
    expect(plan.skippedOverCap).toBe(5);
  });

  it('files book text under the epub source bucket', () => {
    const plan = buildFilesMineDrafts(
      item({ id: 'book:x', kind: 'book', provenance: 'book-text' }),
      [cue(1, '吾輩は猫である')],
    );
    expect(plan.drafts[0].source).toBe('epub');
    expect(plan.drafts[0].textProvenance).toBe('book-text');
    expect(deckSourceFor('book')).toBe('epub');
    expect(mineBookIdFor(item({ id: 'book:x' }))).toBe('files:book:x');
  });
});

describe('buildFilesMineNoteRequest', () => {
  it('routes cue text as subtitle and book text as epub, both existing MineSource values', () => {
    const [cueDraft] = buildFilesMineDrafts(item(), [cue(1, 'これはペンです')]).drafts;
    const request = buildFilesMineNoteRequest(cueDraft);
    expect(request.route.source).toBe('subtitle');
    expect(request.route.cardKind).toBe('sentence');
    expect(request.term).toBe('これはペンです');

    const [bookDraft] = buildFilesMineDrafts(
      item({ kind: 'book', provenance: 'book-text' }),
      [cue(1, '吾輩は猫である')],
    ).drafts;
    expect(buildFilesMineNoteRequest(bookDraft).route.source).toBe('epub');
  });

  it('carries the provenance into Anki as a tag, where it can no longer be re-derived', () => {
    const [draft] = buildFilesMineDrafts(item(), [cue(1, 'これはペンです')]).drafts;
    expect(buildFilesMineNoteRequest(draft).extraTags).toEqual([
      'files-app',
      'files-media',
      'provenance-transcript',
    ]);
  });

  it('adds no provenance tag when there is nothing honest to say', () => {
    const [draft] = buildFilesMineDrafts(item({ provenance: 'unknown' }), [cue(1, '走る')]).drafts;
    expect(buildFilesMineNoteRequest(draft).extraTags).toEqual(['files-app', 'files-media']);
  });
});
