<#
.SYNOPSIS
  Runs the section 10.1 baseline across every Study OS app, one app at a time.

.DESCRIPTION
  `liquid-surface-baseline.ps1` measures ONE window. Section 10.1 asks for every app, so this
  drives the shell itself: open the app from its own Start-menu row, hand the window to the
  baseline instrument unchanged, then close it again if this sweep is the one that opened it.

  Two rules it will not bend:
  - It opens apps the way a user does (Start menu row click), never by poking React state, so
    the window it measures is the one the product actually creates -- default geometry included.
  - It closes only windows IT opened. Windows already on the desk at entry (the boot layout)
    are measured in place and left exactly as found, because the desk layout is persisted and
    a sweep must not rewrite the user's desktop.

.PARAMETER Sections
  Start-menu app ids (the `app-<id>` class on `.os-start-aero-ic`). Defaults to every app the
  Start menu offers except `video`, already captured at milestone L0-baseline-1.

.PARAMETER Milestone
  Passed straight through to the baseline instrument. Baselines are never overwritten.

.EXAMPLE
  pwsh tools/liquid-app-sweep.ps1 -Sections dictionary,grammar
#>
param(
  [string[]]$Sections = @(
    'immersion', 'library', 'dictionary', 'grammar', 'flashcards', 'anki', 'youtube', 'player',
    'agent', 'music', 'scraper', 'novels', 'reading', 'translate', 'notebook', 'games', 'stats',
    'calendar', 'resources', 'settings', 'city'
  ),
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
function Get-WinTitles {
  $j = Invoke-Eval "JSON.stringify([...document.querySelectorAll('.fwin')].map((w) => ((w.querySelector('.fwin-title-text') || {}).textContent || '')))"
  return @($j | ConvertFrom-Json)
}

$null = Invoke-RestMethod -Uri "$base/focus" -Method Post -Headers $headers -Body '{}' -ContentType 'application/json'
Start-Sleep -Milliseconds 250

$bootTitles = Get-WinTitles
Write-Host "boot layout at entry: $($bootTitles -join ', ')" -ForegroundColor Cyan

$outDir = Join-Path $repo "src\.coordination\liquid-workplace\baselines\$Milestone"
$summary = @()

foreach ($sec in $Sections) {
  Write-Host "`n=== $sec ===" -ForegroundColor Yellow
  $before = Get-WinTitles

  # Open through the Start menu, exactly like a user.
  $null = Invoke-Eval "(() => { const s = document.querySelector('.os-start'); if (!s) document.querySelector('.os-start-btn').click(); return 'start'; })()"
  Start-Sleep -Milliseconds 450
  $clicked = Invoke-Eval @"
(() => { const ic = document.querySelector('.os-start-aero-ic.app-$sec');
  if (!ic) return 'no start row';
  const row = ic.closest('.os-start-aero-app') || ic.closest('button') || ic.parentElement;
  row.click(); return 'opened'; })()
"@
  if ($clicked -ne 'opened') {
    Write-Warning "$sec -- $clicked; skipped"
    $summary += [pscustomobject]@{ section = $sec; title = ''; status = "SKIPPED: $clicked" }
    continue
  }
  Start-Sleep -Milliseconds 900

  $after = Get-WinTitles
  $new = @($after | Where-Object { $_ -notin $before })
  $opened = $new.Count -gt 0
  $selector = ''
  if ($opened -and $new[0] -eq '') {
    # A frameless window has no `.fwin-title-text`, so it cannot be addressed by title. It is
    # still a real app window and must be measured, not skipped -- address it by selector and
    # label the record with the section id.
    $selector = '.fwin-frameless'
    $title = $sec
    Write-Host "$sec -> frameless window, addressed by selector '$selector'"
  } elseif ($opened) {
    $title = $new[0]
  } else {
    # No new window: the section was already on the desk and `open()` re-focused it.
    $title = Invoke-Eval "(() => { const w = document.querySelector('.fwin.focused'); return w ? ((w.querySelector('.fwin-title-text') || {}).textContent || '') : ''; })()"
    if (-not $title) {
      Write-Warning "$sec -- no new window and no focused window; skipped"
      $summary += [pscustomobject]@{ section = $sec; title = ''; status = 'SKIPPED: window not identified' }
      continue
    }
  }
  Write-Host "$sec -> window '$title' (newly opened: $opened)"

  $status = 'ok'
  try {
    & (Join-Path $PSScriptRoot 'liquid-surface-baseline.ps1') -Title $title -Selector $selector -Sizes $Sizes -Milestone $Milestone | Out-Host
  } catch {
    $status = "BASELINE FAILED: $($_.Exception.Message)"
    Write-Warning "$sec -- $status"
  }

  # Close ONLY what this sweep opened. The boot layout is persisted state, not scratch space.
  if ($opened) {
    $closeExpr = if ($selector) { "document.querySelector('$selector')" } else { "[...document.querySelectorAll('.fwin')].find((x) => ((x.querySelector('.fwin-title-text') || {}).textContent || '') === '$title')" }
    $null = Invoke-Eval @"
(() => { const w = ($closeExpr);
  if (!w) return 'gone'; const btn = w.querySelector('.fwin-close'); if (!btn) return 'no close control'; btn.click(); return 'closed'; })()
"@
    Start-Sleep -Milliseconds 450
  }

  $row = [ordered]@{ section = $sec; title = $title; openedBySweep = $opened; status = $status }
  foreach ($size in $Sizes) {
    $p = Join-Path $outDir ("$($title.ToLower())-$size.json")
    if (Test-Path -LiteralPath $p) {
      $r = Get-Content -LiteralPath $p -Raw | ConvertFrom-Json
      $row["$size"] = "$($r.rect.w)x$($r.rect.h) foc=$($r.controls.focusable) inv=$($r.focusOrder.inversions) u24=$($r.controls.under24) u44=$($r.controls.under44) routes=$($r.routes.count) clipX=$($r.overflow.clippedX) unreach=$($r.overflow.unreachable) dom=$($r.domNodes) settled=$($r.settle.settled)"
    } else {
      $row["$size"] = 'NOT RECORDED'
    }
  }
  $summary += [pscustomobject]$row
}

$endTitles = Get-WinTitles
$leaked = @($endTitles | Where-Object { $_ -notin $bootTitles })
$lost = @($bootTitles | Where-Object { $_ -notin $endTitles })
Write-Host "`nboot layout at exit: $($endTitles -join ', ')" -ForegroundColor Cyan
if ($leaked.Count -gt 0) { Write-Warning "LEAKED windows the sweep left open: $($leaked -join ', ')" }
if ($lost.Count -gt 0) { Write-Warning "LOST windows that were open at entry: $($lost -join ', ')" }
if ($leaked.Count -eq 0 -and $lost.Count -eq 0) { Write-Host 'desk restored to its entry window set.' -ForegroundColor Green }

$sumPath = Join-Path $outDir 'sweep-summary.json'
$summary | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $sumPath -Encoding utf8
Write-Host "summary -> $sumPath"
$summary | Format-Table -AutoSize
