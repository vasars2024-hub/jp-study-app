/**
 * Settings -> Help -> Updates (upd2): the About-and-updates panel.
 *
 * Says which build this is (version, installed / portable / dev, channel), when
 * it last looked for an update, and what the Squirrel updater is doing
 * (`shared/appUpdate.ts` `describeAppUpdate` maps the state; the panel only
 * renders it). An installed copy checks through Update.exe ("Check now" skips
 * the metered-connection guard — it is the user's call); the portable zip and a
 * dev build compare against the latest GitHub release instead.
 *
 * Squirrel.Windows gives Electron's `autoUpdater` no byte progress, so a download
 * shows an indeterminate bar and how long it has been running — never a number
 * the panel would have to make up.
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
  type AppUpdateDetails,
} from '../../../../shared/appUpdate';
import type { ReleaseStatus } from '../../../../shared/release';

type NotesState = { kind: 'hidden' } | { kind: 'loading' } | { kind: 'shown'; notes: AppReleaseNotes };

const MINUTE_MS = 60_000;
const FACTS_STYLE = { display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 16px', margin: '0 0 8px' } as const;
const FACT_ROW_STYLE = { display: 'contents' } as const;
const FACT_VALUE_STYLE = { margin: 0 } as const;

export default function UpdatePanel() {
  const { t, lang } = useT();
  const [details, setDetails] = useState<AppUpdateDetails | null>(null);
  const [release, setRelease] = useState<ReleaseStatus | null>(null);
  const [checkingRelease, setCheckingRelease] = useState(false);
  const [notes, setNotes] = useState<NotesState>({ kind: 'hidden' });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    void window.api?.appUpdateDetails?.()
      .then((d) => {
        if (alive && d) setDetails(d);
      })
      .catch(() => undefined);
    const off = window.api?.onAppUpdateDetails?.((d) => setDetails(d));
    return () => {
      alive = false;
      off?.();
    };
  }, []);

  // The "downloading for N minutes" line moves on its own while a download runs.
  const downloading = details?.state === 'downloading';
  useEffect(() => {
    if (!downloading) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [downloading]);

  const view = useMemo(() => (details ? describeAppUpdate(details) : null), [details]);
  const installed = details?.install === 'installed';

  const lastChecked = useMemo(() => {
    const at = installed ? details?.lastCheckedAt : release?.checkedAt;
    return at ? new Date(at).toLocaleString(LANG_TAGS[lang]) : null;
  }, [installed, details?.lastCheckedAt, release?.checkedAt, lang]);

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
  const releaseLine = !installed && (checkingRelease || release)
    ? checkingRelease || !release
      ? t('help.update.checking')
      : release.kind === 'update'
        ? t('help.update.available', { current: release.current, latest: release.latest ?? '' })
        : release.kind === 'current'
          ? t('help.update.current', { current: release.current })
          : release.kind === 'newer'
            ? t('help.update.newer', { current: release.current, latest: release.latest ?? '' })
            : release.kind === 'no-releases'
              ? t('upd2.notes.none')
              : t('help.update.unavailable')
    : null;
  const downloadMinutes = downloading && details?.downloadStartedAt
    ? Math.max(0, Math.floor((now - details.downloadStartedAt) / MINUTE_MS))
    : null;

  return (
    <SettingsCard id="updates" title={t('help.update.title')} description={t('help.update.desc')}>
      <dl className="upd2-facts" style={FACTS_STYLE}>
        <div style={FACT_ROW_STYLE}>
          <dt className="muted">{t('upd2.versionLabel')}</dt>
          <dd style={FACT_VALUE_STYLE}>{current || t('upd2.versionUnknown')}</dd>
        </div>
        <div style={FACT_ROW_STYLE}>
          <dt className="muted">{t('upd2.installLabel')}</dt>
          <dd style={FACT_VALUE_STYLE}>{t(`upd2.install.${details?.install ?? 'dev'}`)}</dd>
        </div>
        <div style={FACT_ROW_STYLE}>
          <dt className="muted">{t('upd2.channelLabel')}</dt>
          <dd style={FACT_VALUE_STYLE}>{t('upd2.channel.stable')}</dd>
        </div>
        <div style={FACT_ROW_STYLE}>
          <dt className="muted">{t('upd2.lastCheckLabel')}</dt>
          <dd style={FACT_VALUE_STYLE}>{lastChecked ?? t('upd2.lastCheck.never')}</dd>
        </div>
      </dl>

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

      {view?.progress === 'indeterminate' ? (
        <div className="upd2-progress">
          <progress aria-label={t('upd2.progressLabel')} />
          {downloadMinutes !== null ? (
            <span className="muted">{t('upd2.downloadingFor', { count: downloadMinutes })}</span>
          ) : null}
        </div>
      ) : null}
      {downloading ? <p className="muted">{t('upd2.sizeNote')}</p> : null}

      <div className="fm-actions">
        <button
          type="button"
          className="btn"
          disabled={checkingRelease || (view ? !view.canCheck : false)}
          onClick={() => void checkNow()}
        >
          {t('upd2.checkNow')}
        </button>
        {view?.canRestart ? (
          <button type="button" className="btn primary" onClick={() => void window.api.appUpdateRestart?.()}>
            {t('upd2.restart')}
          </button>
        ) : null}
        {!installed && release?.kind === 'update' && release.url ? (
          <button type="button" className="btn primary" onClick={() => void window.api.openExternal?.(release.url ?? '')}>
            {t('help.update.open')}
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

      <p className="muted upd2-privacy">{t('upd2.privacy')}</p>
    </SettingsCard>
  );
}

function ReleaseNotesView({ notes }: { notes: AppReleaseNotes }) {
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
      <p>
        <strong>{t('upd2.notes.title', { title: notes.title })}</strong>
        {published ? <span className="muted"> · {t('upd2.notes.published', { date: published })}</span> : null}
      </p>
      {/* Plain text on purpose: release Markdown is never rendered as HTML here. */}
      <div className="upd2-notes-body" style={{ whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto', userSelect: 'text' }}>
        {notes.body.trim() || t('upd2.notes.empty')}
      </div>
      {notes.truncated ? <p className="muted">{t('upd2.notes.truncated')}</p> : null}
      <div className="fm-actions">
        <button type="button" className="btn" onClick={() => void window.api.openExternal?.(notes.url)}>
          {t('upd2.notes.open')}
        </button>
      </div>
    </section>
  );
}
