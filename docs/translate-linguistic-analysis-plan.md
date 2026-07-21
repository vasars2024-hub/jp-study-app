# Translate View: Smart Linguistic Analysis Panels — Implementation Plan

Status: **implemented 2026-07-16** (all 13 checklist steps; verified via vitest + eslint + boot smoke test — the manual key-dependent matrix below still needs a hands-on pass).

## Context

The app's Translate view (`src/renderer/views/TranslateView.tsx`) is currently a plain two-pane translator (ja/zh/en/ru) powered by the offline Qwen3 model — it returns a translated string and nothing else. For serious language study this isn't enough: professionals need to see *why* a sentence was translated a certain way. This plan adds four linguistic-analysis panels alongside the translation:

1. **Smart Particle Analysis (Japanese)** — visually separate and explain grammatical particles (は/が/に/を/で/etc.), since they drastically change emphasis (topic vs. subject, etc.).
2. **Case Declension & Gender Breakdown (Russian)** — an interactive "Grammar Drawer" showing the declension table (6 cases × gender/number) for nouns/adjectives/verbs in a Russian translation, so structural agreement can be verified.
3. **Formality control** — instantly toggle a translated sentence between casual / polite / business-safe register.
4. **Aspectual & Measure Word Guide (Chinese)** — dynamically suggest the correct measure word/classifier (只 vs 条 etc.) and surface aspect particles (了/着/过) when translating into Chinese.

Declension, measure-word choice, and formality rewriting all require an LLM to return reliable structured data — the offline Qwen3 path has no schema enforcement, only the existing cloud path (Gemini/DeepSeek via `AiProviderId`) does. So those three panels will require a configured cloud API key (same gate the EPUB-mining fail-switch already uses) and will show a "connect a key" nudge otherwise. **Japanese particle detection must work fully offline** — the app's kuromoji tokenizer already tags particles (`pos === '助詞'`), so segmentation and generic role labels need no network call; only the *sentence-specific explanation* text is LLM-sourced. All four panels are planned as one implementation pass (not phased).

## Key decisions

- **Formality = 3-state segmented control, not a literal `<input type="range">`.** Casual/Polite/Business-safe are discrete unordered categories, not a continuum — every existing slider in this app (zoom, warmth, volume) controls a genuinely continuous value. The plan reuses the segmented-button idiom already live in `TranslateView.tsx` (`.dict-lang-toggle` / `.gram-level-btn.active`, lines 112–136), with an added absolutely-positioned thumb that CSS-transforms to the active button to get the "sliding" feel without new drag logic.
- **One combined LLM call per analyzed sentence**, not four. Formality applies to every target language, so whenever a cloud key is configured there's always at least one relevant panel — a single `translate:analyze` IPC call will return whichever of `{formality, particleNotes, declension, measureWords, aspectNotes}` apply, built from one JSON schema assembled per source/target pair.
- **Reuse, don't triplicate, the Gemini/DeepSeek HTTP callers.** `src/main/mining.ts` already has generic-enough `callGeminiApi`/`callDeepSeekApi`/`callAiProvider`/`parseAiJson` (~lines 1015–1151) that just need `schema` promoted from an optional (mining-defaulted) param to a required one. Plan: extract them verbatim into a new `src/main/aiProviderClient.ts` and import from both `mining.ts` and the new analysis module, instead of writing a third near-duplicate pair of fetch-based LLM callers (there are already two: `translateApi.ts` and `mining.ts`).
- **Chinese measure-word choice still needs the cloud key.** There's no Chinese sentence segmenter anywhere in the codebase — `chineseDict.ts` only does dictionary lookup, not tokenization — so nouns can't be extracted offline. CEDICT's embedded `CL:只[zhi1],条[tiao2]`-style hints (present on ~1,569 entries) will be used as a secondary cross-check/pinyin source once the LLM names a noun, not as an offline bypass.
- **No new key-entry UI.** Panels will check `window.api.aiGetConfig().apiKeysSet` and, if unset, show a plain-text nudge pointing at the existing key input in Flashcards → AI Card Studio (`src/renderer/components/AiCardStudio.tsx`) rather than building a third key-entry surface (EpubMiningPanel already has the second).

