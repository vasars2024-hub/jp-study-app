import { describe, expect, it } from 'vitest';
import {
  createEmptySubtitleProvidersDocument,
  isSidecarSubtitleFormat,
  normalizeSubtitleLanguage,
  normalizeSubtitleProvidersDocument,
  planSubtitleProviders,
  removeSubtitleProvider,
  removeSubtitleTrack,
  selectCapableSubtitleProviders,
  selectSubtitleTracks,
  subtitleFormatSupportsStyling,
  subtitleProviderMatchSignals,
  subtitleTrackQualityScore,
  upsertSubtitleProvider,
  upsertSubtitleTrack,
  DEFAULT_SUBTITLE_MATCH_SIGNALS,
  type SubtitleProvidersDocument,
} from '../subtitleProviders';

const provider = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'kitsu-subs',
  name: 'Kitsu Subs',
  ...overrides,
});

const track = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'trk-1',
  providerId: 'kitsu-subs',
  identityId: 'mid-0001',
  language: 'ja',
  ...overrides,
});

const docOf = (input: Record<string, unknown>): SubtitleProvidersDocument =>
  normalizeSubtitleProvidersDocument(input).value;

describe('normalizeSubtitleLanguage', () => {
  it('folds case, separators and stray punctuation', () => {
    expect(normalizeSubtitleLanguage('  ZH_Hans ')).toBe('zh-hans');
    expect(normalizeSubtitleLanguage('en-US')).toBe('en-us');
    expect(normalizeSubtitleLanguage('日本語')).toBe('');
    expect(normalizeSubtitleLanguage(42)).toBe('');
  });
});

describe('normalizeSubtitleProvidersDocument', () => {
  it('rejects a non-object and a future version', () => {
    expect(normalizeSubtitleProvidersDocument(null).value).toEqual(createEmptySubtitleProvidersDocument());
    const future = normalizeSubtitleProvidersDocument({ version: 99, providers: [provider()] });
    expect(future.value.providers).toHaveLength(0);
    expect(future.issues[0].path).toBe('version');
  });

  it('drops providers with no ID or name and de-duplicates by ID', () => {
    const { value, issues } = normalizeSubtitleProvidersDocument({
      providers: [{ name: 'No ID' }, provider(), provider({ name: 'Duplicate' })],
    });
    expect(value.providers).toHaveLength(1);
    expect(value.providers[0].name).toBe('Kitsu Subs');
    expect(issues.some((issue) => issue.message.includes('duplicate'))).toBe(true);
  });

  it('clamps enums, priority and reliability, and refuses a non-HTTP base URL', () => {
    const { value, issues } = normalizeSubtitleProvidersDocument({
      providers: [provider({
        priority: -50,
        reliabilityScore: 900,
        searchMethod: 'telepathy',
        formats: ['srt', 'mkv', 'ASS'],
        styles: ['forced', 'karaoke'],
        availability: 'on fire',
        baseUrl: 'ftp://example.invalid/subs',
      })],
    });
    const [entry] = value.providers;
    expect(entry.priority).toBe(0);
    expect(entry.reliabilityScore).toBe(100);
    expect(entry.searchMethod).toBe('title');
    expect(entry.formats).toEqual(['srt', 'ass']);
    expect(entry.styles).toEqual(['forced']);
    expect(entry.availability).toBe('unknown');
    expect(entry.baseUrl).toBeNull();
    expect(issues.some((issue) => issue.path.endsWith('baseUrl'))).toBe(true);
  });

  it('drops tracks whose provider is unknown, or which lack an identity or language', () => {
    const { value, issues } = normalizeSubtitleProvidersDocument({
      providers: [provider()],
      tracks: [
        track({ id: 'orphan', providerId: 'ghost-subs' }),
        track({ id: 'no-identity', identityId: '' }),
        track({ id: 'no-language', language: '  ' }),
        track(),
      ],
    });
    expect(value.tracks.map((entry) => entry.id)).toEqual(['trk-1']);
    expect(issues.filter((issue) => issue.message.includes('requires a known provider'))).toHaveLength(3);
  });

  it('de-duplicates tracks by ID and by identical release description', () => {
    const { value, issues } = normalizeSubtitleProvidersDocument({
      providers: [provider()],
      tracks: [
        track({ id: 'trk-1', episode: 3 }),
        track({ id: 'trk-1', episode: 4 }),
        track({ id: 'trk-2', episode: 3 }),
      ],
    });
    expect(value.tracks).toHaveLength(1);
    expect(issues.some((issue) => issue.message.includes('duplicate subtitle track ID'))).toBe(true);
    expect(issues.some((issue) => issue.message.includes('duplicate subtitle release'))).toBe(true);
  });

  it('normalizes a track\'s language, enums and quality block', () => {
    const [entry] = docOf({
      providers: [provider()],
      tracks: [track({ language: 'JA-jp', format: 'webvtt', style: 'karaoke', quality: { accuracy: 88, bogus: 5 } })],
    }).tracks;
    expect(entry.language).toBe('ja-jp');
    expect(entry.format).toBe('srt');
    expect(entry.style).toBe('full');
    expect(entry.quality.accuracy).toBe(88);
    expect(entry.quality.syncQuality).toBeNull();
    expect(subtitleTrackQualityScore(entry)).toBe(88);
  });
});

describe('format helpers', () => {
  it('separates sidecar files from embedded streams and styled formats', () => {
    expect(isSidecarSubtitleFormat('srt')).toBe(true);
    expect(isSidecarSubtitleFormat('embedded')).toBe(false);
    expect(subtitleFormatSupportsStyling('ass')).toBe(true);
    expect(subtitleFormatSupportsStyling('srt')).toBe(false);
  });
});

