// @vitest-environment node
/**
 * The Squirrel feed an installed Gum reads, and the delta source `make` syncs
 * from. Both are GitHub URLs derived from one owner/repo pair; these pin them so a
 * repository rename cannot leave installed copies polling a dead feed, and so
 * forge.config.ts cannot drift from main.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GITHUB_OWNER, GITHUB_REPO } from '../../shared/release';
import { SQUIRREL_FEED_URL, SQUIRREL_REMOTE_RELEASES_URL, squirrelReleasesUrl } from '../squirrelUpdater';

const forge = readFileSync(resolve(__dirname, '..', '..', '..', 'forge.config.ts'), 'utf8');

describe('Squirrel feed', () => {
  it('is the latest-release download redirect of the published repository', () => {
    expect(GITHUB_OWNER).toBe('vasars2024-hub');
    expect(GITHUB_REPO).toBe('jp-study-app');
    expect(SQUIRREL_FEED_URL).toBe('https://github.com/vasars2024-hub/jp-study-app/releases/latest/download');
  });

  it('RELEASES is read from the feed root, with or without a trailing slash', () => {
    expect(squirrelReleasesUrl()).toBe('https://github.com/vasars2024-hub/jp-study-app/releases/latest/download/RELEASES');
    expect(squirrelReleasesUrl(`${SQUIRREL_FEED_URL}/`)).toBe(squirrelReleasesUrl());
    // A well-formed absolute https URL on github.com, nothing appended after RELEASES.
    const url = new URL(squirrelReleasesUrl());
    expect(url.protocol).toBe('https:');
    expect(url.host).toBe('github.com');
    expect(url.pathname.endsWith('/RELEASES')).toBe(true);
    expect(url.search).toBe('');
  });
});

describe('delta packages (forge.config.ts)', () => {
  it('remoteReleases is the repository url (SyncReleases reads a github.com url as owner/repo)', () => {
    expect(SQUIRREL_REMOTE_RELEASES_URL).toBe(`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`);
    expect(forge).toContain(`const SQUIRREL_REMOTE_RELEASES = '${SQUIRREL_REMOTE_RELEASES_URL}';`);
    // The probe reads the same feed installed copies read.
    expect(forge).toContain('const SQUIRREL_FEED = `${SQUIRREL_REMOTE_RELEASES}/releases/latest/download`;');
    expect(`${SQUIRREL_REMOTE_RELEASES_URL}/releases/latest/download`).toBe(SQUIRREL_FEED_URL);
  });

  it('the maker reads the delta decision lazily, after preMake made it', () => {
    expect(forge).toMatch(/get remoteReleases\(\): string \| undefined \{\s*return squirrelDeltaBase;/);
    expect(forge).toMatch(/preMake: async \(\) => \{\s*squirrelDeltaBase = await resolveSquirrelDeltaBase\(\);/);
    // Option names exactly as electron-winstaller declares them.
    const winstaller = readFileSync(
      resolve(__dirname, '..', '..', '..', 'node_modules', 'electron-winstaller', 'lib', 'options.d.ts'),
      'utf8',
    );
    expect(winstaller).toMatch(/remoteReleases\?: string;/);
    expect(winstaller).toMatch(/remoteToken\?: string;/);
    expect(winstaller).toMatch(/noDelta\?: boolean;/);
  });
});
