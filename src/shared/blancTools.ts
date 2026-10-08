/**
 * Blanc-only tool ids: surfaces the Blanc toolbox has that the shared toolbox
 * registry (`TOOLBOX_MODULES`) does not model. `coverage` established the
 * pattern; the Pillar 2 ports reuse it rather than adding registry entries that
 * Study OS would also read.
 *
 * Lives in `shared/` so the toolbox settings sanitizer can accept these ids in
 * the per-tool preferences that should apply to EVERY tool — hidden, order and
 * the default tool. (Enable/disable stays registry-only: a Blanc-only tool has
 * no "not ready" state to gate.)
 */
export const BLANC_ONLY_TOOL_IDS = [
  'coverage',
  'agent',
  'files',
  'notebook',
  'translate',
  'music',
  'novels',
  'discover',
  'games',
  'immersion',
  'visualizer',
  'local-agent',
  'visual-novels',
] as const;

export type BlancOnlyToolId = (typeof BLANC_ONLY_TOOL_IDS)[number];

export function isBlancOnlyToolId(value: unknown): value is BlancOnlyToolId {
  return typeof value === 'string' && (BLANC_ONLY_TOOL_IDS as readonly string[]).includes(value);
}
