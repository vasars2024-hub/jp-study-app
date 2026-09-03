<#
.SYNOPSIS
  Liquid rubric category 7 instrument #2: frame stability during a real interaction.

.DESCRIPTION
  `liquid-perf-probe.ps1` measures MAIN. This one measures the RENDERER, because drag,
  resize and theme switch are compositor/layout work and a perfectly available main
  process says nothing about whether the gesture was smooth.

  Method: install a requestAnimationFrame recorder, drive the app's OWN pointer handlers
  (`dragStart` / `resizeStart` in DesktopShell.tsx) over ~1 s, then read the frame-delta
  distribution back. Reports min/p50/p95/max and the count of frames over 16.7 / 33 / 100 ms
  -- never a mean, for the same reason the main probe doesn't: one 300 ms hitch is the
  finding and an average erases it.

  THE WINDOW MUST BE FOCUSED. Chromium throttles rAF in a background window, so an
  unfocused run reports a handful of ~1000 ms "frames" and looks like a catastrophic
  defect. The script calls /focus itself and refuses if the window did not take focus.

  Harness accommodation, disclosed because it is not free: `dragStart` calls
  `setPointerCapture(e.pointerId)`, which throws NotFoundError for a synthetic pointer id
  (no active pointer exists). The probe stubs setPointerCapture/releasePointerCapture to
  no-ops for the duration and restores them. The move listener is attached to the bar
  element directly, so dispatching pointermove at that element reaches the same handler
  capture would have routed it to -- the work under measurement is unchanged.

  Every gesture is a CLOSED LOOP: the offset follows sin(0..pi) and returns to 0, so the
  commit on pointerup writes back the coordinates it started from. Window position and
  size are persisted synchronously to desktop-layout.json on release (desktop.ts persist()),
  and there is no backup of userData -- a gesture that does not return to its origin
  silently rearranges the user's desktop.

  There is NO "idle" mode, and the reason is a trap this probe fell into first: a static
  page produces about 3 frames a second, because Chromium only runs rAF when the compositor
  produces a frame and a page with nothing changing gives it no reason to. An idle "control"
  therefore reports 360 ms frames and reads as catastrophic jank on a perfectly healthy app.
  Use `ceiling` instead -- it animates a throwaway layer to establish what this display can
  actually do (measured 97.6 fps / p50 10 ms here), which is the number a gesture is scored
  against. And -Jank is the sensitivity control: the same gesture with periodic 120 ms
  renderer blocks, which MUST come back visibly worse or the probe cannot score anything.

.PARAMETER Interaction
  drag | resize | theme | ceiling | playback

  `playback` is the odd one and deliberately so: it DRIVES NOTHING. It observes a clip the app
  is already playing and reports the decoder's own ledger (decoded / dropped / corrupted frames
  from `getVideoPlaybackQuality`) beside the usual rAF distribution, because on a video surface
  the rAF numbers alone cannot tell a healthy decoder from one dropping every second frame — a
  dropped video frame repaints the previous picture, on time. It refuses on a paused, stalled,
  unstarted or absent player rather than scoring a still picture as perfectly stable.

.PARAMETER Jank
  Sensitivity control. Schedules repeated ~120 ms synchronous renderer blocks across the
  gesture. A run where this does NOT degrade the frame distribution means the recorder is
  not seeing the frames it claims to, and every number it has produced is void.

.PARAMETER DurationMs
  Wall-clock window over which main availability is sampled, chosen to cover the gesture.

.PARAMETER AsJson
  Emit the record as one compressed JSON line instead of a PowerShell object, so a runner
  can consume it. -OutFile additionally writes it to a file.

.PARAMETER Title
  Substring of the window title to drive. WITHOUT it the probe takes the LARGEST visible
  `.fwin`, which is only the surface under test when every other window is hidden. On a desktop
  carrying Media (820x580), Video (1080x700) and Dictionary (820x580) the largest is Video, and
  a run scored as "the Dictionary window" silently measured the video player instead -- the
  `title=` field in the gesture record is the only place that showed. Pass it whenever the score
  names a surface. The largest-area default is kept so previously recorded runs reproduce.

  CORRECTION 29, 2026-08-31. A FRAMELESS window has no title element at all, so substring
  matching selects every window and the largest-area tie-break then drives whichever one
  happens to be biggest -- the exact `probe-picks-first-visible-fwin` shape, one level up.
  `-Title` therefore also accepts `@<css-selector>`: the target is the `.fwin` that matches the
  selector or contains an element matching it. This is the same `@selector` window-naming form
  cat4 and cat8 already use (`--surface @.fwin-frameless`), so one convention names a titleless
  window across every category. A selector matching no window REFUSES rather than falling back.

