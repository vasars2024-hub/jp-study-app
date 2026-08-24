# L7-C: sample main-process memory at fixed UPTIME marks on one cold boot.
#
# Successor to debug/l7b-rss-sampler.ps1 (gitignored, and it reports only WorkingSet
# totals). Two differences, both load-bearing:
#
#  1. It records `allPrivMB` as well as `allRssMB`. The 2026-08-24 leg proved that main
#     RSS on an idle Windows process is not a memory measurement -- main trimmed from
#     332.7 MB to 68.2 MB RSS between the 8 and 12 minute marks while private moved
#     550.9 -> 550.8. Nothing was released; the OS trimmed the working set of a process
#     that stopped touching its pages. PrivateMemorySize64 is the column that carries
#     information, and it must be available for the whole process tree, not just main.
#  2. It writes a `startedIso` header record, so a reader can tell an aborted run from a
#     run that simply has not reached its first mark yet.
#
# TRAP, paid for once: -Marks binds as [double[]]. Passing "8,16,24" as ONE quoted string
# through Start-Process -ArgumentList fails the bind and the script produces NO output file
# while its pwsh process stays alive -- which reads exactly like a sampler still waiting.
# Pass @(8,16,24).
param(
  [Parameter(Mandatory = $true)][int]$MainPid,
  [double[]]$Marks = @(8, 16, 24),
  [string]$Out = "$env:TEMP\l7c-mem.jsonl"
)
Remove-Item $Out -ErrorAction SilentlyContinue
$p = Get-Process -Id $MainPid -ErrorAction Stop
$start = $p.StartTime
([ordered]@{ header = $true; mainPid = $MainPid; startedIso = $start.ToString('o'); marks = $Marks } |
  ConvertTo-Json -Compress) | Add-Content -Path $Out -Encoding utf8
foreach ($m in $Marks) {
  while ($true) {
    $up = ((Get-Date) - $start).TotalMinutes
    if ($up -ge $m) { break }
    Start-Sleep -Milliseconds 500
  }
  $p.Refresh()
  $all = Get-Process electron -ErrorAction SilentlyContinue
  $rec = [ordered]@{
    mark       = $m
    uptimeMin  = [math]::Round(((Get-Date) - $start).TotalMinutes, 2)
    clock      = (Get-Date).ToString('HH:mm:ss')
    mainRssMB  = [math]::Round($p.WorkingSet64 / 1MB, 1)
    mainPrivMB = [math]::Round($p.PrivateMemorySize64 / 1MB, 1)
    handles    = $p.HandleCount
    procCount  = ($all | Measure-Object).Count
    allRssMB   = [math]::Round((($all | Measure-Object WorkingSet64 -Sum).Sum) / 1MB, 1)
    allPrivMB  = [math]::Round((($all | Measure-Object PrivateMemorySize64 -Sum).Sum) / 1MB, 1)
  }
  ($rec | ConvertTo-Json -Compress) | Add-Content -Path $Out -Encoding utf8
}
"DONE $Out"
