import type { MediaOrganizationPreview } from '../shared/mediaHub';
import { isoDateLocal } from '../shared/watchLibrary';

export function mediaHubBackupFilename(createdAt: number): string {
  return `media-hub-backup-${isoDateLocal(createdAt)}.json`;
}

export function mediaHubCanApply(preview: MediaOrganizationPreview | null): boolean {
  return Boolean(preview && preview.action !== 'noop');
}
