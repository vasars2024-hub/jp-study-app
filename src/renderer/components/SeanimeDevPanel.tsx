/**
 * Seanime sidecar — Phase 1 dev-only proof surface. THROWAWAY.
 *
 * Renders nothing at all unless the main process reports a non-`disabled` sidecar
 * status, so a normal build never shows it. Deliberately self-contained: no shell
 * section, no taskbar entry, no route registration — deleting this file and its one
 * mount in App.tsx removes the whole surface.
 *
 * Not translated on purpose: ADR-003 scopes the i18n gate to shipped Media-workspace
 * chrome, and this panel is removed at the end of Phase 1.
 */

import { useCallback, useEffect, useState } from 'react';
import type { SeanimeProbeResult, SeanimeStatus } from '../../shared/seanime';

const STATUS_COLOR: Record<SeanimeStatus['kind'], string> = {
  disabled: '#6b7280',
  stopped: '#6b7280',
  starting: '#d97706',
  ready: '#16a34a',
  offline: '#dc2626',
  failed: '#dc2626',
};

export default function SeanimeDevPanel() {
  const [status, setStatus] = useState<SeanimeStatus | null>(null);
  const [probe, setProbe] = useState<SeanimeProbeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(true);

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

  // The flag is a main-process concern; `disabled` is how the renderer learns it is off.
  if (!status || status.kind === 'disabled') return null;

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
        <strong style={{ flex: 1 }}>Seanime sidecar — Phase 1</strong>
        <button onClick={() => setOpen((v) => !v)} style={btn}>
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
