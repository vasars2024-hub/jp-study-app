import { useMemo, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import Icon, { type IconName } from '../../Icons';
import { useAeroMaterials } from '../../ui';
import {
  MINI_APP_CATALOG,
  MINI_MAX_APPS,
  MINI_MIN_APPS,
  MINI_MAX_ROUTINES,
  MINI_THEME_TINTS,
  MINI_TINT_KEY,
  MINI_DENSITY_KEY,
  setMiniModeEnabled,
  addMiniApp,
  removeMiniApp,
  moveMiniApp,
  addMiniRoutine,
  removeMiniRoutine,
  moveMiniRoutine,
  availableMiniApps,
  type MiniAppId,
  type MiniDensity,
  type MiniThemeTint,
} from '../../../miniMode';
import { offerableMiniRoutines, resolveMiniRoutines } from '../../../miniRoutines';
import { loadEnvironment } from '../../../environment/environmentStore';
import { useT } from '../../../i18n';


export default function MiniModePage() {
  const { t } = useT();
  const { mini, patchMini, focusSettingId } = useSettings();
  const aeroMini = useAeroMaterials();
  const [addPick, setAddPick] = useState<MiniAppId | ''>('');
  const [addRoutinePick, setAddRoutinePick] = useState('');
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

  const pinnedRoutines = useMemo(() => resolveMiniRoutines(mini.routines), [mini.routines]);
  const routineChoices = useMemo(() => {
    const pinned = new Set(mini.routines);
    return offerableMiniRoutines(loadEnvironment().companions ?? []).filter(
      (r) => !pinned.has(r.id),
    );
  }, [mini.routines]);
  const routinePick =
    addRoutinePick && routineChoices.some((r) => r.id === addRoutinePick)
      ? addRoutinePick
      : routineChoices[0]?.id ?? '';

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

  const onAddRoutine = (id: string) => {
    const next = addMiniRoutine(mini.routines, id);
    if (!next) {
      flash(t('settings.mini.msg.maxRoutines', { max: MINI_MAX_ROUTINES }));
      return;
    }
    patchMini({ routines: next });
    const def = routineChoices.find((r) => r.id === id);
    flash(t('settings.mini.msg.added', { name: def ? def.name : id }));
  };

  const onRemoveRoutine = (id: string) => {
    const def = pinnedRoutines.find((r) => r.id === id);
    patchMini({ routines: removeMiniRoutine(mini.routines, id) });
    flash(t('settings.mini.msg.removed', { name: def ? def.name : id }));
  };

  const tintLabel = (id: MiniThemeTint) => t(MINI_TINT_KEY[id]);

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
              aria-label={t('settings.mini.addApp')}
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
                  aria-label={t('common.moveItemUp', { name: appLabel(id) })}
                  disabled={i === 0}
                  onClick={() => patchMini({ apps: moveMiniApp(mini.apps, id, -1) })}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn small"
                  aria-label={t('common.moveItemDown', { name: appLabel(id) })}
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

      {/* v1.0 audit 3.5 — the same three slots are also bindable from the widget's
          own drawer (MiniShell), which is where they are clicked. */}
      <SettingsCard
        id="mini-routines"
        title={t('settings.mini.routines.title', {
          count: mini.routines.length,
          max: MINI_MAX_ROUTINES,
        })}
        description={t('settings.mini.routines.desc', { max: MINI_MAX_ROUTINES })}
        highlight={focusSettingId === 'mini-routines'}
      >
        <div className="mini-add-box mini-add-box-settings">
          <span className="muted" style={{ fontSize: 12 }}>
            {t('settings.mini.routines.add')}
          </span>
          <div className="mini-add-row">
            <select
              className="mini-add-select"
              aria-label={t('settings.mini.routines.add')}
              value={routinePick}
              disabled={!routineChoices.length}
              onChange={(e) => setAddRoutinePick(e.target.value)}
            >
              {!routineChoices.length && (
                <option value="">{t('settings.mini.routines.noneAvailable')}</option>
              )}
              {routineChoices.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn small primary"
              disabled={!routineChoices.length || !routinePick}
              onClick={() => onAddRoutine(routinePick)}
            >
              {t('settings.mini.routines.pin')}
            </button>
          </div>
        </div>

        <ul className="mini-app-manage" style={{ marginTop: 12 }}>
          {mini.routines.map((id, i) => {
            const def = pinnedRoutines.find((r) => r.id === id);
            return (
              <li key={id} className="mini-app-manage-row">
                <span className="mini-app-manage-name">
                  <Icon name="sparkle" size={14} /> <span className="muted">{i + 1}.</span>{' '}
                  {def ? def.name : id}
                </span>
                <span className="mini-app-manage-acts">
                  <button
                    type="button"
                    className="btn small"
                    aria-label={t('common.moveItemUp', { name: def ? def.name : id })}
                    disabled={i === 0}
                    onClick={() => patchMini({ routines: moveMiniRoutine(mini.routines, id, -1) })}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn small"
                    aria-label={t('common.moveItemDown', { name: def ? def.name : id })}
                    disabled={i === mini.routines.length - 1}
                    onClick={() => patchMini({ routines: moveMiniRoutine(mini.routines, id, 1) })}
                  >
                    ↓
                  </button>
                  <button type="button" className="btn small" onClick={() => onRemoveRoutine(id)}>
                    {t('settings.mini.remove')}
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
        {!mini.routines.length && (
          <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
            {t('settings.mini.routines.empty')}
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
          {(Object.entries(MINI_DENSITY_KEY) as [MiniDensity, string][]).map(([id, labelKey]) => (
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
      {/* v1.0 audit 1.3: the Mini wallpaper card moved to Settings > Wallpaper
          (MiniWallpaperCard.tsx), so every wallpaper surface lives on one page. */}
    </>
  );
}
