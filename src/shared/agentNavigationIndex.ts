/**
 * The deterministic help/settings/command index behind a *fresh* "where is X?".
 *
 * Navigation until now could only answer a question the user had already
 * answered themselves: `resolveAgentNavigation` re-derives its destination from
 * a live `route` context item, so a suggestion existed only when a hand-off had
 * already attached the place. Ask the Agent "where do I change the interface
 * language?" from a cold conversation and there was nothing to resolve.
 *
 * This module is the missing half, and it is deliberately *not* a model call:
 *
 * 1. **The index is a static table.** Every destination below is a section the
 *    allowlist already permits, a Settings page, or a Settings control that is
 *    already a registered guided target. Nothing here can name a place
 *    `agentNavigation.ts` would refuse.
 * 2. **Matching is exact-token, never fuzzy.** A term matches only when every
 *    one of its tokens is present in the query. There is no edit distance and no
 *    substring search, so "ai" cannot match "said" and the same question always
 *    produces the same answer — which is what lets approval re-run the lookup
 *    later and require the identical result.
 * 3. **Ambiguity refuses.** Two equally-good destinations in the same precedence
 *    band return `null` rather than a guess. A wrong window that opens confidently
 *    is worse than no suggestion.
 *
 * Terms are English on purpose, exactly like `SETTINGS_REGISTRY.keywords` in the
 * Settings surface this mirrors: a JA/ZH/RU user finds a setting by typing its
 * English feature name there too. `agentNavigationIndex.test.ts` asserts every
 * entry against that registry and against the guided-target allowlist, so a
 * control that is renamed or removed fails a test instead of silently routing
 * the user somewhere that no longer exists.
 */

import type { DesktopWinSection } from './desktop';

export interface AgentNavigationIndexEntry {
  /** An allowlisted section; `settings` for every page and control target. */
  section: DesktopWinSection;
  /** Settings page id — required for a control, optional on its own. */
  page?: string;
  /** Registered guided control id. Always resolves with a visible highlight. */
  controlId?: string;
  /**
   * Search terms. `terms[0]` is the destination's own English name and scores an
   * extra point, so naming a thing outranks merely mentioning one of its
   * keywords. Multi-word terms match only when every word is present.
   */
  terms: readonly string[];
}

export interface AgentNavigationIndexResult {
  section: DesktopWinSection;
  page?: string;
  controlId?: string;
  highlight?: true;
}

/**
 * Every app window the Agent may route a bare feature name to.
 *
 * Terms are the section's own English command-palette label plus its section id
 * — no invented synonyms. Anything richer belongs in the palette itself, where
 * the whole app can benefit from it rather than only this index.
 */
const SECTION_ENTRIES: readonly AgentNavigationIndexEntry[] = [
  { section: 'agent', terms: ['agent'] },
  { section: 'library', terms: ['library'] },
  { section: 'novels', terms: ['novels'] },
  // `terms[0]` is the name a user actually types, which is not always the full
  // palette label: nobody asks for "Reading Finder" by its surname.
  { section: 'reading', terms: ['reading', 'reading finder'] },
  { section: 'dictionary', terms: ['dictionary'] },
  { section: 'grammar', terms: ['grammar'] },
  { section: 'notebook', terms: ['notebook'] },
  { section: 'translate', terms: ['translate'] },
  { section: 'player', terms: ['media', 'player'] },
  { section: 'video', terms: ['video'] },
  { section: 'music', terms: ['music'] },
  { section: 'anki', terms: ['anki'] },
  { section: 'flashcards', terms: ['flashcards'] },
  { section: 'games', terms: ['game arena', 'games'] },
  { section: 'stats', terms: ['statistics', 'stats'] },
  { section: 'resources', terms: ['resources'] },
  { section: 'city', terms: ['mooncap garden', 'city'] },
  { section: 'musicwidget', terms: ['music widget', 'musicwidget'] },
  { section: 'immersion', terms: ['immersion'] },
  { section: 'calendar', terms: ['calendar'] },
  // No bare `settings` section entry: `isAgentNavigationDestination` requires a
  // page for that one section, so "settings" resolves to the Home page below.
  { section: 'youtube', terms: ['youtube'] },
  { section: 'scraper', terms: ['scraper'] },
];

