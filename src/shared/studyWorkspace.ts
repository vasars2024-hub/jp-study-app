/**
 * The Liquid Study Workspace model.
 *
 * Everything here is pure: no React, no DOM, no storage calls. The provider
 * (`media/StudyWorkspaceProvider.tsx`) is what reads and writes `localStorage`, and it
 * does so through {@link parseWorkspaceDocument} / {@link serializeWorkspaceDocument},
 * which is what makes migration, repair and export/import testable without a renderer.
 *
 * ## Why a model at all
 *
 * `VideoCoreStudyOverlay` renders five surfaces onto one picture and every one of them
 * decides its own visibility from a preference boolean or a local `useState`. That is
 * why the dock, the grammar card, the rail and the subtitle band could all be up at
 * once with no one arbitrating: there was nothing that could arbitrate. This file is
 * that thing. A block does not choose to be on screen; a workspace says where it is.
 *
 * ## The one rule that is not obvious
 *
 * Layout is stored **semantically** — a dock, a size name, a presence — never pixel
 * coordinates. A layout saved on a 3440px ultrawide has to restore on a 1280px laptop,
 * and `docs/redesign/LIQUID_WORKSPACE_AUDIT.md` §7 R4 is the failure this avoids: a
 * document that cannot be honoured is repaired, never rendered as an empty screen.
 */

/* ------------------------------------------------------------------------------ *
 * Vocabulary
 * ------------------------------------------------------------------------------ */

export const BLOCK_SIZES = ['xs', 's', 'm', 'l', 'xl', 'auto'] as const;
export type BlockSize = (typeof BLOCK_SIZES)[number];

export const BLOCK_PLACEMENTS = [
  'center',
  'left',
  'right',
  'bottom',
  'floating',
  'overlay',
  'detached',
] as const;
export type BlockPlacement = (typeof BLOCK_PLACEMENTS)[number];

/** The docks a block can be *docked* into, as opposed to floating over the picture. */
export const DOCK_PLACEMENTS = ['left', 'right', 'bottom', 'center'] as const;
export type DockPlacement = (typeof DOCK_PLACEMENTS)[number];

export const BLOCK_PRESENCES = [
  'hidden',
  'contextual',
  'collapsed',
  'compact',
  'expanded',
  'fullscreen',
] as const;
export type BlockPresence = (typeof BLOCK_PRESENCES)[number];

export const STUDY_BLOCK_IDS = [
  'video',
  'playback',
  'subtitles',
  'subtitleTrack',
  'audioTrack',
  'transcript',
  'dictionary',
  'grammar',
  'translation',
  'aiWorkspace',
  'sentenceAnalysis',
  'cardPreview',
  'cardEditor',
  'miningQueue',
  'review',
  'shadowing',
  'dictation',
  'listening',
  'pronunciation',
  'waveform',
  'notes',
  'bookmarks',
  'ocr',
  'mediaInfo',
  'playlist',
  'library',
  'screenshot',
  'statistics',
  'studyHud',
  'quickActions',
  'commandPalette',
] as const;
export type StudyBlockId = (typeof STUDY_BLOCK_IDS)[number];

export type BlockCategory = 'focus' | 'context' | 'utility' | 'configuration';

/**
 * How real a block is.
 *
 * `app-owned` is the honest answer for Notes, Bookmarks, OCR, Library and Statistics:
 * the feature exists in this app and has never been wired into the player, so the block
 * routes to the owning surface rather than growing a second implementation.
 * `planned` blocks are registered so a layout can name them and are deliberately kept
 * out of the block library until they do something — a hidden definition, never a
 * button that lies.
 */
export type BlockAvailability = 'implemented' | 'app-owned' | 'planned';

export interface StudyBlockDefinition {
  id: StudyBlockId;
  /** i18n key, resolved by the consumer at render time (CLAUDE.md i18n rule 7). */
  titleKey: string;
  category: BlockCategory;
  supportedSizes: readonly BlockSize[];
  supportedPlacements: readonly BlockPlacement[];
  canPin: boolean;
  canAutoHide: boolean;
  canDetach: boolean;
  minimumSize?: { width: number; height: number };
  availability: BlockAvailability;
  /** Default size when a workspace opens it without saying. */
  defaultSize?: BlockSize;
}

export type ContextualTrigger =
  | 'word-click'
  | 'grammar-click'
  | 'sentence-select'
  | 'mine'
  | 'practice-start'
  | 'recording-done'
  | 'screenshot'
  | 'transcript-open'
  | 'manual';

export interface ContextualRule {
  on: ContextualTrigger;
  open: StudyBlockId;
  /** Blocks that must recede (to `collapsed`) while this one is up. */
  recede?: readonly StudyBlockId[];
  /** Tried in order; the first one that is not disruptive wins. */
  preferred: readonly BlockPlacement[];
  size?: BlockSize;
}

export interface ResponsiveRule {
  maxWidth?: number;
  minWidth?: number;
  /** Docks that fold into bottom sheets / tabs at this width. */
  collapse?: readonly DockPlacement[];
  /** Contextual blocks overlay the picture instead of taking a dock. */
  overlayInsteadOfDock?: boolean;
  /** Low-priority labels become icons with tooltips. */
  iconsOnly?: boolean;
}

export interface WorkspaceBlockInstance {
  blockId: StudyBlockId;
  placement: BlockPlacement;
  size: BlockSize;
  presence: BlockPresence;
  pinned: boolean;
  autoHide: boolean;
  order: number;
  /** Set only while a contextual block is temporarily open. */
  temporary?: { openedBy: ContextualTrigger; sinceMs: number };
  /**
   * Set while the block lives in its own OS window.
   *
   * `windowId` is a live handle and is deliberately allowed to be empty: a layout
   * restored from storage remembers that the user detached this block but cannot
   * remember a window from a process that has exited. Empty means "wants to be
   * detached, no window yet", which is what `useStudyDetach` reconciles on mount.
   * `displayKey` is a preference about WHERE and survives, so a re-opened block
   * lands on the monitor it was on.
   */
  detached?: {
    windowId: string;
    displayKey?: string;
    displayHint?: 'primary' | 'secondary';
  };
}

export type WorkspaceMode =
  | 'watch'
  | 'transcript'
  | 'mining'
  | 'practice'
  | 'review'
  | 'listening'
  | 'immersion'
  | 'custom';

export type PracticeKind =
  | 'shadowing'
  | 'listening'
  | 'dictation'
  | 'repetition'
  | 'pronunciation'
  | 'comprehension';

