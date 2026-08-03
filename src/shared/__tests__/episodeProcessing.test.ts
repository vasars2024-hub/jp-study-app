// @vitest-environment node
import { parseHTML } from 'linkedom';
import { describe, expect, it } from 'vitest';
import { extractEpisodes, processEpisodes, type ExtractedEpisode } from '../episodeProcessing';
import { getScraperPreset, mergeScraperSettings } from '../scraperSettings';

describe('episode extraction runtime', () => {
  it('uses fallback selectors and applies cleanup, classification, normalization, and deduplication', () => {
    const { document } = parseHTML(`<main>
      <a class="episode" href="/season-2/episode-02"> Episode &amp; 02 </a>
      <a class="episode" href="/season-2/episode-02">duplicate</a>
      <a class="episode" hidden href="/ova-01">OVA 01</a>
    </main>`);
    const settings = mergeScraperSettings(getScraperPreset('balanced'), {
      extraction: { cssSelectors: ['.missing', '.episode'], regexPattern: 'episode', regexFlags: 'i' },
    });
    const episodes = extractEpisodes(document, settings);
    expect(episodes).toHaveLength(1);
    expect(episodes[0]).toMatchObject({ title: 'Episode & 02', episodeNumber: 2, seasonNumber: 2 });
  });
});

describe('episode processing runtime', () => {
  const episode = (patch: Partial<ExtractedEpisode>): ExtractedEpisode => ({
    title: 'Episode', url: '/episode', episodeNumber: 1, seasonNumber: 1,
    kind: 'episode', audio: 'unknown', sources: ['/episode'], ...patch,
  });

  it('merges mirrors using audio/language/resolution preferences, sorts, filters, renames, and reports gaps', () => {
    const settings = mergeScraperSettings(getScraperPreset('balanced'), {
      episodeProcessing: { ignoreFiller: true, renameEpisodes: true },
    });
    const result = processEpisodes([
      episode({ url: '/e3', episodeNumber: 3, audio: 'subbed', language: 'ja', resolution: 720, sources: ['/e3'] }),
      episode({ url: '/e1-low', audio: 'subbed', language: 'ja', resolution: 720, sources: ['/e1-low'] }),
      episode({ url: '/e1-high', audio: 'subbed', language: 'ja', resolution: 1080, sources: ['/e1-high'] }),
      episode({ url: '/e2', episodeNumber: 2, filler: true, sources: ['/e2'] }),
    ], settings);
    expect(result.episodes.map((item) => item.url)).toEqual(['/e1-high', '/e3']);
    expect(result.episodes[0].sources).toEqual(expect.arrayContaining(['/e1-low', '/e1-high']));
    expect(result.episodes.map((item) => item.title)).toEqual(['S01E01', 'S01E03']);
    expect(result.missingEpisodeNumbers).toEqual([2]);
  });
});
