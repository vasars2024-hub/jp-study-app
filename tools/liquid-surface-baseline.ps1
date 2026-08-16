<#
.SYNOPSIS
  The section 10.1 baseline capture, driven rather than read.

.DESCRIPTION
  Section 10.1 asks, for every app: standard mode at default size, at its smallest supported
  size and maximized; visible features and every alternate route; computed geometry, overflow,
  focus order and hit targets; empty/loading/error/offline states; theme/material and motion
  preference. This script harvests all of that from the LIVE window through the debug bridge
  and writes one JSON record per size under
  `src/.coordination/liquid-workplace/baselines/`.

  Mechanical on purpose, exactly like `liquid-census.cjs`: a baseline that a later scorecard
  is compared against must re-derive, not be trusted. The census counts words in source; this
  measures boxes in the running app, and the two disagree in interesting places.

  What it will NOT do:
  - score a minimized or zero-size window -- it refuses, because every box measures 0x0 there
    and "does anything overflow?" then answers no. A silent pass is the worst kind.
  - claim a state exists because a string does. `states` records which of empty/loading/error/
    offline are RENDERED right now; a state not currently on screen is absent from the record
    rather than assumed present.

.PARAMETER Title
  The `.fwin-title-text` of the target window, e.g. `Video`.

.PARAMETER Sizes
  Any of default,min,max. `min` drives the window to MIN_W x MIN_H (260x170, DesktopShell.tsx
  :266) through the product's own resize commit, then restores the entry geometry exactly.

.PARAMETER Milestone
  Baselines are never overwritten; this names the milestone directory.

.EXAMPLE
  pwsh tools/liquid-surface-baseline.ps1 -Title Video
