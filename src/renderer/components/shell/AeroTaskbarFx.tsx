/**
 * AeroTaskbarFx — the Windows 6 taskbar's live behaviour, Aero only.
 * -----------------------------------------------------------------------------
 * Three things the stylesheet cannot do on its own:
 *
 *  1. The cursor-following glow on a task button. `--mx` is written on the
 *     hovered `.os-task-win` (rAF-throttled), and aero-shell.css centres the
 *     button's colour pool on it. No React state, so a pointermove never
 *     re-renders anything.
 *  2. The hover thumbnail: a glass card above the hovered task button with the
 *     window's title, a preview plate in the app's own colour and a close
 *     button. It is a pointer affordance and stays out of the accessibility
 *     tree — every action on it already exists on the entry itself (click,
 *     middle-click, the context menu's Close).
 *  3. Aero Peek: resting on the Show Desktop sliver for half a second adds
 *     `.aero-peek` to `.os-desktop`, which turns every window into a glass
 *     outline. Leaving restores them; clicking still shows the desktop.
 *
 * Everything is delegated from the one taskbar element, so task buttons coming
 * and going need no wiring. Geometry is computed in the taskbar parent's own
 * (unscaled) coordinates, because the Aero desk is a 4:3 frame scaled by
 * `--os-viewport-scale`.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../../i18n';

const PEEK_DELAY_MS = 420;
const PEEK_GRACE_MS = 240;
const DESKTOP_PEEK_MS = 500;
const PEEK_HALF_WIDTH = 96;

interface PeekState {
  id: string;
  title: string;
  x: number;
  bottom: number;
  glow: string;
  canClose: boolean;
}

function localScale(el: HTMLElement): number {
  const rect = el.getBoundingClientRect();
  const s = el.offsetWidth > 0 ? rect.width / el.offsetWidth : 1;
  return Number.isFinite(s) && s > 0 ? s : 1;
}

export default function AeroTaskbarFx({ taskbarRef }: { taskbarRef: RefObject<HTMLElement | null> }) {
  const { t } = useT();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [peek, setPeek] = useState<PeekState | null>(null);
  const peekBtn = useRef<HTMLElement | null>(null);
  const hovered = useRef<HTMLElement | null>(null);
  const showTimer = useRef<number | undefined>(undefined);
  const hideTimer = useRef<number | undefined>(undefined);
  const deskTimer = useRef<number | undefined>(undefined);
  const peekOpen = useRef(false);
  const headIconRef = useRef<HTMLSpanElement>(null);
  const thumbIconRef = useRef<HTMLSpanElement>(null);

  const clearTimer = (ref: { current: number | undefined }): void => {
    if (ref.current !== undefined) window.clearTimeout(ref.current);
    ref.current = undefined;
  };

  const hideNow = useCallback((): void => {
    clearTimer(showTimer);
    clearTimer(hideTimer);
    peekOpen.current = false;
    peekBtn.current = null;
    setPeek(null);
  }, []);

  const showFor = useCallback((btn: HTMLElement): void => {
    const bar = taskbarRef.current;
    const parent = bar?.parentElement;
    if (!bar || !parent || !btn.isConnected) return;
    const scale = localScale(parent);
    const pr = parent.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    const tr = bar.getBoundingClientRect();
    const width = parent.offsetWidth;
    const rawX = (br.left + br.width / 2 - pr.left) / scale;
    const x = Math.min(Math.max(rawX, PEEK_HALF_WIDTH + 4), Math.max(PEEK_HALF_WIDTH + 4, width - PEEK_HALF_WIDTH - 4));
    const bottom = (pr.bottom - tr.top) / scale + 10;
    const title = btn.getAttribute('aria-label') || btn.getAttribute('title') || btn.textContent?.trim() || '';
    const glow = getComputedStyle(btn).getPropertyValue('--icon-c1').trim() || '#7cc4ff';
    const item = btn.closest<HTMLElement>('[data-task-win]');
    peekBtn.current = btn;
    peekOpen.current = true;
    setPeek({
      id: item?.dataset.taskWin ?? title,
      title,
      x,
      bottom,
      glow,
      canClose: !!item?.querySelector('.os-task-close'),
    });
  }, [taskbarRef]);

  const scheduleHide = useCallback((): void => {
    clearTimer(showTimer);
    clearTimer(hideTimer);
    hideTimer.current = window.setTimeout(hideNow, PEEK_GRACE_MS);
  }, [hideNow]);

  // The peek's icons are the task button's own glyph, cloned, so the card shows
  // exactly what the bar shows (the icon pack's glossy plate, when it is on).
  useEffect(() => {
    const src = peekBtn.current?.querySelector('svg');
    for (const slot of [headIconRef.current, thumbIconRef.current]) {
      if (!slot) continue;
      slot.replaceChildren();
      if (src) slot.appendChild(src.cloneNode(true));
    }
  }, [peek]);

  useEffect(() => {
    const bar = taskbarRef.current;
    if (!bar) return undefined;
    setHost(bar.parentElement);
    const desktop = bar.closest<HTMLElement>('.os-desktop') ?? bar.parentElement;
    let raf = 0;
    let glowBtn: HTMLElement | null = null;
    let glowX = 0;

    const endDesktopPeek = (): void => {
      clearTimer(deskTimer);
      desktop?.classList.remove('aero-peek');
    };

    const onOver = (e: PointerEvent): void => {
      const target = e.target as Element | null;
      const showDesktop = target?.closest<HTMLButtonElement>('.os-show-desktop-btn');
      if (showDesktop) {
        if (deskTimer.current === undefined && !showDesktop.disabled) {
          deskTimer.current = window.setTimeout(() => {
            desktop?.classList.add('aero-peek');
          }, DESKTOP_PEEK_MS);
        }
      } else {
        endDesktopPeek();
      }
      const btn = target?.closest<HTMLElement>('.os-task-win') ?? null;
      if (!btn) {
        hovered.current = null;
        if (peekOpen.current) scheduleHide();
        else clearTimer(showTimer);
        return;
      }
      clearTimer(hideTimer);
      if (btn === hovered.current) return;
      hovered.current = btn;
      clearTimer(showTimer);
      if (peekOpen.current) {
        showFor(btn);
      } else {
        showTimer.current = window.setTimeout(() => {
          if (hovered.current === btn) showFor(btn);
        }, PEEK_DELAY_MS);
      }
    };

    const onMove = (e: PointerEvent): void => {
      const btn = (e.target as Element | null)?.closest<HTMLElement>('.os-task-win') ?? null;
      if (!btn) return;
      glowBtn = btn;
      glowX = e.clientX;
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        if (!glowBtn) return;
        const rect = glowBtn.getBoundingClientRect();
        if (rect.width <= 0) return;
        const pct = Math.min(100, Math.max(0, ((glowX - rect.left) / rect.width) * 100));
        glowBtn.style.setProperty('--mx', `${pct.toFixed(1)}%`);
      });
    };

    const onLeave = (): void => {
      hovered.current = null;
      endDesktopPeek();
      if (peekOpen.current) scheduleHide();
      else clearTimer(showTimer);
    };

    const onDown = (e: PointerEvent): void => {
      if ((e.target as Element | null)?.closest('.os-show-desktop-btn')) endDesktopPeek();
      hideNow();
    };

    bar.addEventListener('pointerover', onOver);
    bar.addEventListener('pointermove', onMove);
    bar.addEventListener('pointerleave', onLeave);
    bar.addEventListener('pointerdown', onDown);
    return () => {
      bar.removeEventListener('pointerover', onOver);
      bar.removeEventListener('pointermove', onMove);
      bar.removeEventListener('pointerleave', onLeave);
      bar.removeEventListener('pointerdown', onDown);
      if (raf) window.cancelAnimationFrame(raf);
      endDesktopPeek();
      clearTimer(showTimer);
      clearTimer(hideTimer);
    };
  }, [taskbarRef, showFor, scheduleHide, hideNow]);

  if (!host || !peek) return null;

  return createPortal(
    <div
      className="aero-task-peek"
      aria-hidden="true"
      style={
        {
          '--peek-x': `${peek.x}px`,
          '--peek-bottom': `${peek.bottom}px`,
          '--peek-glow': peek.glow,
        } as CSSProperties
      }
      data-peek-for={peek.id}
      onPointerEnter={() => clearTimer(hideTimer)}
      onPointerLeave={scheduleHide}
    >
      <div className="aero-task-peek-head">
        <span ref={headIconRef} />
        <span className="aero-task-peek-title">{peek.title}</span>
        {peek.canClose && (
          <button
            type="button"
            className="aero-task-peek-close"
            tabIndex={-1}
            aria-label={t('desktop.task.close', { name: peek.title })}
            title={t('desktop.task.close', { name: peek.title })}
            onClick={() => {
              const item = peekBtn.current?.closest('[data-task-win]');
              item?.querySelector<HTMLButtonElement>('.os-task-close')?.click();
              hideNow();
            }}
          >
            ×
          </button>
        )}
      </div>
      <button
        type="button"
        className="aero-task-peek-thumb"
        tabIndex={-1}
        aria-label={peek.title}
        title={peek.title}
        onClick={() => {
          peekBtn.current?.click();
          hideNow();
        }}
      >
        <span ref={thumbIconRef} />
      </button>
    </div>,
    host,
  );
}
