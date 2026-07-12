import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AiDeckGenerationSource,
  AiEngineConfig,
  AiEnrichmentResult,
  AiGenerationProgress,
  AiLanguageOptions,
  AiMiningCardFormat,
  AiMiningLanguage,
  AiPromptPreset,
} from '../../shared/mining';
import {
  AI_LANGUAGE_DIRECTION_PRESETS,
  AI_MINING_LANGUAGES,
  AI_PROMPT_PRESETS,
  AI_PROVIDERS,
  DEFAULT_AI_PROVIDER_ID,
  applyLanguageOptionsToFormat,
  formatsForPreset,
  languageDirectionLabel,
  languageOptionsForProfile,
  normalizeLanguageOptions,
  providerById,
  providerKeyBucket,
} from '../../shared/mining';
import type { ProfileId, StudyProfile } from '../../shared/profiles';
import CollapsibleSection from './CollapsibleSection';
import FieldMappingEditor from './FieldMappingEditor';
import AiStudioPreviewPanel from './AiStudioPreviewPanel';
import AiGenerationProgressPanel from './AiGenerationProgressPanel';
import AiStudioConfigLog, { appendStudioLog, type AiStudioLogLine } from './AiStudioConfigLog';
import type { MappingPreviewState } from './AnkiCardPreview';
import Icon from './Icons';
import { addDeckCards } from '../flashcardDeck';
import { saveAiResultsToDeck } from '../aiDeckSave';
import { loadSaved, onSavedChanged, type SavedWord } from '../savedWords';
import { getActiveProfile, getProfiles, onProfileChanged } from '../profileState';
import type { AnkiStatus } from '../../shared/types';

function normalizeAiEngineConfig(raw?: Partial<AiEngineConfig> | null): AiEngineConfig {
  const apiKeysSet = {
    gemini: Boolean(raw?.apiKeysSet?.gemini),
    deepseek: Boolean(raw?.apiKeysSet?.deepseek),
  };
  if (!raw?.apiKeysSet && raw?.apiKeySet) apiKeysSet.gemini = true;
  const lang = normalizeLanguageOptions(raw ?? undefined);
  const providerId = raw?.providerId ?? DEFAULT_AI_PROVIDER_ID;
  const bucket = providerKeyBucket(providerId);
  return {
    apiKeySet: Boolean(apiKeysSet[bucket]),
    apiKeysSet,
    providerId,
    selectedPresetId: raw?.selectedPresetId ?? AI_PROMPT_PRESETS[0]?.id ?? 'idiom-slang',
    selectedFormatId: raw?.selectedFormatId ?? 'idiom-slang-recognition',
    cardCount: Math.max(1, Math.min(50, Math.round(raw?.cardCount ?? 1))),
    outputFormat: raw?.outputFormat === 'csv' ? 'csv' : 'anki',
    ...lang,
  };
}

function presetById(id: string, presets: AiPromptPreset[]): AiPromptPreset | undefined {
  return presets.find((p) => p.id === id) ?? AI_PROMPT_PRESETS.find((p) => p.id === id);
}

function profileById(id: string): StudyProfile | undefined {
  return getProfiles().find((p) => p.id === id);
}

type AiCardStudioProps = { onDeckImported?: () => void };

