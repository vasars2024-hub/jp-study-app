// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MediaItem } from '../../shared/types';
import type { MediaOrganizationPreview } from '../../shared/mediaHub';

const analyze = vi.fn();
vi.mock('../mediaStudyWorkflow', () => ({
  analyzeMediaStudyCues: (...args: unknown[]) => analyze(...args),
}));
/**
 * One line per cue, so a fixture's line count IS its cue count.
 *
 * `parseStudySubtitles` is the one the handler calls — the study parser, which drops the
 * non-Japanese style tracks of a dual-language `.ass`. Here it is the same trivial parse
 * with an empty split, because these cases are about the handler's shape rather than the
 * splitter; `src/media/__tests__/externalStudyTrackSplit.test.ts` owns the split itself
 * and the dual-language fixture that makes `dropped` non-zero.
 */
const fakeCues = (text: string) => text
  .split('\n')
  .filter(Boolean)
  .map((line, index) => ({ start: index, end: index + 1, text: line }));
vi.mock('../subtitles', () => ({
  parseSubtitles: (text: string) => fakeCues(text),
  parseStudySubtitles: (text: string) => ({
    cues: fakeCues(text),
    dropped: 0,
    styles: [] as string[],
  }),
}));

import { createMediaAgentHandlers } from '../mediaAgentHandlers';

const t = (key: string): string => key;

const item = (patch: Partial<MediaItem> & { id: string; title: string }): MediaItem => ({
  path: `C:/incoming/${patch.id}.mkv`,
  fileName: `${patch.id}.mkv`,
  addedAt: 1,
  ...patch,
} as MediaItem);

const analysis = (patch: Record<string, unknown> = {}) => ({
  text: '',
  sentences: [{ start: 0, end: 1, text: '雪が降る' }, { start: 1, end: 2, text: '風が冷たい' }],
  vocabulary: [
    { word: '雪', surface: '雪', reading: 'ユキ', occurrences: 3, sentence: '雪が降る', firstSeenAt: 0 },
    { word: '風', surface: '風', reading: 'カゼ', occurrences: 1, sentence: '風が冷たい', firstSeenAt: 1, proper: true },
  ],
  kanji: [{ character: '雪', occurrences: 3 }, { character: '風', occurrences: 1 }],
  truncated: false,
  level: { scheme: 'jlpt', level: 3, label: 'N3', slotId: 'jlpt-n3', confidence: 0.91, metThreshold: true },
  comprehensibility: { score: 0.8 },
  grammar: [{ id: 'te-form' }],
  ...patch,
});

let media: MediaItem[];
let subtitleText: string | null;
let metadataCalls: Array<{ id: string; metadata: Record<string, unknown> }>;
let organizeCalls: Array<{ preview: MediaOrganizationPreview; choice?: string }>;
const basePreview = (): MediaOrganizationPreview => ({
  itemId: 'm-1',
  sourcePath: 'C:/incoming/m-1.mkv',
  targetPath: 'C:/Media/Anime/Snow Episode 1.mkv',
  action: 'move',
});
let preview: MediaOrganizationPreview | null;
let organizeResult: { ok: boolean; path?: string; error?: string };

function install(): void {
  media = [
    item({
      id: 'm-1',
      title: 'Snow: Episode 1',
      vocabularyCount: 4,
      kanjiCount: 2,
      subtitles: [
        { id: 's-en', lang: 'en', source: 'sidecar', format: 'srt', path: 'a.srt' },
        { id: 's-ja', lang: 'ja', source: 'sidecar', format: 'srt', path: 'b.srt', label: 'JP' },
      ],
    } as Partial<MediaItem> & { id: string; title: string }),
    item({ id: 'm-2', title: 'No Subs' }),
  ];
  subtitleText = '雪が降る\n風が冷たい';
  metadataCalls = [];
  organizeCalls = [];
  preview = basePreview();
  organizeResult = { ok: true, path: 'C:/Media/Anime/Snow Episode 1.mkv' };

  (window as unknown as { api: Record<string, unknown> }).api = {
    listMedia: async () => media,
    readSubtitleRecord: async () => (subtitleText === null ? null : { name: 'b.srt', text: subtitleText }),
    updateMediaMetadata: async (id: string, metadata: Record<string, unknown>) => {
      metadataCalls.push({ id, metadata });
      const target = media.find((candidate) => candidate.id === id);
      if (!target) return null;
      const next = { ...target, ...metadata } as MediaItem;
      media = media.map((candidate) => (candidate.id === id ? next : candidate));
      return next;
    },
    previewMediaOrganization: async () => preview,
    organizeMedia: async (p: MediaOrganizationPreview, choice?: string) => {
      organizeCalls.push({ preview: p, choice });
      if (organizeResult.ok) {
        media = media.map((candidate) => (candidate.id === p.itemId
          ? { ...candidate, path: organizeResult.path ?? p.targetPath, title: 'Snow Episode 1' }
          : candidate));
      }
      return organizeResult;
    },
  };
}

beforeEach(() => {
  analyze.mockReset().mockResolvedValue(analysis());
  install();
});

const handlers = () => createMediaAgentHandlers(t);

