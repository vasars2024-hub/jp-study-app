/**
 * Import & automation: bring a MyAnimeList or Letterboxd history in from its
 * export file (no accounts), and see what happens to new files on their own.
 *
 * Both drop zones feed the same `watch:importFile`, which detects the format by
 * content; a card only decides which file picker hint and which stats to show.
 * "Automatic" hosts the ingest settings (`MediaWatchFoldersPanel`: auto-import of
 * finished downloads, the watch-folder list, qBittorrent status), which are live;
 * the pipeline stages that have no switch of their own yet say they are always on
 * and link to where their providers are configured.
 */
import { useEffect, useMemo, useState, type DragEvent } from 'react';
import type { WatchImportRecord } from '../../../../shared/watchLibrary';
import { showToast } from '../../ui';
import { useT } from '../../../i18n';
import GumIcon from './GumIcons';
import MediaWatchFoldersPanel from '../../mediaIngest/MediaWatchFoldersPanel';
import type { GumTitle } from './gumModel';

type Source = 'mal' | 'letterboxd';

interface ImportOutcome {
  source: Source;
  byStatus: Record<string, number>;
  added: number;
  updated: number;
  unchanged: number;
  total: number;
  unmatchedCount: number;
}

export interface GumImportProps {
  titles: GumTitle[];
  onBack: () => void;
  backLabel: string;
  onOpenSettings: (settingId: 'media-providers' | 'subtitle-providers') => void;
}

function formatNumber(n: number, lang: string): string {
  try {
    return new Intl.NumberFormat(lang).format(n);
  } catch {
    return String(n);
  }
}

function ImportCard({
  source,
  busy,
  outcome,
  last,
  stats,
  onFile,
  onChoose,
}: {
  source: Source;
  busy: boolean;
  outcome: ImportOutcome | null;
  last: WatchImportRecord | undefined;
  stats: Array<{ n: number; label: string }>;
  onFile: (path: string) => void;
  onChoose: () => void;
}) {
  const { t, lang } = useT();
  const [over, setOver] = useState(false);
  /*
   * The zone CLAIMS the drag. The desktop's file-drop router (`DropRouter`) listens on
   * `window` for the same four events, so without `stopPropagation` an export dropped
   * here was imported AND handed to the router, which showed "Drop to file it away"
   * and then asked where the file should go (offering the Dictionary). React's
   * synthetic `stopPropagation` stops the native event at the root, before `window`.
   */
  const claim = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.stopPropagation();
  };
  const onDragOver = (event: DragEvent<HTMLDivElement>): void => {
    claim(event);
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    if (!over) setOver(true);
  };
  const onDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    claim(event);
    // Leaving for a child of the zone is not leaving the zone.
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    setOver(false);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    claim(event);
    setOver(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    const path = window.api?.getFilePath?.(file);
    if (path) onFile(path);
  };
  const lastLine = outcome
    ? t('gum.import.result', {
      total: formatNumber(outcome.total, lang),
      added: formatNumber(outcome.added, lang),
      updated: formatNumber(outcome.updated, lang),
    })
    : last
      ? t('gum.import.last', {
        date: new Date(last.at).toLocaleDateString(lang),
        added: formatNumber(last.added, lang),
        updated: formatNumber(last.updated, lang),
      })
      : t(`gum.import.${source}.keeps`);
  return (
    <section className="gum-import-card" aria-labelledby={`gum-import-${source}`}>
      <header className="gum-import-card__head">
        <span className={`gum-import-card__logo gum-import-card__logo--${source}`} aria-hidden="true">
          {source === 'mal' ? 'MAL' : <><i /><i /><i /></>}
        </span>
        <div>
          <h2 id={`gum-import-${source}`}>{t(`gum.import.${source}.title`)}</h2>
          <small>{t(`gum.import.${source}.hint`)}</small>
        </div>
      </header>
      <div
        className="gum-drop"
        data-over={over ? 'true' : undefined}
        data-busy={busy ? 'true' : undefined}
        onDragEnter={onDragOver}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <GumIcon name="import" size={24} style={{ transform: 'rotate(180deg)' }} />
        {busy ? (
          <span role="status">{t('gum.import.working')}</span>
        ) : (
          <span>
            {t(`gum.import.${source}.drop`)}{' '}
            <button type="button" className="gum-link gum-link--accent" onClick={onChoose}>{t('gum.import.choose')}</button>
          </span>
        )}
      </div>
      <div className="gum-stats">
        {stats.map((stat) => (
          <div key={stat.label} className="gum-stat">
            <strong>{formatNumber(stat.n, lang)}</strong>
            <span>{stat.label}</span>
          </div>
        ))}
      </div>
      <p className={`gum-import-card__foot${outcome || last ? ' is-ok' : ''}`} role={outcome ? 'status' : undefined}>
        {lastLine}
        {outcome && outcome.unmatchedCount > 0 ? ` · ${t('gum.import.unmatched', { count: outcome.unmatchedCount })}` : ''}
      </p>
    </section>
  );
}

function AutoRow({ title, detail, children }: { title: string; detail: string; children?: React.ReactNode }) {
  return (
    <div className="gum-auto">
      <div className="gum-auto__copy">
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      {children && <div className="gum-auto__control">{children}</div>}
    </div>
  );
}

