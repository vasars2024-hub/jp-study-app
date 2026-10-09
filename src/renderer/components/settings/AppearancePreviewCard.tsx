/**
 * AppearancePreviewCard — v1.0 audit §2.4.
 * -----------------------------------------------------------------------------
 * "A preview window for all Appearance settings so changes can be verified before
 * saving."
 *
 * The Appearance page applies every control the instant you touch it. That is fine when
 * you know what you want and hostile when you are exploring: a theme, an accent and a
 * density later, the app looks wrong and the way back is whatever you can remember.
 *
 * So this card is a **draft** of the same settings. It starts as a copy of what is live,
 * its controls change only the draft, and the draft is rendered in an isolated
 * `PreviewStage`. Apply commits it through the same `patchLook` / `chooseTheme` the page
 * uses; Reset throws it away. Instant-apply on the page below is deliberately left
 * alone — this is a second way to work, not a replacement for the first.
 *
 * The draft is turned into tokens by `personalizationVisuals`, the same function
 * `applyPersonalization` uses, so the preview cannot claim a setting looks like
 * something the app would render differently.
 */

import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../i18n';
import SettingsCard from './SettingsCard';
import PreviewStage from './PreviewStage';
import { THEMES } from '../../theme';
import { DEFAULT_THEME_ID } from '../../theme/engine';
import { firstReason } from '../../../shared/disabledReason';
import {
  ACCENT_PRESETS,
  personalizationVisuals,
  type ChromeMaterialId,
  type DensityId,
  type FontFamilyId,
  type OsPersonalization,
  type RadiusId,
  type ShadowStrengthId,
} from '../../osPersonalization';
import type { SegButtonProps } from '../ui/segButton';

export interface AppearancePreviewCardProps {
  look: OsPersonalization;
  theme: string;
  highlight?: boolean;
  seg: (active: boolean) => SegButtonProps;
  onApply: (draft: OsPersonalization, themeId: string) => void;
}

/** The page's own option lists, as data — same ids, same order, same labels. */
const GROUPS: Array<{
  key: keyof OsPersonalization;
  labelKey: string;
  options: Array<[string, string]>;
}> = [
  {
    key: 'fontFamily',
    labelKey: 'settings.appearance.label.font',
    options: [
      ['segoe', 'settings.appearance.font.segoe'],
      ['system', 'settings.appearance.font.system'],
      ['jp-first', 'settings.appearance.font.jpFirst'],
    ],
  },
  {
    key: 'density',
    labelKey: 'settings.appearance.label.density',
    options: [
      ['compact', 'settings.appearance.density.compact'],
      ['comfortable', 'settings.appearance.density.comfortable'],
      ['spacious', 'settings.appearance.density.spacious'],
    ],
  },
  {
    key: 'radius',
    labelKey: 'settings.appearance.label.corners',
    options: [
      ['sharp', 'settings.appearance.corners.sharp'],
      ['soft', 'settings.appearance.corners.soft'],
      ['round', 'settings.appearance.corners.round'],
    ],
  },
  {
    key: 'chrome',
    labelKey: 'settings.appearance.label.chrome',
    options: [
      ['solid', 'settings.appearance.chrome.solid'],
      ['frosted', 'settings.appearance.chrome.frosted'],
    ],
  },
  {
    key: 'shadow',
    labelKey: 'settings.appearance.label.shadows',
    options: [
      ['none', 'settings.appearance.shadows.none'],
      ['soft', 'settings.appearance.shadows.soft'],
      ['deep', 'settings.appearance.shadows.deep'],
    ],
  },
];

