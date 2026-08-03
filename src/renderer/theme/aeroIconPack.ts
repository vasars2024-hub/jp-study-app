/**
 * Secret OS — original icon system (Phase 5 · M7)
 * -----------------------------------------------------------------------------
 * Phase 4.5 shipped representative icon *plates*: the flat line glyph on a muted
 * CSS-tinted square. This is the real pack — one drawing language, three tiers:
 *
 *   Applications   → `tile`. A glass plate in the family gradient carrying the
 *                    base line glyph in white. A row of them reads as a set.
 *   Shell objects  → `object`. Folders, files, drives, discs, the bin: real
 *                    silhouettes, because these are things, not programs.
 *   Status & power → `object`, with silhouettes chosen so they are told apart
 *                    without colour (see the `shape` field and its test).
 *
 * Inline UI affordances — search, close, plus, chevron, the transport controls —
 * are deliberately ABSENT. They stay monochrome line glyphs that inherit
 * `currentColor`, because a glossy amber plate inside a text field's search
 * button is exactly the Phase 4.5 mistake in the other direction. A pack is
 * partial by design; anything missing falls through.
 *
 * Everything here is drawn on a 24×24 grid, authored in this repository, and
 * carries no resemblance to any shipped operating system's icon set. Colours
 * are Aero-era in feel — aqua, glass, warm plastic — not sampled from anything.
 */

import { registerIconPack, type IconPack, type LayeredGlyph } from './iconPacks';

export const AERO_ICON_PACK_ID = 'secret-aero-icons';

/**
 * Family palettes. Each carries its own dark `edge` so an icon holds its outline
 * against a bright wallpaper as well as against the dark taskbar glass — the
 * icons never rely on the surface behind them for legibility.
 */
const FAMILIES: IconPack['families'] = {
  /** Playback, video, music. Warm rose. */
  media: { top: '#ff87a8', bottom: '#c31447', edge: '#6d0c27', accent: '#ffdce6' },
  /** Dictionary, grammar, translation. Aqua-teal — the Aero house colour. */
  language: { top: '#66e0d2', bottom: '#0a8b83', edge: '#04443f', accent: '#dcfffa' },
  /** Reading and immersion. Deep glass blue. */
  reading: { top: '#7cc4ff', bottom: '#1663c0', edge: '#0b3568', accent: '#dfeeff' },
  /** Cards and review. Warm amber plastic. */
  cards: { top: '#ffc275', bottom: '#d8611f', edge: '#71300e', accent: '#ffead1' },
  /** Progress, planning, resources. Fresh green. */
  study: { top: '#b3e97f', bottom: '#3f9130', edge: '#1f4d18', accent: '#e9ffdb' },
  /** Settings, shell utilities, the desktop itself. Brushed steel. */
  system: { top: '#bcd4e4', bottom: '#4d6b80', edge: '#22323d', accent: '#eef6fb' },
  /** Games and delight. Violet. */
  play: { top: '#c3a4ff', bottom: '#6b3fc4', edge: '#331b63', accent: '#ece1ff' },
  /** Folders and containers. Manila. */
  manila: { top: '#ffdf94', bottom: '#e0a327', edge: '#6f5010', accent: '#fff5da' },
  // Paper is the one family whose body is too light for white detail, so it
  // overrides `detail` with a slate ink instead.
  /** Documents. Paper white with a cool edge. */
  paper: {
    top: '#ffffff',
    bottom: '#cddde8',
    edge: '#3d5665',
    accent: '#8fb3c9',
    detail: '#41627a',
  },
  /** Informational status. */
  info: { top: '#7cc4ff', bottom: '#1a6fc9', edge: '#0b3568', accent: '#e3f1ff' },
  /** Caution status. */
  alert: { top: '#ffd45e', bottom: '#e08a05', edge: '#6d4200', accent: '#fff3cf' },
  /** Failure status. */
  danger: { top: '#ff8a76', bottom: '#c62410', edge: '#611006', accent: '#ffdcd5' },
  /** Success status. */
  ok: { top: '#9ce87a', bottom: '#2f9c3f', edge: '#14501e', accent: '#e2ffd6' },
  /** Sleep and night. */
  night: { top: '#9fb6ff', bottom: '#2f3f9c', edge: '#141c50', accent: '#e0e7ff' },
  /** The Secret OS emblem: glass leaf, aqua to leaf-green. */
  leaf: { top: '#b6f06a', bottom: '#00b7a8', edge: '#0a5a52', accent: '#f0ffe0' },
};

