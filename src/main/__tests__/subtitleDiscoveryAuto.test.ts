// @vitest-environment node
//
// The per-episode automation, end to end over an in-memory library: an episode
// is played (or its title marked Watching), and it must come out with a Japanese
// study line and a helper line — found, fused, or machine-translated — with the
// picks persisted and the status announced. Discovery, the translation engine,
// Whisper and ffmpeg are all scripted; nothing reaches the network.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { MediaItem } from '../../shared/types';
import type { SubtitleRecord } from '../../shared/subtitleRecord';
import type { SubtitleDiscoveryRequest, SubtitleDiscoverySettings } from '../../shared/subtitleDiscoveryIpc';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'subauto-test-'));

// ------------------------------------------------------------------ electron

const sent: { channel: string; payload: unknown }[] = [];
const handlers = new Map<string, (...args: unknown[]) => unknown>();
vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot },
  ipcMain: { handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn) },
  BrowserWindow: {
    getAllWindows: () => [{
      isDestroyed: () => false,
      webContents: { send: (channel: string, payload: unknown) => sent.push({ channel, payload }) },
    }],
  },
}));

// ------------------------------------------------------------------ discovery

const settings = {} as SubtitleDiscoverySettings;
const files = new Map<string, string>();
const discoveryCalls: SubtitleDiscoveryRequest[] = [];
/** What a discovery run "finds" for an item, keyed by media id. */
const discoveryFinds = new Map<string, SubtitleRecord[]>();

vi.mock('../subtitleDiscovery', () => ({
  loadDiscoverySettings: () => ({ ...settings, dismissedNotices: [...settings.dismissedNotices] }),
  saveDiscoverySettings: (next: SubtitleDiscoverySettings) => Object.assign(settings, next),
  onSubtitleDiscoveryEvent: () => () => undefined,
  readSubtitleRecord: (record: SubtitleRecord) => files.get(record.path) ?? null,
  writeSubtitleFile: (mediaId: string, name: string, text: string) => {
    const relative = `subtitles/${mediaId}/${name}`;
    files.set(relative, text);
    return relative;
  },
  runSubtitleDiscovery: async (request: SubtitleDiscoveryRequest) => {
    discoveryCalls.push(request);
    for (const id of request.mediaIds ?? []) {
      const found = discoveryFinds.get(id);
      if (found) patch([id], { subtitles: [...(get(id)?.subtitles ?? []), ...found] });
    }
    return { ok: true, attached: 0, empty: 0, unreachable: 0, files: 0 };
  },
  subtitleDiscoveryActiveIds: () => [],
  subtitleDiscoveryEligible: (item: MediaItem) => (item.kind ?? 'video') === 'video' && !item.sourceUrl,
  whenSubtitleSweepIdle: async () => true,
}));

let openSubtitlesKey = true;
vi.mock('../subtitleProviderClients', () => ({ hasSubtitleProviderKey: () => openSubtitlesKey }));

// ------------------------------------------------------------- translation

type Engine = { kind: 'cloud'; providerId: string; label: string } | null;
let engine: Engine = { kind: 'cloud', providerId: 'gemini-2.5-flash', label: 'gemini-2.5-flash' };
const translated: { raw: string; from: string; to: string }[] = [];
let translationResult: { srt: string; translated: number; total: number; engine: string } | null = null;

vi.mock('../subtitleDiscoveryTranslate', () => ({
  resolveSubtitleTranslationEngine: () => engine,
  translateSubtitleTrack: async (raw: string, from: string, to: string) => {
    translated.push({ raw, from, to });
    return translationResult ?? {
      srt: `1\n00:00:01,000 --> 00:00:02,000\n${to === 'ja' ? '行こう' : "Let's go"}\n`,
      translated: 1,
      total: 1,
      engine: 'gemini-2.5-flash',
    };
  },
}));

// ------------------------------------------------------------ Whisper, ffmpeg

const enqueued: Record<string, unknown>[] = [];
let transcriptionListener: ((progress: { mediaId: string; phase: string; error?: string }) => void) | null = null;
vi.mock('../transcriptionJobs', () => ({
  enqueueTranscription: (request: Record<string, unknown>) => {
    enqueued.push(request);
    return { ok: true, mediaId: request.mediaId };
  },
  onMainTranscriptionProgress: (listener: typeof transcriptionListener) => {
    transcriptionListener = listener;
    return () => undefined;
  },
}));

