/**
 * What a translation surface says when a translation fails. Main words every
 * `translate:run` failure as a catalog key and `translator.ts` says it in the UI
 * language; only what never reached main (the IPC call rejecting, a missing
 * bridge) arrives as English platform text, and that becomes "Translation failed."
 */
type T = (key: string, vars?: Record<string, string | number>) => string;

const PLATFORM_TEXT = /Error invoking remote method|ipcRenderer|is not a function|Cannot read properties|undefined is not|Failed to fetch/i;

export function translateErrorText(error: unknown, t: T): string {
  if (!(error instanceof Error) || error instanceof TypeError) return t('translate.error.failed');
  const message = error.message.trim();
  return !message || PLATFORM_TEXT.test(message) ? t('translate.error.failed') : message;
}
