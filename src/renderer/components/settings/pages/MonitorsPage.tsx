/**
 * Physical-screen controls composed into Settings → Display & monitors:
 * which desktop each monitor hosts, and how that monitor renders it.
 *
 * The simulated-display control is the reason multi-monitor could be built and
 * checked on a one-monitor machine at all, so it is a first-class setting here
 * rather than a hidden debug flag.
 */
import { useEffect, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import { useT } from '../../../i18n';
import { confirmDialog } from '../../ui';
import type { DisplaySummary } from '../../../../main/displays';
import type { DisplayAssignment, TaskbarMode } from '../../../../shared/desktop';
import { getAssignments, onDesktopChanged } from '../../../desktopState';
import {
  loadDisplayPrefs,
  onDisplayPrefsChanged,
  saveDisplayPrefs,
  type DisplayPrefs,
} from '../../../displayPrefs';

const MAX_SIMULATED = 3;

export default function MonitorsPage() {
  const { t } = useT();
  const { seg, focusSettingId } = useSettings();
  const [displays, setDisplays] = useState<DisplaySummary[]>([]);
  const [assignments, setAssignments] = useState<DisplayAssignment[]>(getAssignments);
  const [virtualCount, setVirtualCount] = useState(0);
  const [prefs, setPrefs] = useState<DisplayPrefs>(loadDisplayPrefs);

  // DisplayPage's reset and edits in another window update this same store.
  useEffect(() => onDisplayPrefsChanged(setPrefs), []);

  useEffect(() => {
    const refresh = (): void => {
      void window.api.displayList().then(setDisplays);
      void window.api.displayGetVirtualCount().then(setVirtualCount);
    };
    refresh();
    return window.api.onDisplaysChanged(refresh);
  }, []);

  useEffect(() => {
    const sync = (): void => {
      setAssignments(getAssignments());
    };
    sync();
    return onDesktopChanged(sync);
  }, []);

  const assignmentFor = (key: string): DisplayAssignment | undefined =>
    assignments.find((a) => a.displayKey === key);

  const patch = (displayKey: string, next: Partial<DisplayAssignment>): void => {
    void window.api.deskwinSetOptions({ displayKey, ...next });
  };

  return (
    <>
      <SettingsCard
        id="monitors-list"
        title={t('settings.monitors.displays')}
        description={t('settings.monitors.displays.desc')}
        highlight={focusSettingId === 'monitors-list'}
      >
        {displays.length === 0 && <p className="muted os-set-hint">{t('settings.monitors.none')}</p>}
        <div className="os-monitors-list">
          {displays.map((display) => {
            const assignment = assignmentFor(display.key);
            const enabled = assignment?.enabled ?? display.primary;
            return (
              <div className="os-monitor-row" key={display.key}>
                {/* Proportional thumbnail, so the arrangement is recognisable
                    at a glance rather than a list of resolutions. */}
                <div
                  className="os-monitor-preview"
                  style={{
                    aspectRatio: `${Math.max(1, display.bounds.width)} / ${Math.max(1, display.bounds.height)}`,
                  }}
                  aria-hidden
                >
                  <span className="os-monitor-preview-label">
                    {display.bounds.width}×{display.bounds.height}
                  </span>
                </div>

                <div className="os-monitor-body">
                  <div className="os-monitor-title">
                    {display.label}
                    {display.primary && (
                      <span className="os-monitor-tag">{t('settings.monitors.primary')}</span>
                    )}
                    {display.virtual && (
                      <span className="os-monitor-tag os-monitor-tag-sim">
                        {t('settings.monitors.simulatedTag')}
                      </span>
                    )}
                  </div>
                  <div className="muted os-set-hint">
                    {/* A number, not `toFixed(2)` — see core.ts:62; a string skips Intl. */}
                    {t('settings.monitors.scaleLabel', {
                      scale: Math.round(display.scaleFactor * 100) / 100,
                    })}
                  </div>

                  <label className="os-toggle">
                    <input
                      type="checkbox"
                      checked={enabled}
                      disabled={display.primary}
                      onChange={(e) => patch(display.key, { enabled: e.target.checked })}
                    />
                    <span>
                      {display.primary
                        ? t('settings.monitors.enable.primary')
                        : t('settings.monitors.enable')}
                    </span>
                  </label>

                  {/* No "Hosts desktop" picker: the app has one desktop per screen today, so it
                      only offered a choice with nothing behind it. Assignments are still kept
                      (`deskwinAssign`) and the picker can come back with multi-desktop. */}
                  <div className="os-monitor-field">
                    <span>{t('settings.monitors.taskbar')}</span>
                    <div className="os-viz-row">
                      {(
                        [
                          ['full', 'settings.monitors.taskbar.full'],
                          ['windows-only', 'settings.monitors.taskbar.windowsOnly'],
                          ['none', 'settings.monitors.taskbar.none'],
                        ] as [TaskbarMode, string][]
                      ).map(([mode, labelKey]) => (
                        <button
                          key={mode}
                          type="button"
                          {...seg((assignment?.taskbar ?? 'full') === mode)}
                          onClick={() => patch(display.key, { taskbar: mode })}
                        >
                          {t(labelKey)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="os-toggle">
                    <input
                      type="checkbox"
                      checked={assignment?.showAllWindows === true}
                      onChange={(e) => patch(display.key, { showAllWindows: e.target.checked })}
                    />
                    <span>{t('settings.monitors.showAllWindows')}</span>
                  </label>

                  <label className="os-toggle">
                    <input
                      type="checkbox"
                      checked={assignment?.aero !== false}
                      onChange={(e) => patch(display.key, { aero: e.target.checked })}
                    />
                    <span>{t('settings.monitors.aero')}</span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </SettingsCard>

      <SettingsCard
        id="monitors-layout-remap"
        title={t('settings.monitors.remap')}
        description={t('settings.monitors.remap.desc')}
        highlight={focusSettingId === 'monitors-layout-remap'}
      >
        <label className="os-toggle">
          <input
            type="checkbox"
            checked={prefs.remapLayoutProportionally}
            onChange={(e) => setPrefs(saveDisplayPrefs({ remapLayoutProportionally: e.target.checked }))}
          />
          <span>{t('settings.monitors.remap.toggle')}</span>
        </label>
        <p className="muted os-set-hint">{t('settings.monitors.remap.hint')}</p>
      </SettingsCard>

      <SettingsCard
        id="monitors-simulated"
        title={t('settings.monitors.simulated')}
        description={t('settings.monitors.simulated.desc')}
        highlight={focusSettingId === 'monitors-simulated'}
      >
        <div className="os-viz-row">
          {Array.from({ length: MAX_SIMULATED + 1 }, (_, n) => (
            <button
              key={n}
              type="button"
              {...seg(virtualCount === n)}
              onClick={() => {
                void window.api.displaySetVirtualCount(n).then(() => {
                  setVirtualCount(n);
                  void window.api.deskwinSync();
                });
              }}
            >
              {n === 0 ? t('settings.monitors.simulated.off') : String(n)}
            </button>
          ))}
        </div>
        <p className="muted os-set-hint">{t('settings.monitors.simulated.hint')}</p>
      </SettingsCard>

      <SettingsCard
        id="monitors-reset"
        title={t('settings.monitors.reset')}
        description={t('settings.monitors.reset.desc')}
        highlight={focusSettingId === 'monitors-reset'}
      >
        <button
          type="button"
          className="os-btn"
          onClick={() => {
            // Throws away every desktop→monitor assignment the user has made, for every
            // display, in one click — and there is no undo. It sat next to two harmless
            // buttons with nothing to distinguish it.
            void (async () => {
              const ok = await confirmDialog({
                title: t('settings.monitors.reset'),
                message: t('settings.monitors.reset.confirm'),
                confirmLabel: t('settings.monitors.reset.action'),
                danger: true,
              });
              if (!ok) return;
              await window.api.desktopResetAssignments();
              await window.api.deskwinSync();
            })();
          }}
        >
          {t('settings.monitors.reset.action')}
        </button>
        <p className="muted os-set-hint">{t('settings.monitors.reset.hint')}</p>
      </SettingsCard>
    </>
  );
}
