import { useEffect, useMemo, useState } from 'react';
import {
  TELEMETRY_CONSENT_KEY,
  guessCountryCode,
  statsConfigured,
  type CountryCounts,
} from '../../../shared/stats';
import { useT } from '../../i18n';
import { repairStaleTelemetryPingFlag, sendTelemetryPingIfNeeded } from '../../telemetryPing';
import { formatNumber } from '../../stats';

// Anonymous "learners by country" greeting for the Resources app. The /counts
// GET is aggregate and non-identifying, so it renders regardless of the ping
// consent. Zero dependencies: a single <svg> choropleth when map paths are
// vendored, otherwise an accessible ranked bar list. Cached in userData, so it
// still renders offline. The large SVG path table is loaded only when this
// component mounts so it does not bloat the initial desktop bundle.
//
// When the user has opted in, we also merge a best-effort local country guess
// so the map isn't empty before a Cloudflare Worker is configured / synced.

type WorldMapData = typeof import('../../data/worldMapPaths');

function colorFor(count: number, max: number): string {
  if (count <= 0 || max <= 0) return 'var(--panel-2)';
  // 5-step log-scale ramp of the app accent colour.
  const t = Math.log1p(count) / Math.log1p(max);
  const step = Math.min(4, Math.max(0, Math.floor(t * 5)));
  const alpha = [0.18, 0.34, 0.52, 0.72, 0.95][step];
  return `color-mix(in srgb, var(--accent-2) ${Math.round(alpha * 100)}%, transparent)`;
}

function hasConsentYes(): boolean {
  try {
    return localStorage.getItem(TELEMETRY_CONSENT_KEY) === 'yes';
  } catch {
    return false;
  }
}

export default function WorldHeatMap({
  compact = false,
  refreshToken = 0,
}: {
  compact?: boolean;
  /** Bump to re-fetch remote counts (e.g. after opt-in from the widget). */
  refreshToken?: number;
} = {}) {
  const { t } = useT();
  const [counts, setCounts] = useState<CountryCounts | null>(null);
  const [mapData, setMapData] = useState<WorldMapData | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [hover, setHover] = useState<{ iso: string; count: number } | null>(null);
  const [consented, setConsented] = useState(hasConsentYes);
  const sectionClass = compact ? 'heatmap-section heatmap-section--compact' : 'heatmap-section';

  useEffect(() => {
    setConsented(hasConsentYes());
  }, [refreshToken]);

  useEffect(() => {
    let alive = true;
    void import('../../data/worldMapPaths')
      .then((module) => {
        if (alive) setMapData(module);
      })
      .catch(() => {
        // The ranked bar fallback still works if the optional map chunk fails.
        if (alive) setMapFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    repairStaleTelemetryPingFlag();
    if (hasConsentYes()) {
      void sendTelemetryPingIfNeeded();
    }
    void (async () => {
      try {
        const c = await window.api.statsCounts();
        if (alive) setCounts(c);
      } catch {
        /* ignore */
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [refreshToken]);

  const displayCounts = useMemo(() => {
    const base: CountryCounts = { ...(counts ?? {}) };
    if (consented) {
      const local = guessCountryCode();
      if (local) base[local] = Math.max(base[local] ?? 0, 1);
    }
    return base;
  }, [counts, consented]);

  const { total, countryCount, max, ranked } = useMemo(() => {
    const entries = Object.entries(displayCounts);
    const totalN = entries.reduce((n, [, v]) => n + v, 0);
    const maxN = entries.reduce((m, [, v]) => Math.max(m, v), 0);
    const rankedList = [...entries].sort((a, b) => b[1] - a[1]);
    return { total: totalN, countryCount: entries.length, max: maxN, ranked: rankedList };
  }, [displayCounts]);

  const caption = t('resources.heatmap.caption', { count: countryCount, total });
  const displayCountry = (iso: string): string => mapData?.countryName(iso) ?? iso;

  // Nothing to show yet (no worker / no consent / no local guess). These
  // returns stay below every hook so a load-state change cannot reorder hooks.
  if (loaded && countryCount === 0) {
    if (!compact) return null;
    const emptyKey = statsConfigured()
      ? 'resources.heatmap.empty'
      : 'resources.heatmap.unconfigured';
    return (
      <section className={sectionClass}>
        <div className="heatmap-caption muted">{t(emptyKey)}</div>
      </section>
    );
  }
  // LAYOUT JUMP (V12). In the Resources app this card sits ABOVE the bundles, and it
  // used to grow in two late steps: a one-line 'Loading…' card, then the counts (as bars),
  // then the map chunk (a ~240px choropleth) — each step shoving the bundles and the list
  // down, the last one ~190px about 0.8s after the window opened. The full-size card now
  // reserves the map's own box (aspect-ratio of its viewBox) until both the counts and the
  // map chunk are in, so the map paints into space that was already there. When nothing
  // can arrive (no Worker configured and no consent) there is no placeholder at all,
  // rather than one that would collapse again.
  const mapPending = !mapData && !mapFailed;
  if (!compact && (!loaded || mapPending)) {
    if (!loaded && !statsConfigured() && !consented) return null;
    return (
      <section className={sectionClass} aria-busy="true">
        <div className="heatmap-caption muted">{t('resources.heatmap.loading')}</div>
        <div className="heatmap-svg-wrap heatmap-svg-wrap--pending" />
      </section>
    );
  }
  if (!loaded) {
    return (
      <section className={sectionClass}>
        <div className="heatmap-caption muted">{t('resources.heatmap.loading')}</div>
      </section>
    );
  }

  return (
    <section className={sectionClass} aria-label={t('resources.heatmap.aria')}>
      <div className="heatmap-caption">{caption}</div>

      {mapData?.hasWorldMapPaths() ? (
        <div className="heatmap-svg-wrap">
          <svg viewBox={mapData.WORLD_MAP_VIEWBOX} className="heatmap-svg" role="img" aria-label={caption}>
            {Object.entries(mapData.WORLD_MAP_PATHS).map(([iso, d]) => {
              const count = displayCounts[iso] ?? 0;
              return (
                <path
                  key={iso}
                  d={d}
                  fill={colorFor(count, max)}
                  stroke="var(--border)"
                  strokeWidth={0.4}
                  style={{ transition: 'none' }}
                  onMouseEnter={() => setHover({ iso, count })}
                  onMouseLeave={() => setHover(null)}
                />
              );
            })}
          </svg>
          {hover ? (
            <div className="heatmap-tooltip">
              {t('resources.heatmap.countryCount', { country: displayCountry(hover.iso), count: hover.count })}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="heatmap-bars">
          {ranked.slice(0, 12).map(([iso, count]) => (
            <div
              key={iso}
              className="heatmap-bar-row"
              title={t('resources.heatmap.countryCount', { country: displayCountry(iso), count })}
            >
              <span className="heatmap-bar-label">{displayCountry(iso)}</span>
              <span className="heatmap-bar-track">
                <span className="heatmap-bar-fill" style={{ width: `${max > 0 ? (count / max) * 100 : 0}%` }} />
              </span>
              <span className="heatmap-bar-count">{formatNumber(count)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
