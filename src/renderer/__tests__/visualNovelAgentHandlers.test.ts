// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  VisualNovelDatabase,
  VisualNovelEntry,
  VisualNovelRouteInput,
  VisualNovelTextCapture,
} from '../../shared/visualNovel';
import type { JpToken } from '../tokenizer';

const tokenizerBuild = vi.fn(async () => ({}));
/**
 * A stand-in for kuromoji: a tiny lexicon segments the fixtures, and everything
 * it does not know becomes a one-character non-content token — the same shape
 * `tokenizeSync` produces for particles and okurigana.
 */
const LEXICON = ['雪音', '屋上', '風', '冷たい', '待っ', '台詞'];
const fakeTokens = (text: string): JpToken[] => {
  const tokens: JpToken[] = [];
  for (let index = 0; index < text.length;) {
    const word = LEXICON.find((candidate) => text.startsWith(candidate, index));
    if (word) {
      tokens.push({
        surface: word,
        lemma: word,
        content: true,
        proper: word === '雪音',
        pos: '名詞',
        posDetail: '一般',
      });
      index += word.length;
      continue;
    }
    tokens.push({
      surface: text[index],
      lemma: text[index],
      content: false,
      proper: false,
      pos: '助詞',
      posDetail: '一般',
    });
    index += 1;
  }
  return tokens;
};
const tokenize = vi.fn(fakeTokens);

vi.mock('../tokenizer', () => ({
  getTokenizer: () => tokenizerBuild(),
  tokenizeSync: (text: string) => tokenize(text),
}));

import { addDeckCardsTracked } from '../flashcardDeck';
import { createVisualNovelAgentHandlers } from '../visualNovelAgentHandlers';

const t = (key: string): string => key;

const entry = (patch: Partial<VisualNovelEntry> & { id: string; title: string }): VisualNovelEntry => ({
  japaneseTitle: '',
  englishTitle: '',
  alternativeTitles: [],
  developer: '',
  publisher: '',
  releaseDate: '',
  originalPlatform: '',
  platforms: [],
  genres: [],
  tags: [],
  themes: [],
  synopsis: '',
  characters: [],
  chapters: [],
  routes: [],
  releases: [],
  communityReports: [],
  estimatedPlaytimeHours: 0,
  sourceIds: {},
  sourceUrl: '',
  coverImageUrl: '',
  backgroundImageUrls: [],
  screenshotUrls: [],
  communityRating: null,
  communityVoteCount: 0,
  installPath: '',
  executablePath: '',
  engine: 'unknown',
  engineCompatibility: 'unknown',
  version: '',
  language: 'ja',
  status: 'reading',
  currentRouteId: '',
  currentChapter: '',
  currentScene: '',
  completionPct: 0,
  totalPlaytimeSec: 0,
  lastPlayedAt: null,
  createdAt: 1,
  updatedAt: 1,
  ...patch,
} as VisualNovelEntry);

const capture = (
  patch: Partial<VisualNovelTextCapture> & { id: string; visualNovelId: string; japanese: string },
): VisualNovelTextCapture => ({
  kind: 'dialogue',
  translation: '',
  speaker: '',
  routeId: '',
  chapter: '',
  scene: '',
  screenshotPath: '',
  audioPath: '',
  source: 'clipboard',
  capturedAt: 1,
  ...patch,
});

let database: VisualNovelDatabase;
let clipboard: string;
let routeCalls: Array<{ id: string; routes: VisualNovelRouteInput[] }>;
let captureCalls: unknown[];

