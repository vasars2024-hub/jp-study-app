import { describe, it, expect } from 'vitest';
import {
  ANKI_DRAFT_VERSION,
  ANKI_FIELD_SEP as SEP,
  MAX_DIAGNOSTIC_SAMPLES,
  buildAnkiDraft,
  decodeCardFlag,
  decodeCardQueue,
  decodeCardType,
  deckPath,
  draftIsBlocked,
  pageAnkiDraft,
  mediaRefsInField,
  type AnkiDraftDiagnosticCode,
  type AnkiDraftSource,
  type RawAnkiCollection,
} from '../ankiDraft';
import { stripFieldHtml } from '../apkgParse';

const source: AnkiDraftSource = {
  kind: 'apkg',
  label: 'Core 2k.apkg',
  schemaVersion: 18,
  createdAtSec: 1_500_000_000,
  fingerprint: 'sha1:test',
};

const build = (raw: RawAnkiCollection) =>
  buildAnkiDraft(raw, { source, normalize: stripFieldHtml });

/** A two-note-type, two-template, mixed-language collection with real scheduling. */
function fixture(): RawAnkiCollection {
  return {
    col: { ver: 18, crt: 1_500_000_000, mod: 1_700_000_000_000 },
    decks: [
      { id: 1, name: 'Japanese', dyn: 0, conf: 1 },
      { id: 2, name: 'Japanese::Core::Verbs', dyn: 0, conf: 1 },
      { id: 3, name: 'Custom Study Session', dyn: 1 },
    ],
    noteTypes: [
      {
        id: 100,
        name: 'Japanese (recognition + production)',
        type: 0,
        css: '.card { font-size: 20px; }',
        sortf: 0,
        fields: [
          { ord: 0, name: 'Expression', sticky: false, rtl: false, font: 'Arial', size: 20 },
          { ord: 1, name: 'Reading' },
          { ord: 2, name: 'English' },
          { ord: 3, name: 'Русский' },
        ],
        templates: [
          { ord: 0, name: 'Recognition', qfmt: '{{Expression}}', afmt: '{{Reading}}<br>{{English}}' },
          { ord: 1, name: 'Production', qfmt: '{{English}}', afmt: '{{Expression}}', bqfmt: '{{English}}', did: 2 },
        ],
      },
      {
        id: 200,
        name: 'Cloze',
        type: 1,
        css: '',
        sortf: 0,
        fields: [{ ord: 0, name: 'Text' }, { ord: 1, name: 'Extra' }],
        templates: [{ ord: 0, name: 'Cloze', qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}' }],
      },
    ],
    notes: [
      {
        id: 1001,
        guid: 'aaaa',
        mid: 100,
        mod: 1_690_000_000,
        tags: 'core verb marked',
        flds: ['食べる', 'たべる', 'to eat', 'есть'].join(SEP),
        flags: 0,
        data: '',
      },
      {
        id: 1002,
        guid: 'bbbb',
        mid: 200,
        mod: 1_690_000_100,
        tags: '',
        flds: ['彼は{{c1::毎日}}走る', '<img src="run.png"> [sound:run.mp3]'].join(SEP),
      },
    ],
    cards: [
      { id: 5001, nid: 1001, did: 2, ord: 0, type: 2, queue: 2, due: 400, ivl: 21, factor: 2500, reps: 9, lapses: 1, left: 0, flags: 1, mod: 1_690_000_000 },
      { id: 5002, nid: 1001, did: 2, ord: 1, type: 0, queue: -1, due: 3, ivl: 0, factor: 0, reps: 0, lapses: 0, left: 0, flags: 0, mod: 1_690_000_000 },
      { id: 5003, nid: 1002, did: 3, ord: 0, type: 2, queue: 2, due: 10, ivl: 5, factor: 2300, reps: 3, lapses: 0, left: 0, odue: 405, odid: 1, flags: 0, mod: 1_690_000_100 },
    ],
    revlog: [
      { id: 1_690_000_000_000, cid: 5001, ease: 3, ivl: 21, lastIvl: 10, factor: 2500, time: 4200, type: 1 },
    ],
    mediaFiles: ['run.png'],
  };
}

const codes = (draft: ReturnType<typeof build>): AnkiDraftDiagnosticCode[] =>
  draft.diagnostics.map((d) => d.code);

describe('enum decoding', () => {
  it('decodes every card type and falls back to unknown', () => {
    expect([0, 1, 2, 3].map(decodeCardType)).toEqual(['new', 'learning', 'review', 'relearning']);
    expect(decodeCardType(9)).toBe('unknown');
    expect(decodeCardType(undefined)).toBe('unknown');
  });

  it('decodes the negative queues, which an array lookup would miss', () => {
    expect(decodeCardQueue(-1)).toBe('suspended');
    expect(decodeCardQueue(-2)).toBe('buried-sibling');
    expect(decodeCardQueue(-3)).toBe('buried-user');
    expect(decodeCardQueue(0)).toBe('new');
    expect(decodeCardQueue(4)).toBe('preview');
    expect(decodeCardQueue(77)).toBe('unknown');
  });

  it('reads the flag out of the low three bits and ignores reserved ones', () => {
    expect(decodeCardFlag(0)).toBe('none');
    expect(decodeCardFlag(7)).toBe('purple');
    // Anki stores other state in the high bits; a red flag stays red.
    expect(decodeCardFlag(0b1000_0001)).toBe('red');
  });
});

describe('deckPath', () => {
  it('splits both separators the two schemas use', () => {
    expect(deckPath('Japanese::Core::Verbs')).toEqual(['Japanese', 'Core', 'Verbs']);
    expect(deckPath('Japanese\x1fCore')).toEqual(['Japanese', 'Core']);
    expect(deckPath('')).toEqual([]);
  });
});

describe('mediaRefsInField', () => {
  const present = (name: string) => name === 'a.png';

  it('finds image, sound and source references with their field ord', () => {
    const refs = mediaRefsInField(
      '<img src="a.png"> [sound:b.mp3] <source src=\'c.webm\'>',
      2,
      present,
    );
    expect(refs.map((r) => [r.fileName, r.kind, r.fieldOrd, r.present])).toEqual([
      ['a.png', 'image', 2, true],
      ['c.webm', 'unknown', 2, false],
      ['b.mp3', 'audio', 2, false],
    ]);
  });

  it('keeps a subdirectory reference but keys presence on the leaf name', () => {
    const [ref] = mediaRefsInField('<img src="sub/a.png">', 0, present);
    expect(ref.reference).toBe('sub/a.png');
    expect(ref.fileName).toBe('a.png');
    expect(ref.present).toBe(true);
  });

  it('ignores remote and data references, which cannot be missing from a package', () => {
    expect(mediaRefsInField('<img src="https://x/y.png"><img src="data:image/png;base64,AA">', 0, present))
      .toEqual([]);
  });

  it('reports one entry per distinct reference in a field', () => {
    expect(mediaRefsInField('<img src="a.png"><img src="a.png">', 0, present)).toHaveLength(1);
  });
});

describe('buildAnkiDraft', () => {
  it('stamps the frozen version and carries the source through', () => {
    const draft = build(fixture());
    expect(draft.version).toBe(ANKI_DRAFT_VERSION);
    expect(draft.source).toEqual(source);
  });

  it('preserves every field with its name, raw value and normalized value', () => {
    const note = build(fixture()).notes[0];
    expect(note.fields.map((f) => f.name)).toEqual(['Expression', 'Reading', 'English', 'Русский']);
    expect(note.fields.map((f) => f.raw)).toEqual(['食べる', 'たべる', 'to eat', 'есть']);
    // A fourth language field survives, where the simplified importer keeps four roles only.
    expect(note.fields[3].normalized).toBe('есть');
  });

  it('keeps cloze markup raw and strips it only for the searchable value', () => {
    const note = build(fixture()).notes[1];
    expect(note.fields[0].raw).toBe('彼は{{c1::毎日}}走る');
    expect(note.fields[0].normalized).toBe('彼は毎日走る');
    expect(build(fixture()).noteTypes[1].kind).toBe('cloze');
  });

  it('splits the marked tag out of the tag list', () => {
    const note = build(fixture()).notes[0];
    expect(note.tags).toEqual(['core', 'verb']);
    expect(note.marked).toBe(true);
    expect(build(fixture()).notes[1].marked).toBe(false);
  });

  it('links each note to its cards in ord order', () => {
    const draft = build(fixture());
    expect(draft.notes[0].cardIds).toEqual(['5001', '5002']);
    expect(draft.notes[1].cardIds).toEqual(['5003']);
  });

  it('preserves scheduling verbatim rather than converting due', () => {
    const [review, suspended] = build(fixture()).cards;
    expect(review).toMatchObject({
      type: 'review',
      queue: 'review',
      due: 400,
      interval: 21,
      easeFactor: 2500,
      reps: 9,
      lapses: 1,
      flag: 'red',
    });
    expect(suspended.queue).toBe('suspended');
    expect(suspended.type).toBe('new');
  });

  it('reports a filtered deck and the loan state of the card inside it', () => {
    const draft = build(fixture());
    expect(draft.decks[2].filtered).toBe(true);
    const loaned = draft.cards[2];
    expect(loaned.originalDue).toBe(405);
    expect(loaned.originalDeckId).toBe('1');
    expect(codes(draft)).toContain('filtered-deck');
  });

  it('treats Anki 0 as "not on loan", not as deck zero', () => {
    const draft = build(fixture());
    expect(draft.cards[0].originalDue).toBeUndefined();
    expect(draft.cards[0].originalDeckId).toBeUndefined();
  });

  it('resolves deck parents across the hierarchy', () => {
    const draft = build(fixture());
    expect(draft.decks[1].path).toEqual(['Japanese', 'Core', 'Verbs']);
    // 'Japanese::Core' does not exist as a row, so the parent is honestly absent.
    expect(draft.decks[1].parentId).toBeUndefined();
    expect(draft.decks[0].parentId).toBeUndefined();
  });

  it('keeps templates ordered with their browser overrides and deck override', () => {
    const [standard] = build(fixture()).noteTypes;
    expect(standard.templates.map((t) => t.name)).toEqual(['Recognition', 'Production']);
    expect(standard.templates[1].bqfmt).toBe('{{English}}');
    expect(standard.templates[1].deckOverrideId).toBe('2');
    expect(standard.templates[0].bqfmt).toBe('');
  });

  it('sorts fields and templates by ord even when the rows arrive shuffled', () => {
    const raw = fixture();
    raw.noteTypes[0].fields.reverse();
    raw.noteTypes[0].templates.reverse();
    const [standard] = build(raw).noteTypes;
    expect(standard.fields.map((f) => f.ord)).toEqual([0, 1, 2, 3]);
    expect(standard.templates.map((t) => t.ord)).toEqual([0, 1]);
  });

  it('reads the review log without relabelling ease', () => {
    const draft = build(fixture());
    expect(draft.reviews).toEqual([
      {
        cardId: '5001',
        reviewedAtMs: 1_690_000_000_000,
        ease: 3,
        interval: 21,
        lastInterval: 10,
        easeFactor: 2500,
        tookMs: 4200,
        kind: 1,
      },
    ]);
    expect(codes(draft)).not.toContain('review-history-absent');
  });

  it('distinguishes an absent review log from an empty one', () => {
    const raw = fixture();
    delete raw.revlog;
    const absent = build(raw);
    expect(absent.reviews).toBeUndefined();
    expect(codes(absent)).toContain('review-history-absent');

    const empty = build({ ...fixture(), revlog: [] });
    expect(empty.reviews).toEqual([]);
    expect(codes(empty)).not.toContain('review-history-absent');
  });

  it('counts distinct media references and flags the missing one', () => {
    const draft = build(fixture());
    expect(draft.counts.mediaReferences).toBe(2);
    const missing = draft.diagnostics.find((d) => d.code === 'missing-media');
    expect(missing).toMatchObject({ severity: 'warning', count: 1, samples: ['run.mp3'] });
  });

  it('does not claim media is missing when the source carries no manifest', () => {
    const raw = fixture();
    delete raw.mediaFiles;
    expect(codes(build(raw))).not.toContain('missing-media');
  });

  it('blocks on an unknown note type and still keeps the fields', () => {
    const raw = fixture();
    raw.notes[0].mid = 999;
    const draft = build(raw);
    expect(codes(draft)).toContain('unknown-note-type');
    expect(draftIsBlocked(draft)).toBe(true);
    // Names are unavailable, values are not lost.
    expect(draft.notes[0].fields.map((f) => f.name)).toEqual([
      'field 1', 'field 2', 'field 3', 'field 4',
    ]);
    expect(draft.notes[0].fields[0].raw).toBe('食べる');
  });

  it('blocks on a field-count mismatch, which would write into the wrong field', () => {
    const raw = fixture();
    raw.notes[0].flds = ['食べる', 'たべる'].join(SEP);
    const draft = build(raw);
    expect(codes(draft)).toContain('field-count-mismatch');
    expect(draftIsBlocked(draft)).toBe(true);
  });

  it('reports orphan cards, missing decks, duplicate guids and empty first fields', () => {
    const raw = fixture();
    raw.cards.push({ id: 5004, nid: 9999, did: 4242, ord: 0 });
    raw.notes[1].guid = 'aaaa';
    raw.notes[1].flds = ['', 'extra'].join(SEP);
    const draft = build(raw);
    expect(codes(draft)).toEqual(
      expect.arrayContaining(['orphan-card', 'missing-deck', 'duplicate-guid', 'empty-first-field']),
    );
    expect(draftIsBlocked(draft)).toBe(false);
  });

  it('reports a note whose cards were all deleted', () => {
    const raw = fixture();
    raw.cards = raw.cards.filter((c) => String(c.nid) !== '1002');
    const draft = build(raw);
    const found = draft.diagnostics.find((d) => d.code === 'note-without-cards');
    expect(found).toMatchObject({ severity: 'info', count: 1, samples: ['1002'] });
    expect(draft.notes[1].cardIds).toEqual([]);
  });

  it('caps diagnostic samples so a broken deck cannot inflate the draft', () => {
    const raw = fixture();
    raw.cards = Array.from({ length: 40 }, (_, i) => ({ id: 6000 + i, nid: 9999, did: 2, ord: 0 }));
    const orphan = build(raw).diagnostics.find((d) => d.code === 'orphan-card');
    expect(orphan?.count).toBe(40);
    expect(orphan?.samples).toHaveLength(MAX_DIAGNOSTIC_SAMPLES);
  });

  it('counts everything it read', () => {
    expect(build(fixture()).counts).toEqual({
      notes: 2,
      cards: 3,
      decks: 3,
      noteTypes: 2,
      reviews: 1,
      mediaReferences: 2,
    });
  });

  it('is total: an empty collection builds rather than throwing', () => {
    const draft = build({ notes: [], cards: [], decks: [], noteTypes: [] });
    expect(draft.counts.notes).toBe(0);
    expect(draftIsBlocked(draft)).toBe(false);
  });
});

describe('pageAnkiDraft', () => {
  const many = () => {
    const raw = fixture();
    raw.notes = Array.from({ length: 10 }, (_, i) => ({
      id: 2000 + i,
      guid: `g${i}`,
      mid: 200,
      flds: [`note ${i}`, ''].join(SEP),
    }));
    raw.cards = raw.notes.map((n, i) => ({ id: 7000 + i, nid: n.id, did: 2, ord: 0 }));
    return build(raw);
  };

  it('windows notes and narrows cards to the notes on the page', () => {
    const page = pageAnkiDraft(many(), 3, 4);
    expect(page.notes.map((n) => n.id)).toEqual(['2003', '2004', '2005', '2006']);
    expect(page.cards.map((c) => c.id)).toEqual(['7003', '7004', '7005', '7006']);
  });

  it('keeps the header and whole-collection counts, so the deck reports one size', () => {
    const full = many();
    const page = pageAnkiDraft(full, 5, 2);
    expect(page.counts).toEqual(full.counts);
    expect(page.decks).toEqual(full.decks);
    expect(page.noteTypes).toEqual(full.noteTypes);
    expect(page.diagnostics).toEqual(full.diagnostics);
    expect(page.source).toEqual(full.source);
  });

  it('empties the review log on a page but keeps absent absent', () => {
    expect(pageAnkiDraft(many(), 0, 2).reviews).toEqual([]);
    const raw = fixture();
    delete raw.revlog;
    expect(pageAnkiDraft(build(raw), 0, 2).reviews).toBeUndefined();
  });

  it('clamps a hostile offset and limit rather than allocating on them', () => {
    expect(pageAnkiDraft(many(), -5, 2).notes.map((n) => n.id)).toEqual(['2000', '2001']);
    expect(pageAnkiDraft(many(), 0, 0).notes).toHaveLength(1);
    expect(pageAnkiDraft(many(), 0, 1e9).notes).toHaveLength(10);
    expect(pageAnkiDraft(many(), 999, 10).notes).toEqual([]);
  });
});
