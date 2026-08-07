// v1.0 audit item 4.1 — "Recommended" in icon settings: five predefined icon
// placement configurations. Its own component rather than more rows in
// DesktopLayoutPage, because it owns transient apply/undo state that the rest of
// the page has no use for (the same reason 1.2/1.3 extracted their cards).

import { useEffect, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import { useT } from '../../../i18n';
import { ICON_PRESETS, type IconPresetId } from '../../../desktopIconPresets';

type AppliedDetail = {
  presetId?: IconPresetId | null;
  placed?: number;
  kept?: number;
  replaced?: number;
  restored?: number;
};

export default function RecommendedIconsCard() {
  const { t } = useT();
  const { focusSettingId } = useSettings();
  const [status, setStatus] = useState('');
  const [canUndo, setCanUndo] = useState(false);

  // The shell owns `icons` and answers with what it actually did. Reporting the
  // shell's numbers rather than the preset's means the status line cannot claim
  // a placement that did not happen.
  useEffect(() => {
    const onApplied = (ev: Event) => {
      const d = (ev as CustomEvent<AppliedDetail>).detail ?? {};
      if (d.presetId) {
        setStatus(
          t('settings.desktop.preset.applied', {
            placed: d.placed ?? 0,
            replaced: d.replaced ?? 0,
          }),
        );
        setCanUndo(true);
      } else {
        setStatus(t('settings.desktop.preset.undone', { restored: d.restored ?? 0 }));
        setCanUndo(false);
      }
    };
    window.addEventListener('desktop:icon-preset-applied', onApplied);
    return () => window.removeEventListener('desktop:icon-preset-applied', onApplied);
  }, [t]);

  const apply = (presetId: IconPresetId) => {
    window.dispatchEvent(new CustomEvent('desktop:apply-icon-preset', { detail: { presetId } }));
  };

  return (
    <SettingsCard
      id="icon-recommended"
      title={t('settings.desktop.preset.title')}
      description={t('settings.desktop.preset.desc')}
      highlight={focusSettingId === 'icon-recommended'}
    >
      <div className="os-icon-presets">
        {ICON_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="os-icon-preset"
            data-icon-preset={p.id}
            onClick={() => apply(p.id)}
          >
            <span className="os-icon-preset-head">
              <span className="os-icon-preset-name">{t(p.labelKey)}</span>
              <span className="os-icon-preset-count muted">
                {t('settings.desktop.preset.count', { count: p.sections.length })}
              </span>
            </span>
            <span className="os-icon-preset-desc muted">{t(p.descKey)}</span>
          </button>
        ))}
      </div>
      <p className="muted os-set-hint">{t('settings.desktop.preset.hint')}</p>
      {status && (
        <div className="os-icon-preset-status">
          <span className="muted" data-icon-preset-status>
            {status}
          </span>
          {canUndo && (
            <button
              type="button"
              className="btn small"
              data-icon-preset-undo
              onClick={() => window.dispatchEvent(new CustomEvent('desktop:undo-icon-preset'))}
            >
              {t('settings.desktop.preset.undo')}
            </button>
          )}
        </div>
      )}
    </SettingsCard>
  );
}
