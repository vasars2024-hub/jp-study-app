<#
.SYNOPSIS
  Click an element in the live app, hit-testing with elementFromPoint first.

.DESCRIPTION
  The app stacks draggable windows in one DOM, so a coordinate click can land on
  a different window than the one you meant. The result looks like "the control
  did nothing" — which is exactly the false finding an audit must not produce.

  This script resolves the selector, computes its centre, asks the renderer what
  is ACTUALLY at that point, and REFUSES to click when the hit element is not
  the target or a descendant of it.

.PARAMETER Twice
  Send the same click twice. Inside a popped-out OS window the first click
  focuses the window and the second activates the control — the documented
  working procedure (docs/migration/TEST_EVIDENCE.md:68-75).

.PARAMETER Force
  Click anyway after a hit-test mismatch. The mismatch is still reported.
  Anything measured after -Force is suspect; say so in the finding.

.EXAMPLE
  .\click.ps1 -Selector '#deck-save'

.EXAMPLE
  .\click.ps1 -Selector '.rail-item[data-id="media"]' -Window 3 -Twice
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory, Position = 0)]
    [string] $Selector,

    [string] $Window = 'main',

    [switch] $Twice,
    [switch] $Force,

    # Skip the automatic /focus. Chromium throttles rAF in a background window,
    # so reveal-on-next-frame effects never run — only skip this deliberately.
    [switch] $NoFocus
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

function Invoke-Eval {
    param([string] $Expression)
    $res = Invoke-Bridge -Route '/eval' -Body @{ js = $Expression; window = $Window }
    return (Assert-BridgeOk $res '/eval').result
}

if (-not $NoFocus) {
    # debugBridge.ts:341-364 — restores if minimised, raises, and steals
    # foreground, which is what makes rAF-driven effects actually run.
    $f = Invoke-Bridge -Route '/focus' -Body @{ window = $Window }
    Assert-BridgeOk $f '/focus' | Out-Null
}

# One round-trip returns geometry, visibility and the hit-test together, so the
# element cannot move between measuring it and testing the point.
$selJson = $Selector | ConvertTo-Json -Compress
$probe = Invoke-Eval @"
(() => {
  const el = document.querySelector($selJson);
  if (!el) return { found: false };
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) {
    return { found: true, zero: true, display: getComputedStyle(el).display };
  }
  const x = Math.round(r.left + r.width / 2);
  const y = Math.round(r.top + r.height / 2);
  const hit = document.elementFromPoint(x, y);
  return {
    found: true, zero: false, x, y,
    rect: { w: Math.round(r.width), h: Math.round(r.height) },
    isTarget: hit === el || el.contains(hit),
    hitTag: hit ? hit.tagName.toLowerCase() : null,
    hitClass: hit ? String(hit.className || '').slice(0, 120) : null,
    hitId: hit ? (hit.id || null) : null
  };
})()
"@

if (-not $probe.found) {
    throw "No element matches '$Selector' in window '$Window'. Check the selector against /dom before concluding anything about the control."
}

if ($probe.zero) {
    # A 0x0 box is the minimised-window signature: every measurement reads as
    # perfect. Refuse rather than click into nothing and record a pass.
    throw @"
'$Selector' measures 0x0 (display: $($probe.display)).

This is the minimised/hidden-window trap — a 0x0 box scores as perfect on
almost every check. Do not record a measurement from this state. Restore the
window (/focus restores a minimised window) and retry.
"@
}

if (-not $probe.isTarget) {
    $msg = @"
HIT-TEST MISMATCH — refusing to click.

  target   : $Selector
  point    : ($($probe.x), $($probe.y))  [centre of a $($probe.rect.w)x$($probe.rect.h) box]
  actually : <$($probe.hitTag)> id='$($probe.hitId)' class='$($probe.hitClass)'

Another element is on top at that point — usually a stacked .fwin window. A
click here lands somewhere else and looks like 'the control did nothing'.

Fix the stacking (raise the intended window, or pop the surface out into its own
OS window and drive it with -Window <id>), then retry. Use -Force only if you
intend to click through the overlay, and mark the measurement suspect.
"@
    if (-not $Force) { throw $msg }
    Write-Warning $msg
}

$rounds = if ($Twice) { 2 } else { 1 }
for ($i = 1; $i -le $rounds; $i++) {
    $res = Invoke-Bridge -Route '/click' -Body @{ x = $probe.x; y = $probe.y; window = $Window }
    Assert-BridgeOk $res "/click ($i of $rounds)" | Out-Null
    if ($i -lt $rounds) { Start-Sleep -Milliseconds 120 }
}

[pscustomobject]@{
    selector = $Selector
    window   = $Window
    x        = $probe.x
    y        = $probe.y
    clicks   = $rounds
    hitTest  = if ($probe.isTarget) { 'match' } else { 'FORCED-MISMATCH' }
}

# Reminder, not enforced: /screenshot lags exactly one call. Insert another
# round-trip (eval.ps1 -Js '1') before capturing, or you capture the pre-click
# frame and read it as "nothing happened".
