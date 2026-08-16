import { describe, expect, it } from 'vitest';
import type {
  AnkiDraft,
  AnkiDraftMediaRef,
  AnkiDraftNote,
  RawAnkiCollection,
} from '../ankiDraft';
import { ANKI_FIELD_SEP, buildAnkiDraft } from '../ankiDraft';
import {
  MEDIA_HEALTHS,
  MEDIA_SIZE_CEILING,
  buildMediaHealthContext,
  emptyMediaHealthTally,
  mediaFileDefects,
  noteMediaHealth,
  parseMediaHealth,
  reclaimableMediaBytes,
  refMediaHealth,
  tallyMediaHealth,
  worstMediaHealth,
  type MediaHealth,
  type MediaHealthOptions,
} from '../ankiMediaHealth';

const FULL: MediaHealthOptions = { hasManifest: true, sized: true };

function ref(over: Partial<AnkiDraftMediaRef> = {}): AnkiDraftMediaRef {
  return {
    reference: 'a.mp3',
    fileName: 'a.mp3',
    kind: 'audio',
    fieldOrd: 0,
    present: true,
    bytes: 4096,
    ...over,
  };
}

function note(over: Partial<AnkiDraftNote> & { id: string }): AnkiDraftNote {
  return {
    guid: `g-${over.id}`,
    noteTypeId: 'basic',
    tags: [],
    marked: false,
    fields: [{ ord: 0, name: 'Front', raw: 'ねこ', normalized: 'ねこ' }],
    modifiedAtSec: 0,
    flags: 0,
    data: '',
    cardIds: [],
    media: [],
    ...over,
  };
}

describe('refMediaHealth', () => {
  it('passes a carried file of ordinary size', () => {
    expect(refMediaHealth(ref(), FULL)).toBe('ok');
  });

  it('reports a cited file the package does not carry as missing', () => {
    expect(refMediaHealth(ref({ present: false }), FULL)).toBe('missing');
  });

  it('reports a carried file of zero bytes as broken', () => {
    expect(refMediaHealth(ref({ bytes: 0 }), FULL)).toBe('broken');
  });

  it('reports a file over its kind ceiling as oversized', () => {
    expect(refMediaHealth(ref({ bytes: MEDIA_SIZE_CEILING.audio + 1 }), FULL)).toBe('oversized');
    // Exactly at the ceiling is not over it.
    expect(refMediaHealth(ref({ bytes: MEDIA_SIZE_CEILING.audio }), FULL)).toBe('ok');
  });

  it('applies a different ceiling per kind, so an image is judged as an image', () => {
    const bytes = MEDIA_SIZE_CEILING.image + 1;
    expect(refMediaHealth(ref({ kind: 'image', fileName: 'a.png', bytes }), FULL)).toBe('oversized');
    expect(refMediaHealth(ref({ kind: 'audio', bytes }), FULL)).toBe('ok');
  });

  it('honours an overridden ceiling', () => {
    const opts: MediaHealthOptions = { ...FULL, ceiling: { audio: 1024 } };
    expect(refMediaHealth(ref({ bytes: 2048 }), opts)).toBe('oversized');
  });

  it('reports a byte-identical copy as duplicate', () => {
    expect(refMediaHealth(ref({ fileName: 'b.mp3', duplicateOf: 'a.mp3' }), FULL)).toBe('duplicate');
  });

  it('ranks oversized above duplicate on the same file', () => {
    const big = ref({ fileName: 'b.mp3', duplicateOf: 'a.mp3', bytes: 9 * 1024 * 1024 });
    expect(refMediaHealth(big, FULL)).toBe('oversized');
  });

  it('cannot call anything missing when the source reported no manifest', () => {
    // The whole point: `present` is false for every reference in a manifest-less
    // draft, and reading that as absence would queue up the user's entire deck.
    const opts: MediaHealthOptions = { hasManifest: false, sized: false };
    expect(refMediaHealth(ref({ present: false, bytes: undefined }), opts)).toBe('unverified');
  });

  it('still answers missing when the manifest carries names but no sizes', () => {
    const opts: MediaHealthOptions = { hasManifest: true, sized: false };
    expect(refMediaHealth(ref({ present: false, bytes: undefined }), opts)).toBe('missing');
    expect(refMediaHealth(ref({ present: true, bytes: undefined }), opts)).toBe('unverified');
  });
});

