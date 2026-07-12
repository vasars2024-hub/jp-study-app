/**
 * Minimal surface for the transparent OS companion host window (?companionHost=1).
 * Maps Study OS desk-space positions onto the host viewport.
 * Span=all: stable-hash each companion onto a display work area.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { defFor, type CompanionInstance } from './companionCatalog';
import { resolvePrimaryRoutineId } from './buddyRoutines';

interface HostState {
  companions: CompanionInstance[];
  enabled: boolean;
  deskW?: number;
  deskH?: number;
}

interface Viewport {
  span: 'primary' | 'all';
  bounds: { x: number; y: number; width: number; height: number };
  primaryWorkArea: { x: number; y: number; width: number; height: number };
}

interface DisplayInfo {
  id: number;
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  primary: boolean;
}

const SIZE = 52;

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mapToHost(
  c: CompanionInstance,
  deskW: number,
  deskH: number,
  vp: Viewport | null,
  displays: DisplayInfo[],
): { left: number; top: number } {
  const dw = Math.max(1, deskW);
  const dh = Math.max(1, deskH);
  const nx = Math.min(1, Math.max(0, c.x / dw));
  const ny = Math.min(1, Math.max(0, c.y / dh));

  if (!vp) {
    return { left: c.x, top: c.y };
  }

  if (vp.span === 'primary' || displays.length <= 1) {
    return {
      left: nx * vp.primaryWorkArea.width,
      top: ny * vp.primaryWorkArea.height,
    };
  }

  // All displays: pick a stable display per companion id, map into its work area
  // relative to the virtual-desktop origin (host window origin).
  const d = displays[hashId(c.id) % displays.length];
  const wa = d.workArea;
  return {
    left: wa.x - vp.bounds.x + nx * wa.width,
    top: wa.y - vp.bounds.y + ny * wa.height,
  };
}

export default function CompanionHostView() {
  const [state, setState] = useState<HostState>({ companions: [], enabled: true });
  const [vp, setVp] = useState<Viewport | null>(null);
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [menuId, setMenuId] = useState<string | null>(null);
  const overRef = useRef(false);

  const refreshGeometry = useCallback(() => {
    void window.api
      .companionHostGetViewport()
      .then(setVp)
      .catch(() => setVp(null));
    void window.api
      .companionHostGetDisplays()
      .then((list) => setDisplays(list as DisplayInfo[]))
      .catch(() => setDisplays([]));
  }, []);

  useEffect(() => {
    document.documentElement.classList.add('companion-host');
    document.body.classList.add('companion-host-body');
    refreshGeometry();
    return () => {
      document.documentElement.classList.remove('companion-host');
      document.body.classList.remove('companion-host-body');
    };
  }, [refreshGeometry]);

  useEffect(() => {
    const unsub = window.api.onCompanionHostState((raw) => {
      const s = raw as HostState;
      if (s && Array.isArray(s.companions)) setState(s);
    });
    const unsubWake = window.api.onCompanionHostWake(() => {
      overRef.current = false;
      window.api.companionHostSetClickThrough(true);
      refreshGeometry();
      setMenuId(null);
    });
    return () => {
      unsub();
      unsubWake();
    };
  }, [refreshGeometry]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const over = Boolean(el?.closest?.('.os-companion'));
      if (over !== overRef.current) {
        overRef.current = over;
        window.api.companionHostSetClickThrough(!over);
      }
    };
    const onVis = () => {
      if (!document.hidden) {
        overRef.current = false;
        window.api.companionHostSetClickThrough(true);
        refreshGeometry();
      }
    };
    const onResize = () => refreshGeometry();
    window.addEventListener('mousemove', onMove);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', onResize);
      window.api.companionHostSetClickThrough(true);
    };
  }, [refreshGeometry]);

  const deskW = state.deskW && state.deskW > 0 ? state.deskW : 1200;
  const deskH = state.deskH && state.deskH > 0 ? state.deskH : 720;
  const visible = state.companions.filter((c) => !c.hiddenUntil || c.hiddenUntil <= Date.now());

  return (
    <div className="os-companion-host-root">
      {visible.map((c) => {
        const def = defFor(c.typeId);
        const pos = mapToHost(c, deskW, deskH, vp, displays);
        return (
          <div
            key={c.id}
            className={`os-companion mood-${c.mood}${c.locked ? ' locked' : ''}${def.variant ? ` variant-${def.variant}` : ''}`}
            style={{
              left: pos.left,
              top: pos.top,
              width: SIZE,
              height: SIZE,
              transform: `scaleX(${c.facing})`,
              ['--c-body' as string]: def.color,
              ['--c-accent' as string]: def.accent,
            }}
            title={`${def.label}${c.status ? ` — ${c.status}` : ''} · Click: run routine`}
            onClick={(e) => {
              e.stopPropagation();
              const rid = resolvePrimaryRoutineId(c);
              void window.api.companionHostFocusMain();
              window.api.companionHostRunRoutine(c.id, rid);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuId((id) => (id === c.id ? null : c.id));
            }}
          >
            <div className="os-companion-body">
              <span className="os-companion-eye" />
              <span className="os-companion-eye" />
              <span className={`os-companion-mouth mood-${c.mood}`} />
            </div>
            {c.mood === 'celebrate' && <span className="os-companion-spark" />}
            {menuId === c.id && (
              <div
                className="os-companion-menu"
                style={{ transform: 'translateX(-50%) scaleX(1)' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="os-companion-menu-title">{def.label}</div>
                <div className="os-companion-menu-status muted">{c.status ?? def.blurb}</div>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => {
                    const rid = resolvePrimaryRoutineId(c);
                    void window.api.companionHostFocusMain();
                    window.api.companionHostRunRoutine(c.id, rid);
                    setMenuId(null);
                  }}
                >
                  Run primary
                </button>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => {
                    void window.api.companionHostFocusMain();
                    setMenuId(null);
                  }}
                >
                  Open Study OS
                </button>
                <button type="button" className="btn small" onClick={() => setMenuId(null)}>
                  Close
                </button>
              </div>
            )}
          </div>
        );
      })}
      {!visible.length && (
        <div className="os-companion-host-empty muted">
          Enable companions in Study OS · Desktop settings
        </div>
      )}
    </div>
  );
}
