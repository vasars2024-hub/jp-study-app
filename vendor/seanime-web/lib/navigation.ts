/**
 * STUDY OS SUBSTITUTION — replaces seanime-web's `lib/navigation.ts`.
 *
 * Upstream builds these on `@tanstack/react-router`'s `useNavigate` / `useLocation`, which
 * throw ("useRouter must be used inside a <RouterProvider>") outside a router. The Media
 * workspace is a section mounted inside the Study OS desktop shell, which owns navigation
 * and has no React router.
 *
 * The exported API is kept identical so no adopted call site changes. Route pushes are
 * no-ops for now: the only routes this surface tries to reach are the anime-entry pages,
 * which are not adopted until Phase 3. When they are, this is the one file that has to
 * learn how to talk to the Study OS shell's navigation.
 *
 * Whole-file replacement, not an edit — see `vendor/seanime-web/ADOPTION.md`.
 */
import { useMemo } from 'react';

export function useRouter() {
  return {
    push: () => {
      /* Phase 2: entry routes are not adopted yet. */
    },
    replace: () => {
      /* Phase 2: entry routes are not adopted yet. */
    },
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    refresh: () => window.location.reload(),
  };
}

export function usePathname(): string {
  return typeof window === 'undefined' ? '' : window.location.pathname;
}

export function useSearchParams(): URLSearchParams {
  const search = typeof window === 'undefined' ? '' : window.location.search;
  return useMemo(() => new URLSearchParams(search), [search]);
}
