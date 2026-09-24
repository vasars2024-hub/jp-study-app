// The sample-data implementation of ScraperPort.
//
// It is not a stub that returns empty arrays: a scrape plays out as a scripted
// timeline, so the progress bar, stat tiles, ETA and log console genuinely move
// and the layout can be judged under the conditions it will actually face.
// Everything derives from the seeded fixtures, so two runs look identical.
//
// The fixtures are loaded with a dynamic import so ~1,200 rows of sample data
// stay out of the initial chunk until something asks for them.

import type {
  DownloadRow,
  EpisodeRow,
  ExportRecord,
  LogLine,
  QbitSendReport,
  QbitStatusReport,
  QbitTransferRow,
  ScrapeJobEvent,
  ScrapeJobSummary,
  ScrapeRequest,
  ScrapeResult,
  ScrapeStage,
  SourceStatus,
  SystemStats,
  TorrentRow,
} from '../../../../shared/scraperResults';
import type { ScraperQbittorrentSettings } from '../../../../shared/scraperSourceSettings';
import type { ScraperSchedulerState } from '../../../../shared/scraperIpc';
import { nextCronRun } from '../../../../shared/scraperCron';
import type {
  HttpProbeRequest,
  HttpProbeResult,
  PluginInfo,
  ScraperPort,
  SelectorMatch,
  TorrentQuery,
} from './scraperPort';

type Fixtures = typeof import('./fixtures');

let fixturesPromise: Promise<Fixtures> | null = null;
function loadFixtures(): Promise<Fixtures> {
  if (!fixturesPromise) fixturesPromise = import('./fixtures');
  return fixturesPromise;
}

/** Stages a job walks through, in order, with how long each holds the bar. */
const TIMELINE: { stage: ScrapeStage; ms: number }[] = [
  { stage: 'queued', ms: 240 },
  { stage: 'searching', ms: 420 },
  { stage: 'fetching', ms: 900 },
  { stage: 'parsing', ms: 1_600 },
  { stage: 'streams', ms: 900 },
  { stage: 'subtitles', ms: 700 },
  { stage: 'validating', ms: 500 },
];

const PROGRESS_TICKS = 12;

interface RunningJob {
  id: string;
  request: ScrapeRequest;
  listeners: Set<(event: ScrapeJobEvent) => void>;
  timers: number[];
  cancelled: boolean;
  rows: EpisodeRow[];
}

