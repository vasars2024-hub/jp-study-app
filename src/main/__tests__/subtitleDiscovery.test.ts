// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { __subtitleDiscoveryTestables, pickPlaybackSubtitle } from '../subtitleDiscovery';

// subtitleDiscovery registers IPC and reads userData at module load; stub just
// enough for it to import. The functions under test are pure over their inputs.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'subdisc-test-'));

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot },
  ipcMain: { handle: () => undefined },
  BrowserWindow: { getAllWindows: () => [] },
  net: { request: () => undefined },
  safeStorage: { isEncryptionAvailable: () => false },
}));

// vi.mock is hoisted above imports by vitest, so a static import is safe here
// and avoids top-level await (which this tsconfig's module target rejects).
const { scoreCandidates, toProvidersDocument, recentlyFailed, hasLanguage, retainedOnForce,
  hasUnattachedSidecar } = __subtitleDiscoveryTestables;

type Candidate = Parameters<typeof scoreCandidates>[0][number];

const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  providerId: 'opensubtitles',
  providerItemId: 'os:1',
  language: 'ja',
  format: 'srt',
  releaseName: 'The Big O - 07 [BDRip]',
  season: null,
  episode: 7,
  releaseGroup: null,
  hearingImpaired: false,
  hashMatch: false,
  downloads: 100,
  fetchToken: '1',
  ...over,
});

const item = {
  id: 'm1',
  title: 'The Big O - 07',
  seriesTitle: 'The Big O',
  seriesKey: 'the big o',
  fileName: 'The Big O - 07.mkv',
  path: 'C:/x/The Big O - 07.mkv',
  addedAt: 1,
  episode: 7,
  season: null as unknown as undefined,
  durationSec: 1425,
} as Parameters<typeof scoreCandidates>[1];

describe('toProvidersDocument', () => {
  it('gives Jimaku only the signals it can actually support', () => {
    // Jimaku is keyed on an AniList id, so its file names are not a title signal
    // and must not be allowed to reject a correct hit.
    const doc = toProvidersDocument([candidate({ providerId: 'jimaku' })], 'the big o', 1425);
    expect(doc.providers[0].matchSignals).toEqual(['language', 'episode']);
  });

  it('gives OpenSubtitles the full signal set', () => {
    const doc = toProvidersDocument([candidate()], 'the big o', 1425);
    expect(doc.providers[0].matchSignals).toContain('title');
    expect(doc.providers[0].matchSignals).toContain('season');
  });

  it('maps lrc onto srt, which the track model has no member for', () => {
    const doc = toProvidersDocument([candidate({ format: 'lrc' })], 'x', null);
    expect(doc.tracks[0].format).toBe('srt');
  });
});

