// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from '../../shared/i18n/catalogs/en';
import { ja } from '../../shared/i18n/catalogs/ja';
import { ru } from '../../shared/i18n/catalogs/ru';
import { zh } from '../../shared/i18n/catalogs/zh';

const SRC = resolve(__dirname, '..', '..');
const read = (path: string) => readFileSync(resolve(SRC, path), 'utf8');

describe('Media Center integration contract', () => {
  it('routes every Media entry point to the shared Media shell', () => {
    const source = read('renderer/components/AppSection.tsx');
    expect(source).toContain('<MediaCenterView initialTab="library" />');
    expect(source).toContain('<MediaCenterView initialTab="video" />');
    expect(source).toContain('<MediaCenterView initialTab="music" />');
    expect(source).not.toContain('<MediaWorkspaceSectionView');
  });

  it('keeps the Seanime host reachable without replacing the Media shell', () => {
    const app = read('renderer/App.tsx');
    const source = read('renderer/views/MediaCenterView.tsx');

    expect(app).toContain('sectionOpensMediaWorkspace(popout)');
    expect(source).toContain('mediaWorkspaceHostExists');
    expect(source).toContain('openMediaWorkspace(request)');
    expect(source).toContain("window.api.popOut('player')");
    expect(source).toContain('data-media-source="seanime"');
    expect(source).not.toContain('legacyMediaTabsHidden');
  });

  it('keeps a media surface when the sidecar is disabled', () => {
    // This is what the step was blocked on: `MediaWorkspaceHost` renders null on
    // `disabled`, so routing straight at it would make SEANIME_SIDECAR=0 remove the
    // app's media surface rather than roll the change back.
    const source = read('renderer/views/MediaWorkspaceSectionView.tsx');
    expect(source).toContain("if (availability === 'unavailable')");
    expect(source).toContain('<MediaCenterView initialTab={legacyTab} />');
    // `pending` must render nothing — showing the legacy view while the status resolves
    // flashes the very surface this migration retires.
    expect(source).toContain("if (availability === 'pending') return null;");
  });

  it('keeps local Video and Library tabs alongside the Seanime handoff', () => {
    const source = read('renderer/views/MediaCenterView.tsx');
    expect(source).toContain("id: 'library'");
    expect(source).toContain("id: 'video'");
    expect(source).toContain('data-media-source="seanime"');
    expect(source).not.toContain('legacyMediaTabsHidden');
  });

  it('keeps the Seanime action truthful while the sidecar is unavailable', () => {
    const source = read('renderer/views/MediaCenterView.tsx');
    expect(source).toContain("const seanimeAvailable = workspace === 'available'");
    expect(source).toContain("disabled={!seanimeAvailable}");
    expect(source).toContain("workspace === 'pending'");
    expect(source).toContain("workspace === 'unavailable'");
  });

  it('decides "is there a workspace?" in exactly one place', () => {
    // Two copies of this rule would be two chances to disagree about which media surface
    // the app is showing.
    const shared = read('renderer/mediaWorkspaceAvailability.ts');
    // Slice 14 moved the rule into a non-hook `mediaWorkspaceIsAvailable()` so the
    // `video.resumeLast` command — which is not rendering and can afford the await —
    // consumes the same decision instead of guessing from the DOM. The hook is now
    // written in terms of it, which is what keeps "exactly one place" true.
    expect(shared).toContain("status?.kind !== 'disabled'");
    // An IPC failure must select the surface that needs nothing from the sidecar.
    expect(shared).toMatch(/catch\([\s\S]{0,120}false\)/);
    expect(shared, 'the hook re-derived the rule instead of consuming it')
      .toMatch(/void mediaWorkspaceIsAvailable\(\)/);
    for (const consumer of [
      'renderer/views/MediaWorkspaceSectionView.tsx',
      'renderer/views/MediaCenterView.tsx',
    ]) {
      expect(read(consumer), consumer).toContain('useMediaWorkspaceAvailability');
      // No consumer may re-derive it from its own IPC call. Matched on the call shape
      // rather than the bare name, which also appears in prose in these files.
      expect(read(consumer), consumer).not.toMatch(/api\.seanimeStatus\(/);
    }
  });

  it('leaves the os:open handoff to the host, and covers both sections there', () => {
    // The host already owned `os:open` for 'video'. An earlier cut had the section
    // dispatch on mount as well, which opened `video` twice and — because the section's
    // dispatch waits on an async seanimeStatus() round trip — let a late dispatch REOPEN
    // a workspace the user had just closed. One owner, and it must cover both sections.
    const host = read('media/MediaWorkspaceHost.tsx');
    // Slice 14 replaced the literal pair with the shared list — see the pop-out test
    // above for why a second copy of "which sections open the workspace" was a defect.
    expect(host).toMatch(/sectionOpensMediaWorkspace\(\(event as CustomEvent/);

    const section = read('renderer/views/MediaWorkspaceSectionView.tsx');
    // The only openMediaWorkspace call left is the button's explicit onClick.
    expect(section.match(/openMediaWorkspace\(\)/g)?.length ?? 0).toBe(1);
    expect(section).toContain('onClick={() => openMediaWorkspace()}');
  });

  it('keeps all primary destinations and the persistent player in one surface', () => {
    const source = read('renderer/views/MediaCenterView.tsx');
    for (const id of ['home', 'library', 'video', 'music', 'study', 'discover', 'settings']) {
      expect(source).toContain(`id: '${id}'`);
    }
    expect(source).toContain('<PersistentPlayer state={music}');
    expect(source).toContain('ps.queue.length > 0 ? ps.queue : state.baseSongs');
    expect(source).toContain('<DiscoveryPosterArt');
  });

  it('keeps search, local library, discovery, and the Seanime source in the shell', () => {
    const source = read('renderer/views/MediaCenterView.tsx');
    expect(source).toContain('className="mc-sidebar"');
    expect(source).toContain('className="mc-global-search"');
    expect(source).toContain('<MediaLibraryShell');
    expect(source).toContain('<DiscoveryControls');
    expect(source).toContain('data-media-source="seanime"');
    expect(source).toContain('openSeanime');
  });

  it('keeps subtitle provider credentials actionable inside Media Center', () => {
    const source = read('renderer/views/MediaCenterView.tsx');
    expect(source).toContain('function SubtitleProviderQuickSetup()');
    expect(source).toContain('window.api.subtitleProviderCredentials()');
    expect(source).toContain('window.api.setSubtitleProviderKey(id');
    expect(source).toContain('window.api.testSubtitleProvider(id)');
    expect(source).toContain('SUBTITLE_PROVIDER_KEY_URLS[id]');
  });

  it('scopes its compact rules to its own width, not the viewport', () => {
    // The Media Center renders inside a floating window on a fake desktop, so
    // `@media (max-width: …)` measured something the panels have no relationship
    // to — on a wide screen those blocks never matched however small the user
    // made the window. Container queries are the contract now; a regression back
    // to `@media` would silently make all of the compact CSS dead again.
    const css = read('renderer/views/mediaCenter.css');
    expect(css).toMatch(/\.mc-root\s*\{[^}]*container-type:\s*inline-size/);
    expect(css).toContain('container-name: mc;');
    expect(css.match(/@container mc \(max-width/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(css).toMatch(/\.mc-app-chrome\s*\{[^}]*height:\s*100%/);
    expect(css).toContain('.mc-app-chrome .ui-app-chrome__body');
    expect(css).toContain('.mc-seanime-link');
    // Only motion/contrast preferences may still be `@media` — nothing width-based.
    expect(css).not.toMatch(/@media\s*\(max-width:\s*\d/);
  });

  it('does not remove the music library at compact widths', () => {
    const css = read('renderer/views/mediaCenter.css');
    const compact = css.slice(css.indexOf('@container mc (max-width: 640px)'));
    expect(compact).toMatch(/\.mc-music-library\s*\{\s*display:\s*flex;/);
    expect(compact).not.toMatch(/\.mc-music-library\s*\{\s*display:\s*none;/);
  });

  it('translates every Media Center key in all four UI catalogues', () => {
    const keys = Object.keys(en).filter((key) => key.startsWith('mediaCenter.'));
    expect(keys.length).toBeGreaterThan(225);
    for (const key of keys) {
      expect(ja[key], `missing ja key ${key}`).toBeTruthy();
      expect(ru[key], `missing ru key ${key}`).toBeTruthy();
      expect(zh[key], `missing zh key ${key}`).toBeTruthy();
    }
  });

  it('allows only the two required provider image CDNs in packaged CSP', async () => {
    // Slice 47g: this used to regex `main.ts`'s SOURCE TEXT for `"img-src …"`. That form
    // breaks the moment the policy moves — it did — and, worse, it would have passed just as
    // happily against a policy that had been commented out, because a comment is still text.
    // The policy is data in `shared/contentSecurityPolicy.ts` now, so ask it directly.
    const { cspDirectiveSources } = await import('../../shared/contentSecurityPolicy');
    const sources = cspDirectiveSources('img-src') ?? [];
    expect(sources).toContain('https://cdn.myanimelist.net');
    expect(sources).toContain('https://*.anilist.co');
    expect(sources).not.toContain('https:');
  });
});