export interface StudyWorkspace {
  id: string;
  /** Built-ins carry a key; user workspaces carry a literal name they typed. */
  nameKey?: string;
  name?: string;
  icon?: string;
  mode: WorkspaceMode;
  practiceKind?: PracticeKind;
  primaryBlockId: StudyBlockId;
  blocks: WorkspaceBlockInstance[];
  contextualRules: ContextualRule[];
  responsiveRules: ResponsiveRule[];
  builtIn: boolean;
}

export interface WorkspaceDocument {
  schemaVersion: number;
  activeWorkspaceId: string;
  workspaces: StudyWorkspace[];
  customizing: boolean;
}

export const WORKSPACE_SCHEMA_VERSION = 1;
export const WORKSPACE_STORAGE_KEY = 'jp-study-workspace-v1';
/** Undo depth in customize mode. Deep enough to back out of a session of fiddling. */
export const WORKSPACE_HISTORY_LIMIT = 30;

/* ------------------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------------------ */

const BLOCK_ID_SET = new Set<string>(STUDY_BLOCK_IDS);
const SIZE_SET = new Set<string>(BLOCK_SIZES);
const PLACEMENT_SET = new Set<string>(BLOCK_PLACEMENTS);
const PRESENCE_SET = new Set<string>(BLOCK_PRESENCES);

export function isStudyBlockId(value: unknown): value is StudyBlockId {
  return typeof value === 'string' && BLOCK_ID_SET.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A block instance with everything filled in. */
export function blockInstance(
  blockId: StudyBlockId,
  overrides: Partial<Omit<WorkspaceBlockInstance, 'blockId'>> = {},
): WorkspaceBlockInstance {
  return {
    blockId,
    placement: 'right',
    size: 'auto',
    presence: 'hidden',
    pinned: false,
    autoHide: false,
    order: 0,
    ...overrides,
  };
}

export function findBlock(
  workspace: StudyWorkspace,
  blockId: StudyBlockId,
): WorkspaceBlockInstance | undefined {
  return workspace.blocks.find((entry) => entry.blockId === blockId);
}

/** Is this block taking room right now? `contextual` counts — it is on screen. */
export function blockIsVisible(instance: WorkspaceBlockInstance | undefined): boolean {
  return !!instance && instance.presence !== 'hidden';
}

function withBlock(
  workspace: StudyWorkspace,
  blockId: StudyBlockId,
  change: (instance: WorkspaceBlockInstance) => WorkspaceBlockInstance,
): StudyWorkspace {
  let found = false;
  const blocks = workspace.blocks.map((entry) => {
    if (entry.blockId !== blockId) return entry;
    found = true;
    return change(entry);
  });
  if (!found) return workspace;
  return { ...workspace, blocks };
}

/* ------------------------------------------------------------------------------ *
 * Built-in workspaces
 *
 * These are re-seeded from code on every load rather than persisted, so a preset
 * improved in a later version reaches users who never customised it. A user's EDIT of
 * a built-in is persisted as an override — see `mergeWorkspaces`.
 * ------------------------------------------------------------------------------ */

/** The contextual rules every workspace shares unless it deliberately overrides them. */
const COMMON_CONTEXTUAL_RULES: ContextualRule[] = [
  {
    on: 'word-click',
    open: 'dictionary',
    preferred: ['floating', 'right', 'overlay'],
    size: 's',
  },
  {
    on: 'grammar-click',
    open: 'grammar',
    preferred: ['left', 'floating', 'overlay'],
    size: 'm',
  },
  {
    on: 'sentence-select',
    open: 'sentenceAnalysis',
    preferred: ['right', 'floating', 'overlay'],
    size: 'm',
  },
  {
    on: 'mine',
    open: 'cardPreview',
    recede: ['aiWorkspace', 'grammar'],
    preferred: ['right', 'floating'],
    size: 'm',
  },
  {
    on: 'screenshot',
    open: 'ocr',
    preferred: ['floating', 'overlay'],
    size: 'm',
  },
  {
    on: 'recording-done',
    open: 'pronunciation',
    preferred: ['bottom', 'floating'],
    size: 's',
  },
  {
    on: 'transcript-open',
    open: 'transcript',
    recede: ['cardEditor', 'miningQueue'],
    preferred: ['right'],
    size: 'l',
  },
];

/**
 * The responsive ladder.
 *
 * Not "scale everything down": below 1180 the side docks stop being docks and become
 * overlays, below 900 they become bottom sheets and labels become icons. The numbers
 * match the breakpoints `mediaWorkspace.css` already uses for the 24rem→19rem column.
 */
const COMMON_RESPONSIVE_RULES: ResponsiveRule[] = [
  { maxWidth: 1180, overlayInsteadOfDock: true },
  { maxWidth: 900, collapse: ['left', 'right'], overlayInsteadOfDock: true, iconsOnly: true },
];

function preset(
  id: string,
  mode: WorkspaceMode,
  primaryBlockId: StudyBlockId,
  blocks: WorkspaceBlockInstance[],
  extra: Partial<StudyWorkspace> = {},
): StudyWorkspace {
  return {
    id,
    nameKey: `studyWorkspace.preset.${id}`,
    mode,
    primaryBlockId,
    blocks,
    contextualRules: COMMON_CONTEXTUAL_RULES,
    responsiveRules: COMMON_RESPONSIVE_RULES,
    builtIn: true,
    ...extra,
  };
}

/** Blocks every workspace has, because the player cannot exist without them. */
function coreBlocks(videoPresence: BlockPresence = 'expanded'): WorkspaceBlockInstance[] {
  return [
    blockInstance('video', { placement: 'center', size: 'auto', presence: videoPresence }),
    blockInstance('subtitles', { placement: 'overlay', size: 'auto', presence: 'expanded' }),
    blockInstance('playback', { placement: 'bottom', size: 'auto', presence: 'compact' }),
    blockInstance('quickActions', { placement: 'bottom', size: 'xs', presence: 'compact', order: 1 }),
  ];
}

export function createBuiltInWorkspaces(): StudyWorkspace[] {
  return [
    // ── Watch: the default. Video dominates; nothing else is permanent. ───────────
    preset('watch', 'watch', 'video', [
      ...coreBlocks(),
      blockInstance('studyHud', { placement: 'overlay', size: 'xs', presence: 'hidden' }),
      blockInstance('transcript', { placement: 'right', size: 'l', presence: 'hidden' }),
      blockInstance('dictionary', { placement: 'floating', size: 's', presence: 'hidden' }),
      blockInstance('grammar', { placement: 'left', size: 'm', presence: 'hidden' }),
      blockInstance('aiWorkspace', { placement: 'right', size: 'm', presence: 'hidden' }),
      blockInstance('cardPreview', { placement: 'right', size: 'm', presence: 'hidden' }),
      blockInstance('cardEditor', { placement: 'right', size: 'l', presence: 'hidden' }),
      blockInstance('miningQueue', { placement: 'right', size: 's', presence: 'hidden', order: 2 }),
    ], { icon: 'play' }),

    // ── Transcript: reading surface first, video secondary but synchronized. ──────
    preset('transcript', 'transcript', 'transcript', [
      ...coreBlocks('compact'),
      blockInstance('transcript', {
        placement: 'right', size: 'xl', presence: 'expanded', pinned: true,
      }),
      blockInstance('dictionary', { placement: 'floating', size: 's', presence: 'hidden' }),
      blockInstance('grammar', { placement: 'left', size: 'm', presence: 'hidden' }),
      blockInstance('cardPreview', { placement: 'right', size: 'm', presence: 'hidden', order: 1 }),
    ], { icon: 'list' }),

    // ── Mining: sentence + word + explanation + card. Nothing unrelated. ──────────
    preset('mining', 'mining', 'cardEditor', [
      ...coreBlocks('compact'),
      blockInstance('transcript', { placement: 'left', size: 'm', presence: 'expanded' }),
      blockInstance('aiWorkspace', { placement: 'right', size: 'm', presence: 'expanded' }),
      blockInstance('cardEditor', {
        placement: 'right', size: 'l', presence: 'expanded', pinned: true, order: 1,
      }),
      blockInstance('miningQueue', { placement: 'right', size: 's', presence: 'collapsed', order: 2 }),
      blockInstance('dictionary', { placement: 'floating', size: 's', presence: 'hidden' }),
    ], { icon: 'pickaxe' }),

    // ── Practice: the active drill dominates; mining and review disappear. ────────
    preset('practice', 'practice', 'shadowing', [
      ...coreBlocks('compact'),
      blockInstance('shadowing', { placement: 'bottom', size: 'l', presence: 'expanded', order: 2 }),
      blockInstance('waveform', { placement: 'bottom', size: 'm', presence: 'hidden', order: 3 }),
      blockInstance('pronunciation', { placement: 'bottom', size: 's', presence: 'hidden', order: 4 }),
      blockInstance('dictation', { placement: 'bottom', size: 'm', presence: 'hidden', order: 2 }),
      // `s`, not `xs`: at 14% of the dock its header, deck line and search spilled out of
      // the panel (design audit 2026-09-23).
      blockInstance('transcript', { placement: 'right', size: 's', presence: 'compact' }),
    ], { icon: 'mic', practiceKind: 'shadowing' }),

    // ── Review: the card is the whole point. ─────────────────────────────────────
    preset('review', 'review', 'review', [
      blockInstance('video', { placement: 'center', size: 's', presence: 'compact' }),
      blockInstance('playback', { placement: 'bottom', size: 'auto', presence: 'compact' }),
      blockInstance('review', { placement: 'center', size: 'xl', presence: 'expanded', pinned: true }),
      blockInstance('cardPreview', { placement: 'right', size: 'm', presence: 'collapsed' }),
    ], { icon: 'cards' }),

    // ── Listening: audio and comprehension. Subtitles start hidden. ──────────────
    preset('listening', 'listening', 'video', [
      ...coreBlocks(),
      blockInstance('subtitles', { placement: 'overlay', size: 'auto', presence: 'hidden' }),
      blockInstance('listening', { placement: 'bottom', size: 'm', presence: 'expanded', order: 2 }),
      blockInstance('transcript', { placement: 'right', size: 'm', presence: 'hidden' }),
    ], { icon: 'ear', practiceKind: 'listening' }),

    // ── Immersion: video, subtitles, minimal transport. Nothing else. ────────────
    preset('immersion', 'immersion', 'video', [
      blockInstance('video', { placement: 'center', size: 'auto', presence: 'fullscreen' }),
      blockInstance('subtitles', { placement: 'overlay', size: 'auto', presence: 'expanded' }),
      blockInstance('playback', { placement: 'bottom', size: 'xs', presence: 'compact', autoHide: true }),
    ], { icon: 'moon' }),
  ];
}

export const DEFAULT_WORKSPACE_ID = 'watch';

export function createDefaultWorkspaceDocument(): WorkspaceDocument {
  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
    workspaces: createBuiltInWorkspaces(),
    customizing: false,
  };
}

