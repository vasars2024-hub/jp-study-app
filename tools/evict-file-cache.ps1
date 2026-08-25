<#
.SYNOPSIS
  Evict a target file's pages from the Windows file cache by reading unrelated bytes.

.DESCRIPTION
  Leg 2 of the Liquid category-7 measurement only exists on a COLD `examples` table, and the
  Windows standby list survives an app restart -- so a diagnostic that merely reads the table
  (which is what any measurement of it is) destroys the very condition the next run needs. This
  restores it: it streams unrelated files until it has pushed more bytes through the cache than
  the standby list holds, which evicts the oldest pages, and the target's pages are the oldest
  once you stop touching them.

  It never opens the target. It never writes anything. Reading is the entire mechanism.

  Report the before/after standby-cache numbers with any result that depends on this, and treat a
  first lookup that comes back warm anyway as a VOID measurement rather than as a pass -- the
  cache is shared with everything else on the machine and eviction is best-effort by construction.

.PARAMETER Roots
  Directories to stream bytes from. Must not contain the target.

.PARAMETER TargetGb
  How many gigabytes to push through. Default 3, against a standby list that is typically ~1.2 GB.
#>
param(
  [string[]]$Roots = @("$env:APPDATA\jp-study-app\downloads"),
  [double]$TargetGb = 3
)

$ErrorActionPreference = 'Stop'

function Get-Standby {
  try {
    $s = (Get-Counter '\Memory\Standby Cache Normal Priority Bytes' -ErrorAction Stop)
    [math]::Round(($s.CounterSamples[0].CookedValue / 1MB), 0)
  } catch { -1 }
}

$before = Get-Standby
Write-Host ("standby before: {0} MB" -f $before)

$need = [long]($TargetGb * 1GB)
$read = [long]0
$buffer = New-Object byte[] (4MB)
$files = @()
foreach ($root in $Roots) {
  if (Test-Path -LiteralPath $root) {
    $files += Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Length -gt 1MB }
  }
}
if (-not $files.Count) { Write-Error "No files over 1 MB under: $($Roots -join ', ')" }

# Two passes if one is not enough: re-reading the same bytes still pushes the target's pages
# further down the LRU, because those bytes get re-referenced and the target's do not.
$pass = 0
while ($read -lt $need -and $pass -lt 4) {
  $pass++
  foreach ($file in $files) {
    if ($read -ge $need) { break }
    try {
      $stream = [System.IO.File]::Open($file.FullName, 'Open', 'Read', 'ReadWrite')
      while ($true) {
        $n = $stream.Read($buffer, 0, $buffer.Length)
        if ($n -le 0) { break }
        $read += $n
        if ($read -ge $need) { break }
      }
      $stream.Dispose()
    } catch { }
  }
}

$after = Get-Standby
[pscustomobject]@{
  files_seen       = $files.Count
  passes           = $pass
  gb_read          = [math]::Round($read / 1GB, 2)
  standby_before_mb = $before
  standby_after_mb  = $after
} | Format-List
