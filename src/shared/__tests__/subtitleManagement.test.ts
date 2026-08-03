import { describe, expect, it } from 'vitest';
import {
  clearSubtitleOffset,
  clearSubtitleVersionSelection,
  compareSubtitleVersions,
  createDefaultSubtitlePreferences,
  createEmptySubtitleManagementDocument,
  detectSubtitleOffset,
  listSubtitleVersions,
  listSupportedSubtitleLanguages,
  normalizeSubtitleManagementDocument,
  pickSubtitleVersion,
  planSubtitleSlots,
  resolveSubtitleLanguagePriority,
  resolveSubtitleOffset,
  selectSubtitleVersion,
  setSubtitleOffset,
  setSubtitlePreferences,
  shiftSubtitleOffset,
  summarizeAvailableSubtitles,
  SUBTITLE_OFFSET_LIMIT_MS,
  type SubtitleManagementDocument,
} from '../subtitleManagement';
import { normalizeSubtitleProvidersDocument, type SubtitleProvidersDocument } from '../subtitleProviders';

const shelf = (tracks: Record<string, unknown>[]): SubtitleProvidersDocument => normalizeSubtitleProvidersDocument({
  providers: [
    { id: 'alpha', name: 'Alpha' },
    { id: 'beta', name: 'Beta' },
  ],
  tracks: tracks.map((entry) => ({ providerId: 'alpha', identityId: 'mid-1', language: 'ja', ...entry })),
}).value;

const settings = (input: Record<string, unknown>): SubtitleManagementDocument =>
  normalizeSubtitleManagementDocument(input).value;

describe('normalizeSubtitleManagementDocument', () => {
  it('rejects a non-object and a future version', () => {
    expect(normalizeSubtitleManagementDocument(null).value).toEqual(createEmptySubtitleManagementDocument());
    const future = normalizeSubtitleManagementDocument({ version: 42, preferences: { primaryLanguage: 'ja' } });
    expect(future.value.preferences).toEqual(createDefaultSubtitlePreferences());
    expect(future.issues[0].path).toBe('version');
  });

  it('normalizes preference languages and clears a secondary that duplicates the primary', () => {
    const { value, issues } = normalizeSubtitleManagementDocument({
      preferences: {
        primaryLanguage: 'JA', secondaryLanguage: 'ja', style: 'karaoke',
        languagePriority: ['EN', 'en', 'zh_Hans'], preferredFormats: ['ass', 'mkv'],
      },
    });
    expect(value.preferences.primaryLanguage).toBe('ja');
    expect(value.preferences.secondaryLanguage).toBeNull();
    expect(value.preferences.style).toBe('full');
    expect(value.preferences.languagePriority).toEqual(['en', 'zh-hans']);
    expect(value.preferences.preferredFormats).toEqual(['ass']);
    expect(issues.some((issue) => issue.path.endsWith('secondaryLanguage'))).toBe(true);
  });

  it('clamps offsets, drops an episode override with no season, and de-duplicates scopes', () => {
    const { value, issues } = normalizeSubtitleManagementDocument({
      adjustments: [
        { identityId: 'mid-1', offsetMs: 999_999_999 },
        { identityId: 'mid-1', offsetMs: -500 },
        { identityId: 'mid-2', episode: 3, offsetMs: 250 },
      ],
    });
    expect(value.adjustments[0].offsetMs).toBe(SUBTITLE_OFFSET_LIMIT_MS);
    expect(value.adjustments).toHaveLength(2);
    expect(value.adjustments[1]).toMatchObject({ identityId: 'mid-2', season: null, episode: null, offsetMs: 250 });
    expect(issues.some((issue) => issue.message.includes('duplicate'))).toBe(true);
  });

  it('drops incomplete selections and de-duplicates by identity + language', () => {
    const { value } = normalizeSubtitleManagementDocument({
      selections: [
        { identityId: 'mid-1', language: 'ja', trackId: 't1' },
        { identityId: 'mid-1', language: 'ja', trackId: 't2' },
        { identityId: 'mid-1', trackId: 't3' },
      ],
    });
    expect(value.selections).toHaveLength(1);
    expect(value.selections[0].trackId).toBe('t1');
  });
});

describe('preferences projections', () => {
  it('resolves the language order as primary, secondary, then the explicit list', () => {
    const document = settings({ preferences: { primaryLanguage: 'ja', secondaryLanguage: 'en', languagePriority: ['en', 'zh'] } });
    expect(resolveSubtitleLanguagePriority(document.preferences)).toEqual(['ja', 'en', 'zh']);
    expect(resolveSubtitleLanguagePriority(createDefaultSubtitlePreferences())).toEqual([]);
  });

  it('offers the built-in languages plus the user\'s custom tags', () => {
    const document = settings({ preferences: { customLanguages: ['pt-br', 'ja'] } });
    const languages = listSupportedSubtitleLanguages(document.preferences);
    expect(languages).toContain('ja');
    expect(languages).toContain('pt-br');
    expect(languages.filter((entry) => entry === 'ja')).toHaveLength(1);
  });

  it('patches preferences through validation', () => {
    const { value } = setSubtitlePreferences(createEmptySubtitleManagementDocument(), { primaryLanguage: 'JA', style: 'forced' });
    expect(value.preferences.primaryLanguage).toBe('ja');
    expect(value.preferences.style).toBe('forced');
  });
});