/* ------------------------------------------------------------------------------ *
 * Normalisation and repair
 *
 * R4 in the audit: a saved layout that names a block this build no longer has, or a
 * placement a block cannot take, must not reach the renderer. Everything below is
 * "keep what is recognisable, drop what is not, never return nothing".
 * ------------------------------------------------------------------------------ */

export interface RepairContext {
  /** Definitions this build actually has. Unknown ids are dropped. */
  definitions: ReadonlyMap<StudyBlockId, StudyBlockDefinition>;
}

function normalizeBlockInstance(
  value: unknown,
  context: RepairContext | null,
): WorkspaceBlockInstance | null {
  if (!isRecord(value) || !isStudyBlockId(value.blockId)) return null;
  const definition = context?.definitions.get(value.blockId);
  if (context && !definition) return null;

  const rawPlacement = typeof value.placement === 'string' && PLACEMENT_SET.has(value.placement)
    ? (value.placement as BlockPlacement)
    : 'right';
  const placement = definition && !definition.supportedPlacements.includes(rawPlacement)
    ? definition.supportedPlacements[0] ?? 'floating'
    : rawPlacement;

  const rawSize = typeof value.size === 'string' && SIZE_SET.has(value.size)
    ? (value.size as BlockSize)
    : 'auto';
  const size = definition && !definition.supportedSizes.includes(rawSize)
    ? definition.defaultSize ?? definition.supportedSizes[0] ?? 'auto'
    : rawSize;

  const presence = typeof value.presence === 'string' && PRESENCE_SET.has(value.presence)
    ? (value.presence as BlockPresence)
    : 'hidden';

  /*
    A detached window id from a previous run names a window that no longer exists, so
    the handle is cleared — but the *intent* is kept. Dropping the whole record (which
    is what this did before detach shipped) silently re-docked every block the user had
    put on their second monitor, every launch. `displayKey` and `displayHint` are
    preferences about WHERE, not handles to something dead, so they survive verbatim.

    The empty `windowId` is the signal: `useStudyDetach` sees a detached block with no
    window and opens one. A block whose definition cannot detach is re-docked here
    rather than being left pointing at a window that will never be created.
  */
  const detachedRaw = isRecord(value.detached) ? value.detached : null;
  const wantsDetach = !!detachedRaw
    && placement === 'detached'
    && definition?.canDetach !== false;
  const detached: WorkspaceBlockInstance['detached'] = wantsDetach
    ? {
      windowId: '',
      ...(typeof detachedRaw.displayKey === 'string'
        ? { displayKey: detachedRaw.displayKey }
        : {}),
      ...(detachedRaw.displayHint === 'primary' || detachedRaw.displayHint === 'secondary'
        ? { displayHint: detachedRaw.displayHint as 'primary' | 'secondary' }
        : {}),
    }
    : undefined;

  return {
    blockId: value.blockId,
    placement: placement === 'detached' && !wantsDetach ? 'right' : placement,
    size,
    presence,
    pinned: definition?.canPin === false ? false : value.pinned === true,
    autoHide: definition?.canAutoHide === false ? false : value.autoHide === true,
    order: typeof value.order === 'number' && Number.isFinite(value.order)
      ? Math.max(0, Math.round(value.order))
      : 0,
    ...(detached ? { detached } : {}),
  };
}

