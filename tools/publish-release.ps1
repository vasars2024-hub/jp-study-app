# Upload Windows build artifacts to the GitHub release.
# Splits into core + public zips when the full bundle exceeds GitHub's 2 GiB limit.

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$tag = "v$version"
$splitDir = Join-Path $root 'out\publish-split'

function New-ReleaseZip {
  param(
    [string[]]$Paths,
    [string]$ZipPath
  )
  if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
  Write-Host "Creating $(Split-Path $ZipPath -Leaf)..."
  Compress-Archive -Path $Paths -DestinationPath $ZipPath -CompressionLevel Optimal
  return Get-Item $ZipPath
}

$artifacts = @()

# Use MakerZIP output when it fits GitHub's 2 GiB cap
$zipDir = Join-Path $root 'out\make\zip\win32\x64'
if (Test-Path $zipDir) {
  foreach ($zip in Get-ChildItem $zipDir -File -Filter '*.zip') {
    if ($zip.Length -le 2GB) { $artifacts += $zip }
  }
}

$packageDir = Join-Path $root 'out\jp-study-app-win32-x64'
$publicDir = Join-Path $packageDir 'resources\public'

if ($artifacts.Count -eq 0 -and (Test-Path $packageDir)) {
  if (Test-Path $splitDir) { Remove-Item $splitDir -Recurse -Force }
  New-Item -ItemType Directory -Path $splitDir -Force | Out-Null

  if (Test-Path $publicDir) {
    $corePaths = Get-ChildItem $packageDir | Where-Object { $_.Name -ne 'resources' } | ForEach-Object { $_.FullName }
    $appDir = Join-Path $packageDir 'resources\app'
    if (Test-Path $appDir) { $corePaths += $appDir }

    $artifacts += New-ReleaseZip -Paths $corePaths -ZipPath (Join-Path $splitDir "jp-study-app-win32-x64-$version-core.zip")
    $artifacts += New-ReleaseZip -Paths $publicDir -ZipPath (Join-Path $splitDir "jp-study-app-win32-x64-$version-public.zip")
  } else {
    $artifacts += New-ReleaseZip -Paths (Join-Path $packageDir '*') -ZipPath (Join-Path $splitDir "jp-study-app-win32-x64-$version.zip")
  }
}

if ($artifacts.Count -eq 0) {
  Write-Error 'No build artifacts found. Run: npm run package:win'
}

Write-Host "Uploading to GitHub release $tag..."
foreach ($file in $artifacts) {
  $mb = [math]::Round($file.Length / 1MB, 1)
  if ($file.Length -gt 2GB) {
    Write-Error "$($file.Name) is $mb MB - still over GitHub 2 GiB limit."
  }
  Write-Host "  $($file.Name) ($mb MB)"
  gh release upload $tag $file.FullName --clobber
}

Write-Host "Done: https://github.com/vasars2024-hub/jp-study-app/releases/tag/$tag"
