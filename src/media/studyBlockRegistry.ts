/**
 * Every feature in the study player, as a Study Block.
 *
 * One table, one shape, no engine changes needed to add a block — that is the
 * acceptance criterion this file answers ("the code is structured so new Study Blocks
 * can be added without redesigning the entire player").
 *
 * ## `availability` is not decoration
 *
 * `docs/redesign/LIQUID_WORKSPACE_AUDIT.md` §2.7 measured which of the prompt's blocks
 * actually exist in the player. Three answers were possible and all three are recorded
 * here rather than smoothed over:
 *
 *   · `implemented` — the player owns it today (video, subtitles, transcript, mining…).
 *   · `app-owned`   — the feature is REAL and lives elsewhere in this app (Notes,
 *     Bookmarks, OCR, Library, Statistics). The block routes to that surface. It does
 *     not re-implement it, and it does not pretend the player already had it.
 *   · `planned`     — Playlist, Waveform, and pronunciation SCORING do not exist in any
 *     form. They are registered so a workspace can name them and are withheld from the
 *     block library, because a block in the library that renders an empty card is the
 *     "purely visual placeholder" the acceptance criteria forbid.
 *
 * Titles are i18n KEYS, resolved by the consumer at render time — a module-level array
 * cannot call `useT()` (CLAUDE.md i18n rule 7).
 */
import {
  type BlockPlacement,
  type BlockSize,
  type StudyBlockDefinition,
  type StudyBlockId,
} from '../shared/studyWorkspace';

const ALL_SIZES: readonly BlockSize[] = ['xs', 's', 'm', 'l', 'xl', 'auto'];
const PANEL_SIZES: readonly BlockSize[] = ['xs', 's', 'm', 'l', 'xl', 'auto'];
const SMALL_SIZES: readonly BlockSize[] = ['xs', 's', 'm', 'auto'];

const SIDE_PANEL: readonly BlockPlacement[] = ['right', 'left', 'floating', 'overlay', 'detached'];
const BOTTOM_PANEL: readonly BlockPlacement[] = ['bottom', 'floating', 'overlay'];
const OVERLAY_ONLY: readonly BlockPlacement[] = ['overlay'];

function def(
  id: StudyBlockId,
  category: StudyBlockDefinition['category'],
  overrides: Partial<StudyBlockDefinition> = {},
): StudyBlockDefinition {
  return {
    id,
    titleKey: `studyWorkspace.block.${id}`,
    category,
    supportedSizes: PANEL_SIZES,
    supportedPlacements: SIDE_PANEL,
    canPin: true,
    canAutoHide: true,
    canDetach: true,
    availability: 'implemented',
    ...overrides,
  };
}