## Backend design

### 1. Extract the generic AI client — `src/main/aiProviderClient.ts` (new)

Move `AI_PROVIDER_TIMEOUT_MS`, `maxTokensForItemCount`, `fetchWithTimeout`, `parseAiJson<T>`, `callGeminiApi`, `callDeepSeekApi`, `callAiProvider` out of `src/main/mining.ts` (~lines 1015–1151) verbatim, with `schema` made a required parameter everywhere (drop the `schema ?? buildSchema()` / `jsonSchemaHint()` mining-specific fallbacks). `buildSchema`/`buildBatchSchema` stay in `mining.ts` — they're genuinely card-field-specific.

`mining.ts` changes: delete the moved code, `import` from `./aiProviderClient` instead, fix the one call site that relied on the fallback (`mining.ts:1233`, `callAiProvider(providerId, apiKey, prompt)` → `callAiProvider(providerId, apiKey, prompt, buildSchema())` — zero behavior change). Add one small new export near `aiEngineConfigFromFile` (~line 189):

```ts
export function getConfiguredAiProvider(): { providerId: AiProviderId; apiKey: string } {
  const config = readMiningConfig();
  const providerId = config.providerId ?? DEFAULT_AI_PROVIDER_ID;
  return { providerId, apiKey: readApiKeyForProvider(providerId) };
}
```
Don't export the full mining config surface — this one accessor is the minimal coupling needed.

### 2. Shared schema/prompt/parse core — `src/shared/translateAnalysisCore.ts` (new)

Pure, no Electron/Node deps (mirrors `src/shared/translateCore.ts`), unit-testable.

```ts
export type RussianCase = 'nominative' | 'genitive' | 'dative' | 'accusative' | 'instrumental' | 'prepositional';
export interface FormalityVariants { casual: string; polite: string; businessSafe: string }
export interface DeclensionItem {
  word: string; dictionaryForm: string;
  pos: 'noun' | 'adjective' | 'pronoun' | 'numeral' | 'verb';
  gender?: 'masculine' | 'feminine' | 'neuter' | 'plural-only';
  caseUsed?: RussianCase;
  singular?: Partial<Record<RussianCase, string>>;
  plural?: Partial<Record<RussianCase, string>>;
  verbAspect?: 'perfective' | 'imperfective';
  verbTense?: 'past' | 'present' | 'future';
  verbAgreement?: string; // e.g. "feminine singular (-ла)" — past-tense gender/number agreement
}
export interface MeasureWordItem { noun: string; classifier: string; pinyin: string; reason: string }
export interface AspectNoteItem { particle: '了' | '着' | '过'; afterWord: string; reason: string }

export interface TranslateAnalysisResult {
  formality?: FormalityVariants;
  particleNotes?: string[];   // parallel array, aligned to request.jaParticleTokens order
  declension?: DeclensionItem[];
  measureWords?: MeasureWordItem[];
  aspectNotes?: AspectNoteItem[];
}
export interface AnalysisFlags { formality: boolean; particlesJa: boolean; declensionRu: boolean; measureWordZh: boolean }
export interface TranslateAnalyzeRequest {
  sourceText: string; translatedText: string; source: string; target: string;
  jaParticleTokens?: string[]; // ordered particle surface forms, computed offline by the renderer
}

export function computeAnalysisFlags(source: string, target: string): AnalysisFlags;
export function buildAnalysisSchema(flags: AnalysisFlags): unknown;   // mirrors mining.ts buildSchema/buildBatchSchema pattern — only includes a top-level key per active flag
export function buildAnalysisPrompt(req: TranslateAnalyzeRequest, flags: AnalysisFlags): string; // uses langLabel() from shared/langs.ts; one instruction block per active flag; for particles, lists jaParticleTokens and asks for exactly that many strings, in order
export function parseAnalysisResponse(raw: string, flags: AnalysisFlags): TranslateAnalysisResult; // reuse cleanLlmOutput from translateCore.ts, JSON.parse in try/catch → {}; per-field Array.isArray/typeof checks — malformed/missing field is simply omitted, never throws
```

