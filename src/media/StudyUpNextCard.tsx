/**
 * The "Up next" card at the end of an episode in the study player.
 *
 * What is decided where: which file comes next and whether to count down are pure rules in
 * `renderer/upNextEpisode.ts`, tested there. This component only listens to the element and
 * renders. It sets state on transitions alone — `ended`, the element being sent back into
 * the file, one tick per second of a countdown — never per frame.
 *
 * Opening the next episode goes through `openMediaWorkspace({ localFilePath })`, the same
 * `MEDIA_WORKSPACE_OPEN_EVENT` every other local open in the app raises, so the host's own
 * request path (resume position, transcode memo, open recovery) applies unchanged.
 */
import React from 'react';
import { useAtomValue } from 'jotai';
import { vc_videoElement } from '@/app/(main)/_features/video-core/video-core-atoms';
import { mediaWorkspaceHostExists } from '../shared/mediaWorkspace';
import type { MediaItem } from '../shared/types';
import { useT } from '../renderer/i18n';
import { openMediaWorkspace } from '../renderer/mediaWorkspaceBridge';
import {
  nextEpisodeAfter,
  readUpNextAutoplay,
  UP_NEXT_COUNTDOWN_SEC,
  upNextDecision,
  writeUpNextAutoplay,
} from '../renderer/upNextEpisode';
import './studyUpNext.css';

export default function StudyUpNextCard({
  localFilePath,
}: {
  /** The file playing now, as requested. `null` for a stream, which has no library series. */
  localFilePath: string | null;
}): React.ReactElement | null {
  const { t, lang } = useT();
  const video = useAtomValue(vc_videoElement);
  const [ended, setEnded] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const [next, setNext] = React.useState<MediaItem | null>(null);
  const [autoplay, setAutoplay] = React.useState(readUpNextAutoplay);
  const [remaining, setRemaining] = React.useState(UP_NEXT_COUNTDOWN_SEC);

  // A new file is a new episode: nothing ended, nothing dismissed, next unknown.
  React.useEffect(() => {
    setEnded(false);
    setDismissed(false);
    setNext(null);
  }, [localFilePath]);

  React.useEffect(() => {
    if (!video || !localFilePath) return;
    let cancelled = false;
    const onEnded = (): void => {
      setEnded(true);
      // Asked at the moment it matters, so an episode imported mid-session is found.
      if (typeof window.api?.listMedia !== 'function') return;
      void window.api.listMedia()
        .then((items) => {
          if (!cancelled) setNext(nextEpisodeAfter(items ?? [], localFilePath));
        })
        .catch(() => {
          if (!cancelled) setNext(null);
        });
    };
    // Sent back into the file — a practice loop seeking to its line, or the user scrubbing
    // or replaying — means this episode is not over. Withdraw rather than autoplay over it.
    const onResumed = (): void => {
      if (!video.ended) setEnded(false);
    };
    video.addEventListener('ended', onEnded);
    video.addEventListener('play', onResumed);
    video.addEventListener('seeking', onResumed);
    return () => {
      cancelled = true;
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('play', onResumed);
      video.removeEventListener('seeking', onResumed);
    };
  }, [localFilePath, video]);

  const decision = upNextDecision({ ended, hasNext: next != null, autoplay, dismissed });

  const playNow = React.useCallback((): void => {
    if (!next) return;
    setEnded(false);
    setDismissed(true);
    openMediaWorkspace({ localFilePath: next.path });
  }, [next]);

  // One tick per second while counting down; restarts from the top whenever the countdown
  // (re)starts, and is torn down the moment the card is dismissed or withdrawn.
  React.useEffect(() => {
    if (decision !== 'countdown') {
      setRemaining(UP_NEXT_COUNTDOWN_SEC);
      return;
    }
    let left = UP_NEXT_COUNTDOWN_SEC;
    setRemaining(left);
    const timer = window.setInterval(() => {
      left -= 1;
      if (left <= 0) {
        window.clearInterval(timer);
        playNow();
        return;
      }
      setRemaining(left);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [decision, playNow]);

  const episodeLine = React.useMemo(() => {
    if (!next || typeof next.episode !== 'number') return null;
    return typeof next.season === 'number' && next.season > 1
      ? t('studyLoop.resume.seasonEpisode', { season: next.season, episode: next.episode })
      : t('studyLoop.resume.episode', { episode: next.episode });
    // `lang` re-derives the line when the UI language changes.
  }, [next, t, lang]);

  if (decision === 'none' || !next || !mediaWorkspaceHostExists()) return null;

  // Never translated: a media title is study content.
  const title = next.title?.trim() || next.fileName;

  return (
    <section
      className="study-up-next"
      role="region"
      aria-label={t('studyLoop.resume.region', { title })}
      data-up-next={decision}
    >
      <p className="study-up-next-eyebrow">{t('studyLoop.resume.upNext')}</p>
      <p className="study-up-next-title" title={next.fileName}>{title}</p>
      {episodeLine && <p className="study-up-next-meta">{episodeLine}</p>}
      {decision === 'countdown' && (
        <p className="study-up-next-countdown" aria-live="polite">
          {t('studyLoop.resume.countdown', { count: remaining })}
        </p>
      )}
      <div className="study-up-next-actions">
        <button type="button" className="study-up-next-play" onClick={playNow}>
          {t('studyLoop.resume.playNow')}
        </button>
        <button
          type="button"
          className="study-up-next-cancel"
          onClick={() => setDismissed(true)}
        >
          {t('studyLoop.resume.cancel')}
        </button>
      </div>
      <label className="study-up-next-autoplay">
        <input
          type="checkbox"
          checked={autoplay}
          onChange={(event) => {
            const on = event.currentTarget.checked;
            setAutoplay(on);
            writeUpNextAutoplay(on);
          }}
        />
        <span>{t('studyLoop.resume.autoplay')}</span>
      </label>
    </section>
  );
}
