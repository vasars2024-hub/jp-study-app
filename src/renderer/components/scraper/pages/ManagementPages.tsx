import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Icon from '../../Icons';
import { Button, Toggle } from '../../ui';
import ScrCard from '../ScrCard';
import StatusDot from '../StatusDot';
import { useScraper } from '../ScraperContext';
import { sx } from '../strings';
import { useScraperPort } from '../data/scraperPort';
import type { PluginInfo } from '../data/scraperPort';
import { parsePluginManifest } from '../data/pluginManifest';
import {
  chooseScraperPreset,
  getActiveScraperSettings,
  loadScraperSettingsDocument,
  saveScraperSettingsDocument,
  updateActiveScraperSettings,
} from '../../../scraperSettingsStore';
import {
  DEFAULT_SITE_RULE,
  extractWithRule,
  validateSiteRule,
  type RuleExtraction,
  type ScraperSiteRule,
  type SiteRuleProblem,
} from '../../../../shared/scraperSiteRules';
import {
  createScraperProfile,
  type ScraperPresetId,
  type ScraperSettingsDocument,
} from '../../../../shared/scraperSettings';
import type { ScraperScheduleEntry } from '../../../../shared/scraperOutputSettings';
import type { ScraperSchedulerState } from '../../../../shared/scraperIpc';
import { isValidCron, nextCronRun, parseCron } from '../../../../shared/scraperCron';

function PageHead({
  page,
  title,
  subtitle,
  actions,
}: {
  page: string;
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <header className="scr-page-head">
      <div>
        <h1 className="scr-page-title">
          {title}
          <StatusDot id={`page.${page}`} className="scr-page-dot" />
        </h1>
        <p className="scr-page-sub">{subtitle}</p>
      </div>
      {actions && <div className="scr-page-actions">{actions}</div>}
    </header>
  );
}

export function ProfilesPage() {
  const ctl = useScraper();
  const [document, setDocument] = useState<ScraperSettingsDocument>(() =>
    loadScraperSettingsDocument(),
  );
  const activeProfile = document.profiles.find((profile) => profile.id === document.activeProfileId);
  const revisionCount = document.profiles.reduce((count, profile) => count + profile.history.length, 0);

  const activate = (id: string) => {
    const next = saveScraperSettingsDocument({ ...document, activeProfileId: id });
    setDocument(next);
  };

  const applyPreset = (preset: Exclude<ScraperPresetId, 'custom'>) => {
    const current = saveScraperSettingsDocument({ ...document, activeProfileId: preset });
    setDocument(current);
    setDocument(chooseScraperPreset(preset));
  };

  const duplicate = () => {
    const active = document.profiles.find((profile) => profile.id === document.activeProfileId);
    setDocument(
      saveScraperSettingsDocument(
        createScraperProfile(document, `${active?.name ?? 'Profile'} Copy`),
      ),
    );
  };

  return (
    <div className="scr-page">
      <PageHead
        page="profiles"
        title="Profiles"
        subtitle="Saved configurations for fast checks, balanced scraping, and exhaustive archive runs."
        actions={
          <Button size="sm" leftIcon={<Icon name="plus" size={13} />} onClick={duplicate}>
            Duplicate active
          </Button>
        }
      />

      <div className="scr-tile-row">
        <div className="scr-tile"><span className="scr-tile-label">Saved profiles</span><span className="scr-tile-value">{document.profiles.length}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">Active preset</span><span className="scr-tile-value scr-tile-value--text">{activeProfile?.preset ?? 'custom'}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">Saved revisions</span><span className="scr-tile-value">{revisionCount}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">Site overrides</span><span className="scr-tile-value">{Object.keys(document.siteOverrides).length}</span></div>
      </div>

      <div className="scr-profile-grid">
        {document.profiles.map((profile) => {
          const active = document.activeProfileId === profile.id;
          return (
            <ScrCard
              key={profile.id}
              id={`profile-${profile.id}`}
              title={profile.name}
              description={profile.description}
              statusId="page.profiles"
              className={active ? 'scr-card--active' : ''}
              trailing={active ? <span className="scr-pill scr-pill--good">Active</span> : null}
            >
              <div className="scr-profile-stats">
                <span><b>{profile.settings.network.concurrentRequests}</b> requests</span>
                <span><b>{Math.round(profile.settings.network.requestTimeoutMs / 1_000)}s</b> timeout</span>
                <span><b>{profile.settings.sources.mode}</b> sources</span>
              </div>
              <div className="scr-page-actions">
                <Button size="sm" variant={active ? 'primary' : 'default'} onClick={() => activate(profile.id)}>
                  {active ? 'Selected' : 'Use profile'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => ctl.openDrawer('network')}>
                  Edit settings
                </Button>
              </div>
            </ScrCard>
          );
        })}
      </div>

      <ScrCard
        id="profile-presets"
        title="Preset library"
        description="Applying a preset updates the matching profile while keeping a revision in its history."
        statusId="set.profiles"
      >
        <div className="scr-preset-row">
          {(['fast', 'balanced', 'thorough'] as const).map((preset) => (
            <button key={preset} type="button" className="scr-preset" onClick={() => applyPreset(preset)}>
              <Icon name={preset === 'fast' ? 'flame' : preset === 'balanced' ? 'shield' : 'scan'} size={18} />
              <span>
                <b>{preset[0].toUpperCase() + preset.slice(1)}</b>
                <small>
                  {preset === 'fast'
                    ? 'Quick metadata and episode checks'
                    : preset === 'balanced'
                      ? 'Reliable default for everyday use'
                      : 'Maximum retries, mirrors, and validation'}
                </small>
              </span>
            </button>
          ))}
        </div>
      </ScrCard>

      <ScrCard
        id="profile-comparison"
        title="Profile comparison"
        description="The settings that most directly affect runtime, site load, and extraction coverage."
        statusId="set.profiles"
      >
        <div className="scr-profile-compare" role="table" aria-label="Profile settings comparison">
          <div
            className="scr-profile-compare-row is-head"
            role="row"
            style={{ gridTemplateColumns: `minmax(160px, .9fr) repeat(${document.profiles.length}, minmax(120px, 1fr))` }}
          >
            <span role="columnheader">Setting</span>
            {document.profiles.map((profile) => (
              <span key={profile.id} role="columnheader">
                {profile.name}
                {profile.id === document.activeProfileId && <small>Active</small>}
              </span>
            ))}
          </div>
          {[
            ['Concurrent requests', (profile: ScraperSettingsDocument['profiles'][number]) => profile.settings.network.concurrentRequests],
            ['Request timeout', (profile: ScraperSettingsDocument['profiles'][number]) => `${Math.round(profile.settings.network.requestTimeoutMs / 1_000)}s`],
            ['Retry attempts', (profile: ScraperSettingsDocument['profiles'][number]) => profile.settings.network.retryAttempts],
            // Was browser.javascriptWaitMs, which no scrape has ever read.
            // Crawl delay is the pacing value safetyPolicy.ts actually enforces.
            ['Crawl delay', (profile: ScraperSettingsDocument['profiles'][number]) => `${(profile.settings.safety.crawlDelayMs / 1_000).toFixed(1)}s`],
            ['Parallel jobs', (profile: ScraperSettingsDocument['profiles'][number]) => profile.settings.performance.maxParallelJobs],
            ['Batch size', (profile: ScraperSettingsDocument['profiles'][number]) => profile.settings.performance.batchSize],
          ].map(([label, read]) => (
            <div
              className="scr-profile-compare-row"
              role="row"
              key={label as string}
              style={{ gridTemplateColumns: `minmax(160px, .9fr) repeat(${document.profiles.length}, minmax(120px, 1fr))` }}
            >
              <span role="rowheader">{label as string}</span>
              {document.profiles.map((profile) => (
                <span role="cell" key={profile.id}>{(read as (item: ScraperSettingsDocument['profiles'][number]) => ReactNode)(profile)}</span>
              ))}
            </div>
          ))}
        </div>
      </ScrCard>
    </div>
  );
}

