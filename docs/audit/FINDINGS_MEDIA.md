# Media / Study Mode — driven live

**Run:** 2026-08-04 06:47 by the orchestrator, fresh scratch profile, `SEANIME_SIDECAR` **not**
set (a normal user's configuration). App shut down cleanly; `%APPDATA%\jp-study-app` never opened.

---

## M1 — The Media app states something false, and the contradiction is on screen at the same time

`Media` is one of the 24 apps in the Start menu. Opening it produces a **17-node window** whose
entire content is:

> **"The media workspace is open in front of this window."**  `[ Bring it forward ]`

Meanwhile, on the same screen, `.seanime-host-launcher` reads:

> **"Media workspace stopped"**

Both measured in a single evaluation:

| element | text |
|---|---|
| `.media-workspace-section-text` | `The media workspace is open in front of this window.` |
| `.seanime-host-launcher` | `Media workspace stopped` |
| `.mc-root` | **0** |

**The workspace is stopped. The window says it is open and in front.** There is an honest thing
available to say here — *the media workspace isn't running* — and the app says a false thing
instead.

**Verdict: `BROKEN` (Probe D).** Tier 0, because the user is told something demonstrably untrue
and the refutation is visible in the same viewport.

## M2 — `MediaCenterView` is not mounted at all, which refutes a standing claim

`document.querySelectorAll('.mc-root').length` is **0**, with Media open and after the control was
clicked.

`UI_UX_AUDIT.md` records that `MediaCenterView` **mounts three times** simultaneously (Media,
Video and Music each rendering a complete copy — three sidebars, three player bars, three
`useMedia` polls), and this audit carried that forward into the FIX register as a performance and
correctness item.

**In this build it does not mount once.** The architecture changed underneath the record. The
triple-mount item should be **withdrawn, not re-tested** — and its withdrawal is itself a
`PROMISE_REGISTER` row, since the audit doc still asserts it.

> Measured with the scope discipline this session had to learn three times: `/health` confirms a
> single Electron window (no pop-out holding the content), and the node count is 110–122 with the
> window open against 87 for an empty desktop, so nothing large rendered elsewhere.

## M3 — "Bring it forward" is not dead, and that is worse than dead

| | before | after |
|---|---|---|
| `.mc-root` | 0 | **0** |
| DOM nodes | 110 | 122 |
| `.seanime-host-launcher` text | `Media workspace stopped` | **`` (empty)** |
| main window focused (`/health`) | true | **false** |
| Media window claim | *"open in front of this window"* | **unchanged** |

The control has real effects — it clears the launcher's status text and drops the main window's
focus — but **no workspace appears, and the false claim survives the click.**

So the state message is *erased* rather than corrected: after clicking, the launcher no longer
says "stopped", and nothing says anything. A user is left with a window asserting the workspace is
in front of them, an empty tray indicator, and no workspace.

**Verdict: `BROKEN` (Probe A).** Not `DEAD` — an observable effect occurred — but the effect is
incoherent with what the control promises.

**The honest caveat, stated because it changes what the fix is:** with `SEANIME_SIDECAR` unset the
workspace genuinely *cannot* run. **The defect is not that it fails — it is that the UI claims
success instead of explaining unavailability.** That is a copy-and-state problem, not a media
problem, and it is fixable without touching the sidecar.

## M4 — `.seanime-host-launcher` layering confirmed still open

`position: fixed; z-index: 9998`, measured. This was reported previously as covering other
windows' content and deliberately left alone because the layering call belonged to another track.
**It is unchanged.** With the whole app's z-scale living in `--z-shell-*` tokens
(`renderer/theme/tokens.css`), a hardcoded 9998 sits outside the system by construction.

---

## Coverage

| Area | visited / enumerated |
|---|---|
| Media app window | 1 / 1 |
| `.mc-root` instances | 0 found (claim was 3) |
| Media-adjacent controls driven | 1 / 1 (`Bring it forward`) |
| Video / Music / Study Mode surfaces | **0 / 3 — NOT REACHED** |

**Not probed:** the Video and Music apps, and Study Mode itself. With `.mc-root` at 0 and the
workspace stopped, the surfaces those apps would render do not exist in this configuration; a
meaningful pass needs `SEANIME_SIDECAR=1` and a populated library, which is a different run.

## Method note — my own probe repeated the async trap

Clicking `.os-start-btn` and querying `.os-start-app` **in the same synchronous expression**
returned no apps, and I briefly read that as "the app is not in the menu". React had not rendered
the menu yet. Separating the click and the query into two calls found all 24 apps immediately.

That is the same defect that cost P1 two would-be findings and that this session has now hit in
three forms. **The click and the assertion must never share an evaluation.**