function normalizeWorkspace(
  value: unknown,
  context: RepairContext | null,
): StudyWorkspace | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id) return null;
  const blocks = Array.isArray(value.blocks)
    ? value.blocks
      .map((entry) => normalizeBlockInstance(entry, context))
      .filter((entry): entry is WorkspaceBlockInstance => entry !== null)
    : [];

  // De-duplicate by block id: one instance per block per workspace, first wins.
  const seen = new Set<StudyBlockId>();
  const unique = blocks.filter((entry) => {
    if (seen.has(entry.blockId)) return false;
    seen.add(entry.blockId);
    return true;
  });

  const primaryBlockId = isStudyBlockId(value.primaryBlockId) ? value.primaryBlockId : 'video';
  // The video re-seed deliberately does NOT happen here. A stored built-in carries only
  // its block layout, and seeding a lone `video` into an empty one would make it look
  // like a customised layout to `mergeWorkspaces` — which would then serve that instead
  // of the preset from code, and the user would lose subtitles and the transport bar.
  // `ensurePlayableWorkspace` runs after the merge instead.
  const builtIn = value.builtIn === true;
  return {
    id: value.id,
    ...(typeof value.nameKey === 'string' ? { nameKey: value.nameKey } : {}),
    ...(typeof value.name === 'string' ? { name: value.name } : {}),
    ...(typeof value.icon === 'string' ? { icon: value.icon } : {}),
    mode: isWorkspaceMode(value.mode) ? value.mode : 'custom',
    ...(isPracticeKind(value.practiceKind) ? { practiceKind: value.practiceKind } : {}),
    primaryBlockId,
    blocks: unique,
    contextualRules: Array.isArray(value.contextualRules) && value.contextualRules.length
      ? (value.contextualRules as ContextualRule[])
      : COMMON_CONTEXTUAL_RULES,
    responsiveRules: Array.isArray(value.responsiveRules) && value.responsiveRules.length
      ? (value.responsiveRules as ResponsiveRule[])
      : COMMON_RESPONSIVE_RULES,
    builtIn,
  };
}

const WORKSPACE_MODES = new Set<string>([
  'watch', 'transcript', 'mining', 'practice', 'review', 'listening', 'immersion', 'custom',
]);
const PRACTICE_KINDS = new Set<string>([
  'shadowing', 'listening', 'dictation', 'repetition', 'pronunciation', 'comprehension',
]);

function isWorkspaceMode(value: unknown): value is WorkspaceMode {
  return typeof value === 'string' && WORKSPACE_MODES.has(value);
}
function isPracticeKind(value: unknown): value is PracticeKind {
  return typeof value === 'string' && PRACTICE_KINDS.has(value);
}

/**
 * Built-ins come from code; the stored copy only contributes user EDITS to them.
 *
 * Without this, improving the Watch preset in a later release would reach nobody who
 * had ever opened the player, because their storage would keep serving the old one.
 */
function mergeWorkspaces(stored: StudyWorkspace[]): StudyWorkspace[] {
  const builtIns = createBuiltInWorkspaces();
  const storedById = new Map(stored.map((entry) => [entry.id, entry]));
  const merged = builtIns.map((builtIn) => {
    const override = storedById.get(builtIn.id);
    if (!override) return builtIn;
    // A stored built-in is only allowed to change its LAYOUT, never its identity or
    // its rules — those are what make the preset the preset.
    return {
      ...builtIn,
      blocks: override.blocks.length ? override.blocks : builtIn.blocks,
      ...(override.practiceKind ? { practiceKind: override.practiceKind } : {}),
    };
  });
  const custom = stored.filter((entry) => !entry.builtIn && !builtIns.some((b) => b.id === entry.id));
  return [...merged, ...custom];
}

/**
 * A workspace with no video block cannot play anything.
 *
 * Re-seed rather than reject: the rest of the user's layout is still worth keeping, and
 * "never render an unusable blank workspace" is the rule (§26). Runs after the merge so
 * it can never be mistaken for a customisation of a built-in.
 */
function ensurePlayableWorkspace(workspace: StudyWorkspace): StudyWorkspace {
  if (workspace.blocks.some((entry) => entry.blockId === 'video')) return workspace;
  return {
    ...workspace,
    blocks: [
      blockInstance('video', { placement: 'center', size: 'auto', presence: 'expanded' }),
      ...workspace.blocks,
    ],
  };
}

export function repairWorkspaceDocument(
  value: unknown,
  context: RepairContext | null = null,
): WorkspaceDocument {
  if (!isRecord(value)) return createDefaultWorkspaceDocument();

  const workspaces = Array.isArray(value.workspaces)
    ? value.workspaces
      .map((entry) => normalizeWorkspace(entry, context))
      .filter((entry): entry is StudyWorkspace => entry !== null)
    : [];

  const merged = mergeWorkspaces(workspaces).map(ensurePlayableWorkspace);
  const activeWorkspaceId = typeof value.activeWorkspaceId === 'string'
    && merged.some((entry) => entry.id === value.activeWorkspaceId)
    ? value.activeWorkspaceId
    : DEFAULT_WORKSPACE_ID;

  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    activeWorkspaceId,
    workspaces: merged,
    // Never restore into customize mode: it is a transient editing state, and coming
    // back to a player covered in drag handles reads as a broken screen.
    customizing: false,
  };
}

