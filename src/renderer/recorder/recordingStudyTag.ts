/**
 * Region Recorder → Calendar and Statistics: a finished recording is filed
 * under the day it was made.
 *
 * Both stores live in this window's storage (`calendar.ts`, `stats.ts`) and
 * have no main-process writer, so main asks the main window to do it
 * (`recorder:study-tag`) and remembers the answer in its history
 * (`studyTagged`). This module is what the window does:
 *
 * - an all-day **study** event on that day, named after the recording, with
 *   the file's path as its description — the one place Calendar shows an
 *   arbitrary, named item for a day, and one the user can delete;
 * - the recorded length as **study time** on that day (`recordStudyTime` takes
 *   the day from the timestamp), so Statistics, the heatmap and the streak
 *   count it. Watching it later in the player is counted again by the player,
 *   as any re-watch is.
 *
 * Idempotent: main retries a request whose answer was lost, so an event that is
 * already there (same day, same file) means "done", and nothing is added twice.
 *
 * Loaded on first use only (`recorderMainBridge.ts` imports it lazily), so the
 * calendar and stats stores stay out of the window's boot graph.
 */
import { addEvent, CATEGORY_COLORS, loadEvents } from '../calendar';
import { recordStudyTime } from '../stats';
import { t } from '../i18n';
import type { RecorderStudyTagRequest } from '../../shared/regionRecorder';

export interface StudyTagStores {
  loadEvents: typeof loadEvents;
  addEvent: typeof addEvent;
  recordStudyTime: typeof recordStudyTime;
}

const REAL_STORES: StudyTagStores = { loadEvents, addEvent, recordStudyTime };

/** The calendar event that stands for a recording, if it is already there. */
export function findRecordingEvent(
  events: ReturnType<typeof loadEvents>,
  request: Pick<RecorderStudyTagRequest, 'studyDay' | 'outputPath'>,
): ReturnType<typeof loadEvents>[number] | undefined {
  return events.find((e) => e.date === request.studyDay && e.category === 'study' && e.description === request.outputPath);
}

/** File one recording under its study day. Resolves true once it is there (now or before). */
export function fileRecordingOnStudyDay(request: RecorderStudyTagRequest, stores: StudyTagStores = REAL_STORES): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(request.studyDay) || !request.outputPath) return false;
  if (findRecordingEvent(stores.loadEvents(), request)) return true;
  stores.addEvent({
    title: t('rec2.calendar.eventTitle', { title: request.title }),
    description: request.outputPath,
    date: request.studyDay,
    allDay: true,
    color: CATEGORY_COLORS.study,
    category: 'study',
    reminder: 'none',
    recurrence: 'none',
  });
  const seconds = Math.round(Number(request.seconds));
  if (Number.isFinite(seconds) && seconds > 0) stores.recordStudyTime(seconds, request.createdAt);
  return true;
}
