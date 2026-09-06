param([Parameter(Mandatory=$true)][string]$ApkPath)
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path $PSScriptRoot -Parent
$expected = Get-Content -Raw -Encoding UTF8 (Join-Path $projectDir 'app/release.json') | ConvertFrom-Json
Add-Type -AssemblyName System.IO.Compression.FileSystem
$apk = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $ApkPath).Path)
try {
  $info = $apk.GetEntry('assets/public/build-info.json')
  if (-not $info) { throw 'APK has no build metadata. Rebuild this version before publishing.' }
  $reader = [IO.StreamReader]::new($info.Open())
  try { $actual = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
  foreach ($field in @('versionName', 'versionCode', 'contentCode', 'runtimeVersion', 'updateManifestUrl')) {
    if ($actual.$field -ne $expected.$field) { throw "Stale APK: $field does not match the current release." }
  }
  if ($actual.updateManifestUrl -ne 'https://raw.githubusercontent.com/superhe11/RationalSeed/updates/latest.json') { throw 'APK does not use the GitHub feed.' }
  $found = $false
  foreach ($entry in $apk.Entries | Where-Object { $_.FullName -match '^assets/public/assets/index-.*\.js$' }) {
    $reader = [IO.StreamReader]::new($entry.Open())
    try { if ($reader.ReadToEnd().Contains($actual.updateManifestUrl)) { $found = $true } } finally { $reader.Dispose() }
  }
  if (-not $found) { throw 'Compiled application does not contain the expected GitHub feed.' }
} finally { $apk.Dispose() }
Write-Output "Verified APK content $($expected.versionName), code $($expected.contentCode), GitHub feed."