/** Shorthand for an application plate. */
const tile = (family: string, glyphScale?: number): LayeredGlyph => ({
  family,
  form: 'tile',
  shape: 'plate',
  ...(glyphScale ? { glyphScale } : {}),
});

// ---------------------------------------------------------------------------
// Shared object geometry. Reusing these is what makes the file/folder set feel
// like one family rather than five drawings that happen to sit together.
// ---------------------------------------------------------------------------

/** Portrait sheet with the top-right corner turned down. */
const SHEET_BODY =
  'M6.4 2.4h7.2L19 8v13a1.2 1.2 0 0 1-1.2 1.2H6.4A1.2 1.2 0 0 1 5.2 21V3.6a1.2 1.2 0 0 1 1.2-1.2z';
/** The turned-down corner, drawn in the family accent so it reads as a fold. */
const SHEET_FOLD = 'M13.6 2.4 19 8h-5.4z';
/** Folder back plate with the tab. */
const FOLDER_BACK =
  'M2.6 7.2a1.6 1.6 0 0 1 1.6-1.6h4.5l2 2h9.1a1.6 1.6 0 0 1 1.6 1.6v3.4H2.6z';

const sheet = (detail?: string, detailWidth = 1.4): LayeredGlyph => ({
  family: 'paper',
  form: 'object',
  body: SHEET_BODY,
  accent: SHEET_FOLD,
  shape: 'sheet',
  ...(detail ? { detail, detailWidth } : {}),
});

