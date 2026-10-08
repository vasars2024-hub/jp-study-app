/**
 * Blanc translate panel.
 *
 * One module per Blanc panel: a Blanc lazy chunk is a whole module, so panels
 * that shared a file loaded each other's content stacks (opening Clipboard used
 * to fetch the grammar data set). Pillar 0 still applies — compose the shared
 * content component in Blanc chrome, never a Study OS `*View`, and never
 * import `AppChrome`/`MenuBar`/`StatusBar` here. The Study OS class-name
 * stylesheet these blocks rely on is loaded by the shell's lazy loader
 * (`withStudyOsCompat` in BlancShell.tsx), before first render.
 */
import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { BLANC_TRANSLATE_REQUEST_EVENT, takePendingBlancTranslate } from './blancMasterSources';
import {
  LANG_LABELS,
  LANG_ORDER,
  PLACEHOLDERS,
  TranslateHistoryList,
  copyText,
  useTranslate,
} from '../translate/TranslateContent';
import type { TransLang } from '../../translator';

/**
 * Pillar 2 port of `TranslateView` — Blanc had no translate surface at all.
 * Shares `useTranslate` and the history list; the panes are Blanc-native.
 */
export function BlancTranslatePanel() {
  const { t } = useT();
  const state = useTranslate();
  const { source, target, input, output, busy, msg, error } = state;

  // The `t <text>` verb: take the text (pending when this panel mounts, or
  // announced while it is open), put it in the source pane and translate it.
  const [requested, setRequested] = useState<string | null>(() => takePendingBlancTranslate());
  useEffect(() => {
    const onRequest = (): void => {
      const text = takePendingBlancTranslate();
      if (text) setRequested(text);
    };
    window.addEventListener(BLANC_TRANSLATE_REQUEST_EVENT, onRequest);
    return () => window.removeEventListener(BLANC_TRANSLATE_REQUEST_EVENT, onRequest);
  }, []);
  const { setInput, setTab, run } = state;
  useEffect(() => {
    if (requested === null) return;
    if (input !== requested) {
      setTab('translate');
      setInput(requested);
      return;
    }
    setRequested(null);
    void run();
  }, [requested, input, setInput, setTab, run]);

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{t('blanc.study.translate.direction')}</legend>
        <div className="blanc-command-row">
          <select
            value={source}
            onChange={(e) => state.pickSource(e.target.value as TransLang)}
            aria-label={t('translate.lang.sourceGroup')}
          >
            {LANG_ORDER.filter((l) => l !== target).map((l) => (
              <option key={l} value={l}>
                {LANG_LABELS[l]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={state.swap}
            title={t('translate.menu.swap')}
            aria-label={t('translate.menu.swap')}
          >
            ⇄
          </button>
          <select
            value={target}
            onChange={(e) => state.pickTarget(e.target.value as TransLang)}
            aria-label={t('translate.lang.targetGroup')}
          >
            {LANG_ORDER.filter((l) => l !== source).map((l) => (
              <option key={l} value={l}>
                {LANG_LABELS[l]}
              </option>
            ))}
          </select>
          <span className="blanc-segmented">
            <button
              type="button"
              className={state.tab === 'translate' ? 'active' : ''}
              onClick={() => state.setTab('translate')}
            >
              {t('translate.tab.translate')}
            </button>
            <button
              type="button"
              className={state.tab === 'history' ? 'active' : ''}
              onClick={() => state.setTab('history')}
            >
              {t('blanc.study.translate.historyCount', { count: state.history.length })}
            </button>
          </span>
        </div>
        <div className="blanc-status-row">
          <span>{t('translate.status.sourceChars', { count: input.length })}</span>
          <span>{t('blanc.study.translate.runsLocally')}</span>
        </div>
      </fieldset>

      {state.tab === 'history' ? (
        <fieldset>
          <legend>{t('translate.tab.history')}</legend>
          <div className="tr-history">
            <TranslateHistoryList
              state={state}
              onOpenNotebook={() =>
                window.dispatchEvent(new CustomEvent('toolbox:open-tool', { detail: 'notebook' }))
              }
            />
          </div>
        </fieldset>
      ) : (
        <>
          <fieldset>
            <legend>{t('translate.pane.sourceHeader', { lang: LANG_LABELS[source] })}</legend>
            <textarea
              lang={source}
              rows={6}
              value={input}
              onChange={(e) => state.setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void state.run();
              }}
              placeholder={t('blanc.study.translate.inputPlaceholder', { hint: PLACEHOLDERS[source] })}
            />
            <div className="blanc-row-actions">
              <button type="button" onClick={() => void state.run()} disabled={busy || !input.trim()}>
                {busy ? t('translate.working') : t('translate.menu.translate')}
              </button>
              <button type="button" onClick={state.clear} disabled={!input && !output}>
                {t('blanc.study.clear')}
              </button>
              {busy && <span className="blanc-note">{msg}</span>}
            </div>
            {error && <p className="blanc-note">{error}</p>}
          </fieldset>

          <fieldset>
            <legend>{t('translate.pane.outputHeader', { lang: LANG_LABELS[target] })}</legend>
            <div className="blanc-output" lang={target}>
              {output || <span className="blanc-note">{t('translate.outputPlaceholder')}</span>}
            </div>
            {output && (
              <div className="blanc-row-actions">
                <button type="button" onClick={() => void copyText(output)}>
                  {t('translate.history.copy')}
                </button>
              </div>
            )}
          </fieldset>
        </>
      )}
    </div>
  );
}
