/**
 * The packaged CSP, pinned — Phase 9 / slice 47g.
 *
 * PHASE_6_5_AUDIT.md §3 records a chained High finding whose mitigation is this policy: a
 * compromised renderer must not be able to load from, or exfiltrate to, an arbitrary host.
 * Until now the policy was an inline string inside `registerContentSecurityPolicy` in
 * `main.ts`, so nothing could read it without importing Electron — and it had no test at all.
 * A later edit adding `'unsafe-eval'` for one stubborn dependency, or widening `connect-src`
 * to blanket `https:` for one new provider, would have silently undone the mitigation.
 *
 * These tests assert the PROPERTIES the audit cares about, not the exact string. A policy is
 * allowed to grow a directive; it is not allowed to stop being restrictive.
 *
 * What this does NOT show: that the header is actually applied in a packaged build. It is
 * registered on the `app:` scheme's URLs, an origin that only exists in production, and no packaged run has
 * ever been inspected for it. That remains a Phase 9 item.
 */
import { describe, expect, it } from 'vitest';
import {
  CONTENT_SECURITY_POLICY_DIRECTIVES,
  contentSecurityPolicyHeader,
  cspDirectiveSources,
} from '../contentSecurityPolicy';

/** Anything that lets a host be chosen at runtime rather than at review time. */
const WILDCARD_HOST = /^(https?:)?\/\/\*$|^https?:$|^\*$/;

describe('packaged Content-Security-Policy', () => {
  it('never allows eval, in any directive', () => {
    // The single most likely regression: a bundler or a dependency that "just needs" eval.
    // Electron's own dev warning is about exactly this, and it is easy to silence wrongly.
    // `'wasm-unsafe-eval'` is a different, narrower source (WebAssembly compilation only), so
    // this checks for the exact `'unsafe-eval'` token rather than the substring.
    for (const directive of CONTENT_SECURITY_POLICY_DIRECTIVES) {
      expect(directive.split(/\s+/)).not.toContain("'unsafe-eval'");
    }
    expect(contentSecurityPolicyHeader()).not.toMatch(/(^|\s)'unsafe-eval'/);
  });

  it('executes only its own scripts', () => {
    // Not `default-src`'s fallback — `script-src` must say it, or a later `default-src`
    // widening for images or fonts would quietly widen script execution too.
    // Plus WebAssembly compilation for the libass subtitle renderer — no JS eval, no hosts.
    expect(cspDirectiveSources('script-src')).toEqual(["'self'", "'wasm-unsafe-eval'"]);
  });

  it('cannot reach an off-machine host except the ones named in review', () => {
    const sources = cspDirectiveSources('connect-src') ?? [];
    expect(sources.length).toBeGreaterThan(0);
    const remote = sources.filter((source) => /^https?:|^wss?:/.test(source));
    // Loopback is allowed because the sidecar is a local server on an unpredictable port.
    const offMachine = remote.filter((source) => !source.includes('127.0.0.1'));
    // HuggingFace is the one documented exception (on-device Whisper model weights).
    expect(offMachine.every((source) => source.includes('huggingface.co') || source.includes('hf.co')))
      .toBe(true);
    expect(offMachine.some(WILDCARD_HOST.test.bind(WILDCARD_HOST))).toBe(false);
  });

  it('keeps the image allow-list to the named providers', () => {
    const sources = cspDirectiveSources('img-src') ?? [];
    const remote = sources.filter((source) => source.startsWith('https:'));
    // The exact list, not a `toContain`: the property worth guarding is that
    // nothing gets added without someone editing this line and justifying it.
    // `cdn.jiten.moe` serves Jiten deck covers for Reading discovery results
    // that have no locally cached art yet. `artworks.thetvdb.com` serves the media
    // workspace's episode thumbnails (blocked in packaged builds until 2026-09-23).
    // `i.ytimg.com` serves YouTube playlist and Discover thumbnails (blocked until 2026-09-26).
    expect(remote).toEqual([
      'https://cdn.myanimelist.net',
      'https://*.anilist.co',
      'https://cdn.jiten.moe',
      'https://artworks.thetvdb.com',
      'https://i.ytimg.com',
    ]);
    // Every entry is still a concrete host. A bare `https:` here would silently
    // undo the whole directive, and reads almost identically in a diff.
    expect(remote.every((source) => source.startsWith('https://'))).toBe(true);
  });

  it('lets the player load its stream from the loopback sidecar', () => {
    // `media-src` and `connect-src` are NOT interchangeable — the fetch that prepares the
    // stream and the <video> that loads it are governed separately, and fixing only the first
    // produces a live socket, a successful POST, and no picture.
    expect(cspDirectiveSources('media-src')).toContain('http://127.0.0.1:*');
    expect(cspDirectiveSources('connect-src')).toContain('http://127.0.0.1:*');
    expect(cspDirectiveSources('connect-src')).toContain('ws://127.0.0.1:*');
  });

  it('lets flashcard audio play from the data: URL the review is handed', () => {
    // flashcardReadAudio returns `data:audio/...`; without `data:` here every card clip
    // failed in a packaged build with "no supported source" while dev played it.
    expect(cspDirectiveSources('media-src')).toContain('data:');
  });

  it('forbids plugins, form posts and base-tag rewrites outright', () => {
    expect(cspDirectiveSources('object-src')).toEqual(["'none'"]);
    expect(cspDirectiveSources('form-action')).toEqual(["'none'"]);
    expect(cspDirectiveSources('base-uri')).toEqual(["'self'"]);
  });

  it('distinguishes an absent directive from an empty one', () => {
    // A directive that is absent falls back to `default-src`, which is a far weaker statement
    // than an empty list. A helper that returned [] for both would make the assertions above
    // pass against a policy that had lost the line entirely.
    expect(cspDirectiveSources('frame-src')).toBeNull();
    expect(cspDirectiveSources('object-src')).not.toBeNull();
  });

  it('serialises to one header with no empty or duplicated directives', () => {
    const names = CONTENT_SECURITY_POLICY_DIRECTIVES.map((d) => d.split(/\s+/)[0]);
    expect(new Set(names).size).toBe(names.length);
    expect(CONTENT_SECURITY_POLICY_DIRECTIVES.every((d) => d.trim().length > 0)).toBe(true);
    expect(contentSecurityPolicyHeader().split('; ')).toEqual([...CONTENT_SECURITY_POLICY_DIRECTIVES]);
  });
});