#>
param(
  [Parameter(Mandatory = $true)][string]$Title,
  [string[]]$Sizes = @('default', 'min', 'max'),
  [string]$Milestone = 'L0-baseline-1'
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$bridgePath = Join-Path $repo 'debug\bridge.json'
if (-not (Test-Path $bridgePath)) { Write-Error 'No debug/bridge.json -- no dev-server app is running.' }
$b = Get-Content $bridgePath -Raw | ConvertFrom-Json
$headers = @{ Authorization = "Bearer $($b.token)" }
$base = "http://127.0.0.1:$($b.port)"

function Invoke-Eval([string]$js) {
  $body = @{ js = $js } | ConvertTo-Json -Compress
  $r = Invoke-RestMethod -Uri "$base/eval" -Method Post -Headers $headers -Body $body -ContentType 'application/json' -TimeoutSec 60
  if (-not $r.ok) { Write-Error "eval failed: $($r.error)" }
  return $r.result
}

# rAF and layout settle differently in a background window; focus first (jp-bridge section 4).
$null = Invoke-RestMethod -Uri "$base/focus" -Method Post -Headers $headers -Body '{}' -ContentType 'application/json'
Start-Sleep -Milliseconds 250

$find = @"
(() => { const w = [...document.querySelectorAll('.fwin')].find((x) => ((x.querySelector('.fwin-title-text') || {}).textContent || '') === '$Title');
  return w ? { found: true, x: w.style.left, y: w.style.top, w: w.style.width, h: w.style.height, max: w.classList.contains('fwin-max') } : { found: false }; })()
"@
$entry = Invoke-Eval $find
if (-not $entry.found) { Write-Error "No .fwin titled '$Title' -- open it first." }
Write-Host "entry geometry: $($entry.w) x $($entry.h) at ($($entry.x),$($entry.y)) max=$($entry.max)"

# --- the harvest ----------------------------------------------------------------------
$harvest = @"
(() => {
  const T = '$Title';
  const win = [...document.querySelectorAll('.fwin')].find((x) => ((x.querySelector('.fwin-title-text') || {}).textContent || '') === T);
  if (!win) return { refuse: 'no .fwin titled ' + T };
  if (getComputedStyle(win).display === 'none') return { refuse: 'window not displayed -- measurement invalid' };
  const R = win.getBoundingClientRect();
  if (R.width === 0 || R.height === 0) return { refuse: 'zero-size box -- refusing to record zeros' };

  const vis = (e) => { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
  const nm = (e) => (e.getAttribute('aria-label') || e.getAttribute('title') || (e.textContent || '').trim() || e.getAttribute('placeholder') || e.tagName.toLowerCase()).replace(/\s+/g, ' ').slice(0, 44);

  const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"]),[role=button],[role=tab],[role=slider],[role=menuitem],[role=switch],video,audio';
  const foc = [...win.querySelectorAll(FOCUSABLE)].filter(vis).filter((e) => !e.disabled && e.getAttribute('aria-hidden') !== 'true');
  const boxes = foc.map((e) => e.getBoundingClientRect());

  // Focus order vs visual order: reading order is top-then-left, banded to 8 px so a row of
  // controls at slightly different y is one row rather than a staircase of false inversions.
  const band = 8;
  const order = boxes.map((b, i) => ({ i, t: Math.round(b.top / band), l: Math.round(b.left) }))
    .sort((a, b2) => (a.t - b2.t) || (a.l - b2.l) || (a.i - b2.i)).map((o) => o.i);
  let inversions = 0;
  for (let i = 0; i < order.length; i += 1) if (order[i] !== i) inversions += 1;
  const firstInversion = order.findIndex((v, i) => v !== i);

  const hit = foc.map((e, i) => ({ n: nm(e), w: Math.round(boxes[i].width), h: Math.round(boxes[i].height) }));
  const under24 = hit.filter((o) => o.w < 24 || o.h < 24);
  const under44 = hit.filter((o) => o.w < 44 || o.h < 44).length;

  const all = [...win.querySelectorAll('*')].filter(vis);
  const clippedX = all.filter((e) => e.scrollWidth > e.clientWidth + 1 && /hidden|clip/.test(getComputedStyle(e).overflowX)).map((e) => ({ n: nm(e), c: e.className.toString().slice(0, 40), over: e.scrollWidth - e.clientWidth }));
  const isScroller = (e) => { const s = getComputedStyle(e); return (/auto|scroll/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 1) || (/auto|scroll/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 1); };
  const scrollersY = all.filter((e) => { const s = getComputedStyle(e); return /auto|scroll/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 1; }).length;
  // Extending past the window frame is NOT a defect on its own: a page taller than its window
  // inside a scroller is the normal case, and counting it produced 89 "overflowing" elements
  // on a healthy surface. Split it: reachable by scrolling vs genuinely unreachable.
  const past = all.filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > R.right + 1 || b.left < R.left - 1 || b.bottom > R.bottom + 1 || b.top < R.top - 1); });
  const scrollable = (e) => { let p = e.parentElement; while (p && p !== win.parentElement) { if (isScroller(p)) return true; p = p.parentElement; } return false; };
  const unreachable = past.filter((e) => !scrollable(e)).map((e) => ({ n: nm(e), c: e.className.toString().slice(0, 40) }));
  const outside = past.map((e) => ({ n: nm(e), c: e.className.toString().slice(0, 40) }));

  // Routes: every named tab / nav item / menu entry currently reachable in this window.
  const routes = [...win.querySelectorAll('[role=tab],[role=menuitem],nav a,nav button,[class*=tab],[class*=nav-]')].filter(vis)
    .map((e) => ({ n: nm(e), role: e.getAttribute('role') || e.tagName.toLowerCase(), sel: e.getAttribute('aria-selected') || e.classList.contains('active') || null }));

  // States RENDERED right now -- not states whose strings exist somewhere in the source.
  //
  // The keyword form of this was WRONG and returned all-false while the surface was literally
  // showing "Video playback needs the media server" and "No video loaded": a phrase-list can
  // only recognise the phrases someone thought of. So the boolean stays as a hint, and the
  // VERBATIM text of every state-bearing block is recorded next to it -- a reader can see the
  // state even when the regex misses it, which is the whole point of a baseline.
  const txt = (win.innerText || '');
  const has = (re) => re.test(txt);
  const stateBlocks = [...win.querySelectorAll('[class*=empty],[class*=error],[class*=notice],[class*=placeholder],[class*=warning],[role=alert],[role=status]')]
    .filter(vis).map((e) => ({ c: e.className.toString().slice(0, 40), t: (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 180) }))
    .filter((o) => o.t.length > 0).slice(0, 10);
  const states = { empty: has(/no (items|results|episodes|files|videos?|entries|subs)|nothing (here|yet)|empty/i),
    loading: has(/loading|preparing|scanning/i) || win.querySelectorAll('[class*=spinner],[class*=skeleton],[aria-busy=true]').length > 0,
    error: has(/error|failed|could not|unable to|needs the/i), offline: has(/offline|not connected|disconnected|unreachable/i),
    keywordFormIsAHint: true };

  const roles = {}; for (const e of foc) { const k = e.getAttribute('role') || e.tagName.toLowerCase(); roles[k] = (roles[k] || 0) + 1; }

  return {
    title: T,
    rect: { x: Math.round(R.x), y: Math.round(R.y), w: Math.round(R.width), h: Math.round(R.height) },
    maximized: win.classList.contains('fwin-max'),
    viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
    theme: { dataTheme: document.documentElement.getAttribute('data-theme'), materials: document.documentElement.getAttribute('data-materials'),
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, forcedColors: matchMedia('(forced-colors: active)').matches },
    controls: { focusable: foc.length, byRole: roles, under24: under24.length, under24list: under24.slice(0, 12), under44: under44 },
    focusOrder: { count: foc.length, inversions: inversions, firstInversionAt: firstInversion,
      domOrder: foc.slice(0, 40).map((e, i) => ({ i: i, n: nm(e), top: Math.round(boxes[i].top - R.top), left: Math.round(boxes[i].left - R.left) })) },
    overflow: { clippedX: clippedX.length, clippedXList: clippedX.slice(0, 8), scrollersY: scrollersY,
      pastWindowFrame: outside.length, pastList: outside.slice(0, 8),
      unreachable: unreachable.length, unreachableList: unreachable.slice(0, 8) },
    routes: { count: routes.length, list: routes.slice(0, 40) },
    states: states, stateBlocks: stateBlocks,
    textChars: txt.length,
    domNodes: win.querySelectorAll('*').length
  };
})()
"@

