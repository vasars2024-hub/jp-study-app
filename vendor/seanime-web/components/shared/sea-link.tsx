/**
 * STUDY OS SUBSTITUTION — replaces seanime-web's `components/shared/sea-link.tsx`.
 *
 * Upstream renders `@tanstack/react-router`'s `<Link>`, which throws outside a
 * RouterProvider. The Media workspace is mounted as a *section inside* the Study OS
 * desktop shell, which owns navigation and has no React router, so this renders a plain
 * anchor and drops the router dependency entirely — it was reachable from this surface
 * through this one file.
 *
 * Route preloading is deliberately dropped too: it exists to warm entry pages, and the
 * entry surface is not adopted until Phase 3.
 *
 * Whole-file replacement, not an edit — see `vendor/seanime-web/ADOPTION.md`.
 */
import { cn } from '@/components/ui/core/styling';
import React from 'react';

type SeaLinkProps = React.ComponentPropsWithRef<'a'> & {
  href: string | undefined;
  resetScroll?: boolean;
  bypassEntryPreloadBudget?: boolean;
  warmEntryOnViewport?: boolean;
};

export const SeaLink = React.forwardRef<HTMLAnchorElement, SeaLinkProps>((props, ref) => {
  const {
    href,
    children,
    className,
    // Accepted and ignored: upstream's preload knobs have no meaning without a router.
    resetScroll: _resetScroll,
    bypassEntryPreloadBudget: _bypassEntryPreloadBudget,
    warmEntryOnViewport: _warmEntryOnViewport,
    ...rest
  } = props;

  return (
    <a ref={ref} href={href} className={cn('cursor-pointer', className)} {...rest}>
      {children}
    </a>
  );
});

SeaLink.displayName = 'SeaLink';
