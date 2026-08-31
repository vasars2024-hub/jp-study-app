import { describe, expect, it } from 'vitest';
import {
  FILES_ITEM_KINDS,
  FILES_LEAF_IDS,
  FILES_TREE,
  categoryContains,
  categoryForKind,
  categoryNode,
  countByCategory,
  deleteModeFor,
  isFilesCategoryId,
  isMachineDerived,
  leavesOf,
  matchesQuery,
  revealTargetFor,
  sortItems,
  type FilesItem,
  type FilesItemKind,
  type FilesLocation,
} from '../filesApp/catalog';

function item(over: Partial<FilesItem> & Pick<FilesItem, 'id'>): FilesItem {
  const kind = over.kind ?? 'video';
  return {
    name: over.id,
    kind,
    categoryId: over.categoryId ?? categoryForKind(kind),
    provenance: 'unknown',
    sizeBytes: null,
    createdAt: null,
    modifiedAt: null,
    lastUsedAt: null,
    location: { store: 'derived', describes: 'test' },
    flags: {},
    source: 'test',
    ...over,
  };
}

describe('files app catalogue — the tree', () => {
  it('every leaf hangs off a declared group and every group has leaves', () => {
    for (const node of FILES_TREE) {
      if (node.isLeaf) {
        expect(node.parent).not.toBeNull();
        expect(categoryNode(node.parent as string)).not.toBeNull();
      } else {
        expect(node.parent).toBeNull();
        expect(leavesOf(node.id).length).toBeGreaterThan(0);
      }
    }
  });

  it('covers all five groups the plan names', () => {
    const groups = FILES_TREE.filter((n) => !n.isLeaf).map((n) => n.id);
    expect(groups).toEqual(['sources', 'outputs', 'reference', 'system', 'workspaces']);
  });

  it('every kind places into a real leaf — categorisation is derived, not chosen', () => {
    for (const kind of FILES_ITEM_KINDS) {
      const leafId = categoryForKind(kind as FilesItemKind);
      expect(FILES_LEAF_IDS).toContain(leafId);
      expect(categoryNode(leafId)?.isLeaf).toBe(true);
    }
  });

  it('every declared leaf is reachable from some kind, so no category is unfillable', () => {
    const reachable = new Set(FILES_ITEM_KINDS.map((k) => categoryForKind(k as FilesItemKind)));
    for (const leafId of FILES_LEAF_IDS) {
      expect(reachable.has(leafId)).toBe(true);
    }
  });

  it('rejects ids that are not in the tree', () => {
    expect(isFilesCategoryId('sources/video')).toBe(true);
    expect(isFilesCategoryId('sources')).toBe(true);
    expect(isFilesCategoryId('sources/nope')).toBe(false);
    expect(isFilesCategoryId(7)).toBe(false);
  });

  it('a group contains its own leaves and nothing else', () => {
    expect(categoryContains('sources', 'sources/video')).toBe(true);
    expect(categoryContains('sources', 'outputs/decks')).toBe(false);
    expect(categoryContains('sources/video', 'sources/video')).toBe(true);
    expect(categoryContains('sources/video', 'sources/audio')).toBe(false);
  });
});

describe('files app catalogue — counting (gate 1)', () => {
  it('a group total is exactly the sum of its leaves', () => {
    const counts = countByCategory([
      item({ id: 'a', kind: 'video' }),
      item({ id: 'b', kind: 'video' }),
      item({ id: 'c', kind: 'audio' }),
      item({ id: 'd', kind: 'dictionary' }),
    ]);
    const by = new Map(counts.map((c) => [c.categoryId, c]));
    expect(by.get('sources/video')?.total).toBe(2);
    expect(by.get('sources/audio')?.total).toBe(1);
    expect(by.get('sources')?.total).toBe(3);
    expect(by.get('reference')?.total).toBe(1);
    expect(by.get('outputs')?.total).toBe(0);
  });

  it('reports empty categories as 0 rather than omitting them', () => {
    const counts = countByCategory([]);
    expect(counts.length).toBe(FILES_TREE.length);
    expect(counts.every((c) => c.total === 0)).toBe(true);
  });

  it('a group never carries items of its own', () => {
    const counts = countByCategory([item({ id: 'a', kind: 'video' })]);
    for (const c of counts) {
      if (!categoryNode(c.categoryId)?.isLeaf) expect(c.own).toBe(0);
    }
  });
});