let audioLanguages: (string | null)[] = [];
vi.mock('../subtitleLocalSources', () => ({ listAudioStreamLanguages: async () => audioLanguages }));

const {
  prepareItem,
  registerSubtitleAutoIpc,
  requestSubtitlePreparation,
  resetSubtitleAutoForTests,
  secondarySubtitleForItem,
  subtitleAutoNotices,
  subtitleAutoStatuses,
  subtitlePreparationIdle,
  watchingAhead,
  dismissSubtitleAutoNotice,
} = await import('../subtitleDiscoveryAuto');
const { resetSubtitleNoticesForTests } = await import('../subtitleDiscoveryNotices');
const { __setStudyLanguageStateForTests } = await import('../studyLanguage');
const { DEFAULT_SUBTITLE_DISCOVERY_SETTINGS } = await import('../../shared/subtitleDiscoveryIpc');

// ---------------------------------------------------------------- the library

let items: MediaItem[] = [];
function get(id: string): MediaItem | undefined {
  return items.find((item) => item.id === id);
}
function patch(ids: readonly string[], change: Partial<MediaItem>): void {
  items = items.map((item) => (ids.includes(item.id) ? { ...item, ...change } : item));
}

function video(over: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'ep1',
    title: 'Show - 01',
    seriesTitle: 'Show',
    seriesKey: 'show',
    fileName: 'Show - 01.mkv',
    path: path.join(tmpRoot, 'Show - 01.mkv'),
    addedAt: 1,
    kind: 'video',
    episode: 1,
    ...over,
  } as MediaItem;
}

function track(over: Partial<SubtitleRecord>): SubtitleRecord {
  const record: SubtitleRecord = {
    id: 'ja-1', lang: 'ja', source: 'provider', providerId: 'jimaku', format: 'srt',
    path: `subtitles/x/${over.id ?? 'ja-1'}.srt`, label: 'Show.E01.ja.srt', addedAt: 1, ...over,
  };
  files.set(record.path, '1\n00:00:01,000 --> 00:00:02,000\n行くぞ\n');
  return record;
}

const statusOf = (id: string) => subtitleAutoStatuses([id])[0];

beforeEach(() => {
  Object.assign(settings, { ...DEFAULT_SUBTITLE_DISCOVERY_SETTINGS, dismissedNotices: [] });
  items = [];
  files.clear();
  discoveryCalls.length = 0;
  discoveryFinds.clear();
  translated.length = 0;
  translationResult = null;
  enqueued.length = 0;
  sent.length = 0;
  audioLanguages = [];
  openSubtitlesKey = true;
  engine = { kind: 'cloud', providerId: 'gemini-2.5-flash', label: 'gemini-2.5-flash' };
  resetSubtitleAutoForTests();
  resetSubtitleNoticesForTests();
  __setStudyLanguageStateForTests({ lang: 'ja', script: 'simplified' });
  registerSubtitleAutoIpc({ listItems: () => items, patchItems: patch });
});

// --------------------------------------------------------------------- anime