describe('scoreCandidates', () => {
  it('accepts a matching episode in the wanted language', () => {
    const accepted = scoreCandidates([candidate()], item, 'ja', 50);
    expect(accepted).toHaveLength(1);
    expect(accepted[0].score).toBeGreaterThan(0);
  });

  it('rejects a subtitle for the wrong episode however good it otherwise looks', () => {
    // The central safety property: a wrong-episode subtitle is worse than none,
    // because the user only discovers it minutes into watching.
    const accepted = scoreCandidates(
      [candidate({ episode: 12, releaseName: 'The Big O - 12 [BDRip]', downloads: 99_999 })],
      item,
      'ja',
      0,
    );
    expect(accepted).toEqual([]);
  });

  it('refuses a numbered track for an item the library cannot number', () => {
    // A creditless opening is not episode 1, and the matcher alone cannot say so: a null
    // target episode makes that signal `unknown`, so language and title carry the whole
    // decision and every episode of the series looks acceptable. Three items in the real
    // library were auto-attached `The Big O.E01.Bandai.ja.srt` exactly this way, within one
    // second of each other — found 2026-08-24.
    const extra = {
      ...item,
      title: 'The Big O - Creditless Opening',
      fileName: 'The Big O - Creditless Opening.mkv',
      episode: null,
    } as typeof item;
    const numbered = scoreCandidates(
      [candidate({ episode: 1, releaseName: 'The Big O.E01.Bandai.ja.srt' })],
      extra,
      'ja',
      0,
    );
    expect(numbered).toEqual([]);

    // Not a blanket refusal of unnumbered items: a track that declares no episode either is
    // exactly the right track for a film or a one-shot, and still attaches.
    const unnumbered = scoreCandidates(
      [candidate({ episode: null, releaseName: 'The Big O - Creditless Opening.ja.srt' })],
      extra,
      'ja',
      0,
    );
    expect(unnumbered).toHaveLength(1);
  });

  it('does not let a hash match rescue the wrong episode', () => {
    const accepted = scoreCandidates(
      [candidate({ episode: 3, hashMatch: true })],
      item,
      'ja',
      0,
    );
    expect(accepted).toEqual([]);
  });

  it('promotes a hash match to the threshold and ranks it first', () => {
    const accepted = scoreCandidates(
      [
        candidate({ providerItemId: 'os:plain', downloads: 5000 }),
        candidate({ providerItemId: 'os:hash', hashMatch: true, downloads: 1 }),
      ],
      item,
      'ja',
      50,
    );
    expect(accepted[0].candidate.providerItemId).toBe('os:hash');
  });

  it('ignores candidates in other languages', () => {
    expect(scoreCandidates([candidate({ language: 'en' })], item, 'ja', 0)).toEqual([]);
  });

  it('matches a regional variant against its base language', () => {
    const accepted = scoreCandidates([candidate({ language: 'ja-jp' })], item, 'ja', 0);
    expect(accepted).toHaveLength(1);
  });

  it('drops everything below the configured confidence', () => {
    const accepted = scoreCandidates([candidate()], item, 'ja', 100);
    expect(accepted.every((entry) => entry.score >= 100)).toBe(true);
  });

  it('returns nothing for an empty candidate list', () => {
    expect(scoreCandidates([], item, 'ja', 0)).toEqual([]);
  });
});

describe('failure memory', () => {
  it('treats a recent failure as still fresh and an old one as retryable', () => {
    const base = {
      id: 'm1', title: 't', fileName: 'f', path: 'p', addedAt: 1,
      subtitleFailures: [
        { providerId: 'jimaku', lang: 'ja', attemptedAt: Date.now() - 1_000, reason: 'no-match' },
        { providerId: 'opensubtitles', lang: 'ja', attemptedAt: Date.now() - 30 * 86_400_000, reason: 'no-match' },
      ],
    } as Parameters<typeof recentlyFailed>[0];
    expect(recentlyFailed(base, 'jimaku', 'ja', 7)).toBe(true);
    expect(recentlyFailed(base, 'opensubtitles', 'ja', 7)).toBe(false);
    expect(recentlyFailed(base, 'jimaku', 'en', 7)).toBe(false);
  });

  it('retries immediately when the retry window is zero', () => {
    const base = {
      id: 'm1', title: 't', fileName: 'f', path: 'p', addedAt: 1,
      subtitleFailures: [{ providerId: 'jimaku', lang: 'ja', attemptedAt: Date.now(), reason: 'x' }],
    } as Parameters<typeof recentlyFailed>[0];
    expect(recentlyFailed(base, 'jimaku', 'ja', 0)).toBe(false);
  });
});

describe('hasLanguage', () => {
  const record = (lang: string) => ({
    id: lang, lang, source: 'provider' as const, format: 'srt' as const, path: 'p', addedAt: 1,
  });

  it('matches on the base language so ja-JP satisfies a request for ja', () => {
    expect(hasLanguage([record('ja-jp')], 'ja')).toBe(true);
    expect(hasLanguage([record('ja')], 'ja')).toBe(true);
    expect(hasLanguage([record('en')], 'ja')).toBe(false);
    expect(hasLanguage([], 'ja')).toBe(false);
  });
});

