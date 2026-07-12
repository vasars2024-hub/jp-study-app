import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../components/Icons';
import { translateTo, onModelProgress, type TransLang } from '../translator';

type State = 'idle' | 'loading' | 'translating' | 'done' | 'error';

// Shared with the Dictionary's 日本語/中文 toggle, so the app has one study language.
const LANG_KEY = 'jp-study-dict-lang';
const SOURCE_KEY = 'jp-study-translate-source';
const TARGET_KEY = 'jp-study-translate-target';

const LANG_LABELS: Record<TransLang, string> = {
  ja: '日本語',
  zh: '中文',
  en: 'English',
  ru: 'Русский',
};

const LANG_ORDER: TransLang[] = ['ja', 'zh', 'en', 'ru'];

const PLACEHOLDERS: Record<TransLang, string> = {
  ja: '日本語を貼り付け / 入力してください…',
  zh: '粘贴或输入中文…',
  en: 'Paste or type English…',
  ru: 'Вставьте или введите русский текст…',
};

export default function TranslateView() {
  const [source, setSource] = useState<TransLang>(() => {
    const saved = localStorage.getItem(SOURCE_KEY) as TransLang | null;
    return saved ?? ((localStorage.getItem(LANG_KEY) as TransLang) || 'ja');
  });
  const [target, setTarget] = useState<TransLang>(
    () => (localStorage.getItem(TARGET_KEY) as TransLang) || 'en',
  );
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [state, setState] = useState<State>('idle');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const startedRef = useRef(false);

  useEffect(() => () => onModelProgress(null), []);

  function pickSource(l: TransLang) {
    const next = l === target ? source : l; // don't let source == target
    setSource(next);
    localStorage.setItem(SOURCE_KEY, next);
    // Keep the Dictionary's study-language toggle in sync for ja/zh.
    if (next === 'ja' || next === 'zh') localStorage.setItem(LANG_KEY, next);
  }

  function pickTarget(l: TransLang) {
    const next = l === source ? target : l;
    setTarget(next);
    localStorage.setItem(TARGET_KEY, next);
  }

  function swap() {
    setSource(target);
    setTarget(source);
    localStorage.setItem(SOURCE_KEY, target);
    localStorage.setItem(TARGET_KEY, source);
    if (target === 'ja' || target === 'zh') localStorage.setItem(LANG_KEY, target);
    setInput(output);
    setOutput(input);
  }

  const run = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setError('');
    setOutput('');
    setState('loading');
    setMsg('Loading the translation model…');
    startedRef.current = false;

    onModelProgress((p) => {
      if (p.status === 'progress' && typeof p.progress === 'number') {
        const f = typeof p.file === 'string' ? p.file.split('/').pop() : 'model';
        setMsg(`Loading model: ${f} — ${Math.round(p.progress)}%`);
      }
    });

    try {
      const result = await translateTo(text, source, target, (prog) => {
        startedRef.current = true;
        setState('translating');
        setMsg(`Translating… ${Math.round(prog * 100)}%`);
      });
      setOutput(result);
      setState('done');
      setMsg('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState('error');
    } finally {
      onModelProgress(null);
    }
  }, [input, source, target]);

  const busy = state === 'loading' || state === 'translating';

  return (
    <div className="tr-view">
      <div className="view-head">
        <p className="muted">
          Offline translation via Qwen3, running on your GPU/CPU. Uses the Qwen3-1.7B model from
          your Downloads folder — no internet needed.
        </p>
        <div className="tr-dir">
          <div className="dict-lang-toggle">
            {LANG_ORDER.filter((l) => l !== target).map((l) => (
              <button
                key={l}
                className={`gram-level-btn ${source === l ? 'active' : ''}`}
                onClick={() => pickSource(l)}
              >
                {LANG_LABELS[l]}
              </button>
            ))}
          </div>
          <button className="tr-swap" onClick={swap} aria-label="Swap languages" title="Swap">
            <Icon name="globe" size={14} />
          </button>
          <div className="dict-lang-toggle">
            {LANG_ORDER.filter((l) => l !== source).map((l) => (
              <button
                key={l}
                className={`gram-level-btn ${target === l ? 'active' : ''}`}
                onClick={() => pickTarget(l)}
              >
                {LANG_LABELS[l]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="tr-panes">
        <div className="tr-pane">
          <label className="tr-label">{LANG_LABELS[source]}</label>
          <textarea
            className="tr-textarea"
            lang={source}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run();
            }}
            placeholder={`${PLACEHOLDERS[source]}  (Ctrl+Enter to translate)`}
          />
        </div>
        <div className="tr-pane">
          <label className="tr-label">{LANG_LABELS[target]}</label>
          <div className="tr-output" lang={target}>
            {output || <span className="muted">Translation appears here.</span>}
          </div>
        </div>
      </div>

      <div className="tr-actions">
        <button className="btn primary" onClick={run} disabled={busy || !input.trim()}>
          {busy ? (
            'Working…'
          ) : (
            <>
              <Icon name="globe" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
              Translate
            </>
          )}
        </button>
        {busy && (
          <div className="tr-status">
            <span className="media-gen-dot" />
            <span className="muted">{msg}</span>
          </div>
        )}
        {error && <div className="media-error tr-error">{error}</div>}
      </div>

      <p className="muted tr-note">
        Powered by Qwen3-1.7B — translates any direction between Japanese, Chinese, English, and
        Russian. Pair with Dictionary for word-level detail. The first run loads the model
        (~10–30s), then it is fast.
      </p>
    </div>
  );
}