/**
 * Version-to-version migration, ahead of repair.
 *
 * There is one version today, so this is the identity plus a guard. It exists now
 * rather than later because the first migration is always written under pressure, and
 * the shape of the call site is the part that has to be right.
 */
export function migrateWorkspaceDocument(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const version = typeof value.schemaVersion === 'number' ? value.schemaVersion : 0;
  if (version >= WORKSPACE_SCHEMA_VERSION) return value;
  // v0 → v1: documents written before the field existed. Nothing structural changed;
  // repair below is what makes them valid.
  return { ...value, schemaVersion: WORKSPACE_SCHEMA_VERSION };
}

export function parseWorkspaceDocument(
  raw: string | null | undefined,
  context: RepairContext | null = null,
): WorkspaceDocument {
  if (!raw) return createDefaultWorkspaceDocument();
  try {
    return repairWorkspaceDocument(migrateWorkspaceDocument(JSON.parse(raw)), context);
  } catch {
    return createDefaultWorkspaceDocument();
  }
}

export function serializeWorkspaceDocument(document: WorkspaceDocument): string {
  // Built-ins are re-seeded from code, so only their block layout is worth storing.
  // Custom workspaces are stored whole.
  return JSON.stringify({
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    activeWorkspaceId: document.activeWorkspaceId,
    workspaces: document.workspaces.map((workspace) => (workspace.builtIn
      ? {
        id: workspace.id,
        builtIn: true,
        blocks: workspace.blocks,
        ...(workspace.practiceKind ? { practiceKind: workspace.practiceKind } : {}),
      }
      : workspace)),
  });
}

/* ------------------------------------------------------------------------------ *
 * Export / import
 *
 * A shared workspace carries layout and behaviour, never the user's own content, and
 * never a machine dimension. That is the whole difference between a preset someone can
 * publish and a snapshot of one person's monitor.
 * ------------------------------------------------------------------------------ */

export interface WorkspaceExport {
  kind: 'jp-study-workspace';
  schemaVersion: number;
  workspace: StudyWorkspace;
}

export function exportWorkspace(workspace: StudyWorkspace): string {
  return JSON.stringify({
    kind: 'jp-study-workspace',
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    workspace: {
      ...workspace,
      builtIn: false,
      /*
        A shared layout must not carry machine state: `detached` names a window id from
        the exporter's session and a display fingerprint from their desk, and
        `temporary` is a contextual panel that happened to be open when they hit Export.
        Rebuilt field by field rather than destructured with throwaway names, so a field
        added to the instance type has to be considered here rather than silently riding
        along into someone else's workspace.

        The *intent* to detach does travel, as an empty handle. A "Dual-Monitor
        Immersion" preset that arrived with every block re-docked would not be the
        layout that was shared; the receiver's own machine then decides which window and
        which monitor, which is exactly the split §21 asks for.
      */
      blocks: workspace.blocks.map((instance): WorkspaceBlockInstance => ({
        blockId: instance.blockId,
        placement: instance.placement,
        size: instance.size,
        presence: instance.presence,
        pinned: instance.pinned,
        autoHide: instance.autoHide,
        order: instance.order,
        ...(instance.detached ? { detached: { windowId: '' } } : {}),
      })),
    },
  } satisfies WorkspaceExport, null, 2);
}

export function importWorkspace(
  raw: string,
  context: RepairContext | null = null,
  idSuffix = 'imported',
): StudyWorkspace | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.kind !== 'jp-study-workspace') return null;
  const workspace = normalizeWorkspace(
    migrateWorkspaceDocument(parsed.workspace),
    context,
  );
  if (!workspace) return null;
  return {
    ...ensurePlayableWorkspace(workspace),
    id: `${workspace.id}-${idSuffix}`,
    builtIn: false,
    name: workspace.name ?? workspace.id,
    nameKey: undefined,
  };
}

/* ------------------------------------------------------------------------------ *
 * Contextual placement — "the least disruptive valid option"
 * ------------------------------------------------------------------------------ */

export interface ViewportInfo {
  width: number;
  height: number;
}

/**
 * Which placement a contextual open should take, given what is already up.
 *
 * The rule the prompt states (§11) is that a pinned block must survive. So a preferred
 * dock is rejected when it holds a **pinned, visible** block, and accepted when it
 * holds an unpinned one — that unpinned block is exactly the "unpinned contextual slot"
 * the prompt says may be replaced. Floating is the universal fallback because it takes
 * nobody's dock; overlay is preferred over floating on a narrow window because a
 * floating card on a 900px screen covers the picture anyway and an overlay at least
 * says so.
 */
export function resolveContextualPlacement(
  workspace: StudyWorkspace,
  rule: ContextualRule,
  definition: StudyBlockDefinition | undefined,
  viewport: ViewportInfo,
): BlockPlacement {
  const narrow = responsiveFor(workspace, viewport);
  const supported = definition?.supportedPlacements ?? BLOCK_PLACEMENTS;

  const candidates = narrow.overlayInsteadOfDock
    // On a narrow window, docking a contextual panel steals the picture. Try overlay
    // and floating first, then whatever the rule wanted.
    ? ['overlay' as BlockPlacement, 'floating' as BlockPlacement, ...rule.preferred]
    : [...rule.preferred];

  for (const placement of candidates) {
    if (!supported.includes(placement)) continue;
    if (placement === 'floating' || placement === 'overlay') return placement;
    const occupant = workspace.blocks.find(
      (entry) => entry.placement === placement
        && entry.blockId !== rule.open
        && blockIsVisible(entry)
        && entry.pinned,
    );
    if (!occupant) return placement;
  }
  if (supported.includes('floating')) return 'floating';
  if (supported.includes('overlay')) return 'overlay';
  return supported[0] ?? 'floating';
}

/** The responsive rule that applies at this width — narrowest match wins. */
export function responsiveFor(
  workspace: StudyWorkspace,
  viewport: ViewportInfo,
): ResponsiveRule {
  const matched = workspace.responsiveRules
    .filter((rule) => (rule.maxWidth == null || viewport.width <= rule.maxWidth)
      && (rule.minWidth == null || viewport.width >= rule.minWidth))
    .sort((a, b) => (a.maxWidth ?? Infinity) - (b.maxWidth ?? Infinity));
  return matched[0] ?? {};
}

