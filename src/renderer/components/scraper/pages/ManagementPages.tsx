import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Icon from '../../Icons';
import { Button, Toggle } from '../../ui';
import ScrCard from '../ScrCard';
import StatusDot from '../StatusDot';
import { useScraper } from '../ScraperContext';
import { useT } from '../../../i18n';
import { LANG_TAGS, type UiLang } from '../../../../shared/i18n/core';
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

/**
 * These four pages translate through shared/i18n rather than the Scraper app's
 * own `sx()` table in ../strings.ts (audit F7 / dispatch W4).
 *
 * ../strings.ts records a deliberate decision to defer the Scraper from the
 * app-chrome sweep, and anticipates the eventual migration as "move this map
 * into catalogs/{en,ja,zh,ru}.ts and swap sx() for useT()'s t()". That is what
 * this file does — one file rather than the whole app at once, so the Scraper
 * currently runs both systems. The six scheduler strings this file used to read
 * through `sx()` now live under `scraperMgmt.held.*` / `scraperMgmt.sched.empty`
 * in shared/i18n/scraperUi; the `sx()` originals stay put for the ~30 Scraper
 * files still on that table.
 */
type Translate = (key: string, vars?: Record<string, string | number>) => string;

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
  const { t, lang } = useT();
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

  // The generated name is a seed value the user immediately renames, so it stays
  // literal — CLAUDE.md i18n rule 4 exempts "default seed values a user can
  // rename" from the chrome sweep, along with the profile names themselves.
  const duplicate = () => {
    const active = document.profiles.find((profile) => profile.id === document.activeProfileId);
    setDocument(
      saveScraperSettingsDocument(
        createScraperProfile(document, `${active?.name ?? 'Profile'} Copy`),
      ),
    );
  };

  // Depends on `lang`, never on `t` — `t`'s identity is stable by design, so a
  // memo that lists it goes stale after a language switch instead of erroring
  // (CLAUDE.md i18n rule 6).
  const comparisonRows = useMemo(
    () =>
      [
        [t('scraperMgmt.compare.concurrentRequests'), (profile: ScraperSettingsDocument['profiles'][number]) => profile.settings.network.concurrentRequests],
        [t('scraperMgmt.compare.requestTimeout'), (profile: ScraperSettingsDocument['profiles'][number]) => `${Math.round(profile.settings.network.requestTimeoutMs / 1_000)}s`],
        [t('scraperMgmt.compare.retryAttempts'), (profile: ScraperSettingsDocument['profiles'][number]) => profile.settings.network.retryAttempts],
        // Was browser.javascriptWaitMs, which no scrape has ever read.
        // Crawl delay is the pacing value safetyPolicy.ts actually enforces.
        [t('scraperMgmt.compare.crawlDelay'), (profile: ScraperSettingsDocument['profiles'][number]) => `${(profile.settings.safety.crawlDelayMs / 1_000).toFixed(1)}s`],
        [t('scraperMgmt.compare.parallelJobs'), (profile: ScraperSettingsDocument['profiles'][number]) => profile.settings.performance.maxParallelJobs],
        [t('scraperMgmt.compare.batchSize'), (profile: ScraperSettingsDocument['profiles'][number]) => profile.settings.performance.batchSize],
      ] as const,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang],
  );

  return (
    <div className="scr-page">
      <PageHead
        page="profiles"
        title={t('scraperMgmt.profiles.title')}
        subtitle={t('scraperMgmt.profiles.subtitle')}
        actions={
          <Button size="sm" leftIcon={<Icon name="plus" size={13} />} onClick={duplicate}>
            {t('scraperMgmt.profiles.duplicateActive')}
          </Button>
        }
      />

      <div className="scr-tile-row">
        <div className="scr-tile"><span className="scr-tile-label">{t('scraperMgmt.profiles.tile.saved')}</span><span className="scr-tile-value">{document.profiles.length}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">{t('scraperMgmt.profiles.tile.activePreset')}</span><span className="scr-tile-value scr-tile-value--text">{t(`scraperMgmt.preset.${activeProfile?.preset ?? 'custom'}`)}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">{t('scraperMgmt.profiles.tile.revisions')}</span><span className="scr-tile-value">{revisionCount}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">{t('scraperMgmt.profiles.tile.overrides')}</span><span className="scr-tile-value">{Object.keys(document.siteOverrides).length}</span></div>
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
              trailing={active ? <span className="scr-pill scr-pill--good">{t('scraperMgmt.profiles.active')}</span> : null}
            >
              <div className="scr-profile-stats">
                <span><b>{profile.settings.network.concurrentRequests}</b> {t('scraperMgmt.profiles.stat.requests')}</span>
                <span><b>{Math.round(profile.settings.network.requestTimeoutMs / 1_000)}s</b> {t('scraperMgmt.profiles.stat.timeout')}</span>
                <span><b>{profile.settings.sources.mode}</b> {t('scraperMgmt.profiles.stat.sources')}</span>
              </div>
              <div className="scr-page-actions">
                <Button size="sm" variant={active ? 'primary' : 'default'} onClick={() => activate(profile.id)}>
                  {active ? t('scraperMgmt.profiles.selected') : t('scraperMgmt.profiles.use')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => ctl.openDrawer('network')}>
                  {t('scraperMgmt.profiles.editSettings')}
                </Button>
              </div>
            </ScrCard>
          );
        })}
      </div>

      <ScrCard
        id="profile-presets"
        title={t('scraperMgmt.presets.title')}
        description={t('scraperMgmt.presets.description')}
        statusId="set.profiles"
      >
        <div className="scr-preset-row">
          {(['fast', 'balanced', 'thorough'] as const).map((preset) => (
            <button key={preset} type="button" className="scr-preset" onClick={() => applyPreset(preset)}>
              <Icon name={preset === 'fast' ? 'flame' : preset === 'balanced' ? 'shield' : 'scan'} size={18} />
              <span>
                <b>{t(`scraperMgmt.preset.${preset}`)}</b>
                <small>{t(`scraperMgmt.preset.${preset}.hint`)}</small>
              </span>
            </button>
          ))}
        </div>
      </ScrCard>

      <ScrCard
        id="profile-comparison"
        title={t('scraperMgmt.compare.title')}
        description={t('scraperMgmt.compare.description')}
        statusId="set.profiles"
      >
        <div className="scr-profile-compare" role="table" aria-label={t('scraperMgmt.compare.tableLabel')}>
          <div
            className="scr-profile-compare-row is-head"
            role="row"
            style={{ gridTemplateColumns: `minmax(160px, .9fr) repeat(${document.profiles.length}, minmax(120px, 1fr))` }}
          >
            <span role="columnheader">{t('scraperMgmt.compare.setting')}</span>
            {document.profiles.map((profile) => (
              <span key={profile.id} role="columnheader">
                {profile.name}
                {profile.id === document.activeProfileId && <small>{t('scraperMgmt.profiles.active')}</small>}
              </span>
            ))}
          </div>
          {comparisonRows.map(([label, read]) => (
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

/*
 * There are deliberately no starter schedules.
 *
 * This used to seed every fresh install with two entries against
 * `example-anime-site.com` — a domain that does not exist — carrying
 * `lastRunAt` / `nextRunAt` dates for runs that never happened. One was
 * `enabled: true`, so a new user's Schedules page opened claiming an armed
 * weekly job with a run history. Pressing "Run now" did not fail either: the
 * engine fell through to AniList and answered from there without ever saying
 * the target had been substituted. Audit F3.
 *
 * `addSchedule` below is the honest shape and always was — it leaves both
 * timestamps `null` because "the scheduler computes the first run from the
 * cron, so a hand-written date here could only ever be wrong." An empty list
 * is the correct starting state; the page renders an empty state for it.
 */

/** Held-reason → the key for what the user should read on the screen. */
const HELD_KEY: Record<ScraperSchedulerState['heldBy'], string> = {
  '': 'scraperMgmt.held.armed',
  disabled: 'scraperMgmt.held.disabled',
  'quiet-hours': 'scraperMgmt.held.quietHours',
  'on-battery': 'scraperMgmt.held.onBattery',
  concurrency: 'scraperMgmt.held.concurrency',
  'nothing-due': 'scraperMgmt.held.armed',
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
function describeCron(expression: string, t: Translate): string {
  const parsed = parseCron(expression);
  if (!parsed.ok) return t('scraperMgmt.cron.invalid', { error: parsed.error });
  const first = nextCronRun(expression, Date.now());
  if (first === null) return t('scraperMgmt.cron.never');
  const second = nextCronRun(expression, first);
  const show = (ms: number) => formatRunAt(new Date(ms).toISOString(), '—');
  return second === null
    ? t('scraperMgmt.cron.next', { first: show(first) })
    : t('scraperMgmt.cron.nextThen', { first: show(first), second: show(second) });
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
function buildUpcomingWeek(
  entries: ScraperScheduleEntry[],
  enabled: boolean,
  nowMs: number,
  t: Translate,
  // Module-level, so it cannot call `useT()`: the weekday abbreviations below
  // would otherwise come from the OS locale rather than the UI language.
  lang: UiLang,
): WeekDay[] {
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
      label: `${day.toLocaleDateString(LANG_TAGS[lang], { weekday: 'short' }).toUpperCase()} ${String(day.getDate()).padStart(2, '0')}`,
      title: t('scraperMgmt.week.runs', { count: runs }),
      runs,
    });
  }
  return days;
}

export function ScheduledPage() {
  const port = useScraperPort();
  const { t, lang } = useT();
  const initial = loadScraperSettingsDocument().profiles.find(
    (profile) => profile.id === loadScraperSettingsDocument().activeProfileId,
  )?.settings.scheduler;
  const seededSchedules = initial?.entries ?? [];
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
  //
  // `lang` and not `t` in the dependency list: see ProfilesPage above.
  const nextRunLabel = useMemo(() => {
    const soonest = runState.entries.reduce<number | null>((best, entry) => {
      const ms = entry.nextRunAt ? Date.parse(entry.nextRunAt) : NaN;
      if (!Number.isFinite(ms)) return best;
      return best === null || ms < best ? ms : best;
    }, null);
    if (soonest === null) return t('scraperMgmt.sched.none');
    return formatRunAt(new Date(soonest).toISOString(), t('scraperMgmt.sched.none'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runState, lang]);

  const upcomingWeek = useMemo(
    () => buildUpcomingWeek(schedules, schedulerEnabled, Date.now(), t, lang),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schedules, schedulerEnabled, lang],
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
        // Seed values the user renames in the editor below, so they stay
        // literal (CLAUDE.md i18n rule 4), same as the profile copy name.
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
    setRunNotice(t('scraperMgmt.sched.added'));
  };

  const patchSelected = (patch: Partial<ScraperScheduleEntry>) => {
    if (!selected) return;
    persist(schedules.map((entry) => (entry.id === selected.id ? { ...entry, ...patch } : entry)));
  };

  const runSelected = () => {
    if (!selected) return;
    setRunNotice(t('scraperMgmt.sched.starting', { label: selected.label }));
    void port
      .runSchedule(selected.id)
      .then((jobId) => {
        setRunNotice(
          jobId
            ? t('scraperMgmt.sched.started', { label: selected.label, jobId })
            : t('scraperMgmt.sched.noBackend', { label: selected.label }),
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
    setRunNotice(t('scraperMgmt.sched.duplicated'));
  };

  return (
    <div className="scr-page">
      <PageHead
        page="scheduled"
        title={t('scraperMgmt.sched.title')}
        subtitle={t('scraperMgmt.sched.subtitle')}
        actions={
          <Button size="sm" variant="primary" leftIcon={<Icon name="plus" size={13} />} onClick={addSchedule}>
            {t('scraperMgmt.sched.new')}
          </Button>
        }
      />

      <div className="scr-tile-row">
        <div className="scr-tile"><span className="scr-tile-label">{t('scraperMgmt.sched.tile.schedules')}</span><span className="scr-tile-value">{schedules.length}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">{t('scraperMgmt.sched.tile.enabled')}</span><span className="scr-tile-value">{schedules.filter((entry) => entry.enabled).length}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">{t('scraperMgmt.sched.tile.nextRun')}</span><span className="scr-tile-value scr-tile-value--format">{nextRunLabel}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">{t('scraperMgmt.sched.tile.scheduler')}</span><span className="scr-tile-value scr-tile-value--format">{t(HELD_KEY[runState.heldBy])}</span></div>
      </div>

      <div className="scr-schedule-workspace">
        <ScrCard id="scheduled-list" title={t('scraperMgmt.sched.listTitle')} statusId="page.scheduled">
          <div className="scr-schedule-list">
            {schedules.length === 0 && (
              <p className="scr-muted">{t('scraperMgmt.sched.empty')}</p>
            )}
            {schedules.map((entry) => (
              <div
                key={entry.id}
                className={`scr-schedule${entry.enabled ? '' : ' is-off'}${entry.id === selected?.id ? ' is-selected' : ''}`}
              >
                <Toggle
                  checked={entry.enabled}
                  aria-label={t('scraperMgmt.sched.enableEntry', { label: entry.label })}
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
                      ? t('scraperMgmt.sched.paused')
                      : !isValidCron(entry.cron)
                        ? t('scraperMgmt.sched.invalidCron')
                        : formatRunAt(recordFor(entry.id)?.nextRunAt ?? null, t('scraperMgmt.sched.notScheduled'))}
                  </span>
                </button>
              </div>
            ))}
          </div>
        </ScrCard>

        <ScrCard
          id="schedule-editor"
          title={t('scraperMgmt.sched.editorTitle')}
          description={t('scraperMgmt.sched.editorDescription')}
          statusId="set.scheduler"
          trailing={selected ? <span className={`scr-pill ${selected.enabled ? 'scr-pill--good' : 'scr-pill--quiet'}`}>{selected.enabled ? t('scraperMgmt.sched.enabled') : t('scraperMgmt.sched.paused')}</span> : null}
        >
          {selected && (
            <>
              <div className="scr-fields">
                <label className="scr-field">
                  <span className="scr-field-label">{t('scraperMgmt.sched.field.name')}</span>
                  <input className="scr-input" value={selected.label} onChange={(event) => patchSelected({ label: event.target.value })} />
                </label>
                <label className="scr-field">
                  <span className="scr-field-label">{t('scraperMgmt.sched.field.targetUrl')}</span>
                  <input className="scr-input" value={selected.targetUrl} onChange={(event) => patchSelected({ targetUrl: event.target.value })} />
                </label>
                <label className="scr-field">
                  <span className="scr-field-label">{t('scraperMgmt.sched.field.cron')}</span>
                  <input
                    className={`scr-input scr-input--mono${isValidCron(selected.cron) ? '' : ' is-invalid'}`}
                    value={selected.cron}
                    onChange={(event) => patchSelected({ cron: event.target.value })}
                  />
                  <span className="scr-field-hint">{describeCron(selected.cron, t)}</span>
                </label>
                <label className="scr-field">
                  <span className="scr-field-label">{t('scraperMgmt.sched.field.profile')}</span>
                  <select className="scr-input" value={selected.profileId} onChange={(event) => patchSelected({ profileId: event.target.value })}>
                    {(['fast', 'balanced', 'thorough'] as const).map((preset) => (
                      <option key={preset} value={preset}>{t(`scraperMgmt.preset.${preset}`)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="scr-schedule-timing">
                <span>
                  <small>{t('scraperMgmt.sched.lastRun')}</small>
                  <b>{formatRunAt(recordFor(selected.id)?.lastRunAt ?? null, t('scraperMgmt.sched.never'))}</b>
                </span>
                <span>
                  <small>{t('scraperMgmt.sched.nextRun')}</small>
                  <b>{formatRunAt(recordFor(selected.id)?.nextRunAt ?? null, t('scraperMgmt.sched.notScheduled'))}</b>
                </span>
                <span>
                  <small>{t('scraperMgmt.sched.lastJob')}</small>
                  <b>{recordFor(selected.id)?.lastJobId ?? '—'}</b>
                </span>
              </div>
              <div className="scr-page-actions">
                <Button size="sm" variant="primary" leftIcon={<Icon name="player" size={13} />} onClick={runSelected}>{t('scraperMgmt.sched.runNow')}</Button>
                <Button size="sm" onClick={duplicateSelected}>{t('scraperMgmt.sched.duplicate')}</Button>
                {runNotice && <span className="scr-muted" role="status">{runNotice}</span>}
              </div>
            </>
          )}
        </ScrCard>
      </div>

      <div className="scr-grid">
        <ScrCard title={t('scraperMgmt.policy.title')} statusId="set.scheduler">
          <div className="scr-setting-summary">
            <span>{t('scraperMgmt.policy.scheduler')} <b>{schedulerEnabled ? t('scraperMgmt.policy.on') : t('scraperMgmt.policy.off')}</b></span>
            <span>{t('scraperMgmt.policy.maxConcurrent')} <b>{policy.maxConcurrentScheduled}</b></span>
            <span>{t('scraperMgmt.policy.missedRun')} <b>{t(`scraperMgmt.policy.missed.${policy.missedRunPolicy}`)}</b></span>
            <span>
              {t('scraperMgmt.policy.quietHours')}{' '}
              <b>
                {policy.quietHoursStart && policy.quietHoursEnd
                  ? `${policy.quietHoursStart}–${policy.quietHoursEnd}`
                  : t('scraperMgmt.policy.off')}
              </b>
            </span>
            <span>{t('scraperMgmt.policy.runningNow')} <b>{runState.runningJobIds.length}</b></span>
          </div>
          <div className="scr-page-actions">
            <Toggle
              checked={schedulerEnabled}
              aria-label={t('scraperMgmt.policy.enableLabel')}
              onChange={(event) => persist(schedules, event.target.checked)}
            />
            <span className="scr-muted">
              {schedulerEnabled
                ? t('scraperMgmt.policy.enabledHint')
                : t('scraperMgmt.policy.disabledHint')}
            </span>
          </div>
        </ScrCard>
        <ScrCard title={t('scraperMgmt.week.title')} statusId="page.scheduled">
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
  const { t, lang } = useT();
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

  // Placeholders stay literal: they are CSS/XPath selector samples and example
  // hosts, i.e. format examples rather than chrome (CLAUDE.md i18n rule 4).
  // `lang`, never `t`, in the dependency list — see ProfilesPage.
  const ruleFields = useMemo(
    () =>
      [
        [t('scraperMgmt.rule.host'), 'host', 'example.com', false],
        [t('scraperMgmt.rule.sampleUrl'), 'sampleUrl', 'https://example.com/anime/one-piece', false],
        [t('scraperMgmt.rule.episodeRow'), 'episodeSelector', '.ep-list > li', true],
        [t('scraperMgmt.rule.episodeTitle'), 'titleSelector', '.title', true],
        [t('scraperMgmt.rule.episodeLink'), 'linkSelector', 'a', true],
        [t('scraperMgmt.rule.linkAttribute'), 'linkAttribute', 'href', true],
        [t('scraperMgmt.rule.numberCell'), 'numberSelector', 'th', true],
        [t('scraperMgmt.rule.numberPattern'), 'numberPattern', 'E(\\d+)', true],
      ] as const,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang],
  );

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
      setNotice(blocking[0]?.message ?? t('scraperMgmt.rule.incomplete'));
      return;
    }
    setBusy(true);
    setNotice(t('scraperMgmt.rule.fetching', { url: selected.sampleUrl }));
    void port
      .fetchHttp({ method: 'GET', url: selected.sampleUrl, headers: {} })
      .then((response) => {
        if (response.status >= 400) {
          setExtraction(null);
          setNotice(t('scraperMgmt.rule.answered', {
            url: selected.sampleUrl,
            status: response.status,
            statusText: response.statusText,
          }));
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
        setNotice(t('scraperMgmt.rule.validated', {
          status: response.status,
          bytes: response.body.length.toLocaleString(),
          rows: result.rows.length,
        }));
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
        title={t('scraperMgmt.rules.title')}
        subtitle={t('scraperMgmt.rules.subtitle')}
        actions={
          <>
            <Button size="sm" onClick={() => ctl.navigate('selector-tester')}>{t('scraperMgmt.rules.openTester')}</Button>
            <Button size="sm" variant="primary" leftIcon={<Icon name="plus" size={13} />} onClick={addRule}>
              {t('scraperMgmt.rules.new')}
            </Button>
          </>
        }
      />

      <div className="scr-tile-row">
        <div className="scr-tile"><span className="scr-tile-label">{t('scraperMgmt.rules.tile.rules')}</span><span className="scr-tile-value">{rules.length}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">{t('scraperMgmt.rules.tile.enabled')}</span><span className="scr-tile-value">{rules.filter((rule) => rule.enabled).length}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">{t('scraperMgmt.rules.tile.validated')}</span><span className="scr-tile-value">{validatedCount}</span></div>
        <div className="scr-tile">
          <span className="scr-tile-label">{t('scraperMgmt.rules.tile.lastMatch')}</span>
          <span className="scr-tile-value">{(selected?.lastMatchCount ?? 0).toLocaleString()}</span>
        </div>
      </div>

      <div className="scr-rule-layout">
        <ScrCard title={t('scraperMgmt.rules.sites')} statusId="page.site-rules">
          {rules.length === 0 ? (
            <p className="scr-muted">{t('scraperMgmt.rules.empty')}</p>
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
                    <b>{rule.host || t('scraperMgmt.rules.unnamed')}</b>
                    <small>
                      {rule.lastValidatedAt
                        ? t('scraperMgmt.rules.matchedAt', {
                            count: rule.lastMatchCount,
                            when: formatRunAt(rule.lastValidatedAt, ''),
                          })
                        : t('scraperMgmt.rules.neverValidated')}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </ScrCard>

        {selected && (
          <ScrCard
            title={selected.host || t('scraperMgmt.rules.newRule')}
            description={t('scraperMgmt.rules.enableHint')}
            statusId="page.site-rules"
            trailing={
              <Toggle
                checked={selected.enabled}
                aria-label={t('scraperMgmt.rules.enableThis')}
                disabled={!selected.lastValidatedAt || selected.lastMatchCount === 0}
                onChange={(event) => patch({ enabled: event.target.checked })}
              />
            }
          >
            <div className="scr-fields">
              {ruleFields.map(([label, field, placeholder, mono]) => {
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
                {busy ? t('scraperMgmt.rules.validating') : t('scraperMgmt.rules.validate')}
              </Button>
              <Button size="sm" onClick={removeSelected}>{t('scraperMgmt.rules.delete')}</Button>
              {notice && <span className="scr-muted" role="status">{notice}</span>}
            </div>
          </ScrCard>
        )}
      </div>

      <div className="scr-grid">
        <ScrCard
          title={t('scraperMgmt.preview.title')}
          description={t('scraperMgmt.preview.description', { rows: PREVIEW_ROWS })}
          statusId="page.site-rules"
          className="scr-card--wide"
        >
          {!extraction || !extraction.rows.length ? (
            <p className="scr-muted">
              {extraction?.error || t('scraperMgmt.preview.empty')}
            </p>
          ) : (
            <div className="scr-rule-preview">
              {extraction.rows.slice(0, PREVIEW_ROWS).map((row) => (
                <div key={row.index}>
                  <span className="scr-match-index">{row.number ?? row.index}</span>
                  <span className="scr-list-main">
                    <b>{row.title || t('scraperMgmt.preview.noTitle')}</b>
                    <small>{row.number === null ? t('scraperMgmt.preview.noNumber') : t('scraperMgmt.preview.episode', { number: row.number })}</small>
                  </span>
                  <code>{row.rawLink || t('scraperMgmt.preview.noLink')}</code>
                  <span className={`scr-pill ${row.title && row.rawLink ? 'scr-pill--good' : 'scr-pill--warn'}`}>
                    {row.title && row.rawLink ? t('scraperMgmt.preview.matched') : t('scraperMgmt.preview.partial')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </ScrCard>
        <ScrCard title={t('scraperMgmt.report.title')} statusId="page.site-rules">
          {!extraction || !extraction.checks.length ? (
            <p className="scr-muted">{t('scraperMgmt.report.empty')}</p>
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
              ? t('scraperMgmt.report.lastValidated', { when: formatRunAt(selected.lastValidatedAt, '') })
              : t('scraperMgmt.rules.neverValidated')}
          </p>
        </ScrCard>
      </div>
    </div>
  );
}

export function PluginsPage() {
  const port = useScraperPort();
  const { t, lang } = useT();
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

  // `lang`, never `t` — see ProfilesPage.
  const filterChips = useMemo(
    () =>
      [
        ['all', t('scraperMgmt.plugins.filter.all')],
        ['enabled', t('scraperMgmt.plugins.filter.enabled')],
        ['updates', t('scraperMgmt.plugins.filter.updates')],
        ['incompatible', t('scraperMgmt.plugins.filter.incompatible')],
      ] as const,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang],
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
    setNotice(updates ? t('scraperMgmt.plugins.updated', { count: updates }) : t('scraperMgmt.plugins.allCurrent'));
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
      setNotice(t('scraperMgmt.plugins.installed', { name: installed.name, version: installed.version, file: file.name }));
    } catch (error) {
      setNotice(error instanceof Error
        ? t('scraperMgmt.plugins.installFailedDetail', { detail: error.message })
        : t('scraperMgmt.plugins.installFailed'));
    } finally {
      if (installInput.current) installInput.current.value = '';
    }
  };

  return (
    <div className="scr-page">
      <PageHead
        page="plugins"
        title={t('scraperMgmt.plugins.title')}
        subtitle={t('scraperMgmt.plugins.subtitle')}
        actions={
          <>
            <input
              ref={installInput}
              className="scr-visually-hidden"
              type="file"
              accept=".json,application/json"
              aria-label={t('scraperMgmt.plugins.manifestLabel')}
              onChange={(event) => void installPlugin(event.target.files?.[0])}
            />
            <Button size="sm" leftIcon={<Icon name="plus" size={13} />} onClick={() => installInput.current?.click()}>
              {t('scraperMgmt.plugins.installFromFile')}
            </Button>
          </>
        }
      />
      {notice && <p className="scr-action-notice" role="status">{notice}</p>}
      <div className="scr-tile-row">
        <div className="scr-tile"><span className="scr-tile-label">{t('scraperMgmt.plugins.tile.installed')}</span><span className="scr-tile-value">{plugins.length}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">{t('scraperMgmt.plugins.tile.enabled')}</span><span className="scr-tile-value">{plugins.filter((plugin) => plugin.enabled).length}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">{t('scraperMgmt.plugins.tile.updates')}</span><span className="scr-tile-value">{plugins.filter((plugin) => plugin.updateAvailable).length}</span></div>
        <div className={`scr-tile${plugins.some((plugin) => !plugin.compatible) ? ' is-bad' : ''}`}><span className="scr-tile-label">{t('scraperMgmt.plugins.tile.incompatible')}</span><span className="scr-tile-value">{plugins.filter((plugin) => !plugin.compatible).length}</span></div>
      </div>
      <div className="scr-chip-row">
        {filterChips.map(([id, label]) => (
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
              {plugin.updateAvailable && <span className="scr-pill scr-pill--accent">{t('scraperMgmt.plugins.versionAvailable', { version: plugin.updateAvailable })}</span>}
              {!plugin.compatible && <span className="scr-pill scr-pill--bad">{t('scraperMgmt.plugins.incompatible')}</span>}
            </div>
            <div className="scr-permission-list">
              {plugin.permissions.map((permission) => <code key={permission}>{permission}</code>)}
            </div>
          </ScrCard>
        ))}
      </div>
      <div className="scr-plugin-operations">
        <ScrCard
          title={t('scraperMgmt.permissions.title')}
          description={t('scraperMgmt.permissions.description')}
          statusId="page.plugins"
        >
          <div className="scr-permission-audit">
            <span><Icon name="globe" size={14} /><b>{permissionCounts.network}</b><small>{t('scraperMgmt.permissions.network')}</small></span>
            <span><Icon name="scan" size={14} /><b>{permissionCounts.browser}</b><small>{t('scraperMgmt.permissions.browser')}</small></span>
            <span><Icon name="drive" size={14} /><b>{permissionCounts.storage}</b><small>{t('scraperMgmt.permissions.storage')}</small></span>
            <span className={permissionCounts.broad ? 'is-risk' : ''}><Icon name="warning" size={14} /><b>{permissionCounts.broad}</b><small>{t('scraperMgmt.permissions.broad')}</small></span>
          </div>
          <p className="scr-muted">{t('scraperMgmt.permissions.anixNote')}</p>
        </ScrCard>
        <ScrCard
          title={t('scraperMgmt.updates.title')}
          description={t('scraperMgmt.updates.description')}
          statusId="page.plugins"
          trailing={<span className="scr-pill scr-pill--accent">{t('scraperMgmt.updates.available', { count: plugins.filter((plugin) => plugin.updateAvailable).length })}</span>}
        >
          <div className="scr-plugin-update">
            <div>
              <b>{plugins.find((plugin) => plugin.updateAvailable)?.name ?? t('scraperMgmt.updates.allCurrent')}</b>
              <small>
                {plugins.find((plugin) => plugin.updateAvailable)
                  ? `v${plugins.find((plugin) => plugin.updateAvailable)?.version} → v${plugins.find((plugin) => plugin.updateAvailable)?.updateAvailable}`
                  : t('scraperMgmt.updates.nonePending')}
              </small>
            </div>
            <Button size="sm" leftIcon={<Icon name="refresh" size={13} />} onClick={applyUpdates}>
              {t('scraperMgmt.updates.updateAll')}
            </Button>
          </div>
        </ScrCard>
      </div>
    </div>
  );
}
