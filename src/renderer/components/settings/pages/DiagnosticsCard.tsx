/**
 * Settings > Help > Diagnostics and Updates (audit robust #5, #7).
 *
 * The diagnostic log (`userData/logs/main.log`) was write-only: crashes,
 * recovered JSON stores and failed backups were recorded and nobody could see
 * them. This card lists recent warnings/errors, copies a diagnostics bundle for
 * a bug report, and opens the log folder.
 *
 * R8 (D9: opt-in, local only): "Keep crash reports on this PC" turns on native
 * minidumps (main `crashReporter`, never uploaded; off by default), and "Save
 * problem report…" writes a redacted zip where the user picks
 * (`main/problemReport.ts`). Nothing on this card sends anything anywhere.
 *
 * The update control lives in `UpdatePanel.tsx`; it still tells the truth in
 * all five `shared/release.ts` ReleaseStatusKind cases for a portable build.
 */
import { useCallback, useEffect, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useT } from '../../../i18n';
import { LANG_TAGS } from '../../../../shared/i18n/core';
import type { CrashReportingState, DiagnosticEntry, ProblemReportSaveResult } from '../../../../main/crashRecovery';

// The update control moved to `UpdatePanel.tsx` (upd2): version, install kind,
// channel, last check, Squirrel state, release notes on request.

export function DiagnosticsCard() {
  const { t, lang } = useT();
  const [entries, setEntries] = useState<DiagnosticEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const [crash, setCrash] = useState<CrashReportingState | null>(null);
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState<ProblemReportSaveResult | null>(null);

  useEffect(() => {
    let live = true;
    void window.api?.diagnosticsCrashReports?.()
      .then((s) => {
        if (live) setCrash(s);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const toggleCrashReports = async (enabled: boolean): Promise<void> => {
    try {
      const next = await window.api?.diagnosticsSetCrashReports?.(enabled);
      if (next) setCrash(next);
    } catch {
      /* the switch keeps showing what main has */
    }
  };

  const saveReport = async (): Promise<void> => {
    if (!window.api?.diagnosticsSaveProblemReport) return;
    setSaving(true);
    setReport(null);
    try {
      const ui: Record<string, string> = { lang };
      const materials = document.documentElement.getAttribute('data-materials');
      if (materials) ui.materials = materials;
      const res = await window.api.diagnosticsSaveProblemReport({ title: t('upd3.diag.report.dialogTitle'), ui });
      setReport(res.ok || res.reason !== 'canceled' ? res : null);
    } catch {
      setReport({ ok: false, reason: 'failed' });
    } finally {
      setSaving(false);
    }
  };

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

      {window.api?.diagnosticsSetCrashReports && crash ? (
        <div className="diag-crash-reports">
          <label className="os-check-row">
            <input type="checkbox" checked={crash.enabled} onChange={(e) => void toggleCrashReports(e.target.checked)} />
            <span>
              {t('upd3.diag.crash.label')}
              <span className="muted os-check-row-desc">{t('upd3.diag.crash.desc')}</span>
            </span>
          </label>
          {!crash.enabled && crash.active ? <p className="muted diag-crash-restart">{t('upd3.diag.crash.restart')}</p> : null}
        </div>
      ) : null}

      {window.api?.diagnosticsSaveProblemReport ? (
        <div className="diag-problem-report">
          <p className="muted">{t('upd3.diag.report.desc')}</p>
          <div className="fm-actions">
            <button type="button" className="btn" disabled={saving} aria-busy={saving} onClick={() => void saveReport()}>
              {t('upd3.diag.report.save')}
            </button>
            {report?.ok && window.api?.diagnosticsShowProblemReport ? (
              <button type="button" className="btn" onClick={() => void window.api?.diagnosticsShowProblemReport?.(report.file)}>
                {t('upd3.diag.report.show')}
              </button>
            ) : null}
          </div>
          {report ? (
            <p className={report.ok ? 'muted diag-report-status' : 'diag-report-status is-error'} role="status">
              {report.ok ? t('upd3.diag.report.saved', { file: report.file }) : t('upd3.diag.report.failed')}
            </p>
          ) : null}
        </div>
      ) : null}
    </SettingsCard>
  );
}
