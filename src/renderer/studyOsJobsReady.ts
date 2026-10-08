/**
 * "Study OS has its background jobs installed" — the ack Blanc waits for before
 * it drops its own copy of those jobs (blancBackgroundJobs.ts).
 *
 * "A Study OS window is alive" is not enough: the window exists long before its
 * renderer has mounted App and installed the extension/Whisper bridges and the
 * pending-Anki replay, and anything that arrived in that gap had no handler in
 * either window. The installers note themselves here; the Study OS entry
 * (main.tsx) waits for the required ones and then tells main, which relays it
 * to Blanc.
 *
 * The installers run in Blanc too, which is harmless: only the Study OS entry
 * ever announces.
 */

export type StudyOsJobName = 'bridges' | 'mining';

/** The jobs App installs from effects — the automation host and calendar reminders are synchronous in main.tsx. */
export const STUDY_OS_REQUIRED_JOBS: readonly StudyOsJobName[] = ['bridges', 'mining'];

const installed = new Map<StudyOsJobName, number>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      /* one listener never blocks the rest */
    }
  }
}

/** Record that `name` is installed in this renderer. Returns the matching un-note. */
export function noteStudyOsJobInstalled(name: StudyOsJobName): () => void {
  installed.set(name, (installed.get(name) ?? 0) + 1);
  notify();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const next = (installed.get(name) ?? 1) - 1;
    if (next > 0) installed.set(name, next);
    else installed.delete(name);
  };
}

export function areStudyOsJobsInstalled(names: readonly StudyOsJobName[] = STUDY_OS_REQUIRED_JOBS): boolean {
  return names.every((name) => (installed.get(name) ?? 0) > 0);
}

/** Resolve once every job in `names` is installed (immediately when they already are). */
export function whenStudyOsJobsInstalled(names: readonly StudyOsJobName[] = STUDY_OS_REQUIRED_JOBS): Promise<void> {
  if (areStudyOsJobsInstalled(names)) return Promise.resolve();
  return new Promise((resolve) => {
    const check = (): void => {
      if (!areStudyOsJobsInstalled(names)) return;
      listeners.delete(check);
      resolve();
    };
    listeners.add(check);
  });
}

/**
 * Study OS entry only: once the required jobs are installed, tell main (which
 * relays `blanc:study-os-jobs-ready` to Blanc). Fire-and-forget.
 */
export async function announceStudyOsJobsReady(
  api: { blancStudyOsJobsReady?: () => Promise<unknown> } | undefined = (globalThis as { window?: { api?: unknown } })
    .window?.api as { blancStudyOsJobsReady?: () => Promise<unknown> } | undefined,
  names: readonly StudyOsJobName[] = STUDY_OS_REQUIRED_JOBS,
): Promise<void> {
  await whenStudyOsJobsInstalled(names);
  await api?.blancStudyOsJobsReady?.();
}

/** Tests only. */
export function __resetStudyOsJobsForTests(): void {
  installed.clear();
  listeners.clear();
}
