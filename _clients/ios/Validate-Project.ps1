$ErrorActionPreference = 'Stop'
$project = Join-Path $PSScriptRoot 'KimiBlog.xcodeproj/project.pbxproj'
$source = Get-Content -Raw -LiteralPath $project
foreach ($file in Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'KimiBlog') -Filter '*.swift') {
    if (-not $source.Contains("$($file.Name) in Sources")) { throw "Missing source build entry: $($file.Name)" }
}
foreach ($file in Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'KimiBlogTests') -Filter '*.swift') {
    if (-not $source.Contains("$($file.Name) in Sources")) { throw "Missing test source build entry: $($file.Name)" }
}
$null = [xml](Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'KimiBlog/Info.plist'))
$null = [xml](Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'KimiBlog.xcodeproj/xcshareddata/xcschemes/KimiBlog.xcscheme'))
foreach ($catalog in Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'KimiBlog/Assets.xcassets') -Recurse -Filter 'Contents.json') {
    $data = Get-Content -Raw -LiteralPath $catalog.FullName | ConvertFrom-Json
    foreach ($image in $data.images) {
        if ($image.filename -and -not (Test-Path -LiteralPath (Join-Path $catalog.DirectoryName $image.filename))) { throw "Missing image: $($image.filename)" }
    }
}
$snapshotPath = Join-Path $PSScriptRoot 'KimiBlog/snapshot.json'
$snapshot = [IO.File]::ReadAllText($snapshotPath, [Text.UTF8Encoding]::new($false)) | ConvertFrom-Json
if ($snapshot.articles.Count -lt 8 -or @($snapshot.articles | Where-Object { -not $_.contentHtml }).Count -gt 0) { throw 'Incomplete offline snapshot' }
if (-not $source.Contains('ENABLE_TESTABILITY = YES;')) { throw 'Debug testability missing' }
python -m unittest discover -s (Join-Path $PSScriptRoot 'ci') -p 'test_*.py'
Write-Output 'PASS: source entries, XML, image catalogs, bundled articles and test configuration. This is not an Xcode build.'
