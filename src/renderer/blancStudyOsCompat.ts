/**
 * On-demand loading of the Study OS class-name stylesheet in the Blanc window.
 *
 * Blanc's panels reuse shared content components (dictionary results, the
 * clipboard history panel, the calendar, the readers …) whose layout rules live
 * in Study OS's `styles.css`, exposed to Blanc as `theme/studyos-compat.css`
 * (layered, so Blanc's own rules win every tie). That sheet is ~500 KB built, so
 * Blanc fetches it the first time something that needs it is about to render,
 * never at startup. One promise, shared by every caller.
 */
let loading: Promise<void> | null = null;
let loaded = false;

export function ensureStudyOsCompat(): Promise<void> {
  if (!loading) {
    loading = import('./theme/studyos-compat.css').then(
      () => {
        loaded = true;
      },
      (error: unknown) => {
        // A failed chunk must be retryable, not cached as a permanent rejection.
        loading = null;
        throw error;
      },
    );
  }
  return loading;
}

export function studyOsCompatLoaded(): boolean {
  return loaded;
}
