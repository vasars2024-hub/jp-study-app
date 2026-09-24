import VisualNovelPanel from '../components/immersion/VisualNovelPanel';

/**
 * The Visual Novels app (desktop section `visualnovels`).
 *
 * The same panel the Immersion window embeds, rendered standalone: no "back to
 * browser" and no in-window title, because the window title already names it.
 * The selected novel and the open tab are persisted by the panel itself, so
 * closing and reopening the app lands where the user left off.
 */
export default function VisualNovelsView() {
  return (
    <div className="immersion-root visual-novels-app">
      <VisualNovelPanel standalone />
    </div>
  );
}
