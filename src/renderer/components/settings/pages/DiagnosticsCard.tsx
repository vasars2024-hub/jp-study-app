/**
 * Settings > Help > Diagnostics and Updates (audit robust #5, #7).
 *
 * The diagnostic log (`userData/logs/main.log`) was write-only: crashes,
 * recovered JSON stores and failed backups were recorded and nobody could see
 * them. This card lists recent warnings/errors, copies a diagnostics bundle for
 * a bug report, and opens the log folder.
 *
 * The update control lives in `UpdatePanel.tsx`; it still tells the truth in
 * all five `shared/release.ts` ReleaseStatusKind cases for a portable build.
 */
import { useCallback, useEffect, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useT } from '../../../i18n';
import { LANG_TAGS } from '../../../../shared/i18n/core';
import type { DiagnosticEntry } from '../../../../main/crashRecovery';

// The update control moved to `UpdatePanel.tsx` (upd2): version, install kind,
// channel, last check, Squirrel state, release notes on request.

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
