import SettingsCard from '../SettingsCard';
import ReadingRemindersCard from './ReadingRemindersCard';
import ReaderSettingsPanel from '../../ReaderSettingsPanel';
import { useSettings } from '../SettingsContext';
import { useT } from '../../../i18n';

export default function ReadingPage() {
  const { t } = useT();
  const { readerSettings, changeReaderSettings, focusSettingId } = useSettings();
  return (
    <>
      <SettingsCard
        id="reading"
        title={t('search.reading')}
        description={t('search.reading.desc')}
        highlight={focusSettingId === 'reading'}
      >
        <ReaderSettingsPanel
          settings={readerSettings}
          onChange={changeReaderSettings}
          embedded
        />
      </SettingsCard>
      {/* Reading Lists §11.3. Here rather than on its own page: it is reading
          behaviour, and a page nobody navigates to is a feature nobody enables. */}
      <ReadingRemindersCard />
    </>
  );
}
