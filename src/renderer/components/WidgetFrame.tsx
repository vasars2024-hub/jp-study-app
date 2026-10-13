import { useEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import type { WidgetSnapshot } from '../../shared/desktop';
import { getWidgetDef } from '../widgets/registry';
import { readSetting } from '../widgets/types';
import WidgetSettingsPopover from '../widgets/WidgetSettingsPopover';
import { isNudgeKey, nudgeWidget, type WidgetGeometry } from '../widgets/widgetKeyboard';
import { getZoomFactor } from '../appZoom';
import { useT } from '../i18n';
import { useAeroMaterials, useWiredMaterials } from './ui';
import { wiredWidgetTitle } from '../widgets/wiredLabels';
import { aeroGadgetTitle } from '../widgets/aeroLabels';
import { clearTimer } from '../widgets/timerStore';
import { alignMove, alignResize, clampResizeToDesk, type AlignGuide, type AlignRect } from '../widgets/widgetAlign';
import '../widgets/wid6.css';

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

/**
 * wid6: the other widgets beside this one, as rects in the coordinates its own
 * `left`/`top` use (offsets are layout values, so the desk's zoom transform
 * does not distort them). Previews in the gallery are not on the desk.
 */
function siblingRects(self: HTMLElement): AlignRect[] {
  const parent = self.offsetParent;
  if (!parent) return [];
  return [...parent.querySelectorAll<HTMLElement>('.widget-frame:not(.widget-preview-frame)')]
    .filter((el) => el !== self && el.offsetParent === parent)
    .map((el) => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }));
}

/**
 * wid6: the guide lines drawn over the desk while a widget is dragged or
 * resized, plus a coordinate readout (shown by the Wired sheet, where placing a
 * module is a terminal operation). Plain DOM, not React state: a drag must not
 * re-render the desktop per pointer event.
 */
class GuideLayer {
  private root: HTMLDivElement | null = null;
  private drawn = '';

  constructor(private readonly host: Element | null) {}

  /** Draw `guides` and a readout reading `text` at `pos` (desk coordinates). */
  show(guides: AlignGuide[], pos: { x: number; y: number }, text: string): void {
    if (!this.host) return;
    const key = `${guides.map((g) => `${g.axis}${g.at}:${g.from}-${g.to}`).join('|')}#${text}`;
    if (key === this.drawn) return;
    this.drawn = key;
    if (!this.root) {
      this.root = document.createElement('div');
      this.root.className = 'widget-guides';
      this.root.setAttribute('aria-hidden', 'true');
      this.host.appendChild(this.root);
    }
    this.root.replaceChildren();
    for (const g of guides) {
      const line = document.createElement('div');
      line.className = `widget-guide is-${g.axis}`;
      const length = `${Math.max(0, g.to - g.from)}px`;
      if (g.axis === 'x') {
        line.style.left = `${g.at}px`;
        line.style.top = `${g.from}px`;
        line.style.height = length;
      } else {
        line.style.top = `${g.at}px`;
        line.style.left = `${g.from}px`;
        line.style.width = length;
      }
      this.root.appendChild(line);
    }
    const readout = document.createElement('div');
    readout.className = 'widget-guide-readout';
    readout.style.left = `${Math.round(pos.x)}px`;
    readout.style.top = `${Math.round(pos.y)}px`;
    readout.textContent = text;
    this.root.appendChild(readout);
  }

  clear(): void {
    this.root?.remove();
    this.root = null;
    this.drawn = '';
  }
}

/** A coordinate the way the Wired readout prints it: four digits, zero-padded. */
const pad4 = (n: number): string => String(Math.max(0, Math.round(n))).padStart(4, '0');

/**
 * wid7: wire one drag or resize gesture to its handle, and end it exactly once.
 *
 * Both gestures used to listen for `pointerup` alone. A gesture that never sees
 * its `pointerup` (Alt+Tab mid-drag, a touch the OS takes over, the button let
 * go over another window) left the move listener attached, so the widget kept
 * following the mouse until the next click, with its guide lines still drawn.
 * Now `pointercancel` and `lostpointercapture` end it too, putting the widget
 * back where it started (`commit: false`), and a mouse move that arrives with
 * no button held ends it where it was last drawn (the release happened; this
 * handle just never heard it). The returned function ends the gesture from the
 * outside, which is how unmounting mid-gesture cleans up.
 */