const STARTER_SCHEDULES: ScraperScheduleEntry[] = [
  {
    id: 'weekly-one-piece',
    label: 'One Piece weekly update',
    cron: '0 19 * * 0',
    targetUrl: 'https://example-anime-site.com/anime/one-piece',
    profileId: 'balanced',
    enabled: true,
    lastRunAt: '2026-07-19T19:00:00.000Z',
    nextRunAt: '2026-07-26T19:00:00.000Z',
  },
  {
    id: 'monthly-archive',
    label: 'Archive integrity scan',
    cron: '0 3 1 * *',
    targetUrl: 'https://example-anime-site.com/library',
    profileId: 'thorough',
    enabled: false,
    lastRunAt: '2026-07-01T03:00:00.000Z',
    nextRunAt: '2026-08-01T03:00:00.000Z',
  },
];

/** Held-reason → what the user should read on the screen. */
const HELD_LABEL: Record<ScraperSchedulerState['heldBy'], string> = {
  '': sx('sched.held.armed'),
  disabled: sx('sched.held.disabled'),
  'quiet-hours': sx('sched.held.quietHours'),
  'on-battery': sx('sched.held.onBattery'),
  concurrency: sx('sched.held.concurrency'),
  'nothing-due': sx('sched.held.armed'),
};

