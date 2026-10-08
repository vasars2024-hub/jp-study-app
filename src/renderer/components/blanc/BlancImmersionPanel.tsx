/**
 * Blanc immersion browser panel.
 *
 * One module per Blanc panel: a Blanc lazy chunk is a whole module, so panels
 * that shared a file loaded each other's content stacks (opening Clipboard used
 * to fetch the grammar data set). Pillar 0 still applies — compose the shared
 * content component in Blanc chrome, never a Study OS `*View`, and never
 * import `AppChrome`/`MenuBar`/`StatusBar` here. The Study OS class-name
 * stylesheet these blocks rely on is loaded by the shell's lazy loader
 * (`withStudyOsCompat` in BlancShell.tsx), before first render.
 */
import {
  ImmersionBody,
  ImmersionPopups,
  ImmersionToolbar,
  WK_HIGHLIGHT_CSS,
  useImmersion,
} from '../immersion/ImmersionContent';

/**
 * Pillar 2 port of `ImmersionView` — Blanc previously had only
 * `immersion-tracker` (read-only totals). This is the full browser: live
 * <webview> guest, Reader Mode, the sites rail, and dictionary/translate
 * popups, all feeding the same stats and known-words the tracker reads. It
 * composes the classic (non-aero) immersion blocks inside `blanc-tool-detail`;
 * the toolbar is the classic `immersion-toolbar`, which reads well in Blanc.
 *
 * Live mode depends on the Blanc window enabling the `<webview>` tag; Reader
 * Mode extraction and the sites rail work regardless.
 */
export function BlancImmersionPanel() {
  const state = useImmersion();
  return (
    <div className="blanc-tool-detail blanc-immersion">
      <div className={`immersion-root immersion-mode-${state.mode}`} data-mode={state.mode}>
        {state.showChrome && <ImmersionToolbar state={state} />}
        {state.mode === 'focus' && (
          <button
            type="button"
            className="immersion-focus-exit btn small"
            onClick={() => state.applyMode('reader')}
          >
            {state.t('immersion.exitFocus')}
          </button>
        )}
        <ImmersionBody state={state} />
        <style>{WK_HIGHLIGHT_CSS}</style>
        <ImmersionPopups state={state} />
      </div>
    </div>
  );
}
