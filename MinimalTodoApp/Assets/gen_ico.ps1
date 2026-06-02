Add-Type -AssemblyName System.Drawing

$assetDir = "D:\BaiduSyncdisk\code\todo_project\MinimalTodoApp\Assets"
$icoPath  = Join-Path $assetDir "app.ico"
$sizes = @(16,24,32,48,64,128,256)

function Render-Gradient {
    param([int]$S)
    $b = New-Object System.Drawing.Bitmap($S,$S)
    $g = [System.Drawing.Graphics]::FromImage($b)
    $g.SmoothingMode='AntiAlias'; $g.PixelOffsetMode='HighQuality'

    $pad = [Math]::Max(1, [int]($S*0.04))
    $rect = New-Object System.Drawing.RectangleF($pad,$pad,($S-2*$pad),($S-2*$pad))
    $radius = $S*0.22

    # rounded-rect path
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $radius*2
    $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
    $path.AddArc($rect.Right-$d, $rect.Y, $d, $d, 270, 90)
    $path.AddArc($rect.Right-$d, $rect.Bottom-$d, $d, $d, 0, 90)
    $path.AddArc($rect.X, $rect.Bottom-$d, $d, $d, 90, 90)
    $path.CloseFigure()

    $lg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, [System.Drawing.Color]::FromArgb(59,130,246), [System.Drawing.Color]::FromArgb(99,71,222), 45)
    $g.FillPath($lg, $path)

    # checkmark
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, [single]($S*0.13))
    $pen.StartCap='Round'; $pen.EndCap='Round'; $pen.LineJoin='Round'
    $p1 = New-Object System.Drawing.PointF([single]($S*0.26),[single]($S*0.52))
    $p2 = New-Object System.Drawing.PointF([single]($S*0.43),[single]($S*0.69))
    $p3 = New-Object System.Drawing.PointF([single]($S*0.76),[single]($S*0.33))
    $g.DrawLines($pen, @($p1,$p2,$p3))

    $pen.Dispose(); $lg.Dispose(); $path.Dispose(); $g.Dispose()
    return ,$b
}

# Build ICO embedding PNG data per size (Vista+ supports PNG-compressed entries)
$pngs = @()
foreach ($s in $sizes) {
    $bmp = Render-Gradient $s
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngs += ,@{ Size=$s; Bytes=$ms.ToArray() }
    $ms.Dispose(); $bmp.Dispose()
}

$fs = New-Object System.IO.FileStream($icoPath, [System.IO.FileMode]::Create)
$bw = New-Object System.IO.BinaryWriter($fs)
# ICONDIR
$bw.Write([UInt16]0)            # reserved
$bw.Write([UInt16]1)            # type = icon
$bw.Write([UInt16]$pngs.Count)  # count

$offset = 6 + (16 * $pngs.Count)
foreach ($p in $pngs) {
    $w = $p.Size; if ($w -ge 256) { $w = 0 }
    $bw.Write([Byte]$w)                 # width
    $bw.Write([Byte]$w)                 # height
    $bw.Write([Byte]0)                  # color count
    $bw.Write([Byte]0)                  # reserved
    $bw.Write([UInt16]1)                # planes
    $bw.Write([UInt16]32)               # bit count
    $bw.Write([UInt32]$p.Bytes.Length)  # bytes in res
    $bw.Write([UInt32]$offset)          # offset
    $offset += $p.Bytes.Length
}
foreach ($p in $pngs) { $bw.Write($p.Bytes) }
$bw.Flush(); $bw.Close(); $fs.Close()

Write-Host "Wrote $icoPath ($([Math]::Round((Get-Item $icoPath).Length/1KB,1)) KB, $($pngs.Count) sizes)"
