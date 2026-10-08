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
 * window alive, and drops them the moment one opens — so an extension mine is
 * never added twice and a reminder never fires twice. Main pushes every change
 * (`blanc:study-os-alive`); the initial state is asked for once.
 *
 * Everything here is a dynamic import: none of it is Blanc startup cost, and a
 * session that never takes the jobs over never loads them.
 */

type Uninstall = () => void;

interface StudyOsPresenceApi {
  blancStudyOsAlive?: () => Promise<boolean>;
  onStudyOsAlive?: (cb: (alive: boolean) => void) => () => void;
}

let releaseChecked = false;
let backupTimer: number | null = null;

async function installJobs(): Promise<Uninstall> {
  const [bridges, mining, automation, calendar, reminders, delivery] = await Promise.all([
    import('./studyBackgroundJobs'),
    import('./studyMining'),
    import('./localAgentAutomationHost'),
    import('./calendar'),
    import('./calendarReminders'),
    import('./calendarReminderDelivery'),
  ]);
  const offs: Uninstall[] = [];
  offs.push(bridges.installStudyRendererBridges());
  offs.push(mining.installStudyMining());
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

/**
 * Start following Study OS's presence. Returns the uninstall for the Blanc
 * window's lifetime.
 */
export function installBlancBackgroundJobs(api: StudyOsPresenceApi = window.api as StudyOsPresenceApi): Uninstall {
  let uninstall: Uninstall | null = null;
  let generation = 0;
  let disposed = false;

  const apply = (studyOsAlive: boolean): void => {
    if (disposed) return;
    generation += 1;
    const current = generation;
    if (studyOsAlive) {
      uninstall?.();
      uninstall = null;
      return;
    }
    if (uninstall) return;
    void installJobs().then((off) => {
      // A Study OS window that opened while the chunks loaded wins.
      if (disposed || current !== generation || uninstall) {
        off();
        return;
      }
      uninstall = off;
    }).catch((error: unknown) => {
      console.warn('[blanc] background jobs failed to install:', error);
    });
  };

  const unsubscribe = api.onStudyOsAlive?.(apply);
  void (api.blancStudyOsAlive?.() ?? Promise.resolve(true)).then(apply).catch(() => undefined);

  return () => {
    disposed = true;
    unsubscribe?.();
    uninstall?.();
    uninstall = null;
  };
}
