import { useEffect, useState } from 'react';
import { confirmDialog } from '../components/ui';
import { KNOWN_LANGS } from '../../shared/langs';
import type { YomitanDictInfo } from '../../shared/types';
import {
  bumpZoom,
  getZoom,
  onZoomChanged,
  setZoom,
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
} from '../appZoom';
import { ProfileSwitcher } from '../components/ProfileSwitcher';
import ShortcutSettings from '../components/ShortcutSettings';
import { loadClipboardSettings, saveClipboardSettings } from '../clipboardHistory';
import { TELEMETRY_CONSENT_KEY } from '../../shared/stats';
import { sendTelemetryPingIfNeeded } from '../telemetryPing';
import { useT } from '../i18n';

/** Study-profile picker and controls — shared by Settings and Anki views. */
export function ProfileSettingsSection() {
  return <ProfileSwitcher showHeading />;
}

function dictKindLabel(d: YomitanDictInfo, t: (key: string) => string): string {
  const parts: string[] = [];
  if (d.hasTerms) parts.push(t('settings.study.dict.kind.terms'));
  if (d.hasPitch) parts.push(t('settings.study.dict.kind.pitch'));
  if (d.hasFreq) parts.push(t('settings.study.dict.kind.frequency'));
  return parts.length
    ? parts.join(t('settings.study.dict.kindJoin'))
    : t('settings.study.dict.kind.metadata');
}

