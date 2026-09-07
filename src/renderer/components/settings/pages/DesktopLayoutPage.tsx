import SettingsCard from '../SettingsCard';
import RecommendedIconsCard from './RecommendedIconsCard';
import { useSettings } from '../SettingsContext';
import type { IconSizeId, IconTextColorId, SnapGridId, StartColumnsId, TaskbarSizeId } from '../../../desktopPrefs';
import { useT } from '../../../i18n';

export default function DesktopLayoutPage() {
  const { t } = useT();
  const { deskPrefs, patchDesk, seg, onReset, focusSettingId } = useSettings();

  return (
    <>
      <SettingsCard
        id="icons"
        title={t('search.icons')}
        description={t('search.icons.desc')}
        highlight={focusSettingId === 'icons'}
      >
        <div className="os-viz-row">
          <span className="os-viz-label muted">{t('settings.desktop.label.size')}</span>
          {(
            [
              ['small', 'settings.desktop.size.small'],
              ['medium', 'settings.desktop.size.medium'],
              ['large', 'settings.desktop.size.large'],
            ] as [IconSizeId, string][]
          ).map(([id, labelKey]) => (
            <button
              key={id}
              type="button"
              className={seg(deskPrefs.iconSize === id)}
              onClick={() => patchDesk({ iconSize: id })}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
        <div className="os-viz-row">
          <span className="os-viz-label muted">{t('settings.desktop.label.labels')}</span>
          <button
            type="button"
            className={seg(deskPrefs.iconLabel === 'always')}
            onClick={() => patchDesk({ iconLabel: 'always' })}
          >
            {t('settings.desktop.labels.always')}
          </button>
          <button
            type="button"
            className={seg(deskPrefs.iconLabel === 'hover')}
            onClick={() => patchDesk({ iconLabel: 'hover' })}
          >
            {t('settings.desktop.labels.hover')}
          </button>
        </div>
        <div className="os-viz-row">
          <span className="os-viz-label muted">{t('settings.desktop.label.labelColour')}</span>
          {(
            [
              ['auto', 'settings.desktop.color.auto'],
              ['white', 'settings.desktop.color.white'],
              ['black', 'settings.desktop.color.black'],
              ['accent', 'settings.desktop.color.accent'],
            ] as [IconTextColorId, string][]
          ).map(([id, labelKey]) => (
            <button
              key={id}
              type="button"
              className={seg(deskPrefs.iconTextColor === id)}
              onClick={() => patchDesk({ iconTextColor: id })}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
        <div className="os-viz-row">
          <span className="os-viz-label muted">{t('settings.desktop.label.snapGrid')}</span>
          {(
            [
              [12, '12 px'],
              [16, '16 px'],
              [24, '24 px'],
              [0, null],
            ] as [SnapGridId, string | null][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={seg(deskPrefs.snapGrid === id)}
              onClick={() => {
                patchDesk({ snapGrid: id });
                if (id > 0) {
                  window.dispatchEvent(new CustomEvent('desktop:resnap-icons', { detail: { grid: id } }));
                }
              }}
            >
              {label ?? t('settings.desktop.snap.free')}
            </button>
          ))}
        </div>
        <p className="muted os-set-hint">{t('settings.desktop.snapHint')}</p>
        <label className="os-toggle">
          <input
            type="checkbox"
            checked={deskPrefs.singleClickOpen}
            onChange={(e) => patchDesk({ singleClickOpen: e.target.checked })}
          />
          <span>{t('settings.desktop.singleClick')}</span>
        </label>
        <label className="os-toggle">
          <input
            type="checkbox"
            checked={deskPrefs.iconsLocked}
            onChange={(e) => patchDesk({ iconsLocked: e.target.checked })}
          />
          <span>{t('settings.desktop.lockIcons')}</span>
        </label>
      </SettingsCard>

      <RecommendedIconsCard />

      <SettingsCard
        id="taskbar"
        title={t('search.taskbar')}
        description={t('search.taskbar.desc')}
        highlight={focusSettingId === 'taskbar'}
      >
        <div className="os-viz-row">
          <span className="os-viz-label muted">{t('settings.desktop.label.size')}</span>
          {(
            [
              ['compact', 'settings.desktop.taskbar.compact'],
              ['normal', 'settings.desktop.taskbar.normal'],
              ['large', 'settings.desktop.taskbar.large'],
            ] as [TaskbarSizeId, string][]
          ).map(([id, labelKey]) => (
            <button
              key={id}
              type="button"
              className={seg(deskPrefs.taskbarSize === id)}
              onClick={() => patchDesk({ taskbarSize: id })}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
        <div className="os-viz-row">
          <span className="os-viz-label muted">{t('settings.desktop.label.clock')}</span>
          <button
            type="button"
            className={seg(deskPrefs.clock24h === 'auto')}
            onClick={() => patchDesk({ clock24h: 'auto' })}
            title={t('settings.desktop.clock.autoHint')}
          >
            {t('settings.desktop.clock.auto')}
          </button>
          <button
            type="button"
            className={seg(deskPrefs.clock24h === false)}
            onClick={() => patchDesk({ clock24h: false })}
          >
            {t('settings.desktop.clock.h12')}
          </button>
          <button
            type="button"
            className={seg(deskPrefs.clock24h === true)}
            onClick={() => patchDesk({ clock24h: true })}
          >
            {t('settings.desktop.clock.h24')}
          </button>
          <button
            type="button"
            className={seg(deskPrefs.clockSeconds)}
            onClick={() => patchDesk({ clockSeconds: !deskPrefs.clockSeconds })}
          >
            {t('settings.desktop.clock.seconds')}
          </button>
          <button
            type="button"
            className={seg(deskPrefs.clockShowDate)}
            onClick={() => patchDesk({ clockShowDate: !deskPrefs.clockShowDate })}
          >
            {t('settings.desktop.clock.date')}
          </button>
        </div>
      </SettingsCard>

      <SettingsCard
        id="start-menu"
        title={t('search.startMenu')}
        description={t('search.startMenu.desc')}
        highlight={focusSettingId === 'start-menu'}
      >
        <div className="os-viz-row">
          <span className="os-viz-label muted">{t('settings.desktop.label.columns')}</span>
          {([3, 4, 5] as StartColumnsId[]).map((n) => (
            <button
              key={n}
              type="button"
              className={seg(deskPrefs.startColumns === n)}
              onClick={() => patchDesk({ startColumns: n })}
            >
              {n}
            </button>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard
        id="session"
        title={t('search.session')}
        description={t('search.session.desc')}
        highlight={focusSettingId === 'session'}
      >
        <label className="os-toggle">
          <input
            type="checkbox"
            checked={deskPrefs.restoreSessionWindows !== false}
            onChange={(e) => patchDesk({ restoreSessionWindows: e.target.checked })}
          />
          <span>{t('settings.desktop.restoreWindows')}</span>
        </label>
        <p className="muted os-set-hint">{t('settings.desktop.sessionHint')}</p>
      </SettingsCard>

      <SettingsCard id="desktop-reset" title={t('settings.desktop.reset.title')} description={t('settings.desktop.reset.desc')}>
        <button type="button" className="btn" onClick={onReset}>
          {t('settings.desktop.reset.button')}
        </button>
      </SettingsCard>
    </>
  );
}
