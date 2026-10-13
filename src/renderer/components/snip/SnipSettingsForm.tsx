import { useCallback, useEffect, useId, useState } from 'react';
import { useT } from '../../i18n';
import { Toggle } from '../ui/Toggle';
import GlobalChordRow from '../settings/GlobalChordRow';
import {
  normalizeSnipSettings,
  SNIP_MAX_WORDS_LIMIT,
  SNIP_SETTINGS_DEFAULTS,
  type SnipAnkiMode,
  type SnipSettings,
  type SnipStatus,
} from '../../../shared/snipToCards';
import './snip.css';

const DEFAULT_STATUS: SnipStatus = { ...SNIP_SETTINGS_DEFAULTS, watching: false, historyCount: 0, historyBytes: 0 };

const ANKI_MODES: readonly SnipAnkiMode[] = ['auto', 'on', 'off'];

/** Main's settings for Snip to cards, live (the tray and the hotkey change them too). */
export function useSnipStatus(): [SnipStatus, (patch: Partial<SnipSettings>) => Promise<void>] {
  const [status, setStatus] = useState<SnipStatus>(DEFAULT_STATUS);
  useEffect(() => {
    let alive = true;
    // Repaired on the way in: a stale or stubbed bridge must not leave fields undefined.
    const apply = (s: unknown): void => {
      if (!alive || !s || typeof s !== 'object') return;
      const r = s as Partial<SnipStatus>;
      setStatus({
        ...normalizeSnipSettings(r),
        watching: r.watching === true,
        historyCount: Number(r.historyCount) || 0,
        historyBytes: Number(r.historyBytes) || 0,
      });
    };
    Promise.resolve(window.api?.snipGetStatus?.()).then(apply).catch(() => undefined);
    const off = window.api?.onSnipSettingsChanged?.(apply);
    return () => {
      alive = false;
      if (typeof off === 'function') off();
    };
  }, []);
  const save = useCallback(async (patch: Partial<SnipSettings>) => {
    try {
      setStatus(await window.api.snipSetSettings(patch));
    } catch {
      /* main refused: the controls keep showing what is stored */
    }
  }, []);
  return [status, save];
}

/**
 * The Snip to cards options: on/off, automatic adding (off = review mode),
 * merging into existing cards, Anki, the deck, the per-snip word limit and
 * whether the analysis comes forward on a snip. Shown
 * in Settings → Reading Lens and inside the Snips view itself.
 */
export default function SnipSettingsForm({ showShortcut = true }: { showShortcut?: boolean }) {
  const { t } = useT();
  const [status, save] = useSnipStatus();
  const [deck, setDeck] = useState(status.deck);
  const [ankiDeck, setAnkiDeck] = useState(status.ankiDeck);
  const [maxWords, setMaxWords] = useState(String(status.maxWords));
  const ids = useId();

  useEffect(() => setDeck(status.deck), [status.deck]);
  useEffect(() => setAnkiDeck(status.ankiDeck), [status.ankiDeck]);
  useEffect(() => setMaxWords(String(status.maxWords)), [status.maxWords]);

  return (
    <div className="snip-settings">
      <Toggle
        className="os-toggle os-toggle-compact"
        checked={status.enabled}
        onChange={(e) => void save({ enabled: e.target.checked })}
        label={t('snip.settings.enable')}
      />
      <p className="muted os-set-hint">{t('snip.settings.enableHint')}</p>
      <Toggle
        className="os-toggle os-toggle-compact"
        checked={status.autoAdd}
        onChange={(e) => void save({ autoAdd: e.target.checked })}
        label={t('snip.settings.autoAdd')}
      />
      <p className="muted os-set-hint">{t('snip2.settings.autoAddHint')}</p>
      <Toggle
        className="os-toggle os-toggle-compact"
        checked={status.mergeExisting}
        onChange={(e) => void save({ mergeExisting: e.target.checked })}
        label={t('snip2.settings.mergeExisting')}
      />
      <Toggle
        className="os-toggle os-toggle-compact"
        checked={status.openView}
        onChange={(e) => void save({ openView: e.target.checked })}
        label={t('snip.settings.openView')}
      />
      <div className="snip-settings-grid">
        <label htmlFor={`${ids}-anki`}>{t('snip.settings.anki')}</label>
        <select
          id={`${ids}-anki`}
          className="ui-select"
          value={status.sendToAnki}
          onChange={(e) => void save({ sendToAnki: e.target.value as SnipAnkiMode })}
        >
          {ANKI_MODES.map((mode) => (
            <option key={mode} value={mode}>{t(`snip.settings.anki.${mode}`)}</option>
          ))}
        </select>

        <label htmlFor={`${ids}-deck`}>{t('snip.settings.deck')}</label>
        <input
          id={`${ids}-deck`}
          className="ui-input"
          value={deck}
          onChange={(e) => setDeck(e.target.value)}
          onBlur={() => {
            if (deck.trim() !== status.deck) void save({ deck: deck.trim() });
          }}
        />

        <label htmlFor={`${ids}-ankiDeck`}>{t('snip.settings.ankiDeck')}</label>
        <input
          id={`${ids}-ankiDeck`}
          className="ui-input"
          value={ankiDeck}
          placeholder={t('snip.settings.ankiDeckPlaceholder')}
          disabled={status.sendToAnki === 'off'}
          onChange={(e) => setAnkiDeck(e.target.value)}
          onBlur={() => {
            if (ankiDeck.trim() !== status.ankiDeck) void save({ ankiDeck: ankiDeck.trim() });
          }}
        />

        <label htmlFor={`${ids}-max`}>{t('snip.settings.maxWords')}</label>
        <input
          id={`${ids}-max`}
          className="ui-input snip-settings-number"
          type="number"
          min={1}
          max={SNIP_MAX_WORDS_LIMIT}
          value={maxWords}
          onChange={(e) => setMaxWords(e.target.value)}
          onBlur={() => {
            const n = Number(maxWords);
            if (Number.isFinite(n) && n !== status.maxWords) void save({ maxWords: n });
            else setMaxWords(String(status.maxWords));
          }}
        />
      </div>
      {showShortcut && <GlobalChordRow commandId="snip.toggle" label={t('cmd.snip.toggle')} />}
    </div>
  );
}
