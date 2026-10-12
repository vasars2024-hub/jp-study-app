# Testing a real update in a VM

The headless E2E flow (`npm run e2e -- --flows=updates`) drives the whole update
path against a fake feed: the release check, Gum's own download with byte
progress, a dropped connection resumed with a Range request, Cancel and Resume,
the SHA1 check, the hand-off of the staging folder, the restart guard, the
release notes and "What's new". What it cannot do is run the real `Update.exe`
on a real installed copy: the harness uses a stand-in
(`src/main/updateHarnessSquirrel.ts`), and nothing on the development PC may
touch the installed Gum. This page is the owner's checklist for the one thing
left: a signed (or unsigned) installer upgraded in place, on a clean Windows VM.

Run it before the first release that ships Gum's own downloader, and again when
anything in `src/main/updateDownloader.ts`, `squirrelUpdater.ts` or
`forge.config.ts`'s Squirrel maker changes.

## What is being proven

1. An installed copy of version **N** finds release **N+1** on GitHub.
2. Gum downloads `RELEASES` and the package itself, showing real bytes, and
   Cancel / Resume work against GitHub's asset storage (it answers Range
   requests with `206`).
3. The SHA1 and size in `RELEASES` are checked, and the verified package is
   staged in `%LOCALAPPDATA%\jp_study_app\packages\gum-staged\`.
4. **Update.exe accepts that local folder as its release source**
   (`--checkForUpdate` / `--update <folder>`), copies the package into
   `packages\`, unpacks `app-N+1\`, and Electron reports `update-downloaded`.
   This is the step no automated test can cover.
5. "Restart to update" lists unsaved work, then restarts into N+1, which
   records the update in **Update history** and shows **What's new** once.

## 0. What you need

- A Windows 10 or 11 VM (Hyper-V, VirtualBox or VMware) with a clean snapshot
  you can roll back to. 8 GB RAM and 20 GB free disk are plenty.
- Internet access in the VM (it talks to github.com).
- On the build PC: two builds of Gum with different versions, built with
  `npm run package:installer` (see `docs/RELEASING.md`). Call them **N** (for
  example `1.0.2`) and **N+1** (`1.0.3`).
- A GitHub repository you can publish test releases to. Use a **fork** or a
  scratch repo, not `vasars2024-hub/jp-study-app`: a test release in the real repo
  is offered to every installed user on the beta channel, and to everyone if it
  is not marked as a pre-release. If you must use the real repo, publish N+1 as a
  **draft** first (drafts are never offered), and switch to "pre-release" only
  for the minutes the test takes, on the VM's Beta channel.

> The release feed is compiled in (`GITHUB_OWNER` / `GITHUB_REPO` in
> `src/shared/release.ts`). For a fork, change those two constants in a local
> branch before building **both** N and N+1, and do not merge that change.

## 1. Build the two versions

On the build PC, in the repo:

```powershell
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
# Version N
npm version 1.0.2 --no-git-tag-version
$env:GUM_SQUIRREL_DELTA = 'off'          # the first test: full package only
npm run package:installer
Copy-Item -Recurse out\make\squirrel.windows\x64 C:\gum-test\N
# Version N+1
npm version 1.0.3 --no-git-tag-version
npm run package:installer
Copy-Item -Recurse out\make\squirrel.windows\x64 C:\gum-test\N1
git checkout -- package.json package-lock.json
```

Each folder holds `Gum-<version> Setup.exe`, `RELEASES` and
`jp_study_app-<version>-full.nupkg`. Write down the SHA1 that `RELEASES` names
for N+1 (`Get-Content C:\gum-test\N1\RELEASES`) and check it matches the file:

```powershell
(Get-FileHash -Algorithm SHA1 'C:\gum-test\N1\jp_study_app-1.0.3-full.nupkg').Hash
```

### Signing

With a certificate, set `GUM_WIN_CERT_FILE` / `GUM_WIN_CERT_PASSWORD` for both
builds (`docs/RELEASING.md` step 1). Check each output:

```powershell
Get-AuthenticodeSignature 'C:\gum-test\N1\Gum-1.0.3 Setup.exe' | Format-List Status, SignerCertificate
```

`Status` must be `Valid`. Squirrel itself does not check Authenticode on an
update package — integrity comes from the SHA1 in `RELEASES`, which Gum checks
before the hand-off and Update.exe checks again after its copy. Signing matters
for SmartScreen and antivirus, not for the update's integrity.

## 2. Install version N in the VM

1. Restore the clean snapshot. Copy `C:\gum-test\N\Gum-1.0.2 Setup.exe` into the VM.
2. Run it. **SmartScreen**: an unsigned (or newly signed, no reputation yet)
   `Setup.exe` shows "Windows protected your PC". Note exactly what it says,
   then choose *More info → Run anyway*. A signed build shows the publisher name
   on that page; an EV-signed one usually shows no warning at all.
3. Gum starts after install. Settings → Help → Updates must say
   **Copy: Installed (updates itself)** and **Version 1.0.2**.
4. Check the layout: `%LOCALAPPDATA%\jp_study_app\` has `Update.exe`,
   `app-1.0.2\`, and `packages\RELEASES` naming `jp_study_app-1.0.2-full.nupkg`.
5. Take a VM snapshot here ("N installed"), so each test below can start again.

## 3. Publish the test release N+1

1. In the test repository: *Releases → Draft a new release*, tag `v1.0.3`.
2. Attach **all three** files from `C:\gum-test\N1\` (and the zip if you have one).
3. Write release notes that exercise the renderer, for example:

   ```markdown
   ## Update test
   - **Bold**, *italic* and `code`
   - [An issue in this repo](https://github.com/<owner>/<repo>/issues/1)
   - [Somewhere else](https://example.com/)
   <script>alert("must show as text")</script>
   ```

4. Publish it as the **latest release** (stable test), or tick **pre-release**
   and use the Beta channel in Gum (beta test).
5. From the build PC, confirm GitHub serves the feed:

   ```powershell
   (Invoke-WebRequest 'https://github.com/<owner>/<repo>/releases/latest/download/RELEASES').Content
   Invoke-WebRequest -Method Head -Headers @{ Range = 'bytes=0-' } 'https://github.com/<owner>/<repo>/releases/download/v1.0.3/jp_study_app-1.0.3-full.nupkg' | Select-Object StatusCode
   ```

   The first prints the `RELEASES` line; the second must print `206` (Range
   support, which Resume relies on).

## 4. Check, download, cancel, resume

In the VM, in Gum 1.0.2: Settings → Help → Updates.

1. Press **Check now**. Within a few seconds: *Preparing to download Gum 1.0.3…*,
   then *Downloading Gum 1.0.3* with a filling bar and `x% · a MB of b MB`.
   The total must match the nupkg's size on the release page.
2. At about 30 %, press **Cancel download**. The panel says the download is
   paused and how much is kept. Check
   `%LOCALAPPDATA%\jp_study_app\packages\gum-staged\` holds
   `jp_study_app-1.0.3-full.nupkg.partial` of about that size.
3. Quit Gum completely (tray → Quit), start it again, open the panel: it must
   not resume on its own. Press **Check now** (labelled **Resume download** if
   the panel still shows the pause). The bar must start near where it stopped,
   not at 0.
4. Optional, network drop: start a fresh download, then disconnect the VM's
   network adapter for ~10 s and reconnect. The download continues from where
   it was (it retries three times over about 20 s); if it gives up, the panel
   says so, and **Try again** continues from the kept bytes.
5. When the bytes are complete: *Checking the download…*, then *Unpacking Gum
   1.0.3 in the background…* (that is Update.exe working), then **Gum 1.0.3 has
   downloaded. Restart to finish updating.**
6. Verify on disk: `%LOCALAPPDATA%\jp_study_app\app-1.0.3\` exists,
   `packages\RELEASES` now names 1.0.3, and `packages\gum-staged\` is gone (Gum
   clears it after Update.exe has copied the package). Squirrel's own log is
   `%LOCALAPPDATA%\jp_study_app\SquirrelSetup.log`; Gum's is Settings → Help →
   Diagnostics (lines tagged `update`).

If step 5 ends in an error instead: copy the last 50 lines of
`SquirrelSetup.log` and the Diagnostics `update` lines. *"Update.exe found
nothing to apply"* or an Update.exe error right after *Unpacking* means
Update.exe did not accept the local folder — that is the one assumption this
test exists to check; report it before shipping.

## 5. Restart guard, restart, verify

1. Open a saved note (Files → a note → Open → Edit) and change a word without
   saving. Open a card's AI extras edit box in the deck panel, or start a review
   and answer one card.
2. Press **Restart to update**. The panel must refuse and list each one
   ("a note you are editing that is not saved yet", …), with **Restart anyway**
   and **Not now**. Press **Not now**; nothing restarts.
3. Do the same from a pop-out window (pop the Flashcards section out, start a
   review there): the warning must list the review too. Close the pop-out and
   press Restart again: the review is no longer listed.
4. Save or cancel the edits, then **Restart to update**. Gum quits and starts
   1.0.3 within a few seconds.
5. Settings → Help → Updates: **Version 1.0.3**; **Update history** shows
   *Gum 1.0.3, updated from 1.0.2 on <today>* · running now; the notification
   center has *Gum was updated to 1.0.3* once; the **What's new in Gum 1.0.3**
   card is at the top. *Show what's new* renders the notes: heading, bold,
   italic, code; the `<script>` line is plain text; only the link into the
   repository is a link, and clicking it opens the default browser on GitHub;
   the other link shows as text with its address. *Dismiss* removes the card,
   and it does not come back after another restart.
6. Start menu and desktop shortcuts still start Gum; file associations
   (an `.epub` double-click) still open in it.

## 6. Deltas (when two Squirrel releases exist)

Repeat steps 1–5 with `GUM_SQUIRREL_DELTA` unset for N+1 so the build writes a
`-delta.nupkg`, attach it too, and install N from its own release first. The
panel should say *Downloading the changes for Gum 1.0.3 (a delta update)* with a
much smaller total. Also test a copy **two** versions behind: the older delta is
not attached to the latest release, so Gum must fall back to the full package by
itself (the panel then shows the full size).

## 7. Clean up

- Delete the test release and its tag (or the whole scratch repo).
- Roll the VM back to the clean snapshot.
- On the build PC, `git status` must show no leftover version bump.

## Notes

- **Where files go**: the download is staged under Squirrel's own
  `%LOCALAPPDATA%\jp_study_app\packages\gum-staged\` (local, never the roaming
  profile), next to where Update.exe keeps its packages. It needs about three
  times the package size free (the package, Update.exe's copy, the unpacked
  app); Gum checks before it starts.
- **Metered connections**: automatic checks skip a metered connection; *Check
  now* does not. Test that once with the VM's adapter set to metered.
- **SmartScreen** applies to `Setup.exe` (first install). An in-place update
  runs `Update.exe` and the new `jp-study-app.exe`, which SmartScreen does not
  prompt for, but antivirus may scan; an unsigned `Update.exe` is a known
  quarantine trigger for some products (`docs/RELEASING.md`).
- **Never** test against `C:\Users\<you>\Apps` or your own `%APPDATA%\jp-study-app`
  on the development PC: the VM is the only place a real update runs.
