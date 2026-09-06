import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Toaster } from 'sonner';
import { useT } from '../renderer/i18n';
import './seanimeToastHost.css';

/** Height of `.os-taskbar` plus a gutter. Also applied below Sonner's mobile breakpoint. */
const TASKBAR_CLEARANCE = '64px';

function NotificationLayer(): React.ReactElement {
  const { t } = useT();
  return (
    <Toaster
      className="seanime-toast-host"
      theme="dark"
      position="bottom-right"
      offset={{ bottom: TASKBAR_CLEARANCE, right: '16px' }}
      mobileOffset={{ bottom: TASKBAR_CLEARANCE, right: '16px', left: '16px' }}
      closeButton
      containerAriaLabel={t('mediaWorkspace.notifications')}
      toastOptions={{ closeButtonAriaLabel: t('common.close') }}
    />
  );
}

/** Never throws, and never assumes the preload bridge is present (it is not in tests). */
function reportLayerFailure(error: unknown, componentStack?: string): void {
  try {
    const detail = error instanceof Error ? error.stack || error.message : String(error);
    void window.api?.logRendererError?.({
      subsystem: 'renderer',
      operation: 'mediaNotificationLayer',
      detail: componentStack ? `${detail}\n${componentStack}` : detail,
    })?.catch(() => {
      /* logging must never throw */
    });
  } catch {
    /* logging must never throw */
  }
}

/**
 * The notification layer's own crash guard.
 *
 * Boss audit F2: this root is created outside the app tree, so it sits outside
 * `AppErrorBoundary` and a throw inside `Toaster` took down a root nothing
 * supervised. Reusing `AppErrorBoundary` here — the audit's suggested repair —
 * would be worse than the defect: it renders a FIXED, FULL-VIEWPORT crash screen
 * at z-index 999999 with a Reload button, so a failed toast would replace a
 * perfectly healthy application with a crash page.
 *
 * A notification layer's honest failure mode is that notifications stop
 * appearing and the reason is recorded. Rendering null does exactly that, and it
 * leaves the host element in place so the release path still finds and removes
 * it.
 */
class NotificationLayerBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    reportLayerFailure(error, info.componentStack ?? undefined);
  }

  render(): React.ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

const hosts = new Set<symbol>();
let layer: { root: Root; element: HTMLDivElement } | null = null;

/**
 * Workspace and Blanc can each mount a shell in the same document. They share one
 * notification root outside their stacking contexts. Transferring a Toaster between
 * shell subtrees unmounts it, dropping active messages and keyboard focus; retaining
 * this root until the LAST shell closes also preserves each toast's original timer.
 */
function acquireLayer(): () => void {
  const token = Symbol('media-notifications');
  hosts.add(token);
  if (!layer) {
    const element = document.createElement('div');
    element.dataset.mediaNotifications = '';
    document.body.append(element);
    try {
      const root = createRoot(element);
      root.render(
        <NotificationLayerBoundary>
          <NotificationLayer />
        </NotificationLayerBoundary>,
      );
      layer = { root, element };
    } catch (error) {
      // Creating the root is the one step no boundary can guard, and it runs
      // inside the CALLER's mount effect — an exception here propagates into the
      // shell's own commit and takes the shell down with it. A shell must
      // survive its notifications failing. `layer` stays null, so the next shell
      // to mount simply tries again.
      element.remove();
      reportLayerFailure(error);
    }
  }
  return () => {
    if (!hosts.delete(token)) return;
    // Cleanup runs during a parent React commit. Unmounting another root there is
    // unsafe; defer until it finishes, and let a StrictMode replay reclaim the layer.
    queueMicrotask(() => {
      if (hosts.size || !layer) return;
      const released = layer;
      layer = null;
      released.root.unmount();
      released.element.remove();
    });
  };
}

/** The adopted request handlers emit Sonner messages; without this host they vanish. */
export default function SeanimeToastHost(): null {
  React.useEffect(acquireLayer, []);
  return null;
}
