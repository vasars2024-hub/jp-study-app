import { GameArena } from '../components/games/GameArenaContent';

// The arena is chrome-free and identical in both shells; the implementation
// lives in GameArenaContent so Blanc can compose it without importing a *View.
// See BLANC_REFINEMENT_PLAN.md, "Parallel split".
export default function GameArenaView() {
  return <GameArena />;
}
