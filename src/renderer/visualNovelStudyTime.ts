/**
 * Bank finished visual-novel sessions in the shared study statistics.
 *
 * The playtime of a VN session is measured in main (it follows the game's
 * process), but the statistics every other reader feeds — `recordReading` in
 * `stats.ts` — live in renderer storage. Main queues each finished session;
 * this drains the queue whenever main says one ended and once at boot, so a
 * session that ended while no window was open is still counted. The drain is
 * atomic in main, so two open windows never record the same session twice.
 */
import { recordReading } from './stats';

let installed = false;

async function drain(): Promise<void> {
  const api = typeof window !== 'undefined' ? window.api : undefined;
  if (typeof api?.visualNovelDrainStudyTime !== 'function') return;
  const sessions = await api.visualNovelDrainStudyTime().catch(() => []);
  for (const session of sessions) {
    recordReading(`vn:${session.visualNovelId}`, session.title, session.seconds, session.chars);
  }
}

export function installVisualNovelStudyTimeSync(): () => void {
  if (installed || typeof window === 'undefined') return () => undefined;
  installed = true;
  void drain();
  const off = typeof window.api?.onVisualNovelStudyTime === 'function'
    ? window.api.onVisualNovelStudyTime(() => void drain())
    : () => undefined;
  return () => {
    installed = false;
    off();
  };
}
