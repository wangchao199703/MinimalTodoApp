# Release script for the Tauri rewrite (portable single-exe distribution).
# Flow: read version from tauri.conf.json -> build portable exe -> verify FileVersion
#       -> git tag + push -> create GitHub release -> upload asset.
# Auth: $env:GH_TOKEN preferred, falls back to git credential manager.
# NOTE: intentionally ASCII-only (build script convention).

$ErrorActionPreference = "Stop"
$repo = "wangchao199703/MinimalTodoApp"
$root = $PSScriptRoot

# ---- version ----
$conf = Get-Content (Join-Path $root "src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json
$version = $conf.version
if (-not $version) { throw "version missing in tauri.conf.json" }
$tag = "v$version"
Write-Host "Releasing $tag" -ForegroundColor Cyan

# ---- guard: tag must not exist ----
git -C $root fetch --tags --quiet
if (git -C $root tag -l $tag) { throw "tag $tag already exists, bump version first" }

# ---- build ----
$env:Path += ";$env:USERPROFILE\.cargo\bin"
Push-Location $root
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "frontend build failed" }
    npx tauri build --no-bundle
    if ($LASTEXITCODE -ne 0) { throw "tauri build failed" }
}
finally { Pop-Location }

$exe = Join-Path $root "src-tauri\target\release\minimal-todo.exe"
if (-not (Test-Path $exe)) { throw "built exe not found: $exe" }

# ---- verify FileVersion matches ----
$fileVersion = (Get-Item $exe).VersionInfo.FileVersion
if (-not $fileVersion.StartsWith($version)) {
    throw "FileVersion ($fileVersion) does not match tauri.conf.json version ($version)"
}

$assetName = "MinimalTodoApp-$tag-win-x64.exe"
$asset = Join-Path $root $assetName
Copy-Item $exe $asset -Force
$sizeMb = [math]::Round((Get-Item $asset).Length / 1MB, 1)
Write-Host "asset: $assetName ($sizeMb MB)" -ForegroundColor Cyan

# ---- token ----
$token = $env:GH_TOKEN
if (-not $token) {
    $cred = "url=https://github.com`n" | git credential fill 2>$null
    $token = ($cred | Select-String "^password=(.+)$").Matches.Groups[1].Value
}
if (-not $token) { throw "no GitHub token (set GH_TOKEN or configure git credential manager)" }
$headers = @{
    Authorization = "Bearer $token"
    Accept        = "application/vnd.github+json"
    "User-Agent"  = "MinimalTodoApp-release"
}

# ---- tag + push ----
git -C $root tag $tag
git -C $root push origin HEAD --tags
if ($LASTEXITCODE -ne 0) { throw "git push failed" }

# ---- create release ----
$notesPath = Join-Path $root "release-notes.md"
$notes = if (Test-Path $notesPath) { [System.IO.File]::ReadAllText($notesPath) } else { "" }
$body = @{
    tag_name = $tag
    name     = $tag
    body     = $notes
} | ConvertTo-Json
$release = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/releases" `
    -Headers $headers -Body ([Text.Encoding]::UTF8.GetBytes($body)) -ContentType "application/json"
Write-Host "release created: $($release.html_url)" -ForegroundColor Green

# ---- upload asset ----
$uploadUrl = $release.upload_url -replace "\{.*\}$", "?name=$assetName"
Invoke-RestMethod -Method Post -Uri $uploadUrl -Headers $headers `
    -InFile $asset -ContentType "application/octet-stream" | Out-Null
Write-Host "asset uploaded" -ForegroundColor Green

Remove-Item $asset -Force
Write-Host "done: $tag" -ForegroundColor Green