describe('summarizeAvailableSubtitles', () => {
  it('groups a shelf by language, preferred first then alphabetical', () => {
    const document = shelf([
      { id: 'ja1', language: 'ja', format: 'ass', quality: { accuracy: 90 } },
      { id: 'ja2', language: 'ja', format: 'srt', releaseGroup: 'G' },
      { id: 'en1', language: 'en', quality: { accuracy: 60 } },
      { id: 'zh1', language: 'zh' },
    ]);
    const preferences = settings({ preferences: { primaryLanguage: 'ja', secondaryLanguage: 'en' } }).preferences;
    const summary = summarizeAvailableSubtitles(document, 'mid-1', preferences);
    expect(summary.map((entry) => entry.language)).toEqual(['ja', 'en', 'zh']);
    expect(summary[0]).toMatchObject({ trackCount: 2, bestQualityScore: 90, bestQualityGrade: 'excellent', preferred: true, preferenceRank: 0 });
    expect(summary[0].formats).toEqual(['ass', 'srt']);
    expect(summary[2]).toMatchObject({ preferred: false, preferenceRank: null, bestQualityScore: null, bestQualityGrade: 'unrated' });
  });

  it('returns an empty list for a shelf with nothing on it', () => {
    expect(summarizeAvailableSubtitles(shelf([]), 'mid-1')).toEqual([]);
  });
});

describe('listSubtitleVersions', () => {
  const document = shelf([
    { id: 'plain', language: 'ja', quality: { accuracy: 50 } },
    { id: 'great', language: 'ja', quality: { accuracy: 95 }, releaseGroup: 'Great' },
    { id: 'from-beta', providerId: 'beta', language: 'ja', quality: { accuracy: 10 } },
    { id: 'hi', language: 'ja', hearingImpaired: true, releaseGroup: 'HI' },
  ]);

  it('ranks by quality when no other preference applies', () => {
    const ranked = listSubtitleVersions(document, createEmptySubtitleManagementDocument(), 'mid-1', 'ja');
    expect(ranked.map((entry) => entry.track.id)).toEqual(['great', 'plain', 'from-beta', 'hi']);
    expect(ranked[0]).toMatchObject({ qualityScore: 95, qualityGrade: 'excellent', rank: 1, selected: false });
  });

  it('puts a preferred provider ahead of a better-rated release', () => {
    const ranked = listSubtitleVersions(document, settings({ preferences: { preferredProviderIds: ['beta'] } }), 'mid-1', 'ja');
    expect(ranked[0].track.id).toBe('from-beta');
  });

  it('prefers the configured style before translator and format', () => {
    // The preferred style wins even though the other release is rated far higher.
    const styled = shelf([
      { id: 'full', language: 'ja', style: 'full', quality: { accuracy: 99 } },
      { id: 'forced', language: 'ja', style: 'forced', quality: { accuracy: 20 } },
    ]);
    const ranked = listSubtitleVersions(styled, settings({ preferences: { style: 'forced' } }), 'mid-1', 'ja');
    expect(ranked[0].track.id).toBe('forced');
  });

  it('honours the preferred translator order', () => {
    const translated = shelf([
      { id: 'anon', language: 'ja', quality: { accuracy: 99 } },
      { id: 'known', language: 'ja', translator: 'Yuki Group', quality: { accuracy: 10 } },
    ]);
    const ranked = listSubtitleVersions(translated, settings({ preferences: { preferredTranslators: ['Yuki Group'] } }), 'mid-1', 'ja');
    expect(ranked[0].track.id).toBe('known');
  });

  it('excludes hearing-impaired releases when disallowed, unless that empties the shelf', () => {
    const disallow = settings({ preferences: { allowHearingImpaired: false } });
    expect(listSubtitleVersions(document, disallow, 'mid-1', 'ja').map((entry) => entry.track.id)).not.toContain('hi');
    const onlyHi = shelf([{ id: 'hi-only', language: 'ja', hearingImpaired: true }]);
    expect(listSubtitleVersions(onlyHi, disallow, 'mid-1', 'ja').map((entry) => entry.track.id)).toEqual(['hi-only']);
  });

  it('is deterministic for identical inputs', () => {
    const empty = createEmptySubtitleManagementDocument();
    expect(listSubtitleVersions(document, empty, 'mid-1', 'ja')).toEqual(listSubtitleVersions(document, empty, 'mid-1', 'ja'));
  });
});

