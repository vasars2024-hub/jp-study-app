# WIRED ARCHIVE — Bespoke Depth Specification

Implementation-grade successor to `secret_terminal_mode_master_prompt.md`. That document set the fiction; this one maps every app, widget, animation, and sound to the actual code so the mode goes from "consistent terminal skin" to "every surface is a different instrument inside the same classified 1999 linguistic-analysis network."

North star unchanged: cold blue CRT glow, mechanical panels, strange network presence. Every study feature is decoding, memory sync, or archive reconstruction. Never neon cyberpunk, never vaporwave. Calm blue baseline; amber = attention; red = rare emergency.

Non-negotiable constraints:

- The app must stay genuinely usable for study. Fiction decorates function, never hides it.
- Every animation respects `prefers-reduced-motion`, `data-wired-crt='clean'`, and `data-wired-static='reduced'`.
- Every sound goes through `soundEngine` (mutable, volume-controlled) — no rogue `Audio` elements.
- All user-visible chrome strings go through `t('wired.*')` keys (en/ja/zh/ru), per CLAUDE.md. All-caps fiction codes (`NODE`, `TC 00:12:44`, module IDs) are content-neutral and may stay literal.
- Palette is locked: cyan `#6df1ff` / `rgba(109,241,255,α)`, amber `#ffb13b` / `rgba(255,177,59,α)`, red `#df2732` (danger only), text `#d8fbff`→`#e9feff`, pale amber `#fff1b7`, panels `rgba(0–2, 8–18, 13–27, α)`. No new hues.

---

## 0. Architecture fix first (everything else depends on it)

**Discovery from exploration:** wired mode renders the *classic* DOM trees, not the aero ones. Views with `if (aero)` forks (Grammar, Translate, Statistics, Immersion, Flashcards, Library, Resources) only produce `aero-*` markup under aero. Consequently:

- Existing `wired-apps.css` rules targeting `aero-immersion-*` and the `aero-*-chrome` header stamps of forked views are **dead CSS** under wired.
- GrammarView, TranslateView, StatisticsView classic paths return bare roots — **no AppChrome at all** under wired (no menubar/statusbar/module frame).

**Decision: keep the classic trees as the wired skeleton** (do NOT flip aero gates to `aero || wired`). Rationale: the aero workbenches are drenched in glass/light-surface styling that fights the terminal look; classic trees are plainer scaffolds, ideal for instrument panels; and touching aero gates risks regressing the finished aero mode.

Work items:

1. `components/ui/AppChrome.tsx` already renders for wired (`ui-app-chrome--wired`, `data-app-material="wired"`). Wrap the classic returns of `GrammarView`, `TranslateView`, `StatisticsView` in `<AppChrome>` (pattern: copy how MediaView wraps unconditionally). Status bar fields become fiction: `SYN / PARSE UNIT READY`, row counts, timestamps.
2. In `wired-apps.css`, re-point every dead selector to classic classes: `aero-immersion-*` → `immersion-*`, and add `.gram-view`, `.tr-view`, `.stats-view`, `.flash-view`, `.library`, `.res-view` stamps alongside the existing `aero-*-chrome` ones (keep both — harmless, and MediaView/AnkiView/Dictionary do render their `aero-*-chrome` class under wired).
3. New JSX is gated with the already-existing-but-unused `useWiredMaterials()` hook from `components/ui` — this is the sanctioned seam for wired-only components (oscilloscope, globe, decrypt overlays, boot lines in status bars).

---

## 1. Global motion language (shared keyframe library)

New file: `src/renderer/theme/wired-motion.css` (imported in `main.tsx` after `wired-shell.css`). All keyframes prefixed `wm-`. Universal rules:

- Nothing eases smoothly: use `steps()` timing or 2-frame holds. CRT hardware doesn't tween.
- Idle animations run ≥ 4s cycles at low opacity. The desktop must feel *alive but calm*.
- Every `animation` in this file gets a `:root[data-wired-crt='clean']` reduced variant and dies entirely under `prefers-reduced-motion` (single media block at file end, like `wired-shell.css` does today).