export default function AiCardStudio({ onDeckImported }: AiCardStudioProps = {}) {
  const [aiConfig, setAiConfig] = useState<AiEngineConfig>(() => normalizeAiEngineConfig());
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState('');
  const [keyStatusKind, setKeyStatusKind] = useState<'idle' | 'ok' | 'error'>('idle');
  const apiKeyInputRef = useRef<HTMLInputElement>(null);
  const [presets, setPresets] = useState<AiPromptPreset[]>([]);
  const [formats, setFormats] = useState<AiMiningCardFormat[]>([]);
  const [profileRevision, setProfileRevision] = useState(0);
  const [mappingPreview, setMappingPreview] = useState<MappingPreviewState>({
    templates: {},
    fallbackTemplates: {},
    exampleFallback: false,
  });
  const [ankiStatus, setAnkiStatus] = useState<AnkiStatus | null>(null);
  const [fields, setFields] = useState<string[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [fieldsErr, setFieldsErr] = useState<string | null>(null);
  const [mapMsg, setMapMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [savedWords, setSavedWords] = useState<SavedWord[]>(() => loadSaved());
  const [generationSource, setGenerationSource] = useState<AiDeckGenerationSource>('preset');
  const [wordCount, setWordCount] = useState(10);
  const [aiBusy, setAiBusy] = useState(false);
  const [genProgress, setGenProgress] = useState<AiGenerationProgress | null>(null);
  const [logLines, setLogLines] = useState<AiStudioLogLine[]>([]);
  const [batchResults, setBatchResults] = useState<AiEnrichmentResult[]>([]);
  const [status, setStatus] = useState('');
  const syncedPresetKey = useRef('');
  const studioSnapRef = useRef('');
  const prevMappingRef = useRef<Record<string, string>>({});
  const langLabel = (id: AiMiningLanguage) => AI_MINING_LANGUAGES.find((l) => l.id === id)?.label ?? id;

  useEffect(() => {
    return window.api.onAiGenerateProgress(setGenProgress);
  }, []);

  useEffect(() => {
    return onProfileChanged(() => setProfileRevision((n) => n + 1));
  }, []);

  useEffect(() => onSavedChanged(() => setSavedWords(loadSaved())), []);

  useEffect(() => {
    void window.api.ankiStatus().then(setAnkiStatus);
  }, []);

  useEffect(() => {
    void Promise.all([window.api.aiGetConfig(), window.api.aiListPresets(), window.api.aiListFormats()]).then(
      ([cfg, p, f]) => {
        setAiConfig(normalizeAiEngineConfig(cfg));
        syncedPresetKey.current = '';
        setPresets(p);
        setFormats(f);
      },
    );
  }, []);

  const selectedProvider = useMemo(() => providerById(aiConfig.providerId), [aiConfig.providerId]);
  const currentProviderKeySaved = Boolean(aiConfig.apiKeysSet?.[selectedProvider.keyBucket]);

  const allPresets = useMemo(() => (presets.length ? presets : [...AI_PROMPT_PRESETS]), [presets]);
  const corePresets = useMemo(() => allPresets.filter((p) => p.category === 'core'), [allPresets]);
  const specializedPresets = useMemo(() => allPresets.filter((p) => p.category === 'specialized'), [allPresets]);

  const formatsForCurrentPreset = useMemo(
    () => (formats.length ? formats : formatsForPreset(aiConfig.selectedPresetId)).filter(
      (f) => f.presetId === aiConfig.selectedPresetId,
    ),
    [formats, aiConfig.selectedPresetId],
  );

  const selectedPreset = useMemo(
    () => presetById(aiConfig.selectedPresetId, presets),
    [aiConfig.selectedPresetId, presets],
  );

  const selectedFormat = useMemo(
    () =>
      formatsForCurrentPreset.find((f) => f.id === aiConfig.selectedFormatId) ??
      formatsForCurrentPreset[0] ??
      null,
    [formatsForCurrentPreset, aiConfig.selectedFormatId],
  );

  const profileLangOptions = useMemo(() => {
    if (!selectedFormat) return null;
    return languageOptionsForProfile(selectedFormat.profileId, (id) => profileById(id));
  }, [selectedFormat, profileRevision]);

  useEffect(() => {
    if (!selectedFormat || !profileLangOptions) return;
    const key = `${aiConfig.selectedPresetId}::${aiConfig.selectedFormatId}`;
    if (syncedPresetKey.current === key) return;
    syncedPresetKey.current = key;
    const current = normalizeLanguageOptions(aiConfig);
    const needsSync =
      current.frontLang !== profileLangOptions.frontLang ||
      current.backLang !== profileLangOptions.backLang ||
      current.reverse ||
      current.backGlossLangs.length > 0;
    if (needsSync) {
      void saveLanguageOptions(profileLangOptions).then(() => {
        setLogLines((lines) =>
          appendStudioLog(
            lines,
            'Language direction',
            `Synced to ${langLabel(profileLangOptions.frontLang)} → ${langLabel(profileLangOptions.backLang)} (from preset profile)`,
          ),
        );
      });
    }
  }, [selectedFormat, profileLangOptions, aiConfig.selectedPresetId, aiConfig.selectedFormatId]);

  const localizedFormat = useMemo(() => {
    if (!selectedFormat || !selectedPreset) return null;
    return applyLanguageOptionsToFormat(selectedFormat, selectedPreset, {
      frontLang: aiConfig.frontLang,
      backLang: aiConfig.backLang,
      reverse: aiConfig.reverse,
      backGlossLangs: aiConfig.backGlossLangs,
    });
  }, [selectedFormat, selectedPreset, aiConfig.frontLang, aiConfig.backLang, aiConfig.reverse, aiConfig.backGlossLangs]);

  const mappingProfileId = (selectedFormat?.profileId ?? 'p1-ja-focus') as ProfileId;

  const mappingProfile = useMemo(() => {
    void profileRevision;
    return profileById(mappingProfileId) ?? getActiveProfile();
  }, [mappingProfileId, profileRevision]);

  const model = mappingProfile.anki.modelName;

  useEffect(() => {
    const specFields = mappingProfile.anki.noteFields ?? [];
    if (!ankiStatus?.connected || !model) {
      setFields(specFields.length ? [...specFields] : []);
      return;
    }
    let alive = true;
    setFieldsLoading(true);
    setFieldsErr(null);
    void window.api.ankiModelFields(model).then((r) => {
      if (!alive) return;
      setFieldsLoading(false);
      if (r.ok && r.fields.length) setFields(r.fields);
      else if (specFields.length) setFields([...specFields]);
      else {
        setFields([]);
        setFieldsErr(r.error ?? 'Could not read this note type’s fields.');
      }
    });
    return () => {
      alive = false;
    };
  }, [model, ankiStatus?.connected, mappingProfile.id, mappingProfile.anki.noteFields]);

  useEffect(() => {
    if (!selectedPreset || !selectedFormat) return;
    const snap = JSON.stringify({
      preset: selectedPreset.label,
      format: selectedFormat.label,
      front: aiConfig.frontLang,
      back: aiConfig.backLang,
      reverse: aiConfig.reverse,
      gloss: [...aiConfig.backGlossLangs].sort().join(','),
      cardCount: aiConfig.cardCount,
      output: aiConfig.outputFormat,
      source: generationSource,
      items: wordCount,
      dictWords: savedWords.length,
    });
    if (!studioSnapRef.current) {
      studioSnapRef.current = snap;
      return;
    }
    if (snap === studioSnapRef.current) return;
    const prev = JSON.parse(studioSnapRef.current) as Record<string, string | number | boolean>;
    const next = JSON.parse(snap) as Record<string, string | number | boolean>;
    const fieldLabels: Array<[string, string]> = [
      ['preset', 'Preset'],
      ['format', 'Card format'],
      ['front', 'Front language'],
      ['back', 'Back language'],
      ['reverse', 'Reverse'],
      ['gloss', 'Extra glosses'],
      ['cardCount', 'Cards per word'],
      ['output', 'Output'],
      ['source', 'Source'],
      ['items', 'Items to generate'],
      ['dictWords', 'Dictionary words'],
    ];
    setLogLines((lines) => {
      let out = lines;
      for (const [key, label] of fieldLabels) {
        if (prev[key] === next[key]) continue;
        const from =
          key === 'front' || key === 'back'
            ? langLabel(String(prev[key]) as AiMiningLanguage)
            : String(prev[key] ?? '—');
        const to =
          key === 'front' || key === 'back'
            ? langLabel(String(next[key]) as AiMiningLanguage)
            : String(next[key] ?? '—');
        out = appendStudioLog(out, label, `${from} → ${to}`);
      }
      return out;
    });
    studioSnapRef.current = snap;
  }, [
    selectedPreset,
    selectedFormat,
    aiConfig.frontLang,
    aiConfig.backLang,
    aiConfig.reverse,
    aiConfig.backGlossLangs,
    aiConfig.cardCount,
    aiConfig.outputFormat,
    generationSource,
    wordCount,
    savedWords.length,
  ]);

  useEffect(() => {
    if (!fields.length) return;
    const prev = prevMappingRef.current;
    const next = mappingPreview.templates;
    let changed = false;
    setLogLines((lines) => {
      let out = lines;
      for (const field of fields) {
        const oldVal = prev[field] ?? '';
        const newVal = next[field] ?? '';
        if (oldVal === newVal) continue;
        changed = true;
        out = appendStudioLog(
          out,
          `Field: ${field}`,
          oldVal.trim() ? `"${oldVal}" → "${newVal}"` : `set to "${newVal}"`,
        );
      }
      return out;
    });
    if (changed || !Object.keys(prev).length) prevMappingRef.current = { ...next };
  }, [mappingPreview.templates, fields]);

  const cardsPerWord = useMemo(
    () => Math.max(1, Math.min(50, aiConfig.cardCount || 1)),
    [aiConfig.cardCount],
  );
  const formatTemplateCount = selectedFormat?.cardTemplates.length ?? 1;
  const itemCount = generationSource === 'preset' ? wordCount : savedWords.length;
  const estimatedCards = itemCount * cardsPerWord;
  const minedCardCount = useMemo(
    () => batchResults.reduce((sum, r) => sum + r.cards.length, 0),
    [batchResults],
  );
  const canGenerate =
    currentProviderKeySaved &&
    (generationSource === 'preset' || savedWords.length > 0);

  function deckGenerationRequest() {
    return {
      source: generationSource,
      wordCount: generationSource === 'preset' ? wordCount : undefined,
      terms:
        generationSource === 'dictionary'
          ? savedWords.map((word) => ({
              term: word.word,
              reading: word.reading || undefined,
            }))
          : undefined,
      presetId: aiConfig.selectedPresetId,
      providerId: aiConfig.providerId,
      formatId: aiConfig.selectedFormatId,
      cardCount: aiConfig.cardCount,
      outputFormat: aiConfig.outputFormat,
      frontLang: aiConfig.frontLang,
      backLang: aiConfig.backLang,
      reverse: aiConfig.reverse,
      backGlossLangs: aiConfig.backGlossLangs,
    };
  }

  async function runGenerate(): Promise<void> {
    if (!canGenerate) return;
    setAiBusy(true);
    setStatus('');
    setBatchResults([]);
    setGenProgress(null);
    setLogLines((lines) =>
      appendStudioLog(
        lines,
        'Generate',
        `Start · ${itemCount} item${itemCount === 1 ? '' : 's'} × ${cardsPerWord} cards/item ≈ ${estimatedCards} cards`,
      ),
    );
    try {
      const results = await window.api.aiGenerateDeck(deckGenerationRequest());
      setBatchResults(results);
      const cards = results.reduce((n, r) => n + r.cards.length, 0);
      const deckTitle = `${selectedPreset?.label ?? 'AI'} studio`;
      const saved = saveAiResultsToDeck(results, deckTitle);
      if (saved) onDeckImported?.();
      setStatus(
        `Generated ${cards} cards from ${results.length} ${generationSource === 'preset' ? 'invented items' : 'words'} · ${saved} saved to Flashcards.`,
      );
      setLogLines((lines) =>
        appendStudioLog(lines, 'Generate', `Done · ${cards} cards from ${results.length} items`),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message);
      setLogLines((lines) => appendStudioLog(lines, 'Generate', `Error · ${message}`));
    } finally {
      setAiBusy(false);
    }
  }

  async function exportCsv(): Promise<void> {
    if (!batchResults.length) return;
    const blocks = batchResults.map((r) => r.csv).filter(Boolean);
    if (!blocks.length) return;
    const combined = blocks.length === 1 ? blocks[0] : [blocks[0], ...blocks.slice(1).map((b) => b.split('\n').slice(1).join('\n'))].join('\n');
    const res = await window.api.aiSaveCsv(combined);
    if (res.ok && res.path) setStatus(`CSV saved to ${res.path}`);
    else if (res.error !== 'cancelled') setStatus(res.error ?? 'Could not save CSV.');
  }

  async function mineToAnki(): Promise<void> {
    if (!batchResults.length || !localizedFormat) return;
    let ok = 0;
    let total = 0;
    const localEntries: Parameters<typeof addDeckCards>[0] = [];
    for (const aiResult of batchResults) {
      for (const card of aiResult.cards) {
        total += 1;
        const res = await window.api.ankiMineNote({
          profileId: localizedFormat.profileId,
          term: aiResult.expression,
          reading: aiResult.reading,
          meaning: aiResult.meaning,
          sentence: aiResult.sentence,
          translations: {
            'meaning:en': aiResult.meaning,
            'meaning:ru': aiResult.meaningRu || aiResult.meaning,
            'meaning:zh': aiResult.meaningZh || aiResult.meaning,
            'sentence:en': aiResult.sentenceTranslationEn,
            'sentence:ru': aiResult.sentenceTranslationRu,
            'sentence:zh': aiResult.sentenceTranslationZh,
          },
          imageHtml: aiResult.imageHtml,
          prebuiltCard: { front: card.front, back: card.back },
          extraTags: card.tags,
        });
        if (res.ok) {
          ok += 1;
          localEntries.push({
            word: aiResult.expression,
            reading: aiResult.reading || '',
            meaning: aiResult.meaning || '',
            sentence: aiResult.sentence,
            front: card.front,
            back: card.back,
            source: 'epub-ai',
            bookTitle: selectedPreset?.label ?? 'AI card studio',
          });
        }
      }
    }
    if (localEntries.length) addDeckCards(localEntries);
    setStatus(`Sent ${ok} of ${total} cards to Anki${localEntries.length ? ` · ${localEntries.length} saved locally` : ''}.`);
  }

  function applyAiConfigPatch(patch: Partial<AiEngineConfig>): void {
    setAiConfig((prev) => normalizeAiEngineConfig({ ...prev, ...patch }));
  }

  async function saveApiKey(): Promise<void> {
    const draft = (apiKeyDraft || apiKeyInputRef.current?.value || '').trim();
    if (!draft) {
      setKeyStatusKind('error');
      setKeyStatus(`Paste a ${selectedProvider.label} API key above.`);
      return;
    }
    setSavingKey(true);
    setKeyStatus('Saving…');
    try {
      const result = await window.api.aiSetApiKey({ provider: selectedProvider.keyBucket, apiKey: draft });
      if (!result.ok) {
        setKeyStatusKind('error');
        setKeyStatus(result.error ?? 'Could not save key.');
        return;
      }
      setAiConfig((prev) => normalizeAiEngineConfig({ ...prev, apiKeysSet: result.apiKeysSet }));
      setApiKeyDraft('');
      setKeyStatusKind('ok');
      setKeyStatus(`${selectedProvider.label} API key saved.`);
    } catch (error) {
      setKeyStatusKind('error');
      setKeyStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingKey(false);
    }
  }

  async function saveLanguageOptions(patch: Partial<AiLanguageOptions>): Promise<void> {
    const result = await window.api.aiSetLanguageOptions(patch);
    setAiConfig((prev) => ({
      ...prev,
      frontLang: result.frontLang,
      backLang: result.backLang,
      reverse: result.reverse,
      backGlossLangs: result.backGlossLangs,
    }));
  }

  function toggleBackGlossLang(lang: AiMiningLanguage): void {
    const next = aiConfig.backGlossLangs.includes(lang)
      ? aiConfig.backGlossLangs.filter((entry) => entry !== lang)
      : [...aiConfig.backGlossLangs, lang];
    void saveLanguageOptions({ backGlossLangs: next });
  }

  return (
    <div className="mining-studio ai-card-studio">
      {(status || (keyStatus && keyStatusKind !== 'idle')) && (
        <div className="banner mining-status-top">{status || keyStatus}</div>
      )}

      <CollapsibleSection
        title="Provider & API key"
        summary={currentProviderKeySaved ? `${selectedProvider.label} key saved` : 'Connect Gemini or DeepSeek'}
        defaultOpen={!currentProviderKeySaved}
        className="mining-collapse anki-card"
      >
        <div className="mining-form-grid mining-form-grid-wide">
          <label>
            AI provider
            <select
              value={aiConfig.providerId}
              onChange={(e) => {
                const providerId = e.target.value as AiEngineConfig['providerId'];
                void window.api.aiSetProvider(providerId).then((result) =>
                  applyAiConfigPatch({
                    providerId: result.providerId,
                    apiKeysSet: result.apiKeysSet,
                  }),
                );
              }}
            >
              {AI_PROVIDERS.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
          </label>
          <label className="mining-api-key-field">
            API key
            <input
              ref={apiKeyInputRef}
              type="password"
              value={apiKeyDraft}
              onChange={(e) => setApiKeyDraft(e.target.value)}
              placeholder={currentProviderKeySaved ? 'Replace saved key…' : `Paste ${selectedProvider.label} key`}
            />
          </label>
        </div>
        <div className="mining-api-key-actions">
          <button className="btn primary" type="button" disabled={savingKey} onClick={() => void saveApiKey()}>
            {savingKey ? 'Saving…' : 'Save key'}
          </button>
        </div>
        {keyStatus && keyStatusKind !== 'idle' && (
          <div className={`banner mining-key-status mining-key-status-${keyStatusKind}`}>{keyStatus}</div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="How these settings connect"
        summary="Preset → language → profile → Anki fields"
        defaultOpen={false}
        className="mining-collapse anki-card ai-studio-flow-guide"
      >
        <ol className="ai-studio-flow-list">
          <li>
            <b>Preset</b> tells the AI <em>what to analyze</em> (idiom nuance, grammar stack, proper name, etc.)
            and ships a default card layout.
          </li>
          <li>
            <b>Language direction</b> shapes the AI card faces (what language appears on front vs back). It
            syncs from the preset profile when you change preset — you can still adjust it for extra glosses or
            production cues.
          </li>
          <li>
            <b>Anki profile</b> comes from the preset and controls field mapping. Each preset assigns one profile
            (e.g. Grammar Deconstruction → Sentence Mining).
          </li>
          <li>
            <b>Field mapping</b> routes AI output into Anki note fields. Variable palette tags like{' '}
            <code>{'{expression:ru}'}</code> pick which translation fills a field — separate from card face
            language.
          </li>
        </ol>
        <p className="muted collapse-lead">
          Panels on the right show the AI card example and the exact prompt sent to the model.
        </p>
      </CollapsibleSection>

      <CollapsibleSection
        title="1 · Preset & output"
        summary={`${selectedPreset?.label ?? 'What the AI analyzes'} · ${aiConfig.outputFormat.toUpperCase()} · ${cardsPerWord}/word`}
        defaultOpen
        className="mining-collapse anki-card"
      >
        <div className="mining-form-grid mining-form-grid-wide">
          <label>
            Preset
            <select
              value={aiConfig.selectedPresetId}
              onChange={(e) => {
                void window.api.aiSelectPreset(e.target.value).then((result) => applyAiConfigPatch(result));
              }}
            >
              {corePresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
              {specializedPresets.length > 0 && (
                <optgroup label="Specialized">
                  {specializedPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <label>
            Card format
            <select
              value={aiConfig.selectedFormatId}
              onChange={(e) => {
                const formatId = e.target.value;
                const fmt = formatsForCurrentPreset.find((f) => f.id === formatId);
                void window.api
                  .aiSetFormat({
                    formatId,
                    cardCount: fmt?.cardTemplates.length ?? aiConfig.cardCount,
                    outputFormat: fmt?.outputFormat,
                  })
                  .then((result) => applyAiConfigPatch(result));
              }}
            >
              {formatsForCurrentPreset.map((format) => (
                <option key={format.id} value={format.id}>
                  {format.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cards per word
            <input
              type="number"
              min={1}
              max={50}
              value={aiConfig.cardCount}
              onChange={(e) => {
                const cardCount = Math.max(1, Math.min(50, Number(e.target.value) || 1));
                void window.api.aiSetFormat({
                  formatId: aiConfig.selectedFormatId,
                  cardCount,
                  outputFormat: aiConfig.outputFormat,
                });
                setAiConfig((prev) => ({ ...prev, cardCount }));
              }}
            />
          </label>
          <label>
            Output
            <select
              value={aiConfig.outputFormat}
              onChange={(e) => {
                const outputFormat = e.target.value as 'anki' | 'csv';
                void window.api.aiSetFormat({
                  formatId: aiConfig.selectedFormatId,
                  cardCount: aiConfig.cardCount,
                  outputFormat,
                });
                setAiConfig((prev) => ({ ...prev, outputFormat }));
              }}
            >
              <option value="anki">Anki</option>
              <option value="csv">CSV</option>
            </select>
          </label>
        </div>
        {selectedPreset && <p className="muted mining-preset-note">{selectedPreset.description}</p>}
        {selectedFormat && (
          <p className="muted ai-studio-meta">
            Anki profile: <b>{profileById(selectedFormat.profileId)?.label ?? selectedFormat.profileId}</b>
            {formatTemplateCount < cardsPerWord && (
              <>
                {' '}· this preset has {formatTemplateCount} template{formatTemplateCount === 1 ? '' : 's'} —
                higher counts repeat the cycle
              </>
            )}
          </p>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="2 · Language direction"
        summary={languageDirectionLabel(aiConfig)}
        defaultOpen
        className="mining-collapse anki-card"
      >
        <p className="muted collapse-lead">
          Shapes AI card front/back text. Changing preset resets direction to match that preset profile. Extra
          glosses add more languages on the back face only.
        </p>
        <div className="mining-form-grid mining-language-grid">
          <label>
            Front language
            <select
              value={aiConfig.frontLang}
              onChange={(e) => void saveLanguageOptions({ frontLang: e.target.value as AiMiningLanguage })}
            >
              {AI_MINING_LANGUAGES.map((lang) => (
                <option key={lang.id} value={lang.id}>
                  {lang.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Back language
            <select
              value={aiConfig.backLang}
              onChange={(e) => void saveLanguageOptions({ backLang: e.target.value as AiMiningLanguage })}
            >
              {AI_MINING_LANGUAGES.map((lang) => (
                <option key={lang.id} value={lang.id}>
                  {lang.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mining-language-presets">
          {AI_LANGUAGE_DIRECTION_PRESETS.filter((p) => p.id !== 'reverse').map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="btn mining-lang-preset"
              onClick={() =>
                void saveLanguageOptions({
                  frontLang: preset.frontLang,
                  backLang: preset.backLang,
                  reverse: preset.reverse,
                  backGlossLangs: [...preset.backGlossLangs],
                })
              }
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="mining-language-gloss-row">
          <span className="fm-palette-label">Extra glosses on back</span>
          {AI_MINING_LANGUAGES.filter((lang) => lang.id !== aiConfig.backLang).map((lang) => (
            <label key={lang.id} className="mining-gloss-check">
              <input
                type="checkbox"
                checked={aiConfig.backGlossLangs.includes(lang.id)}
                onChange={() => toggleBackGlossLang(lang.id)}
              />
              {lang.label}
            </label>
          ))}
        </div>
      </CollapsibleSection>

      <AiStudioConfigLog lines={logLines} onClear={() => setLogLines([])} />

      <section className="anki-card ai-studio-mapping-section">
        <h2 className="mining-pane-title">3 · Anki field mapping</h2>
        <p className="muted ai-studio-lead">
          Profile <b>{mappingProfile.label}</b> (from preset) · note type <b>{model || '—'}</b>. These templates
          route AI output into Anki when you send cards.
        </p>
        <div className="fm-split ai-studio-split">
          <div className="fm-split-editor">
            {fieldsLoading && <div className="muted">Reading note type fields…</div>}
            {fieldsErr && <div className="form-msg err">{fieldsErr}</div>}
            {!fieldsLoading && fields.length === 0 && (
              <div className="muted">No fields found for this profile’s note type.</div>
            )}
            {fields.length > 0 && (
              <FieldMappingEditor
                key={`${mappingProfile.id}::${model}`}
                profile={mappingProfile}
                fields={fields}
                onMessage={setMapMsg}
                onChange={setMappingPreview}
                hideExamplesFallback
                usePackDefaults
              />
            )}
            {mapMsg && <div className={`form-msg ${mapMsg.kind}`}>{mapMsg.text}</div>}
          </div>
          {selectedPreset && localizedFormat && (
            <AiStudioPreviewPanel
              preset={selectedPreset}
              localizedFormat={localizedFormat}
              mappingProfile={mappingProfile}
              generationSource={generationSource}
              aiConfig={aiConfig}
              wordCount={wordCount}
            />
          )}
        </div>
      </section>

      <section className="anki-card download-deck-panel ai-mine-panel">
        <h2 className="download-deck-title">4 · Generate cards</h2>
        <div className="download-deck-info">
          {selectedPreset && localizedFormat ? (
            <>
              <b>{selectedPreset.label}</b> · {localizedFormat.label}
              <br />
              Profile <code>{mappingProfile.label}</code> · {cardsPerWord} card{cardsPerWord === 1 ? '' : 's'} per
              word · {aiConfig.outputFormat.toUpperCase()} output · {languageDirectionLabel(aiConfig)}
            </>
          ) : (
            'Choose a preset and card format above.'
          )}
        </div>
        <div className="mining-form-grid ai-generate-source-grid">
          <label>
            Source
            <select
              value={generationSource}
              onChange={(e) => setGenerationSource(e.target.value as AiDeckGenerationSource)}
            >
              <option value="preset">From preset (AI invents vocabulary)</option>
              <option value="dictionary">From dictionary stars</option>
            </select>
          </label>
          {generationSource === 'preset' ? (
            <label>
              Items to generate
              <input
                type="number"
                min={1}
                max={50}
                value={wordCount}
                onChange={(e) => setWordCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
              />
            </label>
          ) : (
            <label>
              Dictionary words
              <input type="text" readOnly value={`${savedWords.length} starred`} />
            </label>
          )}
        </div>
        <p className="muted collapse-lead">
          {generationSource === 'preset' ? (
            <>
              AI invents <b>{wordCount}</b> vocabulary items. Each item becomes{' '}
              <b>{cardsPerWord}</b> card{cardsPerWord === 1 ? '' : 's'} → approx{' '}
              <b>{estimatedCards}</b> total ({wordCount} × {cardsPerWord}).
            </>
          ) : (
            <>
              <b>{savedWords.length}</b> dictionary word{savedWords.length === 1 ? '' : 's'} ×{' '}
              <b>{cardsPerWord}</b> cards each → approx <b>{estimatedCards}</b> cards.
            </>
          )}
        </p>
        <AiGenerationProgressPanel progress={genProgress} active={aiBusy} />
        <div className="download-deck-footer ai-mine-footer">
          <span className="download-deck-result">
            Result: approx <b>{batchResults.length ? minedCardCount : estimatedCards}</b> cards
            {genProgress?.message && aiBusy && <span className="muted"> · {genProgress.message}</span>}
            {!canGenerate && currentProviderKeySaved && generationSource === 'dictionary' && savedWords.length === 0 && (
              <span className="muted"> · star words in Dictionary first</span>
            )}
          </span>
          <div className="ai-mine-actions">
            <button
              className="btn primary download-deck-btn"
              type="button"
              disabled={!canGenerate || aiBusy}
              onClick={() => void runGenerate()}
            >
              <Icon name="download" size={16} />
              {aiBusy ? 'Generating…' : 'Generate cards'}
            </button>
            <button
              className="btn"
              type="button"
              disabled={!minedCardCount}
              onClick={() => void mineToAnki()}
            >
              Send to Anki
            </button>
            <button
              className="btn"
              type="button"
              disabled={!batchResults.length}
              onClick={() => {
                const n = saveAiResultsToDeck(batchResults, `${selectedPreset?.label ?? 'AI'} studio`);
                if (n) {
                  onDeckImported?.();
                  setStatus(`Saved ${n} cards to Flashcards.`);
                }
              }}
            >
              Save to flashcards
            </button>
            <button
              className="btn"
              type="button"
              disabled={!batchResults.length}
              onClick={() => void exportCsv()}
            >
              Export CSV
            </button>
          </div>
        </div>
      </section>

      {batchResults.length > 0 && (
        <div className="flash-strip-section anki-card">
          <div className="flash-strip-head">
            <span className="flash-section-title">Generated cards</span>
            <span className="muted">
              {minedCardCount} cards from {batchResults.length} words
            </span>
          </div>
          <div className="flash-strip" role="list">
            {batchResults.flatMap((result) =>
              result.cards.map((card, i) => (
                <article key={`${result.expression}-${card.label}-${i}`} className="flash-strip-card" role="listitem">
                  <span className="flash-strip-word" lang="ja">
                    {result.expression}
                  </span>
                  <span className="flash-strip-meaning">{card.label}</span>
                </article>
              )),
            ).slice(0, 32)}
          </div>
        </div>
      )}

      {!currentProviderKeySaved && (
        <p className="muted ai-studio-hint">Save an API key above to enable generation.</p>
      )}
      {currentProviderKeySaved && generationSource === 'dictionary' && savedWords.length === 0 && (
        <p className="muted ai-studio-hint">
          Open Dictionary, look up words, and tap the star icon — or switch source to preset generation.
        </p>
      )}
    </div>
  );
}
