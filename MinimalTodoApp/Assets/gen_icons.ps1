Add-Type -AssemblyName System.Drawing

$dir = "D:\BaiduSyncdisk\code\todo_project\MinimalTodoApp\Assets\icon_options"
$S = 256

function New-Bmp { param($size) $b = New-Object System.Drawing.Bitmap($size,$size); $g=[System.Drawing.Graphics]::FromImage($b); $g.SmoothingMode='AntiAlias'; $g.PixelOffsetMode='HighQuality'; return ,$b,$g }

function Draw-Check {
    param($g, $size, [System.Drawing.Color]$color, [double]$thick = 0.12)
    $pen = New-Object System.Drawing.Pen($color, [single]($size*$thick))
    $pen.StartCap='Round'; $pen.EndCap='Round'; $pen.LineJoin='Round'
    $p1 = New-Object System.Drawing.PointF([single]($size*0.26),[single]($size*0.52))
    $p2 = New-Object System.Drawing.PointF([single]($size*0.43),[single]($size*0.69))
    $p3 = New-Object System.Drawing.PointF([single]($size*0.76),[single]($size*0.33))
    $g.DrawLines($pen, @($p1,$p2,$p3))
    $pen.Dispose()
}

function RoundRect { param($g, $rect, $radius, $brush)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $radius*2
    $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
    $path.AddArc($rect.Right-$d, $rect.Y, $d, $d, 270, 90)
    $path.AddArc($rect.Right-$d, $rect.Bottom-$d, $d, $d, 0, 90)
    $path.AddArc($rect.X, $rect.Bottom-$d, $d, $d, 90, 90)
    $path.CloseFigure()
    $g.FillPath($brush, $path)
    $path.Dispose()
}

# ---- 1. Blue rounded square + white check (matches current tray) ----
$r = New-Bmp $S; $b=$r[0]; $g=$r[1]
$rect = New-Object System.Drawing.RectangleF(10,10,($S-20),($S-20))
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(59,130,246))
RoundRect $g $rect 56 $brush
Draw-Check $g $S ([System.Drawing.Color]::White) 0.13
$b.Save("$dir\1_blue_square.png",[System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $b.Dispose()

# ---- 2. Green circle + white check ----
$r = New-Bmp $S; $b=$r[0]; $g=$r[1]
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(34,197,94))
$g.FillEllipse($brush, 12,12,($S-24),($S-24))
Draw-Check $g $S ([System.Drawing.Color]::White) 0.13
$b.Save("$dir\2_green_circle.png",[System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $b.Dispose()

# ---- 3. Blue->Indigo gradient rounded square + white check ----
$r = New-Bmp $S; $b=$r[0]; $g=$r[1]
$rect = New-Object System.Drawing.RectangleF(10,10,($S-20),($S-20))
$lg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, [System.Drawing.Color]::FromArgb(59,130,246), [System.Drawing.Color]::FromArgb(99,71,222), 45)
RoundRect $g $rect 56 $lg
Draw-Check $g $S ([System.Drawing.Color]::White) 0.13
$b.Save("$dir\3_gradient_square.png",[System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $b.Dispose()

# ---- 4. Outline ring + blue check (transparent bg) ----
$r = New-Bmp $S; $b=$r[0]; $g=$r[1]
$ringPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(59,130,246), [single]($S*0.07))
$g.DrawEllipse($ringPen, 18,18,($S-36),($S-36))
Draw-Check $g $S ([System.Drawing.Color]::FromArgb(59,130,246)) 0.11
$ringPen.Dispose()
$b.Save("$dir\4_outline_ring.png",[System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $b.Dispose()

# ---- 5. Dark slate rounded square + bright green check ----
$r = New-Bmp $S; $b=$r[0]; $g=$r[1]
$rect = New-Object System.Drawing.RectangleF(10,10,($S-20),($S-20))
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(30,41,59))
RoundRect $g $rect 56 $brush
Draw-Check $g $S ([System.Drawing.Color]::FromArgb(74,222,128)) 0.13
$b.Save("$dir\5_dark_green.png",[System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $b.Dispose()

# ---- 6. White square + blue check, soft border ----
$r = New-Bmp $S; $b=$r[0]; $g=$r[1]
$rect = New-Object System.Drawing.RectangleF(10,10,($S-20),($S-20))
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
RoundRect $g $rect 56 $brush
Draw-Check $g $S ([System.Drawing.Color]::FromArgb(59,130,246)) 0.13
$b.Save("$dir\6_white_blue.png",[System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $b.Dispose()

Write-Host "Generated 6 icon previews in $dir"
Get-ChildItem $dir -Filter *.png | ForEach-Object { Write-Host $_.Name }
