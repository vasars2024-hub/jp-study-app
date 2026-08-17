/**
 * Liquid Workplace — L2 `AdaptiveRail`.
 *
 * §5.2's persistent navigation, filling `LiquidAppScaffold`'s rail slot. The
 * scaffold already owns the `nav` landmark and its accessible name, so this
 * renders the list only — two nested `nav`s would give assistive tech two
 * navigations where the app has one.
 *
 * Three decisions worth knowing before you use it:
 *
 * 1. COLLAPSING HIDES THE LABEL, NEVER THE NAME. At `medium` the scaffold sets
 *    `data-rail-collapsed`; every item then carries `aria-label` and `title`
 *    with the same words the expanded rail shows. An icons-only rail whose
 *    buttons have no accessible name is the single commonest way rubric
 *    category 1 is lost, and it looks fine on screen.
 * 2. AN ITEM WITH NO ICON STILL RENDERS SOMETHING when collapsed — the label's
 *    first grapheme, taken with `Array.from` so a Japanese or emoji initial is
 *    not a broken half-surrogate. An empty 52px button is not an honest state.
 * 3. A DISABLED ITEM STAYS FOCUSABLE (`aria-disabled`, not `disabled`), so the
 *    reason it is dead can be reached by keyboard. A `disabled` button drops out
 *    of the tab ring and takes its own explanation with it.
 *
 * Arrow keys move focus within the rail; Tab order is untouched, so the rail is
 * still one stop-per-item in DOM order (§2.4).
 */
import { useRef, type HTMLAttributes, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';

export type RailItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Count or short status shown beside the label; folded into the accessible name. */
  badge?: number | string;
  disabled?: boolean;
  /** Why it is unavailable. Surfaced as `title` and folded into the accessible name. */
  disabledReason?: string;
};

export type RailGroup = {
  id: string;
  /** Optional heading. Groups with no label are separated visually only. */
  label?: string;
  items: RailItem[];
};

type AdaptiveRailProps = Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> & {
  /** Flat list, or grouped. A flat list is wrapped in one unlabelled group. */
  items?: RailItem[];
  groups?: RailGroup[];
  activeId?: string;
  onSelect?: (id: string) => void;
  /**
   * Icons-only. Normally left undefined and driven by the scaffold's
   * `data-rail-collapsed`; pass it when the rail is used outside a scaffold.
   */
  collapsed?: boolean;
  /** Rendered above the first group when expanded. Hidden (not removed) when collapsed. */
  heading?: string;
};

/**
 * The accessible name. Label, plus the badge and the disabled reason, because
 * `aria-label` replaces the element's text wholesale — anything left out of this
 * string is invisible to a screen reader in collapsed mode.
 */
export function railItemName(item: RailItem): string {
  const parts = [item.label];
  if (item.badge !== undefined && item.badge !== '') parts.push(`(${item.badge})`);
  if (item.disabled && item.disabledReason) parts.push(`— ${item.disabledReason}`);
  return parts.join(' ');
}

export function AdaptiveRail({
  items,
  groups,
  activeId,
  onSelect,
  collapsed,
  heading,
  className,
  ...rest
}: AdaptiveRailProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const resolved: RailGroup[] = groups ?? [{ id: 'default', items: items ?? [] }];

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const buttons = Array.from(ref.current?.querySelectorAll<HTMLElement>('.lq-rail-item') ?? []);
    if (buttons.length === 0) return;
    const index = buttons.indexOf(document.activeElement as HTMLElement);
    if (index < 0) return;
    event.preventDefault();
    if (event.key === 'ArrowDown') buttons[(index + 1) % buttons.length]?.focus();
    else if (event.key === 'ArrowUp') buttons[(index - 1 + buttons.length) % buttons.length]?.focus();
    else if (event.key === 'Home') buttons[0]?.focus();
    else buttons[buttons.length - 1]?.focus();
  };

  return (
    <div
      ref={ref}
      className={['lq-rail', className].filter(Boolean).join(' ')}
      data-collapsed={collapsed ? 'true' : undefined}
      onKeyDown={onKeyDown}
      {...rest}
    >
      {heading ? (
        <div className="lq-rail-heading" data-lq-collapsible="true">
          {heading}
        </div>
      ) : null}
      {resolved.map((group) => (
        <div
          key={group.id}
          className="lq-rail-group"
          role={group.label ? 'group' : undefined}
          aria-label={group.label}
        >
          {group.label ? (
            // The heading is decorative once `role=group`/`aria-label` carries
            // the same words — announcing it twice is noise, and it is the text
            // that disappears when the rail collapses, not the grouping.
            <div className="lq-rail-group-label" aria-hidden="true">
              {group.label}
            </div>
          ) : null}
          {group.items.map((item) => {
            const active = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                className="lq-rail-item"
                data-item-id={item.id}
                data-active={active ? 'true' : undefined}
                aria-current={active ? 'page' : undefined}
                aria-disabled={item.disabled ? 'true' : undefined}
                aria-label={railItemName(item)}
                title={item.disabled && item.disabledReason ? item.disabledReason : item.label}
                onClick={() => {
                  if (item.disabled) return;
                  onSelect?.(item.id);
                }}
              >
                <span className="lq-rail-icon" aria-hidden="true">
                  {item.icon ?? Array.from(item.label)[0] ?? '?'}
                </span>
                <span className="lq-rail-label" aria-hidden="true">
                  {item.label}
                </span>
                {item.badge !== undefined && item.badge !== '' ? (
                  <span className="lq-rail-badge" aria-hidden="true">
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