/** Settings pages, named by their own sidebar label and description. */
const PAGE_ENTRIES: readonly AgentNavigationIndexEntry[] = [
  { section: 'settings', page: 'home', terms: ['settings', 'home', 'quick actions', 'status'] },
  { section: 'settings', page: 'appearance', terms: ['appearance', 'themes', 'colors', 'fonts'] },
  { section: 'settings', page: 'wallpaper', terms: ['wallpaper', 'desktop background'] },
  { section: 'settings', page: 'atmosphere', terms: ['atmosphere', 'living layer', 'particles', 'lighting'] },
  { section: 'settings', page: 'companions', terms: ['companions', 'desktop pets'] },
  { section: 'settings', page: 'desktop-layout', terms: ['desktop layout', 'icons', 'taskbar', 'session'] },
  { section: 'settings', page: 'shortcuts', terms: ['shortcuts', 'keyboard', 'mouse', 'bindings'] },
  { section: 'settings', page: 'mini', terms: ['mini view', 'launcher', 'pop out apps'] },
  { section: 'settings', page: 'lockscreen', terms: ['lockscreen', 'pin gate'] },
  { section: 'settings', page: 'study', terms: ['profile dictionary', 'profiles', 'dictionaries'] },
  { section: 'settings', page: 'profile-rules', terms: ['mining rules', 'anki profiles'] },
  { section: 'settings', page: 'reading', terms: ['reading', 'reader typography'] },
  { section: 'settings', page: 'transcription', terms: ['transcription', 'whisper device'] },
  { section: 'settings', page: 'scraper', terms: ['scraper', 'providers', 'tracking', 'players', 'subtitles'] },
  { section: 'settings', page: 'visualizer', terms: ['visualizer', 'music visuals', 'lyrics'] },
  { section: 'settings', page: 'special', terms: ['special', 'wired', 'aero', 'secret modules'] },
  { section: 'settings', page: 'monitors', terms: ['monitors', 'screens', 'desktops'] },
  { section: 'settings', page: 'file-drops', terms: ['file drops', 'dropped files'] },
  { section: 'settings', page: 'api-keys', terms: ['api keys', 'keys'] },
  { section: 'settings', page: 'display', terms: ['display', 'zoom', 'motion'] },
  { section: 'settings', page: 'motion', terms: ['motion', 'animation speed', 'effects'] },
  { section: 'settings', page: 'storage', terms: ['models dictionaries', 'download', 'update', 'remove models'] },
  { section: 'settings', page: 'memory', terms: ['memory storage', 'usage', 'inventory', 'backups'] },
  { section: 'settings', page: 'help', terms: ['help', 'guided tour'] },
];

/**
 * Every registered guided control, with the terms its own Settings search entry
 * already uses. `terms[0]` is that entry's English title; the rest are its
 * `keywords`, verbatim — the mirror test refuses anything invented here.
 */
