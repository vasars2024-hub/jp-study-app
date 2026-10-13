// Speaking and writing, round 2 (docs/SCORECARD.md "Conversation / shadowing /
// writing"): pitch and rhythm measured from a shadowing take, the conversation
// partner's Retry, memory across sessions and correction cards, the writing
// history and the journal streak. English source of truth. Part of the lazy AI
// pack (`../aiPack`), under its `aiSpeak.` prefix.

import type { Catalog } from '../core';

export const AI_SPEAK2_UI_EN: Catalog = {
  // ---- shadowing: pitch and rhythm ----
  'aiSpeak.prosody.title': 'Pitch and rhythm (measured from your recording)',
  'aiSpeak.prosody.skipped.not-comparable': 'Pitch and rhythm are measured once your take is close to the line: a sound match of 60% or more, with about as many sounds.',
  'aiSpeak.prosody.skipped.no-audio': 'Your recording could not be read for pitch and rhythm.',
  'aiSpeak.prosody.skipped.no-voice': 'No voice was found in the recording to measure.',
  'aiSpeak.prosody.accentScore': 'Pitch accent as in the dictionary: {matched} of {total}.',
  'aiSpeak.prosody.noPitchDictionary': 'No pitch-accent dictionary is installed, so only the rhythm is measured. You can add one under Settings, Dictionaries.',
  'aiSpeak.prosody.noPitchWords': 'The pitch dictionary has no entry for the words of this line, so only the rhythm is measured.',
  'aiSpeak.prosody.unvoiced': 'Too little of the words was voiced to judge their pitch. Say the line a little louder.',
  'aiSpeak.prosody.pattern.heiban': 'flat (heiban)',
  'aiSpeak.prosody.pattern.atamadaka': 'drop after the first mora (atamadaka)',
  'aiSpeak.prosody.pattern.nakadaka': 'rise, then drop inside the word (nakadaka)',
  'aiSpeak.prosody.pattern.odaka': 'drop on the particle after it (odaka)',
  'aiSpeak.prosody.pattern.unknown': 'unknown',
  'aiSpeak.prosody.verdict.match': 'As in the dictionary: {expected}.',
  'aiSpeak.prosody.verdict.mismatch': 'Dictionary: {expected}. You: {heard}.',
  'aiSpeak.prosody.verdict.unclear': 'Dictionary: {expected}. Too little voice to tell.',
  'aiSpeak.prosody.legend': 'Circles: the dictionary\'s high and low morae (dashed: the particle after the word). Line: your pitch.',
  'aiSpeak.prosody.rate.ja': 'Speed while speaking: {rate} morae a second. The line: {cue}.',
  'aiSpeak.prosody.rate.zh': 'Speed while speaking: {rate} syllables a second. The line: {cue}.',
  'aiSpeak.prosody.rateOnly.ja': 'Speed while speaking: {rate} morae a second.',
  'aiSpeak.prosody.rateOnly.zh': 'Speed while speaking: {rate} syllables a second.',
  'aiSpeak.prosody.pauseInside': 'You paused {sec} s inside “{word}”.',
  'aiSpeak.prosody.pauseAfter': 'You paused {sec} s after “{word}”, where the line has no comma.',
  'aiSpeak.prosody.noPauses': 'No pauses inside the line.',
  'aiSpeak.prosody.estimate': 'Measured on this computer. An estimate: each mora\'s pitch is read from an equal share of your speech.',

  // ---- conversation partner ----
  'aiSpeak.chat.unanswered': 'Your last message has no reply yet.',
  'aiSpeak.chat.retry': 'Retry the reply',
  'aiSpeak.chat.voiceSend': 'Send what I say right away',
  'aiSpeak.chat.recall': 'From your earlier conversations, the partner will try to bring back:',
  'aiSpeak.chat.recallScripted': 'Words from your earlier conversations to try using:',
  'aiSpeak.chat.recallUsed': 'Brought back from earlier: {words}',
  'aiSpeak.chat.correctionCardBack': '{reason} (You wrote: {original})',

  // ---- writing help: cards, history, journal streak ----
  'aiSpeak.write.tab.history': 'History',
  'aiSpeak.write.saveCard': 'Save as a card',
  'aiSpeak.history.empty': 'The corrections you get are kept here, so you can see which mistakes keep coming back.',
  'aiSpeak.history.kinds': 'Your most frequent corrections: {kinds}.',
  'aiSpeak.history.kindCount': { other: '{kind} ×{count}' },
  'aiSpeak.history.changes': { one: '{count} change', other: '{count} changes' },
  'aiSpeak.history.clear': 'Clear the history',
  'aiSpeak.journal.streakToday': {
    one: 'Journal streak: {count} day (best: {best}). Today\'s entry is done.',
    other: 'Journal streak: {count} days (best: {best}). Today\'s entry is done.',
  },
  'aiSpeak.journal.streakOpen': {
    one: 'Journal streak: {count} day (best: {best}). Complete today\'s entry to keep it.',
    other: 'Journal streak: {count} days (best: {best}). Complete today\'s entry to keep it.',
  },
  'aiSpeak.journal.streakNone': 'Complete an entry (every word, enough sentences) to start a journal streak.',
};
