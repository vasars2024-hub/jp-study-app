/**
 * Settings > Special > Aero study mechanics: the switches for the Memory
 * Defragmenter, Vocabulary Update, balloon tips, the study screensaver and the
 * Welcome Center. Shown once Aero has been discovered; the mechanics
 * themselves only ever run under the Aero material.
 */
import { useEffect, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import { Toggle, useAeroMaterials } from '../../ui';
import { useT } from '../../../i18n';
import {
  BALLOON_INTERVALS,
  loadAeroMechSettings,
  onAeroMechSettingsChanged,
  openAeroMechApp,
  saveAeroMechSettings,
  type AeroMechSettings,
} from '../../../aeroMechanics/aeroMechSettings';
import { SCREENSAVER_MINUTES } from '../../../aeroMechanics/aeroMechLogic';

export default function AeroMechanicsCard() {
  const { t } = useT();
  const { seg, focusSettingId } = useSettings();
  const aero = useAeroMaterials();
  const [s, setS] = useState(loadAeroMechSettings);
  useEffect(() => onAeroMechSettingsChanged(setS), []);
  const save = (patch: Partial<AeroMechSettings>): void => setS(saveAeroMechSettings(patch));

  return (
    <SettingsCard
      id="aero-mechanics"
      title={t('aeroMech.settings.title')}
      description={t('aeroMech.settings.desc')}
      highlight={focusSettingId === 'aero-mechanics'}
    >
      <Toggle
        className="os-toggle"
        checked={s.defrag}
        onChange={(e) => save({ defrag: e.currentTarget.checked })}
        label={t('aeroMech.settings.defrag')}
      />
      <Toggle
        className="os-toggle"
        checked={s.updates}
        onChange={(e) => save({ updates: e.currentTarget.checked })}
        label={t('aeroMech.settings.updates')}
      />
      <Toggle
        className="os-toggle"
        checked={s.updateBalloon}
        disabled={!s.updates}
        onChange={(e) => save({ updateBalloon: e.currentTarget.checked })}
        label={t('aeroMech.settings.updateBalloon')}
      />
      <Toggle
        className="os-toggle"
        checked={s.balloons}
        onChange={(e) => save({ balloons: e.currentTarget.checked })}
        label={t('aeroMech.settings.balloons')}
      />
      <div className="os-viz-row" role="group" aria-label={t('aeroMech.settings.balloonInterval')}>
        <span className="os-viz-label muted">{t('aeroMech.settings.balloonInterval')}</span>
        {BALLOON_INTERVALS.map((min) => (
          <button
            key={min}
            type="button"
            disabled={!s.balloons}
            {...seg(s.balloonIntervalMin === min)}
            onClick={() => save({ balloonIntervalMin: min })}
          >
            {t('aeroMech.settings.minutes', { count: min })}
          </button>
        ))}
      </div>
      <Toggle
        className="os-toggle"
        checked={s.screensaver}
        onChange={(e) => save({ screensaver: e.currentTarget.checked })}
        label={t('aeroMech.settings.screensaver')}
      />
      <div className="os-viz-row" role="group" aria-label={t('aeroMech.settings.screensaverWait')}>
        <span className="os-viz-label muted">{t('aeroMech.settings.screensaverWait')}</span>
        {SCREENSAVER_MINUTES.map((min) => (
          <button
            key={min}
            type="button"
            disabled={!s.screensaver}
            {...seg(s.screensaverMinutes === min)}
            onClick={() => save({ screensaverMinutes: min })}
          >
            {min === 0 ? t('aeroMech.settings.never') : t('aeroMech.settings.minutes', { count: min })}
          </button>
        ))}
      </div>
      <Toggle
        className="os-toggle"
        checked={s.welcome}
        onChange={(e) => save({ welcome: e.currentTarget.checked })}
        label={t('aeroMech.settings.welcome')}
      />
      {aero ? (
        <div className="os-viz-row">
          <button type="button" className="btn small" disabled={!s.defrag} onClick={() => openAeroMechApp({ app: 'defrag' })}>
            {t('aeroMech.defrag.title')}
          </button>
          <button type="button" className="btn small" disabled={!s.updates} onClick={() => openAeroMechApp({ app: 'update' })}>
            {t('aeroMech.update.title')}
          </button>
          <button type="button" className="btn small" onClick={() => openAeroMechApp({ app: 'welcome' })}>
            {t('aeroMech.welcome.title')}
          </button>
        </div>
      ) : (
        <p className="muted os-set-hint">{t('aeroMech.settings.aeroOnly')}</p>
      )}
    </SettingsCard>
  );
}
