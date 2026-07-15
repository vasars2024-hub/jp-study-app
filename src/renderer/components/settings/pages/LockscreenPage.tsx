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

export default function LockscreenPage() {
  const { focusSettingId, seg } = useSettings();
  const [cfg, setCfg] = useState<LockscreenSettings>(() => loadLockscreen());
  const [pinDraft, setPinDraft] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [msg, setMsg] = useState('');
  const [hasPin, setHasPin] = useState(() => hasLockscreenPin());

  useEffect(() => onLockscreenChanged((s) => {
    setCfg(s);
    setHasPin(!!s.pinHash);
  }), []);

  const flash = (t: string) => {
    setMsg(t);
    window.setTimeout(() => setMsg(''), 2400);
  };

  const savePin = () => {
    if (!/^\d{4}$/.test(pinDraft)) {
      flash('Enter a 4-digit passcode.');
      return;
    }
    if (pinDraft !== pinConfirm) {
      flash('Passcodes do not match.');
      return;
    }
    const next = setLockscreenPin(pinDraft);
    if (!next) {
      flash('Could not save passcode.');
      return;
    }
    setPinDraft('');
    setPinConfirm('');
    setHasPin(true);
    flash('Passcode saved.');
  };

  const toggleEnabled = (on: boolean) => {
    if (on && !hasLockscreenPin()) {
      flash('Set a 4-digit passcode before enabling.');
      return;
    }
    setCfg(saveLockscreen({ enabled: on }));
    if (on) clearLockscreenSession();
    flash(on ? 'Lockscreen enabled — required on next launch.' : 'Lockscreen disabled.');
  };

  return (
    <>
      <SettingsCard
        id="lockscreen-enable"
        title="Lockscreen"
        description="Optional border-style PIN gate when Study OS launches. Unlock reveals the desktop or Mini View based on your other settings."
        highlight={focusSettingId === 'lockscreen-enable'}
      >
        <label className="os-check-row">
          <input
            type="checkbox"
            checked={cfg.enabled}
            disabled={!hasPin}
            onChange={(e) => toggleEnabled(e.target.checked)}
          />
          <span>Require passcode on launch</span>
        </label>
        {!hasPin && (
          <p className="muted" style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.45 }}>
            Set a passcode below before you can turn this on.
          </p>
        )}
        {cfg.enabled && (
          <p className="muted" style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.45 }}>
            After unlock this session, the lockscreen stays clear until you restart the app.
          </p>
        )}
      </SettingsCard>

      <SettingsCard
        id="lockscreen-pin"
        title="Passcode"
        description="Four digits, iOS-style keypad on the lockscreen. Stored locally on this PC only."
        highlight={focusSettingId === 'lockscreen-pin'}
      >
        <div className="os-viz-row" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }}>
            <span className="muted" style={{ fontSize: 11 }}>New passcode</span>
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
            <span className="muted" style={{ fontSize: 11 }}>Confirm</span>
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
            {hasPin ? 'Update passcode' : 'Save passcode'}
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
                flash('Passcode cleared. Lockscreen turned off.');
              }}
            >
              Clear passcode
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
        title="Lockscreen look"
        description="Soft tint behind the PIN panel."
        highlight={focusSettingId === 'lockscreen-tint'}
      >
        <div className="os-viz-row">
          {(
            [
              ['neutral', 'Neutral'],
              ['ember', 'Ember'],
              ['slate', 'Slate'],
              ['moss', 'Moss'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={seg(cfg.tint === id)}
              onClick={() => setCfg(saveLockscreen({ tint: id }))}
            >
              {label}
            </button>
          ))}
        </div>
      </SettingsCard>
    </>
  );
}