/* ------------------------------------------------------------------------------ *
 * Layout resolution — the five-step priority order (audit §4)
 * ------------------------------------------------------------------------------ */

export interface ResolvedBlock extends WorkspaceBlockInstance {
  /** Placement after responsive folding. */
  effectivePlacement: BlockPlacement;
  /** Presence after responsive folding and auto-hide. */
  effectivePresence: BlockPresence;
  /** True when this is the workspace's dominant surface. */
  dominant: boolean;
}

export interface ResolvedLayout {
  workspaceId: string;
  mode: WorkspaceMode;
  primaryBlockId: StudyBlockId;
  blocks: ResolvedBlock[];
  /** Docks that are folded into bottom sheets at this width. */
  collapsedDocks: readonly DockPlacement[];
  iconsOnly: boolean;
  /** True when any left/right dock is actually holding a visible block. */
  hasLeftDock: boolean;
  hasRightDock: boolean;
}

export interface LayoutContext {
  /** A running practice drill outranks everything — priority 1. */
  activePractice?: PracticeKind | null;
  /** Pointer/keyboard idle, so auto-hide blocks should recede. */
  idle?: boolean;
}

export function resolveLayout(
  workspace: StudyWorkspace,
  context: LayoutContext,
  viewport: ViewportInfo,
): ResolvedLayout {
  const responsive = responsiveFor(workspace, viewport);
  const collapsedDocks = responsive.collapse ?? [];

  const blocks: ResolvedBlock[] = workspace.blocks.map((instance) => {
    let effectivePlacement = instance.placement;
    let effectivePresence = instance.presence;

    // 5 — responsive fallback. A folded dock becomes a bottom sheet; a contextual
    // block on a narrow window overlays instead of docking.
    if (
      (effectivePlacement === 'left' || effectivePlacement === 'right')
      && collapsedDocks.includes(effectivePlacement as DockPlacement)
    ) {
      effectivePlacement = 'bottom';
    } else if (
      responsive.overlayInsteadOfDock
      && instance.presence === 'contextual'
      && (effectivePlacement === 'left' || effectivePlacement === 'right')
    ) {
      effectivePlacement = 'overlay';
    }

    // 2 — an explicit pin is never auto-hidden. 1 outranks it below.
    if (instance.autoHide && context.idle && !instance.pinned) {
      if (effectivePresence === 'expanded' || effectivePresence === 'compact') {
        effectivePresence = 'collapsed';
      }
    }

    return {
      ...instance,
      effectivePlacement,
      effectivePresence,
      dominant: instance.blockId === workspace.primaryBlockId,
    };
  });

  // 1 — task-critical. A running drill takes the floor whatever the saved layout says,
  // and the block that owns that drill becomes dominant for as long as it runs.
  const practiceBlock = context.activePractice
    ? practiceBlockFor(context.activePractice)
    : null;
  if (practiceBlock) {
    for (const block of blocks) {
      if (block.blockId === practiceBlock) {
        block.effectivePresence = block.effectivePresence === 'hidden'
          ? 'expanded'
          : block.effectivePresence;
        block.dominant = true;
      } else if (block.dominant && block.blockId !== 'video') {
        block.dominant = false;
      }
    }
  }

  const visible = blocks.filter((block) => block.effectivePresence !== 'hidden');
  return {
    workspaceId: workspace.id,
    mode: workspace.mode,
    primaryBlockId: practiceBlock ?? workspace.primaryBlockId,
    blocks,
    collapsedDocks,
    iconsOnly: responsive.iconsOnly === true,
    hasLeftDock: visible.some((block) => block.effectivePlacement === 'left'),
    hasRightDock: visible.some((block) => block.effectivePlacement === 'right'),
  };
}

export function practiceBlockFor(kind: PracticeKind): StudyBlockId {
  switch (kind) {
    case 'shadowing': return 'shadowing';
    case 'dictation': return 'dictation';
    case 'pronunciation': return 'pronunciation';
    case 'listening':
    case 'comprehension':
    case 'repetition':
    default: return 'listening';
  }
}

/* ------------------------------------------------------------------------------ *
 * Reducer
 * ------------------------------------------------------------------------------ */

export type WorkspaceAction =
  | { type: 'switch-workspace'; workspaceId: string }
  | { type: 'open-block'; blockId: StudyBlockId; placement?: BlockPlacement; size?: BlockSize; presence?: BlockPresence }
  | { type: 'close-block'; blockId: StudyBlockId }
  | { type: 'toggle-block'; blockId: StudyBlockId }
  | { type: 'set-presence'; blockId: StudyBlockId; presence: BlockPresence }
  | { type: 'set-size'; blockId: StudyBlockId; size: BlockSize }
  | { type: 'set-placement'; blockId: StudyBlockId; placement: BlockPlacement }
  | { type: 'set-pinned'; blockId: StudyBlockId; pinned: boolean }
  | { type: 'set-auto-hide'; blockId: StudyBlockId; autoHide: boolean }
  | { type: 'set-order'; blockId: StudyBlockId; order: number }
  | {
    type: 'detach-block';
    blockId: StudyBlockId;
    windowId: string;
    displayKey?: string;
    displayHint?: 'primary' | 'secondary';
  }
  | { type: 'attach-block'; blockId: StudyBlockId }
  | { type: 'add-block'; blockId: StudyBlockId; placement?: BlockPlacement; size?: BlockSize }
  | { type: 'remove-block'; blockId: StudyBlockId }
  | { type: 'context-trigger'; trigger: ContextualTrigger; atMs: number; viewport: ViewportInfo }
  | { type: 'dismiss-contextual'; blockId?: StudyBlockId }
  | { type: 'set-practice'; practiceKind: PracticeKind | null }
  | { type: 'set-customizing'; customizing: boolean }
  | { type: 'create-workspace'; workspace: StudyWorkspace }
  | { type: 'duplicate-workspace'; workspaceId: string; newId: string; name: string }
  | { type: 'rename-workspace'; workspaceId: string; name: string; icon?: string }
  | { type: 'delete-workspace'; workspaceId: string }
  | { type: 'reset-workspace'; workspaceId: string }
  | { type: 'import-workspace'; workspace: StudyWorkspace }
  | { type: 'undo' }
  | { type: 'redo' };

export interface WorkspaceState {
  doc: WorkspaceDocument;
  past: WorkspaceDocument[];
  future: WorkspaceDocument[];
  /** Definitions this build has, used for placement/size validation. */
  definitions: ReadonlyMap<StudyBlockId, StudyBlockDefinition>;
}

