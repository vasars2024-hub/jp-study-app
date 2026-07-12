import { useEffect, useMemo, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import Icon, { type IconName } from '../../Icons';
import {
  MINI_APP_CATALOG,
  MINI_MAX_APPS,
  MINI_MIN_APPS,
  setMiniModeEnabled,
  addMiniApp,
  removeMiniApp,
  moveMiniApp,
  availableMiniApps,
  miniAppLabel,
  type MiniAppId,
  type MiniDensity,
  type MiniThemeTint,
  type MiniWallpaperMode,
} from '../../../miniMode';

function MiniWallPreview({ path, blur }: { path: string; blur: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let dead = false;
    void window.api.imageFileUrl(path).then((url) => {
      if (!dead && url) setSrc(url);
    });
    return () => {
      dead = true;
    };
  }, [path]);
  if (!src) return null;
  return (
    <div className="mini-wall-preview" title="Preview">
      <img
        src={src}
        alt=""
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          filter: blur > 0 ? `blur(${Math.min(12, blur / 3)}px)` : undefined,
          transform: blur > 0 ? 'scale(1.05)' : undefined,
        }}
      />
    </div>
  );
}

export default function MiniModePage() {
  const { mini, patchMini, focusSettingId } = useSettings();
  const [addPick, setAddPick] = useState<MiniAppId | ''>('');
  const [note, setNote] = useState('');

  const choices = useMemo(() => availableMiniApps(mini.apps), [mini.apps]);
  const pick = addPick && choices.some((c) => c.id === addPick) ? addPick : choices[0]?.id ?? '';

  const flash = (t: string) => {
    setNote(t);
    window.setTimeout(() => setNote(''), 2200);
  };

  const onAdd = (id?: MiniAppId) => {
    const target = id ?? (pick as MiniAppId | undefined);
    if (!target) {
      flash('No more apps to add.');
      return;
    }
    const next = addMiniApp(mini.apps, target);
    if (!next) {
      flash(mini.apps.length >= MINI_MAX_APPS ? `Maximum ${MINI_MAX_APPS} apps.` : 'Already pinned.');
      return;
    }
    patchMini({ apps: next });
    flash(`Added ${miniAppLabel(target)}`);
  };

  const onRemove = (id: MiniAppId) => {
    const next = removeMiniApp(mini.apps, id);
    if (!next) {
      flash(`Keep at least ${MINI_MIN_APPS} apps.`);
      return;
    }
    patchMini({ apps: next });
    flash(`Removed ${miniAppLabel(id)}`);
  };

  return (
    <>
      <SettingsCard
        id="mini-enable"
        title="Mini View"
        description="A locked mini craft window (3×3 slots). Apps open inside that frame only — they cannot float free. Resize scales the whole window, not width/height separately."
        highlight={focusSettingId === 'mini-enable'}
      >
        <label className="os-check-row">
          <input
            type="checkbox"
            checked={mini.enabled}
            onChange={(e) => {
              const on = e.target.checked;
              patchMini({ enabled: on });
              setMiniModeEnabled(on);
            }}
          />
          <span>Use Mini View (applies immediately)</span>
        </label>
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.45 }}>
          Startup follows this toggle: when on, the app boots into Mini instead of the full desktop.
        </p>
        <div className="os-viz-row" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn small primary"
            onClick={() => {
              patchMini({ enabled: true });
              setMiniModeEnabled(true);
            }}
          >
            Enter Mini now
          </button>
          <button
            type="button"
            className="btn small"
            disabled={!mini.enabled}
            onClick={() => {
              patchMini({ enabled: false });
              setMiniModeEnabled(false);
            }}
          >
            Exit to full desktop
          </button>
        </div>
      </SettingsCard>

      <SettingsCard
        id="mini-apps"
        title={`Pinned apps (${mini.apps.length}/${MINI_MAX_APPS})`}
        description={`Choose ${MINI_MIN_APPS}–${MINI_MAX_APPS} apps. Use Add app to pin Anki, Library, Dictionary, and more.`}
        highlight={focusSettingId === 'mini-apps'}
      >
        <div className="mini-add-box mini-add-box-settings">
          <span className="muted" style={{ fontSize: 12 }}>
            Add app
          </span>
          <div className="mini-add-row">
            <select
              className="mini-add-select"
              value={pick}
              disabled={!choices.length}
              onChange={(e) => setAddPick(e.target.value as MiniAppId)}
            >
              {!choices.length && <option value="">All apps pinned</option>}
              {choices.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn small primary"
              disabled={!choices.length || !pick}
              onClick={() => onAdd()}
            >
              Add app
            </button>
          </div>
          {choices.length > 0 && (
            <div className="mini-add-quick">
              {choices.map((a) => (
                <button key={a.id} type="button" className="btn small" onClick={() => onAdd(a.id)}>
                  <Icon name={a.icon as IconName} size={12} />
                  <span style={{ marginLeft: 4 }}>{a.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <ul className="mini-app-manage" style={{ marginTop: 12 }}>
          {mini.apps.map((id, i) => (
            <li key={id} className="mini-app-manage-row">
              <span className="mini-app-manage-name">
                <Icon
                  name={(MINI_APP_CATALOG.find((a) => a.id === id)?.icon ?? 'app') as IconName}
                  size={14}
                />{' '}
                <span className="muted">{i + 1}.</span> {miniAppLabel(id)}
              </span>
              <span className="mini-app-manage-acts">
                <button
                  type="button"
                  className="btn small"
                  disabled={i === 0}
                  onClick={() => patchMini({ apps: moveMiniApp(mini.apps, id, -1) })}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn small"
                  disabled={i === mini.apps.length - 1}
                  onClick={() => patchMini({ apps: moveMiniApp(mini.apps, id, 1) })}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn small"
                  disabled={mini.apps.length <= MINI_MIN_APPS}
                  onClick={() => onRemove(id)}
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
        {note && <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>{note}</p>}
      </SettingsCard>

      <SettingsCard
        id="mini-look"
        title="Mini look"
        description="Density, tint, clock, and auto-open — also editable from Mini’s own settings panel."
        highlight={focusSettingId === 'mini-look'}
      >
        <div className="os-viz-row">
          <span className="os-viz-label muted">Density</span>
          {(
            [
              ['compact', 'Compact'],
              ['comfortable', 'Comfort'],
              ['spacious', 'Spacious'],
            ] as [MiniDensity, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`btn small${mini.density === id ? ' primary' : ''}`}
              onClick={() => patchMini({ density: id })}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="os-viz-row">
          <span className="os-viz-label muted">Tint</span>
          {(
            [
              ['neutral', 'Neutral'],
              ['ember', 'Ember'],
              ['slate', 'Slate'],
              ['moss', 'Moss'],
            ] as [MiniThemeTint, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`btn small${mini.tint === id ? ' primary' : ''}`}
              onClick={() => patchMini({ tint: id })}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="os-check-row">
          <input
            type="checkbox"
            checked={mini.showClock}
            onChange={(e) => patchMini({ showClock: e.target.checked })}
          />
          <span>Show clock in Mini header</span>
        </label>
        <label className="os-check-row">
          <input
            type="checkbox"
            checked={mini.autoOpenFirst}
            onChange={(e) => patchMini({ autoOpenFirst: e.target.checked })}
          />
          <span>Auto-open first app when Mini starts</span>
        </label>
      </SettingsCard>

      <SettingsCard
        id="mini-wallpaper"
        title="Mini wallpaper"
        description="Backdrop behind the craft window. Use app-icon mosaic, a custom image, and blur for depth."
        highlight={focusSettingId === 'mini-wallpaper'}
      >
        <div className="os-viz-row">
          <span className="os-viz-label muted">Mode</span>
          {(
            [
              ['none', 'Off'],
              ['icons', 'App icons'],
              ['image', 'Image'],
            ] as [MiniWallpaperMode, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`btn small${mini.wallpaperMode === id ? ' primary' : ''}`}
              onClick={() => patchMini({ wallpaperMode: id })}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="os-viz-row" style={{ marginTop: 8 }}>
          <button
            type="button"
            className="btn small"
            onClick={() => {
              void (async () => {
                try {
                  let abs = await window.api.pickEnvImage();
                  if (!abs) {
                    const picked = await window.api.pickWallpaper();
                    if (!picked) return;
                    abs = picked.path;
                  }
                  const url =
                    (await window.api.imageFileUrl(abs)) ??
                    (await window.api.setWallpaperFromPath(abs));
                  if (!url) {
                    flash('Could not load image');
                    return;
                  }
                  patchMini({
                    wallpaperMode: 'image',
                    wallpaperPath: abs,
                    wallpaperUrl: url,
                  });
                  flash('Wallpaper set');
                } catch {
                  flash('Could not pick wallpaper');
                }
              })();
            }}
          >
            Pick image
          </button>
          <button
            type="button"
            className="btn small"
            disabled={!mini.wallpaperPath && mini.wallpaperMode !== 'image'}
            onClick={() => {
              patchMini({ wallpaperPath: '', wallpaperUrl: '', wallpaperMode: 'none' });
              flash('Wallpaper cleared');
            }}
          >
            Clear image
          </button>
        </div>
        {mini.wallpaperMode === 'image' && mini.wallpaperPath && (
          <MiniWallPreview path={mini.wallpaperPath} blur={mini.wallpaperBlur} />
        )}
        <div className="os-viz-row" style={{ marginTop: 10 }}>
          <span className="os-viz-label muted">Blur {mini.wallpaperBlur}px</span>
        </div>
        <input
          type="range"
          min={0}
          max={40}
          step={1}
          value={mini.wallpaperBlur}
          style={{ width: '100%', accentColor: 'var(--accent)' }}
          onChange={(e) => patchMini({ wallpaperBlur: Number(e.target.value) })}
        />
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.4 }}>
          App icons mode tiles your pinned Mini apps as the backdrop. Blur softens either wallpaper style.
        </p>
      </SettingsCard>
    </>
  );
}
