$ErrorActionPreference = 'Stop'
$projectDir = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectDir
$release = Get-Content -Raw -LiteralPath (Join-Path $projectDir 'app/release.json') | ConvertFrom-Json
if ($release.versionName -notmatch '^\d+\.\d+\.\d+$' -or $release.contentCode -lt 1) { throw 'Invalid release version.' }

& npm.cmd run mobile:web
if ($LASTEXITCODE -ne 0) { throw 'Mobile build failed.' }
$bundleDir = Join-Path $projectDir 'dist-mobile'
$releaseDir = Join-Path $projectDir 'public/releases'
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
$archiveName = "novel-$($release.versionName)-$($release.contentCode).zip"
$archivePath = Join-Path $releaseDir $archiveName
# Never mutate a previously published content-addressed version.
if (Test-Path -LiteralPath $archivePath) { throw "Archive already exists: $archiveName. Increase contentCode/versionName before creating the next release." }
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$outputZip = [IO.Compression.ZipFile]::Open($archivePath, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($file in Get-ChildItem -LiteralPath $bundleDir -Recurse -File) {
    # .NET Framework's CreateFromDirectory writes Windows backslashes into ZIPs.
    # Android expects portable forward-slash paths, including inside assets/.
    $entryName = $file.FullName.Substring($bundleDir.Length + 1).Replace('\', '/')
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($outputZip, $file.FullName, $entryName, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $outputZip.Dispose() }
$zip = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
  if (-not ($zip.Entries | Where-Object { $_.FullName -eq 'index.html' })) { throw 'No index.html at ZIP root.' }
  if ($zip.Entries | Where-Object { $_.FullName -match '(\.\.|^/|\\|releases/|\.apk$|\.map$)' }) { throw 'Unexpected bundle entry.' }
} finally { $zip.Dispose() }
$manifest = [ordered]@{
  contentCode = [int]$release.contentCode
  versionName = $release.versionName
  runtimeVersion = $release.runtimeVersion
  publishedAt = [DateTime]::UtcNow.ToString('o')
  notes = @($release.notes)
  bundleUrl = "$($release.updateOrigin)/releases/$archiveName"
  sha256 = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
  sizeBytes = (Get-Item -LiteralPath $archivePath).Length
}
[IO.File]::WriteAllText((Join-Path $releaseDir 'latest.json'), ($manifest | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
Write-Output "Prepared $archiveName ($($manifest.sizeBytes) bytes). Publication is a separate step."
