import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../../i18n';
import SettingsCard from '../SettingsCard';
import {
  UI_TOKENS,
  activeUiProfile,
  addUiProfile,
  applyUiPlan,
  createUiThemeProfile,
  deleteUiProfile,
  discardUiPreview,
  exportUiTheme,
  findUiProfile,
  importUiTheme,
  interpretUiRequest,
  profileToCss,
  restoreUiDefaults,
  setActiveUiProfile,
  setUiDeveloperMode,
  stageUiPlan,
  undoUiChange,
  patchUiTokens,
  type UiChangePlan,
  type UiCustomizationDocument,
  type UiLook,
  type UiTokenGroup,
} from '../../../../shared/uiCustomization';
import {
  applyUiCustomization,
  applyUiLook,
  clearUiPreviewStyles,
  currentUiLook,
  loadUiCustomizationDocument,
  nextUiId,
  nowIso,
  onUiCustomizationChanged,
  previewUiLook,
  saveUiCustomizationDocument,
} from '../../../uiCustomizationStore';
import { appendCustomCss } from '../../../customCss';
import { readPlayerSubtitleFontSize, writePlayerSubtitleFontSize } from '../../../subtitleSizeBridge';
// Rubric category 8: a disabled control must be able to say what would turn it back
// on. `firstReason` makes the reason and the `disabled` value one expression, so they
// cannot drift — every site below spends it as `disabled={!!why} title={why}`.
import { firstReason } from '../../../../shared/disabledReason';

const TOKEN_GROUPS: UiTokenGroup[] = ['color', 'typography', 'spacing', 'radius', 'shadow', 'motion', 'density'];

/**
 * The Appearance label for each look field, reusing the Appearance card's own keys so
 * the two panels name one setting the same way.
 */
const LOOK_LABEL_KEY: Record<keyof UiLook, string> = {
  accent: 'search.accent',
  density: 'settings.appearance.label.density',
  radius: 'settings.appearance.label.corners',
  shadow: 'settings.appearance.label.shadows',
};

function lookValueKey(field: keyof UiLook, value: string): string | null {
  if (field === 'density') return `settings.appearance.density.${value}`;
  if (field === 'radius') return `settings.appearance.corners.${value}`;
  if (field === 'shadow') return `settings.appearance.shadows.${value}`;
  return null;
}

/**
 * MASTER_PLAN §20's theme studio. Two things changed from the first build, both so
 * that Settings > Appearance never disagrees with what is on screen:
 *
 *   · A theme's accent, density, corners and shadows are written INTO Appearance
 *     (`applyUiLook`) rather than overriding its tokens with `!important`, which used
 *     to leave those four controls showing one value while the app painted another.
 *   · There is one custom-CSS editor — Appearance's own. This panel's per-theme
 *     stylesheet editor and its Components card (twelve settings that wrote CSS
 *     variables nothing read) are gone.
 */
