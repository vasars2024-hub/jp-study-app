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
  ImmersionSiteSearch,
  ImmersionToolbar,
  IMMERSION_MODE_CYCLE,
  IMMERSION_STARTERS,
  WK_HIGHLIGHT_CSS,
  createWebview,
  useImmersion,
} from '../components/immersion/ImmersionContent';
import VisualNovelPanel from '../components/immersion/VisualNovelPanel';

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
  const [visualNovelsOpen, setVisualNovelsOpen] = useState(false);
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

  const immersionMenus: MenuBarMenu[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'focus-url', label: 'Open location', onSelect: () => { state.urlBarRef.current?.focus(); state.urlBarRef.current?.select(); } },
        { id: 'save-site', label: 'Save site', disabled: !currentUrl, onSelect: () => void state.saveCurrentSite() },
        { id: 'export-library', label: 'Export reader page', disabled: !currentUrl, onSelect: () => void state.exportToLibrary() },
        { id: 'capture-video', label: 'Capture video', disabled: captureBusy || !currentUrl, onSelect: () => void state.captureVideo() },
        { id: 'visual-novels', label: t('immersion.visualNovelLibrary'), onSelect: () => setVisualNovelsOpen(true) },
        { id: 'sep-file', separator: true, label: '' },
        { id: 'open-external', label: 'Open in system browser', disabled: !currentUrl, onSelect: state.openExternal },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        { id: 'mode-live', label: `${mode === 'live' ? '[x] ' : ''}Live`, onSelect: () => state.applyMode('live') },
        { id: 'mode-reader', label: `${mode === 'reader' ? '[x] ' : ''}Live Reader`, onSelect: () => state.applyMode('reader') },
        { id: 'mode-focus', label: `${mode === 'focus' ? '[x] ' : ''}Focus`, onSelect: () => state.applyMode('focus') },
        { id: 'sep-view', separator: true, label: '' },
        {
          id: 'live-lookup',
          label: `${state.liveLookup ? '[x] ' : ''}${state.t('immersion.liveLookupMenu')}`,
          onSelect: () => state.setLiveLookup((v) => !v),
        },
        { id: 'reload', label: 'Reload', disabled: !currentUrl, onSelect: state.reload },
        {
          id: 'close-page',
          label: state.t('immersion.closePage'),
          disabled: !currentUrl,
          onSelect: state.closePage,
        },
        { id: 'toggle-sites', label: showRail ? 'Hide Sites rail' : 'Show Sites rail', onSelect: () => state.setRailOpen((v) => !v) },
      ],
    },
    {
      id: 'sites',
      label: 'Sites',
      items: [
        ...IMMERSION_STARTERS.map((starter) => ({
          id: starter.url,
          label: starter.label,
          onSelect: () => {
            state.setMode('reader');
            state.navigate(starter.url, { mode: 'reader' });
          },
        })),
        { id: 'sep-sites', separator: true, label: '' },
        { id: 'refresh-sites', label: 'Refresh saved sites', onSelect: () => void state.refreshSites() },
      ],
    },
  ];
  const immersionStatus = (
    <>
      <StatusBarField>{MODE_LABELS[mode]}</StatusBarField>
      <StatusBarField>{loading ? 'Loading' : currentUrl ? title : 'Ready'}</StatusBarField>
      {error && <StatusBarField>Reader issue</StatusBarField>}
      <StatusBarSpacer />
      <StatusBarField>{sites.length} sites</StatusBarField>
      {currentUrl && <StatusBarField live>{currentUrl}</StatusBarField>}
    </>
  );

  if (visualNovelsOpen) {
    const panel = <VisualNovelPanel onClose={() => setVisualNovelsOpen(false)} />;
    if (aero && showChrome) {
      return (
        <AppChrome menus={immersionMenus} status={immersionStatus} className="aero-immersion-chrome">
          {panel}
        </AppChrome>
      );
    }
    return <div className="immersion-root">{panel}</div>;
  }

  if (aero && showChrome) {
    return (
      <AppChrome menus={immersionMenus} status={immersionStatus} className="aero-immersion-chrome">
        <div className={`aero-immersion aero-immersion-mode-${mode}`}>
          <Toolbar className="aero-immersion-toolbar">
            <Button size="sm" className="aero-immersion-icon-btn" title="Back" onClick={state.goBack} disabled={histIdx <= 0}>
              <Icon name="chevron" size={14} style={{ transform: 'rotate(180deg)' }} />
            </Button>
            <Button
              size="sm"
              className="aero-immersion-icon-btn"
              title="Forward"
              onClick={state.goForward}
              disabled={histIdx < 0 || histIdx >= history.length - 1}
            >
              <Icon name="chevron" size={14} />
            </Button>
            <Button
              size="sm"
              className="aero-immersion-icon-btn"
              title="Reload"
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
                placeholder="Enter URL or search..."
                spellCheck={false}
                autoComplete="off"
              />
            </form>
            <div className="aero-immersion-mode-seg" role="group" aria-label="View mode">
              {IMMERSION_MODE_CYCLE.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`aero-immersion-mode-btn ${mode === m ? 'active' : ''}`}
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
            <Button size="sm" className="aero-immersion-icon-btn" title="Save site" onClick={() => void state.saveCurrentSite()}>
              <Icon name="bookmark" size={14} />
            </Button>
            <Button size="sm" className="aero-immersion-icon-btn" title="Save as tool" onClick={() => void state.saveCurrentAsTool()}>
              <Icon name="star" size={14} />
            </Button>
            <Button size="sm" className="aero-immersion-icon-btn" title="Export to Library" onClick={() => void state.exportToLibrary()}>
              <Icon name="download" size={14} />
            </Button>
            <Button
              size="sm"
              className="aero-immersion-icon-btn"
              title="Capture video to Media"
              disabled={captureBusy}
              onClick={() => void state.captureVideo()}
            >
              <Icon name="video" size={14} />
            </Button>
            <Button size="sm" className="aero-immersion-icon-btn" title="Open in system browser" onClick={state.openExternal}>
              <Icon name="external" size={14} />
            </Button>
            <Button
              size="sm"
              className={`aero-immersion-icon-btn ${showRail ? 'active' : ''}`}
              title={showRail ? 'Hide library' : 'Show library'}
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
                  <strong>{currentUrl ? title : 'New immersion page'}</strong>
                </div>
                {currentUrl && <span className="aero-immersion-host">{new URL(currentUrl).host}</span>}
              </div>

              <div className="aero-immersion-surface">
                {loading && <div className="aero-immersion-banner">Loading...</div>}
                {error && <div className="aero-immersion-banner error">{error}</div>}
                {status && (
                  <button type="button" className="aero-immersion-banner status" onClick={() => state.setStatus(null)}>
                    {status}
                  </button>
                )}

                {!currentUrl && !loading && (
                  <div className="aero-immersion-empty">
                    <Icon name="globe" size={36} />
                    <p>Open a page to begin immersion reading.</p>
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
                          {s.label}
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
                  <span>Sites</span>
                  <Button size="sm" className="aero-immersion-icon-btn" title="Refresh sites" onClick={() => void state.refreshSites()}>
                    <Icon name="refresh" size={13} />
                  </Button>
                </div>
                {sites.length === 0 && (
                  <p className="aero-immersion-rail-empty">Saved sites appear here. Bookmark any page.</p>
                )}
                <ImmersionSiteSearch state={state} />
                <ul className="aero-immersion-site-list">
                  {state.filteredSites.map((s) => (
                    <li key={s.id}>
                      <button type="button" className="aero-immersion-site" onClick={() => state.navigate(s.url)} title={s.url}>
                        <span className="aero-immersion-site-title">
                          {s.favorite ? 'Pinned - ' : ''}
                          {s.title}
                        </span>
                        <span className="aero-immersion-site-meta">
                          {s.lang !== 'auto' ? s.lang.toUpperCase() + ' - ' : ''}
                          {s.visitCount} visits
                          {s.streakDays > 0 ? ` - ${s.streakDays}d` : ''}
                        </span>
                        {s.completionPct > 0 && (
                          <span className="aero-immersion-site-bar">
                            <span style={{ width: `${s.completionPct}%` }} />
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        className="aero-immersion-site-remove"
                        title="Remove"
                        onClick={() => void window.api.immersionRemoveSite(s.id)}
                      >
                        <Icon name="close" size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
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
    <div className={`immersion-root immersion-mode-${mode}`} data-mode={mode}>
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
              onClick={() => setVisualNovelsOpen(true)}
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