Core keyframes (reused everywhere):

| Keyframe | Motion | Used by |
| --- | --- | --- |
| `wm-scan-reveal` | `clip-path: inset(0 0 100% 0)` → `inset(0)` in 6 steps, brief bright line at the reveal edge (`box-shadow` pulse) | window open, panel mount, card reveal, notification arrival |
| `wm-scan-collapse` | inverse of reveal + `scaleY(0.02)` final frame (horizontal line snap) | window close/minimize, dismissing |
| `wm-type-in` | `width: 0→100%` with `steps(N)` on an `overflow:hidden` inline block + trailing `▌` block cursor via `::after` | title IDs, stamps, status text |
| `wm-relay-blink` | opacity 1→0.2→1 twice in 240ms, steps(1) | lamps, docking slots, active indicators |
| `wm-rail-pulse` | a 24px cyan gradient hotspot translating along X, steps(12) | taskbar pulse on app switch |
| `wm-phosphor-settle` | `filter: brightness(2.2) blur(1px)` → none in 3 steps | anything that just powered on |
| `wm-sync-wobble` | `transform: translateX(±1.5px) skewX(±0.4deg)` for 2 frames, once per 7–13s (staggered via `animation-delay`) | idle CRT surfaces (heavy CRT only) |
| `wm-decrypt-noise` | background-position jitter on a noise layer + `letter-spacing` collapse 0.4em→0 | flashcard/anki reveal |
| `wm-trace-draw` | `stroke-dashoffset` full→0, linear | SVG lines: parse trees, globe arcs, heatmap outline |
| `wm-gauge-sweep` | rotate needle −120°→target with 1 overshoot step back | VU meters, gauges |

---

## 2. Window lifecycle state machine (DesktopShell)

Today: `.fwin` mounts with a 0.14s `fwinIn` fade; close/minimize unmount instantly. Bespoke spec:

**State machine** — add `winAnim: Record<string, 'opening' | 'closing' | 'minimizing' | null>` state in `DesktopShell`. `openApp` sets `opening` (cleared after 620ms). `closeWin`/`minimize` set the phase, defer the actual state mutation via `setTimeout` (360ms; 80ms under reduced motion), then mutate. Classes land on the window root: `fwin-anim-opening` etc. Wired CSS drives visuals; aero/base keep their current instant behavior via shorter durations (aero can adopt its own polish later — the state machine is theme-neutral, purely additive).

**Open ("module powers on"), 620ms total:**
1. 0–120ms: taskbar slot for the section gets `wm-relay-blink`; `playSound('ui','window-open')` (existing cue).
2. 0–180ms: ghost frame — window renders border-only (`fwin-anim-opening` sets body `opacity:0`, border cyan at 0.7).
3. 180–460ms: body `wm-scan-reveal`.
4. 300ms: title runs `wm-type-in` (`.fwin-title` wrapped in a span — one-line change in the Window component).
5. 460–620ms: `wm-phosphor-settle`; wired status strip flips `…` → module `ready` text (`fwin-wired-status` already renders `wiredModule(section).ready`).

**Close ("power down"), 360ms:** status strip prints `UNMOUNTING…` → `wm-scan-collapse` → 1px horizontal line → gone. Existing `window-close` cue. Bulletin log line `MODULE <CODE> UNMOUNTED` (see §4).

**Minimize ("cartridge dock"), 360ms:** `wm-scan-collapse` toward the taskbar (transform-origin bottom) + the taskbar `os-task-win.min` slot blinks once. Existing `minimize` cue.

**App switch:** focusing a window sends `wm-rail-pulse` across `.os-taskbar` (a `::before` overlay animated once — retrigger by toggling a `data-pulse` attribute in the focus handler). New sound cue `route` (§8).

---

## 3. Taskbar: machine rail completion

Current wired taskbar is styled but static. Add:

