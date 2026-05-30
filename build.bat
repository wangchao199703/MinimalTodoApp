@echo off
REM Build a fully self-contained single-file exe (no .NET runtime needed on target).
REM No Chinese characters are used in this script on purpose.

setlocal
set PROJECT=%~dp0MinimalTodoApp\MinimalTodoApp.csproj

echo ==^> Restoring packages...
dotnet restore "%PROJECT%"
if errorlevel 1 goto :error

echo ==^> Publishing self-contained single-file exe (win-x64)...
dotnet publish "%PROJECT%" -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:EnableCompressionInSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=none -p:SatelliteResourceLanguages=en
if errorlevel 1 goto :error

echo.
echo ==^> Done.
echo     Output: %~dp0MinimalTodoApp\bin\Release\net8.0-windows\win-x64\publish\MinimalTodoApp.exe
echo     This exe is standalone and needs no .NET runtime installed.
goto :eof

:error
echo ==^> Build failed.
exit /b 1
