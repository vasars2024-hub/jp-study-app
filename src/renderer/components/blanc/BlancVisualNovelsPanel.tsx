/**
 * Blanc visual-novels panel.
 *
 * Study OS's Visual Novels app (`VisualNovelsView`) is a three-line wrapper
 * around the shared `VisualNovelPanel` content component, which carries the
 * whole surface — library, capture setup, the reader overlay, routes and
 * mining — and persists its own selection. Blanc composes that same component
 * in its own chrome, never the `*View`, so a novel mined here lands in the same
 * deck and progress store as in Study OS.
 */
import VisualNovelPanel from '../immersion/VisualNovelPanel';

export function BlancVisualNovelsPanel() {
  return (
    <div className="blanc-tool-detail blanc-visual-novels">
      <div className="immersion-root visual-novels-app">
        <VisualNovelPanel standalone />
      </div>
    </div>
  );
}
