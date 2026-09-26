/**
 * One page for every credential the app can hold.
 *
 * Before this existed, six keys were configured from five unrelated panels and
 * there was nowhere to see what was set or to revoke it
 * (PROFESSIONAL_DICTIONARY_PLAN.md §0.1).
 *
 * **No key ever reaches this component.** Every row renders from a
 * `CredentialStatus` — `{ id, configured, lastTestedAt, lastError }` — and the
 * input is write-only: it holds what the user is typing now, never what is
 * stored. A stored key renders as a placeholder, because there is nothing else
 * this side could honestly render.
 *
 * The rows are not all served by the same transport, and that is deliberate
 * rather than unfinished. `shared/credentialRegistry.ts` records which module
 * owns each credential at rest; this page uses that module's existing
 * renderer-facing channel — `aiSetApiKey`, `setSubtitleProviderKey`,
 * `malStatus` — instead of a second write path into stores it does not own. A
 * parallel path would have to duplicate each store's format, and would rot the
 * first time one of them changed.
 */

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { useT } from '../../../i18n';
import { confirmDialog } from '../../ui';
import { LANG_TAGS } from '../../../../shared/i18n/core';
import { useSettings } from '../SettingsContext';
import SettingsCard from '../SettingsCard';
import {
  CREDENTIAL_REGISTRY,
  credentialCategoryLabelKey,
  credentialsInCategory,
  populatedCredentialCategories,
  type CredentialField,
  type CredentialSpec,
  type CredentialStatus,
} from '../../../../shared/credentialRegistry';

const EMPTY_STATUS = (id: string): CredentialStatus => ({
  id,
  configured: false,
  lastTestedAt: 0,
  lastError: '',
});

/** Draft key — a credential can have more than one field. */
const draftKey = (id: string, field: string): string => `${id}.${field}`;

