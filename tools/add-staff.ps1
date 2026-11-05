# Add a staff member to a running Gats POS (npm start or the packaged exe).
# Usage:  powershell -ExecutionPolicy Bypass -File .\tools\add-staff.ps1
# Run on the PC that hosts the app. Uses YOUR manager login, not a hardcoded one.
param([string]$Base = 'http://localhost:3000')
$j = 'application/json'
function Plain($s) { [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)) }
function Post($path, $body, $h = @{}) {
  Invoke-RestMethod -Method Post "$Base$path" -ContentType $j -Headers $h -Body ($body | ConvertTo-Json)
}
function Fail($e) {
  $msg = $e.ErrorDetails.Message; if (-not $msg) { $msg = $e.Exception.Message }
  Write-Host "Failed: $msg" -ForegroundColor Red; exit 1
}

$mUser = Read-Host 'Manager USERNAME (the one you typed in first-time setup)'
$mPass = Plain (Read-Host 'Manager password' -AsSecureString)
try { $m = Post '/api/auth/login' @{ username = $mUser; secret = $mPass; device = 'add-staff script' } } catch { Fail $_ }
$h = @{ Authorization = "Bearer $($m.token)" }

do {
  $name = Read-Host 'Display name (what shows on the phone, e.g. Ana)'
  $user = Read-Host 'Username (unique, lowercase, e.g. ana)'
  $role = (Read-Host 'Role (WAITER, CASHIER or KDS)').ToUpper()
  $pin  = Plain (Read-Host '6-digit PIN' -AsSecureString)
  if ($pin -notmatch '^\d{6}$') { Write-Host 'PIN must be exactly 6 digits.' -ForegroundColor Red; continue }
  try {
    Post '/api/users' @{ username = $user; displayName = $name; role = $role; secret = $pin } $h | Out-Null
    Write-Host "Created $name ($role)." -ForegroundColor Green
  } catch { Fail $_ }
  $again = Read-Host 'Add another? (y/n)'
} while ($again -eq 'y')

try { Post '/api/auth/logout' @{} $h | Out-Null } catch {}
"Staff the phone will show:"; (Invoke-RestMethod "$Base/api/auth/staff") | Format-Table displayName, role