describe('pickPlaybackSubtitle', () => {
  const rec = (over: Partial<import('../../shared/subtitleRecord').SubtitleRecord>) => ({
    id: 'r', lang: 'en', source: 'provider' as const, format: 'srt' as const,
    path: 'p', addedAt: 1, ...over,
  });

  it('hands back nothing when there is nothing', () => {
    expect(pickPlaybackSubtitle(undefined)).toBeNull();
    expect(pickPlaybackSubtitle([])).toBeNull();
  });

  it('prefers the study language over every other consideration', () => {
    // The English track is embedded (the strongest source) and the Japanese one
    // is a mere download, yet Japanese is the whole point of the app.
    const best = pickPlaybackSubtitle([
      rec({ id: 'en', lang: 'en', source: 'embedded' }),
      rec({ id: 'ja', lang: 'ja', source: 'provider' }),
    ]);
    expect(best?.id).toBe('ja');
  });

  it('prefers a locally-timed track over a download within a language', () => {
    const best = pickPlaybackSubtitle([
      rec({ id: 'dl', lang: 'ja', source: 'provider', confidence: 99 }),
      rec({ id: 'emb', lang: 'ja', source: 'embedded' }),
    ]);
    expect(best?.id).toBe('emb');
  });

  it('ranks a machine transcript last, since only it can be wrong about the words', () => {
    const best = pickPlaybackSubtitle([
      rec({ id: 'gen', lang: 'ja', source: 'generated', machineGenerated: true }),
      rec({ id: 'dl', lang: 'ja', source: 'provider' }),
    ]);
    expect(best?.id).toBe('dl');
  });

  it('breaks a same-source tie on confidence', () => {
    const best = pickPlaybackSubtitle([
      rec({ id: 'low', lang: 'ja', source: 'provider', confidence: 60 }),
      rec({ id: 'high', lang: 'ja', source: 'provider', confidence: 95 }),
    ]);
    expect(best?.id).toBe('high');
  });

  it('still returns something when the study language is absent', () => {
    expect(pickPlaybackSubtitle([rec({ id: 'en', lang: 'en' })])?.id).toBe('en');
  });

  it('honours a non-Japanese preference and regional tags', () => {
    const records = [rec({ id: 'ja', lang: 'ja' }), rec({ id: 'en', lang: 'en-us' })];
    expect(pickPlaybackSubtitle(records, 'en')?.id).toBe('en');
  });

  it('does not mutate the caller list', () => {
    const records = [rec({ id: 'a', lang: 'en' }), rec({ id: 'b', lang: 'ja' })];
    const order = records.map((r) => r.id);
    pickPlaybackSubtitle(records);
    expect(records.map((r) => r.id)).toEqual(order);
  });

  /*
    The user's own choice. Everything above is a ranking over tracks nobody has ruled on;
    once the library says "this one", a ranking that overrules it is the ranking being
    wrong — and the symptom is the player opening a different track than the row that was
    just clicked.
  */
  it('an explicit choice outranks the study language', () => {
    const records = [
      rec({ id: 'ja', lang: 'ja', source: 'embedded' }),
      rec({ id: 'en', lang: 'en', source: 'provider' }),
    ];
    expect(pickPlaybackSubtitle(records)?.id).toBe('ja');
    expect(pickPlaybackSubtitle(records, 'ja', 'en')?.id).toBe('en');
  });

  it('an explicit choice outranks source rank inside a language', () => {
    const records = [
      rec({ id: 'emb', lang: 'ja', source: 'embedded' }),
      rec({ id: 'gen', lang: 'ja', source: 'generated', machineGenerated: true }),
    ];
    expect(pickPlaybackSubtitle(records)?.id).toBe('emb');
    expect(pickPlaybackSubtitle(records, 'ja', 'gen')?.id).toBe('gen');
  });

  it('falls back to the ranking when the chosen track is gone, rather than to nothing', () => {
    const records = [rec({ id: 'ja', lang: 'ja', source: 'sidecar' })];
    // A removed track must not leave the item with no subtitle at all.
    expect(pickPlaybackSubtitle(records, 'ja', 'deleted-id')?.id).toBe('ja');
    expect(pickPlaybackSubtitle([], 'ja', 'deleted-id')).toBeNull();
  });

  it('ignores an empty choice instead of treating it as a track id', () => {
    const records = [rec({ id: 'ja', lang: 'ja' }), rec({ id: 'en', lang: 'en' })];
    expect(pickPlaybackSubtitle(records, 'ja', '')?.id).toBe('ja');
  });
});

