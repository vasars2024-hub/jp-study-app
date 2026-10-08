import { useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import { useT } from '../../../i18n';
import { ankiOwnsScheduling, setAnkiOwnsScheduling } from '../../../ankiSchedulingOwner';

/** "Anki owns scheduling": end double scheduling of cards that also went to Anki. */
export default function AnkiSchedulingCard() {
  const { t } = useT();
  const { focusSettingId } = useSettings();
  const [on, setOn] = useState(ankiOwnsScheduling);
  return (
    <SettingsCard
      id="anki-owns-scheduling"
      title={t('polish.ankiOwns.title')}
      description={t('polish.ankiOwns.desc')}
      highlight={focusSettingId === 'anki-owns-scheduling'}
    >
      <label className="pl-field">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => {
            setAnkiOwnsScheduling(e.target.checked);
            setOn(e.target.checked);
          }}
        />
        <span>{t('polish.ankiOwns.toggle')}</span>
      </label>
      <p className="muted">{t('polish.ankiOwns.hint')}</p>
    </SettingsCard>
  );
}
