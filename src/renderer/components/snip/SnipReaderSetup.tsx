/**
 * Setting up the accurate reader for Snip to cards, in one click.
 *
 * A fresh profile reads snips with the bundled offline recognizer (Tesseract),
 * which misses stylised and small screen text and reads only Japanese. The
 * accurate reader is PaddleOCR (a shared text detector plus one small
 * recogniser per language) and, optionally for Japanese, manga-ocr. These are
 * downloads, so nothing is fetched until the learner clicks; the size is on
 * the button, and the progress is shown while it runs.
 *
 * `SnipReaderSetup` is the card (first-run setup, Settings, the Snips app);
 * `SnipReaderOffer` is the per-snip offer ("install the Chinese reader and
 * read again", "install the accurate reader and read again"), which asks main
 * to read the snip again once the download has finished.
 */
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useT } from '../../i18n';
import { formatBytes, type AssetSpec, type AssetStatus } from '../../../shared/assetRegistry';
import {
  snipAccurateReader,
  snipReaderOffer,
  snipReaderSetupIds,
  type SnipEntry,
  type SnipReaders,
} from '../../../shared/snipToCards';
import { STUDY_LANGS, type StudyLang } from '../../../shared/studyLang';

interface Catalog {
  assets: AssetSpec[];
  statuses: Map<string, AssetStatus>;
}

/** The asset catalog and live download states (main's, over IPC). */
function useAssetCatalog(): Catalog | null {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.resolve(window.api?.assetsList?.())
      .then((res) => {
        if (alive && res) setCatalog({ assets: res.assets, statuses: new Map(res.statuses.map((s) => [s.id, s])) });
      })
      .catch(() => undefined);
    const off = window.api?.onAssetStatus?.((status) => {
      setCatalog((cur) => {
        if (!cur) return cur;
        const statuses = new Map(cur.statuses);
        statuses.set(status.id, status);
        return { ...cur, statuses };
      });
    });
    return () => {
      alive = false;
      if (typeof off === 'function') off();
    };
  }, []);
  return catalog;
}

/** Every asset `ids` needs, dependencies included, once each. */
export function readerClosure(assets: readonly AssetSpec[], ids: readonly string[]): AssetSpec[] {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const out = new Map<string, AssetSpec>();
  const visit = (id: string): void => {
    const spec = byId.get(id);
    if (!spec || out.has(id)) return;
    out.set(id, spec);
    for (const dep of spec.requires ?? []) visit(dep);
  };
  ids.forEach(visit);
  return [...out.values()];
}

export type ReaderInstallState = 'idle' | 'busy' | 'done' | 'failed';

/** Size still to download, and the progress of a set of readers. */
export function readerProgress(
  catalog: Catalog | null,
  ids: readonly string[],
): { bytes: number; state: ReaderInstallState; percent: number } {
  if (!catalog || !ids.length) return { bytes: 0, state: ids.length ? 'idle' : 'done', percent: 0 };
  const parts = readerClosure(catalog.assets, ids);
  const statuses = parts.map((p) => catalog.statuses.get(p.id));
  const missing = parts.filter((_, i) => statuses[i]?.state !== 'installed');
  const bytes = missing.reduce((sum, p) => sum + p.sizeBytes, 0);
  if (!missing.length) return { bytes: 0, state: 'done', percent: 100 };
  const failed = statuses.some((s) => s?.state === 'failed');
  const busy = statuses.some((s) => s && (s.state === 'queued' || s.state === 'downloading' || s.state === 'verifying' || s.state === 'paused'));
  const total = parts.reduce((sum, p) => sum + p.sizeBytes, 0);
  const received = parts.reduce((sum, p, i) => {
    const s = statuses[i];
    return sum + (s?.state === 'installed' ? p.sizeBytes : Math.min(p.sizeBytes, s?.receivedBytes ?? 0));
  }, 0);
  return {
    bytes,
    state: failed && !busy ? 'failed' : busy ? 'busy' : 'idle',
    percent: total ? Math.min(99, Math.round((received / total) * 100)) : 0,
  };
}

function Progress({ percent, label }: { percent: number; label: string }) {
  return (
    <div className="snip-reader-progress" role="status">
      <progress max={100} value={percent} aria-label={label} />
      <span className="muted">{label}</span>
    </div>
  );
}

/**
 * The setup card. `readers` and `studyLang` are main's (`SnipStatus`); the
 * learner's own language is always set up, and the others can be ticked.
 */
