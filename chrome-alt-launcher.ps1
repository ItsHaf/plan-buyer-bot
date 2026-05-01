# Chrome Enterprise Policy Checker and Alternative Launcher
# This script checks for policy restrictions and tries alternative approaches

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Chrome Policy & Alternative Launcher" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Configurable paths (override via environment variables)
$ChromePath = if ($env:CHROME_PATH) { $env:CHROME_PATH } else { "C:\Program Files\Google\Chrome\Application\chrome.exe" }
$ProfileDir = if ($env:CHROME_BOT_PROFILE) { $env:CHROME_BOT_PROFILE } else { "$env:TEMP\chrome-bot-profile" }
$DebugPort = if ($env:CHROME_DEBUG_PORT) { $env:CHROME_DEBUG_PORT } else { "9222" }
$TargetSite = if ($env:TARGET_SITE) { $env:TARGET_SITE } else { "the target website" }

# Check for Chrome enterprise policies
Write-Host "Step 1: Checking for enterprise policies..." -ForegroundColor Yellow

$policyPaths = @(
    "HKLM:\SOFTWARE\Policies\Google\Chrome",
    "HKLM:\SOFTWARE\WOW6432Node\Policies\Google\Chrome",
    "HKCU:\SOFTWARE\Policies\Google\Chrome"
)

$hasPolicies = $false
foreach ($path in $policyPaths) {
    if (Test-Path $path) {
        $hasPolicies = $true
        Write-Host "Found policy registry key: $path" -ForegroundColor Yellow
        try {
            $policies = Get-ItemProperty -Path $path -ErrorAction SilentlyContinue
            $policies.PSObject.Properties | Where-Object { $_.Name -notlike "PS*" } | ForEach-Object {
                Write-Host "   $($_.Name) = $($_.Value)" -ForegroundColor Gray
            }
        } catch {
            Write-Host "   (Could not read policies)" -ForegroundColor Gray
        }
    }
}

if (-not $hasPolicies) {
    Write-Host "No enterprise policies found" -ForegroundColor Green
}
Write-Host ""

# Check if running as admin
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Host "Step 2: Administrator status..." -ForegroundColor Yellow
if ($isAdmin) {
    Write-Host "Running as Administrator" -ForegroundColor Green
} else {
    Write-Host "NOT running as Administrator (some operations may fail)" -ForegroundColor Yellow
}
Write-Host ""

# Alternative 1: Try with a completely fresh profile
Write-Host "Step 3: Trying Chrome with fresh profile..." -ForegroundColor Yellow
Write-Host "   Creating temporary profile directory..." -ForegroundColor Gray