const CONTROL_ENTRIES: readonly AgentNavigationIndexEntry[] = [
  { section: 'settings', page: 'appearance', controlId: 'appearance-preview', terms: ['preview', 'try', 'draft', 'before', 'appearance', 'look'] },
  { section: 'settings', page: 'appearance', controlId: 'ui-language', terms: ['language', 'locale', 'i18n', 'english', 'japanese', 'chinese', 'russian', 'interface', 'ui'] },
  { section: 'settings', page: 'appearance', controlId: 'theme', terms: ['theme', 'dark', 'light', 'appearance', 'color scheme'] },
  { section: 'settings', page: 'appearance', controlId: 'accent', terms: ['accent colour', 'accent', 'color', 'colour', 'red', 'personalization'] },
  { section: 'settings', page: 'appearance', controlId: 'typography', terms: ['typography density', 'font', 'density', 'corners', 'typography', 'spacing'] },
  { section: 'settings', page: 'appearance', controlId: 'materials', terms: ['shape materials', 'chrome', 'frosted', 'shadow', 'materials', 'glass'] },
  { section: 'settings', page: 'appearance', controlId: 'custom-css', terms: ['custom css', 'css', 'advanced', 'sandbox', 'style'] },
  { section: 'settings', page: 'wallpaper', controlId: 'wallpaper', terms: ['wallpaper', 'background', 'image', 'video', 'live', 'slideshow', 'folder', 'cycle', 'shuffle'] },
  { section: 'settings', page: 'wallpaper', controlId: 'wallpaper-dim', terms: ['wallpaper dim', 'dim', 'brightness'] },
  { section: 'settings', page: 'wallpaper', controlId: 'rotation', terms: ['wallpaper rotation', 'rotation', 'playlist', 'schedule', 'day cycle', 'calendar walls'] },
  { section: 'settings', page: 'wallpaper', controlId: 'mini-wallpaper', terms: ['mini wallpaper', 'mini backdrop', 'craft window', 'app icons', 'mosaic', 'blur'] },
  { section: 'settings', page: 'atmosphere', controlId: 'living-layer', terms: ['living desktop layer', 'living', 'atmosphere', 'environment', 'layer'] },
  { section: 'settings', page: 'atmosphere', controlId: 'lighting', terms: ['day cycle lighting', 'lighting', 'ambient', 'dawn', 'night', 'wash'] },
  { section: 'settings', page: 'atmosphere', controlId: 'particles', terms: ['particles', 'fireflies', 'snow', 'rain', 'dust', 'intensity', 'density', 'size'] },
  { section: 'settings', page: 'atmosphere', controlId: 'particle-size', terms: ['particle size', 'size', 'radius', 'flake size', 'scale'] },
  { section: 'settings', page: 'atmosphere', controlId: 'snow-accumulation', terms: ['snow accumulation', 'snow', 'accumulation', 'piles', 'winter'] },
  { section: 'settings', page: 'atmosphere', controlId: 'achievements', terms: ['achievements', 'streak', 'celebration', 'milestone'] },
  { section: 'settings', page: 'companions', controlId: 'companions', terms: ['companions', 'pets', 'critter', 'buddy', 'shimeji'] },
  { section: 'settings', page: 'companions', controlId: 'companion-activeness', terms: ['companion speed', 'speed', 'activeness', 'animation', 'walk', 'shimeji', 'pace'] },
  { section: 'settings', page: 'companions', controlId: 'buddy-programmer', terms: ['buddy programmer', 'buddy', 'routine', 'macro', 'command chain', 'program', 'automate', 'companion script'] },
  { section: 'settings', page: 'companions', controlId: 'os-pets', terms: ['windows desktop pets', 'os desktop', 'overlay', 'host', 'multi-monitor', 'monitors'] },
  { section: 'settings', page: 'desktop-layout', controlId: 'icons', terms: ['icons', 'snap', 'grid', 'label', 'desktop'] },
  { section: 'settings', page: 'desktop-layout', controlId: 'icon-recommended', terms: ['recommended', 'preset', 'layout', 'arrange', 'placement', 'icons', 'desktop'] },
  { section: 'settings', page: 'desktop-layout', controlId: 'taskbar', terms: ['taskbar', 'clock', '24h', 'time'] },
  { section: 'settings', page: 'desktop-layout', controlId: 'start-menu', terms: ['start menu', 'start', 'menu', 'columns'] },
  { section: 'settings', page: 'desktop-layout', controlId: 'session', terms: ['session restore', 'session', 'restore', 'windows', 'launch'] },
  { section: 'settings', page: 'shortcuts', controlId: 'shortcuts', terms: ['keyboard shortcuts', 'shortcut', 'keybind', 'hotkey', 'keyboard', 'mouse', 'ctrl', 'binding'] },
  { section: 'settings', page: 'lockscreen', controlId: 'lockscreen-enable', terms: ['lockscreen', 'lock', 'pin', 'passcode', 'password', 'security', 'login'] },
  { section: 'settings', page: 'lockscreen', controlId: 'lockscreen-pin', terms: ['lockscreen passcode', 'pin', 'passcode', 'password', '4 digit', 'lock'] },
  { section: 'settings', page: 'lockscreen', controlId: 'lockscreen-tint', terms: ['lockscreen look', 'lockscreen', 'tint', 'look', 'theme'] },
  { section: 'settings', page: 'study', controlId: 'focus-mode', terms: ['focus mode', 'focus', 'reader', 'distraction', 'study', 'minimal', 'epub'] },
  { section: 'settings', page: 'study', controlId: 'focus-lock', terms: ['focus lock timer', 'focus', 'lock', 'timer', 'pomodoro', 'commit', 'distraction', 'exit'] },
  { section: 'settings', page: 'study', controlId: 'focus-default-tab', terms: ['focus default tab', 'focus', 'tab', 'library', 'dictionary', 'anki', 'default'] },
  { section: 'settings', page: 'study', controlId: 'focus-distractions', terms: ['focus distractions', 'focus', 'music', 'chrome', 'minimal', 'hide', 'distraction'] },
  { section: 'settings', page: 'study', controlId: 'focus-auto-enter', terms: ['auto enter focus', 'focus', 'launch', 'startup', 'auto', 'enter', 'boot'] },
  { section: 'settings', page: 'study', controlId: 'game-arena', terms: ['game arena', 'minigames', 'mirror writing', 'source language', 'badges', 'xp'] },
  { section: 'settings', page: 'study', controlId: 'profile', terms: ['study profile', 'profile', 'study', 'jlpt'] },
  { section: 'settings', page: 'study', controlId: 'dictionary', terms: ['dictionary', 'yomitan', 'lookup'] },
  { section: 'settings', page: 'study', controlId: 'system-dictionary', terms: ['popup dictionary everywhere', 'popup dictionary', 'system wide', 'global', 'hotkey', 'shortcut', 'overlay', 'anywhere', 'windows', 'lookup', 'selection', 'clipboard', 'tray'] },
  { section: 'settings', page: 'study', controlId: 'ai-analysis', terms: ['ai analysis', 'ai', 'ai ocr', 'analysis', 'annotate', 'grammar', 'explanation', 'formality', 'register', 'translation', 'snapshot', 'notebook', 'deck', 'flashcard', 'anki', 'highlight'] },
  { section: 'settings', page: 'study', controlId: 'reading-lens', terms: ['reading lens', 'ocr', 'screen', 'capture', 'region', 'manga', 'game', 'visual novel', 'subtitle', 'overlay', 'in place', 'hotkey', 'anywhere'] },
  { section: 'settings', page: 'study', controlId: 'study-language', terms: ['study language', 'study', 'language', 'japanese', 'chinese', 'environment', 'dictionary', 'zh', 'ja'] },
  { section: 'settings', page: 'study', controlId: 'study-language-setup', terms: ['setup', 'download', 'cedict', 'chinese', 'dictionary', 'assets'] },
  { section: 'settings', page: 'study', controlId: 'extension-bridge', terms: ['chrome extension', 'chrome', 'extension', 'install', 'pair', 'token', 'bridge', 'load unpacked'] },
  { section: 'settings', page: 'profile-rules', controlId: 'profile-rules', terms: ['mining profile rules', 'profile rules', 'mining rules', 'anki profile', 'route', 'match', 'extension', 'epub', 'audio', 'mine'] },
  { section: 'settings', page: 'reading', controlId: 'reading', terms: ['reading settings', 'reading', 'font size', 'epub', 'novel', 'typography'] },
  { section: 'settings', page: 'transcription', controlId: 'whisper', terms: ['transcription device', 'whisper', 'transcription', 'gpu', 'cpu', 'subtitles'] },
  { section: 'settings', page: 'visualizer', controlId: 'visualizer', terms: ['music visualizer', 'visualizer', 'spectrum', 'music', 'fft'] },
  { section: 'settings', page: 'visualizer', controlId: 'lyrics', terms: ['lyrics lookup', 'lyrics', 'album', 'search'] },
  { section: 'settings', page: 'special', controlId: 'blanc-mode', terms: ['blanc mode', 'blanc', 'toolbox', 'toolbox os', 'minimal', 'plain mode', 'white mode', 'simple shell', 'mode', 'side agent'] },
  { section: 'settings', page: 'special', controlId: 'wired-archive', terms: ['wired archive', 'crt', 'boot replay', 'static', 'terminal ambient'] },
  { section: 'settings', page: 'special', controlId: 'wired-finding-terminal', terms: ['navi terminal', 'wired finding', 'lyrics', 'shimeji', 'radar', 'surveillance', 'hacker terminal', 'fateburn'] },
  { section: 'settings', page: 'special', controlId: 'aero-gadget-lab', terms: ['aero gadget lab', 'xp', 'vista', 'windows media player', 'msn', 'cmd', 'legacy'] },
  { section: 'settings', page: 'display', controlId: 'window-chrome', terms: ['window chrome', 'borderless', 'frameless', 'title bar', 'window', 'chrome', 'fullscreen', 'standard'] },
  { section: 'settings', page: 'display', controlId: 'zoom', terms: ['app zoom', 'zoom', 'scale', 'size', 'accessibility', 'display'] },
  { section: 'settings', page: 'display', controlId: 'base-font', terms: ['base text size', 'font', 'text size', 'bold', 'display', 'typography'] },
  { section: 'settings', page: 'display', controlId: 'contrast', terms: ['contrast spacing', 'contrast', 'letter spacing', 'underline', 'accessibility'] },
  { section: 'settings', page: 'display', controlId: 'night-light', terms: ['night light', 'night', 'warm', 'blue light', 'evening', 'display'] },
  { section: 'settings', page: 'display', controlId: 'brightness-sat', terms: ['brightness saturation', 'brightness', 'saturation', 'color', 'display'] },
  { section: 'settings', page: 'display', controlId: 'color-filter', terms: ['color filter', 'grayscale', 'filter', 'color blind', 'accessibility'] },
  { section: 'settings', page: 'display', controlId: 'transparency', terms: ['transparency effects', 'transparency', 'blur', 'frosted', 'acrylic', 'performance'] },
  { section: 'settings', page: 'display', controlId: 'focus-ring', terms: ['focus indicator', 'focus', 'keyboard', 'outline', 'accessibility'] },
  { section: 'settings', page: 'display', controlId: 'scrollbars', terms: ['scrollbars', 'scrollbar', 'scroll', 'smooth'] },
  { section: 'settings', page: 'display', controlId: 'pointer', terms: ['pointer targets', 'pointer', 'cursor', 'touch', 'targets'] },
  { section: 'settings', page: 'display', controlId: 'animation-level', terms: ['motion', 'animation', 'reduce', 'flashes', 'accessibility'] },
  { section: 'settings', page: 'display', controlId: 'reduce-motion', terms: ['reduce motion', 'motion', 'animation', 'reduce', 'accessibility'] },
  { section: 'settings', page: 'motion', controlId: 'motion-mode', terms: ['motion mode', 'motion', 'animation', 'performance', 'disabled', 'accessibility', 'reduce'] },
  { section: 'settings', page: 'motion', controlId: 'motion-velocity', terms: ['animation velocity', 'animation', 'speed', 'velocity', 'duration', 'slow', 'fast', 'instant'] },
  { section: 'settings', page: 'motion', controlId: 'motion-particles', terms: ['reward particles', 'particles', 'confetti', 'reward', 'celebration', 'badge', 'density'] },
  { section: 'settings', page: 'motion', controlId: 'motion-companion-weight', terms: ['companion physics weight', 'companion', 'shimeji', 'physics', 'gravity', 'weight', 'drag'] },
  { section: 'settings', page: 'storage', controlId: 'storage-models', terms: ['models dictionaries', 'download', 'model', 'models', 'whisper', 'ocr', 'manga ocr', 'tesseract', 'dictionary', 'jmdict', 'cedict', 'pitch accent', 'tatoeba', 'install', 'remove', 'storage', 'disk space'] },
  { section: 'settings', page: 'memory', controlId: 'memory', terms: ['memory storage', 'memory', 'storage', 'backup', 'export', 'import', 'clear', 'data', 'quota', 'disk', 'ram', 'particles', 'companions', 'wallpaper', 'settings inventory'] },
  { section: 'settings', page: 'memory', controlId: 'system-memory', terms: ['system memory', 'ram', 'memory', 'cpu', 'uptime', 'system'] },
  { section: 'settings', page: 'memory', controlId: 'storage-usage', terms: ['app storage', 'usage', 'quota', 'disk', 'space', 'used'] },
  { section: 'settings', page: 'memory', controlId: 'storage-inventory', terms: ['data inventory', 'inventory', 'list', 'size', 'indexeddb', 'localstorage'] },
  { section: 'settings', page: 'memory', controlId: 'backup', terms: ['backup restore', 'backup', 'export', 'import', 'restore', 'json'] },
  { section: 'settings', page: 'memory', controlId: 'clear-data', terms: ['clear data', 'clear', 'delete', 'decks', 'csv', 'clipboard', 'lyrics', 'calendar', 'cache'] },
  { section: 'settings', page: 'memory', controlId: 'factory-reset', terms: ['factory reset', 'factory', 'reset', 'wipe', 'erase', 'fresh'] },
];