export function SnipReaderSetup({ readers, studyLang, compact = false }: { readers: SnipReaders; studyLang: StudyLang; compact?: boolean }) {
  const { t } = useT();
  const id = useId();
  const catalog = useAssetCatalog();
  const [extra, setExtra] = useState<Set<StudyLang>>(new Set());
  const [manga, setManga] = useState(false);
  const [started, setStarted] = useState<string[] | null>(null);
  const [startFailed, setStartFailed] = useState(false);

  const langs = useMemo(() => [studyLang, ...STUDY_LANGS.filter((l) => l !== studyLang && extra.has(l))], [studyLang, extra]);
  const ids = useMemo(() => snipReaderSetupIds(langs, readers, { manga }), [langs, readers, manga]);
  const ready = snipAccurateReader(studyLang, readers);
  const watching = started ?? ids;
  const progress = readerProgress(catalog, watching);
  const sizeOf = (list: string[]): string => formatBytes(readerProgress(catalog, list).bytes);

  const start = useCallback(async () => {
    setStartFailed(false);
    setStarted(ids);
    let ok = true;
    for (const asset of ids) {
      try {
        const res = await window.api.assetsStart(asset);
        ok = ok && res.ok;
      } catch {
        ok = false;
      }
    }
    if (!ok) setStartFailed(true);
  }, [ids]);

  const others = STUDY_LANGS.filter((l) => l !== studyLang && !(readers.det && readers.paddle.includes(l)));
  const mangaOffered = langs.includes('ja') && !readers.manga;
  const busy = started !== null && progress.state === 'busy';
  const done = started !== null && progress.state === 'done';

  return (
    <section className={`snip-reader${compact ? ' is-compact' : ''}`} aria-labelledby={`${id}-t`} data-snip-reader={ready ? 'ready' : 'missing'}>
      <p className="snip-reader-title" id={`${id}-t`}>{t('snip2.reader.title')}</p>
      {ready && !ids.length ? (
        <p className="muted snip-reader-text" role="status">{t('snip2.reader.ready', { lang: t(`snip.lang.${studyLang}`) })}</p>
      ) : (
        <>
          {!ready && <p className="muted snip-reader-text">{t('snip2.reader.missing')}</p>}
          {!busy && !done && (
            <div className="snip-reader-options">
              {others.map((lang) => (
                <label key={lang} className="snip-inline-toggle">
                  <input
                    type="checkbox"
                    checked={extra.has(lang)}
                    onChange={(e) => setExtra((cur) => {
                      const next = new Set(cur);
                      if (e.target.checked) next.add(lang);
                      else next.delete(lang);
                      return next;
                    })}
                  />
                  {t('snip2.reader.alsoLang', { lang: t(`snip.lang.${lang}`), size: sizeOf(snipReaderSetupIds([lang], readers)) })}
                </label>
              ))}
              {mangaOffered && (
                <label className="snip-inline-toggle">
                  <input type="checkbox" checked={manga} onChange={(e) => setManga(e.target.checked)} />
                  {t('snip2.reader.manga', { size: sizeOf(['manga-ocr', 'comic-text-detector']) })}
                </label>
              )}
            </div>
          )}
          {!busy && !done && ids.length > 0 && (
            <button type="button" className="btn small snip-btn snip-reader-start" disabled={!catalog} onClick={() => void start()}>
              {t('snip2.reader.setup', { size: formatBytes(progress.bytes) })}
            </button>
          )}
          {busy && <Progress percent={progress.percent} label={t('snip2.reader.progress', { percent: progress.percent })} />}
          {done && <p className="snip-note" role="status">{t('snip2.reader.done')}</p>}
          {(startFailed || (started !== null && progress.state === 'failed')) && (
            <p className="snip-note is-error" role="alert">
              {t('snip2.reader.failed')}{' '}
              <button type="button" className="btn small snip-btn" onClick={() => void start()}>{t('common.tryAgain')}</button>
            </p>
          )}
        </>
      )}
    </section>
  );
}

/**
 * The offer on one snip: its language has no reader, or the basic reader
 * failed or was unsure. One click installs the reader and reads the snip again.
 */
export function SnipReaderOffer({ entry, readers }: { entry: SnipEntry; readers: SnipReaders }) {
  const { t } = useT();
  const catalog = useAssetCatalog();
  const offer = snipReaderOffer(entry, readers);
  const [requested, setRequested] = useState(false);
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    setRequested(false);
    setRefused(false);
  }, [entry.id]);
  if (!offer || !offer.ids.length) return null;
  const progress = readerProgress(catalog, offer.ids);
  const lang = t(`snip.lang.${offer.lang}`);
  const run = async (): Promise<void> => {
    setRefused(false);
    setRequested(true);
    try {
      const ok = await window.api.snipAction({ id: entry.id, action: 'installReread', assets: offer.ids });
      if (!ok) setRefused(true);
    } catch {
      setRefused(true);
    }
  };
  const busy = requested && progress.state === 'busy';
  return (
    <div className="snip-reader-offer" data-snip-offer={offer.kind}>
      <p>{offer.kind === 'lang' ? t('snip2.offer.lang', { lang }) : offer.kind === 'manga' ? t('snip2.offer.manga') : t('snip2.offer.accurate')}</p>
      {busy ? (
        <Progress percent={progress.percent} label={t('snip2.reader.progress', { percent: progress.percent })} />
      ) : (
        <button type="button" className="btn small snip-btn snip-reader-install" disabled={!catalog || (requested && !refused && progress.state !== 'failed')} onClick={() => void run()}>
          {offer.kind === 'lang'
            ? t('snip2.offer.langButton', { lang, size: formatBytes(progress.bytes) })
            : offer.kind === 'manga'
              ? t('snip2.reader.manga', { size: formatBytes(progress.bytes) })
              : t('snip2.offer.installReread', { size: formatBytes(progress.bytes) })}
        </button>
      )}
      {(refused || (requested && progress.state === 'failed')) && <p className="muted" role="alert">{t('snip2.reader.failed')}</p>}
    </div>
  );
}
