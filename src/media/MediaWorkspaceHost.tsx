/**
 * Mount point for the MEDIA workspace, following the Phase-1 dev-panel pattern exactly:
 * it renders nothing unless the main process reports a non-`disabled` sidecar, so a
 * normal build never shows it and `DesktopShell.tsx`, the desktop grid, the dragging
 * layer and the taskbar are all untouched.
 *
 * The adopted surface is loaded with React.lazy so none of the 46 adopted packages are
 * in the boot path — with the flag off, the app's startup bundle is unchanged.
 *
 * Not translated, per ADR-003's time-boxed exemption: the Media workspace ships
 * English-only through Phases 2-3, and the EN/JA/ZH/RU sweep is a hard exit gate on
 * Phase 4.
 */
import React, { Suspense, useEffect, useState } from 'react';
import type { SeanimeConnection, SeanimeStatus } from '../shared/seanime';
import { bootstrapSeanimeConnection } from './seanimeBootstrap';

const MediaWorkspace = React.lazy(() => import('./MediaWorkspace'));

export default function MediaWorkspaceHost(): React.ReactElement | null {
  const [status, setStatus] = useState<SeanimeStatus | null>(null);
  const [open, setOpen] = useState(false);
  // Deliberately resolved BEFORE React.lazy is allowed to pull in the adopted bundle:
  // the auth token has to be in localStorage before those modules evaluate. See
  // seanimeBootstrap.ts.
  const [conn, setConn] = useState<SeanimeConnection | null>(null);

  useEffect(() => {
    if (!open || conn) return;
    void bootstrapSeanimeConnection()
      .then(setConn)
      .catch(() => setConn({ baseUrl: '', token: '' }));
  }, [open, conn]);

  useEffect(() => {
    // Same guard as SeanimeDevPanel: under Vite HMR the renderer can reload while an
    // older main process is still live, and an unguarded invoke becomes an unhandled
    // rejection in the app's error boundary.
    if (typeof window.api?.seanimeStatus !== 'function') return;
    void window.api.seanimeStatus().then(setStatus).catch(() => setStatus(null));
    return window.api.onSeanimeStatus(setStatus);
  }, []);

  if (!status || status.kind === 'disabled') return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          right: 12,
          bottom: 190,
          zIndex: 9998,
          padding: '6px 10px',
          borderRadius: 8,
          border: '1px solid var(--border, #2d2b37)',
          background: 'var(--panel-2, #272433)',
          color: 'var(--text, #f5f4f7)',
          font: '12px system-ui',
          cursor: 'pointer',
        }}
      >
        Media workspace
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'var(--bg, #0d0c12)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 10px',
          borderBottom: '1px solid var(--border, #2d2b37)',
          font: '12px system-ui',
          color: 'var(--muted, #9d97a6)',
          flex: '0 0 auto',
        }}
      >
        <strong style={{ color: 'var(--text, #f5f4f7)' }}>MEDIA</strong>
        <span>adopted library · sidecar {status.kind}</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            marginLeft: 'auto',
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid var(--border, #2d2b37)',
            background: 'transparent',
            color: 'var(--text, #f5f4f7)',
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>
      <div style={{ flex: '1 1 auto', minHeight: 0 }}>
        {!conn ? (
          <p style={{ padding: 24, color: 'var(--muted, #9d97a6)' }}>Connecting…</p>
        ) : !conn.baseUrl ? (
          <p style={{ padding: 24, color: 'var(--muted, #9d97a6)' }}>
            The media server is not running. Start it from the Seanime dev panel.
          </p>
        ) : (
          <Suspense
            fallback={<p style={{ padding: 24, color: 'var(--muted, #9d97a6)' }}>Loading…</p>}
          >
            <MediaWorkspace conn={conn} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
