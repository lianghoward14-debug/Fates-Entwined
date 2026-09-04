$ErrorActionPreference = 'Stop'
$root = (Resolve-Path '.').Path
$output = Join-Path $root 'free-world-semantic-recut'
$clips = Join-Path $output 'clips'
New-Item -ItemType Directory -Force -Path $clips | Out-Null
$ffmpeg = Get-ChildItem -LiteralPath (Join-Path $root '.tools') -Recurse -Filter ffmpeg.exe | Select-Object -First 1 -ExpandProperty FullName
$sourceDirectory = Join-Path $root 'voice-line-batches\set-3\clips'

$cuts = @{
  482 = @(@(0.00,2.08,'Έτοιμος διοικητά'),@(2.50,3.52,'Διατάξτε'),@(3.96,4.98,'Διατάξτε'),@(6.20,7.22,'Παράγγελμα'),@(7.80,8.82,'Παράγγελμα'),@(8.88,10.12,'Έτοιμος προς αποχώρηση'),@(10.58,11.98,'Έτοιμος προς αποχώρηση'),@(12.08,13.34,'Έτοιμος προς αποχώρηση'))
  483 = @(@(0.00,0.78,'Ακούω'),@(0.78,1.40,'Ακούστε'),@(1.40,2.02,'Ακούω'),@(2.02,2.59,'Ακούστε'),@(2.59,3.13,'Ακούω'),@(3.13,3.43,'Ακούστε'),@(3.35,4.12,'Καλυφθείτε'),@(4.04,4.96,'Καλυφθείτε'),@(4.88,5.80,'Καλυφθείτε'),@(5.72,6.68,'Δέχομαι πυρά'),@(6.60,7.72,'Δέχομαι πυρά'))
  484 = @(@(0.00,0.95,'Δέχομαι πυρά'),@(1.00,1.91,'Μην σταματάτε'),@(1.96,2.94,'Μην σταματάτε'))
  493 = @(@(0.00,0.76,'Command'),@(0.84,1.91,'Command'),@(1.93,3.30,'Κρατήσατε αποστάσεις'))
  498 = @(@(0.00,1.71,'Command'),@(1.70,2.96,'Τους απωθούμε διοικητά'),@(2.98,4.09,'Τους απωθούμε διοικητά'),@(4.08,5.54,'Τους απωθούμε διοικητά'))
  501 = @(@(0.00,1.62,'Δώστε τους να καταλάβουν'),@(1.72,2.28,'Εμπρός'),@(2.45,2.94,'Εμπρός'))
  512 = @(@(0.00,0.84,'Προχωρείτε'),@(0.90,1.82,'Συνεχίσατε'),@(1.84,2.98,'Συνεχίσατε'),@(2.98,4.14,'Συνεχίσατε'),@(4.16,5.02,'Υποχώρηση'),@(5.04,6.08,'Υποχώρηση'))
}

$manifest = @()
foreach ($globalId in 482..512) {
  $localId = $globalId - 473
  $source = Join-Path $sourceDirectory ('voice-line-{0:D3}.mp3' -f $localId)
  if (-not $cuts.ContainsKey($globalId)) {
    $manifest += [pscustomobject]@{ id = "$globalId"; file = "../voice-line-batches/set-3/clips/voice-line-$('{0:D3}' -f $localId).mp3"; label = 'Original — unchanged'; kind = 'original' }
    continue
  }
  $part = 0
  foreach ($cut in $cuts[$globalId]) {
    $part++
    $start = [double]$cut[0]; $end = [double]$cut[1]; $duration = $end - $start
    $name = ('clip-{0}-part-{1:D2}.mp3' -f $globalId,$part)
    & $ffmpeg -hide_banner -loglevel error -y -ss $start -i $source -t $duration -af 'afade=t=in:st=0:d=0.006,areverse,afade=t=in:st=0:d=0.010,areverse' -codec:a libmp3lame -q:a 2 (Join-Path $clips $name)
    if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed on $name" }
    $manifest += [pscustomobject]@{ id = "$globalId.$part"; file = "clips/$name"; label = [string]$cut[2]; kind = 'recut'; duration = [math]::Round($duration,2) }
  }
}
$manifest | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $output 'manifest.json') -Encoding utf8
