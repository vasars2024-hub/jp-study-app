import SettingsCard from '../SettingsCard';
import ShortcutSettings from '../../ShortcutSettings';
import { useSettings } from '../SettingsContext';

export default function ShortcutsPage() {
  const { focusSettingId } = useSettings();
  return (
    <SettingsCard
      id="shortcuts"
      title="Keyboard & mouse shortcuts"
      description="Rebind multi-key chords, mouse buttons, alternatives, and custom actions."
      highlight={focusSettingId === 'shortcuts'}
    >
      <div className="os-set-shortcuts-embed">
        <ShortcutSettings embedded />
      </div>
    </SettingsCard>
  );
}
