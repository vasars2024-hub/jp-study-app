import {
  DEFAULT_TOOLBOX_SETTINGS,
  exportToolboxSettings,
  importToolboxSettings,
  resetToolboxSettingsSection,
  sanitizeToolboxSettings,
  type ToolboxSettings,
  type ToolboxSettingsCategory,
} from '../shared/toolboxSettings';
import { writeLocalStorageJson } from './localStorageWrite';

const KEY = 'jp-study.toolbox.settings.v1';
const EVENT = 'toolbox-settings-changed';

function dispatch(settings: ToolboxSettings): void {
  window.dispatchEvent(new CustomEvent<ToolboxSettings>(EVENT, { detail: settings }));
}

export function loadToolboxSettings(): ToolboxSettings {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? sanitizeToolboxSettings(JSON.parse(raw)) : DEFAULT_TOOLBOX_SETTINGS;
  } catch {
    return DEFAULT_TOOLBOX_SETTINGS;
  }
}

export function saveToolboxSettings(patch: Partial<ToolboxSettings>): ToolboxSettings {
  const next = sanitizeToolboxSettings({ ...loadToolboxSettings(), ...patch });
  writeLocalStorageJson(KEY, next);
  dispatch(next);
  return next;
}

export function resetAllToolboxSettings(): ToolboxSettings {
  writeLocalStorageJson(KEY, DEFAULT_TOOLBOX_SETTINGS);
  dispatch(DEFAULT_TOOLBOX_SETTINGS);
  return DEFAULT_TOOLBOX_SETTINGS;
}

export function resetToolboxSettingsCategory(category: ToolboxSettingsCategory): ToolboxSettings {
  const next = resetToolboxSettingsSection(loadToolboxSettings(), category);
  writeLocalStorageJson(KEY, next);
  dispatch(next);
  return next;
}

export function exportCurrentToolboxSettings(): string {
  return exportToolboxSettings(loadToolboxSettings());
}

export function importCurrentToolboxSettings(json: string): { ok: true; settings: ToolboxSettings } | { ok: false; error: string } {
  const result = importToolboxSettings(json);
  if (!result.ok) return result;
  writeLocalStorageJson(KEY, result.settings);
  dispatch(result.settings);
  return result;
}

export function onToolboxSettingsChanged(cb: (settings: ToolboxSettings) => void): () => void {
  const handler = (event: Event): void => {
    cb((event as CustomEvent<ToolboxSettings>).detail ?? loadToolboxSettings());
  };
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