export default function GumImport({ titles, onBack, backLabel, onOpenSettings }: GumImportProps) {
  const { t, lang } = useT();
  const [busy, setBusy] = useState<Source | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [history, setHistory] = useState<WatchImportRecord[]>([]);

  useEffect(() => {
    let live = true;
    void window.api?.watchImportHistory?.()
      .then((records) => { if (live) setHistory(records); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [outcome]);

  const stats = useMemo(() => {
    const mal = titles.filter((title) => title.sources.includes('mal-export') || title.sources.includes('mal-sync'));
    const lb = titles.filter((title) => title.sources.includes('letterboxd'));
    const count = (list: GumTitle[], predicate: (title: GumTitle) => boolean): number => list.filter(predicate).length;
    return {
      mal: [
        { n: count(mal, (title) => title.status === 'watching' || title.status === 'rewatching'), label: t('watchLibrary.status.watching') },
        { n: count(mal, (title) => title.status === 'completed'), label: t('watchLibrary.status.completed') },
        { n: count(mal, (title) => title.status === 'plan'), label: t('watchLibrary.status.plan') },
        { n: count(mal, (title) => title.status === 'dropped'), label: t('watchLibrary.status.dropped') },
      ],
      letterboxd: [
        { n: count(lb, (title) => title.status === 'completed'), label: t('gum.import.stat.filmsWatched') },
        { n: count(lb, (title) => title.score !== undefined), label: t('gum.import.stat.rated') },
        { n: count(lb, (title) => title.status === 'plan'), label: t('gum.import.stat.watchlist') },
        { n: new Set(lb.flatMap((title) => title.view?.lists ?? [])).size, label: t('gum.import.stat.lists') },
      ],
    };
  }, [titles, lang]);

  const runImport = async (expected: Source, path: string): Promise<void> => {
    setBusy(expected);
    try {
      const result = await window.api.watchImportFile(path);
      if (!result.ok) {
        showToast({ message: t(result.errorKey, result.errorParams), kind: 'error' });
        return;
      }
      const source: Source = result.source === 'letterboxd' ? 'letterboxd' : 'mal';
      setOutcome({
        source,
        byStatus: result.byStatus as Record<string, number>,
        added: result.added,
        updated: result.updated,
        unchanged: result.unchanged,
        total: result.total,
        unmatchedCount: result.unmatchedCount,
      });
      showToast({ message: t('gum.import.done', { total: result.total, source: source === 'mal' ? 'MyAnimeList' : 'Letterboxd' }), kind: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : String(error), kind: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const choose = async (source: Source): Promise<void> => {
    const path = await window.api.watchChooseImportFile?.();
    if (path) await runImport(source, path);
  };

  const lastFor = (source: Source): WatchImportRecord | undefined =>
    history.find((record) => (source === 'mal' ? record.source === 'mal-export' : record.source === 'letterboxd'));

  return (
    <div className="gum-page gum-import">
      <header className="gum-import__head">
        <button type="button" className="gum-link" onClick={onBack}>← {backLabel}</button>
        <h1>{t('gum.import.title')}</h1>
        <p className="gum-muted">{t('gum.import.detail')}</p>
      </header>

      <div className="gum-import__grid">
        <ImportCard
          source="mal"
          busy={busy === 'mal'}
          outcome={outcome?.source === 'mal' ? outcome : null}
          last={lastFor('mal')}
          stats={stats.mal}
          onFile={(path) => void runImport('mal', path)}
          onChoose={() => void choose('mal')}
        />
        <ImportCard
          source="letterboxd"
          busy={busy === 'letterboxd'}
          outcome={outcome?.source === 'letterboxd' ? outcome : null}
          last={lastFor('letterboxd')}
          stats={stats.letterboxd}
          onFile={(path) => void runImport('letterboxd', path)}
          onChoose={() => void choose('letterboxd')}
        />
      </div>

      <section className="gum-import-card gum-import-card--wide" aria-labelledby="gum-auto-heading">
        <header>
          <h2 id="gum-auto-heading">{t('gum.auto.title')}</h2>
          <small>{t('gum.auto.detail')}</small>
        </header>
        <div className="gum-auto-grid">
          {/* The ingest engineer's panel: the auto-import switch, the watch-folder list
              (auto-added folders marked) and the qBittorrent line, live on
              `onMediaIngestState`. It replaces the old single "Choose watch folder". */}
          {/* The panel carries its own "Watch folders" heading and the auto-import switch,
              so this card adds only the sentence that says what they cover. */}
          <div className="gum-auto gum-auto--panel">
            <p className="gum-auto__lede">{t('gum.auto.downloadsDetail')}</p>
            <MediaWatchFoldersPanel />
          </div>
          <AutoRow title={t('gum.auto.sort')} detail={t('gum.auto.sortDetail')}>
            <span className="gum-pill">{t('gum.auto.always')}</span>
          </AutoRow>
          <AutoRow title={t('gum.auto.covers')} detail={t('gum.auto.coversDetail')}>
            <button type="button" className="gum-btn gum-btn--ghost gum-btn--sm" onClick={() => onOpenSettings('media-providers')}>{t('gum.auto.configure')}</button>
          </AutoRow>
          <AutoRow title={t('gum.auto.subtitles')} detail={t('gum.auto.subtitlesDetail')}>
            <button type="button" className="gum-btn gum-btn--ghost gum-btn--sm" onClick={() => onOpenSettings('subtitle-providers')}>{t('gum.auto.configure')}</button>
          </AutoRow>
          <AutoRow title={t('gum.auto.translate')} detail={t('gum.auto.translateDetail')}>
            <span className="gum-pill">{t('gum.auto.always')}</span>
          </AutoRow>
        </div>
      </section>
    </div>
  );
}
