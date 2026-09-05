/**
 * STUDY OS SUBSTITUTION — replaces seanime-web's `components/shared/sea-link.tsx`.
 *
 * Upstream renders `@tanstack/react-router`'s `<Link>`, which throws outside a
 * RouterProvider. The Media workspace is mounted as a *section inside* the Study OS
 * desktop shell, which owns navigation and has no React router.
 *
 * ── 2026-09-05: this stopped being a plain anchor, because a plain anchor DESTROYED the desk.
 *
 * The previous version rendered `<a href="/entry?id=…">` and let the browser have it, on the
 * recorded grounds that "the entry surface is not adopted until Phase 3". Phase 3 completed
 * 2026-07-28. What actually happened on a click was a top-level navigation of the Electron
 * renderer: measured live 2026-09-05, one trusted click on a library card took
 * `location.href` to `http://localhost:5174/entry?id=102883`, unmounted `#media-workspace`,
 * left `.fwin` count at **0** — every window on the desk gone — and re-ran first-run consent.
 *
 * So an internal href is now handed to `lib/navigation.ts`'s in-host location instead.
 *
 * The anchor and its `href` are KEPT rather than swapped for a button: it is what makes the
 * card focusable, gives it a link role, and lets the middle/modifier click below stay
 * meaningful. What changes is only who handles the default action.
 *
 * Whole-file replacement, not an edit — see `vendor/seanime-web/ADOPTION.md`.
 */
import { cn } from '@/components/ui/core/styling';
import { decideLinkActivation, navigateHost } from '@/lib/navigation';
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
    onClick,
    // Accepted and ignored: upstream's preload knobs have no meaning without a router.
    resetScroll: _resetScroll,
    bypassEntryPreloadBudget: _bypassEntryPreloadBudget,
    warmEntryOnViewport: _warmEntryOnViewport,
    ...rest
  } = props;

  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      // The decision itself lives in `lib/navigation.ts` so it can be falsified in a unit
      // test without a DOM; this component only carries it out.
      const decision = decideLinkActivation({
        href,
        button: event.button,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        defaultPrevented: event.defaultPrevented,
      });
      if (decision === 'ignore') return;
      event.preventDefault();
      if (decision === 'navigate') navigateHost(href as string, 'push');
    },
    [href, onClick],
  );

  return (
    <a
      ref={ref}
      href={href}
      className={cn('cursor-pointer', className)}
      onClick={handleClick}
      {...rest}
    >
      {children}
    </a>
  );
});

SeaLink.displayName = 'SeaLink';
