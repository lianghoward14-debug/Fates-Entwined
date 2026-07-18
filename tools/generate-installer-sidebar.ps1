Add-Type -AssemblyName System.Drawing

$workspace = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $workspace 'ingamebackgrouds\igb8.png'
$installerPath = Join-Path $workspace 'build\installerSidebar.bmp'
$uninstallerPath = Join-Path $workspace 'build\uninstallerSidebar.bmp'

$source = [System.Drawing.Image]::FromFile($sourcePath)
$bitmap = New-Object System.Drawing.Bitmap 164, 314, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$cropWidth = [int][Math]::Round($source.Height * 164 / 314)
$cropX = [int][Math]::Round(($source.Width - $cropWidth) / 2)
$sourceRect = New-Object System.Drawing.Rectangle $cropX, 0, $cropWidth, $source.Height
$targetRect = New-Object System.Drawing.Rectangle 0, 0, 164, 314
$graphics.DrawImage($source, $targetRect, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)

# Keep the art readable throughout, then add a focused title shadow at the bottom.
$veil = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(48, 0, 0, 0))
$graphics.FillRectangle($veil, $targetRect)

$titleShadowBaseY = 225
for ($i = 0; $i -lt 70; $i++) {
  $distance = [Math]::Abs($i - 38) / 38
  $alpha = [int](28 + (96 * (1 - [Math]::Min(1, $distance))))
  $shadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($alpha, 0, 0, 0))
  $graphics.FillRectangle($shadowBrush, 0, ($titleShadowBaseY + $i), 164, 1)
  $shadowBrush.Dispose()
}

$titleFont = New-Object System.Drawing.Font 'Georgia', 28, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$subtitleFont = New-Object System.Drawing.Font 'Georgia', 14, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$titleBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 247, 213, 104))
$subtitleBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 240, 184))
$textShadow = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(176, 0, 0, 0))
$center = New-Object System.Drawing.StringFormat
$center.Alignment = [System.Drawing.StringAlignment]::Center

$graphics.DrawString('FATES', $titleFont, $textShadow, (New-Object System.Drawing.RectangleF 1, 239, 164, 34), $center)
$graphics.DrawString('ENTWINED', $subtitleFont, $textShadow, (New-Object System.Drawing.RectangleF 1, 270, 164, 21), $center)
$graphics.DrawString('FATES', $titleFont, $titleBrush, (New-Object System.Drawing.RectangleF 0, 238, 164, 34), $center)
$graphics.DrawString('ENTWINED', $subtitleFont, $subtitleBrush, (New-Object System.Drawing.RectangleF 0, 269, 164, 21), $center)

$bitmap.Save($installerPath, [System.Drawing.Imaging.ImageFormat]::Bmp)
$bitmap.Save($uninstallerPath, [System.Drawing.Imaging.ImageFormat]::Bmp)

$center.Dispose()
$textShadow.Dispose()
$subtitleBrush.Dispose()
$titleBrush.Dispose()
$subtitleFont.Dispose()
$titleFont.Dispose()
$veil.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
$source.Dispose()
