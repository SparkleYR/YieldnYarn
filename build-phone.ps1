[CmdletBinding()]
param(
    [string]$SdkPath = $env:ANDROID_HOME,
    [string]$JavaPath = $env:JAVA_HOME,
    [string]$Serial,
    [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
if (!$SdkPath) {
    $candidates = @("$env:LOCALAPPDATA/Android/Sdk", "$env:LOCALAPPDATA/Packages/Claude_pzs8sxrjxfjjc/LocalCache/Local/Android/Sdk")
    $SdkPath = $candidates | Where-Object { Test-Path "$_/platforms" } | Select-Object -First 1
}
if (!$JavaPath) {
    $JavaPath = Get-ChildItem "$env:USERPROFILE/tools" -Directory -Filter 'jdk-*' -ErrorAction SilentlyContinue |
        Where-Object { Test-Path "$($_.FullName)/bin/javac.exe" } | Select-Object -First 1 -ExpandProperty FullName
}
if (!$SdkPath -or !(Test-Path "$SdkPath/platforms")) { throw 'Android SDK missing. Pass -SdkPath with its folder.' }
if (!$JavaPath -or !(Test-Path "$JavaPath/bin/javac.exe")) { throw 'JDK missing. Pass -JavaPath with its folder.' }
$env:ANDROID_HOME = $SdkPath
$env:JAVA_HOME = $JavaPath
$adb = if (Test-Path 'C:/platform-tools/adb.exe') { 'C:/platform-tools/adb.exe' } else { "$SdkPath/platform-tools/adb.exe" }
function Invoke-Checked([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed ($LASTEXITCODE): $Program $($Arguments -join ' ')" }
}
if (!$Serial) {
    $Serial = & $adb devices | ForEach-Object { if ($_ -match '^([^\s]+)\s+device$') { $matches[1] } } | Select-Object -First 1
}
if (!$Serial) { throw 'Connect your phone by USB and accept its USB debugging prompt.' }
Push-Location (Join-Path $root 'seller-app')
try {
    Set-Content -LiteralPath 'local.properties' -Value ('sdk.dir=' + $SdkPath.Replace('\', '/'))
    if (!$SkipBuild) {
        Invoke-Checked '.\gradlew.bat' @(':app:assembleDebug', ':core:test', '--console=plain',
            '-PsellerApiUrl=http://127.0.0.1:8000/api/', '-PsellerComputeUrl=http://127.0.0.1:8001/compute/')
    }
    $apk = Join-Path $PWD 'app/build/outputs/apk/debug/app-debug.apk'
    if (!(Test-Path $apk)) { throw 'Debug APK missing. Rerun without -SkipBuild.' }
    Invoke-Checked $adb @('-s', $Serial, 'install', '-r', $apk)
    Invoke-Checked $adb @('-s', $Serial, 'reverse', 'tcp:8000', 'tcp:8000')
    Invoke-Checked $adb @('-s', $Serial, 'reverse', 'tcp:8001', 'tcp:8001')
    Invoke-Checked $adb @('-s', $Serial, 'shell', 'am', 'start', '-n', 'com.msme.seller/.MainActivity')
    Write-Host 'Seller app installed and opened. Keep USB connected and run start-demo.ps1.' -ForegroundColor Green
} finally { Pop-Location }
