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
// Direct rather than via the shared/mining barrel — see the note in
// shared/mining.ts about Blanc's boot chunk.
import { AI_PROMPT_PRESETS, formatsForPreset } from '../../shared/aiMiningCatalog';
import {
  AI_LANGUAGE_DIRECTION_PRESETS,
  AI_MINING_LANGUAGES,
  AI_PROVIDERS,
  DEFAULT_AI_PROVIDER_ID,
  applyLanguageOptionsToFormat,
  effectiveLanguagePair,
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
import { shouldClaimAgentCardBatch } from '../../shared/agentCardBatchStaging';
import type { AgentStagedCardBatch } from '../../shared/agentCardBatchStaging';
import { onAgentCardBatchStaged, takeAgentCardBatch } from '../agentCardBatchStagingClient';
import { loadSaved, onSavedChanged, type SavedWord } from '../savedWords';
import { getActiveProfile, getProfiles, onProfileChanged } from '../profileState';
import type { AnkiStatus } from '../../shared/types';
import { useT } from '../i18n';

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
    engine: raw?.engine === 'local-qwen' ? 'local-qwen' : 'cloud',
    providerId,
    selectedPresetId: raw?.selectedPresetId ?? AI_PROMPT_PRESETS[0]?.id ?? 'idiom-slang',
    selectedFormatId: raw?.selectedFormatId ?? 'idiom-slang-recognition',
    cardCount: Math.max(1, Math.min(50, Math.round(raw?.cardCount ?? 1))),
    outputFormat: raw?.outputFormat === 'csv' ? 'csv' : 'anki',
    localModelAvailable: Boolean(raw?.localModelAvailable),
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

const LOG_FIELD_KEYS: Array<[string, string]> = [
  ['preset', 'aiStudio.log.field.preset'],
  ['format', 'aiStudio.log.field.format'],
  ['front', 'aiStudio.log.field.front'],
  ['back', 'aiStudio.log.field.back'],
  ['reverse', 'aiStudio.log.field.reverse'],
  ['gloss', 'aiStudio.log.field.gloss'],
  ['cardCount', 'aiStudio.log.field.cardCount'],
  ['output', 'aiStudio.log.field.output'],
  ['source', 'aiStudio.log.field.source'],
  ['items', 'aiStudio.log.field.items'],
  ['dictWords', 'aiStudio.log.field.dictWords'],
];

export default function AiCardStudio({ onDeckImported }: AiCardStudioProps = {}) {
  const { t, lang } = useT();
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
  /**
   * The Agent-generated batch this preview is showing, if it did not come from
   * the form. Held only to name the deck and to label the preview — the cards
   * themselves live in `batchResults`, the same state a local batch lands in, so
   * every action the studio already offers works on it without knowing.
   */
  const [agentBatch, setAgentBatch] = useState<AgentStagedCardBatch | null>(null);
  const [status, setStatus] = useState('');
  const syncedPresetKey = useRef('');
  const studioSnapRef = useRef('');
  const prevMappingRef = useRef<Record<string, string>>({});

  const langLabel = (id: AiMiningLanguage) => t(`aiStudio.lang.${id}`);

  const directionLabel = (options: AiLanguageOptions) => {
    const normalized = normalizeLanguageOptions(options);
    const { front, back } = effectiveLanguagePair(normalized);
    const extras = normalized.backGlossLangs
      .filter((entry) => entry !== back)
      .map((entry) => langLabel(entry));
    if (extras.length) {
      return t('aiStudio.direction.withExtras', {
        front: langLabel(front),
        back: langLabel(back),
        extras: extras.join(' + '),
      });
    }
    return t('aiStudio.direction.pair', { front: langLabel(front), back: langLabel(back) });
  };

  useEffect(() => {
    return window.api.onAiGenerateProgress(setGenProgress);
  }, []);

  useEffect(() => {
    return onProfileChanged(() => setProfileRevision((n) => n + 1));
  }, []);

  useEffect(() => onSavedChanged(() => setSavedWords(loadSaved())), []);

  /**
   * Adopts a batch the Agent generated, so `flashcard.generate-cards` ends in
   * this editor instead of as rows in a chat.
   *
   * Claimed on mount — which covers "the user walks to Flashcards afterwards" —
   * and on main's announcement, which covers the other order: this window
   * already open while the Agent generates in a pop-out. The claim is
   * single-use, so both firing is harmless; the second finds the slot empty.
   *
   * `shouldClaimAgentCardBatch` is the whole rule and lives in shared code so a
   * test holds it rather than this conditional: adopt only into an EMPTY
   * preview, because replacing an unsaved local batch would delete work that is
   * on screen and has never been written to a deck. `aiBusy` is checked for the
   * same reason one step earlier — `runGenerate` empties the preview before it
   * awaits, so an in-flight local generation looks empty and is not.
   *
   * The refs exist so this effect can read the current preview without being
   * re-subscribed on every keystroke of generation progress. A batch that
   * cannot be adopted stays in main for the next mount, or expires.
   */
  const batchCountRef = useRef(0);
  const aiBusyRef = useRef(false);
  batchCountRef.current = batchResults.length;
  aiBusyRef.current = aiBusy;

  useEffect(() => {
    let cancelled = false;
    const claim = async (): Promise<void> => {
      if (aiBusyRef.current || !shouldClaimAgentCardBatch(batchCountRef.current)) return;
      const result = await takeAgentCardBatch();
      if (cancelled || !result.ok || !result.batch) return;
      // Re-checked after the round trip. In the losing race the batch is
      // dropped rather than shown, which is the same outcome as the local
      // generation that won overwriting it a moment later — and unlike that, it
      // cannot discard the preview the user is looking at.
      if (aiBusyRef.current || !shouldClaimAgentCardBatch(batchCountRef.current)) return;
      setAgentBatch(result.batch);
      setBatchResults(result.batch.results);
    };
    void claim();
    const unsubscribe = onAgentCardBatchStaged(() => {
      void claim();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

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
  const engineReady =
    aiConfig.engine === 'local-qwen' ? Boolean(aiConfig.localModelAvailable) : currentProviderKeySaved;

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
            t('aiStudio.log.field.languageDirection'),
            t('aiStudio.log.syncedTo', {
              front: langLabel(profileLangOptions.frontLang),
              back: langLabel(profileLangOptions.backLang),
            }),
          ),
        );
      });
    }
  }, [selectedFormat, profileLangOptions, aiConfig.selectedPresetId, aiConfig.selectedFormatId, lang]);

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
        setFieldsErr(r.error ?? t('aiStudio.mapping.fieldsErr'));
      }
    });
    return () => {
      alive = false;
    };
  }, [model, ankiStatus?.connected, mappingProfile.id, mappingProfile.anki.noteFields, lang]);

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
    setLogLines((lines) => {
      let out = lines;
      for (const [key, labelKey] of LOG_FIELD_KEYS) {
        if (prev[key] === next[key]) continue;
        const from =
          key === 'front' || key === 'back'
            ? langLabel(String(prev[key]) as AiMiningLanguage)
            : String(prev[key] ?? '—');
        const to =
          key === 'front' || key === 'back'
            ? langLabel(String(next[key]) as AiMiningLanguage)
            : String(next[key] ?? '—');
        out = appendStudioLog(out, t(labelKey), t('aiStudio.log.changeArrow', { from, to }));
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
    lang,
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
          t('aiStudio.log.field.mapping', { field }),
          oldVal.trim()
            ? t('aiStudio.log.mapping.change', { from: oldVal, to: newVal })
            : t('aiStudio.log.mapping.set', { value: newVal }),
        );
      }
      return out;
    });
    if (changed || !Object.keys(prev).length) prevMappingRef.current = { ...next };
  }, [mappingPreview.templates, fields, lang]);

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
    engineReady && (generationSource === 'preset' || savedWords.length > 0);

  const currentDirectionLabel = useMemo(
    () => directionLabel(aiConfig),
    [lang, aiConfig.frontLang, aiConfig.backLang, aiConfig.reverse, aiConfig.backGlossLangs],
  );

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
    // A local run replaces the preview, so the adopted batch's label must go
    // with it — leaving it would save the new cards under the Agent batch's
    // deck name, and for a `book` batch under its book id too.
    setAgentBatch(null);
    setGenProgress(null);
    setLogLines((lines) =>
      appendStudioLog(
        lines,
        t('aiStudio.log.field.generate'),
        t('aiStudio.log.generateStart', { count: itemCount, cards: cardsPerWord, total: estimatedCards }),
      ),
    );
    try {
      const results = await window.api.aiGenerateDeck(deckGenerationRequest());
      setBatchResults(results);
      const cards = results.reduce((n, r) => n + r.cards.length, 0);
      // Generation does NOT write. It used to call `saveAiResultsToDeck` right
      // here — before this preview had rendered — and that goes through
      // `replaceImportedDeck`, which deletes every card in the matched
      // `(bookId, bookTitle)` group before inserting. Both batches land under
      // `<preset> studio`, so generating a second time silently destroyed the
      // first, with no confirmation and nothing to undo. The Save to flashcards
      // button below has always existed; it is now the only way in, which makes
      // the destructive write an explicit choice made against a visible preview.
      setStatus(
        t(
          generationSource === 'preset' ? 'aiStudio.status.generatedPreset' : 'aiStudio.status.generatedDict',
          { cards, count: results.length },
        ),
      );
      setLogLines((lines) =>
        appendStudioLog(
          lines,
          t('aiStudio.log.field.generate'),
          t('aiStudio.log.generateDone', { cards, count: results.length }),
        ),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message);
      setLogLines((lines) =>
        appendStudioLog(
          lines,
          t('aiStudio.log.field.generate'),
          t('aiStudio.log.generateError', { message }),
        ),
      );
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
    if (res.ok && res.path) setStatus(t('aiStudio.status.csvSaved', { path: res.path }));
    else if (res.error !== 'cancelled') setStatus(res.error ?? t('aiStudio.status.csvFail'));
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
            // Same rule as the flashcards save: an adopted batch keeps its own
            // deck name so the local mirror of an Anki send lands where the
            // batch belongs. The existing fallback is left exactly as it was —
            // changing it would regroup decks users already have.
            bookTitle: agentBatch?.deckLabel ?? selectedPreset?.label ?? 'AI card studio',
          });
        }
      }
    }
    if (localEntries.length) addDeckCards(localEntries);
    setStatus(
      localEntries.length
        ? t('aiStudio.status.sentAnkiLocal', { ok, total, local: localEntries.length })
        : t('aiStudio.status.sentAnki', { ok, total }),
    );
  }

  function applyAiConfigPatch(patch: Partial<AiEngineConfig>): void {
    setAiConfig((prev) => normalizeAiEngineConfig({ ...prev, ...patch }));
  }

  async function saveApiKey(): Promise<void> {
    const draft = (apiKeyDraft || apiKeyInputRef.current?.value || '').trim();
    if (!draft) {
      setKeyStatusKind('error');
      setKeyStatus(t('aiStudio.status.pasteKey', { provider: selectedProvider.label }));
      return;
    }
    setSavingKey(true);
    setKeyStatus(t('aiStudio.status.saving'));
    try {
      const result = await window.api.aiSetApiKey({ provider: selectedProvider.keyBucket, apiKey: draft });
      if (!result.ok) {
        setKeyStatusKind('error');
        setKeyStatus(result.error ?? t('aiStudio.status.couldNotSaveKey'));
        return;
      }
      setAiConfig((prev) => normalizeAiEngineConfig({ ...prev, apiKeysSet: result.apiKeysSet }));
      setApiKeyDraft('');
      setKeyStatusKind('ok');
      setKeyStatus(t('aiStudio.status.keySaved', { provider: selectedProvider.label }));
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

  function toggleBackGlossLang(langId: AiMiningLanguage): void {
    const next = aiConfig.backGlossLangs.includes(langId)
      ? aiConfig.backGlossLangs.filter((entry) => entry !== langId)
      : [...aiConfig.backGlossLangs, langId];
    void saveLanguageOptions({ backGlossLangs: next });
  }

  return (
    <div className="mining-studio ai-card-studio">
      {(status || (keyStatus && keyStatusKind !== 'idle')) && (
        <div className="banner mining-status-top">{status || keyStatus}</div>
      )}

      <CollapsibleSection
        title={t('aiStudio.section.provider')}
        summary={
          aiConfig.engine === 'local-qwen'
            ? aiConfig.localModelAvailable
              ? t('aiStudio.summary.localReady')
              : t('aiStudio.summary.localMissing')
            : currentProviderKeySaved
              ? t('aiStudio.summary.keySaved', { provider: selectedProvider.label })
              : t('aiStudio.summary.connect')
        }
        defaultOpen={!engineReady}
        className="mining-collapse anki-card"
      >
        <div className="mining-form-grid mining-form-grid-wide">
          <label>
            {t('aiStudio.label.engine')}
            <select
              value={aiConfig.engine}
              onChange={(e) => {
                const engine = e.target.value === 'local-qwen' ? 'local-qwen' : 'cloud';
                void window.api.aiSetEngine(engine).then((result) =>
                  applyAiConfigPatch(normalizeAiEngineConfig(result)),
                );
              }}
            >
              <option value="cloud">{t('aiStudio.engine.cloud')}</option>
              <option value="local-qwen">{t('aiStudio.engine.local')}</option>
            </select>
          </label>
          {aiConfig.engine === 'cloud' ? (
            <>
              <label>
                {t('aiStudio.label.provider')}
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
                {t('aiStudio.label.apiKey')}
                <input
                  ref={apiKeyInputRef}
                  type="password"
                  value={apiKeyDraft}
                  onChange={(e) => setApiKeyDraft(e.target.value)}
                  placeholder={
                    currentProviderKeySaved
                      ? t('aiStudio.placeholder.replaceKey')
                      : t('aiStudio.placeholder.pasteKey', { provider: selectedProvider.label })
                  }
                />
              </label>
            </>
          ) : (
            <p className={`muted mining-engine-status${aiConfig.localModelAvailable ? ' ok' : ' warn'}`}>
              {aiConfig.localModelAvailable
                ? t('aiStudio.local.ready')
                : t('aiStudio.local.missing')}
            </p>
          )}
        </div>
        {aiConfig.engine === 'cloud' && (
          <div className="mining-api-key-actions">
            <button className="btn primary" type="button" disabled={savingKey} onClick={() => void saveApiKey()}>
              {savingKey ? t('aiStudio.status.saving') : t('aiStudio.btn.saveKey')}
            </button>
          </div>
        )}
        {keyStatus && keyStatusKind !== 'idle' && (
          <div className={`banner mining-key-status mining-key-status-${keyStatusKind}`}>{keyStatus}</div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title={t('aiStudio.section.flowGuide')}
        summary={t('aiStudio.summary.flow')}
        defaultOpen={false}
        className="mining-collapse anki-card ai-studio-flow-guide"
      >
        <ol className="ai-studio-flow-list">
          <li>
            <b>{t('aiStudio.flow.presetTitle')}</b> {t('aiStudio.flow.presetBody')}
          </li>
          <li>
            <b>{t('aiStudio.flow.languageTitle')}</b> {t('aiStudio.flow.languageBody')}
          </li>
          <li>
            <b>{t('aiStudio.flow.profileTitle')}</b> {t('aiStudio.flow.profileBody')}
          </li>
          <li>
            <b>{t('aiStudio.flow.mappingTitle')}</b> {t('aiStudio.flow.mappingBody')}
          </li>
        </ol>
        <p className="muted collapse-lead">{t('aiStudio.flow.footer')}</p>
      </CollapsibleSection>

      <CollapsibleSection
        title={t('aiStudio.section.preset')}
        summary={`${selectedPreset?.label ?? t('aiStudio.summary.analyzes')} · ${aiConfig.outputFormat.toUpperCase()} · ${t('aiStudio.summary.perWord', { n: cardsPerWord })}`}
        defaultOpen
        className="mining-collapse anki-card"
      >
        <div className="mining-form-grid mining-form-grid-wide">
          <label>
            {t('aiStudio.label.preset')}
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
                <optgroup label={t('aiStudio.optgroup.specialized')}>
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
            {t('aiStudio.label.cardFormat')}
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
            {t('aiStudio.label.cardsPerWord')}
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
            {t('aiStudio.label.output')}
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
              <option value="anki">{t('aiStudio.output.anki')}</option>
              <option value="csv">{t('aiStudio.output.csv')}</option>
            </select>
          </label>
        </div>
        {selectedPreset && <p className="muted mining-preset-note">{selectedPreset.description}</p>}
        {selectedFormat && (
          <p className="muted ai-studio-meta">
            {t('aiStudio.meta.ankiProfile')}{' '}
            <b>{profileById(selectedFormat.profileId)?.label ?? selectedFormat.profileId}</b>
            {formatTemplateCount < cardsPerWord && (
              <>
                {' '}
                · {t('aiStudio.meta.templateNote', { count: formatTemplateCount })}
              </>
            )}
          </p>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title={t('aiStudio.section.language')}
        summary={currentDirectionLabel}
        defaultOpen
        className="mining-collapse anki-card"
      >
        <p className="muted collapse-lead">{t('aiStudio.language.lead')}</p>
        <div className="mining-form-grid mining-language-grid">
          <label>
            {t('aiStudio.label.frontLang')}
            <select
              value={aiConfig.frontLang}
              onChange={(e) => void saveLanguageOptions({ frontLang: e.target.value as AiMiningLanguage })}
            >
              {AI_MINING_LANGUAGES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {langLabel(entry.id)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('aiStudio.label.backLang')}
            <select
              value={aiConfig.backLang}
              onChange={(e) => void saveLanguageOptions({ backLang: e.target.value as AiMiningLanguage })}
            >
              {AI_MINING_LANGUAGES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {langLabel(entry.id)}
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
              {t(`aiStudio.dirPreset.${preset.id}`)}
            </button>
          ))}
        </div>
        <div className="mining-language-gloss-row">
          <span className="fm-palette-label">{t('aiStudio.label.extraGlosses')}</span>
          {AI_MINING_LANGUAGES.filter((entry) => entry.id !== aiConfig.backLang).map((entry) => (
            <label key={entry.id} className="mining-gloss-check">
              <input
                type="checkbox"
                checked={aiConfig.backGlossLangs.includes(entry.id)}
                onChange={() => toggleBackGlossLang(entry.id)}
              />
              {langLabel(entry.id)}
            </label>
          ))}
        </div>
      </CollapsibleSection>

      <AiStudioConfigLog lines={logLines} onClear={() => setLogLines([])} />

      <section className="anki-card ai-studio-mapping-section">
        <h2 className="mining-pane-title">{t('aiStudio.section.mapping')}</h2>
        <p className="muted ai-studio-lead">
          {t('aiStudio.mapping.lead', {
            profile: mappingProfile.label,
            model: model || '—',
          })}
        </p>
        <div className="fm-split ai-studio-split">
          <div className="fm-split-editor">
            {fieldsLoading && <div className="muted">{t('aiStudio.mapping.readingFields')}</div>}
            {fieldsErr && <div className="form-msg err">{fieldsErr}</div>}
            {!fieldsLoading && fields.length === 0 && (
              <div className="muted">{t('aiStudio.mapping.noFields')}</div>
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
        <h2 className="download-deck-title">{t('aiStudio.section.generate')}</h2>
        <div className="download-deck-info">
          {selectedPreset && localizedFormat ? (
            <>
              <b>{selectedPreset.label}</b> · {localizedFormat.label}
              <br />
              {t('aiStudio.generate.infoDetail', {
                profile: mappingProfile.label,
                count: cardsPerWord,
                output: aiConfig.outputFormat.toUpperCase(),
                direction: currentDirectionLabel,
              })}
            </>
          ) : (
            t('aiStudio.generate.chooseAbove')
          )}
        </div>
        <div className="mining-form-grid ai-generate-source-grid">
          <label>
            {t('aiStudio.label.source')}
            <select
              value={generationSource}
              onChange={(e) => setGenerationSource(e.target.value as AiDeckGenerationSource)}
            >
              <option value="preset">{t('aiStudio.source.preset')}</option>
              <option value="dictionary">{t('aiStudio.source.dictionary')}</option>
            </select>
          </label>
          {generationSource === 'preset' ? (
            <label>
              {t('aiStudio.label.itemsToGenerate')}
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
              {t('aiStudio.label.dictionaryWords')}
              <input type="text" readOnly value={t('aiStudio.starredCount', { count: savedWords.length })} />
            </label>
          )}
        </div>
        <p className="muted collapse-lead">
          {generationSource === 'preset'
            ? t(cardsPerWord === 1 ? 'aiStudio.estimate.presetOneCard' : 'aiStudio.estimate.preset', {
                items: wordCount,
                cards: cardsPerWord,
                total: estimatedCards,
              })
            : t('aiStudio.estimate.dictionary', {
                count: savedWords.length,
                cards: cardsPerWord,
                total: estimatedCards,
              })}
        </p>
        <AiGenerationProgressPanel progress={genProgress} active={aiBusy} />
        <div className="download-deck-footer ai-mine-footer">
          <span className="download-deck-result">
            {t('aiStudio.result.approx', { count: batchResults.length ? minedCardCount : estimatedCards })}
            {genProgress?.message && aiBusy && <span className="muted"> · {genProgress.message}</span>}
            {!canGenerate && engineReady && generationSource === 'dictionary' && savedWords.length === 0 && (
              <span className="muted"> · {t('aiStudio.hint.starFirst')}</span>
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
              {aiBusy ? t('aiStudio.btn.generating') : t('aiStudio.btn.generate')}
            </button>
            <button
              className="btn"
              type="button"
              disabled={!minedCardCount}
              onClick={() => void mineToAnki()}
            >
              {t('aiStudio.btn.sendAnki')}
            </button>
            <button
              className="btn"
              type="button"
              disabled={!batchResults.length}
              onClick={() => {
                // An adopted batch keeps the name its stager resolved, so an
                // Agent chapter-range run saves into the same group a manual
                // mining run of that range would. Its id is passed rather than
                // re-derived: `deckBookId` cannot tell two Japanese titles
                // apart. See `AgentStagedCardBatch.deckBookId`.
                const n = saveAiResultsToDeck(
                  batchResults,
                  agentBatch?.deckLabel ?? `${selectedPreset?.label ?? 'AI'} studio`,
                  agentBatch?.deckBookId,
                );
                if (n) {
                  onDeckImported?.();
                  setStatus(t('aiStudio.status.savedFlash', { count: n }));
                }
              }}
            >
              {t('aiStudio.btn.saveFlash')}
            </button>
            <button
              className="btn"
              type="button"
              disabled={!batchResults.length}
              onClick={() => void exportCsv()}
            >
              {t('aiStudio.btn.exportCsv')}
            </button>
          </div>
        </div>
      </section>

      {batchResults.length > 0 && (
        <div className="flash-strip-section anki-card">
          <div className="flash-strip-head">
            <span className="flash-section-title">{t('aiStudio.generated.title')}</span>
            <span className="muted">
              {t('aiStudio.generated.summary', { cards: minedCardCount, count: batchResults.length })}
            </span>
          </div>
          {agentBatch && (
            // Says where this preview came from and, more importantly, that
            // nothing has been written yet — the batch cost a provider call and
            // reaches a deck only through the button above.
            // `mining-preset-note` rather than a new class: it is the treatment
            // this component already gives an explanatory line under a heading,
            // and reusing it keeps a shared, foreign-modified stylesheet out of
            // this slice's diff.
            <p className="muted mining-preset-note">
              {t('aiStudio.agentBatch.note', { deck: agentBatch.deckLabel })}
            </p>
          )}
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

      {!engineReady && aiConfig.engine === 'cloud' && (
        <p className="muted ai-studio-hint">{t('aiStudio.hint.saveKey')}</p>
      )}
      {!engineReady && aiConfig.engine === 'local-qwen' && (
        <p className="muted ai-studio-hint">{t('aiStudio.hint.localMissing')}</p>
      )}
      {engineReady && generationSource === 'dictionary' && savedWords.length === 0 && (
        <p className="muted ai-studio-hint">{t('aiStudio.hint.starOrPreset')}</p>
      )}
    </div>
  );
}