.PARAMETER Root
  CSS selector for a surface that replaces the desktop shell and therefore has no `.fwin` chrome.
  Drag dispatches pointer events only on that root; resize drives the debug bridge's `/bounds`
  route and restores the exact content size it reported before the gesture. `Root` is used only
  by drag/resize. Do not pass it for a surface hosted inside a conventional `.fwin`.

.EXAMPLE
  pwsh tools/liquid-interaction-probe.ps1 -Interaction ceiling
  pwsh tools/liquid-interaction-probe.ps1 -Interaction drag -Title Dictionary
  pwsh tools/liquid-interaction-probe.ps1 -Interaction drag -Jank    # must look worse
  pwsh tools/liquid-interaction-probe.ps1 -Interaction playback -AsJson   # a clip must be playing
#>
param(
  [ValidateSet('drag', 'resize', 'theme', 'ceiling', 'playback')]
  [string]$Interaction = 'ceiling',
  [int]$DurationMs = 1800,
  [switch]$Jank,
  [string]$Label = '',
  [string]$ThemeId = 'oled-black',
  [string]$Title = '',
  [string]$Root = '',
  # CORRECTION 30, 2026-08-31. Every bridge route here resolved the FOCUSED OS window, which is
  # the main desktop unless something else asked for the foreground. A shell that runs in its own
  # BrowserWindow -- Blanc, the Agent pop-out, a Focus host -- therefore could not be measured at
  # all: /focus raised the desktop, the -Root gesture ran in the desktop's document, `.blanc-root`
  # was absent there, and the run refused. Passing -Win pins /focus, /eval and /bounds to ONE
  # window id and asserts that id actually took the foreground, so a run can never silently
  # measure a different window's frames. Unset, behaviour is byte-identical to before.
  [string]$Win = '',
  [switch]$AsJson,
  [string]$OutFile = ''
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$bridgePath = Join-Path $repo 'debug\bridge.json'
if (-not (Test-Path $bridgePath)) {
  Write-Error "No debug/bridge.json -- no dev-server app is running."
}
$b = Get-Content $bridgePath -Raw | ConvertFrom-Json
$headers = @{ Authorization = "Bearer $($b.token)" }
$base = "http://127.0.0.1:$($b.port)"

function New-BridgeBody([hashtable]$fields) {
  $h = @{}
  if ($fields) { foreach ($k in $fields.Keys) { $h[$k] = $fields[$k] } }
  if ($Win) { $h['window'] = $Win }
  return ($h | ConvertTo-Json -Compress)
}

function Invoke-Eval([string]$js) {
  $body = New-BridgeBody @{ js = $js }
  $r = Invoke-RestMethod -Uri "$base/eval" -Method Post -Headers $headers -Body $body -ContentType 'application/json' -TimeoutSec 60
  if (-not $r.ok) { Write-Error "eval failed: $($r.error)" }
  return $r.result
}

# rAF is throttled in a background window. Focus, then verify -- do not assume.
$null = Invoke-RestMethod -Uri "$base/focus" -Method Post -Headers $headers -Body (New-BridgeBody @{}) -ContentType 'application/json'
Start-Sleep -Milliseconds 300
$h = Invoke-RestMethod -Uri "$base/health" -Headers $headers
# NOT `$win`: PowerShell variable names are CASE-INSENSITIVE, so `$win = ...` silently overwrote
# the `-Win` PARAMETER, and the correction-30 assertion below then compared the window id against
# a stringified window OBJECT and VOIDed every run. The instrument refused three times in a row on
# a window /focus had correctly raised, and the refusal named the right symptom for the wrong
# reason -- which is the expensive kind.
$focusedWin = $h.windows | Where-Object { $_.focused } | Select-Object -First 1
if (-not $focusedWin) { Write-Error "No focused window after /focus -- rAF would be throttled and every frame number void." }
if ($focusedWin.minimized) { Write-Error "Focused window is minimized -- refusing to record zeros." }
# Correction 30: asked for a specific window, PROVE it is the one producing the frames.
if ($Win -and "$($focusedWin.id)" -ne "$Win") {
  Write-Error "VOID: asked for window $Win but window $($focusedWin.id) took the foreground. Every frame from the requested window would be a throttle artifact."
}

# --- the gesture, self-driving over rAF so /eval returns immediately -----------------
$gestureJs = switch ($Interaction) {
  'ceiling' {
    # What this display can do at all. A compositor-only transform on a throwaway fixed
    # layer -- no layout, no React, no product code. Every gesture below is scored against
    # this number, not against 16.7 ms assumed from a 60 Hz display that isn't there.
    @"
(() => {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:2px;top:2px;width:16px;height:16px;background:#0f0;opacity:0.35;z-index:2147483647;pointer-events:none';
  document.body.appendChild(el);
  window.__lip = { done: false };
  const t0 = performance.now();
  const step = (now) => {
    el.style.transform = 'translate3d(' + ((now / 8) % 180) + 'px,0,0)';
    if (now - t0 < 1300) { requestAnimationFrame(step); return; }
    el.remove();
    window.__lip = { done: true, note: 'compositor ceiling', spanMs: +(now - t0).toFixed(0) };
  };
  requestAnimationFrame(step);
  return 'ceiling started';
})()
"@
  }
  'playback' {
    # PLAYER FRAME STABILITY — the one perf baseline row L0 left open (PERF_BASELINE.md:104,
    # VIDEO_BASELINE.md:109), because it "needs media playing" and no clip was ever loaded.
    #
    # It is an OBSERVATION, not a gesture, and that is deliberate: every other interaction here
    # drives the app and then proves it put the app back. This one must not touch the player at
    # all — calling play(), seeking, or setting playbackRate would write the user's resume
    # position, and the number wanted is what the app does on its own while a real clip runs.
    # So the leg refuses unless the clip is ALREADY playing, and restores nothing because it
    # changed nothing.
    #
    # TWO NUMBERS, and the rAF one alone is not the answer. The recorder installed below reports
    # the RENDERER's frame cadence, which on a video surface is dominated by the compositor and
    # looks identical whether the decoder is keeping up or dropping every second frame — a
    # dropped video frame simply repaints the previous picture, on time. `getVideoPlaybackQuality`
    # is the decoder's own ledger and is the number the rubric's words actually name.
    #
    # THE REFUSALS, each one a way this leg could otherwise score a still picture as perfect:
    #   no painted <video>      nothing is playing anywhere; an absent player measures as a fast one
    #   readyState < 2          no frame has been decoded, so there is nothing to be stable
    #   paused / ended          a frozen frame drops nothing and decodes nothing: a fabricated 0%
    #   no getVideoPlaybackQuality  the decoder ledger is the measurement; without it there is none
    #   currentTime did not advance   THE load-bearing one. A <video> can report `paused === false`
    #                           while its clock stands still (a stalled network source, a decoder
    #                           that never produced a second frame). directstreamOpenRecovery.ts:90
    #                           documents exactly that state on this app's own player. Advancement
    #                           is asserted against the elapsed span and the clip's own
    #                           playbackRate, so a 0.5x clip is not accused of stalling.
    @"
(() => {
  const painted = [].slice.call(document.querySelectorAll('video')).filter((v) => {
    const r = v.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(v).visibility !== 'hidden';
  });
  if (!painted.length) {
    window.__lip = { done: true, refuse: 'no painted <video> element is on screen, so nothing is playing to be measured' };
    return 'refused';
  }
  // Largest painted box, the same ranking every other leg here uses to pick its target: a
  // wallpaper loop and a poster preview are both <video> and neither is the player.
  const v = painted.map((e) => ({ e: e, r: e.getBoundingClientRect() }))
    .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)[0].e;
  const box = Math.round(v.getBoundingClientRect().width) + 'x' + Math.round(v.getBoundingClientRect().height);
  if (v.readyState < 2) {
    window.__lip = { done: true, refuse: 'the largest <video> (' + box + ') is at readyState ' + v.readyState + ': no frame has been decoded, so there is no stability to measure' };
    return 'refused';
  }
  if (v.paused || v.ended) {
    window.__lip = { done: true, refuse: 'the largest <video> (' + box + ') is ' + (v.ended ? 'ended' : 'paused') + ': a still frame decodes nothing and drops nothing, which would score as perfect' };
    return 'refused';
  }
  if (typeof v.getVideoPlaybackQuality !== 'function') {
    window.__lip = { done: true, refuse: 'getVideoPlaybackQuality() is unavailable on this <video>, so decoded and dropped frame counts cannot be read' };
    return 'refused';
  }
  const q0 = v.getVideoPlaybackQuality();
  const t0 = performance.now();
  const from = { time: v.currentTime, total: q0.totalVideoFrames, dropped: q0.droppedVideoFrames, corrupted: q0.corruptedVideoFrames };
  window.__lip = { done: false, mechanism: 'observe an already-playing <video>; nothing is driven', from: from };
  const step = (now) => {
    if (now - t0 < 1300) { requestAnimationFrame(step); return; }
    const q = v.getVideoPlaybackQuality();
    const spanMs = now - t0;
    const rate = v.playbackRate || 1;
    const advancedSec = v.currentTime - from.time;
    const decoded = q.totalVideoFrames - from.total;
    const dropped = q.droppedVideoFrames - from.dropped;
    const corrupted = q.corruptedVideoFrames - from.corrupted;
    window.__lip = {
      done: true,
      mechanism: 'observe an already-playing <video>; nothing is driven',
      spanMs: +spanMs.toFixed(0),
      // Path and media id ONLY. This record is banked to disk under baselines/, and the
      // directstream URL carries a bearer token in its query string -- a plain slice of the
      // href wrote 90 characters of live JWT into the first run's JSON.
      source: (() => {
        const s = String(v.currentSrc || v.src || '(no src)');
        try {
          const u = new URL(s);
          const id = u.searchParams.get('id');
          return u.origin + u.pathname + (id ? '?id=' + id : '');
        } catch (e) { return s.slice(0, 60) + ' (unparseable)'; }
      })(),
      intrinsic: v.videoWidth + 'x' + v.videoHeight,
      box: box,
      playbackRate: rate,
      muted: v.muted,
      advancedSec: +advancedSec.toFixed(3),
      decodedFrames: decoded,
      droppedFrames: dropped,
      corruptedFrames: corrupted,
      decodedFps: spanMs > 0 ? +((decoded * 1000) / spanMs).toFixed(1) : null,
      dropPct: decoded > 0 ? +((dropped * 100) / decoded).toFixed(2) : null,
      stillPlaying: !v.paused && !v.ended,
      // 60% of what the clock should have covered. Slack for the sampling boundaries, but far
      // too tight to be met by a player that is not actually running.
      advanced: advancedSec >= (spanMs / 1000) * rate * 0.6,
      // A leg that decoded nothing has no denominator: dropPct would be null and 'no drops'
      // would be a statement about an empty sample.
      decodedSomething: decoded > 0,
    };
    if (!window.__lip.advanced) {
      window.__lip.refuse = 'currentTime advanced ' + window.__lip.advancedSec + ' s across ' + window.__lip.spanMs
        + ' ms at rate ' + rate + ': the player reports playing but its clock is standing still, so every frame count below is a still picture';
    } else if (!window.__lip.decodedSomething) {
      window.__lip.refuse = 'the decoder produced 0 new frames across ' + window.__lip.spanMs
        + ' ms, so there is no denominator for a drop rate';
    }
  };
  requestAnimationFrame(step);
  return 'playback observation started';
})()
"@
  }
  'theme' {
    # Reproduces applyTheme()'s two measurable halves -- the <html> data-theme restyle and
    # the jp-theme-changed broadcast every React consumer listens on -- WITHOUT its
    # localStorage write. Excluded deliberately: there is no restore point for renderer
    # storage, and the write is not where the cost is. The script asserts jp-os-theme is
    # byte-identical afterwards, which is only meaningful because nothing wrote it.
    @"
(() => {
  const root = document.documentElement;
  const prev = root.getAttribute('data-theme');
  window.__lip = { done: false, prev: prev };
  const fire = (id) => {
    if (id === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', id);
    window.dispatchEvent(new CustomEvent('jp-theme-changed', { detail: id === null ? 'study-os' : id }));
  };
  const t0 = performance.now();
  fire('$ThemeId');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const painted = performance.now() - t0;
    const t1 = performance.now();
    fire(prev);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.__lip = { done: true, applyPaintedMs: +painted.toFixed(1), restorePaintedMs: +(performance.now() - t1).toFixed(1), restoredTo: prev };
    }));
  }));
  return 'theme started';
})()
"@
  }
  default {
    if ($Root) {
      $rootJs = ($Root | ConvertTo-Json -Compress)
      if ($Interaction -eq 'drag') {
        @"
(() => {
  const ROOT = $rootJs;
  const grip = document.querySelector(ROOT);
  if (!grip) { window.__lip = { done: true, refuse: 'no root ' + ROOT }; return 'refused'; }
  const gr = grip.getBoundingClientRect();
  if (gr.width <= 0 || gr.height <= 0 || getComputedStyle(grip).display === 'none') {
    window.__lip = { done: true, refuse: 'root is hidden or zero-sized: ' + ROOT };
    return 'refused';
  }
  const sx = Math.round(gr.left + gr.width / 2), sy = Math.round(gr.top + gr.height / 2);
  const before = { left: gr.left, top: gr.top, width: gr.width, height: gr.height };
  const ev = (type, x, y) => grip.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1,
    pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, isPrimary: true }));
  window.__lip = { done: false, root: ROOT, before: before, mechanism: 'pointer events on surface root' };
  ev('pointerdown', sx, sy);
  const N = 60, AMP = 48;
  let i = 0;
  const step = () => {
    i += 1;
    // The event path returns to its origin. Pointerup is intentional: mouseup would fire the
    // readers' dictionary lookup, which is a different interaction and changes the scene.
    const d = Math.round(AMP * Math.sin((i / N) * Math.PI));
    ev('pointermove', sx + d, sy + Math.round(d * 0.25));
    if (i < N) { requestAnimationFrame(step); return; }
    ev('pointerup', sx, sy);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const ar = grip.getBoundingClientRect();
      const after = { left: ar.left, top: ar.top, width: ar.width, height: ar.height };
      window.__lip = { done: true, steps: N, amplitudePx: AMP, root: ROOT,
        mechanism: 'pointer events on surface root', before: before, after: after,
        closedLoop: before.left === after.left && before.top === after.top &&
          before.width === after.width && before.height === after.height };
    }));
  };
  requestAnimationFrame(step);
  return 'root pointer gesture started';
})()
"@
      } else {
        @"
(() => {
  const ROOT = $rootJs;
  const grip = document.querySelector(ROOT);
  if (!grip) { window.__lip = { done: true, refuse: 'no root ' + ROOT }; return 'refused'; }
  const gr = grip.getBoundingClientRect();
  if (gr.width <= 0 || gr.height <= 0 || getComputedStyle(grip).display === 'none') {
    window.__lip = { done: true, refuse: 'root is hidden or zero-sized: ' + ROOT };
    return 'refused';
  }
  window.__lip = { done: false, root: ROOT,
    beforeRect: { left: gr.left, top: gr.top, width: gr.width, height: gr.height },
    mechanism: 'debug bridge /bounds on root OS window' };
  return 'root resize awaiting bridge';
})()
"@
      }
    } else {
      # `.fwin-drag-strip` is the frameless window's own drag handle; it has no `.fwin-bar`.
      # Both are offered so one selector serves both chrome shapes, and a window carrying
      # neither still refuses below rather than measuring a gesture it never performed.
      $sel = if ($Interaction -eq 'drag') { '.fwin-bar, .fwin-drag-strip' } else { '.fwin-resize' }
      $titleJs = ($Title | ConvertTo-Json -Compress)
      @"
(() => {
  const WANT = $titleJs;
  // Correction 29: '@<selector>' names a window structurally, for the frameless windows that
  // carry no title element for a substring to match.
  const BY_SELECTOR = WANT.charAt(0) === '@' ? WANT.slice(1) : '';
  const wins = [...document.querySelectorAll('.fwin')].filter((w) => getComputedStyle(w).display !== 'none')
    .filter((w) => {
      if (!WANT) return true;
      if (BY_SELECTOR) return w.matches(BY_SELECTOR) || !!w.querySelector(BY_SELECTOR);
      const t = w.querySelector('.fwin-title-text, .fwin-title');
      return !!t && (t.textContent || '').indexOf(WANT) >= 0;
    });
  const target = wins.map((w) => ({ w, r: w.getBoundingClientRect() })).filter((o) => o.r.width > 0 && o.r.height > 0)
    .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)[0];
  if (!target) { window.__lip = { done: true, refuse: WANT ? ('no visible non-zero .fwin titled ' + WANT) : 'no visible non-zero .fwin' }; return 'refused'; }
  const grip = target.w.querySelector('$sel');
  if (!grip) { window.__lip = { done: true, refuse: 'no $sel in the target window' }; return 'refused'; }
  const gr = grip.getBoundingClientRect();
  const sx = Math.round(gr.left + gr.width / 2), sy = Math.round(gr.top + gr.height / 2);
  const before = { x: target.w.style.left, y: target.w.style.top, w: target.w.style.width, h: target.w.style.height };
  const origSet = Element.prototype.setPointerCapture, origRel = Element.prototype.releasePointerCapture;
  Element.prototype.setPointerCapture = function () {}; Element.prototype.releasePointerCapture = function () {};
  const ev = (type, x, y) => grip.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, isPrimary: true }));
  window.__lip = { done: false, title: (target.w.querySelector('.fwin-title-text') || {}).textContent || WANT || '?', before: before };
  ev('pointerdown', sx, sy);
  const N = 60, AMP = 140;
  let i = 0;
  const step = () => {
    i += 1;
    // sin(0..pi): returns to exactly 0, so the commit on pointerup writes the origin back.
    const d = Math.round(AMP * Math.sin((i / N) * Math.PI));
    ev('pointermove', sx + d, sy + Math.round(d * 0.5));
    if (i < N) { requestAnimationFrame(step); return; }
    ev('pointerup', sx, sy);
    Element.prototype.setPointerCapture = origSet; Element.prototype.releasePointerCapture = origRel;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const after = { x: target.w.style.left, y: target.w.style.top, w: target.w.style.width, h: target.w.style.height };
      window.__lip = { done: true, steps: N, amplitudePx: AMP, title: window.__lip.title, before: before, after: after,
        closedLoop: before.x === after.x && before.y === after.y && before.w === after.w && before.h === after.h };
    }));
  };
  requestAnimationFrame(step);
  return 'gesture started';
})()
"@
    }
  }
}

