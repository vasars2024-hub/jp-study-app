import { useCallback, useEffect, useState } from 'react';
import { useT } from '../../../i18n';
import {
  ANALYSIS_DEPTHS,
  ANALYSIS_SECTIONS,
  DEFAULT_ANALYSIS_PREFS,
  EXPLAIN_LANGS,
  MAX_CUSTOM_INSTRUCTIONS,
  TRANSLATION_LANGS,
  normalizeAnalysisPrefs,
  type AnalysisSectionId,
  type SentenceAnalysisPrefs,
  type TranslationLang,
} from '../../../../shared/sentenceAnalysisPrefs';

/**
 * Study → AI analysis. Controls what an "AI OCR" read actually returns, and
 * what happens to it afterwards.
 *
 * Preferences live in the main process (see main/sentenceAnalysis.ts) because
 * three surfaces read them — this page, the Reading Lens overlay window, and
 * the browser extension over HTTP. Every edit writes straight through rather
 * than being staged behind a Save button: the Lens is frequently open on
 * another monitor while this page is being adjusted, and it re-renders from the
 * broadcast, which makes the effect of a toggle immediately visible.
 */
export default function AiAnalysisSection() {
  const { t } = useT();
  const [prefs, setPrefs] = useState<SentenceAnalysisPrefs>(DEFAULT_ANALYSIS_PREFS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void window.api
      .sentenceGetPrefs()
      .then((next) => {
        if (!alive) return;
        setPrefs(normalizeAnalysisPrefs(next));
        setLoaded(true);
      })
      .catch(() => {
        if (alive) setLoaded(true);
      });
    // Another window (or a reset elsewhere) can change these underneath us.
    const off = window.api.onSentencePrefsChanged((next) => setPrefs(normalizeAnalysisPrefs(next)));
    return () => {
      alive = false;
      off();
    };
  }, []);

  const patch = useCallback((next: Partial<SentenceAnalysisPrefs>) => {
    setPrefs((current) => {
      const merged = normalizeAnalysisPrefs({ ...current, ...next });
      void window.api.sentenceSetPrefs(merged).catch(() => undefined);
      return merged;
    });
  }, []);

  const toggleSection = useCallback(
    (id: AnalysisSectionId) => {
      setPrefs((current) => {
        const sections = current.sections.includes(id)
          ? current.sections.filter((s) => s !== id)
          : [...current.sections, id];
        const merged = normalizeAnalysisPrefs({ ...current, sections });
        void window.api.sentenceSetPrefs(merged).catch(() => undefined);
        return merged;
      });
    },
    [],
  );

  const toggleSnapshotSection = useCallback((id: AnalysisSectionId) => {
    setPrefs((current) => {
      const sections = current.snapshot.sections.includes(id)
        ? current.snapshot.sections.filter((s) => s !== id)
        : [...current.snapshot.sections, id];
      const merged = normalizeAnalysisPrefs({
        ...current,
        snapshot: { ...current.snapshot, sections },
      });
      void window.api.sentenceSetPrefs(merged).catch(() => undefined);
      return merged;
    });
  }, []);

  const toggleTranslation = useCallback((code: TranslationLang) => {
    setPrefs((current) => {
      const translations = current.translations.includes(code)
        ? current.translations.filter((c) => c !== code)
        : [...current.translations, code];
      const merged = normalizeAnalysisPrefs({ ...current, translations });
      void window.api.sentenceSetPrefs(merged).catch(() => undefined);
      return merged;
    });
  }, []);

  if (!loaded) return <p className="muted os-set-hint">{t('common.loading')}</p>;

  return (
    <div className="sa-prefs">
      <p className="muted os-set-hint">{t('settings.analysis.engineNote')}</p>

      {/* ---- What the AI writes ---- */}
      <div className="os-set-field">
        <span className="os-set-field-label">{t('settings.analysis.depth')}</span>
        <div className="sp-seg" role="radiogroup" aria-label={t('settings.analysis.depth')}>
          {ANALYSIS_DEPTHS.map((depth) => (
            <button
              key={depth}
              type="button"
              role="radio"
              aria-checked={prefs.depth === depth}
              className={`sp-seg-btn ${prefs.depth === depth ? 'active' : ''}`}
              aria-pressed={prefs.depth === depth}
              onClick={() => patch({ depth })}
            >
              {t(`settings.analysis.depth.${depth}`)}
            </button>
          ))}
        </div>
        <p className="muted os-set-hint">{t(`settings.analysis.depth.${prefs.depth}.hint`)}</p>
      </div>

      <div className="os-set-field">
        <span className="os-set-field-label">{t('settings.analysis.sections')}</span>
        <p className="muted os-set-hint">{t('settings.analysis.sections.hint')}</p>
        <div className="sa-pref-grid">
          {ANALYSIS_SECTIONS.map((id) => (
            <label key={id} className={`sa-pref-chip ${prefs.sections.includes(id) ? 'on' : ''}`}>
              <input
                type="checkbox"
                checked={prefs.sections.includes(id)}
                onChange={() => toggleSection(id)}
              />
              <span>{t(`settings.analysis.section.${id}`)}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="os-set-field">
        <span className="os-set-field-label">{t('settings.analysis.translations')}</span>
        <p className="muted os-set-hint">{t('settings.analysis.translations.hint')}</p>
        <div className="sa-pref-grid">
          {TRANSLATION_LANGS.map((code) => (
            <label key={code} className={`sa-pref-chip ${prefs.translations.includes(code) ? 'on' : ''}`}>
              <input
                type="checkbox"
                checked={prefs.translations.includes(code)}
                onChange={() => toggleTranslation(code)}
              />
              <span>{t(`settings.analysis.translation.${code}`)}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="os-viz-row" style={{ alignItems: 'center', gap: 8 }}>
        <span className="muted">{t('settings.analysis.explainIn')}</span>
        <select
          className="set-select"
          value={prefs.explainIn}
          onChange={(e) => patch({ explainIn: e.target.value as SentenceAnalysisPrefs['explainIn'] })}
        >
          {EXPLAIN_LANGS.map((code) => (
            <option key={code} value={code}>
              {t(`settings.analysis.explainIn.${code}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="os-viz-row" style={{ alignItems: 'center', gap: 8, marginTop: 8 }}>
        <span className="muted">{t('settings.analysis.learnerLevel')}</span>
        <input
          type="text"
          className="os-input"
          style={{ maxWidth: 140 }}
          value={prefs.learnerLevel}
          placeholder={t('settings.analysis.learnerLevel.placeholder')}
          onChange={(e) => patch({ learnerLevel: e.target.value })}
        />
      </div>
      <p className="muted os-set-hint">{t('settings.analysis.learnerLevel.hint')}</p>

      <div className="os-set-field">
        <span className="os-set-field-label">{t('settings.analysis.custom')}</span>
        <textarea
          className="os-input"
          rows={3}
          maxLength={MAX_CUSTOM_INSTRUCTIONS}
          value={prefs.customInstructions}
          placeholder={t('settings.analysis.custom.placeholder')}
          onChange={(e) => patch({ customInstructions: e.target.value })}
        />
        <p className="muted os-set-hint">{t('settings.analysis.custom.hint')}</p>
      </div>

      {/* ---- Flashcards ---- */}
      <h4 className="sa-prefs-subhead">{t('settings.analysis.anki')}</h4>

      <div className="os-viz-row" style={{ alignItems: 'center', gap: 8 }}>
        <span className="muted">{t('settings.analysis.anki.deck')}</span>
        <input
          type="text"
          className="os-input"
          style={{ maxWidth: 240 }}
          value={prefs.anki.deck}
          placeholder={t('settings.analysis.anki.deck.placeholder')}
          onChange={(e) => patch({ anki: { ...prefs.anki, deck: e.target.value } })}
        />
      </div>
      <p className="muted os-set-hint">{t('settings.analysis.anki.deck.hint')}</p>

      <div className="os-viz-row" style={{ alignItems: 'center', gap: 8, marginTop: 8 }}>
        <span className="muted">{t('settings.analysis.anki.cardKind')}</span>
        <div className="sp-seg" role="radiogroup" aria-label={t('settings.analysis.anki.cardKind')}>
          {(['word', 'sentence'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={prefs.anki.cardKind === kind}
              className={`sp-seg-btn ${prefs.anki.cardKind === kind ? 'active' : ''}`}
              aria-pressed={prefs.anki.cardKind === kind}
              onClick={() => patch({ anki: { ...prefs.anki, cardKind: kind } })}
            >
              {t(`settings.analysis.anki.cardKind.${kind}`)}
            </button>
          ))}
        </div>
      </div>

      <label className="os-toggle os-toggle-compact" style={{ marginTop: 8 }}>
        <input
          type="checkbox"
          checked={prefs.anki.includeExplanation}
          onChange={(e) => patch({ anki: { ...prefs.anki, includeExplanation: e.target.checked } })}
        />
        <span>{t('settings.analysis.anki.includeExplanation')}</span>
      </label>
      <label className="os-toggle os-toggle-compact">
        <input
          type="checkbox"
          checked={prefs.anki.includeTranslation}
          onChange={(e) => patch({ anki: { ...prefs.anki, includeTranslation: e.target.checked } })}
        />
        <span>{t('settings.analysis.anki.includeTranslation')}</span>
      </label>
      <label className="os-toggle os-toggle-compact">
        <input
          type="checkbox"
          checked={prefs.anki.auto}
          onChange={(e) => patch({ anki: { ...prefs.anki, auto: e.target.checked } })}
        />
        <span>{t('settings.analysis.anki.auto')}</span>
      </label>
      <p className="muted os-set-hint">{t('settings.analysis.anki.auto.hint')}</p>

      <div className="os-viz-row" style={{ alignItems: 'center', gap: 8, marginTop: 8 }}>
        <span className="muted">{t('settings.analysis.anki.tags')}</span>
        <input
          type="text"
          className="os-input"
          style={{ maxWidth: 240 }}
          value={prefs.anki.extraTags.join(' ')}
          placeholder={t('settings.analysis.anki.tags.placeholder')}
          onChange={(e) =>
            patch({ anki: { ...prefs.anki, extraTags: e.target.value.split(/[\s,]+/) } })
          }
        />
      </div>

      {/* ---- Notebook snapshots ---- */}
      <h4 className="sa-prefs-subhead">{t('settings.analysis.snapshot')}</h4>
      <p className="muted os-set-hint">{t('settings.analysis.snapshot.hint')}</p>

      <label className="os-toggle os-toggle-compact">
        <input
          type="checkbox"
          checked={prefs.snapshot.auto}
          onChange={(e) => patch({ snapshot: { ...prefs.snapshot, auto: e.target.checked } })}
        />
        <span>{t('settings.analysis.snapshot.auto')}</span>
      </label>

      <div className="os-viz-row" style={{ alignItems: 'center', gap: 8, marginTop: 8 }}>
        <span className="muted">{t('settings.analysis.snapshot.folder')}</span>
        <input
          type="text"
          className="os-input"
          style={{ maxWidth: 240 }}
          value={prefs.snapshot.folder}
          onChange={(e) => patch({ snapshot: { ...prefs.snapshot, folder: e.target.value } })}
        />
      </div>

      <div className="os-set-field">
        <span className="os-set-field-label">{t('settings.analysis.snapshot.sections')}</span>
        <p className="muted os-set-hint">{t('settings.analysis.snapshot.sections.hint')}</p>
        <div className="sa-pref-grid">
          {ANALYSIS_SECTIONS.map((id) => (
            <label
              key={id}
              className={`sa-pref-chip ${prefs.snapshot.sections.includes(id) ? 'on' : ''}`}
            >
              <input
                type="checkbox"
                checked={prefs.snapshot.sections.includes(id)}
                onChange={() => toggleSnapshotSection(id)}
              />
              <span>{t(`settings.analysis.section.${id}`)}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="os-viz-row" style={{ marginTop: 10 }}>
        <button
          type="button"
          className="btn small"
          onClick={() => patch(DEFAULT_ANALYSIS_PREFS)}
        >
          {t('settings.analysis.reset')}
        </button>
      </div>
    </div>
  );
}
