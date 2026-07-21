# Repository Stabilization Manifest

**Status: PROPOSED — awaiting user approval. Nothing has been staged, committed, ignored, deleted, or archived (beyond the read-only Stage-1 recovery artifacts).**

- Repository root: `C:/Users/Arseniy/Projects/jp-study-app`
- Original branch: `grammarx/phase-1-5`
- Original HEAD (also the intended canonical parent): `4b846f113857a89bfbdf97667d7babea882c70cc`
- Backup branch (points at committed HEAD): `backup/pre-ui-stabilization` → `4b846f1`
- Recovery artifacts (outside repo): `C:/Users/Arseniy/Projects/jp-study-app-stabilization/`
- Working-tree scale: **259 tracked** modified/deleted + **1243 untracked** (non-ignored)
- Tooling: no `.gitattributes`, no Git LFS configured (git-lfs 3.7.1 IS installed & available). No npm workspaces.

## Central finding (shapes the whole base)

The tracked and untracked source form **one interdependent snapshot** — a "minimal UI-only" base cannot build:

- Tracked-modified `src/main.ts`/`preload.ts` import **13+ untracked** main-process modules (`collectedTools`, `extensionServer`, `resourcesCatalog`, `translateAnalysis`, `windowChrome`, `jiten`, `mangaOcr`, `errorLog`, `debugBridge`, `profileRules`, `buddyScheduler`, `ytPlaylists`, `systemDictionary`).
- `package.json` `postinstall`/`package`/`make` invoke **`tools/sync-extension-mirror.cjs`, which is UNTRACKED** → even a fresh clone of committed HEAD would fail `npm install`.
- The plan's §5 diagnosis was verified against the **working tree** (`styles.css` = 20723 lines, `--accent:#ff2e4d`, 248 `var(--accent)`), not committed HEAD.

**Conclusion:** the canonical base must be the **full current source snapshot** (tracked mods + untracked source/tooling/docs), minus only proven junk/cache/private, with a decision on large binary assets. A partial "UI-only" commit is not viable.

## Disposition table

Legend — Action: `INCLUDE` (in canonical base) · `EXCLUDE` (leave in checkout only) · `IGNORE` (also add to `.gitignore`) · `DECISION` (needs user call). Confidence: H/M/L.

