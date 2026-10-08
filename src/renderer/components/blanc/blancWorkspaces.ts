/**
 * The retired workspace-launcher's localStorage store, read once by the App
 * Drawer's migration (BLANC_REFINEMENT_PLAN.md, Pillar 3). Never written again.
 */
// Exported so BlancAppDrawerPanel's one-time migration can read this store
// without duplicating the parser — workspace-launcher is retired in favour of
// the App Drawer (BLANC_REFINEMENT_PLAN.md, Pillar 3), and the migration reads
// this exact key non-destructively (it is never written here again).
export const WORKSPACE_LAUNCHER_KEY = 'jp-study.blanc.toolbox.workspaces.v1';

/** One launchable target inside a workspace. */
export interface WorkspaceTarget {
  id: string;
  /** Absolute path from the native picker, or an http(s) URL. */
  target: string;
  label: string;
}

export interface Workspace {
  id: string;
  name: string;
  targets: WorkspaceTarget[];
}

export function readWorkspaces(): Workspace[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WORKSPACE_LAUNCHER_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    // Rebuild from known keys only — stale shapes must not survive a reload.
    return parsed.flatMap((raw): Workspace[] => {
      if (!raw || typeof raw !== 'object') return [];
      const row = raw as Record<string, unknown>;
      if (typeof row.id !== 'string' || typeof row.name !== 'string') return [];
      const targets = Array.isArray(row.targets) ? row.targets : [];
      return [{
        id: row.id,
        name: row.name,
        targets: targets.flatMap((rawTarget): WorkspaceTarget[] => {
          if (!rawTarget || typeof rawTarget !== 'object') return [];
          const entry = rawTarget as Record<string, unknown>;
          if (typeof entry.id !== 'string' || typeof entry.target !== 'string' || !entry.target) return [];
          return [{ id: entry.id, target: entry.target, label: typeof entry.label === 'string' ? entry.label : entry.target }];
        }),
      }];
    });
  } catch {
    return [];
  }
}
