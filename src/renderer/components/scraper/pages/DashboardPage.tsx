// Dashboard — what is running, what ran, how the sources are holding up, and
// (importantly, while this app is mostly a shell) what is actually built.

import { useEffect, useMemo, useState } from 'react';
import Icon from '../../Icons';
import { Button, Progress } from '../../ui';
import ScrCard from '../ScrCard';
import Sparkline from '../Sparkline';
import StatusDot, { statusHint, statusLabel } from '../StatusDot';
import { useScraper } from '../ScraperContext';
import { useScraperPort } from '../data/scraperPort';
import {
  countFeatureStatuses,
  featureStatusEntries,
  type FeatureStatus,
} from '../featureStatus';
import { formatBytes } from '../../../../shared/assetRegistry';
import { formatDuration } from '../../../stats';
import { formatAgeMinutes, formatInMinutes } from '../data/charts';
import {
  EMPTY_SNAPSHOT,
  activeJobs,
  distinctSeries,
  downloadedBytes,
  failedDownloads,
  healthySources,
  jobOutcome,
  nextScheduledRun,
  queuedDownloads,
  recentJobs,
  type DashboardSnapshot,
  type JobOutcome,
} from '../data/dashboardData';
import type { ScrapeJobSummary, SourceStatus } from '../../../../shared/scraperResults';
import { sx, sx2, sxn, sxs } from '../strings';
import { SCRAPER_POSTER, scraperArtwork } from '../artwork';

const HEALTH_LABEL: Record<SourceStatus['health'], 'health.ok' | 'health.degraded' | 'health.blocked' | 'health.offline' | 'health.unknown'> = {
  ok: 'health.ok',
  degraded: 'health.degraded',
  blocked: 'health.blocked',
  offline: 'health.offline',
  unknown: 'health.unknown',
};

const OUTCOME_LABEL: Record<
  JobOutcome,
  'job.done' | 'job.warning' | 'job.failed' | 'job.cancelled'
> = {
  done: 'job.done',
  warning: 'job.warning',
  failed: 'job.failed',
  cancelled: 'job.cancelled',
};

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'warn' | 'bad';
}) {
  return (
    <div className={`scr-tile${tone ? ` is-${tone}` : ''}`}>
      <span className="scr-tile-label">{label}</span>
      <span className="scr-tile-value">{value}</span>
    </div>
  );
}

function BuildStatusPanel() {
  const [filter, setFilter] = useState<FeatureStatus | 'all'>('all');
  const counts = useMemo(() => countFeatureStatuses(), []);
  const entries = useMemo(() => {
    const all = featureStatusEntries();
    const rank: Record<FeatureStatus, number> = { shell: 0, untested: 1, ready: 2 };
    all.sort((a, b) => rank[a.status] - rank[b.status] || a.id.localeCompare(b.id));
    return filter === 'all' ? all : all.filter((e) => e.status === filter);
  }, [filter]);

  const chips: { key: FeatureStatus | 'all'; label: string; count: number }[] = [
    { key: 'all', label: sx('build.filterAll'), count: counts.total },
    { key: 'shell', label: sx('build.shell'), count: counts.shell },
    { key: 'untested', label: sx('build.untested'), count: counts.untested },
    { key: 'ready', label: sx('build.ready'), count: counts.ready },
  ];

  return (
    <ScrCard
      id="build-status"
      title={sx('build.title')}
      description={sx('build.desc')}
      className="scr-card--build"
      trailing={
        <span className="scr-build-count">{sx2('build.count', counts.ready, counts.total)}</span>
      }
    >
      <div className="scr-build-filters" role="group" aria-label={sx('build.legend')}>
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            className={`scr-chip${filter === chip.key ? ' is-on' : ''}`}
            aria-pressed={filter === chip.key}
            onClick={() => setFilter(chip.key)}
          >
            {chip.key !== 'all' && <StatusDot status={chip.key} />}
            <span>{chip.label}</span>
            <span className="scr-chip-count">{chip.count}</span>
          </button>
        ))}
      </div>

      <ul className="scr-build-list">
        {entries.map((entry) => (
          <li key={entry.id} className="scr-build-row" title={statusHint(entry.status)}>
            <StatusDot status={entry.status} />
            <code className="scr-build-id">{entry.id}</code>
            <span className="scr-build-state">{statusLabel(entry.status)}</span>
          </li>
        ))}
      </ul>
    </ScrCard>
  );
}

