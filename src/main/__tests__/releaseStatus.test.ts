// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getVersion: () => '1.0.1' }, ipcMain: { handle: () => undefined } }));
vi.mock('../extensionInstall', () => ({ readInstalledExtensionVersion: () => null }));

const { getReleaseStatus } = await import('../release');

describe('release status (Settings > Help)', () => {
  it('says the local build is newer than the latest release instead of staying silent', async () => {
    const s = await getReleaseStatus('1.0.1', async () => ({ kind: 'ok', data: { tag_name: 'v1.0.0', html_url: 'https://x/r' } }));
    expect(s).toMatchObject({ kind: 'newer', current: '1.0.1', latest: '1.0.0', url: 'https://x/r' });
  });
  it('reports an update, the current release, no releases, and a failed check distinctly', async () => {
    expect((await getReleaseStatus('1.0.1', async () => ({ kind: 'ok', data: { tag_name: 'v1.2.0' } }))).kind).toBe('update');
    expect((await getReleaseStatus('1.0.1', async () => ({ kind: 'ok', data: { tag_name: '1.0.1' } }))).kind).toBe('current');
    expect((await getReleaseStatus('1.0.1', async () => ({ kind: 'none' }))).kind).toBe('no-releases');
    expect((await getReleaseStatus('1.0.1', async () => ({ kind: 'failed' }))).kind).toBe('unavailable');
  });
});
