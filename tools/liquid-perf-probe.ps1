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
  [string]$DuringJs
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
  $duringExpr = if ($DuringJs) { $DuringJs } else { "(() => { const t = Date.now(); while (Date.now() - t < 1500) {} return 'blocked'; })()" }
  $json = @{ js = $duringExpr } | ConvertTo-Json -Compress
  $content = [System.Net.Http.StringContent]::new($json, [System.Text.Encoding]::UTF8, 'application/json')
  $controlTask = $client.PostAsync($evalUri, $content)
  Start-Sleep -Milliseconds 120
}

$times = New-Object System.Collections.Generic.List[double]
for ($i = 0; $i -lt $Samples; $i++) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try { $null = Invoke-RestMethod -Uri $health -Headers $headers -TimeoutSec 60 } catch { }
  $sw.Stop()
  $times.Add($sw.Elapsed.TotalMilliseconds)
}

$sorted = $times | Sort-Object
$pct = { param($p) $sorted[[Math]::Min($sorted.Count - 1, [int][Math]::Floor($p * $sorted.Count))] }

if ($Control -or $DuringJs) {
  # Drain the control so the renderer is idle again before the next run measures it.
  try { $null = $controlTask.GetAwaiter().GetResult() } catch { }
  if ($client) { $client.Dispose() }
}

[pscustomobject]@{
  label   = $Label + $(if ($Control) { ' (CONTROL: renderer blocked 1500 ms)' } elseif ($DuringJs) { ' (DURING -DuringJs)' } else { '' })
  samples = $Samples
  min_ms  = [math]::Round(($sorted | Select-Object -First 1), 1)
  p50_ms  = [math]::Round((& $pct 0.50), 1)
  p95_ms  = [math]::Round((& $pct 0.95), 1)
  max_ms  = [math]::Round(($sorted | Select-Object -Last 1), 1)
} | Format-List
