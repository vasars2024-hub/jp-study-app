/**
 * Blanc games arena panel.
 *
 * One module per Blanc panel: a Blanc lazy chunk is a whole module, so panels
 * that shared a file loaded each other's content stacks (opening Clipboard used
 * to fetch the grammar data set). Pillar 0 still applies — compose the shared
 * content component in Blanc chrome, never a Study OS `*View`, and never
 * import `AppChrome`/`MenuBar`/`StatusBar` here. The Study OS class-name
 * stylesheet these blocks rely on is loaded by the shell's lazy loader
 * (`withStudyOsCompat` in BlancShell.tsx), before first render.
 */
import { GameArena } from '../games/GameArenaContent';

/**
 * Pillar 2 port of `GameArenaView` — Blanc previously had only `mono-blocks`.
 * The arena is chrome-free and identical in both shells, so it renders the same
 * `GameArena` implementation, wrapped in Blanc's `blanc-tool-detail`. The arena
 * reuses the app-wide `useT`, deck, level, and progress services, so a game
 * played in Blanc feeds the same XP, streak, and mistake-mining as Study OS.
 */
export function BlancGamesPanel() {
  return (
    <div className="blanc-tool-detail blanc-games">
      {/* Blanc stays neutral: no secret Aero/Wired arcade inside it. */}
      <GameArena includeSecretArcade={false} />
    </div>
  );
}
