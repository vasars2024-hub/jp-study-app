import { useEffect, useMemo, useState } from 'react';
import DictionaryPopup from './DictionaryPopup';
import SentenceTranslatePopup from './SentenceTranslatePopup';
import Icon from './Icons';
import { Button } from './ui';
import { useT } from '../i18n';
import { draftFromText } from '../../shared/companion';
import { studyLangOfText } from '../../shared/studyLang';
import { getStudyLang } from '../studyEnvironment';
import './systemDict.css';

/**
 * Renderer for the system-wide dictionary overlay window (`?sysDict=1`).
 *
 * The main process captures a selection from any Windows app, opens a small
 * transparent always-on-top window here, and pushes the query over IPC. We
 * reuse the exact same DictionaryPopup / SentenceTranslatePopup the in-app
 * lookup uses, so the two behave identically. Long / sentence-like text opens
 * the translator; a single word opens the dictionary. The companion wheel's
 * "Translate" asks for the translator outright.
 *
 * "Card preview" hands the lookup to the desktop companion's card preview,
 * with the window it came from as the card's source.
 */

function isSentenceLike(text: string): boolean {
  const t = text.trim();
  return t.length > 24 || /[。．！？!?]/.test(t);
}

type Context = { mode: 'auto' | 'translate'; sourceTitle?: string; sourceApp?: string };

export default function SystemDictOverlay() {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const [context, setContext] = useState<Context>({ mode: 'auto' });

  useEffect(() => {
    let alive = true;
    const take = (q: string): void => {
      if (!alive) return;
      setQuery(q);
      // The presentation hints travel beside the query (translate mode, source window).
      window.api
        .sysDictGetContext?.()
        .then((c) => {
          if (alive && c) setContext(c);
        })
        .catch(() => undefined);
    };
    // Pull whatever the main process already captured (covers the first open,
    // before the query push can race the renderer mount).
    window.api
      .sysDictGetPending()
      .then((q) => {
        if (q) take(q);
      })
      .catch(() => undefined);
    const off = window.api.onSysDictQuery((q) => take(q));
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

  const translate = useMemo(() => context.mode === 'translate' || isSentenceLike(query), [context.mode, query]);

  const openPreview = (): void => {
    const draft = draftFromText(query, {
      origin: 'lookup',
      sourceTitle: context.sourceTitle,
      sourceApp: context.sourceApp,
      studyLang: studyLangOfText(query, getStudyLang()),
    });
    if (!draft) return;
    void window.api.companionOpenPreview?.(draft).then((ok) => {
      if (ok) close();
    });
  };

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
      <div className="sysdict-actions">
        <Button size="sm" leftIcon={<Icon name="flashcards" size={16} />} onClick={openPreview} data-sysdict-preview>
          {t('companion.sysdict.preview')}
        </Button>
      </div>
    </div>
  );
}
