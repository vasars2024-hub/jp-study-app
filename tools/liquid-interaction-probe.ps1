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
  drag | resize | theme | ceiling

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

.PARAMETER Root
  CSS selector for a surface that replaces the desktop shell and therefore has no `.fwin` chrome.
  Drag dispatches pointer events only on that root; resize drives the debug bridge's `/bounds`
  route and restores the exact content size it reported before the gesture. `Root` is used only
  by drag/resize. Do not pass it for a surface hosted inside a conventional `.fwin`.

.EXAMPLE
  pwsh tools/liquid-interaction-probe.ps1 -Interaction ceiling
  pwsh tools/liquid-interaction-probe.ps1 -Interaction drag -Title Dictionary
  pwsh tools/liquid-interaction-probe.ps1 -Interaction drag -Jank    # must look worse
#>
param(
  [ValidateSet('drag', 'resize', 'theme', 'ceiling')]
  [string]$Interaction = 'ceiling',
  [int]$DurationMs = 1800,
  [switch]$Jank,
  [string]$Label = '',
  [string]$ThemeId = 'oled-black',
  [string]$Title = '',
  [string]$Root = '',
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

function Invoke-Eval([string]$js) {
  $body = @{ js = $js } | ConvertTo-Json -Compress
  $r = Invoke-RestMethod -Uri "$base/eval" -Method Post -Headers $headers -Body $body -ContentType 'application/json' -TimeoutSec 60
  if (-not $r.ok) { Write-Error "eval failed: $($r.error)" }
  return $r.result
}

# rAF is throttled in a background window. Focus, then verify -- do not assume.
$null = Invoke-RestMethod -Uri "$base/focus" -Method Post -Headers $headers -Body '{}' -ContentType 'application/json'
Start-Sleep -Milliseconds 300
$h = Invoke-RestMethod -Uri "$base/health" -Headers $headers
$win = $h.windows | Where-Object { $_.focused } | Select-Object -First 1
if (-not $win) { Write-Error "No focused window after /focus -- rAF would be throttled and every frame number void." }
if ($win.minimized) { Write-Error "Focused window is minimized -- refusing to record zeros." }

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
      $sel = if ($Interaction -eq 'drag') { '.fwin-bar' } else { '.fwin-resize' }
      $titleJs = ($Title | ConvertTo-Json -Compress)
      @"
(() => {
  const WANT = $titleJs;
  const wins = [...document.querySelectorAll('.fwin')].filter((w) => getComputedStyle(w).display !== 'none')
    .filter((w) => {
      if (!WANT) return true;
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
  window.__lip = { done: false, title: (target.w.querySelector('.fwin-title-text') || {}).textContent || '?', before: before };
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
$json = @{ js = $gestureJs } | ConvertTo-Json -Compress
$content = [System.Net.Http.StringContent]::new($json, [System.Text.Encoding]::UTF8, 'application/json')
$task = $client.PostAsync("$base/eval", $content)

# A root reader has no `.fwin-resize`; its frame is the OS window itself. Capture the content
# size from the same route that will drive it. This is also the restore source -- frame bounds
# include borders and are not byte-comparable to BrowserWindow content size.
$rootResizeBefore = $null
$rootResizeRestored = $false
$rootResizeSteps = 0
if ($Root -and $Interaction -eq 'resize') {
  $rootResizeBefore = Invoke-RestMethod -Uri "$base/bounds" -Method Post -Headers $headers -Body '{}' -ContentType 'application/json' -TimeoutSec 60
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
      $rb = @{ width = $rw; height = $rh } | ConvertTo-Json -Compress
      $null = Invoke-RestMethod -Uri "$base/bounds" -Method Post -Headers $headers -Body $rb -ContentType 'application/json' -TimeoutSec 60
      $rootResizeSteps += 1
      if ($progress -ge 1) {
        $restore = @{ width = [int]$rootResizeBefore.contentSize.width; height = [int]$rootResizeBefore.contentSize.height } | ConvertTo-Json -Compress
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
    $restore = @{ width = [int]$rootResizeBefore.contentSize.width; height = [int]$rootResizeBefore.contentSize.height } | ConvertTo-Json -Compress
    $null = Invoke-RestMethod -Uri "$base/bounds" -Method Post -Headers $headers -Body $restore -ContentType 'application/json' -TimeoutSec 60
    $rootResizeRestored = $true
  }
}
$span.Stop()
if (-not $rootResizeBefore) { try { $null = $task.GetAwaiter().GetResult() } catch { } }
$client.Dispose()

if ($rootResizeBefore) {
  $rootResizeAfter = Invoke-RestMethod -Uri "$base/bounds" -Method Post -Headers $headers -Body '{}' -ContentType 'application/json' -TimeoutSec 60
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
