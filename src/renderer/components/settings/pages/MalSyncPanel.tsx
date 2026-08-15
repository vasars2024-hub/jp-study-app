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
import type { MalListStatus } from '../../../../shared/malSync';

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
  }, []);

  useEffect(() => {
    // Reads state only. Deliberately does not fetch the list: opening a settings
    // page is not consent to hit a third-party API with the user's credential.
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
      (data: { entries: unknown[]; truncated: boolean }) => {
        setListCount(data.entries.length);
        setTruncated(data.truncated);
      },
    );

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
          <button
            type="button"
            disabled={busy || !status.connected}
            onClick={() => void fetchList()}
          >
            {busy ? t('malSync.fetching') : t('malSync.fetchList')}
          </button>
          {listCount !== null && (
            <span role="status">{t('malSync.listCount', { count: listCount })}</span>
          )}
        </div>
        {truncated && <small className="muted">{t('malSync.truncated')}</small>}
      </fieldset>

      {error && <p role="alert" className="subtitle-test-fail">{error}</p>}
    </SettingsCard>
  );
}
