import type { MediaOrganizationPreview } from '../shared/mediaHub';

export function mediaHubBackupFilename(createdAt: number): string {
  return `media-hub-backup-${new Date(createdAt).toISOString().slice(0, 10)}.json`;
}

export function mediaHubCanApply(preview: MediaOrganizationPreview | null): boolean {
  return Boolean(preview && preview.action !== 'noop');
}