# --- the SCENE, without which none of these timings is comparable ----------------------
# 2026-08-26: a worker lost a whole turn to a "theme-switch regression" that was a window
# count. The 330-446 ms it chased was a 10-window desk measured against L0's 2-window
# baseline; at L0's own scene the same swap costs 5.4 ms. Style/layout cost here is linear
# in the element count of the open windows, so a category-7 number quoted without its scene
# is not a measurement of anything. Captured before AND after -- a scene that moved during
# the gesture (a window opened, a route swapped) invalidates the comparison just as surely.
$rootSceneJs = ($Root | ConvertTo-Json -Compress)
$sceneJs = @"
(() => {
  const ROOT = $rootSceneJs;
  const root = ROOT ? document.querySelector(ROOT) : null;
  const wins = [].slice.call(document.querySelectorAll('.fwin')).filter((w) => {
    const r = w.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  const t = (w) => {
    const e = w.querySelector('.fwin-title-text, .fwin-title');
    return e ? (e.textContent || '').trim().slice(0, 40) : '';
  };
  return {
    fwins: wins.length,
    fwinElements: wins.reduce((n, w) => n + 1 + w.querySelectorAll('*').length, 0),
    root: ROOT || null,
    rootElements: root ? 1 + root.querySelectorAll('*').length : null,
    documentElements: document.querySelectorAll('*').length,
    titles: wins.map(t),
    theme: document.documentElement.getAttribute('data-theme'),
    viewport: innerWidth + 'x' + innerHeight,
    dpr: devicePixelRatio,
    heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
  };
})()
"@
$sceneBefore = Invoke-Eval $sceneJs

# --- install the frame recorder -------------------------------------------------------
# The token is load-bearing, not tidiness. A run that dies after this point (a PowerShell
# error, a lost bridge, a Ctrl-C) leaves its rAF loop RUNNING in the renderer, and the loop
# re-reads `window.__lfp` every frame -- so the next run's recorder shares its array with
# the zombie and each frame is pushed TWICE: once as the real delta and once as ~0 ms.
# Measured 2026-08-26 immediately after a crashed run: ceiling came back 221 frames /
# p50 0.0 / p95 16.8, and the same ceiling with no zombie came back 111 / 16.7 / 16.9.
# Exactly 2x the frames and a p50 of zero, i.e. the display beaten by a factor of infinity.
# That is a fabricated PASS, which is the one direction a perf harness must never fail in.
# Each loop now carries the token it was installed with and exits when it is superseded.
# A per-run global NAME, not a per-run flag, and the difference is the whole fix: a zombie
# that re-reads `window.__lfp` each frame writes into whatever that name currently holds, so
# merely setting the old object's `on = false` and rebinding the name hands it the new array.
# `__lfp` is therefore left in place as a DEAD DECOY (`on:false`) that stops any zombie which
# re-reads it, while this run records into a name no earlier loop can know.
$recName = "__lfp_" + [guid]::NewGuid().ToString('N').Substring(0, 8)
$recorderInstall = Invoke-Eval @"
(() => {
  const stale = !!(window.__lfp && window.__lfp.on);
  window.__lfp = { d: [], last: performance.now(), on: false, note: 'decoy: stops pre-2026-08-26 recorders' };
  const a = window.$recName = { d: [], last: performance.now(), on: true };
  const step = (now) => { if (!a.on) return; a.d.push(now - a.last); a.last = now; requestAnimationFrame(step); };
  requestAnimationFrame(step);
  return JSON.stringify({ recording: true, staleRecorderDisarmed: stale });
})()
"@
$staleRecorder = ($recorderInstall | ConvertFrom-Json).staleRecorderDisarmed

# --- the sensitivity control, if asked for --------------------------------------------
if ($Jank) {
  $null = Invoke-Eval @"
(() => {
  window.__jank = { on: true, blocks: 0 };
  const beat = () => {
    if (!window.__jank.on) return;
    const t = performance.now();
    while (performance.now() - t < 120) { /* hold the renderer */ }
    window.__jank.blocks += 1;
    setTimeout(beat, 60);
  };
  setTimeout(beat, 60);
  return 'jank armed';
})()
"@
}

# --- fire the gesture without blocking, then sample main across it ---------------------
Add-Type -AssemblyName System.Net.Http
$client = [System.Net.Http.HttpClient]::new()
$client.Timeout = [TimeSpan]::FromSeconds(60)
$client.DefaultRequestHeaders.Add('Authorization', "Bearer $($b.token)")
$json = New-BridgeBody @{ js = $gestureJs }
$content = [System.Net.Http.StringContent]::new($json, [System.Text.Encoding]::UTF8, 'application/json')
$task = $client.PostAsync("$base/eval", $content)

# A root reader has no `.fwin-resize`; its frame is the OS window itself. Capture the content
# size from the same route that will drive it. This is also the restore source -- frame bounds
# include borders and are not byte-comparable to BrowserWindow content size.
$rootResizeBefore = $null
$rootResizeRestored = $false
$rootResizeSteps = 0
if ($Root -and $Interaction -eq 'resize') {
  $rootResizeBefore = Invoke-RestMethod -Uri "$base/bounds" -Method Post -Headers $headers -Body (New-BridgeBody @{}) -ContentType 'application/json' -TimeoutSec 60
  if (-not ($rootResizeBefore.ok -and $rootResizeBefore.contentSize)) {
    Write-Error "Root resize cannot read /bounds -- refusing a gesture that cannot be restored."
  }
  # Eval only installs the pending receipt and returns immediately. Wait for that receipt before
  # the first OS resize so the scene cannot move ahead of its own measurement marker.
  try { $null = $task.GetAwaiter().GetResult() } catch { Write-Error "Root resize setup failed: $_" }
}

# Sample for a wall-clock window that COVERS the gesture. A fixed sample count does not:
# /eval returns the moment the gesture says "started", so the POST completing bounds
# nothing, and 30 back-to-back samples are over in 60 ms -- a full second before the
# gesture ends. The 15 ms gap keeps the probe from being the load it is measuring.
$times = New-Object System.Collections.Generic.List[double]
$span = [System.Diagnostics.Stopwatch]::StartNew()
try {
  while ($span.Elapsed.TotalMilliseconds -lt $DurationMs) {
    if ($rootResizeBefore -and -not $rootResizeRestored) {
      $progress = [Math]::Min(1, $span.Elapsed.TotalMilliseconds / 1300)
      $d = [Math]::Round(140 * [Math]::Sin($progress * [Math]::PI))
      $rw = [int]$rootResizeBefore.contentSize.width + [int]$d
      $rh = [int]$rootResizeBefore.contentSize.height + [int][Math]::Round($d * 0.5)
      $rb = New-BridgeBody @{ width = $rw; height = $rh }
      $null = Invoke-RestMethod -Uri "$base/bounds" -Method Post -Headers $headers -Body $rb -ContentType 'application/json' -TimeoutSec 60
      $rootResizeSteps += 1
      if ($progress -ge 1) {
        $restore = New-BridgeBody @{ width = [int]$rootResizeBefore.contentSize.width; height = [int]$rootResizeBefore.contentSize.height }
        $null = Invoke-RestMethod -Uri "$base/bounds" -Method Post -Headers $headers -Body $restore -ContentType 'application/json' -TimeoutSec 60
        $rootResizeRestored = $true
      }
    }
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try { $null = Invoke-RestMethod -Uri "$base/health" -Headers $headers -TimeoutSec 60 } catch { }
    $sw.Stop()
    $times.Add($sw.Elapsed.TotalMilliseconds)
    Start-Sleep -Milliseconds 15
  }
} finally {
  if ($rootResizeBefore -and -not $rootResizeRestored) {
    $restore = New-BridgeBody @{ width = [int]$rootResizeBefore.contentSize.width; height = [int]$rootResizeBefore.contentSize.height }
    $null = Invoke-RestMethod -Uri "$base/bounds" -Method Post -Headers $headers -Body $restore -ContentType 'application/json' -TimeoutSec 60
    $rootResizeRestored = $true
  }
}
$span.Stop()
if (-not $rootResizeBefore) { try { $null = $task.GetAwaiter().GetResult() } catch { } }
$client.Dispose()

if ($rootResizeBefore) {
  $rootResizeAfter = Invoke-RestMethod -Uri "$base/bounds" -Method Post -Headers $headers -Body (New-BridgeBody @{}) -ContentType 'application/json' -TimeoutSec 60
  $bw = [int]$rootResizeBefore.contentSize.width
  $bh = [int]$rootResizeBefore.contentSize.height
  $aw = [int]$rootResizeAfter.contentSize.width
  $ah = [int]$rootResizeAfter.contentSize.height
  $closed = ($bw -eq $aw -and $bh -eq $ah)
  $closedJs = $closed.ToString().ToLowerInvariant()
  $null = Invoke-Eval "(() => { const prior = window.__lip || {}; window.__lip = { done: true, root: prior.root, mechanism: prior.mechanism, steps: $rootResizeSteps, amplitudePx: 140, before: { width: $bw, height: $bh }, after: { width: $aw, height: $ah }, closedLoop: $closedJs }; return 'root resize complete'; })()"
}

# The gesture drives itself over rAF; wait for it rather than guessing a sleep.
$state = $null
for ($i = 0; $i -lt 60; $i++) {
  $state = Invoke-Eval 'window.__lip'
  if ($state -and $state.done) { break }
  Start-Sleep -Milliseconds 250
}
if (-not ($state -and $state.done)) { Write-Error "Gesture never reported done -- refusing to report frame numbers for an unfinished interaction." }
# A gesture that REFUSED still sets done, and until 2026-09-03 the run then printed a full,
# clean-looking frame distribution for an interaction that never happened -- `refuse` was carried
# in the `gesture` field and left for the caller to notice. That is the same false-pass shape this
# file's header records for the zombie recorder: the numbers are real frames of an idle window,
# and nothing in the record says the gesture was not among them. Refuse here instead.
if ($state.refuse) { Write-Error "REFUSE: $($state.refuse)" }

# Focus is checked BEFORE the recorder is installed, but it can be lost DURING the
# gesture -- another process taking the foreground backgrounds this window and Chromium
# stops producing frames. The recorder cannot tell that gap apart from a renderer stall,
# so it reports it as one huge frame. Measured 2026-08-25: two consecutive drag runs both
# reported frame_max_ms = 3927.9 -- identical to the decimal, which no pair of independent
# gestures produces -- while eight surrounding runs of the same gesture on the same tree
# reported 16.8-17.5. Dropping index 0 does not catch this; the gap lands mid-recording.
# A throttle artifact scored as a product frame is a fabricated FINDING, so refuse.
$after = Invoke-RestMethod -Uri "$base/health" -Headers $headers
$afterWin = $after.windows | Where-Object { $_.focused } | Select-Object -First 1
if (-not $afterWin) {
  Write-Error "VOID: the window lost focus during the gesture. Chromium throttles rAF in a background window, so every frame number from this run is a throttle artifact, not renderer cost. Re-run with nothing else taking the foreground."
}
# Correction 30: with -Win, "some window is focused" is not enough -- ANOTHER window of this same
# app taking the foreground mid-gesture backgrounds the one being recorded, and that is precisely
# the throttle gap the check above exists to refuse.
if ($Win -and "$($afterWin.id)" -ne "$Win") {
  Write-Error "VOID: window $Win lost the foreground to window $($afterWin.id) during the gesture. Its frames are a throttle artifact, not renderer cost."
}

$frames = Invoke-Eval @"
(() => {
  const a = window.$recName; a.on = false;
  const d = a.d.slice(1).sort((x, y) => x - y);
  const q = (p) => (d.length ? d[Math.min(d.length - 1, Math.floor(p * d.length))] : null);
  const r = (v) => (v === null ? null : +v.toFixed(1));
  return { frames: d.length, min: r(d[0] ?? null), p50: r(q(0.5)), p95: r(q(0.95)), max: r(d.length ? d[d.length - 1] : null),
    over16: d.filter((x) => x > 16.7).length, over33: d.filter((x) => x > 33).length, over100: d.filter((x) => x > 100).length };
})()
"@
$jankBlocks = $null
if ($Jank) {
  $jankBlocks = Invoke-Eval "(() => { const n = (window.__jank || {}).blocks ?? null; if (window.__jank) window.__jank.on = false; return n; })()"
}
# A stale global is the easiest way to 'confirm' a run that never happened.
$null = Invoke-Eval "(() => { delete window.$recName; delete window.__lip; delete window.__jank; return 'cleaned'; })()"

$sceneAfter = Invoke-Eval $sceneJs

$sorted = $times | Sort-Object
$pct = { param($p) $sorted[[Math]::Min($sorted.Count - 1, [int][Math]::Floor($p * $sorted.Count))] }

$record = [pscustomobject]@{
  interaction     = $Interaction + $(if ($Jank) { ' (CONTROL: 120 ms renderer blocks)' } else { '' })
  label           = if ($Label) { $Label } else { $Interaction }
  title           = if ($Title) { $Title } else { $null }
  root            = if ($Root) { $Root } else { $null }
  scene_before    = $sceneBefore
  scene_after     = $sceneAfter
  scene_stable    = ($sceneBefore.fwins -eq $sceneAfter.fwins -and $sceneBefore.fwinElements -eq $sceneAfter.fwinElements -and $sceneBefore.rootElements -eq $sceneAfter.rootElements)
  stale_recorder  = $staleRecorder
  gesture         = $state
  jank_blocks     = $jankBlocks
  frames          = $frames.frames
  frame_min_ms    = $frames.min
  frame_p50_ms    = $frames.p50
  frame_p95_ms    = $frames.p95
  frame_max_ms    = $frames.max
  frames_over_16  = $frames.over16
  frames_over_33  = $frames.over33
  frames_over_100 = $frames.over100
  main_samples    = $times.Count
  main_span_ms    = [math]::Round($span.Elapsed.TotalMilliseconds, 0)
  main_p50_ms     = [math]::Round((& $pct 0.50), 1)
  main_p95_ms     = [math]::Round((& $pct 0.95), 1)
  main_max_ms     = [math]::Round(($sorted | Select-Object -Last 1), 1)
}

if ($OutFile) { $record | ConvertTo-Json -Depth 8 | Set-Content -Path $OutFile -Encoding utf8 }
if ($AsJson) { $record | ConvertTo-Json -Depth 8 -Compress } else { $record }
