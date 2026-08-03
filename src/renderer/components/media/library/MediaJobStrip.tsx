/**
 * The live strip of background media jobs.
 *
 * Renders nothing at all when there is no work — a permanently-present empty
 * status bar trains people to stop looking at it, which defeats the purpose.
 */

import Icon from '../../Icons';
import { useT } from '../../../i18n';
import type { IconName } from '../../Icons';
import { useMediaJobs, type MediaJob, type MediaJobKind } from './useMediaJobs';

const JOB_ICON: Record<MediaJobKind, IconName> = {
  metadata: 'sparkle',
  subtitles: 'caption',
  download: 'download',
  transcription: 'headphones',
};

function percent(job: MediaJob): number | null {
  if (job.total <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((job.done / job.total) * 100)));
}

function eta(ms: number | undefined): string | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return null;
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function MediaJobStrip() {
  const { t } = useT();
  const { jobs, active } = useMediaJobs();
  if (jobs.length === 0) return null;

  return (
    <section className="medialib-jobs" aria-label={t('media.jobs.label')} aria-live="polite">
      <div className="medialib-jobs__head">
        <span className="medialib-jobs__title">
          {active > 0 ? t('media.jobs.running', { count: active }) : t('media.jobs.finished')}
        </span>
        {active > 0 && (
          <button
            type="button"
            className="medialib-drawer__more"
            onClick={() => {
              // Cancels both sweeps; each ignores the call when it is not running.
              void window.api.cancelMediaMetadata();
              void window.api.cancelSubtitleDiscovery();
            }}
          >
            {t('media.jobs.cancelAll')}
          </button>
        )}
      </div>

      <ul className="medialib-jobs__list">
        {jobs.map((job) => {
          const pct = percent(job);
          const remaining = eta(job.etaMs);
          return (
            <li key={job.id} className="medialib-jobs__row" data-state={job.error ? 'error' : job.finished ? 'done' : 'busy'}>
              <Icon name={JOB_ICON[job.kind]} size={13} />
              <span className="medialib-jobs__name" title={job.title}>{job.title}</span>
              <span className="medialib-jobs__phase">
                {job.error ?? t(`media.jobs.phase.${job.phase}`)}
              </span>
              {pct !== null && !job.finished && (
                <span className="medialib-jobs__bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <i style={{ width: `${pct}%` }} />
                </span>
              )}
              {remaining && !job.finished && (
                <span className="medialib-jobs__eta">{t('media.jobs.eta', { time: remaining })}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