function trackGesture(
  handle: HTMLElement,
  pointerId: number,
  onMove: (ev: PointerEvent) => void,
  onEnd: (commit: boolean) => void,
): (commit: boolean) => void {
  let done = false;
  const ours = (ev: PointerEvent): boolean => typeof ev.pointerId !== 'number' || ev.pointerId === pointerId;
  const move = (ev: PointerEvent): void => {
    if (!ours(ev)) return;
    if (ev.pointerType === 'mouse' && ev.buttons === 0) {
      end(true);
      return;
    }
    onMove(ev);
  };
  const up = (ev: PointerEvent): void => {
    if (ours(ev)) end(true);
  };
  const cancel = (ev: PointerEvent): void => {
    if (ours(ev)) end(false);
  };
  function end(commit: boolean): void {
    if (done) return;
    done = true;
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', up);
    handle.removeEventListener('pointercancel', cancel);
    handle.removeEventListener('lostpointercapture', cancel);
    try {
      handle.releasePointerCapture(pointerId);
    } catch {
      /* Capture is already gone, which may be why the gesture is ending. */
    }
    onEnd(commit);
  }
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', up);
  handle.addEventListener('pointercancel', cancel);
  handle.addEventListener('lostpointercapture', cancel);
  return end;
}

/** The enabled items of an open widget menu, in order. */
function menuItems(menu: HTMLElement | null): HTMLButtonElement[] {
  if (!menu) return [];
  return [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].filter((b) => !b.disabled);
}

/** wid7: where a menu key moves focus from `at` among `n` items, or null for a key the menu does not take. */
export function nextMenuIndex(key: string, at: number, n: number): number | null {
  if (n === 0) return null;
  switch (key) {
    case 'ArrowDown':
      return at < 0 ? 0 : (at + 1) % n;
    case 'ArrowUp':
      return at < 0 ? n - 1 : (at - 1 + n) % n;
    case 'Home':
      return 0;
    case 'End':
      return n - 1;
    default:
      return null;
  }
}

export interface WidgetFrameProps {
  widget: WidgetSnapshot;
  deskRef: React.RefObject<HTMLDivElement | null>;
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
  // Aero renders widgets as frameless Sidebar-era gadgets: no title bar, a
  // vertical close/options/grip toolbar that fades in beside the gadget.
  const aero = useAeroMaterials();
  const def = getWidgetDef(widget.type);
  const frameRef = useRef<HTMLElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  /** wid5: the widget's own settings popover. */
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** wid5: keyboard move/resize mode, holding the geometry to restore on Escape. */
  const [keyboardFrom, setKeyboardFrom] = useState<WidgetGeometry | null>(null);
  useEffect(() => {
    if (keyboardFrom) frameRef.current?.focus({ preventScroll: true });
  }, [keyboardFrom]);
  /** wid7: ends the drag or resize in flight; unmounting mid-gesture must not leave listeners or guides behind. */
  const gestureEndRef = useRef<((commit: boolean) => void) | null>(null);
  useEffect(() => () => gestureEndRef.current?.(false), []);
  /** wid7: the options menu takes focus when it opens and hands it back to its button. */
  const menuRef = useRef<HTMLDivElement | null>(null);
  const optionsRef = useRef<HTMLButtonElement | null>(null);
  const menuWasOpen = useRef(false);
  useEffect(() => {
    if (menuOpen) {
      menuWasOpen.current = true;
      menuItems(menuRef.current)[0]?.focus({ preventScroll: true });
      return;
    }
    if (!menuWasOpen.current) return;
    menuWasOpen.current = false;
    // An item that closed the menu took its focused node with it. Unless the
    // item moved focus somewhere on purpose (settings, keyboard move), focus
    // goes back to the button that opened the menu instead of the page body.
    const active = document.activeElement;
    if (!active || active === document.body) optionsRef.current?.focus({ preventScroll: true });
  }, [menuOpen]);
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

  const schema = def.settingsSchema ?? [];

