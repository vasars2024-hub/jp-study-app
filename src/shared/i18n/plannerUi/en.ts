// Study planner pass: calendar drag-to-reschedule, .ics export, quiet hours, and the Agent's
// calendar tool errors and connection messages. — English source of truth.

import type { Catalog } from '../core';

export const PLANNER_UI_EN: Catalog = {
  // Drag-to-reschedule one date of a repeating event, and skipping one date
  'planner.move.occurrenceTitle': 'Move just this date?',
  'planner.move.occurrenceMessage': '“{name}” repeats. Only this occurrence moves — it becomes its own event and the rest of the series stays where it is. To move every occurrence, change the date in the event editor.',
  'planner.move.occurrenceConfirm': 'Move this date',
  'planner.moveOne.label': 'Move only this date to',
  'planner.moveOne.button': 'Move date',
  'planner.skip.button': 'Skip this date',
  'planner.skip.title': 'Skip this occurrence?',
  'planner.skip.message': '“{name}” will not happen on {date}. Every other date in the series stays.',
  'planner.skip.confirm': 'Skip date',
  // iCalendar export
  'planner.ics.export': 'Export .ics',
  'planner.ics.hint': 'Save every event as an iCalendar file for Google, Outlook or Apple Calendar',
  'planner.ics.empty': 'No events to export yet',
  'planner.ics.calendarName': 'Gum study calendar',
  // Quiet hours (nightly Do not disturb)
  'planner.quiet.label': 'Quiet hours',
  'planner.quiet.toggle': 'Quiet every night',
  'planner.quiet.from': 'Quiet hours start',
  'planner.quiet.to': 'Quiet hours end',
  'planner.quiet.activeUntil': 'Quiet hours until {time}',
  // Agent calendar / card tool errors (the model reads these, and so does the user)
  'planner.agent.error.time': '{name} must be a time in HH:MM (24-hour) form.',
  'planner.agent.error.endBeforeStart': 'The end time is before the start time.',
  'planner.agent.error.repeatEnd': 'The repeat end date must be a real date on or after the first date.',
  'planner.agent.error.eventNotFound': 'No calendar event has that id. List the calendar to find it.',
  'planner.agent.error.emptyPatch': 'Nothing to change: the patch names no editable card field.',
  // Agent connection failures, one remedy each
  'agent.execute.error.offline': 'Could not reach the provider. Check your internet connection — the offline model still works without one.',
  'agent.execute.error.rateLimit': 'The provider is rate-limiting requests. Wait a minute, then try again.',
  'agent.execute.error.timeout': 'The provider took too long to answer. Try again, or shorten the request.',
  'agent.capabilities.operation.calendar.reschedule-event': 'Move a calendar event',
  // iCalendar import
  'planner.icsImport.button': 'Import .ics',
  'planner.icsImport.hint': 'Add events from an iCalendar file (Google, Outlook or Apple Calendar export). You see what will be added first.',
  'planner.icsImport.title': 'Import calendar file',
  'planner.icsImport.fresh': { one: '{count} new event will be added', other: '{count} new events will be added' },
  'planner.icsImport.duplicates': {
    one: '{count} event is already in your calendar (same UID) and is skipped',
    other: '{count} events are already in your calendar (same UID) and are skipped',
  },
  'planner.icsImport.skipped': {
    one: '{count} cancelled or unreadable event is left out',
    other: '{count} cancelled or unreadable events are left out',
  },
  'planner.icsImport.warning.repeat-unsupported': {
    one: '{count} event repeats in a way this calendar cannot hold — only its first date is imported',
    other: '{count} events repeat in a way this calendar cannot hold — only their first date is imported',
  },
  'planner.icsImport.warning.multi-day': {
    one: '{count} event spans several days — it is imported on its first day',
    other: '{count} events span several days — each is imported on its first day',
  },
  'planner.icsImport.warning.timezone-unknown': {
    one: '{count} event names a time zone this computer does not know — its time is read as written',
    other: '{count} events name a time zone this computer does not know — their times are read as written',
  },
  'planner.icsImport.warning.reminder-rounded': {
    one: '{count} reminder was rounded to the nearest choice',
    other: '{count} reminders were rounded to the nearest choice',
  },
  'planner.icsImport.confirm': { one: 'Import {count} event', other: 'Import {count} events' },
  'planner.icsImport.done': { one: 'Imported {count} event', other: 'Imported {count} events' },
  'planner.icsImport.error.tooLarge': 'That file is larger than 5 MB, which is more than a calendar export should be.',
  'planner.icsImport.error.empty': 'That file has no calendar events in it.',
  'planner.icsImport.error.read': 'The file could not be read.',
  // Editing one occurrence of a repeating event
  'planner.scope.legend': 'Apply to',
  'planner.scope.this': 'This event',
  'planner.scope.following': 'This and following events',
  'planner.scope.all': 'All events',
  'planner.scope.deleteFollowing': '“{name}” will stop repeating from {date}: that date and every later one are deleted. Earlier dates stay.',
  // Keyboard move (Alt+Arrow) and the week grid
  'planner.keyboardMove.moved': 'Moved “{name}” to {date}',
  'planner.week.grid': 'Week schedule',
  'planner.week.hint': 'Arrow keys pick a day and hour, Enter adds an event there. On an event, Alt+Left or Right moves it a day, Alt+Up or Down 15 minutes.',
  'planner.week.time': 'Time',
  'planner.week.addOn': 'Add an event on {date}',
  // Agent: Undo of a calendar move, the executor's refusals, history budget, offline
  'planner.agent.error.movedSince': 'This event has changed since it was moved, so Undo would overwrite that change. Nothing was changed.',
  'agent.refusal.notApproved': 'That action is not one the Agent may take.',
  'agent.refusal.notEnabled': '“{operation}” is switched off for the active Agent profile.',
  'agent.refusal.needsPermission': '“{operation}” needs the “{level}” permission level.',
  'agent.refusal.unknownPermission': '“{operation}” was requested at a permission level this version does not know.',
  'agent.refusal.noAdapter': '“{operation}” is not available in this version.',
  'agent.refusal.toolFailed': 'The action failed.',
  'agent.execute.offlineNow': 'You are offline. A cloud model cannot be reached until the connection is back — the offline model still works.',
  'agent.history.trimmedChip': 'Shortened',
  'agent.history.trimmedHint': {
    one: 'The oldest message was removed to keep history under its size limit',
    other: 'The oldest {count} messages were removed to keep history under its size limit',
  },
  'agent.history.trimmedHeader': {
    one: 'The oldest message of this conversation was removed to keep history under its size limit. Pin a conversation to keep it whole for longer.',
    other: 'The oldest {count} messages of this conversation were removed to keep history under its size limit. Pin a conversation to keep it whole for longer.',
  },
  'agent.history.droppedConversations': {
    one: '{count} older conversation was removed to keep history under its size limit.',
    other: '{count} older conversations were removed to keep history under its size limit.',
  },
  'agent.plan.undo.button': 'Undo',
  'agent.plan.undo.confirm': 'Undo this step ({operation})? It is checked again first: if what it changed has been changed since, nothing is undone.',
};
