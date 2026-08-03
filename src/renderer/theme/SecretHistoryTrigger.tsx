/**
 * SecretHistoryTrigger — the small easter egg the History log hints at
 * (Phase 5 · M13).
 *
 * Typing "leaf" anywhere outside a text field shows a one-time toast. Mirrors
 * SecretAeroTrigger's typed-word pattern (same `isTypingTarget` guard, same
 * rolling keydown buffer) but does nothing beyond the toast — no theme
 * switch, no reboot, no state but "have I shown this once". `history`'s
 * "second-door" entry hints at the word without spelling it out; the emblem
 * itself (a glass leaf) is the other half of the hint.
 */
import { useCallback, useEffect } from 'react';
import { useT } from '../i18n';

const SEQUENCE = 'leaf';
const KEY = 'jp-os-secret-leaf-v1';

function isTypingTarget(el: EventTarget | null): boolean {
  const n = el as HTMLElement | null;
  if (!n || typeof n.tagName !== 'string') return false;
  return n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.isContentEditable === true;
}

function alreadyFound(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function markFound(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* toast still shows this run even if it can't persist */
  }
}

/** Test/reset hook — also used by the Memory & storage "reset" action. */
export function resetSecretLeaf(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export default function SecretHistoryTrigger(): null {
  const { t } = useT();

  const reveal = useCallback((): void => {
    if (alreadyFound()) return;
    markFound();
    window.dispatchEvent(
      new CustomEvent('os:toast', { detail: { message: t('secretHistory.leaf.found'), kind: 'ok' } }),
    );
  }, [t]);

  useEffect(() => {
    let buf = '';
    const onKey = (e: KeyboardEvent): void => {
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) {
        buf = '';
        return;
      }
      buf = (buf + e.key.toLowerCase()).slice(-SEQUENCE.length);
      if (buf === SEQUENCE) {
        buf = '';
        reveal();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reveal]);

  return null;
}
