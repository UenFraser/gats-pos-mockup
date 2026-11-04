# Run while the app is running (npm start). Walks through setup, login, staff, and lockout.
$b = 'http://localhost:3000'; $j = 'application/json'
function Post($path, $body, $h = @{}) { Invoke-RestMethod -Method Post "$b$path" -ContentType $j -Headers $h -Body ($body | ConvertTo-Json) }

"needs setup?";   (Invoke-RestMethod "$b/api/setup/status").needsSetup
"create manager"; Post '/api/setup' @{ username='owner'; displayName='Owner'; password='ChangeMe123' } | ConvertTo-Json -Depth 4
$m = Post '/api/auth/login' @{ username='owner'; secret='ChangeMe123'; device='main terminal' }
$h = @{ Authorization = "Bearer $($m.token)" }
"create waiter";  Post '/api/users' @{ username='ana'; displayName='Ana'; role='WAITER'; secret='123456' } $h | ConvertTo-Json -Depth 4
"staff list (what the phone shows)"; Invoke-RestMethod "$b/api/auth/staff" | ConvertTo-Json
$ana = (Invoke-RestMethod "$b/api/auth/staff")[0].id
$w = Post '/api/auth/login' @{ userId=$ana; secret='123456'; device='phone' }
"waiter logged in as:"; (Invoke-RestMethod "$b/api/auth/me" -Headers @{ Authorization = "Bearer $($w.token)" }).user.displayName
"waiter tries manager-only list (expect 403):"
try { Invoke-RestMethod "$b/api/users" -Headers @{ Authorization = "Bearer $($w.token)" } } catch { $_.Exception.Response.StatusCode.value__ }
"5 wrong PINs, then lockout (expect 401 x5, then 423):"
1..6 | ForEach-Object { try { Post '/api/auth/login' @{ userId=$ana; secret='000000' } | Out-Null } catch { $_.Exception.Response.StatusCode.value__ } }
