# Media cluster, re-probed — the workspace works, and F15 is worse than recorded

**Driven 2026-08-04 by the orchestrator, solo.** Fresh scratch profile
(`%TEMP%\jp-audit-consent-timeline`), consent **declined**, sidecar left at its **true default**.
Real profile untouched: newest write still `8/2/2026 9:40:03 AM`. Clean shutdown — 0 electron,
**0 seanime** processes, `bridge.json` gone.

This pass closes the `Video / Music / Study Mode 0/3` coverage gap, and corrects three things this
audit had wrong — two of them mine.

---

## 1. CORRECTION — `SEANIME_SIDECAR` is ON by default, and has been since 2026-07-31

The master document listed Video/Music/Study Mode as *"need `SEANIME_SIDECAR=1`"*, and
`FINDINGS_MEDIA.md` caveated F15 with *"with `SEANIME_SIDECAR` unset the workspace genuinely can't
run."* **Both are false.**

`src/shared/seanime.ts:44-48`:

```ts
export function seanimeSidecarEnabledFrom(raw: string | undefined): boolean {
  const value = raw?.trim().toLowerCase();
  if (!value) return true;                       // unset → ENABLED
  return !SEANIME_SIDECAR_OPT_OUT_VALUES.includes(value);
}
```

`CURRENT_STATE.md:179` records the flip: *"2026-07-31 — SEANIME_SIDECAR IS ON BY DEFAULT."* Rollback
is `SEANIME_SIDECAR=0`.

The header also states the consequence exactly: *"Turning this on does not spawn anything at boot …
the only effect is that the initial status is `stopped` rather than `disabled` and the media surface
becomes reachable."*

So `Media workspace stopped` on a fresh profile is **not** a disabled feature. It is an enabled,
reachable workspace that nothing has started yet. That makes F15 worse, not better: an honest and
actionable message was available, and the app makes a false claim instead.

## 2. The workspace is `LIVE` — driven end to end

The tray launcher is a real control: `<button class="seanime-host-launcher" data-sidecar="stopped">`.
Clicking it started the sidecar.

| After the click | |
|---|---|
| Status | `Seanime sidecar · ready` |
| Host | `MEDIA WORKSPACE — Adopted library · sidecar ready` |
| Views | `Open local video` · `Library` · `Readiness` · `Review` · `Close` |

All three views switch correctly, verified by `aria-pressed` rather than by eye — clicking `Library`
left the node count at 135 and the visible text unchanged, which reads exactly like a dead control.
It is not: `Library` carried `aria-pressed="true"`, `Readiness`/`Review` `"false"`. The body is empty
because a fresh profile has no media. **A view whose content is empty is not a view that did not
switch** — and `BrowserView`/`WebContentsView` appear nowhere in `src/main/**`, so the absence was
not an out-of-DOM host either.

### Study Mode — `LIVE`, and the honesty counter-example

`Readiness` renders **STUDY MODE**:

> *"Unified library readiness. Every file the media server knows about, and what each one still needs
> before it can be studied. … **The media server has no files yet. Set a library folder in the media
> server and run a scan. Nothing can be prepared until it has scanned at least one file.**"*

`Review` renders **WATCH TO REVIEW** — *"Nothing mined yet. Mine a line while watching and it appears
here with its review state."*

Both state their own emptiness, the cause, and the remedy. **Same app, same feature area, opposite
standard from the Media window.** That contrast is the finding, not the copy.

---

## 3. F15 — CONFIRMED, with the mechanism, and it is unconditional

`MediaWorkspaceSectionView.tsx` branches three ways and only three:

| `availability` | Renders |
|---|---|
| `pending` | `null` |
| `unavailable` | `mediaWorkspace.section.legacyFallback` + `MediaCenterView` |
| **anything else** | **`mediaWorkspace.section.open`** — *"The media workspace is open in front of this window."* |

