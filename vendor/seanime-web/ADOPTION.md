# Adopted Seanime web source — library + entry/episodes surface

## Provenance

| Field | Value |
|---|---|
| Upstream | https://github.com/5rahim/seanime |
| Pinned commit | `9bdd052afdfc2c2f31293fdb21a27ef8e8bbcce9` |
| Upstream license | GPL-3.0 |
| Local checkout | `C:/Users/Arseniy/Projects/seanime-upstream` |
| Adopted | 2026-07-28 (Phase 2 library; Phase 3 entry/episodes) |
| Files | 369, copied verbatim except the six substitutions below |

Landing this tree triggered ADR-001: `LICENSE` became GPL-3.0 and `package.json` became
`"license": "GPL-3.0-or-later"` in the same commit.

**Attribution vs. branding.** GPL-3.0 requires preserving these notices, so the upstream
project is named here and in adopted file headers. That is a licensing obligation and is
separate from the standing constraint that Seanime's *name, logo and screenshots must never
appear in shipped UI* — they do not inherit the code license. Nothing user-facing says
"Seanime".

## Why this lives in `vendor/` and not `src/`

Three repo-wide rules apply to `src/` that should not apply to third-party source we have
decided never to hand-edit:

| Rule | How `vendor/` avoids it |
|---|---|
| `npm run lint` | `.eslintrc.json` already has `ignorePatterns: ["vendor/**"]` |
| `tools/architecture-audit.cjs` | it walks `src/` only, so the adopted files stop registering as orphan modules (the original 179 broke `architectureBaseline.test.ts` when they lived under `src/media/seanime/`) |
| `npx tsc --noEmit` | see the boundary note below |

This also matches the precedent already set by `vendor/seanime/generated/types.ts`.

## The six substitutions

Every one is a **whole-file replacement**, never an edit inside upstream code, so
`git diff` against the pinned checkout stays a clean "these six files differ" rather than a
scatter of inline patches. Restoring upstream behaviour is always "delete the file and
re-copy it from the pinned checkout".

| File | Why |
|---|---|
| `api/client/server-url.ts` | Upstream resolves the server from a compile-time port or `window.location`. Our sidecar binds an **ephemeral** loopback port per spawn, so the origin is runtime-only. |
| `components/shared/sea-link.tsx` | Upstream renders `@tanstack/react-router`'s `<Link>`, which throws outside a `RouterProvider`. Renders a plain `<a>`; this is what removes the router dependency. |
| `lib/navigation.ts` | Same reason: `useRouter`/`usePathname`/`useSearchParams` were built on `useNavigate`/`useLocation`. Same exported API, no router. |
| `app/(main)/_features/mpv-core/mpv-core.atoms.ts` | Removes the one reachable type-only `@mpv-prism/core` import and supplies its structural track interface locally. ADR-002 still defers the alternative player. |
| `app/(main)/_features/video-core/video-core-subtitles.ts` | Replaces upstream's Rsbuild-only JASSUB integration with generated runtime/worker/WASM/font assets under `src/media/jassub`, imported through Vite URLs, and mechanically applies `patches/seanime/0001-video-core-cuechange.patch` in memory. |
| `app/(main)/_features/video-core/video-core-media-captions.ts` | Redirects two global package stylesheets to a generated `src/media/mediaCaptions.css` whose selectors are all scoped beneath `#media-workspace`. |

The former fourth substitution,
`app/(main)/_features/media/_containers/media-preview-modal.tsx`, was deliberately retired:
Phase 3 restores the real upstream modal because the entry page and its player dependencies
are now the adopted surface.

The three generated substitutions refuse to run if their guarded upstream lines move:

```
node docs/migration/tools/make-mpv-atoms-substitution.mjs
node docs/migration/tools/make-jassub-substitution.mjs
node docs/migration/tools/make-media-captions-substitution.mjs
```

## `entry`/episodes adoption — completed 2026-07-28

The closure was measured before copying. `import-graph.mjs` reproduces the original Phase-2
counts exactly; `adopt-closure.mjs` makes the copy repeatable while preserving whole-file
substitutions.

| Entry | Local files | npm specifiers |
|---|---:|---:|
| `library-view` (Phase-2 state, stubbed modal) | 179 | 47 (Phase-2 count) |
| `entry/page.tsx` alone | 362 | 67 |
| **adopted `library-view` + `entry/page.tsx`** | **369** | **67** |
| …minus `torrent-search` / `debrid-stream` / `onlinestream` | 295 | 61 |

