import type { ScraperSettings } from './scraperSettings';

export type EpisodeAudio = 'subbed' | 'dubbed' | 'raw' | 'unknown';

export interface ExtractedEpisode {
  title: string;
  url: string;
  episodeNumber: number | null;
  seasonNumber: number | null;
  kind: 'episode' | 'special' | 'ova' | 'movie';
  audio: EpisodeAudio;
  language?: string;
  resolution?: number;
  filler?: boolean;
  recap?: boolean;
  sources: string[];
}

export interface EpisodeProcessingResult {
  episodes: ExtractedEpisode[];
  missingEpisodeNumbers: number[];
}

function decoded(value: string): string {
  const doc = globalThis.document;
  if (!doc) return value.replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
  const textarea = doc.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
}

function clean(value: string, settings: ScraperSettings): string {
  let next = settings.extraction.decodeHtmlEntities ? decoded(value) : value;
  if (settings.extraction.cleanText) next = next.replace(/\s+/g, ' ').trim();
  return next;
}

function inferEpisode(title: string, url: string, settings: ScraperSettings): Pick<ExtractedEpisode, 'episodeNumber' | 'seasonNumber' | 'kind'> {
  const haystack = `${title} ${url}`;
  const special = settings.extraction.detectSpecials && /\b(special|sp|ova|oad|movie|film)\b/i.exec(haystack)?.[1]?.toLowerCase();
  const kind = special === 'movie' || special === 'film' ? 'movie' : special === 'ova' || special === 'oad' ? 'ova' : special ? 'special' : 'episode';
  const seasonMatch = settings.extraction.detectSeasonNumbers ? /(?:season|s)[-_. ]*0*(\d+)/i.exec(haystack) : null;
  const episodeMatch = /(?:episode|ep|e)\s*[-_. ]*0*(\d+(?:\.\d+)?)/i.exec(haystack)
    ?? (/\b(\d+(?:\.\d+)?)\b/.exec(title));
  return {
    episodeNumber: settings.extraction.normalizeEpisodeNumbering && episodeMatch ? Number(episodeMatch[1]) : null,
    seasonNumber: seasonMatch ? Number(seasonMatch[1]) : null,
    kind,
  };
}

