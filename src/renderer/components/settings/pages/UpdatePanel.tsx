/**
 * Settings -> Help -> Updates (upd2, upd3): the About-and-updates panel.
 *
 * Says which build this is (version, installed / portable / dev, channel), when
 * it last looked for an update, and what the updater is doing
 * (`shared/appUpdate.ts` `describeAppUpdate` maps the state; the panel only
 * renders it). An installed copy checks the release feed and downloads the
 * update itself (main/updateDownloader.ts): real byte progress, Cancel, and a
 * Resume / Try again that continues from the bytes already on disk; the verified
 * package is then handed to Update.exe to unpack. When Squirrel downloads by
 * itself (a RELEASES Gum's downloader does not handle) there are no bytes to
 * show, so the bar is indeterminate with how long it has been running — never a
 * number the panel would have to make up. The portable zip and a dev build
 * compare against the latest GitHub release instead.
 *
 * "Restart to update" refuses while any window reports unsaved work
 * (renderer/unsavedWork.ts) and lists what would be lost, with "Restart anyway".
 * Release notes render a safe Markdown subset (ReleaseNotesMarkdown). Below:
 * "What's new" once after an update, and the update history.
 *
 * Nothing here touches the network until a button is pressed: the release notes
 * and the portable version check are fetched on click, and the privacy line says
 * what the background check of an installed copy sends.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useT } from '../../../i18n';
import { LANG_TAGS } from '../../../../shared/i18n/core';
import {
  describeAppUpdate,
  type AppReleaseNotes,
  type AppUpdateChannel,
  type AppUpdateDetails,
  type AppUpdateHistoryEntry,
  type AppUpdateUnsavedKind,
} from '../../../../shared/appUpdate';
import { compareVersions, type ReleaseStatus } from '../../../../shared/release';
import ReleaseNotesMarkdown from './ReleaseNotesMarkdown';

type NotesState = { kind: 'hidden' } | { kind: 'loading' } | { kind: 'shown'; notes: AppReleaseNotes };
/** Main's version details: being asked for, answered, or the call failed / never came. */
type DetailsLoad = 'loading' | 'ready' | 'error';

const MINUTE_MS = 60_000;
/** One IPC round trip; past this the panel offers a retry instead of waiting forever. */
const DETAILS_TIMEOUT_MS = 15_000;
/** History rows shown before "Show all". */
const HISTORY_PREVIEW = 5;
const FACTS_STYLE = { display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 16px', margin: '0 0 8px' } as const;
const FACT_ROW_STYLE = { display: 'contents' } as const;
const FACT_VALUE_STYLE = { margin: 0 } as const;
const PROGRESS_STYLE = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } as const;
const BAR_STYLE = { flex: '1 1 160px', minWidth: 0 } as const;
const SUBHEAD_STYLE = { margin: '12px 0 4px', fontSize: 'inherit' } as const;
const WHATS_NEW_STYLE = {
  border: '1px solid var(--border, currentColor)',
  borderRadius: 6,
  padding: '8px 12px',
  margin: '0 0 12px',
} as const;
const LIST_STYLE = { margin: '4px 0', paddingInlineStart: 20 } as const;

const KIB = 1024;
/** Bytes in the UI language, binary units the way Windows Explorer counts them. */
function formatBytes(bytes: number, tag: string): string {
  const n = Math.max(0, bytes);
  const [unit, size, digits] =
    n >= KIB ** 3 ? (['gigabyte', KIB ** 3, 2] as const)
      : n >= KIB ** 2 ? (['megabyte', KIB ** 2, 1] as const)
        : n >= KIB ? (['kilobyte', KIB, 0] as const)
          : (['byte', 1, 0] as const);
  try {
    return new Intl.NumberFormat(tag, { style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: digits }).format(n / size);
  } catch {
    return `${Math.round(n / size)}`;
  }
}

