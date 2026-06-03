param(
  [int]$Port = 0,
  [string]$AuthorityUrl = "wss://fates-entwined-main.fly.dev",
  [switch]$NoBrowser,
  [switch]$ReuseProfiles
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$ProfileRoot = Join-Path $Root ".solo-multiplayer-profiles"
$RunId = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$SessionRoot = if($ReuseProfiles) { Join-Path $ProfileRoot "persistent" } else { Join-Path $ProfileRoot "run-$RunId" }
$HostProfile = Join-Path $SessionRoot "host"
$GuestProfile = Join-Path $SessionRoot "guest"

function Test-LocalPort {
  param([int]$Port)
  try {
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  } catch {
    return $false
  }
}

function Wait-LocalPort {
  param([int]$Port)
  for($i = 0; $i -lt 20; $i++) {
    if(Test-LocalPort -Port $Port) { return $true }
    Start-Sleep -Milliseconds 250
  }
  return $false
}

function Find-FreePort {
  for($port = 8126; $port -lt 8199; $port++) {
    if(-not (Test-LocalPort -Port $port)) { return $port }
  }
  throw "Could not find a free local port for solo multiplayer testing."
}

function Find-Browser {
  $candidates = @(
    (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:LocalAppData "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe")
  )
  foreach($candidate in $candidates) {
    if($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
  }
  return $null
}

function Quote-Arg {
  param([string]$Arg)
  if($Arg -match '\s') { return '"' + ($Arg -replace '"', '\"') + '"' }
  return $Arg
}

New-Item -ItemType Directory -Force -Path $ProfileRoot, $SessionRoot, $HostProfile, $GuestProfile | Out-Null

if($Port -le 0) {
  $Port = Find-FreePort
}

if(-not (Test-LocalPort -Port $Port)) {
  $Node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if(-not $Node) { throw "Node.js was not found on PATH." }
  $ServerArgs = @((Join-Path $PSScriptRoot "solo-static-server.js"), "--port", "$Port") | ForEach-Object { Quote-Arg $_ }
  Start-Process -WindowStyle Hidden -FilePath $Node -ArgumentList $ServerArgs -WorkingDirectory $Root
  if(-not (Wait-LocalPort -Port $Port)) { throw "Local solo multiplayer server did not start on port $Port." }
}

$encodedAuthority = [Uri]::EscapeDataString($AuthorityUrl)
$cacheBust = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$HostUrl = "http://127.0.0.1:$Port/tools/solo-multiplayer-client.html?player=host&authority=$encodedAuthority&fresh=$cacheBust"
$GuestUrl = "http://127.0.0.1:$Port/tools/solo-multiplayer-client.html?player=guest&authority=$encodedAuthority&fresh=$cacheBust"

Write-Host "Host client:  $HostUrl"
Write-Host "Guest client: $GuestUrl"
Write-Host "Profiles:     $SessionRoot"
Write-Host ""
Write-Host "Use two different Google accounts. The same account in both windows is not a valid two-player test."

if($NoBrowser) { exit 0 }

$Browser = Find-Browser
if(-not $Browser) {
  Write-Host ""
  Write-Host "Could not find Chrome or Edge automatically. Open the two URLs above in two separate browser profiles."
  exit 1
}

$HostArgs = @(
  "--user-data-dir=$HostProfile",
  "--new-window",
  "--disable-application-cache",
  "--disk-cache-size=1",
  "--media-cache-size=1",
  "--window-size=960,1000",
  "--window-position=0,0",
  $HostUrl
) | ForEach-Object { Quote-Arg $_ }

$GuestArgs = @(
  "--user-data-dir=$GuestProfile",
  "--new-window",
  "--disable-application-cache",
  "--disk-cache-size=1",
  "--media-cache-size=1",
  "--window-size=960,1000",
  "--window-position=980,0",
  $GuestUrl
) | ForEach-Object { Quote-Arg $_ }

Start-Process -FilePath $Browser -ArgumentList $HostArgs
Start-Sleep -Milliseconds 450
Start-Process -FilePath $Browser -ArgumentList $GuestArgs

Write-Host ""
Write-Host "Opened two isolated multiplayer clients."
