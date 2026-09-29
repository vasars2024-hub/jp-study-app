/**
 * Full wallpaper playlist + rotation rules editor for Settings → Living atmosphere.
 */
import { useMemo, useState } from 'react';
import { alertDialog, confirmDialog, promptDialog } from './ui';
import {
  buildDefaultDayCyclePlaylist,
  buildDefaultRules,
  DAY_CYCLE_PLAYLIST_ID,
  SELECTABLE_WALL_PRESETS,
  WALL_PRESETS,
  type EnvironmentSettings,
  type RotationRule,
  type TransitionKind,
  type WallpaperItem,
  type WallpaperPlaylist,
} from '../environment';
import type { CalendarCategory } from '../environment/types';
import { seedPlaylistNameKey, seedWallpaperLabelKey } from '../environment/types';
import { useT } from '../i18n';

const CAL_CATS: CalendarCategory[] = ['exam', 'study', 'assignment', 'reminder', 'personal'];

function isDirectMediaRef(ref: string): boolean {
  return /^(app:|data:|blob:|file:|https?:|\/)/i.test(ref);
}

function itemSwatchStyle(it: WallpaperItem): { background?: string; backgroundImage?: string; backgroundSize?: string; backgroundPosition?: string } {
  if (it.kind === 'preset') {
    return { background: WALL_PRESETS.find((p) => p.id === it.ref)?.css ?? '#222' };
  }
  if (it.kind === 'image' && it.ref && isDirectMediaRef(it.ref)) {
    return {
      background: '#2a2830',
      backgroundImage: `url("${it.ref}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  return { background: '#2a2830' };
}

function itemLabel(it: WallpaperItem, t: (key: string) => string): string {
  // A built-in day-cycle slot still carrying its seed label is chrome, not content.
  const seedKey = seedWallpaperLabelKey(it);
  if (seedKey) return t(seedKey);
  return it.label || (it.kind === 'preset' ? WALL_PRESETS.find((p) => p.id === it.ref)?.label : null) || it.ref;
}

export default function PlaylistEditor({
  env,
  disabled,
  onChange,
}: {
  env: EnvironmentSettings;
  disabled?: boolean;
  onChange: (partial: Partial<EnvironmentSettings>) => void;
}) {
  const { t } = useT();
  const playlists = env.playlists?.length ? env.playlists : [buildDefaultDayCyclePlaylist()];
  const activeId = playlists.some((p) => p.id === env.activePlaylistId)
    ? env.activePlaylistId
    : playlists[0].id;
  const active = playlists.find((p) => p.id === activeId) ?? playlists[0];
  const rules = env.rules?.length ? env.rules : buildDefaultRules();
  const [renameDraft, setRenameDraft] = useState('');
  const [renaming, setRenaming] = useState(false);

  const patchPlaylists = (next: WallpaperPlaylist[]) => {
    const keepActive = next.some((p) => p.id === activeId) ? activeId : next[0]?.id ?? DAY_CYCLE_PLAYLIST_ID;
    onChange({ playlists: next, activePlaylistId: keepActive });
  };

  const updateActive = (patch: Partial<WallpaperPlaylist>) => {
    patchPlaylists(playlists.map((p) => (p.id === active.id ? { ...p, ...patch } : p)));
  };

  const setItems = (items: WallpaperItem[]) => updateActive({ items });

  const moveItem = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= active.items.length) return;
    const items = [...active.items];
    const t = items[index];
    items[index] = items[j];
    items[j] = t;
    setItems(items);
  };

  const addPreset = (presetId: string) => {
    const preset = WALL_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    if (active.items.some((i) => i.kind === 'preset' && i.ref === presetId)) return;
    setItems([
      ...active.items,
      {
        id: uid('wall'),
        kind: 'preset',
        ref: preset.id,
        label: preset.label,
        tags: preset.tags ? [...preset.tags] : undefined,
      },
    ]);
  };

  const addImage = async () => {
    try {
      const path = await window.api.pickEnvImage();
      if (path) {
        setItems([
          ...active.items,
          {
            id: uid('img'),
            kind: 'image',
            ref: path,
            label: path.split(/[/\\]/).pop() ?? 'Image',
            tags: ['custom'],
          },
        ]);
        return;
      }
    } catch {
      /* ignore */
    }
    try {
      const vid = await window.api.pickWallpaperVideo();
      if (vid?.path) {
        setItems([
          ...active.items,
          {
            id: uid('vid'),
            kind: 'video',
            ref: vid.path,
            label: vid.label || vid.path.split(/[/\\]/).pop() || 'Video',
            tags: ['custom'],
          },
        ]);
      }
    } catch {
      /* picker unavailable */
    }
  };

  const createPlaylist = async () => {
    const name = await promptDialog({
      title: t('playlistEditor.new.title'),
      message: t('playlistEditor.new.message'),
      // Not translated on purpose: a seed value the user immediately renames,
      // which the repo's i18n scope rule keeps out of the catalogs.
      defaultValue: 'My playlist',
    });
    if (!name?.trim()) return;
    const pl: WallpaperPlaylist = {
      id: uid('pl'),
      name: name.trim(),
      items: active.items.map((i) => ({ ...i, id: uid('wall') })),
      transition: active.transition,
      transitionMs: active.transitionMs,
    };
    onChange({ playlists: [...playlists, pl], activePlaylistId: pl.id });
  };

  const deletePlaylist = async () => {
    if (active.id === DAY_CYCLE_PLAYLIST_ID) {
      await alertDialog({
        title: t('playlistEditor.cannotDelete.title'),
        message: t('playlistEditor.cannotDelete.message'),
      });
      return;
    }
    const ok = await confirmDialog({
      title: t('playlistEditor.delete.title'),
      message: t('playlistEditor.delete.message', { name: active.name }),
      confirmLabel: t('playlistEditor.delete.confirm'),
      danger: true,
    });
    if (!ok) return;
    const next = playlists.filter((p) => p.id !== active.id);
    onChange({
      playlists: next.length ? next : [buildDefaultDayCyclePlaylist()],
      activePlaylistId: next[0]?.id ?? DAY_CYCLE_PLAYLIST_ID,
    });
  };

  const resetDayCycle = async () => {
    const ok = await confirmDialog({
      title: t('playlistEditor.reset.title'),
      message: t('playlistEditor.reset.message'),
      confirmLabel: t('playlistEditor.reset.confirm'),
      danger: true,
    });
    if (!ok) return;
    const def = buildDefaultDayCyclePlaylist();
    const others = playlists.filter((p) => p.id !== DAY_CYCLE_PLAYLIST_ID);
    onChange({
      playlists: [def, ...others],
      activePlaylistId: DAY_CYCLE_PLAYLIST_ID,
      rules: buildDefaultRules(),
    });
  };

  const commitRename = () => {
    const n = renameDraft.trim();
    if (n) updateActive({ name: n });
    setRenaming(false);
  };

  // Offer list uses the selection set; the render paths above stay on
  // WALL_PRESETS so an already-saved Aero item still resolves its label and css.
  const availablePresets = useMemo(
    () => SELECTABLE_WALL_PRESETS.filter((p) => !active.items.some((i) => i.kind === 'preset' && i.ref === p.id)),
    [active.items],
  );

  const updateRule = (id: string, patch: Partial<RotationRule>) => {
    onChange({
      rules: rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  };

  const addTimeRule = () => {
    const firstItem = active.items[0]?.id;
    if (!firstItem) return;
    onChange({
      rules: [
        ...rules,
        {
          id: uid('rule'),
          when: { type: 'timeOfDay', fromHour: 9, toHour: 17 },
          itemId: firstItem,
          priority: 10,
        },
      ],
    });
  };

  const addCalRule = () => {
    const firstItem = active.items[0]?.id;
    if (!firstItem) return;
    onChange({
      rules: [
        ...rules,
        {
          id: uid('rule'),
          when: { type: 'calendarCategory', category: 'study' },
          itemId: firstItem,
          priority: 30,
        },
      ],
    });
  };

  const removeRule = (id: string) => {
    onChange({ rules: rules.filter((r) => r.id !== id) });
  };

  const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);

  return (
    <div className={`pl-editor ${disabled ? 'is-disabled' : ''}`}>
      <div className="pl-toolbar">
        <label className="pl-field">
          <span className="muted">{t('playlistEditor.field.playlist')}</span>
          <select
            className="set-select"
            value={activeId}
            disabled={disabled}
            onChange={(e) => onChange({ activePlaylistId: e.target.value })}
          >
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {(() => {
                  const key = seedPlaylistNameKey(p);
                  return key ? t(key) : p.name;
                })()}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn small" disabled={disabled} onClick={createPlaylist}>
          {t('playlistEditor.action.new')}
        </button>
        <button
          type="button"
          className="btn small"
          disabled={disabled}
          onClick={() => {
            setRenameDraft(active.name);
            setRenaming(true);
          }}
        >
          {t('playlistEditor.action.rename')}
        </button>
        <button type="button" className="btn small" disabled={disabled} onClick={deletePlaylist}>
          {t('playlistEditor.action.delete')}
        </button>
        <button type="button" className="btn small" disabled={disabled} onClick={resetDayCycle}>
          {t('playlistEditor.action.resetDayCycle')}
        </button>
      </div>

      {renaming && (
        <div className="pl-rename">
          <input
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenaming(false);
            }}
            autoFocus
          />
          <button type="button" className="btn small primary" onClick={commitRename}>
            {t('common.save')}
          </button>
          <button type="button" className="btn small" onClick={() => setRenaming(false)}>
            {t('common.cancel')}
          </button>
        </div>
      )}

      <div className="os-viz-row">
        <span className="os-viz-label muted">{t('playlistEditor.field.transition')}</span>
        {(['crossfade', 'fade', 'cut'] as TransitionKind[]).map((id) => (
          <button
            key={id}
            type="button"
            className={`btn small ${active.transition === id ? 'primary' : ''}`}
            aria-pressed={active.transition === id}
            disabled={disabled}
            onClick={() => updateActive({ transition: id })}
          >
            {t(`playlistEditor.transition.${id}`)}
          </button>
        ))}
      </div>
      <div className="os-viz-row">
        <span className="os-viz-label muted">{t('playlistEditor.field.duration')}</span>
        <input
          type="range"
          min={200}
          max={3000}
          step={100}
          value={active.transitionMs}
          disabled={disabled}
          onChange={(e) => updateActive({ transitionMs: Number(e.target.value) })}
          aria-label={t('a11y.slider.transitionDuration')}
        />
        <span className="muted">{active.transitionMs}ms</span>
      </div>

      <p className="muted os-set-hint pl-section-title">{t('playlistEditor.walls.title')}</p>
      <ul className="pl-items">
        {active.items.map((it, index) => (
          <li key={it.id} className="pl-item">
            <div
              className="pl-swatch"
              style={itemSwatchStyle(it)}
              title={t(`playlistEditor.wallKind.${it.kind}`)}
            />
            <div className="pl-item-meta">
              <span className="pl-item-name">{itemLabel(it, t)}</span>
              <span className="muted pl-item-sub">
                {t(`playlistEditor.wallKind.${it.kind}`)}
                {it.tags?.length ? ` · ${it.tags.join(', ')}` : ''}
              </span>
            </div>
            <div className="pl-item-actions">
              <button
                type="button"
                className="btn small"
                disabled={disabled || index === 0}
                title={t('playlistEditor.action.moveUp')}
                onClick={() => moveItem(index, -1)}
              >
                {t('playlistEditor.action.up')}
              </button>
              <button
                type="button"
                className="btn small"
                disabled={disabled || index >= active.items.length - 1}
                title={t('playlistEditor.action.moveDown')}
                onClick={() => moveItem(index, 1)}
              >
                {t('playlistEditor.action.down')}
              </button>
              <button
                type="button"
                className="btn small"
                disabled={disabled}
                onClick={() => setItems(active.items.filter((x) => x.id !== it.id))}
              >
                {t('common.remove')}
              </button>
            </div>
          </li>
        ))}
        {!active.items.length && <li className="muted pl-empty">{t('playlistEditor.walls.empty')}</li>}
      </ul>

      <div className="pl-add-row">
        <label className="pl-field grow">
          <span className="muted">{t('playlistEditor.walls.addPreset')}</span>
          <select
            className="set-select"
            disabled={disabled || !availablePresets.length}
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                addPreset(e.target.value);
                e.target.value = '';
              }
            }}
          >
            <option value="">{t(availablePresets.length ? 'playlistEditor.walls.choosePreset' : 'playlistEditor.walls.allAdded')}</option>
            {availablePresets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn small" disabled={disabled} onClick={() => void addImage()}>
          {t('playlistEditor.walls.addMedia')}
        </button>
      </div>

      <p className="muted os-set-hint pl-section-title">{t('playlistEditor.rules.title')}</p>
      <p className="muted os-set-hint">
        {t('playlistEditor.rules.hint')}
      </p>
      <ul className="pl-rules">
        {sortedRules.map((r) => {
          const itemOk = active.items.some((i) => i.id === r.itemId);
          return (
            <li key={r.id} className={`pl-rule ${itemOk ? '' : 'pl-rule-warn'}`}>
              <div className="pl-rule-grid">
                <label className="pl-field">
                  <span className="muted">{t('playlistEditor.rules.when')}</span>
                  <select
                    className="set-select"
                    disabled={disabled}
                    value={r.when.type}
                    onChange={(e) => {
                      const t = e.target.value;
                      if (t === 'timeOfDay') {
                        updateRule(r.id, { when: { type: 'timeOfDay', fromHour: 9, toHour: 17 } });
                      } else if (t === 'calendarCategory') {
                        updateRule(r.id, {
                          when: { type: 'calendarCategory', category: 'study' },
                        });
                      } else {
                        updateRule(r.id, { when: { type: 'playlistCycle' } });
                      }
                    }}
                  >
                    <option value="timeOfDay">{t('playlistEditor.rules.timeOfDay')}</option>
                    <option value="calendarCategory">{t('playlistEditor.rules.calendarCategory')}</option>
                    <option value="playlistCycle">{t('playlistEditor.rules.playlistCycle')}</option>
                  </select>
                </label>

                {r.when.type === 'timeOfDay' && (
                  <>
                    <label className="pl-field">
                      <span className="muted">{t('playlistEditor.rules.from')}</span>
                      <input
                        type="number"
                        min={0}
                        max={24}
                        step={0.5}
                        disabled={disabled}
                        value={r.when.fromHour}
                        onChange={(e) =>
                          updateRule(r.id, {
                            when: {
                              type: 'timeOfDay',
                              fromHour: Number(e.target.value),
                              toHour: r.when.type === 'timeOfDay' ? r.when.toHour : 17,
                            },
                          })
                        }
                      />
                    </label>
                    <label className="pl-field">
                      <span className="muted">{t('playlistEditor.rules.to')}</span>
                      <input
                        type="number"
                        min={0}
                        max={24}
                        step={0.5}
                        disabled={disabled}
                        value={r.when.toHour}
                        onChange={(e) =>
                          updateRule(r.id, {
                            when: {
                              type: 'timeOfDay',
                              fromHour: r.when.type === 'timeOfDay' ? r.when.fromHour : 9,
                              toHour: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                  </>
                )}

                {r.when.type === 'calendarCategory' && (
                  <label className="pl-field">
                    <span className="muted">{t('playlistEditor.rules.category')}</span>
                    <select
                      className="set-select"
                      disabled={disabled}
                      value={r.when.category}
                      onChange={(e) =>
                        updateRule(r.id, {
                          when: {
                            type: 'calendarCategory',
                            category: e.target.value as CalendarCategory,
                          },
                        })
                      }
                    >
                      {CAL_CATS.map((category) => (
                        <option key={category} value={category}>
                          {t(`playlistEditor.category.${category}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="pl-field">
                  <span className="muted">{t('playlistEditor.rules.wall')}</span>
                  <select
                    className="set-select"
                    disabled={disabled}
                    value={r.itemId}
                    onChange={(e) => updateRule(r.id, { itemId: e.target.value })}
                  >
                    {active.items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {itemLabel(it, t)}
                      </option>
                    ))}
                    {!itemOk && (
                      <option value={r.itemId}>{t('playlistEditor.rules.missingItem', { id: r.itemId })}</option>
                    )}
                  </select>
                </label>

                <label className="pl-field">
                  <span className="muted">{t('playlistEditor.rules.priority')}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    disabled={disabled}
                    value={r.priority}
                    onChange={(e) => updateRule(r.id, { priority: Number(e.target.value) })}
                  />
                </label>

                <button
                  type="button"
                  className="btn small pl-rule-del"
                  disabled={disabled}
                  onClick={() => removeRule(r.id)}
                >
                  {t('common.remove')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="pl-add-row">
        <button type="button" className="btn small" disabled={disabled || !active.items.length} onClick={addTimeRule}>
          {t('playlistEditor.rules.addTime')}
        </button>
        <button type="button" className="btn small" disabled={disabled || !active.items.length} onClick={addCalRule}>
          {t('playlistEditor.rules.addCalendar')}
        </button>
      </div>
    </div>
  );
}
