import { useEffect, useState } from 'react';
import type {
  DictionaryImportJobSnapshot,
  DictionaryImportKind,
} from '../../../../shared/dictionaryImportJob';
import { useT } from '../../../i18n';
import SettingsCard from '../SettingsCard';

const FILE_KINDS = ['cedict', 'wiktextract', 'dsl', 'jmnedict'] as const;

export function dictionaryImportStatusKey(snapshot: DictionaryImportJobSnapshot | null): string {
  if (!snapshot) return 'storage.dictionaryImport.idle';
  if (snapshot.status === 'running') {
    return `storage.dictionaryImport.phase.${snapshot.progress?.phase ?? 'reading'}`;
  }
  return `storage.dictionaryImport.status.${snapshot.status}`;
}

export default function DictionaryImportCard() {
  const { t, lang } = useT();
  const [snapshot, setSnapshot] = useState<DictionaryImportJobSnapshot | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const running = snapshot?.status === 'running';

  useEffect(() => {
    let active = true;
    void window.api.dictImportStatus().then((value) => {
      if (active) setSnapshot(value);
    }).catch(() => {
      if (active) setNotice(t('storage.dictionaryImport.error.bridge'));
    });
    const unsubscribe = window.api.onDictImportChanged((value) => {
      if (active) setSnapshot(value);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [lang]);

  async function start(kind: DictionaryImportKind) {
    setNotice(null);
    try {
      let filePath: string | undefined;
      if (kind !== 'legacy') {
        const picked = await window.api.dictImportPick(kind);
        if (picked.canceled || !picked.filePath) return;
        filePath = picked.filePath;
      }
      const result = await window.api.dictImportStart(
        filePath ? { kind, filePath } : { kind },
      );
      if (result.snapshot) setSnapshot(result.snapshot);
      if (!result.ok) setNotice(t(`storage.dictionaryImport.error.${result.error}`));
    } catch {
      setNotice(t('storage.dictionaryImport.error.bridge'));
    }
  }

  async function cancel() {
    if (!snapshot || snapshot.status !== 'running') return;
    setNotice(null);
    try {
      const result = await window.api.dictImportCancel(snapshot.jobId);
      setSnapshot(result.snapshot);
      if (!result.ok) setNotice(t('storage.dictionaryImport.error.cancel'));
    } catch {
      setNotice(t('storage.dictionaryImport.error.bridge'));
    }
  }

  const lines = snapshot?.progress?.lines ?? 0;
  const counts = snapshot?.terminal && snapshot.terminal.state !== 'failed'
    ? snapshot.terminal.counts.entries ?? snapshot.terminal.counts.imported ?? 0
    : null;

  return (
    <SettingsCard
      id="storage-dictionary-import"
      title={t('storage.dictionaryImport.title')}
      description={t('storage.dictionaryImport.desc')}
    >
      <div className="asset-list">
        {FILE_KINDS.map((kind) => (
          <div className="asset-row" key={kind}>
            <div className="asset-main">
              <div className="asset-name">{t(`storage.dictionaryImport.kind.${kind}`)}</div>
              <div className="asset-desc">{t(`storage.dictionaryImport.kind.${kind}.desc`)}</div>
            </div>
            <div className="asset-actions">
              <button type="button" className="btn" disabled={running} onClick={() => void start(kind)}>
                {t('storage.dictionaryImport.choose')}
              </button>
            </div>
          </div>
        ))}
        <div className="asset-row">
          <div className="asset-main">
            <div className="asset-name">{t('storage.dictionaryImport.kind.legacy')}</div>
            <div className="asset-desc">{t('storage.dictionaryImport.kind.legacy.desc')}</div>
          </div>
          <div className="asset-actions">
            <button type="button" className="btn" disabled={running} onClick={() => void start('legacy')}>
              {t('storage.dictionaryImport.migrate')}
            </button>
          </div>
        </div>
      </div>

      <div className={`asset-status ${snapshot?.status === 'failed' ? 'is-error' : ''}`} role="status">
        {t(dictionaryImportStatusKey(snapshot), {
          lines,
          count: counts ?? 0,
        })}
        {snapshot?.terminal?.state === 'failed' ? ` ${snapshot.terminal.error}` : ''}
      </div>
      {notice && <div className="asset-notice" role="alert">{notice}</div>}
      {running && (
        <div className="asset-actions">
          <button type="button" className="btn danger" onClick={() => void cancel()}>
            {t('common.cancel')}
          </button>
        </div>
      )}
    </SettingsCard>
  );
}
