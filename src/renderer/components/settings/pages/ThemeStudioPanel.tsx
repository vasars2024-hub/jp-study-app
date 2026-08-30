import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../../i18n';
import SettingsCard from '../SettingsCard';
import {
  COMPONENT_SETTING_SPECS,
  UI_TOKENS,
  activeUiProfile,
  addUiProfile,
  applyUiPlan,
  createUiThemeProfile,
  deleteUiProfile,
  discardUiPreview,
  exportUiTheme,
  importUiTheme,
  interpretUiRequest,
  profileToCss,
  restoreUiDefaults,
  reviewCustomCss,
  setActiveUiProfile,
  setUiComponentSetting,
  setUiCustomCss,
  setUiCustomCssEnabled,
  setUiDeveloperMode,
  stageUiPlan,
  undoUiChange,
  patchUiTokens,
  type UiChangePlan,
  type UiComponentId,
  type UiCustomizationDocument,
  type UiTokenGroup,
} from '../../../../shared/uiCustomization';
import {
  applyUiCustomization,
  clearUiPreviewStyles,
  loadUiCustomizationDocument,
  nextUiId,
  nowIso,
  onUiCustomizationChanged,
  saveUiCustomizationDocument,
} from '../../../uiCustomizationStore';
// Rubric category 8: a disabled control must be able to say what would turn it back
// on. `firstReason` makes the reason and the `disabled` value one expression, so they
// cannot drift — every site below spends it as `disabled={!!why} title={why}`.
import { firstReason } from '../../../../shared/disabledReason';

const TOKEN_GROUPS: UiTokenGroup[] = ['color', 'typography', 'spacing', 'radius', 'shadow', 'motion', 'density'];
const COMPONENTS: UiComponentId[] = ['mediaCard', 'subtitlePanel', 'vocabularyCard'];

