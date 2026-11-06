# Give a manager or the Lead Cashier a void-approval PIN (or remove it). Run on the PC that hosts the app.
# Usage:  powershell -ExecutionPolicy Bypass -File .\tools\set-approval-pin.ps1
param([string]$Base = 'http://localhost:3000')
$j = 'application/json'
function Plain($s) { [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)) }
function Fail($e) {
  $msg = $e.ErrorDetails.Message; if (-not $msg) { $msg = $e.Exception.Message }
  Write-Host "Failed: $msg" -ForegroundColor Red; exit 1
}

$mUser = Read-Host 'Manager USERNAME'
$mPass = Plain (Read-Host 'Manager password' -AsSecureString)
try {
  $login = Invoke-RestMethod -Method Post "$Base/api/auth/login" -ContentType $j -Body (@{ username = $mUser; secret = $mPass; device = 'approval-pin script' } | ConvertTo-Json)
} catch { Fail $_ }
$h = @{ Authorization = "Bearer $($login.token)" }

$users = Invoke-RestMethod "$Base/api/users" -Headers $h | Where-Object { $_.active -and ($_.role -eq 'MANAGER' -or $_.role -eq 'CASHIER') }
$approvers = (Invoke-RestMethod "$Base/api/approvers" -Headers $h).approvers
Write-Host "`nManagers and cashiers:"
$list = @($users)
$i = 0
foreach ($u in $list) {
  $i++
  $has = [bool]($approvers | Where-Object { $_.id -eq $u.id })
  $tag = if ($has) { 'CAN APPROVE VOIDS' } else { '' }
  Write-Host ("  {0}. {1} ({2}) {3}" -f $i, $u.displayName, $u.role, $tag)
}
$n = [int](Read-Host "`nNumber of the person")
$target = $list[$n - 1]
if (-not $target) { Write-Host 'No such number.' -ForegroundColor Red; exit 1 }

$action = Read-Host "Set a PIN for $($target.displayName) (s) or remove it (r)?"
try {
  if ($action -eq 'r') {
    Invoke-RestMethod -Method Delete "$Base/api/users/$($target.id)/approval-pin" -Headers $h | Out-Null
    Write-Host "$($target.displayName) can no longer approve voids." -ForegroundColor Green
  } else {
    $pin = Plain (Read-Host 'New 6-digit approval PIN' -AsSecureString)
    Invoke-RestMethod -Method Put "$Base/api/users/$($target.id)/approval-pin" -Headers $h -ContentType $j -Body (@{ pin = $pin } | ConvertTo-Json) | Out-Null
    Write-Host "$($target.displayName) can now approve voids with that PIN." -ForegroundColor Green
  }
} catch { Fail $_ }
try { Invoke-RestMethod -Method Post "$Base/api/auth/logout" -Headers $h -ContentType $j -Body '{}' | Out-Null } catch {}
