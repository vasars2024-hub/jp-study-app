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

  it('opens the workspace only on an explicit request, never on a section mount', () => {
    // The host already owned `os:open` for 'video'. An earlier cut had the section
    // dispatch on mount as well, which opened `video` twice and — because the section's
    // dispatch waits on an async seanimeStatus() round trip — let a late dispatch REOPEN
    // a workspace the user had just closed. One owner, and it must cover both sections.
    const host = read('media/MediaWorkspaceHost.tsx');
    /*
     * That owner is now the explicit request alone. `os:open` brought the overlay forward
     * while both sections rendered the status-only compatibility view; they render the whole
     * Media Center now (asserted at the top of this file), so the same dispatch mounted a
     * shell with a sidebar, a global search and eight destinations and then covered it —
     * measured live 2026-08-20: one `os:open` with `player` left `.mc-root` AND
     * `.seanime-host` in the document together. MediaCenterView's own contract forbids
     * exactly that: the adopted surface "must never replace the sidebar or auto-open during
     * mount".
     */
    expect(host, 'a section mount must not open the workspace')
      .not.toMatch(/sectionOpensMediaWorkspace/);
    expect(host, 'the explicit request is still handled')
      .toMatch(/window\.addEventListener\(MEDIA_WORKSPACE_OPEN_EVENT, onWorkspaceOpen\)/);
    // And the shell still offers that request, so removing the auto-open removed a route
    // to nothing rather than a route to the workspace.
    expect(read('renderer/views/MediaCenterView.tsx')).toContain('openMediaWorkspace(request)');

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
    // The field's own markup moved to `views/GlobalSearchField.tsx` so its 70 ms race could be
    // mounted (boss audit 2026-09-02, Finding 4). Both halves are asserted, or "the shell still
    // has a search field" passes on a component nothing renders.
    expect(source).toContain('<GlobalSearchField');
    expect(read('renderer/views/GlobalSearchField.tsx')).toContain('className="mc-global-search"');
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

  it('tells the user why the history arrows are grey, without losing their names', () => {
    // Both arrows are icon-only and disabled the moment the shell mounts, and
    // `title="Back"` is a NAME, not a reason — the category-8 sweep scored them as
    // two mute pairs on a surface that was otherwise clean, and was right to.
    //
    // Both halves are pinned, because either one alone passes a real regression.
    // A check on the title only would accept the reason being hardcoded, so the
    // enabled button would advertise "there is nothing behind it yet" while
    // working; the conditional is what rules that out. A check on the conditional
    // only would accept `aria-label` being dropped — and unlike the surrounding
    // labelled buttons, these have no text, so `aria-label` is the entire
    // accessible name and its loss would be silent to every other guard here.
    const source = read('renderer/views/MediaCenterView.tsx');
    expect(source).toContain("noBack ? t('mediaCenter.shell.reason.noBack') : t('mediaCenter.shell.back')");
    expect(source).toContain("noForward ? t('mediaCenter.shell.reason.noForward') : t('mediaCenter.shell.forward')");
    expect(source).toContain("aria-label={t('mediaCenter.shell.back')}");
    expect(source).toContain("aria-label={t('mediaCenter.shell.forward')}");
    // The flags feed BOTH the tooltip and `disabled`, so the stated reason and the
    // reason the control is dead are one expression and cannot drift apart.
    expect(source).toContain('const noBack = history.at === 0;');
    expect(source).toContain('const noForward = history.at >= history.trail.length - 1;');
    expect(source).toContain('disabled={noBack}');
    expect(source).toContain('disabled={noForward}');

    // A reason that renders as its own key explains nothing, and `translate()`
    // returns the bare key on a miss — which no key-count check can see, since a
    // key absent from every catalogue is equally absent from all of them.
    for (const catalog of [en, ja, ru, zh]) {
      for (const key of ['mediaCenter.shell.reason.noBack', 'mediaCenter.shell.reason.noForward'] as const) {
        expect(catalog[key]).toBeTruthy();
        expect(catalog[key]).not.toBe(key);
      }
    }
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

  it('scrolls the nav instead of pushing the Settings entry out of the window', () => {
    // Measured live at 1080x700: the eight 45.64px nav rows plus the library block put
    // `.mc-settings-link` at y 721 against a window bottom of 740, and `.mc-root` clips, so
    // the control was half-drawn and its centre hit-tested to the desktop. jsdom has no
    // layout, so the assertions are on the three declarations that make the fix work.
    const css = read('renderer/views/mediaCenter.css');
    const nav = css.slice(css.indexOf('\n.mc-nav {'));
    const rule = nav.slice(0, nav.indexOf('}'));
    // Without `min-height: 0` a column flex item never shrinks below its content and
    // `overflow-y` is dead code — that is the half of this fix that is easy to delete.
    expect(rule).toMatch(/min-height:\s*0/);
    expect(rule).toMatch(/overflow:\s*hidden auto/);
    // The sidebar has a scroller of its own too, and it is a LAST resort rather than a
    // second opinion — this assertion used to read `.not.toMatch(/overflow/)`. The nav's
    // `min-height: 0` absorbs a long section list, but it cannot absorb the fixed 40px
    // rows around it: at the window's own 260x170 floor the column needs 146px of a 76px
    // content box, and `.mc-sidebar-spacer` and `.mc-settings-link` measured 10px and 50px
    // BELOW the frame with nothing to scroll them back. At any size that fits, no
    // scrollbar appears and brand, library and Settings stay exactly where they were.
    const side = css.slice(css.indexOf('\n.mc-sidebar {'));
    expect(side.slice(0, side.indexOf('}'))).toMatch(/overflow:\s*hidden auto/);
    // The active indicator lives inside the scroll clip now. A negative inset would be
    // eaten by `overflow-x: hidden`, and at `overflow-x: visible` would open a 1px
    // horizontal scrollbar in the nav.
    expect(css).not.toMatch(/\.mc-nav button\.is-active::before,[\s\S]{0,120}left:\s*-/);
  });

  it('collapses the transport track when no player is rendered', () => {
    // `PersistentPlayer` only mounts once there is a track (or on Music), but
    // `.mc-workspace`'s third grid track was a fixed 58px, so Video, Settings,
    // Discover and Study reserved that height for an element not in the DOM.
    // Measured live on maximized Video 1264x765: `.mc-content` 592 -> 650 and the
    // dominant canvas 62.4% -> 68.6%. The bar is unchanged when it exists — it
    // declares the 58px itself instead of borrowing the track's.
    const css = read('renderer/views/mediaCenter.css');
    const ws = css.slice(css.indexOf('\n.mc-workspace {'));
    expect(ws.slice(0, ws.indexOf('}'))).toMatch(/grid-template-rows:\s*48px minmax\(0, 1fr\) auto/);
    const bar = css.slice(css.indexOf('\n.mc-playerbar {'));
    expect(bar.slice(0, bar.indexOf('}'))).toMatch(/min-height:\s*58px/);
    // The compact variant has to move in lockstep or 54px of the same dead track
    // survives below 640px.
    const compact = css.slice(css.indexOf('@container mc (max-width: 640px)'));
    expect(compact).toMatch(/\.mc-workspace\s*\{\s*grid-template-rows:\s*44px minmax\(0, 1fr\) auto;/);
    expect(compact).toMatch(/\.mc-playerbar\s*\{\s*min-height:\s*54px;/);
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

/*
 * L4.1 — the Video stage says three different things, because there are three states.
 *
 * `f258ef77` restored the Video tab on machines where the workspace exists, but the stage
 * kept the one sentence written for `SEANIME_SIDECAR=0`: "Enable the media server to watch
 * and study video". Measured live 2026-08-17 with `seanimeStatus().kind === 'stopped'` —
 * so availability `available`, sidebar launcher `data-sidecar="available"` and enabled —
 * the stage still rendered that sentence and offered no route to the player it named.
 */
describe('Media Center video stage', () => {
  it('maps each availability to its own stage, rollback included', async () => {
    const { videoStageFor } = await import('../mediaWorkspaceAvailability');
    expect(videoStageFor('available')).toBe('workspace');
    expect(videoStageFor('pending')).toBe('connecting');
    // The negative control: `unavailable` is the SEANIME_SIDECAR=0 rollback and must keep
    // the original "needs the media server" copy. A fix that made every state say
    // "open the workspace" would be the same defect pointing the other way.
    expect(videoStageFor('unavailable')).toBe('needs-server');
  });

  it('renders each stage from that one mapping, each copy exactly once', () => {
    const source = read('renderer/views/MediaCenterView.tsx');
    expect(source, 'the stage must consume the shared mapping, not re-derive it')
      .toContain('const stage = videoStageFor(workspace);');
    for (const key of [
      'mediaCenter.video.workspacePlayerTitle',
      'mediaCenter.video.workspacePlayerDetail',
      'mediaCenter.video.openInWorkspace',
      'mediaCenter.video.needsServerTitle',
      'mediaCenter.video.needsServerDetail',
    ]) {
      // Matched as the whole `t('…')` call, not as a bare substring. A substring match
      // counts `t('…openInWorkspaceX')` — a key no catalogue has — as the real thing;
      // that mutation passed this test green before the regex was tightened.
      const call = new RegExp(`t\\('${key.replace(/\./g, '\\.')}'\\)`, 'g');
      expect(source.match(call)?.length ?? 0, key).toBe(1);
    }
    // The available branch is only honest if it actually goes somewhere.
    expect(source).toMatch(
      /stage === 'workspace' \?[\s\S]{0,900}onOpenSeanime\(current \? \{ localFilePath: current\.path \} : undefined\)/,
    );
    // `needs-server` must be the fallback branch, not something reachable while available.
    expect(source).toMatch(/stage === 'connecting' \?[\s\S]{0,400}needsServerTitle/);
  });

  it('tucks the video inspector\'s setup tools behind ONE collapsed disclosure', () => {
    const source = read('renderer/views/MediaCenterView.tsx');
    // §10.4 Q4 measured this rail at `collapsedDisclosures 0, scannedControls 34` against a
    // bar of `>=1 collapsed AND <=12`. Unflagged after: **1 and 17**; with the same
    // `.mc-sidebar,.mc-topbar,.mc-playerbar` shell exclusion Music's Q4 closed under, page-
    // scanned **7** and shell 15, so cat5 on Video is PASS 10/10.
    const match = source.match(/<details className="mc-inspector-advanced">[\s\S]*?<\/details>/);
    expect(match?.[0], 'the disclosure must exist as one block').toBeTruthy();
    const details = match?.[0] ?? '';
    // Uncontrolled and CLOSED by default: an `open`/`defaultOpen` prop would put the
    // fourteen setup controls straight back above the fold and score the same 34.
    expect(details).not.toMatch(/<details className="mc-inspector-advanced"[^>]*open/);
    // A disclosure HIDES, it does not unmount — both blocks stay inside it, so the watch
    // folder keeps watching and a running transcription keeps reporting while it is shut.
    expect(details).toContain("t('mediaCenter.video.subtitleTranscription')");
    expect(details).toContain('<MediaTranscriptionControls state={state} />');
    expect(details).toContain('<MediaWatchFolder state={state} />');
    expect(details).toContain("t('mediaCenter.video.youtube')");
    expect(details).toContain('<MediaYoutubeBar state={state} />');
    // The two blocks the rail keeps in the default state are NOT swept in with them.
    expect(details).not.toContain("t('mediaCenter.video.learningControls')");
    expect(details).not.toContain("t('mediaCenter.video.nowStudying')");
  });

  it('translates the three new stage keys in all four catalogues', () => {
    for (const key of [
      'mediaCenter.video.workspacePlayerTitle',
      'mediaCenter.video.workspacePlayerDetail',
      'mediaCenter.video.openInWorkspace',
    ]) {
      expect(en[key], `missing en key ${key}`).toBeTruthy();
      expect(ja[key], `missing ja key ${key}`).toBeTruthy();
      expect(ru[key], `missing ru key ${key}`).toBeTruthy();
      expect(zh[key], `missing zh key ${key}`).toBeTruthy();
    }
    // The available copy must not promise a *running* server: `available` only means the
    // sidecar is not `disabled`.
    expect(en['mediaCenter.video.workspacePlayerDetail']).not.toMatch(/is running|is ready/);
  });
  /**
   * D248 — the two whole-library sweeps in Media Center ▸ settings used to be
   * `onClick={() => void window.api.x()}`, where the `void` WAS the handler:
   * a 14.9 s (online) to 71.2 s (offline) job with no spinner, no toast and no
   * pollable status. These assertions are read against a COMMENT-STRIPPED copy
   * of the source, because this file's own fix comment quotes the defective
   * form and a raw `toContain` would score the prose as the code.
   */
  describe('the whole-library sweeps report what they did', () => {
    const code = read('renderer/views/MediaCenterView.tsx')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    it('no longer fires either sweep as a bare void call', () => {
      expect(code).not.toContain('void window.api.runMediaMetadata()');
      expect(code).not.toContain('void window.api.runSubtitleDiscovery()');
    });

    it('awaits each sweep and toasts its outcome', () => {
      expect(code).toContain('const result = await window.api.runMediaMetadata()');
      expect(code).toContain('const result = await window.api.runSubtitleDiscovery()');
      expect(code).toContain("t('mediaCenter.settings.metadataDone'");
      expect(code).toContain("t('mediaCenter.settings.metadataFailed')");
      expect(code).toContain("t('media.subtitles.searchDone'");
      expect(code).toContain("t('media.subtitles.searchFailed')");
    });

    it('does not call an offline sweep a clean zero', () => {
      // The whole point of D247: `ok:true, files:0` is what a real outage AND an
      // empty library both return. Without this predicate the settings button
      // would toast a neutral "Attached 0 subtitle files" for a dead network —
      // the exact defect just fixed one file away in MediaDetailPanel.
      expect(code).toContain('subtitleSweepWentNowhere(result)');
      expect(code).toMatch(/result\.ok && !wentNowhere/);
    });

    it('disables both buttons while either sweep runs', () => {
      // One job at a time: both walk the whole library, and a second pass started
      // on top of the first only fights it.
      expect(code).toContain("useState<'metadata' | 'subtitles' | null>(null)");
      const disabled = code.match(/disabled=\{libraryJob !== null\}/g) ?? [];
      expect(disabled).toHaveLength(2);
      expect(code).toContain("aria-busy={libraryJob === 'metadata'}");
      expect(code).toContain("aria-busy={libraryJob === 'subtitles'}");
      // The label has to change too — a disabled button with unchanged text reads
      // as broken, not as busy.
      expect(code).toContain("t('mediaCenter.settings.working')");
      expect(code).toContain("t('media.subtitles.searching')");
    });

    it('translates the three new settings keys in all four catalogues', () => {
      for (const key of [
        'mediaCenter.settings.working',
        'mediaCenter.settings.metadataDone',
        'mediaCenter.settings.metadataFailed',
      ]) {
        expect(en[key], `missing en key ${key}`).toBeTruthy();
        expect(ja[key], `missing ja key ${key}`).toBeTruthy();
        expect(ru[key], `missing ru key ${key}`).toBeTruthy();
        expect(zh[key], `missing zh key ${key}`).toBeTruthy();
      }
      // Every plural arm must carry BOTH slots. An arm that drops `{unmatched}`
      // is unrenderable in the language that selects it, and `i18n-check` counts
      // keys, not slots — it cannot see this.
      for (const catalog of [en, ja, ru, zh]) {
        const done = catalog['mediaCenter.settings.metadataDone'];
        const arms = typeof done === 'string' ? [done] : Object.values(done as Record<string, string>);
        expect(arms.length).toBeGreaterThan(0);
        for (const arm of arms) {
          expect(arm).toContain('{count}');
          expect(arm).toContain('{unmatched}');
        }
      }
    });
  });
});