/** Actions that change a layout and are therefore undoable. */
const UNDOABLE = new Set<WorkspaceAction['type']>([
  'open-block', 'close-block', 'toggle-block', 'set-presence', 'set-size',
  'set-placement', 'set-pinned', 'set-auto-hide', 'set-order', 'add-block',
  'remove-block', 'detach-block', 'attach-block', 'reset-workspace',
]);

export function activeWorkspace(doc: WorkspaceDocument): StudyWorkspace {
  return doc.workspaces.find((entry) => entry.id === doc.activeWorkspaceId)
    ?? doc.workspaces[0]
    ?? createBuiltInWorkspaces()[0];
}

function mapActive(
  doc: WorkspaceDocument,
  change: (workspace: StudyWorkspace) => StudyWorkspace,
): WorkspaceDocument {
  return {
    ...doc,
    workspaces: doc.workspaces.map((entry) => (entry.id === doc.activeWorkspaceId
      ? change(entry)
      : entry)),
  };
}

/** Presence a block returns to when opened without one being named. */
function openPresenceFor(
  definition: StudyBlockDefinition | undefined,
  placement: BlockPlacement,
): BlockPresence {
  if (placement === 'floating' || placement === 'overlay') return 'contextual';
  return definition?.category === 'focus' ? 'expanded' : 'expanded';
}

