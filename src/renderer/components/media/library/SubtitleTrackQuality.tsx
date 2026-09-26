/**
 * A subtitle track's grade, the learner's rating, and "prefer this group".
 *
 * The grade (A–D) combines the match score, the timing lock and the learner's
 * own rating (shared/subtitleTrackGrade). Rating a track takes one click on a
 * star; the release group, when the provider named one, can be made a
 * preferred group, which ranks its releases first next time (discovery and the
 * torrent index both read the list).
 */
import { useState } from 'react';
import type { SubtitleRecord } from '../../../../shared/subtitleRecord';
import { subtitleTrackGrade } from '../../../../shared/subtitleTrackGrade';
import { useT } from '../../../i18n';

export function SubtitleTrackGradeChip({ track }: { track: SubtitleRecord }) {
  const { t } = useT();
  const grade = subtitleTrackGrade(track);
  if (!grade) return null;
  return (
    <span className={`subtitle-grade subtitle-grade--${grade}`} title={t('media.subtitles.gradeHint')}>
      {grade}
    </span>
  );
}

export default function SubtitleTrackQuality({ mediaId, track }: { mediaId: string; track: SubtitleRecord }) {
  const { t } = useT();
  const [rating, setRating] = useState(track.userRating ?? 0);
  const [preferred, setPreferred] = useState(false);

  const rate = (value: number) => {
    const next = value === rating ? 0 : value;
    setRating(next);
    void window.api.rateSubtitleRecord(mediaId, track.id, next).catch(() => setRating(rating));
  };

  const preferGroup = async () => {
    if (!track.releaseGroup) return;
    const settings = await window.api.getSubtitleDiscoverySettings();
    if (!settings.preferredGroups.includes(track.releaseGroup)) {
      await window.api.saveSubtitleDiscoverySettings({ ...settings, preferredGroups: [track.releaseGroup, ...settings.preferredGroups] });
    }
    setPreferred(true);
  };

  return (
    <span className="subtitle-quality">
      <span className="subtitle-stars" role="group" aria-label={t('media.subtitles.rate')}>
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            className={value <= rating ? 'is-on' : ''}
            aria-pressed={value <= rating}
            aria-label={t('media.subtitles.rateN', { n: value })}
            onClick={() => rate(value)}
          >
            ★
          </button>
        ))}
      </span>
      {track.releaseGroup && (
        <button type="button" className="subtitle-prefer" disabled={preferred} onClick={() => void preferGroup()}>
          {preferred ? t('media.subtitles.groupPreferred', { group: track.releaseGroup }) : t('media.subtitles.preferGroup', { group: track.releaseGroup })}
        </button>
      )}
    </span>
  );
}