describe('worstMediaHealth', () => {
  it('takes the worst reference on the note', () => {
    expect(worstMediaHealth(['ok', 'duplicate', 'missing', 'ok'])).toBe('missing');
    expect(worstMediaHealth(['ok', 'duplicate'])).toBe('duplicate');
  });

  it('is none when there is nothing to judge', () => {
    expect(worstMediaHealth([])).toBe('none');
    expect(worstMediaHealth(['none', 'none'])).toBe('none');
  });

  it('drops none rather than ranking it', () => {
    expect(worstMediaHealth(['none', 'ok'])).toBe('ok');
  });

  it('orders every verdict, healthiest first, with no gaps', () => {
    expect(MEDIA_HEALTHS).toEqual([
      'none',
      'ok',
      'unverified',
      'duplicate',
      'oversized',
      'broken',
      'missing',
    ]);
    for (let i = 1; i < MEDIA_HEALTHS.length; i += 1) {
      const pair = [MEDIA_HEALTHS[i - 1]!, MEDIA_HEALTHS[i]!];
      expect(worstMediaHealth(pair)).toBe(MEDIA_HEALTHS[i]);
    }
  });
});

describe('noteMediaHealth', () => {
  it('is none for a note that cites no media', () => {
    expect(noteMediaHealth(note({ id: '1' }), FULL)).toBe('none');
  });

  it('is the worst of the note’s references', () => {
    const n = note({
      id: '1',
      media: [ref(), ref({ fileName: 'b.png', kind: 'image', bytes: 0 })],
    });
    expect(noteMediaHealth(n, FULL)).toBe('broken');
  });
});

describe('parseMediaHealth', () => {
  it('accepts every verdict, case- and space-insensitively', () => {
    for (const health of MEDIA_HEALTHS) {
      expect(parseMediaHealth(` ${health.toUpperCase()} `)).toBe(health);
    }
  });

  it('refuses anything else', () => {
    expect(parseMediaHealth('huge')).toBeNull();
    expect(parseMediaHealth('')).toBeNull();
  });
});

describe('tallyMediaHealth', () => {
  it('counts each verdict and sums to the input length', () => {
    const healths: MediaHealth[] = ['ok', 'ok', 'missing', 'none', 'duplicate'];
    const tally = tallyMediaHealth(healths);
    expect(tally).toEqual({ ...emptyMediaHealthTally(), ok: 2, missing: 1, none: 1, duplicate: 1 });
    expect(Object.values(tally).reduce((a, b) => a + b, 0)).toBe(healths.length);
  });
});

// ----- through the builder, which is where the facts actually come from --------

function rawWith(
  fields: readonly string[][],
  media: Pick<RawAnkiCollection, 'mediaFiles' | 'mediaEntries'>,
): RawAnkiCollection {
  return {
    col: { ver: 11, crt: 0, mod: 0 },
    notes: fields.map((parts, i) => ({
      id: String(100 + i),
      guid: `g${i}`,
      mid: '1',
      flds: parts.join(ANKI_FIELD_SEP),
    })),
    cards: fields.map((_, i) => ({ id: String(200 + i), nid: String(100 + i), did: '1', ord: 0 })),
    decks: [{ id: '1', name: 'Deck' }],
    noteTypes: [
      {
        id: '1',
        name: 'Basic',
        fields: [{ name: 'Front', ord: 0 }],
        templates: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{Front}}' }],
      },
    ],
    revlog: [],
    ...media,
  };
}

function draftOf(raw: RawAnkiCollection): AnkiDraft {
  return buildAnkiDraft(raw, {
    source: { kind: 'apkg', label: 'test.apkg' },
    normalize: (v) => v.replace(/<[^>]*>/g, '').trim(),
  });
}

