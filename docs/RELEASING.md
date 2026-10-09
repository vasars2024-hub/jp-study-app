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
- [ ] Tests and guards green: `node tools/i18n-check.cjs`,
      `npx tsc --noEmit -p tsconfig.json`, `npx vitest run`.

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
pruned app. The output is in `out/make/squirrel.windows/x64/`:

- `Gum-<version> Setup.exe` - the installer for new users
- `RELEASES` - the feed index installed copies read first
- `jp_study_app-<version>-full.nupkg` - the full package
- `jp_study_app-<version>-delta.nupkg` - only when a previous release was synced

Check before uploading:

- [ ] `RELEASES` lists the new full package, and the delta when there is one
      (one line each: `<sha1> <file name> <size>`).
- [ ] The file names in `RELEASES` match the files exactly (GitHub keeps asset
      names as uploaded; spaces in `Setup.exe` are fine, the nupkg names have none).

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
