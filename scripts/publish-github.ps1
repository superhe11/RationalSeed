param([string]$ApkPath)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
$release = Get-Content -Raw -Encoding UTF8 app/release.json | ConvertFrom-Json
$manifestPath = Join-Path (Get-Location) 'public/releases/github-latest.json'
$manifest = Get-Content -Raw -Encoding UTF8 $manifestPath | ConvertFrom-Json
$repository = 'superhe11/RationalSeed'
if ($release.githubRepository -ne $repository -or $manifest.contentCode -ne $release.contentCode -or $manifest.versionName -ne $release.versionName) { throw 'Release metadata mismatch. Prepare the update first.' }
$archiveName = "novel-$($release.versionName)-$($release.contentCode).zip"
$archivePath = Join-Path (Get-Location) "public/releases/$archiveName"
if ((Get-FileHash -LiteralPath $archivePath).Hash.ToLowerInvariant() -ne $manifest.sha256 -or (Get-Item -LiteralPath $archivePath).Length -ne $manifest.sizeBytes) { throw 'Archive checksum or size mismatch.' }
if ($manifest.bundleUrl -ne "https://github.com/$repository/releases/download/v$($release.versionName)/$archiveName") { throw 'Unexpected download URL.' }
if ($ApkPath) { & (Join-Path $PSScriptRoot 'verify-apk.ps1') -ApkPath $ApkPath }
if (@(git status --porcelain).Count -gt 0) { throw 'Commit the tested source and release files before publication.' }
$sourceSha = (git rev-parse --verify HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot identify source commit.' }

# Credentials stay in memory and are never embedded in source, APKs or remotes.
$env:GCM_INTERACTIVE = 'never'
$env:GIT_TERMINAL_PROMPT = '0'
$credentialLines = @('protocol=https', 'host=github.com', '') | git credential fill
if ($LASTEXITCODE -ne 0) { throw 'Sign in to GitHub with Git Credential Manager first.' }
$taskCredential = @{}
foreach ($line in $credentialLines) { if ($line -match '^([^=]+)=(.*)$') { $taskCredential[$matches[1]] = $matches[2] } }
if (-not $taskCredential['password']) { throw 'GitHub credential unavailable.' }
$headers = @{ Authorization = ('Bearer ' + $taskCredential['password']); Accept = 'application/vnd.github+json'; 'X-GitHub-Api-Version' = '2022-11-28' }
$api = "https://api.github.com/repos/$repository"
function Invoke-GitHub([string]$Method, [string]$Path, $Data = $null) {
  $arguments = @{ Uri = "$api/$Path"; Headers = $headers; Method = $Method }
  if ($null -ne $Data) { $arguments.Body = [Text.Encoding]::UTF8.GetBytes(($Data | ConvertTo-Json -Depth 12)); $arguments.ContentType = 'application/json; charset=utf-8' }
  Invoke-RestMethod @arguments
}
function Get-Optional([string]$Path) {
  try { Invoke-GitHub GET $Path } catch { if ([int]$_.Exception.Response.StatusCode -ne 404) { throw }; return $null }
}
$repo = Invoke-RestMethod -Uri $api -Headers $headers
if ($repo.private -or -not $repo.permissions.push) { throw 'The selected repository must be public and writable.' }
& git push "https://github.com/$repository.git" HEAD:main
if ($LASTEXITCODE -ne 0) { throw 'Source push failed; release not published.' }
$remoteHead = Invoke-GitHub GET 'git/ref/heads/main'
if ($remoteHead.object.sha -ne $sourceSha) { throw 'Remote source differs from the validated commit.' }

$tag = "v$($release.versionName)"
$published = Get-Optional "releases/tags/$tag"
if (-not $published) {
  $published = Invoke-GitHub POST 'releases' @{ tag_name = $tag; target_commitish = $sourceSha; name = "RationalSeed $($release.versionName)"; body = (($release.notes | ForEach-Object { '- ' + $_ }) -join "`n"); draft = $true; prerelease = $false }
}
$uploads = @(@{ Path = $archivePath; Name = $archiveName; Type = 'application/zip' })
if ($ApkPath) { $uploads += @{ Path = (Resolve-Path -LiteralPath $ApkPath).Path; Name = "RationalSeed-$($release.versionName).apk"; Type = 'application/vnd.android.package-archive' } }
foreach ($file in $uploads) {
  $existing = @($published.assets | Where-Object { $_.name -eq $file.Name })
  if ($existing.Count) {
    $digest = 'sha256:' + (Get-FileHash -LiteralPath $file.Path).Hash.ToLowerInvariant()
    if ($existing[0].digest -ne $digest) { throw "Existing asset differs: $($file.Name). Never overwrite published versions." }
    continue
  }
  if (-not $published.draft) { throw 'Do not add missing files to an already published release. Create a new version.' }
  $uploadUrl = ($published.upload_url -replace '\{.*$', '') + '?name=' + [Uri]::EscapeDataString($file.Name)
  $asset = Invoke-RestMethod -Method Post -Uri $uploadUrl -Headers $headers -ContentType $file.Type -InFile $file.Path
  if ($asset.size -ne (Get-Item -LiteralPath $file.Path).Length) { throw 'Uploaded asset size mismatch.' }
  $expectedDigest = 'sha256:' + (Get-FileHash -LiteralPath $file.Path).Hash.ToLowerInvariant()
  if ($asset.digest -and $asset.digest -ne $expectedDigest) { throw 'Uploaded asset checksum mismatch.' }
}
if ($published.draft) { $published = Invoke-GitHub PATCH "releases/$($published.id)" @{ draft = $false; make_latest = 'true' } }

# Advance the update feed only AFTER assets are publicly downloadable.
# This separate branch prevents a source push advertising an absent ZIP.
$feedBranch = Get-Optional 'git/ref/heads/updates'
if (-not $feedBranch) { $null = Invoke-GitHub POST 'git/refs' @{ ref = 'refs/heads/updates'; sha = $sourceSha } }
$oldFeed = Get-Optional 'contents/latest.json?ref=updates'
if ($oldFeed) {
  $previous = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($oldFeed.content)) | ConvertFrom-Json
  if ($previous.contentCode -gt $manifest.contentCode) { throw 'Refusing to downgrade the update feed.' }
  if ($previous.contentCode -eq $manifest.contentCode -and $previous.sha256 -ne $manifest.sha256) { throw 'Refusing to change an existing content version.' }
}
$data = @{ message = "Publish update feed $($release.versionName)"; branch = 'updates'; content = [Convert]::ToBase64String([IO.File]::ReadAllBytes($manifestPath)) }
if ($oldFeed) { $data.sha = $oldFeed.sha }
$null = Invoke-GitHub PUT 'contents/latest.json' $data
Write-Output "Published $($published.html_url)"
Write-Output 'The application update feed now points to the published GitHub assets.'