function install(): void {
  database = {
    version: 1,
    entries: [
      entry({
        id: 'vn-1',
        title: 'Snow Bound',
        japaneseTitle: '雪の絆',
        developer: 'Studio Ice',
        currentRouteId: 'route-1',
        currentChapter: 'Chapter 2',
        currentScene: 'Rooftop',
        routes: [
          {
            id: 'route-1',
            name: 'Yukine',
            character: '雪音',
            status: 'reading',
            guideNotes: 'pick the roof',
            endings: [{ id: 'route-1-ending-1', name: 'True', achieved: false, notes: '' }],
          },
          {
            id: 'route-2',
            name: 'Common',
            character: '',
            status: 'completed',
            guideNotes: '',
            endings: [],
          },
        ],
      }),
      entry({ id: 'vn-2', title: 'Harbour Lights', status: 'completed' }),
    ],
    captures: [
      capture({ id: 'cap-1', visualNovelId: 'vn-1', japanese: '雪音は屋上で待っていた。', capturedAt: 10 }),
      capture({ id: 'cap-2', visualNovelId: 'vn-1', japanese: '屋上の風が冷たい。', capturedAt: 20 }),
      capture({ id: 'cap-3', visualNovelId: 'vn-2', japanese: '港の灯り。', capturedAt: 5 }),
    ],
  } as VisualNovelDatabase;
  clipboard = '';
  routeCalls = [];
  captureCalls = [];

  (window as unknown as { api: Record<string, unknown> }).api = {
    visualNovelList: async () => database,
    visualNovelAdd: async (input: { title: string }) => {
      database = {
        ...database,
        entries: [...database.entries, entry({ id: `vn-${database.entries.length + 1}`, title: input.title })],
      };
      return { ok: true, database };
    },
    visualNovelUpdateRoutes: async (id: string, routes: VisualNovelRouteInput[]) => {
      routeCalls.push({ id, routes });
      database = {
        ...database,
        entries: database.entries.map((candidate) => (candidate.id === id
          ? {
            ...candidate,
            routes: routes.map((route, index) => ({
              id: route.id ?? `route-${index + 1}`,
              name: route.name,
              character: route.character ?? '',
              status: route.status ?? 'not-started',
              guideNotes: route.guideNotes ?? '',
              endings: (route.endings ?? []).map((ending, endingIndex) => ({
                id: ending.id ?? `x-${endingIndex}`,
                name: ending.name,
                achieved: ending.achieved ?? false,
                notes: ending.notes ?? '',
              })),
            })),
          }
          : candidate)),
      };
      return { ok: true, database };
    },
    visualNovelReadClipboard: async () => clipboard,
    visualNovelCaptureText: async (input: { visualNovelId: string; japanese: string }) => {
      captureCalls.push(input);
      database = {
        ...database,
        captures: [
          ...database.captures,
          capture({
            id: `cap-${database.captures.length + 1}`,
            capturedAt: 100,
            ...input,
          } as VisualNovelTextCapture),
        ],
      };
      return { ok: true, database };
    },
  };
}

beforeEach(() => {
  localStorage.clear();
  tokenizerBuild.mockClear().mockResolvedValue({});
  tokenize.mockClear().mockImplementation(fakeTokens);
  install();
});

const handlers = (): ReturnType<typeof createVisualNovelAgentHandlers> => (
  createVisualNovelAgentHandlers(t)
);

describe('visual-novel.search', () => {
  it('matches Japanese titles and developers, and counts that novel\'s captures', async () => {
    const result = await handlers()['visual-novel.search']?.({ query: '雪の絆' }) as {
      matched: number;
      entries: Array<{ id: string; capturedLines: number; routes: unknown[] }>;
    };

    expect(result.matched).toBe(1);
    expect(result.entries[0].id).toBe('vn-1');
    expect(result.entries[0].capturedLines).toBe(2);
    expect(result.entries[0].routes).toHaveLength(2);
  });

  it('filters by status without a query', async () => {
    const result = await handlers()['visual-novel.search']?.({ status: 'completed' }) as {
      total: number;
      entries: Array<{ id: string }>;
    };

    expect(result.total).toBe(2);
    expect(result.entries.map((row) => row.id)).toEqual(['vn-2']);
  });
});

describe('visual-novel.add', () => {
  it('reports the id of the entry that did not exist before the call', async () => {
    const result = await handlers()['visual-novel.add']?.({ title: 'New Story' }) as {
      createdId: string;
      entries: number;
    };

    expect(result.entries).toBe(3);
    expect(result.createdId).toBe('vn-3');
    expect(database.entries.map((row) => row.title)).toContain('New Story');
  });
});

describe('visual-novel.track-route', () => {
  it('carries every existing route through the replacement update', async () => {
    const result = await handlers()['visual-novel.track-route']?.({
      id: 'vn-1',
      name: 'Yukine',
      status: 'completed',
    }) as { created: boolean; routes: Array<{ id: string; status: string }> };

    expect(routeCalls).toHaveLength(1);
    expect(routeCalls[0].routes.map((route) => route.id)).toEqual(['route-1', 'route-2']);
    expect(result.created).toBe(false);
    expect(result.routes).toEqual([
      { id: 'route-1', name: 'Yukine', status: 'completed' },
      { id: 'route-2', name: 'Common', status: 'completed' },
    ]);
    // The guide notes and endings the caller did not mention survive.
    expect(routeCalls[0].routes[0].guideNotes).toBe('pick the roof');
    expect(routeCalls[0].routes[0].endings).toHaveLength(1);
  });

  it('appends an unknown route instead of overwriting the first one', async () => {
    const result = await handlers()['visual-novel.track-route']?.({
      id: 'Snow Bound',
      name: 'Kaori',
      status: 'reading',
      endings: [{ name: 'Sunrise', achieved: true }],
    }) as { id: string; created: boolean; routes: unknown[] };

    expect(result.id).toBe('vn-1');
    expect(result.created).toBe(true);
    expect(result.routes).toHaveLength(3);
    expect(routeCalls[0].routes[2]).toMatchObject({ name: 'Kaori', status: 'reading' });
  });

  it('refuses a title that does not identify exactly one novel', async () => {
    await expect(handlers()['visual-novel.track-route']?.({ id: 'Nothing', name: 'X' }))
      .rejects.toThrow('blanc.agent.error.visualNovelNotFound');
    expect(routeCalls).toHaveLength(0);
  });
});

