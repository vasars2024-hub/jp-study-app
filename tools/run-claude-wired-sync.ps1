# Watcher: Claude Code (claude-primary) Wired theme sync - Opus 4.8 fast + API retries.
$ErrorActionPreference = 'Continue'
$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
$PromptFile = Join-Path $PSScriptRoot 'wired-theme-sync-prompt.txt'
$LogDir = Join-Path $PSScriptRoot 'claude-wired-runs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir ("wired-sync-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))
$StatusFile = Join-Path $LogDir 'wired-sync-status.json'

$ClaudeExe = Join-Path $env:APPDATA 'npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe'
$MaxAttempts = 40
$BackoffSec = 20
$SessionId = $null
$FreshAfterIdle = 0

function Write-Status($obj) {
  ($obj | ConvertTo-Json -Depth 6) | Set-Content -Path $StatusFile -Encoding utf8
}

function Test-ApiFailure([string]$text, [int]$exitCode) {
  if ($exitCode -ne 0) { return $true }
  if ($text -match '(?i)api[_ ]?error|rate[_ ]?limit|overloaded|\b529\b|\b429\b|capacity|authentication|unauthorized|ECONNRESET|ETIMEDOUT|fetch failed|network error|credit balance|usage limit|Something went wrong') {
    return $true
  }
  if ($text -match 'is_error"\s*:\s*true') { return $true }
  try {
    $j = $text.Trim() | ConvertFrom-Json -ErrorAction Stop
    if ($j.is_error -eq $true) { return $true }
    if ($j.api_error_status) { return $true }
    if ($j.subtype -eq 'error') { return $true }
    if ($j.type -eq 'result' -and $j.subtype -eq 'success') { return $false }
  } catch {}
  if ($text -match '(?i)"subtype"\s*:\s*"success"') { return $false }
  return $true
}

"=== Wired sync watcher started $(Get-Date) root=$Root ===" | Tee-Object -FilePath $LogFile
Write-Host "Claude binary: $ClaudeExe"

for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
  $Prompt = Get-Content -Raw -Path $PromptFile
  $attemptLog = Join-Path $LogDir ("attempt-{0:00}-{1:HHmmss}.out.txt" -f $attempt, (Get-Date))
  Write-Host "[attempt $attempt/$MaxAttempts] launching Opus 4.8 fast..."
  Write-Status @{
    state       = 'running'
    attempt     = $attempt
    maxAttempts = $MaxAttempts
    sessionId   = $SessionId
    startedAt   = (Get-Date).ToString('o')
    logFile     = $LogFile
  }

  $settingsFile = Join-Path $PSScriptRoot 'claude-wired-fast-settings.json'
  $claudeArgs = @(
    '-p', $Prompt,
    '--model', 'claude-opus-4-8',
    '--settings', $settingsFile,
    '--output-format', 'json',
    '--permission-mode', 'acceptEdits'
  )
  if ($SessionId) { $claudeArgs += @('--resume', $SessionId) }

  $env:CLAUDE_CONFIG_DIR = Join-Path $env:USERPROFILE '.claude-primary'
  $out = ''
  $exit = 1
  Push-Location $Root
  try {
    $out = & $ClaudeExe @claudeArgs 2>&1 | Out-String
    $exit = $LASTEXITCODE
  } catch {
    $out = "$_"
    $exit = 1
  } finally {
    Pop-Location
  }

  Set-Content -Path $attemptLog -Value $out -Encoding utf8
  Add-Content -Path $LogFile -Value ("`n----- attempt $attempt exit=$exit -----`n")
  $clipLen = [Math]::Min(4000, $out.Length)
  if ($clipLen -gt 0) {
    Add-Content -Path $LogFile -Value $out.Substring(0, $clipLen)
  }

  try {
    $jsonLine = ($out -split "`n" | Where-Object { $_.Trim().StartsWith('{') } | Select-Object -Last 1)
    if ($jsonLine) {
      $j = $jsonLine | ConvertFrom-Json -ErrorAction Stop
      if ($j.session_id) { $SessionId = $j.session_id }
      Write-Host ("  session=$SessionId is_error=$($j.is_error) fast=$($j.fast_mode_state) subtype=$($j.subtype)")
    }
  } catch {
    Write-Host '  (could not parse session json)'
  }

  if (-not (Test-ApiFailure $out $exit)) {
    Write-Host "SUCCESS on attempt $attempt"
    Write-Status @{
      state      = 'success'
      attempt    = $attempt
      sessionId  = $SessionId
      finishedAt = (Get-Date).ToString('o')
      attemptLog = $attemptLog
    }
    exit 0
  }

  # After repeated stream idle timeouts, start a fresh session (resume can stall).
  if ($out -match 'Stream idle timeout') {
    $FreshAfterIdle++
    if ($FreshAfterIdle -ge 2) {
      Write-Host '  clearing session after repeated idle timeouts'
      $SessionId = $null
      $FreshAfterIdle = 0
    }
  } else {
    $FreshAfterIdle = 0
  }

  Write-Host "API/transient failure - restart in ${BackoffSec}s (resume=$SessionId)"
  Write-Status @{
    state       = 'retrying'
    attempt     = $attempt
    sessionId   = $SessionId
    nextRetryAt = (Get-Date).AddSeconds($BackoffSec).ToString('o')
    lastExit    = $exit
    attemptLog  = $attemptLog
  }
  Start-Sleep -Seconds $BackoffSec
  if ($BackoffSec -lt 90) { $BackoffSec = [Math]::Min(90, [int]($BackoffSec * 1.25)) }
}

Write-Host "FAILED after $MaxAttempts attempts"
Write-Status @{ state = 'failed'; attempt = $MaxAttempts; sessionId = $SessionId; finishedAt = (Get-Date).ToString('o') }
exit 1
