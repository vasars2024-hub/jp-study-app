import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEV_SIBLING_CHECKOUT,
  PACKAGED_RESOURCE_DIR,
  resolveSeanimeExe,
  seanimeExeMissingMessage,
} from '../seanime/exePath';

const EXE = 'seanime.exe';
const none = (): boolean => false;
const all = (): boolean => true;

describe('resolveSeanimeExe', () => {
  it('lets SEANIME_EXE win even when the file is absent, so a proof fails loudly', () => {
    const resolved = resolveSeanimeExe(
      {
        envOverride: '  C:/tmp/seanime-phase3-verified.exe  ',
        isPackaged: false,
        appPath: 'C:/app',
      },
      none,
    );
    expect(resolved.source).toBe('env');
    expect(resolved.exePath).toBe('C:/tmp/seanime-phase3-verified.exe');
    expect(resolved.exists).toBe(false);
    // A harness pointed at a purpose-built binary must never silently fall back
    // to a different one.
    expect(resolved.candidates).toEqual(['C:/tmp/seanime-phase3-verified.exe']);
    expect(seanimeExeMissingMessage(resolved)).toContain('SEANIME_EXE');
  });

  it('ignores a blank override rather than spawning an empty path', () => {
    const resolved = resolveSeanimeExe(
      { envOverride: '   ', isPackaged: false, appPath: 'C:/app' },
      all,
    );
    expect(resolved.source).toBe('dev-sibling-checkout');
  });

  it('prefers the packaged resource slot when packaged', () => {
    const resourcesPath = 'C:/Program Files/app/resources';
    const resolved = resolveSeanimeExe(
      { isPackaged: true, resourcesPath, appPath: 'C:/Program Files/app/resources/app' },
      all,
    );
    expect(resolved.source).toBe('packaged-resource');
    expect(resolved.exePath).toBe(path.join(resourcesPath, PACKAGED_RESOURCE_DIR, EXE));
  });

  it('falls back to the pinned sibling checkout in a dev tree', () => {
    const resolved = resolveSeanimeExe(
      { isPackaged: false, appPath: 'D:/work/jp-study-app' },
      all,
    );
    expect(resolved.source).toBe('dev-sibling-checkout');
    expect(resolved.exePath).toBe(
      path.join('D:/work/jp-study-app', '..', DEV_SIBLING_CHECKOUT, EXE),
    );
  });

  it('derives the dev path from the app path, not from any particular machine', () => {
    // The same repo checked out anywhere resolves to its own sibling.
    const a = resolveSeanimeExe({ isPackaged: false, appPath: '/home/x/proj/app' }, all);
    const b = resolveSeanimeExe({ isPackaged: false, appPath: '/srv/other/app' }, all);
    expect(a.exePath).not.toBe(b.exePath);
    expect(a.exePath).toContain(path.join('proj', DEV_SIBLING_CHECKOUT));
    expect(b.exePath).toContain(path.join('other', DEV_SIBLING_CHECKOUT));
  });

  it('lists every candidate when nothing exists, so the failure is actionable', () => {
    const resolved = resolveSeanimeExe(
      { isPackaged: true, resourcesPath: 'R:/res', appPath: 'R:/res/app' },
      none,
    );
    expect(resolved.exists).toBe(false);
    expect(resolved.candidates).toHaveLength(2);
    const message = seanimeExeMissingMessage(resolved);
    expect(message).toContain(PACKAGED_RESOURCE_DIR);
    expect(message).toContain(DEV_SIBLING_CHECKOUT);
    expect(message).not.toContain('SEANIME_EXE');
  });
});

describe('packaging fills the slot this module resolves', () => {
  // exePath.ts names <resourcesPath>/seanime/seanime.exe and forge.config.ts stages into
  // build/seanime, which electron-packager copies in by basename. The two constants live
  // in different files with no import between them (importing app code into the Forge
  // config would put a resolution failure in the packaging path), so this is the pin.
  const forgeConfig = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'forge.config.ts'),
    'utf8',
  );

  it('stages into a directory whose basename is the resolved resource dir', () => {
    expect(forgeConfig).toContain(`const SIDECAR_RESOURCE_DIR = '${PACKAGED_RESOURCE_DIR}'`);
    expect(forgeConfig).toContain(`const SIDECAR_EXE = '${EXE}'`);
    expect(forgeConfig).toContain("path.join('build', SIDECAR_RESOURCE_DIR)");
  });

  it('ships that staging directory as a resource', () => {
    expect(forgeConfig).toMatch(/extraResource:\s*\['public',\s*SIDECAR_STAGING_DIR\]/);
  });

  it('fails the build rather than packaging a dead media surface', () => {
    // The regression: a package that installs cleanly and has no sidecar at all.
    expect(forgeConfig).toMatch(/throw new Error\(\s*\n?\s*`\[sidecar\] cannot stage/);
  });
});

describe('no developer machine path is baked into the sidecar supervisor', () => {
  // The regression this module exists for: `supervisor.ts` shipped
  // `'C:/Users/Arseniy/Projects/seanime-upstream/seanime.exe'` as the default,
  // which cannot work on any other machine and made packaging the sidecar look
  // further away than it is.
  it.each(['seanime/supervisor.ts', 'seanime/exePath.ts'])('%s has no absolute home path', (rel) => {
    const source = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
    expect(source).not.toMatch(/[A-Za-z]:[\\/]Users[\\/]/);
    expect(source).not.toMatch(/\/home\/[a-z]/i);
  });
});
