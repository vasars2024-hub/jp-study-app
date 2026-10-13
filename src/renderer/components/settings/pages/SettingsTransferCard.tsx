/**
 * Settings export and import (WP3) — the Storage page's card.
 *
 * Export: pick groups, get a JSON file of those settings and nothing else.
 * Import: pick a file; it is validated whole, then previewed field by field
 * against this install, and only "Apply changes" writes anything. The apply is
 * all or nothing, and the toast it raises can undo it (the set8 reset toast).
 *
 * The rules — which keys travel, what is refused, how owners are told — live in
 * `storage/settingsTransfer.ts`; this card only drives them.
 */
import { useEffect, useRef, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import { useT } from '../../../i18n';
import { offerUndoToast } from '../ResetSectionButton';
import { pushRecentChange } from '../settingsRecent';
import { domainLabel } from '../../filesapp/panels/memoryDomainText';
import { domainById } from '../../../storage/settingsCatalog';
import {
  applySettingsTransfer,
  buildSettingsTransfer,
  listSettingsTransferGroups,
  parseSettingsTransfer,
  previewSettingsTransfer,
  settingsTransferFileName,
  type ParsedSettingsTransfer,
  type SettingsTransferError,
  type SettingsTransferPreview,
} from '../../../storage/settingsTransfer';

/** Written out again on the card itself: the search reachability tests read the literal. */
const CARD_ID = 'storage-settings-transfer';

/** Group id -> a line saying what stays behind, where something does. */
const GROUP_HINT_KEYS: Readonly<Record<string, string>> = {
  appearance: 'settingsTransfer.hint.appearance',
  environment: 'settingsTransfer.hint.environment',
  music: 'settingsTransfer.hint.music',
  dictionary: 'settingsTransfer.hint.dictionary',
};

const PARSE_ERROR_KEYS: Readonly<Record<SettingsTransferError, string>> = {
  badJson: 'settingsTransfer.error.badJson',
  notSettings: 'settingsTransfer.error.notSettings',
  newerSchema: 'settingsTransfer.error.newerSchema',
  unknownGroup: 'settingsTransfer.error.unknownGroup',
  unknownKey: 'settingsTransfer.error.unknownKey',
  forbiddenKey: 'settingsTransfer.error.forbiddenKey',
  badValue: 'settingsTransfer.error.badValue',
  machinePath: 'settingsTransfer.error.machinePath',
  empty: 'settingsTransfer.error.empty',
};

const APPLY_ERROR_KEYS = {
  writeFailed: 'settingsTransfer.error.writeFailed',
  applyFailed: 'settingsTransfer.error.applyFailed',
} as const;

function saveTextFile(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function groupName(id: string, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const def = domainById(id);
  return def ? domainLabel(def, t) : id;
}

export default function SettingsTransferCard() {
  const { focusSettingId } = useSettings();
  const { t } = useT();
  const groupIds = listSettingsTransferGroups();
  const [selected, setSelected] = useState<string[]>(groupIds);
  const [appVersion, setAppVersion] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ file: ParsedSettingsTransfer; preview: SettingsTransferPreview } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    try {
      void window.api?.appVersion?.()
        .then((v) => {
          if (alive && typeof v === 'string') setAppVersion(v);
        })
        .catch(() => undefined);
    } catch {
      /* no bridge (harness) — the file says '' */
    }
    return () => {
      alive = false;
    };
  }, []);

  function toggle(id: string, on: boolean): void {
    setSelected((cur) => (on ? groupIds.filter((g) => g === id || cur.includes(g)) : cur.filter((g) => g !== id)));
  }

  function onExport(): void {
    setError(null);
    const name = settingsTransferFileName();
    const { text, skipped } = buildSettingsTransfer(selected, { appVersion });
    saveTextFile(name, text);
    const parts = [t('settingsTransfer.export.done', { file: name })];
    if (skipped.length) {
      parts.push(t('settingsTransfer.export.skipped', { keys: skipped.map((s) => s.key).join(', ') }));
    }
    setStatus(parts.join(' '));
  }

  async function onFile(file: File | undefined): Promise<void> {
    setStatus(null);
    setError(null);
    setPending(null);
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      setError(t('settingsTransfer.error.readFailed'));
      return;
    }
    const parsed = parseSettingsTransfer(text);
    if (!parsed.ok) {
      setError(t(PARSE_ERROR_KEYS[parsed.error], { key: parsed.key ?? '' }));
      return;
    }
    setPending({ file: parsed.file, preview: previewSettingsTransfer(parsed.file) });
  }

  function onApply(): void {
    if (!pending) return;
    // Re-diff at the moment of applying: a setting may have moved since the preview.
    const preview = previewSettingsTransfer(pending.file);
    const result = applySettingsTransfer(preview.changes);
    setPending(null);
    if (!result.ok) {
      setError(t(APPLY_ERROR_KEYS[result.error], { key: result.key }));
      return;
    }
    pushRecentChange(CARD_ID);
    setStatus(t('settingsTransfer.import.done'));
    offerUndoToast({
      message: t('settingsTransfer.import.done'),
      undoLabel: t('set8.reset.undo'),
      undoneMessage: t('settingsTransfer.import.undone'),
      undoFailedMessage: t('settingsTransfer.import.undoFailed'),
      undo: result.undo,
      onRestored: () => pushRecentChange(CARD_ID),
    });
  }

  const preview = pending?.preview;
  const changedGroups = preview ? [...new Set(preview.changes.map((c) => c.group))] : [];

  return (
    <SettingsCard
      id="storage-settings-transfer"
      title={t('settingsTransfer.title')}
      description={t('settingsTransfer.desc')}
      highlight={focusSettingId === CARD_ID}
    >
      <fieldset className="settings-transfer-groups">
        <legend>{t('settingsTransfer.export.legend')}</legend>
        {groupIds.map((id) => (
          <div key={id}>
            <label className="pl-field">
              <input
                type="checkbox"
                checked={selected.includes(id)}
                onChange={(e) => toggle(id, e.target.checked)}
              />
              <span>{groupName(id, t)}</span>
            </label>
            {GROUP_HINT_KEYS[id] && <p className="muted">{t(GROUP_HINT_KEYS[id])}</p>}
          </div>
        ))}
      </fieldset>
      <div className="asset-actions">
        <button type="button" className="btn small" onClick={() => setSelected(groupIds)}>
          {t('settingsTransfer.export.all')}
        </button>
        <button type="button" className="btn small" onClick={() => setSelected([])}>
          {t('settingsTransfer.export.none')}
        </button>
        <button type="button" className="btn" disabled={!selected.length} onClick={onExport}>
          {t('settingsTransfer.export.button')}
        </button>
        <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
          {t('settingsTransfer.import.button')}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          aria-label={t('settingsTransfer.import.fileLabel')}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            void onFile(file);
          }}
        />
      </div>

      {status && <div className="asset-status" role="status">{status}</div>}
      {error && <div className="asset-notice" role="alert">{error}</div>}

      {pending && preview && (
        <div className="settings-transfer-preview" data-settings-transfer-preview="">
          <h4>{t('settingsTransfer.import.previewTitle')}</h4>
          {pending.file.appVersion && (
            <p className="muted">{t('settingsTransfer.import.from', { version: pending.file.appVersion })}</p>
          )}
          {preview.studyLanguageDiffers && (
            <p className="muted">{t('settingsTransfer.import.studyLang', { lang: pending.file.studyLanguage.toUpperCase() })}</p>
          )}
          {preview.skipped.some((s) => s.reason === 'secretShellTheme') && (
            <p className="muted">{t('settingsTransfer.import.skipTheme')}</p>
          )}
          {preview.changes.length ? (
            <>
              <p>{t('settingsTransfer.import.summary', { n: preview.changes.length, same: preview.unchanged })}</p>
              {changedGroups.map((groupId) => (
                <div key={groupId} className="asset-row">
                  <div className="asset-main">
                    <div className="asset-name">{groupName(groupId, t)}</div>
                    {preview.changes
                      .filter((c) => c.group === groupId)
                      .map((c) => (
                        <div key={c.key} className="asset-desc">
                          <code>{c.key}</code>
                          <ul>
                            {c.fields.map((f) => (
                              <li key={f.field || '-'}>
                                {f.field || t('settingsTransfer.import.value')}:{' '}
                                {c.before == null ? t('settingsTransfer.import.default') : f.before}
                                {' → '}
                                {c.after == null ? t('settingsTransfer.import.default') : f.after}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <p>{t('settingsTransfer.import.nothing')}</p>
          )}
          <div className="asset-actions">
            {preview.changes.length > 0 && (
              <button type="button" className="btn" onClick={onApply}>
                {t('settingsTransfer.import.apply')}
              </button>
            )}
            <button type="button" className="btn" onClick={() => setPending(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </SettingsCard>
  );
}
