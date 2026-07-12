import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { translate, onModelProgress } from '../translator';

interface Props {
  /** The highlighted Japanese text. */
  text: string;
  onClose: () => void;
}

type State = 'loading' | 'translating' | 'done' | 'error';

// Auto-translates a highlighted sentence from the reader — the dictionary
// popup's sibling, for whole phrases instead of single words. Uses the same
// shared offline worker as the Translate view, so the model loads only once.
export default function SentenceTranslatePopup({ text, onClose }: Props) {
  const [state, setState] = useState<State>('loading');
  const [output, setOutput] = useState('');
  const [msg, setMsg] = useState('Preparing translator…');
  const [error, setError] = useState('');
  const reqRef = useRef(0);

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
    setMsg('Preparing translator…');
    onModelProgress((p) => {
      if (p.status === 'progress' && typeof p.progress === 'number') {
        setMsg(`Loading model… ${Math.round(p.progress)}%`);
      }
    });
    const lang = (localStorage.getItem('jp-study-dict-lang') as 'ja' | 'zh') || 'ja';
    translate(text, lang, () => {
      if (id === reqRef.current) {
        setState('translating');
        setMsg('Translating…');
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
      .finally(() => onModelProgress(null));
  }

  useEffect(() => {
    run();
    return () => {
      reqRef.current++; // ignore any in-flight result after unmount
      onModelProgress(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <div className="dict-popup tr-popup" style={style} onMouseDown={(e) => e.stopPropagation()}>
      <div className="dict-head">
        <span className="dict-q tr-popup-src" lang="ja">
          {text}
        </span>
        <button className="dict-x" onClick={onClose} aria-label="Close">
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
          <p className="tr-popup-out" lang="en">
            {output || '—'}
          </p>
        )}
        {state === 'error' && (
          <div className="tr-popup-err">
            <p className="muted">{error}</p>
            <button className="btn small" onClick={run}>
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
