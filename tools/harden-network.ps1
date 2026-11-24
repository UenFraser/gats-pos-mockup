# Makes the POS computer reliably reachable. Run ONCE on the POS computer, in a PowerShell window opened with "Run as administrator":
#   powershell -ExecutionPolicy Bypass -File .\tools\harden-network.ps1
param([int]$Port = 3000)

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host 'Please run this in a PowerShell window opened with "Run as administrator".' -ForegroundColor Red
  exit 1
}

# 1. Firewall: allow phones on ANY network type, but only devices on the same local network (never the internet).
#    (A rule for Private networks only stops working when Windows decides a network has become Public.)
$name = "Gats POS (TCP $Port)"
Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $name -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Any -RemoteAddress LocalSubnet | Out-Null
Write-Host "1. Firewall rule set: devices on your local network can reach port $Port on any network type." -ForegroundColor Green

# 2. Network adapters must never be switched off to save power (a sleeping Wi-Fi adapter ignores phones).
Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | ForEach-Object {
  try { Set-NetAdapterPowerManagement -Name $_.Name -AllowComputerToTurnOffDevice Disabled -ErrorAction Stop; Write-Host ("2. {0}: power saving switched off" -f $_.Name) -ForegroundColor Green }
  catch { Write-Host ("2. {0}: not changed ({1})" -f $_.Name, $_.Exception.Message) -ForegroundColor Yellow }
}

# 3. Never sleep or hibernate while plugged in; Wi-Fi power saving mode = Maximum Performance.
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /setacvalueindex SCHEME_CURRENT 19cbb8fa-5279-450e-9fac-8a3d5fedd0c1 12bbebe6-58d6-4636-95bb-3217ef867c1a 0
powercfg /setactive SCHEME_CURRENT
Write-Host '3. Power plan: no sleep, no hibernate, Wi-Fi at maximum performance (when plugged in).' -ForegroundColor Green

Write-Host "`nStill to do by hand (see docs\NETWORK.md):" -ForegroundColor Yellow
Write-Host '  - give this computer a fixed address in the router (DHCP reservation)'
Write-Host '  - use a network CABLE for this computer if you can'
Write-Host "  - turn OFF 'AP isolation' / 'client isolation' in the router"
Write-Host '  - on staff phones, turn off "switch to mobile data automatically" (Android) / Wi-Fi Assist (iPhone)'
