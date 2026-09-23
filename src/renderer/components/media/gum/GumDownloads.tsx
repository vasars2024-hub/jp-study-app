/**
 * Downloads: the transfers themselves live in the Scraper's Torrent Manager (one
 * place that talks to qBittorrent); this page says whether finished downloads are
 * being picked up, and shows what arrived.
 */
import { useMemo, useState } from 'react';
import type { MediaItem } from '../../../../shared/types';
import { showToast } from '../../ui';
import { useT } from '../../../i18n';
import GumIcon from './GumIcons';
import { GumArt } from './GumCards';
import { useIngestState } from './gumBackend';
import type { GumArrival } from './gumLayout';
import { titleIndex } from './gumShelves';
import type { GumTitle } from './gumModel';

export interface GumDownloadsProps {
  titles: GumTitle[];
  arrivals: GumArrival[];
  onOpenTorrents: () => void;
  onOpenTitle: (title: GumTitle) => void;
  onPlayItem: (item: MediaItem) => void;
  onImport: () => void;
}

function ago(ms: number, lang: string): string {
  const minutes = Math.round((Date.now() - ms) / 60_000);
  try {
    const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
    if (minutes < 60) return rtf.format(-Math.max(0, minutes), 'minute');
    if (minutes < 60 * 24) return rtf.format(-Math.round(minutes / 60), 'hour');
    return rtf.format(-Math.round(minutes / 1440), 'day');
  } catch {
    return new Date(ms).toLocaleString(lang);
  }
}

export default function GumDownloads({ titles, arrivals, onOpenTorrents, onOpenTitle, onPlayItem, onImport }: GumDownloadsProps) {
  const { t, lang } = useT();
  const { state, set } = useIngestState();
  const [scanning, setScanning] = useState(false);
  const index = useMemo(() => titleIndex(titles), [titles]);
  const byId = useMemo(() => {
    const map = new Map<string, MediaItem>();
    for (const title of titles) for (const item of title.items) map.set(item.id, item);
    return map;
  }, [titles]);

  const qbit = state?.qbit.status ?? null;
  const rescan = async (): Promise<void> => {
    setScanning(true);
    try {
      set(await window.api.mediaIngestRescan());
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : String(error), kind: 'error' });
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="gum-page gum-downloads">
      <header className="gum-library__head">
        <div>
          <h1>{t('gum.downloads.title')}</h1>
          <p className="gum-muted">{t('gum.downloads.detail')}</p>
        </div>
        <div className="gum-downloads__actions">
          <button type="button" className="gum-btn gum-btn--primary" onClick={onOpenTorrents}>
            <GumIcon name="download" size={14} /> {t('gum.downloads.openTorrents')}
          </button>
          <button type="button" className="gum-btn gum-btn--ghost" onClick={() => void rescan()} disabled={scanning || !state} aria-busy={scanning}>
            {scanning ? t('gum.downloads.scanning') : t('gum.downloads.rescan')}
          </button>
        </div>
      </header>

      <div className="gum-status-cards">
        <div className="gum-status-card" data-tone={qbit === 'watching' ? 'ok' : qbit === 'unreachable' || qbit === 'unauthorized' ? 'warn' : 'idle'}>
          <span className="gum-status-card__dot" aria-hidden="true" />
          <div>
            <strong>qBittorrent</strong>
            <span>{qbit ? t(`gum.downloads.qbitStatus.${qbit}`) : t('gum.downloads.checking')}</span>
            {state?.qbit.lastCheckedAt ? <small>{t('gum.downloads.checked', { when: ago(state.qbit.lastCheckedAt, lang) })}</small> : null}
          </div>
        </div>
        <div className="gum-status-card" data-tone={state?.autoImport ? 'ok' : 'idle'}>
          <span className="gum-status-card__dot" aria-hidden="true" />
          <div>
            <strong>{t('gum.auto.downloads')}</strong>
            <span>{state ? t(state.autoImport ? 'gum.downloads.autoOn' : 'gum.downloads.autoOff') : t('gum.downloads.checking')}</span>
            <small>{t('gum.downloads.folders', { count: state?.folders.length ?? 0 })}</small>
          </div>
          <button type="button" className="gum-link" onClick={onImport}>{t('gum.auto.configure')}</button>
        </div>
      </div>

      <section className="gum-section" aria-labelledby="gum-arrivals">
        <header className="gum-section__head">
          <div><h2 id="gum-arrivals">{t('gum.downloads.arrived')}</h2></div>
        </header>
        {arrivals.length === 0 ? (
          <p className="gum-muted">{t('gum.downloads.none')}</p>
        ) : (
          <ul className="gum-arrivals">
            {arrivals.map((arrival) => {
              const first = arrival.itemIds.map((id) => byId.get(id)).find(Boolean);
              const title = first ? index.get(first.id) : undefined;
              const episodes = arrival.episode !== undefined
                ? arrival.episodeEnd !== undefined
                  ? t('gum.toast.episodes', { from: arrival.episode, to: arrival.episodeEnd })
                  : t('gum.toast.episode', { n: arrival.episode })
                : t('gum.downloads.files', { count: arrival.itemIds.length });
              return (
                <li key={`${arrival.at}-${arrival.itemIds[0]}`} className="gum-arrival">
                  <div className="gum-arrival__art">{title ? <GumArt title={title} /> : null}</div>
                  <div className="gum-arrival__copy">
                    <strong>{arrival.title || title?.title}</strong>
                    <span>{episodes} · {ago(arrival.at, lang)}</span>
                  </div>
                  <div className="gum-arrival__actions">
                    {first && (
                      <button type="button" className="gum-btn gum-btn--ghost gum-btn--sm" onClick={() => onPlayItem(first)}>
                        <GumIcon name="play" size={12} /> {t('gum.toast.play')}
                      </button>
                    )}
                    {title && (
                      <button type="button" className="gum-btn gum-btn--quiet gum-btn--sm" onClick={() => onOpenTitle(title)}>{t('gum.hero.details')}</button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
