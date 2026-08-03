import { useEffect, useMemo, useState } from 'react';
import {
  summarizeMediaStudySessions,
  type MediaStudyDatabase,
} from '../../../shared/mediaStudyDatabase';
import {
  loadMediaStudyDatabase,
  onMediaStudyDatabaseChanged,
} from '../../mediaStudyStore';

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export default function MediaLanguageProfileCard({ mediaId }: { mediaId: string }) {
  const [database, setDatabase] = useState<MediaStudyDatabase>(loadMediaStudyDatabase);
  useEffect(() => onMediaStudyDatabaseChanged(setDatabase), []);
  const profile = database.profiles[mediaId];
  const summary = useMemo(
    () => summarizeMediaStudySessions(database.sessions, mediaId),
    [database.sessions, mediaId],
  );

  if (!profile) return null;
  return (
    <section className="media-language-profile" aria-label={`Language profile for ${profile.title}`}>
      <div className="media-language-profile-head">
        <div>
          <span className="media-study-mode-kicker">Saved language profile</span>
          <h4>{profile.title}</h4>
        </div>
        <strong>{profile.difficulty.score}/100</strong>
      </div>
      <p>{profile.difficulty.recommendation}</p>
      <div className="media-study-metrics">
        <div><strong>{profile.difficulty.jlptLevel ?? 'Unrated'}</strong><span>{profile.difficulty.band}</span></div>
        <div><strong>{Math.round(profile.difficulty.knownRatio * 100)}%</strong><span>Known vocabulary</span></div>
        <div><strong>{profile.vocabulary.uniqueWords}</strong><span>Unique words</span></div>
        <div><strong>{profile.kanji.uniqueKanji}</strong><span>Unique kanji</span></div>
      </div>
      <div className="media-language-profile-study">
        <span>{summary.sessionCount} study sessions</span>
        <span>{formatDuration(summary.totalDurationSec)}</span>
        <span>{summary.cardsCreated} cards</span>
        <span>{summary.sentencesReviewed} sentences reviewed</span>
      </div>
      {profile.vocabulary.top.length > 0 && (
        <div className="media-language-profile-top">
          <strong>Frequent vocabulary</strong>
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