$outDir = Join-Path $repo "src\.coordination\liquid-workplace\baselines\$Milestone"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }

$results = @()
foreach ($size in $Sizes) {
  switch ($size) {
    'default' { }
    'max' {
      $null = Invoke-Eval @"
(() => { const w = [...document.querySelectorAll('.fwin')].find((x) => ((x.querySelector('.fwin-title-text') || {}).textContent || '') === '$Title');
  if (w.classList.contains('fwin-max')) return 'already max';
  const btn = [...w.querySelectorAll('.fwin-b')].find((e) => /maxim/i.test(e.getAttribute('title') || ''));
  if (!btn) return 'no maximize control'; btn.click(); return 'maximized'; })()
"@
    }
    'min' {
      # Drive the product's own resizeStart to MIN_W x MIN_H rather than writing style, so the
      # committed state is what a user's smallest window actually is.
      $null = Invoke-Eval @"
(() => {
  const w = [...document.querySelectorAll('.fwin')].find((x) => ((x.querySelector('.fwin-title-text') || {}).textContent || '') === '$Title');
  const grip = w.querySelector('.fwin-resize'); const g = grip.getBoundingClientRect();
  const sx = Math.round(g.left + g.width / 2), sy = Math.round(g.top + g.height / 2);
  const oSet = Element.prototype.setPointerCapture, oRel = Element.prototype.releasePointerCapture;
  Element.prototype.setPointerCapture = function () {}; Element.prototype.releasePointerCapture = function () {};
  const ev = (t, x, y) => grip.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, isPrimary: true }));
  ev('pointerdown', sx, sy); ev('pointermove', sx - 4000, sy - 4000); ev('pointerup', sx - 4000, sy - 4000);
  Element.prototype.setPointerCapture = oSet; Element.prototype.releasePointerCapture = oRel;
  return 'shrunk';
})()
"@
    }
  }
  Start-Sleep -Milliseconds 700
  $rec = Invoke-Eval $harvest
  if ($rec.refuse) { Write-Error "REFUSED at size '$size': $($rec.refuse)" }
  $rec | Add-Member -NotePropertyName sizeMode -NotePropertyValue $size -Force
  $rec | Add-Member -NotePropertyName capturedAt -NotePropertyValue (Get-Date).ToString('o') -Force
  $path = Join-Path $outDir ("$($Title.ToLower())-$size.json")
  $rec | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $path -Encoding utf8
  Write-Host "$size -> $($rec.rect.w)x$($rec.rect.h)  focusable $($rec.controls.focusable)  inversions $($rec.focusOrder.inversions)  under24 $($rec.controls.under24)  pastFrame $($rec.overflow.pastWindowFrame) (unreachable $($rec.overflow.unreachable))  -> $path"
  $results += $rec

  # Restore before the next size, so each capture starts from the entry geometry.
  if ($size -eq 'max') {
    $null = Invoke-Eval @"
(() => { const w = [...document.querySelectorAll('.fwin')].find((x) => ((x.querySelector('.fwin-title-text') || {}).textContent || '') === '$Title');
  if (!w.classList.contains('fwin-max')) return 'not max';
  const btn = [...w.querySelectorAll('.fwin-b')].find((e) => /restore|maxim/i.test(e.getAttribute('title') || '')); btn.click(); return 'restored'; })()
"@
    Start-Sleep -Milliseconds 500
  }
}

