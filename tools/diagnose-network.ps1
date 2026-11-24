# Run on the POS computer WHILE a phone cannot connect (before restarting anything). No administrator needed.
#   powershell -ExecutionPolicy Bypass -File .\tools\diagnose-network.ps1
# It prints a report, tells you what looks wrong in plain words, and saves the report on your Desktop. Send me that file.
param([int]$Port = 3000)

$lines = New-Object System.Collections.Generic.List[string]
function Say([string]$t) { $lines.Add($t); Write-Host $t }
function Section([string]$t) { Say ''; Say "=== $t ===" }
$script:problems = New-Object System.Collections.Generic.List[string]
$script:gateways = @()
$script:ips = @()

Say ("Gats POS network report  {0}   computer: {1}   port: {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $env:COMPUTERNAME, $Port)

Section '1. Connected network adapters'
try {
  Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | ForEach-Object {
    $ip = (Get-NetIPAddress -InterfaceIndex $_.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1).IPAddress
    if ($ip -and $ip -notlike '169.254.*') { $script:ips += $ip }
    Say ("  {0} [{1}]  {2}  {3}  address {4}" -f $_.Name, $_.InterfaceDescription, $_.PhysicalMediaType, $_.LinkSpeed, $ip)
  }
  Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway } | ForEach-Object {
    Say ("  default gateway on {0}: {1}" -f $_.InterfaceAlias, $_.IPv4DefaultGateway.NextHop)
    $script:gateways += $_.IPv4DefaultGateway.NextHop
  }
  if ($script:ips.Count -eq 0) { $script:problems.Add('The computer has no usable network address. Check the cable or Wi-Fi.') }
  if ($script:ips.Count -gt 1) { Say '  NOTE: more than one address. Phones must use the one on the restaurant network (the QR code shows it).' }
} catch { Say "  (could not read: $($_.Exception.Message))" }

Section '2. Network type (Public blocks phones)'
try {
  Get-NetConnectionProfile | ForEach-Object {
    Say ("  {0} on {1}: {2}" -f $_.Name, $_.InterfaceAlias, $_.NetworkCategory)
    if ($_.NetworkCategory -eq 'Public') { $script:problems.Add("Windows calls the network '$($_.Name)' Public. Public networks block phones unless the firewall rule covers them.") }
  }
} catch { Say "  (could not read: $($_.Exception.Message))" }

Section "3. Is the POS listening on port $Port?"
try {
  $l = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
  $l | ForEach-Object { Say ("  listening on {0}:{1} (process {2})" -f $_.LocalAddress, $_.LocalPort, (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName) }
  if (-not ($l | Where-Object { $_.LocalAddress -in '0.0.0.0', '::' })) { $script:problems.Add("The POS is listening only on a single address, not on all of them.") }
} catch { Say '  NOT listening'; $script:problems.Add("Nothing is listening on port $Port. The POS is not running.") }

Section '4. Windows Firewall rule'
try {
  $r = Get-NetFirewallRule -DisplayName "Gats POS (TCP $Port)" -ErrorAction Stop | Select-Object -First 1
  $f = $r | Get-NetFirewallAddressFilter
  Say ("  found: enabled={0} action={1} networks={2} from={3}" -f $r.Enabled, $r.Action, $r.Profile, ($f.RemoteAddress -join ', '))
  if ("$($r.Profile)" -notmatch 'Any') { $script:problems.Add("The firewall rule covers only '$($r.Profile)' networks. Run tools\harden-network.ps1 (as administrator) to make it work on every network.") }
} catch { Say '  rule not found (or Windows needs administrator rights to read it)'; $script:problems.Add('The firewall rule "Gats POS" was not found. Run tools\harden-network.ps1 as administrator.') }

Section '5. Can this computer reach the router?'
foreach ($g in $script:gateways) {
  $ok = Test-Connection -ComputerName $g -Count 2 -Quiet -ErrorAction SilentlyContinue
  Say ("  router {0}: {1}" -f $g, $(if ($ok) { 'answers' } else { 'DOES NOT ANSWER' }))
  if (-not $ok) { $script:problems.Add("The computer cannot reach its router ($g). Check the cable, Wi-Fi signal or the router itself.") }
}

Section '6. Internet (when it is down, many phones leave the Wi-Fi for mobile data)'
$net = Test-Connection -ComputerName 1.1.1.1 -Count 2 -Quiet -ErrorAction SilentlyContinue
Say ("  internet: {0}" -f $(if ($net) { 'reachable' } else { 'NOT reachable' }))
if (-not $net) { $script:problems.Add('The internet is down. Phones may have switched to mobile data, which cannot reach the POS. Turn mobile data off on the phone and try again.') }

Section '7. Address lease (the router hands out addresses for a limited time)'
try { ipconfig /all | Select-String -Pattern 'adapter|Lease Obtained|Lease Expires|DHCP Server' | ForEach-Object { Say ('  ' + $_.Line.Trim()) } } catch { Say '  (could not read)' }

Section '8. Power settings'
try { Say ('  ' + ((powercfg /getactivescheme) -join ' ')) } catch { }
try { Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | Get-NetAdapterPowerManagement -ErrorAction Stop | ForEach-Object { Say ("  {0}: allow the computer to turn this adapter off = {1}" -f $_.Name, $_.AllowComputerToTurnOffDevice); if ("$($_.AllowComputerToTurnOffDevice)" -eq 'Enabled') { $script:problems.Add("The adapter '$($_.Name)' may be switched off to save power. Run tools\harden-network.ps1 as administrator.") } } } catch { Say '  (adapter power settings need administrator rights to read)' }

Section '9. Does the POS answer on its LAN address? (this is what a phone does)'
foreach ($ip in $script:ips) {
  try { $resp = Invoke-WebRequest -UseBasicParsing -TimeoutSec 4 -Uri ("http://{0}:{1}/api/health" -f $ip, $Port); Say ("  http://{0}:{1}/  answers (status {2})" -f $ip, $Port, $resp.StatusCode) }
  catch { Say ("  http://{0}:{1}/  DOES NOT ANSWER" -f $ip, $Port); $script:problems.Add("The POS does not answer on $ip from this computer itself.") }
}

Section 'WHAT LOOKS WRONG'
if ($script:problems.Count -eq 0) {
  Say '  Nothing on this computer looks wrong. If the phone still cannot connect, the problem is on the phone or the router:'
  Say '  1) turn mobile data OFF on the phone and reload; 2) check the phone is on the same Wi-Fi name; 3) check "AP isolation" in the router.'
} else { $script:problems | ForEach-Object { Say ('  - ' + $_) } }
Say ''
Say 'Phones should open:'
foreach ($ip in $script:ips) { Say ("  http://{0}:{1}/" -f $ip, $Port) }

$path = Join-Path ([Environment]::GetFolderPath('Desktop')) ("gats-network-report-{0}.txt" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
$lines | Set-Content -Encoding UTF8 $path
Write-Host "`nReport saved: $path" -ForegroundColor Green