describe('media.analyze-subtitles', () => {
  it('picks the Japanese track and reports what the corpus measured', async () => {
    const result = await handlers()['media.analyze-subtitles']?.({ id: 'm-1' }) as {
      subtitle: { id: string };
      cues: number;
      distinctVocabulary: number;
      distinctKanji: number;
      level: { label: string };
      vocabulary: unknown[];
    };

    expect(result.subtitle.id).toBe('s-ja');
    expect(result.cues).toBe(2);
    expect(result.distinctVocabulary).toBe(2);
    expect(result.distinctKanji).toBe(2);
    expect(result.level).toMatchObject({ label: 'N3', metThreshold: true });
    expect(result.vocabulary).toHaveLength(2);
  });

  it('resolves a unique title, and refuses an item with no Japanese track', async () => {
    await expect(handlers()['media.analyze-subtitles']?.({ id: 'No Subs' }))
      .rejects.toThrow('blanc.agent.error.noJapaneseSubtitle');
  });

  it('refuses a track that reads back empty rather than reporting zero words', async () => {
    subtitleText = '';
    await expect(handlers()['media.analyze-subtitles']?.({ id: 'm-1' }))
      .rejects.toThrow('blanc.agent.error.subtitleNoCues');

    subtitleText = null;
    await expect(handlers()['media.analyze-subtitles']?.({ id: 'm-1' }))
      .rejects.toThrow('blanc.agent.error.subtitleUnreadable');
  });
});

describe('media.generate-profile', () => {
  it('writes the measured counts and the level that met its threshold', async () => {
    const result = await handlers()['media.generate-profile']?.({ id: 'm-1' }) as {
      previous: { vocabularyCount: number };
      profile: { vocabularyCount: number; jlptLevel: string };
    };

    expect(metadataCalls[0].metadata).toMatchObject({
      vocabularyCount: 2,
      kanjiCount: 2,
      jlptLevel: 'N3',
      metadataSource: 'agent-subtitle-analysis',
    });
    expect(result.previous.vocabularyCount).toBe(4);
    expect(result.profile).toMatchObject({ vocabularyCount: 2, jlptLevel: 'N3' });
  });

  it('does not write a level the estimator did not stand behind', async () => {
    analyze.mockResolvedValue(analysis({
      level: { scheme: 'jlpt', level: 3, label: 'N3', slotId: 'jlpt-n3', confidence: 0.2, metThreshold: false },
    }));

    const result = await handlers()['media.generate-profile']?.({ id: 'm-1' }) as {
      jlptLevelDeclined: string;
    };

    expect(metadataCalls[0].metadata).not.toHaveProperty('jlptLevel');
    expect(metadataCalls[0].metadata).toMatchObject({ vocabularyCount: 2 });
    expect(result.jlptLevelDeclined).toBe('below-threshold');
  });

  it('reports why no level was written when no bands are configured', async () => {
    analyze.mockResolvedValue(analysis({ level: null }));

    const result = await handlers()['media.generate-profile']?.({ id: 'm-1' }) as {
      jlptLevelDeclined: string;
    };

    expect(result.jlptLevelDeclined).toBe('no-level-bands-configured');
    expect(metadataCalls[0].metadata).not.toHaveProperty('jlptLevel');
  });
});

describe('media.organize-files', () => {
  it('moves the file and reports the title the move rewrote', async () => {
    const result = await handlers()['media.organize-files']?.({
      id: 'm-1',
      root: 'C:/Media',
    }) as { moved: boolean; path: string; titleRewritten: { from: string; to: string } };

    expect(result.moved).toBe(true);
    expect(result.path).toBe('C:/Media/Anime/Snow Episode 1.mkv');
    expect(result.titleRewritten).toEqual({ from: 'Snow: Episode 1', to: 'Snow Episode 1' });
  });

  it('does not move anything when the file is already in place', async () => {
    preview = { ...basePreview(), action: 'noop' };

    const result = await handlers()['media.organize-files']?.({ id: 'm-1', root: 'C:/Media' }) as {
      moved: boolean;
      reason: string;
    };

    expect(result).toMatchObject({ moved: false, reason: 'already-in-place' });
    expect(organizeCalls).toHaveLength(0);
  });

  it('refuses a conflict until a duplicate choice is supplied', async () => {
    preview = { ...basePreview(), action: 'conflict', conflictItemIds: ['m-9'] };

    const refused = await handlers()['media.organize-files']?.({ id: 'm-1', root: 'C:/Media' }) as {
      moved: boolean;
      reason: string;
      conflictItemIds: string[];
    };
    expect(refused).toMatchObject({ moved: false, reason: 'duplicate-choice-required' });
    expect(refused.conflictItemIds).toEqual(['m-9']);
    expect(organizeCalls).toHaveLength(0);

    await handlers()['media.organize-files']?.({ id: 'm-1', root: 'C:/Media', choice: 'keep-both' });
    expect(organizeCalls).toHaveLength(1);
    expect(organizeCalls[0].choice).toBe('keep-both');
  });

  it('separates a rejected root from a failed move', async () => {
    preview = null;
    await expect(handlers()['media.organize-files']?.({ id: 'm-1', root: 'Media' }))
      .rejects.toThrow('blanc.agent.error.organizeRoot');

    install();
    organizeResult = { ok: false, error: 'EPERM' };
    await expect(handlers()['media.organize-files']?.({ id: 'm-1', root: 'C:/Media' }))
      .rejects.toThrow('EPERM');
  });

  it('needs the root, and says which argument is missing', async () => {
    await expect(handlers()['media.organize-files']?.({ id: 'm-1' }))
      .rejects.toThrow('blanc.agent.error.needsArgument');
  });
});
