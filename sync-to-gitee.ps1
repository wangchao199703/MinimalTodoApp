# Sync GitHub desk-helper to Gitee desk-helper
# Auto-sync script: pull from GitHub, push to Gitee with token authentication

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "Syncing desk-helper: GitHub -> Gitee" -ForegroundColor Cyan

# ---- read Gitee token (line 2 of tk.txt) ----
$tokenFile = "C:\Users\wangchao\Desktop\tk.txt"
$giteeToken = (Get-Content $tokenFile -TotalCount 2)[1].Trim()
if (-not $giteeToken) { throw "Gitee token missing in tk.txt line 2" }

# ---- ensure gitee remote exists ----
$giteeRemote = "https://oauth2:${giteeToken}@gitee.com/wangchao199703/desk-helper.git"
$remotes = git -C $root remote
if ($remotes -notcontains "gitee") {
    git -C $root remote add gitee $giteeRemote
    Write-Host "Gitee remote added" -ForegroundColor Green
} else {
    git -C $root remote set-url gitee $giteeRemote
}

# ---- fetch latest from GitHub desk-helper ----
Write-Host "Fetching from GitHub desk-helper..." -ForegroundColor Yellow
git -C $root fetch desk-helper
if ($LASTEXITCODE -ne 0) { throw "fetch from GitHub desk-helper failed" }

# ---- push all branches and tags to Gitee ----
Write-Host "Pushing to Gitee..." -ForegroundColor Yellow
git -C $root push gitee desk-helper/main:main --force
if ($LASTEXITCODE -ne 0) { throw "push to Gitee failed" }

git -C $root push gitee --tags --force
if ($LASTEXITCODE -ne 0) { Write-Host "Warning: push tags to Gitee failed" -ForegroundColor Yellow }

Write-Host "Sync completed: GitHub -> Gitee" -ForegroundColor Green
