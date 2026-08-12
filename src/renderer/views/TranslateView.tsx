import Icon from '../components/Icons';
import {
  AppChrome,
  StatusBarField,
  StatusBarSpacer,
  Toolbar,
  ToolbarSpacer,
  type MenuBarMenu,
  useAeroMaterials,
} from '../components/ui';
import type { TransLang } from '../translator';
import SentenceAnalysisPanel from '../components/SentenceAnalysisPanel';
import LexiconWorkbenchResults from '../components/lexicon/LexiconWorkbenchResults';
import {
  LANG_LABELS,
  LANG_ORDER,
  PLACEHOLDERS,
  TranslateHistoryList,
  useTranslate,
} from '../components/translate/TranslateContent';
import { useEffect, useRef } from 'react';
import { useT } from '../i18n';
import { onLexiconHandoffStaged, takeLexiconHandoff } from '../lexiconHandoffClient';

export default function TranslateView() {
  const aero = useAeroMaterials();
  const { t } = useT();
  const state = useTranslate();
  const { tab, source, target, input, output, msg, error, busy, run, swap } = state;
  const acceptingHandoffRef = useRef(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('popout') !== 'translate') return;
    acceptingHandoffRef.current = true;
    const claim = (): void => {
      void takeLexiconHandoff('translate').then((result) => {
        if (!acceptingHandoffRef.current || !result.ok || !result.handoff) return;
        state.setTab('translate');
        state.setInput(result.handoff.text);
      });
    };
    claim();
    const off = onLexiconHandoffStaged(claim);
    return () => {
      acceptingHandoffRef.current = false;
      off();
    };
  }, [state.setInput, state.setTab]);

  const menus: MenuBarMenu[] = [
    {
      id: 'file',
      label: t('translate.menu.file'),
      items: [
        {
          id: 'clear',
          label: t('translate.menu.clear'),
          disabled: !input && !output,
          onSelect: state.clear,
        },
      ],
    },
    {
      id: 'tools',
      label: t('translate.menu.tools'),
      items: [
        { id: 'swap', label: t('translate.menu.swap'), onSelect: swap },
        {
          id: 'translate',
          label: t('translate.menu.translate'),
          disabled: busy || !input.trim(),
          onSelect: () => void run(),
        },
      ],
    },
  ];

  const tabBar = (
    <div className="gram-mode-toggle tr-tabs">
      <button
        type="button"
        className={`gram-mode-btn ${tab === 'translate' ? 'active' : ''}`}
        onClick={() => state.setTab('translate')}
      >
        {t('translate.tab.translate')}
      </button>
      <button
        type="button"
        className={`gram-mode-btn ${tab === 'history' ? 'active' : ''}`}
        onClick={() => state.setTab('history')}
      >
        {t('translate.tab.history')}
      </button>
    </div>
  );

  const openNotebook = (): void => {
    window.dispatchEvent(new CustomEvent('os:open', { detail: 'notebook' }));
  };

  const historyPanel = (
    <div className="tr-history">
      <TranslateHistoryList state={state} onOpenNotebook={openNotebook} />
    </div>
  );

  if (aero) {
    return (
      <AppChrome
        menus={menus}
        status={
          <>
            <StatusBarField>
              {LANG_LABELS[source]} to {LANG_LABELS[target]}
            </StatusBarField>
            <StatusBarField>{input.length} source chars</StatusBarField>
            <StatusBarSpacer />
            <StatusBarField live>
              {busy
                ? msg || 'Working'
                : state.state === 'done'
                  ? 'Complete'
                  : state.state === 'error'
                    ? 'Error'
                    : 'Ready'}
            </StatusBarField>
          </>
        }
        className="aero-translate-chrome"
      >
        <div className="aero-translate">
          {tabBar}
          {tab === 'history' ? (
            historyPanel
          ) : (
            <>
              <Toolbar className="aero-translate-toolbar" aria-label="Translation commands">
                <label>
                  From
                  <select value={source} onChange={(e) => state.pickSource(e.target.value as TransLang)}>
                    {LANG_ORDER.filter((l) => l !== target).map((l) => (
                      <option key={l} value={l}>
                        {LANG_LABELS[l]}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="aero-translate-swap" onClick={swap} aria-label="Swap languages" title="Swap languages">
                  <Icon name="globe" size={13} />
                </button>
                <label>
                  To
                  <select value={target} onChange={(e) => state.pickTarget(e.target.value as TransLang)}>
                    {LANG_ORDER.filter((l) => l !== source).map((l) => (
                      <option key={l} value={l}>
                        {LANG_LABELS[l]}
                      </option>
                    ))}
                  </select>
                </label>
                <ToolbarSpacer />
                <button className="aero-translate-run" onClick={() => void run()} disabled={busy || !input.trim()}>
                  {busy ? 'Working...' : 'Translate'}
                </button>
              </Toolbar>

              <div className="aero-translate-workbench">
                <section className="aero-translate-pane">
                  <header>{LANG_LABELS[source]} source</header>
                  <textarea
                    className="aero-translate-textarea"
                    lang={source}
                    value={input}
                    onChange={(e) => state.setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void run();
                    }}
                    placeholder={PLACEHOLDERS[source]}
                  />
                </section>

                <section className="aero-translate-pane">
                  <header>{LANG_LABELS[target]} output</header>
                  <div className="aero-translate-output" lang={target}>
                    {output || <span className="muted">Translation appears here.</span>}
                  </div>
                </section>
              </div>

              {input.trim() && (
                <LexiconWorkbenchResults
                  query={input}
                  lang={source}
                  glossLang={target}
                  lookupAttempt={0}
                  lens="translate"
                />
              )}

              {(busy || error) && (
                <div className="aero-translate-status">
                  {busy && (
                    <>
                      <span className="media-gen-dot" />
                      <span>{msg}</span>
                    </>
                  )}
                  {error && <span className="aero-translate-error">{error}</span>}
                </div>
              )}
            </>
          )}
        </div>
      </AppChrome>
    );
  }

  const classicStatus = (
    <>
      <StatusBarField>TRN / CHANNEL READY</StatusBarField>
      <StatusBarField>
        {LANG_LABELS[source]} → {LANG_LABELS[target]}
      </StatusBarField>
      <StatusBarSpacer />
      <StatusBarField live>
        {busy
          ? msg || 'DECODING'
          : state.state === 'done'
            ? 'DECODE COMPLETE'
            : state.state === 'error'
              ? 'CHANNEL FAULT'
              : 'STANDBY'}
      </StatusBarField>
    </>
  );

  return (
    <AppChrome menus={menus} status={classicStatus} className="tr-chrome">
      <div className="tr-view">
        <div className="view-head">
          <p className="muted">{t('translate.intro')}</p>
          {tabBar}
          {tab === 'translate' && (
            <div className="tr-dir">
              <div className="dict-lang-toggle">
                {LANG_ORDER.filter((l) => l !== target).map((l) => (
                  <button
                    key={l}
                    className={`gram-level-btn ${source === l ? 'active' : ''}`}
                    onClick={() => state.pickSource(l)}
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
                    onClick={() => state.pickTarget(l)}
                  >
                    {LANG_LABELS[l]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {tab === 'history' ? (
          historyPanel
        ) : (
          <>
            <div className="tr-panes">
              <div className="tr-pane">
                <label className="tr-label">{LANG_LABELS[source]}</label>
                <textarea
                  className="tr-textarea"
                  lang={source}
                  value={input}
                  onChange={(e) => state.setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void run();
                  }}
                  placeholder={`${PLACEHOLDERS[source]}  (Ctrl+Enter)`}
                />
              </div>
              <div className="tr-pane">
                <label className="tr-label">{LANG_LABELS[target]}</label>
                <div className="tr-output" lang={target}>
                  {output || <span className="muted">{t('translate.outputPlaceholder')}</span>}
                </div>
              </div>
            </div>

            <div className="tr-actions">
              <button className="btn primary" onClick={() => void run()} disabled={busy || !input.trim()}>
                {busy ? (
                  t('translate.working')
                ) : (
                  <>
                    <Icon name="globe" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
                    {t('translate.menu.translate')}
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

            {input.trim() && (
              <LexiconWorkbenchResults
                query={input}
                lang={source}
                glossLang={target}
                lookupAttempt={0}
                lens="translate"
              />
            )}

            <SentenceAnalysisPanel
              sourceText={state.translatedInput}
              translatedText={output}
              source={source}
              target={target}
            />
          </>
        )}
      </div>
    </AppChrome>
  );
}
