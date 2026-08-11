import {
  normalizeReadingWorkspaceRoute,
  type ReadingWorkspaceRoute,
  type ReadingWorkspaceSection,
} from '../shared/readingWorkspace';

/** The two retained desktop entries that can host the unified Reading shell. */
export type ReadingWorkspaceHost = 'reading' | 'novels';

export interface ReadingWorkspaceOpenRequest {
  host: ReadingWorkspaceHost;
  route: ReadingWorkspaceRoute;
}

type RouteListener = (route: ReadingWorkspaceRoute) => void;

const pendingRoutes = new Map<ReadingWorkspaceHost, ReadingWorkspaceRoute>();
const routeListeners: Record<ReadingWorkspaceHost, Set<RouteListener>> = {
  reading: new Set<RouteListener>(),
  novels: new Set<RouteListener>(),
};

export function readingWorkspaceHostForSection(
  section: ReadingWorkspaceSection,
): ReadingWorkspaceHost {
  return section === 'plan' || section === 'imports' || section === 'sources'
    ? 'novels'
    : 'reading';
}

/**
 * Recognize a Reading deep link without stealing ordinary desktop app ids.
 *
 * `library`, `reading`, and `novels` are already valid desktop window ids. They
 * must keep opening those compatibility entries when sent through `os:open`.
 * Only the former Finder names, the versioned `reading:` URL, and the typed
 * object form are Reading-workspace handoffs.
 */
export function isReadingWorkspaceOpenDetail(value: unknown): boolean {
  if (typeof value === 'string') {
    const raw = value.trim().toLowerCase();
    return raw === 'reading-finder'
      || raw === 'readingfinder'
      || raw.startsWith('reading://');
  }
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function resolveReadingWorkspaceOpenRequest(
  value: unknown,
): ReadingWorkspaceOpenRequest | null {
  if (!isReadingWorkspaceOpenDetail(value)) return null;

  const route = normalizeReadingWorkspaceRoute(value);
  if (!route) return null;
  return { host: readingWorkspaceHostForSection(route.section), route };
}

/**
 * Deliver a route to a mounted workspace, or retain one handoff until its lazy
 * host mounts. Keeping this outside React closes the event-before-mount race:
 * `os:open` creates a desktop window synchronously, while the workspace body is
 * loaded through `lazy()` and cannot subscribe until a later render.
 */
export function publishReadingWorkspaceRoute(route: ReadingWorkspaceRoute): void {
  const host = readingWorkspaceHostForSection(route.section);
  const listeners = routeListeners[host];
  if (listeners.size === 0) {
    pendingRoutes.set(host, route);
    return;
  }
  pendingRoutes.delete(host);
  for (const listener of listeners) listener(route);
}

export function consumePendingReadingWorkspaceRoute(
  host: ReadingWorkspaceHost,
): ReadingWorkspaceRoute | null {
  const route = pendingRoutes.get(host) ?? null;
  pendingRoutes.delete(host);
  return route;
}

export function subscribeReadingWorkspaceRoutes(
  host: ReadingWorkspaceHost,
  listener: RouteListener,
): () => void {
  routeListeners[host].add(listener);
  return () => routeListeners[host].delete(listener);
}
