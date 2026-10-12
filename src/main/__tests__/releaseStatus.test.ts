// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { FeedFetch } from '../releaseFeed';

vi.mock('electron', () => ({ app: { getVersion: () => '1.0.1' }, ipcMain: { handle: () => undefined } }));
vi.mock('../extensionInstall', () => ({ readInstalledExtensionVersion: () => null }));

const { getReleaseStatus } = await import('../release');

const ok = (tag: string, url = ''): FeedFetch => ({
  kind: 'ok',
  release: { tag, version: tag.replace(/^v/, ''), name: tag, body: '', url, prerelease: false },
});
const stable = { channel: 'stable' as const, skippedVersion: null };

describe('release status (Settings > Help)', () => {
  it('says the local build is newer than the latest release instead of staying silent', async () => {
    const s = await getReleaseStatus('1.0.1', async () => ok('v1.0.0', 'https://x/r'), stable);
    expect(s).toMatchObject({ kind: 'newer', current: '1.0.1', latest: '1.0.0', url: 'https://x/r', channel: 'stable' });
  });
  it('reports an update, the current release, no releases, and a failed check distinctly', async () => {
    expect((await getReleaseStatus('1.0.1', async () => ok('v1.2.0'), stable)).kind).toBe('update');
    expect((await getReleaseStatus('1.0.1', async () => ok('1.0.1'), stable)).kind).toBe('current');
    expect((await getReleaseStatus('1.0.1', async () => ({ kind: 'none' }), stable)).kind).toBe('no-releases');
    expect(await getReleaseStatus('1.0.1', async () => ({ kind: 'failed', reason: 'offline' }), stable)).toMatchObject({ kind: 'unavailable', reason: 'offline' });
  });
  it('carries GitHub\'s rate-limit reset time, and marks the skipped version', async () => {
    const limited = await getReleaseStatus('1.0.1', async () => ({ kind: 'failed', reason: 'rate-limited', retryAt: 123 }), stable);
    expect(limited).toMatchObject({ kind: 'unavailable', reason: 'rate-limited', retryAt: 123 });
    const skipped = await getReleaseStatus('1.0.1', async () => ok('v1.2.0'), { channel: 'stable', skippedVersion: '1.2.0' });
    expect(skipped).toMatchObject({ kind: 'update', latest: '1.2.0', skipped: true });
  });
  it('a pre-release is an update over its own earlier pre-release, and older than its release', async () => {
    const beta = { channel: 'beta' as const, skippedVersion: null };
    expect((await getReleaseStatus('1.2.0-beta.2', async () => ok('v1.2.0-beta.10'), beta)).kind).toBe('update');
    expect((await getReleaseStatus('1.2.0', async () => ok('v1.2.0-rc.1'), beta)).kind).toBe('newer');
  });
});
