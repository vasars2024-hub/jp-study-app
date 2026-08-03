import { useEffect, useMemo, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import Icon, { type IconName } from '../../Icons';
import { useAeroMaterials } from '../../ui';
import {
  MINI_APP_CATALOG,
  MINI_MAX_APPS,
  MINI_MIN_APPS,
  MINI_THEME_TINTS,
  setMiniModeEnabled,
  addMiniApp,
  removeMiniApp,
  moveMiniApp,
  availableMiniApps,
  type MiniAppId,
  type MiniDensity,
  type MiniThemeTint,
  type MiniWallpaperMode,
} from '../../../miniMode';
import { useT } from '../../../i18n';

const TINT_KEY: Partial<Record<MiniThemeTint, string>> = {
  neutral: 'settings.lock.tint.neutral',
  ember: 'settings.lock.tint.ember',
  slate: 'settings.lock.tint.slate',
  moss: 'settings.lock.tint.moss',
  ocean: 'settings.mini.tint.ocean',
  violet: 'settings.mini.tint.violet',
  sand: 'settings.mini.tint.sand',
  crimson: 'settings.mini.tint.crimson',
  frost: 'settings.mini.tint.frost',
};

function MiniWallPreview({ path, blur, title }: { path: string; blur: number; title: string }) {
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
    <div className="mini-wall-preview" title={title}>
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
  const { t } = useT();
  const { mini, patchMini, focusSettingId } = useSettings();
  const aeroMini = useAeroMaterials();
  const [addPick, setAddPick] = useState<MiniAppId | ''>('');
  const [note, setNote] = useState('');

  const appLabel = (id: MiniAppId): string => {
    if (id === 'musicwidget') return t('settings.mini.app.musicwidget');
    if (id === 'clipboard') return t('settings.mini.app.clipboard');
    const key = `palette.section.${id === 'player' ? 'player' : id}`;
    const out = t(key);
    if (out !== key) return out;
    return MINI_APP_CATALOG.find((a) => a.id === id)?.label ?? id;
  };

  const choices = useMemo(() => availableMiniApps(mini.apps), [mini.apps]);
  const pick = addPick && choices.some((c) => c.id === addPick) ? addPick : choices[0]?.id ?? '';

  const flash = (text: string) => {
    setNote(text);
    window.setTimeout(() => setNote(''), 2200);
  };

  const onAdd = (id?: MiniAppId) => {
    const target = id ?? (pick as MiniAppId | undefined);
    if (!target) {
      flash(t('settings.mini.msg.noMore'));
      return;
    }
    const next = addMiniApp(mini.apps, target);
    if (!next) {
      flash(
        mini.apps.length >= MINI_MAX_APPS
          ? t('settings.mini.msg.maxApps', { max: MINI_MAX_APPS })
          : t('settings.mini.msg.already'),
      );
      return;
    }
    patchMini({ apps: next });
    flash(t('settings.mini.msg.added', { name: appLabel(target) }));
  };

  const onRemove = (id: MiniAppId) => {
    const next = removeMiniApp(mini.apps, id);
    if (!next) {
      flash(t('settings.mini.msg.minApps', { min: MINI_MIN_APPS }));
      return;
    }
    patchMini({ apps: next });
    flash(t('settings.mini.msg.removed', { name: appLabel(id) }));
  };

  const tintLabel = (id: MiniThemeTint) => {
    const key = TINT_KEY[id];
    return key ? t(key) : id.charAt(0).toUpperCase() + id.slice(1);
  };

  return (
    <>
      <SettingsCard
        id="mini-enable"
        title={t('settings.mini.enable.title')}
        description={t('settings.mini.enable.desc')}
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
          <span>{t('settings.mini.useToggle')}</span>
        </label>
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.45 }}>
          {t('settings.mini.startupHint')}
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
            {t('settings.mini.enterNow')}
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
            {t('settings.mini.exitDesktop')}
          </button>
        </div>
      </SettingsCard>

      <SettingsCard
        id="mini-apps"
        title={t('settings.mini.pinnedTitle', { count: mini.apps.length, max: MINI_MAX_APPS })}
        description={t('settings.mini.pinnedDesc', { min: MINI_MIN_APPS, max: MINI_MAX_APPS })}
        highlight={focusSettingId === 'mini-apps'}
      >
        <div className="mini-add-box mini-add-box-settings">
          <span className="muted" style={{ fontSize: 12 }}>
            {t('settings.mini.addApp')}
          </span>
          <div className="mini-add-row">
            <select
              className="mini-add-select"
              value={pick}
              disabled={!choices.length}
              onChange={(e) => setAddPick(e.target.value as MiniAppId)}
            >
              {!choices.length && <option value="">{t('settings.mini.allPinned')}</option>}
              {choices.map((a) => (
                <option key={a.id} value={a.id}>
                  {appLabel(a.id)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn small primary"
              disabled={!choices.length || !pick}
              onClick={() => onAdd()}
            >
              {t('settings.mini.addApp')}
            </button>
          </div>
          {choices.length > 0 && (
            <div className="mini-add-quick">
              {choices.map((a) => (
                <button key={a.id} type="button" className="btn small" onClick={() => onAdd(a.id)}>
                  <Icon name={a.icon as IconName} size={12} />
                  <span style={{ marginLeft: 4 }}>{appLabel(a.id)}</span>
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
                <span className="muted">{i + 1}.</span> {appLabel(id)}
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
                  {t('settings.mini.remove')}
                </button>
              </span>
            </li>
          ))}
        </ul>
        {note && (
          <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
            {note}
          </p>
        )}
      </SettingsCard>

      <SettingsCard
        id="mini-look"
        title={t('settings.mini.look.title')}
        description={t('settings.mini.look.desc')}
        highlight={focusSettingId === 'mini-look'}
      >
        <div className="os-viz-row">
          <span className="os-viz-label muted">{t('settings.mini.label.density')}</span>
          {(
            [
              ['compact', 'settings.appearance.density.compact'],
              ['comfortable', 'settings.mini.density.comfortable'],
              ['spacious', 'settings.appearance.density.spacious'],
            ] as [MiniDensity, string][]
          ).map(([id, labelKey]) => (
            <button
              key={id}
              type="button"
              className={`btn small${mini.density === id ? ' primary' : ''}`}
              onClick={() => patchMini({ density: id })}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
        <div className="os-viz-row" style={{ flexWrap: 'wrap' }}>
          <span className="os-viz-label muted">{t('settings.mini.label.tint')}</span>
          {MINI_THEME_TINTS.map((id) => (
            <button
              key={id}
              type="button"
              className={`btn small${mini.tint === id ? ' primary' : ''}`}
              onClick={() => patchMini({ tint: id })}
              title={tintLabel(id)}
            >
              {tintLabel(id)}
            </button>
          ))}
        </div>
        <label className="os-check-row">
          <input
            type="checkbox"
            checked={mini.showClock}
            onChange={(e) => patchMini({ showClock: e.target.checked })}
          />
          <span>{t('settings.mini.showClock')}</span>
        </label>
        <label className="os-check-row">
          <input
            type="checkbox"
            checked={mini.autoOpenFirst}
            onChange={(e) => patchMini({ autoOpenFirst: e.target.checked })}
          />
          <span>{t('settings.mini.autoOpenFirst')}</span>
        </label>
        {!aeroMini && (
          <label className="os-check-row">
            <input
              type="checkbox"
              checked={mini.monoMode}
              onChange={(e) => patchMini({ monoMode: e.target.checked })}
            />
            <span>{t('settings.mini.monoMode')}</span>
          </label>
        )}
      </SettingsCard>

      <SettingsCard
        id="mini-wallpaper"
        title={t('settings.mini.wall.title')}
        description={t('settings.mini.wall.desc')}
        highlight={focusSettingId === 'mini-wallpaper'}
      >
        <div className="os-viz-row" style={{ flexWrap: 'wrap' }}>
          <span className="os-viz-label muted">{t('settings.mini.wall.mode')}</span>
          {(
            [
              ['none', 'settings.mini.wall.off'],
              ['icons', 'settings.mini.wall.icons'],
              ['image', 'settings.mini.wall.image'],
              ['desktop', 'settings.mini.wall.desktop'],
            ] as [MiniWallpaperMode, string][]
          ).map(([id, labelKey]) => (
            <button
              key={id}
              type="button"
              className={`btn small${mini.wallpaperMode === id ? ' primary' : ''}`}
              onClick={() => patchMini({ wallpaperMode: id })}
            >
              {t(labelKey)}
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
                    flash(t('settings.mini.msg.loadFail'));
                    return;
                  }
                  patchMini({
                    wallpaperMode: 'image',
                    wallpaperPath: abs,
                    wallpaperUrl: url,
                  });
                  flash(t('settings.mini.msg.set'));
                } catch {
                  flash(t('settings.mini.msg.pickFail'));
                }
              })();
            }}
          >
            {t('settings.mini.wall.pick')}
          </button>
          <button
            type="button"
            className="btn small"
            disabled={!mini.wallpaperPath && mini.wallpaperMode !== 'image'}
            onClick={() => {
              patchMini({ wallpaperPath: '', wallpaperUrl: '', wallpaperMode: 'none' });
              flash(t('settings.mini.msg.cleared'));
            }}
          >
            {t('settings.mini.wall.clear')}
          </button>
        </div>
        {mini.wallpaperMode === 'image' && mini.wallpaperPath && (
          <MiniWallPreview path={mini.wallpaperPath} blur={mini.wallpaperBlur} title={t('settings.mini.preview')} />
        )}
        <div className="os-viz-row" style={{ marginTop: 10 }}>
          <span className="os-viz-label muted">{t('settings.mini.wall.blur', { px: mini.wallpaperBlur })}</span>
        </div>
        <input
          type="range"
          min={0}
          max={40}
          step={1}
          value={mini.wallpaperBlur}
          style={{ width: '100%', accentColor: 'var(--accent)' }}
          onChange={(e) => patchMini({ wallpaperBlur: Number(e.target.value) })}
          aria-label={t('a11y.slider.miniWallpaperBlur')}
        />
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.4 }}>
          {t('settings.mini.wall.hint')}
        </p>
      </SettingsCard>
    </>
  );
}