describe('buildAnkiDraft media facts', () => {
  it('attaches size and duplicate group to each reference', () => {
    const draft = draftOf(
      rawWith(
        [['[sound:a.mp3]'], ['[sound:b.mp3]'], ['<img src="big.png">']],
        {
          mediaEntries: [
            { name: 'a.mp3', bytes: 4096, crc32: 111 },
            { name: 'b.mp3', bytes: 4096, crc32: 111 },
            { name: 'big.png', bytes: 4 * 1024 * 1024, crc32: 222 },
          ],
        },
      ),
    );
    const context = buildMediaHealthContext(draft);
    expect(context.get('100')).toBe('ok');
    expect(context.get('101')).toBe('duplicate');
    expect(context.get('102')).toBe('oversized');
    expect(draft.notes[1]!.media[0]!.duplicateOf).toBe('a.mp3');
    // The canonical copy is left unflagged: it is the one Anki would keep.
    expect(draft.notes[0]!.media[0]!.duplicateOf).toBeUndefined();
    expect(draft.media).toEqual({ files: 3, bytes: 4096 + 4096 + 4 * 1024 * 1024, unreferenced: 0, sized: true });
  });

  it('never groups by size alone', () => {
    const draft = draftOf(
      rawWith([['[sound:a.mp3]'], ['[sound:b.mp3]']], {
        mediaEntries: [
          { name: 'a.mp3', bytes: 4096, crc32: 111 },
          { name: 'b.mp3', bytes: 4096, crc32: 999 },
        ],
      }),
    );
    expect(buildMediaHealthContext(draft).get('101')).toBe('ok');
  });

  it('cannot group at all without a checksum', () => {
    const draft = draftOf(
      rawWith([['[sound:a.mp3]'], ['[sound:b.mp3]']], {
        mediaEntries: [
          { name: 'a.mp3', bytes: 4096 },
          { name: 'b.mp3', bytes: 4096 },
        ],
      }),
    );
    expect(buildMediaHealthContext(draft).get('101')).toBe('ok');
  });

  it('counts carried files no note cites', () => {
    const draft = draftOf(
      rawWith([['[sound:a.mp3]']], {
        mediaEntries: [
          { name: 'a.mp3', bytes: 10, crc32: 1 },
          { name: 'orphan.mp3', bytes: 20, crc32: 2 },
        ],
      }),
    );
    expect(draft.media?.unreferenced).toBe(1);
    expect(draft.counts.mediaReferences).toBe(1);
  });

  it('never calls a note type’s own asset unused', () => {
    // Anki reserves the `_` prefix for template media and its Check Media never
    // lists them; all 7 uncited files in New_HSK_30…with_drawing.apkg are these.
    const draft = draftOf(
      rawWith([['[sound:a.mp3]']], {
        mediaEntries: [
          { name: 'a.mp3', bytes: 10, crc32: 1 },
          { name: '_youdao.png', bytes: 20, crc32: 2 },
        ],
      }),
    );
    expect(draft.media?.unreferenced).toBe(0);
    expect(draft.media?.files).toBe(2);
  });

  it('a cited file the folder lacks never reduces the unreferenced count', () => {
    const draft = draftOf(
      rawWith([['[sound:gone.mp3]']], { mediaEntries: [{ name: 'a.mp3', bytes: 10, crc32: 1 }] }),
    );
    expect(draft.media).toEqual({ files: 1, bytes: 10, unreferenced: 1, sized: true });
    expect(buildMediaHealthContext(draft).get('100')).toBe('missing');
  });

  it('a names-only manifest sizes nothing and still finds the missing file', () => {
    const draft = draftOf(
      rawWith([['[sound:a.mp3]'], ['[sound:gone.mp3]']], { mediaFiles: ['a.mp3'] }),
    );
    expect(draft.media).toEqual({ files: 1, bytes: undefined, unreferenced: 0, sized: false });
    const context = buildMediaHealthContext(draft);
    expect(context.get('100')).toBe('unverified');
    expect(context.get('101')).toBe('missing');
  });

  it('reports nothing at all when the source had no manifest', () => {
    const draft = draftOf(rawWith([['[sound:a.mp3]']], {}));
    expect(draft.media).toBeUndefined();
    expect(buildMediaHealthContext(draft).get('100')).toBe('unverified');
  });

  it('survives a page: the summary is package-level, not per-note', () => {
    const draft = draftOf(
      rawWith([['[sound:a.mp3]'], ['[sound:b.mp3]']], {
        mediaEntries: [
          { name: 'a.mp3', bytes: 1, crc32: 1 },
          { name: 'b.mp3', bytes: 2, crc32: 2 },
        ],
      }),
    );
    expect(draft.media?.files).toBe(2);
  });
});