describe('files app catalogue — locations', () => {
  const file: FilesLocation = { store: 'file', path: 'C:\\media\\ep1.mkv' };
  const row: FilesLocation = { store: 'sqlite', database: 'dict.db', table: 'dictionaries', rowId: '4' };
  const derived: FilesLocation = { store: 'derived', describes: 'system memory' };

  it('only a file-backed item can be revealed (gate 12)', () => {
    expect(revealTargetFor(file)).toBe('C:\\media\\ep1.mkv');
    expect(revealTargetFor(row)).toBeNull();
    expect(revealTargetFor(derived)).toBeNull();
    expect(revealTargetFor({ store: 'localStorage', key: 'deck' })).toBeNull();
    expect(revealTargetFor({ store: 'json', file: 'library.json', pointer: '/items/2' })).toBeNull();
  });

  it('delete mode follows the store, so a file never takes the soft path (gate 21)', () => {
    expect(deleteModeFor(file)).toBe('trash');
    expect(deleteModeFor(row)).toBe('soft');
    expect(deleteModeFor({ store: 'localStorage', key: 'deck' })).toBe('soft');
    expect(deleteModeFor({ store: 'json', file: 'library.json', pointer: '/x' })).toBe('soft');
    expect(deleteModeFor(derived)).toBe('none');
  });
});

describe('files app catalogue — sorting (gate 14)', () => {
  const set = [
    item({ id: 'big', name: 'big', sizeBytes: 900, createdAt: 300 }),
    item({ id: 'mid', name: 'mid', sizeBytes: 50, createdAt: 100 }),
    item({ id: 'nosize', name: 'nosize', sizeBytes: null, createdAt: null }),
    item({ id: 'small', name: 'small', sizeBytes: 5, createdAt: 200 }),
  ];

  it('sorts by size ascending and descending', () => {
    expect(sortItems(set, 'size', 'asc').map((i) => i.id)).toEqual(['small', 'mid', 'big', 'nosize']);
    expect(sortItems(set, 'size', 'desc').map((i) => i.id)).toEqual(['big', 'mid', 'small', 'nosize']);
  });

  it('sorts by date created in both directions', () => {
    expect(sortItems(set, 'created', 'asc').map((i) => i.id)).toEqual(['mid', 'small', 'big', 'nosize']);
    expect(sortItems(set, 'created', 'desc').map((i) => i.id)).toEqual(['big', 'small', 'mid', 'nosize']);
  });

  it('items with no value sort LAST in both directions rather than arbitrarily', () => {
    expect(sortItems(set, 'size', 'asc').at(-1)?.id).toBe('nosize');
    expect(sortItems(set, 'size', 'desc').at(-1)?.id).toBe('nosize');
  });

  it('is a total order — equal values fall back to name then id', () => {
    const ties = [
      item({ id: 'z2', name: 'same', sizeBytes: 10 }),
      item({ id: 'z1', name: 'same', sizeBytes: 10 }),
    ];
    expect(sortItems(ties, 'size', 'asc').map((i) => i.id)).toEqual(['z1', 'z2']);
    expect(sortItems(ties, 'size', 'desc').map((i) => i.id)).toEqual(['z1', 'z2']);
  });

  it('does not mutate its input', () => {
    const before = set.map((i) => i.id);
    sortItems(set, 'size', 'desc');
    expect(set.map((i) => i.id)).toEqual(before);
  });

  it('sorts names naturally, so episode 10 follows episode 9', () => {
    const eps = [
      item({ id: 'e10', name: 'Episode 10' }),
      item({ id: 'e9', name: 'Episode 9' }),
      item({ id: 'e1', name: 'Episode 1' }),
    ];
    expect(sortItems(eps, 'name', 'asc').map((i) => i.id)).toEqual(['e1', 'e9', 'e10']);
  });
});

