import { useCallback, useEffect, useRef, useState } from 'react';
import DictionaryPopup from './DictionaryPopup';
import SentenceTranslatePopup from './SentenceTranslatePopup';
import {
  clearLookupHighlight,
  isLookupClick,
  lookupWordAtPoint,
  lookupWordFromMouseUp,
  noteLookupPointerDown,
  type WordLookupHit,
} from '../wordLookup';
import {
  isModifierTrigger,
  loadGlobalLookupSettings,
  matchesTrigger,
  onGlobalLookupChanged,
  toggleGlobalLookup,
  type GlobalLookupSettings,
} from '../globalLookupSettings';
import { registerCommandHandler } from '../keyboardShortcuts';
import { t } from '../i18n';

/**
 * Module-level `t` (not `useT`) resolves against the live language on every
 * call, so these fire-and-forget toasts stay correct after a language switch
 * without the handler effects re-registering.
 */
function toast(key: string, kind: 'ok' | 'warn' = 'ok'): void {
  window.dispatchEvent(new CustomEvent('os:toast', { detail: { message: t(key), kind } }));
}

/**
 * OS-wide dictionary lookup. The six reader views own a plain click on their own
 * text and mount their own popup; this is the gesture for *everywhere else* —
 * notes, flashcards, grammar examples, subtitle lines, Toolbox output, settings
 * copy. Mounted once per shell alongside ToastHost (see App.tsx), driven purely
 * by window listeners and the shortcut manager, so no view needs prop plumbing.
 *
 * Surfaces that already run their own lookup mark themselves `data-dict-owner`;
 * in plain-click mode we defer to them rather than opening a second popup.
 */

/** Set by a view that handles plain-click lookup itself. */
const OWNER_SEL = '[data-dict-owner]';

/** Never hijack a plain click on these — they have their own click meaning. */
const INTERACTIVE_SEL =
  'a, button, input, textarea, select, option, label, summary, [contenteditable=""], [contenteditable="true"], [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [role="slider"], .btn, .sc-keys';

/** Our own popups, so clicking inside one never re-triggers a lookup. */
const POPUP_SEL = '.dict-popup, .sentence-translate-popup, .translate-popup';

type Popup =
  | { kind: 'dict'; query: string; x: number; y: number; context?: string }
  | { kind: 'translate'; query: string };

function popupFromHit(hit: WordLookupHit): Popup {
  return hit.translate
    ? { kind: 'translate', query: hit.query }
    : { kind: 'dict', query: hit.query, x: hit.x, y: hit.y, context: hit.context };
}

