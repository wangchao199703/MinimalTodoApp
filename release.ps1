<#
.SYNOPSIS
    一键发布 MinimalTodoApp 的 GitHub Release。

.DESCRIPTION
    自动完成：读取 csproj 版本号 -> 关闭占用进程 -> 发布无依赖单文件 exe ->
    校验版本 -> 复制为带版本名的资产 -> 打 tag 并推送 -> 创建 GitHub Release 并上传 exe。

    认证：优先用环境变量 $env:GH_TOKEN；否则自动从 git 凭据管理器读取（即平时 git push 用的令牌）。
    仓库地址自动从 `git remote get-url origin` 解析，无需硬编码。

.PARAMETER NotesFile
    发布说明 Markdown 文件路径，默认脚本同目录的 release-notes.md（不存在则自动生成简要说明）。

.PARAMETER Prerelease
    标记为预发布版本。

.PARAMETER SkipBuild
    跳过编译，直接使用已存在的 publish 产物（调试脚本时用）。

.PARAMETER KeepAsset
    保留复制出来的带版本名 exe（默认上传后删除，保持工作区干净）。

.EXAMPLE
    .\release.ps1
    按 csproj 里的 <Version> 发布。

.EXAMPLE
    .\release.ps1 -Prerelease
#>
[CmdletBinding()]
param(
    [string]$NotesFile,
    [switch]$Prerelease,
    [switch]$SkipBuild,
    [switch]$KeepAsset
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root    = Split-Path -Parent $MyInvocation.MyCommand.Definition
$Project = Join-Path $Root "MinimalTodoApp\MinimalTodoApp.csproj"
$OutDir  = Join-Path $Root "MinimalTodoApp\bin\Release\net8.0-windows\win-x64\publish"
$Exe     = Join-Path $OutDir "MinimalTodoApp.exe"

function Fail($msg) { Write-Host "==> 错误：$msg" -ForegroundColor Red; exit 1 }
function Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }

# ---------- 1. 读取版本号 ----------
if (-not (Test-Path $Project)) { Fail "找不到项目文件：$Project" }
[xml]$csproj = Get-Content $Project
$Version = $csproj.Project.PropertyGroup.Version | Where-Object { $_ } | Select-Object -First 1
if ([string]::IsNullOrWhiteSpace($Version)) {
    Fail "csproj 里没有 <Version>，请先在 <PropertyGroup> 中写入，例如 <Version>1.0.0</Version>"
}
$Version = $Version.Trim()
$Tag     = "v$Version"
$Asset   = "MinimalTodoApp-$Tag-win-x64.exe"
Step "目标版本：$Version  (tag: $Tag)"

# ---------- 2. 解析仓库 owner/repo ----------
$originUrl = (& git remote get-url origin).Trim()
if ($originUrl -match 'github\.com[:/](.+?)(\.git)?$') {
    $RepoSlug = $Matches[1]
} else {
    Fail "无法从 origin 解析 GitHub 仓库：$originUrl"
}
Step "目标仓库：$RepoSlug"

# ---------- 3. tag 预检（已存在则中止，避免覆盖已发布版本）----------
$existingTag = & git tag -l $Tag
if ($existingTag) {
    Fail "标签 $Tag 已存在。若要重新发布，请先删除：git tag -d $Tag; git push origin :refs/tags/$Tag"
}

# ---------- 4. 关闭占用 exe 的进程 ----------
Get-Process MinimalTodoApp -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 600

# ---------- 5. 编译发布 ----------
if ($SkipBuild) {
    Step "跳过编译（-SkipBuild）"
} else {
    Step "发布自包含单文件 exe (win-x64)…"
    & dotnet publish $Project -c Release -r win-x64 `
        --self-contained true `
        -p:PublishSingleFile=true `
        -p:EnableCompressionInSingleFile=true `
        -p:IncludeNativeLibrariesForSelfExtract=true `
        -p:DebugType=none `
        -p:SatelliteResourceLanguages=en
    if ($LASTEXITCODE -ne 0) { Fail "dotnet publish 失败（退出码 $LASTEXITCODE）" }
}

# ---------- 6. 校验产物版本（防止用到上一次的旧 exe）----------
if (-not (Test-Path $Exe)) { Fail "未找到发布产物：$Exe" }
$fileVer = (Get-Item $Exe).VersionInfo.FileVersion
if (-not $fileVer.StartsWith($Version)) {
    Fail "产物版本 ($fileVer) 与目标版本 ($Version) 不一致，可能用到了旧 exe。请重试。"
}
$SizeMB = [math]::Round((Get-Item $Exe).Length / 1MB, 2)
Step "产物校验通过：FileVersion=$fileVer, 大小=$SizeMB MB"

