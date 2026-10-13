/**
 * The writing help's history and journal days (`shared/writingHistory.ts`),
 * kept on this computer per study profile and study language, written through
 * the guarded writer. Loaded only by the lazy writing panel.
 */
import type { WritingCorrectionResult } from '../shared/aiWritingCorrection';
import { studyDayKey } from '../shared/studyDay';
import type { StudyLang } from '../shared/studyLang';
import {
  normalizeWritingHistory,
  recordJournalDay,
  recordWritingCorrection,
  type WritingHistory,
} from '../shared/writingHistory';
import { writeLocalStorageJson } from './localStorageWrite';
import { getActiveProfileId } from './profileState';

const PREFIX = 'jp-study.writing.history.v1';

export function writingHistoryKey(lang: StudyLang, profileId: string = getActiveProfileId()): string {
  return `${PREFIX}.${profileId}.${lang}`;
}

export function loadWritingHistory(lang: StudyLang): WritingHistory {
  try {
    const raw = localStorage.getItem(writingHistoryKey(lang));
    return normalizeWritingHistory(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeWritingHistory(null);
  }
}

function save(lang: StudyLang, history: WritingHistory): WritingHistory {
  writeLocalStorageJson(writingHistoryKey(lang), history);
  return history;
}

/** Records a correction the learner received; returns the history as stored. */
export function rememberWritingCorrection(lang: StudyLang, result: WritingCorrectionResult, at = Date.now()): WritingHistory {
  return save(lang, recordWritingCorrection(loadWritingHistory(lang), result, at));
}

/** Marks today's study day as a journal day; returns the history as stored. */
export function rememberJournalDay(lang: StudyLang, at = Date.now()): WritingHistory {
  const before = loadWritingHistory(lang);
  const after = recordJournalDay(before, studyDayKey(at));
  return after === before ? before : save(lang, after);
}

/** Forgets the correction history (the journal days stay). */
export function clearWritingCorrections(lang: StudyLang): WritingHistory {
  return save(lang, { ...loadWritingHistory(lang), entries: [] });
}
