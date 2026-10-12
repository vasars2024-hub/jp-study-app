import { useEffect, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import {
  clearLockscreenPin,
  clearLockscreenSession,
  hasLockscreenPin,
  isValidPin,
  loadLockscreen,
  lockGumNow,
  newLockscreenRecoveryCode,
  onLockscreenChanged,
  refreshLockscreenMirror,
  saveLockscreen,
  setLockscreenAutoLock,
  setLockscreenEnabled,
  setLockscreenPin,
  type LockscreenChange,
  type LockscreenSettings,
  type LockscreenStudyMode,
} from '../../../lockscreenSettings';
import { AUTO_LOCK_IDLE_CHOICES, DEFAULT_AUTO_LOCK, type AutoLockOptions } from '../../../../shared/lockStatus';
import { LOCK_PASSPHRASE_MAX_CHARS, LOCK_PIN_MAX_DIGITS, type LockSecretKind } from '../../../../shared/lockSecret';
import { useT } from '../../../i18n';

const NOTE_STYLE = { margin: '8px 0 0', fontSize: 12, lineHeight: 1.45 } as const;
const PIN_INPUT_STYLE = { width: 140, letterSpacing: '0.35em', textAlign: 'center', padding: '6px 8px' } as const;
const PASSPHRASE_INPUT_STYLE = { width: 220, padding: '6px 8px' } as const;

/** lock4: the field for a PIN (digits only, up to 12) or a passphrase (any text). */
function secretInputProps(kind: 'pin' | 'passphrase', value: string, set: (v: string) => void) {
  return kind === 'passphrase'
    ? {
        type: 'password',
        inputMode: 'text' as const,
        maxLength: LOCK_PASSPHRASE_MAX_CHARS,
        spellCheck: false,
        value,
        style: PASSPHRASE_INPUT_STYLE,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(e.target.value),
      }
    : {
        type: 'password',
        inputMode: 'numeric' as const,
        maxLength: LOCK_PIN_MAX_DIGITS,
        value,
        placeholder: '••••',
        style: PIN_INPUT_STYLE,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(e.target.value.replace(/\D/g, '').slice(0, LOCK_PIN_MAX_DIGITS)),
      };
}

const asFieldKind = (k: LockSecretKind): 'pin' | 'passphrase' => (k === 'passphrase' ? 'passphrase' : 'pin');

/**
 * Settings -> Lockscreen. lock3: main owns the PIN, so every change that weakens
 * the lock — a new PIN, clearing it, turning the launch lock off, a new
 * recovery code — asks for the current passcode, which main checks against the
 * same attempt counter as the lock screen.
 */
export default function LockscreenPage() {
  const { t } = useT();
  const { focusSettingId, seg } = useSettings();
  const [cfg, setCfg] = useState<LockscreenSettings>(() => loadLockscreen());
  const [currentPin, setCurrentPin] = useState('');
  const [pinDraft, setPinDraft] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [msg, setMsg] = useState('');
  const [hasPin, setHasPin] = useState(() => hasLockscreenPin());
  const [hasRecovery, setHasRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [autoLock, setAutoLock] = useState<AutoLockOptions>({ ...DEFAULT_AUTO_LOCK });
  /** lock4: what the NEW secret is (a PIN of 4-12 digits, or a passphrase). */
  const [newKind, setNewKind] = useState<'pin' | 'passphrase'>(() => asFieldKind(loadLockscreen().secretKind));
  /** The CURRENT secret's field follows main's record (mirrored in `cfg`). */
  const currentKind = asFieldKind(cfg.secretKind);

  useEffect(
    () =>
      onLockscreenChanged((s) => {
        setCfg(s);
        setHasPin(!!s.pinHash);
      }),
    [],
  );
  useEffect(() => {
    let alive = true;
    void refreshLockscreenMirror().then((status) => {
      if (!alive || !status) return;
      setHasPin(status.hasPin);
      setHasRecovery(status.hasRecovery);
      setAutoLock(status.autoLock);
    });
    return () => {
      alive = false;
    };
  }, []);

  const flash = (text: string) => {
    setMsg(text);
    window.setTimeout(() => setMsg(''), 4000);
  };

  /** Main's answer, in words; true when it went through. */
  const settle = (res: LockscreenChange, okText: string): boolean => {
    setCfg(res.settings);
    setHasPin(!!res.settings.pinHash);
    if (res.ok) {
      setCurrentPin('');
      flash(okText);
      return true;
    }
    if (res.retryAfterMs) flash(t('lockscreen.retryIn', { count: Math.max(1, Math.ceil(res.retryAfterMs / 1000)) }));
    else if (res.error === 'wrong-pin') flash(currentPin ? t('lock3.settings.wrongCurrent') : t('lock3.settings.currentNeeded'));
    else if (res.error === 'invalid') flash(newKind === 'passphrase' ? t('lock4.settings.needPassphrase') : t('lock4.settings.needPin'));
    else flash(t('settings.lock.msg.saveFail'));
    return false;
  };
  const afterStatus = () =>
    void refreshLockscreenMirror().then((status) => {
      if (status) setHasRecovery(status.hasRecovery);
    });

  const savePin = () => {
    // lock4: a PIN is 4-12 digits; a passphrase is 6-64 characters, not all digits.
    const draftOk = isValidPin(pinDraft) && (newKind === 'pin' ? /^[0-9]+$/.test(pinDraft) : !/^[0-9]+$/.test(pinDraft.trim()));
    if (!draftOk) {
      flash(newKind === 'passphrase' ? t('lock4.settings.needPassphrase') : t('lock4.settings.needPin'));
      return;
    }
    if (pinDraft !== pinConfirm) {
      flash(t('settings.lock.msg.mismatch'));
      return;
    }
    if (hasPin && !isValidPin(currentPin)) {
      flash(t('lock3.settings.currentNeeded'));
      return;
    }
    // Hashed in main (scrypt), so saving is async.
    void setLockscreenPin(hasPin ? currentPin : null, pinDraft).then((res) => {
      if (!settle(res, t('settings.lock.msg.saved'))) return;
      setPinDraft('');
      setPinConfirm('');
      if (res.recoveryCode) setRecoveryCode(res.recoveryCode);
      afterStatus();
    });
  };

  const clearPin = () => {
    if (!isValidPin(currentPin)) {
      flash(t('lock3.settings.currentNeeded'));
      return;
    }
    void clearLockscreenPin(currentPin).then((res) => {
      if (!settle(res, t('settings.lock.msg.cleared'))) return;
      setPinDraft('');
      setPinConfirm('');
      setRecoveryCode(null);
      afterStatus();
    });
  };

  const toggleEnabled = (on: boolean) => {
    if (on && !hasLockscreenPin()) {
      flash(t('settings.lock.msg.needBeforeEnable'));
      return;
    }
    if (!on && !isValidPin(currentPin)) {
      flash(t('lock3.settings.currentNeeded'));
      return;
    }
    void setLockscreenEnabled(on, on ? undefined : currentPin).then((res) => {
      if (settle(res, on ? t('settings.lock.msg.enabled') : t('settings.lock.msg.disabled')) && on) clearLockscreenSession();
    });
  };

  const newRecovery = () => {
    if (!isValidPin(currentPin)) {
      flash(t('lock3.settings.currentNeeded'));
      return;
    }
    void newLockscreenRecoveryCode(currentPin).then((res) => {
      if (!settle(res, t('lock3.settings.recovery.made'))) return;
      if (res.recoveryCode) setRecoveryCode(res.recoveryCode);
      setHasRecovery(true);
    });
  };

  const patchAutoLock = (patch: Partial<AutoLockOptions>) => {
    void setLockscreenAutoLock(patch).then((res) => {
      if (res.ok) {
        void refreshLockscreenMirror().then((status) => {
          if (status) setAutoLock(status.autoLock);
        });
      } else {
        flash(t('settings.lock.msg.saveFail'));
      }
    });
  };

  const copyCode = () => {
    if (!recoveryCode) return;
    void navigator.clipboard?.writeText(recoveryCode).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  const currentField = hasPin && (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }}>
      <span className="muted" style={{ fontSize: 11 }}>
        {t('lock3.settings.currentPin')}
      </span>
      <input
        autoComplete="current-password"
        {...secretInputProps(currentKind, currentPin, setCurrentPin)}
      />
    </label>
  );

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
        {!hasPin && <p className="muted" style={NOTE_STYLE}>{t('settings.lock.needPinFirst')}</p>}
        {cfg.enabled && <p className="muted" style={NOTE_STYLE}>{t('settings.lock.sessionHint')}</p>}
        {hasPin && cfg.enabled && <p className="muted" style={NOTE_STYLE}>{t('lock3.settings.disableNeedsPin')}</p>}
        <div className="os-viz-row" style={{ marginTop: 10, gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn small" disabled={!hasPin} onClick={() => void lockGumNow()}>
            {t('lock3.settings.lockNow')}
          </button>
          <span className="muted" style={{ fontSize: 12 }}>{t('lock3.settings.lockNowHint')}</span>
        </div>
        {/* lock2: what the lock does and, honestly, what it does not. */}
        <section aria-labelledby="lock2-note-title" style={{ margin: '12px 0 0', fontSize: 12, lineHeight: 1.45 }}>
          <p id="lock2-note-title" style={{ margin: 0 }}>
            <strong>{t('lock2.note.title')}</strong>
          </p>
          <ul className="muted" style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            <li>{t('lock2.note.covers')}</li>
            <li>{t('lock3.note.data')}</li>
            <li>{t('lock2.note.background')}</li>
            <li>{t('lock2.note.devtools')}</li>
            <li>{t('lock2.note.limits')}</li>
          </ul>
        </section>
      </SettingsCard>

      <SettingsCard
        id="lockscreen-pin"
        title={t('search.lockscreenPin')}
        description={t('search.lockscreenPin.desc')}
        highlight={focusSettingId === 'lockscreen-pin'}
      >
        {hasPin && <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>{t('lock3.settings.currentHint')}</p>}
        <div className="os-viz-row" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginBottom: hasPin ? 10 : 0 }}>
          {currentField}
        </div>
        {/* lock4: a PIN of 4-12 digits, or a passphrase. Native radios: arrow keys move
            between them and a screen reader hears the group's name. */}
        <div
          role="radiogroup"
          aria-labelledby="lock4-kind-label"
          aria-describedby="lock4-kind-hint"
          className="os-viz-row"
          style={{ flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 6 }}
        >
          <span id="lock4-kind-label" className="muted" style={{ fontSize: 11 }}>
            {t('lock4.settings.kind.label')}
          </span>
          {(
            [
              ['pin', 'lock4.settings.kind.pin'],
              ['passphrase', 'lock4.settings.kind.passphrase'],
            ] as const
          ).map(([id, labelKey]) => (
            <label key={id} className="os-check-row" style={{ minHeight: 24 }}>
              <input
                type="radio"
                name="lock4-secret-kind"
                value={id}
                checked={newKind === id}
                onChange={() => {
                  setNewKind(id);
                  setPinDraft('');
                  setPinConfirm('');
                }}
              />
              <span>{t(labelKey)}</span>
            </label>
          ))}
        </div>
        <p id="lock4-kind-hint" className="muted" style={{ margin: '0 0 8px', fontSize: 12, lineHeight: 1.45 }}>
          {newKind === 'passphrase' ? t('lock4.settings.kind.hintPassphrase') : t('lock4.settings.kind.hintPin')}
        </p>
        <div className="os-viz-row" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }}>
            <span className="muted" style={{ fontSize: 11 }}>
              {t('settings.lock.newPasscode')}
            </span>
            <input autoComplete="new-password" {...secretInputProps(newKind, pinDraft, setPinDraft)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }}>
            <span className="muted" style={{ fontSize: 11 }}>
              {t('settings.lock.confirm')}
            </span>
            <input autoComplete="new-password" {...secretInputProps(newKind, pinConfirm, setPinConfirm)} />
          </label>
          <button type="button" className="btn small primary" onClick={savePin}>
            {hasPin ? t('settings.lock.update') : t('settings.lock.save')}
          </button>
          {hasPin && (
            <button type="button" className="btn small" onClick={clearPin}>
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
        id="lockscreen-recovery"
        title={t('lock3.settings.recovery.title')}
        description={t('lock3.settings.recovery.desc')}
        highlight={focusSettingId === 'lockscreen-recovery'}
      >
        {recoveryCode ? (
          <div role="group" aria-labelledby="lock3-recovery-code">
            <p style={{ margin: 0, fontSize: 12 }}>{t('lock3.settings.recovery.shownOnce')}</p>
            <p
              id="lock3-recovery-code"
              className="lock3-recovery-code"
              style={{ margin: '8px 0', fontFamily: 'var(--font-mono, monospace)', fontSize: 18, letterSpacing: '0.12em', userSelect: 'all' }}
            >
              {recoveryCode}
            </p>
            <div className="os-viz-row" style={{ gap: 8 }}>
              <button type="button" className="btn small" onClick={copyCode}>
                {copied ? t('lock3.settings.recovery.copied') : t('lock3.settings.recovery.copy')}
              </button>
              <button
                type="button"
                className="btn small primary"
                onClick={() => {
                  setRecoveryCode(null);
                  setCopied(false);
                }}
              >
                {t('lock3.settings.recovery.dismiss')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>
              {!hasPin
                ? t('lock3.settings.recovery.noPin')
                : hasRecovery
                  ? t('lock3.settings.recovery.have')
                  : t('lock3.settings.recovery.none')}
            </p>
            {hasPin && (
              <div className="os-viz-row" style={{ marginTop: 8, gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" className="btn small" onClick={newRecovery}>
                  {t('lock3.settings.recovery.new')}
                </button>
                <span className="muted" style={{ fontSize: 12 }}>{t('lock3.settings.recovery.usesCurrent')}</span>
              </div>
            )}
          </>
        )}
      </SettingsCard>

      <SettingsCard
        id="lockscreen-auto"
        title={t('lock3.settings.auto.title')}
        description={t('lock3.settings.auto.desc')}
        highlight={focusSettingId === 'lockscreen-auto'}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span>{t('lock3.settings.auto.idle')}</span>
          <select
            value={autoLock.idleMinutes}
            disabled={!hasPin}
            onChange={(e) => patchAutoLock({ idleMinutes: Number(e.target.value) })}
          >
            {AUTO_LOCK_IDLE_CHOICES.map((m) => (
              <option key={m} value={m}>
                {m === 0 ? t('lock3.settings.auto.never') : t('lock3.settings.auto.minutes', { count: m })}
              </option>
            ))}
          </select>
        </label>
        <p className="muted" style={NOTE_STYLE}>{t('lock3.settings.auto.idleNote')}</p>
        <label className="os-check-row" style={{ marginTop: 8 }}>
          <input
            type="checkbox"
            checked={autoLock.onSleep}
            disabled={!hasPin}
            onChange={(e) => patchAutoLock({ onSleep: e.target.checked })}
          />
          <span>{t('lock3.settings.auto.sleep')}</span>
        </label>
        <label className="os-check-row">
          <input
            type="checkbox"
            checked={autoLock.onScreenLock}
            disabled={!hasPin}
            onChange={(e) => patchAutoLock({ onScreenLock: e.target.checked })}
          />
          <span>{t('lock3.settings.auto.screenLock')}</span>
        </label>
        {!hasPin && <p className="muted" style={NOTE_STYLE}>{t('settings.lock.needPinFirst')}</p>}
      </SettingsCard>

      <SettingsCard
        id="lockscreen-study"
        title={t('lock3.settings.study.title')}
        description={t('lock3.settings.study.desc')}
        highlight={focusSettingId === 'lockscreen-study'}
      >
        <div className="os-viz-row" role="group" aria-label={t('lock3.settings.study.title')}>
          {(
            [
              ['off', 'lock3.settings.study.off'],
              ['count', 'lock3.settings.study.count'],
              ['card', 'lock3.settings.study.card'],
            ] as const
          ).map(([id, labelKey]) => (
            <button
              key={id}
              type="button"
              {...seg(cfg.study === id)}
              onClick={() => setCfg(saveLockscreen({ study: id as LockscreenStudyMode }))}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
        <label className="os-check-row" style={{ marginTop: 10 }}>
          <input
            type="checkbox"
            checked={cfg.answerToUnlock}
            onChange={(e) => setCfg(saveLockscreen({ answerToUnlock: e.target.checked }))}
          />
          <span>{t('lock3.settings.study.answer')}</span>
        </label>
        <p className="muted" style={NOTE_STYLE}>{t('lock3.settings.study.answerNote')}</p>
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
          <p className="muted" style={NOTE_STYLE}>
            {t('settings.lock.tint.autoHint')}
          </p>
        )}
      </SettingsCard>
    </>
  );
}
