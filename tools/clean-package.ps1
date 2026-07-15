# Wipe Vite/Forge packaging caches, then run a fresh package build.
# Use when npm run package or npm run make hangs with 0% CPU.

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -ge 23) {
  Write-Warning @"
Node $((node -v)) detected. Electron Forge is most reliable on Node 22 LTS.
If packaging still hangs, install Node 22: https://nodejs.org/en/download
"@
}

$paths = @('.vite', 'out')
foreach ($p in $paths) {
  if (Test-Path $p) {
    Write-Host "Removing $p..."
    Remove-Item $p -Recurse -Force
  }
}

$env:NODE_OPTIONS = '--max-old-space-size=8192'

Write-Host "Running production Vite renderer build (surfaces silent compile errors)..."
npx vite build --config vite.renderer.config.ts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Running electron-forge package (expect several minutes for ~1 GB assets)..."
npm run package
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Package complete. Optional zip for GitHub:"
Write-Host "  npm run make"
Write-Host "  powershell -File tools\publish-release.ps1"
