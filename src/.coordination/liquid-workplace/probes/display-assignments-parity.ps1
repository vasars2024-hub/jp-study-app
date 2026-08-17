<#
  Protected-system probe — "Display assignments" (§8).

  Contract being frozen: a per-display assignment (`DisplayAssignment`,
  `main/desktop.ts:98`) survives a full process restart AND is acted on — the
  desktop window reopens on that display, it is not merely a row in a file.

  WHY THIS ONE IS A SCRIPT AND THE OTHER EIGHT ARE .js PROBES. Every other row
  is observable inside one renderer. This row's whole claim is "across a
  restart", and main does not hot-reload, so the instrument has to own the
  process lifecycle. Nothing here touches the renderer except through /eval.

  WHY IT WAS BLOCKED UNTIL 2026-08-17. The ledger recorded "one display on this
  machine, so the negative control is impossible here". A virtual display driver
  was installed on user instruction that day; DISPLAY6 is a real, non-virtual
  Electron display (`virtual:false`) at x=1920, NOT a `setVirtualDisplayCount`
  simulation — simulated keys are deliberately not persisted
  (`shared/displayIdentity.ts:43`) and so could never have proven this row.

  DRIVE THE PRODUCT'S OWN CHANNEL. `deskwinSetOptions` (what MonitorsPage.tsx:60
  calls) writes the store *and* reconciles windows. `desktopSetAssignment` is a
  store-only writer that does NOT call `syncDesktopWindows()` — using it makes
  the row read as "the assignment did nothing". That is not a product defect;
  it is the wrong instrument. Verified 2026-08-17.

  Restores the assignments blob and asserts it byte-for-byte (-ceq) at the end.
#>
[CmdletBinding()]
param(
  [string] $Repo = 'C:\Users\Arseniy\Projects\jp-study-app',
  [string] $DisplayKey,
  [int]    $SecondDisplayMinX = 1920
)

$ErrorActionPreference = 'Stop'
Set-Location $Repo

function Bridge {
  param([string]$Route, [string]$Method = 'Get', $Body, [int]$TimeoutSec = 90)
  $b = Get-Content (Join-Path $Repo 'debug\bridge.json') | ConvertFrom-Json
  $h = @{ Authorization = "Bearer $($b.token)" }
  $u = "http://127.0.0.1:$($b.port)$Route"
  if ($Method -eq 'Get') { return Invoke-RestMethod -Uri $u -Headers $h -TimeoutSec $TimeoutSec }
  Invoke-RestMethod -Uri $u -Method Post -Headers $h -ContentType 'application/json' `
    -Body ($Body | ConvertTo-Json) -TimeoutSec $TimeoutSec
}

# /eval against the MAIN window, never 'focused'. Opening the second desktop
# window mounts a whole second Study OS shell in the same renderer process
# (same origin), and window 1's JS stalls while it does — measured >30 s twice,
# then 12,072 ms, then normal. A 30 s HttpClient default reads that as a dead
# app. Use a long timeout; do not conclude the bridge is down.
function Ev { param([string]$Js, [string]$Window = '1', [int]$TimeoutSec = 90)
  (Bridge -Route '/eval' -Method Post -Body @{ js = $Js; window = $Window } -TimeoutSec $TimeoutSec).result
}

function Await { param([string]$Kick, [string]$Global, [int]$Tries = 30)
  Ev -Js $Kick | Out-Null
  for ($i = 0; $i -lt $Tries; $i++) {
    $v = Ev -Js "window.$Global && window.$Global.done ? JSON.stringify(window.$Global) : null"
    if ($v) { return $v | ConvertFrom-Json }
    Start-Sleep -Seconds 2
  }
  throw "$Global never settled"
}

function WindowsOnSecondDisplay {
  $h = Bridge -Route '/health'
  , @($h.windows | Where-Object { $_.bounds.x -ge $SecondDisplayMinX })
}

function RestartApp {
  # Walk to the cmd.exe that owns the forge tree and kill it whole; a bare
  # electron kill leaves forge respawning and port 5173 held.
  $b = Get-Content (Join-Path $Repo 'debug\bridge.json') | ConvertFrom-Json
  $p = $b.pid; $root = $p
  for ($i = 0; $i -lt 5; $i++) {
    $o = Get-CimInstance Win32_Process -Filter "ProcessId=$p" -ErrorAction SilentlyContinue
    if (-not $o) { break }
    if ($o.Name -eq 'cmd.exe') { $root = $o.ProcessId; break }
    $root = $o.ProcessId; $p = $o.ParentProcessId
  }
  & taskkill /PID $root /T /F | Out-Null
  Start-Sleep -Seconds 3
  $bj = Join-Path $Repo 'debug\bridge.json'
  if (Test-Path $bj) { Remove-Item -LiteralPath $bj -Force }
  $log = Join-Path $env:TEMP 'jp-display-assignments-probe.log'
  Start-Process -FilePath 'npm.cmd' -ArgumentList 'start' -WorkingDirectory $Repo `
    -RedirectStandardOutput $log -RedirectStandardError "$log.err" -WindowStyle Hidden | Out-Null
  $deadline = (Get-Date).AddSeconds(180)
  while ((Get-Date) -lt $deadline) {
    if (Test-Path $bj) { try { if ((Bridge -Route '/health' -TimeoutSec 10).ok) { Start-Sleep -Seconds 12; return } } catch {} }
    Start-Sleep -Seconds 3
  }
  throw 'app did not come back'
}

