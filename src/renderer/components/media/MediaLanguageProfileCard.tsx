import { useEffect, useMemo, useState } from 'react';
import {
  summarizeMediaStudySessions,
  type MediaStudyDatabase,
} from '../../../shared/mediaStudyDatabase';
import {
  loadMediaStudyDatabase,
  onMediaStudyDatabaseChanged,
} from '../../mediaStudyStore';
import { useT } from '../../i18n';
import { formatDuration } from '../../stats';
import { recommendationKind } from '../../mediaStudyWorkflow';

/**
 * `comfortable` never mentioned a JLPT level; the other two append one when the
 * profile has one. Exported so the test can enumerate every key this card can
 * ask for and prove all four catalogs answer — a key the catalogs are missing
 * renders as the key itself, which no catalog-hygiene check catches because the
 * key is not in `en` either.
 */
export function recommendationKey(difficulty: {
  knownRatio: number;
  jlptLevel: string | null;
}): string {
  const kind = recommendationKind(difficulty.knownRatio);
  const levelled = kind !== 'comfortable' && !!difficulty.jlptLevel;
  return `mediaProfile.recommendation.${kind}${levelled ? 'At' : ''}`;
}

const LEVEL_SORT = ['N5', 'N4', 'N3', 'N2', 'N1', 'N0', 'HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6', 'HSK7-9', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Unknown'];

/** One stacked bar per breakdown, easiest level first; nothing when empty. */
function LevelBreakdown({ label, distribution }: { label: string; distribution: Record<string, number> }) {
  const { t } = useT();
  const entries = Object.entries(distribution)
    .filter(([, n]) => n > 0)
    .sort((a, b) => (LEVEL_SORT.indexOf(a[0].replace(/\s+/g, '')) + 1 || 99) - (LEVEL_SORT.indexOf(b[0].replace(/\s+/g, '')) + 1 || 99));
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  if (!total || (entries.length === 1 && entries[0][0] === 'Unknown')) return null;
  return (
    <div className="media-level-breakdown">
      <strong>{label}</strong>
      <div className="media-level-breakdown-bar" role="img" aria-label={entries.map(([k, n]) => `${k === 'Unknown' ? t('mediaProfile.dist.unknown') : k}: ${Math.round((n / total) * 100)}%`).join(', ')}>
        {entries.map(([k, n], i) => (
          <i key={k} className={k === 'Unknown' ? 'is-unknown' : `lv-${i}`} style={{ flexGrow: n }} title={`${k === 'Unknown' ? t('mediaProfile.dist.unknown') : k} · ${n}`} />
        ))}
      </div>
      <span className="media-level-breakdown-legend">
        {entries.map(([k, n]) => (
          <span key={k}>{k === 'Unknown' ? t('mediaProfile.dist.unknown') : k} {Math.round((n / total) * 100)}%</span>
        ))}
      </span>
    </div>
  );
}

export default function MediaLanguageProfileCard({ mediaId }: { mediaId: string }) {
  const { t } = useT();
  const [database, setDatabase] = useState<MediaStudyDatabase>(loadMediaStudyDatabase);
  useEffect(() => onMediaStudyDatabaseChanged(setDatabase), []);
  const profile = database.profiles[mediaId];
  const summary = useMemo(
    () => summarizeMediaStudySessions(database.sessions, mediaId),
    [database.sessions, mediaId],
  );

  if (!profile) return null;
  return (
    <section
      className="media-language-profile"
      aria-label={t('mediaProfile.aria', { title: profile.title })}
    >
      <div className="media-language-profile-head">
        <div>
          <span className="media-study-mode-kicker">
            {t('mediaProfile.kicker')}
            {profile.scope && profile.scope.kind !== 'episode' && (
              <> · {t(`mediaProfile.scope.${profile.scope.kind}`, { range: profile.scope.label ?? '' })}</>
            )}
          </span>
          <h4>{profile.title}</h4>
        </div>
        <strong>{profile.difficulty.score}/100</strong>
      </div>
      {/* `difficulty.recommendation` is an English sentence FROZEN into the store
          at analysis time, so no language switch could ever reach it. Re-derived
          here from `knownRatio`, which is stored beside it — so profiles written
          before this change translate too, with no migration. */}
      <p>{t(recommendationKey(profile.difficulty), { level: profile.difficulty.jlptLevel ?? '' })}</p>
      <div className="media-study-metrics">
        <div>
          <strong title={profile.difficulty.levelSource === 'dictionary' ? t('mediaLevel.estimatedHint') : undefined}>
            {profile.difficulty.jlptLevel
              ? profile.difficulty.levelSource === 'dictionary'
                ? t('mediaLevel.estimated', { level: profile.difficulty.jlptLevel })
                : profile.difficulty.jlptLevel
              : t('mediaProfile.unrated')}
          </strong>
          {/* `band` is a machine token — beginner/intermediate/advanced/native — and
              was rendered raw, so the card read `native` in lower case in every
              language including English. */}
          <span>{t(`mediaProfile.band.${profile.difficulty.band}`)}</span>
        </div>
        <div><strong>{Math.round(profile.difficulty.knownRatio * 100)}%</strong><span>{t('mediaProfile.knownVocab')}</span></div>
        <div><strong>{profile.vocabulary.uniqueWords}</strong><span>{t('mediaProfile.uniqueWords')}</span></div>
        <div><strong>{profile.kanji.uniqueKanji}</strong><span>{t('mediaProfile.uniqueKanji')}</span></div>
      </div>
      <div className="media-language-profile-study">
        <span>{t('mediaProfile.sessionCount', { count: summary.sessionCount })}</span>
        {/* Was a local `formatDuration` returning `${minutes} min` / `${h}h ${m}m`.
            The shared one now speaks the interface language (D155) and also shows
            sub-minute totals as seconds instead of rounding them to `0 min`. */}
        <span>{formatDuration(summary.totalDurationSec)}</span>
        <span>{t('mediaProfile.cardCount', { count: summary.cardsCreated })}</span>
        <span>{t('mediaProfile.sentenceCount', { count: summary.sentencesReviewed })}</span>
      </div>
      {/* The level breakdowns were computed and stored with every analysis and
          never shown: which share of the words, kanji and grammar sits at each level. */}
      <LevelBreakdown label={t('mediaProfile.dist.words')} distribution={profile.vocabulary.jlptDistribution} />
      <LevelBreakdown label={t('mediaProfile.dist.kanji')} distribution={profile.kanji.jlptDistribution} />
      <LevelBreakdown label={t('mediaProfile.dist.grammar')} distribution={profile.grammar.jlptDistribution} />
      {profile.vocabulary.top.length > 0 && (
        <div className="media-language-profile-top">
          <strong>{t('mediaProfile.frequentVocab')}</strong>
          <div>
            {profile.vocabulary.top.slice(0, 8).map((entry) => (
              <span key={entry.word}>
                {entry.word}{entry.reading ? ` · ${entry.reading}` : ''} · {entry.occurrences}×
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
