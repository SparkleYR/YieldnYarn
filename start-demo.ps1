[CmdletBinding()]
param(
    [string]$WslDistro = 'Ubuntu-24.04',
    [switch]$SkipSeed,
    [switch]$RebuildWeb,
    [switch]$DevWeb,
    [switch]$SkipPhone
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$runtime = Join-Path $root '.demo'
$logs = Join-Path $runtime 'logs'
$python = Join-Path $runtime 'venv/Scripts/python.exe'
$next = Join-Path $root 'web-app/node_modules/next/dist/bin/next'
$node = (Get-Command node -ErrorAction Stop).Source
New-Item -ItemType Directory -Path $logs -Force | Out-Null
if (!(Test-Path $python)) { throw 'Local Python environment missing. See docs/demo/README.md setup instructions.' }
if (!(Test-Path $next)) { throw 'Run pnpm install --frozen-lockfile in web-app first.' }
if (!(Test-Path (Join-Path $root '.env'))) {
    Copy-Item -LiteralPath (Join-Path $root '.env.example') -Destination (Join-Path $root '.env')
}
# Local review settings, inherited by the child processes. No cloud services needed.
$env:DJANGO_DEBUG = 'True'
$env:DJANGO_ALLOWED_HOSTS = 'localhost,127.0.0.1,10.0.2.2'
$env:DB_HOST = '127.0.0.1'
$env:DB_PORT = '5432'
$env:DB_NAME = 'msme_marketplace'
$env:DB_USER = 'msme_dev'
$env:DB_PASSWORD = 'devpassword'
$env:DATABASE_URL = 'postgresql://msme_dev:devpassword@127.0.0.1:5432/msme_marketplace'
$env:FASTAPI_BASE_URL = 'http://127.0.0.1:8001'
$env:FRONTEND_URL = 'http://localhost:3000'
$env:CORS_ALLOWED_ORIGINS = 'http://localhost:3000,http://127.0.0.1:3000'
$env:REFRESH_COOKIE_SECURE = 'False'
$env:JWT_ACCESS_TOKEN_LIFETIME_MIN = '480'
$env:AGMARKNET_USE_SAMPLE_KEY = 'False'
$env:NEXT_PUBLIC_DJANGO_API_URL = 'http://localhost:8000/api'
$env:NEXT_PUBLIC_FASTAPI_URL = 'http://localhost:8001/compute'
$env:NEXT_TELEMETRY_DISABLED = '1'
$env:PYTHONUNBUFFERED = '1'

function Invoke-Checked([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed ($LASTEXITCODE): $Program $($Arguments -join ' ')" }
}
function Test-Ready([string]$Url) {
    try { return (Invoke-WebRequest -Uri $Url -TimeoutSec 3 -UseBasicParsing).StatusCode -eq 200 }
    catch { return $false }
}
function Wait-Ready([string]$Name, [string]$Url, [int]$Seconds = 90) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-Ready $Url) { Write-Host "$Name ready: $Url" -ForegroundColor Green; return }
        Start-Sleep -Seconds 2
    }
    throw "$Name did not become ready. Check $logs/$Name.err.log"
}
function Start-ServiceProcess([string]$Name, [string]$Program, [string[]]$Arguments, [string]$Directory, [string]$Url) {
    if (Test-Ready $Url) { Write-Host "$Name already running."; return }
    $quoted = $Arguments | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }
    $process = Start-Process -FilePath $Program -ArgumentList $quoted -WorkingDirectory $Directory -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $logs "$Name.out.log") -RedirectStandardError (Join-Path $logs "$Name.err.log")
    @{ name = $Name; pid = $process.Id; started = $process.StartTime.ToUniversalTime().ToString('o'); program = $Program } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtime "$Name.process.json")
    Wait-Ready $Name $Url
}

