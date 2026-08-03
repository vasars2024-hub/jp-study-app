import { describe, expect, it } from 'vitest';
import { mediaHubBackupFilename, mediaHubCanApply } from '../mediaHubStoragePanel';

describe('Media Hub storage panel workflow guards', () => {
  it('uses a deterministic dated filename for the local backup action', () => {
    expect(mediaHubBackupFilename(Date.UTC(2026, 6, 23))).toBe('media-hub-backup-2026-07-23.json');
  });

  it('only enables apply after a non-noop preview exists', () => {
    expect(mediaHubCanApply(null)).toBe(false);
    expect(mediaHubCanApply({ itemId: 'a', sourcePath: 'C:/a.mkv', targetPath: 'C:/anime/a.mkv', action: 'noop' })).toBe(false);
    expect(mediaHubCanApply({ itemId: 'a', sourcePath: 'C:/a.mkv', targetPath: 'C:/anime/a.mkv', action: 'move' })).toBe(true);
  });
});