export function workspaceReducer(
  state: WorkspaceState,
  action: WorkspaceAction,
): WorkspaceState {
  const push = (doc: WorkspaceDocument): WorkspaceState => ({
    ...state,
    doc,
    past: UNDOABLE.has(action.type)
      ? [...state.past, state.doc].slice(-WORKSPACE_HISTORY_LIMIT)
      : state.past,
    future: UNDOABLE.has(action.type) ? [] : state.future,
  });

  switch (action.type) {
    case 'switch-workspace': {
      if (!state.doc.workspaces.some((entry) => entry.id === action.workspaceId)) return state;
      // Switching is not undoable and clears history: undo across two different
      // layouts would restore blocks into a workspace that never had them.
      return {
        ...state,
        doc: { ...state.doc, activeWorkspaceId: action.workspaceId },
        past: [],
        future: [],
      };
    }

    case 'add-block':
    case 'open-block': {
      const definition = state.definitions.get(action.blockId);
      if (!definition) return state;
      const placement = action.placement
        ?? definition.supportedPlacements[0]
        ?? 'floating';
      const size = ('size' in action && action.size) || definition.defaultSize || 'auto';
      const presence = ('presence' in action && action.presence)
        || openPresenceFor(definition, placement);
      return push(mapActive(state.doc, (workspace) => {
        const existing = findBlock(workspace, action.blockId);
        if (existing) {
          return withBlock(workspace, action.blockId, (instance) => ({
            ...instance,
            placement,
            size,
            presence,
          }));
        }
        return {
          ...workspace,
          blocks: [
            ...workspace.blocks,
            blockInstance(action.blockId, {
              placement,
              size,
              presence,
              order: workspace.blocks.filter((e) => e.placement === placement).length,
            }),
          ],
        };
      }));
    }

    case 'close-block':
      return push(mapActive(state.doc, (workspace) => withBlock(
        workspace,
        action.blockId,
        (instance) => ({ ...instance, presence: 'hidden', temporary: undefined }),
      )));

    case 'toggle-block': {
      const current = findBlock(activeWorkspace(state.doc), action.blockId);
      const definition = state.definitions.get(action.blockId);
      if (!definition) return state;
      if (!current) {
        return workspaceReducer(state, { type: 'open-block', blockId: action.blockId });
      }
      return push(mapActive(state.doc, (workspace) => withBlock(
        workspace,
        action.blockId,
        (instance) => ({
          ...instance,
          presence: instance.presence === 'hidden'
            ? openPresenceFor(definition, instance.placement)
            : 'hidden',
          temporary: undefined,
        }),
      )));
    }

    case 'set-presence':
      return push(mapActive(state.doc, (workspace) => withBlock(
        workspace,
        action.blockId,
        (instance) => ({ ...instance, presence: action.presence }),
      )));

    case 'set-size': {
      const definition = state.definitions.get(action.blockId);
      if (definition && !definition.supportedSizes.includes(action.size)) return state;
      return push(mapActive(state.doc, (workspace) => withBlock(
        workspace,
        action.blockId,
        (instance) => ({ ...instance, size: action.size }),
      )));
    }

    case 'set-placement': {
      const definition = state.definitions.get(action.blockId);
      if (definition && !definition.supportedPlacements.includes(action.placement)) return state;
      return push(mapActive(state.doc, (workspace) => withBlock(
        workspace,
        action.blockId,
        (instance) => ({ ...instance, placement: action.placement }),
      )));
    }

    case 'set-pinned': {
      const definition = state.definitions.get(action.blockId);
      if (definition && !definition.canPin) return state;
      return push(mapActive(state.doc, (workspace) => withBlock(
        workspace,
        action.blockId,
        // Pinning a temporary panel is what converts it into a real member of the
        // workspace — the prompt's Flow B, step 7.
        (instance) => ({
          ...instance,
          pinned: action.pinned,
          temporary: action.pinned ? undefined : instance.temporary,
          presence: action.pinned && instance.presence === 'contextual'
            ? 'expanded'
            : instance.presence,
        }),
      )));
    }

    case 'set-auto-hide': {
      const definition = state.definitions.get(action.blockId);
      if (definition && !definition.canAutoHide) return state;
      return push(mapActive(state.doc, (workspace) => withBlock(
        workspace,
        action.blockId,
        (instance) => ({ ...instance, autoHide: action.autoHide }),
      )));
    }

    case 'set-order':
      return push(mapActive(state.doc, (workspace) => withBlock(
        workspace,
        action.blockId,
        (instance) => ({ ...instance, order: Math.max(0, Math.round(action.order)) }),
      )));

    case 'detach-block': {
      const definition = state.definitions.get(action.blockId);
      if (definition && !definition.canDetach) return state;
      return push(mapActive(state.doc, (workspace) => withBlock(
        workspace,
        action.blockId,
        (instance) => ({
          ...instance,
          placement: 'detached',
          presence: instance.presence === 'hidden' ? 'expanded' : instance.presence,
          detached: {
            windowId: action.windowId,
            ...(action.displayKey ? { displayKey: action.displayKey } : {}),
            ...(action.displayHint ? { displayHint: action.displayHint } : {}),
          },
        }),
      )));
    }

    case 'attach-block':
      return push(mapActive(state.doc, (workspace) => withBlock(
        workspace,
        action.blockId,
        (instance) => {
          const definition = state.definitions.get(action.blockId);
          const fallback = definition?.supportedPlacements.find((p) => p !== 'detached')
            ?? 'right';
          return { ...instance, placement: fallback, detached: undefined };
        },
      )));

    case 'remove-block':
      // Removing from a workspace removes the PRESENTATION, never the feature. The
      // block stays in the registry and can be added back from the block library.
      return push(mapActive(state.doc, (workspace) => (
        action.blockId === 'video'
          ? workspace // the one block a workspace cannot lose
          : { ...workspace, blocks: workspace.blocks.filter((e) => e.blockId !== action.blockId) }
      )));

    case 'context-trigger': {
      const workspace = activeWorkspace(state.doc);
      const rules = workspace.contextualRules.filter((rule) => rule.on === action.trigger);
      if (!rules.length) return state;
      let doc = state.doc;
      for (const rule of rules) {
        const definition = state.definitions.get(rule.open);
        if (!definition || definition.availability === 'planned') continue;
        const placement = resolveContextualPlacement(
          activeWorkspace(doc),
          rule,
          definition,
          action.viewport,
        );
        doc = mapActive(doc, (current) => {
          const receded = rule.recede?.length
            ? current.blocks.map((instance) => (
              rule.recede!.includes(instance.blockId)
                && !instance.pinned
                && instance.presence !== 'hidden'
                ? { ...instance, presence: 'collapsed' as BlockPresence }
                : instance
            ))
            : current.blocks;
          const next = { ...current, blocks: receded };
          const existing = findBlock(next, rule.open);
          const opened: WorkspaceBlockInstance = {
            ...(existing ?? blockInstance(rule.open)),
            placement,
            size: rule.size ?? existing?.size ?? definition.defaultSize ?? 'auto',
            // A pinned block keeps the presence the user gave it; an unpinned one
            // becomes temporary, which is what Escape closes.
            presence: existing?.pinned ? existing.presence : 'contextual',
            ...(existing?.pinned
              ? {}
              : { temporary: { openedBy: action.trigger, sinceMs: action.atMs } }),
          };
          return {
            ...next,
            blocks: existing
              ? next.blocks.map((e) => (e.blockId === rule.open ? opened : e))
              : [...next.blocks, opened],
          };
        });
      }
      // Contextual opens are not undo steps: they follow the user's clicks, and an
      // undo stack full of them would bury the layout edit they actually want back.
      return { ...state, doc };
    }

    case 'dismiss-contextual':
      return {
        ...state,
        doc: mapActive(state.doc, (workspace) => ({
          ...workspace,
          blocks: workspace.blocks.map((instance) => {
            if (action.blockId && instance.blockId !== action.blockId) return instance;
            if (instance.pinned || !instance.temporary) return instance;
            return { ...instance, presence: 'hidden', temporary: undefined };
          }),
        })),
      };

    case 'set-practice':
      return {
        ...state,
        doc: mapActive(state.doc, (workspace) => ({
          ...workspace,
          ...(action.practiceKind
            ? { practiceKind: action.practiceKind }
            : { practiceKind: undefined }),
        })),
      };

    case 'set-customizing':
      return {
        ...state,
        doc: { ...state.doc, customizing: action.customizing },
        // Leaving customize mode ends the undo scope with it.
        ...(action.customizing ? {} : { past: [], future: [] }),
      };

    case 'create-workspace':
    case 'import-workspace':
      if (state.doc.workspaces.some((entry) => entry.id === action.workspace.id)) return state;
      return {
        ...state,
        doc: {
          ...state.doc,
          workspaces: [...state.doc.workspaces, action.workspace],
          activeWorkspaceId: action.workspace.id,
        },
      };

    case 'duplicate-workspace': {
      const source = state.doc.workspaces.find((entry) => entry.id === action.workspaceId);
      if (!source || state.doc.workspaces.some((entry) => entry.id === action.newId)) return state;
      const copy: StudyWorkspace = {
        ...source,
        id: action.newId,
        name: action.name,
        nameKey: undefined,
        builtIn: false,
        blocks: source.blocks.map((instance) => ({ ...instance, detached: undefined })),
      };
      return {
        ...state,
        doc: {
          ...state.doc,
          workspaces: [...state.doc.workspaces, copy],
          activeWorkspaceId: copy.id,
        },
      };
    }

    case 'rename-workspace':
      return {
        ...state,
        doc: {
          ...state.doc,
          workspaces: state.doc.workspaces.map((entry) => (entry.id === action.workspaceId
            ? { ...entry, name: action.name, nameKey: undefined, ...(action.icon ? { icon: action.icon } : {}) }
            : entry)),
        },
      };

    case 'delete-workspace': {
      const target = state.doc.workspaces.find((entry) => entry.id === action.workspaceId);
      // A built-in has no delete: it is the floor a broken layout falls back to.
      if (!target || target.builtIn) return state;
      const workspaces = state.doc.workspaces.filter((entry) => entry.id !== action.workspaceId);
      return {
        ...state,
        doc: {
          ...state.doc,
          workspaces,
          activeWorkspaceId: state.doc.activeWorkspaceId === action.workspaceId
            ? DEFAULT_WORKSPACE_ID
            : state.doc.activeWorkspaceId,
        },
      };
    }

    case 'reset-workspace': {
      const builtIn = createBuiltInWorkspaces().find((entry) => entry.id === action.workspaceId);
      if (!builtIn) return state;
      return push({
        ...state.doc,
        workspaces: state.doc.workspaces.map((entry) => (entry.id === action.workspaceId
          ? builtIn
          : entry)),
      });
    }

    case 'undo': {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        ...state,
        doc: previous,
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future].slice(0, WORKSPACE_HISTORY_LIMIT),
      };
    }

    case 'redo': {
      const [next, ...rest] = state.future;
      if (!next) return state;
      return {
        ...state,
        doc: next,
        past: [...state.past, state.doc].slice(-WORKSPACE_HISTORY_LIMIT),
        future: rest,
      };
    }

    default:
      return state;
  }
}

export function createWorkspaceState(
  doc: WorkspaceDocument,
  definitions: ReadonlyMap<StudyBlockId, StudyBlockDefinition>,
): WorkspaceState {
  return { doc, past: [], future: [], definitions };
}