/** Import / remove offline Yomitan dictionaries for the pop-up and mining. */
export function DictionarySettingsSection() {
  const { t } = useT();
  const [dicts, setDicts] = useState<YomitanDictInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [exOffline, setExOffline] = useState<{
    installed: boolean;
    sentenceCount: number;
    updatedAt: number;
  } | null>(null);
  const [exImporting, setExImporting] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [list, offline] = await Promise.all([
        window.api.dictListYomitan(),
        window.api.examplesOfflineStatus(),
      ]);
      setDicts(list);
      setExOffline(offline);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onImport() {
    setImporting(true);
    setMsg(null);
    const res = await window.api.dictImportYomitan();
    setImporting(false);
    if (res.error === 'cancelled') return;
    if (res.ok) {
      setMsg({
        kind: 'ok',
        text: t('settings.study.dict.imported', {
          title: res.info?.title ?? t('settings.study.dict.fallbackTitle'),
        }),
      });
      await refresh();
    } else {
      setMsg({ kind: 'err', text: res.error ?? t('settings.study.dict.importFailed') });
    }
  }

  async function onImportExamples() {
    setExImporting(true);
    setMsg(null);
    const res = await window.api.examplesImportOffline();
    setExImporting(false);
    if (res.error === 'cancelled') return;
    if (res.ok) {
      setMsg({
        kind: 'ok',
        text: t('settings.study.dict.examples.indexed', { count: res.added }),
      });
      await refresh();
    } else {
      setMsg({ kind: 'err', text: res.error ?? t('settings.study.dict.importFailed') });
    }
  }

  async function onRemove(id: string, title: string) {
    const ok = await confirmDialog({
      title: t('settings.study.dict.removeTitle'),
      message: t('settings.study.dict.removeMsg', { title }),
      confirmLabel: t('common.remove'),
      danger: true,
    });
    if (!ok) return;
    setRemoving(id);
    setMsg(null);
    const res = await window.api.dictRemoveYomitan(id);
    setRemoving(null);
    if (res.ok) {
      setMsg({ kind: 'ok', text: t('settings.study.dict.removed') });
      await refresh();
    } else {
      setMsg({ kind: 'err', text: res.error ?? t('settings.study.dict.removeFailed') });
    }
  }

  async function onToggle(id: string, enabled: boolean) {
    setMsg(null);
    const res = await window.api.dictSetYomitanEnabled(id, enabled);
    if (res.ok) await refresh();
    else setMsg({ kind: 'err', text: res.error ?? t('settings.study.dict.updateFailed') });
  }

  async function onMove(id: string, dir: number) {
    setMsg(null);
    const res = await window.api.dictMoveYomitan(id, dir);
    if (res.ok) await refresh();
    else if (res.error !== 'Already at the edge.') {
      setMsg({ kind: 'err', text: res.error ?? t('settings.study.dict.reorderFailed') });
    }
  }

  async function onSetLang(id: string, glossLang: string) {
    setMsg(null);
    const res = await window.api.dictSetYomitanLang(id, glossLang);
    if (res.ok) await refresh();
    else setMsg({ kind: 'err', text: res.error ?? t('settings.study.dict.langFailed') });
  }

  return (
    <section className="set-section">
      <h2>{t('search.dictionary')}</h2>
      <p className="set-row-desc muted">
        {t('settings.study.dict.intro')}
      </p>

      <div className="set-profile-actions">
        <button className="btn primary" onClick={() => void onImport()} disabled={importing}>
          {importing ? t('settings.study.dict.importing') : t('settings.study.dict.import')}
        </button>
      </div>

      {loading && <div className="form-msg">{t('settings.study.dict.loading')}</div>}
      {!loading && dicts.length === 0 && (
        <div className="form-msg">{t('settings.study.dict.empty')}</div>
      )}
      {!loading && dicts.length > 0 && (
        <ul className="dict-manage-list">
          {dicts.map((d, i) => (
            <li className={`dict-manage-row ${d.enabled === false ? 'off' : ''}`} key={d.id}>
              <label className="dict-manage-toggle" title={t('settings.study.dict.useTitle')}>
                <input
                  type="checkbox"
                  checked={d.enabled !== false}
                  onChange={(e) => void onToggle(d.id, e.target.checked)}
                />
              </label>
              <div className="dict-manage-info">
                <div className="set-row-title">
                  {d.title}
                  {d.bundled && (
                    <span className="dict-badge bundled">{t('settings.study.dict.bundled')}</span>
                  )}
                </div>
                <div className="set-row-desc muted">
                  {dictKindLabel(d, t)}
                  {d.revision ? t('settings.study.dict.rev', { rev: d.revision }) : ''}
                  {d.hasTerms && !d.glossLangOverride && d.glossLangs?.length
                    ? t('settings.study.dict.langDetected', {
                        langs: d.glossLangs.join(', '),
                      })
                    : ''}
                </div>
              </div>
              <div className="dict-manage-actions">
                {d.hasTerms && (
                  <select
                    className="dict-lang-select"
                    title={t('settings.study.dict.langTitle')}
                    value={d.glossLangOverride ?? ''}
                    onChange={(e) => void onSetLang(d.id, e.target.value)}
                  >
                    <option value="">
                      {d.glossLangs?.length
                        ? t('settings.study.dict.langAutoWith', {
                            langs: d.glossLangs.join(', '),
                          })
                        : t('settings.study.dict.langAuto')}
                    </option>
                    {KNOWN_LANGS.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  className="btn small"
                  title={t('settings.study.dict.higherPriority')}
                  disabled={i === 0}
                  onClick={() => void onMove(d.id, -1)}
                >
                  â†‘
                </button>
                <button
                  className="btn small"
                  title={t('settings.study.dict.lowerPriority')}
                  disabled={i === dicts.length - 1}
                  onClick={() => void onMove(d.id, 1)}
                >
                  â†“
                </button>
                {!d.bundled && (
                  <button
                    className="btn small"
                    disabled={removing === d.id}
                    onClick={() => void onRemove(d.id, d.title)}
                  >
                    {removing === d.id
                      ? t('settings.study.dict.removing')
                      : t('common.remove')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3 className="set-subhead">{t('settings.study.dict.examples.title')}</h3>
      <p className="set-row-desc muted">
        {t('settings.study.dict.examples.intro')}{' '}
        <a href="https://tatoeba.org/en/downloads" target="_blank" rel="noreferrer">
          tatoeba.org/downloads
        </a>
      </p>
      <div className="set-profile-actions">
        <button className="btn" onClick={() => void onImportExamples()} disabled={exImporting}>
          {exImporting
            ? t('settings.study.dict.importing')
            : t('settings.study.dict.examples.import')}
        </button>
      </div>
      {!loading && exOffline && (
        <div className="form-msg">
          {exOffline.sentenceCount > 0
            ? t('settings.study.dict.examples.count', { count: exOffline.sentenceCount })
            : t('settings.study.dict.examples.empty')}
        </div>
      )}

      {msg && <div className={`form-msg ${msg.kind}`}>{msg.text}</div>}
    </section>
  );
}

function ClipboardSettingsSection() {
  const { t } = useT();
  const [settings, setSettings] = useState(loadClipboardSettings);
  return (
    <section className="set-section">
      <h2>{t('settings.clipboard.title')}</h2>
      <p className="set-row-desc muted">{t('settings.clipboard.intro')}</p>

      <div className="set-row">
        <div className="set-row-text">
          <div className="set-row-title">{t('settings.clipboard.maxSize')}</div>
          <div className="set-row-desc muted">{t('settings.clipboard.maxSize.desc')}</div>
        </div>
        <input
          type="number"
          min={10}
          max={2000}
          className="set-number"
          value={settings.maxSize}
          onChange={(e) => setSettings(saveClipboardSettings({ maxSize: Math.max(10, Number(e.target.value) || 200) }))}
        />
      </div>

      <div className="set-row">
        <div className="set-row-text">
          <div className="set-row-title">{t('settings.clipboard.dedupe')}</div>
          <div className="set-row-desc muted">{t('settings.clipboard.dedupe.desc')}</div>
        </div>
        <input
          type="checkbox"
          checked={settings.dedupeConsecutive}
          onChange={(e) => setSettings(saveClipboardSettings({ dedupeConsecutive: e.target.checked }))}
        />
      </div>

      <div className="set-row">
        <div className="set-row-text">
          <div className="set-row-title">{t('settings.clipboard.clearOnExit')}</div>
          <div className="set-row-desc muted">{t('settings.clipboard.clearOnExit.desc')}</div>
        </div>
        <input
          type="checkbox"
          checked={settings.clearOnExit}
          onChange={(e) => setSettings(saveClipboardSettings({ clearOnExit: e.target.checked }))}
        />
      </div>

      <div className="set-row">
        <div className="set-row-text">
          <div className="set-row-title">{t('settings.clipboard.monitoring')}</div>
          <div className="set-row-desc muted">{t('settings.clipboard.monitoring.desc')}</div>
        </div>
        <input
          type="checkbox"
          checked={settings.monitoringEnabled}
          onChange={(e) => setSettings(saveClipboardSettings({ monitoringEnabled: e.target.checked }))}
        />
      </div>
    </section>
  );
}

function PrivacySettingsSection() {
  const { t } = useT();
  const [consent, setConsent] = useState<'yes' | 'no' | null>(() => {
    const v = localStorage.getItem(TELEMETRY_CONSENT_KEY);
    return v === 'yes' || v === 'no' ? v : null;
  });

  const share = consent === 'yes';

  const onToggle = (next: boolean) => {
    const value = next ? 'yes' : 'no';
    try {
      localStorage.setItem(TELEMETRY_CONSENT_KEY, value);
      if (next) void sendTelemetryPingIfNeeded();
    } catch {
      /* storage unavailable */
    }
    setConsent(value);
  };

  return (
    <section className="set-section">
      <h2>{t('settings.privacy.title')}</h2>
      <p className="set-row-desc muted">{t('settings.privacy.intro')}</p>

      <div className="set-row">
        <div className="set-row-text">
          <div className="set-row-title">{t('settings.privacy.heatmap')}</div>
          <div className="set-row-desc muted">{t('settings.privacy.heatmap.desc')}</div>
        </div>
        <input type="checkbox" checked={share} onChange={(e) => onToggle(e.target.checked)} />
      </div>
    </section>
  );
}

export default function SettingsView() {
  const { t } = useT();
  const [zoom, setZoomState] = useState<number>(getZoom());

  useEffect(() => onZoomChanged(setZoomState), []);

  const pct = Math.round(zoom * 100);
  const atMin = zoom <= ZOOM_MIN + 1e-9;
  const atMax = zoom >= ZOOM_MAX - 1e-9;

  return (
    <div className="settings-view">
      <div className="view-head">
        <div>
          <h1>{t('settings.appTitle')}</h1>
          <p className="muted">{t('settings.legacy.intro')}</p>
        </div>
      </div>

      <ProfileSettingsSection />

      <DictionarySettingsSection />

      <ShortcutSettings />

      <ClipboardSettingsSection />

      <PrivacySettingsSection />

      <section className="set-section">
        <h2>{t('settings.a11y.title')}</h2>

        <div className="set-row">
          <div className="set-row-text">
            <div className="set-row-title">{t('settings.a11y.zoom.title')}</div>
            <div className="set-row-desc muted">{t('settings.a11y.zoom.desc')}</div>
          </div>
          <div className="zoom-control">
            <button
              className="zoom-btn"
              onClick={() => bumpZoom(-ZOOM_STEP)}
              disabled={atMin}
              aria-label={t('settings.a11y.zoom.decrease')}
            >
              âˆ’
            </button>
            <span className="zoom-val">{pct}%</span>
            <button
              className="zoom-btn"
              onClick={() => bumpZoom(ZOOM_STEP)}
              disabled={atMax}
              aria-label={t('settings.a11y.zoom.increase')}
            >
              +
            </button>
            <button
              className="btn small"
              onClick={() => setZoom(ZOOM_DEFAULT)}
              disabled={pct === Math.round(ZOOM_DEFAULT * 100)}
            >
              {t('common.reset')}
            </button>
          </div>
        </div>

        <input
          className="set-range"
          type="range"
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={ZOOM_STEP}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          aria-label={t('settings.a11y.zoom.aria')}
        />
      </section>

      <section className="set-section">
        <h2>{t('settings.readerTip.title')}</h2>
        <p className="set-row-desc muted">{t('settings.readerTip.body')}</p>
      </section>
    </div>
  );
}
