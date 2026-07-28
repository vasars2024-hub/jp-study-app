# Adopted Seanime web source — library/lists surface

## Provenance

| Field | Value |
|---|---|
| Upstream | https://github.com/5rahim/seanime |
| Pinned commit | `9bdd052afdfc2c2f31293fdb21a27ef8e8bbcce9` |
| Upstream license | GPL-3.0 |
| Local checkout | `C:/Users/Arseniy/Projects/seanime-upstream` |
| Adopted | 2026-07-28 (Phase 2) |
| Files | 179, copied verbatim except the four substitutions below |

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
| `tools/architecture-audit.cjs` | it walks `src/` only, so the 179 files stop registering as orphan modules (they broke `architectureBaseline.test.ts` when they lived under `src/media/seanime/`) |
| `npx tsc --noEmit` | see the boundary note below |

This also matches the precedent already set by `vendor/seanime/generated/types.ts`.

## The four substitutions

Every one is a **whole-file replacement**, never an edit inside upstream code, so
`git diff` against the pinned checkout stays a clean "these 4 files differ" rather than a
scatter of inline patches. Restoring upstream behaviour is always "delete the file and
re-copy it from the pinned checkout".

| File | Why |
|---|---|
| `api/client/server-url.ts` | Upstream resolves the server from a compile-time port or `window.location`. Our sidecar binds an **ephemeral** loopback port per spawn, so the origin is runtime-only. |
| `components/shared/sea-link.tsx` | Upstream renders `@tanstack/react-router`'s `<Link>`, which throws outside a `RouterProvider`. Renders a plain `<a>`; this is what removes the router dependency. |
| `lib/navigation.ts` | Same reason: `useRouter`/`usePathname`/`useSearchParams` were built on `useNavigate`/`useLocation`. Same exported API, no router. Pushes are no-ops until entry routes are adopted in Phase 3. |
| `app/(main)/_features/media/_containers/media-preview-modal.tsx` | **The blast-radius edge.** Upstream's hover preview imports the whole entry page, reaching video-core (`hls.js`, `jassub`, `anime4k-webgpu`), mpv-core, onlinestream, torrent-search, debrid and playlists. Stubbed to a no-op setter. |

Measured effect of that last one, from `library-view.tsx`:

```
with the real modal   368 local files, 60 npm packages
with the stub         179 local files, 47 npm packages
```

## Next surface: `entry`/episodes — measured 2026-07-28, NOT yet adopted

Re-measured before copying anything, per the Phase-3 brief. The measuring tool
(`import-graph.mjs`) had to be rewritten — the Phase-2 copy lived in a session scratchpad
and is gone. **Calibration: it reproduces the Phase-2 file counts exactly** (368 as-is,
179 + the cut file itself with `CUT=media-preview-modal`). Its *package* count is more
inclusive than Phase 2's (+7: it counts type-only specifiers), so compare deltas measured
with the same tool, not against Phase 2's absolute package numbers.

| Entry | Local files | npm specifiers |
|---|---:|---:|
| `library-view` (currently adopted, stubbed modal) | 179 | 47 (Phase-2 count) |
| `entry/page.tsx` alone | 362 | 67 |
| **`library-view` + `entry/page.tsx`** | **369** | **67** |
| …minus `torrent-search` / `debrid-stream` / `onlinestream` | 295 | 61 |

The entry closure almost entirely *contains* the library closure — together they are only
369 files. This confirms that adopting `entry` is what restores the real
`media-preview-modal`; the two are the same superset. **Cost of the step: +190 local files
and 15 new npm packages.**

```
@dnd-kit/core  @dnd-kit/modifiers  @dnd-kit/sortable  @dnd-kit/utilities
@mpv-prism/core  @radix-ui/react-hover-card  @radix-ui/react-progress
anime4k-webgpu  copy-to-clipboard  hls.js  jassub  jotai-scope
media-captions  mousetrap  rrweb
```

### Blocker found: `@mpv-prism/core` — needs a FIFTH substitution

`@mpv-prism/core` is in that list, and **ADR-002 defers mpv-prism** while the plan's risk
register records its licence as unknown with the mitigation *"Don't ship it"*. Adopting the
entry surface unmodified would pull it into the dependency tree.

It is contained. The package is imported by exactly four files, all under
`app/(main)/_features/mpv-core/`:

```
mpv-core.tsx  mpv-core-player-inner.tsx  mpv-core-stats.tsx  mpv-core.atoms.ts
```

and only `mpv-core.tsx` is reachable from the entry closure. Stubbing that one file the way
`media-preview-modal.tsx` was stubbed removes the dependency (67 → 66 specifiers). **Add it
to the substitution table as the fifth entry when the adoption is performed**, with the same
rationale line: *upstream's alternative player; ADR-002 defers mpv-prism and its licence is
unknown, so the feature is stubbed rather than shipped.*

`hls.js`, `jassub`, `anime4k-webgpu` and `media-captions` are the real `video-core`
dependencies and **are** wanted — they are what Phase 3 is adopting.

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

Tailwind is confined to this tree. `tailwind.config.ts` differs from upstream in exactly
three containment changes — `content` narrowed, `preflight: false`, and
`important: "#media-workspace"` (plus `container: false`, which was the only rule Tailwind
emits without the `important` selector). Verified on the built stylesheet: **6,183 of 6,183
selectors are scoped**, and the shell's `main.css` contains zero Tailwind.

Restyling to Study OS tokens is done purely by redefining CSS custom properties in
`src/media/mediaWorkspace.css`, because upstream already expresses `brand` and `gray` as
`rgb(var(--color-*) / <alpha-value>)`. No adopted class name is touched.

## Re-syncing with upstream

1. Bump the pinned checkout, then re-run the closure measurement
   (`import-graph.mjs`, entry `app/(main)/_features/anime-library/_screens/library-view.tsx`,
   `CUT=media-preview-modal`).
2. Re-copy the closure over this directory.
3. Re-apply the four substitutions above.
4. Re-check `src/media/seanime-boundary.d.ts` against the real signatures.
5. Rebuild and re-verify selector scoping in the built CSS.
