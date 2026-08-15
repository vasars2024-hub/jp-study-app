import { describe, expect, it } from 'vitest';
import {
  buildLocalDeckCollection,
  buildLocalDeckDraft,
  fingerprintLocalDeck,
  localDeckTag,
  localSrsToCardColumns,
  LOCAL_DECK_FIELD_NAMES,
  LOCAL_DECK_NOTE_TYPE_ID,
  type LocalDeckCardInput,
} from '../ankiLocalDeck';
import { splitNoteFields } from '../ankiDraft';
import type { LocalSrsState } from '../localSrs';

const DAY_MS = 24 * 60 * 60 * 1000;
// 2026-01-05T00:00:00Z, already midnight so `crt` truncation is a no-op.
const ORIGIN = Date.UTC(2026, 0, 5);

function srs(overrides: Partial<LocalSrsState> = {}): LocalSrsState {
  return {
    version: 1,
    dueAt: ORIGIN + 10 * DAY_MS,
    intervalDays: 4,
    ease: 2.5,
    repetitions: 3,
    lapses: 1,
    lastReviewedAt: ORIGIN + 6 * DAY_MS,
    lastRating: 'good',
    ...overrides,
  };
}

function card(overrides: Partial<LocalDeckCardInput> = {}): LocalDeckCardInput {
  return {
    id: 'fc-1',
    word: '猫',
    reading: 'ねこ',
    meaning: 'cat',
    sentence: '猫が好きです。',
    source: 'epub',
    addedAt: ORIGIN,
    ...overrides,
  };
}

const plain = (raw: string): string => String(raw ?? '').replace(/\s+/g, ' ').trim();

describe('localDeckTag', () => {
  it('collapses whitespace, because an Anki tag cannot contain any', () => {
    expect(localDeckTag('book', 'Kino no Tabi')).toBe('book::Kino_no_Tabi');
    expect(localDeckTag('src', '  ')).toBe('');
    expect(localDeckTag('jlpt', 'N3')).toBe('jlpt::N3');
  });
});

describe('localSrsToCardColumns', () => {
  it('leaves an unscheduled card new, with ease 0 rather than an invented 2500', () => {
    const columns = localSrsToCardColumns(undefined, 4, ORIGIN / 1000);
    expect(columns).toEqual({ type: 0, queue: 0, due: 5, ivl: 0, factor: 0, reps: 0, lapses: 0 });
  });

  it('maps a graduated card to a review card whose due is a day number', () => {
    const columns = localSrsToCardColumns(srs(), 0, ORIGIN / 1000);
    expect(columns.type).toBe(2);
    expect(columns.queue).toBe(2);
    expect(columns.due).toBe(10);
    expect(columns.ivl).toBe(4);
    expect(columns.factor).toBe(2500);
    expect(columns.reps).toBe(3);
    expect(columns.lapses).toBe(1);
  });

  it('maps a lapsed card to relearning with an epoch-second due', () => {
    const lapsed = srs({ intervalDays: 0, dueAt: ORIGIN + 600_000, lapses: 2, repetitions: 0, ease: 2.3 });
    const columns = localSrsToCardColumns(lapsed, 0, ORIGIN / 1000);
    expect(columns.type).toBe(3);
    expect(columns.queue).toBe(1);
    expect(columns.due).toBe(Math.round((ORIGIN + 600_000) / 1000));
    expect(columns.ivl).toBe(0);
    expect(columns.factor).toBe(2300);
    expect(columns.lapses).toBe(2);
  });
});

describe('buildLocalDeckCollection', () => {
  it('gives every card one note of the single shared note type', () => {
    const collection = buildLocalDeckCollection([card(), card({ id: 'fc-2', word: '犬' })]);
    expect(collection.raw.notes).toHaveLength(2);
    expect(collection.raw.cards).toHaveLength(2);
    expect(collection.raw.noteTypes).toHaveLength(1);
    const noteType = collection.raw.noteTypes[0]!;
    expect(noteType.id).toBe(LOCAL_DECK_NOTE_TYPE_ID);
    expect(noteType.fields.map((f) => f.name)).toEqual([...LOCAL_DECK_FIELD_NAMES]);
    // Unlike the CSV adapter this source really does define a card design, so
    // the draft must not be blocked as note-type-unassigned.
    expect(noteType.unassigned).toBeUndefined();
    expect(noteType.templates).toHaveLength(1);
    expect(noteType.templates[0]!.qfmt).toContain('{{^Front}}{{Expression}}{{/Front}}');
  });

  it('writes fields in the declared order and keeps the raw text', () => {
    const collection = buildLocalDeckCollection([card({ front: 'custom front', back: '<b>back</b>' })]);
    expect(splitNoteFields(collection.raw.notes[0]!.flds)).toEqual([
      '猫',
      'ねこ',
      'cat',
      '猫が好きです。',
      'custom front',
      '<b>back</b>',
      '',
      '',
    ]);
  });

  it('turns folders into subdecks and keeps an empty folder as its own deck', () => {
    const collection = buildLocalDeckCollection(
      [card({ folder: 'Verbs' }), card({ id: 'fc-2' })],
      { folders: ['Verbs', 'Never used'], rootDeckName: 'Mine' },
    );
    const names = collection.raw.decks.map((d) => d.name).sort();
    expect(names).toEqual(['Mine', 'Mine::Never used', 'Mine::Verbs']);
    const byId = new Map(collection.raw.decks.map((d) => [String(d.id), d.name]));
    expect(byId.get(String(collection.raw.cards[0]!.did))).toBe('Mine::Verbs');
    expect(byId.get(String(collection.raw.cards[1]!.did))).toBe('Mine');
    expect(collection.summary.folders).toBe(2);
  });

  it('reports neither an empty revlog nor an empty media manifest', () => {
    const collection = buildLocalDeckCollection([card()]);
    // Undefined means "not read". An empty array would accuse every managed clip
    // of being missing media and would claim the review log was checked.
    expect(collection.raw.revlog).toBeUndefined();
    expect(collection.raw.mediaFiles).toBeUndefined();
  });

  it('files a managed clip as Anki markup and leaves an inline data URL as text', () => {
    const collection = buildLocalDeckCollection([
      card({ id: 'fc-a', audioPath: 'C:/users/x/media/clip-9.mp3', imagePath: '/var/m/shot-2.png' }),
      card({ id: 'fc-b', audioDataUrl: 'data:audio/webm;base64,AAAA' }),
    ]);
    const a = splitNoteFields(collection.raw.notes[0]!.flds);
    expect(a[6]).toBe('[sound:clip-9.mp3]');
    expect(a[7]).toBe('<img src="shot-2.png">');
    const b = splitNoteFields(collection.raw.notes[1]!.flds);
    expect(b[6]).toBe('[sound:data:audio/webm;base64,AAAA]');
    expect(collection.summary.inlineAudio).toBe(1);
  });

  it('skips a card with no id and says how many it skipped', () => {
    const collection = buildLocalDeckCollection([
      card(),
      { id: '' } as LocalDeckCardInput,
      null as unknown as LocalDeckCardInput,
    ]);
    expect(collection.raw.notes).toHaveLength(1);
    expect(collection.summary).toMatchObject({ cardsRead: 3, skipped: 2 });
  });

  it('anchors crt on the earliest card, truncated to a whole day', () => {
    const collection = buildLocalDeckCollection([
      card({ id: 'fc-late', addedAt: ORIGIN + 3 * DAY_MS }),
      card({ id: 'fc-early', addedAt: ORIGIN + 5 * 60 * 60 * 1000 }),
    ]);
    expect(collection.createdAtSec).toBe(ORIGIN / 1000);
    expect(collection.raw.col?.crt).toBe(ORIGIN / 1000);
  });
});

