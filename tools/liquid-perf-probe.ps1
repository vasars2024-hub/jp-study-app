<#
.SYNOPSIS
  Liquid rubric category 7 instrument: the longest main-process block under load.

.DESCRIPTION
  `/health` is handled on Electron's main thread, so the round-trip latency of a burst of
  `/health` calls IS the main event loop's responsiveness. That is the whole trick, and it is
  why the rubric names this probe: the 7954921a enrichment defect showed as a 36,910 ms
  /health during the run against 1 ms after it. A probe that cannot reproduce that SHAPE is
  not sensitive enough to score category 7, so -Control exists to prove it can.

  Reports min / median / p95 / max, never a mean -- a mean hides exactly the one long block
  this is looking for, which is the number that matters.

.PARAMETER Samples
  How many /health round trips to take. Default 40.

.PARAMETER Label
  Free text recorded with the run, e.g. "idle" or "during deck audit".

.PARAMETER DurationMs
  Sample for this many milliseconds of WALL CLOCK instead of for a fixed -Samples count.
  Use it whenever -DuringJs fires work that takes time: 40 samples at an idle p50 of 1.3 ms
  are over in ~52 ms, so a 240 ms operation is measured across its first fiftieth and a
  clean number means nothing. `span_ms` in the record is the coverage actually achieved.

.PARAMETER Control
  Negative control. Blocks the RENDERER for ~1500 ms and samples across it. The renderer
  block must NOT move these numbers -- /health touches main only. A run where -Control
  changes the distribution means the probe is measuring the wrong process and every number
  it has ever produced is void.

.EXAMPLE
  pwsh tools/liquid-perf-probe.ps1 -Samples 40 -Label idle
  pwsh tools/liquid-perf-probe.ps1 -Control
