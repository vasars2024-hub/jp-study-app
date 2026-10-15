> **Coordinator note — 2026-10-15:** This document replaces the earlier multi-language plan with a language-pack architecture. This was a read-only design pass: no files were modified, and no installs, git writes, tests, or e2e runs were performed.
>
> Implementation remains inside `src/`, with the owner’s existing release exceptions:
>
> - Packages update their headless flows under `tools/e2e/flows/`.
> - P6 edits the maintained Chrome extension source in `extension/` directly. Do not create a parallel `src/main/study-extension/` copy or maintain the generated mirror.
>
> Root Forge, Vite, and TypeScript configurations remain off-limits. P0 starts after the separate Snip/OCR-router work is committed because both touch `src/shared/studyLang.ts`. OCR references below reflect the checkout inspected during this pass; reconcile them against that handoff before implementation.
>
> Preserve the desktop shortcut grid, dragging layer, and taskbar shell. Heavy imports and indexing run asynchronously outside interactive renderer work. Use existing Fluent materials, compact spacing, deep-red accents, clean typography, and vector icons. Add no decorative emoji or large internal panel titles.

# Gum language-pack architecture for v1

**Status:** Revised design and source audit, 15 October 2026.

**Release outcome:** A learner can study several languages in one Gum profile. Each language has a set of interchangeable capability providers. Adding a language means selecting a pack or assembling supported data providers, rather than adding another application-wide `lang === 'ja'` branch.

The long-term promise is:

> Choose a language, install the blocks that support it, and let Gum adapt its features to the available capabilities.

That promise has a boundary: a data pack can configure adapters Gum already implements. A completely new tokenizer algorithm, model architecture, or dictionary format still requires a reviewed Gum adapter and application update. Packs never supply executable plugins.

## 1. Language identity and study state

### Open language IDs

Replace the closed union at `src/shared/levelScale.ts:13` with a shared, validated BCP-47 identity:

```ts
declare const languageIdBrand: unique symbol;

export type LanguageId = string & {
  readonly [languageIdBrand]: true;
};

export type StudyLang = LanguageId; // compatibility export
export type LegacyStudyLang = 'ja' | 'zh' | 'ru';

export interface ParsedLanguageId {
  id: LanguageId;
  language: string;
  script?: string;
  region?: string;
}

export function parseLanguageId(value: unknown): ParsedLanguageId | null;
export function canonicalLanguageId(value: unknown): LanguageId | null;
```

The brand prevents accidental use of arbitrary strings inside application services. Runtime validation remains mandatory for storage, manifests, IPC, extension requests, and imports.

Use BCP-47 parsing and canonical casing. `Intl.getCanonicalLocales()` and `Intl.Locale` help with supported Unicode locale identifiers; handle legacy aliases and valid tags outside their accepted subset through a reviewed parser/alias table. Catch unsupported `Intl` locales without changing the stored identity. Do not use one permissive regular expression as the complete validator.

Preserve explicit script and region subtags:

| Input | Stored identity / treatment |
|---|---|
| `ja`, `ru`, `zh` | Retain unchanged |
| `zh-hans`, `zh_Hant` | `zh-Hans`, `zh-Hant` |
| `sr-cyrl`, `sr-Latn` | `sr-Cyrl`, `sr-Latn`; distinct identities |
| `pt-BR`, `pt-PT` | Preserve region |
| `jpn`, `rus`, `chi`, `zho` | Reviewed import aliases to `ja`, `ru`, `zh` |
| Legacy `chs`, `cht` | Map explicitly to `zh-Hans`, `zh-Hant` |
| `cmn`, `yue` | Preserve their language identity; do not collapse both into `zh` |
| Valid language without an installed pack | Preserve; report capabilities separately |
| `unknown`, empty, malformed input | Unresolved content metadata; never silently Japanese |

The current `studyLangFromTag()` collapses tags to three languages and treats Cantonese as Chinese (`src/shared/studyLang.ts:38`). That behavior cannot remain the general identity parser.

Use canonical tags for equality. Do not call `maximize()` when persisting an ID: inferred script or region is matching information, not evidence about the original item.

### What stays typed and what becomes data

| Stays typed in Gum | Becomes validated data |
|---|---|
| Slot names, API versions, request/result schemas | Language IDs and names |
| Capability states and error codes | Scripts, direction, supported layouts |
| Trusted adapter implementations | Provider selections and parameters |
| Card IDs, scheduler grades, field roles | Dictionary source/gloss languages |
| Provider matching and precedence rules | Provider-specific language codes |
| Manifest and migration schemas | Level scales, labels, frequency bands |
| Consent, installation, cancellation contracts | Asset URLs, sizes, hashes, licences |
| Existing application UI locales | Grammar content and field-name suggestions |

Keep `UiLang` closed to the application catalogs that actually exist: currently English, Japanese, Chinese, and Russian (`src/shared/i18n/core.ts:4`). Installing Spanish study support does not install Spanish application chrome.

Introduce a separate open `nativeLanguage`/`explanationLanguage: LanguageId` preference. Dictionary glosses and AI explanations may target it without widening the application’s UI catalog type. Existing `answerLang: UiLang` contracts need corresponding consumer updates; see `src/shared/aiBlancTutor.ts:161`.

Level identifiers also become data. Preserve legacy `LevelTier = 1..7` through adapters; do not require every future scale to have seven bands.

### Language, pack, provider, and knowledge scope are different identities

- **Language ID:** `zh-Hant`.
- **Pack ID:** a namespaced identifier such as `org.gum.zh`.
- **Provider ID:** a namespaced, versioned implementation/data binding.
- **Knowledge scope:** the partition in which normalized word knowledge lives.
- **Provider code:** an external identifier such as Tesseract `chi_tra` or Whisper `zh`.

One pack may support several language IDs. Several packs may offer providers for the same language.

Default new knowledge scopes to the complete canonical language ID. Sharing knowledge between variants is an explicit policy, not a consequence of dropping subtags.

For compatibility:

- Keep existing `ja`, `zh`, and `ru` knowledge partitions.
- Keep the existing Traditional-to-Simplified normalization inside legacy `zh`.
- Do not automatically merge new `zh-Hans`/`zh-Hant` or Serbian partitions.
- Offer explicit Chinese shared-knowledge configuration backed by a reviewed normalization profile.
- Never assume Serbian Latin and Cyrillic transliteration is sufficient to merge historical records.
- When scopes are deliberately shared, combined known-word totals deduplicate `(knowledgeScope, key)`.

Changing a dictionary or tokenizer must not silently re-key durable knowledge. Version normalization profiles separately from replaceable lookup providers.

### Study set

```ts
export interface StudySetV1 {
  version: 1;
  languages: LanguageId[]; // unique, ordered, nonempty
  active: LanguageId;     // belongs to languages
  revision: number;      // assigned by main
}

export type StudyLanguageFilter =
  | { kind: 'all' }
  | { kind: 'language'; language: LanguageId };
```

Keep these concepts separate:

| Concept | Meaning |
|---|---|
| Studied languages | Switcher membership, default queues, reminders |
| Active language | Default for new, unbound work |
| Item language | Persisted language of a card, source, track, capture, or conversation |
| Operation language | Frozen language of a job or session |
| View filter | Independent collection scope |
| UI locale | Application chrome |
| Native/explanation language | Preferred gloss and explanation target |
| Translation target | Target of a particular translation |
| Display script | Optional rendering/conversion preference; does not rewrite source identity |

Legacy Chinese `zh` remains a valid underspecified identity. Its existing script preference supplies a display/default-provider hint. New explicit `zh-Hant` content keeps that tag regardless of the active language’s preference.

No separate desktop workspace, profile, or deck is required for each language.

### Main-owned synchronization

Retain active-language compatibility helpers, backed by committed state:

```ts
getStudyLang(): LanguageId;
getStudySet(): StudySetV1;
getStudiedLangs(): readonly LanguageId[];

setStudyLang(lang: LanguageId): Promise<void>;
setActiveStudyLang(lang: LanguageId): Promise<void>;
addStudyLanguage(lang: LanguageId): Promise<void>;
removeStudyLanguage(
  lang: LanguageId,
  replacement?: LanguageId,
): Promise<void>;

useStudySet(): StudySetV1;
```

Adding membership is explicit. Opening a book, selecting a dictionary, or detecting foreign text must not enroll a language or change active state.

Main serializes updates, checks the expected revision, persists atomically, and broadcasts the accepted snapshot. On conflict, reapply the intended add/remove/activate operation to the newest state.

The current bridge is fire-and-forget (`src/preload.ts:3914`; `src/renderer/window.d.ts:2393`). Replace it with read, commit, and subscription contracts that acknowledge persistence failures.

Preserve `syncStudyLangToMain()` as the boot entry point. It must reconcile migration, hydrate secondary/Blanc/companion windows, suppress echoes, and prevent stale windows overwriting newer state. Boot callers are `src/renderer/main.tsx:308` and `src/renderer/blancMain.tsx:138`.

Events:

- `study-set-changed`: committed previous/current snapshots and changed fields.
- `study-lang-changed`: emit only when active changes.
- `study-zh-script-changed`: compatibility notification.
- Knowledge/activity events: include language and, where relevant, knowledge scope.
- View-filter events: include view ID; never masquerade as active-language changes.
- Capability events: include registry revision and affected languages/slots.

Switching active language must preserve each language’s Whisper preference; the current setter replaces it (`src/renderer/studyEnvironment.ts:125`).

## 2. Storage migration and language resolution

### Configuration migration

| Storage | Treatment |
|---|---|
| `study-language.json` | Versioned committed study set, revision, display preferences |
| `gum-study-set-v1` | Renderer cache of committed state |
| `jp-study-dict-lang` | Compatibility mirror; new code does not treat it as authority |
| `jp-study-zh-script` | Preserve legacy Chinese display preference |
| `gum-study-view-filters-v1` | Filters by stable view ID |
| `gum-whisper-tiers-v1` | Preferences by full language ID |
| `gum-study-goals-v1` | Shared/per-language goal settings |
| New pack installation store | Installed pack/provider versions, selections, licences, hashes |
| New migration journal | Completed schema migrations and recoverable failures |

Migration precedence remains:

1. Valid versioned main state.
2. Valid versioned renderer state, only while main has not committed a migration.
3. Valid legacy renderer choice.
4. Legacy main choice.
5. Japanese for a genuinely fresh profile.

Today main persists `{ lang, script }` (`src/main/studyLanguage.ts:24`), and renderer state reads the legacy key (`src/renderer/studyEnvironment.ts:28`).

Canonicalize valid IDs, remove duplicate memberships, and repair an invalid active member. Preserve rejected raw values for recovery. Write the committed replacement before marking migration complete.

Do not infer membership from installed dictionaries or historical cards.

### Migration of every stored `studyLang` field

Use one shared **field migration policy**, invoked by each owning serializer. Do not recursively replace arbitrary JSON properties or strings inside Anki templates, notes, or imported content.

For every persisted `studyLang`:

1. Existing `ja`/`zh`/`ru` values retain their meaning and partition.
2. Valid BCP-47 values retain script and region.
3. Reviewed legacy aliases canonicalize through the import alias table.
4. Missing values use that record schema’s historical rule.
5. Malformed values remain recoverable and unresolved; they are not evidence of Japanese.
6. Every newly created language-bearing record writes an explicit ID.

Apply it to these persistence boundaries:

