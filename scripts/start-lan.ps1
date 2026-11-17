param([switch]$SkipBuild, [switch]$KeepRunning)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$runtime = Join-Path $root '.lan-runtime'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
$lock = [IO.File]::Open((Join-Path $runtime 'startup.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
try {
    $existing = try {
        Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
            $_.Name -match '^(python|pythonw|node)(\.exe)?$' -and $_.CommandLine -match 'uvicorn.*app.main:app|next (dev|start)|next/dist/bin/next (dev|start)|telegram_poller'
        }
    } catch {
        $null
    }
    if ($existing) { throw 'Application processes already exist. Run stop-lan.ps1 for managed processes; stop older project development servers before starting LAN mode.' }
    foreach ($port in @(3000,8000)) {
        $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Any, $port)
        try { $listener.Start() } finally { $listener.Stop() }
    }
    $adapter = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1
    if (-not $adapter) { throw 'No active IPv4 LAN gateway found.' }
    $ip = $adapter.IPv4Address.IPAddress | Select-Object -First 1
    $url = "http://${ip}:3000"
    $python = Join-Path $root 'backend/.venv/Scripts/python.exe'
    if (-not (Test-Path $python)) { throw 'backend/.venv/Scripts/python.exe is missing. Install backend requirements first.' }
    $env:PYTHONPATH = (Join-Path $root 'backend')
    $env:DEBUG = 'false'
    $env:SESSION_COOKIE_SECURE = 'false' # HTTP on trusted LAN; enable for HTTPS deployment.
    $env:CORS_ORIGINS = ConvertTo-Json -Compress @($url,'http://localhost:3000','http://127.0.0.1:3000')
    $env:FRONTEND_URL = $url
    $env:NODE_ENV = 'production'
    $env:NEXT_TELEMETRY_DISABLED = '1'
    $env:HOSTNAME = '0.0.0.0'
    $env:PORT = '3000'
    if (-not $SkipBuild) {
        Push-Location (Join-Path $root 'frontend')
        try {
            & node node_modules/next/dist/bin/next build *> (Join-Path $runtime 'build.log')
            if ($LASTEXITCODE -ne 0) { throw "Frontend build failed. See $runtime/build.log" }
        } finally { Pop-Location }
    }
    if (-not (Test-Path (Join-Path $root 'frontend/.next/BUILD_ID'))) { throw 'Production build missing. Start without -SkipBuild.' }
    # Next standalone output excludes static/public assets; stage them beside server.js.
    $standalone = Join-Path $root 'frontend/.next/standalone'
    if (-not (Test-Path (Join-Path $standalone 'server.js'))) { throw 'Standalone build missing. Rebuild without -SkipBuild.' }
    $staticTarget = Join-Path $standalone '.next/static'
    New-Item -ItemType Directory -Force -Path $staticTarget | Out-Null
    Copy-Item -Path (Join-Path $root 'frontend/.next/static/*') -Destination $staticTarget -Recurse -Force
    $publicTarget = Join-Path $standalone 'public'
    New-Item -ItemType Directory -Force -Path $publicTarget | Out-Null
    if (Test-Path (Join-Path $root 'frontend/public')) { Copy-Item -Path (Join-Path $root 'frontend/public/*') -Destination $publicTarget -Recurse -Force }
    $records = @()
    function Start-ServiceProcess($name, $exe, $arguments, $directory) {
        $proc = Start-Process -FilePath $exe -ArgumentList $arguments -WorkingDirectory $directory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime "$name.out.log") -RedirectStandardError (Join-Path $runtime "$name.err.log")
        $script:records += [pscustomobject]@{ name=$name; pid=$proc.Id; started=$proc.StartTime.ToUniversalTime().ToString('o'); executable=$exe }
        $script:records | ConvertTo-Json | Set-Content (Join-Path $runtime 'processes.json')
    }
    function Wait-Health($healthUrl) {
        for ($attempt=0; $attempt -lt 60; $attempt++) {
            try { $r = Invoke-WebRequest -Uri $healthUrl -TimeoutSec 2 -UseBasicParsing; if ($r.StatusCode -eq 200) { return } } catch {}
            Start-Sleep -Seconds 1
        }
        throw "Service health check timed out: $healthUrl. See $runtime logs."
    }
    try {
        Start-ServiceProcess 'backend' $python '-m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 --no-proxy-headers' (Join-Path $root 'backend')
        Wait-Health 'http://127.0.0.1:8000/api/health'
        Start-ServiceProcess 'frontend' (Get-Command node).Source '.next/standalone/server.js' (Join-Path $root 'frontend')
        Wait-Health "$url/api/health"
        Start-ServiceProcess 'telegram' $python 'app/workers/telegram_poller.py' (Join-Path $root 'backend')
        Start-Sleep -Seconds 3
        foreach ($record in $records) { if (-not (Get-Process -Id $record.pid -ErrorAction SilentlyContinue)) { throw "Process $($record.name) exited. Check logs." } }
        Write-Host "Investor Gate OS: $url"
        Write-Host "API proxy health: $url/api/health"
        Write-Host "Logs: $runtime (Telegram delivery requires configured bot and outbound internet)"
        Write-Host 'No automatic startup task or public internet access was configured.'
        if ($KeepRunning) {
            Write-Host "Services running continuously in daemon mode..."
            Wait-Process -Id ($records.pid)
        }
    } catch {
        & (Join-Path $PSScriptRoot 'stop-lan.ps1')
        throw
    }
} finally { $lock.Dispose() }
