import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { WidgetSnapshot } from '../../shared/desktop';
import { getWidgetDef } from '../widgets/registry';
import { readSetting } from '../widgets/types';
import { getZoomFactor } from '../appZoom';
import { useT } from '../i18n';
import { useWiredMaterials } from './ui';
import { wiredWidgetTitle } from '../widgets/wiredLabels';
import { clearTimer } from '../widgets/timerStore';

// Home Workspace widget host. A lighter cousin of the desktop's FloatingWindow:
// free-positioned, drag + resize done with a compositor-only transform during
// the gesture and committed to state exactly once on release (so dragging never
// re-renders/re-persists the whole desktop per pointer event). Snaps to an 8px
// grid. Locked widgets ignore drag/resize.

const GRID = 8;
const TASKBAR = 48;

function zoomFactor(): number {
  return getZoomFactor();
}

function desktopPointerScale(desk: HTMLElement | null): number {
  if (!desk) return zoomFactor();
  const rect = desk.getBoundingClientRect();
  const sx = rect.width / Math.max(1, desk.clientWidth);
  const sy = rect.height / Math.max(1, desk.clientHeight);
  const scale = Math.max(sx, sy);
  return Number.isFinite(scale) && scale > 0.05 ? scale : zoomFactor();
}

const snap = (n: number): number => Math.round(n / GRID) * GRID;