The entry closure almost entirely *contains* the library closure — together they are only
369 files. The copy arithmetic was **188 unchanged + 1 overwritten + 176 added + 4 preserved
= 369**. The final dry run after all integration work is **363 upstream-identical + six
preserved substitutions = 369**, with zero stale files.

Fourteen direct runtime packages were added at the exact versions in upstream's lockfile;
the root manifest moved **67 → 81 dependencies** and `npm install` added 54 transitive
packages. `hls.js`, `jassub`, `anime4k-webgpu` and `media-captions` are intentionally present.
`@mpv-prism/core` is intentionally absent.

### Correction: the reachable MPV file and its licence

The original measurement named `mpv-core.tsx` as the reachable importer. That was wrong.
The real chain is:

```
entry/page.tsx
  → entry/_containers/torrent-stream/playback-play-pill.tsx
  → _features/mpv-core/mpv-core.atoms.ts
```

Its import is type-only. The substitution replaces `MpvPrismTrack` with the structural
interface from pinned mpv-prism 0.1.8; no executable mpv-prism code enters the bundle.

The licence question is also closed: mpv-prism is **LGPL-3.0**, compatible with this
GPL-3.0 work. It remains excluded because ADR-002 defers the feature and because it is not a
registry package: upstream installs it from a hash-pinned tarball URL on `seanime.app`.

## Boot ordering — the one non-obvious constraint

Upstream reads the auth token via
`atomWithStorage(SERVER_AUTH_TOKEN_STORAGE_KEY, undefined, undefined, { getOnInit: true })`.
`getOnInit` snapshots `localStorage` when the **atom is created**, i.e. at module-eval time
of `server-status.atoms.ts` — not when a component first reads it.

So the token must be in `localStorage` *before this tree is imported at all*. That is why
`src/media/seanimeBootstrap.ts` imports nothing from `@/`, why `MediaWorkspaceHost` awaits it
before `React.lazy` resolves, and why the harness entry uses a dynamic `import()`.

Get this wrong and every request goes out with no `X-Seanime-Token`, the server answers 401,
and `requests.ts` does `window.location.replace("/public/auth")` — a blank screen with no
error. It was the single hardest failure to diagnose during the adoption.

## The typed boundary

`tsconfig.json` deliberately has **no** `paths` entry for `@/*`; the alias exists only in
`vite.renderer.config.ts`. Under this repo's stricter `noImplicitAny` this tree produces 165
diagnostics that we will not "fix" by editing someone else's code, so `tsc` instead resolves
`@/*` through hand-written declarations in `src/media/seanime-boundary.d.ts` and never opens
these files. That keeps `npx tsc --noEmit` a meaningful gate on Study OS code (still exactly
290 diagnostics / 108 files).

**The cost, stated plainly:** that boundary is hand-maintained. If an upstream sync changes
one of those signatures, TypeScript will not notice — the Vite build or runtime will. Re-check
it on every version bump.

## Styling

Tailwind is confined to this tree. The root configuration narrows `content`, disables
Preflight and `container`, and sets `important: "#media-workspace"`. The entry closure exposed
two additional leaks that the Phase-2 surface could not reach:

- `@tailwindcss/forms` emits component selectors without honoring `important`; the
  stylesheet-local `src/media/tailwind.media.config.cjs` removes that plugin and
  `mediaWorkspace.css` supplies the exact used rules with an explicit workspace prefix.
- `media-captions` imports global package CSS; its substitution redirects to a generated
  scoped copy.

Verified on the production build: **6,841 of 6,841 selectors are scoped** to
`#media-workspace`, and the shell's `main-*.css` contains zero `--tw-` tokens.

Restyling to Study OS tokens is done purely by redefining CSS custom properties in
`src/media/mediaWorkspace.css`, because upstream already expresses `brand` and `gray` as
`rgb(var(--color-*) / <alpha-value>)`. No adopted class name is touched.

## Re-syncing with upstream

1. Bump the pinned checkout, then re-run the two-entry closure measurement with
   `docs/migration/tools/import-graph.mjs`.
2. Dry-run, then run `adopt-closure.mjs` with `library-view.tsx` and `entry/page.tsx`.
3. Re-run the three guarded substitution generators listed above.
4. Reconcile direct package versions against the new upstream lockfile; never add
   `@mpv-prism/core` while ADR-002 remains in force.
5. Re-check `src/media/seanime-boundary.d.ts` against the real signatures.
6. Run the production renderer build, then verify every selector in its Media workspace CSS
   is scoped and the shell CSS contains no Tailwind token.
