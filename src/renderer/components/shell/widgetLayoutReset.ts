/**
 * Widgets ▸ "Reset workspace layout", made recoverable.
 *
 * It used to be `setWidgets([])` on a single click: every widget on the desktop,
 * with its size, position and settings, gone with no question asked and no way
 * back (round-2 audit). The reset now asks first, and then offers Undo on the
 * shell's toast, which restores the exact previous list.
 *
 * Pure orchestration with its effects injected, so the whole flow is testable
 * without mounting the desktop.
 */
import type { WidgetSnapshot } from '../../../shared/desktop';

export interface WidgetResetDeps {
  /** The widgets on the desktop right now. */
  current: readonly WidgetSnapshot[];
  confirm: (opts: {
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    danger: boolean;
  }) => Promise<boolean>;
  /** Replace the widget list; receives an updater like `setState`. */
  apply: (update: (prev: WidgetSnapshot[]) => WidgetSnapshot[]) => void;
  toast: (message: string, kind?: string, action?: { label: string; run: () => void }) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

/** Returns true when the layout was reset. */
export async function resetWidgetLayoutWithUndo(deps: WidgetResetDeps): Promise<boolean> {
  const previous = deps.current.map((w) => ({ ...w }));
  if (previous.length === 0) return false;
  const ok = await deps.confirm({
    title: deps.t('shell.widgets.reset.title'),
    message: deps.t('shell.widgets.reset.message', { count: previous.length }),
    confirmLabel: deps.t('shell.widgets.reset.confirm'),
    cancelLabel: deps.t('common.cancel'),
    danger: true,
  });
  if (!ok) return false;
  deps.apply(() => []);
  deps.toast(deps.t('shell.widgets.reset.done'), 'ok', {
    label: deps.t('shell.undo'),
    run: () => {
      // Anything added after the reset stays; the old layout comes back around it.
      deps.apply((now) => [...previous, ...now.filter((w) => !previous.some((p) => p.id === w.id))]);
      deps.toast(deps.t('shell.widgets.reset.restored'));
    },
  });
  return true;
}