- **Lamp cluster** (`.os-tray` area): three 4px lamps (cyan=link, amber=pending notifications, red=error present), tiny DOM addition in DesktopShell's tray, driven by NotificationCenter unread state. Amber lamp runs `wm-relay-blink` while unread > 0.
- **Spinning wireframe globe** — new component `components/shell/WiredGlobe.tsx` (wired-gated): 40×40 SVG, 3 latitude ellipses + 4 longitude paths, `rotate` via CSS 12s steps(48); occasional arc route drawn with `wm-trace-draw` when a notification arrives or Immersion is open. Mount in tray. Reuse path helpers from `components/shell/aeroWorldPath.ts` if the projection fits; otherwise inline the 7 paths.
- **Clock resync flicker**: `.os-clock` gets a 9s-interval 2-frame flicker (`wm-sync-wobble` variant); seconds shown as `HH:MM:SS ▮`.
- **Workspace switch** (`LOCAL NODE`/`REMOTE FEED` buttons): on click, rail pulse + brief `ROUTING…` text swap (CSS `::after` on `.active`, 400ms).

---

## 4. Notifications: BULLETIN CHANNEL completion

`NotificationCenter.tsx` already renders wired meta chips (`wired-notif-meta`). Complete the teletype fiction:

- Toast arrival: `wm-scan-reveal` + body text `wm-type-in` (fast, 12 steps); priority edge pulse (cyan/amber/red border flash once). Cues: existing `notify`/`warning`/`error`.
- Each entry gets a monotonic dispatch code `TX-\d{4}` (session counter — render-time only, no persistence) shown in the meta row.
- Dismissing: entry collapses via `wm-scan-collapse` and the taskbar amber lamp blinks once ("archived to log").
- Window close/open events append passive log-only entries (`MODULE LEX MOUNTED`) — flag them `silent: true` so they never toast, only appear in the center. (Extend the notification store minimally; skip if the store resists — the fiction survives without it.)

---

## 5. Per-app bespoke specs

Each app: identity / signature look / signature motion / sound / hooks. All selectors scoped `:root[data-materials='wired']` in `wired-apps.css` unless a new component is named. Header stamps (`view-head::before`) already exist — kept, and re-pointed per §0.

### 5.1 Media — SIG-VID / Signal Archive
- **Look:** `.media-stage` becomes a CRT monitor: thick bezel (8px border + inner shadow), scanline overlay (done), plus corner brackets via `::before`/`::after` and a timecode strip: `.media-subbar` prefixed `TC` with tabular-nums. `.media-card` thumbnails: desaturated + cyan tint (`filter: saturate(0.4) sepia(0.2) hue-rotate(150deg)`), tape-label footer with a 3-char code. `.media-lib-folders` rows become tape-shelf entries (left index number via CSS counter).
- **Motion:** on video load/seek (`loadstart`/`seeking` events — tiny wired-gated effect in MediaView), stage shows 300ms static burst overlay (`wm-decrypt-noise`) = "signal acquisition". `.media-gen-bar-fill` becomes a segmented checksum bar (repeating-gradient hard stops).
- **Sound:** new cue `tape-seek` (§8) on library row click.

### 5.2 Music — AUD-DAT / Audio Deck
- **Look:** `.music-controls` becomes a hardware transport strip: square buttons, engraved labels, amber active states. `.music-seek`,`.music-volume` (native ranges): flat track, rectangular thumb, tick marks via repeating-gradient. `.music-row` list = DAT catalog (index numbers, duration right-aligned mono). Karaoke `.music-line.active`: phosphor-bright + glow; `.past` dimmed to 0.4.
- **New component:** `components/wired/WiredOscilloscope.tsx` — canvas, 96×28 logical px, subscribed to `playerBus` state; when playing, draws a synthesized Lissajous/sine composite (fake-driven by `time` — no Web Audio tap needed, deterministic and cheap); idle shows a flat line with occasional blip. Mounted (wired-gated) in `.music-nowplaying` and reused by the mini-player widget (§6). Respect reduced-motion: static waveform frame.
- **Sound:** transport clicks use existing `menu`/`confirm` cues.

