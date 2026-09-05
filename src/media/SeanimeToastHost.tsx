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
    layer = { root: createRoot(element), element };
    layer.root.render(<NotificationLayer />);
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
