<#
.SYNOPSIS
  Capture a window via /screenshot and return the path the app wrote.

.DESCRIPTION
  /screenshot writes the PNG itself and returns JSON: {ok, path, size}
  (debugBridge.ts:294-299). It does NOT return image bytes. Piping the response
  body to a .png gives you a ~120-170 byte JSON file with a .png name, which
  then gets "read" as an image that is not one. This script parses the JSON and
  hands back the real path.

  Note `size` is image.getSize() — a {width,height} dimension object, NOT a byte
  count. The file size on disk is reported separately as `bytes`.

  Two traps this script handles:
    - The capture lags exactly one call: a screenshot taken straight after a
      click shows the PREVIOUS frame (reproduced 6x,
      docs/migration/TEST_EVIDENCE.md:76-78). -Settle inserts a round-trip first.
    - A brand-new window can fail its first capture with UnknownVizError and
      succeed on the next (TEST_EVIDENCE.md:79-81). That failure is retried once
      and reported distinctly from every other error.

  Screenshots corroborate. Geometry and computed styles decide.

.EXAMPLE
  .\shot.ps1

.EXAMPLE
  .\shot.ps1 -Window 3 -Settle
#>
[CmdletBinding()]
param(
    [string] $Window = 'main',

    # Insert a cheap round-trip before capturing, to defeat the one-call lag.
    # Use this after ANY interaction you expect the capture to show.
    [switch] $Settle,

    [switch] $NoFocus
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

if (-not $NoFocus) {
    # rAF is throttled in a background window, so an effect that reveals a panel
    # on the next frame never runs — you would capture a frame the user would
    # never see. (debugBridge.ts:341-348)
    $f = Invoke-Bridge -Route '/focus' -Body @{ window = $Window }
    Assert-BridgeOk $f '/focus' | Out-Null
}

if ($Settle) {
    # Any second round-trip is enough; the point is to let the compositor
    # produce one more frame before the capture.
    $null = Invoke-Bridge -Route '/eval' -Body @{ js = '1'; window = $Window }
    Start-Sleep -Milliseconds 150
}

function Invoke-Capture {
    # Returns the raw envelope. The bridge answers 200 with {ok:false,error}
    # for capture failures (debugBridge.ts:300-302), so never treat 200 as
    # success here.
    return Invoke-Bridge -Route '/screenshot' -Body @{ window = $Window }
}

$res = Invoke-Capture

if (-not $res.ok -and $res.error -match 'UnknownVizError') {
    # Documented: a window that has just been created has no compositor surface
    # yet. It succeeded on the following call every time it was seen.
    Write-Warning "UnknownVizError on first capture of window '$Window' — this is the new-window case; retrying once after a round-trip."
    $null = Invoke-Bridge -Route '/eval' -Body @{ js = '1'; window = $Window }
    Start-Sleep -Milliseconds 300
    $res = Invoke-Capture

    if (-not $res.ok -and $res.error -match 'UnknownVizError') {
        throw @"
UnknownVizError persisted across a retry for window '$Window'.

Only the first-capture-of-a-new-window case is documented in this repo, and it
cleared on the next call. A persistent failure is NOT a documented state — do
not attribute it to occlusion (that theory is unverified and unsupported here).
Report it as an instrument failure and fall back to geometry via /eval; do not
report the absence of a screenshot as evidence about the UI.
"@
    }
}

Assert-BridgeOk $res "/screenshot [window=$Window]" | Out-Null

if (-not $res.path) {
    throw "/screenshot reported ok but returned no path — the response shape changed; check debugBridge.ts:299 before trusting anything else from this run."
}
if (-not (Test-Path $res.path)) {
    throw "/screenshot reported ok with path '$($res.path)' but no file is there. The app writes the PNG itself; a missing file means it is writing somewhere this session cannot see."
}

$file = Get-Item $res.path

[pscustomobject]@{
    path   = $file.FullName
    width  = $res.size.width
    height = $res.size.height
    bytes  = $file.Length          # file size on disk — NOT $res.size
    window = $Window
    settled = [bool]$Settle
}
