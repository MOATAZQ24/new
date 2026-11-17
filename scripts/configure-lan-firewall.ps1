# Run from an elevated PowerShell. Does not change the network profile.
$ErrorActionPreference = 'Stop'
$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Administrator elevation is required to change Windows Firewall. No rules changed.' }
$adapter = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1
if (-not $adapter) { throw 'No active LAN interface found.' }
$ip = $adapter.IPv4Address.IPAddress | Select-Object -First 1
$profile = (Get-NetConnectionProfile -InterfaceIndex $adapter.InterfaceIndex).NetworkCategory.ToString()
if ($profile -eq 'DomainAuthenticated') { $profile = 'Domain' }
$node = (Get-Command node).Source
$rules = @(
    @{Name='InvestorGate-LAN-Frontend'; DisplayName='Investor Gate OS - trusted LAN TCP 3000'; Direction='Inbound'; Action='Allow'; Protocol='TCP'; LocalPort=3000; LocalAddress=$ip; RemoteAddress='LocalSubnet'; InterfaceAlias=$adapter.InterfaceAlias; Profile=$profile; Program=$node; EdgeTraversalPolicy='Block'},
    @{Name='InvestorGate-LAN-Block-Backend'; DisplayName='Investor Gate OS - block backend and database from LAN'; Direction='Inbound'; Action='Block'; Protocol='TCP'; LocalPort=@(8000,5432); LocalAddress=$ip; InterfaceAlias=$adapter.InterfaceAlias; Profile='Any'; RemoteAddress='Any'}
)
foreach ($rule in $rules) {
    if (Get-NetFirewallRule -Name $rule.Name -ErrorAction SilentlyContinue) {
        $update = $rule.Clone()
        $update.Remove('DisplayName')
        Set-NetFirewallRule @update -ErrorAction Stop | Out-Null
    }
    else { New-NetFirewallRule @rule -ErrorAction Stop | Out-Null }
}
# Automatic application-wide exceptions would bypass the subnet restriction.
# Save their identities before disabling them; outbound Telegram traffic is unaffected.
$legacy = @(Get-NetFirewallRule -Enabled True -Direction Inbound -Action Allow | Where-Object {
    $_.Name -like '*Query User*' -and ($_.DisplayName -match '\\(node|python)\.exe$')
})
if ($legacy.Count) {
    $runtime = Join-Path (Split-Path $PSScriptRoot -Parent) '.lan-runtime'
    New-Item -ItemType Directory -Force -Path $runtime | Out-Null
    $backup = Join-Path $runtime 'legacy-firewall-rules.json'
    if (-not (Test-Path $backup)) { $legacy | Select-Object Name,DisplayName,Enabled | ConvertTo-Json | Set-Content $backup }
    $legacy | Disable-NetFirewallRule -ErrorAction Stop | Out-Null
}
Write-Host "Allowed http://${ip}:3000 on $($adapter.InterfaceAlias), $profile profile, local subnet only. Backend/database inbound blocked."
