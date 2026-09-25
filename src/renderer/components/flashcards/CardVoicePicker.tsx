/**
 * Choose which installed offline voice reads Japanese cards.
 *
 * The point of the panel is the empty case. "No offline voice is installed for
 * ja-JP" was previously the whole of what a user got, with no way to see what
 * *was* installed or what to do about it. Here the machine's real inventory is
 * on screen, so a missing Japanese voice reads as a fact about this computer
 * rather than as a broken feature — and the advice is per-platform, because
 * installing one is a different act on each.
 */
import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import {
  voicesForLanguage,
  type FlashcardVoice,
  type FlashcardVoiceInventory,
} from '../../../shared/flashcardVoices';
import { loadVoicePreferences, saveVoicePreference } from '../../flashcardVoicePreference';
import { useT } from '../../i18n';
import './autoAudio.css';

/** Cards are Japanese by contract; the picker is scoped to that one language. */
const LANGUAGE = 'ja';

export default function CardVoicePicker() {
  const { t } = useT();
  const [inventory, setInventory] = useState<FlashcardVoiceInventory | null>(null);
  const [chosen, setChosen] = useState<string>(() => loadVoicePreferences()[LANGUAGE] ?? '');
  const [busy, setBusy] = useState(false);

  const read = useCallback(async (refresh: boolean): Promise<void> => {
    setBusy(true);
    try {
      setInventory(await window.api.flashcardListVoices(refresh));
    } catch (error) {
      // A channel an older main process does not answer is an unreadable
      // inventory, not an empty one, and must not read as "no voices".
      setInventory({
        ok: false,
        voices: [],
        platform: 'unknown',
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void read(false); }, [read]);

  const change = (event: ChangeEvent<HTMLSelectElement>): void => {
    const value = event.currentTarget.value;
    saveVoicePreference(LANGUAGE, value);
    setChosen(value);
  };

  const japanese: FlashcardVoice[] = inventory
    ? voicesForLanguage(inventory.voices, LANGUAGE)
    : [];
  const platformHintKey = inventory?.platform === 'win32'
    ? 'flash.voice.install.win32'
    : inventory?.platform === 'darwin'
      ? 'flash.voice.install.darwin'
      : 'flash.voice.install.linux';

  return (
    <fieldset className="auto-reading-options">
      <legend>{t('flash.voice.title')}</legend>
      <p className="muted">{t('flash.voice.lead')}</p>

      {inventory && inventory.ok && japanese.length > 0 && (
        <label className="auto-reading-options__form">
          {t('flash.voice.choose')}
          <select value={chosen} onChange={change}>
            <option value="">{t('flash.voice.systemDefault')}</option>
            {japanese.map((voice) => (
              <option key={voice.id} value={voice.id}>{voice.name}</option>
            ))}
          </select>
        </label>
      )}

      {inventory && inventory.ok && japanese.length === 0 && (
        <p className="auto-reading-options__report" aria-live="polite">
          {t('flash.voice.none', { count: inventory.voices.length })} {t(platformHintKey)}
        </p>
      )}

      {inventory && !inventory.ok && (
        <p className="auto-reading-options__report" aria-live="polite">
          {t('flash.voice.unreadable')}
        </p>
      )}

      <button className="btn" type="button" onClick={() => void read(true)} disabled={busy}>
        {busy ? t('flash.voice.reading') : t('flash.voice.rescan')}
      </button>
    </fieldset>
  );
}
