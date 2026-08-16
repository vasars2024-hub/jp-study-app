/**
 * Recipe 20's model. The whole recipe is "when provenance is available", so the
 * assertions that matter most are the ones proving it stays silent when it is
 * not: a hand-made note gets `no-provenance`, never a plausible sentence.
 *
 * The decode is pinned against the real producers rather than against a guess —
 * `videoClipFilename` is called for the fixtures, so a change to the naming
 * scheme fails here instead of silently making every timestamp unreadable.
 */
import { describe, expect, it } from 'vitest';

import type { AnkiDraftCard, AnkiDraftDeck, AnkiDraftNote, AnkiDraftNoteType } from '../ankiDraft';
import { videoClipFilename } from '../videoClip';
import {
  DEFAULT_SOURCE_SEPARATOR,
  SOURCE_FACETS,
  formatClipTimestamp,
  parseSourceFacet,
  planSourceContext,
  readSourceContext,
  type SourceFacet,
} from '../ankiSourceContext';

const FIELDS = ['Expression', 'Sentence', 'Source'];

function note(
  id: string,
  over: { tags?: string[]; media?: string[]; source?: string } = {},
): AnkiDraftNote {
  const values = ['猫', '猫が好きです。', over.source ?? ''];
  return {
    id,
    guid: `g-${id}`,
    noteTypeId: 'nt',
    tags: over.tags ?? [],
    marked: false,
    fields: FIELDS.map((name, ord) => ({ ord, name, raw: values[ord], normalized: values[ord] })),
    modifiedAtSec: 0,
    flags: 0,
    data: '',
    cardIds: [`c-${id}`],
    media: (over.media ?? []).map((fileName, i) => ({
      reference: fileName,
      fileName,
      kind: 'audio' as const,
      fieldOrd: i,
      present: true,
    })),
  } as unknown as AnkiDraftNote;
}

const NOTE_TYPES: AnkiDraftNoteType[] = [
  {
    id: 'nt',
    name: 'Mined',
    kind: 'standard',
    css: '',
    fields: FIELDS.map((name, ord) => ({ ord, name, sticky: false, rtl: false })),
    templates: [],
    sortFieldOrd: 0,
  } as unknown as AnkiDraftNoteType,
];

const DECKS: AnkiDraftDeck[] = [
  { id: 'd1', name: '銀河英雄伝説', path: ['Anime', '銀河英雄伝説'], filtered: false },
] as unknown as AnkiDraftDeck[];

const card = (noteId: string, deckId = 'd1'): AnkiDraftCard =>
  ({ id: `c-${noteId}`, noteId, deckId, ord: 0 }) as unknown as AnkiDraftCard;

function plan(
  notes: AnkiDraftNote[],
  facets: SourceFacet[] = [...SOURCE_FACETS],
  over: { toField?: string; decks?: AnkiDraftDeck[]; cards?: AnkiDraftCard[] } = {},
) {
  return planSourceContext({
    notes,
    cards: over.cards ?? notes.map((n) => card(n.id)),
    decks: over.decks ?? DECKS,
    noteTypes: NOTE_TYPES,
    toField: over.toField ?? 'Source',
    facets,
  });
}

describe('formatClipTimestamp', () => {
  it('drops the hour until there is one', () => {
    expect(formatClipTimestamp(0)).toBe('0:00');
    expect(formatClipTimestamp(9_000)).toBe('0:09');
    expect(formatClipTimestamp(753_000)).toBe('12:33');
    expect(formatClipTimestamp(3_599_000)).toBe('59:59');
    expect(formatClipTimestamp(3_600_000)).toBe('1:00:00');
    expect(formatClipTimestamp(4_953_000)).toBe('1:22:33');
  });

  it('floors rather than rounds, so a mark never reads as later than it is', () => {
    expect(formatClipTimestamp(12_999)).toBe('0:12');
  });
});

describe('parseSourceFacet', () => {
  it('accepts every facet it declares and nothing else', () => {
    for (const facet of SOURCE_FACETS) {
      expect(parseSourceFacet(facet.toUpperCase())).toBe(facet);
    }
    expect(parseSourceFacet('url')).toBeNull();
    expect(parseSourceFacet('title')).toBeNull();
  });
});

