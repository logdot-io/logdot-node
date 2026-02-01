[CmdletBinding()]
param(
    [switch]$Bump
)

$ErrorActionPreference = "Stop"
Push-Location $PSScriptRoot

try {
    if ($Bump) {
        Write-Host "Bumping patch version..."
        npm version patch --no-git-tag-version
        if ($LASTEXITCODE -ne 0) { throw "npm version failed" }
    }

    $pkg = Get-Content "package.json" | ConvertFrom-Json
    $version = $pkg.version
    Write-Host "Publishing @logdot-io/sdk v${version}..."

    Write-Host "Building..."
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Build failed" }

    Write-Host "Publishing to npm..."
    npm publish --access public
    if ($LASTEXITCODE -ne 0) { throw "Publish failed" }

    Write-Host "Successfully published @logdot-io/sdk v${version}"
}
finally {
    Pop-Location
}
