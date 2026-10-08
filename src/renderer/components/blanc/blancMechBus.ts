/**
 * The small, always-loaded half of Blanc's mechanics: whether a Flow run is
 * paused (so the top bar can offer "Resume" while the runner's chunk is not on
 * screen) and the open requests for the two overlays. The runner and the inbox
 * themselves are lazy chunks; this file must stay tiny (blancBootGraph).
 */

export type BlancFlowPhase = 'idle' | 'running' | 'paused' | 'done';

export interface BlancFlowStatus {
  phase: BlancFlowPhase;
  /** Cards and steps still ahead in the run (0 outside a run). */
  remaining: number;
}

type Listener = (status: BlancFlowStatus) => void;
const listeners = new Set<Listener>();
let status: BlancFlowStatus = { phase: 'idle', remaining: 0 };

export function getBlancFlowStatus(): BlancFlowStatus {
  return status;
}

export function setBlancFlowStatus(next: BlancFlowStatus): void {
  if (next.phase === status.phase && next.remaining === status.remaining) return;
  status = next;
  for (const listener of listeners) listener(status);
}

export function subscribeBlancFlowStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Ask the shell to open (or resume) the Flow overlay. */
export const BLANC_OPEN_FLOW_EVENT = 'blanc:open-flow';
/** Ask the shell to open the Capture inbox overlay. */
export const BLANC_OPEN_INBOX_EVENT = 'blanc:open-inbox';
/** Quick Notes changed outside the panel (the `n` verb): a warm panel reloads. */
export const BLANC_QUICK_NOTES_EVENT = 'blanc:quick-notes-changed';

export function requestBlancFlow(): void {
  window.dispatchEvent(new CustomEvent(BLANC_OPEN_FLOW_EVENT));
}

export function requestBlancInbox(): void {
  window.dispatchEvent(new CustomEvent(BLANC_OPEN_INBOX_EVENT));
}

/** Test seam. */
export function resetBlancFlowStatusForTests(): void {
  listeners.clear();
  status = { phase: 'idle', remaining: 0 };
}
