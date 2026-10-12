/**
 * Study progress for one YouTube playlist (7.6): how much of it is watched,
 * how well the pre-studied videos are understood, how many cards came from it,
 * and the one button that matters — pick up where you left off, or start the
 * next unwatched video. Built from the same per-video facts the rows show
 * (the player's resume store, the comprehension cache, the deck).
 */
import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../i18n';
import { loadDeck, onDeckChanged } from '../../flashcardDeck';
import type { MediaItem } from '../../../shared/types';
import type { YtVideo } from '../../../shared/ytPlaylists';
import type { YtWatchState } from '../../../shared/ytWatchProgress';
import { yt5PlaylistProgress, type Yt5ComprehensionEntry } from '../../../shared/youtubeStudy5';
import './yt5.css';

/** Deck cards per video: by the downloaded file, its library id, or the YouTube id the pre-study list uses. */
function minedByVideo(videos: readonly YtVideo[], mediaById: ReadonlyMap<string, MediaItem>): Map<string, number> {
  const keyToVideo = new Map<string, string>();
  for (const video of videos) {
    keyToVideo.set(`youtube:${video.youtubeId}`, video.id);
    if (!video.mediaItemId) continue;
    keyToVideo.set(video.mediaItemId, video.id);
    keyToVideo.set(`media-${video.mediaItemId}`, video.id);
    const path = mediaById.get(video.mediaItemId)?.path;
    if (path) keyToVideo.set(path, video.id);
  }
  const counts = new Map<string, number>();
  if (!keyToVideo.size) return counts;
  for (const card of loadDeck()) {
    const id = [card.bookId, card.sourceRef?.mediaId, card.sourceUrl]
      .map((key) => (key ? keyToVideo.get(key) : undefined))
      .find(Boolean);
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export default function YoutubePlaylistProgress({
  videos,
  watchByVideoId,
  mediaById,
  comprehension,
  onOpen,
}: {
  videos: readonly YtVideo[];
  watchByVideoId: ReadonlyMap<string, YtWatchState>;
  mediaById: ReadonlyMap<string, MediaItem>;
  comprehension: Readonly<Record<string, Yt5ComprehensionEntry>>;
  onOpen: (video: YtVideo) => void;
}) {
  const { t } = useT();
  const [deckStamp, setDeckStamp] = useState(0);
  useEffect(() => onDeckChanged(() => setDeckStamp((n) => n + 1)), []);
  // deckStamp is the deck's change signal, not an input.
  const mined = useMemo(() => minedByVideo(videos, mediaById), [videos, mediaById, deckStamp]);
  const progress = useMemo(() => yt5PlaylistProgress(videos.map((video) => {
    const watch = watchByVideoId.get(video.id);
    return {
      id: video.id,
      position: video.position,
      downloaded: video.downloaded && !!video.mediaItemId,
      removedFromYouTube: video.removedFromYouTube,
      watch: watch ? (watch.kind === 'watched' ? { kind: 'watched' as const } : { kind: 'resume' as const, fraction: watch.fraction }) : null,
      knownPct: comprehension[video.youtubeId]?.knownPct,
      mined: mined.get(video.id) ?? 0,
    };
  })), [videos, watchByVideoId, comprehension, mined]);

  if (!progress.total) return null;
  const next = progress.next ? videos.find((video) => video.id === progress.next?.id) ?? null : null;
  const facts = [
    t('yt5.progress.watched', { watched: progress.watched, count: progress.total }),
    progress.inProgress ? t('yt5.progress.inProgress', { count: progress.inProgress }) : '',
    t('yt5.progress.downloaded', { downloaded: progress.downloaded, count: progress.total }),
    progress.avgKnownPct != null ? t('yt5.progress.known', { percent: progress.avgKnownPct, count: progress.measured }) : '',
    progress.mined ? t('yt5.progress.mined', { count: progress.mined }) : '',
  ].filter(Boolean);

  return (
    <section className="yt5-progress" aria-label={t('yt5.progress.aria')} data-yt5-progress={progress.progressPct}>
      <div
        className="yt5-progress-meter"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.progressPct}
        aria-label={t('yt5.progress.pct', { percent: progress.progressPct })}
      >
        <span style={{ width: `${progress.progressPct}%` }} />
      </div>
      <p className="yt5-progress-facts">
        <strong>{t('yt5.progress.pct', { percent: progress.progressPct })}</strong>
        {facts.map((fact) => <span key={fact}>{fact}</span>)}
      </p>
      {next && progress.next && progress.next.reason !== 'download' && (
        <button
          type="button"
          className="btn small primary yt5-progress-next"
          data-yt5-action="continue"
          title={next.title}
          onClick={() => onOpen(next)}
        >
          {progress.next.reason === 'resume'
            ? t('yt5.progress.resume', { title: next.title })
            : t('yt5.progress.next', { title: next.title })}
        </button>
      )}
      {next && progress.next?.reason === 'download' && (
        <small className="muted">{t('yt5.progress.toDownload', { title: next.title })}</small>
      )}
      {!progress.next && <small className="muted">{t('yt5.progress.done')}</small>}
    </section>
  );
}