describe('anime: Japanese from Jimaku, no English anywhere', () => {
  it('searches this episode for both lines, then machine-translates the Japanese for the helper line', async () => {
    const ja = track({ id: 'ja-1' });
    items = [video({ anilistId: 567, subtitles: [ja] })];

    await prepareItem('ep1');

    expect(discoveryCalls).toEqual([{ mediaIds: ['ep1'], languages: ['ja', 'en'], remoteLanguages: ['ja', 'en'] }]);
    expect(translated).toEqual([{ raw: files.get(ja.path), from: 'ja', to: 'en' }]);

    const mt = get('ep1')?.subtitles?.find((record) => record.lang === 'en');
    expect(mt).toMatchObject({
      source: 'generated',
      derivation: 'machine-translation',
      machineGenerated: true,
      translatedFromId: 'ja-1',
      translationEngine: 'gemini-2.5-flash',
    });
    expect(mt?.label).toContain('machine translation');
    expect(mt?.path).toMatch(/\.en\.srt$/);

    // Persisted picks, and the status the library reads.
    expect(get('ep1')?.subtitleAuto).toMatchObject({ primaryId: 'ja-1', secondaryId: mt?.id });
    expect(statusOf('ep1')).toMatchObject({
      ja: 'found', en: 'generated', source: { ja: 'jimaku', en: 'machine-translation' },
      machineTranslated: { ja: false, en: true },
    });
    expect(sent.some((entry) => entry.channel === 'subtitleAuto:status')).toBe(true);

    // The player's helper-line hand-off.
    const secondary = secondarySubtitleForItem(get('ep1') as MediaItem);
    expect(secondary).toMatchObject({ lang: 'en', machineTranslated: true, source: 'machine-translation' });
    expect(secondary?.text).toContain("Let's go");
  });

  it('uses a human English track the search found, and translates nothing', async () => {
    items = [video({ subtitles: [track({ id: 'ja-1' })] })];
    discoveryFinds.set('ep1', [track({ id: 'en-os', lang: 'en', providerId: 'opensubtitles', label: 'Show.S01E01.WEB' })]);

    await prepareItem('ep1');

    expect(translated).toEqual([]);
    expect(statusOf('ep1')).toMatchObject({ ja: 'found', en: 'found', source: { en: 'opensubtitles' }, secondaryId: 'en-os' });
  });

  it('redoes a translation made from a track that is no longer the study track', async () => {
    const old = track({
      id: 'mt-old', lang: 'en', source: 'generated', derivation: 'machine-translation', translatedFromId: 'gone',
      path: 'subtitles/ep1/mt-old.en.srt',
    });
    items = [video({ subtitles: [track({ id: 'ja-2' }), old] })];

    await prepareItem('ep1');

    const english = get('ep1')?.subtitles?.filter((record) => record.lang === 'en') ?? [];
    expect(english).toHaveLength(1);
    expect(english[0]).toMatchObject({ translatedFromId: 'ja-2' });
  });

  it('does nothing when automatic translation is off', async () => {
    settings.autoTranslate = false;
    items = [video({ subtitles: [track({ id: 'ja-1' })] })];
    await prepareItem('ep1');
    expect(translated).toEqual([]);
    expect(statusOf('ep1').en).toBe('none');
  });
});

// ------------------------------------------------------- the study language

describe('the study line follows the study language, not the download list', () => {
  it('a Chinese learner gets the Chinese track as the study line even when the list still says Japanese', async () => {
    __setStudyLanguageStateForTests({ lang: 'zh', script: 'simplified' });
    settings.autoDownloadLanguages = ['ja'];
    items = [video({ subtitles: [track({ id: 'ja-1' }), track({ id: 'zh-1', lang: 'zh' })] })];

    await prepareItem('ep1');

    expect(discoveryCalls[0]?.languages).toEqual(['zh', 'en']);
    expect(get('ep1')?.subtitleAuto?.primaryId).toBe('zh-1');
    expect(statusOf('ep1')).toMatchObject({ ja: 'found', source: { ja: 'jimaku' } });
    // The helper line is translated from the Chinese track, not the Japanese one.
    expect(translated[0]).toMatchObject({ from: 'zh', to: 'en' });
  });

  it('a Traditional-script learner gets the Traditional track before the Simplified one', async () => {
    __setStudyLanguageStateForTests({ lang: 'zh', script: 'traditional' });
    items = [video({ subtitles: [track({ id: 'sc', lang: 'zh-hans' }), track({ id: 'tc', lang: 'zh-hant' })] })];
    await prepareItem('ep1');
    expect(get('ep1')?.subtitleAuto?.primaryId).toBe('tc');
  });

  it('a Russian learner searches Russian and machine-translates nothing into Japanese', async () => {
    __setStudyLanguageStateForTests({ lang: 'ru', script: 'simplified' });
    items = [video({ subtitles: [track({ id: 'ru-1', lang: 'rus' }), track({ id: 'ja-1' })] })];
    await prepareItem('ep1');
    expect(discoveryCalls[0]?.languages).toEqual(['ru', 'en']);
    expect(get('ep1')?.subtitleAuto?.primaryId).toBe('ru-1');
    expect(translated.every((entry) => entry.to !== 'ja')).toBe(true);
  });
});

// ------------------------------------------------------------ no engine / key

