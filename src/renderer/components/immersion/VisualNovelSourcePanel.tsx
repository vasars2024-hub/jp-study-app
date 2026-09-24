import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import type {
  VisualNovelDatabase,
  VisualNovelEntry,
  VisualNovelMetadataPatch,
  VisualNovelRelease,
  VisualNovelSourceResult,
} from '../../../shared/visualNovel';
import {
  rankVisualNovelSourceResults,
  type VisualNovelLearnerContext,
} from '../../../shared/visualNovelRecommendations';
import VisualNovelArt from './VisualNovelArt';

function preferredReleaseFacts(
  releases: VisualNovelRelease[],
): { publisher: string; originalPlatform: string; platforms: string[] } {
  const complete = releases.filter((release) => (
    release.releaseType === 'complete' && !release.patch
  ));
  const preferred = complete.filter((release) => release.official);
  const candidates = preferred.length ? preferred : complete.length ? complete : releases;
  const dated = candidates
    .filter((release) => /^\d{4}(?:-\d{2})?(?:-\d{2})?$/.test(release.releaseDate))
    .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
  const original = dated[0] ?? candidates[candidates.length - 1];
  return {
    publisher: [...new Set(candidates.flatMap((release) => release.publishers))].join(', '),
    originalPlatform: original?.platforms[0] ?? '',
    platforms: [...new Set(releases.flatMap((release) => release.platforms))],
  };
}

export default function VisualNovelSourcePanel({
  entry,
  recommendationContext,
  onApplied,
  onStatus,
}: {
  entry: VisualNovelEntry;
  recommendationContext: VisualNovelLearnerContext;
  onApplied: (database: VisualNovelDatabase) => void;
  onStatus: (message: string, error?: boolean) => void;
}) {
  const { t } = useT();
  const [query, setQuery] = useState(entry.japaneseTitle || entry.title);
  const [results, setResults] = useState<VisualNovelSourceResult[]>([]);
  const [busy, setBusy] = useState(false);
  const rankedResults = rankVisualNovelSourceResults(results, recommendationContext);

  useEffect(() => {
    setQuery(entry.japaneseTitle || entry.title);
    setResults([]);
  }, [entry.id]);

  const search = async (): Promise<void> => {
    if (query.trim().length < 2) return;
    setBusy(true);
    const response = await window.api.visualNovelSearchSource(query);
    setBusy(false);
    if (!response.ok) {
      onStatus(response.error ?? t('vnSource.msg.searchFailed'), true);
      return;
    }
    setResults(response.results ?? []);
    onStatus(t('vnSource.msg.found', { count: response.results?.length ?? 0 }));
  };

  const apply = async (result: VisualNovelSourceResult): Promise<void> => {
    setBusy(true);
    const detailsResponse = await window.api.visualNovelSourceDetails(result.providerId);
    const releases = detailsResponse.ok && detailsResponse.details
      ? detailsResponse.details.releases
      : entry.releases;
    const releaseFacts = preferredReleaseFacts(releases);
    const patch: VisualNovelMetadataPatch = {
      japaneseTitle: result.japaneseTitle || entry.japaneseTitle,
      englishTitle: result.title || entry.englishTitle,
      alternativeTitles: [...entry.alternativeTitles, ...result.alternativeTitles],
      developer: result.developer || entry.developer,
      publisher: releaseFacts.publisher || entry.publisher,
      releaseDate: result.releaseDate || entry.releaseDate,
      originalPlatform: releaseFacts.originalPlatform || result.platforms[0] || entry.originalPlatform,
      platforms: [...new Set([
        ...entry.platforms,
        ...result.platforms,
        ...releaseFacts.platforms,
      ])],
      tags: result.tags.length ? result.tags : entry.tags,
      characters: result.characters.length ? result.characters : entry.characters,
      releases,
      synopsis: result.synopsis || entry.synopsis,
      estimatedPlaytimeHours: result.estimatedPlaytimeHours || entry.estimatedPlaytimeHours,
      sourceIds: { ...entry.sourceIds, [result.provider]: result.providerId },
      sourceUrl: result.sourceUrl,
      coverImageUrl: result.coverImageUrl || entry.coverImageUrl,
      screenshotUrls: result.screenshotUrls.length ? result.screenshotUrls : entry.screenshotUrls,
      communityRating: result.communityRating,
      communityVoteCount: result.communityVoteCount,
    };
    const response = await window.api.visualNovelUpdateMetadata(entry.id, patch);
    setBusy(false);
    if (!response.ok || !response.database) {
      onStatus(response.error ?? t('vnSource.msg.applyFailed'), true);
      return;
    }
    onApplied(response.database);
    onStatus(
      detailsResponse.ok
        ? t('vnSource.msg.applied', { count: releases.length, provider: result.providerId })
        : t('vnSource.msg.appliedNoDetails', { provider: result.providerId }),
    );
  };

  return (
    <details className="visual-novel-sources">
      <summary>{t('vnSource.head')}</summary>
      <div className="visual-novel-source-search">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('vnSource.searchPlaceholder')} />
        <button type="button" disabled={busy || query.trim().length < 2} onClick={() => void search()}>
          {busy ? t('vnSource.searching') : t('vnSource.search')}
        </button>
      </div>
      <div className="visual-novel-source-results">
        {rankedResults.map(({ item: result, reasons, score }) => (
          <article key={result.providerId}>
            {result.coverImageUrl && <VisualNovelArt src={result.coverImageUrl} />}
            <div>
              <strong>{result.title}</strong>
              <span>{result.japaneseTitle}</span>
              <small>
                {[result.releaseDate, result.developer, result.communityRating == null
                  ? ''
                  : `${result.communityRating}/10`].filter(Boolean).join(' · ')}
              </small>
              <small>{t('vnSource.studyMatch', { score })} · {reasons.slice(0, 2).join(' · ')}</small>
              {result.characters.length > 0 && <small>{t('vnSource.sourceCharacters', { count: result.characters.length })}</small>}
              <p>{result.synopsis.slice(0, 220)}</p>
            </div>
            <div>
              <button type="button" onClick={() => void window.api.openExternal(result.sourceUrl)}>{t('vnSource.view')}</button>
              <button type="button" disabled={busy} onClick={() => void apply(result)}>{t('vnSource.apply')}</button>
            </div>
          </article>
        ))}
      </div>
    </details>
  );
}
