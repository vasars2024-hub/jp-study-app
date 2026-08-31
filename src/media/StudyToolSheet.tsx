/**
 * A temporary tool surface: the thing a bottom-bar category opens.
 *
 * One is open at a time, it closes on Escape and on a click outside, and it returns
 * focus to the button that opened it. That last part is why this is a component and not
 * a `<details>` — the prompt's accessibility rule is that focus handling around a
 * temporary surface must be predictable, and `<details>` leaves focus wherever the
 * click landed.
 *
 * It renders ABOVE the bar rather than inside it, so opening a sheet never changes the
 * bar's height — the height the subtitle band is positioned against.
 */
import React from 'react';
import { useT } from '../renderer/i18n';

export default function StudyToolSheet({
  id,
  titleKey,
  onClose,
  children,
}: {
  id: string;
  titleKey: string;
  onClose: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  const { t } = useT();
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    // Focus the first control rather than the container: a sheet of six checkboxes is
    // not something a screen reader user should have to tab into after opening it.
    const focusable = node.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus({ preventScroll: true });
    return undefined;
  }, []);

  React.useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const node = ref.current;
      if (!node || !(event.target instanceof Node)) return;
      if (node.contains(event.target)) return;
      // The opening button is outside the sheet; its own click toggles, so closing here
      // as well would open-and-close in one press. `data-study-sheet-toggle` marks it.
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-study-sheet-toggle]')) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // Stops here: a sheet is the innermost temporary surface, so it must consume
      // Escape before the workspace's contextual dismissal or the host's close.
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      id={id}
      className="study-tool-sheet"
      role="dialog"
      aria-label={t(titleKey)}
      data-study-sheet={id}
    >
      <header className="study-tool-sheet-head">
        <strong>{t(titleKey)}</strong>
        <button
          type="button"
          className="study-tool-sheet-close"
          aria-label={t('common.close')}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className="study-tool-sheet-body">{children}</div>
    </div>
  );
}

/** A titled group inside a sheet — the "organise by task" rule made structural. */
export function StudyToolGroup({
  labelKey,
  children,
}: {
  labelKey: string;
  children: React.ReactNode;
}): React.ReactElement {
  const { t } = useT();
  return (
    <section className="study-tool-group" role="group" aria-label={t(labelKey)}>
      <span className="study-tool-group-legend">{t(labelKey)}</span>
      <div className="study-tool-group-body">{children}</div>
    </section>
  );
}