| Stored domain | Migration and evidence | Owner |
|---|---|---|
| Deck cards and saved-word cards | Missing historical card language remains `ja`. Materialize it on schema migration or next save; preserve card IDs, schedules, notes, links, and media. `src/renderer/flashcardDeck.ts:147`; `src/renderer/savedWords.ts:85`; `src/renderer/studyEnvironment.ts:84`. | P1 |
| Imported/generated card drafts | Canonicalize before persistence and always write Japanese explicitly too. Current omission occurs in `src/renderer/studyMining.ts:627`, `src/renderer/sentenceDeckBuild.ts:155`, and `src/shared/filesApp/mining.ts:340`. | P3/P4, by file |
| Companion/mining drafts | Preserve explicit language through draft serialization, editing, retry, and adoption. `src/shared/companion.ts:25,155`. | P0 contract; P3 consumers |
| Captures and clipboard-derived records | Preserve stored language or recover from the linked draft/source. Historical unresolved text is not redetected on every render. `src/renderer/clipboardHistory.ts:283`; `src/shared/readingLens.ts:247`. | P3 |
| Caption/detached-player snapshots | Canonicalize `studyLang`; bind legacy snapshots to their selected track/session when available. Blank default snapshots are not historical evidence. `src/shared/captionsOverlay.ts:165,189,208`; `src/shared/studyDetach.ts:164,204`. | P4 |
| Game rounds, results, mistakes, and saved material | Preserve recorded round language; missing pre-language records follow their documented Japanese legacy behavior. Keep seen-history bucket compatibility. `src/renderer/games/engine.ts:136,655`; `src/renderer/games/types.ts:45`; `src/renderer/games/seenProgress.ts:22`. | P7 |
| Persisted AI request/result envelopes and caches | Canonicalize request language wherever an envelope is stored. Add explicit language to reusable answers. Invalidate disposable caches whose old validators collapsed IDs. Request schemas include `src/shared/aiConversation.ts:73`, `aiWritingCorrection.ts:51,241`, `aiMediaBrief.ts:138,403`, `aiBlancTutor.ts:160`, `aiWhyWrong.ts:64`, and `aiLeechRescue.ts:45`. | P7 |
| Transcription/capture/extension retry queues | Preserve the language captured when queued. Migrate known fields in queue serializers; never substitute the active language when replaying. `src/main/systemAudioCapture.ts:184,535,750`; `src/main/ytPlaylists.ts:496,506`; extension forwarding/retry consumers belong to P6. | P4/P6 |
| Backups, transfer files, CSV/APKG metadata, and mirrored IDB records | Migrate through the same domain serializer as live storage. Include schema versions and raw unresolved values in recovery reports. Never update only the localStorage copy. | Domain owner; P2 transfer integration |

Some records store language in the **key**, or use `lang`/`language` instead of `studyLang`. They need the same identity treatment:

- Knowledge: preserve `jp-word-knowledge-{lang}` and durable `word-knowledge-{lang}` (`src/renderer/knownWords.ts:34,186`).
- Statistics: preserve `jp-study-stats-v1-{lang}` (`src/renderer/stats.ts:27`).
- Conversation and memory: preserve existing keys by profile/language (`src/renderer/conversationStore.ts:25,46`).
- Writing history: preserve existing profile/language keys (`src/renderer/writingHistoryStore.ts:20`).
- Lookup history: widen its stored language and validator (`src/renderer/lookupHistory.ts:15,76`).
- YouTube playlists: fix normalization that currently drops Russian despite the wider declared type (`src/shared/ytPlaylists.ts:5,115`).
- Grammar/list/profile metadata: retain IDs and relationships while widening language fields.
- Library/media/subtitle records: preserve valid source tags, including languages outside the study set.

Unsuffixed legacy knowledge/statistics remain Japanese, matching existing migrations (`src/renderer/knownWords.ts:68`; `src/renderer/stats.ts:33`).

Register every new configuration key with reset, backup, and transfer handling (`src/renderer/storage/settingsCatalog.ts:215`; `src/renderer/storage/settingsTransfer.ts:529`). Store an index of language partitions so backup/reset does not enumerate only three hardcoded suffixes.

Migrations are idempotent, journaled, recoverable, and bounded. A provider update is not a reason to rerun historical language detection.

### Item context and resolution order

```ts
export interface LanguageContext {
  language: LanguageId;
  provenance: 'user' | 'item' | 'metadata' | 'detected' | 'active-fallback';
  script?: string;
  targetLanguage?: LanguageId;
  knowledgeScope: string;
}
```

Resolve in this order:

1. Explicit operation override.
2. Persisted item/selected-track language.
3. Declared source context, import mapping, or enclosing content.
4. Text detection.
5. Captured active default for an otherwise unbound study operation.

An old card’s missing-language Japanese rule applies before detection.

Add editable `LibraryItem.contentLang?: LanguageId`, with unresolved raw metadata preserved separately. `libraryItemLangTag()` must prefer it. Current library metadata unions omit Russian (`src/shared/types.ts:630,646`); the helper currently searches provider/inbox/level metadata (`src/shared/libraryLevel.ts:25`).

Persist provenance and user corrections. Correcting language invalidates dependent analysis caches, not the source file or card schedule.

### Detection rules in an open language system

Script detection returns evidence and candidates, not an unconditional language:

- Kana is useful Japanese evidence.
- Cyrillic does **not** establish Russian once Serbian, Ukrainian, Bulgarian, and other languages are possible.
- Latin does not establish English.
- Arabic script does not distinguish Arabic, Persian, and Urdu.
- Han does not distinguish Japanese, Chinese varieties, or script variants by itself.

Keep the Han resolver as a disambiguation hook:

- Use reviewed Simplified-only and Japanese-specific character/form hints.
- Shared forms such as `猫`, `中文`, `中国`, and `国` remain ambiguous.
- A conversion difference alone is insufficient evidence.
- Conflicting evidence needs span-level treatment or a visible source-language choice.
- Source context outranks these heuristics.
- Installed dictionaries, enrolled languages, and lookup success are not proof of language.

The existing helpers disagree: `studyLangOfText()` retains the old Han fallback (`src/shared/studyLang.ts:121`), while `detectStudyLangOfText()` adds reviewed-set machinery and candidate fallback (`src/shared/studyLang.ts:190`). Unify their policy without duplicating the OCR agent’s work.

For ambiguous raw Han with active Russian, do not secretly select Japanese. Return ambiguous evidence and, where the operation requires a default, label Russian as **active fallback**, visibly correctable. Untagged import metadata may remain unresolved instead.

Test kana Japanese, Simplified-specific Han, Japanese-specific Han, shared Han, mixed text, Serbian Cyrillic, Ukrainian Cyrillic, accented Latin, empty text, and unsupported source languages.

## 3. Versioned capability registry

### Shared provider contract

All fifteen slots use one registry and one availability model. Availability is evaluated for the requested language, target, purpose, installed assets, credentials, and consent.

```ts
export type CapabilitySlot =
  | 'detection' | 'segmentation' | 'morphology' | 'dictionary'
  | 'pronunciation' | 'ocr' | 'asr' | 'tts' | 'translation'
  | 'levels' | 'frequency' | 'grammar' | 'mediaLanguages'
  | 'rendering' | 'ankiMapping';

export interface CapabilityRequest {
  language: LanguageId;
  targetLanguage?: LanguageId;
  purpose?: string;
  script?: string;
}

export interface Requirement {
  kind: 'asset' | 'configuration' | 'credential' | 'consent' | 'app-update';
  id: string;
}

export interface CapabilityStatus {
  state: 'ready' | 'limited' | 'missing' | 'unsupported' | 'failed';
  reasonCode?: string;
  requirements: readonly Requirement[];
}

export type CapabilityResult<T> =
  | { ok: true; value: T; warnings?: readonly string[] }
  | { ok: false; status: CapabilityStatus };

export interface ProviderV1<S extends CapabilitySlot> {
  slot: S;
  apiVersion: 1;
  id: string;
  version: string;             // provider semver
  dataRevision?: string;       // exact dataset/model revision
  assets: readonly string[];
  supports(request: CapabilityRequest): boolean;
  probe(request: CapabilityRequest): Promise<CapabilityStatus>;
}

export interface OperationContext extends CapabilityRequest {
  requestId: string;
  signal: AbortSignal;         // recreated locally across IPC
}

export interface TokenSpan {
  start: number;              // UTF-16 offsets into original text
  end: number;
  surface: string;
  wordLike: boolean;
  lemma?: string;
  reading?: string;
  pos?: string;
}

export interface ProviderLease<P> {
  provider: P;
  release(): void;
}
```

The interfaces below describe trusted adapters. A downloaded manifest contains data bindings, never implementations of these methods.

Registry contract:

```ts
export interface SlotProviders {
  detection: DetectionProviderV1;
  segmentation: SegmentationProviderV1;
  morphology: MorphologyProviderV1;
  dictionary: DictionaryProviderV1;
  pronunciation: PronunciationProviderV1;
  ocr: OcrProviderV1;
  asr: AsrProviderV1;
  tts: TtsProviderV1;
  translation: TranslationProviderV1;
  levels: LevelProviderV1;
  frequency: FrequencyProviderV1;
  grammar: GrammarProviderV1;
  mediaLanguages: MediaLanguageProviderV1;
  rendering: RenderingProviderV1;
  ankiMapping: AnkiMappingProviderV1;
}

export interface CapabilityRegistryV1 {
  readonly revision: number;
  register<K extends CapabilitySlot>(provider: SlotProviders[K]): void;
  candidates<K extends CapabilitySlot>(
    slot: K, request: CapabilityRequest,
  ): readonly SlotProviders[K][];
  acquire<K extends CapabilitySlot>(
    slot: K, request: CapabilityRequest, providerId?: string,
  ): Promise<ProviderLease<SlotProviders[K]> | null>;
  report(request: CapabilityRequest): Promise<
    Readonly<Record<CapabilitySlot, CapabilityStatus>>
  >;
}
```

`register()` is application-internal. External input goes through manifest validation and a compiled adapter allowlist.

Selection order is: explicit operation choice, saved per-language choice, pack default, compatible generic fallback. Dictionaries may query several enabled providers in priority order. Never silently cross into a cloud provider without consent.

Match exact tags first, then explicitly compatible script/base ranges. `sr-Cyrl` must not fall back to a Latin-only provider. A provider serving both Chinese scripts declares that compatibility explicitly.

Acquire providers once per job. Persist language, provider version, data hashes, and relevant configuration in queued work. Provider replacement affects subsequent work; active jobs keep leases on their selected assets.

Cache identity includes language, target, provider/data revision, normalization version, source revision, and analysis options. Budget caches and unload idle indices/models.

### 3.1 Script and text detection

```ts
export interface DetectionProviderV1 extends ProviderV1<'detection'> {
  detect(text: string, context: {
    declared?: LanguageId;
    fallback?: LanguageId;
  }): Promise<CapabilityResult<{
    scripts: readonly string[];
    candidates: readonly { language: LanguageId; confidence: number }[];
    evidence: readonly string[];
    ambiguous: boolean;
  }>>;
}
```

