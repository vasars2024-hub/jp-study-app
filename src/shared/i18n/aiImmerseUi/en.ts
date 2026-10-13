// The optional AI helpers for watching and reading (`shared/aiImmerseCommon.ts`):
// the video brief and quiz, the i+1 line pick, the reader's explain / simplify,
// the visual novel's explain / translate with context, and the Study command
// box's AI fallback. English source of truth.

import type { Catalog } from '../core';

export const AI_IMMERSE_UI_EN: Catalog = {
  // ---- Settings > AI: the cloud opt-ins (shared/aiSetup.ts) ----
  'aiImmerse.settings.vnAutoTranslate': 'Translate mined visual novel lines automatically',
  'aiImmerse.settings.vnAutoTranslate.desc': 'Off by default. When on, a line with no translation gets an AI translation just before it is mined. Otherwise the AI translation is only ever a button.',

  // ---- shared chrome ----
  'aiImmerse.badge': 'AI',
  'aiImmerse.busy': 'Asking the AI…',
  'aiImmerse.progress': 'Part {done} of {total} done',
  'aiImmerse.cancel': 'Cancel',
  'aiImmerse.close': 'Close',
  'aiImmerse.askAgain': 'Ask again',
  'aiImmerse.cached': 'Saved answer: nothing was sent.',
  'aiImmerse.translation': 'Translation:',
  'aiImmerse.notReady': 'AI is not set up yet. The parts that need no AI still work.',
  'aiImmerse.needsKey': 'Add an AI provider key to use this.',
  'aiImmerse.needsLocalModel': 'Install the offline AI model to use this.',
  'aiImmerse.needsConsent': 'This feature is not allowed to use the cloud yet. Allow it, or switch the engine to Offline.',
  'aiImmerse.openSettings': 'Open Settings › AI',

  // ---- the video brief (YouTube pre-study and the player) ----
  'aiImmerse.brief.preTitle': 'Pre-watch brief',
  'aiImmerse.brief.postTitle': 'Episode quiz',
  'aiImmerse.brief.noCues': 'There are no subtitle lines to work from yet.',
  'aiImmerse.brief.run': 'Summary and questions (AI)',
  'aiImmerse.brief.pick': 'Pick lines with AI',
  'aiImmerse.brief.pickAgain': 'Pick again',
  'aiImmerse.brief.busy': 'Reading the transcript…',
  'aiImmerse.brief.pickBusy': 'Choosing lines…',
  'aiImmerse.brief.truncated': 'Long transcript: the AI reads it in {parts} parts, up to {time}.',
  'aiImmerse.brief.summary': 'Summary',
  'aiImmerse.brief.questions': 'Comprehension questions ({count})',
  'aiImmerse.brief.showAnswer': 'Show answer',
  'aiImmerse.brief.seek': 'Go to {time}',
  'aiImmerse.brief.pickedHead': 'Lines worth mining',
  'aiImmerse.brief.pickNoneValid': 'None of the picked lines is still i+1 for you, so the lines below are shown instead.',
  'aiImmerse.brief.bestLines': 'Best lines to mine',
  'aiImmerse.brief.noLines': 'No line here has exactly one word you do not know.',
  'aiImmerse.brief.heardTimes': { one: 'The new word comes up {count} time in this video.', other: 'The new word comes up {count} times in this video.' },
  'aiImmerse.brief.mine': 'Mine',
  'aiImmerse.brief.vocabQuiz': 'Vocabulary quiz ({count})',
  'aiImmerse.brief.analysing': 'Reading the subtitles…',

  // ---- the immersion reader ----
  'aiImmerse.reader.tools': 'AI reading tools',
  'aiImmerse.reader.explainOpen': 'Explain i+1 sentences',
  'aiImmerse.reader.explainTitle': 'i+1 sentences on this page',
  'aiImmerse.reader.noSentences': 'No sentence on this page has exactly one word you do not know.',
  'aiImmerse.reader.explain': 'Explain',
  'aiImmerse.reader.lookUp': 'Look up {word}',
  'aiImmerse.reader.targetMeans': '“{word}” here: {meaning}',
  'aiImmerse.reader.simplifyOpen': 'Simplify',
  'aiImmerse.reader.simplifyTitle': 'You know {percent}% of the words on this page',
  'aiImmerse.reader.simplifyTitleShort': 'Simplify this paragraph',
  'aiImmerse.reader.simplifyHint': 'Select text in a paragraph first to simplify that paragraph; otherwise the start of the page is used.',
  'aiImmerse.reader.nothingToSimplify': 'There is no text to simplify here.',
  'aiImmerse.reader.unknownWords': 'Words to look up first ({count})',
  'aiImmerse.reader.simplify': 'Simplify with AI',
  'aiImmerse.reader.simplifyBusy': 'Rewriting…',
  'aiImmerse.reader.original': 'Original',
  'aiImmerse.reader.simplified': 'Simplified by AI',
  'aiImmerse.reader.askAgent': 'Ask Agent about selection',
  'aiImmerse.reader.selectFirst': 'Select some text in the article first.',
  'aiImmerse.reader.page': 'this page',

  // ---- visual novels ----
  'aiImmerse.vn.title': 'AI help for this line',
  'aiImmerse.vn.explain': 'Explain (AI)',
  'aiImmerse.vn.explainKey': 'Explain with AI ({key})',
  'aiImmerse.vn.keyLegend': '· {key} explain (AI)',
  'aiImmerse.vn.translate': 'Translate with context (AI)',
  'aiImmerse.vn.translateBusy': 'Translating…',
  'aiImmerse.vn.useTranslation': 'Use this translation',

  // ---- the Study command box ----
  'aiImmerse.command.title': 'AI reading of your command',
  'aiImmerse.command.busy': 'Working out what you meant…',
  'aiImmerse.command.understood': 'The AI read this as:',
  'aiImmerse.command.confirmNote': 'Nothing has changed yet. Run applies it as one step you can undo.',
  'aiImmerse.command.notUnderstood': 'The AI could not match this to a Study action. Try “Remove N5 and N4 words”, “Undo filter” or “Preview Anki”.',
  'aiImmerse.command.run': 'Run',
  'aiImmerse.command.dismiss': 'Dismiss',
};
