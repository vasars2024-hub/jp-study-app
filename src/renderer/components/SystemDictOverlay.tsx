import { useEffect, useMemo, useState } from 'react';
import DictionaryPopup from './DictionaryPopup';
import SentenceTranslatePopup from './SentenceTranslatePopup';
import './systemDict.css';

/**
 * Renderer for the system-wide dictionary overlay window (`?sysDict=1`).
 *
 * The main process captures a selection from any Windows app, opens a small
 * transparent always-on-top window here, and pushes the query over IPC. We
 * reuse the exact same DictionaryPopup / SentenceTranslatePopup the in-app
 * lookup uses, so the two behave identically. Long / sentence-like text opens
 * the translator; a single word opens the dictionary.
 */

function isSentenceLike(text: string): boolean {
  const t = text.trim();
  return t.length > 24 || /[。．！？!?]/.test(t);
}

export default function SystemDictOverlay() {
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    // Pull whatever the main process already captured (covers the first open,
    // before the query push can race the renderer mount).
    window.api
      .sysDictGetPending()
      .then((q) => {
        if (alive && q) setQuery(q);
      })
      .catch(() => undefined);
    const off = window.api.onSysDictQuery((q) => setQuery(q));
    return () => {
      alive = false;
      off();
    };
  }, []);

  const close = () => void window.api.sysDictClose();

  // Escape dismisses the overlay window (Esc anywhere, not just over the popup).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const translate = useMemo(() => isSentenceLike(query), [query]);

  if (!query.trim()) {
    return <div className="sysdict-overlay sysdict-overlay-empty" />;
  }

  return (
    <div className="sysdict-overlay">
      {translate ? (
        <SentenceTranslatePopup text={query} onClose={close} />
      ) : (
        <DictionaryPopup query={query} x={12} y={12} onClose={close} />
      )}
    </div>
  );
}