function isHidden(element: Element): boolean {
  if (element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') return true;
  const style = element.getAttribute('style')?.replace(/\s/g, '').toLowerCase() ?? '';
  return style.includes('display:none') || style.includes('visibility:hidden');
}

function selectedElements(root: ParentNode, settings: ScraperSettings): Element[] {
  for (const selector of settings.extraction.cssSelectors) {
    try {
      const matches = Array.from(root.querySelectorAll(selector));
      if (matches.length) return matches;
    } catch { /* Invalid overrides are ignored so fallbacks still run. */ }
  }
  const owner = (root as Node).nodeType === 9 ? root as Document : (root as Node).ownerDocument;
  if (owner?.evaluate) {
    for (const selector of settings.extraction.xpathSelectors) {
      try {
        const result = owner.evaluate(selector, root, null, 7);
        const matches = Array.from({ length: result.snapshotLength }, (_, index) => result.snapshotItem(index))
          .filter((node): node is Element => node?.nodeType === 1);
        if (matches.length) return matches;
      } catch { /* Continue through XPath fallbacks. */ }
    }
  }
  return [];
}

export function extractEpisodes(root: ParentNode, settings: ScraperSettings): ExtractedEpisode[] {
  let matcher: RegExp | null = null;
  if (settings.extraction.regexPattern) {
    try { matcher = new RegExp(settings.extraction.regexPattern, settings.extraction.regexFlags); } catch { matcher = null; }
  }
  const episodes = selectedElements(root, settings).flatMap((element): ExtractedEpisode[] => {
    if (settings.extraction.ignoreHiddenElements && isHidden(element)) return [];
    const title = clean(element.textContent ?? '', settings);
    const rawUrl = settings.extraction.attribute
      ? element.getAttribute(settings.extraction.attribute) ?? ''
      : element.textContent ?? '';
    const url = clean(rawUrl, settings);
    if (!url) return [];
    if (matcher) {
      matcher.lastIndex = 0;
      const match = matcher.exec(`${title} ${url}`);
      if (!match) return [];
    }
    return [{ title, url, ...inferEpisode(title, url, settings), audio: 'unknown', sources: [url] }];
  });
  if (!settings.extraction.removeDuplicateEpisodes) return episodes;
  const seen = new Set<string>();
  return episodes.filter((episode) => {
    const key = episode.url.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function preferenceIndex<T>(values: T[], value: T | undefined): number {
  const index = value === undefined ? -1 : values.indexOf(value);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

function preferred(a: ExtractedEpisode, b: ExtractedEpisode, settings: ScraperSettings): ExtractedEpisode {
  const processing = settings.episodeProcessing;
  const audio = processing.audioPreference;
  if (audio !== 'none' && a.audio !== b.audio) {
    if (a.audio === audio) return a;
    if (b.audio === audio) return b;
  }
  const language = preferenceIndex(processing.languagePriority, a.language) - preferenceIndex(processing.languagePriority, b.language);
  if (language !== 0) return language < 0 ? a : b;
  if (processing.keepHighestQuality) {
    const resolution = preferenceIndex(processing.resolutionPriority, a.resolution) - preferenceIndex(processing.resolutionPriority, b.resolution);
    if (resolution !== 0) return resolution < 0 ? a : b;
    if ((a.resolution ?? 0) !== (b.resolution ?? 0)) return (a.resolution ?? 0) > (b.resolution ?? 0) ? a : b;
  }
  return a;
}

export function processEpisodes(input: ExtractedEpisode[], settings: ScraperSettings): EpisodeProcessingResult {
  const processing = settings.episodeProcessing;
  let episodes = input.filter((episode) => !(processing.ignoreFiller && episode.filler) && !(processing.ignoreRecaps && episode.recap));
  if (processing.mergeDuplicateSources) {
    const merged = new Map<string, ExtractedEpisode>();
    for (const episode of episodes) {
      const key = `${episode.seasonNumber ?? 0}:${episode.kind}:${episode.episodeNumber ?? episode.title.toLowerCase()}`;
      const previous = merged.get(key);
      if (!previous) merged.set(key, { ...episode, sources: [...new Set([episode.url, ...episode.sources])] });
      else {
        const winner = preferred(previous, episode, settings);
        merged.set(key, { ...winner, sources: [...new Set([...previous.sources, previous.url, ...episode.sources, episode.url])] });
      }
    }
    episodes = [...merged.values()];
  }
  if (processing.renameEpisodes) {
    episodes = episodes.map((episode) => ({
      ...episode,
      title: episode.episodeNumber === null ? episode.title : `S${String(episode.seasonNumber ?? 1).padStart(2, '0')}E${String(episode.episodeNumber).padStart(2, '0')}`,
    }));
  }
  if (processing.naturalSort) {
    episodes.sort((a, b) => (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0)
      || (a.episodeNumber ?? Number.MAX_SAFE_INTEGER) - (b.episodeNumber ?? Number.MAX_SAFE_INTEGER)
      || a.title.localeCompare(b.title, undefined, { numeric: true }));
  }
  const numbered = episodes.filter((episode) => episode.kind === 'episode' && Number.isInteger(episode.episodeNumber)).map((episode) => episode.episodeNumber as number);
  const missingEpisodeNumbers: number[] = [];
  if (processing.detectMissingNumbers && numbered.length) {
    const available = new Set(numbered);
    for (let number = Math.min(...numbered); number <= Math.max(...numbered); number += 1) if (!available.has(number)) missingEpisodeNumbers.push(number);
  }
  return { episodes, missingEpisodeNumbers };
}
