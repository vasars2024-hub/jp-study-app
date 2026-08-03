/**
 * ADR-003's temporary exemption was a file allowlist, never a weaker catalog
 * assertion. Phase 4 closes the gate only when this list is empty.
 */
export const ADOPTED_MEDIA_I18N_ALLOWLIST: readonly string[] = [];

export const ADOPTED_MEDIA_I18N_SURFACES = [
  'src/media/MediaWorkspaceHost.tsx',
  'src/media/MediaWorkspace.tsx',
  'src/media/StudyPlayerSlice.tsx',
  'src/media/VideoCoreMiningPanel.tsx',
  'src/media/VideoCoreStudyOverlay.tsx',
] as const;