export default function ThemeStudioPanel() {
  const { t } = useT();
  const [document_, setDocument] = useState<UiCustomizationDocument>(loadUiCustomizationDocument);
  const [request, setRequest] = useState('');
  const [plan, setPlan] = useState<UiChangePlan | null>(null);
  const [newThemeName, setNewThemeName] = useState('');
  const [portableJson, setPortableJson] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const profile = activeUiProfile(document_);

  useEffect(() => onUiCustomizationChanged(setDocument), []);
  // The preview writes straight to the owned <style> element (tokens) and to the live
  // Appearance values (look) so the user judges the real thing; both are rolled back
  // when the preview ends — an abandoned preview must never persist.
  useEffect(() => {
    if (plan) applyUiCustomization(document_, { tokens: plan.tokens });
    else applyUiCustomization(document_);
    const previewsLook = Boolean(plan && Object.keys(plan.look).length);
    if (previewsLook && plan) previewUiLook(plan.look);
    return () => {
      clearUiPreviewStyles();
      if (previewsLook) previewUiLook(null);
    };
  }, [plan, document_]);

  const generatedCss = useMemo(() => profileToCss(profile), [profile]);

  // Category 8, "honest states": every control that can be off says what would turn it
  // back on, and the reason IS the disabled value so the two cannot disagree.
  const whyNoPreview = firstReason([!request.trim(), t('theme.why.noRequest')]);
  const whyNoApplyPlan = firstReason([!plan || !plan.intents.length, t('theme.why.noPlan')]);
  const whyNoCreate = firstReason([!newThemeName.trim(), t('theme.why.noName')]);
  const whyNoUndo = firstReason([!profile.history.length, t('theme.why.noHistory')]);
  const whyNoDelete = firstReason([profile.builtIn, t('theme.why.builtIn')]);
  const whyNoImport = firstReason([!portableJson.trim(), t('theme.why.noPortable')]);

  const commit = (next: UiCustomizationDocument, note?: string) => {
    setMessage(note ?? null);
    setDocument(saveUiCustomizationDocument(next));
  };
  /**
   * Commit, then write the ACTIVE theme's Appearance values when the change was one
   * that makes a theme's look current again (switching to it, undo, restore).
   */
  const guard = (run: () => UiCustomizationDocument, note?: string, applyLook = false) => {
    try {
      const next = run();
      commit(next, note);
      if (applyLook) applyUiLook(activeUiProfile(next).look);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('theme.error.generic'));
    }
  };

  const lookRows = (look: UiLook, from: UiLook) =>
    (Object.keys(look) as (keyof UiLook)[]).map((field) => {
      const value = look[field];
      if (!value) return null;
      const label = (v: string | undefined) => {
        if (!v) return t('theme.inherited');
        const key = lookValueKey(field, v);
        return key ? t(key) : v;
      };
      return (
        <div className="field-row" key={`look-${field}`}>
          <span><strong>{t(LOOK_LABEL_KEY[field])}</strong></span>
          <span>{label(from[field])} → {label(value)}</span>
        </div>
      );
    });

  return (
    <>
      <SettingsCard
        id="theme-studio-assistant"
        title={t('theme.assistant')}
        description={t('theme.assistantDesc')}
      >
        <div className="field-row">
          <label htmlFor="theme-request">{t('theme.request')}</label>
          <input
            id="theme-request"
            value={request}
            placeholder={t('theme.requestPlaceholder')}
            onChange={(event) => setRequest(event.currentTarget.value)}
          />
          <button
            type="button"
            disabled={!!whyNoPreview}
            title={whyNoPreview}
            onClick={() => {
              // Relative requests ("rounder", "bigger subtitles") resolve against what
              // is actually set now — Appearance's values and the player's size.
              const next = interpretUiRequest(request, profile.tokens, {
                look: currentUiLook(),
                subtitleFontSize: readPlayerSubtitleFontSize(),
              });
              setPlan(next);
              setDocument(stageUiPlan(document_, next));
              setMessage(next.intents.length ? null : t('theme.msg.notUnderstood'));
            }}
          >
            {t('theme.preview')}
          </button>
        </div>

        {plan && (
          <>
            <p className="muted">{t('theme.previewNote')}</p>
            {plan.intents.map((intent) => (
              <div className="field-row" key={intent.id}>
                <span>
                  <strong>{t(`theme.intent.${intent.id}`)}</strong>
                  <small className="muted">{t('theme.matched', { phrase: intent.matched })}</small>
                </span>
              </div>
            ))}
            {Object.entries(plan.tokens).map(([token, value]) => (
              <div className="field-row" key={token}>
                <span><strong>--{token}</strong></span>
                <span>{profile.tokens[token] ?? t('theme.inherited')} → {value}</span>
              </div>
            ))}
            {lookRows(plan.look, currentUiLook())}
            {plan.subtitleFontSize !== undefined && (
              <div className="field-row">
                <span><strong>{t('theme.subtitleSize')}</strong></span>
                <span>
                  {t('theme.subtitleSizeValue', { size: readPlayerSubtitleFontSize() })} →{' '}
                  {t('theme.subtitleSizeValue', { size: plan.subtitleFontSize })}
                </span>
              </div>
            )}
            {plan.unmatched.length > 0 && (
              <p className="muted">{t('theme.unmatched', { words: plan.unmatched.join(', ') })}</p>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn primary"
                disabled={!!whyNoApplyPlan}
                title={whyNoApplyPlan}
                onClick={() => {
                  const next = applyUiPlan(document_, plan, { now: nowIso(), versionId: nextUiId('v') });
                  const applied = plan;
                  setPlan(null);
                  setRequest('');
                  commit(next, t('theme.msg.applied'));
                  applyUiLook(applied.look);
                  if (applied.subtitleFontSize !== undefined) writePlayerSubtitleFontSize(applied.subtitleFontSize);
                }}
              >
                {t('theme.apply')}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setPlan(null);
                  commit(discardUiPreview(document_), t('theme.msg.discarded'));
                }}
              >
                {t('theme.discard')}
              </button>
            </div>
          </>
        )}
        {message && <p className="form-msg" role="status">{message}</p>}
      </SettingsCard>

      <SettingsCard
        id="theme-studio-profiles"
        title={t('theme.profiles')}
        description={t('theme.profilesDesc')}
        trailing={<span className="os-set-adv-badge">{profile.name}</span>}
      >
        <div className="field-row">
          <label htmlFor="theme-active">{t('theme.activeTheme')}</label>
          <select
            id="theme-active"
            className="media-model-select"
            value={profile.id}
            onChange={(event) => {
              const id = event.currentTarget.value;
              guard(() => setActiveUiProfile(document_, id), undefined, true);
            }}
          >
            {document_.profiles.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.name}</option>
            ))}
          </select>
        </div>
        {/* Where a theme's accent, density and corners went: into the Appearance cards
            above, which keep showing the real value and can change it at any time. */}
        <p className="muted">{t('theme.lookNote')}</p>
        <div className="field-row">
          <label htmlFor="theme-new">{t('theme.newTheme')}</label>
          <input
            id="theme-new"
            value={newThemeName}
            placeholder={t('theme.newThemePlaceholder')}
            onChange={(event) => setNewThemeName(event.currentTarget.value)}
          />
          <button
            type="button"
            disabled={!!whyNoCreate}
            title={whyNoCreate}
            onClick={() => guard(() => {
              // A new theme starts from what is on screen now — the tokens AND the
              // Appearance values — so it keeps the look the user already tuned.
              const next = addUiProfile(document_, createUiThemeProfile(
                nextUiId('theme'),
                newThemeName.trim(),
                nowIso(),
                { tokens: profile.tokens, look: currentUiLook() },
              ));
              setNewThemeName('');
              return next;
            }, t('theme.msg.created'))}
          >
            {t('theme.create')}
          </button>
        </div>
        <div className="sp-seg" role="group" aria-label={t('theme.safety')}>
          <button
            type="button"
            className="sp-seg-btn"
            disabled={!!whyNoUndo}
            title={whyNoUndo}
            onClick={() => guard(
              () => undoUiChange(document_, profile.id, { now: nowIso(), versionId: nextUiId('v') }),
              t('theme.msg.undone'),
              true,
            )}
          >
            {t('theme.undo')}
          </button>
          <button
            type="button"
            className="sp-seg-btn"
            onClick={() => guard(
              () => restoreUiDefaults(document_, profile.id, { now: nowIso(), versionId: nextUiId('v') }),
              t('theme.msg.restored'),
              true,
            )}
          >
            {t('theme.restoreDefaults')}
          </button>
          <button
            type="button"
            className="sp-seg-btn"
            disabled={!!whyNoDelete}
            title={whyNoDelete}
            onClick={() => guard(() => deleteUiProfile(document_, profile.id), t('theme.msg.deleted'))}
          >
            {t('theme.deleteTheme')}
          </button>
        </div>
        {profile.builtIn && <p className="muted">{t('theme.builtInNote')}</p>}
        {profile.history.length > 0 && (
          <p className="muted">{t('theme.historyCount', { count: profile.history.length })}</p>
        )}
      </SettingsCard>

      <SettingsCard
        id="theme-studio-tokens"
        title={t('theme.tokens')}
        description={t('theme.tokensDesc')}
      >
        {TOKEN_GROUPS.map((group) => {
          const specs = UI_TOKENS.filter((spec) => spec.group === group);
          if (!specs.length) return null;
          return (
            <fieldset key={group} className="unified-search-controls">
              <legend>{t(`theme.group.${group}`)}</legend>
              {specs.map((spec) => (
                <div className="field-row" key={spec.token}>
                  <label htmlFor={`theme-token-${spec.token}`}>--{spec.token}</label>
                  <input
                    id={`theme-token-${spec.token}`}
                    key={`${profile.id}-${spec.token}-${profile.tokens[spec.token] ?? ''}`}
                    defaultValue={profile.tokens[spec.token] ?? ''}
                    placeholder={t('theme.inherited')}
                    spellCheck={false}
                    onBlur={(event) => {
                      const value = event.currentTarget.value.trim();
                      if (!value) return;
                      const result = patchUiTokens(document_, profile.id, { [spec.token]: value }, {
                        now: nowIso(),
                        versionId: nextUiId('v'),
                      });
                      if (result.issues.length) {
                        event.currentTarget.value = profile.tokens[spec.token] ?? '';
                        setMessage(t('theme.msg.tokenRejected', { token: spec.token }));
                        return;
                      }
                      commit(result.document);
                    }}
                  />
                </div>
              ))}
            </fieldset>
          );
        })}
      </SettingsCard>

      <SettingsCard
        id="theme-studio-developer"
        title={t('theme.developer')}
        description={t('theme.developerDesc')}
      >
        <label className="os-set-toggle-row">
          <span>
            <strong>{t('theme.developerMode')}</strong>
            <small className="muted">{t('theme.developerModeDesc')}</small>
          </span>
          <input
            type="checkbox"
            checked={document_.developerMode}
            onChange={(event) => commit(setUiDeveloperMode(document_, event.currentTarget.checked))}
          />
        </label>
        {document_.developerMode && (
          <div className="field-row">
            <label htmlFor="theme-generated">{t('theme.generatedCss')}</label>
            <textarea
              id="theme-generated"
              readOnly
              value={generatedCss}
              spellCheck={false}
              style={{ minHeight: 140, fontFamily: 'var(--font-mono)' }}
            />
          </div>
        )}
        <div className="field-row">
          <label htmlFor="theme-json">{t('theme.themeJson')}</label>
          <textarea
            id="theme-json"
            value={portableJson}
            spellCheck={false}
            placeholder={t('theme.themeJsonPlaceholder')}
            onChange={(event) => setPortableJson(event.currentTarget.value)}
            style={{ minHeight: 120 }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setPortableJson(JSON.stringify(exportUiTheme(document_, profile.id), null, 2));
              setMessage(t('theme.msg.exported'));
            }}
          >
            {t('theme.exportTheme')}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!!whyNoImport}
            title={whyNoImport}
            onClick={() => {
              try {
                const id = nextUiId('theme');
                const result = importUiTheme(document_, JSON.parse(portableJson), { id, now: nowIso() });
                // A theme's stylesheet goes to the one custom-CSS editor (Appearance),
                // never to a second, hidden one.
                const imported = findUiProfile(result.document, id);
                const css = imported?.customCss.trim() ?? '';
                const cssAdded = result.review.safe && css
                  ? appendCustomCss(css, `${t('theme.importTheme')}: ${imported?.name ?? id}`).ok
                  : false;
                commit(
                  result.document,
                  !result.review.safe
                    ? t('theme.msg.importedCssDropped')
                    : cssAdded
                      ? t('theme.msg.importedCssAdded')
                      : t('theme.msg.imported'),
                );
              } catch (error) {
                setMessage(error instanceof Error ? error.message : t('theme.error.generic'));
              }
            }}
          >
            {t('theme.importTheme')}
          </button>
        </div>
      </SettingsCard>
    </>
  );
}