Add `src/shared/__tests__/translateAnalysisCore.test.ts` following the existing `translateCore.test.ts` pattern: `computeAnalysisFlags` per language pair, `buildAnalysisSchema` key presence per flag combo, `parseAnalysisResponse` against well-formed/malformed/partial fixtures.

### 3. Main-process orchestration — `src/main/translateAnalysis.ts` (new)

Mirrors `src/main/translate.ts`'s structure (cache shape, `registerXIpc()` export).

- Cache file: `userData/mining/translation-analysis-cache.json` (sibling of the existing `translation-cache.json`, same folder — already the app's de facto AI-cache home).
- Cache key: `sha256(providerId + '\0' + source + '\0' + target + '\0' + translatedText.trim().normalize('NFKC'))`, same recipe as `translationCacheKey` in `translate.ts:82-89` with `providerId` folded in (a different provider can produce a differently-shaped but still-valid analysis).
- Load/get/set/flush: identical shape to `translate.ts:41-107`'s four cache functions — load once, dirty-flag, atomic write, flush once per successful call.
- Only successful calls get cached (even if the parsed result ends up sparse) — thrown network/auth/timeout errors are never cached, so a bad key or rate limit is retryable.

```ts
export function registerTranslateAnalysisIpc(): void {
  ipcMain.handle('translate:analyze', async (_e, req: TranslateAnalyzeRequest) => {
    const { providerId, apiKey } = getConfiguredAiProvider();
    if (!apiKey) return { ok: false, error: 'No API key configured.' };
    const flags = computeAnalysisFlags(req.source, req.target);
    const cached = getCachedAnalysis(req.translatedText, req.source, req.target, providerId);
    if (cached) return { ok: true, result: cached };
    try {
      const prompt = buildAnalysisPrompt(req, flags);
      const schema = buildAnalysisSchema(flags);
      const raw = await callAiProvider(providerId, apiKey, prompt, schema, { itemCount: 6, timeoutMs: 45_000 });
      const result = parseAnalysisResponse(raw, flags);
      setCachedAnalysis(req.translatedText, req.source, req.target, providerId, result);
      flushAnalysisCache();
      return { ok: true, result };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
```

Wire into `src/main.ts`: `import { registerTranslateAnalysisIpc } from './main/translateAnalysis';` + `registerTranslateAnalysisIpc();` right after the existing `registerTranslateIpc();` (~line 320).

Response convention matches every other IPC handler in the app (`{ok, result, error}`): a hard failure (`ok:false`) is shown as a small note; a successful-but-partial parse (`ok:true`, sparse `result`) just renders whichever panels have data.

## Offline Japanese particle path (zero API key)

- **`src/renderer/tokenizer.ts`**: kuromoji's raw features already include `pos`/`pos_detail_1`; only the app's `JpToken` interface (lines 17–22) and `tokenizeSync` mapping (lines 112–119) discard them. Widen `JpToken` to add `pos: string` and `posDetail: string` — additive, non-breaking (checked all 6 consumers: `wordHighlight.ts`, `wordLookup.ts`, `levelLists.ts`, `apkgImport.ts`, `ankiSync.ts`, `main.tsx` — none do exact-shape checks).
- **`src/shared/particleRoles.ts`** (new): a curated `Record<string, {role, label, explanation, category}>` for ~30–40 common particles (は/が/を/に/で/と/も/の/から/まで/より/へ/ば/し/ので/のに/ながら/たり/や/か/ね/よ/な/わ/だけ/しか/ばかり/など/くらい/こそ/さえ/でも…), keyed by exact surface form, with a fallback bucket keyed by `posDetail` subtype (格助詞→case, 係助詞→binding, 副助詞→adverbial, 接続助詞→conjunctive, 終助詞→sentence-final, 並立助詞→parallel) so nothing renders unclassified. Actual `pos_detail_1` values from the bundled dictionary should be spot-checked during implementation rather than assumed from IPADIC docs alone.
- **`src/renderer/components/translate-analysis/ParticleBreakdown.tsx`** (new): tokenizes the Japanese side of the sentence via the already-prewarmed tokenizer (`main.tsx:62-84`), renders non-particle tokens as plain text and `pos === '助詞'` tokens as colored `.particle-chip` spans, with a compact list below showing surface + role label + explanation (generic from `particleRoles.ts`, or the LLM's sentence-specific string from `particleNotes` when available and aligned). No hover/popover — no such primitive exists in this codebase yet; a plain list is the idiom-consistent choice. Zero network dependency.

## Renderer wiring

### Component structure
```
src/renderer/components/SentenceAnalysisPanel.tsx                    (orchestrator)
src/renderer/components/translate-analysis/ParticleBreakdown.tsx
src/renderer/components/translate-analysis/DeclensionDrawer.tsx
src/renderer/components/translate-analysis/FormalityToggle.tsx
src/renderer/components/translate-analysis/MeasureWordGuide.tsx
```
Follows the existing `src/renderer/components/csv-editor/` precedent (kebab-case subfolder of sub-widgets + one top-level orchestrator). `DeclensionDrawer`/`MeasureWordGuide` wrap their content in the existing `CollapsibleSection.tsx` — that *is* the "Grammar Drawer," no new drawer primitive needed. Only `SentenceAnalysisPanel` talks to `window.api`; sub-widgets are pure presentational.

`SentenceAnalysisPanel` will own the fetch lifecycle: on `translatedText` change, check `aiGetConfig()` for `apiKeysSet`; if unset, show the nudge; else compute `jaParticleTokens` (if ja is source or target) and call `translateAnalyze()`, guarding stale responses with a request-id ref (same idiom as `SentenceTranslatePopup.tsx`). Particle chips render immediately and independently of key/network state.

### TranslateView.tsx integration — with a correctness fix

Passing live `input` straight through as the analysis source would re-fire the analysis effect on every keystroke after a translation completes (since `input` keeps changing while `output` sits fixed). Fix: snapshot the text that was actually translated.

1. New state: `const [translatedInput, setTranslatedInput] = useState('');`
2. In `run()`: reset it alongside `setOutput('')` (line 73), and set it alongside `setOutput(result)` on success (line 91).
3. In `swap()` (lines 59–67): reset it to `''` — post-swap, `output` holds repurposed old-input text, not a fresh translation, so stale analysis must not linger.
4. Render `<SentenceAnalysisPanel sourceText={translatedInput} translatedText={output} source={source} target={target} />` after `.tr-actions` (line 180) — the panel self-guards on empty `translatedText`.

This leaves the existing Qwen translation flow untouched — only one new state variable, two `setTranslatedInput` call sites, and one new render.

### preload.ts / window.d.ts
Add `translateAnalyze` next to `translateRun`/`translateRunBatch` (`src/preload.ts` lines 362–388) calling `ipcRenderer.invoke('translate:analyze', req)`, typed via `TranslateAnalysisResult` imported from `shared/translateAnalysisCore.ts`. Mirror the same declaration in `src/renderer/window.d.ts` (which duplicates the preload surface as ambient types, lines 217–304) — add after `onTranslatePartial` (~line 230).

## Chinese measure-word offline assist

`src/renderer/chineseDict.ts` will gain one pure export:
```ts
export interface ClassifierHint { trad: string; simp: string; pinyin: string }
export function parseClassifiers(defs: string[]): ClassifierHint[]
```
Regex-extracts `CL:隻|只[zhi1],條|条[tiao2]`-style hints from CEDICT `defs` (reusing the existing `pinyinToneMarks()` helper). `MeasureWordGuide` looks up each LLM-suggested noun via the existing `lookupChinese()`, runs `parseClassifiers` on the match, and shows the LLM's contextual pick as primary with "dictionary also lists: …" as a secondary line when they differ.

## Files to add / touch

**New:**
- `src/main/aiProviderClient.ts`
- `src/main/translateAnalysis.ts`
- `src/shared/translateAnalysisCore.ts`
- `src/shared/particleRoles.ts`
- `src/shared/__tests__/translateAnalysisCore.test.ts`
- `src/renderer/components/SentenceAnalysisPanel.tsx`
- `src/renderer/components/translate-analysis/{ParticleBreakdown,DeclensionDrawer,FormalityToggle,MeasureWordGuide}.tsx`

**Modified:**
- `src/main/mining.ts` (extract client functions, fix line-1233 call site, add `getConfiguredAiProvider()`)
- `src/main.ts` (register new IPC)
- `src/preload.ts`, `src/renderer/window.d.ts` (expose `translateAnalyze`)
- `src/renderer/tokenizer.ts` (widen `JpToken` with `pos`/`posDetail`)
- `src/renderer/chineseDict.ts` (add `parseClassifiers`)
- `src/renderer/views/TranslateView.tsx` (`translatedInput` snapshot state + render panel)
- `src/renderer/styles.css` (new `.tr-analysis*`, `.particle-chip*`, `.formality-toggle*`, `.declension-table*`, `.measure-word-*` rules appended after line 7099, reusing existing `--panel`/`--border`/`--accent`/`--muted` custom properties and `.collapse-*` idiom)

## Verification plan

- `npx tsc --noEmit -p tsconfig.json`, `npm run lint`, `npm test` (exercises new `translateAnalysisCore.test.ts` + regression on `translateCore.test.ts`).
- Manual, via `npm start`:
  1. No cloud key, JA↔EN: particle chips render immediately with generic labels and zero network activity; nudge shown in place of the other three panels.
  2. Cloud key configured, JA→RU: particle chips gain sentence-specific notes; Declension drawer shows a case table incl. verb gender-agreement; Formality control swaps register instantly with no extra request per click.
  3. Cloud key configured, EN→ZH with a countable noun ("two fish"): Measure-word guide suggests the right classifier + pinyin + reasoning, cross-checked against CEDICT; any 了/着/过 note is sensible.
  4. Cloud key configured, pair with no ja/ru/zh involved: only the Formality panel appears.
  5. Revisit the same sentence/source/target/provider: cache hit, no new network request.
  6. Invalid key: soft error note near the panels, base translation still displays, nothing cached for that attempt.
  7. Swap languages after a completed analysis: panel clears instead of showing stale/mismatched data.
  8. Regression: EPUB mining AI enrichment (now on the extracted `callAiProvider`) still works with both Gemini and DeepSeek; offline Qwen translation still works with no key configured at all.

## Implementation checklist (done 2026-07-16)

1. Extract `src/main/aiProviderClient.ts` from `mining.ts`.
2. Create `src/shared/translateAnalysisCore.ts` + tests.
3. Create `src/shared/particleRoles.ts`.
4. Widen `tokenizer.ts`'s `JpToken` with `pos`/`posDetail`.
5. Create `src/main/translateAnalysis.ts` and wire into `main.ts`.
6. Expose `translateAnalyze` via `preload.ts` + `window.d.ts`.
7. Add `parseClassifiers()` to `chineseDict.ts`.
8. Build `ParticleBreakdown.tsx`, `DeclensionDrawer.tsx`, `FormalityToggle.tsx`, `MeasureWordGuide.tsx`.
9. Build `SentenceAnalysisPanel.tsx` orchestrator.
10. Wire `SentenceAnalysisPanel` into `TranslateView.tsx`.
11. Add analysis panel CSS to `styles.css`.
12. Run typecheck/lint/test and fix issues.
13. Manual verification via `npm start` against the matrix above.