describe('version selection', () => {
  const document = shelf([
    { id: 'top', language: 'ja', quality: { accuracy: 95 } },
    { id: 'other', language: 'ja', quality: { accuracy: 20 }, releaseGroup: 'O' },
    { id: 'english', language: 'en' },
  ]);

  it('pins a release and reports it as the pick', () => {
    const { value } = selectSubtitleVersion(document, createEmptySubtitleManagementDocument(), 'mid-1', 'other');
    expect(value.selections).toEqual([{ identityId: 'mid-1', language: 'ja', trackId: 'other', updatedAt: null }]);
    expect(pickSubtitleVersion(document, value, 'mid-1', 'ja')).toMatchObject({ reason: 'pinned', language: 'ja' });
    expect(pickSubtitleVersion(document, value, 'mid-1', 'ja').track?.id).toBe('other');
  });

  it('refuses a track that is not on the identity\'s shelf', () => {
    const { value, issues } = selectSubtitleVersion(document, createEmptySubtitleManagementDocument(), 'mid-2', 'top');
    expect(value.selections).toEqual([]);
    expect(issues[0].message).toContain('Unknown subtitle track');
  });

  it('replaces the pin for the same language rather than stacking selections', () => {
    const first = selectSubtitleVersion(document, createEmptySubtitleManagementDocument(), 'mid-1', 'other').value;
    const second = selectSubtitleVersion(document, first, 'mid-1', 'top').value;
    expect(second.selections).toHaveLength(1);
    expect(second.selections[0].trackId).toBe('top');
  });

  it('falls back to the ranked top when un-pinned, and reports none for an empty shelf', () => {
    const pinned = selectSubtitleVersion(document, createEmptySubtitleManagementDocument(), 'mid-1', 'other').value;
    const cleared = clearSubtitleVersionSelection(pinned, 'mid-1', 'JA');
    expect(cleared.selections).toEqual([]);
    expect(pickSubtitleVersion(document, cleared, 'mid-1', 'ja')).toMatchObject({ reason: 'ranked' });
    expect(pickSubtitleVersion(document, cleared, 'mid-1', 'ko')).toMatchObject({ reason: 'none', track: null });
  });
});

describe('planSubtitleSlots', () => {
  const document = shelf([
    { id: 'ja1', language: 'ja' },
    { id: 'en1', language: 'en' },
  ]);

  it('resolves the primary and secondary slots together', () => {
    const plan = planSubtitleSlots(document, settings({ preferences: { primaryLanguage: 'ja', secondaryLanguage: 'en' } }), 'mid-1');
    expect(plan.primary.track?.id).toBe('ja1');
    expect(plan.secondary?.track?.id).toBe('en1');
    expect(plan.missingLanguages).toEqual([]);
  });

  it('reports a configured language the shelf does not carry', () => {
    const plan = planSubtitleSlots(document, settings({ preferences: { primaryLanguage: 'ja', secondaryLanguage: 'ko' } }), 'mid-1');
    expect(plan.secondary?.track).toBeNull();
    expect(plan.missingLanguages).toEqual(['ko']);
  });

  it('falls back to the first available language when nothing is configured', () => {
    const plan = planSubtitleSlots(document, createEmptySubtitleManagementDocument(), 'mid-1');
    expect(plan.primary.language).toBe('en');
    expect(plan.secondary).toBeNull();
  });
});

describe('compareSubtitleVersions', () => {
  it('reports the differing fields and the quality delta', () => {
    const document = shelf([
      { id: 'a', language: 'ja', format: 'ass', releaseGroup: 'A', quality: { accuracy: 90 } },
      { id: 'b', language: 'ja', format: 'srt', releaseGroup: 'B', quality: { accuracy: 60 } },
    ]);
    const [left, right] = document.tracks;
    const comparison = compareSubtitleVersions(left, right);
    expect(comparison.identical).toBe(false);
    expect(comparison.differingFields.sort()).toEqual(['format', 'qualityScore', 'releaseGroup']);
    expect(comparison.qualityDelta).toBe(30);
    expect(comparison.fields.find((field) => field.field === 'language')?.equal).toBe(true);
  });

  it('returns a null delta when either side is unrated, and detects an identical pair', () => {
    const document = shelf([
      { id: 'a', language: 'ja', quality: { accuracy: 90 } },
      { id: 'b', language: 'ja', releaseGroup: 'B' },
    ]);
    const [left, right] = document.tracks;
    expect(compareSubtitleVersions(left, right).qualityDelta).toBeNull();
    expect(compareSubtitleVersions(left, left).identical).toBe(true);
  });
});

