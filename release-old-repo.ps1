# Release v2.0.5 to OLD repo (MinimalTodoApp) - single asset name for backward compat
# This is the LAST release to the old repo, acting as bridge to new repo.

$ErrorActionPreference = "Stop"
$repo = "wangchao199703/MinimalTodoApp"
$root = $PSScriptRoot

# ---- version ----
$conf = Get-Content (Join-Path $root "src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json
$version = $conf.version
if (-not $version) { throw "version missing in tauri.conf.json" }
$tag = "v$version"
Write-Host "Releasing $tag to OLD repo: $repo" -ForegroundColor Cyan

# ---- guard: tag must not exist ----
$remoteTag = git -C $root ls-remote --tags origin "refs/tags/$tag" 2>$null
if ($remoteTag) { throw "tag $tag already exists on origin, cannot re-release" }

# ---- verify exe exists ----
$exe = Join-Path $root "src-tauri\target\release\minimal-todo.exe"
if (-not (Test-Path $exe)) { throw "built exe not found: $exe (run 'cargo build --release' first)" }

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
$token = Get-Content "C:\Users\wangchao\Desktop\tk.txt" -TotalCount 1 | ForEach-Object { $_.Trim() }
if (-not $token) { throw "no GitHub token in tk.txt line 1" }
$headers = @{
    Authorization = "Bearer $token"
    Accept        = "application/vnd.github+json"
    "User-Agent"  = "MinimalTodoApp-release"
}

# ---- tag + push ----
git -C $root tag $tag
$tokenBase64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("x:$token"))
git -C $root -c "http.extraheader=AUTHORIZATION: basic $tokenBase64" push origin $tag
if ($LASTEXITCODE -ne 0) { throw "git push tag failed" }

# ---- create release ----
$notesPath = Join-Path $root "release-notes.md"
$notes = if (Test-Path $notesPath) { [System.IO.File]::ReadAllText($notesPath) } else { "" }
$bodyJson = @{
    tag_name = $tag
    name     = $tag
    body     = $notes
} | ConvertTo-Json -Compress
$release = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/releases" `
    -Headers $headers -Body ([Text.Encoding]::UTF8.GetBytes($bodyJson)) -ContentType "application/json; charset=utf-8"
Write-Host "release created: $($release.html_url)" -ForegroundColor Green

# ---- upload asset ----
$uploadUrl = $release.upload_url -replace "\{.*\}$", "?name=$assetName"
Invoke-RestMethod -Method Post -Uri $uploadUrl -Headers $headers `
    -InFile $asset -ContentType "application/octet-stream" | Out-Null
Write-Host "asset uploaded: $assetName" -ForegroundColor Green

Remove-Item $asset -Force
Write-Host "done: $tag released to OLD repo" -ForegroundColor Green