  const startKeyboardMove = (): void => {
    setMenuOpen(false);
    if (locked) return;
    onFocus();
    setKeyboardFrom({ x: widget.x, y: widget.y, w: widget.w, h: widget.h });
  };

  /** Arrows move, Shift+arrows resize, Ctrl x5; Enter keeps, Escape restores. */
  const onKeyboardMove = (e: RKeyboardEvent<HTMLElement>): void => {
    if (!keyboardFrom) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onPatch({ ...keyboardFrom });
      setKeyboardFrom(null);
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (e.key === 'Enter') e.preventDefault();
      e.stopPropagation();
      setKeyboardFrom(null);
      return;
    }
    if (!isNudgeKey(e.key)) return;
    // Ahead of the global shortcut manager: Ctrl+Arrow is music volume and
    // Ctrl+Alt+Arrow window snapping, and neither should fire while placing this.
    e.preventDefault();
    e.stopPropagation();
    const desk = deskRef.current;
    const bounds = {
      width: desk?.clientWidth || 1200,
      height: (desk?.clientHeight || 720) - TASKBAR,
    };
    const next = nudgeWidget(
      { x: widget.x, y: widget.y, w: widget.w, h: widget.h },
      e.key,
      { shift: e.shiftKey, ctrl: e.ctrlKey },
      bounds,
      def.minSize,
    );
    onPatch(next);
  };

  const keyboardHint = keyboardFrom ? (
    <div className="widget-keyboard-hint" role="status">
      {t('wid5.keyboard.hint')}
    </div>
  ) : null;

  /** wid7: arrows and Home/End walk the menu; Escape closes it onto its button; Tab closes it and moves on. */
  const onMenuKeyDown = (ev: RKeyboardEvent<HTMLDivElement>): void => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      setMenuOpen(false);
      optionsRef.current?.focus({ preventScroll: true });
      return;
    }
    if (ev.key === 'Tab') {
      // Focus the button first and let Tab's default carry on from it, so Tab
      // and Shift+Tab land where they would have with the menu shut.
      optionsRef.current?.focus({ preventScroll: true });
      setMenuOpen(false);
      return;
    }
    const items = menuItems(menuRef.current);
    const next = nextMenuIndex(ev.key, items.indexOf(document.activeElement as HTMLButtonElement), items.length);
    if (next === null) return;
    ev.preventDefault();
    ev.stopPropagation();
    items[next]?.focus({ preventScroll: true });
  };

  const settingsPopover = settingsOpen && schema.length > 0 && !collapsed ? (
    <WidgetSettingsPopover
      title={t('wid5.settings.title', { name: t(def.titleKey) })}
      schema={schema}
      settings={widget.settings ?? {}}
      setSettings={setSettings}
      onClose={() => setSettingsOpen(false)}
    />
  ) : null;

  const wid5MenuItems = (role?: 'menuitem') => (
    <>
      {schema.length > 0 && (
        <button
          role={role}
          data-widget-menu="settings"
          onClick={() => {
            setMenuOpen(false);
            setSettingsOpen(true);
          }}
        >
          {t('wid5.menu.settings')}
        </button>
      )}
      {!locked && (
        <button role={role} data-widget-menu="keyboard-move" onClick={startKeyboardMove}>
          {t('wid5.menu.keyboardMove')}
        </button>
      )}
    </>
  );

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
    // wid6: edges and centres catch the other widgets' and the desk's; Alt places freely.
    const others = siblingRects(el);
    const guides = new GuideLayer(el.offsetParent);
    const readout = (x: number, y: number): string => t('wid6.guides.readout', { x: pad4(x), y: pad4(y) });
    let snappedX = false, snappedY = false;
    const frameH = el.offsetHeight || (collapsed ? 30 : widget.h);
    el.style.willChange = 'transform';
    const move = (ev: PointerEvent) => {
      curX = Math.min(Math.max(ox + (ev.clientX - sx) / z, 0), dw - 60);
      curY = Math.min(Math.max(oy + (ev.clientY - sy) / z, 0), dh - 30);
      snappedX = false;
      snappedY = false;
      if (!ev.altKey) {
        const aligned = alignMove({ x: curX, y: curY, w: widget.w, h: frameH }, others, { width: dw, height: dh });
        curX = Math.min(Math.max(aligned.x, 0), dw - 60);
        curY = Math.min(Math.max(aligned.y, 0), dh - 30);
        snappedX = aligned.snappedX && curX === aligned.x;
        snappedY = aligned.snappedY && curY === aligned.y;
        guides.show(aligned.guides, { x: curX, y: curY }, readout(curX, curY));
      } else {
        guides.show([], { x: curX, y: curY }, readout(curX, curY));
      }
      if (raf != null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        el.style.transform = `translate(${curX - ox}px, ${curY - oy}px)`;
      });
    };
    const handle = e.currentTarget as HTMLElement;
    gestureEndRef.current?.(false);
    gestureEndRef.current = trackGesture(handle, e.pointerId, move, (commit) => {
      gestureEndRef.current = null;
      if (raf != null) cancelAnimationFrame(raf);
      guides.clear();
      el.style.transform = '';
      el.style.willChange = '';
      if (!commit) return;
      // An edge that caught a guide stays exactly on it; anything else keeps the grid.
      onPatch({ x: snappedX ? Math.round(curX) : snap(curX), y: snappedY ? Math.round(curY) : snap(curY) });
    });
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
    // wid6: the far edges catch the other widgets' edges and the desk's.
    const others = siblingRects(el);
    const deskEl = deskRef.current;
    const bounds = { width: deskEl?.clientWidth ?? 1200, height: (deskEl?.clientHeight ?? 720) - TASKBAR };
    const guides = new GuideLayer(el.offsetParent);
    const readout = (w: number, h: number): string => t('wid6.guides.size', { w: pad4(w), h: pad4(h) });
    const corner = (w: number, h: number): { x: number; y: number } => ({ x: widget.x + w, y: widget.y + h });
    let snappedW = false, snappedH = false;
    // wid7: the far edges stop at the desk's right edge and at the taskbar.
    const inDesk = (w: number, h: number): { w: number; h: number } =>
      clampResizeToDesk({ x: widget.x, y: widget.y, w, h }, bounds, def.minSize);
    const move = (ev: PointerEvent) => {
      ({ w: curW, h: curH } = inDesk(ow + (ev.clientX - sx) / z, oh + (ev.clientY - sy) / z));
      snappedW = false;
      snappedH = false;
      if (!ev.altKey) {
        const aligned = alignResize({ x: widget.x, y: widget.y, w: curW, h: curH }, others, bounds, def.minSize);
        ({ w: curW, h: curH } = inDesk(aligned.w, aligned.h));
        snappedW = aligned.snappedW && curW === aligned.w;
        snappedH = aligned.snappedH && curH === aligned.h;
        guides.show(aligned.guides, corner(curW, curH), readout(curW, curH));
      } else {
        guides.show([], corner(curW, curH), readout(curW, curH));
      }
      if (raf != null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        el.style.width = `${curW}px`;
        el.style.height = `${curH}px`;
      });
    };
    gestureEndRef.current?.(false);
    gestureEndRef.current = trackGesture(handle, e.pointerId, move, (commit) => {
      gestureEndRef.current = null;
      if (raf != null) cancelAnimationFrame(raf);
      guides.clear();
      // Back to the size React last rendered: a cancelled resize keeps it, and a
      // committed one is then re-rendered from the patch (React only writes a
      // style it sees change, so a hand-set width would otherwise outlive it).
      el.style.width = `${ow}px`;
      el.style.height = `${oh}px`;
      if (!commit) return;
      const next = inDesk(snappedW ? Math.round(curW) : snap(curW), snappedH ? Math.round(curH) : snap(curH));
      onPatch({ w: next.w, h: next.h });
    });
  };

  const Body = def.component;
  const contentH = collapsed ? 0 : widget.h - 30;

  if (aero) {
    const title = aeroGadgetTitle(widget.type, t(def.titleKey));
    // The toolbar sits outside the gadget's right edge; near the desk's right
    // edge it would be off-screen, so it moves to the left side instead.
    const deskW = deskRef.current?.clientWidth ?? Number.POSITIVE_INFINITY;
    const toolsLeft = widget.x + widget.w + 34 > deskW;
    return (
      <section
        ref={frameRef}
        className={`widget-frame aero-gadget ${focused ? 'focused' : ''} ${blur ? 'blur' : ''} ${collapsed ? 'collapsed' : ''} ${locked ? 'locked' : ''} ${menuOpen ? 'is-menu-open' : ''} ${toolsLeft ? 'aero-gadget--tools-left' : ''} ${keyboardFrom ? 'is-keyboard-moving' : ''}`}
        style={{
          left: widget.x,
          top: widget.y,
          width: widget.w,
          height: collapsed ? 30 : widget.h,
          zIndex: widget.z,
          opacity,
        }}
        aria-label={title}
        tabIndex={keyboardFrom ? -1 : undefined}
        onKeyDown={keyboardFrom ? onKeyboardMove : undefined}
        onBlur={(e) => {
          if (keyboardFrom && !e.currentTarget.contains(e.relatedTarget as Node | null)) setKeyboardFrom(null);
        }}
        onPointerDown={onFocus}
      >
        {collapsed && (
          <div className="widget-bar" title={title} onPointerDown={dragStart} onDoubleClick={() => onPatch({ collapsed: false })}>
            <span className="widget-title">{title}</span>
          </div>
        )}
        {!collapsed && (
          <div className="widget-body">
            <Body settings={widget.settings ?? {}} setSettings={setSettings} size={{ w: widget.w, h: widget.h }} instanceId={widget.id} />
          </div>
        )}
        <div className="aero-gadget-tools" role="toolbar" aria-orientation="vertical" aria-label={t('aeroVista.gadget.toolbar')}>
          <button
            type="button"
            className="aero-gadget-tool is-close"
            title={t('aeroVista.gadget.close')}
            aria-label={t('aeroVista.gadget.close')}
            onClick={(ev) => { ev.stopPropagation(); setMenuOpen(false); onPatch({ hidden: true }); }}
          >
            <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M2 2l6 6M8 2 2 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            ref={optionsRef}
            className="aero-gadget-tool is-options"
            title={t('widgetFrame.options')}
            aria-label={t('widgetFrame.options')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={(ev) => { ev.stopPropagation(); setMenuOpen((o) => !o); }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M8.6 1.4a2.6 2.6 0 0 0-3.2 3.3L1.6 8.5a1 1 0 0 0 1.4 1.4l3.8-3.8a2.6 2.6 0 0 0 3.3-3.2L8.6 4.4 7.6 4.4 7.6 3.4z" fill="currentColor" />
            </svg>
          </button>
          <div
            className={`aero-gadget-grip${locked ? ' is-locked' : ''}`}
            title={locked ? t('widgetFrame.locked') : t('wid6.drag.hintAero', { drag: t('aeroVista.gadget.drag') })}
            onPointerDown={dragStart}
            onDoubleClick={() => onPatch({ collapsed: !collapsed })}
          >
            <i /><i /><i /><i /><i /><i />
          </div>
          {menuOpen && (
            <>
              <div className="widget-menu-backdrop" onPointerDown={(ev) => { ev.stopPropagation(); setMenuOpen(false); }} />
              <div
                ref={menuRef}
                className="widget-menu"
                role="menu"
                aria-label={t('wid7.menu.label', { name: title })}
                onPointerDown={(ev) => ev.stopPropagation()}
                onKeyDown={onMenuKeyDown}
              >
                {wid5MenuItems('menuitem')}
                <button role="menuitem" onClick={() => { onPatch({ locked: !locked }); setMenuOpen(false); }}>{locked ? t('widgetFrame.unlock') : t('widgetFrame.lock')}</button>
                <button role="menuitem" onClick={() => { onPatch({ collapsed: !collapsed }); setMenuOpen(false); }}>{collapsed ? t('widgetFrame.expand') : t('widgetFrame.collapse')}</button>
                <button role="menuitem" onClick={() => { setSettings({ __blur: !blur }); setMenuOpen(false); }}>{blur ? t('aeroVista.gadget.smokedGlass') : t('aeroVista.gadget.clearGlass')}</button>
                <button role="menuitem" onClick={() => { setSettings({ __opacity: opacity > 0.85 ? 0.7 : 1 }); setMenuOpen(false); }}>{opacity > 0.85 ? t('widgetFrame.makeTransparent') : t('widgetFrame.makeSolid')}</button>
                <button role="menuitem" onClick={() => { onDuplicate(); setMenuOpen(false); }}>{t('widgetFrame.duplicate')}</button>
                <button role="menuitem" className="danger" onClick={() => { clearTimer(widget.id); onRemove(); setMenuOpen(false); }}>{t('common.remove')}</button>
              </div>
            </>
          )}
        </div>
        {!collapsed && !locked && <div className="widget-resize" title={t('widgetFrame.resize')} onPointerDown={resizeStart} />}
        {settingsPopover}
        {keyboardHint}
      </section>
    );
  }

  const plainTitle = wired ? wiredWidgetTitle(widget.type, t(def.titleKey)) : t(def.titleKey);
  return (
    <section
      ref={frameRef}
      className={`widget-frame ${focused ? 'focused' : ''} ${blur ? 'blur' : ''} ${collapsed ? 'collapsed' : ''} ${locked ? 'locked' : ''} ${wired && mounting ? 'widget-anim-mounting' : ''} ${keyboardFrom ? 'is-keyboard-moving' : ''}`}
      style={{
        left: widget.x,
        top: widget.y,
        width: widget.w,
        height: collapsed ? 30 : widget.h,
        zIndex: widget.z,
        opacity,
      }}
      tabIndex={keyboardFrom ? -1 : undefined}
      onKeyDown={keyboardFrom ? onKeyboardMove : undefined}
      onBlur={(e) => {
        if (keyboardFrom && !e.currentTarget.contains(e.relatedTarget as Node | null)) setKeyboardFrom(null);
      }}
      onPointerDown={onFocus}
    >
      <div className="widget-bar" title={locked ? undefined : t('wid6.drag.hint')} onPointerDown={dragStart} onDoubleClick={() => onPatch({ collapsed: !collapsed })}>
        <span className="widget-title">{plainTitle}</span>
        <span className="widget-btns">
          {locked && <span className="widget-lock" title={t('widgetFrame.locked')} aria-hidden>⌧</span>}
          <button
            ref={optionsRef}
            className="widget-b"
            title={t('widgetFrame.options')} aria-label={t('widgetFrame.options')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={(ev) => { ev.stopPropagation(); setMenuOpen((o) => !o); }}
          >
            ⋯
          </button>
        </span>
        {menuOpen && (
          <>
            <div className="widget-menu-backdrop" onPointerDown={(ev) => { ev.stopPropagation(); setMenuOpen(false); }} />
            <div
              ref={menuRef}
              className="widget-menu"
              role="menu"
              aria-label={t('wid7.menu.label', { name: plainTitle })}
              onPointerDown={(ev) => ev.stopPropagation()}
              onKeyDown={onMenuKeyDown}
            >
              {wid5MenuItems('menuitem')}
              <button role="menuitem" onClick={() => { onPatch({ locked: !locked }); setMenuOpen(false); }}>{locked ? t('widgetFrame.unlock') : t('widgetFrame.lock')}</button>
              <button role="menuitem" onClick={() => { onPatch({ collapsed: !collapsed }); setMenuOpen(false); }}>{collapsed ? t('widgetFrame.expand') : t('widgetFrame.collapse')}</button>
              <button role="menuitem" onClick={() => { setSettings({ __blur: !blur }); setMenuOpen(false); }}>{blur ? t('widgetFrame.disableBlur') : t('widgetFrame.enableBlur')}</button>
              <button role="menuitem" onClick={() => { setSettings({ __opacity: opacity > 0.85 ? 0.7 : 1 }); setMenuOpen(false); }}>{opacity > 0.85 ? t('widgetFrame.makeTransparent') : t('widgetFrame.makeSolid')}</button>
              <button role="menuitem" onClick={() => { onDuplicate(); setMenuOpen(false); }}>{t('widgetFrame.duplicate')}</button>
              <button role="menuitem" onClick={() => { onPatch({ hidden: true }); setMenuOpen(false); }}>{t('widgetFrame.hide')}</button>
              <button role="menuitem" className="danger" onClick={() => { clearTimer(widget.id); onRemove(); setMenuOpen(false); }}>{t('common.remove')}</button>
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
      {settingsPopover}
      {keyboardHint}
    </section>
  );
}