- **Existing ja/zh/ru:** script tests and language resolution in `src/shared/studyLang.ts:121,190`; older ranges in `src/shared/langs.ts:52,56,75`; other heuristics in `profileRules.ts:213` and `pageLevelDetect.ts:26`.
- **Generic:** Unicode Script/Script_Extensions evidence, including supplementary characters and combining marks. Script alone often cannot identify a language. Use versioned Unicode data rather than expanding ad hoc BMP ranges. [Unicode UAX #24](https://www.unicode.org/reports/tr24/)
- **Installable:** declarative script ranges, reviewed character/word hints, and language identification data for an already supported inference adapter. Unicode data carries its own licence; preserve it. [Unicode licence](https://www.unicode.org/license.txt)
- **Empty:** declared/item language and manual selection still work. Automatic language identification is unavailable; never guess Japanese as a universal default.

### 3.2 Segmentation and tokenization

```ts
export interface SegmentationProviderV1 extends ProviderV1<'segmentation'> {
  segment(
    text: string, context: OperationContext,
  ): Promise<CapabilityResult<readonly TokenSpan[]>>;
}
```

- **Existing:** Japanese kuromoji/IPADIC loader in `src/renderer/tokenizerLoader.ts:1`; token construction in `src/renderer/tokenizer.ts:176`. Chinese and Russian already use ICU word segmentation in `src/shared/studySegmentation.ts:58`; main mining uses it at `src/main/mining.ts:797`.
- **Generic:** `Intl.Segmenter(language, { granularity: 'word' })`. Probe locale support. Preserve original offsets, punctuation, and whitespace. Alphabetic fallback splits whitespace with bounded punctuation handling; grapheme selection remains available.
- **Installable:** compatible kuromoji data and documented word lexicons for a compiled lexicon segmenter. A third-party tokenizer model is installable only when its runtime/schema is already supported.
- **Empty/limited:** manual selection and whole-expression cards work. Automatic word counts, highlights, mining, and sentence games become limited. Whitespace splitting is inadequate for Thai, Chinese, or Japanese; mark that limitation explicitly. [ECMA-402 Segmenter specification](https://tc39.es/ecma402/#segmenter-objects)

### 3.3 Lemmatization and deinflection

```ts
export interface MorphologyProviderV1 extends ProviderV1<'morphology'> {
  candidates(
    surface: string, context: OperationContext,
  ): Promise<CapabilityResult<readonly {
    form: string; reasons: readonly string[]; dictionaryValidated: boolean;
  }[]>>;
}
```

- **Existing:** Japanese Yomitan-style deinflection in `src/shared/deinflect.ts:392`, plus kuromoji lemmas; Russian candidates in `src/shared/russianMorphology.ts:66` and dictionary-backed forms in `src/main/dictionary/dictService.ts:268,319`. Chinese generally uses direct forms and orthographic variants.
- **Generic:** exact dictionary-form lookup only. Dictionary-provided inflection tables can improve this without a standalone analyzer.
- **Installable:** bounded JSON transformation rules with suffix/prefix replacements, conditions, reasons, and explicit format version. Support a documented Yomitan-compatible subset through an import converter.
- **Important format distinction:** Yomitan term-bank “rules” identify word classes; ordinary dictionary ZIPs do not supply a complete language deinflector. Current upstream Japanese transformations are JavaScript under GPL terms. Never import or execute that JavaScript; any converted rule distribution needs its own recorded provenance and licence compliance. [Upstream transformation source](https://github.com/yomidevs/yomitan/blob/master/ext/js/language/ja/japanese-transforms.js)
- **Hunspell feasibility:** `.aff` plus `.dic` can provide affix/stem candidates through a reviewed adapter. Spellchecking stems are not automatically reliable dictionary lemmas. Full compounding, flags, encodings, and morphology make this post-v1 work; require dictionary confirmation. Engine and dictionary licences are separate. [Hunspell project and format](https://github.com/hunspell/hunspell)
- **Empty:** exact lookup, manually entered forms, cards, and SRS work; inflected-form recall and automatic vocabulary grouping lose accuracy.

### 3.4 Dictionaries

```ts
export interface DictionaryProviderV1 extends ProviderV1<'dictionary'> {
  lookup(
    query: string, context: OperationContext,
  ): Promise<CapabilityResult<readonly {
    id: string;
    headword: string;
    language: LanguageId;
    reading?: string;
    senses: readonly { text: string; language?: LanguageId }[];
    ipa?: readonly string[];
    sourceId: string;
  }[]>>;
}
```

- **Existing Japanese:** Yomitan v3 import/provisioning, including bundled dictionary provisioning, in `src/main/dictionary/yomitanZip.ts:504,592`.
- **Existing Chinese:** CC-CEDICT lookup in `src/main/dictionary/chineseLookup.ts:267`.
- **Existing Russian:** Wiktextract import in `src/main/dictionary/importers/wiktextract.ts:360`, with dictionary form handling in `dictService.ts:268`.
- **Generic:** exact lookup in a language-tagged imported index. There is no universal built-in dictionary.
- **Installable Yomitan:** ZIP with `index.json`, term banks, and supported metadata banks. Require source language and gloss languages at import when metadata is absent or ambiguous.
- **Installable Wiktionary:** language-filtered Kaikki/Wiktextract JSONL or JSONL.gz. Kaikki exposes hundreds of languages, but coverage varies. English-edition extracts normally provide English glosses; a French target requires a suitable French-edition extraction or another dictionary, not automatic reversal. Preserve source edition, extraction schema, attribution, and applicable CC-BY-SA/GFDL terms. [Kaikki dictionary catalog](https://kaikki.org/dictionary/)
- **StarDict/DSL:** adapters already exist at `src/main/dictionary/importers/stardict.ts:56` and `dsl.ts:60`. Retain their supported subsets. StarDict currently requires extracted `.dict` rather than `.dict.dz` and writes `und` language rows (`stardict.ts:61,77`). Add explicit source/gloss assignment before calling it study-ready. Map DSL language names/directives to IDs rather than lowercasing them into presumed tags (`dsl.ts:63`).
- **Direction:** resolve `(source language, desired gloss language)`. Default the target to the learner’s native language, otherwise UI language. Offer available alternative/monolingual glosses visibly; do not silently translate or relabel them.
- **Empty:** selected text, source capture, manual cards, and SRS work. Lookup explains which dictionary to import/install.

Generalize the importer’s default language filter, currently `['ja', 'zh', 'en', 'ru']` (`wiktextract.ts:165`). A Spanish dictionary must not successfully import zero entries because of a legacy filter.

### 3.5 Readings and pronunciation aids

```ts
export interface PronunciationProviderV1 extends ProviderV1<'pronunciation'> {
  annotate(
    text: string, tokens: readonly TokenSpan[], context: OperationContext,
  ): Promise<CapabilityResult<readonly {
    start: number; end: number;
    kind: 'ruby' | 'pinyin' | 'stress' | 'ipa' | 'transliteration';
    value: string;
  }[]>>;
}
```

- **Existing:** Japanese readings from `src/renderer/tokenizer.ts:185`; Chinese syllables from `src/main/dictionary/readingAid.ts:37`; Russian dictionary stress from `readingAid.ts:83`; renderer caching at `src/renderer/readingAid.ts:25`.
- **Generic:** IPA from dictionary entries when present. IPA belongs beside the word; do not present it as character-aligned furigana.
- **Installable:** Wiktionary pronunciation fields, Yomitan IPA metadata already parsed at `yomitanZip.ts:455`, or versioned JSON pronunciation/transliteration tables.
- **Empty:** render original text. Hide reading-aid controls or explain the missing data. Never invent stress, pinyin, or IPA. Preserve Russian ambiguity handling: multiple possible stresses should not become a confident annotation.

### 3.6 OCR

```ts
export interface OcrProviderV1 extends ProviderV1<'ocr'> {
  orientations: readonly ('horizontal' | 'vertical')[];
  purposes: readonly ('snip' | 'lens' | 'manga' | 'vn' | 'book')[];
  recognize(
    image: Uint8Array, context: OperationContext,
  ): Promise<CapabilityResult<{
    text: string;
    lines: readonly {
      text: string;
      box: readonly [number, number, number, number];
      confidence?: number;
      vertical: boolean;
    }[];
  }>>;
}
```

- **Existing:** Paddle’s ja/zh/ru asset map at `src/main/paddleOcr.ts:64`; Japanese manga-ocr at `src/main/mangaOcr.ts:2023,2057`; Japanese Tesseract restriction at `src/renderer/ocr.ts:8,15`.
- **Router integration:** reuse the router being built. It already has open IDs, an `OcrProvider` interface, injected detection/scripts, and provider ranking (`src/shared/ocrRouterTypes.ts:21`; `src/main/ocrRouter.ts:118,138,178`). Connect it to this registry rather than introducing another router.
- **Generic downloadable provider:** Tesseract LSTM `.traineddata`, optionally gzip-compressed for the existing worker transport. `tessdata_fast` covers more than 100 languages and is Apache-2.0. Download data only; use Gum’s trusted Tesseract/WASM runtime. [Coverage](https://tesseract-ocr.github.io/tessdoc/Data-Files-in-tessdata_fast.html), [licence](https://github.com/tesseract-ocr/tessdata_fast/blob/main/LICENSE)
- **Paddle downloadable provider:** a compatible detector plus recognition model and character vocabulary. A recognizer may cover one language or several languages sharing a script. Record model family, preprocessing, tensor shape, vocabulary order, and conversion provenance; arbitrary Paddle checkpoints are not automatically compatible with Gum’s ONNX pipeline. [Official multilingual models](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/algorithm/PP-OCRv5/PP-OCRv5_multi_languages.en.md)
- **Japanese specialty:** keep manga-ocr restricted to its declared Japanese capabilities.
- **Empty:** manga images remain viewable; existing OCR sidecars remain usable; manual transcription remains available. Snip/Lens recognition explains the missing model.

Explicit mappings include `ja → jpn`, `zh-Hans → chi_sim`, `zh-Hant → chi_tra`, `ru → rus`, and the Serbian script-specific models where available. Do not strip script subtags before selecting a recognizer.

The current router’s base-language provider list and exact membership check need reconciliation: `paddleProvider()` declares `PADDLE_LANGS` (`ocrRouter.ts:402`), while matching checks exact inclusion (`ocrRouter.ts:172`). A manifest must not claim `zh-Hant` support merely because a helper can strip it to `zh`.

Preserve bounding boxes, orientation, uncertainty, provenance, cancellation, and time budgets. Code-point OCR alternatives require explicit mapping to UTF-16 text offsets. Confidence values from different engines are not automatically calibrated.

Dictionary-guided correction may improve recognition after language selection. Dictionary success must not establish the source language.

### 3.7 Speech recognition

```ts
export interface AsrProviderV1 extends ProviderV1<'asr'> {
  transcribe(
    pcm: Float32Array, sampleRate: number, context: OperationContext,
  ): Promise<CapabilityResult<readonly {
    startSeconds: number; endSeconds: number; text: string;
    language?: LanguageId;
  }[]>>;
}
```

- **Existing:** multilingual Whisper tiers at `src/shared/whisperModels.ts:28`; Japanese-only Kotoba at `whisperModels.ts:50`; worker language mapping at `src/renderer/whisperWorker.ts:119`.
- **Generic:** an installed compatible multilingual Whisper model, only for languages it actually supports.
- **Installable:** compatible pinned ONNX model/tokenizer/config assets through the existing Transformers adapter. Future GGML support is a separate runtime path, not implied by the current registry comments.
- **Codes:** map BCP-47 IDs to Whisper tokens explicitly; Chinese scripts share `zh`, Portuguese regions share `pt`, Serbian uses `sr`. Transcription language and output script are separate capabilities. Do not promise a script variant the model cannot control. [Whisper language map](https://github.com/openai/whisper/blob/main/whisper/tokenizer.py)
- **Empty:** audio playback, imported transcripts, and recording work; transcription-dependent analysis explains the missing model.

Replace `langs: ['any']` as an unlimited-language claim (`whisperModels.ts:23,84`) with actual model coverage. Retain per-language preferences and deduplicate shared model files.

### 3.8 TTS

```ts
export interface TtsProviderV1 extends ProviderV1<'tts'> {
  voices(context: CapabilityRequest): Promise<readonly {
    id: string; name: string; language: LanguageId;
    playback: boolean; fileSynthesis: boolean;
  }[]>;
  synthesize(
    text: string, voiceId: string, context: OperationContext,
  ): Promise<CapabilityResult<{ audio: Uint8Array; mimeType: string }>>;
}
```

- **Existing:** OS playback via Web Speech at `src/renderer/tts.ts:14,25`; flashcard voice enumeration/file synthesis in `src/main/flashcardAudio.ts:558,662`; Japanese neural voice host at `src/main/flashcardTtsHost.ts:106`.
- **Generic:** installed compatible OS voices. Detect voices per requested language and task; global `speechSynthesis` availability is insufficient.
- **Windows:** current file synthesis uses `System.Speech`, hence SAPI-visible voices. OneCore/Narrator voices are not all automatically accessible through that API. Add a supported OneCore adapter only where needed and report playback/file-synthesis capabilities separately.
- **Installation guidance:** show Windows language/speech installation instructions and refresh inventory afterward. Do not redistribute Microsoft voices or automate registry hacks. Not every Windows language pack includes a usable TTS voice. [Microsoft installation guidance](https://support.microsoft.com/en-gb/education/learning-accelerators/download-languages-and-voices-for-immersive-reader-read-mode-and-read-aloud)
- **Piper later:** ONNX weights plus matching JSON configuration and phonemizer requirements. Current maintained Piper is GPL-3.0; do not assume the archived implementation’s licence applies. Each voice has a separate model/dataset licence, and the repository-level MIT label is insufficient. [Piper engine](https://github.com/OHF-Voice/piper1-gpl), [voice model-card example](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/lessac/medium/MODEL_CARD)
- **Empty:** text study and supplied audio work. Hide synthetic listen buttons or offer voice guidance; never substitute a Japanese voice.

Piper is outside v1 pending adapter work, phonemizer/runtime review, and per-voice licence qualification.

### 3.9 Translation

```ts
export interface TranslationProviderV1 extends ProviderV1<'translation'> {
  pairStatus(
    source: LanguageId, target: LanguageId,
  ): Promise<CapabilityStatus>;
  translate(
    text: string, context: OperationContext & { targetLanguage: LanguageId },
  ): Promise<CapabilityResult<string>>;
}
```

Existing routing is already useful: per-pair selection and consent in `src/shared/translateProviders.ts:107,159`; main routing in `src/main/translateRouter.ts`; local model availability in `src/main/translate.ts:563`.

| Provider | Pair support contract |
|---|---|
| Local Qwen3 1.7B / larger existing Qwen choices | Model-configured languages and qualified pairs. Existing ja/zh/ru workflows remain release regressions; other pairs are marked experimental until checked. Multilingual training is not evidence that every pair is reliable. |
| DeepL | Source and target must both be supported for text translation, with required variant/feature support. Current Gum mapper permits bases `ja, zh, en, ru, ko, de, fr, es, it, pt, nl, pl, uk`; it is an application restriction, not DeepL’s complete catalog. |
| Existing cloud AI providers | Pair availability belongs to the selected model/provider configuration. Permit configured multilingual pairs with consent; label unqualified pairs accordingly rather than claiming all languages. |

The local asset is pinned Qwen3 GGUF (`src/shared/assetRegistry.ts:580`). Its model card advertises multilingual capabilities and Apache-2.0 licensing, but does not establish Gum-quality results for all pairs. [Qwen model card](https://huggingface.co/Qwen/Qwen3-1.7B)

Replace DeepL’s hardcoded mapper and variant loss (`translateProviders.ts:553,561`). Cache current language/feature discovery, handle API versions, and retain a last-known snapshot. Current documentation exposes resource-specific source/target availability; do not hardcode a permanent language count. [DeepL Languages API](https://developers.deepl.com/docs/languages/using-the-languages-api)

- **Generic:** no translation without an installed model or configured service.
- **Installable:** compatible GGUF weights/configuration through existing runtimes; later dedicated pair models require their own trusted adapters and licences.
- **Empty:** original text, supplied translations, dictionary lookup, and cards remain usable.
- **Consent:** retain per-provider consent and credential handling. Revocation takes effect immediately. Offline fallback runs only when the pair is supported; never treat installed weights as universal readiness.

### 3.10 Level scale

```ts
export interface LevelProviderV1 extends ProviderV1<'levels'> {
  scale(context: CapabilityRequest): Promise<{
    id: string; version: string;
    bands: readonly { id: string; label: string; order: number }[];
  }>;
  estimate(
    evidence: readonly { key: string; known: boolean }[],
    context: OperationContext,
  ): Promise<CapabilityResult<{
    bandId?: string; coverage?: number;
    basis: 'self-assessment' | 'qualified-list' | 'frequency';
  }>>;
}
```

- **Existing:** Japanese JLPT slots, Chinese six-band HSK slots, and Russian CEFR/TORFL labels in `src/shared/levelScale.ts:63,75,87`.
- **Generic:** CEFR labels for self-assessment; frequency-based bands when a list exists.
- **Installable:** versioned scale JSON plus separately licensed word/band lists.
- **Empty:** SRS grades and study activity work; proficiency estimates remain unavailable.
- **Honesty:** frequency rank is not a CEFR certification. Do not turn arbitrary frequency quantiles into asserted A1–C2 proficiency.
- **Compatibility:** preserve existing JLPT/HSK/TORFL mappings and custom slots. A newer HSK scale is a new scale version, not a silent reinterpretation of saved levels.

### 3.11 Frequency lists

```ts
export interface FrequencyProviderV1 extends ProviderV1<'frequency'> {
  ranks(
    words: readonly string[], context: OperationContext,
  ): Promise<CapabilityResult<Readonly<Record<string, number>>>>;
}
```

- **Existing:** ja/zh/ru starter definitions at `src/shared/bundledFrequencyDicts.ts:37`; remote Chinese/Russian lists at `:60,71`; import/provisioning in `src/main/mining.ts:1036,2182`.
- **Generic:** user-imported word/count or word/rank TSV, CSV, JSON, or plain text; store corpus, tokenization, language, and rank interpretation.
- **OpenSubtitles-derived lists:** FrequencyWords documents MIT for its generator and CC-BY-SA-4.0 for its content. Pin the actual list revision and preserve attribution. This does not establish a blanket licence for arbitrary subtitle downloads. [FrequencyWords README](https://github.com/hermitdave/FrequencyWords/blob/master/README.md)
- **Wikipedia:** accept an explicitly licensed published list, or generate one from identified Wikimedia dumps. Preserve dump provenance and applicable licence obligations; do not assume every third-party “Wikipedia frequency” file has permission metadata. [Wikimedia reuse terms](https://foundation.wikimedia.org/wiki/Terms_of_Use)
- **Empty:** hide frequency badges and frequency ordering; mining uses source order or another chosen ranking.
- **Existing risk:** the JPDB remote entry has undeclared licensing in notices (`src/shared/thirdPartyBundled.json:107`). Do not copy it into an “openly licensed starter catalog” without resolving that metadata.

### 3.12 Grammar content

```ts
export interface GrammarProviderV1 extends ProviderV1<'grammar'> {
  points(
    context: OperationContext, levelId?: string,
  ): Promise<CapabilityResult<readonly {
    id: string; title: string; levelId?: string;
    structure: string; explanation: string;
    explanationLanguage: LanguageId;
    examples: readonly { text: string; translation?: string }[];
  }[]>>;
}
```

- **Existing:** Japanese modules, Chinese HSK modules, and Russian CEFR content assembled at `src/renderer/data/grammar/index.ts:18,21,224`. User import already exists at `userImport.ts:187`.
- **Generic:** no authored grammar corpus. Optional AI explanations require existing AI consent and are marked generated, with model/language provenance.
- **Installable:** `gum-grammar-v1` JSON, described below, with stable namespaced IDs and content licences.
- **Empty:** hide corpus browsing, placement questions, grammar matching, and drills that require supplied content. User-authored notes/cards continue to work.

### 3.13 Subtitles and media language metadata

```ts
export interface MediaLanguageProviderV1 extends ProviderV1<'mediaLanguages'> {
  encode(
    service: 'jimaku' | 'opensubtitles' | 'youtube' | 'iso639-2',
    language: LanguageId,
  ): string | null;
  decode(
    service: 'jimaku' | 'opensubtitles' | 'youtube' | 'iso639-2',
    code: string,
  ): LanguageId | null;
}
```

- **Existing:** language-tagged subtitle provider/track records at `src/shared/subtitleProviders.ts:65,90`; OpenSubtitles per-language search at `src/main/subtitleDiscoveryOpenSubtitles.ts:225`; YouTube types at `src/shared/ytPlaylists.ts:5`; Jimaku is Japanese-only in `src/main/subtitleProviderClients.ts:10,441`.
- **Generic:** local subtitle import, source tags, and user correction. Preserve provider codes and canonical IDs separately.
- **Installable:** versioned alias/code JSON for existing service adapters. Service availability and credentials are not downloadable data capabilities.
- **Mappings:** Jimaku returns no mapping for unrelated languages. OpenSubtitles uses its service-specific language catalog. YouTube caption language metadata uses BCP-47; preserve script/region and actual selected track IDs. [YouTube captions resource](https://developers.google.com/youtube/v3/docs/captions)
- **Empty:** local playback and manual track selection work; provider-specific discovery is unavailable.
- **Safety:** do not generate wildcard caption download patterns that accidentally fetch every language.

### 3.14 Fonts and rendering

```ts
export interface RenderingProviderV1 extends ProviderV1<'rendering'> {
  policy(context: CapabilityRequest): {
    direction: 'ltr' | 'rtl';
    writingModes: readonly ('horizontal-tb' | 'vertical-rl')[];
    fontFamilies: readonly string[];
    tokenJoiner: string;
    punctuationDirection: 'ltr' | 'rtl';
  };
}
```

- **Existing:** Chinese content tags at `src/shared/studyLang.ts:61`; subtitle language-specific rendering at `src/renderer/components/SubtitleCueLine.tsx:199,210,283`; EPUB vertical layout at `src/renderer/views/NovelReader.tsx:408,3186`.
- **Generic:** browser shaping, system font fallback, correct `lang`, grapheme-safe selection, and horizontal rendering.
- **Installable:** pinned TTF/OTF/WOFF2 font assets with licences; Noto is a candidate family, with each downloaded release’s licence retained. Font installation changes glyph coverage, not reader correctness. [Noto downloads](https://notofonts.github.io/), [Noto Sans licence metadata](https://github.com/google/fonts/blob/main/ofl/notosans/METADATA.pb)
- **Vertical text:** expose only for ja/zh in v1, preserving explicit source layout where supported.
- **RTL decision:** complete Arabic/Hebrew/Persian study workflows are **after v1**. Preserve their IDs and imported data now; do not label their packs fully ready.
- **Cost:** RTL requires bidi-safe content containers, logical CSS properties, caret/selection testing, popup anchoring, horizontal pagination, keyboard navigation, transcript alignment, mixed-script cards, OCR reading order, export, and Anki checks. The current EPUB reader equates source `rtl` with vertical layout (`NovelReader.tsx:408–415`), so adding `dir="rtl"` alone is insufficient.
- **Empty:** use safe horizontal system rendering where supported. Unsupported RTL workflows explain that a Gum update is required; a font download cannot fix them.

The desktop shell and UI locale do not mirror merely because the study language is RTL.

### 3.15 Anki note-type field mapping

```ts
export interface AnkiMappingProviderV1 extends ProviderV1<'ankiMapping'> {
  suggest(
    fields: readonly string[], context: CapabilityRequest,
  ): Promise<{
    roles: Readonly<Record<string, string>>;
    unresolvedRoles: readonly string[];
  }>;
}
```

- **Existing:** typed field roles and Kinomoto preset in `src/main/anki/fieldMapper.ts:9,27`; Japanese/Chinese/Russian field synonyms at `:47`; model-field cache at `src/main/anki/modelFields.ts:76`.
- **Generic:** explicit user mapping to stable field roles. Keep existing profile overrides authoritative.
- **Installable:** declarative field-name aliases and suggested role mappings in versioned JSON.
- **Empty:** manual mapping and Gum’s generic note type work. Missing pronunciation/audio providers leave optional fields empty.
- **Safety:** suggestions do not overwrite a confirmed mapping, existing note fields, or templates. Packs cannot install executable Anki templates or add-ons. Include source/gloss language and script in preview data.

## 4. Pack manifests, installation, and catalog

### Manifest schema

```ts
export interface PackLicenceV1 {
  id: string;
  spdx: string;
  url: string;
  attribution: string;
}

export interface PackAssetV1 {
  id: string;
  urls: readonly string[];
  sizeBytes: number;
  unpackedSizeBytes?: number;
  sha256: string;
  format: string;
  revision: string;
  licenceIds: readonly string[];
  dependsOn?: readonly string[];
}

export interface PackProviderBindingV1 {
  id: string;
  version: string;
  apiVersion: 1;
  adapterId: string;
  formatVersion: number;
  languages: readonly LanguageId[];
  assets: readonly string[];
  config: Readonly<Record<string, unknown>>; // adapter-schema validated
}

export interface LanguagePackManifestV1 {
  schemaVersion: 1;
  id: string;
  version: string;
  minimumGumVersion: string;
  names: { native: string; localized: Readonly<Record<string, string>> };
  languages: readonly LanguageId[];
  scripts: readonly string[]; // ISO 15924
  direction: 'ltr' | 'rtl';
  slots: Partial<Record<CapabilitySlot, readonly PackProviderBindingV1[]>>;
  assets: readonly PackAssetV1[];
  licences: readonly PackLicenceV1[];
}
```

Require semantic versions, namespaced IDs, known adapter/API/format versions, bounded configuration, valid language IDs, exact sizes, and SHA-256 digests. Unknown adapters produce an unsupported capability; they never trigger code loading.

An illustrative minimal manifest follows. It demonstrates the shape, not the complete built-in Japanese pack. Asset metadata is taken from the existing pinned entry at `src/shared/assetRegistry.ts:580`; this audit did not download it again.

```json
{
  "schemaVersion": 1,
  "id": "org.gum.examples.ja-offline",
  "version": "1.0.0",
  "minimumGumVersion": "1.0.0",
  "names": {
    "native": "日本語",
    "localized": { "en": "Japanese offline translation example" }
  },
  "languages": ["ja"],
  "scripts": ["Hira", "Kana", "Hani"],
  "direction": "ltr",
  "slots": {
    "translation": [
      {
        "id": "org.gum.qwen3-1.7b",
        "version": "1.0.0",
        "apiVersion": 1,
        "adapterId": "gum.translation.qwen-gguf",
        "formatVersion": 1,
        "languages": ["ja"],
        "assets": ["qwen3-1.7b-q8"],
        "config": {
          "pairPolicy": "gum-qualified-pairs-v1"
        }
      }
    ]
  },
  "assets": [
    {
      "id": "qwen3-1.7b-q8",
      "urls": [
        "https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/90862c4b9d2787eaed51d12237eafdfe7c5f6077/Qwen3-1.7B-Q8_0.gguf"
      ],
      "sizeBytes": 1834426016,
      "sha256": "061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a",
      "format": "gguf",
      "revision": "90862c4b9d2787eaed51d12237eafdfe7c5f6077",
      "licenceIds": ["qwen-apache-2"]
    }
  ],
  "licences": [
    {
      "id": "qwen-apache-2",
      "spdx": "Apache-2.0",
      "url": "https://www.apache.org/licenses/LICENSE-2.0",
      "attribution": "Qwen3 model weights by the Qwen team."
    }
  ]
}
```

Built-in code adapters and OS services may have no downloadable asset. Shared assets are identified by digest, not duplicated under every language directory.

Publish schemas and import-format documentation from maintained resources under `src/`; use the existing application help surface. No root configuration changes are necessary.

### Built-in packs

“Built-in pack” means bundled descriptors and existing adapter support. It does not mean all optional model weights ship in the installer.

| Pack | Existing blocks to preserve |
|---|---|
| `org.gum.ja` | Japanese detection/Han hints, kuromoji, deinflection, JMdict/Yomitan, furigana, JLPT, authored grammar, existing frequency choices, Japanese OCR specialties, Kotoba preference |
| `org.gum.zh` | `zh`, `zh-Hans`, `zh-Hant` declarations; ICU segmentation, CC-CEDICT, pinyin, existing HSK scale/grammar, explicit OCR script coverage |
| `org.gum.ru` | ICU segmentation, Russian candidate rules and dictionary forms, Wiktionary stress, CEFR/TORFL scale, authored grammar, Russian OCR |

All use shared generic services where appropriate: SRS, media playback, compatible Whisper, OS TTS, translation routing, and Anki mapping.

Wrap existing algorithms. Do not rewrite working Japanese morphology merely to make the interface generic.

### Curated starter catalog

Every published downloadable artifact must have a pinned revision, measured size, checksum, licence, and import smoke test. The table specifies catalog recipes; unverified URLs or missing licence metadata block publication.

Common starter blocks:

- ICU segmentation.
- Exact/dictionary-form lookup, enhanced by imported inflection tables where supported.
- A language-filtered Kaikki English-gloss dictionary.
- Optional Tesseract data.
- Dictionary IPA when available.
- CEFR self-assessment labels.
- Generic Anki mapping and horizontal system rendering.

Optional frequency data may come from a verified FrequencyWords list; its absence does not block basic study. Windows voices are external system dependencies, not redistributed catalog assets.

| Language | Script | Tesseract data | Specific qualification | Release recommendation |
|---|---|---|---|---|
| `es` | Latn | `spa` | Accents, dictionary forms, IPA, native gloss direction | v1 starter |
| `fr` | Latn | `fra` | Apostrophes/elision, accents, imported forms | v1 starter |
| `de` | Latn | `deu` | Compounds and inflection remain limited without a morphology block | Next catalog batch |
| `it` | Latn | `ita` | Clitics and inflected forms | Next catalog batch |
| `pt`, regional variants | Latn | `por` | Preserve regional TTS/translation preferences | Next catalog batch |
| `ko` | Hang | `kor` | Word segmentation is not Korean morphological analysis | After dedicated qualification |
| `vi` | Latn | `vie` | Preserve tone marks; whitespace syllables are not always lexical words | After dedicated qualification |
| `th` | Thai | `tha` | Require working ICU word segmentation; whitespace fallback is inadequate | After dedicated qualification |
| `ar` | Arab | `ara` | Open dictionary/OCR assets exist; complete RTL rendering remains a Gum dependency | Planned after v1 |

These recipes use openly licensed downloadable data. Do not fill gaps with proprietary dictionary dumps, voice files, scraped grammar, or unlicensed frequency assets.

Whisper and local translation remain optional shared providers, separately qualified for each language. A catalog entry does not imply every feature is available.

### Build your own pack

The user:

1. Selects or enters a validated language ID and optional script/region.
2. Sets native/explanation language.
3. Chooses generic defaults.
4. Selects an existing provider or imports supported data for each desired slot.
5. Confirms source/gloss language, licence metadata, and provider compatibility.
6. Reviews the capability report and saves the local manifest.

Support Yomitan ZIP, Kaikki JSONL(.gz), supported StarDict/DSL subsets, frequency lists, grammar JSON, supported OCR data, and compatible model/font assets.

Missing slots are allowed. A pack may provide only a dictionary, or only basic text study. Unknown data formats explain the required Gum adapter; selecting a file never causes it to execute.

For local imports, record file hashes and user-supplied provenance. Missing permission metadata prevents curated redistribution; it does not turn a private import into an openly licensed catalog asset.

### Grammar pack JSON

Use a documented `gum-grammar-v1` envelope:

```json
{
  "format": "gum-grammar",
  "version": 1,
  "id": "org.example.es-basics",
  "language": "es",
  "explanationLanguage": "en",
  "licenceId": "pack-content",
  "points": [
    {
      "id": "org.example.es-basics.present-regular",
      "title": "Regular present tense",
      "level": { "scaleId": "cefr", "bandId": "A1" },
      "structure": "subject + present-tense verb",
      "explanation": "Original, licensed explanatory text.",
      "examples": [
        { "text": "Estudio español.", "translation": "I study Spanish." }
      ],
      "tags": ["present", "verbs"]
    }
  ]
}
```

Allow plain text and a small sanitized formatting subset. Matching patterns use a documented bounded grammar, not JavaScript or arbitrary regular expressions.

Keep IDs stable across updates so grammar progress and card references survive. Never replace user edits silently. Existing legacy example field names may remain behind adapters; new pack formats use language-neutral names.

### Capability report and setup UI

For each studied language, display:

| State | User-facing behavior |
|---|---|
| Ready | Works with the selected provider |
| Limited | Works with a named limitation |
| Missing data | One-click installation when a verified artifact exists |
| Needs configuration | Open dictionary mapping, voice guidance, credentials, or consent settings |
| Unsupported in this Gum version | Explain the required application update |
| Failed | Show retry/recovery without disabling unrelated study |

The report is derived from provider probes, not a static “supports Japanese” flag. OCR orientation, TTS file synthesis, translation pair, and dictionary gloss direction affect readiness.

Setup retains the earlier plan:

- Multi-select study languages and a separate **Start with** choice.
- Require at least one language.
- Selecting another language does not change the starting language.
- Show Chinese script controls when applicable.
- Keep interface-language selection separate.
- Placement and seeding are per language; absent placement content offers self-assessment or skip.
- Preserve Back/Later/restart state.
- Display asynchronous Japanese dictionary provisioning while it runs.

Download planning is the union of dependency closures:

- Count shared detector/model bytes once.
- Reuse installed multilingual Whisper and translation weights.
- Preserve per-language provider/model selections.
- Show download size, licence, pause/resume/retry, and affected languages.
- Permit continuing with missing optional blocks.
- Never eagerly load every index into the renderer.

Keep a reusable `StudyLanguageSwitcher` in the existing Study OS/Aero/Wired tray and Blanc top bar (`src/renderer/components/DesktopShell.tsx:4006`; `components/blanc/BlancShell.tsx:872`).

Show the active native name, enrolled languages, readiness, and **Manage languages**. Use committed state, accessible announcements, focus restoration, and existing shell tokens.

Reserve `Ctrl+Shift+U` for `study.switchLanguage`, subject to shortcut-catalog verification. Preserve `Ctrl+Shift+L` and `Ctrl+Alt+Shift+L` (`src/renderer/keyboardShortcuts.ts:628,907`), remapping, IME composition, and modal handling.

Adding membership, installing a pack, making active, removing membership, uninstalling assets, and deleting study data are separate actions.

Removing a language preserves its cards, schedules, knowledge, media, conversations, statistics, Anki links, and installed assets. Prevent removing the final member; replace active atomically. Existing jobs finish with captured context. Retained data remains available through explicit filters.

### Integrity, parser isolation, and notices

Installation is staged: validate manifest, resolve dependencies, download, verify size/hash, parse/import, verify resulting index, then atomically activate.

Required protections:

- HTTPS downloads with pinned catalog metadata; a checksum alone does not authenticate an untrusted manifest.
- Trusted catalog updates, with a recorded catalog revision and publisher provenance.
- Bounded archive expansion, record sizes, recursion, rule execution, and model memory.
- Reject path traversal, symlinks escaping the install root, and unexpected archive members.
- Treat HTML, DSL markup, font files, model graphs, and pronunciation URLs as untrusted data.
- Never load downloaded JS/TS, DLLs, executables, native extensions, custom ONNX operators, or remote runtime code.
- Do not enable model `trust_remote_code` or equivalent behavior.
- Route all file/asset access through approved references.
- Keep the previous working provider version until activation succeeds.
- Hold leases on assets needed by running jobs; defer their deletion.

The existing dictionary child process is useful for responsiveness and crash recovery (`src/main/dictionary/importWorker.ts:1,18`), but a Node child with filesystem access is not a security sandbox. Pure parsers should run in a sandboxed worker/renderer with no Node or network access and narrow brokered IO. Native parsers/inference need the strongest supported process isolation and explicit resource limits; do not claim worker isolation alone eliminates native-parser risk.

Use the existing notices pipeline:

- `tools/generate-notices.cjs:40,264` already reads `src/shared/thirdPartyBundled.json`.
- P2 adds curated provider/data notices to that JSON; no generator edit is required.
- Preserve the existing generated licence document’s bundled/npm sections.
- At runtime, maintain a separate installed-data notice ledger with actual pack version, source URL, hash, licence text/URL, attribution, and modifications.
- Merge that ledger into About/licence display, currently based on static data at `src/renderer/components/about/AboutPanel.tsx:31,102`.
- Include installed-data notices with exported pack metadata and applicable derived-data exports.
- The existing release workflow regenerates static notice artifacts. Runtime downloads are not retroactively “bundled” in a past build.

Unknown, noncommercial, or no-derivatives terms require explicit treatment; they are not accepted automatically into the open starter catalog.

## 5. Feature behavior by capability

Every feature declares its required and optional slots. A missing provider returns a structured status; it must not crash, redirect to Japanese data, or erase content.

| Feature | With generic blocks | Additional blocks / missing behavior |
|---|---|---|
| Dictionary lookup | Exact imported-dictionary lookup and manual language choice | Morphology improves inflected forms; pronunciation/frequency enrich results. No dictionary shows an install/import action. |
| EPUB reader | Supported horizontal rendering, selection, bookmarks, manual mining | Segmentation enables word interactions; dictionary/readings enrich them. Vertical ja/zh needs rendering support. RTL workflows remain gated in v1. |
| Web reader / Immersion | Declared language, readable source, selection, manual cards | Highlighting and analysis need segmentation/knowledge; preserve unsupported/unknown source metadata. |
| Manga reader | Images, navigation, existing OCR sidecars | OCR provider must support language/layout. Missing OCR leaves viewing/manual text entry available. |
| Mining and cards | Explicit language, source text, screenshots, supplied audio, manual fields | Dictionary, readings, frequency, TTS, and translation are independently optional. Keep incomplete drafts editable. |
| SRS | Language-tagged cards and existing scheduler | No dictionary/model required. Freeze queue scope, budgets, and settings. |
| Known words | Explicit language/scope plus stable generic normalization | Morphology improves aliases. Missing segmentation limits automatic marking, not manual knowledge edits. |
| Video and subtitles | Playback, local subtitles, track selection, mining selected text | Discovery uses service mappings/credentials; transcription, translation, and readings are optional. |
| Snip OCR | Capture image and manual transcription | Registry-selected OCR for requested language; show exact missing recognizer/dependencies. |
| Lens OCR | Captures and existing text | Same OCR registry; preserve capture language through retries and adoption. |
| Manga/book OCR | Existing sidecars and manual text | Require page detection/layout plus recognizer; do not advertise plain Tesseract as equivalent to specialized manga recognition. |
| Speech/shadowing | Recording and playback against supplied reference audio/text | ASR for transcription; TTS for generated reference audio. Detailed phonetic/prosodic scoring requires an actual scoring capability, not merely Whisper. |
| Grammar | User notes/cards | Authored grammar pack for corpus/drills; optional consented AI explanations remain labelled generated. |
| Games | Language-neutral games using user material where supported | Declare required content, segmentation, audio, or pronunciation. Kana sprint stays a Japanese-content capability. |
| AI features | Existing generic prompted workflows for configured supported languages | Keep source and explanation languages separate; validate output conservatively; missing model/consent gives a clear setup state. |
| Chrome extension | Page/element language, selection, capture, manual mining | Gum supplies capability summaries and language-scoped lookup/knowledge. Offline caches retain those scopes. |
| Stats and goals | Activity by recorded language; shared/per-language goals | No language provider needed. Proficiency panels need a scale; frequency estimates remain labelled. |
| Anki | Explicit generic field mapping, note creation, existing sync | Readings/audio are optional; unresolved language/mapping requires correction before knowledge aggregation. |

A cloud service outage, missing voice, or failed dictionary import cannot disable unrelated card review or media playback.

### Known words and normalization

Replace the active-only cache (`src/renderer/knownWords.ts:40`) with bound services:

```ts
knowledgeFor(context).getLevel(word);
knowledgeFor(context).setLevel(word, level);
knowledgeFor(context).bulkSetFromAnki(levels);
knowledgeFor(context).counts();
```

Capture the bound service before awaits. Preserve manual precedence, Japanese tokenizer migration, Chinese key folding, durable IDB reconciliation, pending writes, and language-specific invalidation.

Generic normalization preserves meaningful accents and combining marks. Do not apply Russian stress stripping to Vietnamese or every imported language: current generic-looking helpers require review (`src/shared/studySegmentation.ts:84`; `src/main/dictionary/importers/wiktextract.ts:203`).

All-language imports require tagged rows or explicit per-batch language. Plain text import/export remains language-specific.

### SRS, sessions, and review history

Keep schedules attached to card IDs. Collection filters are independent of active state.

- Freeze session scope and scheduler settings.
- Use each card’s language for knowledge, deferred nudges, undo, and activity.
- Preserve the existing profile-level daily new-card cap; switching language cannot grant another allowance.
- Add language to review rows; current schema lacks it (`src/shared/reviewLog.ts:28`).
- Recover old row language from surviving cards/grammar IDs where possible.
- Apply the Japanese historical-card rule only where warranted.
- Keep other history legacy/unassigned and include it in combined totals without inventing attribution.

Remove active-language exclusion gates only after partitioned knowledge is ready (`src/renderer/flashcardDeck.ts:1763,1822`).

### Anki attribution

Resolve note language **before** interval aggregation. Current snapshots lose language (`src/shared/anki.ts:310`) and main merges by expression (`src/main/anki/intervals.ts:721`).

Precedence is Gum provenance, confirmed note/deck/model/query mapping, then sufficiently unambiguous content evidence. Broad overlapping queries such as `deck:*` are not language evidence.

Persist confirmed assignments for ambiguous notes. Surface conflicts. Aggregate `(language/knowledge scope, normalized expression)`, including optimistic created-note entries, deferred pushes, renderer folding, and manual sync.

Repoll to rebuild expression-only caches; lost distinctions cannot be reliably recovered from merged snapshots. Preserve manual knowledge precedence, suspension behavior, stale-sync reporting, links, and explicit profile-routing overrides.

### Statistics and goals

Every writer receives source/session language. Do not select a partition after awaiting work (`src/renderer/stats.ts:294,306`).

| Metric | Combined behavior |
|---|---|
| Reviews, mined cards, studied lines | Sum attributed counts |
| Known words | Distinct `(knowledge scope, key)` entries |
| Time | Credit each activity once, preserving channels |
| Accuracy/retention | Recalculate from summed numerators/denominators |
| Active days/streak | Union qualifying dates and recompute |
| Characters | Raw count with per-language breakdown |
| Reading speed | Keep language-specific |
| Proficiency | Separate scale/language panels |

Preserve historical partitions and the shared study-day boundary. Do not sum streaks, average unweighted percentages, or present combined JLPT/HSK/CEFR proficiency.

Goals retain **Shared** as migration default and offer **Per language**. Preserve custom values from `jp-daily-goal-v1` (`src/renderer/dailyGoal.ts:22`), retain both configurations when modes change, and let only the selected mode drive reminders.

Removed-language history remains available. Active switches never reset progress.

## 6. Consumer audit and branch risks

The previous audit recorded 174 direct `getStudyLang()` calls across 81 non-test files plus six lazy references. Treat that as historical audit coverage, not a fresh count of a moving checkout.

Retain its four dispositions:

- **A — Operation/item:** explicit source, item, partition, or captured session language.
- **B — Resolution:** shared contextual detection only when explicit language is absent.
- **C — Collection:** independent All/one-language view scope.
- **D — Default/configuration:** active language remains appropriate.

An All view shows tagged rows and totals. A single-language operation derives its context from the selected item. Default queues/reminders use the study set; removed-language data remains reachable.

### Riskiest branches

| Evidence | Risk and required replacement |
|---|---|
| `src/shared/studyLang.ts:23,38` | Closed validation and tag collapsing discard new IDs/scripts. Separate identity parsing from capability support. |
| `src/shared/studyLang.ts:124,125,211,218` | Cyrillic becomes Russian; ambiguous Han can become Japanese. Use evidence, source context, and labelled fallback. |
| `src/shared/levelScale.ts:126,161` | Unknown languages fall through to Japanese tables. Resolve a scale provider. |
| `src/shared/studySegmentation.ts:84` | Russian normalization leaks into generic word keys. Use versioned language normalization. |
| `src/main/dictionary/importers/wiktextract.ts:165,203` | Default filter drops new languages; generic accent stripping can corrupt forms. Pass explicit language/schema normalization. |
| `src/main/dictionary/yomitanZip.ts:137–143` | Latin gloss text is presumed English. Prefer metadata/user-confirmed gloss direction. |
| `src/renderer/knownWords.ts:160,327` | Active-only guards prevent valid nonactive operations. Bind stores to context. |
| `src/renderer/flashcardDeck.ts:1762,1821` | Legacy default and active-language gates can misattribute mixed reviews. Separate historical migration from runtime routing. |
| `src/shared/snipKnowledge.ts:89` | Every language other than zh/ru becomes Japanese. Use canonical card language and bound normalization. |
| `src/shared/flashcardAutoAudio.ts:97` | Non-zh/non-ru languages fall into Japanese eligibility. Probe TTS/text compatibility. |
| `src/shared/flashcardAutoReading.ts:101` | Closed reading-aid assumptions offer incorrect enrichment. Query pronunciation capability. |
| `src/main/paddleOcr.ts:41,64` | Three-language recognizer map blocks new data providers. Bind compatible models through the registry. |
| `src/main/ocrRouter.ts:172,402,502,509` | Exact base-tag lists and built-in defaults can reject variants or constrain detection. Use central matching and registered providers. |
| `src/renderer/ocr.ts:8,15` | Tesseract is Japanese-only despite general runtime potential. Resolve traineddata by provider. |
| `src/renderer/whisperWorker.ts:119` | Unknown input becomes Japanese transcription. Require mapped supported language or explicit auto-detect mode. |
| `src/shared/translateProviders.ts:561` | Drops variants and forces target English/Portuguese/Chinese defaults. Use pair/variant capability data. |
| `src/shared/ytPlaylists.ts:115`; `src/main/ytPlaylists.ts:1025` | Normalizers/IPC omit languages already declared by types. Use shared language validation. |
| `src/renderer/views/NovelReader.tsx:408` | RTL spine direction triggers vertical layout. Separate reading direction and writing mode. |
| `src/renderer/data/grammar/userImport.ts:13` | Closed `FIRST_LEVEL` table cannot serve new scales. Ask the scale provider or leave level unspecified. |
| `src/renderer/games/engine.ts:641,1117` | Russian gets spaces; every other language concatenates. Use rendering/token-joining policy. |
| `src/renderer/components/speak/ShadowingFeedback.tsx:76` | Language checks stand in for scoring support. Gate the actual feedback capability. |
| `src/main/extensionServer.ts:2344,2396,2433,2520,2798` | Japanese defaults and closed branches leak across routes. Resolve/freeze request context and capability support. |

Language-specific algorithms may retain internal language checks where they implement that provider’s actual rules. General features must select capabilities instead of inferring them from a language name.

### Retained consumer assignments

Paths in this table are relative to `src/`. Grouped entries share the stated responsibility; package ownership is exclusive by file.

| Owner | Files and anchor references | Required behavior |
|---|---|---|
| P0 | `renderer/studyEnvironment.ts:80,103,125,144`; `renderer/useStudyLanguage.ts:27`; `main/studyLanguage.ts:26,57`; `renderer/main.tsx:308`; `renderer/blancMain.tsx:138` | D/B/A: committed state, common resolution, explicit asset planning |
| P0 | `shared/studyLang.ts:121,190`; `profileRules.ts:115,213`; `inboxMeta.ts:8,31,85`; `pageLevelDetect.ts:26` | Shared identity/context policy; preserve unresolved content |
| P0 | `shared/types.ts:630,646`; `libraryLevel.ts:10,31,42`; `bookOcrIpc.ts:134`; `readingLens.ts:247` | Canonical item language and bridge schemas |
| P0 | `preload.ts:3914`; `renderer/window.d.ts:2393`; `shared/anki.ts:310,336`; `reviewLog.ts:28,86`; `assetRegistry.ts:878` | Versioned contracts and shared definitions |
| P1 | `renderer/knownWords.ts:34,40,186,252,327`; `savedWords.ts:38,97,117,131`; `studyTokens.ts:42,47,171,224` | A/C: bound knowledge, tagged saved rows, independent filters |
| P1 | `renderer/flashcardDeck.ts:1737,1763,1822,1900,2149,2597`; `comprehensibility.ts:35`; `firstRunSeed.ts:91,107,121` | Card/session language, undo, delayed work, seeding |
| P1 | `renderer/deckLevelEstimate.ts:104,145`; `levelLists.ts:18,64,283`; `levelService.ts:35,109` | Mixed-deck partitions and capability-based scales/lists |
| P1 | `renderer/ankiSync.ts:37`; `apkgImport.ts:253,292`; `main/anki/intervals.ts:665,699,721,737`; `main/anki/index.ts:212` | Language before aggregation/import/audio |
| P1 | `renderer/components/blanc/BlancFlowRunner.tsx:148,433`; `components/blanc/blancFlow.ts:76`; `aeroMechanics/useAeroDeck.ts:36` | Filtered queues with stable session budgets |
| P2 | `renderer/firstRunSetup.ts:40`; `components/onboarding/FirstRunSetup.tsx:107,161,232,245,434`; `firstRunDownloads.ts:17,24,89`; `cedictMissingPrompt.ts:121,157` | Multi-language setup, placement, capability readiness |
| P2 | `renderer/components/settings/pages/StudyLanguageSection.tsx:31`; `TranslatorDefaultsCard.tsx:56`; `components/settings/settingsRegistry.ts:683,822`; `storage/settingsCatalog.ts:215,905`; `storage/settingsTransfer.ts:529,736` | Membership/provider settings and complete transfer/reset |
| P2 | `renderer/components/DesktopShell.tsx:4006`; `components/blanc/BlancShell.tsx:780,872,942`; `BlancStudySettings.tsx:32`; `keyboardShortcuts.ts:628,907` | Shared switcher; command resolution; shell safety |
| P2 | `renderer/widgets/aeroStudyGadgets.tsx:173`; `widgets/study.tsx:250` | Displayed card/saved-row language, including legacy cards |
| P3 | `renderer/wordLookup.ts:253`; `mineTarget.ts:94`; `components/DictionaryPopup.tsx:161`; `DictionaryResults.tsx:378,538`; `views/DictionaryView.tsx:38,113`; `components/blanc/BlancDictionaryPanels.tsx:31,57` | B/C: contextual lookup; panel filters never mutate active |
| P3 | `renderer/bookLevelEstimate.ts:64,139,190,249`; `bookProfiles.ts:178,189,222`; `inboxEnrich.ts:30`; `wordHighlight.ts:74,79` | Book language through profiling, scoring, and caches |
| P3 | `renderer/studyMining.ts:482,522,626`; `studyMiningRoutes.ts:129,220`; `companionMine.ts:52,92`; `clipboardHistory.ts:283`; `visualNovelMining.ts:111` | Freeze language on drafts, mixed imports, captures |
| P3 | `renderer/components/blanc/BlancCaptureInboxPanel.tsx:49,90,320`; `BlancDeckPanel.tsx:145`; `blancCaptureInbox.ts:15,161`; `components/companion/CardPreview.tsx:82,196` | Preserve/edit capture language instead of redetecting per action |
| P3 | `renderer/components/filesapp/FilesApp.tsx:2578,2605`; `filesMineChain.ts:75`; `components/MiningCataloguePanel.tsx:259,270`; `ReaderCollectionPanel.tsx:382` | Per-source language in mixed-file mining and receipts |
| P3 | `renderer/views/NovelReader.tsx:168,1217,1921,1951`; `MangaReader.tsx:439,1223,2563`; `components/immersion/ImmersionContent.tsx:247,339,481`; `visualNovelStudyTime.ts:21` | Source-aware lookup/translation/mining/activity; local browsing scope |
| P3 | `renderer/components/lens/LensAnalysisPanel.tsx:56`; `LensReaderPanel.tsx:122`; `components/library/BookOcrPanel.tsx:68`; `MangaHandwritingPopup.tsx:98`; `LockscreenStudy.tsx:47` | Capture/card language and capability-gated recognition |
| P3 | `renderer/components/SentenceTranslatePopup.tsx:67`; `SystemDictOverlay.tsx:87,106`; `shared/bookOcr.ts:153,186` | Resolved source language through translation/export |
| P3 | `main/bookOcrJob.ts:80`; `mangaOcr.ts:929,1234`; `readingLens.ts:404,678`; `mining.ts:669,1036,1052,2182` | Frozen jobs; registry-backed lexical/OCR consumers; asynchronous assets |
| P4 | `renderer/mediaStudyWorkflow.ts:122,142,237`; `useUnifiedSearchSession.ts:61`; `whisperTranscribePcm.ts:90`; `whisperSettings.ts:14,58`; `sentenceDeckBuild.ts:155` | Track/job context and shared model selection |
| P4 | `renderer/components/blanc/BlancMediaPanels.tsx:75`; `BlancStudyNativePanels.tsx:1298`; `components/discover/YoutubeDiscoveryPanel.tsx:878`; `components/sentenceDeck/SentenceDeckDialog.tsx:132` | New-form defaults only; freeze selected source |
| P4 | `renderer/components/media/MediaContent.tsx:447,675,1528`; `MediaStudyAssistantPanel.tsx:93,176`; `gum/GumTitlePage.tsx:165,369,627`; `library/MediaDetailPanel.tsx:443` | Item/track language for transcription, translation, AI |
| P4 | `renderer/views/MediaCenterView.tsx:580,1260`; `YouTubePlaylistsView.tsx:140,410,442`; `components/settings/pages/SubtitleProviderPanel.tsx:44` | Independent discovery scope and persisted playlist defaults |
| P4 | `media/StudyPlayerSlice.tsx:664,821`; `VideoCoreMiningPanel.tsx:237,570,604`; `VideoCoreStudyOverlay.tsx:508,869,1313,1646,2441`; `StudyBottomBar.tsx:309`; `VideoCoreTranscriptPanel.tsx:549` | Source track for tags, models, activity, mining, and translation |
| P4 | `renderer/components/SubtitleCueLine.tsx:47,281`; `components/music/useMusicMining.ts:83,150`; `MusicContent.tsx:347`; `recorder/recordingStudyTag.ts:60` | Cue/lyric/session context and pronunciation policy |
| P4 | `main/media.ts:1184,1711,1793,1810`; `mediaStudyOrchestrator.ts:133,439`; `sentenceDeckIpc.ts:138,364` | Sidecar ranking and queued processing retain source |
| P4 | `main/subtitleDiscovery.ts:1309,1964`; `subtitleDiscoveryAuto.ts:124,133,148`; `regionRecorder.ts:1420,1447,1475`; `systemAudioCapture.ts:184,495,702`; `transcriptionJobs.ts:1154` | Per-item discovery; captured defaults; readiness by job |
| P5 | `renderer/stats.ts:27,294,306,854,958`; `reviewLog.ts:28`; `environment/achievements.ts:76`; `dailyGoal.ts:22,44,85,109` | Attributed writers and explicit aggregate/goal scope |
| P5 | `renderer/components/knownWords/KnownWordsManager.tsx:103`; `DailyGoalPanel.tsx:39,102`; `DailyGoalSuggest.tsx:25`; `stats/StatsContent.tsx:300,316,338`; `StatsGames.tsx:25,71` | Independent filters, tagged results, correct combined metrics |
| P5 | `renderer/components/calendar/CalendarDayPanel.tsx:71,247`; `components/LevelMeter.tsx:220,226` | Scoped calendar and separate proficiency inspection |
| P6 | `renderer/studyBackgroundJobs.ts:132,151,333,428`; `extensionAnnotate.ts:24,41,64`; `main/extensionBridgeHost.ts:411,463` | Language-bearing requests and bound knowledge callbacks |
| P6 | `main/extensionServer.ts:182,1782,2004,2018,2172,2344,2798`; `extensionAiRoutes.ts:262`; `extensionRecordingFinalizer.ts:62`; `extensionInstall.ts:98,112,123` | Shared resolution, protocol compatibility, installed client consistency |
| P6 | Maintained `extension/shared.js`, `content.js`, `background.js`; mirrored evidence at `main/chrome-extension/shared.js:813`, `content.js:1946`, `background.js:1648,2959` | Page/element context; language-scoped snapshots, TTLs, retries, offline caches |
| P7 | `renderer/games/contentStore.ts:43,147,291`; `components/games/GameArenaContent.tsx:378,1659`; `games/arenaStudyBridge.ts:181` | View-selected pools, one captured language per round, capability gating |
| P7 | `renderer/data/grammar/practiceFilters.ts:189`; `grammarMatch.ts:12,17`; `components/grammar/GrammarCurationPanel.tsx:72`; `GrammarReviewPanel.tsx:128` | Explicit grammar import language and corpus/filter capability |
| P7 | `renderer/agentToolRegistry.ts:711`; `studyCoachAgentHandlers.ts:60,134,176,381`; `wiredMechanics/terminalRuntime.ts:53,196,279`; `components/agent/AgentStudyAnswer.tsx:30,38` | Scoped tools, resolved content, persisted answer language |
| P7 | `renderer/components/anki/DeckWorkbenchAiPanel.tsx:198`; `components/blanc/BlancAiAssist.tsx:124`; `components/immersion/VisualNovelAiAssist.tsx:48`; `vnAiTranslate.ts:60` | Partition mixed AI work and preserve source context |
| P7 | `renderer/components/notes/NotesManager.tsx:678`; `NoteViewer.tsx:107`; `components/speak/ConversationPartner.tsx:138,139`; `components/translate/TranslateContent.tsx:167,433` | New-operation defaults; persisted conversation/writing/translation language |
| P7 | `renderer/components/resources/ResourcesContent.tsx:132,289,330`; `OwnResourceControls.tsx:29` | Independent collection scope; editable new-resource default |

### Snip/OCR handoff

The external work owns its files until committed. After handoff, P4 owns registry/router/Snip integration; P3 owns book/manga/Lens consumers.

Preserve these integration requirements:

- Shared detection/Han policy, with resolved language and provenance.
- Source hint before recognition; post-OCR evidence may refine uncertain defaults.
- Same context through retry, edits, enrichment, mining, Anki, and capture adoption.
- Language-bound knowledge callbacks in renderer Snip.
- Provider/data/language-aware capture and recognition cache identities.
- Missing-model messages for the requested recognizer.
- Active switching during pending OCR, enrichment, and review.
- No assumption that fixing free-screen Snip fixes book/page OCR.

## 7. Recommended v1 boundary

### Ship in v1

1. Open language identity, study set, complete ID migration, and acknowledged synchronization.
2. Versioned slot interfaces, provider matching, installation metadata, and capability reports.
3. Existing ja/zh/ru implementations wrapped as built-in packs, with regression coverage.
4. Generic horizontal text study: ICU segmentation, exact imported dictionaries, manual cards/SRS, stable knowledge, CEFR self-assessment, generic field mapping.
5. General Kaikki import, existing Yomitan import, and honest supported StarDict/DSL subsets.
6. Dictionary IPA, generic frequency import, and documented grammar JSON import.
7. Registry integration for existing OCR, Whisper, OS TTS, and translation services.
8. Tesseract traineddata installation through the trusted runtime.
9. Spanish and French starter packs with verified open data and limited-feature descriptions.
10. All-language filters, correct activity attribution, extension scopes, and Anki aggregation.

Do not enable arbitrary language IDs in production while old fallback branches can route their data to Japanese. The release gate covers the complete consumer migration.

### After v1

- Full RTL study workflows and ready Arabic/Hebrew/Persian packs.
- Broader starter-pack qualification, including Thai, Vietnamese, and Korean limitations.
- Hunspell morphology, richer language-specific analyzers, and additional tokenizer runtimes.
- Piper and other new TTS runtimes.
- Arbitrary Paddle model-family/conversion support beyond qualified adapters.
- Dedicated translation-model formats and extensive pair-quality evaluation.
- Advanced pronunciation scoring.
- A public submission/review portal, publisher signing infrastructure, and richer pack tooling.
- Broad authored grammar/placement catalogs for additional languages.

This boundary delivers the architecture and proves it with genuinely new languages while reusing mature paths. RTL, new native runtimes, and broad model compatibility carry substantially more layout, licensing, resource, and parser risk than adding another declarative dictionary pack.

“Any language” is the architectural direction. V1 reports what actually works for each language rather than promising parity for every script.

## 8. File-disjoint implementation packages

Every file has one owner. Audit-table assignments remain the ownership manifest; additions below extend it. No package edits another package’s file, including shared tests, styles, catalogs, or e2e flows.

Shared-contract changes go through P0. UI string requests go through P2. Hotspot owners apply integration requests at serial checkpoints, not through concurrent edits.

Effort estimates are rough engineer-days for implementation and focused validation, excluding the separate OCR work and post-v1 features.

### Execution order

| Wave | Packages | Gate |
|---|---|---|
| External handoff | Snip/OCR work | Committed state and ownership handoff |
| 0 | P0 | IDs, contracts, migration, registry, study state |
| 1 | P1, P2, P3 | Knowledge, pack management, lexical/readers |
| 2 | P4, P5, P6 | OCR/media/speech, activity, extension |
| 3 | P7 | Grammar/games/AI and complete integration |

Run at most three packages concurrently. Perform serial contract integration between waves. P1/P2 may use registry fixtures while P3 completes adapter wiring.

### P0 — Registry, slot interfaces, IDs, migration, and study set

**Effort:** XL, approximately 8–15 days.

Own all P0 audit files and new shared `languageId`, `studySet`, `languageContext`, manifest/provider contracts, migration journal contracts, registry client, and main registry/install-state infrastructure under `src/`.

Also own the public profile-language schema (`src/shared/profiles.ts:18`), shared language metadata facade (`src/shared/langs.ts`), and `levelScale.ts` compatibility boundary. Domain algorithm files remain with their slot owners.

**Hotspots:** `preload.ts`, `renderer/window.d.ts`, `shared/studyLang.ts`, `main/studyLanguage.ts`, `shared/assetRegistry.ts`, committed-state events.

**Vitest:** canonicalization/aliases/scripts; valid unavailable languages; malformed values; migration precedence and idempotency; every registered stored-field migration fixture; partition preservation; study-set invariants; revision conflicts; stale-window startup; event counts; provider matching; API/version rejection; dependency cycles; leases; failed activation rollback; resolver parity.

**Headless flow owner:** `00-boot.cjs`. Add committed-state/restart/multi-window coverage there. Other packages submit needed boot scenarios to P0.

**Risks:** broad type widening, startup races, unsupported IDs becoming Japanese, historical partition changes, and overclaiming sandbox guarantees.

### P1 — Knowledge, SRS, level/frequency consumption, and Anki

**Effort:** L, approximately 8–12 days.

Own P1 audit files; `src/shared/snipKnowledge.ts`; existing auto-reading/auto-audio card-selection policies; `src/main/anki/fieldMapper.ts`, `modelFields.ts`; and new level/Anki-mapping adapters in uniquely owned provider modules.

Preserve manual precedence, scheduling ownership, daily caps, undo, pending writes, and source links. Level/frequency consumers obtain providers rather than infer them from IDs.

**Vitest:** same spelling across languages; explicit scope sharing; diacritic preservation; concurrent writes; nonactive migration; mixed-deck review/undo; delayed tokenizer work; seeding; custom lists/scales; Anki mapping conflicts; interval collisions; suspension; deferred pushes; audio/reading absence.

**Headless flow owners:** `45-anki.cjs`, `50-srs.cjs`, `70-known-words.cjs`.

Required scenario: review ja/zh/ru/es cards while changing active language, then restart and verify exact knowledge destinations and unchanged budgets.

**Risks:** irreversible knowledge contamination, stale normalization aliases, lost interval attribution, and unintended scheduler changes.

### P2 — Pack manager, setup, switcher, settings, notices, and UI catalogs

**Effort:** L, approximately 6–10 days.

Own P2 audit files; new pack-manager/capability-report UI; `useStudySet`; switcher styles; `src/shared/i18n/**`; `src/shared/thirdPartyBundled.json`; About notice display; curated built-in/starter manifest data.

Use existing lazy i18n catalogs. New chrome strings go through catalog keys from the start; native language names and study content remain content.

**Hotspots:** `DesktopShell.tsx`, `BlancShell.tsx`, settings catalogs/transfer, shortcuts, application i18n, static third-party notice data.

**Vitest:** study multi-select/start-with; placement resume; dependency deduplication; capability states; install controls; licence display; native/UI language separation; membership removal; settings reset/transfer; accessibility; catalog parity; installed notice ledger display.

**Headless flow owners:** `10-setup.cjs`, `96b-lockscreen.cjs`.

Required scenario: ja+zh setup, ru addition, es/fr pack installation, missing optional blocks, removal/re-addition, restart, and switcher use in all four shells.

**Risks:** shell focus/drag regressions, duplicate downloads, confusing installation with enrollment, and misleading readiness labels.

### P3 — Lexical providers, readers, mining, and book/manga consumers

**Effort:** XL, approximately 12–20 days.

Own P3 audit files; `src/main/dictionary/**`; Japanese tokenizer modules; `shared/deinflect.ts`, `russianMorphology.ts`, `studySegmentation.ts`, `furigana.ts`, `pinyin.ts`, reading-aid types/services; frequency import/data services; `shared/filesApp/mining.ts`; and new detection/segmentation/morphology/dictionary/pronunciation/frequency adapter modules.

P0 owns central identity/resolver contracts; P3 supplies provider implementations and reviewed evidence data through that boundary.

Do not edit P4’s router/Paddle/Snip files. P3’s manga/book consumers call the agreed OCR contract.

**Vitest:** source precedence; Han ambiguity; Serbian/Cyrillic context; Thai segmentation; Vietnamese accents; UTF-16 offsets; Yomitan/Kaikki formats; explicit import languages; StarDict/DSL supported subsets; dictionary gloss direction; IPA; missing providers; parser limits; cancellation; correction/cache invalidation; asynchronous profiling.

**Headless flow owners:** `20-dictionary.cjs`, `30-epub.cjs`, `31-library.cjs`, `40-manga.cjs`, `60-translate.cjs`, `89-immersion.cjs`, `97-lens.cjs`, `98-visual-novel.cjs`.

Required scenario: Japanese and Chinese sources remain open while Russian is active; lookup, highlighting, translation, mining, OCR adoption, and reading credit retain each source language. Add Spanish generic lookup/mining and explicit missing-provider recovery.

**Risks:** importer data loss, source-language gaps, parser isolation, synchronous indexing, stale highlights, and accidental renderer changes around pagination.

### P4 — OCR registry integration, media, subtitles, ASR, and TTS

**Effort:** XL, approximately 10–18 days.

Own P4 audit files; after handoff, `main/ocrRouter.ts`, `paddleOcr.ts`, `screenOcr.ts`, main/renderer Snip integration, `shared/ocrRouterTypes.ts`, `shared/snipToCards.ts`; renderer OCR workers; Whisper models/worker/settings; flashcard audio/TTS services; subtitle language/provider clients; YouTube schemas/services; caption/detached snapshots.

Own `src/media/**` language-context changes and new OCR/ASR/TTS/media-language adapters.

**Vitest:** exact/script/base matching; traineddata selection; detector/recognizer dependency pairing; unsupported output scripts; no Japanese transcription fallback; provider leases; timeouts/cancellation; OS voice inventory; playback versus file synthesis; mixed media queues; caption aliases; retry/restart; source-track attribution; deduplicated models.

**Headless flow owners:** `90-video.cjs`, `91-youtube.cjs`, `92-music.cjs`, `94-recorder.cjs`, `88b-speak.cjs`.

Required scenario: queue different-language jobs, switch active during work, restart/retry, and verify tracks, cards, translations, and activity preserve their original language.

**Risks:** wrong-language recognition, GPU/native-runtime compatibility, variant mismatches, model memory pressure, voice API differences, and duplicated routing.

### P5 — Statistics, goals, calendar, and knowledge-management views

**Effort:** M/L, approximately 6–10 days.

Own P5 audit files and uniquely named pure aggregation helpers/tests. P1 owns the underlying knowledge store and `70-known-words.cjs`; P5 submits manager scenarios through that owner.

**Vitest:** attributed activities; weighted ratios; union streaks; shared knowledge-scope deduplication; legacy/unassigned rows; goal migration/modes; scoped reset; removed-language history; concurrency; study-day boundaries.

**Headless flow owners:** `72-stats.cjs`, `95-calendar.cjs`.

Required scenario: activity in ja/zh/ru/es reconciles in individual and combined views; goals, language removal/re-addition, and restart preserve totals. Lockscreen scenarios go through P2.

**Risks:** double counting, fabricated historical attribution, misleading proficiency, and broad reset behavior.

### P6 — Chrome extension and language-aware protocol

**Effort:** L, approximately 7–12 days.

Own P6 audit files plus maintained `extension/` client assets. Do not edit `src/main/chrome-extension/` as the source: `tools/sync-extension-mirror.cjs:10,11,53` copies from root `extension/`.

Protocol exposes active/studied languages and capability summaries, not one universal “supported languages” union. Include explicit language in lookup, capture, annotation, snapshots, AI, recording, and retry payloads.

Partition snapshots, versions, TTLs, IndexedDB/offline lookup caches, and retries by language and relevant provider revision. Preserve old clients that omit language through a compatibility resolver; do not let them contaminate new scoped caches.

Keep UI locale separate from page/element language. Send data-only detection metadata where client parity needs it; server remains authoritative.

**Vitest:** resolver parity; schema versions; two-language tabs; element-level overrides; offline cache/version isolation; retries across switches; unsupported slots; installed extension consistency; Russian/new-language route validation.

**Headless flow owner:** `99-extension.cjs`.

Test the maintained/distributed client, two simultaneous language tabs, same-spelling independent knowledge, offline recovery, active switching, recording, and Anki mining.

**Risks:** generated/source drift, old-client ambiguity, cache contamination, and testing only an uninstalled development copy.

### P7 — Grammar, games, AI, writing, conversation, resources, and integration

**Effort:** XL, approximately 10–18 days.

Own P7 audit files; grammar corpus/import modules; game engine/material/history modules; conversation/writing stores; feature-specific shared AI schemas/prompts; translation providers/router/services; new grammar/translation/rendering adapters.

P0 remains owner of central public language/bridge contracts. P2 remains owner of application strings and pack catalog data.

Use capability requirements for drills/games. Freeze one language per round. Partition mixed-language deck AI requests and retain language in cached/persisted answers. Preserve conversation language, source language, and explanation language independently.

**Vitest:** grammar JSON versions/IDs/licences; missing corpora; no default Japanese grammar; round stability; generic token joining; pronunciation requirements; scoped coach tools; AI pair support/consent; output validation; mixed-batch recombination; conversation/writing persistence; cache/retry isolation; v1 RTL gating.

**Headless flow owners:** `80-grammar.cjs`, `82-games.cjs`, `88-ai-study.cjs`, `88c-speak-write.cjs`, `96-agent.cjs`.

Submit VN scenarios through P3 and speech/model scenarios through P4.

**Risks:** hidden closed tables in prompts/content, cross-language caches, fabricated grammar availability, output validators rejecting valid scripts, and running sessions changing after a switch.

### Validation boundaries

No tests were run during this design pass.

Implementation uses Vitest for meaningful migration/provider/domain behavior and existing headless e2e flows for complete user paths. Use deterministic fixtures for missing assets, corrupt downloads, interrupted imports, and cloud failures; do not make routine e2e depend on live downloads or GPU availability.

Adapter qualification separately exercises real downloaded data/models. Mocked e2e proves routing and recovery, not OCR/transcription quality.

Flow ownership is exclusive as listed above. Existing flows require updates:

- Setup assumes single-language radio controls (`tools/e2e/flows/10-setup.cjs:31`).
- Known-word flows mutate the legacy key directly (`70-known-words.cjs:94`).
- Extension flow currently copies root source (`99-extension.cjs:151`); verify the installed/distributed result.

Passing unchanged legacy flows is insufficient release evidence. Run the existing i18n and notice checks through the normal validation workflow after implementation; this design does not authorize package installs or root configuration changes.

## 9. V1 acceptance gate

Release requires all of these outcomes:

1. Fresh ja+zh setup provisions both languages and resumes after restart.
2. Russian can be added/removed without deleting or relabeling data.
3. Spanish and French work through generic blocks without application-wide language branches.
4. Script/region tags survive storage, IPC, backup, extension requests, and export.
5. `zh-Hans`/`zh-Hant` and `sr-Cyrl`/`sr-Latn` match only explicitly compatible providers.
6. Missing historical card language remains Japanese; malformed explicit language is recoverable, not silently Japanese.
7. Japanese, Chinese, Russian, and generic-language sources can remain open simultaneously while another language is active.
8. Han ambiguity follows documented context/fallback policy; Cyrillic is not universally Russian.
9. Mixed-deck review, undo, delayed work, seeding, and Anki sync update the correct partitions.
10. OCR, transcription, translation, and AI queues retain language/provider context through switches, retries, and restart.
11. Replacing/removing a provider preserves source content, schedules, knowledge, and running-job assets.
12. Missing slots produce usable limited states and accurate installation/configuration guidance.
13. Dictionary direction, IPA availability, TTS voice availability, and translation pair support are reported honestly.
14. Thai does not claim whitespace segmentation is adequate; Vietnamese accents survive generic processing.
15. RTL IDs/data are preserved, while unsupported v1 reader workflows explain the application dependency.
16. Combined statistics reconcile with attributed totals; goals and daily review caps survive switching.
17. Extension tabs and offline caches retain independent language/provider context.
18. Every published downloadable asset has verified integrity metadata, provenance, and licence display.
19. Untrusted packs cannot execute downloaded code or escape parser/install boundaries.
20. Study OS, Aero, Wired, and Blanc preserve shortcuts, focus, dragging, taskbar behavior, and responsiveness.
21. Updated headless flows exercise the committed state API, new setup/pack controls, and distributed extension, with no unresolved language-attribution failures.