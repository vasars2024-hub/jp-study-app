import SettingsCard from '../SettingsCard';
import ReaderSettingsPanel from '../../ReaderSettingsPanel';
import { useSettings } from '../SettingsContext';

export default function ReadingPage() {
  const { readerSettings, changeReaderSettings, focusSettingId } = useSettings();
  return (
    <SettingsCard
      id="reading"
      title="Reading"
      description="Default typography and layout for novels and books."
      highlight={focusSettingId === 'reading'}
    >
      <ReaderSettingsPanel
        settings={readerSettings}
        onChange={changeReaderSettings}
        embedded
      />
    </SettingsCard>
  );
}
