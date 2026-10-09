/**
 * Statistics: the Immersion browser's reading, per site.
 *
 * Main has kept per-page seconds, characters (and now dictionary lookups) on
 * every history row since the browser shipped; the Statistics page showed none
 * of it. This adds them up per site and lists the top ones. Site names are the
 * hosts themselves and are not translated.
 */
import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../i18n';
import { LANG_TAGS } from '../../../shared/i18n/core';
import { immersionTotalsByHost, type ImmersionSite } from '../../../shared/immersion';
import { formatDuration } from '../../stats';
import '../reading/readingEcosystem.css';

export const IMMERSION_STATS_SITE_LIMIT = 8;

export default function ImmersionSitesStats() {
  const { t, lang } = useT();
  const [sites, setSites] = useState<ImmersionSite[] | null>(null);
  useEffect(() => {
    let alive = true;
    const list = window.api?.immersionListSites;
    if (typeof list !== 'function') return undefined;
    void Promise.resolve(list())
      .then((store) => {
        if (alive) setSites(store?.sites ?? []);
      })
      .catch(() => undefined);
    const off = window.api?.onImmersionSitesChanged?.((store) => setSites(store?.sites ?? []));
    return () => {
      alive = false;
      off?.();
    };
  }, []);
  const rows = useMemo(() => immersionTotalsByHost(sites ?? [], IMMERSION_STATS_SITE_LIMIT), [sites]);
  const nf = useMemo(() => new Intl.NumberFormat(LANG_TAGS[lang]), [lang]);
  if (!rows.length) return null;
  return (
    <section className="stats-section stats-immersion-sites" aria-label={t('read2.stats.immersion.title')}>
      <h3>{t('read2.stats.immersion.title')}</h3>
      <table className="stats-immersion-table">
        <thead>
          <tr>
            <th scope="col">{t('read2.stats.immersion.site')}</th>
            <th scope="col">{t('read2.stats.immersion.time')}</th>
            <th scope="col">{t('read2.stats.immersion.chars')}</th>
            <th scope="col">{t('read2.stats.immersion.lookups')}</th>
            <th scope="col">{t('read2.stats.immersion.pages')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.host} data-host={row.host}>
              <th scope="row">{row.host}</th>
              <td>{formatDuration(row.seconds)}</td>
              <td>{nf.format(row.chars)}</td>
              <td>{nf.format(row.lookups)}</td>
              <td>{nf.format(row.pages)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
