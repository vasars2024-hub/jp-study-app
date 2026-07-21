import { useEffect, useState } from 'react';
import SettingsCard from '../SettingsCard';
import ShortcutSettings from '../../ShortcutSettings';
import { useSettings } from '../SettingsContext';
import { useT } from '../../../i18n';
import {
  GLOBAL_LOOKUP_TRIGGERS,
  isModifierTrigger,
  loadGlobalLookupSettings,
  onGlobalLookupChanged,
  saveGlobalLookupSettings,
  type GlobalLookupSettings,
} from '../../../globalLookupSettings';

export default function ShortcutsPage() {
  const { t } = useT();
  const { focusSettingId } = useSettings();
  const [lookup, setLookup] = useState<GlobalLookupSettings>(loadGlobalLookupSettings);

  // The toggle shortcut can flip this while the page is open.
  useEffect(() => onGlobalLookupChanged(setLookup), []);

  const update = (next: Partial<GlobalLookupSettings>) => setLookup(saveGlobalLookupSettings(next));

  return (
    <>
      <SettingsCard
        id="global-lookup"
        title={t('settings.dict.globalLookup')}
        description={t('settings.dict.globalLookupHint')}
        highlight={focusSettingId === 'global-lookup'}
      >
        <label className="pl-field">
          <span className="muted">{t('settings.dict.globalLookup')}</span>
          <select
            className="set-select"
            value={lookup.trigger}
            onChange={(e) => update({ trigger: e.target.value as GlobalLookupSettings['trigger'] })}
          >
            {GLOBAL_LOOKUP_TRIGGERS.map((trigger) => (
              <option key={trigger} value={trigger}>
                {t(`settings.dict.trigger.${trigger}`)}
              </option>
            ))}
          </select>
        </label>
        {lookup.trigger === 'click' && (
          <p className="muted">{t('settings.dict.trigger.clickHint')}</p>
        )}
        {isModifierTrigger(lookup.trigger) && (
          <>
            <label className="pl-field">
              <input
                type="checkbox"
                checked={lookup.inReaders}
                onChange={(e) => update({ inReaders: e.target.checked })}
              />
              <span>{t('settings.dict.inReaders')}</span>
            </label>
            <p className="muted">{t('settings.dict.inReadersHint')}</p>
          </>
        )}
      </SettingsCard>

      <SettingsCard
        id="shortcuts"
        title={t('search.shortcuts')}
        description={t('search.shortcuts.desc')}
        highlight={focusSettingId === 'shortcuts'}
      >
        <div className="os-set-shortcuts-embed">
          <ShortcutSettings embedded />
        </div>
      </SettingsCard>
    </>
  );
}
