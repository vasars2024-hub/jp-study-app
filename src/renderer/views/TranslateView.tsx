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
import { ContextualSurface } from '../components/liquid/LiquidSurface';
import {
  LANG_LABELS,
  LANG_ORDER,
  PLACEHOLDERS,
  TranslateHistoryList,
  handleTranslateHotkey,
  useTranslate,
} from '../components/translate/TranslateContent';
import TranslateStudyPanel, { TranslateOptionsBar } from '../components/translate/TranslateStudyPanel';
import { useEffect, useId, useRef, useState } from 'react';
import { useT } from '../i18n';
import { AGENT_NAVIGATION_SECTION_LABEL_KEYS } from '../../shared/agentNavigation';
import {
  handOffToAgent,
  routeAgentContext,
  translateSpanAgentContext,
} from '../agentContextHandoff';
import { onLexiconHandoffStaged, takeLexiconHandoff } from '../lexiconHandoffClient';
import { AiModelInstallControl } from '../components/ai/AiModelInstall';
import { openNoteViewer } from '../components/notes/NoteViewer';

/**
 * Translate's end of L5 bullet 1's selection contract.
 *
 * A `span` is the selection kind both Translate and Agent use, and here it is
 * literally the range highlighted in the source textarea — falling back to the
 * whole input when nothing is highlighted, because "ask about this" with no
 * selection plainly means the text on screen. The label says which of the two
 * happened rather than sending one silently as the other.
 *
 * The producer classifies it `selected-text`, so the agent store keeps it in
 * session memory and never writes it to disk: it is the user's own material, not
 * reference data. That decision lives in `SELECTION_AGENT_KIND`, not here.
 */
/**
 * The install control the old "install Qwen3 via Translate" messages promised
 * and this view never had. Shown under a failed translation only when the
 * offline model is actually missing — asked of main, not guessed from the text.
 */