function formatRunAt(iso: string | null, empty: string): string {
  if (!iso) return empty;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return empty;
  return new Date(ms).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * One line of plain English under the cron box. Deliberately shows the next two
 * firings rather than trying to translate the expression back into prose —
 * concrete dates are what people actually check the field against.
 */
function describeCron(expression: string): string {
  const parsed = parseCron(expression);
  if (!parsed.ok) return `Invalid: ${parsed.error}`;
  const first = nextCronRun(expression, Date.now());
  if (first === null) return 'Valid, but this date never occurs.';
  const second = nextCronRun(expression, first);
  const show = (ms: number) => formatRunAt(new Date(ms).toISOString(), '—');
  return second === null ? `Next: ${show(first)}` : `Next: ${show(first)}, then ${show(second)}`;
}

interface WeekDay {
  key: string;
  label: string;
  title: string;
  runs: number;
}

/**
 * The next seven days, marked with how many scheduled runs land on each. Walks
 * the cron forward per entry rather than reading nextRunAt, because nextRunAt
 * only ever holds the *first* upcoming run.
 */
function buildUpcomingWeek(entries: ScraperScheduleEntry[], enabled: boolean, nowMs: number): WeekDay[] {
  const days: WeekDay[] = [];
  const start = new Date(nowMs);
  start.setHours(0, 0, 0, 0);
  const endMs = start.getTime() + 7 * 86_400_000;

  const counts = new Map<string, number>();
  if (enabled) {
    for (const entry of entries) {
      if (!entry.enabled) continue;
      let cursor = nowMs;
      // Bounded by the week itself; the inner guard stops a `* * * * *` cron
      // from spinning for 10,080 iterations.
      for (let step = 0; step < 64; step += 1) {
        const at = nextCronRun(entry.cron, cursor);
        if (at === null || at >= endMs) break;
        const key = new Date(at).toDateString();
        counts.set(key, (counts.get(key) ?? 0) + 1);
        cursor = at;
      }
    }
  }

  for (let index = 0; index < 7; index += 1) {
    const day = new Date(start.getTime());
    day.setDate(day.getDate() + index);
    const key = day.toDateString();
    const runs = counts.get(key) ?? 0;
    days.push({
      key,
      label: `${day.toLocaleDateString([], { weekday: 'short' }).toUpperCase()} ${String(day.getDate()).padStart(2, '0')}`,
      title: runs === 1 ? '1 scheduled run' : `${runs} scheduled runs`,
      runs,
    });
  }
  return days;
}

export function ScheduledPage() {
  const port = useScraperPort();
  const initial = loadScraperSettingsDocument().profiles.find(
    (profile) => profile.id === loadScraperSettingsDocument().activeProfileId,
  )?.settings.scheduler;
  const seededSchedules = initial?.entries.length ? initial.entries : STARTER_SCHEDULES;
  const [schedules, setSchedules] = useState<ScraperScheduleEntry[]>(seededSchedules);
  const [selectedId, setSelectedId] = useState(seededSchedules[0]?.id ?? '');
  const [runNotice, setRunNotice] = useState('');
  const [schedulerEnabled, setSchedulerEnabled] = useState(initial?.enabled ?? false);
  // Run records come from whoever owns the clock, keyed by entry id. The
  // entries themselves never carry live timing — that would go stale the moment
  // the window was closed.
  const [runState, setRunState] = useState<ScraperSchedulerState>({
    entries: [],
    heldBy: 'disabled',
    runningJobIds: [],
  });
  const selected = schedules.find((entry) => entry.id === selectedId) ?? schedules[0];
  const recordFor = (id: string) => runState.entries.find((entry) => entry.id === id) ?? null;

  const policy = initial ?? loadScraperSettingsDocument().profiles[0].settings.scheduler;

  // The soonest run across every entry — the same number the shell's status bar
  // shows, derived from the same records.
  const nextRunLabel = useMemo(() => {
    const soonest = runState.entries.reduce<number | null>((best, entry) => {
      const ms = entry.nextRunAt ? Date.parse(entry.nextRunAt) : NaN;
      if (!Number.isFinite(ms)) return best;
      return best === null || ms < best ? ms : best;
    }, null);
    if (soonest === null) return 'None';
    return formatRunAt(new Date(soonest).toISOString(), 'None');
  }, [runState]);

  const upcomingWeek = useMemo(
    () => buildUpcomingWeek(schedules, schedulerEnabled, Date.now()),
    [schedules, schedulerEnabled],
  );

  // Every edit is pushed straight down; the reply carries the recomputed next
  // run times, so a cron typed into the box updates the list as it is typed.
  const sync = (entries: ScraperScheduleEntry[], enabled: boolean) => {
    void port
      .syncScheduler({ ...policy, enabled, entries })
      .then(setRunState)
      .catch(() => undefined);
  };

  const schedulesRef = useRef(schedules);
  schedulesRef.current = schedules;
  const enabledRef = useRef(schedulerEnabled);
  enabledRef.current = schedulerEnabled;

  // Sync once on mount and then subscribe; every later edit re-syncs through
  // `persist()`, so this deliberately does not depend on the schedule list.
  const syncRef = useRef(sync);
  syncRef.current = sync;
  useEffect(() => {
    syncRef.current(schedulesRef.current, enabledRef.current);
    return port.subscribeScheduler(setRunState);
  }, [port]);

  const persist = (next: ScraperScheduleEntry[], enabled = schedulerEnabled) => {
    setSchedules(next);
    setSchedulerEnabled(enabled);
    updateActiveScraperSettings({
      scheduler: { ...policy, enabled, entries: next },
    });
    sync(next, enabled);
  };

  const addSchedule = () => {
    const id = `schedule-${Date.now()}`;
    const next = [
      ...schedules,
      {
        id,
        label: 'New scheduled scrape',
        cron: '0 20 * * 5',
        targetUrl: 'https://anilist.co/anime/21/ONE-PIECE',
        profileId: 'balanced',
        enabled: true,
        lastRunAt: null,
        // Left null on purpose: the scheduler computes the first run from the
        // cron, so a hand-written date here could only ever be wrong.
        nextRunAt: null,
      },
    ];
    persist(next);
    setSelectedId(id);
    setRunNotice('New schedule added and selected.');
  };

  const patchSelected = (patch: Partial<ScraperScheduleEntry>) => {
    if (!selected) return;
    persist(schedules.map((entry) => (entry.id === selected.id ? { ...entry, ...patch } : entry)));
  };

  const runSelected = () => {
    if (!selected) return;
    setRunNotice(`Starting ${selected.label}…`);
    void port
      .runSchedule(selected.id)
      .then((jobId) => {
        setRunNotice(
          jobId
            ? `${selected.label} started job ${jobId}.`
            : `${selected.label} could not start — no scheduler backend is attached.`,
        );
      })
      .catch((error: unknown) => {
        setRunNotice(error instanceof Error ? error.message : String(error));
      });
  };

  const duplicateSelected = () => {
    if (!selected) return;
    const id = `schedule-${Date.now()}`;
    persist([
      ...schedules,
      {
        ...selected,
        id,
        label: `${selected.label} Copy`,
        enabled: false,
        lastRunAt: null,
      },
    ]);
    setSelectedId(id);
    setRunNotice('Schedule duplicated in a paused state.');
  };

  return (
    <div className="scr-page">
      <PageHead
        page="scheduled"
        title="Scheduled Tasks"
        subtitle="Recurring scrape jobs with visible timing, power, and network requirements."
        actions={
          <Button size="sm" variant="primary" leftIcon={<Icon name="plus" size={13} />} onClick={addSchedule}>
            New schedule
          </Button>
        }
      />

      <div className="scr-tile-row">
        <div className="scr-tile"><span className="scr-tile-label">Schedules</span><span className="scr-tile-value">{schedules.length}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">Enabled</span><span className="scr-tile-value">{schedules.filter((entry) => entry.enabled).length}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">Next run</span><span className="scr-tile-value scr-tile-value--format">{nextRunLabel}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">Scheduler</span><span className="scr-tile-value scr-tile-value--format">{HELD_LABEL[runState.heldBy]}</span></div>
      </div>

      <div className="scr-schedule-workspace">
        <ScrCard id="scheduled-list" title="Schedules" statusId="page.scheduled">
          <div className="scr-schedule-list">
            {schedules.map((entry) => (
              <div
                key={entry.id}
                className={`scr-schedule${entry.enabled ? '' : ' is-off'}${entry.id === selected?.id ? ' is-selected' : ''}`}
              >
                <Toggle
                  checked={entry.enabled}
                  aria-label={`Enable ${entry.label}`}
                  onChange={(event) =>
                    persist(
                      schedules.map((item) =>
                        item.id === entry.id ? { ...item, enabled: event.target.checked } : item,
                      ),
                    )
                  }
                />
                <button type="button" className="scr-schedule-main" onClick={() => setSelectedId(entry.id)}>
                  <span className="scr-list-main">
                    <span className="scr-list-title">{entry.label}</span>
                    <span className="scr-list-sub">{entry.targetUrl}</span>
                  </span>
                  <code className={`scr-code-chip${isValidCron(entry.cron) ? '' : ' is-invalid'}`}>
                    {entry.cron}
                  </code>
                  <span className="scr-list-cell">{entry.profileId}</span>
                  <span className="scr-list-cell scr-muted">
                    {!entry.enabled
                      ? 'Paused'
                      : !isValidCron(entry.cron)
                        ? 'Invalid cron'
                        : formatRunAt(recordFor(entry.id)?.nextRunAt ?? null, 'Not scheduled')}
                  </span>
                </button>
              </div>
            ))}
          </div>
        </ScrCard>

        <ScrCard
          id="schedule-editor"
          title="Schedule editor"
          description="Changes are validated and saved to the active scraper profile."
          statusId="set.scheduler"
          trailing={selected ? <span className={`scr-pill ${selected.enabled ? 'scr-pill--good' : 'scr-pill--quiet'}`}>{selected.enabled ? 'Enabled' : 'Paused'}</span> : null}
        >
          {selected && (
            <>
              <div className="scr-fields">
                <label className="scr-field">
                  <span className="scr-field-label">Name</span>
                  <input className="scr-input" value={selected.label} onChange={(event) => patchSelected({ label: event.target.value })} />
                </label>
                <label className="scr-field">
                  <span className="scr-field-label">Target URL</span>
                  <input className="scr-input" value={selected.targetUrl} onChange={(event) => patchSelected({ targetUrl: event.target.value })} />
                </label>
                <label className="scr-field">
                  <span className="scr-field-label">Cron expression</span>
                  <input
                    className={`scr-input scr-input--mono${isValidCron(selected.cron) ? '' : ' is-invalid'}`}
                    value={selected.cron}
                    onChange={(event) => patchSelected({ cron: event.target.value })}
                  />
                  <span className="scr-field-hint">{describeCron(selected.cron)}</span>
                </label>
                <label className="scr-field">
                  <span className="scr-field-label">Profile</span>
                  <select className="scr-input" value={selected.profileId} onChange={(event) => patchSelected({ profileId: event.target.value })}>
                    <option value="fast">Fast</option>
                    <option value="balanced">Balanced</option>
                    <option value="thorough">Thorough</option>
                  </select>
                </label>
              </div>
              <div className="scr-schedule-timing">
                <span>
                  <small>Last run</small>
                  <b>{formatRunAt(recordFor(selected.id)?.lastRunAt ?? null, 'Never')}</b>
                </span>
                <span>
                  <small>Next run</small>
                  <b>{formatRunAt(recordFor(selected.id)?.nextRunAt ?? null, 'Not scheduled')}</b>
                </span>
                <span>
                  <small>Last job</small>
                  <b>{recordFor(selected.id)?.lastJobId ?? '—'}</b>
                </span>
              </div>
              <div className="scr-page-actions">
                <Button size="sm" variant="primary" leftIcon={<Icon name="player" size={13} />} onClick={runSelected}>Run now</Button>
                <Button size="sm" onClick={duplicateSelected}>Duplicate</Button>
                {runNotice && <span className="scr-muted" role="status">{runNotice}</span>}
              </div>
            </>
          )}
        </ScrCard>
      </div>

      <div className="scr-grid">
        <ScrCard title="Scheduler policy" statusId="set.scheduler">
          <div className="scr-setting-summary">
            <span>Scheduler <b>{schedulerEnabled ? 'On' : 'Off'}</b></span>
            <span>Maximum concurrent tasks <b>{policy.maxConcurrentScheduled}</b></span>
            <span>Missed run policy <b>{policy.missedRunPolicy}</b></span>
            <span>
              Quiet hours{' '}
              <b>
                {policy.quietHoursStart && policy.quietHoursEnd
                  ? `${policy.quietHoursStart}–${policy.quietHoursEnd}`
                  : 'Off'}
              </b>
            </span>
            <span>Running now <b>{runState.runningJobIds.length}</b></span>
          </div>
          <div className="scr-page-actions">
            <Toggle
              checked={schedulerEnabled}
              aria-label="Enable the scheduler"
              onChange={(event) => persist(schedules, event.target.checked)}
            />
            <span className="scr-muted">
              {schedulerEnabled
                ? 'Enabled schedules fire on their cron, window open or not.'
                : 'Nothing fires until the scheduler is turned on.'}
            </span>
          </div>
        </ScrCard>
        <ScrCard title="Next seven days" statusId="page.scheduled">
          <div className="scr-calendar-strip">
            {upcomingWeek.map((day) => (
              <span key={day.key} className={day.runs ? 'has-job' : ''} title={day.title}>
                {day.label}
              </span>
            ))}
          </div>
        </ScrCard>
      </div>
    </div>
  );
}

const PREVIEW_ROWS = 8;

function newSiteRule(): ScraperSiteRule {
  return {
    ...DEFAULT_SITE_RULE,
    id: `rule-${Date.now()}`,
    host: '',
    sampleUrl: '',
    episodeSelector: '',
  };
}

export function SiteRulesPage() {
  const ctl = useScraper();
  const port = useScraperPort();
  const [rules, setRules] = useState<ScraperSiteRule[]>(
    () => getActiveScraperSettings().extraction.siteRules,
  );
  const [selectedId, setSelectedId] = useState(() => rules[0]?.id ?? '');
  const [extraction, setExtraction] = useState<RuleExtraction | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const selected = rules.find((rule) => rule.id === selectedId) ?? rules[0] ?? null;

  const problems = selected ? validateSiteRule(selected) : [];
  const problemFor = (field: SiteRuleProblem['field']) =>
    problems.find((problem) => problem.field === field)?.message ?? '';

  const persist = (next: ScraperSiteRule[]) => {
    setRules(next);
    updateActiveScraperSettings({ extraction: { siteRules: next } });
  };

  /** Writes to the selected rule without touching the report on screen. */
  const patchRule = (next: Partial<ScraperSiteRule>) => {
    if (!selected) return;
    persist(rules.map((rule) => (rule.id === selected.id ? { ...rule, ...next } : rule)));
  };

  const patch = (next: Partial<ScraperSiteRule>) => {
    patchRule(next);
    // A user edit invalidates the report on screen — it described the old rule.
    // Recording a validation result must *not* go through here, or the run
    // would immediately erase its own report.
    setExtraction(null);
  };

  const addRule = () => {
    const rule = newSiteRule();
    persist([...rules, rule]);
    setSelectedId(rule.id);
    setExtraction(null);
    setNotice('');
  };

  const removeSelected = () => {
    if (!selected) return;
    const next = rules.filter((rule) => rule.id !== selected.id);
    persist(next);
    setSelectedId(next[0]?.id ?? '');
    setExtraction(null);
  };

  /**
   * Fetches the sample page through main and runs the rule against it. This is
   * the whole point of the screen: a rule is only trustworthy once it has been
   * applied to the markup the site actually serves.
   */
  const validate = () => {
    if (!selected) return;
    const blocking = validateSiteRule(selected);
    if (blocking.length) {
      setNotice(blocking[0]?.message ?? 'This rule is incomplete.');
      return;
    }
    setBusy(true);
    setNotice(`Fetching ${selected.sampleUrl}…`);
    void port
      .fetchHttp({ method: 'GET', url: selected.sampleUrl, headers: {} })
      .then((response) => {
        if (response.status >= 400) {
          setExtraction(null);
          setNotice(`${selected.sampleUrl} answered ${response.status} ${response.statusText}.`);
          return;
        }
        const doc = new DOMParser().parseFromString(response.body, 'text/html');
        // The same Ignore Hidden Elements the engine will apply. A preview that
        // showed rows the run would drop is worse than no preview.
        const result = extractWithRule(doc, selected, selected.sampleUrl, {
          ignoreHiddenElements: getActiveScraperSettings().extraction.ignoreHiddenElements,
        });
        setExtraction(result);
        if (result.error) {
          setNotice(result.error);
          return;
        }
        setNotice(
          `${response.status} · ${response.body.length.toLocaleString()} bytes · ${result.rows.length} row(s) matched.`,
        );
        patchRule({
          lastValidatedAt: new Date().toISOString(),
          lastMatchCount: result.rows.length,
        });
      })
      .catch((error: unknown) => {
        setExtraction(null);
        setNotice(error instanceof Error ? error.message : String(error));
      })
      .finally(() => setBusy(false));
  };

  const validatedCount = rules.filter((rule) => rule.lastValidatedAt).length;

  return (
    <div className="scr-page">
      <PageHead
        page="site-rules"
        title="Site Rules"
        subtitle="Per-site extraction selectors, validated against the page the site actually serves."
        actions={
          <>
            <Button size="sm" onClick={() => ctl.navigate('selector-tester')}>Open selector tester</Button>
            <Button size="sm" variant="primary" leftIcon={<Icon name="plus" size={13} />} onClick={addRule}>
              New rule
            </Button>
          </>
        }
      />

      <div className="scr-tile-row">
        <div className="scr-tile"><span className="scr-tile-label">Site rules</span><span className="scr-tile-value">{rules.length}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">Enabled</span><span className="scr-tile-value">{rules.filter((rule) => rule.enabled).length}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">Validated</span><span className="scr-tile-value">{validatedCount}</span></div>
        <div className="scr-tile">
          <span className="scr-tile-label">Last match count</span>
          <span className="scr-tile-value">{(selected?.lastMatchCount ?? 0).toLocaleString()}</span>
        </div>
      </div>

      <div className="scr-rule-layout">
        <ScrCard title="Sites" statusId="page.site-rules">
          {rules.length === 0 ? (
            <p className="scr-muted">
              No site rules yet. Add one for a site that lists episodes in its own markup —
              catalogue-backed titles do not need a rule.
            </p>
          ) : (
            <div className="scr-rule-sites">
              {rules.map((rule) => (
                <button
                  key={rule.id}
                  type="button"
                  className={`scr-rule-site${rule.id === selected?.id ? ' is-active' : ''}`}
                  onClick={() => { setSelectedId(rule.id); setExtraction(null); setNotice(''); }}
                >
                  <span className={`scr-state-dot${rule.enabled ? '' : ' is-off'}`} />
                  <span>
                    <b>{rule.host || 'Unnamed rule'}</b>
                    <small>
                      {rule.lastValidatedAt
                        ? `${rule.lastMatchCount.toLocaleString()} matched · ${formatRunAt(rule.lastValidatedAt, '')}`
                        : 'Never validated'}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </ScrCard>

        {selected && (
          <ScrCard
            title={selected.host || 'New rule'}
            description="A rule can only be enabled once it has matched rows on its sample page."
            statusId="page.site-rules"
            trailing={
              <Toggle
                checked={selected.enabled}
                aria-label="Enable this rule"
                disabled={!selected.lastValidatedAt || selected.lastMatchCount === 0}
                onChange={(event) => patch({ enabled: event.target.checked })}
              />
            }
          >
            <div className="scr-fields">
              {([
                ['Host', 'host', 'example.com', false],
                ['Sample URL', 'sampleUrl', 'https://example.com/anime/one-piece', false],
                ['Episode row', 'episodeSelector', '.ep-list > li', true],
                ['Episode title (in row)', 'titleSelector', '.title', true],
                ['Episode link (in row)', 'linkSelector', 'a', true],
                ['Link attribute', 'linkAttribute', 'href', true],
                ['Episode number cell (in row)', 'numberSelector', 'th', true],
                ['Episode number pattern', 'numberPattern', 'E(\\d+)', true],
              ] as const).map(([label, field, placeholder, mono]) => {
                const problem = problemFor(field as SiteRuleProblem['field']);
                return (
                  <label key={field} className="scr-field">
                    <span className="scr-field-label">{label}</span>
                    <input
                      className={`scr-input${mono ? ' scr-input--mono' : ''}${problem ? ' is-invalid' : ''}`}
                      value={selected[field]}
                      placeholder={placeholder}
                      onChange={(event) => patch({ [field]: event.target.value })}
                    />
                    {problem && <span className="scr-field-hint">{problem}</span>}
                  </label>
                );
              })}
            </div>
            <div className="scr-page-actions">
              <Button size="sm" variant="primary" disabled={busy} onClick={validate}>
                {busy ? 'Validating…' : 'Validate against sample'}
              </Button>
              <Button size="sm" onClick={removeSelected}>Delete</Button>
              {notice && <span className="scr-muted" role="status">{notice}</span>}
            </div>
          </ScrCard>
        )}
      </div>

      <div className="scr-grid">
        <ScrCard
          title="Extraction preview"
          description={`The first ${PREVIEW_ROWS} rows the current selector set produced.`}
          statusId="page.site-rules"
          className="scr-card--wide"
        >
          {!extraction || !extraction.rows.length ? (
            <p className="scr-muted">
              {extraction?.error || 'Validate a rule to see the rows it extracts.'}
            </p>
          ) : (
            <div className="scr-rule-preview">
              {extraction.rows.slice(0, PREVIEW_ROWS).map((row) => (
                <div key={row.index}>
                  <span className="scr-match-index">{row.number ?? row.index}</span>
                  <span className="scr-list-main">
                    <b>{row.title || '(no title)'}</b>
                    <small>{row.number === null ? 'no episode number' : `episode ${row.number}`}</small>
                  </span>
                  <code>{row.rawLink || '(no link)'}</code>
                  <span className={`scr-pill ${row.title && row.rawLink ? 'scr-pill--good' : 'scr-pill--warn'}`}>
                    {row.title && row.rawLink ? 'matched' : 'partial'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </ScrCard>
        <ScrCard title="Validation report" statusId="page.site-rules">
          {!extraction || !extraction.checks.length ? (
            <p className="scr-muted">No validation run yet.</p>
          ) : (
            <div className="scr-validation-list">
              {extraction.checks.map((item) => (
                <span key={item.id} className={item.ok ? '' : 'is-failed'}>
                  <Icon name={item.ok ? 'check' : 'error'} size={13} />
                  {item.label} — {item.detail}
                </span>
              ))}
            </div>
          )}
          <p className="scr-muted">
            {selected?.lastValidatedAt
              ? `Last validated ${formatRunAt(selected.lastValidatedAt, '')}`
              : 'Never validated'}
          </p>
        </ScrCard>
      </div>
    </div>
  );
}

export function PluginsPage() {
  const port = useScraperPort();
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [filter, setFilter] = useState('all');
  const [notice, setNotice] = useState('');
  const installInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void port.listPlugins().then(setPlugins);
  }, [port]);

  const visible = useMemo(
    () =>
      plugins.filter((plugin) =>
        filter === 'all'
          ? true
          : filter === 'updates'
            ? Boolean(plugin.updateAvailable)
            : filter === 'enabled'
              ? plugin.enabled
              : !plugin.compatible,
      ),
    [plugins, filter],
  );
  const permissionCounts = useMemo(
    () => ({
      network: plugins.filter((plugin) => plugin.permissions.some((permission) => permission.startsWith('network:'))).length,
      browser: plugins.filter((plugin) => plugin.permissions.some((permission) => permission.startsWith('browser:'))).length,
      storage: plugins.filter((plugin) => plugin.permissions.some((permission) => permission.startsWith('storage:'))).length,
      broad: plugins.filter((plugin) => plugin.permissions.some((permission) => permission.includes('*') || permission.startsWith('filesystem:'))).length,
    }),
    [plugins],
  );

  const applyUpdates = () => {
    const updates = plugins.filter((plugin) => plugin.updateAvailable).length;
    setPlugins((current) =>
      current.map((plugin) =>
        plugin.updateAvailable
          ? { ...plugin, version: plugin.updateAvailable, updateAvailable: '' }
          : plugin,
      ),
    );
    setNotice(updates ? `Updated ${updates} adapter${updates === 1 ? '' : 's'}.` : 'All adapters are current.');
  };

  const installPlugin = async (file: File | undefined) => {
    if (!file) return;
    try {
      const installed = parsePluginManifest(await file.text(), file.name);
      setPlugins((current) => [
        installed,
        ...current.filter((plugin) => plugin.id !== installed.id),
      ]);
      setFilter('all');
      setNotice(`${installed.name} v${installed.version} installed from ${file.name}.`);
    } catch (error) {
      setNotice(error instanceof Error ? `Could not install plugin: ${error.message}` : 'Could not install plugin manifest.');
    } finally {
      if (installInput.current) installInput.current.value = '';
    }
  };

  return (
    <div className="scr-page">
      <PageHead
        page="plugins"
        title="Plugins"
        subtitle="Provider adapters with explicit compatibility and permission details."
        actions={
          <>
            <input
              ref={installInput}
              className="scr-visually-hidden"
              type="file"
              accept=".json,application/json"
              aria-label="Plugin manifest file"
              onChange={(event) => void installPlugin(event.target.files?.[0])}
            />
            <Button size="sm" leftIcon={<Icon name="plus" size={13} />} onClick={() => installInput.current?.click()}>
              Install from file
            </Button>
          </>
        }
      />
      {notice && <p className="scr-action-notice" role="status">{notice}</p>}
      <div className="scr-tile-row">
        <div className="scr-tile"><span className="scr-tile-label">Installed</span><span className="scr-tile-value">{plugins.length}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">Enabled</span><span className="scr-tile-value">{plugins.filter((plugin) => plugin.enabled).length}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">Updates</span><span className="scr-tile-value">{plugins.filter((plugin) => plugin.updateAvailable).length}</span></div>
        <div className={`scr-tile${plugins.some((plugin) => !plugin.compatible) ? ' is-bad' : ''}`}><span className="scr-tile-label">Incompatible</span><span className="scr-tile-value">{plugins.filter((plugin) => !plugin.compatible).length}</span></div>
      </div>
      <div className="scr-chip-row">
        {[
          ['all', 'All'],
          ['enabled', 'Enabled'],
          ['updates', 'Updates'],
          ['incompatible', 'Incompatible'],
        ].map(([id, label]) => (
          <button key={id} type="button" className={`scr-chip${filter === id ? ' is-on' : ''}`} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="scr-plugin-grid">
        {visible.map((plugin) => (
          <ScrCard
            key={plugin.id}
            title={plugin.name}
            description={plugin.description}
            statusId="page.plugins"
            className={!plugin.compatible ? 'scr-card--warning' : ''}
            trailing={
              <Toggle
                checked={plugin.enabled}
                disabled={!plugin.compatible}
                onChange={(event) =>
                  setPlugins((current) =>
                    current.map((item) =>
                      item.id === plugin.id ? { ...item, enabled: event.target.checked } : item,
                    ),
                  )
                }
              />
            }
          >
            <div className="scr-plugin-meta">
              <span>v{plugin.version}</span>
              <span>{plugin.publisher}</span>
              {plugin.updateAvailable && <span className="scr-pill scr-pill--accent">v{plugin.updateAvailable} available</span>}
              {!plugin.compatible && <span className="scr-pill scr-pill--bad">Incompatible</span>}
            </div>
            <div className="scr-permission-list">
              {plugin.permissions.map((permission) => <code key={permission}>{permission}</code>)}
            </div>
          </ScrCard>
        ))}
      </div>
      <div className="scr-plugin-operations">
        <ScrCard
          title="Permission audit"
          description="Capability groups requested by the currently installed adapter set."
          statusId="page.plugins"
        >
          <div className="scr-permission-audit">
            <span><Icon name="globe" size={14} /><b>{permissionCounts.network}</b><small>Network access</small></span>
            <span><Icon name="scan" size={14} /><b>{permissionCounts.browser}</b><small>Browser control</small></span>
            <span><Icon name="drive" size={14} /><b>{permissionCounts.storage}</b><small>Storage access</small></span>
            <span className={permissionCounts.broad ? 'is-risk' : ''}><Icon name="warning" size={14} /><b>{permissionCounts.broad}</b><small>Broad access</small></span>
          </div>
          <p className="scr-muted">Legacy AniX remains disabled because it requests wildcard network and direct filesystem access.</p>
        </ScrCard>
        <ScrCard
          title="Update center"
          description="Adapter updates are staged independently from the desktop application."
          statusId="page.plugins"
          trailing={<span className="scr-pill scr-pill--accent">{plugins.filter((plugin) => plugin.updateAvailable).length} available</span>}
        >
          <div className="scr-plugin-update">
            <div>
              <b>{plugins.find((plugin) => plugin.updateAvailable)?.name ?? 'Adapters are current'}</b>
              <small>
                {plugins.find((plugin) => plugin.updateAvailable)
                  ? `v${plugins.find((plugin) => plugin.updateAvailable)?.version} → v${plugins.find((plugin) => plugin.updateAvailable)?.updateAvailable}`
                  : 'No pending adapter packages'}
              </small>
            </div>
            <Button size="sm" leftIcon={<Icon name="refresh" size={13} />} onClick={applyUpdates}>
              Update all
            </Button>
          </div>
        </ScrCard>
      </div>
    </div>
  );
}