describe('files app catalogue — search and provenance', () => {
  const v = item({ id: 'v', name: 'Bakemonogatari 01', kind: 'video', provenance: 'human-subs' });

  it('matches name, kind and provenance', () => {
    expect(matchesQuery(v, 'bakemono')).toBe(true);
    expect(matchesQuery(v, 'video')).toBe(true);
    expect(matchesQuery(v, 'human')).toBe(true);
    expect(matchesQuery(v, 'zzz')).toBe(false);
  });

  it('an empty query matches everything', () => {
    expect(matchesQuery(v, '')).toBe(true);
    expect(matchesQuery(v, '   ')).toBe(true);
  });

  it('marks exactly the machine-produced provenances', () => {
    expect(isMachineDerived('auto-captions')).toBe(true);
    expect(isMachineDerived('whisper-transcript')).toBe(true);
    expect(isMachineDerived('human-subs')).toBe(false);
    expect(isMachineDerived('book-text')).toBe(false);
  });
});

/**
 * Gate 2 — "findable in the Files app WITHOUT navigating to that video".
 *
 * The title below is the real one on this profile, read out of
 * `yt-playlists.json` by the census on 2026-08-31. It is used verbatim because
 * a fixture title invented in ASCII cannot exercise the thing that actually
 * breaks Japanese search.
 */
describe('files app catalogue — a transcript is findable by search (gate 2)', () => {
  const TITLE =
    '日本語の歴史が生んだ奇跡。「パリパリ」がオノマトペだと断定できるのはなぜ？【オノマトペ3】#286';

  function transcript(name = TITLE): FilesItem {
    return {
      id: 'transcripts:B73sEyA0wbs',
      name,
      kind: 'transcript',
      categoryId: 'sources/text',
      provenance: 'whisper-transcript',
      sizeBytes: 4096,
      createdAt: 1000,
      modifiedAt: null,
      lastUsedAt: null,
      location: { store: 'file', path: 'yt-transcripts/B73sEyA0wbs.json' },
      flags: {},
      source: 'transcripts',
    };
  }

  it('finds it by a word from its title', () => {
    expect(matchesQuery(transcript(), 'オノマトペ')).toBe(true);
    expect(matchesQuery(transcript(), '日本語の歴史')).toBe(true);
  });

  it('finds it by kind and by provenance, which is how the tree is browsed', () => {
    expect(matchesQuery(transcript(), 'transcript')).toBe(true);
    expect(matchesQuery(transcript(), 'whisper')).toBe(true);
  });

  it('finds it when the query is typed in the other kana, or at the other width', () => {
    // A user who knows the reading types hiragana; the title is katakana.
    expect(matchesQuery(transcript(), 'おのまとぺ')).toBe(true);
    // A Japanese IME emits full-width digits. NFKC folds them both ways.
    expect(matchesQuery(transcript(), '２８６')).toBe(true);
    expect(matchesQuery(transcript(), '286')).toBe(true);
    // Half-width katakana still arrives from some subtitle sources.
    expect(matchesQuery(transcript(), 'ｵﾉﾏﾄﾍﾟ')).toBe(true);
  });

  it('does NOT match a word the title does not contain', () => {
    // Negative control. Without it, a fold broad enough to match everything
    // would pass every assertion above while making search useless.
    expect(matchesQuery(transcript(), '猫')).toBe(false);
    expect(matchesQuery(transcript(), 'ドキュメンタリー')).toBe(false);
    // A different kind and a different provenance must both miss.
    expect(matchesQuery(transcript(), 'dictionary')).toBe(false);
    expect(matchesQuery(transcript(), 'human-subs')).toBe(false);
  });

  it('still finds a transcript that kept its raw id because no playlist claims it', () => {
    // The other transcript on this profile: its video left, its transcript
    // stayed. It is still real and still mineable, so it must still be findable.
    expect(matchesQuery(transcript('T-5_dUq-oyo'), 't-5_duq')).toBe(true);
  });
});