export interface WidgetFrameProps {
  widget: WidgetSnapshot;
  deskRef: React.RefObject<HTMLDivElement>;
  focused: boolean;
  onFocus: () => void;
  onPatch: (p: Partial<WidgetSnapshot>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}

export default function WidgetFrame({
  widget, deskRef, focused, onFocus, onPatch, onRemove, onDuplicate,
}: WidgetFrameProps) {
  const { t } = useT();
  const wired = useWiredMaterials();
  const def = getWidgetDef(widget.type);
  const frameRef = useRef<HTMLElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // §6 module-rack mount: scan-reveal + title lamp blink, wired only.
  const [mounting, setMounting] = useState(wired);
  useEffect(() => {
    if (!mounting) return;
    window.dispatchEvent(new CustomEvent('shell:widgetMount'));
    const timer = setTimeout(() => setMounting(false), 640);
    return () => clearTimeout(timer);
  }, [mounting]);

  if (!def) {
    // Unknown type (e.g. a saved layout from a newer build) — show a stub the
    // user can remove instead of crashing the whole desktop.
    return (
      <section
        className="widget-frame widget-unknown"
        style={{ left: widget.x, top: widget.y, width: widget.w, height: 90, zIndex: widget.z }}
      >
        <div className="widget-bar">
          <span className="widget-title">{t('widgetFrame.unknownWidget')}</span>
          <button className="widget-b" title={t('common.remove')} aria-label={t('common.remove')} onClick={onRemove}>×</button>
        </div>
        <div className="widget-body">{t('widgetFrame.notAvailable')}</div>
      </section>
    );
  }

  const locked = !!widget.locked;
  const collapsed = !!widget.collapsed;
  const blur = readSetting(widget.settings ?? {}, '__blur', true);
  const opacity = readSetting(widget.settings ?? {}, '__opacity', 1);

  const setSettings = (patch: Record<string, unknown>) =>
    onPatch({ settings: { ...(widget.settings ?? {}), ...patch } });

  const dragStart = (e: RPointerEvent<HTMLDivElement>) => {
    if (locked) return;
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    onFocus();
    const el = frameRef.current;
    if (!el) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const desk = deskRef.current;
    const z = desktopPointerScale(desk);
    const sx = e.clientX, sy = e.clientY, ox = widget.x, oy = widget.y;
    const dw = desk?.clientWidth ?? 1200;
    const dh = (desk?.clientHeight ?? 720) - TASKBAR;
    let curX = ox, curY = oy;
    let raf: number | null = null;
    el.style.willChange = 'transform';
    const move = (ev: PointerEvent) => {
      curX = Math.min(Math.max(ox + (ev.clientX - sx) / z, 0), dw - 60);
      curY = Math.min(Math.max(oy + (ev.clientY - sy) / z, 0), dh - 30);
      if (raf != null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        el.style.transform = `translate(${curX - ox}px, ${curY - oy}px)`;
      });
    };
    const handle = e.currentTarget as HTMLElement;
    const up = () => {
      handle.releasePointerCapture(e.pointerId);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      if (raf != null) cancelAnimationFrame(raf);
      el.style.transform = '';
      el.style.willChange = '';
      onPatch({ x: snap(curX), y: snap(curY) });
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  };

  const resizeStart = (e: RPointerEvent<HTMLDivElement>) => {
    if (locked) return;
    e.preventDefault();
    e.stopPropagation();
    onFocus();
    const el = frameRef.current;
    if (!el) return;
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    const z = desktopPointerScale(deskRef.current);
    const sx = e.clientX, sy = e.clientY, ow = widget.w, oh = widget.h;
    let curW = ow, curH = oh;
    let raf: number | null = null;
    const move = (ev: PointerEvent) => {
      curW = Math.max(def.minSize.w, ow + (ev.clientX - sx) / z);
      curH = Math.max(def.minSize.h, oh + (ev.clientY - sy) / z);
      if (raf != null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        el.style.width = `${curW}px`;
        el.style.height = `${curH}px`;
      });
    };
    const up = () => {
      handle.releasePointerCapture(e.pointerId);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      if (raf != null) cancelAnimationFrame(raf);
      onPatch({ w: snap(curW), h: snap(curH) });
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  };

  const Body = def.component;
  const contentH = collapsed ? 0 : widget.h - 30;

  return (
    <section
      ref={frameRef}
      className={`widget-frame ${focused ? 'focused' : ''} ${blur ? 'blur' : ''} ${collapsed ? 'collapsed' : ''} ${locked ? 'locked' : ''} ${wired && mounting ? 'widget-anim-mounting' : ''}`}
      style={{
        left: widget.x,
        top: widget.y,
        width: widget.w,
        height: collapsed ? 30 : widget.h,
        zIndex: widget.z,
        opacity,
      }}
      onPointerDown={onFocus}
    >
      <div className="widget-bar" onPointerDown={dragStart} onDoubleClick={() => onPatch({ collapsed: !collapsed })}>
        <span className="widget-title">{wired ? wiredWidgetTitle(widget.type, t(def.titleKey)) : t(def.titleKey)}</span>
        <span className="widget-btns">
          {locked && <span className="widget-lock" title={t('widgetFrame.locked')} aria-hidden>⌧</span>}
          <button
            className="widget-b"
            title={t('widgetFrame.options')} aria-label={t('widgetFrame.options')}
            onClick={(ev) => { ev.stopPropagation(); setMenuOpen((o) => !o); }}
          >
            ⋯
          </button>
        </span>
        {menuOpen && (
          <>
            <div className="widget-menu-backdrop" onPointerDown={(ev) => { ev.stopPropagation(); setMenuOpen(false); }} />
            <div className="widget-menu" onPointerDown={(ev) => ev.stopPropagation()}>
              <button onClick={() => { onPatch({ locked: !locked }); setMenuOpen(false); }}>{locked ? t('widgetFrame.unlock') : t('widgetFrame.lock')}</button>
              <button onClick={() => { onPatch({ collapsed: !collapsed }); setMenuOpen(false); }}>{collapsed ? t('widgetFrame.expand') : t('widgetFrame.collapse')}</button>
              <button onClick={() => { setSettings({ __blur: !blur }); setMenuOpen(false); }}>{blur ? t('widgetFrame.disableBlur') : t('widgetFrame.enableBlur')}</button>
              <button onClick={() => { setSettings({ __opacity: opacity > 0.85 ? 0.7 : 1 }); setMenuOpen(false); }}>{opacity > 0.85 ? t('widgetFrame.makeTransparent') : t('widgetFrame.makeSolid')}</button>
              <button onClick={() => { onDuplicate(); setMenuOpen(false); }}>{t('widgetFrame.duplicate')}</button>
              <button onClick={() => { onPatch({ hidden: true }); setMenuOpen(false); }}>{t('widgetFrame.hide')}</button>
              <button className="danger" onClick={() => { clearTimer(widget.id); onRemove(); setMenuOpen(false); }}>{t('common.remove')}</button>
            </div>
          </>
        )}
      </div>
      {/* Collapsing unmounts the body. Anything that must survive that (the
          timers) keeps its state in a module store keyed by `widget.id` —
          see widgets/timerStore.ts. */}
      {!collapsed && (
        <div className="widget-body">
          <Body settings={widget.settings ?? {}} setSettings={setSettings} size={{ w: widget.w, h: contentH }} instanceId={widget.id} />
        </div>
      )}
      {!collapsed && !locked && <div className="widget-resize" title={t('widgetFrame.resize')} onPointerDown={resizeStart} />}
    </section>
  );
}
