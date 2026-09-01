export interface ShellWindowMinState {
  id: string;
  min?: boolean;
}

/** Capture only windows that Show desktop actually changes, including exact state. */
export function captureVisibleWindowMinStates(
  windows: readonly ShellWindowMinState[],
): ReadonlyMap<string, boolean | undefined> {
  return new Map(
    windows
      .filter((window) => !window.min)
      .map((window) => [window.id, window.min] as const),
  );
}

/**
 * Apply one minimized state to a captured set without disturbing windows that
 * were already minimized before Show desktop ran.
 */
export function setCapturedWindowsMinimized<T extends ShellWindowMinState>(
  windows: readonly T[],
  captured: ReadonlyMap<string, boolean | undefined>,
  minimized: boolean,
): T[] {
  return windows.map((window) => {
    if (!captured.has(window.id)) return window;
    if (minimized) return window.min ? window : { ...window, min: true };

    const original = captured.get(window.id);
    if (original !== undefined) {
      return window.min === original ? window : { ...window, min: original };
    }
    // Preserve an omitted optional field as omitted. This is the difference
    // between a visually equivalent trip and a structurally exact one.
    const restored = { ...window };
    delete restored.min;
    return restored;
  });
}
