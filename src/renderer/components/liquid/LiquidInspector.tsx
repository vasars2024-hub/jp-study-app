/**
 * Liquid Workplace — L2 `LiquidInspector`.
 *
 * §5.2's temporary inspector, filling `LiquidAppScaffold`'s inspector slot.
 *
 * ONE CONTRACT ABOVE ALL: AN INSPECTOR THAT OPENS CAN BE CLOSED. `onClose` and
 * `closeLabel` are required props, not options — CLAUDE.md's cross-surface rule
 * is that every enable/open/add flow needs an intentional disable/close/remove
 * path, and an inspector is the surface where that is forgotten, because it
 * looks harmless sitting beside the canvas. There are three routes out and all
 * three are the same call: the close control, Escape, and the caller's own
 * state.
 *
 * Focus, which is the half people skip:
 *
 * - opening moves focus to the panel heading (`tabindex="-1"`), so a keyboard
 *   user is inside the thing that just appeared rather than wherever they were;
 * - closing returns focus to `returnFocusTo` — otherwise focus falls to
 *   `document.body` and the next Tab starts the window over from the top.
 *
 * The scaffold owns the `complementary` landmark and its accessible name, so
 * this renders no landmark of its own; `titleId` is exported on the heading for
 * a caller wiring `inspectorLabel` or an `aria-labelledby` of its own.
 */
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';

type LiquidInspectorProps = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  title: string;
  /** Required. An inspector with no way out is the defect this primitive exists to prevent. */
  onClose: () => void;
  /** Accessible name for the close control. Required; primitives carry no English of their own. */
  closeLabel: string;
  children?: ReactNode;
  /** Pinned foot of the panel — apply/revert, a count, a link out. */
  footer?: ReactNode;
  /** Focus goes back here when the inspector closes. */
  returnFocusTo?: RefObject<HTMLElement | null>;
  /** Move focus to the heading on open. On by default; turn it off for a panel that is always present. */
  autoFocus?: boolean;
};

export function LiquidInspector({
  title,
  onClose,
  closeLabel,
  children,
  footer,
  returnFocusTo,
  autoFocus = true,
  className,
  ...rest
}: LiquidInspectorProps) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!autoFocus) return;
    headingRef.current?.focus();
  }, [autoFocus]);

  const close = useCallback(() => {
    // Return focus BEFORE the caller unmounts us: after unmount there is no
    // element left to move focus from, and React will have dropped the ref.
    returnFocusTo?.current?.focus();
    onClose();
  }, [onClose, returnFocusTo]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    close();
  };

  return (
    <div
      className={['lq-inspector', className].filter(Boolean).join(' ')}
      onKeyDown={onKeyDown}
      {...rest}
    >
      <div className="lq-inspector-head">
        <h2 className="lq-inspector-title" id={titleId} ref={headingRef} tabIndex={-1}>
          {title}
        </h2>
        <button
          type="button"
          className="lq-inspector-close"
          aria-label={closeLabel}
          title={closeLabel}
          onClick={close}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="lq-inspector-body">{children}</div>
      {footer ? <div className="lq-inspector-foot">{footer}</div> : null}
    </div>
  );
}
