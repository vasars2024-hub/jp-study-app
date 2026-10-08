import { useEffect, useRef } from 'react';

/**
 * `setInterval` that runs only while the document is visible.
 *
 * Status polls in a toolbox window (system metrics every 3 s, the local model
 * runtime every 5 s, the model list every 15 s) kept running while the window
 * was minimised or behind another app — a resource monitor that itself burns
 * CPU in the background. This pauses on `visibilitychange`, and runs the
 * callback once on becoming visible again so the panel is not stale.
 *
 * The callback is read through a ref, so passing a new function each render
 * does not restart the timer.
 */
export function useVisibleInterval(callback: () => void, ms: number, enabled = true): void {
  const saved = useRef(callback);
  saved.current = callback;

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return undefined;
    let id: number | null = null;
    const start = (): void => {
      if (id === null) id = window.setInterval(() => saved.current(), ms);
    };
    const stop = (): void => {
      if (id !== null) window.clearInterval(id);
      id = null;
    };
    const onVisibility = (): void => {
      if (document.hidden) {
        stop();
        return;
      }
      saved.current();
      start();
    };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [ms, enabled]);
}