export default function GlobalDictionaryOverlay() {
  const [popup, setPopup] = useState<Popup | null>(null);
  const [settings, setSettings] = useState<GlobalLookupSettings>(loadGlobalLookupSettings);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // A gesture that opened the popup must not be re-read by the closing click.
  const openRef = useRef(false);
  openRef.current = popup !== null;

  useEffect(() => onGlobalLookupChanged(setSettings), []);

  const close = useCallback(() => {
    setPopup(null);
    clearLookupHighlight();
  }, []);

  // --- Mouse gesture -------------------------------------------------------
  useEffect(() => {
    const eligible = (target: EventTarget | null, modifier: boolean): boolean => {
      const el = target instanceof Element ? target : null;
      if (!el) return false;
      if (el.closest(POPUP_SEL)) return false;
      // Shortcut capture fields read raw key/mouse events — stay out of their way.
      if (el.closest('.sc-row, .sc-manual')) return false;
      if (modifier) return true;
      // Plain-click mode is passive: defer to reader views and leave controls alone.
      if (el.closest(OWNER_SEL)) return false;
      if (el.closest(INTERACTIVE_SEL)) return false;
      return true;
    };

    const onDown = (e: MouseEvent) => {
      const { trigger } = settingsRef.current;
      if (!matchesTrigger(e, trigger)) return;
      const modifier = isModifierTrigger(trigger);
      if (!eligible(e.target, modifier)) return;
      noteLookupPointerDown(e);
      if (modifier) {
        // Swallow the gesture so the control underneath never activates and no
        // text selection starts. This is also what lets the modifier gesture
        // work *inside* the readers without racing their own click handler.
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onUp = (e: MouseEvent) => {
      const { trigger, inReaders } = settingsRef.current;
      if (!matchesTrigger(e, trigger)) return;
      const modifier = isModifierTrigger(trigger);
      if (!eligible(e.target, modifier)) return;
      const el = e.target instanceof Element ? e.target : null;
      if (modifier && !inReaders && el?.closest(OWNER_SEL)) return;
      if (modifier) {
        e.preventDefault();
        e.stopPropagation();
      }
      // A click that only dismisses an open popup shouldn't also open a new one.
      if (openRef.current && isLookupClick(e)) {
        close();
        return;
      }
      const hit = modifier
        ? // The modifier gesture suppressed selection, so go straight to the point.
          lookupWordAtPoint(e.clientX, e.clientY)
        : lookupWordFromMouseUp(e);
      if (!hit) {
        if (openRef.current) close();
        return;
      }
      setPopup(popupFromHit(hit));
    };

    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('mouseup', onUp, true);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('mouseup', onUp, true);
    };
  }, [close]);

  // --- Shortcut commands ---------------------------------------------------
  useEffect(() => {
    return registerCommandHandler('dictionary.lookupSelection', () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? '';
      if (!text || sel.rangeCount === 0) {
        toast('dictionary.noSelection');
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const long = text.length > 24 || /[。．！？!?]/.test(text);
      setPopup(
        long
          ? { kind: 'translate', query: text.slice(0, 240) }
          : { kind: 'dict', query: text.slice(0, 40), x: rect.left, y: rect.bottom },
      );
    });
  }, []);

  useEffect(() => {
    return registerCommandHandler('dictionary.lookupClipboard', () => {
      void navigator.clipboard
        .readText()
        .then((raw) => {
          const text = raw.trim();
          if (!text) {
            toast('dictionary.clipboardEmpty');
            return;
          }
          const x = window.innerWidth / 2 - 170;
          const y = window.innerHeight / 3;
          setPopup({ kind: 'dict', query: text.slice(0, 40), x, y });
        })
        .catch(() => toast('dictionary.clipboardFailed', 'warn'));
    });
  }, []);

  // Escape closes the popup. Deliberately not a catalog command: Escape is
  // already the default for flashcards.end and friends, and the shortcut model
  // is one-command-per-chord. Capture + stopPropagation so that while a popup
  // is open Escape dismisses it *instead of* ending the review underneath —
  // and stays inert (no interception at all) when nothing is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !openRef.current) return;
      e.stopPropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [close]);

  useEffect(() => {
    return registerCommandHandler('dictionary.toggleGlobalLookup', () => {
      const next = toggleGlobalLookup();
      toast(
        next.trigger === 'off' ? 'dictionary.globalLookupOff' : 'dictionary.globalLookupOn',
        next.trigger === 'off' ? 'warn' : 'ok',
      );
    });
  }, []);

  // Any view can request a lookup without importing this module.
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ query?: string; x?: number; y?: number; context?: string }>).detail;
      const query = d?.query?.trim();
      if (!query) return;
      setPopup({
        kind: 'dict',
        query: query.slice(0, 40),
        x: d?.x ?? window.innerWidth / 2 - 170,
        y: d?.y ?? window.innerHeight / 3,
        context: d?.context,
      });
    };
    window.addEventListener('dict:lookup', h);
    return () => window.removeEventListener('dict:lookup', h);
  }, []);

  if (!popup) return null;
  if (popup.kind === 'translate') {
    return <SentenceTranslatePopup text={popup.query} onClose={close} />;
  }
  return (
    <DictionaryPopup
      query={popup.query}
      x={popup.x}
      y={popup.y}
      context={popup.context}
      onClose={close}
    />
  );
}