describe('subtitleProviderMatchSignals', () => {
  it('falls back to the shared default when a provider declares no rules', () => {
    const [bare] = docOf({ providers: [provider()] }).providers;
    expect(subtitleProviderMatchSignals(bare)).toEqual(DEFAULT_SUBTITLE_MATCH_SIGNALS);
    const [custom] = docOf({ providers: [provider({ matchSignals: ['title', 'duration'] })] }).providers;
    expect(subtitleProviderMatchSignals(custom)).toEqual(['title', 'duration']);
  });
});

describe('selectCapableSubtitleProviders', () => {
  const document = docOf({
    providers: [
      provider({ id: 'slow', name: 'Slow', priority: 50, languages: ['en'] }),
      provider({ id: 'jp-only', name: 'JP Only', priority: 10, languages: ['ja'], formats: ['ass'] }),
      provider({ id: 'anything', name: 'Anything', priority: 30 }),
      provider({ id: 'off', name: 'Off', priority: 1, enabled: false }),
    ],
  });

  it('skips disabled providers and orders by priority', () => {
    expect(selectCapableSubtitleProviders(document).map((entry) => entry.id)).toEqual(['jp-only', 'anything', 'slow']);
  });

  it('treats an empty language/format list as unrestricted', () => {
    expect(selectCapableSubtitleProviders(document, { language: 'ja' }).map((entry) => entry.id))
      .toEqual(['jp-only', 'anything']);
    expect(selectCapableSubtitleProviders(document, { language: 'ja', format: 'srt' }).map((entry) => entry.id))
      .toEqual(['anything']);
  });

  it('filters by a required matching signal', () => {
    const withSignals = docOf({
      providers: [
        provider({ id: 'hashy', name: 'Hashy', matchSignals: ['duration', 'language'] }),
        provider({ id: 'titley', name: 'Titley', matchSignals: ['title'] }),
      ],
    });
    expect(selectCapableSubtitleProviders(withSignals, { signal: 'duration' }).map((entry) => entry.id)).toEqual(['hashy']);
  });
});

describe('planSubtitleProviders', () => {
  it('reports no-enabled-providers before filtering', () => {
    const plan = planSubtitleProviders(docOf({ providers: [provider({ enabled: false })] }));
    expect(plan.status).toBe('no-enabled-providers');
    expect(plan.steps).toEqual([]);
  });

  it('reports no-capable-providers when the filter empties the list', () => {
    const plan = planSubtitleProviders(docOf({ providers: [provider({ languages: ['en'] })] }), { language: 'ko' });
    expect(plan.status).toBe('no-capable-providers');
    expect(plan.language).toBe('ko');
  });

  it('counts the tracks each step already contributes without executing anything', () => {
    const document = docOf({
      providers: [provider(), provider({ id: 'other-subs', name: 'Other Subs', priority: 200 })],
      tracks: [
        track({ id: 't1', episode: 1 }),
        track({ id: 't2', episode: 2 }),
        track({ id: 't3', identityId: 'mid-9999' }),
        track({ id: 't4', providerId: 'other-subs', language: 'en' }),
      ],
    });
    const plan = planSubtitleProviders(document, { identityId: 'mid-0001', language: 'ja' });
    expect(plan.status).toBe('ready');
    expect(plan.steps.map((step) => [step.providerId, step.knownTrackCount])).toEqual([
      ['kitsu-subs', 2],
      ['other-subs', 0],
    ]);
  });

  it('is deterministic for the same document and request', () => {
    const document = docOf({ providers: [provider(), provider({ id: 'b-subs', name: 'B' })] });
    expect(planSubtitleProviders(document, { language: 'ja' })).toEqual(planSubtitleProviders(document, { language: 'ja' }));
  });
});

describe('catalogue mutation', () => {
  const base = docOf({
    providers: [provider()],
    tracks: [track({ id: 't1' }), track({ id: 't2', language: 'en' })],
  });

  it('upserts a provider by ID without touching its tracks', () => {
    const { value } = upsertSubtitleProvider(base, provider({ name: 'Kitsu Subs (mirror)', priority: 5 }));
    expect(value.providers).toHaveLength(1);
    expect(value.providers[0].name).toBe('Kitsu Subs (mirror)');
    expect(value.tracks).toHaveLength(2);
  });

  it('removes a provider and cascades its tracks', () => {
    const next = removeSubtitleProvider(base, 'kitsu-subs');
    expect(next.providers).toHaveLength(0);
    expect(next.tracks).toHaveLength(0);
  });

  it('refuses a track whose provider does not exist', () => {
    const { value, issues } = upsertSubtitleTrack(base, track({ id: 't9', providerId: 'ghost' }));
    expect(value.tracks).toHaveLength(2);
    expect(issues.some((issue) => issue.message.includes('requires a known provider'))).toBe(true);
  });

  it('replaces a track by ID and removes a single track', () => {
    const { value } = upsertSubtitleTrack(base, track({ id: 't1', releaseGroup: 'Kitsu-Raws' }));
    expect(value.tracks.find((entry) => entry.id === 't1')?.releaseGroup).toBe('Kitsu-Raws');
    expect(removeSubtitleTrack(value, 't1').tracks.map((entry) => entry.id)).toEqual(['t2']);
  });

  it('lists an identity\'s tracks in stable order, optionally by language', () => {
    expect(selectSubtitleTracks(base, 'mid-0001').map((entry) => entry.id)).toEqual(['t2', 't1']);
    expect(selectSubtitleTracks(base, 'MID-0001', 'JA').map((entry) => entry.id)).toEqual(['t1']);
    expect(selectSubtitleTracks(base, 'mid-nope')).toEqual([]);
  });
});
