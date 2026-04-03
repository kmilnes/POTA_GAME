$ErrorActionPreference = "Stop"

$target = @("Multnomah", "Washington", "Clackamas")
$allUs = Invoke-RestMethod -Uri "https://api.pota.app/program/parks/US"
$orParks = $allUs | Where-Object { $_.locationDesc -match "US-OR" -and $_.reference -like "US-*" }

$results = New-Object System.Collections.Generic.List[object]
$seen = @{}

foreach ($p in $orParks) {
  if ($seen.ContainsKey($p.reference)) { continue }
  $seen[$p.reference] = $true

  if ($null -eq $p.longitude -or $null -eq $p.latitude) { continue }

  $url = "https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=$($p.longitude)&y=$($p.latitude)&benchmark=Public_AR_Current&vintage=Current_Current&format=json"

  try {
    $geo = Invoke-RestMethod -Uri $url
    $countyObj = $geo.result.geographies.Counties | Select-Object -First 1
    if ($null -eq $countyObj) { continue }

    $countyName = ($countyObj.NAME -replace " County$", "").Trim()

    if ($target -contains $countyName) {
      $results.Add([pscustomobject]@{
        id = $p.reference
        name = $p.name
        county = $countyName
        state = "OR"
      }) | Out-Null
    }
  }
  catch {
    continue
  }

  Start-Sleep -Milliseconds 40
}

$final = $results | Sort-Object county, name, id
$json = $final | ConvertTo-Json -Depth 5
$outputPath = Join-Path (Get-Location) "data/parks.json"
[System.IO.File]::WriteAllText($outputPath, $json, (New-Object System.Text.UTF8Encoding($false)))

Write-Output ("WRITTEN=" + $final.Count)
$final | Group-Object county | Select-Object Name, Count | Sort-Object Name | Format-Table -AutoSize
$final | Select-Object -First 15 | ConvertTo-Json -Depth 5
