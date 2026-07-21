import { useEffect, useMemo, useRef, useState } from 'react';

import type { CityPresentationModel } from '../../engine/types';
import NoctisParticleCanvas from '../particles/NoctisParticleCanvas';
import {
  buildNoctisWorld,
  eraRank,
  fitWorldRect,
  focusWorldRect,
  type NoctisViewMode,
  type WorldFocus,
  type WorldRect,
} from '../world/worldModel';
import NoctisWorldScene from './NoctisWorldScene';

export type NoctisComposite = 'loading' | 'newborn' | 'active' | 'dimmed' | 'hibernating' | 'returning';

function mixRect(from: WorldRect, to: WorldRect, progress: number): WorldRect {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
    width: from.width + (to.width - from.width) * progress,
    height: from.height + (to.height - from.height) * progress,
  };
}

function easeInOut(progress: number): number {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return reduced;
}

function useAnimatedCamera(target: WorldRect, duration: number, immediate: boolean): WorldRect {
  const [current, setCurrent] = useState<WorldRect>(target);
  const currentRef = useRef(current);

  useEffect(() => { currentRef.current = current; }, [current]);

  useEffect(() => {
    if (immediate || duration <= 0) {
      currentRef.current = target;
      setCurrent(target);
      return undefined;
    }
    const from = currentRef.current;
    const startedAt = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const raw = Math.min(1, (now - startedAt) / duration);
      const next = mixRect(from, target, easeInOut(raw));
      currentRef.current = next;
      setCurrent(next);
      if (raw < 1) frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [duration, immediate, target.height, target.width, target.x, target.y]);

  return current;
}

function clampCamera(rect: WorldRect, bounds: WorldRect, aspect: number, minWidth: number, maxWidth: number): WorldRect {
  const safeAspect = aspect > 0 ? aspect : 1.6;
  let width = Math.max(minWidth, Math.min(maxWidth, rect.width));
  let height = width / safeAspect;
  const maximumHeight = Math.max(minWidth / safeAspect, bounds.height * 0.92);
  if (height > maximumHeight) {
    height = maximumHeight;
    width = height * safeAspect;
  }
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  let x = centerX - width / 2;
  let y = centerY - height / 2;
  x = width >= bounds.width ? bounds.x + (bounds.width - width) / 2 : Math.max(bounds.x, Math.min(bounds.x + bounds.width - width, x));
  y = height >= bounds.height ? bounds.y + (bounds.height - height) / 2 : Math.max(bounds.y, Math.min(bounds.y + bounds.height - height, y));
  return { x, y, width, height };
}

function viewAroundFocus(focus: WorldFocus, aspect: number, scale: number): WorldRect {
  const base = focusWorldRect(focus, aspect);
  const width = base.width * scale;
  const height = base.height * scale;
  return {
    x: focus.x - width / 2,
    y: focus.y - height / 2,
    width,
    height,
  };
}

export default function NoctisDiorama({
  model,
  composite,
  viewMode,
  onViewModeChange,
}: {
  model: CityPresentationModel | null;
  composite: NoctisComposite;
  viewMode: NoctisViewMode;
  onViewModeChange: (mode: NoctisViewMode) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; camera: WorldRect; moved: boolean } | null>(null);
  const suppressSceneClickRef = useRef(false);
  const reducedMotion = useReducedMotion();
  const [aspect, setAspect] = useState(1.6);
  const [selectedFocusId, setSelectedFocusId] = useState('ancestral_hearth');
  const [inspectionFocusId, setInspectionFocusId] = useState<string | null>(null);
  const [tourIndex, setTourIndex] = useState(0);
  const [driftPaused, setDriftPaused] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(document.visibilityState !== 'hidden');
  const [manualCamera, setManualCamera] = useState<WorldRect | null>(null);
  const [directCamera, setDirectCamera] = useState(false);
  const world = useMemo(() => buildNoctisWorld(model), [model]);
  const currentEra = model?.era || null;
  const previousEraRef = useRef<CityPresentationModel['era'] | null>(currentEra);
  const [settlingEra, setSettlingEra] = useState<CityPresentationModel['era'] | null>(null);
  const freshEraAdvance = currentEra && previousEraRef.current
    && eraRank(currentEra) > eraRank(previousEraRef.current)
    ? currentEra
    : null;
  const arrivingEra = freshEraAdvance || settlingEra;

  useEffect(() => {
    const previousEra = previousEraRef.current;
    previousEraRef.current = currentEra;
    if (!currentEra || !previousEra || eraRank(currentEra) <= eraRank(previousEra)) return undefined;
    setSettlingEra(currentEra);
    const timer = window.setTimeout(() => setSettlingEra(null), 12500);
    return () => window.clearTimeout(timer);
  }, [currentEra]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const update = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setAspect(rect.width / rect.height);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onVisibility = () => setDocumentVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    setManualCamera(null);
    setDirectCamera(false);
    if (viewMode === 'explorer') {
      setInspectionFocusId(null);
      setTourIndex(0);
      setDriftPaused(reducedMotion);
      if (world.focuses[0]) setSelectedFocusId(world.focuses[0].id);
    } else if (viewMode === 'strata') {
      const below = world.focuses.find((focus) => focus.stratum === 'deep')
        || world.focuses.find((focus) => focus.stratum === 'root');
      if (below) setSelectedFocusId(below.id);
    } else if (viewMode === 'stellar') {
      const above = world.focuses.find((focus) => focus.stratum === 'stellar');
      if (above) setSelectedFocusId(above.id);
    }
  }, [model?.era, reducedMotion, viewMode]);

  useEffect(() => {
    if (viewMode !== 'explorer' || reducedMotion || driftPaused || !documentVisible || world.focuses.length < 2) return undefined;
    const timer = window.setInterval(() => {
      setTourIndex((value) => (value + 1) % world.focuses.length);
    }, 9000);
    return () => window.clearInterval(timer);
  }, [documentVisible, driftPaused, reducedMotion, viewMode, world.focuses.length]);

  const tourFocus = world.focuses[tourIndex % Math.max(1, world.focuses.length)];
  useEffect(() => {
    if (viewMode === 'explorer' && tourFocus) setSelectedFocusId(tourFocus.id);
  }, [tourFocus?.id, viewMode]);

  const selectedFocus = world.focuses.find((focus) => focus.id === selectedFocusId)
    || world.focuses[0];
  const selectedRegion = selectedFocus
    ? world.regions.find((region) => region.id === selectedFocus.regionId)
    : world.regions[0];
  const strataFocus = world.focuses.find((focus) => focus.id === selectedFocus?.id && (focus.stratum === 'deep' || focus.stratum === 'root'))
    || world.focuses.find((focus) => focus.stratum === 'deep')
    || world.focuses.find((focus) => focus.stratum === 'root');
  const stellarFocus = world.focuses.find((focus) => focus.id === selectedFocus?.id && focus.stratum === 'stellar')
    || world.focuses.find((focus) => focus.stratum === 'stellar');

  const automaticCamera = useMemo(() => {
    if (viewMode === 'civilization') return fitWorldRect(world.revealedBounds, aspect, 0.08);
    if (viewMode === 'explorer' && tourFocus) return viewAroundFocus(tourFocus, aspect, tourIndex % 2 === 0 ? 1.34 : 0.94);
    if (viewMode === 'stellar' && stellarFocus) return viewAroundFocus(stellarFocus, aspect, 1.38);
    if (viewMode === 'strata' && strataFocus) return viewAroundFocus(strataFocus, aspect, 1.24);
    if (viewMode === 'detail' && selectedFocus) return viewAroundFocus(selectedFocus, aspect, 1);
    if (viewMode === 'district' && selectedRegion) {
      const width = Math.min(selectedRegion.bounds.width * 0.84, 1120);
      const height = width / aspect;
      return clampCamera({
        x: selectedFocus ? selectedFocus.x - width / 2 : selectedRegion.bounds.x,
        y: selectedFocus ? selectedFocus.y - height / 2 : selectedRegion.bounds.y,
        width,
        height,
      }, world.revealedBounds, aspect, 360, Math.max(900, world.revealedBounds.width * 0.78));
    }
    const hearth = world.focuses.find((focus) => focus.id === 'ancestral_hearth') || world.focuses[0];
    return hearth ? viewAroundFocus(hearth, aspect, 1.62) : fitWorldRect(world.revealedBounds, aspect, 0.04);
  }, [aspect, selectedFocus?.id, selectedRegion?.id, stellarFocus?.id, strataFocus?.id, tourFocus?.id, tourIndex, viewMode, world.revealedBounds]);

  const targetCamera = viewMode === 'civilization'
    ? automaticCamera
    : clampCamera(
      manualCamera || automaticCamera,
      world.revealedBounds,
      aspect,
      260,
      Math.max(900, world.revealedBounds.width * 0.78),
    );
  const camera = useAnimatedCamera(
    targetCamera,
    viewMode === 'explorer' ? 5200 : arrivingEra ? 2400 : 560,
    reducedMotion || directCamera,
  );

  const illumination = model ? model.illumination01 : 0.06;
  const circulation = model ? model.circulation01 : 0;
  const style = {
    '--noctis-light': illumination.toFixed(3),
    '--noctis-flow': circulation.toFixed(3),
    '--noctis-ecology': (model ? model.ecology.mycelialMaturity01 : 0).toFixed(3),
    '--noctis-crystal': (model ? model.ecology.crystalMaturity01 : 0).toFixed(3),
    '--noctis-civic': (model ? model.civic.density01 : 0).toFixed(3),
    '--noctis-institutions': (model ? model.civic.institutionalMaturity01 : 0).toFixed(3),
  } as React.CSSProperties;

  const pauseDrift = () => {
    if (viewMode === 'explorer') setDriftPaused(true);
  };

  const setManualFrom = (next: WorldRect) => {
    setManualCamera(clampCamera(
      next,
      world.revealedBounds,
      aspect,
      260,
      Math.max(900, world.revealedBounds.width * 0.78),
    ));
  };

  const zoomAt = (ratioX: number, ratioY: number, factor: number) => {
    if (viewMode === 'civilization') return;
    pauseDrift();
    const nextWidth = camera.width * factor;
    const nextHeight = nextWidth / aspect;
    const worldX = camera.x + camera.width * ratioX;
    const worldY = camera.y + camera.height * ratioY;
    setDirectCamera(true);
    setManualFrom({
      x: worldX - nextWidth * ratioX,
      y: worldY - nextHeight * ratioY,
      width: nextWidth,
      height: nextHeight,
    });
  };

  const panBy = (x: number, y: number) => {
    if (viewMode === 'civilization') return;
    pauseDrift();
    setDirectCamera(true);
    setManualFrom({ ...camera, x: camera.x + x, y: camera.y + y });
  };

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (viewMode === 'civilization') return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratioX = bounds.width > 0 ? (event.clientX - bounds.left) / bounds.width : 0.5;
    const ratioY = bounds.height > 0 ? (event.clientY - bounds.top) / bounds.height : 0.5;
    zoomAt(ratioX, ratioY, Math.exp(event.deltaY * 0.0012));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || viewMode === 'civilization') return;
    pauseDrift();
    setDirectCamera(true);
    setManualCamera(camera);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, camera, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const element = containerRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !element) return;
    const bounds = element.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    if (Math.abs(event.clientX - drag.x) > 4 || Math.abs(event.clientY - drag.y) > 4) drag.moved = true;
    setManualFrom({
      ...drag.camera,
      x: drag.camera.x - (event.clientX - drag.x) / bounds.width * drag.camera.width,
      y: drag.camera.y - (event.clientY - drag.y) / bounds.height * drag.camera.height,
    });
  };

  const stopDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      if (dragRef.current.moved) {
        suppressSceneClickRef.current = true;
        window.setTimeout(() => { suppressSceneClickRef.current = false; }, 0);
      }
      dragRef.current = null;
      setDirectCamera(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (viewMode === 'explorer') setDriftPaused(true);
    if (event.key === 'Home') {
      event.preventDefault();
      onViewModeChange('civilization');
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      if (viewMode === 'explorer') setDriftPaused(true);
      else if (viewMode === 'detail' || viewMode === 'strata' || viewMode === 'stellar' || viewMode === 'civilization') {
        setInspectionFocusId(null);
        onViewModeChange('district');
      }
      return;
    }
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomAt(0.5, 0.5, 0.82); }
    else if (event.key === '-' || event.key === '_') { event.preventDefault(); zoomAt(0.5, 0.5, 1.22); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); panBy(-camera.width * 0.09, 0); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); panBy(camera.width * 0.09, 0); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); panBy(0, -camera.height * 0.09); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); panBy(0, camera.height * 0.09); }
  };

  const activateFocus = (focus: WorldFocus) => {
    setSelectedFocusId(focus.id);
    setInspectionFocusId(focus.id);
    setManualCamera(null);
    setDirectCamera(false);
    setDriftPaused(true);
    onViewModeChange(viewMode === 'civilization' ? 'district' : 'detail');
  };

  const inspectSceneItem = (event: React.MouseEvent<SVGSVGElement>) => {
    if (suppressSceneClickRef.current) {
      suppressSceneClickRef.current = false;
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) return;
    const focusId = target.closest('[data-focus-id]')?.getAttribute('data-focus-id');
    if (!focusId) return;
    const focus = world.focuses.find((candidate) => candidate.id === focusId);
    if (focus) activateFocus(focus);
  };

  const inspectedFocus = inspectionFocusId
    ? world.focuses.find((focus) => focus.id === inspectionFocusId)
    : null;

  const focusCard = viewMode === 'explorer'
      ? tourFocus
      : viewMode === 'detail'
      ? inspectedFocus || selectedFocus
      : viewMode === 'strata'
        ? strataFocus
        : viewMode === 'stellar'
          ? stellarFocus
          : viewMode === 'district'
            ? inspectedFocus
            : null;

  const cameraLabel = viewMode === 'civilization'
    ? 'Whole civilization'
    : viewMode === 'explorer'
      ? 'Night Drift'
      : viewMode === 'strata'
        ? 'Below the civic ground'
        : viewMode === 'stellar'
          ? 'Stellar layer'
          : viewMode;

  return (
    <div
      ref={containerRef}
      className={`noctis-diorama is-${composite} is-${viewMode}${viewMode === 'glance' ? ' is-glance' : ''}`}
      style={style}
      tabIndex={0}
      role="application"
      aria-label="Navigable Noctis civilization. Drag or use arrow keys to pan, and use the wheel or plus and minus keys to zoom."
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onKeyDown={onKeyDown}
    >
      <svg
        className="noctis-scene"
        viewBox={`${camera.x} ${camera.y} ${camera.width} ${camera.height}`}
        preserveAspectRatio="xMidYMid slice"
        role="img"
        onClick={inspectSceneItem}
        aria-label={composite === 'hibernating'
          ? 'The revealed civilization rests beneath the permanent night.'
          : 'The revealed Noctis civilization, with connected regions available for observation.'}
      >
        <NoctisWorldScene
          model={model}
          composite={composite}
          selectedFocusId={focusCard?.id || null}
          arrivingEra={arrivingEra}
        />
        <g className="noctis-focus-targets" aria-label="Observable locations">
          {world.focuses.map((focus) => (
            <g
              key={focus.id}
              className={focus.id === focusCard?.id ? 'noctis-focus-target selected' : 'noctis-focus-target'}
              role="button"
              tabIndex={viewMode === 'glance' ? -1 : 0}
              aria-label={`Inspect ${focus.label}`}
              transform={`translate(${focus.x} ${focus.y})`}
              onClick={(event) => {
                event.stopPropagation();
                if (suppressSceneClickRef.current) {
                  suppressSceneClickRef.current = false;
                  return;
                }
                activateFocus(focus);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  activateFocus(focus);
                }
              }}
            >
              <circle className="noctis-focus-aura" r="38" />
              <circle className="noctis-focus-hit" r="44" />
              <circle className="noctis-focus-ring" r="30" />
            </g>
          ))}
        </g>
      </svg>
      {model ? <NoctisParticleCanvas model={model} /> : null}
      <div className="noctis-vignette" aria-hidden="true" />
      <div className="noctis-camera-label" aria-hidden="true">
        {cameraLabel}
      </div>
      <div className="noctis-camera-controls" aria-label="Camera controls">
        {viewMode === 'civilization' ? (
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onViewModeChange('district')}
          >
            Explore
          </button>
        ) : (
          <>
            <button
              type="button"
              aria-label="Zoom in"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => zoomAt(0.5, 0.5, 0.82)}
            >+</button>
            <button
              type="button"
              aria-label="Zoom out"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => zoomAt(0.5, 0.5, 1.22)}
            >−</button>
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onViewModeChange('civilization')}
            >Whole</button>
          </>
        )}
      </div>
      {focusCard ? (
        <aside className="noctis-focus-card" role="status" aria-live="polite">
          <span>{focusCard.eyebrow}</span>
          <strong>{focusCard.label}</strong>
          <p>{focusCard.description}</p>
          {viewMode === 'explorer' ? (
            <div className="noctis-drift-controls">
              <small>{tourIndex + 1} / {world.focuses.length}</small>
              {reducedMotion ? <span>Static tour</span> : (
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                  onClick={() => {
                    if (driftPaused) {
                      setManualCamera(null);
                      setDriftPaused(false);
                    } else setDriftPaused(true);
                  }}
                >
                  {driftPaused ? 'Resume drift' : 'Pause drift'}
                </button>
              )}
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
                onClick={() => {
                  setManualCamera(null);
                  setDriftPaused(true);
                  setTourIndex((value) => (value + 1) % world.focuses.length);
                }}
              >
                Next place
              </button>
            </div>
          ) : (
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => {
                setInspectionFocusId(null);
                onViewModeChange('district');
              }}
            >
              {viewMode === 'district' ? 'Close observation' : 'Return to district'}
            </button>
          )}
        </aside>
      ) : null}
      {composite === 'loading' ? <div className="noctis-loading-shimmer" aria-hidden="true" /> : null}
    </div>
  );
}