### 5.3 Dictionary — LEX / Lexeme Analyzer
- **Look:** results as database records: `DictionaryResults` rows get a left metadata gutter (`LEX-`counter, frequency band) via CSS counters + existing tags. Search input already has `> probe`; add blinking block cursor to the empty state. Kanji glyphs boxed in grid cells with faint stroke-grid background.
- **Motion:** result rows materialize in chunks — `wm-scan-reveal` with `animation-delay: calc(var(--row-i, 0) * 40ms)`; set `--row-i` via `nth-child` for the first 12 rows (pure CSS).
- **Sound:** new cue `db-blip` on successful search (wired-gated, in the search submit handler).

### 5.4 Anki — MEM / Memory Sync (marquee moment #1)
- **Look:** `.anki-card` = sealed packet: header strip `ENCRYPTED PACKET / MEM-SYNC`, hex-dump watermark background (CSS repeating text via `::before` content, low opacity). `status-banner.ok/warn/bad` → `LINK STABLE / LINK DEGRADED / LINK LOST` stamps (i18n keys).
- **Motion:** **decrypt reveal** — when the answer shows, card face runs `wm-decrypt-noise` + `wm-scan-reveal` (280ms): noise layer fades as text letter-spacing collapses. Implement as a wired-gated `is-decrypting` class toggle where AnkiView reveals (single `useEffect` + `setTimeout`).
- **Sound:** new cue `decrypt` on reveal; `sync-ok` on submit.

### 5.5 Flashcards — SIM / Training Simulator (marquee moment #2)
- **Look (classic `flash-*` tree):** `.flash-card` same packet treatment as Anki. `.flash-actions` buttons get the sync-command labels (already specced: FAIL/RESYNC … EASY/STABLE — re-point from `flash-review-actions` to the real `.flash-actions` buttons `.flash-again`/`.flash-got`; with only 2 buttons use `FAIL / RESYNC` and `GOOD / STORED`). `.flash-progress-bar` = memory-stability waveform: segmented fill + amber tail segment. `.flash-strip-card` = cartridge chips. `.flash-done` = `MEMORY MAP UPDATED` stamp with `wm-phosphor-settle`.
- **Motion:** answer reveal = decrypt (shared with Anki); wrong answer = 2-frame amber shake (`wm-sync-wobble` variant, no red).
- **Sound:** `decrypt`, `sync-ok` (correct), `sync-fail` (dry unstable beep, §8).

### 5.6 Grammar — SYN / Syntax Diagnostic Unit
- **Look (classic `gram-*` tree, now AppChrome-wrapped per §0):** `.gram-item` rows = diagnostic register entries (code gutter `SYN-###`). `.gram-badge.lv-N` = clearance chips (cyan→amber scale by level, never red). `.gram-detail`/`.gram-card` = technical report: ruled sections, `.gram-ex-jp` example sentences boxed as "trace samples" with corner ticks.
- **Motion:** opening a detail: sections `wm-scan-reveal` staggered top-to-bottom (3 delays). Example sentences draw a left border via `wm-trace-draw`-style scaleY.
- **Sound:** `menu` cue on item select (existing).

### 5.7 Translate — TRN / Signal Translator
- **Look (classic `tr-*` tree, AppChrome-wrapped):** two panes become channel decks: `.tr-pane` headers `CH-A SOURCE` / `CH-B DECODED` (stamps via `::before`); `.tr-swap` = crossover patch button (rotates 180° stepped on click). `.tr-output` waits with a blinking cursor; while translating, shows `DECODING ▮▮▮▮▯▯` segmented progress (style `.tr-status` + `media-gen-dot`).
- **Motion:** output text arrives via `wm-type-in` on the first line + `wm-scan-reveal` for the block.
- **Sound:** `confirm` on completion (existing cue).

