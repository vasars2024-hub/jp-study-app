/**
 * In-place updates for an installed (Squirrel) Gum. See `main/squirrelUpdater.ts`.
 *
 * `install` says which update path applies:
 *   installed  Squirrel install: downloads in the background, then "Restart to update".
 *   portable   the zip build: no self-update; the GitHub release notice is the path.
 *   dev        `npm start`: neither.
 */
export type InstallKind = 'installed' | 'portable' | 'dev';

export type AppUpdateStateKind = 'idle' | 'checking' | 'downloading' | 'downloaded' | 'error';

export interface AppUpdateStatus {
  install: InstallKind;
  state: AppUpdateStateKind;
  /** The downloaded release's name (its version) once `state` is `downloaded`. */
  version?: string;
}
