param(
  [string]$AuthorityUrl = "wss://fates-entwined-main.fly.dev"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Electron = Join-Path $Root "node_modules\.bin\electron.cmd"
if(-not (Test-Path -LiteralPath $Electron)) {
  throw "Electron launcher not found at $Electron. Run npm.cmd install first."
}

$RunId = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

function Start-SoloElectronClient {
  param(
    [string]$Role,
    [int]$X,
    [int]$Y
  )
  $session = "solo-$Role-$RunId"
  $args = @(
    ".",
    "--session=$session",
    "--soloClient=$Role",
    "--authority=$AuthorityUrl",
    "--windowed",
    "--width=960",
    "--height=1000",
    "--x=$X",
    "--y=$Y"
  )
  Start-Process -FilePath $Electron -ArgumentList $args -WorkingDirectory $Root
}

Write-Host "Opening real Electron solo multiplayer clients..."
Write-Host "Run:      $RunId"
Write-Host "Host:     session solo-host-$RunId"
Write-Host "Guest:    session solo-guest-$RunId"
Write-Host "Authority $AuthorityUrl"
Write-Host ""
Write-Host "Use two different Google accounts. The same account in both windows is not a valid two-player test."

Start-SoloElectronClient -Role "host" -X 0 -Y 0
Start-Sleep -Milliseconds 900
Start-SoloElectronClient -Role "guest" -X 980 -Y 0

Write-Host ""
Write-Host "Opened Electron host and guest clients."
