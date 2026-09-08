import { useEffect, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import {
  clearLockscreenPin,
  clearLockscreenSession,
  hasLockscreenPin,
  loadLockscreen,
  onLockscreenChanged,
  saveLockscreen,
  setLockscreenPin,
  type LockscreenSettings,
} from '../../../lockscreenSettings';
import { useT } from '../../../i18n';

export default function LockscreenPage() {
  const { t } = useT();
  const { focusSettingId, seg } = useSettings();
  const [cfg, setCfg] = useState<LockscreenSettings>(() => loadLockscreen());
  const [pinDraft, setPinDraft] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [msg, setMsg] = useState('');
  const [hasPin, setHasPin] = useState(() => hasLockscreenPin());

  useEffect(
    () =>
      onLockscreenChanged((s) => {
        setCfg(s);
        setHasPin(!!s.pinHash);
      }),
    [],
  );

  const flash = (text: string) => {
    setMsg(text);
    window.setTimeout(() => setMsg(''), 2400);
  };

  const savePin = () => {
    if (!/^\d{4}$/.test(pinDraft)) {
      flash(t('settings.lock.msg.needFour'));
      return;
    }
    if (pinDraft !== pinConfirm) {
      flash(t('settings.lock.msg.mismatch'));
      return;
    }
    const next = setLockscreenPin(pinDraft);
    if (!next) {
      flash(t('settings.lock.msg.saveFail'));
      return;
    }
    setPinDraft('');
    setPinConfirm('');
    setHasPin(true);
    flash(t('settings.lock.msg.saved'));
  };

  const toggleEnabled = (on: boolean) => {
    if (on && !hasLockscreenPin()) {
      flash(t('settings.lock.msg.needBeforeEnable'));
      return;
    }
    setCfg(saveLockscreen({ enabled: on }));
    if (on) clearLockscreenSession();
    flash(on ? t('settings.lock.msg.enabled') : t('settings.lock.msg.disabled'));
  };

  return (
    <>
      <SettingsCard
        id="lockscreen-enable"
        title={t('search.lockscreen')}
        description={t('search.lockscreen.desc')}
        highlight={focusSettingId === 'lockscreen-enable'}
      >
        <label className="os-check-row">
          <input
            type="checkbox"
            checked={cfg.enabled}
            disabled={!hasPin}
            onChange={(e) => toggleEnabled(e.target.checked)}
          />
          <span>{t('settings.lock.requireOnLaunch')}</span>
        </label>
        {!hasPin && (
          <p className="muted" style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.45 }}>
            {t('settings.lock.needPinFirst')}
          </p>
        )}
        {cfg.enabled && (
          <p className="muted" style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.45 }}>
            {t('settings.lock.sessionHint')}
          </p>
        )}
      </SettingsCard>

      <SettingsCard
        id="lockscreen-pin"
        title={t('search.lockscreenPin')}
        description={t('search.lockscreenPin.desc')}
        highlight={focusSettingId === 'lockscreen-pin'}
      >
        <div className="os-viz-row" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }}>
            <span className="muted" style={{ fontSize: 11 }}>
              {t('settings.lock.newPasscode')}
            </span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={4}
              value={pinDraft}
              placeholder="••••"
              style={{ width: 120, letterSpacing: '0.35em', textAlign: 'center', padding: '6px 8px' }}
              onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }}>
            <span className="muted" style={{ fontSize: 11 }}>
              {t('settings.lock.confirm')}
            </span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={4}
              value={pinConfirm}
              placeholder="••••"
              style={{ width: 120, letterSpacing: '0.35em', textAlign: 'center', padding: '6px 8px' }}
              onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </label>
          <button type="button" className="btn small primary" onClick={savePin}>
            {hasPin ? t('settings.lock.update') : t('settings.lock.save')}
          </button>
          {hasPin && (
            <button
              type="button"
              className="btn small"
              onClick={() => {
                setCfg(clearLockscreenPin());
                setHasPin(false);
                setPinDraft('');
                setPinConfirm('');
                flash(t('settings.lock.msg.cleared'));
              }}
            >
              {t('settings.lock.clear')}
            </button>
          )}
        </div>
        {msg && (
          <p className="muted" style={{ margin: '10px 0 0', fontSize: 12 }} role="status">
            {msg}
          </p>
        )}
      </SettingsCard>

      <SettingsCard
        id="lockscreen-tint"
        title={t('search.lockscreenTint')}
        description={t('search.lockscreenTint.desc')}
        highlight={focusSettingId === 'lockscreen-tint'}
      >
        <div className="os-viz-row">
          {(
            [
              ['auto', 'settings.lock.tint.auto'],
              ['neutral', 'settings.lock.tint.neutral'],
              ['ember', 'settings.lock.tint.ember'],
              ['slate', 'settings.lock.tint.slate'],
              ['moss', 'settings.lock.tint.moss'],
            ] as const
          ).map(([id, labelKey]) => (
            <button
              key={id}
              type="button"
              {...seg(cfg.tint === id)}
              onClick={() => setCfg(saveLockscreen({ tint: id }))}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
        {cfg.tint === 'auto' && (
          <p className="muted" style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.45 }}>
            {t('settings.lock.tint.autoHint')}
          </p>
        )}
      </SettingsCard>
    </>
  );
}
