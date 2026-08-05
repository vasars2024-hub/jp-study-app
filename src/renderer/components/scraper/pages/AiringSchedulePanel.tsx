// Audit C1-3 — the airing schedule, with torrent-index releases matched onto it.
//
// The schedule is the spine and the releases are matched onto it, so this list
// has exactly as many rows as there are scheduled episodes. Rows with nothing
// found stay in the list and say why. A version of this screen that only
// listed the matches would look better and tell the user less: the whole
// question "is episode 7 out yet?" is answered by the *absence*.
//
// Three things are stated on every row, deliberately:
//   - the verdict (found / possible / none), where "possible" never reads as
//     "found" — see the `review` disposition in shared/animeSchedule.ts;
//   - the reason, when there is no release, and the four reasons are distinct;
//   - the source of both halves, so a catalogue fact and a tracker fact are
//     never confused for one another (audit F3).
//
// No new CSS: `scraper.css` is shared and belongs to one run at a time, so this
// reuses classes the Scraper already ships.

import { useState } from 'react';
import { Button } from '../../ui';
import Icon from '../../Icons';
import { useT } from '../../../i18n';
import { LANG_TAGS } from '../../../../shared/i18n/core';
import type { AnimeScheduleResponse, ScheduleRow } from '../../../../shared/animeSchedule';

const DAY_SECONDS = 86_400;
/** Ceiling per read. Each entry costs one paced index request in main. */
const ENTRY_LIMIT = 20;

function stateKey(row: ScheduleRow): string {
  return `schedule.state.${row.disposition}`;
}

function reasonKey(row: ScheduleRow): string | null {
  switch (row.reason) {
    case 'search-failed': return 'schedule.reason.searchFailed';
    case 'no-releases-returned': return 'schedule.reason.noReleases';
    case 'no-episode-match': return 'schedule.reason.noEpisodeMatch';
    case 'below-confidence': return 'schedule.reason.belowConfidence';
    default: return null;
  }
}

export default function AiringSchedulePanel() {
  const { t, lang } = useT();
  const [data, setData] = useState<AnimeScheduleResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState('');
  const [days, setDays] = useState(1);
  const [allowBatches, setAllowBatches] = useState(false);
  const [copied, setCopied] = useState('');

  const load = async (): Promise<void> => {
    setLoading(true);
    setFailure('');
    setCopied('');
    const from = Math.floor(Date.now() / 1000);
    try {
      const response = await window.api.animeSchedule({
        from,
        to: from + days * DAY_SECONDS,
        limit: ENTRY_LIMIT,
        allowBatches,
      });
      setData(response);
    } catch (error) {
      // A rejected invoke is not the same as a schedule the catalogue could not
      // serve — that one arrives as `scheduleError` on a resolved response.
      setFailure(error instanceof Error ? error.message : String(error));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const summary = data?.summary;

  return (
    <section className="scr-dashboard-block" aria-labelledby="scr-schedule-title">
      <div className="scr-dashboard-block-head">
        <div>
          <h2 id="scr-schedule-title">{t('schedule.title')}</h2>
          <p>{t('schedule.sub')}</p>
        </div>
        <div className="scr-page-actions">
          <label className="scr-pill scr-pill--quiet">
            <input
              type="checkbox"
              checked={allowBatches}
              onChange={(e) => setAllowBatches(e.target.checked)}
            />
            {' '}{t('schedule.allowBatches')}
          </label>
          <Button
            size="sm"
            onClick={() => setDays(days === 1 ? 7 : 1)}
          >
            {t(days === 1 ? 'schedule.window.day' : 'schedule.window.week')}
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={loading}
            leftIcon={<Icon name="sparkle" size={14} />}
            onClick={() => { void load(); }}
          >
            {t(data ? 'schedule.refresh' : 'schedule.load')}
          </Button>
        </div>
      </div>

      {loading && <p className="scr-muted">{t('schedule.loading')}</p>}

      {failure && (
        <p className="scr-action-notice" role="status">
          {t('schedule.unavailable', { detail: failure })}
        </p>
      )}

      {data?.scheduleError && (
        <p className="scr-action-notice" role="status">
          {t('schedule.unavailable', { detail: data.scheduleError })}
        </p>
      )}

      {summary && !data?.scheduleError && (
        <p className="scr-muted">
          {t('schedule.summary', {
            exact: summary.exact,
            review: summary.review,
            none: summary.none,
          })}
        </p>
      )}

      {data && !data.scheduleError && data.rows.length === 0 && (
        <p className="scr-muted">{t('schedule.empty')}</p>
      )}

      {data && data.rows.length > 0 && (
        <ul className="scr-schedule-list">
          {data.rows.map((row) => {
            const reason = reasonKey(row);
            const air = new Date(row.entry.airingAt * 1000);
            return (
              <li key={`${row.entry.mediaId}-${row.entry.episode}`} className="scr-schedule-row">
                <div>
                  <strong>{row.entry.displayTitle}</strong>
                  {' · '}
                  <span>{t('schedule.episode', { episode: row.entry.episode })}</span>
                  {' · '}
                  {/* Locale-formatted so a Japanese or Russian UI does not read
                      US dates — audit C1-2. */}
                  <span className="scr-muted">
                    {air.toLocaleString(LANG_TAGS[lang], {
                      weekday: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <div>
                  <span
                    className={`scr-pill ${row.disposition === 'exact' ? '' : 'scr-pill--outline'}`}
                  >
                    {t(stateKey(row))}
                  </span>
                  {row.release && (
                    <>
                      {' '}
                      <span>{row.release.name}</span>
                      {' · '}
                      <span className="scr-muted">
                        {t('schedule.seeders')} {row.release.seeders}
                      </span>
                    </>
                  )}
                </div>

                {/* An unverified match says so, next to the evidence for it. */}
                {row.disposition === 'review' && (
                  <div className="scr-muted">
                    {t('schedule.matchedAs', {
                      title: row.matchedTitle,
                      percent: Math.round(row.confidence * 100),
                    })}
                  </div>
                )}

                {reason && <div className="scr-muted">{t(reason)}</div>}

                <div className="scr-muted">
                  {row.releaseSource
                    ? t('schedule.source', { source: row.releaseSource })
                    : t('schedule.sourceNone')}
                  {row.consideredCount > 0 && (
                    <> {' · '}{t('schedule.considered', { count: row.consideredCount })}</>
                  )}
                </div>

                {row.release?.magnet && (
                  <Button
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(row.release?.magnet ?? '');
                      setCopied(`${row.entry.mediaId}-${row.entry.episode}`);
                    }}
                  >
                    {copied === `${row.entry.mediaId}-${row.entry.episode}`
                      ? t('schedule.copied')
                      : t('schedule.copyMagnet')}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