### 5.8 Statistics — TEL / Telemetry Command (marquee moment #3)
- **Look (classic `stats-*` tree, AppChrome-wrapped):** tiles done (prior session). Charts: `.stats-bar-track` = oscilloscope lanes (faint horizontal graticule via repeating-gradient); `.stats-bar-fill` cyan with hot top-cap line.
- **Motion:** **traces draw themselves** — bars grow from 0 to their inline height on mount: `transform: scaleY(0)→1` with `transform-origin:bottom`, steps(8), staggered per column (`nth-child` delays). Section enter = `wm-scan-reveal`. Streak value gets `wm-phosphor-settle` once.
- **Sound:** none (telemetry is silent; ambience carries it).

### 5.9 Calendar — OPS / Operations Schedule
- Mission grid shipped in the prior session (cells, ACTIVE stamp, amber today). Add: `.cal-chip` = op tags with priority tick `▸`; overdue (past-date `.cal-day-row`) amber left border; month cells get faint coordinate labels (`R{row}` via counters, dow header already amber). Week columns `wm-scan-reveal` on view switch.

### 5.10 Library — ARCH / Archive Bay
- **Look (classic tree):** `.lib-folder-chip` = disk-bay slots (rectangular, index number, active = inserted disk with amber lamp dot). `.card` covers: cyan-tinted duotone via `filter` + classification strip across the corner (`::after`, `RESTRICTED` at 8px). `.card-progress` = reconstruction meter (segmented). `.kind-badge` = format codes (`EPUB`→`DOC`, style only).
- **Motion:** grid cards mount with 2-frame stagger; opening a book = `tape-seek` cue + card flashes `MOUNTING…`.

### 5.11 Novels — DOC / Classified Text Viewer (list) + Reader
- **List (`jiten-*` tree):** table rows = recovered-document index: `jiten-row-cover` stamped `SCAN`, difficulty `nov-diff d-*` classes → clearance chips on the cyan→amber scale. Inspector (`jiten-inspector`) = analysis dossier: ruled, corner brackets, `jiten-tags` as metadata chips.
- **Reader (`NovelReader`):** *cooperate with its own theme system* — do not override `reader-stage` inline colors. Wired treatment frames only: `reader-bar`/`reader-footer` become terminal margins (mono, coordinates `L{page}`), `reader-seek` = document-buffer gauge, plus a 1px cyan frame around the scroller. Add one wired reader theme preset (`WIRED PHOSPHOR`: `#02070d` bg / `#d8fbff` text) to the reader `THEMES` list so users can opt the page itself in.

