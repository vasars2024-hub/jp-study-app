import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { translateTo, onModelProgress } from '../translator';
import { KNOWN_LANGS } from '../../shared/langs';
import { useT } from '../i18n';
import { usePopupFocus } from '../popupFocus';
import { openAiSettings } from '../aiSetupClient';

interface Props {
  /** The highlighted Japanese text. */
  text: string;
  /** Save the sentence to the host's collection; shows a visible "Mine" action. */
  onMine?: () => void;
  onClose: () => void;
}

type State = 'loading' | 'translating' | 'done' | 'error';

// Shared with the Translate view and reader collection panel through the one owner
// of that key, so the target language chosen anywhere carries over everywhere else.
import { getTranslateTarget as getTargetLang, setTranslateTarget as setTargetLang } from '../translateTarget';
import { getStudyLang } from '../studyEnvironment';

// Auto-translates a highlighted sentence from the reader — the dictionary
// popup's sibling, for whole phrases instead of single words. Uses the same
// shared offline worker as the Translate view, so the model loads only once.
export default function SentenceTranslatePopup({ text, onMine, onClose }: Props) {
  const { t } = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  usePopupFocus(rootRef);
  const [state, setState] = useState<State>('loading');
  const [output, setOutput] = useState('');
  const [msg, setMsg] = useState(() => t('readerUi.translate.preparing'));
  const [error, setError] = useState('');
  const [targetLang, setTargetLangState] = useState(getTargetLang);
  const reqRef = useRef(0);
  const offModelRef = useRef<(() => void) | null>(null);

  // Docked at the bottom-center of the window so it is always fully visible.
  // Anchoring to the selection was unreliable inside the zoomable, vertical
  // (tategaki) reader iframe and kept pushing the box off the bottom edge.
  const style: CSSProperties = {
    left: '50%',
    right: 'auto',
    top: 'auto',
    bottom: 20,
    transform: 'translateX(-50%)',
    width: 'min(560px, calc(100vw - 32px))',
    maxHeight: 'min(45vh, 380px)',
  };

  function run() {
    const id = ++reqRef.current;
    setState('loading');
    setError('');
    setOutput('');
    setMsg(t('readerUi.translate.preparing'));
    // Unsubscribes only this popup. It used to clear the one global slot, which stopped the
    // Translate view's and the reader's progress mid-load.
    offModelRef.current?.();
    offModelRef.current = onModelProgress((p) => {
      if (id !== reqRef.current) return;
      if (p.status === 'progress' && typeof p.progress === 'number') {
        setMsg(t('readerUi.translate.loadingModel', { pct: Math.round(p.progress) }));
      }
    });
    const lang = getStudyLang();
    translateTo(text, lang, targetLang, () => {
      if (id === reqRef.current) {
        setState('translating');
        setMsg(t('readerUi.translate.translating'));
      }
    })
      .then((res) => {
        if (id !== reqRef.current) return;
        setOutput(res);
        setState('done');
      })
      .catch((e) => {
        if (id !== reqRef.current) return;
        setError(e instanceof Error ? e.message : String(e));
        setState('error');
      })
      .finally(() => {
        offModelRef.current?.();
        offModelRef.current = null;
      });
  }

  useEffect(() => {
    run();
    return () => {
      reqRef.current++; // ignore any in-flight result after unmount
      offModelRef.current?.();
      offModelRef.current = null;
    };
  }, [text, targetLang]);

  function handleTargetLangChange(code: string): void {
    setTargetLangState(code);
    setTargetLang(code);
  }

  return (
    <div
      ref={rootRef}
      className="dict-popup tr-popup"
      style={style}
      role="dialog"
      aria-label={t('readerUi.translate.popupAria', { text: text.slice(0, 60) })}
      tabIndex={-1}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        e.preventDefault();
        onClose();
      }}
    >
      <div className="dict-head">
        <span className="dict-q tr-popup-src" lang="ja">
          {text}
        </span>
        {onMine && (
          <button
            type="button"
            className="btn small dict-mine"
            title={t('readerUi.dictPopup.mineTitle')}
            onClick={onMine}
          >
            {t('readerUi.dictPopup.mine')}
          </button>
        )}
        <button type="button" className="dict-x" onClick={onClose} aria-label={t('common.close')}>
          ×
        </button>
      </div>
      <div className="tr-popup-body">
        {(state === 'loading' || state === 'translating') && (
          <div className="tr-popup-status">
            <span className="media-gen-dot" />
            <span className="muted">{msg}</span>
          </div>
        )}
        {state === 'done' && (
          <p className="tr-popup-out" lang={targetLang}>
            {output || '—'}
          </p>
        )}
        {state === 'error' && (
          <div className="tr-popup-err">
            <p className="muted">{error}</p>
            <button type="button" className="btn small" onClick={run}>
              {t('common.tryAgain')}
            </button>
            {/* The failure is almost always the translator's setup — a model not
                installed, or cloud not configured — and the message names
                Settings > AI, so the way there is one click, not a hunt. */}
            <button type="button" className="btn small" onClick={() => openAiSettings()}>
              {t('readerUi.translate.openAiSettings')}
            </button>
          </div>
        )}
      </div>
      <div className="tr-popup-foot">
        <span className="muted">{t('readerUi.translate.to')}</span>
        <select
          className="tr-popup-lang"
          aria-label={t('readerUi.translate.to')}
          value={targetLang}
          onChange={(e) => handleTargetLangChange(e.target.value)}
        >
          {KNOWN_LANGS.filter((l) => l.code !== 'ja').map((l) => (
            <option key={l.code} value={l.code}>
              {l.nativeLabel}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