Push-Location $root
try {
    # A systemd service alone does not keep WSL alive. Hold a foreground
    # Linux process so PostgreSQL survives after this launcher exits.
    $dbRecord = Join-Path $runtime 'postgres.process.json'
    $dbHostRunning = $false
    if (Test-Path $dbRecord) {
        $saved = Get-Content -LiteralPath $dbRecord -Raw | ConvertFrom-Json
        $dbHost = Get-Process -Id $saved.pid -ErrorAction SilentlyContinue
        $dbHostRunning = $dbHost -and $dbHost.StartTime.ToUniversalTime().Ticks -eq ([datetime]$saved.started).ToUniversalTime().Ticks
    }
    if (!$dbHostRunning) {
        $dbHost = Start-Process 'wsl.exe' -ArgumentList @('-d', $WslDistro, '-u', 'root', '--', 'sleep', 'infinity') `
            -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'postgres.out.log') `
            -RedirectStandardError (Join-Path $logs 'postgres.err.log')
        @{ name = 'postgres'; pid = $dbHost.Id; started = $dbHost.StartTime.ToUniversalTime().ToString('o') } |
            ConvertTo-Json | Set-Content -LiteralPath $dbRecord
    }
    $linuxRoot = & wsl.exe -d $WslDistro -- wslpath -a $root.Replace('\', '/')
    if ($LASTEXITCODE -ne 0 -or !$linuxRoot) { throw 'Cannot access this project folder in WSL.' }
    $linuxRoot = $linuxRoot.Trim()
    Write-Host 'Starting local PostgreSQL...'
    Invoke-Checked 'wsl.exe' @('-d', $WslDistro, '-u', 'root', '--', 'bash', "$linuxRoot/infra/local/init-demo-db.sh")
    Push-Location (Join-Path $root 'backend-django')
    try {
        Invoke-Checked $python @('manage.py', 'migrate', '--noinput')
        Invoke-Checked $python @('manage.py', 'seed_verticals')
        if (!$SkipSeed) {
            Invoke-Checked $python @('manage.py', 'seed_demo')
            Invoke-Checked $python @((Join-Path $root 'infra/local/seed-review.py'))
        }
    } finally { Pop-Location }
    Start-ServiceProcess 'django' $python @('manage.py', 'runserver', '127.0.0.1:8000', '--noreload') (Join-Path $root 'backend-django') 'http://127.0.0.1:8000/api/schema/'
    Start-ServiceProcess 'fastapi' $python @('-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8001') (Join-Path $root 'backend-fastapi') 'http://127.0.0.1:8001/health'
    if (!$DevWeb -and ($RebuildWeb -or !(Test-Path (Join-Path $root 'web-app/.next/BUILD_ID')))) {
        Write-Host 'Building web app once for a fast, offline presentation...'
        Push-Location (Join-Path $root 'web-app')
        try { Invoke-Checked $node @($next, 'build') } finally { Pop-Location }
    }
    $webMode = if ($DevWeb) { 'dev' } else { 'start' }
    Start-ServiceProcess 'web' $node @($next, $webMode, '--hostname', '127.0.0.1', '--port', '3000') (Join-Path $root 'web-app') 'http://localhost:3000/'
    $adbCommand = Get-Command adb -ErrorAction SilentlyContinue
    $adb = if ($adbCommand) { $adbCommand.Source } elseif (Test-Path 'C:\platform-tools\adb.exe') { 'C:\platform-tools\adb.exe' } else { $null }
    if (!$SkipPhone -and $adb) {
        $devices = & $adb devices
        $serials = @($devices | ForEach-Object { if ($_ -match '^([^\s]+)\s+device$') { $matches[1] } })
        foreach ($serial in $serials) {
            Invoke-Checked $adb @('-s', $serial, 'reverse', 'tcp:8000', 'tcp:8000')
            Invoke-Checked $adb @('-s', $serial, 'reverse', 'tcp:8001', 'tcp:8001')
            Write-Host "Phone USB forwarding ready: $serial"
        }
        if ($serials.Count -eq 0) { Write-Warning 'No authorized phone found; plug it in and rerun this script.' }
    } elseif (!$SkipPhone) {
        Write-Warning 'ADB was not found. Add your platform-tools folder to PATH for phone USB forwarding.'
    }
    Write-Host "`nYieldnYarn is running. Keep the USB cable connected." -ForegroundColor Green
    Write-Host 'Web: http://localhost:3000 | API docs: http://localhost:8000/api/docs/'
    Write-Host 'Demo password: Demo@12345 | Accounts and walkthrough: docs/demo/README.md'
    Write-Host 'Servers continue in the background. Stop with: .\stop-demo.ps1'
} finally { Pop-Location }
