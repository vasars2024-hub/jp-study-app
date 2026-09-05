/**
 * Seanime sidecar — dev-only proof surface. THROWAWAY.
 *
 * Deliberately self-contained: no shell section, no taskbar entry, no route
 * registration — deleting this file and its one mount in App.tsx removes the whole
 * surface.
 *
 * **The old gate silently stopped working on 2026-07-31.** This header used to say
 * "renders nothing unless the main process reports a non-`disabled` status, so a
 * normal build never shows it", and that was true only while `SEANIME_SIDECAR` was
 * off by default. Flipping it on changed the initial status from `disabled` to
 * `stopped` — which is exactly and only what that flip's own note says it does —
 * so this 460px monospace console with Start/Stop/Probe buttons began rendering on
 * every normal desktop, fixed at bottom-right, at z-index 99,999. Nothing failed;
 * a debug tool just became part of the product.
 *
 * The gate is now the runtime as well, which cannot be undone by a flag, and both
 * halves are exported so the rule is testable rather than a claim in a comment —
 * which is exactly how the last one got away with being false for a whole day.
 *
 * Panel disclosure controls use the shared i18n seam; technical diagnostics remain
 * the existing development-only output.
 */

import { useCallback, useEffect, useState } from 'react';
import { useT } from '../i18n';
import type { SeanimeProbeResult, SeanimeStatus } from '../../shared/seanime';

/** Marks `<html>` while the panel is on screen, so the media-workspace launcher can
 *  step around it instead of hardcoding an offset for something that may not exist. */
export const DEV_PANEL_ATTR = 'data-seanime-dev-panel';

/**
 * Whether this renderer is running from the dev server rather than a packaged build.
 *
 * Deliberately **not** `import.meta.env.DEV`: this repo has no `vite-env.d.ts` and its
 * `module` setting rejects `import.meta` outright, so each use of it adds two permanent
 * `tsc` diagnostics — the two existing sites already do, and the root tsconfig is off
 * limits (CLAUDE.md). This is also the better signal for the question actually being
 * asked, which is how the app is *running*, not how it was compiled: a packaged build
 * here serves `app://bundle/index.html` from a registered custom protocol, never
 * http — established against the real package in
 * `docs/migration/proof/packaged-sidecar-launch-20260731102252/`.
 *
 * Anything unrecognised counts as production. A dev tool that fails closed is a dev
 * tool; one that fails open is what this slice is fixing.
 */
export function isDevServerRuntime(
  loc: { protocol: string; hostname: string } = window.location,
): boolean {
  if (loc.protocol !== 'http:' && loc.protocol !== 'https:') return false;
  return loc.hostname === 'localhost' || loc.hostname === '127.0.0.1' || loc.hostname === '[::1]';
}

/**
 * Whether the dev panel should render. Both conditions are required: `isDev` because
 * this is a development tool, and a live sidecar status because there is nothing to
 * report otherwise.
 *
 * A type predicate, so the `status` the panel body then reads is non-null without a
 * second check — the narrowing and the visibility rule stay the same decision.
 */
export function devPanelIsVisible(
  status: SeanimeStatus | null,
  isDev: boolean,
): status is SeanimeStatus {
  if (!isDev) return false;
  return status != null && status.kind !== 'disabled';
}

const STATUS_COLOR: Record<SeanimeStatus['kind'], string> = {
  disabled: '#6b7280',
  stopped: '#6b7280',
  starting: '#d97706',
  ready: '#16a34a',
  offline: '#dc2626',
  failed: '#dc2626',
};

