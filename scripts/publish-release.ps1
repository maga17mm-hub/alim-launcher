$ErrorActionPreference = 'Stop'
$version = (Get-Content -LiteralPath package.json -Raw | ConvertFrom-Json).version
$tag = "v$version"
$installer = "dist/Alim-Launcher-Setup-$version.exe"
$blockmap = "$installer.blockmap"
foreach ($file in @($installer, $blockmap, 'dist/latest.yml')) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing release file: $file" }
}
gh release view $tag --json tagName | Out-Null
if ($LASTEXITCODE -ne 0) {
    gh release create $tag --verify-tag --title "Alim Launcher $version" --notes-file CHANGELOG.md
    if ($LASTEXITCODE -ne 0) { throw 'Could not create GitHub release' }
}
gh release edit $tag --title "Alim Launcher $version" --notes-file CHANGELOG.md
if ($LASTEXITCODE -ne 0) { throw 'Could not update release notes' }
# Upload matching binary + blockmap first. Only then expose latest.yml.
gh release upload $tag $installer $blockmap --clobber
if ($LASTEXITCODE -ne 0) { throw 'Failed to upload installer/blockmap' }
gh release upload $tag dist/latest.yml --clobber
if ($LASTEXITCODE -ne 0) { throw 'Failed to upload update metadata' }
node scripts/verify-release.cjs $tag
if ($LASTEXITCODE -ne 0) { throw 'Public release verification failed' }
