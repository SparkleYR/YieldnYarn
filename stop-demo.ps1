[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$runtime = Join-Path $PSScriptRoot '.demo'
foreach ($name in @('web', 'fastapi', 'django')) {
    $record = Join-Path $runtime "$name.process.json"
    if (!(Test-Path $record)) { continue }
    $saved = Get-Content -LiteralPath $record -Raw | ConvertFrom-Json
    $process = Get-Process -Id $saved.pid -ErrorAction SilentlyContinue
    if ($process -and $process.StartTime.ToUniversalTime().Ticks -eq ([datetime]$saved.started).ToUniversalTime().Ticks) {
        Stop-Process -Id $process.Id
        Write-Host "Stopped $name."
    }
    Remove-Item -LiteralPath $record
}
Write-Host 'Demo servers stopped. PostgreSQL and demo data are retained.'
