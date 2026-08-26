// Dictionary / mining UI chrome — English source of truth.
//
// Added 2026-08-04 for audit F7: `DictionaryView`, `JitenMiningPanel`,
// `FieldMappingEditor` and `AnkiCardPreview` — 904 lines between them — carried
// zero i18n adoption, sitting beside `DictionaryResults` (dict.results.*) which
// is fully translated and renders in the same viewport. The gate could not see
// it: tools/i18n-check.cjs compares catalogs against each other, so a component
// that contributes NO keys at all is invisible to it, and both gates passed
// forever. That blindness is now covered by tools/i18n-hardcoded-check.cjs.
//
// Authored as four per-language modules from the start rather than one shared
// record spread into every catalog — see ../gameArena/en.ts for what that
// mistake cost (audit F8).
import type { Catalog } from '../core';

export const MINING_UI_EN: Catalog = {
  // DictionaryView — the page shell around DictionaryResults.
  'dict.view.menu.view': 'View',
  'dict.view.menu.ja': '日本語 (Japanese)',
  'dict.view.menu.zh': '中文 (Chinese)',
  'dict.view.status.ja': 'Japanese',
  'dict.view.status.zh': 'Chinese',
  'dict.view.source.ja': 'JMdict / Jisho',
  'dict.view.source.zh': 'CC-CEDICT',
  'dict.view.desc.ja': 'Search Japanese or English — powered by Jisho (JMdict).',
  'dict.view.desc.zh': 'Search Chinese or English — offline, powered by CC-CEDICT.',
  'dict.view.placeholder.ja': 'Type a word, e.g. 食べる or “eat”…',
  'dict.view.placeholder.zh': 'Type a word, e.g. 你好 or “hello”…',
  'dict.view.search': 'Search',
  'dict.view.reason.needsQuery': 'Type a word to search for.',
  'dict.view.hint.ja':
    'Tip: while reading a book you can highlight any word to look it up instantly. Tap the star icon on a result to save it to Flashcards.',
  'dict.view.hint.zh':
    'Offline Chinese↔English dictionary (CC-CEDICT). Results show pinyin with tone marks. Highlight a word while reading to look it up, or tap the star icon to save it to Flashcards.',

  // AnkiCardPreview
  'cardPreview.frameTitle': 'Card face preview',
  'cardPreview.label': 'Card preview',
  'cardPreview.empty': 'Configure field mappings to see how cards will look.',
  'cardPreview.profileHint': '{label} — {front} front / {back} back',
  'cardPreview.fallbackToggle': 'Expression fallback',
  'cardPreview.front': 'Front',
  'cardPreview.back': 'Back',
  'cardPreview.hint': 'Sample content for this profile. Mined cards use live dictionary and Tatoeba data.',

  // JitenMiningPanel
  'jiten.mining.title': 'Jiten vocab mining',
  'jiten.mining.desc': 'Mine a Jiten media deck directly into the local flashcard library.',
  'jiten.mining.refresh': 'Refresh',
  'jiten.mining.empty': 'Plan a Jiten title in Novels first, then return here to mine its deck.',
  'jiten.mining.plannedTitle': 'Planned title',
  'jiten.mining.deckScope': 'Deck scope',
  'jiten.mining.cardOrder': 'Card order',
  'jiten.mining.minOccurrences': 'Min occurrences',
  'jiten.mining.maxOccurrences': 'Max occurrences',
  'jiten.mining.noLimit': 'No limit',
  'jiten.mining.topWords': 'Top N words',
  'jiten.mining.targetCoverage': 'Target coverage %',
  'jiten.mining.excludeKana': 'Exclude kana-only terms',
  'jiten.mining.skipExamples': 'Skip example sentences',
  'jiten.mining.unknownDifficulty': 'Unknown difficulty',
  'jiten.mining.noTags': 'No Jiten tags',
  'jiten.mining.downloading': 'Downloading deck',
  'jiten.mining.mine': 'Mine Jiten vocab',
  'jiten.mining.importedCount': '{count} cards in the latest import.',
  'jiten.mining.saved': 'Saved {count} Jiten cards for {title}.',
  'jiten.mining.err.noDeck': 'Jiten did not return a deck.',
  'jiten.mining.err.noCards': 'No usable cards were found in the Jiten deck.',

  // Jiten deck scope / order options. These were module constants in
  // shared/jiten.ts (JITEN_DOWNLOAD_TYPE_LABELS / JITEN_ORDER_LABELS); a
  // module-level record cannot call useT(), so per CLAUDE.md "i18n workflow" §7
  // the constants now hold ids and the label is resolved here at render time.
  'jiten.downloadType.1': 'Full deck',
  'jiten.downloadType.2': 'Top words (global frequency)',
  'jiten.downloadType.3': 'Top words (deck frequency)',
  'jiten.downloadType.4': 'Top words (chronological)',
  'jiten.downloadType.5': 'Target coverage %',
  'jiten.downloadType.6': 'By occurrence count',
  'jiten.order.1': 'Chronological',
  'jiten.order.2': 'Global frequency',
  'jiten.order.3': 'Deck frequency',
  'jiten.order.4': 'Import order',
  'jiten.order.5': 'Random',

  // FieldMappingEditor
  'fm.section.templates': 'Field templates',
  'fm.summary.mapped': '{mapped} of {total} fields mapped',
  'fm.lead.templates':
    'Each Anki field gets a template of variables. Click a field, then pick a variable from the palette below.',
  'fm.placeholder.auto': 'Leave blank for automatic mapping',
  'fm.btn.saving': 'Saving…',
  'fm.btn.save': 'Save mapping',
  'fm.btn.saved': 'Saved',
  'fm.btn.reset': 'Reset to automatic',
  'fm.section.palette': 'Variable palette',
  'fm.summary.palette': 'Insert {placeholders} into fields',
  'fm.lead.palette.before': 'Focus a field above, then click a tag. Language suffixes like',
  'fm.lead.palette.after':
    'pick which translation fills that Anki field — separate from language direction above.',
  'fm.aria.insertVar': 'Insert a variable',
  'fm.aria.insertTranslated': 'Insert a translated variable',
  'fm.aria.insertPair': 'Insert a pair variable',
  'fm.label.base': 'Base',
  'fm.label.translated': 'Translated',
  'fm.label.pairs': 'Pairs',
  'fm.title.translatedTo': '{base} translated to {lang}',
  'fm.title.pairs.ru': 'Russian example 1, then Japanese example 1, then pair 2…',
  'fm.title.pairs.en': 'English example 1, then Japanese example 1, then pair 2…',
  'fm.title.pairs.zh': 'Chinese example 1, then Japanese example 1, then pair 2…',
  'fm.section.examples': 'Examples & fallback',
  'fm.summary.examplesOn': 'Auto-fetch Tatoeba + expression fallback',
  'fm.summary.examplesOff': 'Expression fallback off',
  'fm.aria.exampleCounts': 'Auto example counts per language',
  'fm.lead.examples':
    'When mining without hand-picked examples, fetch this many Tatoeba sentences per language. Selected examples in the dictionary override these counts.',
  'fm.toggle.fallback': 'Expression fallback when examples are missing',
  'fm.lead.fallback.before': 'If Tatoeba has no examples, mine with fallback templates — e.g.',
  'fm.lead.fallback.middle': 'instead of',
  'fm.field.fallbackSuffix': '{field} (fallback)',
  'fm.placeholder.fallbackEg': 'e.g. {expression:ru}',
  'fm.msg.saved': 'Field mapping saved.',
  'fm.msg.saveFailed': 'Could not save the field mapping.',
  'fm.msg.reverted': 'Reverted to automatic mapping.',
  'fm.msg.resetFailed': 'Could not reset the field mapping.',
};
