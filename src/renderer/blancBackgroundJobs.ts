/**
 * Background work Blanc takes over while it is the only window.
 *
 * Study OS's renderer runs the app's background jobs: the extension/Whisper
 * bridges (studyBackgroundJobs.ts), the pending-Anki replay, the scheduled
 * automation host, calendar reminders, the release check and the daily
 * backup. With Study OS closed — or never opened, under "Start in Blanc only" —
 * none of them ran: extension mines never reached the local deck, transcription
 * jobs waited forever, reminders never fired.
 *
 * Blanc runs the same installers, but ONLY while main reports no Study OS
 * window alive, and drops them once a Study OS renderer acks that its own jobs
 * are installed (`blanc:study-os-jobs-ready`, studyOsJobsReady.ts) — so an
 * extension mine is never added twice, a reminder never fires twice, and
 * nothing goes unhandled while Study OS is still booting. Main pushes every
 * change (`blanc:study-os-alive`, `blanc:study-os-jobs-ready`); the initial
 * states are asked for once.
 *
 * Everything here is a dynamic import: none of it is Blanc startup cost, and a
 * session that never takes the jobs over never loads them.
 */

type Uninstall = () => void;

interface StudyOsPresenceApi {
  blancStudyOsAlive?: () => Promise<boolean>;
  onStudyOsAlive?: (cb: (alive: boolean) => void) => () => void;
  blancStudyOsJobsReadyState?: () => Promise<boolean>;
  onStudyOsJobsReady?: (cb: (ready: boolean) => void) => () => void;
}

let releaseChecked = false;
let backupTimer: number | null = null;

async function installJobs(): Promise<Uninstall> {
  const [bridges, mining, automation, calendar, reminders, delivery, reviewSync] = await Promise.all([
    import('./studyBackgroundJobs'),
    import('./studyMining'),
    import('./localAgentAutomationHost'),
    import('./calendar'),
    import('./calendarReminders'),
    import('./calendarReminderDelivery'),
    import('./ankiReviewSync'),
  ]);
  const offs: Uninstall[] = [];
  offs.push(bridges.installStudyRendererBridges());
  offs.push(mining.installStudyMining());
  // The review answers themselves are captured by every window (blancMain.tsx);
  // sending them is a background job like the mining queue.
  offs.push(reviewSync.installAnkiReviewSync());
  offs.push(automation.installLocalAgentAutomationHost());
  // The calendar scheduler normally runs only in the primary Study OS window
  // (one deliverer per shared storage). With no Study OS window, Blanc is it.
  const scheduler = reminders.createCalendarReminderScheduler({
    deliver: delivery.deliverCalendarReminders,
    subscribe: calendar.onCalendarChanged,
  });
  scheduler.start();
  offs.push(() => scheduler.stop());

  // Once per Blanc session: the release notice and the daily backup check,
  // the same idle-and-late timing Study OS uses.
  if (!releaseChecked) {
    releaseChecked = true;
    window.setTimeout(() => {
      void import('./releaseCheck').then((m) => m.startReleaseCheck()).catch(() => undefined);
    }, 12_000);
  }
  if (backupTimer === null) {
    backupTimer = window.setTimeout(() => {
      void import('./storage/backupClient').then((m) => m.runAutoBackupIfDue()).catch(() => undefined);
    }, 150_000);
  }
  return () => {
    for (const off of offs.splice(0)) {
      try {
        off();
      } catch {
        /* keep detaching the rest */
      }
    }
  };
}

export type BlancJobsAction = 'install' | 'drop' | 'keep';

/**
 * What Blanc does with its copy of the jobs. It drops them only once a Study OS
 * renderer has ACKED its own jobs installed (`studyOsJobsReady`) — "a Study OS
 * window is alive" is true long before its handlers exist, and dropping on that
 * left a gap where nobody handled a mine or a Whisper request. It takes them
 * over only when no Study OS window is alive. In between (Study OS alive, still
 * loading) it keeps whatever it has, so nothing flaps during that window's boot.
 */
export function decideBlancJobs(state: { studyOsAlive: boolean; studyOsJobsReady: boolean; installed: boolean }): BlancJobsAction {
  if (state.studyOsJobsReady) return state.installed ? 'drop' : 'keep';
  if (!state.studyOsAlive) return state.installed ? 'keep' : 'install';
  return 'keep';
}

/**
 * Start following Study OS's presence. Returns the uninstall for the Blanc
 * window's lifetime.
 */
export function installBlancBackgroundJobs(
  api: StudyOsPresenceApi = window.api as StudyOsPresenceApi,
  install: () => Promise<Uninstall> = installJobs,
): Uninstall {
  let uninstall: Uninstall | null = null;
  let installing = false;
  let disposed = false;
  // Unknown until main answers; "alive" is the conservative start (do nothing).
  let studyOsAlive = true;
  let studyOsJobsReady = false;
  // A main without the ack channel: fall back to the old "alive" signal.
  const hasAck = typeof api.onStudyOsJobsReady === 'function';

  const evaluate = (): void => {
    if (disposed) return;
    const action = decideBlancJobs({
      studyOsAlive,
      studyOsJobsReady: hasAck ? studyOsJobsReady : studyOsAlive,
      installed: uninstall !== null || installing,
    });
    if (action === 'drop') {
      uninstall?.();
      uninstall = null;
      return;
    }
    if (action !== 'install') return;
    installing = true;
    void install().then((off) => {
      installing = false;
      // A Study OS window that acked while the chunks loaded wins.
      if (disposed || uninstall || (hasAck ? studyOsJobsReady : studyOsAlive)) {
        off();
        return;
      }
      uninstall = off;
    }).catch((error: unknown) => {
      installing = false;
      console.warn('[blanc] background jobs failed to install:', error);
    });
  };

  const onAlive = (alive: boolean): void => {
    studyOsAlive = alive;
    evaluate();
  };
  const onReady = (ready: boolean): void => {
    studyOsJobsReady = ready;
    evaluate();
  };

  const unsubscribeAlive = api.onStudyOsAlive?.(onAlive);
  const unsubscribeReady = api.onStudyOsJobsReady?.(onReady);
  if (hasAck) {
    void (api.blancStudyOsJobsReadyState?.() ?? Promise.resolve(false)).then(onReady).catch(() => undefined);
  }
  void (api.blancStudyOsAlive?.() ?? Promise.resolve(true)).then(onAlive).catch(() => undefined);

  return () => {
    disposed = true;
    unsubscribeAlive?.();
    unsubscribeReady?.();
    uninstall?.();
    uninstall = null;
  };
}