export default function SeanimeDevPanel() {
  const { t } = useT();
  const [status, setStatus] = useState<SeanimeStatus | null>(null);
  const [probe, setProbe] = useState<SeanimeProbeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Collapsed by default. Expanded it is 460px wide and up to 72vh tall, parked over
  // the bottom-right of the desktop for the whole session — which was tolerable while
  // it appeared only when someone armed SEANIME_SIDECAR, and is not now that a dev run
  // always has a sidecar. One click still opens it.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // The main-process handlers may legitimately be absent — an older main process
    // still running under HMR, or a build without the sidecar module. Stay silent
    // and hidden rather than surfacing an unhandled rejection to the error boundary.
    if (typeof window.api?.seanimeStatus !== 'function') return;
    void window.api.seanimeStatus().then(setStatus).catch(() => setStatus(null));
    return window.api.onSeanimeStatus(setStatus);
  }, []);

  const runProbe = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await window.api.seanimeProbe();
      if (res.ok) {
        setProbe(res.result);
      } else {
        setError(res.error);
        setProbe(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setProbe(null);
    }
    setBusy(false);
  }, []);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await window.api.seanimeStart();
      setStatus(s);
      if (s.kind === 'ready') void runProbe();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }, [runProbe]);

  const stop = useCallback(async () => {
    setBusy(true);
    try {
      setStatus(await window.api.seanimeStop());
      setProbe(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }, []);

  const visible = devPanelIsVisible(status, isDevServerRuntime());

  // Publish presence on <html> rather than leaving `.seanime-host-launcher` to guess.
  // Its `bottom` used to be a hardcoded 190px "clears the Phase-1 dev panel", which
  // became 190px of empty desktop the moment this stopped rendering in production.
  useEffect(() => {
    if (!visible) return;
    document.documentElement.setAttribute(DEV_PANEL_ATTR, '');
    return () => document.documentElement.removeAttribute(DEV_PANEL_ATTR);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 99_999,
        width: open ? 460 : 220,
        maxHeight: '72vh',
        overflow: 'auto',
        background: 'rgba(17,17,20,0.96)',
        color: '#e5e7eb',
        border: '1px solid #3f3f46',
        borderRadius: 8,
        padding: 12,
        font: '12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: STATUS_COLOR[status.kind],
            flex: '0 0 auto',
          }}
        />
        {/* Collapsed, the dot is the only thing left — and colour alone is not a
            status (WCAG 1.4.1), the same rule `.seanime-host-dot` already follows in
            the shipped launcher. The kind rides alongside it. */}
        <strong style={{ flex: 1 }}>
          Seanime sidecar
          <span style={{ color: '#9ca3af', fontWeight: 400 }}>{` · ${status.kind}`}</span>
        </strong>
        <button
          onClick={() => setOpen((v) => !v)}
          style={btn}
          aria-expanded={open}
          title={t(open ? 'seanimeDev.collapse' : 'seanimeDev.expand')}
        >
          {open ? '–' : '+'}
        </button>
      </div>

      {open && (
        <>
          <div style={{ marginBottom: 8 }}>
            <div>
              state <b style={{ color: STATUS_COLOR[status.kind] }}>{status.kind}</b>
              {status.version ? `  ·  v${status.version}` : ''}
            </div>
            <div>
              port {status.port || '—'} · pid {status.pid ?? '—'}
            </div>
            {status.simulatedUser !== null && (
              <div>anilist account: {status.simulatedUser ? 'none (simulated)' : 'logged in'}</div>
            )}
            <div style={{ wordBreak: 'break-all', opacity: 0.7 }}>
              datadir {status.dataDir ?? '—'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <button onClick={() => void start()} disabled={busy || status.kind === 'ready'} style={btn}>
              start
            </button>
            <button onClick={() => void stop()} disabled={busy || !status.pid} style={btn}>
              stop
            </button>
            <button onClick={() => void runProbe()} disabled={busy || status.kind !== 'ready'} style={btn}>
              probe
            </button>
          </div>

          {/* Explicit failure text — Phase 1 forbids a hanging spinner. */}
          {(status.error || error) && (
            <div
              style={{
                background: '#3f1d1d',
                border: '1px solid #7f1d1d',
                borderRadius: 4,
                padding: 6,
                marginBottom: 8,
                whiteSpace: 'pre-wrap',
              }}
            >
              {error ?? status.error}
            </div>
          )}

          {status.kind === 'failed' && status.logTail.length > 0 && (
            <details style={{ marginBottom: 8 }}>
              <summary style={{ cursor: 'pointer' }}>server log tail</summary>
              <pre style={{ whiteSpace: 'pre-wrap', opacity: 0.75 }}>
                {status.logTail.join('\n')}
              </pre>
            </details>
          )}

          {probe && (
            <>
              <div style={{ marginBottom: 6 }}>
                {probe.tiles.length} titles · {probe.totalFiles} files ·{' '}
                {probe.unmatchedFiles} unmatched
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))',
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                {probe.tiles.map((t) => (
                  <div key={t.anilistId} title={`anilistId ${t.anilistId} · malId ${t.malId ?? '—'}`}>
                    {t.posterUrl ? (
                      <img
                        src={t.posterUrl}
                        alt=""
                        style={{ width: '100%', borderRadius: 4, display: 'block' }}
                      />
                    ) : (
                      <div style={{ aspectRatio: '2/3', background: '#27272a', borderRadius: 4 }} />
                    )}
                    <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>{t.title}</div>
                  </div>
                ))}
              </div>

              {probe.identity.length > 0 && (
                <div>
                  <div style={{ marginBottom: 4, opacity: 0.8 }}>
                    identity mapping — anilistId ⇄ path
                  </div>
                  {probe.identity.map((row) => (
                    <div key={row.path} style={{ marginBottom: 4, wordBreak: 'break-all' }}>
                      <b>{row.anilistId}</b>
                      {row.malId ? ` (mal ${row.malId})` : ''} · ep {row.episode ?? '—'}
                      <div style={{ opacity: 0.65 }}>{row.path}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

const btn: React.CSSProperties = {
  background: '#27272a',
  color: '#e5e7eb',
  border: '1px solid #52525b',
  borderRadius: 4,
  padding: '2px 8px',
  cursor: 'pointer',
  font: 'inherit',
};
