import { useState } from 'react';
import { useT } from '../../i18n';
import type {
  VisualNovelDatabase,
  VisualNovelEntry,
  VisualNovelSourceResult,
} from '../../../shared/visualNovel';
import {
  rankVisualNovelSourceResults,
  visualNovelCandidateRequest,
  type VisualNovelLearnerContext,
  type VisualNovelReasonCode,
  type VisualNovelRecommendation,
} from '../../../shared/visualNovelRecommendations';
import VisualNovelArt from './VisualNovelArt';
import { vndbFailureKey } from '../../../shared/visualNovelSourceFailure';

function reasonText(
  codes: readonly VisualNovelReasonCode[],
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  return codes.slice(0, 2).map((code) => t(code.key, code.vars)).join(' · ');
}

/**
 * "What next": the learner's own library ranked for them, plus — on request —
 * new candidates from VNDB. The library half only ever re-ranked titles the
 * user had already added; the VNDB half asks for Japanese-original, Japanese-
 * available titles sharing tags with what they finished or liked, excludes
 * everything already in the library, and ranks them by estimated difficulty
 * against the learner's level. One request per click; main rate-limits and
 * caches it.
 */
export default function VisualNovelRecommendationsPanel({
  context,
  recommendations,
  entries,
  onSelect,
  onAdded,
  onStatus,
}: {
  context: VisualNovelLearnerContext;
  recommendations: Array<VisualNovelRecommendation<VisualNovelEntry>>;
  entries: readonly VisualNovelEntry[];
  onSelect: (id: string) => void;
  onAdded: (database: VisualNovelDatabase, id: string) => void;
  onStatus: (message: string, error?: boolean) => void;
}) {
  const { t } = useT();
  const [candidates, setCandidates] = useState<Array<VisualNovelRecommendation<VisualNovelSourceResult>>>([]);
  const [busy, setBusy] = useState(false);

  const discover = async (): Promise<void> => {
    setBusy(true);
    const response = await window.api.visualNovelRecommendCandidates(visualNovelCandidateRequest(entries, context))
      .catch(() => ({ ok: false as const, results: undefined, error: undefined, errorCode: undefined }));
    setBusy(false);
    if (!response.ok || !response.results) {
      onStatus(t(vndbFailureKey(response.errorCode, 'vnRecs.discoverFailed')), true);
      return;
    }
    setCandidates(rankVisualNovelSourceResults(response.results, context).slice(0, 6));
  };

  const add = async (result: VisualNovelSourceResult): Promise<void> => {
    const created = await window.api.visualNovelAdd({
      title: result.title,
      japaneseTitle: result.japaneseTitle,
      language: 'ja',
    });
    const id = created.ok ? created.database?.entries[0]?.id : undefined;
    if (!created.ok || !id) {
      onStatus(created.error ?? t('vnRecs.addFailed'), true);
      return;
    }
    const updated = await window.api.visualNovelUpdateMetadata(id, {
      alternativeTitles: result.alternativeTitles,
      developer: result.developer,
      releaseDate: result.releaseDate,
      platforms: result.platforms,
      tags: result.tags,
      characters: result.characters,
      synopsis: result.synopsis,
      estimatedPlaytimeHours: result.estimatedPlaytimeHours,
      sourceIds: { [result.provider]: result.providerId },
      sourceUrl: result.sourceUrl,
      coverImageUrl: result.coverImageUrl,
      screenshotUrls: result.screenshotUrls,
      communityRating: result.communityRating,
      communityVoteCount: result.communityVoteCount,
    });
    const database = updated.ok && updated.database ? updated.database : created.database;
    if (database) onAdded(database, id);
    setCandidates((current) => current.filter((candidate) => candidate.item.providerId !== result.providerId));
    onStatus(t('vnRecs.added', { title: result.title }));
  };

  return (
    <section className="visual-novel-recommendations" aria-label={t('vnRecs.aria')}>
      <div className="visual-novel-reading-head">
        <strong>{t('vnRecs.head')}</strong>
        <span>
          {context.analyzedTitles
            ? t('vnRecs.personalized', {
              level: context.targetJlpt,
              percent: Math.round((context.knownCoverage ?? 0) * 100),
            })
            : t('vnRecs.analyzeFirst')}
        </span>
      </div>
      {recommendations.length > 0 && (
        <div>
          {recommendations.slice(0, 5).map((recommendation) => (
            // Up to five of these render, so the row count is data, not chrome.
            <button
              key={recommendation.item.id}
              className="visual-novel-recommendation-row"
              type="button"
              onClick={() => onSelect(recommendation.item.id)}
            >
              <span>
                <strong>{recommendation.item.title}</strong>
                <small>{reasonText(recommendation.reasonCodes, t)}</small>
              </span>
              <b>{recommendation.score}</b>
            </button>
          ))}
        </div>
      )}
      <div className="visual-novel-discover">
        <button type="button" disabled={busy} onClick={() => void discover()}>
          {busy ? t('vnRecs.discovering') : t('vnRecs.discover')}
        </button>
        {candidates.map(({ item, reasonCodes }) => (
          <article key={item.providerId} className="visual-novel-candidate">
            {item.coverImageUrl && <VisualNovelArt src={item.coverImageUrl} />}
            <div>
              <strong>{item.japaneseTitle || item.title}</strong>
              <small>{reasonText(reasonCodes, t)}</small>
              <span>
                <button type="button" onClick={() => void window.api.openExternal(item.sourceUrl)}>{t('vnRecs.view')}</button>
                <button type="button" onClick={() => void add(item)}>{t('vnRecs.add')}</button>
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
