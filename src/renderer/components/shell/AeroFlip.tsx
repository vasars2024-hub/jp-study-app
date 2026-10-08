/**
 * AeroFlip — a Flip 3D-style window switcher for the Aero desktop.
 *
 * Ctrl+Alt+Tab (and Meta+Tab, where the OS lets the app see it) opens a dimmed
 * glass stage with every open window as a card in a receding 3D stack; the
 * selected card stands at the front. Ctrl+Alt+Space is the fallback chord,
 * because Windows itself claims Ctrl+Alt+Tab and Win+Tab before an app sees
 * them. A `aero:flip3d` window event opens it too, so a taskbar or Start entry
 * can offer it without a key.
 *
 *   Arrows / Tab / wheel   cycle          Enter / Space / click   focus that window
 *   Escape / backdrop      close          focus returns to where it was
 *
 * Reduced motion, Battery Saver, display animations off and Aero safe mode lay
 * the cards out as a flat grid instead of the 3D stack (CSS in aero-vista.css).
 * Mounted by DesktopShell only while the Aero materials are active.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type WheelEvent as RWheelEvent } from 'react';
import Icon, { type IconName } from '../Icons';
import { useT } from '../../i18n';
import { playSound } from '../../audio/soundEngine';
import { captureFocus, isFocusable } from './focusReturn';

export interface AeroFlipCard {
  id: string;
  section: string;
  label: string;
  glyph: IconName;
  z: number;
  min?: boolean;
}

export const AERO_FLIP_EVENT = 'aero:flip3d';

function isOpenChord(e: KeyboardEvent): boolean {
  if (e.key === 'Tab' && e.ctrlKey && e.altKey) return true;
  if (e.key === 'Tab' && e.metaKey && !e.altKey) return true;
  return e.code === 'Space' && e.ctrlKey && e.altKey && !e.shiftKey && !e.metaKey;
}

export default function AeroFlip({ cards, onPick }: { cards: AeroFlipCard[]; onPick: (id: string) => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const selRef = useRef(0);
  selRef.current = sel;
  const stageRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const wheelAt = useRef(0);

  // Front-most window first: the stack opens with the current window in front.
  const ordered = useMemo(() => [...cards].sort((a, b) => b.z - a.z), [cards]);
  const n = ordered.length;
  const orderedRef = useRef(ordered);
  orderedRef.current = ordered;

  const close = useCallback((restore: boolean) => {
    setOpen(false);
    if (restore) {
      const opener = openerRef.current;
      if (isFocusable(opener)) opener.focus();
    }
    openerRef.current = null;
  }, []);

  const step = useCallback((dir: number) => {
    const count = orderedRef.current.length;
    if (count < 2) return;
    setSel((s) => (s + dir + count) % count);
    void playSound('ui', 'navigate', { volume: 0.42 });
  }, []);

  const pick = useCallback(
    (index: number) => {
      const card = orderedRef.current[index];
      close(false);
      if (card) onPick(card.id);
    },
    [close, onPick],
  );

  const show = useCallback(() => {
    if (orderedRef.current.length === 0) return;
    // Never over the lock screen: the switcher would show what the lock hides.
    if (document.querySelector('.lockscreen')) return;
    openerRef.current = captureFocus();
    // Start on the window just behind the front one, the way Flip opens ready
    // to switch; with one window there is nothing behind it.
    setSel(orderedRef.current.length > 1 ? 1 : 0);
    setOpen(true);
  }, []);

  // Opening chords (only while closed; once open the stage handles its keys).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isOpenChord(e)) return;
      e.preventDefault();
      e.stopPropagation();
      if (open) step(e.shiftKey ? -1 : 1);
      else show();
    };
    const onEvent = () => {
      if (!open) show();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener(AERO_FLIP_EVENT, onEvent);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener(AERO_FLIP_EVENT, onEvent);
    };
  }, [open, show, step]);

  // While open: own the keyboard so nothing behind the stage reacts.
  useEffect(() => {
    if (!open) return;
    stageRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (isOpenChord(e)) return; // handled above
      let handled = true;
      switch (e.key) {
        case 'Escape':
          close(true);
          break;
        case 'ArrowRight':
        case 'ArrowDown':
          step(1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          step(-1);
          break;
        case 'Tab':
          step(e.shiftKey ? -1 : 1);
          break;
        case 'Enter':
        case ' ':
          pick(selRef.current);
          break;
        default:
          handled = false;
      }
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, close, step, pick]);

  // A window closing underneath the stage must not leave the selection dangling.
  useEffect(() => {
    if (!open) return;
    if (n === 0) close(true);
    else if (sel >= n) setSel(n - 1);
  }, [open, n, sel, close]);

  if (!open || n === 0) return null;

  const onWheel = (e: RWheelEvent) => {
    const now = performance.now();
    if (now - wheelAt.current < 90) return;
    wheelAt.current = now;
    step(e.deltaY > 0 ? 1 : -1);
  };

  const active = ordered[sel];

  return (
    <div className="aero-flip" onWheel={onWheel}>
      <div className="aero-flip-backdrop" onPointerDown={() => close(true)} />
      <div
        ref={stageRef}
        className="aero-flip-stage"
        role="listbox"
        tabIndex={-1}
        aria-label={t('aeroVista.flip.label')}
        aria-activedescendant={active ? `aero-flip-card-${active.id}` : undefined}
      >
        <div className="aero-flip-stack" style={{ ['--n' as string]: n }}>
          {ordered.map((card, i) => {
            const k = (i - sel + n) % n;
            return (
              <div
                key={card.id}
                id={`aero-flip-card-${card.id}`}
                role="option"
                aria-selected={k === 0}
                className={`aero-flip-card app-${card.section}${k === 0 ? ' is-front' : ''}${card.min ? ' is-min' : ''}`}
                style={{ ['--k' as string]: k, ['--i' as string]: i }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => (k === 0 ? pick(i) : setSel(i))}
              >
                <div className="aero-flip-card-bar">
                  <Icon name={card.glyph} size={14} />
                  <span>{card.label}</span>
                </div>
                <div className="aero-flip-card-body">
                  <span className="aero-flip-card-plate">
                    <Icon name={card.glyph} size={44} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="aero-flip-caption" aria-hidden="true">
        <strong>{active?.label}</strong>
        <span>{t('aeroVista.flip.hint')}</span>
      </div>
    </div>
  );
}
