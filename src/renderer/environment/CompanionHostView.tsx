/**
 * Minimal surface for the transparent OS companion host window (?companionHost=1).
 * Maps Study OS desk-space positions onto the host viewport.
 * Span=all: continuous virtual-desktop mapping snapped to the nearest work area
 * so climb edges track each monitor's physical edges (mixed-DPI safe DIPs).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { defFor, type CompanionInstance } from './companionCatalog';
import { resolvePrimaryRoutineId } from './buddyRoutines';
import ShimejiSprite from './ShimejiSprite';
import {
  companionCssTransform,
  mapDeskToDisplayWorkArea,
  pickDisplayForVirtualPoint,
} from './shimejiPhysics';

interface HostState {
  companions: CompanionInstance[];
  enabled: boolean;
  deskW?: number;
  deskH?: number;
  activeness?: number;
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
  scaleFactor: number;
}

const SIZE = 52;
const SHIMEJI_SIZE = 96;
const WIRED_SHIMEJI_SIZE = 100;

function companionSize(c: Pick<CompanionInstance, 'typeId'>): number {
  return defFor(c.typeId).spritePack
    ? c.typeId === 'wired-navi'
      ? WIRED_SHIMEJI_SIZE
      : SHIMEJI_SIZE
    : SIZE;
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

  // Continuous map onto the host union, then snap into the work area that
  // contains (or is nearest to) that virtual point — avoids dead gaps and
  // keeps wall/ceiling pets on real monitor edges.
  const virtX = vp.bounds.x + nx * vp.bounds.width;
  const virtY = vp.bounds.y + ny * vp.bounds.height;
  const idx = pickDisplayForVirtualPoint(virtX, virtY, displays);
  const d = displays[idx] ?? displays[0];
  return mapDeskToDisplayWorkArea(nx, ny, d.workArea, vp.bounds);
}

export default function CompanionHostView() {
  const [state, setState] = useState<HostState>({ companions: [], enabled: true });
  const [vp, setVp] = useState<Viewport | null>(null);
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [menuId, setMenuId] = useState<string | null>(null);
  const overRef = useRef(false);
  const hitTestRaf = useRef(0);
  const lastMouse = useRef<{ x: number; y: number } | null>(null);

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
      lastMouse.current = { x: e.clientX, y: e.clientY };
      if (hitTestRaf.current) return;
      hitTestRaf.current = window.requestAnimationFrame(() => {
        hitTestRaf.current = 0;
        const point = lastMouse.current;
        if (!point) return;
        const el = document.elementFromPoint(point.x, point.y);
        const over = Boolean(el?.closest?.('.os-companion'));
        if (over !== overRef.current) {
          overRef.current = over;
          window.api.companionHostSetClickThrough(!over);
        }
      });
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
      if (hitTestRaf.current) {
        window.cancelAnimationFrame(hitTestRaf.current);
        hitTestRaf.current = 0;
      }
      window.api.companionHostSetClickThrough(true);
    };
  }, [refreshGeometry]);

  const deskW = state.deskW && state.deskW > 0 ? state.deskW : 1200;
  const deskH = state.deskH && state.deskH > 0 ? state.deskH : 720;
  const visible = state.companions.filter((c) => !c.hiddenUntil || c.hiddenUntil <= Date.now());

  return (
    <div
      className="os-companion-host-root"
      style={{
        ['--companion-bob-dur' as string]: `${2.8 * (1.55 - Math.min(1, Math.max(0, state.activeness ?? 0.4)) * 0.75)}s`,
      }}
    >
      {visible.map((c) => {
        const def = defFor(c.typeId);
        const pos = mapToHost(c, deskW, deskH, vp, displays);
        const size = companionSize(c);
        return (
          <div
            key={c.id}
            className={`os-companion mood-${c.mood}${c.locked ? ' locked' : ''}${def.variant ? ` variant-${def.variant}` : ''}`}
            style={{
              left: pos.left,
              top: pos.top,
              width: size,
              height: size,
              transform: companionCssTransform(
                { x: 0, y: 0, facing: c.facing, edge: c.edge },
                { includeTranslate: false },
              ),
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
            {def.spritePack ? (
              <ShimejiSprite
                motion={c.motion}
                mood={c.mood}
                pack={def.spritePack}
                activeness={state.activeness ?? 0.4}
              />
            ) : (
              <div className="os-companion-body">
                <span className="os-companion-eye" />
                <span className="os-companion-eye" />
                <span className={`os-companion-mouth mood-${c.mood}`} />
              </div>
            )}
            {c.speechBubble && <div className="os-companion-bubble">{c.speechBubble}</div>}
            {menuId === c.id && (
              <div
                className="os-companion-menu"
                onClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.preventDefault()}
              >
                <div className="os-companion-menu-title">{def.label}</div>
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
                  Run routine
                </button>
                <button type="button" className="btn small" onClick={() => setMenuId(null)}>
                  Close
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
