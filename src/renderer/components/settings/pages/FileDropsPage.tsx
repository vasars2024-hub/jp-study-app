/**
 * Settings → File drops.
 *
 * Controls the universal drop router: whether a dropped file is routed
 * automatically, when the triage sheet appears, per-extension overrides for
 * the genuinely ambiguous formats, and how far undo reaches back.
 */
import { useEffect, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import { useT } from '../../../i18n';
import type { DropTargetId } from '../../../../shared/fileRouting';
import {
  loadFileDropPrefs,
  onFileDropPrefsChanged,
  resetFileDropPrefs,
  saveFileDropPrefs,
  type FileDropPrefs,
} from '../../../fileDropPrefs';
import { Toggle } from '../../ui';

/**
 * The extensions worth an override. Each is a real ambiguity in the app, not a
 * hypothetical one — see the reasoning in `shared/fileRouting.ts`.
 */
const OVERRIDABLE: { ext: string; targets: DropTargetId[] }[] = [
  { ext: '.zip', targets: ['dictionary-yomitan', 'library-manga'] },
  { ext: '.apkg', targets: ['anki-cards', 'anki-level'] },
  { ext: '.json', targets: ['backup', 'frequency-dict', 'vn-script'] },
  { ext: '.png', targets: ['wallpaper', 'library-manga'] },
  { ext: '.jpg', targets: ['wallpaper', 'library-manga'] },
  { ext: '.txt', targets: ['library-book', 'vn-script'] },
];

const UNDO_DEPTHS = [0, 5, 10, 25];

export default function FileDropsPage() {
  const { t } = useT();
  const { seg, focusSettingId } = useSettings();
  const [prefs, setPrefs] = useState<FileDropPrefs>(loadFileDropPrefs);

  useEffect(() => onFileDropPrefsChanged(setPrefs), []);

  const patch = (p: Partial<FileDropPrefs>): void => setPrefs(saveFileDropPrefs(p));

  return (
    <>
      <SettingsCard
        id="filedrop-auto"
        title={t('settings.fileDrops.auto')}
        description={t('settings.fileDrops.auto.desc')}
        highlight={focusSettingId === 'filedrop-auto'}
      >
        <Toggle
          className="os-toggle"
          checked={prefs.autoRoute}
          onChange={(e) => patch({ autoRoute: e.target.checked })}
          label={t('settings.fileDrops.auto.toggle')}
        />
        <Toggle
          className="os-toggle"
          checked={prefs.alwaysTriage}
          onChange={(e) => patch({ alwaysTriage: e.target.checked })}
          label={t('settings.fileDrops.alwaysAsk')}
        />
        <p className="muted os-set-hint">{t('settings.fileDrops.auto.hint')}</p>
      </SettingsCard>

      <SettingsCard
        id="filedrop-overrides"
        title={t('settings.fileDrops.overrides')}
        description={t('settings.fileDrops.overrides.desc')}
        highlight={focusSettingId === 'filedrop-overrides'}
      >
        <div className="os-filedrop-overrides">
          {OVERRIDABLE.map(({ ext, targets }) => (
            <label className="os-filedrop-override" key={ext}>
              <span className="os-filedrop-ext">{ext}</span>
              <select
                value={prefs.overrides[ext] ?? ''}
                onChange={(e) => {
                  const next = { ...prefs.overrides };
                  if (e.target.value) next[ext] = e.target.value as DropTargetId;
                  else delete next[ext];
                  patch({ overrides: next });
                }}
              >
                <option value="">{t('settings.fileDrops.overrides.ask')}</option>
                {targets.map((id) => (
                  <option key={id} value={id}>
                    {t(`fileDrop.target.${id}`)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <p className="muted os-set-hint">{t('settings.fileDrops.overrides.hint')}</p>
      </SettingsCard>

      <SettingsCard
        id="filedrop-undo"
        title={t('settings.fileDrops.undo')}
        description={t('settings.fileDrops.undo.desc')}
        highlight={focusSettingId === 'filedrop-undo'}
      >
        <div className="os-viz-row">
          {UNDO_DEPTHS.map((depth) => (
            <button
              key={depth}
              type="button"
              {...seg(prefs.undoDepth === depth)}
              onClick={() => patch({ undoDepth: depth })}
            >
              {depth === 0 ? t('settings.fileDrops.undo.off') : String(depth)}
            </button>
          ))}
        </div>
        <p className="muted os-set-hint">{t('settings.fileDrops.undo.hint')}</p>
      </SettingsCard>

      <SettingsCard
        id="filedrop-reset"
        title={t('settings.fileDrops.reset')}
        description={t('settings.fileDrops.reset.desc')}
        highlight={focusSettingId === 'filedrop-reset'}
      >
        <button type="button" className="btn" onClick={() => setPrefs(resetFileDropPrefs())}>
          {t('settings.fileDrops.reset.action')}
        </button>
      </SettingsCard>
    </>
  );
}
