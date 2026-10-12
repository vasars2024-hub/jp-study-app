# Gum — AI audit and integration plan

Date: 2026-10-11 · Branch: `theme/aero-wired-polish` · Scope: `src/main`, `src/renderer`, `src/shared`, `src/media`, `extension/`
Method: read the code path of every AI feature (UI → IPC → provider → parse → UI), ran 31 existing vitest files individually with `--maxWorkers=2` (all green, ~500 tests), and ran throwaway probes against stubbed providers in the session scratch area (nothing committed, no repo file other than this one touched).

Status vocabulary: **WORKS** (end to end, no defect that changes the result), **PARTIAL** (works on the happy path; a verified defect changes results, cost, consent or language support), **BROKEN** (the main path cannot succeed for a normal configuration).

---

## Summary

Gum's AI is **well-governed but narrow**: overall **5.5/10**.

- **Strengths.**
  - The plumbing is better than most hobby apps: one main-process cloud runtime (`providerRuntime.ts`) with timeouts, retries, abort, SSE streaming, a per-request cost cap, a monthly spend ceiling, an image-capability check, and a master "Use AI features" switch.
  - The Agent has leases, approvals, undo and a cloud study-data gate.
  - Explanations and the Translate router have correct, versioned caches.
  - The local models (Qwen3 GGUF via node-llama-cpp, Whisper via transformers.js, PaddleOCR/manga-ocr via onnxruntime, Supertonic TTS) are integrated with real care.
- **Weaknesses.**
  - **Cloud LLMs:** only Gemini 2.5 Flash and DeepSeek V4. There is no Claude, no OpenAI, and no Ollama/LM Studio endpoint.
  - **Local model:** the default is a 1.7B model that is pushed hard.
  - **Consent is uneven.** Subtitle auto-translate, the Translate analysis panel and Agent chat context can send text to the cloud without the opt-in that the Translate workbench requires.
  - **Cache defects:** several caches store partial or garbled answers as if they were complete.
  - **Card writes:** both card-writing AI paths can damage user data.
  - **Whisper queue:** it fans out to every window.
  - **Chinese and i18n:** zh learners hit Japanese-only assumptions in roughly ten places, and AI error prose is shown in English inside localized UIs.
  - **Missing AI:** none in SRS review, grammar, writing, speaking, stats or calendar reasoning — the places where it would help a learner most.

Every proposal below is **additive**: no deterministic path is removed, every AI entry point is optional, and each one has a local-first or deterministic fallback.

---

## Part 0 — Functional verification of every existing AI feature

### 0.1 Shared provider layer

| Component | Files | Verdict | Evidence | Fix needed |
|---|---|---|---|---|
| Cloud runtime | `src/main/providerRuntime.ts` | **PARTIAL** | `providerRuntime.test.ts` and `providerRuntimeSpendGuard.test.ts` pass (32 tests). Scratch probe `runtime.check.test.ts`: 4/4 defects reproduced (below). | R1–R6 below |
| JSON helper `callAiProvider` | `src/main/aiProviderClient.ts:86-100` | **PARTIAL** | No `signal` parameter, so no caller can cancel an in-flight request. `parseAiJson` (`:37-43`) is a bare `JSON.parse` and does not strip code fences. Probe by the card-gen sub-audit: a fenced reply throws. | Add `signal` and `stripFences` options |
| Local LLM | `src/main/translate.ts:752-817` (`runLocalQwenPrompt`), `llamaHost*.ts`, `llamaModelPool.ts` | **WORKS** | Has a timeout, an abort, a shared session queue and JSON extraction (`extractJsonish :825`). | No JSON-schema grammar. Qwen3 thinking is not budgeted (see A6). A request waiting in the queue cannot be cancelled. |
| Master switch | `src/main/aiFeatureGate.ts`, enforced in `aiProviderClient.ts:97` and `agentProviderRouter.ts:380` | **PARTIAL** | Not enforced on the **local** branches of `ai:enrichCard` / `ai:generateDeck` (`mining.ts:1375-1380`, `:1617`). Not enforced on LLM subtitle auto-translate (`subtitleDiscoveryTranslate.ts:108`). | Check the switch in `runLocalQwenPrompt` callers and in `askEngine` |
| Settings > AI | `src/renderer/components/settings/pages/AiPage.tsx`, `src/main/aiSetupIpc.ts`, `mining.ts:2183-2247` | **WORKS** | `aiSetup.test.ts` and `aiSettingsPage.test.tsx` pass. | Setters swallow errors (`AiPage.tsx:66,71`). No "Test key" button. A single global engine; no per-feature consent. |
| Key storage | `src/main/credentials/ai.ts`, `vault.ts` | **WORKS** | Uses the OS-encrypted vault, migrates legacy plaintext only after a confirmed encrypted write, and redacts `AIza…`/`sk-…` in `errorLog.ts:67-89`. | — (the Mirror Writing key is the exception, see M2) |

**Runtime defects (verified):**

- **R1 — Wrong key sent to the wrong vendor for an unknown provider id.**
  - `providerById` falls back to Gemini (`aiProviders.ts:61-63`), so `providerKeyBucket` returns the **Gemini** bucket.
  - `providerModel` and `requestBody` treat every non-Gemini id as DeepSeek (`providerRuntime.ts:233-236`, `:630-650`).
  - Result: the Gemini key is sent as `Bearer` to `api.deepseek.com`. Probe: `URL https://api.deepseek.com/chat/completions AUTH Bearer GEMINI-SECRET`.
  - Reachable via the unvalidated `req.providerId` in `mining.ts:1334` and `:1507` (`ai:enrichCard` / `ai:generateDeck`).
  - **Fix:** validate the id at both IPC handlers, and make `runCloudAiRequest` refuse unknown ids (fail closed, as `providerAcceptsImageInput` already does).
- **R2 — DeepSeek truncation is undetected.** `parseDeepSeekResponse` (`:417-433`) ignores `finish_reason: 'length'`, so truncated JSON is returned as success. Probe confirmed. **Fix:** map it to `output-truncated`, as Gemini already does.
- **R3 — Spend ledger misses billed failures and races.**
  - `spendGuard.record` runs only on success (`:836`). Gemini `MAX_TOKENS` (`:403`, `:536`), `invalid-response`, mid-stream cancel and post-stream timeout are all billed by the vendor but never recorded.
  - The check (`:778`) and the record (`:836`) are not atomic, so concurrent requests can each pass and together cross the ceiling.
  - **Fix:** record the usage (or the preflight estimate) on every response that reached the provider, and reserve the preflight estimate in the guard, releasing the difference afterwards.
- **R4 — Gemini key travels in the URL query string** (`:684-686`). Probe confirmed. **Fix:** send it in the `x-goog-api-key` header.
- **R5 — Gemini non-stream reads only `parts[0]`** (`:398`). Probe confirmed that a second part is dropped. **Fix:** join all text parts, as the stream path already does (`:517-519`).
- **R6 — Hard-coded, aging model table.** It has only `gemini-2.5-flash`, `deepseek-v4-flash` and `deepseek-v4-pro` (`aiProviders.ts:1`). There is no model picker, and no Claude/OpenAI/OpenAI-compatible provider. See Part 3.

### 0.2 Feature verdicts

The score is out of 10. The "Themes" column covers Study OS, Aero and Wired (SO/A/W, the main window) and Blanc. Unless noted, AI surfaces use shared tokens only and have no Aero- or Wired-specific skin.

**Agent**

