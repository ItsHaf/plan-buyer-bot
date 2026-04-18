#!/bin/bash

# Plan Buyer Bot - Cron Job Script
#
# This script is designed to be run via cron for automated drops.
# It includes error checking, logging, and recovery.
#
# INSTALLATION:
# 1. Copy this file to ~/plan-buyer-bot-cron.sh
# 2. Make it executable: chmod +x ~/plan-buyer-bot-cron.sh
# 3. Edit your crontab: crontab -e
# 4. Add the cron job line from the bottom of this file
#
# CRON JOB CONFIGURATION (copy one of these lines):
# =============================================================================
#
# Option A: Run on specific date (e.g., 16th of April at 3:55 AM)
# 55 3 16 4 * /path/to/plan-buyer-bot-cron.sh
#
# Option B: Run on multiple specific dates (16th of April, May, June)
# 55 3 16 4,5,6 * /path/to/plan-buyer-bot-cron.sh
#
# Option C: Run every day at 3:55 AM (for daily drops)
# 55 3 * * * /path/to/plan-buyer-bot-cron.sh
#
# Option D: Run every Monday at 3:55 AM
# 55 3 * * 1 /path/to/plan-buyer-bot-cron.sh
#
# =============================================================================

# ============================================================================
# CONFIGURATION - EDIT THESE VALUES
# ============================================================================

# Bot installation directory (REQUIRED - set to your actual path)
BOT_DIR="$HOME/plan-buyer-bot"

# Chrome user data directory (for persistent login)
CHROME_USER_DATA_DIR="$HOME/.config/google-chrome-bot"

# Chrome remote debugging port
CHROME_DEBUG_PORT="9222"

# Number of tabs to open
TAB_COUNT="20"

# Plan tier (lite, pro, max)
PLAN_TIER="max"

# ============================================================================
# ADVANCED CONFIGURATION (usually don't need to change)
# ============================================================================

# Log directory
LOG_DIR="$HOME/.local/share/plan-buyer-bot/logs"

# Maximum wait time for Chrome to start (seconds)
CHROME_START_TIMEOUT="30"

# Chrome check retry attempts
CHROME_CHECK_RETRIES="5"

# ============================================================================
# SCRIPT START - DO NOT EDIT BELOW THIS LINE
# ============================================================================

# Strict error handling
set -euo pipefail

# Generate timestamp for this run
TIMESTAMP=$(date '+%Y%m%d-%H%M%S')
DATE_HUMAN=$(date '+%Y-%m-%d %H:%M:%S')

# Log file for this run
LOG_FILE="$LOG_DIR/drop-$TIMESTAMP.log"

# Function to log messages
log() {
    local message="[$DATE_HUMAN] $1"
    echo "$message"
    echo "$message" >> "$LOG_FILE" 2>/dev/null || true
}

# Function to log errors
error() {
    log "ERROR: $1"
}

# Function to log success
success() {
    log "OK: $1"
}

# Function to log info
info() {
    log "INFO: $1"
}

# ============================================================================
# VALIDATION
# ============================================================================

# Create log directory
mkdir -p "$LOG_DIR"

# Start logging
log "=========================================="
log "Plan Buyer Bot - Automated Drop Session"
log "=========================================="
log "Timestamp: $DATE_HUMAN"
log "Bot Directory: $BOT_DIR"
log "Log File: $LOG_FILE"
log ""

# ============================================================================
# STEP 1: CHECK BOT DIRECTORY
# ============================================================================

log "Step 1: Verifying bot installation..."

if [ ! -d "$BOT_DIR" ]; then
    error "Bot directory not found: $BOT_DIR"
    error "Please clone the repository to this location"
    exit 1
fi

if [ ! -f "$BOT_DIR/package.json" ]; then
    error "package.json not found in $BOT_DIR"
    error "Bot installation appears incomplete"
    exit 1
fi

success "Bot directory verified"

# ============================================================================
# STEP 2: CHECK NODE.JS
# ============================================================================

log "Step 2: Checking Node.js installation..."

if ! command -v node &> /dev/null; then
    error "Node.js not found in PATH"
    error "Please install Node.js 18 or later"
    exit 1
fi

NODE_VERSION=$(node --version)
info "Node.js version: $NODE_VERSION"

