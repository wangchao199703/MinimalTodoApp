# Release v2.0.5 to NEW repo (desk-helper) - DUAL asset names for compatibility
# Upload both MinimalTodoApp-*.exe (backward compat for v2.0.5 bridge) and DeskHelper-*.exe (new name).

$ErrorActionPreference = "Stop"
$repo = "wangchao199703/desk-helper"
$root = $PSScriptRoot

# ---- version ----
$conf = Get-Content (Join-Path $root "src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json
$version = $conf.version
if (-not $version) { throw "version missing in tauri.conf.json" }
$tag = "v$version"
Write-Host "Releasing $tag to NEW repo: $repo (DUAL names)" -ForegroundColor Cyan

# ---- guard: tag must not exist ----
$remoteTag = git -C $root ls-remote --tags https://github.com/$repo "refs/tags/$tag" 2>$null
if ($remoteTag) { throw "tag $tag already exists on new repo" }

# ---- verify exe exists ----
$exe = Join-Path $root "src-tauri\target\release\minimal-todo.exe"
if (-not (Test-Path $exe)) { throw "built exe not found: $exe (run 'cargo build --release' first)" }

# ---- verify FileVersion matches ----
$fileVersion = (Get-Item $exe).VersionInfo.FileVersion
if (-not $fileVersion.StartsWith($version)) {
    throw "FileVersion ($fileVersion) does not match tauri.conf.json version ($version)"
}

# ---- prepare DUAL assets ----
$assetOld = "MinimalTodoApp-$tag-win-x64.exe"
$assetNew = "DeskHelper-$tag-win-x64.exe"
$pathOld = Join-Path $root $assetOld
$pathNew = Join-Path $root $assetNew
Copy-Item $exe $pathOld -Force
Copy-Item $exe $pathNew -Force
$sizeMb = [math]::Round((Get-Item $exe).Length / 1MB, 1)
Write-Host "assets: $assetOld + $assetNew (each $sizeMb MB)" -ForegroundColor Cyan

# ---- token ----
$token = Get-Content "C:\Users\wangchao\Desktop\tk.txt" -TotalCount 1 | ForEach-Object { $_.Trim() }
if (-not $token) { throw "no GitHub token in tk.txt line 1" }
$headers = @{
    Authorization = "Bearer $token"
    Accept        = "application/vnd.github+json"
    "User-Agent"  = "DeskHelper-release"
}

# ---- create release (no tag push, new repo has no commits yet) ----
$notesPath = Join-Path $root "release-notes.md"
$notes = if (Test-Path $notesPath) { [System.IO.File]::ReadAllText($notesPath) } else { "" }
$bodyJson = @{
    tag_name         = $tag
    name             = $tag
    body             = $notes
    target_commitish = "main"
} | ConvertTo-Json -Compress
$release = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/releases" `
    -Headers $headers -Body ([Text.Encoding]::UTF8.GetBytes($bodyJson)) -ContentType "application/json; charset=utf-8"
Write-Host "release created: $($release.html_url)" -ForegroundColor Green

# ---- upload OLD name asset ----
$uploadUrlOld = $release.upload_url -replace "\{.*\}$", "?name=$assetOld"
Invoke-RestMethod -Method Post -Uri $uploadUrlOld -Headers $headers `
    -InFile $pathOld -ContentType "application/octet-stream" | Out-Null
Write-Host "asset uploaded: $assetOld" -ForegroundColor Green

# ---- upload NEW name asset ----
$uploadUrlNew = $release.upload_url -replace "\{.*\}$", "?name=$assetNew"
Invoke-RestMethod -Method Post -Uri $uploadUrlNew -Headers $headers `
    -InFile $pathNew -ContentType "application/octet-stream" | Out-Null
Write-Host "asset uploaded: $assetNew" -ForegroundColor Green

Remove-Item $pathOld, $pathNew -Force
Write-Host "done: $tag released to NEW repo with DUAL names" -ForegroundColor Green
