import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { GRAMMAR } from '../data/grammar';
import { useT } from '../i18n';
import {
  AppChrome,
  StatusBarField,
  StatusBarSpacer,
  useAeroMaterials,
  useWiredMaterials,
} from '../components/ui';
import GrammarPracticePanel from '../components/grammar/GrammarPracticePanel';
import GrammarCurationPanel from '../components/grammar/GrammarCurationPanel';
import GrammarReviewPanel from '../components/grammar/GrammarReviewPanel';
import GrammarExplorer from '../components/grammar/GrammarExplorer';
import {
  GrammarDetail,
  GuidesBrowser,
  parsePracticeDeepLink,
} from '../components/grammar/GrammarContent';
import {
  dedupeGrammarByTitle,
  type PracticeFilters,
} from '../data/grammar/practiceFilters';
import { ContextualSurface } from '../components/liquid/LiquidSurface';
import { clearHandoff, takeHandoffJson } from '../pendingHandoff';
import { consumeGrammarReviewEvent, GRAMMAR_REVIEW_EVENT } from '../grammarDue';

/*
 * `review` is spaced review of due points. The corpus curation tool that used to
 * sit under the "Review" label is `curate` now: it is data upkeep, not study,
 * and a learner looking for their reviews was landing in a triage queue.
 */
type Mode = 'grammar' | 'practice' | 'review' | 'guides' | 'curate';

/**
 * The four modes, in their rendered order, with the i18n key of each label.
 *
 * They were four hand-written `<button>`s with no relationship to the panel they swapped in:
 * no `role`, no `aria-selected`, no `aria-controls`, and four separate tab stops that a
 * keyboard user had to walk through one at a time to reach the content. They are the textbook
 * tab pattern — one visible panel out of four, chosen by a horizontal switcher — so they are
 * now a real APG tablist: `aria-selected` states the choice, `aria-controls` names the panel it
 * reveals, and a roving `tabIndex` plus arrow/Home/End keys makes the whole switcher ONE tab
 * stop, which is the actual behaviour improvement here.
 */
const MODES: ReadonlyArray<{ mode: Mode; labelKey: string }> = [
  { mode: 'grammar', labelKey: 'grammar.mode.points' },
  { mode: 'practice', labelKey: 'grammar.mode.practice' },
  { mode: 'review', labelKey: 'grammar.mode.review' },
  { mode: 'guides', labelKey: 'grammar.mode.guides' },
  { mode: 'curate', labelKey: 'grammar.mode.curate' },
];
const MODE_PANEL_ID = 'gram-mode-panel';
const modeTabId = (mode: Mode) => `gram-mode-tab-${mode}`;

