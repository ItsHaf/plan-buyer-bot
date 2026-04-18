# Plan Buyer Bot

Multi-tab browser automation for securing limited-availability plans. Connects to your existing Chrome browser via the DevTools Protocol to reuse your logged-in session, monitors for buy buttons, and alerts you when it's time to click.

## How It Works

1. Connects to your Chrome browser (or launches its own Chromium)
2. Opens multiple tabs on the target page
3. Monitors each tab for buy buttons becoming available
4. When a button is detected: highlights the tab, plays an alert, brings it to front
5. You click the button manually and complete the purchase

**The bot does not click buy buttons or complete payments.** It detects availability and alerts you.

## Requirements

- Node.js 18+ (see below for installation)
- Chrome or Chromium installed
- A logged-in session on the target website

## Installation

```bash
git clone https://github.com/itshaf/plan-buyer-bot.git
cd plan-buyer-bot
npm install
```

### Installing Node.js

**Windows:**
Download the installer from [nodejs.org](https://nodejs.org/) (choose LTS, which is 18+). Run the `.msi` installer and follow the prompts.

Or with [winget](https://winget.run/):
```cmd
winget install OpenJS.NodeJS.LTS
```

**macOS:**
```bash
# With Homebrew
brew install node@22

# Or download from https://nodejs.org/
```

**Linux (Debian/Ubuntu):**
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Verify installation:
```bash
node --version   # Should show v18 or higher
npm --version
```

## Setup

The bot connects to an existing Chrome instance using Chrome DevTools Protocol (CDP) so it can reuse your logged-in session.

### Step 1: Launch Chrome with remote debugging

Close all Chrome windows first, then run:

**Windows:**
```cmd
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

**macOS:**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

**Linux:**
```bash
google-chrome --remote-debugging-port=9222
```

Or use the included helper script on Windows:
```cmd
chrome-alt.bat
```

### Step 2: Log in

Log in to the target website in the Chrome window that opens. Keep Chrome running.

### Step 3: Run the bot

```bash
npm start
```

## Quick Start

```bash
# Default: 20 tabs, max plan, time-based strategy
npm start

# Target a specific plan
npm start -- --plan=max

# Custom tab count
npm start -- --tabs=10

# Start immediately (skip scheduled waiting)
npm start -- --no-wait --tabs=5
```

## CLI Options

| Option | Description | Default |
|---|---|---|
| `--tabs=N` | Total number of tabs | 20 (waves * tabsPerWave) |
| `--plan=TIER` | Plan tier: `lite`, `pro`, `max` | `max` |
| `--strategy=STRATEGY` | `time-based`, `pre-position`, `refresh-spam`, `hybrid` | `time-based` |
| `--timezone=ZONE` | IANA timezone for all time values | `Asia/Shanghai` |
| `--start-time=HH:MM` | When to start pre-positioning (in timezone) | `09:55` |
| `--rush-time=HH:MM` | When the drop happens (in timezone) | `10:00` |
| `--refresh-time=HH:MM:SS` | When to switch to refresh spam (in timezone) | `10:00:00` |
| `--port=N` | Chrome CDP port | `9222` |
| `--use-native-browser` | Use Playwright Chromium instead of Chrome | off |
| `--no-waves` | Disable wave mode | off |
| `--waves=N` | Number of waves | `4` |
| `--tabs-per-wave=N` | Tabs per wave | `5` |
| `--wave-delay=N` | Delay between waves (ms) | `2000` |
| `--wave-start-time=HH:MM:SS` | First wave start time (in timezone) | `09:55:00` |
| `--no-wait` | Skip auto-start waiting | off |
| `--headless` | Run browser headless | off |
| `--max-retries=N` | Max navigation attempts (0=infinite) | `30` |

## Plan Tiers

The bot monitors for specific plan tiers with configurable priority. By default it checks for Max first, then Pro, then Lite:

```bash
# Target a specific plan tier
npm start -- --plan=max
npm start -- --plan=pro
npm start -- --plan=lite
```

Plan selectors are defined in `src/types.ts` (`DEFAULT_PLAN_TIERS`). You may need to customize these selectors for your target website.

## Strategies

### Time-Based (default)

The recommended strategy. Combines wave-based tab launching with timed refresh spam.

1. Waits until `waveStartTime` (default: 03:55)
2. Launches tabs in waves (4 waves x 5 tabs)
3. Monitors for buy buttons and payment screens
4. At `refreshSpamStart` (default: 04:00:00), switches all tabs to continuous refreshing
5. Stops when any tab reaches a payment screen

### Pre-Position

Opens tabs early and waits on the page. Good when you can load the page well before the drop.

### Refresh Spam

Continuously refreshes all tabs. Higher success rate for competitive drops but risks rate limiting.

### Hybrid

Starts with pre-position, switches to refresh spam after a threshold.

## Drop Workflow

When using the default time-based strategy with waves:

**Phase 1 - Wave Launch** (starts at `waveStartTime`)
- Launches tabs in configurable waves with delays between them
- Each tab navigates to the target URL with retry logic for rate limits

**Phase 2 - Monitoring** (wave start until `refreshSpamStart`)
- All tabs monitor for buy buttons every 250ms
- Checks if buttons are enabled (not disabled/sold out)
- Rate limit pages are automatically detected and refreshed

**Phase 3 - Refresh Spam** (at `refreshSpamStart`)
- All tabs switch to continuous refreshing
- Randomised intervals (800-2000ms) to avoid rate limiting
- Max 5 concurrent refreshes at once
- First tab to reach a payment screen wins

**Success** - When any tab reaches a payment screen:
- All other tabs stop immediately
- Terminal bell sounds (5 beeps)
- Green overlay appears on winning tab
- Tab is brought to the front
- `SUCCESS_ALERT.json` is written to disk
- You complete the payment manually

## Payment Detection

The bot detects payment screens using multiple signals:

- **URL patterns**: `/checkout`, `/payment`, `/purchase`, `/billing`, Alipay/WeChat Pay URLs, etc.
- **Page title**: Contains payment/checkout related terms
- **DOM selectors**: Payment forms, QR code containers, card input fields
- **Text content**: Payment confirmation text in multiple languages

A URL match alone is sufficient. Otherwise, 2+ non-URL indicators are required to avoid false positives. Product pages are automatically excluded.

Indicators are defined in `src/types.ts` (`DEFAULT_PAYMENT_INDICATORS`).

## Alerts

### Buy Button Detected
- Orange border and pulsing overlay on the tab
- Tab brought to front
- Console message with plan name and button text
- You click the button manually

### Payment Screen Reached
- Green border overlay on the winning tab
- Terminal bell (5 beeps)
- Terminal title flashes
- `SUCCESS_ALERT.json` written to working directory
- All other tabs stopped

## Automation with Cron

Use `plan-buyer-bot-cron.sh` for scheduled/automated drops:

```bash
# Copy and edit the script
cp plan-buyer-bot-cron.sh ~/plan-buyer-bot-cron.sh
chmod +x ~/plan-buyer-bot-cron.sh

# Edit configuration inside the script:
# BOT_DIR, PLAN_TIER, PLAN_DURATION, TAB_COUNT, etc.

# Add to crontab
crontab -e
# Run at 3:55 AM daily:
# 55 3 * * * ~/plan-buyer-bot-cron.sh
```

## Customization

### Adapting for a Different Website

The bot is designed to be generic, but some site-specific configuration lives in `src/types.ts`:

1. **`targetUrl`** - Change the default URL in `DEFAULT_CONFIG`
2. **Plan selectors** - Update `DEFAULT_PLAN_TIERS` with CSS selectors matching the target site's plan cards and buy buttons
3. **Payment indicators** - Update `DEFAULT_PAYMENT_INDICATORS` URL patterns, selectors, and text patterns
4. **Rate limit detection** - The Chinese text patterns in `checkForHighLoadError()` in `controller.ts` may need updating

### Timing

All times are in 24-hour format (`HH:MM` or `HH:MM:SS`). By default, times are interpreted in `Asia/Shanghai` (Beijing time). The bot handles timezone conversion automatically — it calculates your local equivalent of the configured times, so the bot triggers at the correct moment regardless of where you are.

To change the reference timezone (e.g., if the target site operates on a different schedule):
```bash
npm start -- --timezone=America/New_York --rush-time=14:00
```

Common timezone values: `Asia/Shanghai`, `America/New_York`, `America/Los_Angeles`, `Europe/London`, `Europe/Amsterdam`, `Asia/Tokyo`.

## Project Structure

```
src/
  index.ts             CLI entry point, argument parsing
  controller.ts        DropController - main bot orchestration
  payment-detector.ts  PaymentDetector - payment screen detection
  alert-manager.ts     AlertManager - sound, visual, file alerts
  types.ts             Types, config defaults, plan tier definitions
  test.ts              Simple test script
chrome-alt-launcher.ps1   Windows: Chrome policy checker and alternative launcher
chrome-alt.bat            Windows: runs the PowerShell script
start.bat                 Windows: interactive quick start
start.sh                  macOS/Linux: interactive quick start
plan-buyer-bot-cron.sh    Cron job script for automated drops
```

## Development

```bash
# Run in dev mode (auto-reload on file changes)
npm run dev

# Build TypeScript to dist/
npm run build

# Run compiled output
node dist/index.js

# Type check without emitting
npx tsc --noEmit

# Run test script
npm test
```

## Troubleshooting

### "Failed to connect to Chrome"
- Make sure Chrome is running with `--remote-debugging-port=9222`
- Close all other Chrome instances first (only one can use the debugging port)
- Try the alternative launcher: `chrome-alt.bat` (Windows)
- Or use Playwright's built-in browser: `npm start -- --use-native-browser`

### Rate limiting
- Reduce tab count: `--tabs=10`
- Increase refresh intervals in `DEFAULT_CONFIG` in `src/types.ts`
- The bot has built-in rate limit protection (randomised intervals, max concurrent refreshes)

### Buy button not detected
- The CSS selectors in `DEFAULT_PLAN_TIERS` may not match the target site
- Use browser DevTools to inspect the actual button elements
- Update the selectors in `src/types.ts`

### Payment screen not detected
- Check that `DEFAULT_PAYMENT_INDICATORS` in `src/types.ts` matches the target site's payment page
- Add new URL patterns, selectors, or text patterns as needed

### Session expired
- Log in again in your Chrome browser
- The bot uses your existing cookies/session via CDP

## License

MIT

## Disclaimer

This tool is for educational and personal use. Automated browsing may violate website terms of service. The bot does not complete purchases automatically — it detects availability and alerts the user. You are responsible for ensuring your use complies with applicable laws and website policies.
