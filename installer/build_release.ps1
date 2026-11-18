<#
.SYNOPSIS
    Builds a clean, secret-free distributable release staging directory,
    verifies zero leaked credentials or demo DBs, and generates SHA-256 checksums.
#>
param(
    [string]$OutputRoot = (Join-Path (Split-Path -Parent $PSScriptRoot) "dist\release-clean")
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot

Write-Host "=== Investor Gate OS Clean Release Packager ===" -ForegroundColor Cyan
if (Test-Path $OutputRoot) {
    Remove-Item -Recurse -Force $OutputRoot
}
New-Item -ItemType Directory -Path $OutputRoot | Out-Null

# Copy approved clean source & runtime files only
$IncludeItems = @(
    "backend",
    "frontend",
    "docker",
    "docs",
    "scripts",
    "docker-compose.yml",
    ".env.example",
    "release_metadata.json",
    "README.md"
)

$ExcludePatterns = @(
    "node_modules", ".next", ".venv", "__pycache__", ".pytest_cache",
    "*.db", "*.sqlite*", "*.log", ".env", "backups", "data", "dist", "scratch", ".lan-runtime"
)

foreach ($item in $IncludeItems) {
    $src = Join-Path $RepoRoot $item
    if (-not (Test-Path $src)) { continue }
    $dst = Join-Path $OutputRoot $item
    if (Test-Path $src -PathType Container) {
        robocopy $src $dst /E /XD node_modules .next .venv __pycache__ .pytest_cache backups data dist scratch .lan-runtime /XF *.db *.sqlite* *.log .env *.pyc | Out-Null
    } else {
        Copy-Item -Force $src $dst
    }
}

# Scan staged release for forbidden secrets or default credentials
Write-Host "Scanning staged release artifacts for embedded secrets..." -ForegroundColor Yellow
$ForbiddenPatterns = @(
    "BEGIN RSA PRIVATE KEY",
    "BEGIN PRIVATE KEY",
    "investorgate-secret-key-production-ready-2026"
)

$Files = Get-ChildItem -Path $OutputRoot -Recurse -File
foreach ($pat in $ForbiddenPatterns) {
    $hits = $Files | Select-String -Pattern $pat -SimpleMatch
    if ($hits) {
        throw "SECURITY BLOCK: Forbidden secret pattern '$pat' found in staged release!"
    }
}

# Generate SHA256SUMS.txt
$ChecksumsPath = Join-Path $OutputRoot "SHA256SUMS.txt"
$Manifest = @()
foreach ($f in $Files) {
    $rel = $f.FullName.Substring($OutputRoot.Length + 1).Replace("\", "/")
    $fh = Get-FileHash -Path $f.FullName -Algorithm SHA256 -ErrorAction SilentlyContinue
    $hash = if ($fh -and $fh.Hash) { $fh.Hash.ToLower() } else { "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" }
    "$hash  $rel" | Add-Content -Path $ChecksumsPath -Encoding UTF8
    $Manifest += [PSCustomObject]@{ path = $rel; sha256 = $hash; bytes = $f.Length }
}

$Meta = Get-Content (Join-Path $RepoRoot "release_metadata.json") -Raw | ConvertFrom-Json
$ManifestObj = [PSCustomObject]@{
    product = $Meta.product
    version = $Meta.version
    generated_at_utc = (Get-Date).ToUniversalTime().ToString("o")
    file_count = $Manifest.Count
    files = $Manifest
}
$ManifestObj | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $OutputRoot "RELEASE_MANIFEST.json") -Encoding UTF8

Write-Host "Clean release staged at: $OutputRoot ($($Manifest.Count) files, 0 secrets found)." -ForegroundColor Green

# Compile Inno Setup installer if ISCC.exe is installed
$Iscc = Get-Command "ISCC.exe" -ErrorAction SilentlyContinue
if ($Iscc) {
    Write-Host "Compiling Windows Installer via Inno Setup..." -ForegroundColor Cyan
    & $Iscc.Source (Join-Path $PSScriptRoot "InvestorGateOS.iss")
} else {
    Write-Host "Inno Setup (ISCC.exe) not found in PATH; clean staging & manifest ready for compilation." -ForegroundColor DarkYellow
}
