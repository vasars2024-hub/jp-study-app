import type { VisualNovelTextKind } from '../../../shared/visualNovel';

/**
 * The capture kinds are kebab-case on the wire but camelCase in the shared
 * `vnAssist.kind.*` catalog set, so a template key cannot resolve them and both
 * the panel and the script-import preview need this explicit map.
 *
 * Holds keys rather than labels: it is module-level data and so cannot call
 * `useT()` at declaration time (CLAUDE.md i18n rule 7). Consumers resolve with
 * `t()` at render time.
 */
export const CAPTURE_KIND_KEYS: Record<VisualNovelTextKind, string> = {
  dialogue: 'vnAssist.kind.dialogue',
  narration: 'vnAssist.kind.narration',
  choice: 'vnAssist.kind.choice',
  'character-name': 'vnAssist.kind.characterName',
  system: 'vnAssist.kind.system',
};
