/**
 * Liquid Workplace — L2 scaffold.
 *
 * §5.2 asks for "orientation spine, canvas, rails, and command sheet slots".
 * This is that: one grid that an application fills, so a rail, a toolbar, an
 * inspector and a dock agree on geometry without each app re-deciding it.
 *
 * Three decisions worth knowing before you use it:
 *
 * 1. EVERY SLOT IS OPTIONAL AND AN ABSENT SLOT RENDERS NOTHING. Not an empty
 *    rail, not a 0px grid track with a border. Rubric category 8 is honest
 *    states, and chrome that exists because the scaffold always draws it is the
 *    cheapest way to fail it.
 * 2. DOM ORDER IS KEYBOARD ORDER. Toolbar, rail, canvas, inspector, dock — the
 *    order someone tabbing through the app should meet them. Visual placement
 *    is grid areas only, so a responsive reflow never reorders the tab ring.
 *    §2.4: moving a control must not cost its keyboard route.
 * 3. THE BREAKPOINT IS THE SCAFFOLD'S OWN WIDTH, NOT THE WINDOW'S. A pop-out at
 *    520px and a docked panel at 520px inside a 3440px monitor are the same
 *    layout problem. `data-width` is `compact | medium | wide`; the CSS reflows
 *    off it and a test can assert the contract without a real window.
 */
import {
  useEffect,
  useRef,
  useState,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from 'react';

/** Scaffold-width classes. Thresholds are the scaffold's own content box, in px. */
export const LIQUID_WIDTH_CLASSES = ['compact', 'medium', 'wide'] as const;
export type LiquidWidthClass = (typeof LIQUID_WIDTH_CLASSES)[number];

/** Below `medium` the rail collapses to icons; below that it leaves the spine entirely. */
export const LIQUID_BREAKPOINTS = { medium: 720, wide: 1120 } as const;

export function widthClassFor(width: number): LiquidWidthClass {
  if (width >= LIQUID_BREAKPOINTS.wide) return 'wide';
  if (width >= LIQUID_BREAKPOINTS.medium) return 'medium';
  return 'compact';
}

type ScaffoldProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  as?: ElementType;
  /** Persistent navigation. Rendered in a `nav` landmark. */
  rail?: ReactNode;
  /** Contextual tools for whatever the canvas currently holds. */
  toolbar?: ReactNode;
  /** The work itself. The only slot that is not chrome. */
  children?: ReactNode;
  /** Temporary inspector. Rendered in a `complementary` landmark. */
  inspector?: ReactNode;
  /** Transport / command sheet pinned to the foot of the spine. */
  dock?: ReactNode;
  /** Icons-only rail. Ignored when there is no rail. */
  railCollapsed?: boolean;
  /**
   * Force a width class instead of measuring. For a test, a fixed-layout
   * preview, or a caller that already owns a size observer.
   */
  widthClass?: LiquidWidthClass;
  /** Accessible name for the rail landmark, when a rail is present. */
  railLabel?: string;
  /** Accessible name for the inspector landmark, when one is present. */
  inspectorLabel?: string;
};

/**
 * Observe the scaffold's own width. Returns `null` until something is measured,
 * so the first paint never claims a breakpoint it has not seen — reporting
 * `compact` for one frame is how a wide layout flashes a collapsed rail.
 */
function useMeasuredWidthClass(
  ref: React.RefObject<HTMLElement | null>,
  enabled: boolean,
): LiquidWidthClass | null {
  const [cls, setCls] = useState<LiquidWidthClass | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const apply = (width: number) => {
      if (width > 0) setCls(widthClassFor(width));
    };
    apply(el.getBoundingClientRect().width);
    // Not every host provides one (jsdom, older embedders). Without it the
    // scaffold stays on its measured-once value rather than throwing.
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) apply(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, enabled]);
  return cls;
}

export function LiquidAppScaffold({
  as: As = 'div',
  rail,
  toolbar,
  children,
  inspector,
  dock,
  railCollapsed,
  widthClass,
  railLabel,
  inspectorLabel,
  className,
  ...rest
}: ScaffoldProps) {
  const ref = useRef<HTMLElement | null>(null);
  const measured = useMeasuredWidthClass(ref, widthClass === undefined);
  const effective = widthClass ?? measured ?? 'wide';

  // A rail that is collapsed by the caller, or squeezed out by the breakpoint.
  // Below `medium` the spine has no room for one at all, and the app is
  // expected to surface the same routes from its dock or toolbar.
  const railHidden = effective === 'compact';
  const collapsed = Boolean(railCollapsed) || effective === 'medium';

  return (
    <As
      ref={ref}
      className={['lq-scaffold', className].filter(Boolean).join(' ')}
      data-width={effective}
      data-has-rail={rail && !railHidden ? 'true' : undefined}
      data-has-toolbar={toolbar ? 'true' : undefined}
      data-has-inspector={inspector ? 'true' : undefined}
      data-has-dock={dock ? 'true' : undefined}
      data-rail-collapsed={rail && !railHidden && collapsed ? 'true' : undefined}
      {...rest}
    >
      {toolbar ? (
        <div className="lq-scaffold-toolbar lq-liquid" data-lq-role="liquid" data-highlight="true">
          {toolbar}
        </div>
      ) : null}
      {rail && !railHidden ? (
        <nav className="lq-scaffold-rail lq-liquid" data-lq-role="liquid" aria-label={railLabel}>
          {rail}
        </nav>
      ) : null}
      <div className="lq-scaffold-canvas lq-work" data-lq-role="work">
        {children}
      </div>
      {inspector ? (
        <aside
          className="lq-scaffold-inspector lq-liquid"
          data-lq-role="liquid"
          aria-label={inspectorLabel}
        >
          {inspector}
        </aside>
      ) : null}
      {dock ? (
        <div className="lq-scaffold-dock lq-liquid" data-lq-role="liquid" data-highlight="true">
          {dock}
        </div>
      ) : null}
    </As>
  );
}
