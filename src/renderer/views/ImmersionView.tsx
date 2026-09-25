// Immersion Browser panel — live guest + Reader Mode, sites rail, dict popup.
// Feeds existing stats / knownWords; does not touch tracking widgets.
//
// The logic and the classic (non-aero) presentation live in
// components/immersion/ImmersionContent so Blanc can compose the full browser
// without importing this *View. Study OS keeps its bespoke aero chrome here,
// driven off the same `useImmersion` hook. See BLANC_REFINEMENT_PLAN.md.

import Icon from '../components/Icons';
import {
  AppChrome,
  Button,
  StatusBarField,
  StatusBarSpacer,
  Toolbar,
  ToolbarSpacer,
  useAeroMaterials,
  useWiredMaterials,
  type MenuBarMenu,
} from '../components/ui';
import { useEffect, useRef, useState } from 'react';
import {
  ImmersionBody,
  ImmersionPopups,
  ImmersionSiteList,
  ImmersionTabStrip,
  ImmersionToolbar,
  IMMERSION_MODE_CYCLE,
  IMMERSION_STARTERS,
  WK_HIGHLIGHT_CSS,
  createWebview,
  useImmersion,
} from '../components/immersion/ImmersionContent';
import { openSectionSurface } from '../sectionSurface';

export default function ImmersionView() {
  const aero = useAeroMaterials();
  const state = useImmersion();
  const {
    t, MODE_LABELS, mode, urlInput, setUrlInput, currentUrl, title, loading, error, status,
    histIdx, history, sites, captureBusy, splitView, showChrome, showRail, readerHtmlProp,
  } = state;

  // §5.13 NODE-FEED tuning: static burst while the webview loads, phosphor
  // settle once it stops. Driven off `loading` so no extra webview listeners.
  const wired = useWiredMaterials();
  const [stageFx, setStageFx] = useState<'tuning' | 'settle' | null>(null);
  const stageFxRef = useRef(stageFx);
  stageFxRef.current = stageFx;
  const stageFxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!wired) {
      setStageFx(null);
      return;
    }
    if (loading) {
      if (stageFxTimer.current) clearTimeout(stageFxTimer.current);
      setStageFx('tuning');
    } else if (stageFxRef.current === 'tuning') {
      setStageFx('settle');
      if (stageFxTimer.current) clearTimeout(stageFxTimer.current);
      stageFxTimer.current = setTimeout(() => setStageFx(null), 320);
    }
  }, [loading, wired]);
  useEffect(() => () => { if (stageFxTimer.current) clearTimeout(stageFxTimer.current); }, []);

  /*
   * D188: this menu bar renders only under `data-materials="aero"`, so no
   * default-theme suite ever mounted it and its labels stayed English in every
   * language — half of them beside a sibling item that already called `t()`.
   * The three mode items take `MODE_LABELS`, the same source the toolbar
   * segment below uses, so the checked item and the segment can never disagree.
   */
  // Visual Novels is its own app now. It used to replace this view behind a
  // `useState(false)` that reset on every close, so leaving the window lost the
  // library selection and the open section with it.
  const openVisualNovels = (): void => {
    openSectionSurface('visualnovels');
  };

  const immersionMenus: MenuBarMenu[] = [
    {
      id: 'file',
      label: t('immersion.aero.menu.file'),
      items: [
        { id: 'focus-url', label: t('immersion.aero.menu.openLocation'), onSelect: () => { state.urlBarRef.current?.focus(); state.urlBarRef.current?.select(); } },
        {
          id: 'save-site',
          label: state.currentBookmark ? t('immersion.bookmark.unstar') : t('immersion.aero.menu.saveSite'),
          disabled: !currentUrl,
          onSelect: () => void state.saveCurrentSite(),
        },
        { id: 'export-library', label: t('immersion.aero.menu.exportReaderPage'), disabled: !currentUrl, onSelect: () => void state.exportToLibrary() },
        { id: 'capture-video', label: t('immersion.aero.menu.captureVideo'), disabled: captureBusy || !currentUrl, onSelect: () => void state.captureVideo() },
        { id: 'visual-novels', label: t('immersion.visualNovelLibrary'), onSelect: openVisualNovels },
        { id: 'sep-file', separator: true, label: '' },
        { id: 'open-external', label: t('immersion.openInSystemBrowser'), disabled: !currentUrl, onSelect: state.openExternal },
      ],
    },
    {
      id: 'view',
      label: t('immersion.aero.menu.view'),
      items: [
        { id: 'mode-live', label: `${mode === 'live' ? '[x] ' : ''}${MODE_LABELS.live}`, onSelect: () => state.applyMode('live') },
        { id: 'mode-reader', label: `${mode === 'reader' ? '[x] ' : ''}${MODE_LABELS.reader}`, onSelect: () => state.applyMode('reader') },
        { id: 'mode-focus', label: `${mode === 'focus' ? '[x] ' : ''}${MODE_LABELS.focus}`, onSelect: () => state.applyMode('focus') },
        { id: 'sep-view', separator: true, label: '' },
        {
          id: 'live-lookup',
          label: `${state.liveLookup ? '[x] ' : ''}${state.t('immersion.liveLookupMenu')}`,
          onSelect: () => state.setLiveLookup((v) => !v),
        },
        { id: 'reload', label: t('immersion.reload'), disabled: !currentUrl, onSelect: state.reload },
        {
          id: 'close-page',
          label: state.t('immersion.closePage'),
          disabled: !currentUrl,
          onSelect: state.closePage,
        },
        {
          id: 'toggle-sites',
          label: showRail ? t('immersion.aero.menu.hideSitesRail') : t('immersion.aero.menu.showSitesRail'),
          onSelect: () => state.setRailOpen((v) => !v),
        },
      ],
    },
    {
      id: 'sites',
      label: t('immersion.sites'),
      items: [
        ...IMMERSION_STARTERS.map((starter) => ({
          id: starter.url,
          label: t(starter.labelKey),
          /* Keep the mode the user chose - see ImmersionContent's starterButton. */
          onSelect: () => state.navigate(starter.url),
        })),
        { id: 'sep-sites', separator: true, label: '' },
        { id: 'refresh-sites', label: t('immersion.aero.menu.refreshSites'), onSelect: () => void state.refreshSites() },
      ],
    },
  ];
  const immersionStatus = (
    <>
      <StatusBarField>{MODE_LABELS[mode]}</StatusBarField>
      <StatusBarField>
        {loading ? t('immersion.aero.status.loading') : currentUrl ? title : t('immersion.aero.status.ready')}
      </StatusBarField>
      {error && <StatusBarField>{t('immersion.status.readerIssue')}</StatusBarField>}
      <StatusBarSpacer />
      <StatusBarField>{t('immersion.aero.status.sitesCount', { count: sites.length })}</StatusBarField>
      {currentUrl && <StatusBarField live>{currentUrl}</StatusBarField>}
    </>
  );

  if (aero && showChrome) {
    return (
      <AppChrome menus={immersionMenus} status={immersionStatus} className="aero-immersion-chrome">
        <div ref={state.rootRef} className={`aero-immersion aero-immersion-mode-${mode}`}>
          <ImmersionTabStrip state={state} />
          <Toolbar className="aero-immersion-toolbar">
            <Button size="sm" className="aero-immersion-icon-btn" title={t('immersion.back')} onClick={state.goBack} disabled={histIdx <= 0}>
              <Icon name="chevron" size={14} style={{ transform: 'rotate(180deg)' }} />
            </Button>
            <Button
              size="sm"
              className="aero-immersion-icon-btn"
              title={t('immersion.forward')}
              onClick={state.goForward}
              disabled={histIdx < 0 || histIdx >= history.length - 1}
            >
              <Icon name="chevron" size={14} />
            </Button>
            <Button
              size="sm"
              className="aero-immersion-icon-btn"
              title={t('immersion.reload')}
              onClick={state.reload}
              disabled={!currentUrl}
            >
              <Icon name="refresh" size={14} />
            </Button>
            {/* This aero toolbar does not render `ImmersionToolbar`, so the reverse of
                opening a page has to exist here too or Study OS's aero immersion surface
                cannot get back to the starter state. */}
            <Button
              size="sm"
              className="aero-immersion-icon-btn aero-immersion-close-page"
              title={state.t('immersion.closePage')}
              onClick={state.closePage}
              disabled={!currentUrl}
            >
              <Icon name="close" size={14} />
            </Button>
            <form
              className="aero-immersion-url-form"
              onSubmit={(e) => {
                e.preventDefault();
                state.navigate(urlInput);
              }}
            >
              <Icon name="globe" size={15} />
              <input
                ref={state.urlBarRef}
                className="aero-immersion-url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                aria-label={t('immersion.urlPlaceholder')}
                placeholder={t('immersion.urlPlaceholder')}
                spellCheck={false}
                autoComplete="off"
              />
            </form>
            <div className="aero-immersion-mode-seg" role="group" aria-label={t('immersion.viewMode.ariaLabel')}>
              {IMMERSION_MODE_CYCLE.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`aero-immersion-mode-btn ${mode === m ? 'active' : ''}`}
                  aria-pressed={mode === m}
                  onClick={() => state.applyMode(m)}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
            <ToolbarSpacer />
            {/* Slice 70: study lookup on the live guest page. This aero toolbar
                does not render `ImmersionToolbar`, so the toggle has to exist
                here too or Study OS's primary immersion surface cannot reach it. */}
            <Button
              size="sm"
              className={`aero-immersion-icon-btn ${state.liveLookup ? 'active' : ''}`}
              aria-pressed={state.liveLookup}
              title={state.liveLookup ? state.t('immersion.liveLookupOn') : state.t('immersion.liveLookupOff')}
              onClick={() => state.setLiveLookup((v) => !v)}
            >
              <Icon name="dictionary" size={14} />
            </Button>
            <Button
              size="sm"
              className={`aero-immersion-icon-btn ${state.currentBookmark ? 'active' : ''}`}
              aria-label={t('immersion.saveSite')}
              aria-pressed={state.currentBookmark !== null}
              title={!currentUrl ? t('immersion.reason.noPage') : state.currentBookmark ? t('immersion.bookmark.unstar') : t('immersion.saveSite')}
              disabled={!currentUrl}
              onClick={() => void state.saveCurrentSite()}
            >
              <Icon name="bookmark" size={14} />
            </Button>
            <Button size="sm" className="aero-immersion-icon-btn" aria-label={t('immersion.saveAsTool')} title={!currentUrl ? t('immersion.reason.noPage') : t('immersion.saveAsTool')} disabled={!currentUrl} onClick={() => void state.saveCurrentAsTool()}>
              <Icon name="star" size={14} />
            </Button>
            <Button size="sm" className="aero-immersion-icon-btn" aria-label={t('immersion.exportToLibrary')} title={!currentUrl ? t('immersion.reason.noPage') : t('immersion.exportToLibrary')} disabled={!currentUrl} onClick={() => void state.exportToLibrary()}>
              <Icon name="download" size={14} />
            </Button>
            <Button
              size="sm"
              className="aero-immersion-icon-btn"
              aria-label={t('immersion.captureVideo')}
              title={!currentUrl ? t('immersion.reason.noPage') : t('immersion.captureVideo')}
              disabled={captureBusy || !currentUrl}
              onClick={() => void state.captureVideo()}
            >
              <Icon name="video" size={14} />
            </Button>
            <Button size="sm" className="aero-immersion-icon-btn" aria-label={t('immersion.openInSystemBrowser')} title={!currentUrl ? t('immersion.reason.noPage') : t('immersion.openInSystemBrowser')} disabled={!currentUrl} onClick={state.openExternal}>
              <Icon name="external" size={14} />
            </Button>
            <Button
              size="sm"
              className={`aero-immersion-icon-btn ${showRail ? 'active' : ''}`}
              title={showRail ? t('immersion.hideLibrary') : t('immersion.showLibrary')}
              onClick={() => state.setRailOpen((v) => !v)}
            >
              <Icon name="folder" size={14} />
            </Button>
          </Toolbar>

          <div className={`aero-immersion-main${showRail ? '' : ' no-rail'}`}>
            <section className={`aero-immersion-stage${splitView ? ' split' : ''}`}>
              <div className="aero-immersion-stage-head">
                <div>
                  <span className="aero-immersion-kicker">{MODE_LABELS[mode]}</span>
                  <strong>{currentUrl ? title : t('immersion.aero.newPage')}</strong>
                </div>
                {currentUrl && <span className="aero-immersion-host">{new URL(currentUrl).host}</span>}
              </div>

              <div className="aero-immersion-surface">
                {loading && <div className="aero-immersion-banner">{t('immersion.loading')}</div>}
                {error && <div className="aero-immersion-banner error">{error}</div>}
                <div className="sr-only" role="status" aria-live="polite">{status ?? ''}</div>
                {status && (
                  <button type="button" className="aero-immersion-banner status" onClick={() => state.setStatus(null)}>
                    {status}
                  </button>
                )}

                {!currentUrl && !loading && (
                  <div className="aero-immersion-empty">
                    <Icon name="globe" size={36} />
                    <p>{t('immersion.openPageToBegin')}</p>
                    <div className="aero-immersion-starters">
                      {IMMERSION_STARTERS.map((s) => (
                        <Button
                          key={s.url}
                          size="sm"
                          onClick={() => {
                            state.setMode('reader');
                            state.navigate(s.url, { mode: 'reader' });
                          }}
                        >
                          {t(s.labelKey)}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {state.showWebview &&
                  createWebview(currentUrl, (el) => {
                    state.webviewRef.current = el;
                  })}

                {state.showReader && readerHtmlProp && (
                  <div
                    ref={state.readerRef}
                    className={`immersion-reader aero-immersion-reader wk-on${splitView ? ' immersion-split-reader' : ''}`}
                    onPointerDown={state.onReaderPointerDown}
                    data-dict-owner=""
                    onMouseUp={state.onReaderMouseUp}
                    dangerouslySetInnerHTML={readerHtmlProp}
                  />
                )}
              </div>
            </section>

            {showRail && (
              <aside className="aero-immersion-rail">
                <div className="aero-immersion-rail-head">
                  <span>{t('immersion.sites')}</span>
                  <Button size="sm" className="aero-immersion-icon-btn" title={t('immersion.refreshSites')} onClick={() => void state.refreshSites()}>
                    <Icon name="refresh" size={13} />
                  </Button>
                </div>
                {/* The shared rail (audit r2 #12/#13): Bookmarks and History as
                    separate lists, the reading-progress bar and the page language,
                    and today's reading stats. Aero keeps its own head above it. */}
                <ImmersionSiteList state={state} />
              </aside>
            )}
          </div>

          <style>{WK_HIGHLIGHT_CSS}</style>
          <ImmersionPopups state={state} />
        </div>
      </AppChrome>
    );
  }

  return (
    <div ref={state.rootRef} className={`immersion-root immersion-mode-${mode}`} data-mode={mode}>
      {showChrome && <ImmersionTabStrip state={state} />}
      {showChrome && (
        <ImmersionToolbar
          state={state}
          overflow={(
            /*
             * Was `.visual-novel-open`, floated over the canvas at `right: 12px;
             * top: 46px; z-index: 4`. See `ImmersionToolbar`'s own comment for the
             * two measured collisions that moved it into the toolbar row — the
             * docked one left the Sites rail's close control dead in the surface's
             * default state. It is still in that row, now inside the row's overflow
             * disclosure: a second destination launcher is not transport, and the
             * width argument that made it an icon button is what the disclosure
             * solves properly. The label comes back with it, since a vertical list
             * gives a glyph no position to carry meaning with.
             */
            <button
              type="button"
              className="btn small visual-novel-open"
              title={t('immersion.visualNovelLibrary')}
              aria-label={t('immersion.visualNovelLibrary')}
              onClick={openVisualNovels}
            >
              <Icon name="novels" size={14} />
              <span>{t('immersion.visualNovelLibrary')}</span>
            </button>
          )}
        />
      )}

      {mode === 'focus' && (
        <button type="button" className="immersion-focus-exit btn small" onClick={() => state.applyMode('reader')}>
          {t('immersion.exitFocus')}
        </button>
      )}

      <ImmersionBody state={state} stageClassName={stageFx ? `is-${stageFx}` : undefined} />

      {/* Inject highlight CSS for reader (mirrors reader settings) */}
      <style>{WK_HIGHLIGHT_CSS}</style>
      <ImmersionPopups state={state} />
    </div>
  );
}
