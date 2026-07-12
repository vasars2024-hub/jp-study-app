import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import type { IconSizeId, IconTextColorId, SnapGridId, StartColumnsId, TaskbarSizeId } from '../../../desktopPrefs';

export default function DesktopLayoutPage() {
  const { deskPrefs, patchDesk, seg, onReset, focusSettingId } = useSettings();

  return (
    <>
      <SettingsCard
        id="icons"
        title="Icons"
        description="Desktop icon size, labels, snap grid, and locking."
        highlight={focusSettingId === 'icons'}
      >
        <div className="os-viz-row">
          <span className="os-viz-label muted">Size</span>
          {([
            ['small', 'Small'],
            ['medium', 'Medium'],
            ['large', 'Large'],
          ] as [IconSizeId, string][]).map(([id, label]) => (
            <button key={id} type="button" className={seg(deskPrefs.iconSize === id)} onClick={() => patchDesk({ iconSize: id })}>
              {label}
            </button>
          ))}
        </div>
        <div className="os-viz-row">
          <span className="os-viz-label muted">Labels</span>
          <button type="button" className={seg(deskPrefs.iconLabel === 'always')} onClick={() => patchDesk({ iconLabel: 'always' })}>
            Always
          </button>
          <button type="button" className={seg(deskPrefs.iconLabel === 'hover')} onClick={() => patchDesk({ iconLabel: 'hover' })}>
            On hover
          </button>
        </div>
        <div className="os-viz-row">
          <span className="os-viz-label muted">Label colour</span>
          {([
            ['auto', 'Auto'],
            ['white', 'White'],
            ['black', 'Black'],
            ['accent', 'Accent'],
          ] as [IconTextColorId, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={seg(deskPrefs.iconTextColor === id)}
              onClick={() => patchDesk({ iconTextColor: id })}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="os-viz-row">
          <span className="os-viz-label muted">Snap grid</span>
          {([
            [12, '12 px'],
            [16, '16 px'],
            [24, '24 px'],
            [0, 'Free'],
          ] as [SnapGridId, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={seg(deskPrefs.snapGrid === id)}
              onClick={() => {
                patchDesk({ snapGrid: id });
                // Re-snap existing icons when a grid is chosen (Windows-like tidy).
                if (id > 0) {
                  window.dispatchEvent(new CustomEvent('desktop:resnap-icons', { detail: { grid: id } }));
                }
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="muted os-set-hint">
          Icons stick to this spacing while dragging. Choosing 12/16/24 also re-aligns icons already on the desk.
        </p>
        <label className="os-toggle">
          <input
            type="checkbox"
            checked={deskPrefs.singleClickOpen}
            onChange={(e) => patchDesk({ singleClickOpen: e.target.checked })}
          />
          <span>Single-click to open icons</span>
        </label>
        <label className="os-toggle">
          <input
            type="checkbox"
            checked={deskPrefs.iconsLocked}
            onChange={(e) => patchDesk({ iconsLocked: e.target.checked })}
          />
          <span>Lock icon positions</span>
        </label>
      </SettingsCard>

      <SettingsCard id="taskbar" title="Taskbar" description="Size and clock display." highlight={focusSettingId === 'taskbar'}>
        <div className="os-viz-row">
          <span className="os-viz-label muted">Size</span>
          {([
            ['compact', 'Compact'],
            ['normal', 'Normal'],
            ['large', 'Large'],
          ] as [TaskbarSizeId, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={seg(deskPrefs.taskbarSize === id)}
              onClick={() => patchDesk({ taskbarSize: id })}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="os-viz-row">
          <span className="os-viz-label muted">Clock</span>
          <button type="button" className={seg(!deskPrefs.clock24h)} onClick={() => patchDesk({ clock24h: false })}>
            12h
          </button>
          <button type="button" className={seg(deskPrefs.clock24h)} onClick={() => patchDesk({ clock24h: true })}>
            24h
          </button>
          <button
            type="button"
            className={seg(deskPrefs.clockSeconds)}
            onClick={() => patchDesk({ clockSeconds: !deskPrefs.clockSeconds })}
          >
            Seconds
          </button>
          <button
            type="button"
            className={seg(deskPrefs.clockShowDate)}
            onClick={() => patchDesk({ clockShowDate: !deskPrefs.clockShowDate })}
          >
            Date
          </button>
        </div>
      </SettingsCard>

      <SettingsCard id="start-menu" title="Start menu" description="Tile grid columns." highlight={focusSettingId === 'start-menu'}>
        <div className="os-viz-row">
          <span className="os-viz-label muted">Columns</span>
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
        title="Session"
        description="What comes back when you launch Study OS."
        highlight={focusSettingId === 'session'}
      >
        <label className="os-toggle">
          <input
            type="checkbox"
            checked={deskPrefs.restoreSessionWindows !== false}
            onChange={(e) => patchDesk({ restoreSessionWindows: e.target.checked })}
          />
          <span>Restore open app windows on launch</span>
        </label>
        <p className="muted os-set-hint">
          When off, icons, widgets, and wallpaper still restore — only floating app windows start closed.
        </p>
      </SettingsCard>

      <SettingsCard title="Reset desktop" description="Clears icons, windows, notes and widgets on this desktop.">
        <button type="button" className="btn" onClick={onReset}>
          Reset desktop layout & windows
        </button>
      </SettingsCard>
    </>
  );
}
