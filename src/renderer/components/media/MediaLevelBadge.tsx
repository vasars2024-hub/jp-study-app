/**
 * A title's level and known-word share, as one small badge.
 *
 * Difficulty was analysed and stored (per episode, per season harvest, per
 * visual novel) and shown nowhere a learner chooses what to watch — the Gum
 * cards and title page had no level at all. This reads the one profile store
 * for every id a title owns and folds it into "N3 · 84% known", marking a
 * dictionary estimate as such.
 */
import { memo, useEffect, useState } from 'react';
import { summarizeMediaLevels, type MediaStudyDatabase } from '../../../shared/mediaStudyDatabase';
import { loadMediaStudyDatabase, onMediaStudyDatabaseChanged } from '../../mediaStudyStore';
import { useT } from '../../i18n';

let shared: MediaStudyDatabase | null = null;

function useMediaStudyDatabase(): MediaStudyDatabase {
  const [db, setDb] = useState<MediaStudyDatabase>(() => (shared ??= loadMediaStudyDatabase()));
  useEffect(
    () =>
      onMediaStudyDatabaseChanged((next) => {
        shared = next;
        setDb(next);
      }),
    [],
  );
  return db;
}

export interface MediaLevelBadgeProps {
  /** Every id the title answers to: its own, and each of its files'. */
  ids: readonly string[];
  /** A level already stored on the item (e.g. from metadata), used when nothing was analysed. */
  fallbackLevel?: string | null;
  className?: string;
}

export default memo(function MediaLevelBadge({ ids, fallbackLevel, className = '' }: MediaLevelBadgeProps) {
  const { t } = useT();
  const db = useMediaStudyDatabase();
  const summary = summarizeMediaLevels(db.profiles, ids);
  const level = summary?.level ?? fallbackLevel ?? null;
  const known = summary?.knownRatio ?? null;
  if (!level && known === null) return null;
  const pct = known === null ? null : Math.round(known * 100);
  const label = [
    level ? (summary?.estimated ? t('mediaLevel.estimated', { level }) : level) : null,
    pct === null ? null : t('mediaLevel.known', { pct }),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <span
      className={`media-level-badge ${className}`.trim()}
      title={summary?.estimated ? t('mediaLevel.estimatedHint') : t('mediaLevel.hint')}
    >
      {label}
    </span>
  );
});
