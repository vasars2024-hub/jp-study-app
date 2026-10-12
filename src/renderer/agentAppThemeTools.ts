/**
 * The Agent's theme tools outside Blanc: Study OS, Aero and Wired.
 *
 * `settings.apply-theme` and friends were written for Blanc. They saved Blanc
 * toolbox settings and set `--blanc-*` variables, and in the main window — where
 * nothing reads either — they still reported `applied: true` (audit A9). Here
 * they act on the theme the main window actually uses (`theme/engine.ts`, the
 * one choke point every theme switch goes through, so Wired's lifecycle and the
 * Aero asset pack follow as they do for a Settings switch), or refuse in words
 * when the request cannot be honoured there.
 *
 * Which themes the Agent may pick: the ones Settings > Appearance offers, plus
 * the theme already active. The hidden themes (Aero, Wired) are secrets the user
 * unlocks themselves; an Agent that could switch to them by id would spoil that,
 * so they are reachable only by Undo/Reset from a state the user put them in.
 */
import {
  DEFAULT_THEME_ID,
  applyTheme,
  getTheme,
  listThemes,
  loadThemeId,
} from './theme/engine';
import { isBlancWindow } from './blancMode';

export type AgentThemeTranslate = (key: string, vars?: Record<string, string | number>) => string;

const HISTORY_LIMIT = 20;
/** Previous main-window theme ids, newest last. Per window, like the theme itself. */
const history: string[] = [];

/** Whether this renderer is the Blanc toolbox, whose theme tools are its own. */
export function agentThemeTargetsBlanc(): boolean {
  try {
    if (typeof document !== 'undefined' && document.documentElement.classList.contains('blanc-shell')) return true;
    return isBlancWindow();
  } catch {
    return false;
  }
}

/** Theme ids the Agent may switch to in this window. */
export function agentSelectableThemeIds(): string[] {
  const ids = listThemes().map((theme) => theme.id);
  const current = loadThemeId();
  return ids.includes(current) ? ids : [...ids, current];
}

function requestedThemeId(arguments_: Readonly<Record<string, unknown>>): string {
  const value = typeof arguments_.theme === 'string' ? arguments_.theme : arguments_.preset;
  return typeof value === 'string' ? value.trim() : '';
}

function resolveThemeId(arguments_: Readonly<Record<string, unknown>>, t: AgentThemeTranslate): string {
  const requested = requestedThemeId(arguments_);
  const allowed = agentSelectableThemeIds();
  // Case-insensitive on id and label: "Dark Nebula" and "dark-nebula" are one request.
  const wanted = requested.toLocaleLowerCase();
  const found = allowed.find((id) => id.toLocaleLowerCase() === wanted
    || getTheme(id)?.label.toLocaleLowerCase() === wanted);
  if (!requested || !found) {
    throw new Error(t('aiAgent.theme.unknown', { themes: allowed.join(', ') }));
  }
  return found;
}

function remember(id: string): void {
  history.push(id);
  if (history.length > HISTORY_LIMIT) history.splice(0, history.length - HISTORY_LIMIT);
}

/** True when the request carried Blanc-only colour overrides, which the main themes do not take. */
function hasOverrides(arguments_: Readonly<Record<string, unknown>>): boolean {
  const overrides = arguments_.overrides;
  return Boolean(overrides && typeof overrides === 'object' && Object.keys(overrides).length > 0);
}

export function previewAppTheme(arguments_: Readonly<Record<string, unknown>>, t: AgentThemeTranslate) {
  const theme = resolveThemeId(arguments_, t);
  // Not persisted: a preview is undone by the next real switch or a restart.
  applyTheme(theme, { persist: false });
  return { preview: true, scope: 'app', theme, ...(hasOverrides(arguments_) ? { overridesIgnored: true } : {}) };
}

export function applyAppTheme(arguments_: Readonly<Record<string, unknown>>, t: AgentThemeTranslate) {
  const theme = resolveThemeId(arguments_, t);
  const previous = loadThemeId();
  if (previous !== theme) remember(previous);
  applyTheme(theme);
  return {
    applied: true,
    scope: 'app',
    theme,
    previous,
    ...(hasOverrides(arguments_) ? { overridesIgnored: true } : {}),
  };
}

export function resetAppTheme() {
  const previous = loadThemeId();
  if (previous !== DEFAULT_THEME_ID) remember(previous);
  applyTheme(DEFAULT_THEME_ID);
  return { reset: true, scope: 'app', theme: DEFAULT_THEME_ID };
}

export function undoAppTheme(t: AgentThemeTranslate) {
  const previous = history.pop();
  if (!previous || !getTheme(previous)) throw new Error(t('blanc.agent.error.noThemeHistory'));
  applyTheme(previous);
  return { restored: true, scope: 'app', theme: previous };
}

/** Custom CSS is a Blanc toolbox feature; the main themes have no scoped slot for it. */
export function refuseAppCustomCss(t: AgentThemeTranslate): never {
  throw new Error(t('aiAgent.theme.cssBlancOnly'));
}

/** Test seam. */
export function resetAgentAppThemeHistoryForTests(): void {
  history.length = 0;
}