export function createMockScraperPort(): ScraperPort {
  const jobs = new Map<string, RunningJob>();
  let jobCounter = 1_043;

  const emit = (job: RunningJob, event: ScrapeJobEvent) => {
    if (job.cancelled && event.kind !== 'stage') return;
    for (const listener of job.listeners) listener(event);
  };

  const schedule = (job: RunningJob, delay: number, fn: () => void) => {
    job.timers.push(window.setTimeout(fn, delay));
  };

  const run = async (job: RunningJob) => {
    const fx = await loadFixtures();
    if (job.cancelled) return;

    // Which series a run produces is decided by the target text, so typing a
    // different title actually changes what comes back.
    const target = job.request.targetUrl.toLowerCase();
    const series =
      fx.SERIES.find((s) => target.includes(s.id) || target.includes(s.titleEn.toLowerCase()))
      ?? fx.SERIES[1];
    const rows = fx.episodes().filter((e) => e.seriesId === series.id);
    job.rows = rows;

    const logLines = fx.logs();
    let elapsed = 0;

    for (const step of TIMELINE) {
      schedule(job, elapsed, () => emit(job, { kind: 'stage', stage: step.stage }));
      elapsed += step.ms;
    }

    // Progress ticks are spread evenly across the whole timeline so the bar
    // advances continuously rather than jumping once per stage.
    const total = rows.length;
    const perTick = Math.ceil(total / PROGRESS_TICKS);
    for (let tick = 1; tick <= PROGRESS_TICKS; tick += 1) {
      const delay = Math.round((elapsed / PROGRESS_TICKS) * tick);
      const done = Math.min(total, perTick * tick);
      schedule(job, delay, () => {
        emit(job, {
          kind: 'progress',
          done,
          total,
          etaSec: Math.round((((PROGRESS_TICKS - tick) * elapsed) / PROGRESS_TICKS) / 1_000),
        });
        emit(job, { kind: 'log', line: logLines[(tick * 3) % logLines.length] });
        // Rows arrive as the work happens rather than all at once at the end,
        // which is what makes the table's loading behaviour worth looking at.
        for (const row of rows.slice(perTick * (tick - 1), done)) {
          emit(job, { kind: 'row', row });
        }
      });
    }

    schedule(job, elapsed + 200, () => {
      if (job.cancelled) return;
      emit(job, { kind: 'stage', stage: 'done' });
      emit(job, {
        kind: 'done',
        summary: {
          id: job.id,
          seriesId: series.id,
          titleEn: series.titleEn,
          titleJa: series.titleJa,
          provider: series.provider,
          profile: job.request.profileId,
          stage: 'done',
          ageMinutes: 0,
          durationSec: Math.round(elapsed / 1000),
          found: rows.length,
          failed: rows.filter((r) => r.status === 'failed').length,
          bytes: rows.reduce((n, r) => n + r.sizeBytes, 0),
          note: '',
        },
      });
    });
  };

  return {
    async startScrape(request) {
      jobCounter += 1;
      const id = `job-${jobCounter}`;
      const job: RunningJob = {
        id,
        request,
        listeners: new Set(),
        timers: [],
        cancelled: false,
        rows: [],
      };
      jobs.set(id, job);
      // Deferred a tick so a caller can subscribe before the first event fires.
      window.setTimeout(() => void run(job), 0);
      return id;
    },

    async cancelScrape(jobId) {
      const job = jobs.get(jobId);
      if (!job) return;
      job.cancelled = true;
      for (const timer of job.timers) window.clearTimeout(timer);
      job.timers = [];
      for (const listener of job.listeners) listener({ kind: 'stage', stage: 'cancelled' });
    },

    subscribeJob(jobId, listener) {
      const job = jobs.get(jobId);
      if (!job) return () => undefined;
      job.listeners.add(listener);
      return () => job.listeners.delete(listener);
    },

    async listJobs(): Promise<ScrapeJobSummary[]> {
      const fx = await loadFixtures();
      return fx.JOBS.map((job) => ({
        id: job.id,
        seriesId: job.seriesId,
        titleEn: job.titleEn,
        titleJa: job.titleJa,
        provider: job.provider,
        profile: job.profile,
        stage: job.outcome === 'failed' ? 'failed' : job.outcome === 'cancelled' ? 'cancelled' : 'done',
        ageMinutes: job.ageMinutes,
        durationSec: job.durationSec,
        found: job.found,
        failed: job.failed,
        bytes: job.bytes,
        note: job.note,
      }));
    },

    async getResult(jobId): Promise<ScrapeResult> {
      const fx = await loadFixtures();
      const job = jobs.get(jobId);
      const rows = job?.rows.length ? job.rows : fx.episodes();
      const seriesId = rows[0]?.seriesId ?? 'one-piece';
      const ids = new Set(rows.map((r) => r.id));
      return {
        jobId,
        seriesId,
        episodes: rows,
        streams: fx.streams().filter((s) => ids.has(s.episodeId)),
        torrents: fx.torrents(),
        images: fx.images(),
        metadata: fx.SERIES_METADATA,
        logs: fx.logs(),
      };
    },

    async listSources(): Promise<SourceStatus[]> {
      const fx = await loadFixtures();
      return fx.SOURCES.map((source, index) => ({
        id: source.id,
        label: source.label,
        host: source.host,
        kind: source.kind,
        enabled: source.enabled,
        priority: index + 1,
        fallbackIds: [],
        health: source.health,
        latencyMs: source.latencyMs,
        supportsSubtitles: source.supportsSubtitles,
        requiresAuth: source.requiresAuth,
        history: source.history,
      }));
    },

    async listAcquisitionProviders() {
      return {
        backend: 'seanime',
        state: 'disabled',
        providers: [],
        message: 'Seanime provider inventory is unavailable in sample-data mode.',
      };
    },

    async getAcquisitionSnapshot() {
      const unavailable = {
        state: 'disabled' as const,
        message: 'Seanime acquisition engines are unavailable in sample-data mode.',
      };
      return {
        backend: 'seanime' as const,
        state: 'disabled' as const,
        refreshedAt: new Date().toISOString(),
        message: unavailable.message,
        torrentClient: { ...unavailable, client: '', transfers: [] },
        debrid: { ...unavailable, provider: '', items: [] },
        autoDownloader: {
          ...unavailable,
          provider: '',
          intervalMinutes: 0,
          downloadAutomatically: false,
          useDebrid: false,
          rules: [],
          queue: [],
        },
      };
    },

    async runAcquisitionAction() {
      return {
        ok: false,
        message: 'Seanime acquisition actions are unavailable in sample-data mode.',
        accepted: 0,
        simulation: [],
      };
    },

    async probeSource(id) {
      const all: SourceStatus[] = await this.listSources();
      const found = all.find((s) => s.id === id);
      if (!found) throw new Error(`Unknown source: ${id}`);
      return found;
    },

    async searchTorrents(query: TorrentQuery): Promise<TorrentRow[]> {
      const fx = await loadFixtures();
      const text = query.text.trim().toLowerCase();
      return fx.torrents().filter((row) => {
        if (text && !row.name.toLowerCase().includes(text)) return false;
        if (query.minSeeders !== undefined && row.seeders < query.minSeeders) return false;
        if (query.resolution && row.resolution !== query.resolution) return false;
        if (query.releaseGroup && row.releaseGroup !== query.releaseGroup) return false;
        return true;
      });
    },

    async qbitTest(config: ScraperQbittorrentSettings): Promise<QbitStatusReport> {
      // Every outcome is reachable from the settings alone, so all four states
      // can be seen without a running client.
      if (!config.enabled) {
        return { status: 'not-configured', version: '', message: 'Sending to qBittorrent is turned off.', latencyMs: 0 };
      }
      if (!config.username) {
        return { status: 'unauthorized', version: '', message: 'No username is set.', latencyMs: 24 };
      }
      if (!config.passwordRef) {
        return { status: 'unauthorized', version: '', message: 'No password is stored for this account.', latencyMs: 26 };
      }
      if (config.port === 1) {
        return { status: 'unreachable', version: '', message: `Nothing answered on ${config.host}:${config.port}.`, latencyMs: 0 };
      }
      return {
        status: 'connected',
        version: '4.6.4',
        message: `Connected to ${config.host}:${config.port}.`,
        latencyMs: 38,
      };
    },

    async qbitTransfers(): Promise<QbitTransferRow[]> {
      const fx = await loadFixtures();
      return fx.qbitTransfers();
    },

    async qbitSend(rows, config): Promise<QbitSendReport> {
      const details = rows.map((row) => {
        if (!config.enabled) {
          return { name: row.name, outcome: 'failed' as const, reason: 'qBittorrent is not enabled.' };
        }
        if (row.seeders === 0) {
          return { name: row.name, outcome: 'skipped' as const, reason: 'No seeders.' };
        }
        return { name: row.name, outcome: 'sent' as const, reason: '' };
      });
      return {
        sent: details.filter((d) => d.outcome === 'sent').length,
        skipped: details.filter((d) => d.outcome === 'skipped').length,
        failed: details.filter((d) => d.outcome === 'failed').length,
        details,
      };
    },

    // Sample data has no client behind it, so an action says so rather than
    // pretending a transfer paused. A screen that shows "done" here would be
    // the exact dishonesty the live port was fixed for.
    async qbitAction(_action, hashes) {
      return {
        ok: false,
        done: 0,
        failures: hashes.map((hash) => ({ hash, reason: 'Sample data: no qBittorrent client is connected.' })),
      };
    },

    async freeSpace() {
      return { bytes: null, source: 'none' as const, path: '' };
    },

    async listDownloads(): Promise<DownloadRow[]> {
      const fx = await loadFixtures();
      return fx.downloads();
    },

    async listExports(): Promise<ExportRecord[]> {
      const fx = await loadFixtures();
      return fx.EXPORTS;
    },

    async writeExport(request): Promise<ExportRecord | null> {
      // No backend means no file system, so the browser's own download is the
      // honest stand-in — the bytes are real, only the destination is not.
      const blob = new Blob([request.content], { type: 'text/plain' });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = request.defaultName;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(href), 0);
      return {
        id: `local-${Date.now()}`,
        format: request.format.toUpperCase(),
        destination: request.defaultName,
        records: request.recordCount,
        ageMinutes: 0,
        outcome: 'ok',
        note: 'Saved through the browser, with no backend attached.',
      };
    },

    async listPlugins(): Promise<PluginInfo[]> {
      const fx = await loadFixtures();
      return fx.PLUGINS;
    },

    // With no backend there is no clock to hand the schedule to, so the mock
    // answers with the arithmetic only — real next-run times, no runs. That is
    // honest: the screen shows when things *would* fire, and nothing fires.
    async syncScheduler(scheduler): Promise<ScraperSchedulerState> {
      const now = Date.now();
      return {
        heldBy: scheduler.enabled ? 'nothing-due' : 'disabled',
        runningJobIds: [],
        entries: scheduler.entries.map((entry) => {
          const at = entry.enabled ? nextCronRun(entry.cron, now) : null;
          return {
            id: entry.id,
            lastRunAt: entry.lastRunAt,
            nextRunAt: at === null ? null : new Date(at).toISOString(),
            lastJobId: null,
          };
        }),
      };
    },

    async runSchedule(): Promise<string | null> {
      return null;
    },

    subscribeScheduler(): () => void {
      return () => undefined;
    },

    async testSelector(html, selector, mode): Promise<SelectorMatch[]> {
      // Genuinely evaluated, not faked: the browser already has both engines,
      // so this tool works for real even with no backend.
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const nodes: Element[] = [];
      if (mode === 'css') {
        nodes.push(...Array.from(doc.querySelectorAll(selector)));
      } else {
        const result = doc.evaluate(selector, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        for (let i = 0; i < result.snapshotLength; i += 1) {
          const node = result.snapshotItem(i);
          if (node instanceof Element) nodes.push(node);
        }
      }
      return nodes.slice(0, 200).map((node, index) => {
        const attributes: Record<string, string> = {};
        for (const attr of Array.from(node.attributes)) attributes[attr.name] = attr.value;
        const path = `${node.tagName.toLowerCase()}${node.className ? `.${String(node.className).split(/\s+/).join('.')}` : ''}`;
        return { index, path, text: (node.textContent ?? '').trim().slice(0, 400), attributes };
      });
    },

    async fetchHttp(request: HttpProbeRequest): Promise<HttpProbeResult> {
      const fx = await loadFixtures();
      return {
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'max-age=300',
          'x-mock-method': request.method.toUpperCase(),
          server: 'nginx',
          // Redaction happens before the value ever reaches the UI.
          'set-cookie': '‹redacted›',
        },
        body: fx.FIXTURE_HTML,
        timingMs: { dns: 12, connect: 38, tls: 64, ttfb: 210, total: 412 },
        sizeBytes: fx.FIXTURE_HTML.length,
      };
    },

    tailLogs(listener: (line: LogLine) => void) {
      let index = 0;
      let lines: LogLine[] = [];
      void loadFixtures().then((fx) => {
        lines = fx.logs();
      });
      const timer = window.setInterval(() => {
        if (!lines.length) return;
        listener(lines[index % lines.length]);
        index += 1;
      }, 1_400);
      return () => window.clearInterval(timer);
    },

    async systemStats(): Promise<SystemStats> {
      return { memoryMb: 152, cpuPercent: 2, activeJobs: 1 };
    },

    // The sample-data port implements nothing for real, and says so. Anything
    // that asks "is this reading live?" gets the honest answer here.
    async backendCapabilities(): Promise<readonly string[]> {
      return [];
    },
  };
}
