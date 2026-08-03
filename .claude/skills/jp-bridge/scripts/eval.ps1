<#
.SYNOPSIS
  Evaluate a JS expression in a live jp-study-app window via the debug bridge.

.DESCRIPTION
  /eval splices your code into `(${code})` inside an IIFE (debugBridge.ts:234-238),
  so it must be a SINGLE EXPRESSION and it does NOT await. This script enforces
  the first and gives you -Poll for the second.

  -Poll implements the only correct way to await through this endpoint: your
  expression stashes a settled state on a global, and -Poll re-reads that global
  until it reports done. It fails loudly on timeout instead of handing back a
  half-settled object.

.EXAMPLE
  .\eval.ps1 -Health

.EXAMPLE
  .\eval.ps1 -Js "document.querySelectorAll('.fwin').length"

.EXAMPLE
  # kick off async work, then wait for it
  .\eval.ps1 -Js "(() => { window.__probe={done:false}; api.study.prepare().then(r=>{window.__probe={done:true,ok:true,value:r}}); return 'started' })()"
  .\eval.ps1 -Js "window.__probe" -Poll
#>
[CmdletBinding(DefaultParameterSetName = 'Eval')]
param(
    [Parameter(ParameterSetName = 'Eval', Mandatory, Position = 0)]
    [string] $Js,

    [Parameter(ParameterSetName = 'Health', Mandatory)]
    [switch] $Health,

    [Parameter(ParameterSetName = 'Eval')]
    [string] $Window = 'main',

    # Re-read the expression until it returns an object with done=true.
    [Parameter(ParameterSetName = 'Eval')]
    [switch] $Poll,

    [Parameter(ParameterSetName = 'Eval')]
    [int] $TimeoutSec = 20,

    [Parameter(ParameterSetName = 'Eval')]
    [int] $IntervalMs = 250,

    # Emit the raw response envelope instead of just the result.
    [switch] $Raw
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

if ($Health) {
    $res = Invoke-Bridge -Route '/health' -Method 'GET'
    Assert-BridgeOk $res '/health' | Out-Null
    return $res
}

if ([string]::IsNullOrWhiteSpace($Js)) {
    throw "-Js is empty. Pass an expression; the bridge rejects an empty 'js' field (debugBridge.ts:230)."
}

# Cheap guard against the single-expression rule. A leading statement keyword is
# a syntax error once spliced into `(...)`, and the bridge reports it as a
# generic eval failure that reads like the app is broken.
if ($Js -match '^\s*(const|let|var|return|if|for|while|function|class)\b') {
    throw @"
-Js starts with a statement keyword, but /eval splices code into `(...)` — a
statement is a syntax error there. Wrap it in an IIFE:

  (() => { $($Js -replace '\r?\n', ' ') })()
"@
}

function Invoke-Eval {
    param([string] $Expression)
    $res = Invoke-Bridge -Route '/eval' -Body @{ js = $Expression; window = $Window }
    return (Assert-BridgeOk $res "/eval [$Expression]")
}

if (-not $Poll) {
    $res = Invoke-Eval $Js
    if ($Raw) { return $res }
    return $res.result
}

# --- poll mode -------------------------------------------------------------
$deadline = (Get-Date).AddSeconds($TimeoutSec)
$last     = $null

while ((Get-Date) -lt $deadline) {
    $res  = Invoke-Eval $Js
    $last = $res.result

    # Note: /eval collapses undefined into null (debugBridge.ts:235), so a null
    # here means "the global isn't set yet" OR "it is genuinely null". Keep
    # polling either way — the timeout is what distinguishes them.
    if ($null -ne $last -and $last.PSObject.Properties.Name -contains 'done' -and $last.done) {
        if ($Raw) { return $res }
        return $last
    }
    Start-Sleep -Milliseconds $IntervalMs
}

throw @"
-Poll timed out after ${TimeoutSec}s waiting for '$Js' to report done=true.
Last value seen: $($last | ConvertTo-Json -Depth 6 -Compress)

Do NOT report this as 'the operation failed'. A timeout here means the probe
never settled — which may be the app, or may be a probe that never assigned
done=true on one of its paths (a missing .catch is the usual cause).
"@
