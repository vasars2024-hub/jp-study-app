/**
 * Settings > Help > Diagnostics and Updates (audit robust #5, #7).
 *
 * The diagnostic log (`userData/logs/main.log`) was write-only: crashes,
 * recovered JSON stores and failed backups were recorded and nobody could see
 * them. This card lists recent warnings/errors, copies a diagnostics bundle for
 * a bug report, and opens the log folder.
 *
 * The update control tells the truth in all five cases (see
 * `shared/release.ts` ReleaseStatusKind) — including "your build is newer than
 * the latest release", which the old silent check could never say — and hides
 * itself when the project publishes no releases.
 */
import { useCallback, useEffect, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useT } from '../../../i18n';
import { LANG_TAGS } from '../../../../shared/i18n/core';
import type { DiagnosticEntry } from '../../../../main/crashRecovery';
import type { ReleaseStatus } from '../../../../shared/release';

export function UpdateCard() {
  const { t } = useT();
  const [status, setStatus] = useState<ReleaseStatus | null>(null);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    if (!window.api?.releaseStatus) return;
    setChecking(true);
    try {
      setStatus(await window.api.releaseStatus());
    } catch {
      setStatus({ kind: 'unavailable', current: '', checkedAt: Date.now() });
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  if (!window.api?.releaseStatus || status?.kind === 'no-releases') return null;
  const vars = { current: status?.current ?? '', latest: status?.latest ?? '' };
  const line = checking || !status
    ? t('help.update.checking')
    : status.kind === 'update'
      ? t('help.update.available', vars)
      : status.kind === 'current'
        ? t('help.update.current', vars)
        : status.kind === 'newer'
          ? t('help.update.newer', vars)
          : t('help.update.unavailable');

  return (
    <SettingsCard id="updates" title={t('help.update.title')} description={t('help.update.desc')}>
      <p className="muted" role="status">{line}</p>
      <div className="fm-actions">
        <button type="button" className="btn" disabled={checking} onClick={() => void check()}>
          {t('help.update.check')}
        </button>
        {status?.kind === 'update' && status.url ? (
          <button type="button" className="btn primary" onClick={() => void window.api.openExternal?.(status.url ?? '')}>
            {t('help.update.open')}
          </button>
        ) : null}
      </div>
    </SettingsCard>
  );
}

export function DiagnosticsCard() {
  const { t, lang } = useT();
  const [entries, setEntries] = useState<DiagnosticEntry[]>([]);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setEntries((await window.api?.diagnosticsRecent?.(30)) ?? []);
    } catch {
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const copy = async (): Promise<void> => {
    try {
      const summary = await window.api?.diagnosticsSummary?.();
      const recent = (await window.api?.diagnosticsRecent?.(100)) ?? [];
      const text = [
        summary ? JSON.stringify(summary, null, 2) : '',
        ...recent.map((e) => `${e.ts} ${e.severity.toUpperCase()} ${e.subsystem}/${e.operation}: ${e.detail}`),
      ].join('\n');
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <SettingsCard id="diagnostics" title={t('help.diagnostics.title')} description={t('help.diagnostics.body')}>
      {entries.length ? (
        <ul className="muted" style={{ margin: 0, paddingLeft: 18, maxHeight: 220, overflow: 'auto', fontSize: 12, userSelect: 'text' }}>
          {entries.map((e, i) => (
            <li key={`${e.ts}-${i}`}>
              <span>{new Date(e.ts).toLocaleString(LANG_TAGS[lang])}</span>
              {' · '}
              <strong>{e.subsystem}</strong> {e.operation}
              {e.detail ? ` — ${e.detail.split('\n')[0].slice(0, 200)}` : ''}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t('help.diagnostics.empty')}</p>
      )}
      <div className="fm-actions">
        <button type="button" className="btn" onClick={() => void copy()}>
          {t('help.diagnostics.copy')}
        </button>
        <button type="button" className="btn" onClick={() => void window.api?.diagnosticsOpenLogFolder?.()}>
          {t('help.diagnostics.openFolder')}
        </button>
        <button type="button" className="btn" onClick={() => void refresh()}>
          {t('help.diagnostics.refresh')}
        </button>
      </div>
      {copied ? (
        <p className="muted" role="status">
          {t('help.diagnostics.copied')}
        </p>
      ) : null}
    </SettingsCard>
  );
}