describe('fingerprintLocalDeck', () => {
  it('moves when a card the preview depends on changes, and not otherwise', () => {
    const base = [card(), card({ id: 'fc-2', word: '犬' })];
    expect(fingerprintLocalDeck(base)).toBe(fingerprintLocalDeck([card(), card({ id: 'fc-2', word: '犬' })]));
    expect(fingerprintLocalDeck(base)).not.toBe(
      fingerprintLocalDeck([card({ meaning: 'feline' }), card({ id: 'fc-2', word: '犬' })]),
    );
    expect(fingerprintLocalDeck(base)).not.toBe(
      fingerprintLocalDeck([card(), card({ id: 'fc-2', word: '犬', srs: srs() })]),
    );
    expect(fingerprintLocalDeck(base)).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  });
});

describe('buildLocalDeckDraft', () => {
  it('produces an exportable draft — provenance, tags, marked and scheduling', () => {
    const { draft, summary } = buildLocalDeckDraft(
      [
        card({ folder: 'Verbs', jlptLevel: 'N3', bookTitle: 'Kino no Tabi', known: true, srs: srs() }),
        card({ id: 'fc-2', word: '走る', source: 'media', addedAt: ORIGIN + DAY_MS }),
      ],
      plain,
      { rootDeckName: 'Mine', nowMs: ORIGIN + 20 * DAY_MS },
    );

    expect(draft.source).toMatchObject({ kind: 'local-deck', label: 'Mine' });
    expect(draft.source.createdAtSec).toBe(ORIGIN / 1000);
    expect(draft.counts).toMatchObject({ notes: 2, cards: 2, noteTypes: 1 });
    expect(summary.scheduled).toBe(1);

    const first = draft.notes[0]!;
    expect(first.guid).toBe('fc-1');
    expect(first.tags).toEqual(['src::epub', 'jlpt::N3', 'book::Kino_no_Tabi', 'jp-study::known']);
    expect(first.fields.map((f) => f.name)).toEqual([...LOCAL_DECK_FIELD_NAMES]);
    expect(first.cardIds).toEqual(['fc-1-c0']);

    expect(draft.cards[0]).toMatchObject({ type: 'review', queue: 'review', interval: 4, easeFactor: 2500 });
    expect(draft.cards[1]).toMatchObject({ type: 'new', queue: 'new', easeFactor: 0 });
  });

  it('raises no blocking diagnostic on a healthy deck, and says the review log is absent', () => {
    const { draft } = buildLocalDeckDraft([card(), card({ id: 'fc-2', word: '犬' })], plain);
    expect(draft.diagnostics.filter((d) => d.severity === 'blocking')).toEqual([]);
    expect(draft.diagnostics.map((d) => d.code)).toContain('review-history-absent');
    expect(draft.reviews).toBeUndefined();
  });

  it('warns on a front/back-only card, whose sort field is empty', () => {
    const { draft } = buildLocalDeckDraft(
      [card({ id: 'fc-fb', word: '', reading: '', meaning: '', sentence: '', front: 'Q', back: 'A' })],
      plain,
    );
    const empty = draft.diagnostics.find((d) => d.code === 'empty-first-field');
    expect(empty).toMatchObject({ severity: 'warning', count: 1, samples: ['fc-fb'] });
    // The card is still fully present — the template renders it from Front.
    expect(draft.notes[0]!.fields[4]!.raw).toBe('Q');
  });

  it('flags two cards that somehow share an id as a duplicate guid', () => {
    const { draft } = buildLocalDeckDraft([card(), card({ meaning: 'a second one' })], plain);
    expect(draft.diagnostics.find((d) => d.code === 'duplicate-guid')).toMatchObject({ count: 1 });
  });
});
