import { useState } from 'react';
import { TELEMETRY_CONSENT_DECIDED_EVENT, TELEMETRY_CONSENT_KEY } from '../../shared/stats';
import { LANG_LABELS, LANG_TAGS, UI_LANGS } from '../../shared/i18n/core';
import { setUiLang, useT } from '../i18n';
import { sendTelemetryPingIfNeeded } from '../telemetryPing';

// First-launch, one-time consent for the anonymous download heat map. Shown once,
// before the desktop shell, only when no choice has been recorded yet. Styled to
// match BootScreen. The only thing "yes" does is send a single country ping; the
// aggregate /counts map is anonymous and fetched regardless of this choice.
//
// It is the very first screen a new user sees, before Settings is reachable, so it
// carries the UI-language picker (the same segmented control as Settings ▸
// Appearance). The switch is live, so the card re-renders in the chosen language
// before the user has to answer a question written in one they may not read.
export default function ConsentScreen() {
  const { t, lang } = useT();
  const [done, setDone] = useState(
    () => localStorage.getItem(TELEMETRY_CONSENT_KEY) != null,
  );

  if (done) return null;

  const choose = (consent: 'yes' | 'no') => {
    try {
      localStorage.setItem(TELEMETRY_CONSENT_KEY, consent);
      if (consent === 'yes') void sendTelemetryPingIfNeeded();
    } catch {
      /* storage unavailable — just dismiss */
    }
    setDone(true);
    // The first-boot tour waits for this card instead of opening on top of it.
    window.dispatchEvent(new Event(TELEMETRY_CONSENT_DECIDED_EVENT));
  };

  return (
    <div className="consent">
      <div className="consent-card">
        <div className="sp-seg consent-lang" role="group" aria-label={t('settings.language.title')}>
          {UI_LANGS.map((id) => (
            <button
              key={id}
              type="button"
              lang={LANG_TAGS[id]}
              className={`sp-seg-btn ${lang === id ? 'active' : ''}`}
              aria-pressed={lang === id}
              onClick={() => setUiLang(id)}
            >
              {LANG_LABELS[id]}
            </button>
          ))}
        </div>
        <div className="consent-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={40} height={40}>
            <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18" />
          </svg>
        </div>
        <h1>{t('consent.map.title')}</h1>
        <p>{t('consent.map.body')}</p>
        <ul className="consent-points">
          <li>{t('consent.map.point.country')}</li>
          <li>{t('consent.map.point.once')}</li>
          <li>{t('consent.map.point.settings')}</li>
        </ul>
        <div className="consent-actions">
          <button type="button" className="consent-yes" onClick={() => choose('yes')}>
            {t('consent.map.yes')}
          </button>
          <button type="button" className="consent-no" onClick={() => choose('no')}>
            {t('consent.map.no')}
          </button>
        </div>
      </div>
    </div>
  );
}