# --- restore the entry geometry through the PRODUCT's commit path, then verify ----------
#
# An earlier version of this restore wrote `w.style.width` directly. It looked right and was
# wrong: the inline style is not the committed state, so the window read 1080x700 in the DOM
# while `desktop-layout.json` held the 260x170 the `min` capture had committed -- and the NEXT
# run then measured a window React believed was already at minimum and quietly captured three
# identical "sizes". Restoring has to go through `resizeStart`/`onPatch` like a user's drag.
$restore = @"
(() => {
  const w = [...document.querySelectorAll('.fwin')].find((x) => ((x.querySelector('.fwin-title-text') || {}).textContent || '') === '$Title');
  if (w.classList.contains('fwin-max')) { const btn = [...w.querySelectorAll('.fwin-b')].find((e) => /restore|maxim/i.test(e.getAttribute('title') || '')); if (btn) btn.click(); }
  const targetW = parseFloat('$($entry.w)'), targetH = parseFloat('$($entry.h)');
  const r = w.getBoundingClientRect();
  const grip = w.querySelector('.fwin-resize'); const g = grip.getBoundingClientRect();
  const sx = Math.round(g.left + g.width / 2), sy = Math.round(g.top + g.height / 2);
  const oSet = Element.prototype.setPointerCapture, oRel = Element.prototype.releasePointerCapture;
  Element.prototype.setPointerCapture = function () {}; Element.prototype.releasePointerCapture = function () {};
  const ev = (t, x, y) => grip.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, isPrimary: true }));
  const dx = Math.round(targetW - r.width), dy = Math.round(targetH - r.height);
  ev('pointerdown', sx, sy); ev('pointermove', sx + dx, sy + dy); ev('pointerup', sx + dx, sy + dy);
  Element.prototype.setPointerCapture = oSet; Element.prototype.releasePointerCapture = oRel;
  return { requestedDx: dx, requestedDy: dy };
})()
"@
$null = Invoke-Eval $restore
Start-Sleep -Milliseconds 400
# Verification that actually distinguishes DOM from state: maximize and restore forces React to
# rewrite width/height from `win.w`/`win.h`, so whatever the box reads afterwards IS the state.
$null = Invoke-Eval @"
(() => { const w = [...document.querySelectorAll('.fwin')].find((x) => ((x.querySelector('.fwin-title-text') || {}).textContent || '') === '$Title');
  const btn = [...w.querySelectorAll('.fwin-b')].find((e) => /maxim/i.test(e.getAttribute('title') || '')); btn.click(); return 'max'; })()
"@
Start-Sleep -Milliseconds 400
$null = Invoke-Eval @"
(() => { const w = [...document.querySelectorAll('.fwin')].find((x) => ((x.querySelector('.fwin-title-text') || {}).textContent || '') === '$Title');
  const btn = [...w.querySelectorAll('.fwin-b')].find((e) => /restore|maxim/i.test(e.getAttribute('title') || '')); btn.click(); return 'restored'; })()
"@
Start-Sleep -Milliseconds 500
$after = Invoke-Eval $find
$ok = ($after.w -ceq $entry.w) -and ($after.h -ceq $entry.h)
Write-Host "restored (state-verified through a max/restore round trip): $($after.w) x $($after.h) at ($($after.x),$($after.y))  byte-identical to entry: $ok"
if (-not $ok) { Write-Warning "GEOMETRY NOT RESTORED -- entry was $($entry.w)x$($entry.h), state now $($after.w)x$($after.h). The desk clamps to (deskW - win.x - 2); a window opened near the right/bottom edge cannot be restored past that." }

$results | Select-Object sizeMode, @{n='rect';e={"$($_.rect.w)x$($_.rect.h)"}}, @{n='focusable';e={$_.controls.focusable}},
  @{n='inversions';e={$_.focusOrder.inversions}}, @{n='under24';e={$_.controls.under24}}, @{n='under44';e={$_.controls.under44}},
  @{n='routes';e={$_.routes.count}}, @{n='clippedX';e={$_.overflow.clippedX}}, @{n='pastFrame';e={$_.overflow.pastWindowFrame}},
  @{n='unreachable';e={$_.overflow.unreachable}}, @{n='scrollersY';e={$_.overflow.scrollersY}}, @{n='domNodes';e={$_.domNodes}} | Format-Table -AutoSize