describe('retainedOnForce', () => {
  const rec = (source: 'embedded' | 'sidecar' | 'provider' | 'generated', id: string) => ({
    id, lang: 'ja', source, format: 'srt' as const, path: `p/${id}`, addedAt: 1,
  });

  it('keeps a machine transcript, which a re-search cannot reproduce', () => {
    // The data-loss bug this guards: "Search now" passes force:true, and force
    // used to clear every record. A Whisper transcript would be orphaned on disk,
    // Analyze Japanese would revert to "Transcribe & analyze", and the user would
    // pay for the whole transcription again.
    const kept = retainedOnForce([rec('generated', 'whisper')]);
    expect(kept.map((r) => r.id)).toEqual(['whisper']);
  });

  it('drops everything the pipeline rediscovers on its own', () => {
    const kept = retainedOnForce([
      rec('embedded', 'e'), rec('sidecar', 's'), rec('provider', 'p'),
    ]);
    expect(kept).toEqual([]);
  });

  it('keeps only the transcript out of a mixed set', () => {
    const kept = retainedOnForce([
      rec('embedded', 'e'), rec('generated', 'g'), rec('provider', 'p'),
    ]);
    expect(kept.map((r) => r.id)).toEqual(['g']);
  });

  it('handles an item that has no records at all', () => {
    expect(retainedOnForce(undefined)).toEqual([]);
    expect(retainedOnForce([])).toEqual([]);
  });
});

describe('hasUnattachedSidecar', () => {
  // The defect this covers, reproduced live on 2026-08-15: an English `.en.vtt`
  // sitting beside a video whose Japanese sidecar was already attached could
  // never be discovered, because `autoDownloadLanguages` is `['ja']` by default
  // and every wanted language was therefore already present — so the item was
  // skipped before any scan ran. EN→JA fusion needs exactly that English track,
  // which is why the plan recorded its blocker as "input, not code". It was code.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'subdisc-sidecar-'));
  const video = path.join(dir, 'Podcast #13.mp4');
  fs.writeFileSync(video, '');
  fs.writeFileSync(path.join(dir, 'Podcast #13.ja.vtt'), 'WEBVTT\n');
  fs.writeFileSync(path.join(dir, 'Podcast #13.en.vtt'), 'WEBVTT\n');

  const mediaItem = (subtitles: unknown[]) =>
    ({ id: 'm1', path: video, subtitles } as Parameters<typeof hasUnattachedSidecar>[0]);

  it('finds the English sidecar when only the Japanese one is attached', () => {
    expect(hasUnattachedSidecar(mediaItem([
      { id: 'r1', lang: 'ja', source: 'sidecar', format: 'vtt', addedAt: 1,
        path: path.join(dir, 'Podcast #13.ja.vtt') },
    ]))).toBe(true);
  });

  it('is false once both languages are attached', () => {
    expect(hasUnattachedSidecar(mediaItem([
      { id: 'r1', lang: 'ja', source: 'sidecar', format: 'vtt', addedAt: 1,
        path: path.join(dir, 'Podcast #13.ja.vtt') },
      { id: 'r2', lang: 'en', source: 'sidecar', format: 'vtt', addedAt: 1,
        path: path.join(dir, 'Podcast #13.en.vtt') },
    ]))).toBe(false);
  });

  it('does not re-offer a language another source already holds', () => {
    // A generated `en` track means the `.en.vtt` would add no language, so the
    // item must not be re-visited on every sweep for the rest of its life.
    expect(hasUnattachedSidecar(mediaItem([
      { id: 'r1', lang: 'ja', source: 'sidecar', format: 'vtt', addedAt: 1,
        path: path.join(dir, 'Podcast #13.ja.vtt') },
      { id: 'r2', lang: 'en', source: 'generated', format: 'srt', addedAt: 1, path: 'x/en.srt' },
    ]))).toBe(false);
  });

  it('is false for a media file whose directory does not exist', () => {
    expect(hasUnattachedSidecar({
      id: 'm2', path: path.join(dir, 'nope', 'gone.mp4'), subtitles: [],
    } as Parameters<typeof hasUnattachedSidecar>[0])).toBe(false);
  });
});