# ---------- 7. 复制为带版本名的资产 ----------
$AssetPath = Join-Path $Root $Asset
Copy-Item $Exe $AssetPath -Force

# ---------- 8. 准备发布说明 ----------
if (-not $NotesFile) {
    $default = Join-Path $Root "release-notes.md"
    if (Test-Path $default) { $NotesFile = $default }
}
if ($NotesFile -and (Test-Path $NotesFile)) {
    # 用 ReadAllText 而非 Get-Content -Raw：后者会给字符串附加 PSPath 等 NoteProperty，
    # 经 ConvertTo-Json 时把 body 序列化成对象 → GitHub 创建 Release 返回 422。
    $Body = [IO.File]::ReadAllText($NotesFile)
    Step "发布说明：$NotesFile"
} else {
    $Body = "MinimalTodoApp $Tag`n`n下载 ``$Asset`` 双击即可运行，无需安装 .NET 运行时（自包含单文件，约 $SizeMB MB）。"
    Step "未提供发布说明，使用自动生成的简要说明"
}

# ---------- 9. 推送当前分支 + tag ----------
Step "推送当前分支…"
& git push origin HEAD
if ($LASTEXITCODE -ne 0) { Fail "推送分支失败（请确认已提交版本号改动）" }

Step "创建并推送标签 $Tag…"
& git tag -a $Tag -m "MinimalTodoApp $Version"
& git push origin $Tag
if ($LASTEXITCODE -ne 0) { Fail "推送标签失败" }

# ---------- 10. 获取访问令牌 ----------
$Token = $env:GH_TOKEN
if ([string]::IsNullOrWhiteSpace($Token)) {
    # 以「逐行数组」喂给 git credential fill(每个元素一行)，比单条多行字符串可靠:
    # 单条多行字符串经 PowerShell 管道传给原生 exe 时，编码/换行处理可能让 git 收到的
    # 首行不是 protocol= 而报“missing protocol field”。数组形式由 PS 逐行追加换行,稳定.
    $credIn = @("protocol=https", "host=github.com", "")
    $credOut = $credIn | & git credential fill
    $pwLine = $credOut | Where-Object { $_ -like 'password=*' } | Select-Object -First 1
    if ($pwLine) { $Token = $pwLine.Substring('password='.Length) }
}
if ([string]::IsNullOrWhiteSpace($Token)) {
    Fail "拿不到 GitHub 令牌。请设置 `$env:GH_TOKEN，或确保 git 凭据管理器中已保存 github.com 的登录。`n（tag 已推送，可稍后到网页手动创建 Release：https://github.com/$RepoSlug/releases/new?tag=$Tag）"
}

$Headers = @{
    Authorization = "token $Token"
    Accept        = "application/vnd.github+json"
    "User-Agent"  = "release-script"
}

# ---------- 11. 创建 Release ----------
Step "创建 GitHub Release…"
$payload = @{
    tag_name   = $Tag
    name        = "MinimalTodoApp $Version"
    body        = $Body
    draft       = $false
    prerelease  = [bool]$Prerelease
}
$jsonBytes = [Text.Encoding]::UTF8.GetBytes(($payload | ConvertTo-Json -Depth 5))
try {
    $rel = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$RepoSlug/releases" `
        -Headers $Headers -Body $jsonBytes -ContentType "application/json; charset=utf-8"
} catch {
    Fail "创建 Release 失败：$($_.Exception.Message)`n（tag 已推送，可到网页手动创建：https://github.com/$RepoSlug/releases/new?tag=$Tag）"
}

# ---------- 12. 上传资产 ----------
Step "上传资产 $Asset …"
$uploadUrl = "https://uploads.github.com/repos/$RepoSlug/releases/$($rel.id)/assets?name=$Asset"
try {
    $assetResp = Invoke-RestMethod -Method Post -Uri $uploadUrl `
        -Headers $Headers -InFile $AssetPath -ContentType "application/octet-stream"
} catch {
    Fail "上传资产失败：$($_.Exception.Message)`nRelease 已创建：$($rel.html_url)，可手动上传 $AssetPath"
}

# ---------- 13. 清理 ----------
if (-not $KeepAsset) { Remove-Item $AssetPath -Force -ErrorAction SilentlyContinue }

Write-Host ""
Step "完成！"
Write-Host ("    Release : " + $rel.html_url) -ForegroundColor Green
Write-Host ("    下载    : " + $assetResp.browser_download_url) -ForegroundColor Green