function TranslateModelInstall() {
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let alive = true;
    void window.api.translateStatus()
      .then((status) => { if (alive) setMissing(!status.modelFound); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return missing ? <AiModelInstallControl /> : null;
}

function TranslateAskAgent({
  selection,
  input,
  source,
  className,
}: {
  selection: string;
  input: string;
  source: TransLang;
  className: string;
}) {
  const { t } = useT();
  const span = (selection.trim() || input.trim());
  const fromSelection = selection.trim().length > 0;
  return (
    <button data-ai-entry
      type="button"
      className={className}
      disabled={!span}
      // Disabled is honest only when the surface says what would enable it. Without this the
      // control is a mute pair: nothing on screen explains why it cannot be pressed, because its
      // only neighbour is a button labelled "Translate". Same shape as the Grammar filter's
      // "Give the filter a name first." Not set when enabled, where it would just be noise.
      title={span ? undefined : t('translate.askAgent.needsText')}
      onClick={() => {
        void handOffToAgent(
          translateSpanAgentContext(span, source),
          // 40, matching the media-cue and visual-novel producers rather than
          // inventing a third bound. A conversation TITLE is persisted even when
          // its context item is refused retention, so this slice is the one part
          // of a `personal` span that does reach disk — it stays as short as the
          // neighbouring producers already settled on.
          t('agent.conversation.fromTranslate', { label: span.slice(0, 40) }),
          routeAgentContext('translate', t(AGENT_NAVIGATION_SECTION_LABEL_KEYS.translate)),
        );
      }}
    >
      {fromSelection ? t('translate.askAgent.selection') : t('translate.askAgent')}
    </button>
  );
}

export default function TranslateView() {
  const aero = useAeroMaterials();
  const { t } = useT();
  const state = useTranslate();
  const { tab, source, target, input, output, msg, error, busy, run, swap } = state;
  const acceptingHandoffRef = useRef(false);
  // Register row D14. Both pane captions were `<label>` elements with no `for`, so
  // the input's only accessible name was its placeholder and the output pane had
  // none at all. The captions already carry the right words; they just needed to be
  // attached to the things they caption.
  const paneId = useId();
  const sourceLabelId = `${paneId}-tr-source-label`;
  const targetLabelId = `${paneId}-tr-target-label`;
  // Read from `onSelect` rather than from the element at click time: focusing the
  // button is a `focusout` on the textarea in React's synthetic model, and reading
  // the range there has already produced stale spans elsewhere in this repo.
  const [selection, setSelection] = useState('');
  const onSourceSelect = (e: { currentTarget: HTMLTextAreaElement }): void => {
    const el = e.currentTarget;
    setSelection(el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0));
  };

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
        {
          id: 'copy-result',
          label: t('xlate.copyResult'),
          disabled: state.state !== 'done' || !output,
          onSelect: state.copyResult,
        },
        {
          id: 'mine-result',
          label: t('xlate.mineSentence'),
          disabled: state.state !== 'done' || !output,
          onSelect: state.mineResult,
        },
      ],
    },
  ];

  /*
   * Register row D6. These two carried the `active` class and nothing else, so
   * a screen reader announced the open tab exactly as it announced the shut one.
   *
   * `aria-pressed` rather than the `role="tab"` set `GrammarView` uses with the
   * same class: this bar is rendered into BOTH the Aero and the classic branch,
   * and in the classic one the content it switches is two sibling regions
   * (`tr-dir` and the history panel), not one element — so there is no single
   * node a `tabpanel`/`aria-controls` pair could honestly point at. The language
   * pickers below are a genuine `radiogroup` and already say so.
   */
  const tabBar = (
    <div className="gram-mode-toggle tr-tabs">
      <button
        type="button"
        aria-pressed={tab === 'translate'}
        className={`gram-mode-btn ${tab === 'translate' ? 'active' : ''}`}
        onClick={() => state.setTab('translate')}
      >
        {t('translate.tab.translate')}
      </button>
      <button
        type="button"
        aria-pressed={tab === 'history'}
        className={`gram-mode-btn ${tab === 'history' ? 'active' : ''}`}
        onClick={() => state.setTab('history')}
      >
        {t('translate.tab.history')}
      </button>
    </div>
  );

  // The saved note itself, in the note viewer; Files only if it is gone.
  const openNotebook = (noteId: string): void => {
    if (!openNoteViewer(noteId)) window.dispatchEvent(new CustomEvent('os:open', { detail: 'files' }));
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
              {t('translate.status.pair', {
                source: LANG_LABELS[source],
                target: LANG_LABELS[target],
              })}
            </StatusBarField>
            <StatusBarField>{t('translate.status.sourceChars', { count: input.length })}</StatusBarField>
            <StatusBarSpacer />
            <StatusBarField live>
              {busy
                ? msg || t('translate.working')
                : state.state === 'done'
                  ? t('translate.status.complete')
                  : state.state === 'error'
                    ? t('translate.status.error')
                    : t('translate.status.ready')}
            </StatusBarField>
          </>
        }
        className="aero-translate-chrome"
      >
        <div className="aero-translate" onKeyDown={(e) => handleTranslateHotkey(e, state)}>
          {tabBar}
          {tab === 'history' ? (
            historyPanel
          ) : (
            <>
              <Toolbar className="aero-translate-toolbar" aria-label={t('translate.toolbar.label')}>
                <label>
                  {t('translate.lang.from')}
                  <select value={source} onChange={(e) => state.pickSource(e.target.value as TransLang)}>
                    {LANG_ORDER.filter((l) => l !== target).map((l) => (
                      <option key={l} value={l}>
                        {LANG_LABELS[l]}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="aero-translate-swap"
                  onClick={swap}
                  aria-label={t('translate.menu.swap')}
                  title={t('translate.menu.swap')}
                >
                  <Icon name="swap" size={13} />
                </button>
                <label>
                  {t('translate.lang.to')}
                  <select value={target} onChange={(e) => state.pickTarget(e.target.value as TransLang)}>
                    {LANG_ORDER.filter((l) => l !== source).map((l) => (
                      <option key={l} value={l}>
                        {LANG_LABELS[l]}
                      </option>
                    ))}
                  </select>
                </label>
                <ToolbarSpacer />
                <button
                  className="aero-translate-run"
                  onClick={() => void run()}
                  disabled={busy || !input.trim()}
                  title={!busy && !input.trim() ? t('translate.run.needsText') : undefined}
                >
                  {busy ? t('translate.working') : t('translate.menu.translate')}
                </button>
                <TranslateAskAgent
                  selection={selection}
                  input={input}
                  source={source}
                  className="aero-translate-run tr-ask-agent"
                />
              </Toolbar>

              <div className="aero-translate-workbench">
                <section className="aero-translate-pane">
                  <header>{t('translate.pane.sourceHeader', { lang: LANG_LABELS[source] })}</header>
                  <textarea
                    className="aero-translate-textarea"
                    lang={source}
                    value={input}
                    onChange={(e) => {
                      setSelection('');
                      state.setInput(e.target.value);
                    }}
                    onSelect={onSourceSelect}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        void run();
                      }
                    }}
                    placeholder={PLACEHOLDERS[source]}
                  />
                </section>

                <section className="aero-translate-pane">
                  <header>{t('translate.pane.outputHeader', { lang: LANG_LABELS[target] })}</header>
                  {/* `aria-live`: the result arrives asynchronously into a div
                      nothing announces, so with a screen reader the translation
                      simply appears and the user is never told. `polite` because
                      it must not interrupt, `atomic` because a partial re-read of
                      a sentence is worse than none. */}
                  <div className="aero-translate-output" lang={target} aria-live="polite" aria-atomic="true">
                    {output || <span className="muted">{t('translate.outputPlaceholder')}</span>}
                  </div>
                </section>
              </div>

              <TranslateOptionsBar state={state} />
              <TranslateStudyPanel state={state} />

              {input.trim() && (
                <LexiconWorkbenchResults
                  query={input}
                  lang={source}
                  glossLang={target}
                  lookupAttempt={0}
                  lens="translate"
                />
              )}

              {/* The sentence analysis (particles, formality, declension, measure
                  words) was missing from the Aero layout entirely. */}
              <SentenceAnalysisPanel
                sourceText={state.translatedInput}
                translatedText={output}
                source={source}
                target={target}
              />

              {(busy || error) && (
                <div className="aero-translate-status">
                  {busy && (
                    <>
                      <span className="media-gen-dot" />
                      <span>{msg}</span>
                    </>
                  )}
                  {error && <span className="aero-translate-error" role="alert">{error}</span>}
                  {error && (
                    <button type="button" className="aero-translate-run" onClick={() => void run()} disabled={!input.trim()}>
                      {t('xlate.retry')}
                    </button>
                  )}
                  {error && <TranslateModelInstall />}
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
      <StatusBarField>{t('translate.wired.status.ready')}</StatusBarField>
      <StatusBarField>
        {LANG_LABELS[source]} → {LANG_LABELS[target]}
      </StatusBarField>
      <StatusBarSpacer />
      <StatusBarField live>
        {busy
          ? msg || t('translate.wired.status.decoding')
          : state.state === 'done'
            ? t('translate.wired.status.done')
            : state.state === 'error'
              ? t('translate.wired.status.fault')
              : t('translate.wired.status.standby')}
      </StatusBarField>
    </>
  );

  return (
    <AppChrome menus={menus} status={classicStatus} className="tr-chrome">
      <div className="tr-view" onKeyDown={(e) => handleTranslateHotkey(e, state)}>
        {/* L5 — contextual, not dense work: the intro line, the tab bar and the
            direction toggle. The panes below stay conventional Work; a textarea
            someone is composing in, its output, and the analysis and workbench
            results are exactly what §2 keeps off translucent material — and so is
            `.tr-actions`, because a translucent error line is a legibility risk,
            not a contextual tool. `ContextualSurface` is inert until this window is
            put in Liquid presentation, so conventional pixels are unchanged. */}
        <ContextualSurface className="view-head">
          <p className="muted">{t('translate.intro')}</p>
          {tabBar}
          {tab === 'translate' && (
            <div className="tr-dir">
              {/* Each row is ONE choice out of N, not N unrelated buttons — a screen
                  reader was announcing six plain buttons with no hint that picking
                  one unpicks another. The repo already spells this pattern out five
                  times (LensClipboardPassage, ReadingLensOverlay, AiAnalysisSection
                  ×2, FormalityToggle): radiogroup + role=radio + aria-checked, no
                  roving tabindex. */}
              <div
                className="dict-lang-toggle"
                role="radiogroup"
                aria-label={t('translate.lang.sourceGroup')}
              >
                {LANG_ORDER.filter((l) => l !== target).map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="radio"
                    aria-checked={source === l}
                    className={`gram-level-btn ${source === l ? 'active' : ''}`}
                    onClick={() => state.pickSource(l)}
                  >
                    {LANG_LABELS[l]}
                  </button>
                ))}
              </div>
              <button
                // 30x32 rendered, so it is 2px short of the 32px pointer floor on
                // its narrow axis. `.lq-hit` reaches the floor without resizing an
                // icon button that is deliberately square-ish; its neighbours are
                // 10px away (`.tr-dir` gap), so the expander steals nothing.
                className="tr-swap lq-hit"
                onClick={swap}
                aria-label={t('translate.menu.swap')}
                title={t('translate.menu.swap')}
              >
                <Icon name="swap" size={14} />
              </button>
              <div
                className="dict-lang-toggle"
                role="radiogroup"
                aria-label={t('translate.lang.targetGroup')}
              >
                {LANG_ORDER.filter((l) => l !== source).map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="radio"
                    aria-checked={target === l}
                    className={`gram-level-btn ${target === l ? 'active' : ''}`}
                    onClick={() => state.pickTarget(l)}
                  >
                    {LANG_LABELS[l]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </ContextualSurface>

        {tab === 'history' ? (
          historyPanel
        ) : (
          <>
            <div className="tr-panes">
              <div className="tr-pane">
                <label className="tr-label" id={sourceLabelId} htmlFor={`${paneId}-tr-source`}>
                  {LANG_LABELS[source]}
                </label>
                <textarea
                  id={`${paneId}-tr-source`}
                  className="tr-textarea"
                  lang={source}
                  value={input}
                  onChange={(e) => {
                    setSelection('');
                    state.setInput(e.target.value);
                  }}
                  onSelect={onSourceSelect}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      void run();
                    }
                  }}
                  placeholder={`${PLACEHOLDERS[source]}  (Ctrl+Enter)`}
                />
              </div>
              <div className="tr-pane">
                {/*
                  * The output is a `<div>`, not a form control, so `htmlFor` cannot
                  * reach it — it gets `role="group"` + `aria-labelledby` instead, which
                  * is what gives the announced result a name rather than arriving bare.
                  */}
                <span className="tr-label" id={targetLabelId}>
                  {LANG_LABELS[target]}
                </span>
                <div
                  className="tr-output"
                  role="group"
                  aria-labelledby={targetLabelId}
                  lang={target}
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {output || <span className="muted">{t('translate.outputPlaceholder')}</span>}
                </div>
              </div>
            </div>

            <div className="tr-actions">
              <button
                className="btn primary"
                onClick={() => void run()}
                disabled={busy || !input.trim()}
                // `busy` already announces itself — the label becomes "Working…" and `.tr-status`
                // renders below — so only the empty-input case needs naming.
                title={!busy && !input.trim() ? t('translate.run.needsText') : undefined}
              >
                {busy ? (
                  t('translate.working')
                ) : (
                  <>
                    <Icon name="translate" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
                    {t('translate.menu.translate')}
                  </>
                )}
              </button>
              <TranslateAskAgent
                selection={selection}
                input={input}
                source={source}
                className="btn tr-ask-agent"
              />
              {/* The default theme renders no menu bar, so File › Clear was the only
                  way to empty the panes and it was unreachable there. */}
              <button
                type="button"
                className="btn ghost tr-clear"
                onClick={state.clear}
                disabled={!input && !output}
                title={!input && !output ? t('translate.clear.nothing') : undefined}
              >
                {t('translate.menu.clear')}
              </button>
              {busy && (
                <div className="tr-status">
                  <span className="media-gen-dot" />
                  <span className="muted">{msg}</span>
                </div>
              )}
              {error && <div className="media-error tr-error" role="alert">{error}</div>}
              {error && (
                <button type="button" className="btn" onClick={() => void run()} disabled={!input.trim()}>
                  {t('xlate.retry')}
                </button>
              )}
              {error && <TranslateModelInstall />}
            </div>

            <TranslateOptionsBar state={state} />
            <TranslateStudyPanel state={state} />

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
