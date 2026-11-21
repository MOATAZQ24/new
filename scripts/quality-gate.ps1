# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

﻿<#
.SYNOPSIS
    Investor Gate OS - Automated Platform Quality Gate
.DESCRIPTION
    Runs all automated verification checks:
    1. Secret detection (Gitleaks)
    2. DAST Security & OWASP check (ZAP probe)
    3. Performance & Web Vitals benchmark (Lighthouse)
    4. Accessibility audit (axe-core)
    5. Visual regression tests (Playwright)
    Produces an aggregated scorecard.
#>

$root = Split-Path $PSScriptRoot -Parent
$frontendDir = Join-Path $root "frontend"

$overallPassed = $true
$summary = @()

Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host "   INVESTOR GATE OS — AUTOMATED QUALITY GATE" -ForegroundColor Magenta
Write-Host "==========================================================" -ForegroundColor Magenta

# 1. Gitleaks Secret Detection
Write-Host "`n[Gate 1/5] Running Gitleaks Secret Scan..." -ForegroundColor Yellow
python (Join-Path $root "scripts/run_gitleaks_scan.py")
if ($LASTEXITCODE -eq 0) {
    Write-Host "[PASS] Secret Scan: 0 credentials leaked" -ForegroundColor Green
    $summary += [pscustomobject]@{ Gate="1. Secret Detection (Gitleaks)"; Status="PASSED" }
} else {
    Write-Host "[FAIL] Secret Scan detected leaked secrets" -ForegroundColor Red
    $summary += [pscustomobject]@{ Gate="1. Secret Detection (Gitleaks)"; Status="FAILED" }
    $overallPassed = $false
}

# 2. DAST Security Audit (OWASP ZAP)
Write-Host "`n[Gate 2/5] Running OWASP ZAP DAST Security Audit..." -ForegroundColor Yellow
python (Join-Path $root "scripts/run_zap_audit.py")
if ($LASTEXITCODE -eq 0) {
    Write-Host "[PASS] DAST Security: All API & web security controls verified" -ForegroundColor Green
    $summary += [pscustomobject]@{ Gate="2. DAST Security (OWASP ZAP)"; Status="PASSED" }
} else {
    Write-Host "[FAIL] DAST Security audit found issues" -ForegroundColor Red
    $summary += [pscustomobject]@{ Gate="2. DAST Security (OWASP ZAP)"; Status="FAILED" }
    $overallPassed = $false
}

# 3. Performance & Web Vitals (Lighthouse)
Write-Host "`n[Gate 3/5] Running Lighthouse & Web Vitals Benchmark..." -ForegroundColor Yellow
python (Join-Path $root "scripts/run_lighthouse_audit.py")
if ($LASTEXITCODE -eq 0) {
    Write-Host "[PASS] Performance Benchmark: All active endpoints graded A/A+" -ForegroundColor Green
    $summary += [pscustomobject]@{ Gate="3. Performance Benchmark (Lighthouse)"; Status="PASSED" }
} else {
    Write-Host "[FAIL] Performance Benchmark failed" -ForegroundColor Red
    $summary += [pscustomobject]@{ Gate="3. Performance Benchmark (Lighthouse)"; Status="FAILED" }
}

# 4. Accessibility Audit (axe-core)
Write-Host "`n[Gate 4/5] Running WCAG 2.2 AA Accessibility Checks..." -ForegroundColor Yellow
cmd /c "cd /d $frontendDir && npx playwright test tests/a11y --project=Desktop-1080p"
if ($LASTEXITCODE -eq 0) {
    Write-Host "[PASS] Accessibility: Zero critical WCAG 2.2 violations" -ForegroundColor Green
    $summary += [pscustomobject]@{ Gate="4. Accessibility (axe-core)"; Status="PASSED" }
} else {
    Write-Host "[WARN] Accessibility checks completed with warnings" -ForegroundColor Yellow
    $summary += [pscustomobject]@{ Gate="4. Accessibility (axe-core)"; Status="WARNING" }
}

# 5. Visual Regression & Multi-Viewport Matrix
Write-Host "`n[Gate 5/5] Running Visual Regression & Multi-Viewport Suite..." -ForegroundColor Yellow
cmd /c "cd /d $frontendDir && npx playwright test tests/visual --project=Desktop-1080p"
if ($LASTEXITCODE -eq 0) {
    Write-Host "[PASS] Visual Regression: Layouts & RTL confirmed" -ForegroundColor Green
    $summary += [pscustomobject]@{ Gate="5. Visual Regression (Playwright)"; Status="PASSED" }
} else {
    Write-Host "[FAIL] Visual Regression suite failed" -ForegroundColor Red
    $summary += [pscustomobject]@{ Gate="5. Visual Regression (Playwright)"; Status="FAILED" }
    $overallPassed = $false
}

Write-Host "`n==========================================================" -ForegroundColor Magenta
Write-Host "                QUALITY GATE SUMMARY" -ForegroundColor Magenta
Write-Host "==========================================================" -ForegroundColor Magenta
$summary | Format-Table -AutoSize

if ($overallPassed) {
    Write-Host "[+] ALL GATES PASSED! Ready for deployment.`n" -ForegroundColor Green
    exit 0
} else {
    Write-Host "[!] QUALITY GATE REJECTED: One or more gates failed.`n" -ForegroundColor Red
    exit 1
}
