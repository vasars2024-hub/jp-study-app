/**
 * Blanc's developer flag — off by default.
 *
 * Some Blanc tools exist for the people building Blanc, not for the people
 * studying with it: `coverage` is an implementation map of which toolbox
 * features are real, experimental or still waiting on an adapter. It used to
 * sit in the launcher beside Calculator and Dictionary, where a learner could
 * only read it as "this app is unfinished". It now appears only when the user
 * has switched on Developer tools in Blanc's settings.
 *
 * The flag is Blanc-local (its own localStorage key, like the rest of Blanc's
 * launcher state) because `ToolboxSettings` is re-sanitised against a fixed
 * schema that Study OS also reads.
 */
import { useEffect, useState } from 'react';
import { writeLocalStorage } from '../../localStorageWrite';

const KEY = 'jp-study.blanc.developerTools';
const EVENT = 'blanc:developer-tools-changed';

/** Tools listed only while the developer flag is on. */
export const DEVELOPER_ONLY_TOOLS: readonly string[] = ['coverage'];

export function isDeveloperOnlyTool(id: string): boolean {
  return DEVELOPER_ONLY_TOOLS.includes(id);
}

export function loadBlancDeveloperTools(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setBlancDeveloperTools(on: boolean): void {
  writeLocalStorage(KEY, on ? '1' : '0');
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: on }));
  } catch {
    /* no window (tests without a DOM) */
  }
}

export function onBlancDeveloperToolsChanged(cb: (on: boolean) => void): () => void {
  const local = (): void => cb(loadBlancDeveloperTools());
  const storage = (event: StorageEvent): void => {
    if (event.key === KEY) cb(loadBlancDeveloperTools());
  };
  window.addEventListener(EVENT, local);
  window.addEventListener('storage', storage);
  return () => {
    window.removeEventListener(EVENT, local);
    window.removeEventListener('storage', storage);
  };
}

export function useBlancDeveloperTools(): boolean {
  const [on, setOn] = useState(loadBlancDeveloperTools);
  useEffect(() => onBlancDeveloperToolsChanged(setOn), []);
  return on;
}