| # | Feature | Path (hops) | Verdict | Score | Themes |
|---|---|---|---|---|---|
| A1 | Agent chat (Study OS) | `AgentWorkspaceShell.tsx:1912` → `agentExecutionClient.ts:39` → `agentExecution:run` → `agentExecutionIpc.ts:441` → `agentProviderRouter.ts:373` → runtime / `runLocalQwenPrompt` → chunk events `:509` → `AgentMessageText` | **WORKS** (26 + 55 tests pass) | 6.5 | SO/A/W: yes. Blanc: see A2. |
| A2 | Agent chat (Blanc) | `BlancCentralAgentPanel.tsx:237` → same IPC | **PARTIAL**: ignores the configured Agent model (`:240-260` never sets `target.model`, unlike `AgentWorkspaceShell.tsx:1944-1946`) | 6 | Blanc only |
| A3 | Model planner | `agentConversationPlanner.ts:285,340` → `localAgent:plan` → `localAgent.ts:343` → `parseLocalAgentModelPlan` | **PARTIAL**: `unwrapJson` accepts only exact fences (`localAgentPrompt.ts:129-133`); probe showed `Here is the plan:\n{…}` is rejected. Qwen3 thinking is unbudgeted and there is no grammar (`llamaHostWorker.ts:132-139`), so plans can be truncated. No cancel. | 5.5 | SO/A/W, Blanc |
| A4 | Study coach recipes | `planStudyRecipe` (`agentConversationPlanner.ts:232`) → `studyCoachAgentHandlers` → `AgentStudyAnswerView` | **WORKS** (regex intents in EN/JA/ZH/RU, `agentStudyCoach.ts:107-162`). No LLM at all; phrasing outside the patterns falls through. | 6 | Quick actions in Study OS only (`AgentWorkspaceShell.tsx:2563`) |
| A5 | Step execution | `localAgentQueueRun.ts:185` → lease → `executeAgentTaskStep` | **PARTIAL**: an empty tool error, or one over 500 characters, makes `updateAgentTask` throw inside the catch (`shared/localAgent.ts:826-845`, `boundedText :537-543`). The task stays `running` and the lease is never released (`localAgentQueueRun.ts:237-240`). Probe confirmed. | 6 | all |
| A6 | Local chat timeout | `translate.ts:803-805` → `agentProviderRouter.ts:337-341` | **PARTIAL**: a timeout becomes a plain `Error` and is shown as `provider-failed`, not `timeout`. | — | all |
| A7 | Automations / scheduler | `localAgentScheduler.ts:148` → `localAgent:trigger` → `localAgentAutomationHost.ts:170` → plan → enqueue | **PARTIAL**: matches exact HH:MM only, with no catch-up after sleep/closed and no "missed" record. Tasks are queued without a notification. Unattended runs can fall back to the cloud (`:106-127`). | 5 | Settings > AI + Blanc |
| A8 | Cloud study-data gate | `localAgent.ts:293-297` | **PARTIAL**: covers only the cloud planner's tool list. Chat sends `saved-words` / `study-session` shelf items (marked `personal`, not sensitive: `agentContextHandoff.ts:349-395`), and `agentProviderRouter.ts` never checks `agentCloudShareStudyData`. | — | all |
| A9 | Theme tools | `agentToolRegistry.ts:573-615` | **BROKEN outside Blanc**: `settings.apply-theme`/`apply-css` write Blanc toolbox settings and `--blanc-*` vars only, yet report success in SO/Aero/Wired. | — | SO/A/W |

**Explanations, analysis, translation**

| # | Feature | Path | Verdict | Score | Themes |
|---|---|---|---|---|---|
| E1 | Word Explain (Lexicon/Dictionary) | `EntryExplain.tsx:197` → `dict:explain` `dictionary.ts:1639-1681` (refuses cloud without consent `:1651`) → `explainRun.ts:105-147` → `runAgentProviderPrompt` → `lexiconExplainPrompt.ts:193-205` | **WORKS** (11/11). Cache keyed on model and prompt version; separate prompts for ja/zh/ru. | 8 | all (shared component) |
| E2 | Translate workbench | `TranslateContent.tsx:299` → `translator.ts:158` → `translate:run` → `routeTranslation` `translateRouter.ts:494-642` → cloud LLM / DeepL / local | **PARTIAL** (34/34 tests): a cloud answer missing some sentences is accepted, shown as complete and cached (`:395-398`). Sub-audit probe: `[1]`+`[3]` of 3 lines gave a 2-sentence "translation" with no error. | 8 | SO/A/W + Blanc (`BlancTranslatePanel.tsx:167`) |
| E3 | Translate analysis panel | `SentenceAnalysisPanel.tsx:61-96` → `translateAnalysis.ts:88-124` → `callAiProvider` → `translateAnalysisCore.ts:357` | **PARTIAL**: bad JSON returns `{}` and is cached to disk permanently (`translateAnalysisCore.ts:360-363`, `translateAnalysis.ts:115-119`). Cache key omits the source sentence and a prompt version (`:53-65`). Runs automatically on every translation, sending to the cloud without translate consent. | 5 | SO/A/W only (not in Blanc) |
| E4 | Sentence analysis (Reading Lens) | `ReadingLensOverlay.tsx:709` → `LensAnalysisPanel.tsx:66` → `sentence:analyze` `sentenceAnalysis.ts:153-246` → `sentenceAnalysisCore.ts:680-706` | **PARTIAL**: "Re-analyze" is a no-op once cached (no refresh flag, `:194-195`). Key omits `context`/`learnerLevel`/prompt version. Errors are raw English (`LensAnalysisPanel.tsx:209`). No cancel. | 6 | Lens overlay (all themes) |
| E5 | Video grammar highlight | `useCueAnalysis.ts:143` → `sentence:analyze` → `VideoCoreGrammarPanel.tsx:183` | **PARTIAL**: same cache and English-error issues (`:162,247`). Good offline fallback (`localGrammarAnalysis.ts`). | 7 | media player |
| E6 | Media / VN Study Assistant | `MediaStudyAssistantPanel.tsx:80` → `media-study:assist` `main/mediaStudyAssistant.ts:44-78` → `callAiProvider` → `parseMediaStudyAssistantResult` (`shared/mediaStudyAssistant.ts:129`) | **PARTIAL**, 4 defects below | 5 | Video study (`MediaStudyMode.tsx:508`) and VN (`VisualNovelPanel.tsx:1261`) |
| E7 | Subtitle auto-translate | `subtitleDiscoveryAuto.ts:387` → `subtitleDiscoveryTranslate.ts:74-121` → `runCloudAiRequest` / Qwen | **WORKS but consent defect**: defaults are `autoTranslate: true` and `translationEngine: 'auto'` (`shared/subtitleDiscoveryIpc.ts:174-175`). `auto` picks the first provider with a key, not the user's provider (`:77-87`), and skips both the master switch and translation consent. | 6 | background |
| E8 | Subtitle fusion arbiter | `subtitleFusionArbiter.ts:131-…` → `callAiProvider` | **WORKS**: never throws, bounded cost, split retry, fidelity guard, master switch checked (`:159`). Cloud only. | 7.5 | background |
| E9 | EPUB batch cloud translation | `translateApi.ts` (6-way concurrency) | **PARTIAL**: the shared disk translation cache has no provider in the key (`translate.ts:148-174`), so cloud output is later served as "offline model" output. Requests go to the panel's stale `exp.translationApiProvider` rather than the app provider shown (`mining.ts:1720` vs `EpubMiningPanel.tsx:196-200`). No abort. | 5 | SO/A/W |
| E10 | Sentence translate popup | `SentenceTranslatePopup.tsx:67` → offline `translateTo` | **PARTIAL**: always hides `ja` as a target (`:172`), so zh learners can pick zh→zh but not ja. Never cancels on unmount (`:89-95`). | 6 | all |
| E11 | Mirror Writing "API" evaluator | `games/mirrorWriting/evaluator.ts:322-371` → `mirrorEvaluatorProxy.ts:23-54` | **BROKEN for standard OpenAI-compatible endpoints**: the body has no `model` (`evaluator.ts:281-292`), which `api.openai.com` rejects with 400; `extractJson` doesn't strip fences (`:104-108`). The key is stored in plaintext localStorage (`games/settings.ts:22,105-115`). The local rubric fallback is solid. | 3 | Game Arena |
| E12 | Grammar views | `GrammarContent.tsx`, `GrammarView.tsx`, `BlancGrammarPanel.tsx` | **No AI** (authored content plus example search) | n/a | — |