# --- leg 0: topology + restore point -----------------------------------------
$displays = (Await '(() => { window.__dp={done:false}; window.api.displayList().then(r=>{window.__dp={done:true,list:r};}).catch(e=>{window.__dp={done:true,err:String(e)};}); return "started"; })()' '__dp').list
$secondary = @($displays | Where-Object { -not $_.primary -and -not $_.virtual })
if ($secondary.Count -lt 1) {
  return [pscustomobject]@{ refuse = "no non-primary REAL display — this row cannot be observed. Displays: $($displays.Count)" }
}
if (-not $DisplayKey) { $DisplayKey = $secondary[0].key }

$captured = (Await '(() => { window.__L0={done:false}; window.api.desktopGetLayout().then(s=>{window.__L0={done:true,a:JSON.stringify(s.assignments)};}).catch(e=>{window.__L0={done:true,err:String(e)};}); return "started"; })()' '__L0').a
$originalRow = ($captured | ConvertFrom-Json) | Where-Object { $_.displayKey -eq $DisplayKey }

$set = {
  param($enabled)
  $js = '(() => { window.__S={done:false}; window.api.deskwinSetOptions({displayKey:"' + $DisplayKey + '", enabled:' + ($enabled.ToString().ToLower()) + '}).then(r=>{window.__S={done:true,r:r};}).catch(e=>{window.__S={done:true,err:String(e)};}); return "started"; })()'
  Await $js '__S' | Out-Null
  Start-Sleep -Seconds 4
}

$result = [ordered]@{ displayKey = $DisplayKey; displays = $displays.Count }
try {
  # --- leg 1: enabled=true, same session ------------------------------------
  & $set $true
  $result.enabledSameSession = (WindowsOnSecondDisplay).Count

  # --- leg 2: POSITIVE — survives a real process restart --------------------
  RestartApp
  $result.enabledAfterRestart = (WindowsOnSecondDisplay).Count
  $result.storedEnabledAfterRestart = ((Await '(() => { window.__L1={done:false}; window.api.desktopGetLayout().then(s=>{window.__L1={done:true,a:JSON.stringify(s.assignments)};}).catch(e=>{window.__L1={done:true,err:String(e)};}); return "started"; })()' '__L1').a `
    | ConvertFrom-Json | Where-Object { $_.displayKey -eq $DisplayKey } | ForEach-Object { $_.enabled }

  # --- leg 3: INVERTED CONTROL — enabled=false must read the opposite -------
  & $set $false
  $result.disabledSameSession = (WindowsOnSecondDisplay).Count
  RestartApp
  $result.disabledAfterRestart = (WindowsOnSecondDisplay).Count
}
finally {
  # --- leg 4: restore, asserted byte-for-byte -------------------------------
  if ($originalRow) { & $set ([bool]$originalRow.enabled) }
  $after = (Await '(() => { window.__L9={done:false}; window.api.desktopGetLayout().then(s=>{window.__L9={done:true,a:JSON.stringify(s.assignments)};}).catch(e=>{window.__L9={done:true,err:String(e)};}); return "started"; })()' '__L9').a
  $result.restoredByteIdentical = ($after -ceq $captured)
  Ev -Js '(() => { delete window.__dp; delete window.__L0; delete window.__L1; delete window.__L9; delete window.__S; return "cleaned"; })()' | Out-Null
}

$result.controlInverted = ($result.enabledAfterRestart -ge 1 -and $result.disabledAfterRestart -eq 0)
$result.PASS = ($result.controlInverted -and $result.storedEnabledAfterRestart -eq $true -and $result.restoredByteIdentical)
[pscustomobject]$result
