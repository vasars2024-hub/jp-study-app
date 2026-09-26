import { useCallback, useEffect, useState } from 'react';
import Icon, { type IconName } from '../Icons';
import { useT } from '../../i18n';
import {
  wheelIndexForKey,
  type CompanionWheelActionId,
  type CompanionWheelInit,
} from '../../../shared/companion';
import './companion.css';

/**
 * The radial wheel (`?companion=wheel`): study actions around the pointer,
 * over whatever app is in front. The Windows counterpart of the Chrome
 * extension's Alt+Shift+W wheel.
 *
 * Keys 1–8 run the slot with that number (clockwise from the top), the arrow
 * keys move the highlight and Enter runs it, Esc closes; a click outside the
 * ring closes it too (and so does clicking into another app — main hides the
 * window on blur).
 */

/** "Ctrl+Alt+J · Alt+Shift+Q" (the Shortcuts page's own format, without importing its store). */
function chordText(chord: string): string {
  return chord.split('|').map((c) => c.trim()).filter(Boolean).join(' · ');
}

const ICONS: Record<CompanionWheelActionId, IconName> = {
  lookup: 'search',
  cursor: 'eye',
  lens: 'scan',
  preview: 'flashcards',
  sentence: 'bookmark',
  translate: 'translate',
  audio: 'headphones',
  open: 'logo',
};

/** Ring radius, slot size and centre, in CSS px, inside the 300 px wheel. */
const RADIUS = 112;
const SLOT = 60;
const CENTER = 150;

export function slotPosition(index: number, count: number): { left: number; top: number } {
  // Clockwise from 12 o'clock.
  const angle = (index / Math.max(1, count)) * Math.PI * 2 - Math.PI / 2;
  return {
    left: Math.round(CENTER + RADIUS * Math.cos(angle) - SLOT / 2),
    top: Math.round(CENTER + RADIUS * Math.sin(angle) - SLOT / 2),
  };
}

export default function CompanionWheel() {
  const { t } = useT();
  const [init, setInit] = useState<CompanionWheelInit | null>(null);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const take = (next: CompanionWheelInit | null): void => {
      if (!alive) return;
      setInit(next);
      setActive(0);
      setBusy(false);
    };
    window.api.companionGetWheel().then(take).catch(() => undefined);
    const off = window.api.onCompanionWheel(take);
    return () => {
      alive = false;
      off();
    };
  }, []);

  const actions = init?.actions ?? [];

  const run = useCallback(
    (index: number) => {
      const action = actions[index];
      if (!action || busy) return;
      setBusy(true);
      void window.api.companionWheelRun(action.id).finally(() => setBusy(false));
    },
    [actions, busy],
  );

  const close = useCallback(() => void window.api.companionWheelClose(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      const index = wheelIndexForKey(e.key, e.code);
      if (index >= 0 && index < actions.length) {
        e.preventDefault();
        run(index);
        return;
      }
      if (!actions.length) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        setActive((i) => (i + 1) % actions.length);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
        e.preventDefault();
        setActive((i) => (i - 1 + actions.length) % actions.length);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        run(active);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions, active, close, run]);

  const current = actions[active];
  return (
    <div
      className="companion-wheel-root"
      onMouseDown={(e) => {
        // The window is square; only the ring is the wheel. Anything else is "away".
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="companion-wheel" role="menu" aria-label={t('companion.wheel.label')}>
        <div className="companion-wheel-hub" aria-live="polite">
          {current ? (
            <>
              <span className="companion-wheel-hub-label">{t(`companion.wheel.action.${current.id}`)}</span>
              {current.chord && <span className="companion-wheel-hub-chord">{chordText(current.chord)}</span>}
            </>
          ) : null}
        </div>
        {actions.map((action, index) => {
          const pos = slotPosition(index, actions.length);
          return (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              data-wheel-action={action.id}
              className={`companion-wheel-slot${index === active ? ' active' : ''}`}
              style={{ left: pos.left, top: pos.top }}
              aria-label={t(`companion.wheel.action.${action.id}`)}
              aria-keyshortcuts={String(index + 1)}
              disabled={busy}
              onMouseEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              onClick={() => run(index)}
            >
              <Icon name={ICONS[action.id]} size={22} />
              <span className="companion-wheel-key" aria-hidden="true">
                {index + 1}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
