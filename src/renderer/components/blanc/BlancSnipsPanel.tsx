/**
 * Blanc snips panel.
 *
 * Study OS's Snips app (`SnipsView`) is a one-line wrapper around the shared
 * `SnipPanel` content component; Blanc composes that same component in its own
 * chrome (never the `*View`), in its single-column compact layout, so a snip
 * read while Blanc is the only window lands in the same history and deck.
 */
import SnipPanel from '../snip/SnipPanel';

export function BlancSnipsPanel() {
  return (
    <div className="blanc-tool-detail blanc-snips">
      <SnipPanel compact />
    </div>
  );
}