export default function AppearancePreviewCard({
  look,
  theme,
  highlight,
  seg,
  onApply,
}: AppearancePreviewCardProps) {
  const { t } = useT();
  const accentName = (id: string, fallback: string): string => {
    const key = `settings.appearance.accent.${id}`;
    const out = t(key);
    return out === key ? fallback : out;
  };
  const [draft, setDraft] = useState<OsPersonalization>(look);
  const [draftTheme, setDraftTheme] = useState(theme);
  const [touched, setTouched] = useState(false);

  // While untouched the draft tracks the live settings, so opening the page after
  // changing something below does not show a stale picture. Once the user edits the
  // draft it is theirs, and a live change must not overwrite it mid-experiment.
  useEffect(() => {
    if (!touched) {
      setDraft(look);
      setDraftTheme(theme);
    }
  }, [look, theme, touched]);

  const patch = (p: Partial<OsPersonalization>): void => {
    setTouched(true);
    setDraft((d) => ({ ...d, ...p }));
  };

  const visuals = useMemo(() => personalizationVisuals(draft), [draft]);
  const tokens = useMemo(() => ({ ...visuals.tokens, ...visuals.accent }), [visuals]);
  const attrs = useMemo(
    () => ({
      ...visuals.attrs,
      // The engine omits `data-theme` entirely for the default look, so the preview has
      // to omit it too or the default theme would render as a missing one.
      'data-theme': draftTheme === DEFAULT_THEME_ID ? null : draftTheme,
    }),
    [visuals, draftTheme],
  );

  const themeLabel = (id: string, fallback: string): string => {
    const key = `settings.appearance.theme.${id}`;
    const translated = t(key);
    return translated === key ? fallback : translated;
  };

  // Category 8, "honest states". Reset and Apply are off until the draft diverges, and
  // an untouched draft looks exactly like a live one — so without this the pair reads as
  // two broken buttons. The reason IS the disabled value, so they cannot disagree.
  const whyNothingToApply = firstReason([!touched, t('settings.preview.why.noChanges')]);

  return (
    <SettingsCard
      id="appearance-preview"
      title={t('settings.preview.card.heading')}
      description={t('settings.preview.card.description')}
      highlight={highlight}
      trailing={
        touched ? <span className="os-preview-dirty">{t('settings.preview.unapplied')}</span> : undefined
      }
    >
      <div className="os-preview-card-split">
        <div className="os-preview-controls">
          <div className="os-viz-row">
            <span className="os-viz-label muted">{t('search.theme')}</span>
            <select
              className="set-select"
              aria-label={t('search.theme')}
              value={draftTheme}
              onChange={(e) => {
                setTouched(true);
                setDraftTheme(e.target.value);
              }}
            >
              {THEMES.map((th) => (
                <option key={th.id} value={th.id}>
                  {themeLabel(th.id, th.label)}
                </option>
              ))}
            </select>
          </div>

          <div className="os-viz-row">
            <span className="os-viz-label muted">{t('search.accent')}</span>
            <div className="os-accent-row">
              {ACCENT_PRESETS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`os-accent ${draft.accentMode === 'preset' && draft.accentPreset === a.id ? 'active' : ''}`}
                  style={{ background: a.accent }}
                  title={accentName(a.id, a.label)}
                  // Colour-only swatches: a title alone is not a reliable name.
                  aria-label={accentName(a.id, a.label)}
                  aria-pressed={draft.accentMode === 'preset' && draft.accentPreset === a.id}
                  onClick={() => patch({ accentMode: 'preset', accentPreset: a.id })}
                />
              ))}
              <input
                type="color"
                value={draft.customAccent}
                title={t('settings.appearance.accent.customTitle')}
                aria-label={t('settings.appearance.accent.customTitle')}
                onChange={(e) => patch({ accentMode: 'custom', customAccent: e.target.value })}
              />
            </div>
          </div>

          {GROUPS.map((group) => (
            <div className="os-viz-row" key={group.key}>
              <span className="os-viz-label muted">{t(group.labelKey)}</span>
              {group.options.map(([id, labelKey]) => (
                <button
                  key={id}
                  type="button"
                  {...seg(draft[group.key] === id)}
                  onClick={() =>
                    patch({
                      [group.key]: id as DensityId | RadiusId | ChromeMaterialId | ShadowStrengthId | FontFamilyId,
                    } as Partial<OsPersonalization>)
                  }
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
          ))}

          <div className="os-set-btns">
            <button
              type="button"
              className="btn small"
              disabled={!!whyNothingToApply}
              title={whyNothingToApply}
              onClick={() => {
                setTouched(false);
                setDraft(look);
                setDraftTheme(theme);
              }}
            >
              {t('settings.preview.reset')}
            </button>
            <button
              type="button"
              className="btn small primary"
              disabled={!!whyNothingToApply}
              title={whyNothingToApply}
              onClick={() => {
                onApply(draft, draftTheme);
                setTouched(false);
              }}
            >
              {t('settings.preview.apply')}
            </button>
          </div>
        </div>

        <div className="os-preview-frame-wrap">
          <PreviewStage tokens={tokens} attrs={attrs} />
        </div>
      </div>
    </SettingsCard>
  );
}