describe('subtitle sync offsets', () => {
  it('resolves the narrowest saved scope: episode, then season, then series', () => {
    const document = settings({
      adjustments: [
        { identityId: 'mid-1', offsetMs: 100 },
        { identityId: 'mid-1', season: 2, offsetMs: 200 },
        { identityId: 'mid-1', season: 2, episode: 5, offsetMs: 300 },
      ],
    });
    expect(resolveSubtitleOffset(document, { identityId: 'mid-1', season: 2, episode: 5 })).toEqual({ offsetMs: 300, scope: 'episode' });
    expect(resolveSubtitleOffset(document, { identityId: 'mid-1', season: 2, episode: 6 })).toEqual({ offsetMs: 200, scope: 'season' });
    expect(resolveSubtitleOffset(document, { identityId: 'mid-1', season: 3 })).toEqual({ offsetMs: 100, scope: 'series' });
    expect(resolveSubtitleOffset(document, { identityId: 'mid-9' })).toEqual({ offsetMs: 0, scope: 'none' });
  });

  it('writes an absolute offset at the target scope, replacing the previous value', () => {
    const first = setSubtitleOffset(createEmptySubtitleManagementDocument(), { identityId: 'mid-1' }, 450).value;
    const second = setSubtitleOffset(first, { identityId: 'mid-1' }, -450).value;
    expect(second.adjustments).toHaveLength(1);
    expect(second.adjustments[0].offsetMs).toBe(-450);
  });

  it('shifts relative to the inherited effective offset and writes at the narrower scope', () => {
    const series = setSubtitleOffset(createEmptySubtitleManagementDocument(), { identityId: 'mid-1' }, 1_000).value;
    const shifted = shiftSubtitleOffset(series, { identityId: 'mid-1', season: 1, episode: 4 }, -250).value;
    expect(resolveSubtitleOffset(shifted, { identityId: 'mid-1', season: 1, episode: 4 })).toEqual({ offsetMs: 750, scope: 'episode' });
    // The series-wide correction is untouched.
    expect(resolveSubtitleOffset(shifted, { identityId: 'mid-1' })).toEqual({ offsetMs: 1_000, scope: 'series' });
  });

  it('clears only the adjustment at the exact scope', () => {
    const document = settings({
      adjustments: [
        { identityId: 'mid-1', offsetMs: 100 },
        { identityId: 'mid-1', season: 1, episode: 2, offsetMs: 300 },
      ],
    });
    const cleared = clearSubtitleOffset(document, { identityId: 'mid-1', season: 1, episode: 2 });
    expect(cleared.adjustments).toHaveLength(1);
    expect(cleared.adjustments[0].season).toBeNull();
  });

  it('refuses an adjustment with no identity', () => {
    const { value, issues } = setSubtitleOffset(createEmptySubtitleManagementDocument(), { identityId: '  ' }, 100);
    expect(value.adjustments).toEqual([]);
    expect(issues[0].message).toContain('identity ID');
  });
});

describe('detectSubtitleOffset', () => {
  it('reports nothing for no usable anchors', () => {
    expect(detectSubtitleOffset([])).toEqual({ offsetMs: null, sampleCount: 0, spreadMs: 0, confidence: 'none' });
    expect(detectSubtitleOffset([{ subtitleMs: Number.NaN, referenceMs: 10 }]).confidence).toBe('none');
  });

  it('uses the median so one bad anchor cannot drag the estimate', () => {
    const result = detectSubtitleOffset([
      { subtitleMs: 1_000, referenceMs: 1_500 },
      { subtitleMs: 2_000, referenceMs: 2_510 },
      { subtitleMs: 3_000, referenceMs: 90_000 },
    ]);
    expect(result.offsetMs).toBe(510);
    expect(result.sampleCount).toBe(3);
    expect(result.confidence).toBe('low');
  });

  it('grades tight, agreeing anchors as high confidence', () => {
    const result = detectSubtitleOffset([
      { subtitleMs: 1_000, referenceMs: 1_400 },
      { subtitleMs: 2_000, referenceMs: 2_450 },
      { subtitleMs: 3_000, referenceMs: 3_500 },
    ]);
    expect(result.offsetMs).toBe(450);
    expect(result.spreadMs).toBe(100);
    expect(result.confidence).toBe('high');
  });

  it('averages the two middles on an even sample and clamps to the offset limit', () => {
    expect(detectSubtitleOffset([
      { subtitleMs: 0, referenceMs: 100 },
      { subtitleMs: 0, referenceMs: 300 },
    ])).toMatchObject({ offsetMs: 200, sampleCount: 2, confidence: 'medium' });
    expect(detectSubtitleOffset([{ subtitleMs: 0, referenceMs: 999_999_999 }]).offsetMs).toBe(SUBTITLE_OFFSET_LIMIT_MS);
  });
});
