import {
  normalizeReadingWorkspaceRoute,
  serializeReadingWorkspaceRoute,
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

/*
 * ---------------------------------------------------------------------------
 * §11.1's last row — "Middle-click / Ctrl-click opens in a pop-out".
 * ---------------------------------------------------------------------------
 *
 * A pop-out is a SEPARATE renderer process, so everything above this line is
 * invisible to it: `pendingRoutes` is a module-level Map and module state does
 * not cross a window boundary. The route has to travel through something both
 * windows can see.
 *
 * DECISION: `localStorage`, not main. Trap 1 of the plan says list DATA lives
 * in main because a profile reset has no restore point — that reasoning does
 * not reach here, because this is not data. It is one in-flight navigation
 * intent with a sixty-second life, and losing it costs the user a pop-out that
 * opens on the grid instead of on their list. The main-process alternative
 * (`popout:open` taking a route, plus a claim binding) needs `src/preload.ts`,
 * which concurrent tracks have held ` M` for eight turns; localStorage is the
 * only same-partition store reachable from the files this slice owns.
 *
 * The wire format is `serializeReadingWorkspaceRoute`'s existing
 * `reading://workspace/...` deep link rather than a second JSON shape, so the
 * receiving window validates it through `normalizeReadingWorkspaceRoute` like
 * any other untrusted route and a stale schema is rejected, not reinterpreted.
 */

const POPOUT_ROUTE_KEY = 'jp-reading-workspace-popout-route-v1';

/**
 * How long a staged route stays claimable.
 *
 * Long enough for a cold pop-out to boot its lazy workspace body, short enough
 * that a route staged before a crash cannot hijack a pop-out opened minutes
 * later for an unrelated reason. `readingPassageHandoffClient`'s retain latch
 * makes the same tradeoff for the same reason.
 */
const POPOUT_ROUTE_TTL_MS = 60_000;

interface StagedPopoutRoute {
  at: number;
  url: string;
}

/** True only in a window main opened as `?popout=<section>` (`App.tsx`'s flag). */
function isPopoutWindow(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('popout') !== null;
  } catch {
    return false;
  }
}

function popoutRouteStore(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    // A renderer can be denied storage; the caller then falls back to opening
    // in-window, which is still somewhere real.
    return null;
  }
}

/**
 * Park a route for the pop-out window that is about to open.
 *
 * Returns whether it was stored. A caller that gets `false` must NOT suppress
 * its in-window navigation, or the click lands nowhere.
 */
export function stageReadingWorkspaceRouteForPopout(route: ReadingWorkspaceRoute): boolean {
  const store = popoutRouteStore();
  if (!store) return false;
  try {
    const staged: StagedPopoutRoute = {
      at: Date.now(),
      url: serializeReadingWorkspaceRoute(route),
    };
    store.setItem(POPOUT_ROUTE_KEY, JSON.stringify(staged));
    return true;
  } catch {
    return false;
  }
}

function readStagedPopoutRoute(): ReadingWorkspaceRoute | null {
  const store = popoutRouteStore();
  if (!store) return null;
  let raw: string | null = null;
  try {
    raw = store.getItem(POPOUT_ROUTE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let staged: StagedPopoutRoute | null = null;
  try {
    staged = JSON.parse(raw) as StagedPopoutRoute;
  } catch {
    staged = null;
  }
  // Clear on every read, valid or not. A slot that cannot be parsed would
  // otherwise be re-read on every mount for as long as the profile lives.
  try {
    store.removeItem(POPOUT_ROUTE_KEY);
  } catch {
    // Nothing useful to do; the TTL still bounds it.
  }
  if (!staged || typeof staged.url !== 'string') return null;
  if (!Number.isFinite(staged.at) || Date.now() - staged.at > POPOUT_ROUTE_TTL_MS) return null;
  return normalizeReadingWorkspaceRoute(staged.url);
}

/**
 * Claim a staged route, on mount, in a pop-out only.
 *
 * Gated on `isPopoutWindow` deliberately: the desktop window is normally the
 * one that STAGED it, and a desktop host that consumed its own hand-off would
 * navigate the window the user is leaving behind as well as the new one.
 * Returns null when the host does not match, so a `plan` route cannot be
 * delivered to the `reading` shell.
 */
export function consumeStagedPopoutReadingWorkspaceRoute(
  host: ReadingWorkspaceHost,
): ReadingWorkspaceRoute | null {
  if (!isPopoutWindow()) return null;
  const route = readStagedPopoutRoute();
  if (!route) return null;
  return readingWorkspaceHostForSection(route.section) === host ? route : null;
}

/**
 * Deliver routes staged AFTER this pop-out already existed.
 *
 * `popOut` deduplicates by section, so the second Ctrl-click focuses this
 * window rather than remounting it — a mount-only claim would make every
 * gesture after the first one silently do nothing. `storage` fires in every
 * same-origin document EXCEPT the one that wrote, which is exactly the
 * delivery rule this needs and the reason the writer is not filtered out by
 * hand.
 */
export function subscribeStagedPopoutReadingWorkspaceRoutes(
  host: ReadingWorkspaceHost,
  listener: RouteListener,
): () => void {
  if (typeof window === 'undefined' || !isPopoutWindow()) return () => undefined;
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== POPOUT_ROUTE_KEY || event.newValue === null) return;
    const route = readStagedPopoutRoute();
    if (route && readingWorkspaceHostForSection(route.section) === host) listener(route);
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

/** Test seam: drops a staged route without waiting out its TTL. */
export function __resetStagedPopoutReadingWorkspaceRoute(): void {
  try {
    popoutRouteStore()?.removeItem(POPOUT_ROUTE_KEY);
  } catch {
    // Already unreachable; nothing to clear.
  }
}
