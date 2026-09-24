import { useMemo, useState } from 'react';
import { buildWatchTrackingDashboard } from '../../mediaTrackingDashboard';
import { watchKindLabelKey, type WatchTitleView } from '../../../shared/watchLibrary';
import { LANG_TAGS } from '../../../shared/i18n/core';
import { useT } from '../../i18n';
import { useWatchTitles } from '../../useWatchTitles';
import { MediaTrackingCalendar } from './MediaTrackingCalendar';
import { WatchAiringStatus } from './WatchAiringStatus';

/**
 * The §11 tracking dashboard, over the watch library — the same list Gum
 * shows, MAL and Letterboxd imports included. The old renderer-only tracking
 * list is folded into it on first open (see `watchLegacyMigration.ts`).
 */
export function MediaTrackingDashboard({ onNavigate }: { onNavigate?: (titleId: string) => void }) {
  const { t, lang } = useT();
  const { titles, ready, error } = useWatchTitles();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sections = useMemo(() => buildWatchTrackingDashboard(titles), [titles]);
  const visible = sections.filter((section) => section.count > 0);
  const total = titles.length;

  const progressText = (card: WatchTitleView): string => (card.episodeCount
    ? `${card.progress ?? 0}/${card.episodeCount}`
    : t('media.tracking.watchedCount', { count: card.progress ?? 0 }));
  const airingText = (card: WatchTitleView): string | null => {
    if (!card.nextAiring) return null;
    const when = new Date(card.nextAiring.at).toLocaleString(LANG_TAGS[lang], {
      weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    return t('media.tracking.nextAiring', { episode: card.nextAiring.episode, when });
  };

  return (
    <section className="media-tracking-dashboard" aria-label={t('media.tracking.label')} aria-busy={!ready}>
      <div className="media-tracking-dashboard-head">
        <div>
          <p className="muted">{t('media.tracking.librarySubtitle')}</p>
        </div>
        <span className="media-tracking-dashboard-count" role="status" aria-live="polite">
          {ready ? t('media.tracking.entryCount', { count: total }) : t('media.tracking.loading')}
        </span>
      </div>
      <WatchAiringStatus />
      {!ready ? <p className="muted" role="status">{t('media.tracking.loadingLong')}</p>
        : error ? <p className="media-tracking-error" role="alert">{error}</p>
          : visible.length === 0 ? <p className="muted">{t('media.tracking.empty')}</p> : (
            <div className="media-tracking-shelves">
              {visible.map((section) => (
                <div className="media-tracking-shelf" key={section.id}>
                  <div className="media-tracking-shelf-head">
                    <h3>{t(section.labelKey)}</h3>
                    <span className="muted">{section.count}</span>
                  </div>
                  <div className="media-tracking-cards">
                    {section.cards.map((card) => {
                      const airing = airingText(card);
                      return (
                        <button
                          type="button"
                          className={`media-tracking-card ${selectedId === card.id ? 'is-selected' : ''}`}
                          key={`${section.id}:${card.id}`}
                          onClick={() => { setSelectedId(card.id); onNavigate?.(card.id); }}
                          aria-label={t('media.tracking.openCard', { title: card.title })}
                          aria-current={selectedId === card.id ? 'true' : undefined}
                        >
                          <strong>{card.title}</strong>
                          <span className="muted">{t(watchKindLabelKey(card.kind))} · {progressText(card)}</span>
                          {airing && <span className="muted">{airing}</span>}
                        </button>
                      );
                    })}
                  </div>
                  {section.count > section.cards.length && (
                    <span className="muted">{t('media.tracking.moreCount', { count: section.count - section.cards.length })}</span>
                  )}
                </div>
              ))}
            </div>
          )}
      {ready && !error && <MediaTrackingCalendar titles={titles} />}
    </section>
  );
}
