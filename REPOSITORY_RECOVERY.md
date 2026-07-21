# Repository Recovery

How to undo or recover from the UI-refinement repository stabilization. Read with `REPOSITORY_STABILIZATION_MANIFEST.md` + `REPOSITORY_STABILIZATION_RISKS.md`. **No destructive Git was used to create any of this** and none is required to reverse it.

## Anchors

| Item | Value |
|---|---|
| Original branch | `grammarx/phase-1-5` |
| Original HEAD (pre-stabilization) | `4b846f113857a89bfbdf97667d7babea882c70cc` |
| Backup branch (points at original HEAD) | `backup/pre-ui-stabilization` → `4b846f1` |
| Canonical base commit | `54fd5d99f07ce9af01e027003efdde98225606f3` |
| Canonical base parent | `4b846f1` |
| Account A worktree / branch | `C:/Users/Arseniy/Projects/jp-study-app-core-shell` / `ui/core-shell` |
| Account B worktree / branch | `C:/Users/Arseniy/Projects/jp-study-app-app-screens` / `ui/app-screens` |
| External recovery artifacts | `C:/Users/Arseniy/Projects/jp-study-app-stabilization/` |

## Recovery artifacts (outside the repo)

`C:/Users/Arseniy/Projects/jp-study-app-stabilization/`:
- `tracked.patch` — all 259 tracked edits vs `4b846f1` (binary-safe).
- `staged.patch` — empty (nothing was staged at capture time).
- `untracked-manifest.txt` — the 1243 untracked paths at audit time.
- `untracked-checksums.txt` — sha1 of every untracked file.
- `untracked-backup.tar.gz` — **full content** of all 1243 untracked files (86 MB).
- `status-before.txt`, `worktrees-before.txt`, `branches-all-before.txt`, `branch-before.txt`.

## Restore an EXCLUDED file (the 65 gitignored ones)

They were never deleted — they remain on disk in the main checkout and are gitignored (`.wrangler`, `claude-wired-runs`, `harness-dist`, `blanc-budget.json`, `blanc-coverage.json`, `.search-result.txt`, `.claude/settings.json`, `.mcp.json`). To recover a fresh copy anyway:
```bash
tar -xzf ../jp-study-app-stabilization/untracked-backup.tar.gz -C /tmp/recover <path>
```
To start tracking one intentionally, remove its line from `.gitignore` and `git add <path>`.

## Remove the two UI worktrees safely (non-destructive)

```bash
# from the main checkout
git worktree remove ../jp-study-app-core-shell      # only if clean; add --force only if you accept losing WIP there
git worktree remove ../jp-study-app-app-screens
git branch -D ui/core-shell ui/app-screens          # deletes the branch pointers (commits stay reachable via reflog)
git worktree prune
```

## Roll back the canonical commit (keep original work safe)

The canonical commit did not rewrite history — it is a normal child of `4b846f1`. Options, least to most drastic:
- **Inspect original state:** everything at `4b846f1` is on `backup/pre-ui-stabilization`; check it out in a scratch worktree.
- **Move the main branch back** (only if you truly want to discard the canonical commit and re-dirty the tree): `git switch grammarx/phase-1-5 && git reset --soft 4b846f1` — `--soft` keeps all files staged; **never `--hard`**. This is optional and generally unnecessary since the canonical base is good.
- The excluded files and unrelated work are untouched by any of this.

## Confirmation

- No `git clean`, `git reset --hard`, `git checkout -- .`, `git restore .`, `git add -A`, force-push, or history rewrite was used.
- Original working-tree content is preserved (as the canonical commit content + the external archive).
- **No UI implementation has begun.** Both `ui/*` worktrees are at the pristine canonical base.