export default function GrammarView() {
  const aero = useAeroMaterials();
  const wired = useWiredMaterials();
  const corpusSize = useMemo(() => dedupeGrammarByTitle(GRAMMAR).length, []);
  const [mode, setMode] = useState<Mode>('grammar');
  const [practiceSeed, setPracticeSeed] = useState<Partial<PracticeFilters> | undefined>();
  const { t } = useT();

  useEffect(() => {
    const openPractice = (detail: unknown) => {
      setPracticeSeed(parsePracticeDeepLink(detail));
      setMode('practice');
    };

    /*
     * Drain first, then listen.
     *
     * This view lives in a `lazy()` chunk behind `Suspense`, so a "practice
     * this" link fired before it mounted found no listener — a `CustomEvent`
     * is not queued, and the link was delivered to nobody with no retry and no
     * error path. Measured cold: dispatched at T+93 ms, mounted at T+691 ms,
     * app left on Grammar points and nothing said. Audit F22.
     *
     * The dispatchers now write a one-shot handoff before opening the section.
     * `takeHandoff` reads and clears in one step, so this cannot double-apply
     * with the listener below, and a second mount cannot replay a link the
     * user already followed.
     */
    const pending = takeHandoffJson<unknown>('grammarPractice');
    if (pending !== null) openPractice(pending);

    const onPractice = (ev: Event) => {
      // Clear any handoff the same call wrote: a mounted view is served by the
      // event, and leaving the handoff behind would re-apply it on remount.
      clearHandoff('grammarPractice');
      openPractice((ev as CustomEvent).detail);
    };
    window.addEventListener('grammar:open-practice', onPractice);
    return () => window.removeEventListener('grammar:open-practice', onPractice);
  }, []);

  // "Review grammar now" from Flashcards / Calendar / Statistics (`grammarDue.ts`):
  // same drain-then-listen order as the practice link above, for the same race.
  useEffect(() => {
    if (takeHandoffJson<unknown>('grammarReview') !== null) setMode('review');
    const onReview = () => {
      consumeGrammarReviewEvent();
      setMode('review');
    };
    window.addEventListener(GRAMMAR_REVIEW_EVENT, onReview);
    return () => window.removeEventListener(GRAMMAR_REVIEW_EVENT, onReview);
  }, []);

  /*
   * Phase 2 removed the theme branch that used to live here. It returned a
   * separate Aero explorer before the mode switch, which made Practice and Test
   * unreachable in that theme and silently swallowed the `grammar:open-practice`
   * deep link. Both explorers are now one component skinned by CSS, so the mode
   * switch below is the only thing that decides what renders.
   */

  /**
   * APG tablist keys. `Home`/`End` are part of the pattern, not extras — with a roving
   * tabIndex the arrows are the ONLY way to reach the other three tabs from the keyboard,
   * so getting this wrong makes three modes unreachable rather than merely awkward.
   * Selection follows focus, which is the right choice here: each panel is already
   * mounted-on-demand and switching is the whole purpose of the control.
   */
  const onModeKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const i = MODES.findIndex((m) => m.mode === mode);
    if (i < 0) return;
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % MODES.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + MODES.length) % MODES.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = MODES.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setMode(MODES[next].mode);
    // The old tab has just lost its tab stop, so focus has to be moved deliberately or it
    // falls to <body> and the next arrow key does nothing at all.
    requestAnimationFrame(() => {
      document.getElementById(modeTabId(MODES[next].mode))?.focus();
    });
  };

  const modeLabel = t(MODES.find((m) => m.mode === mode)?.labelKey ?? 'grammar.mode.points');

  const classicStatus = (
    <>
      {/* The classic tree is shared: WIRED skins it as a diagnostic unit, but
          Aero and the default themes render it too, and a bare "SYN / PARSE
          UNIT READY" leaked terminal fiction into a Vista glass window. */}
      {wired && <StatusBarField>{t('grammar.wired.status.ready')}</StatusBarField>}
      <StatusBarField>{modeLabel}</StatusBarField>
      <StatusBarSpacer />
      {/*
        Deduped, not raw: the Explorer lists the collapsed corpus, and a status
        bar claiming 2,227 next to a list of 1,893 is the same kind of
        unbacked number this redesign has been removing everywhere else.
      */}
      <StatusBarField>{t('grammar.count', { count: corpusSize })}</StatusBarField>
    </>
  );

  return (
    <AppChrome status={classicStatus} className="gram-chrome">
    {/* `gram-view--explorer` bounds the view to its host. A windowed list can only
        window what it can MEASURE, and on a plain block host the list's own viewport
        measures the whole content — so every row renders and the windowing is inert.
        `practice` and `review` were added 2026-09-06. BOTH carry their own
        `VirtualList` and neither had ever been bounded, so the defect this class was
        created to fix was still live in two of the four tabs. Measured in an 820x580
        window, before → after the class:
          practice  `.gx-practice-virtual` 125,322 px with clientHeight === scrollHeight
                    (not a scroller at all), 2,410 checkboxes, 13,544 nodes
                    → 302 px over a 125,320 px range, 22 checkboxes, 365 nodes
          review    706 `.gram-cur-row`s, 93,192 px, 11,343 nodes
                    → 15 rows, a real 289 px scroller over 93,192 px, 292 nodes
        No CSS was needed for either: both panels already declare the height/min-height
        chain that forwards a bound; only the host was missing. Established by a runtime
        control each time — adding the class to the live element produced the second
        number and removing it put the first one back.

        `guides` is the one mode that stays unbounded, and deliberately: it renders one
        prose article, 181 nodes, so a bound would clip rather than window.

        The class name is kept rather than generalised so the existing rules, their
        comment and `grammarExplorerVirtualisation.test.ts` all keep one subject. */}
    <div
      className={`gram-view${mode === 'guides' ? '' : ' gram-view--explorer'}`}
    >
      {/* L5 — contextual, not dense work: one intro line and the mode switch. The
          four mode panels below stay conventional Work; a grammar point's prose and
          its practice form are exactly what §2 keeps off translucent material.
          `ContextualSurface` is inert until this window is put in Liquid
          presentation, so conventional pixels are unchanged. */}
      <ContextualSurface className="view-head">
        <p className="muted">{t('grammar.intro')}</p>
        <div
          className="gram-mode-toggle"
          role="tablist"
          aria-label={t('grammar.mode.legend')}
          onKeyDown={onModeKeyDown}
        >
          {MODES.map(({ mode: m, labelKey }) => (
            <button
              key={m}
              type="button"
              id={modeTabId(m)}
              role="tab"
              aria-selected={mode === m}
              aria-controls={MODE_PANEL_ID}
              // Roving tab stop: only the selected tab is reachable with Tab, and the
              // arrow keys move between them. Four separate stops is what this cost before.
              tabIndex={mode === m ? 0 : -1}
              className={`gram-mode-btn ${mode === m ? 'active' : ''}`}
              onClick={() => setMode(m)}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      </ContextualSurface>

      {/* One panel for all four modes, because only one is ever rendered: a `tabpanel` per
          mode would declare three panels that do not exist. `aria-labelledby` follows the
          selected tab, so the panel announces which mode it is showing. */}
      <div
        id={MODE_PANEL_ID}
        role="tabpanel"
        aria-labelledby={modeTabId(mode)}
        className="gram-mode-panel"
      >
        {mode === 'grammar' ? (
          <GrammarExplorer
            className={aero ? 'gram-x--aero' : ''}
            renderDetail={(point) => <GrammarDetail key={point.id} point={point} />}
          />
        ) : mode === 'practice' ? (
          <GrammarPracticePanel initialFilters={practiceSeed} />
        ) : mode === 'review' ? (
          <GrammarReviewPanel />
        ) : mode === 'curate' ? (
          <GrammarCurationPanel />
        ) : (
          <GuidesBrowser />
        )}
      </div>
    </div>
    </AppChrome>
  );
}