#>
param(
  [int]$Samples = 40,
  [string]$Label = 'unlabelled',
  [switch]$Control,
  [string]$DuringJs,
  [int]$DurationMs = 0,
  # CORRECTION, 2026-08-31 (sibling of the interaction probe's correction 30). /eval resolves the
  # FOCUSED OS window, so -DuringJs for a surface that lives in its own BrowserWindow -- Blanc,
  # the Agent pop-out -- ran against the desktop's document, found nothing, and the load silently
  # never happened while the distribution still read clean. Pinning the window is what makes a
  # heavy leg for a non-main surface measurable at all. Unset, behaviour is unchanged.
  [string]$Win = '',
  [switch]$AsJson
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$bridgePath = Join-Path $repo 'debug\bridge.json'
if (-not (Test-Path $bridgePath)) {
  Write-Error "No debug/bridge.json -- no dev-server app is running. A packaged build never has a bridge."
}
$b = Get-Content $bridgePath -Raw | ConvertFrom-Json
$headers = @{ Authorization = "Bearer $($b.token)" }
$health = "http://127.0.0.1:$($b.port)/health"
$evalUri = "http://127.0.0.1:$($b.port)/eval"

# Prove the bridge answers before timing anything, so a dead port cannot read as 0 ms.
try { $null = Invoke-RestMethod -Uri $health -Headers $headers -TimeoutSec 10 }
catch { Write-Error "Bridge did not answer /health: $_" }

$client = $null
$controlTask = $null
if ($Control -or $DuringJs) {
  # Busy-wait the renderer. /health is main-only, so this must NOT show up.
  #
  # This MUST NOT use Start-Job. The first version did, and the control came back
  # p95 41.5 ms / max 224.3 ms against an idle p95 of 3.5 -- which reads exactly like a
  # main-process block and is not one. Start-Job spawns a fresh PowerShell process, and
  # that process's own startup CPU is what the probe measured. The harness has to stay
  # off the CPU it is timing, so the request goes out on an async HttpClient task in
  # THIS process instead.
  Add-Type -AssemblyName System.Net.Http
  $client = [System.Net.Http.HttpClient]::new()
  $client.DefaultRequestHeaders.Add('Authorization', "Bearer $($b.token)")
  # -DuringJs is JS TEXT *or* a path to a probe file. It used to be text only, and handing it a
  # path -- which is what every probe in `probes/` is, and what this repo's own handoffs told
  # workers to pass -- sent the literal string "probes/l7f-first-examples.js" to /eval. That is not
  # an expression, /eval throws, the throw is never read, and the run reports a clean distribution
  # indistinguishable from a fast surface. It bought a false exoneration on 2026-08-25 (max 5.9 ms
  # on a call that actually cost 6,590.8 ms) and, before that, one on the leg it was written for.
  #
  # ...and the path branch then had to be told what a path is NOT. `Join-Path` normalises forward
  # slashes to backslashes and THROWS a terminating "The filename, directory name, or volume label
  # syntax is incorrect" on the result, so any inline expression carrying a regex literal or a `//`
  # comment killed the whole run before a single sample was taken -- measured 2026-09-03, cat7's
  # Video heavy leg died exactly here, at this line, with the failure reported against the surface.
  # A path is one line, short, and free of the characters Windows forbids in one; anything else is
  # JS text and must never reach Join-Path. The try/catch is the belt to that braces: a malformed
  # candidate makes this fall back to treating the argument as text, never abort the measurement.
  $duringExpr = if ($DuringJs) {
    # The colon is allowed only where a drive letter puts it, so `C:\repo\probes\x.js` still
    # resolves while `'REFUSE: no Video page'` does not.
    $looksLikePath = $DuringJs.Length -lt 260 -and $DuringJs -notmatch '[\r\n]' -and
      $DuringJs.IndexOfAny([char[]]'<>"|?*') -lt 0 -and
      ($DuringJs.IndexOf(':') -lt 0 -or $DuringJs -match '^[A-Za-z]:[\\/][^:]*$')
    $asPath = if (-not $looksLikePath) { $null }
      elseif ([System.IO.Path]::IsPathRooted($DuringJs)) { $DuringJs }
      else { try { Join-Path $repo $DuringJs } catch { $null } }
    if ($asPath -and (Test-Path -LiteralPath $asPath -PathType Leaf)) { Get-Content -LiteralPath $asPath -Raw } else { $DuringJs }
  } else {
    "(() => { const t = Date.now(); while (Date.now() - t < 1500) {} return 'blocked'; })()"
  }
  $duringBody = @{ js = $duringExpr }
  if ($Win) { $duringBody['window'] = $Win }
  $json = $duringBody | ConvertTo-Json -Compress
  $content = [System.Net.Http.StringContent]::new($json, [System.Text.Encoding]::UTF8, 'application/json')
  $controlTask = $client.PostAsync($evalUri, $content)
  Start-Sleep -Milliseconds 120
}

# A FIXED SAMPLE COUNT DOES NOT COVER A LOAD, and that is how this probe reports a pass it
# has not earned. At an idle p50 of 1.3 ms, 40 back-to-back /health calls are over in ~52 ms
# -- so a surface whose heaviest operation runs for 240 ms, or for eight seconds, is sampled
# only across its first fiftieth. The interaction probe learned this and switched to a
# wall-clock window; this one had not. -DurationMs samples for a wall-clock span instead, and
# `span_ms` is reported so the coverage is visible in the record rather than assumed. The
# 15 ms gap keeps the probe from being the load it is measuring, exactly as over there.
$times = New-Object System.Collections.Generic.List[double]
$span = [System.Diagnostics.Stopwatch]::StartNew()
if ($DurationMs -gt 0) {
  while ($span.Elapsed.TotalMilliseconds -lt $DurationMs) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try { $null = Invoke-RestMethod -Uri $health -Headers $headers -TimeoutSec 60 } catch { }
    $sw.Stop()
    $times.Add($sw.Elapsed.TotalMilliseconds)
    Start-Sleep -Milliseconds 15
  }
} else {
  for ($i = 0; $i -lt $Samples; $i++) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try { $null = Invoke-RestMethod -Uri $health -Headers $headers -TimeoutSec 60 } catch { }
    $sw.Stop()
    $times.Add($sw.Elapsed.TotalMilliseconds)
  }
}
$span.Stop()

$sorted = $times | Sort-Object
$pct = { param($p) $sorted[[Math]::Min($sorted.Count - 1, [int][Math]::Floor($p * $sorted.Count))] }

if ($Control -or $DuringJs) {
  # Drain the control so the renderer is idle again before the next run measures it.
  try { $null = $controlTask.GetAwaiter().GetResult() } catch { }
  if ($client) { $client.Dispose() }
}

$record = [pscustomobject]@{
  label   = $Label + $(if ($Control) { ' (CONTROL: renderer blocked 1500 ms)' } elseif ($DuringJs) { ' (DURING -DuringJs)' } else { '' })
  samples = $times.Count
  span_ms = [math]::Round($span.Elapsed.TotalMilliseconds, 0)
  min_ms  = [math]::Round(($sorted | Select-Object -First 1), 1)
  p50_ms  = [math]::Round((& $pct 0.50), 1)
  p95_ms  = [math]::Round((& $pct 0.95), 1)
  max_ms  = [math]::Round(($sorted | Select-Object -Last 1), 1)
}
if ($AsJson) { $record | ConvertTo-Json -Compress } else { $record | Format-List }
