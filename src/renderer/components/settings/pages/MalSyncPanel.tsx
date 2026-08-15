/**
 * MyAnimeList account — connect, read, and write one entry.
 *
 * Three properties of this panel are load-bearing rather than stylistic:
 *
 *   **No token ever reaches this file.** The bridge exposes status, not
 *     credentials, so the most this component can learn is whether an account
 *     is connected and whether the main process managed to encrypt what it
 *     stored. There is nothing here to leak into `localStorage`.
 *   **Nothing happens without a click.** No effect fetches the list, no timer
 *     re-syncs it. A write to a real MAL list cannot be undone from this side,
 *     so every call below hangs off a button the user pressed.
 *   **The client id is asked for, never assumed.** No client id ships with the
 *     app; until the user registers their own MAL app and pastes its id, the
 *     panel says so and every action stays disabled.
 *
 * The callback code is pasted by hand on purpose. Capturing it automatically
 * needs either a loopback listener or an in-app browser window, and the second
 * of those asks the user to type their MAL password into a window this app
 * controls. Phase 8's *secure browser/overlay host* is the item that earns that
 * capability; until it lands, a paste box is the honest version.
 */

import { useCallback, useEffect, useState } from 'react';
import { useT } from '../../../i18n';
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import type { MalListEntry, MalListStatus } from '../../../../shared/malSync';
import type { MalLibrarySummary } from '../../../../shared/malLibrary';
import type { MalLibrarySyncReport } from '../../../../main/malLibrary';

const REGISTER_URL = 'https://myanimelist.net/apiconfig';

/** Mirrors `MalErrorCode` in main/malSync.ts; each has its own message key. */
const ERROR_KEYS = [
  'not-configured',
  'not-authenticated',
  'reauth-required',
  'transient',
  'request-failed',
] as const;

interface Status {
  configured: boolean;
  connected: boolean;
  username?: string;
  tokensEncrypted: boolean;
}

const EMPTY_STATUS: Status = { configured: false, connected: false, tokensEncrypted: true };