describe('no translation engine configured', () => {
  it('skips quietly, marks the item, and raises ONE notice for the panel', async () => {
    engine = null;
    items = [
      video({ subtitles: [track({ id: 'a' })] }),
      video({ id: 'ep2', episode: 2, path: path.join(tmpRoot, 'Show - 02.mkv'), subtitles: [track({ id: 'b' })] }),
    ];

    await prepareItem('ep1');
    await prepareItem('ep2');

    expect(translated).toEqual([]);
    expect(statusOf('ep1').notice).toBe('translation-unavailable');
    expect(subtitleAutoNotices().active).toEqual(['translation-unavailable']);

    // Dismissed once, gone for good.
    expect(dismissSubtitleAutoNotice('translation-unavailable').active).toEqual([]);
    expect(settings.dismissedNotices).toEqual(['translation-unavailable']);
    await prepareItem('ep1');
    expect(subtitleAutoNotices().active).toEqual([]);
  });

  it('stops showing a notice once its cause is fixed', async () => {
    engine = null;
    items = [video({ subtitles: [track({ id: 'a' })] })];
    await prepareItem('ep1');
    engine = { kind: 'cloud', providerId: 'gemini-2.5-flash', label: 'gemini-2.5-flash' };
    expect(subtitleAutoNotices().active).toEqual([]);
  });
});

// ----------------------------------------------------------- TV, drama, films

describe('only English exists', () => {
  it('translates English into a Japanese study track when the audio is not Japanese', async () => {
    audioLanguages = ['en'];
    items = [video({ category: 'tv', subtitles: [track({ id: 'en-side', lang: 'en', source: 'sidecar', providerId: undefined })] })];

    await prepareItem('ep1');

    expect(enqueued).toEqual([]);
    expect(translated.map(({ from, to }) => [from, to])).toEqual([['en', 'ja']]);
    const ja = get('ep1')?.subtitles?.find((record) => record.lang === 'ja');
    expect(ja).toMatchObject({ derivation: 'machine-translation', translatedFromId: 'en-side' });
    expect(statusOf('ep1')).toMatchObject({
      ja: 'generated', en: 'found', primaryId: ja?.id, secondaryId: 'en-side',
      machineTranslated: { ja: true, en: false },
    });
  });

  it('fuses Whisper onto the English timing when the audio IS Japanese, and falls back to translation if that fails', async () => {
    audioLanguages = ['ja'];
    items = [video({ category: 'drama', subtitles: [track({ id: 'en-os', lang: 'en', providerId: 'opensubtitles' })] })];

    await prepareItem('ep1');

    expect(enqueued).toEqual([{ mediaId: 'ep1', lang: 'ja', kind: 'fuse-en-ja', sourceSubtitleId: 'en-os' }]);
    expect(translated).toEqual([]);
    expect(statusOf('ep1').ja).toBe('generating');

    // No Whisper model / no window: the fusion errors, and the queue translates instead.
    transcriptionListener?.({ mediaId: 'ep1', phase: 'error', error: 'no-model' });
    await subtitlePreparationIdle();

    expect(translated.map(({ from, to }) => [from, to])).toEqual([['en', 'ja']]);
    expect(get('ep1')?.subtitleAuto?.attempts).toEqual(expect.arrayContaining([
      expect.objectContaining({ task: 'fuse', outcome: 'failed', reason: 'no-model' }),
      expect.objectContaining({ task: 'translate', from: 'en', to: 'ja', outcome: 'done' }),
    ]));
  });

  it('does not retry a failed translation on every play', async () => {
    audioLanguages = ['en'];
    translationResult = { srt: '', translated: 0, total: 40, engine: 'gemini-2.5-flash' };
    items = [video({ subtitles: [track({ id: 'en', lang: 'en', source: 'sidecar' })] })];

    await prepareItem('ep1');
    await prepareItem('ep1');

    expect(translated).toHaveLength(1);
    expect(statusOf('ep1').ja).toBe('none');
  });
});

// ---------------------------------------------------------- nothing at all