describe('readSourceContext', () => {
  it('decodes the timestamp and the cue out of a name the real producer built', () => {
    // Built by the shipped function, not typed by hand: if the scheme changes
    // this test fails instead of the decode silently returning nothing.
    const fileName = videoClipFilename('1-42', 753.0);
    expect(fileName).toBe('jp-clip-1-42-753000.mp4');

    const { values } = readSourceContext(note('n1', { media: [fileName] }), null);
    expect(values).toEqual([
      { facet: 'timestamp', text: '12:33', evidence: fileName },
      { facet: 'cue', text: '1:42', evidence: fileName },
    ]);
  });

  it('reads no cue when the seed is not a track/line pair', () => {
    // The documented limit: a Japanese title collapses to the literal `clip`.
    const fileName = videoClipFilename('日本語だけ', 2);
    expect(fileName).toBe('jp-clip-clip-2000.mp4');
    const { values } = readSourceContext(note('n1', { media: [fileName] }), null);
    expect(values.map((v) => v.facet)).toEqual(['timestamp']);
  });

  it('takes the most specific app tag as the origin', () => {
    const { values } = readSourceContext(
      note('n1', {
        tags: ['jp-study-app::extension', 'jp-study-app::extension-word', 'leech'],
      }),
      null,
    );
    expect(values).toEqual([
      {
        facet: 'origin',
        text: 'extension-word',
        evidence: 'jp-study-app::extension-word',
      },
    ]);
  });

  it('reads nothing from a tag outside the app namespace', () => {
    // The negative control for `origin`. A user tag is not provenance, and
    // treating `book::容疑者Xの献身` as one is exactly the invention this
    // recipe exists not to make.
    const { values } = readSourceContext(note('n1', { tags: ['book::容疑者Xの献身'] }), null);
    expect(values).toEqual([]);
  });

  it('flags a clip name that claims a time and carries none', () => {
    const { values, unreadableClip } = readSourceContext(
      note('n1', { media: ['jp-clip-1-42-later.mp4'] }),
      null,
    );
    expect(values).toEqual([]);
    expect(unreadableClip).toBe('jp-clip-1-42-later.mp4');
  });

  it('ignores media that is not a clip at all', () => {
    const { values, unreadableClip } = readSourceContext(
      note('n1', { media: ['tatoeba-12345.mp3', 'sunrise.jpg'] }),
      null,
    );
    expect(values).toEqual([]);
    expect(unreadableClip).toBeNull();
  });
});

describe('planSourceContext', () => {
  it('writes the requested facets in the order they were asked for', () => {
    const fileName = videoClipFilename('3-7', 61.5);
    const result = plan([
      note('n1', { media: [fileName], tags: ['jp-study-app::study-mode'] }),
    ]);

    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].toOrd).toBe(2);
    expect(result.proposals[0].after).toBe(
      ['1:01', '3:7', 'study-mode', 'Anime::銀河英雄伝説'].join(DEFAULT_SOURCE_SEPARATOR),
    );
    // Every value names the string it came from, so the decode is checkable.
    expect(result.proposals[0].values.map((v) => v.evidence)).toEqual([
      fileName,
      fileName,
      'jp-study-app::study-mode',
      'Anime::銀河英雄伝説',
    ]);
  });

  it('restores only the facets requested', () => {
    const result = plan([note('n1', { media: [videoClipFilename('3-7', 61.5)] })], ['timestamp']);
    expect(result.proposals[0].after).toBe('1:01');
    expect(result.byFacet).toEqual({ timestamp: 1, cue: 0, origin: 0, deck: 0 });
  });

  it('refuses a note with no provenance instead of writing something plausible', () => {
    // The load-bearing control. A hand-made note in no deck carries nothing, and
    // the recipe must produce nothing rather than a confident sentence.
    const result = plan([note('n1')], ['timestamp', 'cue', 'origin'], { cards: [] });

    expect(result.proposals).toEqual([]);
    expect(result.skips).toEqual([{ noteId: 'n1', refusal: 'no-provenance' }]);
    expect(result.byFacet).toEqual({ timestamp: 0, cue: 0, origin: 0, deck: 0 });
  });

  it('never overwrites a destination that already holds text', () => {
    const result = plan([
      note('n1', { media: [videoClipFilename('1-1', 10)], source: 'checked by hand' }),
    ]);
    expect(result.proposals).toEqual([]);
    expect(result.skips[0]).toMatchObject({ refusal: 'occupied', detail: 'Source' });
    // Counted anyway: "142 have a timestamp, 130 are already filled" is the
    // number that says the run is redundant rather than the deck bare.
    expect(result.byFacet.timestamp).toBe(1);
  });

  it('refuses a note type with no such field', () => {
    const result = plan([note('n1', { media: [videoClipFilename('1-1', 10)] })], [...SOURCE_FACETS], {
      toField: 'Notes',
    });
    expect(result.skips[0]).toMatchObject({ refusal: 'field-absent', detail: 'Notes' });
  });

  it('reports an unreadable clip only when it is why the note produced nothing', () => {
    const bad = 'jp-clip-1-42-later.mp4';
    // With a deck to restore, the file name is not the reason and would be noise.
    const withDeck = plan([note('n1', { media: [bad] })], ['deck', 'timestamp']);
    expect(withDeck.proposals[0].after).toBe('Anime::銀河英雄伝説');
    expect(withDeck.skips).toEqual([]);

    // Alone, it IS the reason, and the user needs to know the name was rewritten.
    const alone = plan([note('n2', { media: [bad] })], ['timestamp'], { cards: [] });
    expect(alone.skips).toEqual([{ noteId: 'n2', refusal: 'unreadable-clip', detail: bad }]);
  });

  it('counts a facet once per note even when a note carries two clips', () => {
    const result = plan(
      [note('n1', { media: [videoClipFilename('1-1', 10), videoClipFilename('2-2', 20)] })],
      ['timestamp'],
    );
    // The first clip wins: two would make "the timestamp" ambiguous.
    expect(result.proposals[0].after).toBe('0:10');
    expect(result.byFacet.timestamp).toBe(1);
  });
});
