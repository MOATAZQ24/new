$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$state = Join-Path $root '.lan-runtime/processes.json'
if (-not (Test-Path $state)) { Write-Host 'No managed LAN processes.'; return }
$records = @(Get-Content $state -Raw | ConvertFrom-Json)
foreach ($record in ($records | Sort-Object @{Expression={switch ($_.name) { 'telegram' {0} 'frontend' {1} default {2} }}})) {
    $proc = Get-Process -Id $record.pid -ErrorAction SilentlyContinue
    if ($proc -and $proc.StartTime.ToUniversalTime().Ticks -eq ([datetime]$record.started).ToUniversalTime().Ticks) {
        # Include only children of the verified process; venv Python and Next spawn children.
        $children = try { @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object ParentProcessId -eq $proc.Id) } catch { @() }
        foreach ($child in $children) { Stop-Process -Id $child.ProcessId -ErrorAction SilentlyContinue }
        Stop-Process -Id $proc.Id -ErrorAction SilentlyContinue
        Write-Host "Stopped $($record.name)"
    }
}
Remove-Item -LiteralPath $state
