// The few strings of the optional AI features that non-AI surfaces render at
// startup, kept EAGER. Everything else the AI features say lives in the lazy
// AI pack (`../aiPack`), merged in the first time an AI surface needs it — see
// `../catalogs.ts`, "Lazily merged packs". English source of truth.

import type { Catalog } from '../core';

export const AI_EAGER_UI_EN: Catalog = {
  // The Study command box parses a command without AI too; its intent labels
  // are shown by the non-AI path (`shared/studyFilterRecipe.ts`).
  'study.command.intent.undo-filter': 'Undo the last filter change',
  'study.command.intent.preview-anki': 'Preview the Anki export',
  'study.command.intent.preview-cards': 'Preview the cards',
  'study.command.intent.levels': 'Remove words at {levels}',
  'study.command.intent.minimum': { one: 'Keep only words heard at least once', other: 'Keep only words heard at least {count} times' },
  'study.command.intent.maximum': { one: 'Keep at most {count} card', other: 'Keep at most {count} cards' },
  'study.command.intent.excludeKnown': 'Leave out words you already know',
  'study.command.intent.includeKnown': 'Include words you already know',
  'study.command.intent.excludeDuplicates': 'Leave out repeated words',
  'study.command.intent.includeDuplicates': 'Include repeated words',
  'study.command.intent.excludeAnki': 'Leave out words already in Anki',
  'study.command.intent.includeAnki': 'Include words already in Anki',
  'study.command.intent.excludeNames': 'Leave out names',
  'study.command.intent.includeNames': 'Include names',

  // Agent plan refusals, resolved by code in the Agent workspace.
  'agent.plan.error.cloud-disabled':
    'The Agent is not allowed to use the cloud. Allow it in Settings > AI, or plan with the offline model.',

  // "Suggest targets" on the daily goal: a rule first, AI optional.
  'aiTutor.goal.button': 'Suggest targets',

  // Navigation entries for the conversation partner, shown in the command
  // palette and the Blanc tool list before any AI surface has opened.
  'blanc.tool.conversation': 'Conversation partner',
  'blanc.tool.conversation.desc': 'Role-play a scene in the language you study, with scripted lines offline or an AI partner at your level.',
  'aiSpeak.paletteTerms': 'conversation partner chat speaking talk practice roleplay',

  // Rendered with AI off or before any AI surface opens: the Settings > AI
  // per-feature permission rows (`shared/aiSetup.ts`), credential and mirror
  // settings rows, the settings search entry, the assistant card, and the
  // deck row's saved-extras button.
  'aiStudy.feature.whyWrong': '"Why was I wrong?" in flashcards',
  'aiStudy.feature.whyWrong.desc': 'Sends the card, your typed answer and a few similar cards from your deck when you open "Why was I wrong?".',
  'aiStudy.feature.exampleSentences': 'i+1 example sentences',
  'aiStudy.feature.exampleSentences.desc': 'Sends the card and a sample of up to 200 words you know when you ask for example sentences.',
  'aiStudy.feature.leechRescue': 'Leech rescue suggestions',
  'aiStudy.feature.leechRescue.desc': 'Sends the leech card and a few similar cards from your deck when you ask for a rescue.',
  'aiStudy.feature.contextExplain': '"Explain in context" in the pop-up dictionary',
  'aiStudy.feature.contextExplain.desc': 'Sends the word, the sentence it came from and its dictionary senses when you press "Explain in context".',
  'aiStudy.close': 'Close',
  'aiStudy.extras.open': 'Examples and notes for {word}',
  'aiStudy.extras.panel': 'Examples and notes: {word}',
  // Blanc Deck tool: the row button that opens the same saved-extras panel.
  'blanc.shell.deck.extras': 'Notes',
  'aiProv.features.title': 'What may use the cloud',
  'aiProv.features.desc':
    'With the Cloud engine, only the features switched on here send text to your provider. The others use the offline model or stay off.',
  'aiProv.feature.cardGen': 'AI Card Studio',
  'aiProv.feature.cardGen.desc': 'Words and presets you choose are sent when you press Generate.',
  'aiProv.feature.mirror': 'Mirror Writing feedback',
  'aiProv.feature.mirror.desc': 'Your draft, the idea map and the model answer are sent when you press Evaluate.',
  'aiProv.feature.subtitleTranslate': 'Background subtitle translation',
  'aiProv.feature.subtitleTranslate.desc':
    'Whole subtitle tracks are sent without a button press, for episodes you play or mark Watching. Off: the offline model translates them.',
  'aiProv.credential.anthropic.desc': 'Claude Haiku, Sonnet and Opus for every cloud AI feature.',
  'aiProv.credential.openai.desc': 'OpenAI models for every cloud AI feature.',
  'aiProv.credential.compat.desc':
    'Only if your OpenAI-compatible server asks for a key. Ollama and LM Studio do not.',
  'aiProv.credential.mirror.desc': 'The key for the custom endpoint Mirror Writing can send drafts to.',
  'aiProv.credential.use.mirror': 'Mirror Writing (custom endpoint)',
  'aiProv.mirror.backend.appAi': 'App AI (Settings → AI)',
  'aiProv.mirror.appAiNote': 'Drafts are graded by the engine and provider set in Settings → AI.',
  'aiProv.mirror.appAiNotReady': 'AI is not set up yet, so the quick check grades drafts for now.',
  'aiProv.mirror.model': 'Model',
  'aiProv.mirror.modelHint': 'OpenAI, Ollama and LM Studio need a model name, for example gpt-5-mini or qwen3:8b.',
  'aiProv.mirror.urlHint':
    'A full chat-completions URL, or a base such as http://localhost:11434/v1 (Ollama) or http://localhost:1234/v1 (LM Studio).',
  'aiProv.mirror.keyPlaceholder': 'Paste a key (optional)',
  'aiProv.mirror.keySave': 'Save key',
  'aiProv.mirror.keyRemove': 'Remove key',
  'aiProv.mirror.keySaved': 'A key is saved in the encrypted vault.',
  'aiProv.mirror.keyNone': 'No key saved. A local server does not need one.',
  'aiProv.mirror.keyFailed': 'The key could not be saved.',
  'aiAgent.feature.agentChat': 'Agent chat and plans',
  'aiAgent.feature.agentChat.desc':
    'Your message, the conversation so far and the context you attached are sent when you send to a cloud model or plan with one. Saved words and review results stay on this device unless you allow them in Agent settings.',
  'aiAgent.feature.mediaAssistant': 'Video and visual novel study assistant',
  'aiAgent.feature.mediaAssistant.desc': 'The current line and the title are sent when you choose an assistant mode.',
  'aiAgent.feature.subtitleFusion': 'Subtitle fusion second opinion',
  'aiAgent.feature.subtitleFusion.desc':
    'Disputed transcript lines and their reference translations are sent when a fusion job runs with a cloud model set up.',
  'aiAgent.feature.ankiAdditions': 'Deck Workbench AI additions',
  'aiAgent.feature.ankiAdditions.desc': 'The note fields you selected are sent when you press Generate or Translate.',
  'aiImmerse.feature.mediaBrief': 'Video brief and comprehension questions',
  'aiImmerse.feature.mediaBrief.desc': 'Sends the subtitle lines of the video you are studying, in parts, when you press "Summary and questions".',
  'aiImmerse.feature.linePick': 'Pick the best i+1 lines to mine',
  'aiImmerse.feature.linePick.desc': 'Sends up to 24 lines that each have one unknown word, when you press "Pick lines with AI".',
  'aiImmerse.feature.readerExplain': 'Explain an i+1 sentence (reader)',
  'aiImmerse.feature.readerExplain.desc': 'Sends the sentence and its paragraph from the immersion reader when you press Explain.',
  'aiImmerse.feature.readerSimplify': 'Simplify a paragraph (reader)',
  'aiImmerse.feature.readerSimplify.desc': 'Sends one paragraph (at most 1,500 characters) and its unknown words when you press Simplify.',
  'aiImmerse.feature.vnExplain': 'Explain a visual novel line',
  'aiImmerse.feature.vnExplain.desc': 'Sends the line, its speaker and the lines before it when you press Explain or E.',
  'aiImmerse.feature.vnTranslate': 'Translate visual novel lines with context',
  'aiImmerse.feature.vnTranslate.desc': 'Sends a line with no translation, its speaker and the two lines before it.',
  'aiImmerse.feature.studyCommand': 'Understand free-text Study commands',
  'aiImmerse.feature.studyCommand.desc': 'Sends what you typed in the Study command box when the built-in phrases do not match it.',
  'aiTutor.feature.grammarExplain': 'Grammar: "Explain this pattern"',
  'aiTutor.feature.grammarExplain.desc': 'Sends the grammar point when you press "Explain this pattern".',
  'aiTutor.feature.grammarExamples': 'Grammar: example sentences',
  'aiTutor.feature.grammarExamples.desc': 'Sends the grammar point and its examples.',
  'aiTutor.feature.grammarProduction': 'Grammar: check my sentence',
  'aiTutor.feature.grammarProduction.desc': 'Sends the grammar point and your sentence.',
  'aiTutor.feature.grammarSighting': 'Grammar: check sightings',
  'aiTutor.feature.grammarSighting.desc': 'Sends up to six sentences from your material.',
  'aiTutor.feature.statsCoach': 'Statistics: "Explain my stats"',
  'aiTutor.feature.statsCoach.desc': 'Sends only counts and percentages. Also needs study-data sharing in Agent settings.',
  'aiTutor.feature.goalSuggest': 'Daily goal suggestions',
  'aiTutor.feature.goalSuggest.desc': 'Sends two-week averages and your targets. Also needs study-data sharing in Agent settings.',
  'aiTutor.feature.eventParse': 'Calendar: describe an event',
  'aiTutor.feature.eventParse.desc': 'Sends the sentence you typed and today\'s date when you press "Ask the AI".',
  'aiTutor.feature.placementQuiz': 'First-run placement quiz',
  'aiTutor.feature.placementQuiz.desc': 'Sends only your languages; answers are graded on this device.',
  'aiTutor.feature.settingsHelp': 'Settings help',
  'aiTutor.feature.settingsHelp.desc': 'Sends your question and the setting names.',
  'aiTutor.feature.blancMistake': 'Blanc: "Explain my mistake"',
  'aiTutor.feature.blancMistake.desc': 'Sends the question and both answers.',
  'aiTutor.feature.blancSummary': 'Blanc: kanji memory aid and text summary',
  'aiTutor.feature.blancSummary.desc': 'Sends the kanji, or the text (max 800 characters) and its unknown words.',
  'aiTutor.settings.foundModel': 'AI suggestion for "{query}" (the search found nothing):',
  'aiTutor.settings.reason': '— {reason}',
  'aiSpeak.feature.shadowingFeedback': 'Explain my shadowing result',
  'aiSpeak.feature.shadowingFeedback.desc': 'Sends the subtitle line, what the speech model heard and the score when you press "Explain with AI". Your recording never leaves this computer.',
  'aiSpeak.feature.conversationPartner': 'Conversation partner',
  'aiSpeak.feature.conversationPartner.desc': 'Sends your messages, the last 12 turns and your level. A sample of your known words is sent only if study data may leave this computer (Agent settings).',
  'aiSpeak.feature.writingCorrection': 'Correct my writing',
  'aiSpeak.feature.writingCorrection.desc': 'Sends the note or the selected text (at most 2,000 characters) when you press "Correct my …".',
  'aiSpeak.feature.journalGrade': 'Grade my journal entry',
  'aiSpeak.feature.journalGrade.desc': 'Sends your journal text and the words of the prompt when you press "Grade with AI".',

  // Section labels of the "Notes" field an export writes for a card's saved
  // extras (`shared/cardAiExtras.ts`): deck CSV, local package, AnkiConnect.
  'deckExport.notes.mnemonic': 'Memory aid',
  'deckExport.notes.distinction': 'Not to confuse with',
  'deckExport.notes.examples': 'Example sentences',
  'deckExport.notes.accepted': 'Also accepted',
};