`mediaWorkspaceAvailability.ts:35` resolves availability as `status?.kind !== 'disabled'`, and its
own comment at `:49-52` names the gap:

> *"`disabled` is the only kind that means 'there is no workspace on this machine'. `stopped`,
> `starting`, `offline` and `failed` are all states of a sidecar that exists, and the host renders
> its own explanation for each."*

So **four states** — `stopped`, `starting`, `offline`, `failed` — resolve to `available` and get the
"is open in front of this window" text. There is no branch for *exists but is not running*.

**Reproduced in the strongest possible form.** After starting the workspace and then clicking its own
`Close` button, both open windows read:

```
Media   ⧉ ─ ▢ ×   The media workspace is open in front of this window.  Bring it forward
Video   ⧉ ─ ▢ ×   The media workspace is open in front of this window.  Bring it forward
```

The user closed the workspace one action earlier, and two windows assert it is open in front of them.
The text is byte-identical before the sidecar started, while it ran, and after it was closed — it is
not a stale render, it is unconditional.

**The app already owns honest copy for this.** `catalogs/en.ts` has
`mediaWorkspace.resumeLast.unavailable` = *"The media server is off, so there is nothing to resume
into."* and `…section.legacyFallback` = *"The media server is disabled …"*. The vocabulary exists; the
section has no branch that reaches it.

**Why this is now the default experience:** before 2026-07-31 the flag was off, so a normal install
sat in `unavailable` — the honest branch. The default flip moved every fresh install into the branch
that makes the false claim. The defect was *created* by that flip, and the copy was written when
`disabled` was the common case.

**Fix:** one branch in `MediaWorkspaceSectionView.tsx`, keyed on `SeanimeStatus.kind`, reusing copy
that already exists and is already translated.

---

## 4. CORRECTION TO MY OWN CORRECTION — `MediaCenterView` mounts once, for Music

`FINDINGS_MEDIA.md` withdrew the `UI_UX_AUDIT.md` triple-mount claim on the grounds that
*"`.mc-root` is 0 — it does not mount at all."* **That measurement was inadequate**: only the Media
window was open.

With all three open simultaneously:

| App | Window content | `.mc-root` |
|---|---|---|
| Media | 85 chars — the false claim | — |
| Video | 85 chars — the false claim | — |
| **Music** | **831 chars — full Media Center** | **1** |

`MediaCenterView` mounts **exactly once, and only for Music** — not three times, and not zero. The
"three simultaneous mounts" claim is refuted by an adequate test rather than an accidental one; my
stated reason for withdrawing it was wrong even though the withdrawal was right.

This matches `progress.json`, which records that deleting the legacy player *"cannot be done without
keeping `MediaCenterView` for music."* Music is the surviving consumer.

**Consequence for `BOXES` B4.** The `--mc-*` second design system (134 hex / 429 rgba literals) is
reachable on the default path through **one** app, not the media cluster generally.

### Music — `LIVE` and honest

Nav: Home / Music / Study Mode / Discover. Player, synced-lyrics pane, queue, `0 tracks`. Empty
state: *"No audio in your media library yet. Add songs (mp3, flac…) in the Media app or its watch
folder."*

One handoff caveat: that instruction points at the **Media app**, which — when the sidecar is not
running — is the stub that claims the workspace is already open. The instruction is only actionable
once the workspace has been started, which is the same F15 root cause.

---

## 5. Coverage after this pass

| Surface | Before | Now |
|---|---|---|
| Media | driven | driven |
| Video | **0** | driven — same stub as Media |
| Music | **0** | driven — `MediaCenterView` `LIVE` |
| Study Mode | **0** | driven — `LIVE`, via two routes (workspace `Readiness`, and Music's nav) |
| Workspace views | — | 3/3 driven (`Library`, `Readiness`, `Review`) |

`Open local video` was **not** driven — it opens a file picker, which would require choosing a real
file from the user's disk. Recorded as `NOT-REACHABLE — would require the user's own media`, not as
a gap.