describe('nothing found', () => {
  it('queues plain Whisper only when the user asked for it and the audio is Japanese', async () => {
    items = [video({ anilistId: 1 })];
    await prepareItem('ep1');
    expect(enqueued).toEqual([]);

    settings.autoTranscribe = true;
    await prepareItem('ep1');
    expect(enqueued).toEqual([{ mediaId: 'ep1', lang: 'ja' }]);
    await prepareItem('ep1');
    expect(enqueued).toHaveLength(1);
  });
  it("transcribes in the study language, and never a Chinese learner's anime", async () => {
    settings.autoTranscribe = true;
    __setStudyLanguageStateForTests({ lang: 'ru', script: 'simplified' });
    items = [video({ id: 'film', lang: 'ru' })];
    await prepareItem('film');
    expect(enqueued).toEqual([{ mediaId: 'film', lang: 'ru' }]);

    enqueued.length = 0;
    __setStudyLanguageStateForTests({ lang: 'zh', script: 'simplified' });
    items = [video({ id: 'anime', anilistId: 9 })];
    await prepareItem('anime');
    expect(enqueued).toEqual([]);
  });
});

// ---------------------------------------------------------- cost / the queue

describe('the queue never takes on a library', () => {
  const season = (): MediaItem[] => Array.from({ length: 6 }, (_, i) => video({
    id: `e${i + 1}`,
    episode: i + 1,
    path: path.join(tmpRoot, `Show - 0${i + 1}.mkv`),
    subtitles: [track({ id: `ja-${i + 1}` })],
    ...(i === 0 ? { lastPlayedAt: 5 } : {}),
  }));

  it('Watching prepares only the next few unplayed episodes, in order', async () => {
    items = season();
    expect(watchingAhead(items).map((item) => item.id)).toEqual(['e2', 'e3', 'e4']);

    const queued = await handlers.get('subtitleAuto:prepare')?.({}, { seriesKey: 'show', reason: 'watching' });
    expect(queued).toEqual({ queued: 3 });
    await subtitlePreparationIdle();
    expect(discoveryCalls.map((call) => call.mediaIds?.[0])).toEqual(['e2', 'e3', 'e4']);
    expect(translated).toHaveLength(3);
  });

  it('caps background requests, but never drops a play', async () => {
    items = Array.from({ length: 20 }, (_, i) => video({
      id: `m${i}`, episode: i + 1, path: path.join(tmpRoot, `m${i}.mkv`), subtitles: [track({ id: `j${i}` })],
    }));
    expect(requestSubtitlePreparation(items.map((item) => item.id), 'manual')).toBe(12);
    expect(requestSubtitlePreparation(['m19'], 'play')).toBe(1);
    await subtitlePreparationIdle();
    expect(discoveryCalls).toHaveLength(13);
  });

  it('treats a repeated play as the same play, so a library change cannot loop it', async () => {
    // The player re-reads its track on every `media:changed`, and preparing an
    // item changes the library — without the debounce that is a loop.
    items = [video({ subtitles: [track({ id: 'ja-1' })] })];
    expect(requestSubtitlePreparation(['ep1'], 'play')).toBe(1);
    await subtitlePreparationIdle();
    expect(requestSubtitlePreparation(['ep1'], 'play')).toBe(0);
    expect(discoveryCalls).toHaveLength(1);
    // An explicit request is never debounced.
    expect(requestSubtitlePreparation(['ep1'], 'manual')).toBe(1);
    await subtitlePreparationIdle();
  });

  it('skips what is not a local video', () => {
    items = [video({ sourceUrl: 'https://youtube.com/watch?v=x' }), video({ id: 'a1', kind: 'audiobook' })];
    expect(requestSubtitlePreparation(['ep1', 'a1'], 'play')).toBe(0);
  });
});

describe('status for the library', () => {
  it('honours the user\'s chosen study track while persisting the automatic pick separately', async () => {
    items = [video({
      preferredSubtitleId: 'ja-b',
      subtitles: [track({ id: 'ja-a', source: 'embedded' }), track({ id: 'ja-b' }), track({ id: 'en', lang: 'en' })],
    })];
    await prepareItem('ep1');
    expect(statusOf('ep1').primaryId).toBe('ja-b');
    expect(get('ep1')?.subtitleAuto?.primaryId).toBe('ja-a');
  });

  it('answers the status query for every video when no ids are given', async () => {
    items = [video(), video({ id: 'a1', kind: 'audiobook' })];
    const all = await handlers.get('subtitleAuto:status')?.({}, undefined) as { mediaId: string }[];
    expect(all.map((entry) => entry.mediaId)).toEqual(['ep1']);
  });
});