describe('visual-novel.extract-text', () => {
  it('stores the clipboard line against the novel\'s current route, chapter and scene', async () => {
    clipboard = '  新しい台詞です。  ';

    const result = await handlers()['visual-novel.extract-text']?.({ id: 'vn-1' }) as {
      captured: boolean;
      capturedLines: number;
    };

    expect(result.captured).toBe(true);
    expect(result.capturedLines).toBe(3);
    expect(captureCalls[0]).toMatchObject({
      visualNovelId: 'vn-1',
      japanese: '新しい台詞です。',
      routeId: 'route-1',
      chapter: 'Chapter 2',
      scene: 'Rooftop',
      source: 'clipboard',
    });
  });

  it('does not store the same line twice when the clipboard has not moved on', async () => {
    clipboard = '屋上の風が冷たい。';

    const result = await handlers()['visual-novel.extract-text']?.({ id: 'vn-1' }) as {
      captured: boolean;
      reason: string;
    };

    expect(result).toMatchObject({ captured: false, reason: 'unchanged' });
    expect(captureCalls).toHaveLength(0);
  });

  it('refuses a clipboard with no Japanese in it', async () => {
    clipboard = 'just some english';

    await expect(handlers()['visual-novel.extract-text']?.({ id: 'vn-1' }))
      .rejects.toThrow('blanc.agent.error.clipboardNoJapanese');
    expect(captureCalls).toHaveLength(0);
  });
});

describe('visual-novel.generate-vocabulary', () => {
  it('builds the tokenizer before reading tokens, so a cold renderer is not empty', async () => {
    const order: string[] = [];
    tokenizerBuild.mockImplementation(async () => {
      order.push('build');
      return {};
    });
    tokenize.mockImplementation((text: string) => {
      order.push('tokenize');
      return fakeTokens(text);
    });

    await handlers()['visual-novel.generate-vocabulary']?.({ id: 'vn-1' });

    expect(order[0]).toBe('build');
    expect(order).toContain('tokenize');
  });

  it('ranks by occurrences across that novel\'s captures and drops proper nouns', async () => {
    const result = await handlers()['visual-novel.generate-vocabulary']?.({ id: 'vn-1' }) as {
      capturesScanned: number;
      words: Array<{ lemma: string; occurrences: number }>;
    };

    expect(result.capturesScanned).toBe(2);
    expect(result.words[0]).toMatchObject({ lemma: '屋上', occurrences: 2 });
    expect(result.words.map((word) => word.lemma)).not.toContain('雪音');
  });

  it('excludes words already in the deck unless asked not to', async () => {
    addDeckCardsTracked([{ word: '屋上', reading: 'おくじょう', meaning: 'rooftop', source: 'import' }]);

    const filtered = await handlers()['visual-novel.generate-vocabulary']?.({ id: 'vn-1' }) as {
      words: Array<{ lemma: string }>;
    };
    expect(filtered.words.map((word) => word.lemma)).not.toContain('屋上');

    const unfiltered = await handlers()['visual-novel.generate-vocabulary']?.({
      id: 'vn-1',
      excludeKnown: false,
    }) as { words: Array<{ lemma: string }> };
    expect(unfiltered.words.map((word) => word.lemma)).toContain('屋上');
  });

  it('says so when the novel has no captured text instead of returning an empty list', async () => {
    await expect(handlers()['visual-novel.generate-vocabulary']?.({ id: 'vn-1', routeId: 'route-9' }))
      .rejects.toThrow('blanc.agent.error.visualNovelNoText');
  });

  it('reports a tokenizer that cannot be built', async () => {
    tokenizerBuild.mockRejectedValue(new Error('kuromoji failed to build'));

    await expect(handlers()['visual-novel.generate-vocabulary']?.({ id: 'vn-1' }))
      .rejects.toThrow('blanc.agent.error.tokenizerUnavailable');
  });
});
