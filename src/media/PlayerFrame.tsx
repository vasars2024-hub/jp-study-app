/**
 * The player's opening frame: the picture of what is about to play, at once.
 *
 * It replaced a full-screen loader (and before that, "Media server stopped / starting /
 * Connecting to the media server… / Provisioning the media connection…" in turn). From the
 * click to the first decoded frame the viewer now sees the video's own picture — the last
 * frame they left it on, else its episode still or thumbnail — with one small "Opening …"
 * pill. Whatever happens underneath (the media server warming, restarting after a crash,
 * connecting, the file being probed) is not their business unless it fails, and then this
 * same frame says what failed, in their language, with a Retry that re-runs the open.
 *
 * Deliberately tiny and dependency-free: the host that renders it is in the boot graph,
 * and Blanc renders it too.
 */
import React, { useEffect, useState } from 'react';
import { useT } from '../renderer/i18n';
import './playerFrame.css';

/** After this long the pill says it is still working (a first start, a slow disk). */
const SLOW_AFTER_MS = 4000;

export type PlayerFrameFailure = {
  /** Translated, actionable sentence. */
  message: string;
  /** Raw diagnostic (English, paths, exit codes), behind a details line. */
  details?: string | null;
  onRetry?: () => void;
  retrying?: boolean;
};

export default function PlayerFrame({
  title,
  imageUrl,
  failure,
  onBack,
  compact = false,
  overlay = false,
}: {
  title?: string | null;
  /** A last frame, still or poster. Absent: a quiet dark frame. */
  imageUrl?: string | null;
  failure?: PlayerFrameFailure | null;
  onBack?: () => void;
  /** Blanc's small toolbox player. */
  compact?: boolean;
  /** Laid over a mounted player (until its first frame) rather than in place of it. */
  overlay?: boolean;
}): React.ReactElement {
  const { t } = useT();
  const [slow, setSlow] = useState(false);
  const [imageOk, setImageOk] = useState(true);
  useEffect(() => {
    setImageOk(true);
  }, [imageUrl]);
  useEffect(() => {
    setSlow(false);
    if (failure) return undefined;
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [failure, title]);

  const label = failure
    ? t('playback.failed.title')
    : slow
      ? t('playback.frame.slow')
      : title
        ? t('playback.frame.opening', { title })
        : t('playback.frame.openingVideo');

  return (
    <div
      className={`player-frame${compact ? ' player-frame--compact' : ''}${overlay ? ' player-frame--overlay' : ''}`}
      data-player-frame={failure ? 'failed' : 'opening'}
    >
      {imageUrl && imageOk ? (
        <img
          className="player-frame__image"
          src={imageUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          onError={() => setImageOk(false)}
        />
      ) : null}
      {failure ? (
        <div className="player-frame__failure" role="alert">
          <p className="player-frame__failure-title">{t('playback.failed.title')}</p>
          <p className="player-frame__failure-text">{failure.message}</p>
          {failure.details ? (
            <details className="player-frame__details">
              <summary>{t('playback.failed.details')}</summary>
              {failure.details}
            </details>
          ) : null}
          <div className="player-frame__actions">
            {failure.onRetry ? (
              <button
                type="button"
                className="player-frame__btn player-frame__btn--primary"
                onClick={failure.onRetry}
                disabled={failure.retrying}
                data-player-retry
              >
                {failure.retrying ? t('playback.failed.retrying') : t('playback.failed.retry')}
              </button>
            ) : null}
            {onBack ? (
              <button type="button" className="player-frame__btn" onClick={onBack}>
                {t('playback.failed.back')}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="player-frame__pill" role="status" aria-live="polite">
          <span className="player-frame__spinner" aria-hidden="true" />
          <span className="player-frame__label">{label}</span>
        </div>
      )}
    </div>
  );
}