export const STUDY_BLOCK_DEFINITIONS: readonly StudyBlockDefinition[] = [
  /* ── Focus ─────────────────────────────────────────────────────────────────── */
  def('video', 'focus', {
    supportedSizes: ALL_SIZES,
    // Never `detached`: the slice's standing rule is that <VideoCore> is mounted
    // unconditionally in ONE place, because unmounting it drops `vc_activePlayerId`
    // and kills the directstream (audit §7 R2). A detached video would be a second
    // mount. Picture-in-picture is the size, not a different window.
    supportedPlacements: ['center'],
    canPin: false,
    canAutoHide: false,
    canDetach: false,
    defaultSize: 'auto',
    minimumSize: { width: 240, height: 135 },
  }),
  def('subtitles', 'focus', {
    supportedPlacements: OVERLAY_ONLY,
    supportedSizes: ['auto'],
    canPin: false,
    canDetach: false,
    defaultSize: 'auto',
  }),
  def('transcript', 'focus', {
    defaultSize: 'l',
    minimumSize: { width: 280, height: 200 },
  }),
  /*
    Never detached. The mining panel captures a screenshot and the line's audio off the
    live `<video>` element (`recordCueAudio`), and a second renderer process has no video
    in it — the card would come out silent and blank. `shared/studyDetach.ts` records the
    same rule from the other side, and `StudyBlockMenu` reads `canDetach`, so the Detach
    item simply does not appear rather than appearing and producing an empty card.
  */
  def('cardEditor', 'focus', {
    defaultSize: 'l',
    canDetach: false,
    minimumSize: { width: 300, height: 240 },
  }),
  def('review', 'focus', {
    supportedPlacements: ['center', 'right', 'floating', 'detached'],
    defaultSize: 'xl',
    // The review surface is the app's own Anki section and the media host's Review
    // segment. The player routes to it rather than growing a third grading UI.
    availability: 'app-owned',
  }),
  def('shadowing', 'focus', {
    supportedPlacements: BOTTOM_PANEL,
    defaultSize: 'l',
    canDetach: false,
  }),
  def('dictation', 'focus', {
    supportedPlacements: BOTTOM_PANEL,
    defaultSize: 'm',
    canDetach: false,
  }),
  def('listening', 'focus', { supportedPlacements: BOTTOM_PANEL, defaultSize: 'm', canDetach: false }),

  /* ── Context ───────────────────────────────────────────────────────────────── */
  // The dictionary is a card positioned at the word that was clicked. Moving it to
  // another monitor moves the answer away from the question, and there is no anchor to
  // position it against there — so it floats, overlays and docks, but does not detach.
  def('dictionary', 'context', {
    supportedPlacements: ['floating', 'right', 'left', 'overlay'],
    defaultSize: 's',
    canDetach: false,
    minimumSize: { width: 260, height: 160 },
  }),
  def('grammar', 'context', { defaultSize: 'm', minimumSize: { width: 280, height: 200 } }),
  def('sentenceAnalysis', 'context', { defaultSize: 'm', canDetach: false }),
  def('translation', 'context', { supportedPlacements: OVERLAY_ONLY, supportedSizes: ['auto'], canDetach: false }),
  def('aiWorkspace', 'context', { defaultSize: 'm', minimumSize: { width: 300, height: 220 } }),
  // Same component as `cardEditor`, so the same rule: no video, no card.
  def('cardPreview', 'context', { defaultSize: 'm', canDetach: false }),
  def('miningQueue', 'context', { defaultSize: 's' }),
  def('pronunciation', 'context', {
    supportedPlacements: BOTTOM_PANEL,
    defaultSize: 's',
    canDetach: false,
    // Shadowing records and plays back; nothing scores it. Registering the block is how
    // the layout can hold a place for scoring without the UI claiming it exists.
    availability: 'planned',
  }),
  def('waveform', 'context', {
    supportedPlacements: BOTTOM_PANEL,
    defaultSize: 'm',
    canDetach: false,
    availability: 'planned',
  }),
  def('mediaInfo', 'context', { defaultSize: 's' }),
  def('notes', 'context', { defaultSize: 'm', availability: 'app-owned' }),
  /*
    `bookmarks` and `ocr` are PLANNED, not app-owned, and the distinction is the whole
    point of the field. The app does have both — `renderer/bookmarks.ts` and the
    manga/book/screen OCR pipeline — but the only consumer of bookmarks is
    `views/NovelReader.tsx` (reading positions in a novel), and no OCR path is wired to
    a video frame. Routing a video block to the novel reader would be a button that
    goes somewhere unrelated, which is worse than a block that is honestly not built.
  */
  def('bookmarks', 'context', { defaultSize: 's', canDetach: false, availability: 'planned' }),
  def('ocr', 'context', {
    supportedPlacements: ['floating', 'overlay', 'right'],
    defaultSize: 'm',
    canDetach: false,
    availability: 'planned',
  }),
  def('playlist', 'context', { defaultSize: 's', canDetach: false, availability: 'planned' }),
  def('library', 'context', { defaultSize: 'l', availability: 'app-owned' }),
  def('statistics', 'context', { defaultSize: 's', availability: 'app-owned' }),

  /* ── Utility ───────────────────────────────────────────────────────────────── */
  def('playback', 'utility', {
    supportedPlacements: ['bottom'],
    supportedSizes: ['xs', 's', 'auto'],
    canPin: false,
    canDetach: false,
    defaultSize: 'auto',
  }),
  def('quickActions', 'utility', {
    supportedPlacements: ['bottom', 'overlay'],
    supportedSizes: SMALL_SIZES,
    canDetach: false,
    defaultSize: 'xs',
  }),
  def('subtitleTrack', 'utility', { supportedPlacements: ['floating', 'right'], defaultSize: 's', canDetach: false }),
  def('audioTrack', 'utility', { supportedPlacements: ['floating', 'right'], defaultSize: 'xs', canDetach: false }),
  def('screenshot', 'utility', { supportedPlacements: ['floating'], defaultSize: 'xs', canDetach: false }),
  // Detachable: every value it shows is a number the host already publishes, so a HUD
  // on a second monitor is live rather than a snapshot frozen at detach time.
  def('studyHud', 'utility', {
    supportedPlacements: ['overlay', 'right', 'bottom', 'detached'],
    supportedSizes: SMALL_SIZES,
    defaultSize: 'xs',
  }),
  def('commandPalette', 'utility', {
    supportedPlacements: ['overlay'],
    supportedSizes: ['auto'],
    canPin: false,
    canAutoHide: false,
    canDetach: false,
    defaultSize: 'auto',
  }),
];

export const STUDY_BLOCK_MAP: ReadonlyMap<StudyBlockId, StudyBlockDefinition> = new Map(
  STUDY_BLOCK_DEFINITIONS.map((definition) => [definition.id, definition]),
);

export function studyBlockDefinition(id: StudyBlockId): StudyBlockDefinition | undefined {
  return STUDY_BLOCK_MAP.get(id);
}

/**
 * What the Customize-mode block library may offer.
 *
 * `planned` blocks are withheld here and only here — they stay in the map so a saved or
 * imported layout that names one is repaired rather than rejected.
 */
export function libraryBlocks(): readonly StudyBlockDefinition[] {
  return STUDY_BLOCK_DEFINITIONS.filter(
    (definition) => definition.availability !== 'planned'
      && definition.id !== 'video'
      && definition.id !== 'subtitles'
      && definition.id !== 'playback'
      && definition.id !== 'commandPalette',
  );
}
