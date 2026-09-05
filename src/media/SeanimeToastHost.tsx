/**
 * The notification layer the adopted Seanime surface has always written to and never had.
 *
 * `sonner`'s `toast()` is a no-op unless a `<Toaster />` is mounted in the same document:
 * the call pushes onto a module-level observer, and with nothing subscribed the message is
 * dropped. Measured 2026-09-05: **174 `toast.*` call sites across 45 files** under
 * `vendor/seanime-web/`, and `Toaster` appeared **nowhere** in this repository. Every one
 * of them — including `useServerMutation`'s own `onError`, which is the only place an
 * adopted request's failure is ever reported — rendered nothing. A 500 from
 * `playback-manager/play` reached the user as silence.
 *
 * ## Why this is not simply `<Toaster />` inside the shell
 *
 * `MediaSurfaceShell`'s own header states that mounting two shells in one window is
 * expected and safe (the workspace overlay and Blanc's toolbox player). Two `<Toaster />`s
 * both subscribe to the same observer, so every message would appear twice. The claim
 * registry below makes the FIRST shell to mount the owner and the others render nothing;
 * when the owner unmounts the claim passes to the next, so closing the workspace while
 * Blanc's player is open does not take the notification layer with it.
 *
 * ## Why a portal, rather than a sibling node
 *
 * The workspace overlay (`.seanime-host`) carries `z-index: 9999` and therefore its own
 * stacking context, which would clamp a `position: fixed` descendant beneath the taskbar
 * (`z-index: 200000`, measured live). Portalling to `document.body` also keeps this out of
 * the shell's layout entirely, so no flex/grid parent gains an item. The bottom offset
 * clears the 48px taskbar rather than covering it.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { Toaster } from 'sonner';
import { useT } from '../renderer/i18n';
import './seanimeToastHost.css';

/** Height of `.os-taskbar` plus a gutter, so a toast never sits on top of it. */
const TASKBAR_CLEARANCE = '64px';

/** Claim order decides the owner: first in, first to render. */
const claimants: symbol[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  // Copied before iterating: a listener that unsubscribes in response would otherwise
  // mutate the set mid-iteration.
  for (const listener of [...listeners]) listener();
}

/** Register a candidate host. The returned release is idempotent (StrictMode). */
export function claimSeanimeToastHost(token: symbol): () => void {
  claimants.push(token);
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const index = claimants.indexOf(token);
    if (index >= 0) claimants.splice(index, 1);
    emit();
  };
}

/** Which claim currently owns the notification layer, or `null` when none does. */
export function seanimeToastHostOwner(): symbol | null {
  return claimants[0] ?? null;
}

export function subscribeSeanimeToastHost(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only reset; the registry is module state and would otherwise leak across cases. */
export function resetSeanimeToastHostForTests(): void {
  claimants.length = 0;
  listeners.clear();
}

export default function SeanimeToastHost(): React.ReactElement | null {
  const { t } = useT();
  const tokenRef = React.useRef<symbol | null>(null);
  if (tokenRef.current === null) tokenRef.current = Symbol('seanime-toast-host');
  const token = tokenRef.current;

  const owner = React.useSyncExternalStore(
    subscribeSeanimeToastHost,
    seanimeToastHostOwner,
    () => null,
  );

  React.useEffect(() => claimSeanimeToastHost(token), [token]);

  if (owner !== token) return null;
  return createPortal(
    <Toaster
      className="seanime-toast-host"
      theme="dark"
      position="bottom-right"
      offset={{ bottom: TASKBAR_CLEARANCE, right: '16px' }}
      mobileOffset={{ bottom: TASKBAR_CLEARANCE, right: '16px', left: '16px' }}
      closeButton
      containerAriaLabel={t('mediaWorkspace.notifications')}
      toastOptions={{ closeButtonAriaLabel: t('common.close') }}
    />,
    document.body,
  );
}