E6 defects:
- **Stale-result race.** `run()` sets `result` unconditionally after `await` (`MediaStudyAssistantPanel.tsx:80-95`), while `useEffect([sentence])` clears it (`:67-71`). A slow answer for line N renders under line N+1, and "Save to notebook" then saves line N+1 with line N's analysis.
- **Japanese-only.** The prompt hard-codes "Japanese" and requires a Japanese sentence (`shared/mediaStudyAssistant.ts:115-121`, `main/mediaStudyAssistant.ts:54`), so a zh learner gets a JP-framed prompt. It also always answers in English, ignoring the UI language.
- **Raw English errors.** Main returns English strings shown verbatim (`:52,54,56,76`).
- **Cache.** The persistent cache never evicts and its key has no model or prompt version (`main/mediaStudyAssistant.ts:57-62`). Cloud only: the local engine is never used.

**Cards and Anki**

| # | Feature | Path | Verdict | Score | Themes |
|---|---|---|---|---|---|
| C1 | Deck Workbench AI additions / field translate | `DeckWorkbenchAiPanel.tsx:504` → `anki:aiGenerateAdditions` `main/anki/aiAdditions.ts:154` → chunks of 8 → `callAiProvider` → `ankiAiPrompt.ts:186` → review tray `ankiChangeTray.ts:2626-2652` | **PARTIAL** (6 + 11 + 15 tests pass), 4 defects below | 7 | SO/A/W. Unstyled: 19 `wb-ai*` classes have zero CSS rules in any theme. Not in Blanc. |
| C2 | AI Card Studio | `AiCardStudio.tsx:954` → `ai:generateDeck` `mining.ts:1504-1700` | **PARTIAL**: no cancel IPC; one failed word/chunk throws away every paid result (`:1552,1631,1644`); progress text is hard-coded English (`:1550-1697`); no cost disclosure. Saving replaces the whole "<preset> studio" deck, deleting earlier batches and their review history without confirmation (`flashcardDeck.ts:2232-2238`); the safe `planDeckUpsert` exists at `:2251`. Presets are Japanese-only but asked to produce Chinese for zh profiles (`aiPromptBuilder.ts:188-190,219`, `aiMiningCatalog.ts`); the preview hard-codes `lang="ja"` (`AiCardStudio.tsx:1026`). | 4 | SO/A/W. Blanc only via the Agent tool. |
| C3 | Agent `flashcard.generate-cards` | `cardStudioAgentHandlers.ts:420-522` → `ai:generateDeck` → staged 30 min | **WORKS** (inherits C2's flaws) | 6 | all |
| C4 | EPUB mining AI translation | `mining.ts:1708-1752` | **PARTIAL**: provider mismatch (E9) | 6 | SO/A/W |

C1 defects:
- **Rejected variants come back.** `recordAiResult` re-applies the final result after the per-chunk progress already applied it (`DeckWorkbenchAiPanel.tsx:235,317`; `ankiAiAdditions.ts:165-179`), and the approve/reject buttons are live while running. Probe: `rejectedVariants` went from 1 to 0.
- **Model output is written to Anki fields as raw HTML.** `wrapAiProvenance` interpolates `value` unescaped (`ankiAiAdditions.ts:371-377`); a probe passed `<img src=x onerror=…>` straight through. Anki templates execute JS, so a prompt-injected term in a shared deck could reach it.
- **Retry can send the wrong question.** Retry sends the current `kind`/`mode` against the old batch (`:259-263,299`).
- **Refusals and exceptions damage work.** A refusal on retry calls `publish(undefined)`, discarding a batch that has approvals (`:309-315`). An IPC exception leaves notes `pending` forever, and they can't be retried (`:322`).

**Speech, OCR and the extension**

| # | Feature | Path | Verdict | Score | Themes |
|---|---|---|---|---|---|
| S1 | Whisper job queue (player, library, recorder) | `MediaDetailPanel.tsx:440` / `VideoCoreStudyOverlay.tsx:2703` → `transcription:enqueue` → `transcriptionJobs.ts:289` → `requestChunk :175-195` → renderer worker `whisperWorker.ts:128` → SRT | **PARTIAL** (22 tests pass), 4 defects below | 6 | SO/A/W |
| S2 | Old player Whisper path | `MediaContent.tsx:788-859` | **PARTIAL**: replaces `workerRef` without terminating the old worker, so old cues leak into the newly opened file. No cancel. Decodes the whole file in the renderer. | 4.5 | SO/A/W |
| S3 | Blanc audio → cards | `BlancStudyNativePanels.tsx:1341` → `useWhisperTranscribe.ts:104` | **WORKS** (real cancel). The language toggle doesn't change the model (bug 3 under S1); errors are shown raw (`:1366`). | 6.5 | Blanc |
| S4 | Whisper model manager | `TranscriptionPage.tsx:169` → `prefetchWhisperModel` | **WORKS** (9 + 13 tests). Unpinned HF `main`, no sha256, no resume; cancel leaves a pending promise (`whisperModelCache.ts:205`). | 7 | Settings |
| S5 | Card TTS (OS + Supertonic) | `FlashcardsContent.tsx:1116` → `flashcards:synthesizeAudio` → `flashcardAudio.ts:714` → utility process `flashcardTtsHost.ts` | **WORKS** (pinned sha256, separate process, honest voice resolution) | 8.5 | all |
| S6 | Quick TTS | `renderer/tts.ts` (speechSynthesis) | **WORKS** (voice list can be empty on the first call; fixed rate). `CardVoicePicker.tsx:22` is Japanese-only. | 6 | all |
| S7 | Lens / book OCR | `screenOcr.ts:366` → `ocrAuto.ts:170` (Paddle → manga-ocr escalation) → `lensOfflineOcr.ts:44` Tesseract fallback | **WORKS** (24 tests). Paddle/manga models are unpinned; ONNX runs on the main thread (`mangaOcr.ts:182-196`). | 8 | all |
| S8 | Extension OCR | `content.js:4254` → `background.js:1277` → `extensionServer.ts:2536` | **PARTIAL**: an empty `langHint` lets manga-ocr run on Chinese pages (`extensionServer.ts:2508`, `ocrAuto.ts:167`). It auto-downloads ja+zh+ru packs without consent (`:661`). English errors (`:2518,2531,2548`). | 6 | extension |
| S9 | Shadowing | `VideoCoreStudyOverlay.tsx:2454-2521` | **WORKS as record/playback only**. No scoring. Pronunciation assessment does not exist. | 4 | player |
| X1 | Extension sentence analysis | `content.js:4682` → `background.js:2904` → `POST /v1/sentence-analysis` (`extensionServer.ts:2306`) → `analyzeSentence` | **WORKS**. The `aiOff` reply isn't localized (`content.js:4724-4732`); no disclosure that page text plus context goes to the cloud. | 6 | extension |
| X2 | Extension translate / transcribe / pairing | `extensionServer.ts:2073-2119`; `extensionTranscribe.ts`; `extensionPairing.ts:58-83` | **WORKS** (local only; DNS-rebinding guard, origin pin) | 6 / 7 / 8 | extension |
| — | Desktop companion | `main/companion.ts` | **Not AI** (scripted wheel plus dictionary lookups) | n/a | — |
| — | Snip-to-cards | — | **Not in the tree yet** (`grep -i snip` finds only clipboard-OCR comments, `readingLens.ts:485`, `screenOcr.ts:622`). Another agent is building it. | n/a | — |

S1 defects:
1. **Every open window transcribes every chunk** (`transcriptionJobs.ts:188-194` sends to all windows; handler installed per window in `App.tsx:348`).
2. **First-run model download exceeds the 120 s chunk timeout.** The worker is never told to stop, so with retries up to 9 workers can pile up (`whisperTranscribePcm.ts:49-123` has no abort).
3. **zh/ru audio can be routed to the Japanese-only kotoba model.** The global tier ignores `lang` (`whisperSettings.ts:45-53`; `SettingsApp.tsx:159` passes `'ja'`).
4. **zh "cards from transcript" silently makes nothing** (`transcriptionJobs.ts:442` gates on `^ja`; translation is hard-coded `ja→en` at `:459`). Non-timeout chunk errors become empty text (`:371-379`).

### 0.3 Test runs (all green; none cover the defects above unless noted)

The probes are throwaway and not committed:
- `scratchpad/aicheck/runtime.check.test.ts` (R1, R2, R4, R5)
- the agent step-error probe
- the workbench re-apply and HTML probe
- the translate partial-line and analysis-`{}` probe

---

## Part 1 — Inventory

### 1.1 Providers

| Kind | Provider | Where | Notes |
|---|---|---|---|
| Cloud LLM | Google Gemini 2.5 Flash | `shared/aiProviders.ts:30-38`, `providerRuntime.ts:580-628` | Vision capable. Structured JSON via `responseSchema`. Thinking budget is ¼ of the output budget. Key in the URL (R4). |
| Cloud LLM | DeepSeek V4 Flash / Pro | `aiProviders.ts:39-56`, `providerRuntime.ts:630-650` | `json_object` mode with the schema pasted into the system prompt. Text only. |
| Cloud MT | DeepL (Free/Pro) | `translateRouter.ts:410-471`, `credentialRegistry.ts:169-185` | Per-provider consent in Translate. Spend recorded (`recordCloudSpend`). Glossary protection. Formality is unused. |
| OpenAI-compatible (user URL) | Mirror Writing only | `mirrorEvaluatorProxy.ts`, `games/mirrorWriting/evaluator.ts` | Separate key store (localStorage). Broken against OpenAI (E11). This is the only place Ollama/LM Studio could be used today. |
| Local LLM | Qwen3-1.7B GGUF (default); 8B/14B/32B and any GGUF for the Agent | `localModelFiles.ts`, `localAgentModels.ts:35-76`, `llamaHostWorker.ts` (utility process), `llamaModelPool.ts`, `llamaContextPool.ts` | node-llama-cpp 3.19. Shared session queue. No JSON grammar. Thinking not budgeted. |
| Local STT | Whisper base/small, kotoba-whisper v2.2 (ja), large-v3-turbo | `shared/whisperModels.ts:28-65`, `renderer/whisperWorker.ts` | transformers.js 4.2. WebGPU fp16, falling back to WASM fp32. Unpinned downloads. |
| Local TTS | Windows System.Speech / macOS `say` / espeak-ng; Supertonic-3 (ja neural); speechSynthesis | `flashcardAudio.ts`, `flashcardTtsHost.ts`, `renderer/tts.ts` | Supertonic pinned and hashed |
| Local OCR | PaddleOCR (ja/zh/ru), manga-ocr, comic-text-detector, Tesseract.js (ja) | `paddleOcr.ts`, `mangaOcr.ts`, `ocrAuto.ts`, `renderer/ocr.ts` | onnxruntime-node on the main thread |
| Not present | Anthropic Claude, OpenAI, Ollama (11434), LM Studio (1234), embeddings, pronunciation scoring | — | `e2eHeadless.ts:498` only labels those ports. `zod` is a dependency but is imported nowhere in `src/`. |

- **Key storage:** OS-encrypted vault (`credentials/vault.ts`) for Gemini, DeepSeek and DeepL. Exception: the Mirror evaluator key in localStorage.
- **Model selection:** cloud is fixed per provider entry with no picker; local has the Agent model picker (`AiPage.tsx:241-260`).
- **Offline behavior:**
  - Translate/explain fall back to the local model or refuse cleanly.
  - The Agent refuses a cloud target when offline (`AgentWorkspaceShell.tsx:1925`).
  - Recipes, OCR, Whisper (once cached) and TTS work fully offline.

### 1.2 Cross-cutting scorecard

| Concern | State |
|---|---|
| Consent | Strong in Translate (per provider) and Explain (`dictionary.ts:1651`). Weak or missing in E3, E7, A8, C2, X1, S8. No per-feature consent registry. |
| Budget | Per-request and monthly caps exist and cover every `runCloudAiRequest` caller plus DeepL. Gaps: R3. |
| Caching | Correct in E1, E2 and the fusion arbiter. Defective in E3, E4, E6, E9. No provider-side prompt caching. |
| Streaming | Agent chat and Translate stream. Explain, analysis, Card Studio and the media assistant are buffered even though the runtime supports `onTextChunk`. |
| Cancel | Agent chat, Translate, DeepL, workbench (between chunks) and the Whisper Blanc hook can cancel. Explain, both analyses, Card Studio, the planner, the media assistant and Whisper chunks cannot. |
| Structured output | Each feature hand-validates. No shared schema validator; `zod` is unused. |
| i18n | Catalogs are complete for AI keys, but ~15 surfaces render English prose produced in main (listed in F11). |
| Themes | No AI surface has Aero- or Wired-specific presentation. The Agent CSS is token-only. Workbench AI is unstyled. Blanc lacks Card Studio, translate analysis and coach quick actions, and its agent chat has the model bug. |
| Tests | Good unit coverage of pure cores, but no fake-provider end-to-end tests for card writes, caches or consent. |

---

## Part 2 — Ranked plan

Ordering rule (owner's request): **fix and improve the existing AI first**, then add new integrations. Every new item is optional, has a deterministic or offline fallback, and never replaces the non-AI path.

**Model defaults for new cloud work** (keep Gemini and DeepSeek selectable):
- `claude-haiku-5-5`: high-volume, per-line work (subtitle lines, cue analysis, example sentences).
- `claude-sonnet-5-5`: explanations, card generation, correction, the Agent.
- `claude-opus-5-5`: opt-in only, for long-form essay correction and multi-step Agent planning.

**Local default:** keep Qwen3-1.7B for translation. Recommend Qwen3-8B for explanations and the conversation partner when RAM allows, and allow an Ollama or LM Studio endpoint.

### 2.1 Fix and improve existing AI (do these first)

| ID | Item | What to change (files) | Effort | Priority |
|---|---|---|---|---|
| **F1** | **Consent: no cloud send without opt-in** | **(a)** Subtitle auto-translate: default `translationEngine: 'local'`; require the Translate per-provider consent and `aiFeaturesEnabled()` in `askEngine`; use the user's provider, not the first keyed one (`shared/subtitleDiscoveryIpc.ts:174-175`, `main/subtitleDiscoveryTranslate.ts:74-121`). **(b)** Translate analysis: run on click, or only when the translation itself was cloud with consent (`SentenceAnalysisPanel.tsx:61-82`). **(c)** Agent chat: apply `agentCloudShareStudyData` to `saved-words`/`study-session` shelf items in `agentProviderRouter.ts`. **(d)** One-time disclosure for Card Studio, extension analysis and extension OCR language-pack downloads (`extensionServer.ts:661`). | M | P0 |
| **F2** | **Cache and data integrity** | Throw when any line is missing, never cache partial results (`translateRouter.ts:395-398`). Throw on bad analysis JSON, don't cache `{}`, and add the source sentence and prompt version to the key (`translateAnalysisCore.ts:360-363`, `translateAnalysis.ts:53-65,115-119`). Add a `refresh` flag and put context/level/version in the key (`sentenceAnalysis.ts:193-195`, `sentenceAnalysisCore.ts:145-162`). Add the provider to the translate disk-cache key (`translate.ts:148-174`). Fix the EPUB provider (`mining.ts:1720`). Add model/version and LRU eviction to the media assistant cache. | S | P0 |
| **F3** | **Safe card writes** | HTML-escape before `wrapAiProvenance` (`ankiAiAdditions.ts:371-377`). Preserve `rejected` across re-apply (`ankiAiAdditions.ts:165-179`, `DeckWorkbenchAiPanel.tsx:235,317`). Store kind/mode on `AiBatch` for retry (`:259-299`). Mark refusals/exceptions as `failed`, not withdrawn (`:309-322`). Card Studio: keep partial results with per-item errors (`mining.ts:1552,1631,1644`), add `ai:cancelGenerate`, save via `planDeckUpsert` with a confirmation (`flashcardDeck.ts:2232-2251`). | M | P0 |
| **F4** | **Provider runtime hardening** | R1 validate the provider id (`mining.ts:1334,1507`; fail closed in `runCloudAiRequest`). R2 DeepSeek `length` → `output-truncated`. R3 record billed failures and reserve the estimate. R4 header key. R5 join parts. Thread `signal` and a fence-tolerant parse through `callAiProvider` (`aiProviderClient.ts:37-100`). Enforce the master switch on the local branches (`mining.ts:1375,1617`). | S | P0 |
| **F5** | **Whisper pipeline** | Send chunk requests to one host window (`transcriptionJobs.ts:175-195`, reusing the `extensionBridgeHost.ts` pattern). Add a per-chunk cancel/terminate message. Prefetch the model before the first chunk, or suspend the timeout during download. Resolve the tier through `spec.langs` (`whisperSettings.ts:45-53`, `SettingsApp.tsx:159`). Lift the `^ja` card gate and use `job.lang` (`transcriptionJobs.ts:442,459`). Route the old player path through the queue (`MediaContent.tsx:788-859`). Pin revisions and sha256 for Whisper/Paddle/manga-ocr in `assetRegistry.ts`. Add 1–2 s chunk overlap. | M | P0 |
| **F6** | **Agent reliability** | Default/truncate the error in `executeAgentTaskStep`'s catch and release the lease (`shared/localAgent.ts:826-845`, `localAgentQueueRun.ts:237-240`). Use `extractJsonish` in the planner (`localAgentPrompt.ts:129-133`). Pass a JSON-schema grammar (`llama.createGrammarForJsonSchema`) and a thought budget for Qwen3 (`llamaHostWorker.ts:132-139`, `localAgent.ts:226-229`). Map the local timeout to `timeout` (`translate.ts:803-805`, `agentProviderRouter.ts:337-341`). Pass `target.model` in Blanc (`BlancCentralAgentPanel.tsx:240-260`). Make theme tools act on the active theme or refuse outside Blanc (`agentToolRegistry.ts:573-615`). Add a cancellable planner. Keep partial streamed text on cancel (`agentExecutionIpc.ts:576-578`). Automation catch-up plus an enqueue toast. | M | P1 |
| **F7** | **Media/VN Study Assistant and Mirror evaluator** | Assistant: ignore stale responses (request id / AbortController), study-language prompts (ja/zh), answer in the UI language, error codes not prose, local-engine path, streaming (`MediaStudyAssistantPanel.tsx:67-101`, `shared/mediaStudyAssistant.ts:111-125`, `main/mediaStudyAssistant.ts`). Mirror: add a `model` field, strip fences, move the key into the vault, and offer "use app AI provider" (`evaluator.ts:104-108,281-292`, `games/settings.ts:22,105-115`). | S | P1 |
| **F8** | **zh parity and localized AI errors** | zh: `CardVoicePicker.tsx:22`; Card Studio presets filtered by study language plus zh presets (chengyu, measure words, tones/pinyin, HSK) in `aiMiningCatalog.ts`, `aiPromptBuilder.ts:188-219`, `AiCardStudio.tsx:1026`; translate prompt (`translateProviders.ts:443-445`); formality example (`sentenceAnalysisCore.ts:469`); analysis flags based on the *source* language (`translateAnalysisCore.ts:84-90`); popup target filter (`SentenceTranslatePopup.tsx:172`); extension OCR `langHint` default (`extensionServer.ts:2508`). Errors: return `{code, vars}` from main and map them to catalog keys in `LensAnalysisPanel.tsx:209`, `VideoCoreGrammarPanel.tsx:162,247`, `SentenceAnalysisPanel.tsx:116`, `AiGenerationProgressPanel.tsx:53`, `DeckWorkbenchAiPanel.tsx:548`, `BlancReadyToolPanels.tsx:391,761`, `AgentPipelineTerminal.tsx:94`, `BlancStudyNativePanels.tsx:1366`, `content.js:4724-4732`. | M | P1 |
| F9 | Streaming and cancel for buffered features | Pass `onTextChunk` and `signal` for Explain (`dictionary.ts:1668-1671`), sentence analysis, translate analysis, Card Studio and the assistant. Add `*:cancel` channels. | M | P1 |
| F10 | Style the AI surfaces per theme | Add `wb-ai*` CSS. Aero: glass "assistant pane" treatment. Wired: terminal-style streaming text and a Navi prompt glyph for Agent/Explain. Blanc: Card Studio and translate-analysis entries. Keep within each theme's `:root[data-materials=…]` scope so `secretIdentityScope.test.ts` stays green. | M | P2 |
| F11 | Model picker and "Test key" | A per-provider model list (latest Claude/Gemini/DeepSeek IDs) and a cheap probe call in `AiPage.tsx`. Surface setter failures. | S | P2 |

### 2.2 New AI integrations, by area

Columns: **Value** = learner impact; **Run** = L (local feasible), C (cloud), L/C (either). Every item lists a consent design and a fallback.

**Flashcards / SRS** (`components/flashcards/FlashcardsContent.tsx`, `renderer/flashcardDeck.ts`, `shared/fsrs.ts`, `shared/ankiLeechRescue.ts`, `shared/ankiAiAdditions.ts`)

| ID | Proposal | Value | Hook | Run | Consent / fallback | Effort | Pri |
|---|---|---|---|---|---|---|---|
| N1 | **"Why was I wrong?"** after an Again/Hard. Explains the confusion (similar word, kanji lookalike, wrong reading), using the card, the user's typed answer if any, and the deck's near neighbours. | High | Review answer handler in `FlashcardsContent.tsx` (near the grade buttons, ~:1108). Reuse `dict:explain`'s cache and `runAgentProviderPrompt`. | L/C | Runs on button press only. Deterministic fallback: show the dictionary entry plus lookalike kanji from the existing kanji data. | M | P1 |
| N2 | **i+1 example sentences** for a card: generate 3, then check deterministically with `shared/comprehensibility.ts` against `renderer/knownWords.ts` (keep only sentences whose only unknown word is the target) | High | New `AiAdditionKind` in `ankiAiAdditions.ts` plus the Card Studio schema (`mining.ts:1237`). Inject known words into `buildAiAdditionsPrompt` (`ankiAiPrompt.ts:152`) and `avoidExpressions` (`aiPromptBuilder.ts:171`). | L/C | Reviewed in the existing approval tray, provenance-wrapped. Fallback: Tatoeba examples ranked by the same score (`/v1/examples`, `extensionServer.ts:2432`). | M | P1 |
| N3 | **AI leech rescue**: mnemonic, contrastive hint ("not X: …") and an extra context sentence for leeches | High | `ankiLeechRescue.ts` (it currently refuses invented text by design); add an opt-in "AI hint" measure that writes through `wrapAiProvenance` into the tray. Lapses come from `studyAnkiLeech.ts`. | L/C | Explicit per-batch approval, never overwrites user fields (keeps the module's rule). Fallback: the existing partial-reveal hint. | S | P1 |
| N4 | **Card quality fixer**: deterministic lint (missing reading, gloss/term mismatch, duplicate sense, sentence missing the target) plus an AI suggestion per finding | Med | Workbench recipe beside `ankiLeechRescue.ts`; tray `ankiChangeTray.ts:2622` | L/C | Lint is always on and the AI suggestion is per-click. | M | P2 |

**Dictionary / popup** (`DictionaryPopup.tsx`, `lexicon/EntryExplain.tsx`, `extension/content.js`)

| ID | Proposal | Value | Hook | Run | Consent / fallback | Effort | Pri |
|---|---|---|---|---|---|---|---|
| N5 | **Explain in this sentence**: sense disambiguation for the word as used in the sentence it came from (Migaku/Language Reactor style) | High | Add optional `sentence` to `buildExplanationPrompt` (`lexiconExplainPrompt.ts:129`) and to the cache key (`lexiconExplanations.ts:87`); pass it from the popup and from Lens/reader lookups | L/C | Same consent as Explain. Fallback: the gloss list with frequency ordering. | S | P1 |
| N6 | **Extension popup "AI" tab** plus one-click AI-enriched mining | Med | `POPUP_TABS` (`extension/content.js:13`, render ~:916) → new `/v1/word-in-context` beside `/v1/sentence-analysis` (`extensionServer.ts:2306,2392`) | L/C | Desktop-side consent applies. The extension shows the disclosure once. Fallback: the existing dictionary tab. | M | P2 |

**Reader / Immersion** (`views/NovelReader.tsx`, `components/immersion/*`)

| ID | Proposal | Value | Hook | Run | Consent / fallback | Effort | Pri |
|---|---|---|---|---|---|---|---|
| N7 | **Satori-style per-sentence notes** in the reader: tap a sentence to get a grammar breakdown, a natural translation and why it's phrased that way | High | Reader context menu (the `ask-agent-selection` entry near `NovelReader.tsx:2876`) → `sentence:analyze` | L/C | Per click; cached per sentence. Fallback: offline translation plus `localGrammarAnalysis`. | S | P1 |
| N8 | **Chapter recap / "story so far"** and a character glossary feeding `translateGlossary.ts` for consistent names | Med | Reader chapter end; VN session end | C (L for short) | Per click. Fallback: none needed (purely additive). | M | P3 |

**Video study and YouTube** (`src/media/*`, `components/media/MediaStudyMode.tsx`, `useCueAnalysis.ts`, `shared/youtubeStudy5.ts`)

| ID | Proposal | Value | Hook | Run | Consent / fallback | Effort | Pri |
|---|---|---|---|---|---|---|---|
| N9 | **Episode summary plus comprehension questions** generated from the subtitle track after watching; answers checked against cue timestamps (jump-to-cue) | High | Episode end / `MediaStudyMode.tsx`; reuse the subtitle record. Haiku-class model. | C (L for short eps) | Per click. Fallback: deterministic vocab quiz from mined cues. | M | P1 |
| N10 | **i+1 sentence picking**: rank cues by unknown-word count (deterministic, `comprehensibility.ts`), then let AI choose the most teachable of the top-k and say why | High | Cue list / `StudyBottomBar.tsx`; mining via `studyMining.ts` | L (ranking), L/C (AI pick) | Ranking always on; the AI pick is opt-in. | M | P1 |
| N11 | **Ask about this line** chat seeded with the cue and ±3 lines (Language Reactor) | Med | `MediaStudyAssistantPanel.tsx` (after F7) → Agent handoff (`MediaCueAgentHandoffButton.tsx` exists) | L/C | Per click | S | P2 |

**VN** (`components/immersion/VisualNovel*`, `shared/visualNovel*.ts`)

| ID | Proposal | Value | Hook | Run | Consent / fallback | Effort | Pri |
|---|---|---|---|---|---|---|---|
| N12 | **Texthooker line explain with speaker/route context** (uses the assistant after F7) and a name glossary for consistent MT | Med | `VisualNovelPanel.tsx:1261`, `visualNovelMining.ts` | L/C | Per click | S | P2 |

**Reading Lens and Snip-to-cards** (`ReadingLensOverlay.tsx`, `LensAnalysisPanel.tsx`; Snip is being built)

| ID | Proposal | Value | Hook | Run | Consent / fallback | Effort | Pri |
|---|---|---|---|---|---|---|---|
| N13 | **Snip → analyzed card candidates**: OCR → `sentence:analyze` (local Qwen by default) → i+1 filter (N2 logic) → review tray | High | The new Snip pipeline's post-OCR step; `useAnalysisActions.mine` | L | Local by default; cloud only with Explain-style consent. Fallback: dictionary-only cards. | M | P1 (after Snip lands) |
| N14 | **Vision fallback for hard OCR** (furigana-heavy or stylized text): send the crop to a vision model only when OCR confidence is low | Med | `ocrAuto.ts:170` confidence (`ocrConfidence.ts`) → runtime `images` (Gemini; Claude after Part 3) | C | Per-scan opt-in with an image preview; never automatic. Fallback: the current OCR result. | M | P3 |

**Translate** (`components/translate/*`, `translateRouter.ts`)

| ID | Proposal | Value | Hook | Run | Consent / fallback | Effort | Pri |
|---|---|---|---|---|---|---|---|
| N15 | **Compare engines and explain the difference**; back-translation check; DeepL `formality` plus glossary IDs | Med | `TranslateEngineBar.tsx`, `translateRouter.ts:430-436` | L/C | Existing per-provider consent | S | P2 |

**Grammar** (`GrammarContent.tsx:208`, `GrammarPracticePanel`, `grammarSrs.ts`, `BlancGrammarPanel.tsx`)

| ID | Proposal | Value | Hook | Run | Consent / fallback | Effort | Pri |
|---|---|---|---|---|---|---|---|
| N16 | **Bunpro-style production practice**: generate cloze prompts for a grammar point at the user's level; grade the free answer (deterministic accept-list first, AI judgement second) with an explanation | High | Grammar practice panel and `grammarSrs.ts` scheduling (AI grading never changes the SRS without the user confirming) | L/C | Per session. Fallback: authored examples and accept-lists. | M | P1 |
| N17 | **Compare similar points** (e.g. ように vs ために, 了 vs 过) with generated minimal pairs | Med | Grammar entry view | L/C | Per click; cached per pair | S | P2 |

**Writing / speaking**

| ID | Proposal | Value | Hook | Run | Consent / fallback | Effort | Pri |
|---|---|---|---|---|---|---|---|
| N18 | **Pronunciation and shadowing feedback**: recorder blob → `transcribePcm` → kana-folded diff with the target line (`listeningTraining.ts`), timing from Whisper word timestamps, pitch contour against `pitchAccent.ts` | High | `VideoCoreStudyOverlay.tsx:2490` (recorder `onstop`); `whisperWorker.ts:131` (`return_timestamps: 'word'`); `PitchAccentContour.tsx` | **L only** | Audio never leaves the machine. Fallback: playback only (today). | M | P1 |
| N19 | **Writing correction** (journal / free writing): inline corrections with reasons, linked to grammar entries; unify Mirror Writing's API mode onto the app provider layer | High | Mirror Writing (`games/mirrorWriting/evaluator.ts`) plus a new Notebook "Correct" action; Opus opt-in for long essays | L/C | Per submit. Fallback: the local rubric. | M | P2 |
| N20 | **Conversation partner** (text first, then voice): level-constrained persona, correction mode, scene presets; voice loop = recorder → Whisper → LLM → Supertonic/OS TTS | High | Blanc panel next to `BlancAudioMinePanel`; Agent chat infrastructure (`agentExecutionIpc.ts`) | L (Qwen3-8B) / C (Haiku/Sonnet) | Per session; history stays local. Fallback: scripted drills. | L | P2 |

**Calendar / planner** (`components/calendar/*`, `renderer/calendar.ts`, `shared/fsrsWorkload.ts`, Agent `study.plan-week`)

| ID | Proposal | Value | Hook | Run | Consent / fallback | Effort | Pri |
|---|---|---|---|---|---|---|---|
| N21 | **Plan-my-week with reasons**: deterministic FSRS workload forecast plus free calendar slots → AI proposes sessions → user accepts per item | Med | Agent `study.plan-week` handler (`studyCoachAgentHandlers.ts`) and `calendar.schedule-sessions`; calendar day panel | L | Proposals only; nothing is written without approval. Fallback: today's deterministic plan. | M | P2 (after Calendar/Agent lands) |

**Stats / insights** (`components/stats/StatsReviewInsights.tsx`, `shared/reviewStats.ts`)

| ID | Proposal | Value | Hook | Run | Consent / fallback | Effort | Pri |
|---|---|---|---|---|---|---|---|
| N22 | **Weekly coach note**: numbers computed deterministically (retention, leeches, time-of-day), AI only phrases 3 concrete suggestions; every claim cites a chart | Med | `StatsReviewInsights.tsx` header; `reviewStats.ts` functions | L | Local by default. Fallback: the charts themselves. | S | P2 |
| N23 | **LLM fallback for the study coach**: when the regex intents miss, classify the intent with the local model into the existing recipes (no free-form tool calls) | Med | `agentStudyCoach.ts:107-162`, `agentConversationPlanner.ts:232` | L | Recipes stay deterministic; only routing is AI. | S | P2 |

**Games** (`renderer/games/*`)

| ID | Proposal | Value | Hook | Run | Consent / fallback | Effort | Pri |
|---|---|---|---|---|---|---|---|
| N24 | **Deck-driven content packs and smart distractors**: generate game items from the user's due/known words; plausible wrong answers (lookalikes, near-synonyms) | Med | `games/contentSource.ts`, `gameItemImport.ts`, `arenaStudyBridge.ts` | L | Pack generation on demand. Fallback: current random distractors. | S | P3 |

**Settings / onboarding** (`components/onboarding/FirstRunSetup.tsx`, `AiPage.tsx`)

| ID | Proposal | Value | Hook | Run | Consent / fallback | Effort | Pri |
|---|---|---|---|---|---|---|---|
| N25 | **AI setup step in first run**: detect RAM/GPU, recommend local model tier and Whisper tier per study language, explain the cloud options and cost, with per-feature consent toggles (Part 3) | High (enables everything else) | `FirstRunSetup.tsx`, `firstRunDownloads.ts` | L | Defaults to Off/local; cloud is explicit opt-in. | S | P1 |
| N26 | **Placement estimate**: frequency-band vocab check (deterministic), optional AI-graded reading probe | Low/Med | Onboarding; `knownWordsBulk.ts` | L | Optional | M | P3 |

**Blanc toolbox** (`components/blanc/BlancReadyToolPanels.tsx`, `BlancShell.tsx`)

| ID | Proposal | Value | Hook | Run | Consent / fallback | Effort | Pri |
|---|---|---|---|---|---|---|---|
| N27 | **AI quick tools panel**: explain clipboard, simplify to my level, check my sentence, make 3 cards. Thin wrappers over N5/N7/N19/C1. | Med | `BlancReadyToolPanels.tsx`, `BlancShell.tsx` tool registry | L/C | Per click | S | P2 |

**Platform**

| ID | Proposal | Value | Hook | Run | Consent / fallback | Effort | Pri |
|---|---|---|---|---|---|---|---|
| N28 | **Local embeddings** (multilingual-e5-small via transformers.js, already a dependency) for Agent retrieval over deck, notes and library, plus near-duplicate card detection | Med | `localAgentKnowledge.ts` (keyword-only today), Workbench dedupe | L | Local only | M | P3 |
| N29 | **Agent with native tool use and an observe-act loop** (Claude/OpenAI tool calling; JSON-grammar loop locally), feeding tool results back to the model | Med | `localAgent.ts:343` planner, `agentProviderRouter.ts`; `toolOutputForPlanner` (`agentCloudStudyDataGate.ts:70`) is the ready-made, currently dead, gate | L/C | Existing approvals and leases unchanged | L | P2 |

### 2.3 Top 15 (fixes first)

| Rank | Name | Area | Value | Local / Cloud | Effort |
|---|---|---|---|---|---|
| 1 | F1 Consent: no cloud send without opt-in | Subtitles, Translate, Agent, Cards, Extension | Trust and compliance; stops silent spend | both | M |
| 2 | F2 Cache and data integrity | Translate, Lens, Video, EPUB, Assistant | Stops wrong or partial answers being served forever | both | S |
| 3 | F3 Safe card writes | Deck Workbench, Card Studio | Prevents HTML injection, lost approvals and deleted review history | both | M |
| 4 | F4 Provider runtime hardening (+ `signal`) | Shared runtime | Stops key-to-wrong-vendor, truncation, untracked spend | cloud | S |
| 5 | F5 Whisper pipeline | Video, Library, Blanc | N× CPU/GPU waste removed; zh transcription and cards work | local | M |
| 6 | F6 Agent reliability | Agent / Automations | No stuck tasks; local plans parse; Blanc uses the right model | both | M |
| 7 | F7 Media/VN Assistant and Mirror evaluator | Video, VN, Games | Correct answer for the visible line; zh support; OpenAI/Ollama endpoints work | both | S |
| 8 | F8 zh parity and localized AI errors | All AI surfaces | Chinese learners and JA/ZH/RU UIs get a correct experience | both | M |
| 9 | Part 3 provider layer: Claude (`claude-haiku-5-5` / `claude-sonnet-5-5` / `claude-opus-5-5`) and OpenAI-compatible local endpoints (Ollama/LM Studio), per-feature consent, shared schema validation | Platform | Better quality per dollar; real local option beyond 1.7B | both | M–L |
| 10 | N1 "Why was I wrong?" | Flashcards | Turns lapses into learning moments | L/C | M |
| 11 | N2 i+1 example sentences (deterministically verified) | Flashcards / Workbench | Migaku-grade sentence cards from the user's own known words | L/C | M |
| 12 | N18 Pronunciation and shadowing feedback via Whisper | Speaking | First speaking feedback in the app; fully offline | local | M |
| 13 | N5 Explain in this sentence | Dictionary / popup | Correct sense for polysemous words | L/C | S |
| 14 | N9 + N10 Episode summary, comprehension questions, i+1 cue picking | Video / YouTube | Active viewing instead of passive | L/C | M |
| 15 | N3 AI leech rescue (mnemonic / contrastive hint, approved per batch) | Flashcards | Rescues the most expensive cards | L/C | S |

Next in line: N16 grammar production practice, N7 reader sentence notes, N13 Snip → analyzed cards, N25 onboarding AI step, F9 streaming/cancel, N19 writing correction, N20 conversation partner.

---

## Part 3 — Architecture recommendations

The app already has most of the pieces. The work is to **consolidate**, not rewrite. Keep `runCloudAiRequest` and `runLocalQwenPrompt` as the two transports and put one layer above them.

1. **One provider abstraction** (`src/main/ai/`):
   - Interface: `AiProvider { id, kind: 'cloud'|'local'|'openai-compatible', models[], capabilities: {json, schema, vision, tools, streaming, promptCache}, complete(req, signal, onChunk) }`.
   - Adapters:
     - Gemini and DeepSeek: the existing bodies, moved.
     - **Anthropic Messages API:** `x-api-key` header, `anthropic-version`, native `tools` and structured output, SSE, prompt caching via `cache_control` on the stable system/schema prefix.
     - **OpenAI-compatible:** OpenAI, and **Ollama `http://127.0.0.1:11434/v1`** / **LM Studio `http://127.0.0.1:1234/v1`** with no key.
     - Local node-llama-cpp: the existing code.
   - `AI_PROVIDERS` becomes a `{provider, model}` pair, so a provider entry no longer *is* a model. Default cloud models: `claude-haiku-5-5` (bulk), `claude-sonnet-5-5` (default), `claude-opus-5-5` (opt-in). Gemini and DeepSeek stay selectable.
   - Unknown ids fail closed (fixes R1).
2. **Feature registry plus per-feature consent:**
   - `AI_FEATURES = { explain, sentenceAnalysis, translateAnalysis, subtitleTranslate, cardGen, workbench, assistant, agentChat, agentPlanner, mirror, fusion, extensionAnalysis, … }`, each with `{ dataSent: 'selection'|'deck'|'audio'|'image'|'study-history', defaultEngine, allowCloud }`.
   - One gate function in main, `assertAiAllowed(feature, engine)`, replaces today's scattered checks (`aiFeatureGate`, the Translate consent, `dictionary.ts:1651`, `agentCloudStudyDataGate`).
   - Settings > AI lists the features with Off / Local / Cloud(provider) per row. The master switch stays.
3. **Budget:** keep the ledger. Add reservations (R3), per-feature monthly sub-caps, per-run caps for batch jobs (Card Studio, subtitle translate, EPUB), and a pre-run cost estimate shown in the UI for batches (the Workbench already does this honestly).
4. **Caching:**
   - One helper `aiCacheKey({feature, promptVersion, provider, model, lang, inputs})`. Every key **must** include the prompt version, model and every prompt input (the root cause of E3/E4/E6/E9).
   - Never cache partial, empty or unparsable results.
   - Use bounded LRU stores.
   - Use Anthropic prompt caching for long stable prefixes (schemas, grammar lists, the Agent's tool catalogue).
5. **Streaming and cancellation:** every IPC AI call gets a request id, a `*:cancel` channel and an `AbortSignal` all the way to `fetch` or `session.prompt`. The renderer ignores responses whose id is stale (fixes the E6 race pattern everywhere).
6. **Prompt templates per study language:**
   - Location: `src/shared/ai/prompts/{feature}.{ja|zh}.ts`, versioned, with explanations in the UI language.
   - Japanese: keigo, JLPT, pitch, kana readings.
   - Chinese: pinyin with tone marks, HSK, measure words, aspect particles, simplified/traditional.
   - ru: retain the existing declension support.
   - A test asserts that each feature has a template per study language (closes F8 structurally).
7. **Structured output validation:**
   - Use `zod` (already a dependency, unused). Define one schema per feature: it produces the provider JSON schema (Gemini `responseSchema`, Anthropic tool/structured output, OpenAI `json_schema`, node-llama-cpp `createGrammarForJsonSchema`) and validates the response.
   - One repair retry on validation failure, then a typed `invalid-response`.
   - Strip code fences centrally. Escape HTML before any write into Anki or the deck (F3).
8. **Evals and tests with fake providers:**
   - A `FakeProvider` (scripted replies: success, partial, fenced, truncated, 401, 429, slow, mid-stream abort).
   - Contract tests per feature: cache never stores partial results, consent is enforced, cancel stops the fetch, spend is recorded on billed failure.
   - A small golden set per language (20 ja + 20 zh sentences) for explain, analysis and card generation, run manually against real providers with a score sheet.
   - The scratch probes from this audit are templates for these tests.
9. **Errors:** main returns `{ code, vars }`, never prose. The renderer maps codes to catalog keys (extending the existing `xlate2.fallback.*` pattern), and the extension maps them to `_locales`.
10. **Secret handling:**
    - Keep every key in the vault, including the Mirror key and new Anthropic/OpenAI keys. Send keys in headers only. Extend the `errorLog.ts` redaction list for `sk-ant-…` (already present) and OpenAI-project keys.
    - Note that `renderer/__tests__/secretIdentityScope.test.ts` is the **theme-identity** guard (it keeps Wired/Aero CSS out of Blanc), not a key guard. AI theming work (F10) must scope every new rule under `:root[data-materials='…']` and must not import Wired/Aero sheets from `blancMain.tsx`. Run that test with any theme change.
11. **Local-first defaults:**
    - Ship with AI enabled but engine = local wherever a local model can do the job (translation, explain, analysis, shadowing, insights). Cloud is per-feature opt-in.
    - Recommend Qwen3-8B (Q4_K_M) when RAM ≥ 16 GB. Budget Qwen3 thinking explicitly and use a JSON grammar for every structured local call.
    - Move OCR inference to a utility process, as TTS already is.

---

## Appendix — Proposals that touch files other agents are editing now

Schedule these after the concurrent work lands. The files were modified or untracked in `git status` at the time of this audit.

| Concurrent work | Files in flight | Proposals / fixes touching them |
|---|---|---|
| **Calendar / Agent** | `agentConversationPlanner.ts`, `agentShellModel.ts`, `agentToolRegistry.ts`, `agentUndoClient.ts`, `components/agent/AgentWorkspaceShell.tsx`, `AgentConversationPlanQueue.tsx`, `agentExecutionTargets.ts`, `shared/agentWorkspace.ts`, `agentUndo.ts`, `agentExecutionRecord.ts`, `agentOperationLog.ts`, calendar tests and flows | **F6** (theme tools in `agentToolRegistry.ts`; error localization in `agentExecutionTargets.ts`; planner), **F1(c)** (agent consent), **N21** plan-my-week, **N23** coach LLM fallback, **N29** native tool loop, and the F8 error mapping in `AgentWorkspaceShell.tsx` |
| **Lockscreen** | `Lockscreen.tsx`, `BlancLockscreen.tsx`, `LockscreenStudy.tsx` (new), `lockscreenStudy.ts`, `lockscreenSettings.ts`, `main/lockscreenPin.ts`, `lockIpcGate.ts`, `settingsRegistry.ts`, `LockscreenPage.tsx` | No AI proposal depends on these. The **Part 3 / F11** Settings > AI changes touch `settingsRegistry.ts`, so sequence them after. A future "lockscreen micro-review with AI hint" would build on `LockscreenStudy.tsx`; it is not proposed now. |
| **Immersion / VN / YouTube** | `ImmersionContent.tsx`, `ImmersionStudy5.tsx`, `VisualNovelPanel.tsx`, `VisualNovelReaderOverlay.tsx`, `VisualNovelStudy5Panel.tsx`, `VisualNovelCaptureControls.tsx`, `main/immersion/visualNovel*.ts`, `visualNovelMining.ts`, `studyMining.ts`, `YouTubePlaylistsView.tsx`, `shared/youtubeStudy5.ts`, `visualNovelStudy5.ts`, `immersionStudy5.ts`, `subtitleCues.ts`, `readabilityArticle.ts`, `wordHighlight.ts` | **F7** (the assistant panel itself is not in flight, but its VN mount `VisualNovelPanel.tsx:1261` is), **N9/N10** (cue picking, summaries: `studyMining.ts`, `subtitleCues.ts`, `youtubeStudy5.ts`), **N11**, **N12**, **N8** recap |
| **Snip-to-cards** | Not yet in the tree | **N13** (Snip → analyzed candidates), **N14** (vision fallback), and the **F2** sentence-analysis cache fix it will depend on (`sentenceAnalysis.ts`, which is not in flight, so land F2 first) |
| Shared hot spots | `src/renderer/App.tsx`, `src/preload.ts`, `src/renderer/window.d.ts`, `src/main.ts`, i18n catalogs (`catalogs/*.ts`) | Every new IPC channel (F3 cancel, F9, Part 3) touches `preload.ts`/`window.d.ts`/`main.ts`. **F5** touches `App.tsx:348`. All new strings go through `catalogs/en.ts` and are filled by `tools/i18n-check.cjs`. Rebase carefully. |

Safe to start now (no overlap): **F2, F3, F4, F5** (except the `App.tsx` line), **F8** zh items in cards and translate, **N1, N2, N3, N5, N18, N16, N22, N25**.
