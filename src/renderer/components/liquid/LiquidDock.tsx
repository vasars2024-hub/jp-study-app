/**
 * Liquid Workplace — L2 `LiquidDock`.
 *
 * §5.2's transport / command sheet, filling `LiquidAppScaffold`'s dock slot.
 *
 * THE DOCK IS WHERE THE RAIL GOES WHEN THE SPINE RUNS OUT OF ROOM. The scaffold
 * drops the rail below `medium` and its own doc says the app "is expected to
 * surface the same routes from its dock or toolbar" — until now that was a
 * sentence in a comment with nothing implementing it, which is precisely the
 * shape of §2.2's failure: a feature removed because the window got small, with
 * a note explaining that it wasn't. Pass the rail's items as `routes` and the
 * dock carries them, so a compact window still reaches every section.
 *
 * Two further decisions:
 *
 * 1. THE ACTIONS REGION IS A `ContextToolbar`, NOT A SECOND IMPLEMENTATION. It
 *    inherits the overflow contract, the hit-target floor and the disabled-but-
 *    focusable rule for free, and a fix to one is a fix to both.
 * 2. THE ROUTES REGION SCROLLS RATHER THAN TRUNCATES. Scrolling keeps every
 *    route reachable by pointer and by keyboard (focus scrolls its own element
 *    into view); hiding the tail does not. A dock is short-lived horizontal
 *    space and an overflow menu inside one would be a menu inside a menu.
 */
import { useRef, type HTMLAttributes, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { railItemName, type RailItem } from './AdaptiveRail';
import { ContextToolbar, type ToolbarAction } from './ContextToolbar';

type LiquidDockProps = Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> & {
  /** Accessible name for the dock as a whole. */
  label: string;
  /**
   * Navigation routes surfaced here — normally the same items the rail carries,
   * passed when the scaffold has dropped the rail from the spine.
   */
  routes?: RailItem[];
  activeRouteId?: string;
  onSelectRoute?: (id: string) => void;
  /** Accessible name for the routes navigation. Required when `routes` is given. */
  routesLabel?: string;
  /** Transport / command actions. Rendered through `ContextToolbar`. */
  actions?: ToolbarAction[];
  /** Accessible name for the actions toolbar. Required when `actions` is given. */
  actionsLabel?: string;
  /** Accessible name for the actions overflow control. Required when `actions` is given. */
  overflowLabel?: string;
  /** Show action labels beside their icons. Off by default; a dock is compact. */
  showActionLabels?: boolean;
  /** Trailing readout — elapsed time, item count, sync state. */
  status?: ReactNode;
};

export function LiquidDock({
  label,
  routes,
  activeRouteId,
  onSelectRoute,
  routesLabel,
  actions,
  actionsLabel,
  overflowLabel,
  showActionLabels,
  status,
  className,
  ...rest
}: LiquidDockProps) {
  const routesRef = useRef<HTMLElement | null>(null);
  const hasRoutes = Boolean(routes && routes.length > 0);
  const hasActions = Boolean(actions && actions.length > 0);

  const onRoutesKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    // Left/Right here, not Up/Down: the dock lays its routes out horizontally,
    // and an arrow key that does not match the visible direction is a worse
    // affordance than none at all.
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const buttons = Array.from(routesRef.current?.querySelectorAll<HTMLElement>('.lq-dock-route') ?? []);
    if (buttons.length === 0) return;
    const index = buttons.indexOf(document.activeElement as HTMLElement);
    if (index < 0) return;
    event.preventDefault();
    if (event.key === 'ArrowRight') buttons[(index + 1) % buttons.length]?.focus();
    else if (event.key === 'ArrowLeft') buttons[(index - 1 + buttons.length) % buttons.length]?.focus();
    else if (event.key === 'Home') buttons[0]?.focus();
    else buttons[buttons.length - 1]?.focus();
  };

  return (
    <div
      className={['lq-dock', className].filter(Boolean).join(' ')}
      role="group"
      aria-label={label}
      data-has-routes={hasRoutes ? 'true' : undefined}
      data-has-actions={hasActions ? 'true' : undefined}
      {...rest}
    >
      {hasRoutes ? (
        <nav
          className="lq-dock-routes"
          ref={routesRef}
          aria-label={routesLabel}
          onKeyDown={onRoutesKeyDown}
        >
          {routes!.map((route) => {
            const active = route.id === activeRouteId;
            return (
              <button
                key={route.id}
                type="button"
                className="lq-dock-route"
                data-item-id={route.id}
                data-active={active ? 'true' : undefined}
                aria-current={active ? 'page' : undefined}
                aria-disabled={route.disabled ? 'true' : undefined}
                aria-label={railItemName(route)}
                title={route.disabled && route.disabledReason ? route.disabledReason : route.label}
                onClick={() => {
                  if (route.disabled) return;
                  onSelectRoute?.(route.id);
                }}
              >
                <span className="lq-dock-route-icon" aria-hidden="true">
                  {route.icon ?? Array.from(route.label)[0] ?? '?'}
                </span>
                <span className="lq-dock-route-label" aria-hidden="true">
                  {route.label}
                </span>
              </button>
            );
          })}
        </nav>
      ) : null}

      {hasActions ? (
        <ContextToolbar
          className="lq-dock-actions"
          actions={actions!}
          label={actionsLabel ?? label}
          overflowLabel={overflowLabel ?? label}
          showLabels={showActionLabels}
        />
      ) : null}

      {status ? <div className="lq-dock-status">{status}</div> : null}
    </div>
  );
}