const GLYPHS: IconPack['glyphs'] = {
  // ---- Applications -------------------------------------------------------
  player: tile('media'),
  video: tile('media'),
  music: tile('media'),
  headphones: tile('media'),
  dictionary: tile('language'),
  translate: tile('language'),
  grammar: tile('language'),
  library: tile('reading'),
  novels: tile('reading'),
  globe: tile('reading'),
  bookmark: tile('reading'),
  scan: tile('reading'),
  anki: tile('cards'),
  flashcards: tile('cards'),
  stats: tile('study'),
  'chart-bar': tile('study'),
  calendar: tile('study'),
  resources: tile('study'),
  settings: tile('system'),
  app: tile('system'),
  city: tile('system'),
  widgets: tile('system'),
  monitor: tile('system'),
  dice: tile('play'),
  sparkle: tile('play'),
  confetti: tile('play'),

  // ---- The emblem ---------------------------------------------------------
  // Deliberately the same glass leaf the Start orb already draws in
  // aero-shell.css, so the button and the icon are one mark, not two.
  logo: {
    family: 'leaf',
    form: 'object',
    body: 'M3.6 20.6C3.6 10.2 11.8 2.6 20.4 3.6c1.1 12.6-8.6 19-16.8 17z',
    detail: 'M7 18.2C11.2 14 15.4 9 18.4 5.9',
    detailWidth: 1.5,
    shape: 'gem',
  },

  // ---- Containers ---------------------------------------------------------
  folder: {
    family: 'manila',
    form: 'object',
    body: FOLDER_BACK,
    accent: 'M2.6 10.4h18.8v8.2a1.6 1.6 0 0 1-1.6 1.6H4.2a1.6 1.6 0 0 1-1.6-1.6z',
    shape: 'folder',
  },
  'folder-open': {
    family: 'manila',
    form: 'object',
    body: FOLDER_BACK,
    // The open front leans away, so the back plate stays visible above it.
    accent: 'M2.6 12.2h20.2l-2.9 7.1a1.6 1.6 0 0 1-1.5 1H4.2a1.6 1.6 0 0 1-1.6-1.6z',
    shape: 'folder',
  },
  drive: {
    family: 'system',
    form: 'object',
    body:
      'M3 6.4a1.6 1.6 0 0 1 1.6-1.6h14.8A1.6 1.6 0 0 1 21 6.4v11.2a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 17.6z',
    accent: 'M3 13.2h18v4.4a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 17.6z',
    detail: 'M6.2 16.4h5.2',
    detailWidth: 1.3,
    shape: 'block',
  },
  disc: {
    family: 'system',
    form: 'object',
    body: 'M12 2.6a9.4 9.4 0 1 0 0 18.8 9.4 9.4 0 0 0 0-18.8z',
    accent: 'M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z',
    detail: 'M6.6 7.2a7.2 7.2 0 0 1 4.2-2.4',
    detailWidth: 1.6,
    shape: 'disc',
  },
  trash: {
    family: 'system',
    form: 'object',
    body:
      'M6.2 7.6h11.6l-1 12.2a1.4 1.4 0 0 1-1.4 1.3H8.6a1.4 1.4 0 0 1-1.4-1.3z',
    accent: 'M4.6 5h14.8v2.6H4.6z M9.4 2.8h5.2V5H9.4z',
    detail: 'M10.2 10.8v6.6 M13.8 10.8v6.6',
    detailWidth: 1.3,
    shape: 'bin',
  },

  // ---- Documents ----------------------------------------------------------
  file: sheet(),
  'file-text': sheet('M8.2 11.4h7.6 M8.2 14.2h7.6 M8.2 17h5'),
  'file-image': sheet('M8 18.6l3.2-3.6 2.4 2.6 1.8-2 1.4 3z M10.2 12.4a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0z', 1.2),
  'file-audio': sheet('M10.4 17.4v-5.2l5-1.1v5.2', 1.4),
  'file-video': sheet('M9.8 12.2v6.2l6-3.1z', 1.3),
  note: {
    family: 'study',
    form: 'object',
    body:
      'M4.8 3.6a1.4 1.4 0 0 1 1.4-1.4h11.6a1.4 1.4 0 0 1 1.4 1.4v13.2l-4.8 4.8H6.2a1.4 1.4 0 0 1-1.4-1.4z',
    accent: 'M19.2 16.8 14.4 21.6v-3.4a1.4 1.4 0 0 1 1.4-1.4z',
    detail: 'M8 7.2h8 M8 10.4h8 M8 13.6h5',
    detailWidth: 1.4,
    shape: 'sheet',
  },

  // ---- Status: four different outlines, never four colours of one outline --
  info: {
    family: 'info',
    form: 'object',
    body: 'M12 2.6a9.4 9.4 0 1 0 0 18.8 9.4 9.4 0 0 0 0-18.8z',
    detail: 'M12 11v5.6 M12 7.6h.01',
    detailWidth: 2,
    shape: 'disc',
  },
  warning: {
    family: 'alert',
    form: 'object',
    body: 'M13.2 3.3 22.6 19.6a1.4 1.4 0 0 1-1.2 2.1H2.6a1.4 1.4 0 0 1-1.2-2.1L10.8 3.3a1.4 1.4 0 0 1 2.4 0z',
    detail: 'M12 9.4v5.2 M12 18h.01',
    detailWidth: 2,
    shape: 'wedge',
  },
  error: {
    family: 'danger',
    form: 'object',
    body: 'M8.4 2.6h7.2L21.4 8.4v7.2L15.6 21.4H8.4L2.6 15.6V8.4z',
    detail: 'M9.2 9.2l5.6 5.6 M14.8 9.2l-5.6 5.6',
    detailWidth: 2,
    shape: 'octagon',
  },
  success: {
    family: 'ok',
    form: 'object',
    // The check IS the silhouette — no badge — so it survives greyscale.
    body: 'M9.6 19.8 2 12.2l3-3 4.6 4.6L19 4.4l3 3z',
    shape: 'check',
  },

  // ---- Lifecycle: likewise five different outlines ------------------------
  power: {
    family: 'ok',
    form: 'object',
    body: 'M12 2.6a9.4 9.4 0 1 0 0 18.8 9.4 9.4 0 0 0 0-18.8z',
    detail: 'M12 6.4v5.4 M8.2 8.6a5 5 0 1 0 7.6 0',
    detailWidth: 2,
    shape: 'ring',
  },
  sleep: {
    family: 'night',
    form: 'object',
    body: 'M20.8 15.6A9.2 9.2 0 0 1 8.4 3.2 9.4 9.4 0 1 0 20.8 15.6z',
    detail: 'M15.6 4.4h3.6l-3.6 3.6h3.6',
    detailWidth: 1.3,
    shape: 'crescent',
  },
  restart: {
    family: 'info',
    form: 'object',
    body:
      'M12 3.4a8.6 8.6 0 1 1-8.4 6.8l3.1.7A5.4 5.4 0 1 0 12 6.6z M11 1.2l4.4 3-4.4 3z',
    shape: 'cycle',
  },
  logout: {
    family: 'system',
    form: 'object',
    body:
      'M4.4 3.4h8a1.4 1.4 0 0 1 1.4 1.4v3.4h-2.6V6H6V18h5.2v-2.2h2.6v3.4a1.4 1.4 0 0 1-1.4 1.4h-8A1.4 1.4 0 0 1 3 19.2V4.8a1.4 1.4 0 0 1 1.4-1.4z',
    accent: 'M16.4 7.4 21.6 12l-5.2 4.6v-3.2h-5.2v-2.8h5.2z',
    shape: 'door',
  },
  lock: {
    family: 'system',
    form: 'object',
    body:
      'M6.2 10.2h11.6a1.4 1.4 0 0 1 1.4 1.4v8.4a1.4 1.4 0 0 1-1.4 1.4H6.2a1.4 1.4 0 0 1-1.4-1.4v-8.4a1.4 1.4 0 0 1 1.4-1.4z',
    accent: 'M8.4 10.2V7.6a3.6 3.6 0 0 1 7.2 0v2.6h-2.4V7.6a1.2 1.2 0 0 0-2.4 0v2.6z',
    detail: 'M12 14.2v3.2',
    detailWidth: 1.8,
    shape: 'lock',
  },

  // Companion trinkets (Phase 5 · M12) — a small collectible mark, warm amber
  // rather than literal gold, so it reads as "keepsake" and not "medal ceremony".
  trophy: {
    family: 'cards',
    form: 'object',
    body: 'M7.4 3.6h9.2v4.6a4.6 4.6 0 0 1-9.2 0z',
    accent:
      'M7.4 4.6H4.6v1.8a2.8 2.8 0 0 0 2.8 2.8 M16.6 4.6h2.8v1.8a2.8 2.8 0 0 1-2.8 2.8',
    detail: 'M12 13.4v2.6 M9.2 20.4h5.6 M9.2 20.4v-2.1a1 1 0 0 1 1-1h3.6a1 1 0 0 1 1 1v2.1',
    detailWidth: 1.3,
    shape: 'star',
  },

  // ---- Tray and system feedback -------------------------------------------
  bell: {
    family: 'alert',
    form: 'object',
    body: 'M12 2.4a5.9 5.9 0 0 1 5.9 5.9v4.3l1.9 3.3H4.2l1.9-3.3V8.3A5.9 5.9 0 0 1 12 2.4z',
    accent: 'M9.3 17.4h5.4a2.7 2.7 0 0 1-5.4 0z',
    shape: 'bell',
  },
  shield: {
    family: 'reading',
    form: 'object',
    body: 'M12 2.2 20.6 5.3v6.5c0 5.1-3.7 8.4-8.6 10-4.9-1.6-8.6-4.9-8.6-10V5.3z',
    detail: 'M8.4 12l2.7 2.7 4.7-5.1',
    detailWidth: 1.9,
    shape: 'shield',
  },
  network: {
    family: 'info',
    form: 'object',
    // The tallest bar stops at 22.6, not 23 — a 0.9 edge stroke on the far side
    // would otherwise be half-clipped by the viewBox.
    body: 'M2.8 17.6h3.4v3.6H2.8z M8.4 13.8h3.4v7.4H8.4z M14 10h3.4v11.2H14z M19.2 6.2h3.4v15h-3.4z',
    shape: 'signal',
  },
  battery: {
    family: 'ok',
    form: 'object',
    body:
      'M2.4 8.6a1.6 1.6 0 0 1 1.6-1.6h13.8a1.6 1.6 0 0 1 1.6 1.6v6.8a1.6 1.6 0 0 1-1.6 1.6H4a1.6 1.6 0 0 1-1.6-1.6z M20.6 10.2h1.2a.9.9 0 0 1 .9.9v1.8a.9.9 0 0 1-.9.9h-1.2z',
    accent: 'M4.4 9h9v6H4.4z',
    shape: 'bar',
  },
  help: {
    family: 'info',
    form: 'object',
    body: 'M12 2.6a9.4 9.4 0 1 0 0 18.8 9.4 9.4 0 0 0 0-18.8z',
    detail: 'M9.4 9.4a2.7 2.7 0 1 1 3.4 2.6v1.8 M12.6 17.2h.01',
    detailWidth: 1.9,
    shape: 'bubble',
  },
};

export const AERO_ICON_PACK: IconPack = {
  id: AERO_ICON_PACK_ID,
  label: 'Secret Aero Icons',
  provenance:
    'Original vector artwork authored in this repository. No external icon set, ' +
    'font, brand mark, or operating-system asset was traced, sampled, or bundled.',
  families: FAMILIES,
  glyphs: GLYPHS,
};

/**
 * Register the Aero icon pack. Called by registerFrutigerAero().
 *
 * No module-level `registered` flag: the registry is already keyed by id, and a
 * local flag would go out of sync with it the moment anything clears the
 * registry — which is exactly what a stale flag looks like from the outside
 * (icons silently fall back to line glyphs and nothing errors).
 */
export function registerAeroIconPack(): void {
  registerIconPack(AERO_ICON_PACK);
}