export default function UpdatePanel() {
  const { t, lang } = useT();
  const [details, setDetails] = useState<AppUpdateDetails | null>(null);
  const [release, setRelease] = useState<ReleaseStatus | null>(null);
  const [checkingRelease, setCheckingRelease] = useState(false);
  const [notes, setNotes] = useState<NotesState>({ kind: 'hidden' });
  const [now, setNow] = useState(() => Date.now());
  // risk4: until main answers, the panel says it is asking — never "Unknown" or
  // "Development build", which it used to show (for good, if the call failed).
  const [load, setLoad] = useState<DetailsLoad>(() => (window.api?.appUpdateDetails ? 'loading' : 'ready'));
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    if (!window.api?.appUpdateDetails) return undefined;
    let alive = true;
    setLoad('loading');
    const timer = window.setTimeout(() => {
      if (alive) setLoad((prev) => (prev === 'loading' ? 'error' : prev));
    }, DETAILS_TIMEOUT_MS);
    void window.api.appUpdateDetails()
      .then((d) => {
        if (!alive) return;
        if (d) {
          setDetails(d);
          setLoad('ready');
        } else {
          setLoad((prev) => (prev === 'ready' ? prev : 'error'));
        }
      })
      .catch(() => {
        if (alive) setLoad((prev) => (prev === 'ready' ? prev : 'error'));
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [loadAttempt]);

  useEffect(() => {
    const off = window.api?.onAppUpdateDetails?.((d) => {
      setDetails(d);
      setLoad('ready');
    });
    return () => off?.();
  }, []);

  // The "downloading for N minutes" line (Squirrel's own download, no bytes) moves on its own.
  const downloading = details?.state === 'downloading';
  const squirrelDownloading = downloading && !details?.download;
  useEffect(() => {
    if (!squirrelDownloading) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [squirrelDownloading]);

  const view = useMemo(() => (details ? describeAppUpdate(details) : null), [details]);
  const installed = details?.install === 'installed';
  const tag = LANG_TAGS[lang];

  const lastChecked = useMemo(() => {
    const at = installed ? details?.lastCheckedAt : release?.checkedAt;
    return at ? new Date(at).toLocaleString(tag) : null;
  }, [installed, details?.lastCheckedAt, release?.checkedAt, tag]);

  const checkNow = useCallback(async () => {
    if (installed) {
      try {
        const next = await window.api?.appUpdateCheckNow?.();
        if (next) setDetails(next);
      } catch {
        /* the details channel reports the failure */
      }
      return;
    }
    if (!window.api?.releaseStatus) return;
    setCheckingRelease(true);
    try {
      setRelease(await window.api.releaseStatus());
    } catch {
      setRelease({ kind: 'unavailable', current: details?.current ?? '', checkedAt: Date.now() });
    } finally {
      setCheckingRelease(false);
    }
  }, [installed, details?.current]);

  const cancelDownload = useCallback(async () => {
    try {
      await window.api?.appUpdateCancelDownload?.();
    } catch {
      /* the details channel says what happened */
    }
  }, []);

  const channel: AppUpdateChannel = details?.channel ?? release?.channel ?? 'stable';
  const changeChannel = useCallback(async (next: AppUpdateChannel) => {
    if (!window.api?.appUpdateSetPrefs) return;
    try {
      setDetails(await window.api.appUpdateSetPrefs({ channel: next }));
      // The last answer was the other channel's.
      setRelease(null);
      setNotes({ kind: 'hidden' });
    } catch {
      /* the select keeps showing what main has */
    }
  }, []);

  const setSkipped = useCallback(async (version: string | null) => {
    if (!window.api?.appUpdateSetPrefs) return;
    try {
      setDetails(await window.api.appUpdateSetPrefs({ skippedVersion: version }));
      setRelease((prev) => (prev ? { ...prev, skipped: Boolean(version && prev.latest === version) } : prev));
    } catch {
      /* unchanged */
    }
  }, []);

  // "Restart to update": main refuses while a restart would cut something short
  // (a recording, an open edit, a review, an AI job …) and the panel lists it,
  // asking before trying again with `force`.
  const [restartBlocked, setRestartBlocked] = useState<AppUpdateUnsavedKind[] | null>(null);
  const restart = useCallback(async (force: boolean) => {
    const api = window.api?.appUpdateRestart;
    if (!api) return;
    try {
      const result = force ? await api({ force: true }) : await api();
      setRestartBlocked(result && !result.ok && result.reason === 'unsaved' ? result.unsaved : null);
    } catch {
      setRestartBlocked(null);
    }
  }, []);

  const toggleNotes = useCallback(async () => {
    if (notes.kind !== 'hidden') {
      setNotes({ kind: 'hidden' });
      return;
    }
    if (!window.api?.appUpdateReleaseNotes) return;
    setNotes({ kind: 'loading' });
    try {
      setNotes({ kind: 'shown', notes: await window.api.appUpdateReleaseNotes() });
    } catch {
      setNotes({ kind: 'shown', notes: { ok: false, reason: 'failed' } });
    }
  }, [notes.kind]);

  if (!window.api?.appUpdateDetails && !window.api?.releaseStatus) return null;

  const current = details?.current || release?.current || '';
  const unavailableLine = (r: ReleaseStatus): string => {
    switch (r.reason) {
      case 'offline':
        return t('upd2.unavailable.offline');
      case 'rate-limited':
        return r.retryAt
          ? t('upd2.unavailable.rateLimited', { time: new Date(r.retryAt).toLocaleTimeString(tag, { hour: '2-digit', minute: '2-digit' }) })
          : t('upd2.unavailable.rateLimitedNoTime');
      case 'http':
        return t('upd2.unavailable.http');
      case 'invalid':
        return t('upd2.unavailable.invalid');
      case 'disabled':
        return t('upd2.unavailable.disabled');
      default:
        return t('help.update.unavailable');
    }
  };
  const releaseLine = !installed && (checkingRelease || release)
    ? checkingRelease || !release
      ? t('help.update.checking')
      : release.kind === 'update'
        ? release.skipped
          ? t('upd2.state.skipped', { version: release.latest ?? '' })
          : t('help.update.available', { current: release.current, latest: release.latest ?? '' })
        : release.kind === 'current'
          ? t('help.update.current', { current: release.current })
          : release.kind === 'newer'
            ? t('help.update.newer', { current: release.current, latest: release.latest ?? '' })
            : release.kind === 'no-releases'
              ? t('upd2.notes.none')
              : unavailableLine(release)
    : null;
  // A newer release that is not yet downloading: the one "Skip this version" applies to.
  const offered = !installed
    ? release?.kind === 'update' ? release.latest ?? null : null
    : details?.latestVersion && current && compareVersions(details.latestVersion, current) > 0
      && details.state !== 'downloading' && details.state !== 'downloaded'
      ? details.latestVersion
      : null;
  const skippedVersion = details?.skippedVersion ?? null;
  const downloadMinutes = squirrelDownloading && details?.downloadStartedAt
    ? Math.max(0, Math.floor((now - details.downloadStartedAt) / MINUTE_MS))
    : null;

  // Byte progress of Gum's own download.
  const bytes = view?.bytes ?? null;
  const percent = bytes && bytes.total ? Math.min(100, Math.floor((bytes.received / bytes.total) * 100)) : null;
  const bytesLine = bytes
    ? bytes.total
      ? t('upd3.progress.bytes', { received: formatBytes(bytes.received, tag), total: formatBytes(bytes.total, tag) })
      : t('upd3.progress.bytesNoTotal', { received: formatBytes(bytes.received, tag) })
    : null;
  const progressText = bytes && bytes.total && percent !== null
    ? t('upd3.progress.value', { percent, received: formatBytes(bytes.received, tag), total: formatBytes(bytes.total, tag) })
    : null;
  const checkLabel = view?.resumes ? (details?.state === 'error' ? t('upd3.retry') : t('upd3.resume')) : t('upd2.checkNow');

  // Only main's answer may say what kind of copy this is; before it, "Checking
  // version…", and after a failure, "Unknown" with a retry beside it.
  const pending = load === 'loading' && !details;
  const versionText = pending ? t('risk4.update.checkingVersion') : current || t('upd2.versionUnknown');
  const installText = details
    ? t(`upd2.install.${details.install}`)
    : pending
      ? t('risk4.update.checkingVersion')
      : t('upd2.versionUnknown');

  return (
    <SettingsCard id="updates" title={t('help.update.title')} description={t('help.update.desc')}>
      {details?.whatsNew ? <WhatsNew version={details.whatsNew.version} from={details.whatsNew.from} onDetails={setDetails} /> : null}

      <dl className="upd2-facts" style={FACTS_STYLE} aria-busy={pending}>
        <div style={FACT_ROW_STYLE}>
          <dt className="muted">{t('upd2.versionLabel')}</dt>
          <dd style={FACT_VALUE_STYLE} className={pending ? 'muted upd2-skeleton' : undefined}>{versionText}</dd>
        </div>
        <div style={FACT_ROW_STYLE}>
          <dt className="muted">{t('upd2.installLabel')}</dt>
          <dd style={FACT_VALUE_STYLE} className={pending ? 'muted upd2-skeleton' : undefined}>{installText}</dd>
        </div>
        <div style={FACT_ROW_STYLE}>
          <dt className="muted">{t('upd2.channelLabel')}</dt>
          <dd style={FACT_VALUE_STYLE}>
            {window.api?.appUpdateSetPrefs && details ? (
              <select
                className="upd2-channel"
                aria-label={t('upd2.channelLabel')}
                value={channel}
                onChange={(e) => void changeChannel(e.target.value === 'beta' ? 'beta' : 'stable')}
              >
                <option value="stable">{t('upd2.channel.stable')}</option>
                <option value="beta">{t('upd2.channel.beta')}</option>
              </select>
            ) : (
              t(`upd2.channel.${channel}`)
            )}
          </dd>
        </div>
        <div style={FACT_ROW_STYLE}>
          <dt className="muted">{t('upd2.lastCheckLabel')}</dt>
          <dd style={FACT_VALUE_STYLE}>{lastChecked ?? t('upd2.lastCheck.never')}</dd>
        </div>
      </dl>

      {pending ? (
        <p className="muted upd2-loading" role="status" aria-live="polite">
          {t('risk4.update.checkingVersion')}
        </p>
      ) : null}
      {load === 'error' && !details ? (
        <div className="upd2-load-error" role="alert">
          <p className="muted">{t('risk4.update.loadFailed')}</p>
          <button type="button" className="btn" onClick={() => setLoadAttempt((n) => n + 1)}>
            {t('risk4.update.retry')}
          </button>
        </div>
      ) : null}

      {view ? (
        <p className={`muted upd2-state upd2-state--${view.tone}`} role="status" aria-live="polite">
          {t(view.messageKey, view.vars)}
        </p>
      ) : null}
      {releaseLine ? (
        <p className="muted" role="status" aria-live="polite">
          {releaseLine}
        </p>
      ) : null}

      {view?.progress ? (
        <div className="upd2-progress" style={PROGRESS_STYLE}>
          {view.progress === 'determinate' && bytes?.total ? (
            <progress
              className="upd3-bar"
              style={BAR_STYLE}
              aria-label={t('upd2.progressLabel')}
              max={bytes.total}
              value={bytes.received}
              aria-valuetext={progressText ?? undefined}
            />
          ) : (
            <progress style={BAR_STYLE} aria-label={t('upd2.progressLabel')} />
          )}
          {bytesLine ? <span className="muted upd3-bytes">{progressText ?? bytesLine}</span> : null}
          {downloadMinutes !== null ? (
            <span className="muted">{t('upd2.downloadingFor', { count: downloadMinutes })}</span>
          ) : null}
          {view.canCancel && window.api?.appUpdateCancelDownload ? (
            <button type="button" className="btn upd3-cancel" onClick={() => void cancelDownload()}>
              {t('upd3.cancel')}
            </button>
          ) : null}
        </div>
      ) : null}
      {details?.state === 'idle' && details.paused ? (
        <p className="muted upd3-paused">
          {t('upd3.pausedNote', {
            received: formatBytes(details.paused.received, tag),
            total: details.paused.total ? formatBytes(details.paused.total, tag) : '?',
          })}
        </p>
      ) : null}
      {details?.state === 'error' && details.partialBytes ? (
        <p className="muted upd3-partial">{t('upd3.partialNote', { received: formatBytes(details.partialBytes, tag) })}</p>
      ) : null}
      {downloading ? <p className="muted">{t('upd2.sizeNote')}</p> : null}
      {channel === 'beta' ? <p className="muted upd2-beta-note">{t('upd2.channel.betaNote')}</p> : null}
      {skippedVersion ? (
        <p className="muted upd2-skipped">
          {t('upd2.skippedNote', { version: skippedVersion })}{' '}
          <button type="button" className="btn" onClick={() => void setSkipped(null)}>
            {t('upd2.unskip')}
          </button>
        </p>
      ) : null}
      {restartBlocked?.length ? (
        <div className="upd2-restart-warning" role="alert">
          <p>{t('upd3.restart.title')}</p>
          <ul className="upd3-unsaved" style={LIST_STYLE}>
            {restartBlocked.map((kind) => (
              <li key={kind}>{t(`upd2.unsaved.${kind}`)}</li>
            ))}
          </ul>
          <div className="fm-actions">
            <button type="button" className="btn primary" onClick={() => void restart(true)}>
              {t('upd2.restart.anyway')}
            </button>
            <button type="button" className="btn" onClick={() => setRestartBlocked(null)}>
              {t('upd2.restart.notNow')}
            </button>
          </div>
        </div>
      ) : null}

      <div className="fm-actions">
        <button
          type="button"
          className="btn"
          disabled={checkingRelease || pending || (view ? !view.canCheck : false)}
          onClick={() => void checkNow()}
        >
          {checkLabel}
        </button>
        {view?.canRestart ? (
          <button type="button" className="btn primary" onClick={() => void restart(false)}>
            {t('upd2.restart')}
          </button>
        ) : null}
        {!installed && release?.kind === 'update' && !release.skipped && release.url ? (
          <button type="button" className="btn primary" onClick={() => void window.api.openExternal?.(release.url ?? '')}>
            {t('help.update.open')}
          </button>
        ) : null}
        {offered && offered !== skippedVersion && window.api?.appUpdateSetPrefs ? (
          <button type="button" className="btn" onClick={() => void setSkipped(offered)}>
            {t('upd2.skip', { version: offered })}
          </button>
        ) : null}
        {window.api?.appUpdateReleaseNotes ? (
          <button
            type="button"
            className="btn"
            aria-expanded={notes.kind !== 'hidden'}
            aria-controls="upd2-notes"
            onClick={() => void toggleNotes()}
          >
            {notes.kind === 'hidden' ? t('upd2.notes.show') : t('upd2.notes.hide')}
          </button>
        ) : null}
      </div>

      <div id="upd2-notes" hidden={notes.kind === 'hidden'}>
        {notes.kind === 'loading' ? <p className="muted" role="status">{t('upd2.notes.loading')}</p> : null}
        {notes.kind === 'shown' ? <ReleaseNotesView notes={notes.notes} /> : null}
      </div>

      {details?.history ? <UpdateHistory history={details.history} current={current} /> : null}

      <p className="muted upd2-privacy">{t('upd2.privacy')}</p>
    </SettingsCard>
  );
}

function ReleaseNotesView({ notes, headingless = false }: { notes: AppReleaseNotes; headingless?: boolean }) {
  const { t, lang } = useT();
  const published = useMemo(
    () => (notes.ok && notes.publishedAt ? new Date(notes.publishedAt).toLocaleDateString(LANG_TAGS[lang]) : null),
    [notes, lang],
  );
  if (!notes.ok) {
    return <p className="muted">{t(notes.reason === 'none' ? 'upd2.notes.none' : 'upd2.notes.failed')}</p>;
  }
  return (
    <section className="upd2-notes" aria-label={t('upd2.notes.title', { title: notes.title })}>
      {headingless ? null : (
        <p>
          <strong>{t('upd2.notes.title', { title: notes.title })}</strong>
          {published ? <span className="muted"> · {t('upd2.notes.published', { date: published })}</span> : null}
        </p>
      )}
      {/* A safe Markdown subset: elements built from text, never HTML from the notes. */}
      <ReleaseNotesMarkdown source={notes.body} emptyText={t('upd2.notes.empty')} />
      {notes.truncated ? <p className="muted">{t('upd2.notes.truncated')}</p> : null}
      <div className="fm-actions">
        <button type="button" className="btn" onClick={() => void window.api.openExternal?.(notes.url)}>
          {t('upd2.notes.open')}
        </button>
      </div>
    </section>
  );
}

/** Shown once after an update, until dismissed; the notes load on the click. */
function WhatsNew({ version, from, onDetails }: { version: string; from: string; onDetails: (d: AppUpdateDetails) => void }) {
  const { t } = useT();
  const [notes, setNotes] = useState<NotesState>({ kind: 'hidden' });
  const toggle = async () => {
    if (notes.kind !== 'hidden') {
      setNotes({ kind: 'hidden' });
      return;
    }
    if (!window.api?.appUpdateReleaseNotes) return;
    setNotes({ kind: 'loading' });
    try {
      setNotes({ kind: 'shown', notes: await window.api.appUpdateReleaseNotes({ version }) });
    } catch {
      setNotes({ kind: 'shown', notes: { ok: false, reason: 'failed' } });
    }
  };
  const dismiss = async () => {
    try {
      const next = await window.api?.appUpdateWhatsNew?.('dismissed');
      if (next) onDetails(next);
    } catch {
      /* stays until the next try */
    }
  };
  return (
    <section className="upd3-whats-new" style={WHATS_NEW_STYLE} aria-labelledby="upd3-whats-new-title">
      <h4 id="upd3-whats-new-title" style={SUBHEAD_STYLE}>{t('upd3.whatsNew.title', { version })}</h4>
      <p className="muted">{t('upd3.whatsNew.body', { version, from })}</p>
      <div className="fm-actions">
        {window.api?.appUpdateReleaseNotes ? (
          <button
            type="button"
            className="btn primary"
            aria-expanded={notes.kind !== 'hidden'}
            aria-controls="upd3-whats-new-notes"
            onClick={() => void toggle()}
          >
            {notes.kind === 'hidden' ? t('upd3.whatsNew.show') : t('upd3.whatsNew.hide')}
          </button>
        ) : null}
        <button type="button" className="btn" onClick={() => void dismiss()}>
          {t('upd3.whatsNew.dismiss')}
        </button>
      </div>
      <div id="upd3-whats-new-notes" hidden={notes.kind === 'hidden'}>
        {notes.kind === 'loading' ? <p className="muted" role="status">{t('upd2.notes.loading')}</p> : null}
        {notes.kind === 'shown' ? <ReleaseNotesView notes={notes.notes} headingless /> : null}
      </div>
    </section>
  );
}

function UpdateHistory({ history, current }: { history: AppUpdateHistoryEntry[]; current: string }) {
  const { t, lang } = useT();
  const [all, setAll] = useState(false);
  const tag = LANG_TAGS[lang];
  const shown = all ? history : history.slice(0, HISTORY_PREVIEW);
  return (
    <section className="upd3-history" aria-labelledby="upd3-history-title">
      <h4 id="upd3-history-title" style={SUBHEAD_STYLE}>{t('upd3.history.title')}</h4>
      {history.length ? (
        <ol className="upd3-history-list" style={LIST_STYLE} reversed>
          {shown.map((entry, i) => {
            const date = new Date(entry.at).toLocaleString(tag, { dateStyle: 'medium', timeStyle: 'short' });
            const line = !entry.from
              ? t('upd3.history.first', { version: entry.version, date })
              : compareVersions(entry.version, entry.from) > 0
                ? t('upd3.history.updated', { version: entry.version, from: entry.from, date })
                : t('upd3.history.downgraded', { version: entry.version, from: entry.from, date });
            return (
              <li key={`${entry.version}-${entry.at}`}>
                {line}
                {i === 0 && entry.version === current ? <span className="muted"> · {t('upd3.history.current')}</span> : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="muted">{t('upd3.history.empty')}</p>
      )}
      {history.length > HISTORY_PREVIEW ? (
        <button type="button" className="btn" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? t('upd3.history.showFewer') : t('upd3.history.showAll', { count: history.length })}
        </button>
      ) : null}
    </section>
  );
}
