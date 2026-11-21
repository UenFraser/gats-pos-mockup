# Turns your logo mark (the "iso", without the lettering) into the Windows app icon.
# Needs a PNG at least 512 x 512 pixels with a transparent background (export it from your design program).
# Run in the project folder:
#   powershell -ExecutionPolicy Bypass -File .\tools\make-icon.ps1 -Source "C:\path\to\iso.png"
# It writes:  build\icon.ico  (the app + installer icon)   and   client\public\images\app-icon.png  (the window icon)
param([Parameter(Mandatory = $true)][string]$Source)

Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$file = (Resolve-Path $Source).Path
$img = [System.Drawing.Image]::FromFile($file)
if ($img.Width -lt 256 -or $img.Height -lt 256) { Write-Host "The picture is only $($img.Width) x $($img.Height). Use one that is at least 512 x 512." -ForegroundColor Red; exit 1 }

# A square, transparent picture of the given size with the logo centred and not stretched.
function New-SquarePng([System.Drawing.Image]$source, [int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $scale = [Math]::Min($size / $source.Width, $size / $source.Height)
  $w = [int][Math]::Round($source.Width * $scale)
  $h = [int][Math]::Round($source.Height * $scale)
  $g.DrawImage($source, [int](($size - $w) / 2), [int](($size - $h) / 2), $w, $h)
  $g.Dispose()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  return , $ms.ToArray()
}

$sizes = 16, 24, 32, 48, 64, 128, 256
$pngs = New-Object 'System.Collections.Generic.List[byte[]]'
foreach ($s in $sizes) { $pngs.Add([byte[]](New-SquarePng $img $s)) }

# ICO file = header + one directory entry per size + the PNG data of each size.
$out = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $out
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $dim = if ($sizes[$i] -ge 256) { 0 } else { $sizes[$i] }   # 0 means 256 in the ICO format
  $bw.Write([byte]$dim); $bw.Write([byte]$dim); $bw.Write([byte]0); $bw.Write([byte]0)
  $bw.Write([UInt16]1); $bw.Write([UInt16]32)
  $bw.Write([UInt32]$pngs[$i].Length); $bw.Write([UInt32]$offset)
  $offset += $pngs[$i].Length
}
foreach ($p in $pngs) { $bw.Write($p) }
$bw.Flush()

New-Item -ItemType Directory -Force -Path (Join-Path $root 'build') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $root 'client\public\images') | Out-Null
[System.IO.File]::WriteAllBytes((Join-Path $root 'build\icon.ico'), $out.ToArray())
[System.IO.File]::WriteAllBytes((Join-Path $root 'client\public\images\app-icon.png'), $pngs[$sizes.Count - 1])
$img.Dispose()

Write-Host 'Done:' -ForegroundColor Green
Write-Host '  build\icon.ico                       (used by npm run dist for the app and the installer)'
Write-Host '  client\public\images\app-icon.png    (used for the window while the app runs)'
Write-Host 'Now run npm run dist. If Windows still shows the old icon, restart Explorer or the PC (Windows caches icons).'
