# Lets phones and tablets reach the POS through Windows Firewall. Run ONCE on the POS computer,
# in a PowerShell window opened with "Run as administrator":
#   powershell -ExecutionPolicy Bypass -File .\tools\setup-firewall.ps1
param([int]$Port = 3000)

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host 'Please run this in a PowerShell window opened with "Run as administrator".' -ForegroundColor Red
  exit 1
}

$name = "Gats POS (TCP $Port)"
Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
# Home/office networks only (Private). Phones on the restaurant Wi-Fi are on that network; public Wi-Fi stays blocked.
New-NetFirewallRule -DisplayName $name -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Private | Out-Null
Write-Host "Firewall rule added: phones on your private network can reach port $Port." -ForegroundColor Green

Write-Host "`nYour networks:"
Get-NetConnectionProfile | ForEach-Object { Write-Host ("  {0}: {1}" -f $_.Name, $_.NetworkCategory) }
$public = Get-NetConnectionProfile | Where-Object { $_.NetworkCategory -eq 'Public' }
if ($public) {
  Write-Host "`nThe network above marked Public blocks phones. To change the restaurant network to Private:" -ForegroundColor Yellow
  Write-Host '  Set-NetConnectionProfile -Name "<network name>" -NetworkCategory Private'
}
Write-Host "`nAlso: in the router, give this computer a fixed address (DHCP reservation) and turn OFF 'AP isolation' / 'client isolation'."
