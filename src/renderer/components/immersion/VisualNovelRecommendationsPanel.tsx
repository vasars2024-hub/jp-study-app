import type { VisualNovelEntry } from '../../../shared/visualNovel';
import type {
  VisualNovelLearnerContext,
  VisualNovelRecommendation,
} from '../../../shared/visualNovelRecommendations';

export default function VisualNovelRecommendationsPanel({
  context,
  recommendations,
  onSelect,
}: {
  context: VisualNovelLearnerContext;
  recommendations: Array<VisualNovelRecommendation<VisualNovelEntry>>;
  onSelect: (id: string) => void;
}) {
  if (!recommendations.length) return null;
  return (
    <section className="visual-novel-recommendations" aria-label="Study-aware recommendations">
      <div className="visual-novel-reading-head">
        <strong>Recommended next</strong>
        <span>
          {context.analyzedTitles
            ? `${context.targetJlpt} target · ${Math.round((context.knownCoverage ?? 0) * 100)}% coverage`
            : 'Analyze text to personalize'}
        </span>
      </div>
      <div>
        {recommendations.slice(0, 5).map((recommendation) => (
          <button
            key={recommendation.item.id}
            type="button"
            onClick={() => onSelect(recommendation.item.id)}
          >
            <span>
              <strong>{recommendation.item.title}</strong>
              <small>{recommendation.reasons.slice(0, 2).join(' · ')}</small>
            </span>
            <b>{recommendation.score}</b>
          </button>
        ))}
      </div>
    </section>
  );
}
