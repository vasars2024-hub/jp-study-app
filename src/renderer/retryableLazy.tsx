import { createElement, lazy, type ComponentProps, type ComponentType, type ReactElement } from 'react';

/**
 * `React.lazy` that can try again after its chunk failed to load.
 *
 * `lazy()` caches its first outcome for the life of the page — a rejected
 * import (a dropped connection, a chunk evicted mid-update) stays rejected, so
 * an error boundary's "Try again" re-rendered the same failure forever and only
 * a full reload helped. A failed import here registers a reset; an explicit
 * retry (`retryFailedLazyImports`, called by the boundary's "Try again") swaps
 * in a fresh lazy component so the next render imports again.
 *
 * The swap is deliberately NOT automatic: React re-renders a failed subtree
 * once on its own, and an automatic swap would turn a chunk that keeps failing
 * into an endless load-fail-reload loop instead of a visible error.
 */
const pendingResets = new Set<() => void>();

/** Re-arm every lazy import that failed, so the next render loads it again. */
export function retryFailedLazyImports(): void {
  for (const reset of [...pendingResets]) reset();
  pendingResets.clear();
}

export function retryableLazy<C extends ComponentType<never>>(
  factory: () => Promise<{ default: C }>,
): (props: ComponentProps<C>) => ReactElement {
  const load = (): Promise<{ default: C }> =>
    factory().catch((error: unknown) => {
      pendingResets.add(() => {
        current = lazy(load);
      });
      throw error;
    });
  let current = lazy(load);
  function RetryableLazy(props: ComponentProps<C>): ReactElement {
    return createElement(current as unknown as ComponentType<object>, props as object);
  }
  return RetryableLazy;
}