# Check if version is 18+
if [[ ! "$NODE_VERSION" =~ ^v1[8-9] ]] && [[ ! "$NODE_VERSION" =~ ^v[2-9][0-9] ]]; then
    error "Node.js version $NODE_VERSION is too old"
    error "Please upgrade to Node.js 18 or later"
    exit 1
fi

success "Node.js check passed"

# ============================================================================
# STEP 3: CHECK NPM DEPENDENCIES
# ============================================================================

log "Step 3: Checking npm dependencies..."

cd "$BOT_DIR" || {
    error "Failed to navigate to $BOT_DIR"
    exit 1
}

if [ ! -d "node_modules" ]; then
    info "node_modules not found, running npm install..."
    npm install >> "$LOG_FILE" 2>&1 || {
        error "npm install failed"
        exit 1
    }
    success "Dependencies installed"
else
    success "Dependencies already installed"
fi

# ============================================================================
# STEP 4: VERIFY TYPESCRIPT COMPILATION
# ============================================================================

log "Step 4: Verifying TypeScript compilation..."

if ! npx tsc --noEmit >> "$LOG_FILE" 2>&1; then
    error "TypeScript compilation failed"
    error "Check the log file for details"
    exit 1
fi

success "TypeScript compilation passed"

# ============================================================================
# STEP 5: CHECK CHROME WITH RETRIES
# ============================================================================

log "Step 5: Checking Chrome remote debugging..."

CHROME_CHECK_URL="http://127.0.0.1:$CHROME_DEBUG_PORT/json/version"
CHROME_READY=false

for ((i=1; i<=CHROME_CHECK_RETRIES; i++)); do
    info "Chrome check attempt $i/$CHROME_CHECK_RETRIES..."
    
    if curl -s "$CHROME_CHECK_URL" > /dev/null 2>&1; then
        CHROME_READY=true
        break
    fi
    
    if [ $i -lt $CHROME_CHECK_RETRIES ]; then
        info "Chrome not ready, waiting 5 seconds..."
        sleep 5
    fi
done

if [ "$CHROME_READY" = false ]; then
    error "Chrome is not running on port $CHROME_DEBUG_PORT"
    error ""
    error "To start Chrome, run:"
    error "  google-chrome --remote-debugging-port=$CHROME_DEBUG_PORT"
    error ""
    error "Then log in to the target site and keep Chrome open"
    exit 1
fi

# Get Chrome version
CHROME_VERSION=$(curl -s "$CHROME_CHECK_URL" | grep -o '"Browser": "[^"]*"' | cut -d'"' -f4)
info "Chrome detected: $CHROME_VERSION"
success "Chrome is running and accessible"

# ============================================================================
# STEP 6: RUN THE BOT
# ============================================================================

log ""
log "=========================================="
log "STARTING PLAN BUYER BOT"
log "=========================================="
log "Configuration:"
log "  - Tabs: $TAB_COUNT"
log "  - Plan: $PLAN_TIER"
log ""

# Set the wave start time to current time (immediate start)
WAVE_START_TIME=$(date '+%H:%M:%S')
info "Wave start time: $WAVE_START_TIME (immediate)"

# Run the bot
log "Launching bot..."
log ""

EXIT_CODE=0
npm start -- \
  --tabs="$TAB_COUNT" \
  --plan="$PLAN_TIER" \
  --no-wait \
  --wave-start-time="$WAVE_START_TIME" \
  >> "$LOG_FILE" 2>&1 || EXIT_CODE=$?

# ============================================================================
# STEP 7: REPORT RESULTS
# ============================================================================

log ""
log "=========================================="
log "DROP BOT FINISHED"
log "=========================================="
log "Exit code: $EXIT_CODE"
log "Log file: $LOG_FILE"

if [ $EXIT_CODE -eq 0 ]; then
    success "Bot completed successfully!"
    log ""
    log "Check the log above for details."
    log "If successful, the payment screen was reached."
else
    error "Bot exited with error code $EXIT_CODE"
    log ""
    log "Possible causes:"
    log "  - Sold out (most likely)"
    log "  - Network errors"
    log "  - Chrome connection issues"
    log "  - Rate limiting"
    log ""
    log "Check the log file for full details:"
    log "  $LOG_FILE"
fi

log ""
log "Next steps:"
log "  1. Check the log file: tail -50 $LOG_FILE"
log "  2. If successful, complete payment in Chrome"
log "  3. If failed, check if drop is still ongoing"
log ""
log "=========================================="

exit $EXIT_CODE