export default function MalSyncPanel() {
  const { t, lang } = useT();
  const { focusSettingId } = useSettings();
  const [status, setStatus] = useState<Status>(EMPTY_STATUS);
  const [clientIdDraft, setClientIdDraft] = useState('');
  const [codeDraft, setCodeDraft] = useState('');
  const [pendingState, setPendingState] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listCount, setListCount] = useState<number | null>(null);
  const [truncated, setTruncated] = useState(false);
  // The rows themselves, kept so the library save stores what the user actually
  // saw fetched rather than re-fetching and quietly storing a different list.
  const [fetched, setFetched] = useState<MalListEntry[]>([]);
  const [statusFilter, setStatusFilter] = useState<'' | MalListStatus>('');
  const [librarySummary, setLibrarySummary] = useState<MalLibrarySummary | null>(null);
  const [saveReport, setSaveReport] = useState<MalLibrarySyncReport | null>(null);
  const [saving, setSaving] = useState(false);

  /**
   * Turns an IPC failure into a message.
   *
   * Depends on `lang`, never on `t` — `t`'s identity is stable by design, so a
   * callback that lists it goes stale after a language switch instead of
   * erroring. This is the single most-repeated i18n defect in this codebase.
   */
  const describe = useCallback((code?: string, fallback?: string): string => {
    const known = (ERROR_KEYS as readonly string[]).includes(code ?? '');
    return known ? t(`malSync.error.${code}`) : (fallback ?? t('malSync.error.request-failed'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const refresh = useCallback(async (): Promise<void> => {
    const result = await window.api.malStatus().catch(() => null);
    if (result?.ok && result.data) setStatus(result.data as Status);
    // Local disk, not MyAnimeList — see below for why that distinction is the
    // whole reason this read is allowed to run without a click.
    const library = await window.api.malLibraryList().catch(() => null);
    if (library) setLibrarySummary(library.summary);
  }, []);

  useEffect(() => {
    // Reads state only. Deliberately does not fetch the list: opening a settings
    // page is not consent to hit a third-party API with the user's credential.
    // The library read alongside it is a local file, so it costs the user
    // nothing and it is what makes "what did the last sync actually store"
    // answerable without pressing anything.
    void refresh();
  }, [refresh]);

  const run = useCallback(async <T,>(
    call: () => Promise<{ ok: boolean; data?: T; errorCode?: string; message?: string }>,
    onOk?: (data: T) => void,
  ): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await call();
      if (!result.ok) {
        setError(describe(result.errorCode, result.message));
        return;
      }
      if (onOk && result.data !== undefined) onOk(result.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : describe());
    } finally {
      setBusy(false);
      void refresh();
    }
  }, [describe, refresh]);

  const saveClientId = (): Promise<void> =>
    run(() => window.api.malSetClientId(clientIdDraft.trim()), () => setClientIdDraft(''));

  const beginAuth = (): Promise<void> =>
    run(
      () => window.api.malBeginAuth(),
      (data: { state: string }) => setPendingState(data.state),
    );

  const completeAuth = (): Promise<void> =>
    run(
      () => window.api.malCompleteAuth(codeDraft.trim(), pendingState ?? ''),
      () => {
        setCodeDraft('');
        setPendingState(null);
      },
    );

  const fetchList = (status?: MalListStatus): Promise<void> =>
    run(
      () => window.api.malFetchList(status),
      (data: { entries: MalListEntry[]; truncated: boolean }) => {
        setListCount(data.entries.length);
        setTruncated(data.truncated);
        setFetched(data.entries);
        // A fresh fetch invalidates the previous save's numbers; leaving them on
        // screen would attribute one list's counts to another.
        setSaveReport(null);
      },
    );

  /**
   * Stores what was just fetched.
   *
   * Its own button rather than a step inside `fetchList`, because the two do
   * different things to different places: one reads a third-party account, the
   * other writes this machine's disk. A user who wanted to look at their list
   * without the app keeping a copy of it can still do exactly that.
   */
  const saveToLibrary = useCallback(async (): Promise<void> => {
    if (fetched.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const report = await window.api.malLibrarySync({ media: 'anime', entries: fetched });
      setSaveReport(report);
      setLibrarySummary(report.summary);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : describe());
    } finally {
      setSaving(false);
    }
  }, [describe, fetched]);

  return (
    <SettingsCard
      id="mal-sync"
      title={t('malSync.title')}
      description={t('malSync.desc')}
      // The scraper page renders ten cards; arriving from a settings search for
      // "mal sync" has to land on this one rather than the top of the page.
      highlight={focusSettingId === 'mal-sync'}
    >
      <fieldset className="unified-search-controls">
        <legend>{t('malSync.setup')}</legend>
        <small className="muted">{t('malSync.clientIdDesc')}</small>
        <div className="field-row">
          <label htmlFor="mal-client-id">{t('malSync.clientId')}</label>
          <input
            id="mal-client-id"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder={status.configured ? t('malSync.clientIdStored') : t('malSync.clientIdPlaceholder')}
            value={clientIdDraft}
            onChange={(event) => setClientIdDraft(event.currentTarget.value)}
          />
          <button type="button" disabled={busy || !clientIdDraft.trim()} onClick={() => void saveClientId()}>
            {t('malSync.clientIdSave')}
          </button>
          <button type="button" onClick={() => window.api.openExternal(REGISTER_URL)}>
            {t('malSync.register')}
          </button>
        </div>
        {!status.configured && <p role="status" className="muted">{t('malSync.notConfigured')}</p>}
      </fieldset>

      <fieldset className="unified-search-controls">
        <legend>{t('malSync.account')}</legend>
        <p role="status">
          {status.connected
            ? t('malSync.connectedAs', { username: status.username ?? '' })
            : t('malSync.notConnected')}
        </p>

        {/* The user is told when their token is sitting in plain text. Silently
            downgrading the storage is the behaviour this warning exists to
            prevent. */}
        {status.connected && !status.tokensEncrypted && (
          <p role="alert" className="muted">{t('malSync.plaintextWarning')}</p>
        )}

        {/* Before the button, not after it. `callbackDesc` below says most of
            this, but it only appears once Connect has been pressed — by then the
            user has already watched their browser fail to load
            `http://localhost/oauth/callback` and concluded the feature is
            broken. That is not a hypothetical: it is what happened to the
            developer of this app. Step 2 promises the failure in advance, which
            is the only thing that turns it from a bug into a step. */}
        {!status.connected && (
          <div className="mal-connect-walkthrough">
            <p>{t('malSync.walkthroughTitle')}</p>
            <ol className="muted">
              <li>{t('malSync.walkthroughStep1')}</li>
              <li>{t('malSync.walkthroughStep2')}</li>
              <li>{t('malSync.walkthroughStep3')}</li>
              <li>{t('malSync.walkthroughStep4')}</li>
            </ol>
          </div>
        )}

        {!status.connected && (
          <>
            <button
              type="button"
              disabled={busy || !status.configured}
              onClick={() => void beginAuth()}
            >
              {t('malSync.connect')}
            </button>
            {pendingState && (
              <div className="field-row">
                <label htmlFor="mal-callback-code">{t('malSync.callbackCode')}</label>
                <input
                  id="mal-callback-code"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={t('malSync.callbackPlaceholder')}
                  value={codeDraft}
                  onChange={(event) => setCodeDraft(event.currentTarget.value)}
                />
                <button type="button" disabled={busy || !codeDraft.trim()} onClick={() => void completeAuth()}>
                  {t('malSync.finish')}
                </button>
              </div>
            )}
            {pendingState && <small className="muted">{t('malSync.callbackDesc')}</small>}
          </>
        )}

        {status.connected && (
          <button type="button" disabled={busy} onClick={() => void run(() => window.api.malSignOut())}>
            {t('malSync.signOut')}
          </button>
        )}
      </fieldset>

      <fieldset className="unified-search-controls">
        <legend>{t('malSync.list')}</legend>
        {/* Read-only, one click, no schedule. The note says so out loud because
            "connected to MyAnimeList" reasonably reads as "kept in sync", and
            here it does not. */}
        <small className="muted">{t('malSync.noAutoSync')}</small>
        <div className="field-row">
          {/* The IPC has accepted a status all along and the panel never sent
              one, so "completed only" — the view a study user actually wants —
              was unreachable from the UI. Note the filtering happens on the
              parsed rows in the main process, not through MyAnimeList's own
              `status=` query: that query silently omits anything the user is
              rewatching, which on this account was twelve real titles. */}
          <label htmlFor="mal-status-filter">{t('malSync.statusFilter')}</label>
          <select
            id="mal-status-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.currentTarget.value as '' | MalListStatus)}
          >
            <option value="">{t('malSync.statusAll')}</option>
            <option value="completed">{t('malSync.statusCompleted')}</option>
            <option value="watching">{t('malSync.statusWatching')}</option>
          </select>
          <button
            type="button"
            disabled={busy || !status.connected}
            onClick={() => void fetchList(statusFilter || undefined)}
          >
            {busy ? t('malSync.fetching') : t('malSync.fetchList')}
          </button>
          {listCount !== null && (
            <span role="status">{t('malSync.listCount', { count: listCount })}</span>
          )}
        </div>
        {truncated && <small className="muted">{t('malSync.truncated')}</small>}
      </fieldset>

      <fieldset className="unified-search-controls">
        <legend>{t('malSync.library')}</legend>
        <small className="muted">{t('malSync.libraryDesc')}</small>
        <div className="field-row">
          <button
            type="button"
            disabled={saving || busy || fetched.length === 0}
            onClick={() => void saveToLibrary()}
          >
            {saving ? t('malSync.librarySaving') : t('malSync.librarySave')}
          </button>
          {fetched.length === 0 && (
            <span className="muted">{t('malSync.libraryNothingFetched')}</span>
          )}
        </div>
        {saveReport && (
          <p role="status">
            {t('malSync.libraryResult', {
              added: saveReport.added,
              updated: saveReport.updated,
              unchanged: saveReport.unchanged,
            })}
          </p>
        )}
        {/* A dropped row is reported rather than absorbed into the totals: a
            sync that stored fewer titles than it was handed is a finding. */}
        {saveReport && saveReport.rejected > 0 && (
          <p role="alert" className="muted">
            {t('malSync.libraryRejected', { rejected: saveReport.rejected })}
          </p>
        )}
        <p className="muted">
          {librarySummary && librarySummary.total > 0
            ? t('malSync.libraryStored', { total: librarySummary.total })
            : t('malSync.libraryEmpty')}
        </p>
        {librarySummary && librarySummary.derivatives > 0 && (
          <small className="muted">
            {t('malSync.libraryDerivatives', { derivatives: librarySummary.derivatives })}
          </small>
        )}
      </fieldset>

      {error && <p role="alert" className="subtitle-test-fail">{error}</p>}
    </SettingsCard>
  );
}