| # | Path / pattern | Count | Category | Tracked | Runtime | Build | Sensitive | Action | Conf | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | All tracked modified/deleted files | 259 | source/config/docs | tracked | yes | yes | no | **INCLUDE** | H | current app state; interdependent with untracked source |
| 2 | `src/**` untracked source (`.ts/.tsx/.css/.js/.html/.json`, non-asset) | ~282 | application source + tests | untracked | yes | yes | no | **INCLUDE** | H | imported by tracked `main.ts`/`preload.ts`/tests (Stage 3) |
| 3 | `tools/**` scripts/data (excl. `claude-wired-runs/`) | ~140 | build + dev tooling | untracked | some | **yes** | no | **INCLUDE** | H | `sync-extension-mirror.cjs` is in `postinstall`; i18n/build scripts |
| 4 | `extension/**` (13) + `src/main/chrome-extension/**` (13) | 26 | app source (synced pair) | untracked | yes | yes | no | **INCLUDE** | H | mirror kept byte-identical; mirror `?raw`-imported into build |
| 5 | `cloudflare-worker/{src,README,wrangler.toml}` | 3 | app source (worker) | untracked | opt | yes | no (no keys found) | **INCLUDE** | H | worker source; no secrets detected |
| 6 | `docs/**`, `catalog-repo/**`, `public/tray-icon.png` | ~10 | docs + data + asset | untracked | some | some | no | **INCLUDE** | H | project docs/data; tray icon used by shell |
| 7 | `UI_UX_*.md` (4) + `UI_MIGRATION_DEBT.md` | 5 | documentation | untracked | no | no | no | **INCLUDE** | H | required by both worktrees |
| 8 | Root `*-harness.html` (arena/grammar/manga-reader/motion) | 4 | dev harness | untracked | no | **yes** | no | **INCLUDE** | H | Vite rollup inputs in `vite.renderer.config.ts` |
| 9 | `vite.motionharness.config.ts` | 1 | build config | untracked | no | yes | no | **INCLUDE** | M | harness build config; pairs with motion harness |
| 10 | `src/renderer/__devharness__/**` | 7 | dev harness source | untracked | no | yes | no | **INCLUDE** | H | harness entry sources for #8 |
| 11 | `src/main/city/assets/**` non-binary (md/json/py/ts manifests, `validateAssets.ts`) | ~57 | source/metadata | untracked | yes | yes | no | **INCLUDE** | H | city feature manifests + validator source |
| 12 | **`src/renderer/assets/shimeji/**` PNG sprites** | 618 | runtime asset (binary, ~15MB) | untracked | **yes (companion feat)** | no | no | **DECISION** | H | loaded via `ShimejiSprite`/`companionCatalog`; large binary |
| 13 | **`src/main/city/assets/**` PNG art** | ~55 | runtime asset (binary, ~75MB) | untracked | **yes (city feat)** | no | no | **DECISION** | H | city/Noctis feature art; large binary |
| 14 | Root audit docs `EXTENSION_*` (12), `PHASE_6_5_*` (4), `BLANC_REFINEMENT_PLAN.md`, `TOOLBOX_COMPLETION_AUDIT.md` | 17 | documentation (unrelated) | untracked | no | no | no | **DECISION** (rec. INCLUDE) | M | harmless docs; but unrelated to UI effort |
| 15 | `cloudflare-worker/.wrangler/**` | 10 | cache (sqlite/kv) | untracked | no | no | no | **EXCLUDE + IGNORE** | H | wrangler local cache; regenerated |
| 16 | `tools/claude-wired-runs/**` (`attempt-NN.out.txt`, status json) | 46 | prior-agent run logs | untracked | no | no | no | **EXCLUDE + IGNORE** | H | session output residue |
| 17 | `harness-dist/**` | 4 | generated bundle | untracked | no | no | no | **EXCLUDE + IGNORE** | M | built harness output; no source dependents |
| 18 | `.claude/settings.json`, `.claude/commands/update-blanc.md` | 2 | local agent config | untracked | no | no | local-only | **EXCLUDE + IGNORE** | H | machine-local Claude config |
| 19 | `.mcp.json` | 1 | local MCP config | untracked | no | no | local-only (no keys) | **EXCLUDE + IGNORE** | H | machine-local MCP server list |
| 20 | `automation-builder.ps1`, `automation-configs/**` | 3 | **app feature** (Blanc toolbox) | untracked | **yes** | no | no | **INCLUDE** | H | **CORRECTED at Stage 10:** referenced by `src/shared/automationBuilder.ts`, `BlancShell.tsx` (`automation-builder` tool), and `automationBuilder.test.ts` — not machine-local |
| 21 | `.search-result.txt` | 1 | stray artifact | untracked | no | no | no | **EXCLUDE** | H | contents = "hello" |
| 22 | `blanc-budget.json`, `blanc-coverage.json` | 2 | generated report | untracked | no | no | no | **DECISION** (rec. EXCLUDE) | M | look generated by `tools/blanc-*.cjs`; no source dependents |

Include (confident): rows 1–11 (+ 9,10). Exclude (confident): rows 15–19, 21. Decisions: rows 12, 13, 14, 22.

> **Stage-10 correction (post approval):** Row 20 (`automation-builder.ps1`, `automation-configs/`) was reclassified from EXCLUDE to **INCLUDE** after the dependency sanity check found it is a shipped Blanc-toolbox feature referenced by source + tests. Final base = **1439 staged paths** (247 M + 12 D + 1180 A); excluded set = 65 files (`.wrangler` 10, `claude-wired-runs` 46, `harness-dist` 4, `blanc-budget/coverage.json` 2, `.search-result.txt` 1, `.claude/settings.json` 1, `.mcp.json` 1).

## Expected canonical base size

- **If binaries INCLUDED (rows 12–14 in):** ~259 tracked + ~1174 untracked ≈ **1433 paths** vs HEAD; adds ~86 MB to the object store (one-time); worktrees are fully runnable.
- **If binaries EXCLUDED (rows 12–13 out):** ~259 tracked + ~501 untracked ≈ **760 paths**; ~few MB; worktrees cannot render companion/city features unless assets are provided by a documented mechanism (Stage 13).

## Proposed `.gitignore` additions (only applied post-approval, as a separate documented edit)

```
# wrangler local cache
cloudflare-worker/.wrangler/
# prior-agent run logs
tools/claude-wired-runs/
# generated harness bundle
harness-dist/
# local agent / MCP config
.claude/settings.json
.mcp.json
# stray
/.search-result.txt
# (only if binaries excluded by decision #1:)
# src/renderer/assets/shimeji/
# src/main/city/assets/**/*.png
```

## Proposed `.gitattributes` / LFS

None auto-applied. If binaries are to be tracked long-term, a **separate** LFS proposal is recommended (patterns `src/renderer/assets/shimeji/**`, `src/main/city/assets/**/*.png`; note: requires all clones to have git-lfs, affects CI/clone). Not part of this pass unless requested.
