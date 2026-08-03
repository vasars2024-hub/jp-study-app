#requires -Version 5.1
# Automater wrapper - forwards to the implementation under src/main/automater
# so the main script stays inside the src/ directory.

param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Arguments
)

$impl = [System.IO.Path]::Combine($PSScriptRoot, "src", "main", "automater", "automater.ps1")
if (-not (Test-Path $impl)) {
  Write-Error "Automater implementation not found: $impl"
  exit 1
}

. $impl