export const AGENT_NAVIGATION_INDEX: readonly AgentNavigationIndexEntry[] = [
  ...SECTION_ENTRIES,
  ...PAGE_ENTRIES,
  ...CONTROL_ENTRIES,
];

/**
 * Pure function words only. Anything that could name a feature — "settings",
 * "motion", "focus", even verbs like "reset" — stays in the query, because the
 * index is full of entries whose real name contains exactly those words.
 */
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'can', 'did', 'do',
  'does', 'for', 'from', 'how', 'i', 'if', 'in', 'is', 'it', 'its', 'me', 'my',
  'of', 'on', 'or', 'please', 'that', 'the', 'their', 'them', 'then', 'there',
  'these', 'they', 'this', 'to', 'was', 'we', 'were', 'what', 'when', 'where',
  'which', 'who', 'why', 'will', 'with', 'you', 'your',
]);

const MAX_QUERY_CHARS = 400;
const MAX_QUERY_TOKENS = 40;

function tokenize(value: string): string[] {
  return value
    .slice(0, MAX_QUERY_CHARS)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function queryTokens(value: string): Set<string> {
  const out = new Set<string>();
  for (const token of tokenize(value)) {
    if (out.size >= MAX_QUERY_TOKENS) break;
    if (STOPWORDS.has(token)) continue;
    out.add(token);
  }
  return out;
}

/**
 * One token matches another exactly, or across a single trailing plural `s`.
 * Both sides must be long enough for that fold to mean anything — without the
 * length floor, "cs" would match "css" and "a" would match "as".
 */
function tokenMatches(queryToken: string, termToken: string): boolean {
  if (queryToken === termToken) return true;
  if (queryToken.length < 4 && termToken.length < 4) return false;
  return queryToken === `${termToken}s` || termToken === `${queryToken}s`;
}

function termMatches(tokens: ReadonlySet<string>, term: string): boolean {
  const termTokens = tokenize(term);
  if (termTokens.length === 0) return false;
  return termTokens.every((termToken) => {
    for (const token of tokens) if (tokenMatches(token, termToken)) return true;
    return false;
  });
}

/**
 * Section beats control beats page when the evidence is otherwise identical.
 *
 * A bare feature name — "dictionary", "music" — almost always means "take me to
 * that app", and a control is a more specific answer than the page holding it.
 * Ties *inside* a band stay ambiguous; this ladder only separates bands, and it
 * is declared here rather than emerging from the scores so that the ordering is
 * something the tests can state outright.
 */
function precedence(entry: AgentNavigationIndexEntry): number {
  if (!entry.page) return 2;
  return entry.controlId ? 1 : 0;
}

function scoreEntry(tokens: ReadonlySet<string>, entry: AgentNavigationIndexEntry): number {
  const seen = new Set<string>();
  let score = 0;
  let namedIt = false;
  for (const [position, term] of entry.terms.entries()) {
    const normalized = tokenize(term).join(' ');
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    if (!termMatches(tokens, term)) continue;
    // Squared, so "popup dictionary" outweighs two unrelated single words that
    // happen to both appear. A longer exact phrase is much stronger evidence.
    const words = normalized.split(' ').length;
    score += 2 * words * words;
    if (position === 0) namedIt = true;
  }
  return score > 0 && namedIt ? score + 2 : score;
}

function destinationOf(entry: AgentNavigationIndexEntry): AgentNavigationIndexResult {
  return {
    section: entry.section,
    ...(entry.page ? { page: entry.page } : {}),
    ...(entry.controlId ? { controlId: entry.controlId, highlight: true as const } : {}),
  };
}

function sameDestination(
  left: AgentNavigationIndexResult,
  right: AgentNavigationIndexResult,
): boolean {
  return left.section === right.section
    && left.page === right.page
    && left.controlId === right.controlId;
}

/**
 * Resolves a free-text question to exactly one destination, or to `null`.
 *
 * `null` is the answer for a query that matches nothing *and* for one that
 * matches two things equally well — the caller cannot tell those apart on
 * purpose, because neither is a destination it may offer.
 */
export function resolveAgentNavigationQuery(
  query: string,
  index: readonly AgentNavigationIndexEntry[] = AGENT_NAVIGATION_INDEX,
): AgentNavigationIndexResult | null {
  if (typeof query !== 'string') return null;
  const tokens = queryTokens(query);
  if (tokens.size === 0) return null;

  const scored: { entry: AgentNavigationIndexEntry; score: number }[] = [];
  for (const entry of index) {
    const score = scoreEntry(tokens, entry);
    if (score > 0) scored.push({ entry, score });
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score || precedence(b.entry) - precedence(a.entry));

  const [best, runnerUp] = scored;
  const destination = destinationOf(best.entry);
  if (
    runnerUp
    && runnerUp.score === best.score
    && precedence(runnerUp.entry) === precedence(best.entry)
    && !sameDestination(destination, destinationOf(runnerUp.entry))
  ) {
    return null;
  }
  return destination;
}
