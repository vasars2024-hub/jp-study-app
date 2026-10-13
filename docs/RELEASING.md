# Releasing Gum

This is the checklist for publishing a Windows release that installed copies can
update to. The update path is Squirrel.Windows: an installed Gum asks
`https://github.com/vasars2024-hub/jp-study-app/releases/latest/download/RELEASES`
(GitHub redirects that to the newest non-prerelease's `RELEASES` asset), then
downloads the package that file names, the same way. There is no update server;
the GitHub release IS the feed (`src/main/squirrelUpdater.ts`).

A release that is missing `RELEASES` or the nupkg files still shows up for the
portable zip's "a newer release exists" notice, but installed copies report
"The latest release has no installer update files yet" (`upd2.error.no-feed`)
and stay where they are.

## 0. Before you start

- [ ] At least 6 GB free on the build drive (`Get-PSDrive C`). Squirrel copies
      the pruned app to `%TEMP%` and compresses it twice; a delta build also
      downloads the previous full package (~385 MB).
- [ ] `package.json` `version` bumped (semver; Squirrel orders releases by it).
- [ ] The Seanime sidecar is staged (`SEANIME_EXE`, or the sibling
      `seanime-upstream` checkout), or `SEANIME_SKIP_SIDECAR_PACKAGING=1` is set
      on purpose (see `forge.config.ts`).
- [ ] The CUDA backends are decided for this release (section 3, "CUDA
      backends"). The default keeps them; do nothing unless you mean to drop them.
- [ ] Tests and guards green: `node tools/i18n-check.cjs`,
      `npx tsc --noEmit -p tsconfig.json`, `npx vitest run`.
- [ ] Blanc boot bundle within budget: `node tools/blanc-budget.cjs`. It does
      one production renderer build into a temp dir (~45 s) and sums what
      `blanc.html` loads before first paint (the entry chunk plus every chunk
      and stylesheet it preloads). It fails when that passes
      `blanc.maxBytes` (2,411,724 B unless a local `blanc-budget.json` says
      otherwise) or a Study OS subsystem appears in Blanc's boot path. The same
      check runs inside `npx vitest run` as
      `src/renderer/__tests__/blancBuiltBudget.test.ts`, so a full test run
      covers it; run it alone with
      `npx vitest run src/renderer/__tests__/blancBuiltBudget.test.ts`. To
      measure an existing build without rebuilding, pass
      `--dist=<renderer output dir>` (the folder that holds `blanc.html`). The
      tool also prints the Study OS window against its own ceiling and exits
      1 when that one is over; the vitest gate asserts Blanc only. Raise a
      ceiling only with a reason (`--update` rewrites the local file from the
      current build).

## 1. Signing (optional until a certificate exists)

Code signing is OFF unless both variables are set. With them, `make` signs the
app exe (packager, `@electron/windows-sign`) and `Setup.exe` / `Update.exe`
(Squirrel). Nothing is signed implicitly.

| Variable | Meaning |
| --- | --- |
| `GUM_WIN_CERT_FILE` | Path to the Authenticode `.pfx` |
| `GUM_WIN_CERT_PASSWORD` | Its password (keep it out of shell history: set it in the session, not on the command line) |

Unsigned builds work, but SmartScreen warns on `Setup.exe` until the file earns
reputation, and some antivirus products quarantine `Update.exe` updates.

### Unsigned v1: what users see, and what to tell them

v1 ships unsigned. Every release note and the README carry the same short,
friendly instructions, so nobody thinks the warning means malware:

> **"Windows protected your PC"?** Gum isn't code-signed yet, so Windows
> SmartScreen doesn't recognise the download. Click **More info**, check that the
> app is `Gum-<version> Setup.exe`, then click **Run anyway**. You only need to do
> this once.

- Paste that block into the GitHub release body (step 4) together with the
  SHA-256 of each uploaded file (`Get-FileHash -Algorithm SHA256 <file>`).
- Screenshot placeholder: `docs/images/smartscreen-more-info.png` and
  `docs/images/smartscreen-run-anyway.png` — capture both SmartScreen steps on a
  clean Windows 11 VM before the first public announcement, and link them from
  the README's "Windows protected your PC" section.
- Updates installed by Gum itself (Squirrel) do not show SmartScreen; only the
  first download does.

## 2. Delta packages

`forge.config.ts` gives MakerSquirrel `remoteReleases =
https://github.com/vasars2024-hub/jp-study-app` (the repository URL: Squirrel's
SyncReleases treats a github.com URL as `owner/repo` and asks the GitHub API for
the latest release). SyncReleases downloads the previous release's `RELEASES`
and full nupkg into the output folder, and `--releasify` then writes
`jp_study_app-<version>-delta.nupkg` beside the new full package. A copy one
release behind downloads only the delta. Because the feed only serves the
LATEST release's assets, a copy further behind cannot fetch the older deltas
its `RELEASES` chain names; Squirrel then falls back to the new full package.
That fallback has not been exercised yet (no Squirrel release exists), so check
it in step 5 the first time two Squirrel releases are out.

SyncReleases fails the whole build when there is nothing to sync, so the
`preMake` hook probes the feed's `RELEASES` first and enables deltas only when a
previous Squirrel release is really there. The first Squirrel release
(v1.0.0 and v1.0.1 shipped zips only) is therefore always full-only.

| Variable | Effect |
| --- | --- |
| `GUM_SQUIRREL_DELTA=off` | Never sync; build a full package only |
| `GUM_SQUIRREL_DELTA=require` | Fail the build when no previous release can be synced |
| `GUM_SQUIRREL_REMOTE_RELEASES=<url>` | Sync from somewhere else (for example a local folder server holding the previous release) |
| `GITHUB_TOKEN` | Passed to SyncReleases as `remoteToken` (API rate limit, private repository) |

## 3. Build

Run hidden from a shell (it takes a long time and prints a lot):

```powershell
node tools/package-app.cjs --installer
```

This packages, prunes `node_modules`, then runs only the Squirrel maker over the
pruned app. `npm run make` and `npm run publish` run the same thing with `--zip`
added (the portable zip as well). Neither calls a bare `electron-forge make` or
`electron-forge publish`: those package the UNPRUNED app (~2 GB of
`node_modules`) into the installer, and no Forge publisher is configured, so
uploading stays a manual step (section 4). `squirrelEvents.test.ts` fails if
either script goes back to the bare command.

The output is in `out/make/squirrel.windows/x64/`:

- `Gum-<version> Setup.exe` - the installer for new users
- `RELEASES` - the feed index installed copies read first
- `jp_study_app-<version>-full.nupkg` - the full package
- `jp_study_app-<version>-delta.nupkg` - only when a previous release was synced

Check before uploading:

- [ ] `RELEASES` lists the new full package, and the delta when there is one
      (one line each: `<sha1> <file name> <size>`).
- [ ] The file names in `RELEASES` match the files exactly (GitHub keeps asset
      names as uploaded; spaces in `Setup.exe` are fine, the nupkg names have none).
- [ ] The build log says `[prune] CUDA backends: KEEP` (or `DROP`, if you chose
      that for this release).

### CUDA backends

`node-llama-cpp` ships CUDA backends for NVIDIA GPUs
(`@node-llama-cpp/win-x64-cuda` and `-cuda-ext`, about 540 MB unpacked).
`getLlama()` (`src/main/llamaBackend.ts`, `gpu: 'auto'`) tries CUDA only when it
detects CUDA on the machine, and a missing backend falls through to Vulkan and
then the CPU. So a build without them still works everywhere, but NVIDIA users
run local models on Vulkan or the CPU instead of CUDA.

Keeping or dropping them is a choice made **per build**. It is not a property
of the machine that runs the build. (The old prune dropped them from every
build because the build machine has an AMD GPU, so every release shipped
without CUDA.)

| How | Effect |
| --- | --- |
| nothing | **keep** (the default, and what a release should normally do) |
| `--keep-cuda` / `GUM_CUDA=keep` | keep, explicitly |
| `--drop-cuda` / `GUM_CUDA=drop` | drop them from this build only (~540 MB smaller unpacked) |
| `GUM_KEEP_CUDA=1` | the old spelling of keep, still honoured |

A flag beats the variable. Any other `GUM_CUDA` value, or both flags at once,
fails the build instead of guessing. When a build that makes an installer or zip
drops them, `package-app.cjs` prints a warning. `npm run package:win` (the local
portable build for the owner's AMD machine, no installer) passes `--drop-cuda`
explicitly; `make`, `publish` and `package:installer` never do
(`pruneCudaChoice.test.ts`).

Example, a deliberately CUDA-less installer:

```powershell
node tools/package-app.cjs --installer --drop-cuda
```

### Installer animation

`Setup.exe` shows `assets/installer-loading.gif` while it installs
(`MakerSquirrel` `loadingGif`). It is generated offscreen from `assets/icon.png`
by `node tools/make-installer-gif.cjs`, with the `ffmpeg-static` binary the app
already depends on, and committed, so a build never needs ffmpeg. Rerun it when
the icon changes. The script fails rather than write a GIF over 400 KB.

### Squirrel hook budget

Squirrel launches the app with `--squirrel-install`, `--squirrel-updated`,
`--squirrel-uninstall` or `--squirrel-obsolete` and gives each launch about 15 s
to exit. Inside that time the app has to create the shortcuts and register the
file associations (or, on uninstall, remove them, the sign-in entry and the
OS-hotkey helper).

The process starts at `src/squirrelEntry.ts` (`package.json` `main` is
`.vite/build/squirrelEntry.js`). It imports only `electron`, Node builtins and
`src/main/squirrelEvents.ts`. A lifecycle launch is handled there and the
process exits without loading the app bundle. Every other launch `require`s the
`main.js` beside it. `squirrelEntryGraph.test.ts` checks the import graph. It
also builds the entry with Forge's own Vite config (one chunk, at most 16 KB,
requiring only `electron` and builtins) and checks the wiring.

Measured 2026-10-13 on the owner's machine, from a production build with
`electron <build> --squirrel-install 1.0.1`, a scratch profile and the steps
stubbed (no Update.exe, no reg.exe). Medians of 7 runs, in ms from spawn:

| Entry | JS starts | First hook step | Process exits |
| --- | --- | --- | --- |
| `src/main.ts` (before) | 133 | 440 | 629 |
| `src/squirrelEntry.ts` (now) | 135 | 137 | 153 |

Loading the app bundle cost about 305 ms on a warm cache before the hook could
start. The entry now reaches the hook 2 ms after JS starts. What is left is
Electron's own start, which varies a lot with the launching environment: the
same runs launched from Git Bash took about 1,050 ms to reach JS. An attempt to
measure with a cold file cache (streaming 4 GB of unrelated files through it
first) gave the same numbers, so it did not actually make the cache cold.

The timeouts in `squirrelEvents.ts` add up to exactly 15 s per event:

| Part | Install / update | Uninstall |
| --- | --- | --- |
| Start-up allowance (`ENTRY_STARTUP_ALLOWANCE_MS`) | 2,500 | 2,500 |
| Update.exe `--createShortcut` / `--removeShortcut` | 4,500 | 4,500 |
| `reg import` | 7,000 | 3,500 |
| Stop the OS-hotkey helper (PowerShell) | - | 2,000 |
| Two `reg delete`s of the sign-in entry | - | 1,500 |
| Exit margin (`HOOK_EXIT_MARGIN_MS`) | 1,000 | 1,000 |
| **Total** | **15,000** | **15,000** |

The old budget gave the steps 13 s (install) and 14 s (uninstall). That left
1 to 2 s for Electron's start and the whole app bundle together. The allowance
is now twice the slowest measured start plus headroom. The headroom is for a
cold first install, where antivirus scans the freshly unpacked `electron.exe`
before it runs. Every step normally finishes in well under a second, so the
timeouts only matter on a slow or heavily scanned machine.

Still to do on a clean VM (owner, step 5):

- Time a real first install from a cold boot with Defender on.
  `%LOCALAPPDATA%\SquirrelTemp\SquirrelSetup.log` records when the hook starts
  and ends.
- Confirm that the desktop and Start-menu shortcuts and the "Open with Gum"
  entries appear. Do the same for an uninstall.
- If Electron's own cold start there is anywhere near 2.5 s, lower
  `REG_IMPORT_TIMEOUT_MS` before raising the allowance. Keep the budget test in
  `squirrelEvents.test.ts` green.

## 4. Publish

1. Create a GitHub release tagged `v<version>` (not a pre-release: the feed and
   the update check both follow `releases/latest`, which skips pre-releases).
2. Upload, as release assets:
   - [ ] `Gum-<version> Setup.exe`
   - [ ] `RELEASES`
   - [ ] `jp_study_app-<version>-full.nupkg`
   - [ ] `jp_study_app-<version>-delta.nupkg` (when it was built)
   - [ ] the portable zip, if one was built (`--zip`), for people who do not install
3. Release notes: the first bullet points become the in-app summary; an
   `extension: x.y.z` line announces a new Chrome extension version
   (`parseExtensionVersionFromBody`). Settings -> Help -> Updates shows the notes
   as plain text, on request.
4. Publish. Uploading the assets BEFORE publishing matters: the moment the
   release is public, `releases/latest/download/RELEASES` points at it.

## 5. Verify N -> N+1

- [ ] On a machine with the previous version installed: Settings -> Help ->
      Updates -> "Check now". It should go Checking -> Downloading -> "Gum <new>
      has downloaded" with a "Restart to update" button (also offered as a toast
      and in the notification center).
- [ ] Restart to update. Gum quits, Squirrel swaps `app-<old>` for `app-<new>`
      and relaunches (`--squirrel-updated` re-registers the file associations).
      This must work with "Keep running in the tray" on: the restart flags the
      app as quitting first (`markQuitting`), so the tray close handler does not
      swallow it.
- [ ] Help -> Updates now shows the new version and "up to date".
- [ ] `%LOCALAPPDATA%\jp_study_app\packages\` shows the delta was used when one
      was published (`SquirrelSetup.log` names the package it applied).
- [ ] First install on a clean VM: `Setup.exe` shows the Gum animation, and the
      desktop shortcut, the Start-menu shortcut and the "Open with Gum" entries
      appear. Uninstall removes them again (see "Squirrel hook budget" above).

## 6. Clean up

- [ ] Delete `out/` (`Remove-Item -Recurse -Force out`): it holds several GB.

## Notes

- An automatic check is skipped while Windows reports a metered connection
  (`src/main/meteredConnection.ts`), because on Squirrel a check is also the
  download. "Check now" always proceeds.
- Squirrel.Windows reports no byte progress through Electron's `autoUpdater`;
  the panel shows an indeterminate bar and the elapsed time.
- The update feed URL is pinned by `src/main/__tests__/squirrelFeed.test.ts`,
  together with the `remoteReleases` value in `forge.config.ts`.
