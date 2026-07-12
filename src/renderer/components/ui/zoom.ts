/**
 * Read the app's accessibility zoom factor (appZoom.ts stamps `--app-zoom` on
 * <html>). Fixed/absolute UI positioned from pointer coordinates inside the
 * zoomed #root must divide client coords by this factor — the recurring
 * "fixed-position under CSS zoom" gotcha. Phase 1 · M5a.
 */
export function appZoomFactor(): number {
  try {
    const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-zoom'));
    return Number.isFinite(v) && v > 0 ? v : 1;
  } catch {
    return 1;
  }
}
