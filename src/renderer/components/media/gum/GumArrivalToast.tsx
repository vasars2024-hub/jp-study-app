/**
 * "Frieren · Episode 5 downloaded" — the announcement a finished download earns.
 * One at a time, newest wins, dismissed by its own close button, by Play, or after
 * a while; `role="status"` so it is read without stealing focus.
 */
import { useEffect, useMemo } from 'react';
import type { MediaIngestedEvent } from '../../../../shared/mediaIngest';
import type { MediaItem } from '../../../../shared/types';
import { ContextualSurface } from '../../liquid/LiquidSurface';
import { useT } from '../../../i18n';
import GumIcon from './GumIcons';
import { GumArt } from './GumCards';
import { titleIndex } from './gumShelves';
import type { GumTitle } from './gumModel';

const TOAST_MS = 14_000;

export default function GumArrivalToast({
  event,
  titles,
  onDismiss,
  onPlay,
  onOpenTitle,
}: {
  event: MediaIngestedEvent | null;
  titles: GumTitle[];
  onDismiss: () => void;
  onPlay: (item: MediaItem) => void;
  onOpenTitle: (title: GumTitle) => void;
}) {
  const { t } = useT();
  useEffect(() => {
    if (!event) return undefined;
    const timer = window.setTimeout(onDismiss, TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [event, onDismiss]);
  const resolved = useMemo(() => {
    if (!event) return null;
    const index = titleIndex(titles);
    for (const id of event.itemIds) {
      const title = index.get(id);
      const item = title?.items.find((candidate) => candidate.id === id);
      if (title && item) return { title, item };
    }
    return null;
  }, [event, titles]);
  if (!event) return null;
  const { summary } = event;
  const what = summary.episode !== undefined
    ? summary.episodeEnd !== undefined
      ? t('gum.toast.episodes', { from: summary.episode, to: summary.episodeEnd })
      : t('gum.toast.episode', { n: summary.episode })
    : summary.count > 1 ? t('gum.downloads.files', { count: summary.count }) : null;
  const heading = [summary.title, what].filter(Boolean).join(' · ');
  const status = resolved?.title.status;
  const detail = status === 'watching' || status === 'rewatching'
    ? t('gum.toast.addedToWatching')
    : t('gum.toast.added');
  return (
    <ContextualSurface className="gum-toast" role="status" aria-live="polite">
      <div className="gum-toast__art">{resolved ? <GumArt title={resolved.title} /> : null}</div>
      <div className="gum-toast__copy">
        <strong>{t('gum.toast.downloaded', { what: heading })}</strong>
        <span>{detail}</span>
        <div className="gum-toast__actions">
          {resolved && (
            <button type="button" className="gum-link gum-link--accent" onClick={() => { onPlay(resolved.item); onDismiss(); }}>
              {t('gum.toast.playNow')}
            </button>
          )}
          {resolved && (
            <button type="button" className="gum-link" onClick={() => { onOpenTitle(resolved.title); onDismiss(); }}>
              {t('gum.hero.details')}
            </button>
          )}
        </div>
      </div>
      <button type="button" className="gum-icon-btn gum-toast__close" onClick={onDismiss} aria-label={t('gum.toast.dismiss')}>
        <GumIcon name="close" size={12} />
      </button>
    </ContextualSurface>
  );
}