export default function DashboardPage() {
  const ctl = useScraper();
  const port = useScraperPort();
  const [jobNotice, setJobNotice] = useState('');

  // Every panel below reads this one snapshot. Nothing on this page renders a
  // fixture any more, so a reading that is missing is shown as missing rather
  // than as a plausible number.
  const [snap, setSnap] = useState<DashboardSnapshot>(EMPTY_SNAPSHOT);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [capabilities, sources, jobs, downloads] = await Promise.all([
        port.backendCapabilities().catch(() => [] as readonly string[]),
        port.listSources().catch(() => []),
        port.listJobs().catch(() => []),
        port.listDownloads().catch(() => []),
      ]);
      if (!alive) return;
      // Episode totals need each job's result; cap the fan-out so a long history
      // does not make the dashboard the slowest page in the app.
      const results = await Promise.all(
        jobs.slice(0, 20).map((job) => port.getResult(job.id).catch(() => null)),
      );
      if (!alive) return;
      const episodeRows = results.flatMap((result) => result?.episodes ?? []);
      setSnap({
        jobs,
        sources,
        downloads,
        scheduler: null,
        episodes: {
          indexed: episodeRows.length,
          japanese: episodeRows.filter((row) =>
            row.subtitles.some((subtitle) => subtitle.language === 'ja')).length,
        },
        // An empty capability list means the port fell back to sample data.
        live: capabilities.length > 0,
      });
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [port]);

  // The scheduler pushes its own state; there is no one-shot read for it.
  useEffect(() => port.subscribeScheduler((scheduler) => {
    setSnap((current) => ({ ...current, scheduler }));
  }), [port]);

  const running = useMemo(() => activeJobs(snap.jobs), [snap.jobs]);
  const recent = useMemo(() => recentJobs(snap.jobs), [snap.jobs]);
  const series = useMemo(() => distinctSeries(snap.jobs), [snap.jobs]);
  const nextRun = useMemo(() => nextScheduledRun(snap.scheduler), [snap.scheduler]);
  const queued = useMemo(() => queuedDownloads(snap.downloads), [snap.downloads]);
  const failed = useMemo(() => failedDownloads(snap.downloads), [snap.downloads]);
  const bytes = useMemo(() => downloadedBytes(snap.jobs), [snap.jobs]);
  const healthy = useMemo(() => healthySources(snap.sources), [snap.sources]);
  const activeJob = running[0] ?? null;

  return (
    <div className="scr-page scr-page--dashboard">
      <header className="scr-page-head">
        <div>
          <h1 className="scr-page-title">
            {sx('page.dashboard.title')}
            <StatusDot id="page.dashboard" className="scr-page-dot" />
          </h1>
          <p className="scr-page-sub">{sx('page.dashboard.subtitle')}</p>
        </div>
        {/* Was an unconditional "Sample data" chip. Now it reports which of the
            two it actually is, because as of 2026-08-02 this page reads the
            backend and on a working install every number here is real. */}
        <span
          className={`scr-sample-flag${snap.live ? ' is-live' : ''}`}
          title={snap.live ? sx('dash.liveDataHint') : sx('build.sampleDataHint')}
        >
          <Icon name="info" size={13} />
          {snap.live ? sx('dash.liveData') : sx('build.sampleData')}
        </span>
      </header>

      <section className="scr-dashboard-hero">
        <div className="scr-dashboard-hero-copy">
          <span className="scr-dashboard-eyebrow">Scraper command center</span>
          <h2>Build a clean anime library from one place.</h2>
          <p>
            Start a scrape, watch provider health, and move finished episodes into
            downloads or Japanese study workflows without leaving the dashboard.
          </p>
          <div className="scr-dashboard-hero-actions">
            <Button
              variant="primary"
              leftIcon={<Icon name="sparkle" size={14} />}
              onClick={() => ctl.navigate('new-scrape')}
            >
              New scrape
            </Button>
            <Button
              leftIcon={<Icon name="search" size={14} />}
              onClick={() => ctl.navigate('discover')}
            >
              Discover anime
            </Button>
          </div>
          <div className="scr-dashboard-hero-status">
            <span><b>{healthy}</b> healthy sources</span>
            <span><b>{snap.episodes.indexed.toLocaleString()}</b> indexed episodes</span>
            <span><b>{snap.episodes.japanese}</b> Japanese subtitle tracks</span>
          </div>
        </div>
        <div className="scr-dashboard-hero-art" aria-label="Recent anime artwork">
          <img className="is-poster" src={SCRAPER_POSTER} alt="Grand Line Archives placeholder poster" />
          <img src={scraperArtwork(1)} alt="The Swordsman placeholder thumbnail" />
          <img src={scraperArtwork(3)} alt="Moonlit Harbor placeholder thumbnail" />
        </div>
      </section>

      <section className="scr-dashboard-block" aria-labelledby="scr-dashboard-quick-title">
        <div className="scr-dashboard-block-head">
          <div>
            <h2 id="scr-dashboard-quick-title">Quick access</h2>
            <p>Jump directly into the next part of the scraping workflow.</p>
          </div>
        </div>
        <div className="scr-dashboard-quick">
          {[
            { page: 'new-scrape' as const, icon: 'sparkle' as const, label: 'New scrape', note: 'URL or title' },
            { page: 'discover' as const, icon: 'search' as const, label: 'Discover', note: 'Find a series' },
            { page: 'results' as const, icon: 'clipboard' as const, label: 'Results', note: 'Review episodes' },
            { page: 'downloads' as const, icon: 'download' as const, label: 'Downloads', note: `${queued} queued` },
            { page: 'sources' as const, icon: 'globe' as const, label: 'Sources', note: `${snap.sources.length} configured` },
            // The active profile is whatever the most recent job ran under —
            // 'Balanced active' was hard-coded and stayed that way after a
            // profile change.
            { page: 'profiles' as const, icon: 'settings' as const, label: 'Profiles', note: recent[0]?.profile ? `${recent[0].profile} active` : 'None run yet' },
          ].map((action) => (
            <button
              type="button"
              key={action.page}
              className="scr-dashboard-quick-card"
              onClick={() => ctl.navigate(action.page)}
            >
              <span className="scr-dashboard-quick-icon"><Icon name={action.icon} size={18} /></span>
              <strong>{action.label}</strong>
              <small>{action.note}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="scr-dashboard-block" aria-labelledby="scr-dashboard-series-title">
        <div className="scr-dashboard-block-head">
          <div>
            <h2 id="scr-dashboard-series-title">Recent anime</h2>
            <p>Continue from the latest indexed series.</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => ctl.navigate('results')}>
            View all results
          </Button>
        </div>
        {series.length === 0 ? (
          <p className="scr-muted scr-dashboard-series-empty">
            {loaded ? sx('dash.series.empty') : sx('dash.loading')}
          </p>
        ) : (
          <div className="scr-dashboard-series">
            {series.map((entry, index) => (
              <button
                type="button"
                className="scr-dashboard-series-card"
                key={entry.seriesId}
                onClick={() => ctl.openResultSeries(entry.seriesId)}
              >
                {/* The catalogue publishes no artwork on a job summary, so this
                    stays a generated placeholder — it is decoration, and it is
                    the only thing on this page that is not a measurement. */}
                <img src={scraperArtwork(index + 2)} alt="" />
                <span className="scr-dashboard-series-shade" />
                <span className="scr-dashboard-series-copy">
                  <strong>{entry.titleEn}</strong>
                  <small>{entry.titleJa}</small>
                  <span>{sxn('common.episodes', entry.episodes)} · {entry.provider}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="scr-tile-row">
        <StatTile label={sx('dash.stat.series')} value={String(new Set(snap.jobs.map((j) => j.seriesId)).size)} />
        <StatTile label={sx('dash.stat.episodes')} value={snap.episodes.indexed.toLocaleString()} />
        <StatTile label={sx('dash.stat.queued')} value={String(queued)} />
        <StatTile label={sx('dash.stat.failed')} value={String(failed)} tone={failed > 0 ? 'bad' : undefined} />
        <StatTile label={sx('dash.stat.downloaded')} value={formatBytes(bytes)} />
      </div>

      <div className="scr-grid">
        <ScrCard
          id="active-jobs"
          title={sx('dash.activeJobs')}
          statusId="page.new-scrape"
          className="scr-card--wide"
        >
          {activeJob ? (
            <div className="scr-job">
              <div className="scr-job-main">
                <span className="scr-job-title">{activeJob.titleEn}</span>
                <span className="scr-job-sub">{activeJob.titleJa}</span>
              </div>
              <div className="scr-job-meta">
                <span>{activeJob.provider}</span>
                <span>{sxs('dash.jobStage', sx(`job.${activeJob.stage}` as Parameters<typeof sx>[0]))}</span>
                {/* A summary carries `found` but no target, so there is no
                    done/total to show and no honest ETA — the old card printed
                    both from a fixture. */}
                <span>{sxn('common.episodes', activeJob.found)}</span>
                <span>{formatDuration(activeJob.durationSec)}</span>
              </div>
              {/* No `value` — a job summary has no done/total, and Progress
                  renders indeterminate when the value is omitted. */}
              <Progress className="scr-job-bar" />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void port.cancelScrape(activeJob.id).catch(() => undefined);
                  setJobNotice(sx('dash.cancelled'));
                }}
              >
                {sx('dash.cancel')}
              </Button>
            </div>
          ) : (
            <div className="scr-job-empty">
              <span className="scr-job-empty-icon"><Icon name="check" size={18} /></span>
              <span>
                <b>{sx('dash.noActiveJobs')}</b>
                {jobNotice && <small role="status">{jobNotice}</small>}
              </span>
              <Button
                size="sm"
                variant="primary"
                leftIcon={<Icon name="sparkle" size={13} />}
                onClick={() => ctl.navigate('new-scrape')}
              >
                {sx('dash.startAnother')}
              </Button>
            </div>
          )}
        </ScrCard>

        <ScrCard
          id="next-scheduled"
          title={sx('dash.nextScheduled')}
          statusId="page.scheduled"
        >
          {/* Was "in 3h — One Piece · Thorough · daily at 03:00", hard-coded,
              on an install with nothing scheduled. */}
          <p className="scr-big">{nextRun ? formatInMinutes(nextRun.inMinutes) : sx('dash.nextScheduledNone')}</p>
          <p className="scr-muted">{nextRun ? nextRun.entryId : sx('dash.noScheduleHint')}</p>
          <Button size="sm" onClick={() => ctl.navigate('scheduled')}>
            {sx('nav.scheduled')}
          </Button>
        </ScrCard>

        <ScrCard
          id="recent-scrapes"
          title={sx('dash.recent')}
          statusId="page.history"
          className="scr-card--wide"
          trailing={
            <Button size="sm" variant="ghost" onClick={() => ctl.navigate('history')}>
              {sx('dash.viewAll')}
            </Button>
          }
        >
          {recent.length === 0 ? (
            <p className="scr-muted">{loaded ? sx('dash.recentEmpty') : sx('dash.loading')}</p>
          ) : (
            <ul className="scr-list">
              {recent.map((job: ScrapeJobSummary) => {
                const outcome = jobOutcome(job);
                return (
                  <li key={job.id} className="scr-list-row">
                    <span
                      className={`scr-outcome scr-outcome--${outcome}`}
                      aria-label={sx(OUTCOME_LABEL[outcome])}
                    />
                    <span className="scr-list-main">
                      <span className="scr-list-title">{job.titleEn}</span>
                      <span className="scr-list-sub">{job.titleJa}</span>
                    </span>
                    <span className="scr-list-cell">{job.provider}</span>
                    <span className="scr-list-cell">{sxn('common.episodes', job.found)}</span>
                    <span className="scr-list-cell">{formatDuration(job.durationSec)}</span>
                    <span className="scr-list-cell scr-muted">{formatAgeMinutes(job.ageMinutes)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrCard>

        <ScrCard
          id="source-health"
          title={sx('dash.sourceHealth')}
          description={sx('dash.sourceHealthDesc')}
          statusId="page.sources"
          className="scr-card--wide"
        >
          {snap.sources.length === 0 && (
            <p className="scr-muted">{loaded ? sx('dash.sources.empty') : sx('dash.loading')}</p>
          )}
          <ul className="scr-health-list">
            {snap.sources.map((source) => {
              const last = source.history[source.history.length - 1] ?? 0;
              return (
                <li key={source.id}>
                  <button
                    type="button"
                    className="scr-health-row scr-health-action"
                    onClick={() => ctl.openSource(source.id)}
                  >
                    <span className={`scr-health-dot scr-health-dot--${source.health}`} aria-hidden />
                    <span className="scr-health-main">
                      <span className="scr-health-label">{source.label}</span>
                      <span className="scr-health-host">{source.host}</span>
                    </span>
                    <span className="scr-pill scr-pill--quiet">{source.kind}</span>
                    <span className="scr-health-state">{sx(HEALTH_LABEL[source.health])}</span>
                    <span className="scr-health-latency">
                      {source.latencyMs ? `${source.latencyMs} ms` : '—'}
                    </span>
                    <Sparkline values={source.history} label={`${source.label} success rate`} />
                    <span className="scr-health-rate">{Math.round(last * 100)}%</span>
                    <Icon name="chevron" size={12} />
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrCard>

        {/* Was a three-way page-cache / images / logs breakdown with no backing
            measurement anywhere in the app — nothing reports directory sizes.
            SystemStats does carry memory, CPU and the live job count, so this
            reports those instead of inventing a split. */}
        <ScrCard id="runtime" title={sx('dash.runtime')} statusId="set.performance">
          <div className="scr-mini-stats">
            <div>
              <span className="scr-mini-value">{`${ctl.systemStats.memoryMb}`}</span>
              <span className="scr-mini-label">{sx('dash.runtime.memory')}</span>
            </div>
            <div>
              <span className="scr-mini-value">{`${ctl.systemStats.cpuPercent}%`}</span>
              <span className="scr-mini-label">{sx('dash.runtime.cpu')}</span>
            </div>
            <div>
              <span className="scr-mini-value">{String(ctl.systemStats.activeJobs)}</span>
              <span className="scr-mini-label">{sx('dash.runtime.jobs')}</span>
            </div>
          </div>
          <p className="scr-muted">{sxs('dash.runtime.downloaded', formatBytes(bytes))}</p>
        </ScrCard>

        <ScrCard
          id="learning"
          title={sx('dash.learning')}
          description={sx('dash.learningDesc')}
          statusId="page.results"
        >
          {/* "1,842 new words found" and "306 card candidates" were invented —
              the Scraper indexes episodes and subtitle tracks; it does not
              tokenise them, so it has no word or card count to report. These
              two are what it genuinely knows. */}
          <div className="scr-mini-stats">
            <div>
              <span className="scr-mini-value">{snap.episodes.japanese}</span>
              <span className="scr-mini-label">{sx('dash.learning.subs')}</span>
            </div>
            <div>
              <span className="scr-mini-value">{snap.episodes.indexed.toLocaleString()}</span>
              <span className="scr-mini-label">{sx('dash.learning.episodes')}</span>
            </div>
          </div>
          <Button size="sm" onClick={() => ctl.navigate('results')}>
            {sx('dash.openMining')}
          </Button>
        </ScrCard>

        <BuildStatusPanel />
      </div>
    </div>
  );
}
