/**
 * STUDY OS SUBSTITUTION — replaces seanime-web's `lib/navigation.ts`.
 *
 * Upstream builds these on `@tanstack/react-router`'s `useNavigate` / `useLocation`, which
 * throw ("useRouter must be used inside a <RouterProvider>") outside a router. The Media
 * workspace is a section mounted inside the Study OS desktop shell, which owns navigation
 * and has no React router.
 *
 * ── 2026-09-05: this file learned to talk to the shell, because not doing so was DESTRUCTIVE.
 *
 * The previous version made `push`/`replace` no-ops and read `usePathname()` straight off
 * `window.location`, on the recorded grounds that "entry routes are not adopted until Phase
 * 3". Phase 3 completed 2026-07-28 (`ADOPTION.md`), so that reasoning had been stale for
 * five weeks — and the consequence was not a missing feature but a lost desktop. `SeaLink`
 * rendered a bare `<a href="/entry?id=…">`, so a real trusted click on ANY library card
 * navigated the whole Electron renderer to a route Study OS does not serve. Measured live
 * 2026-09-05 on port 39352: `location.href` became `http://localhost:5174/entry?id=102883`,
 * `#media-workspace` was gone, `document.querySelectorAll('.fwin').length` was **0** — every
 * open window on the desk destroyed — and the app re-ran first-run consent and the tour.
 *
 * `back()` and `refresh()` had the same shape of bug for the same reason: they reached for
 * `window.history` and `window.location.reload()`, which move the SHELL, not this surface.
 *
 * So the location lives here now, in a module-level store the adopted API reads through.
 * The exported API is unchanged, so no adopted call site changes.
 *
 * ONE STORE PER WINDOW, deliberately. `MediaSurfaceShell` documents that two shells may be
 * mounted in one window (the workspace's library and Blanc's player); only the library
 * surface renders routed screens, so a shared route is not ambiguous in practice. If a
 * second routed surface is ever mounted, this becomes a context rather than a module.
 *
 * Whole-file replacement, not an edit — see `vendor/seanime-web/ADOPTION.md`.
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react';

export type HostLocation = { readonly pathname: string; readonly search: string };

const ROOT: HostLocation = { pathname: '/', search: '' };

/**
 * The snapshot IDENTITY is the subscription contract: `useSyncExternalStore` re-renders on
 * reference change, so this object is replaced on navigation and never mutated in place.
 */
let current: HostLocation = ROOT;
const back: HostLocation[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): HostLocation {
  return current;
}

/**
 * Parses against a throwaway base so a relative href resolves without ever consulting the
 * shell's real `window.location` — reading that is what made the old `usePathname()` report
 * the desktop's route as this surface's route.
 */
function parse(href: string): HostLocation {
  try {
    const url = new URL(href, 'http://seanime.host');
    return { pathname: url.pathname || '/', search: url.search };
  } catch {
    return ROOT;
  }
}

function same(a: HostLocation, b: HostLocation): boolean {
  return a.pathname === b.pathname && a.search === b.search;
}

/** Drives the in-host location. Exported for `SeaLink` and for the Study OS host chrome. */
export function navigateHost(href: string, mode: 'push' | 'replace' = 'push'): void {
  const next = parse(href);
  if (same(next, current)) return;
  if (mode === 'push') back.push(current);
  current = next;
  emit();
}

/** Returns to the root screen and drops the trail. Used when the host switches panes. */
export function resetHostLocation(): void {
  back.length = 0;
  if (same(current, ROOT)) return;
  current = ROOT;
  emit();
}

/** True when there is somewhere to go back to — the host renders its back control on this. */
export function hostCanGoBack(): boolean {
  return back.length > 0;
}

/**
 * The current location, outside React. This is the same object `useHostLocation` hands to
 * `useSyncExternalStore`, so a test that reads it is reading exactly what the surface sees.
 */
export function getHostLocation(): HostLocation {
  return current;
}

/** Steps back one entry, or does nothing at the root. Shared with `useRouter().back`. */
export function goBackHost(): void {
  const previous = back.pop();
  if (!previous) return;
  current = previous;
  emit();
}

/**
 * An href this surface can serve itself. Anything absolute (`http:`, `mailto:`) belongs to
 * the outside world and is left to the shell's own external-link policy; `//host/path` is
 * protocol-relative and is therefore absolute too, which a bare `startsWith('/')` misses.
 */
export function isInternalHref(href: string | undefined): href is string {
  return typeof href === 'string' && href.startsWith('/') && !href.startsWith('//');
}

/** The shape of a link activation, kept event-library-free so it is testable in node. */
export type LinkActivation = {
  href: string | undefined;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
};

/**
 * `ignore`   — leave the event alone; the browser's default action stands.
 * `suppress` — cancel the default, navigate nothing.
 * `navigate` — cancel the default and push the href into the in-host location.
 *
 * This is a function rather than three `if`s inside the component because it is the whole
 * of the repaired behaviour, and the repair is only meaningful if it can be falsified: for
 * a plain primary click on an internal href it must NEVER answer `ignore`, because `ignore`
 * is precisely what destroyed the desk on 2026-09-05.
 */
export function decideLinkActivation(activation: LinkActivation): 'ignore' | 'suppress' | 'navigate' {
  // A call site that already handled the click keeps its meaning — several adopted cards
  // pass `onClick` INSTEAD of an href precisely so they can open a modal.
  if (activation.defaultPrevented) return 'ignore';
  if (!isInternalHref(activation.href)) return 'ignore';
  // Modifier and non-primary clicks are the user asking for a new window or a copied link.
  // There is no second window to open here, but letting the default stand would navigate
  // this renderer, so they are cancelled rather than followed.
  if (
    activation.button !== 0 ||
    activation.metaKey ||
    activation.ctrlKey ||
    activation.shiftKey ||
    activation.altKey
  ) {
    return 'suppress';
  }
  return 'navigate';
}

/** Subscribe-and-read for Study OS code outside the adopted tree. */
export function useHostLocation(): HostLocation {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useRouter() {
  const push = useCallback((href: string) => navigateHost(href, 'push'), []);
  const replace = useCallback((href: string) => navigateHost(href, 'replace'), []);
  return {
    push,
    replace,
    /**
     * In-host history only. `window.history.back()` would move the Study OS shell out from
     * under this surface, which is the bug this file was rewritten to stop.
     */
    back: useCallback(() => goBackHost(), []),
    /**
     * Upstream's `forward` is a shell control with no in-host meaning; a no-op is honest
     * here, where `window.history.forward()` would leave the surface entirely.
     */
    forward: useCallback(() => {
      /* No in-host forward stack: `back` discards the trail ahead of it by design. */
    }, []),
    /**
     * A re-notify, not `window.location.reload()` — reloading the renderer would restart
     * the whole desktop to refresh one pane.
     */
    refresh: useCallback(() => emit(), []),
  };
}

export function usePathname(): string {
  return useHostLocation().pathname;
}

export function useSearchParams(): URLSearchParams {
  const search = useHostLocation().search;
  // Memoised on `search`, as the previous version was: adopted call sites close over this
  // instance inside effects and handlers, and a fresh object every render would make any
  // dependency on it churn. Identity changes exactly when the query string does.
  return useMemo(() => new URLSearchParams(search), [search]);
}
