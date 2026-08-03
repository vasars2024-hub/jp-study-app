import { useEffect, useMemo, useState } from 'react';
import { loadMediaTrackingSnapshot, type MediaTrackingLoadState } from '../../mediaTrackingStore';
import { buildMediaTrackingDashboard, selectMediaTrackingCard } from '../../mediaTrackingDashboard';
import { useT } from '../../i18n';
import { MediaTrackingCalendar } from './MediaTrackingCalendar';
import { MediaTrackingSources } from './MediaTrackingSources';

export function MediaTrackingDashboard({ titleFor, onNavigate }: { titleFor?: (identityId: string) => string; onNavigate?: (identityId: string) => void }) {
  const { t } = useT();
  const [snapshot, setSnapshot] = useState<MediaTrackingLoadState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => { setSnapshot(loadMediaTrackingSnapshot()); }, []);
  const sections = useMemo(() => buildMediaTrackingDashboard(snapshot?.document ?? { version: 1, records: [] }, titleFor), [snapshot, titleFor]);
  const visible = sections.filter((section) => section.cards.length > 0);
  return (
    <section className="media-tracking-dashboard" aria-label={t('media.tracking.label')} aria-busy={!snapshot}>
      <div className="media-tracking-dashboard-head">
        <div>
          <h2>{t('media.tracking.title')}</h2>
          <p className="muted">{t('media.tracking.subtitle')}</p>
        </div>
        <span className="media-tracking-dashboard-count" role="status" aria-live="polite">
          {snapshot
            ? t('media.tracking.entryCount', { count: sections.reduce((total, section) => total + section.count, 0) })
            : t('media.tracking.loading')}
        </span>
      </div>
      {!snapshot ? <p className="muted" role="status">{t('media.tracking.loadingLong')}</p> : snapshot.status === 'error' ? <p className="media-tracking-error" role="alert">{snapshot.error}</p> : visible.length === 0 ? <p className="muted">{t('media.tracking.empty')}</p> : (
        <div className="media-tracking-shelves">
          {visible.map((section) => (
            <div className="media-tracking-shelf" key={section.id}>
              <div className="media-tracking-shelf-head"><h3>{section.label}</h3><span className="muted">{section.count}</span></div>
              <div className="media-tracking-cards">
                {section.cards.map((card) => (
                  <button type="button" className={`media-tracking-card ${selectedId === card.identityId ? 'is-selected' : ''}`} key={`${section.id}:${card.identityId}`} onClick={() => selectMediaTrackingCard(card.identityId, setSelectedId, onNavigate)} aria-label={t('media.tracking.openCard', { title: card.title })} aria-current={selectedId === card.identityId ? 'true' : undefined}>
                    <strong>{card.title}</strong>
                    <span className="muted">
                      {card.contentType}
                      {' · '}
                      {card.progress.totalCount === null
                        ? t('media.tracking.watchedCount', { count: card.progress.watchedCount })
                        : `${card.progress.watchedCount}/${card.progress.totalCount}`}
                    </span>
                    {card.nextEpisodeNumber !== null && (
                      <span className="muted">{t('media.tracking.nextEpisode', { episode: card.nextEpisodeNumber })}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {snapshot?.status === 'ready' && <MediaTrackingCalendar document={snapshot.document} titleFor={titleFor} />}
      {snapshot?.status === 'ready' && <MediaTrackingSources identityId={selectedId ?? undefined} titleFor={titleFor} />}
    </section>
  );
}
