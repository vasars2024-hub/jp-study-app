/**
 * "No Chinese dictionary" as an event the renderer can turn into a prompt (risk4).
 *
 * CC-CEDICT stopped shipping in the installer (forge.config.ts
 * `ON_DEMAND_PUBLIC_PATHS`; it is the `cc-cedict` download in Settings >
 * Storage). A Chinese learner who updated used to find out only by looking a
 * word up and reading "no Chinese dictionary installed". The first lookup that
 * ends that way now also tells every window once per run, and the renderer
 * (`renderer/cedictMissingPrompt.ts`) shows a one-time "Download now" notice.
 */
import { BrowserWindow } from 'electron';

export const CEDICT_MISSING_CHANNEL = 'dict:cedictMissing';

let reported = false;

function broadcast(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed()) win.webContents.send(CEDICT_MISSING_CHANNEL);
    } catch {
      /* a window mid-teardown */
    }
  }
}

/** Tell the windows once per run. Returns whether this call was the one that did. */
export function reportCedictMissing(send: () => void = broadcast): boolean {
  if (reported) return false;
  reported = true;
  try {
    send();
  } catch {
    /* no windows (tests, shutdown): the lookup result still says it */
  }
  return true;
}

/** After an install (or a removal) the next miss is news again. */
export function resetCedictMissingReport(): void {
  reported = false;
}