if (Test-Path $ProfileDir) {
    Remove-Item -Path $ProfileDir -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Path $ProfileDir -Force | Out-Null

Write-Host "   Launching Chrome with fresh profile..." -ForegroundColor Gray
Write-Host "   Profile: $ProfileDir" -ForegroundColor Gray

$proc = Start-Process -FilePath $ChromePath -ArgumentList "--remote-debugging-port=$DebugPort", "--user-data-dir=`"$ProfileDir`"", "--no-first-run", "--no-default-browser-check" -PassThru -WindowStyle Normal

Write-Host "   Waiting 5 seconds..." -ForegroundColor Gray
Start-Sleep -Seconds 5

# Check if listening
$listener = Get-NetTCPConnection -LocalPort $DebugPort -ErrorAction SilentlyContinue | Where-Object { $_.LocalAddress -eq "127.0.0.1" }
if ($listener) {
    Write-Host "SUCCESS! Chrome is listening with fresh profile!" -ForegroundColor Green
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "Chrome is ready! BUT..." -ForegroundColor Yellow
    Write-Host "You're using a FRESH profile (not logged in)" -ForegroundColor Yellow
    Write-Host "You need to manually log in to $TargetSite" -ForegroundColor Cyan
    Write-Host "Then run: npm start" -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Chrome PID: $($proc.Id)" -ForegroundColor Gray
    Write-Host "Profile: $ProfileDir" -ForegroundColor Gray
    exit 0
} else {
    Write-Host "Fresh profile approach also failed" -ForegroundColor Red
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}
Write-Host ""

# Alternative 2: Try Microsoft Edge
Write-Host "Step 4: Trying Microsoft Edge..." -ForegroundColor Yellow

$edgePaths = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "${env:LOCALAPPDATA}\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
)

$edgePath = $null
foreach ($path in $edgePaths) {
    if (Test-Path $path) {
        $edgePath = $path
        break
    }
}

if ($edgePath) {
    Write-Host "Edge found at: $edgePath" -ForegroundColor Green
    Write-Host "   Launching Edge with remote debugging..." -ForegroundColor Gray
    
    Stop-Process -Name "msedge" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    
    $edgeProfile = "$env:TEMP\edge-bot-profile"
    if (Test-Path $edgeProfile) {
        Remove-Item -Path $edgeProfile -Recurse -Force -ErrorAction SilentlyContinue
    }
    New-Item -ItemType Directory -Path $edgeProfile -Force | Out-Null
    
    $edgeProc = Start-Process -FilePath $edgePath -ArgumentList "--remote-debugging-port=$DebugPort", "--user-data-dir=`"$edgeProfile`"", "--no-first-run" -PassThru -WindowStyle Normal
    
    Write-Host "   Waiting 5 seconds..." -ForegroundColor Gray
    Start-Sleep -Seconds 5
    
    $edgeListener = Get-NetTCPConnection -LocalPort $DebugPort -ErrorAction SilentlyContinue | Where-Object { $_.LocalAddress -eq "127.0.0.1" }
    if ($edgeListener) {
        Write-Host "SUCCESS! Edge is listening on port $DebugPort!" -ForegroundColor Green
        Write-Host ""
        Write-Host "==========================================" -ForegroundColor Green
        Write-Host "Microsoft Edge is ready!" -ForegroundColor Green
        Write-Host "You need to manually log in to $TargetSite" -ForegroundColor Cyan
        Write-Host "Then run: npm start" -ForegroundColor Cyan
        Write-Host "==========================================" -ForegroundColor Green
        exit 0
    } else {
        Write-Host "Edge also failed to listen on port $DebugPort" -ForegroundColor Red
        Stop-Process -Id $edgeProc.Id -Force -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "Microsoft Edge not found" -ForegroundColor Red
}
Write-Host ""

# Alternative 3: Check firewall
Write-Host "Step 5: Checking Windows Firewall..." -ForegroundColor Yellow
try {
    $firewallRule = Get-NetFirewallRule -DisplayName "*Chrome*" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($firewallRule) {
        Write-Host "Found Chrome firewall rules" -ForegroundColor Gray
        Get-NetFirewallRule -DisplayName "*Chrome*" | ForEach-Object {
            Write-Host "   $($_.DisplayName): $($_.Enabled)" -ForegroundColor Gray
        }
    } else {
        Write-Host "No specific Chrome firewall rules found (this is normal)" -ForegroundColor Gray
    }
} catch {
    Write-Host "   (Could not check firewall)" -ForegroundColor Gray
}
Write-Host ""

# Alternative 4: Try different ports
Write-Host "Step 6: Trying different ports..." -ForegroundColor Yellow
$ports = @(9224, 9225, 9226, 9333)
foreach ($port in $ports) {
    Write-Host "   Trying port $port..." -ForegroundColor Gray
    
    Stop-Process -Name "chrome" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    
    $testProfile = "$env:TEMP\chrome-test-$port"
    if (Test-Path $testProfile) {
        Remove-Item -Path $testProfile -Recurse -Force -ErrorAction SilentlyContinue
    }
    New-Item -ItemType Directory -Path $testProfile -Force | Out-Null
    
    $testProc = Start-Process -FilePath $ChromePath -ArgumentList "--remote-debugging-port=$port", "--user-data-dir=`"$testProfile`"" -PassThru -WindowStyle Normal
    Start-Sleep -Seconds 3
    
    $testListener = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.LocalAddress -eq "127.0.0.1" }
    if ($testListener) {
        Write-Host "SUCCESS! Chrome listening on port $port!" -ForegroundColor Green
        Write-Host ""
        Write-Host "==========================================" -ForegroundColor Green
        Write-Host "Chrome is ready on port $port!" -ForegroundColor Green
        Write-Host "You need to:" -ForegroundColor Yellow
        Write-Host "1. Keep this Chrome window open" -ForegroundColor Cyan
        Write-Host "2. Log in to $TargetSite" -ForegroundColor Cyan
        Write-Host "3. Run the bot with:" -ForegroundColor Cyan
        Write-Host "   npm start -- --port=$port" -ForegroundColor Cyan
        Write-Host "==========================================" -ForegroundColor Green
        exit 0
    }
    
    Stop-Process -Id $testProc.Id -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Red
Write-Host "ALL APPROACHES FAILED" -ForegroundColor Red
Write-Host "==========================================" -ForegroundColor Red
Write-Host ""
Write-Host "This is likely due to:" -ForegroundColor Yellow
Write-Host "1. Corporate/enterprise policies blocking remote debugging" -ForegroundColor Yellow
Write-Host "2. Antivirus software blocking the port" -ForegroundColor Yellow
Write-Host "3. Chrome installed with admin restrictions" -ForegroundColor Yellow
Write-Host ""
Write-Host "POSSIBLE SOLUTIONS:" -ForegroundColor Cyan
Write-Host ""
Write-Host "Option A: Use Playwright's built-in browser (no Chrome needed)" -ForegroundColor Green
Write-Host "   - Bot launches its own browser" -ForegroundColor Gray
Write-Host "   - You manually log in once" -ForegroundColor Gray
Write-Host "   - Works immediately" -ForegroundColor Gray
Write-Host ""
Write-Host "Option B: Check with your IT department" -ForegroundColor Green
Write-Host "   - Ask if remote debugging is blocked" -ForegroundColor Gray
Write-Host "   - Request exception for port 9222" -ForegroundColor Gray
Write-Host ""
Write-Host "Option C: Try on a different computer" -ForegroundColor Green
Write-Host "   - Personal laptop without enterprise policies" -ForegroundColor Gray
Write-Host ""
Write-Host "Would you like to set up Option A (Playwright native browser)? (Y/n):" -ForegroundColor Cyan -NoNewline
$choice = Read-Host

if ($choice -ne 'n' -and $choice -ne 'N') {
    Write-Host ""
    Write-Host "Setting up Playwright native browser mode..." -ForegroundColor Green
    Write-Host "The bot will use its own Chromium instance instead of connecting to your Chrome." -ForegroundColor Gray
    Write-Host "You'll need to log in to $TargetSite when the browser opens." -ForegroundColor Gray
    Write-Host ""
    Write-Host "To use this mode, run the bot with:" -ForegroundColor Cyan
    Write-Host "   npm start -- --use-native-browser" -ForegroundColor White
}

exit 1
