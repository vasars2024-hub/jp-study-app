/**
 * "Recovered from a crash" (audit robust #5). Main reloads a crashed window
 * (`main/crashRecovery.ts`) and remembers why; the reloaded window asks once
 * and tells the user, instead of the crash vanishing without a trace. When the
 * user chose safe mode after repeated crashes, it is applied here: animations
 * off (lower GPU and memory use) and Secret OS's own safe mode on.
 */
import { t } from './i18n';
import { notify } from './notificationStore';

export async function showCrashRecoveryNotice(): Promise<void> {
  const consume = window.api?.diagnosticsConsumeCrashRecovery;
  if (!consume) return;
  let notice: Awaited<ReturnType<typeof consume>> = null;
  try {
    notice = await consume();
  } catch {
    return;
  }
  if (!notice) return;
  if (notice.safeMode) {
    try {
      const [{ saveDisplayPrefs }, { setAeroSafeMode }] = await Promise.all([
        import('./displayPrefs'),
        import('./aeroSafeMode'),
      ]);
      saveDisplayPrefs({ animationLevel: 'none' });
      setAeroSafeMode(true);
    } catch {
      /* the notice still goes out */
    }
  }
  const message = notice.safeMode
    ? `${t('crash.recovered.body', { reason: notice.reason })} ${t('crash.recovered.safeMode')}`
    : t('crash.recovered.body', { reason: notice.reason });
  notify({
    id: 'crash-recovered',
    title: t('crash.recovered.title'),
    message,
    kind: 'warning',
    source: 'system',
  });
  // The notification center only records; nothing in it surfaces on its own,
  // so a crash the user did not watch happen stayed invisible until they
  // opened the center. The toast is what they actually see come back.
  window.dispatchEvent(
    new CustomEvent('os:toast', {
      detail: { message, kind: 'warn' },
    }),
  );
}
