# Tüm DWG'leri (kopyalarından) DXF'e çevirir. Orijinal dosyalara dokunmaz.
# Kullanım: powershell -File scripts/takeoff/convert-all.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$src = Join-Path $root 'Projeler\261102_4199_MSK-Kesin Proje Teslim\DWG'
$work = Join-Path $root 'work'
$acc = 'C:\Program Files\Autodesk\AutoCAD 2027\accoreconsole.exe'
foreach ($d in 'dwg', 'dxf', 'scr') { New-Item -ItemType Directory -Force -Path (Join-Path $work $d) | Out-Null }

foreach ($f in Get-ChildItem $src -Filter *.dwg | Sort-Object Name) {
  $name = $f.BaseName
  $dxf = Join-Path $work "dxf\$name.dxf"
  if (Test-Path $dxf) { "$name : zaten var"; continue }
  $copy = Join-Path $work "dwg\$($f.Name)"
  Copy-Item $f.FullName $copy -Force
  $scr = Join-Path $work "scr\$name.scr"
  [IO.File]::WriteAllText($scr, "FILEDIA`r`n0`r`nDXFOUT`r`n`"$dxf`"`r`nV`r`n2018`r`n16`r`n", [Text.Encoding]::ASCII)
  $t = Get-Date
  $p = Start-Process -FilePath $acc -ArgumentList @('/i', "`"$copy`"", '/s', "`"$scr`"", '/l', 'en-US', '/readonly') -WorkingDirectory $work -NoNewWindow -PassThru -RedirectStandardOutput (Join-Path $work "scr\$name.out")
  if (-not $p.WaitForExit(300000)) { Stop-Process -Id $p.Id -Force -Confirm:$false; "$name : ZAMAN AŞIMI"; continue }
  $ok = Test-Path $dxf
  "{0} : {1} ({2:N0} sn)" -f $name, ($(if ($ok) { 'tamam' } else { 'DXF YOK' })), ((Get-Date) - $t).TotalSeconds
}
"bitti"