describe('mediaFileDefects', () => {
  it('counts one absent file once, however many notes cite it', () => {
    // The real shape: HSK_30…Simplified_Characters.apkg is 11,084 affected
    // notes and exactly one file to go and find.
    const draft = draftOf(
      rawWith(
        [['[sound:gone.mp3]'], ['[sound:gone.mp3]'], ['[sound:gone.mp3]']],
        { mediaEntries: [{ name: 'a.mp3', bytes: 10, crc32: 1 }] },
      ),
    );
    const defects = mediaFileDefects(draft);
    expect(defects).toHaveLength(1);
    expect(defects[0]).toMatchObject({ fileName: 'gone.mp3', health: 'missing', notes: 3 });
  });

  it('leaves healthy files out entirely', () => {
    const draft = draftOf(
      rawWith([['[sound:a.mp3]']], { mediaEntries: [{ name: 'a.mp3', bytes: 10, crc32: 1 }] }),
    );
    expect(mediaFileDefects(draft)).toEqual([]);
  });

  it('sorts worst verdict first, then by cost', () => {
    const draft = draftOf(
      rawWith(
        [
          ['[sound:gone.mp3]'],
          ['<img src="huge.png">'],
          ['[sound:copy.mp3]'],
          ['[sound:zero.mp3]'],
        ],
        {
          mediaEntries: [
            { name: 'orig.mp3', bytes: 300, crc32: 5 },
            { name: 'copy.mp3', bytes: 300, crc32: 5 },
            { name: 'zero.mp3', bytes: 0, crc32: 6 },
            { name: 'huge.png', bytes: MEDIA_SIZE_CEILING.image + 1, crc32: 7 },
          ],
        },
      ),
    );
    expect(mediaFileDefects(draft).map((d) => `${d.health}:${d.fileName}`)).toEqual([
      'missing:gone.mp3',
      'broken:zero.mp3',
      'oversized:huge.png',
      'duplicate:copy.mp3',
    ]);
  });

  it('counts a note citing the same file twice as one affected note', () => {
    const draft = draftOf(
      rawWith([['[sound:gone.mp3] and again <img src="gone.mp3">']], {
        mediaEntries: [{ name: 'a.mp3', bytes: 1, crc32: 1 }],
      }),
    );
    expect(mediaFileDefects(draft)[0]?.notes).toBe(1);
  });
});

describe('reclaimableMediaBytes', () => {
  it('counts each duplicated copy once, whatever cites it', () => {
    const draft = draftOf(
      rawWith(
        [['[sound:a.mp3]'], ['[sound:b.mp3]'], ['[sound:b.mp3]'], ['[sound:c.mp3]']],
        {
          mediaEntries: [
            { name: 'a.mp3', bytes: 1000, crc32: 7 },
            { name: 'b.mp3', bytes: 1000, crc32: 7 },
            { name: 'c.mp3', bytes: 1000, crc32: 7 },
          ],
        },
      ),
    );
    expect(reclaimableMediaBytes(draft)).toBe(2000);
  });

  it('refuses to guess when nothing was sized', () => {
    expect(reclaimableMediaBytes(draftOf(rawWith([['[sound:a.mp3]']], { mediaFiles: ['a.mp3'] })))).toBeUndefined();
  });
});