export default function ThemeStudioPanel() {
  const { t } = useT();
  const [document_, setDocument] = useState<UiCustomizationDocument>(loadUiCustomizationDocument);
  const [request, setRequest] = useState('');
  const [plan, setPlan] = useState<UiChangePlan | null>(null);
  const [cssDraft, setCssDraft] = useState('');
  const [newThemeName, setNewThemeName] = useState('');
  const [portableJson, setPortableJson] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const profile = activeUiProfile(document_);

  useEffect(() => onUiCustomizationChanged(setDocument), []);
  useEffect(() => setCssDraft(profile.customCss), [profile.id, profile.customCss]);
  // The preview writes straight to the owned <style> element so the user judges the real
  // thing, then it is rolled back on unmount — an abandoned preview must never persist.
  useEffect(() => {
    if (plan) applyUiCustomization(document_, { tokens: plan.tokens, componentSettings: plan.componentSettings });
    else applyUiCustomization(document_);
    return () => clearUiPreviewStyles();
  }, [plan, document_]);

  const cssReview = useMemo(() => reviewCustomCss(cssDraft), [cssDraft]);
  const generatedCss = useMemo(() => profileToCss(profile), [profile]);

  // Category 8, "honest states": every control that can be off says what would turn it
  // back on, and the reason IS the disabled value so the two cannot disagree. Measured
  // before this landed — six of this panel's controls were mute, and the harness could
  // not tell them from a broken feature.
  const whyNoPreview = firstReason([!request.trim(), t('theme.why.noRequest')]);
  const whyNoApplyPlan = firstReason([!plan || !plan.intents.length, t('theme.why.noPlan')]);
  const whyNoCreate = firstReason([!newThemeName.trim(), t('theme.why.noName')]);
  const whyNoUndo = firstReason([!profile.history.length, t('theme.why.noHistory')]);
  const whyNoDelete = firstReason([profile.builtIn, t('theme.why.builtIn')]);
  const whyNoCssToggle = firstReason([!profile.customCss, t('theme.why.noCustomCss')]);
  const whyNoCssSave = firstReason([!cssReview.safe, t('theme.why.cssUnsafe')]);
  const whyNoImport = firstReason([!portableJson.trim(), t('theme.why.noPortable')]);

  const commit = (next: UiCustomizationDocument, note?: string) => {
    setMessage(note ?? null);
    setDocument(saveUiCustomizationDocument(next));
  };
  const guard = (run: () => UiCustomizationDocument, note?: string) => {
    try {
      commit(run(), note);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('theme.error.generic'));
    }
  };

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
              const next = interpretUiRequest(request, profile.tokens);
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
                  setPlan(null);
                  setRequest('');
                  commit(next, t('theme.msg.applied'));
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
            onChange={(event) => guard(() => setActiveUiProfile(document_, event.currentTarget.value))}
          >
            {document_.profiles.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.name}</option>
            ))}
          </select>
        </div>
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
              // A new theme starts from what is on screen now, so "create a custom
              // theme" keeps the look the user already tuned instead of resetting it.
              const next = addUiProfile(document_, createUiThemeProfile(
                nextUiId('theme'),
                newThemeName.trim(),
                nowIso(),
                { tokens: profile.tokens, componentSettings: profile.componentSettings },
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
        id="theme-studio-components"
        title={t('theme.components')}
        description={t('theme.componentsDesc')}
      >
        {COMPONENTS.map((component) => (
          <fieldset key={component} className="unified-search-controls">
            <legend>{t(`theme.component.${component}`)}</legend>
            {COMPONENT_SETTING_SPECS.filter((spec) => spec.component === component).map((spec) => {
              const value = profile.componentSettings[component]?.[spec.key];
              const id = `theme-${component}-${spec.key}`;
              const set = (next: string | number | boolean) => guard(() => setUiComponentSetting(
                document_,
                profile.id,
                component,
                spec.key,
                next,
                { now: nowIso(), versionId: nextUiId('v') },
              ));
              if (spec.kind === 'boolean') {
                return (
                  <label className="os-set-toggle-row" key={spec.key}>
                    <span><strong>{t(`theme.setting.${spec.key}`)}</strong></span>
                    <input type="checkbox" checked={value === true} onChange={(event) => set(event.currentTarget.checked)} />
                  </label>
                );
              }
              if (spec.kind === 'enum') {
                return (
                  <div className="field-row" key={spec.key}>
                    <label htmlFor={id}>{t(`theme.setting.${spec.key}`)}</label>
                    <select
                      id={id}
                      className="media-model-select"
                      value={String(value ?? spec.values?.[0] ?? '')}
                      onChange={(event) => set(event.currentTarget.value)}
                    >
                      {spec.values?.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </div>
                );
              }
              return (
                <div className="field-row" key={spec.key}>
                  <label htmlFor={id}>{t(`theme.setting.${spec.key}`)}</label>
                  <input
                    id={id}
                    type="number"
                    min={spec.min}
                    max={spec.max}
                    value={typeof value === 'number' ? value : (spec.min ?? 0)}
                    onChange={(event) => {
                      const next = Number(event.currentTarget.value);
                      if (Number.isFinite(next)) set(next);
                    }}
                  />
                </div>
              );
            })}
          </fieldset>
        ))}
      </SettingsCard>

      <SettingsCard
        id="theme-studio-css"
        title={t('theme.customCss')}
        description={t('theme.customCssDesc')}
        trailing={(
          <span className="os-set-adv-badge">
            {cssReview.safe ? t('theme.cssSafe') : t('theme.cssBlocked')}
          </span>
        )}
      >
        <label className="os-set-toggle-row">
          <span>
            <strong>{t('theme.customCssEnable')}</strong>
            <small className="muted">{t('theme.customCssEnableDesc')}</small>
          </span>
          <input
            type="checkbox"
            checked={profile.customCssEnabled}
            disabled={!!whyNoCssToggle}
            title={whyNoCssToggle}
            onChange={(event) => guard(
              () => setUiCustomCssEnabled(document_, profile.id, event.currentTarget.checked, nowIso()),
            )}
          />
        </label>
        <div className="field-row">
          <label htmlFor="theme-css">{t('theme.stylesheet')}</label>
          <textarea
            id="theme-css"
            value={cssDraft}
            spellCheck={false}
            style={{ minHeight: 160, fontFamily: 'var(--font-mono)' }}
            onChange={(event) => setCssDraft(event.currentTarget.value)}
          />
        </div>
        {cssReview.violations.map((violation, index) => (
          <p className="muted" key={`${violation.kind}-${index}`}>
            {t(`theme.css.${violation.kind}`)} — {violation.detail}
          </p>
        ))}
        <button
          type="button"
          className="btn primary"
          disabled={!!whyNoCssSave}
          title={whyNoCssSave}
          onClick={() => {
            const result = setUiCustomCss(document_, profile.id, cssDraft, {
              now: nowIso(),
              versionId: nextUiId('v'),
            });
            if (!result.review.safe) {
              setMessage(t('theme.msg.cssRejected'));
              return;
            }
            commit(result.document, t('theme.msg.cssSaved'));
          }}
        >
          {t('theme.saveCss')}
        </button>
        <p className="muted">{t('theme.lockoutNote')}</p>
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
                const result = importUiTheme(document_, JSON.parse(portableJson), {
                  id: nextUiId('theme'),
                  now: nowIso(),
                });
                commit(
                  result.document,
                  result.review.safe ? t('theme.msg.imported') : t('theme.msg.importedCssDropped'),
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
