import { useEffect, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { ProfileSettingsSection, DictionarySettingsSection } from '../../../views/SettingsView';
import { useSettings } from '../SettingsContext';
import { loadFocusMode, onFocusModeChanged, setFocusMode } from '../../../focusMode';

export default function StudyPage() {
  const { focusSettingId } = useSettings();
  const [focus, setFocus] = useState(loadFocusMode);

  useEffect(() => onFocusModeChanged(setFocus), []);

  return (
    <>
      <SettingsCard
        id="focus-mode"
        title="Focus mode"
        description="Hide the desktop, particles, and widgets. Keep library, reader, dictionary, Anki, and a simple music bar."
        highlight={focusSettingId === 'focus-mode'}
        trailing={
          <label className="os-toggle os-toggle-compact">
            <input
              type="checkbox"
              checked={focus}
              onChange={(e) => setFocusMode(e.target.checked)}
              aria-label="Enable focus mode"
            />
            <span>{focus ? 'On' : 'Off'}</span>
          </label>
        }
      >
        <p className="muted os-set-hint">
          Shortcut: <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>E</kbd>. Exit anytime with the same shortcut or Exit focus.
          Living desktop settings are kept and restore when you leave focus mode.
        </p>
      </SettingsCard>
      <SettingsCard
        id="profile"
        title="Study profile"
        description="Switch or create profiles for different study goals."
        highlight={focusSettingId === 'profile'}
      >
        <ProfileSettingsSection />
      </SettingsCard>
      <SettingsCard
        id="dictionary"
        title="Dictionary"
        description="Installed dictionaries and Yomitan packs."
        highlight={focusSettingId === 'dictionary'}
      >
        <DictionarySettingsSection />
      </SettingsCard>
    </>
  );
}
