# Build a fully self-contained, single-file Windows executable.
# No Chinese characters are used in this script on purpose (per build requirement).
# Output requires NO .NET runtime on the target machine.

$ErrorActionPreference = "Stop"

$Root    = Split-Path -Parent $MyInvocation.MyCommand.Definition
$Project = Join-Path $Root "MinimalTodoApp\MinimalTodoApp.csproj"
$OutDir  = Join-Path $Root "MinimalTodoApp\bin\Release\net8.0-windows\win-x64\publish"

Write-Host "==> Restoring packages..." -ForegroundColor Cyan
dotnet restore $Project

Write-Host "==> Publishing self-contained single-file exe (win-x64)..." -ForegroundColor Cyan
dotnet publish $Project -c Release -r win-x64 `
    --self-contained true `
    -p:PublishSingleFile=true `
    -p:EnableCompressionInSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -p:DebugType=none `
    -p:SatelliteResourceLanguages=en

$Exe = Join-Path $OutDir "MinimalTodoApp.exe"
if (Test-Path $Exe) {
    $SizeMB = [math]::Round((Get-Item $Exe).Length / 1MB, 2)
    Write-Host ""
    Write-Host "==> Done." -ForegroundColor Green
    Write-Host ("    Output : " + $Exe)
    Write-Host ("    Size   : " + $SizeMB + " MB")
    Write-Host "    This exe is standalone and needs no .NET runtime installed."
} else {
    Write-Host "==> Build finished but exe not found at expected path:" -ForegroundColor Red
    Write-Host ("    " + $Exe)
    exit 1
}