### 5.12 Resources — LINK / Uplink Directory
- **Look (classic `res-*` tree):** `.res-card` = relay-node tiles: host as `NODE://host`, `.res-cost.cost-*` → signal-cost chips, a fake ping readout (`{12+len%20}ms` — CSS can't compute; render via existing host string width trick or skip; acceptable to stamp static `LINK OK`). `.heatmap-svg` (WorldHeatMap): restyle to wireframe — country paths `fill: rgba(109,241,255,0.08–0.4 by bucket)`, stroke cyan 0.4px, on a grid backdrop; add `wm-trace-draw` on mount for the strongest-N country outlines.
- **Motion:** cards stagger-mount; hovering a node draws its border via trace.
- **Sound:** `route` cue on opening an external link.

### 5.13 Immersion — NODE-FEED (re-pointed to classic `immersion-*` tree)
- Port the prior session's dead `aero-immersion-*` rules to: `immersion-toolbar`, `immersion-url` (NODE PATH prefix), `immersion-mode-seg/btn`, `immersion-stage` (CRT frame — the `<webview>` guest is unstylable; the bezel carries the fiction), `immersion-banner` (amber), `immersion-rail`/`immersion-site-card`/`immersion-site-bar` (signal meters), `immersion-reader`.
- **Motion:** on webview `did-start-loading` → stage shows `TUNING…` static overlay; `did-stop-loading` → `wm-phosphor-settle` (wired-gated listeners in ImmersionView, same pattern as its existing webview event wiring).
- **Sound:** `route` on navigation.

### 5.14 Settings — SYS / Service Panel
- `os-settings-v2` shipped baseline. Bespoke: `SettingsNav` rows = service categories with port numbers (`P-01 …` counters); toggle switches restyled as DIP switches (rect track, square thumb, engraved ON/OFF); `os-set-adv-badge` = `MAINT` stamp. The wired section in SpecialPage keeps its terminal (already bespoke).
- **Sound:** existing `menu` on nav, new `switch-clack` for toggles (§8), wired-gated at the shared toggle component if one exists, else skip sound (visual only).

### 5.15 Sticky Note — FIELD NOTE
Shipped (amber acetate). Add: stamped timestamp row via `::before` on the note body (`FLD ▸` + the note keeps user text), and a punched-tape left margin (dot column via repeating radial-gradient).

### 5.16 Add App / Widget gallery — EXPANSION BAY / MODULE RACK
- `widget-gallery` = equipment rack: `widget-card` as cartridge blocks with port labels (`PORT-{n}` counters), MOUNT button (done), category `widget-tab` = channel rails. Mounting a widget: the new frame runs `wm-scan-reveal` + `wm-relay-blink` on its title lamp; cue `dock` (§8).

---

## 6. Per-widget instrument specs (all 26)

Frame is shared (`widget-frame`, done). Below: internal identity per type. All CSS in a new `wired-widgets.css` (imported after `wired-shell.css`) using the `wgt-*` hooks; JSX additions only where named. Idle animations: slow, instrument-like, ≥6s cycles.

| Widget | Instrument | Treatment (hooks) |
| --- | --- | --- |
| clock-digital | **Terminal Timestamp** | `wgt-clock-time`: 7-seg-style mono, phosphor glow, blinking colon (steps); `wgt-clock-date` → `TZ` code line |
| clock-analog | **Radar Clock** | `wgt-analog-face`: dark scope + range rings; `wgt-analog-tick` cyan; add conic sweep layer behind hands (6s steps rotation); `wgt-analog-sec` stays red (alarm hand) |
| calendar | **Mini Ops Board** | `wgt-cal-grid` mission cells, today amber ACTIVE (mirror §5.9); `wgt-cal-dot` = op lamps |
| pomodoro | **Cycle Reactor** | `wgt-pomo-time` big mono; `wgt-progress` = reactor ring substitute: segmented bar, amber from 80%, `wm-relay-blink` on last 10s; mode chip `FOCUS CYCLE` |
| stopwatch | **Telemetry Timer** | lab-instrument bezel, tabular digits, hundredths dimmed |
| world-clock | **Orbital Comms Clock** | `wgt-world-list` rows = ground stations (`STN` codes); reuse `WiredGlobe` mini (wired-gated) as header ornament |
| daily-goals | **Relay Checklist** | `wgt-goal-*` rows = relay switches: square check lamps that light cyan when complete + `wm-relay-blink` once on completion |
| habit-tracker | **Maintenance Log** | `wgt-habit-days` cells = inspection stamps (done = stamped `✓`-less filled cell w/ inner glow, missed = empty socket) |
| countdown | **Arming Timer** | severe frame, `T-` prefix, amber under 1h, red only under 60s (the one sanctioned red) |
| todo | **Dispatch Queue** | rows = queued commands with `PRI-B` tags; done items struck with scanline |
| study-streak | **Signal Continuity** | `wgt-stat-value` = uptime counter `{n}d CONTINUOUS`; `wgt-spark` restyled as a continuity trace (cyan line, break markers amber) |
| today-study-time | **Operator Uptime** | gauge framing: value + thin arc meter (CSS conic) |
| reading-progress | **Scroll Buffer** | progress = buffer fill with segment blocks; label `BUF` |
| vocab-progress | **Lexicon Database** | `wgt-vocab-rows` = table with capacity bar; `DB GROWTH +{n}` |
| level-progress | **Clearance Ladder** | `wgt-level-row` = clearance tiers, current tier amber-edged |
| word-of-the-day | **Intercepted Term** | packet styling: `wgt-wotd-word` in a sealed frame that runs a one-time decrypt on mount (shared `wm-decrypt-noise`) |
| learning-heatmap | **Phosphor Matrix** | `wgt-heatmap-grid` cells: square, cyan intensity scale, hot cells glow; idle: one random cell flickers every ~9s (CSS `nth-child` + long-cycle keyframe) |
| learner-map | **Node Link Monitor (map)** | reuse §5.12 wireframe heatmap styling |
| mini-player | **Mini Audio Deck** | mount `WiredOscilloscope` (§5.2) above `wgt-player-times`; transport `wgt-btn-icon` = hardware keys; `wgt-progress` = tape counter |
| calculator | **Engineering Pad** | `wgt-calc-display` = green-on-black LCD exception? No — cyan-on-black, mono, right-aligned; `wgt-calc-keys` square keys with 1px travel (`translateY(1px)` on `:active`) + `switch-clack` cue |
| recent-lookups | **Query Log** | `wgt-recent-list` = rolling teletype (newest `wm-type-in` once) |
| clipboard | **Memory Buffer** | `wgt-clip-line` = register rows `R0…R9` prefix counters |
| cpu-usage | **Processor Telemetry** | `wgt-sys-bar` = mini oscilloscope lane w/ graticule; value mono |
| memory-usage | **Core Bank** | bar = memory blocks filling (hard segment stops) |
| battery | **Power Cell** | industrial gauge; amber < 20% (existing data drives class?) — style thresholds if a level class exists, else static industrial frame |
| network | **Node Link Monitor** | `wgt-sys-dot` = link lamp with `wm-relay-blink` when active |

Widget mount animation (all): frame `wm-scan-reveal`, title lamp blink, `dock` cue — implemented once in `WidgetFrame` (wired-gated class on mount).

---

## 7. Boot, lockscreen, wallpaper — polish pass

Already strong. Bespoke additions:

- **Boot:** add per-line checksums (`…….. OK 0x3F2A`) to `wired-boot-lines` (content only), and a 1-frame full-screen white flash at the aero→wired handoff moment (respecting reduced motion) before the black cut.
- **Lockscreen:** radar circle gets a slow conic sweep (`wm` sweep reuse); failed unlock plays `sync-fail` + amber panel flash (red reserved for 3+ failures).
- **Wallpaper:** the `wired-wall-atmosphere` polygon gets a 40s parallax drift (translate 6px, steps(24)); one wall node cycles its status text between `LISTENING`/`IDLE`/`SYNCING` via CSS `content` swap keyframe (90s cycle).

---

## 8. Sound design — new cues

Extend `wiredArchivePack.ts` `CUES` (same procedural tone+noise synthesis, nothing sampled). Register under `ui`/`achievement` categories; play via existing `playSound`. All ≤ 0.35s, gains ≤ 0.06 (quieter than system cues).

| Cue | Recipe (tones/noise sketch) | Trigger |
| --- | --- | --- |
| `route` | 2 quick rising blips 740→1180Hz, 90ms each | app switch, immersion nav, external link |
| `dock` | 60Hz thump 80ms + 1kHz tick | widget mount, minimize-to-rail |
| `decrypt` | noise burst 120ms fading under a 520→1560Hz sweep | anki/flash reveal, word-of-the-day mount |
| `sync-ok` | 880+1320Hz dyad, 140ms | correct answer, save |
| `sync-fail` | 196Hz dry pulse ×2, 200ms, no reverb tail | wrong answer, failed unlock |
| `db-blip` | 1.5kHz 40ms + 90ms noise tail | dictionary search fires |
| `tape-seek` | filtered noise chirp rising, 220ms | library/media item open |
| `switch-clack` | 2.2kHz 25ms click + 90Hz body | DIP toggles, calculator keys |

Playback rules: all wired-gated (`useWiredMaterials()` or `isWiredArchiveActive()`), debounced ≥ 80ms per cue, silent when `soundEngine.isMuted()` (engine handles this). No cue on keystrokes except calculator keys.

---

## 9. Settings additions (Service Panel)

Extend `WiredArchiveSettings` (`terminalModeSettings.ts` — normalize() defaults keep back-compat):

- `motionLevel: 'full' | 'reduced' | 'off'` → `data-wired-motion` attr; `wired-motion.css` keys off it (in addition to OS reduced-motion).
- `uiCues: boolean` (default true) — gates the §8 cues (ambient already separate).
- `idleAnimations: boolean` (default true) — gates wallpaper drift, heatmap flicker, globe spin.

Expose in SpecialPage's wired section as DIP switches (§5.14 styling). i18n keys `wired.settings.*`.

---

## 10. Implementation phases

Each phase independently shippable; run gates after each (§11).

1. **P1 — Seam fix (§0):** AppChrome wraps for gram/tr/stats; re-point dead selectors to classic trees (esp. Immersion). *Unblocks everything.*
2. **P2 — Motion core (§1, §2):** `wired-motion.css` + DesktopShell window state machine + taskbar pulse. The single highest-impact phase.
3. **P3 — Shell life (§3, §4, §7):** lamps, globe, clock flicker, bulletin teletype, boot/lock/wallpaper polish.
4. **P4 — Marquee apps (§5.4, 5.5, 5.8, 5.2, 5.13):** Anki/Flash decrypt, Stats traces, Music oscilloscope, Immersion tuning.
5. **P5 — Remaining apps (§5.1, 5.3, 5.6, 5.7, 5.9–5.12, 5.14–5.16).**
6. **P6 — Widgets (§6):** `wired-widgets.css` + WidgetFrame mount animation + mini-deck oscilloscope reuse.
7. **P7 — Sound + settings (§8, §9):** new cues, gates, DIP switches, i18n keys for all new chrome strings.

File map (new): `theme/wired-motion.css`, `theme/wired-widgets.css`, `components/wired/WiredOscilloscope.tsx`, `components/shell/WiredGlobe.tsx`. Modified: `wired-apps.css`, `wired-shell.css`, `DesktopShell.tsx` (state machine, tray lamps, globe mount), `AppChrome` wraps in 3 views, small wired-gated hooks in MediaView/ImmersionView/AnkiView/FlashcardsView/MusicView, `WidgetFrame.tsx`, `wiredArchivePack.ts`, `terminalModeSettings.ts`, `SpecialPage.tsx`, `catalogs.ts` (`wired.*` keys ×4 langs).

## 11. Verification (every phase)

- `npm test` (623+ vitest — catalog hygiene will fail on any missing translation) and `node tools/i18n-check.cjs`. Do **not** trust `npx tsc`/eslint parse errors (TS 4.5.5 vintage — known false positives on `satisfies`).
- Launch (`npm start`), enter wired via Settings → Special → WIRED ARCHIVE. Walk: boot → lockscreen → open/close/minimize each app (state machine + cues) → trigger a notification → mount a widget → flashcard reveal → toggle Clean CRT, reduced static, OS reduced-motion, and mute — every animation must degrade, every cue must silence.
- Aero regression sweep: enter aero, confirm no wired class leaks (all new CSS scoped to `[data-materials='wired']` or wired-gated JSX) and the window state machine doesn't visibly change aero timing.
- Perf: with 4 windows + 6 widgets open, drag a window — no jank (all animations are transform/opacity/clip-path; no layout-thrashing properties).

## 12. Acceptance

Done when: no two apps share an identical interior; every widget names its instrument at a glance; opening a window feels like powering on hardware; a full review session (dictionary → flashcards → stats) plays the decode/sync/telemetry fiction end-to-end without ever slowing the user down; and switching to Clean CRT + reduced motion yields a calm, fully functional terminal.