export default function ApiKeysPage() {
  const { t, lang } = useT();
  const { navigate, focusSettingId } = useSettings();

  const [canStore, setCanStore] = useState(true);
  const [vaultStatuses, setVaultStatuses] = useState<CredentialStatus[]>([]);
  const [aiKeys, setAiKeys] = useState<Record<string, boolean>>({});
  const [subtitleKeys, setSubtitleKeys] = useState<Record<string, boolean>>({});
  const [malConnected, setMalConnected] = useState(false);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; messageKey: string }>>({});
  const [tests, setTests] = useState<Record<string, { ok: boolean; detail?: string }>>({});

  /**
   * Reads every transport once. Each `catch` returns silently: a provider whose
   * module failed to answer renders as "not configured", which is the truth
   * from this side, rather than taking the page down.
   */
  const refresh = useCallback(async (): Promise<void> => {
    const [vault, ai, subs, mal] = await Promise.all([
      window.api.credentialStatus().catch(() => null),
      window.api.aiGetConfig().catch(() => null),
      window.api.subtitleProviderCredentials().catch(() => null),
      window.api.malStatus().catch(() => null),
    ]);
    if (vault) {
      setVaultStatuses(vault.statuses);
      setCanStore(vault.canStore);
    }
    if (ai) setAiKeys({ gemini: Boolean(ai.apiKeysSet?.gemini), deepseek: Boolean(ai.apiKeysSet?.deepseek) });
    if (subs) {
      setSubtitleKeys(Object.fromEntries(subs.map((entry) => [entry.id, Boolean(entry.hasKey)])));
    }
    if (mal?.ok && mal.data) setMalConnected(Boolean(mal.data.connected));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Resolves a spec to the status its owning store reports. */
  const statusOf = useCallback(
    (spec: CredentialSpec): CredentialStatus => {
      switch (spec.store) {
        case 'vault':
          return vaultStatuses.find((entry) => entry.id === spec.id) ?? EMPTY_STATUS(spec.id);
        case 'mining':
          return { ...EMPTY_STATUS(spec.id), configured: Boolean(aiKeys[spec.id]) };
        case 'subtitleProviders':
          return { ...EMPTY_STATUS(spec.id), configured: Boolean(subtitleKeys[spec.id]) };
        case 'malSync':
          return { ...EMPTY_STATUS(spec.id), configured: malConnected };
      }
    },
    [vaultStatuses, aiKeys, subtitleKeys, malConnected],
  );

  const setResult = (id: string, ok: boolean, messageKey: string): void =>
    setResults((prev) => ({ ...prev, [id]: { ok, messageKey } }));

  const save = async (spec: CredentialSpec, field: CredentialField): Promise<void> => {
    const key = draftKey(spec.id, field.name);
    const value = (drafts[key] ?? '').trim();
    if (!value) return;
    setBusy(spec.id);
    try {
      switch (spec.store) {
        case 'vault': {
          const response = await window.api.setCredentialSecret(spec.id, field.name, value);
          setVaultStatuses(response.snapshot.statuses);
          setCanStore(response.snapshot.canStore);
          setResult(spec.id, response.ok, response.messageKey);
          // A new TMDB key re-opens every film the library could not look up;
          // sweep now rather than at the next launch. Fire-and-forget: the
          // sweep reports through its own progress channel, and one already
          // running simply declines (the next launch catches up).
          if (response.ok && spec.id === 'tmdb') {
            void window.api.runMediaMetadata?.({}).catch(() => undefined);
          }
          break;
        }
        case 'mining': {
          const response = await window.api.aiSetApiKey({
            provider: spec.id as 'gemini' | 'deepseek',
            apiKey: value,
          });
          setAiKeys({
            gemini: Boolean(response.apiKeysSet?.gemini),
            deepseek: Boolean(response.apiKeysSet?.deepseek),
          });
          setResult(spec.id, response.ok, response.ok ? 'credential.result.stored' : 'credential.result.saveFailed');
          break;
        }
        case 'subtitleProviders': {
          const next = await window.api.setSubtitleProviderKey(spec.id, value);
          setSubtitleKeys(Object.fromEntries(next.map((entry) => [entry.id, Boolean(entry.hasKey)])));
          setResult(spec.id, true, 'credential.result.stored');
          break;
        }
        case 'malSync':
          // OAuth: there is no key to paste. The row links to the panel that
          // runs the browser round-trip instead of faking a field here.
          break;
      }
      setDrafts((prev) => ({ ...prev, [key]: '' }));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (spec: CredentialSpec): Promise<void> => {
    // A stored key is often the only copy the user has: providers show a secret once, at
    // creation, and will not show it again. Removing one asked nothing, and the row's
    // Remove sits directly beside Save AND Test. One guard covers all four stores because
    // every branch below destroys a secret.
    const ok = await confirmDialog({
      title: t('credential.remove.title'),
      message: t('credential.remove.message', { name: spec.label }),
      confirmLabel: t('credential.remove.confirm'),
      danger: true,
    });
    if (!ok) return;
    setBusy(spec.id);
    try {
      switch (spec.store) {
        case 'vault': {
          const snapshot = await window.api.clearCredential(spec.id);
          setVaultStatuses(snapshot.statuses);
          setCanStore(snapshot.canStore);
          break;
        }
        case 'mining': {
          const response = await window.api.aiSetApiKey({
            provider: spec.id as 'gemini' | 'deepseek',
            apiKey: '',
          });
          setAiKeys({
            gemini: Boolean(response.apiKeysSet?.gemini),
            deepseek: Boolean(response.apiKeysSet?.deepseek),
          });
          break;
        }
        case 'subtitleProviders': {
          const next = await window.api.setSubtitleProviderKey(spec.id, '');
          setSubtitleKeys(Object.fromEntries(next.map((entry) => [entry.id, Boolean(entry.hasKey)])));
          break;
        }
        case 'malSync':
          return;
      }
      setResult(spec.id, true, 'credential.result.removed');
    } finally {
      setBusy(null);
    }
  };

  const runTest = async (spec: CredentialSpec): Promise<void> => {
    setBusy(spec.id);
    try {
      const result = await window.api.testSubtitleProvider(spec.id);
      setTests((prev) => ({ ...prev, [spec.id]: { ok: result.ok, detail: result.detail } }));
    } finally {
      setBusy(null);
    }
  };

  /**
   * `lang`, not `t`, is the dependency — `t`'s identity is stable by design, so
   * depending on it goes stale after a language switch instead of erroring
   * (CLAUDE.md i18n rule 6). Both of these read `lang` directly as well, so the
   * dependency is real rather than defensive. No `eslint-disable` for
   * `react-hooks/exhaustive-deps` here: that plugin is not in this repo's flat
   * config, so the comment would itself be the lint error.
   */
  const formatTested = useMemo(
    () => (at: number): string =>
      // `LANG_TAGS[lang]`, not bare `lang`: 'zh' alone resolves to a different
      // date order than 'zh-CN', and the study language must not leak in here.
      t('credential.lastTested', { when: new Date(at).toLocaleString(LANG_TAGS[lang]) }),
    [lang],
  );

  /**
   * Joins the "used by" list with the separator the UI language actually uses —
   * `、` for ja/zh, `, ` for en/ru — rather than a hand-rolled `join(', ')` or a
   * catalog key whose value would be identical in two of the four languages.
   *
   * `conjunction`/`long`, not `unit`/`narrow`: measured in the app's own ICU,
   * every `unit` style emits **no separator at all** for ru/ja/zh (and `narrow`
   * drops it for English too), so three uses render as one run-on phrase.
   * `conjunction` is also the truthful relation here — a credential is used by
   * A *and* B *and* C, not by a quantity "A B C".
   */
  const joinUses = useMemo(
    () => new Intl.ListFormat(lang, { style: 'long', type: 'conjunction' }),
    [lang],
  );

  const configuredCount = CREDENTIAL_REGISTRY.filter((spec) => statusOf(spec).configured).length;

  const renderRow = (spec: CredentialSpec): ReactElement => {
    const status = statusOf(spec);
    const result = results[spec.id];
    const test = tests[spec.id];
    const isBusy = busy === spec.id;
    const vaultBacked = spec.store === 'vault';

    return (
      <li key={spec.id} className="credential-row">
        <div className="credential-row-head">
          <span className="credential-row-text">
            {/* A provider's own name — data, not chrome. See CredentialSpec.label. */}
            <strong>{spec.label}</strong>
            <small className="muted">{t(spec.descKey)}</small>
          </span>
          <span
            className={status.configured ? 'credential-state-on' : 'credential-state-off'}
            role="status"
          >
            {status.configured ? t('credential.configured') : t('credential.notConfigured')}
          </span>
        </div>

        <p className="credential-used-by muted">
          {t('credential.usedBy')}
          {' '}
          {joinUses.format(spec.usedByKeys.map((key) => t(key)))}
        </p>
        {spec.freeTierKey && <p className="credential-free-tier muted">{t(spec.freeTierKey)}</p>}

        {status.fromEnv && <p className="credential-env muted">{t('credential.fromEnv')}</p>}

        {spec.kind === 'oauth' ? (
          <p className="muted">{t('credential.oauthNote')}</p>
        ) : (
          spec.fields.map((field) => {
            const key = draftKey(spec.id, field.name);
            const inputId = `credential-${key}`;
            return (
              <div key={field.name} className="credential-field">
                <label htmlFor={inputId}>{t(field.labelKey)}</label>
                <input
                  id={inputId}
                  type={field.secret ? 'password' : 'text'}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={isBusy || status.fromEnv || (vaultBacked && !canStore)}
                  placeholder={
                    status.configured
                      ? t('credential.storedPlaceholder')
                      : field.placeholderKey
                        ? t(field.placeholderKey)
                        : ''
                  }
                  value={drafts[key] ?? ''}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: e.currentTarget.value }))}
                />
                <button
                  type="button"
                  className="btn small primary"
                  disabled={isBusy || !(drafts[key] ?? '').trim()}
                  onClick={() => void save(spec, field)}
                >
                  {t('credential.save')}
                </button>
              </div>
            );
          })
        )}

        <div className="credential-actions">
          {spec.testable && (
            <button
              type="button"
              className="btn small"
              disabled={isBusy || !status.configured}
              onClick={() => void runTest(spec)}
            >
              {isBusy ? t('credential.testing') : t('credential.test')}
            </button>
          )}
          {spec.kind !== 'oauth' && (
            <button
              type="button"
              className="btn small danger"
              disabled={isBusy || !status.configured || status.fromEnv}
              onClick={() => void remove(spec)}
            >
              {t('credential.remove')}
            </button>
          )}
          {spec.managedOnPage && (
            <button
              type="button"
              className="btn small"
              onClick={() =>
                // `guided` because the page this lands on may be advanced-only.
                // Without it `SettingsApp`'s guard bounces straight back Home and
                // the button is functionally dead — which is what a default-mode
                // user got, while the row above still told them to "Use Manage".
                navigate(spec.managedOnPage as 'study' | 'scraper', spec.managedSettingId, {
                  guided: true,
                })
              }
            >
              {t('credential.manage')}
            </button>
          )}
          <button type="button" className="btn small" onClick={() => window.api.openExternal(spec.signupUrl)}>
            {t('credential.getKey')}
          </button>
        </div>

        {vaultBacked && !canStore && (
          <p className="credential-warning" role="alert">
            {t('credential.noEncryptionWarning')}
          </p>
        )}
        {!spec.refusesWhenUnencrypted && !canStore && (
          <p className="credential-warning" role="alert">
            {t('credential.plaintextRisk')}
          </p>
        )}
        {status.lastTestedAt > 0 && (
          <p className="muted">
            {formatTested(status.lastTestedAt)}
            {status.lastError ? ` — ${status.lastError}` : ''}
          </p>
        )}
        {result && (
          <p className={result.ok ? 'credential-state-on' : 'credential-warning'} role="status">
            {t(result.messageKey)}
          </p>
        )}
        {test && (
          <p className={test.ok ? 'credential-state-on' : 'credential-warning'} role="status">
            {test.ok ? t('subtitle.testOk') : t(`subtitle.testFail.${test.detail ?? 'error'}`)}
          </p>
        )}
      </li>
    );
  };

  return (
    <>
      <SettingsCard
        id="api-keys-overview"
        // The `api-keys` search entry names the page's subject, not a card, so
        // land it on the overview rather than leaving the result unanchored.
        highlight={focusSettingId === 'api-keys'}
        title={t('apiKeys.overview.title')}
        description={t('apiKeys.overview.desc', {
          configured: configuredCount,
          total: CREDENTIAL_REGISTRY.length,
        })}
      >
        <p className="muted">{t('apiKeys.optional')}</p>
        {!canStore && (
          <p className="credential-warning" role="alert">
            {t('credential.noEncryptionWarning')}
          </p>
        )}
      </SettingsCard>

      {populatedCredentialCategories().map((category) => (
        <SettingsCard
          key={category}
          id={`api-keys-${category}`}
          title={t(credentialCategoryLabelKey(category))}
        >
          <ul className="credential-list">{credentialsInCategory(category).map(renderRow)}</ul>
        </SettingsCard>
      ))}
    </>
  );
}
