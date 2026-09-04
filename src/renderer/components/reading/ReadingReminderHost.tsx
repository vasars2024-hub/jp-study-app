/**
 * Reading Lists §11.3 — where a reminder is actually seen and answered.
 *
 * Mounted inside `ToastHost`, which is the one place every shell already mounts
 * exactly once (its own header says so, and App.tsx renders it in ten branches
 * plus `blancMain`). An eleventh mount point would be eleven chances for one
 * shell to be the one that never shows a reminder.
 *
 * Not a toast, though it sits beside them. §11.3's stalled-book reminder offers
 * three answers — Continue, Mark finished, Move to abandoned — and `ToastHost`'s
 * toast carries exactly one action by design. A question with three answers
 * rendered as a toast with one is a question that cannot be answered.
 *
 * Two clauses this component owns, both of which are the reason §11.3 exists:
 *
 *   · **Dismissible forever, from the notification itself, not buried in
 *     settings.** Every reminder carries the never-again control, and it takes
 *     effect in main immediately — the same `silenced` list the settings screen
 *     reads, so the two can never disagree about whether a kind is off.
 *   · **Every answer is a real one.** Mark finished writes `finished`, Move to
 *     abandoned writes `abandoned`, Continue opens the book. Nothing here is a
 *     button that only makes the card go away.
 */
import { useCallback, useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { applyReadingListsMutation, latestReadingListsSnapshot } from '../../readingListsClient';
import {
  createReadingListsMutationContext,
  setReadingEntryState,
} from '../../../shared/readingListMutations';
import {
  READING_WORKSPACE_SCHEMA_VERSION,
  type ReadingWorkspaceRoute,
} from '../../../shared/readingWorkspace';
import type {
  ReadingReminder,
  ReadingReminderAction,
} from '../../../shared/readingListReminders';
import type { ReadingEntryState } from '../../../shared/readingLists';
import './readingReminder.css';

/** Which i18n key labels each button. Kept beside the actions it labels. */
const ACTION_LABEL: Record<ReadingReminderAction, string> = {
  open: 'readingLists.reminder.action.open',
  continue: 'readingLists.reminder.action.continue',
  finish: 'readingLists.reminder.action.finish',
  abandon: 'readingLists.reminder.action.abandon',
  silence: 'readingLists.reminder.action.silence',
};

function openReadingRoute(route: Omit<ReadingWorkspaceRoute, 'version'>): void {
  window.dispatchEvent(
    new CustomEvent('os:open', {
      detail: { version: READING_WORKSPACE_SCHEMA_VERSION, ...route },
    }),
  );
}

export default function ReadingReminderHost() {
  const { t } = useT();
  const [reminder, setReminder] = useState<ReadingReminder | null>(null);

  useEffect(() => {
    // Guarded: a preload without the binding must leave the host inert rather
    // than take every shell down at mount.
    const stop = window.api?.onReadingReminder?.((next) => setReminder(next));
    return () => stop?.();
  }, []);

  /**
   * Write a state change for the entry this reminder is about.
   *
   * Reads the freshest snapshot rather than holding one: a reminder can sit on
   * screen for a long time, and the document it was computed from may be several
   * revisions old by the time a button is pressed. The mutation layer's CAS
   * retry covers the rest.
   */
  const setState = useCallback(async (target: ReadingReminder, state: ReadingEntryState) => {
    const snapshot = latestReadingListsSnapshot();
    if (!snapshot || !target.listId || !target.entryId) return;
    await applyReadingListsMutation(snapshot.document, (current) =>
      setReadingEntryState(
        current,
        target.listId as string,
        target.entryId as string,
        state,
        createReadingListsMutationContext(),
      ),
    );
  }, []);

  const run = useCallback(
    (action: ReadingReminderAction) => {
      const target = reminder;
      if (!target) return;
      // Dismissed first in every branch: an answered question must leave the
      // screen even if the write behind it is refused, and the failure surfaces
      // on the list where the state lives.
      setReminder(null);
      switch (action) {
        case 'silence':
          void window.api?.readingRemindersSilence?.(target.kind);
          return;
        case 'continue':
          if (target.itemId) openReadingRoute({ section: 'library', intent: 'open', itemId: target.itemId });
          else if (target.listId) openReadingRoute({ section: 'lists', intent: 'browse', listId: target.listId });
          return;
        case 'finish':
          void setState(target, 'finished');
          return;
        case 'abandon':
          void setState(target, 'abandoned');
          return;
        case 'open':
        default:
          openReadingRoute(
            target.listId
              ? { section: 'lists', intent: 'browse', listId: target.listId }
              : { section: 'lists', intent: 'browse' },
          );
      }
    },
    [reminder, setState],
  );

  if (!reminder) return null;

  return (
    <div className="rl-reminder-host">
      {/*
        `alert` rather than `status`: it is an interruption that asks a question,
        and a polite region would let it queue behind whatever was being read.
      */}
      <div className="rl-reminder" role="alert">
        <div className="rl-reminder-text">
          <strong className="rl-reminder-title">{t(reminder.titleKey, reminder.params)}</strong>
          <span className="rl-reminder-body">{t(reminder.bodyKey, reminder.params)}</span>
        </div>
        <div className="rl-reminder-actions">
          {reminder.actions.map((action) => (
            <button
              key={action}
              type="button"
              className={`rl-reminder-btn${action === 'silence' ? ' is-quiet' : ''}`}
              onClick={() => run(action)}
            >
              {t(ACTION_LABEL[action])}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="rl-reminder-close"
          // Close is "not today", distinct from Never again. Both are offered
          // because §11.3's dismissal clause is about the KIND, and a user who
          // wants this one gone should not have to silence the kind to do it.
          title={t('notifications.dismiss')}
          aria-label={t('notifications.dismiss')}
          onClick={() => setReminder(null)}
        >
          ×
        </button>
      </div>
    </div>
  );
}
