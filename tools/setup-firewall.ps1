# Lets phones and tablets reach the POS through Windows Firewall. Run ONCE on the POS computer,
# in a PowerShell window opened with "Run as administrator":
#   powershell -ExecutionPolicy Bypass -File .\tools\setup-firewall.ps1
# (tools\harden-network.ps1 does this and more: power settings for the network adapter.)
param([int]$Port = 3000)

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host 'Please run this in a PowerShell window opened with "Run as administrator".' -ForegroundColor Red
  exit 1
}

$name = "Gats POS (TCP $Port)"
Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
# Any network type (Windows can flip a network to Public by itself), but only devices on the same local network, never the internet.
New-NetFirewallRule -DisplayName $name -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Any -RemoteAddress LocalSubnet | Out-Null
Write-Host "Firewall rule added: devices on your local network can reach port $Port." -ForegroundColor Green

Write-Host "`nYour networks:"
Get-NetConnectionProfile | ForEach-Object { Write-Host ("  {0}: {1}" -f $_.Name, $_.NetworkCategory) }
Write-Host "`nAlso: in the router, give this computer a fixed address (DHCP reservation) and turn OFF 'AP isolation' / 'client isolation'."
