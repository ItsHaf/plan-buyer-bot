import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { BotConfig, TabWorker, SuccessEvent, PlanAvailabilityEvent, DEFAULT_CONFIG, DEFAULT_PLAN_TIERS, PlanTier, DEFAULT_PAYMENT_INDICATORS } from './types';
import { PaymentDetector } from './payment-detector';
import { AlertManager } from './alert-manager';

export class DropController {
  private config: BotConfig;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private workers: Map<number, TabWorker> = new Map();
  private successFlag: boolean = false;
  private winningTabId: number | null = null;
  private detector: PaymentDetector;
  private alertManager: AlertManager;
  private activeRefreshCount: number = 0;
  private isShuttingDown: boolean = false;
  private refreshSpamStarted: boolean = false;
  private buyButtonDetectedOnAnyTab: boolean = false;
  private targetPath: string;

  /** Check if a URL is on the target site (derived from config.targetUrl) */
  private isOnTargetSite(url: string): boolean {
    try {
      const urlPath = new URL(url).pathname;
      return urlPath === this.targetPath || urlPath.startsWith(this.targetPath + '/');
    } catch {
      return false;
    }
  }

  /**
   * Convert a time string (HH:MM or HH:MM:SS) in the configured reference timezone
   * to a local Date object. All time comparisons use this so the bot works
   * correctly regardless of the user's local timezone.
   */
  private timezoneTimeToDate(timeStr: string): Date {
    const [hours, minutes, seconds = 0] = timeStr.split(':').map(Number);

    // Get the current date/time parts in the reference timezone
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.config.timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    }).formatToParts(now);

    const get = (type: string) => parseInt(parts.find(p => p.type === type)!.value);

    // Build a Date for today at the target time in the reference timezone
    // by constructing a UTC date and applying the timezone offset
    const refYear = get('year');
    const refMonth = get('month') - 1;
    const refDay = get('day');

    // Create a date in the reference timezone at the target time
    // Strategy: make a date for "YYYY-MM-DD HH:MM:SS in reference TZ",
    // then compute what UTC time that corresponds to
    const utcGuess = new Date(Date.UTC(refYear, refMonth, refDay, hours, minutes, seconds));

    // Get what time our guess actually represents in the reference timezone
    const guessParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.config.timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    }).formatToParts(utcGuess);
    const getGuess = (type: string) => parseInt(guessParts.find(p => p.type === type)!.value);

    const guessHour = getGuess('hour');
    const guessMin = getGuess('minute');
    const guessSec = getGuess('second');

    // Calculate offset: how many ms to shift so the reference timezone shows the target time
    const offsetMs = ((hours - guessHour) * 3600 + (minutes - guessMin) * 60 + (seconds - guessSec)) * 1000;

    return new Date(utcGuess.getTime() + offsetMs);
  }

  constructor(config: Partial<BotConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    try {
      this.targetPath = new URL(this.config.targetUrl).pathname;
    } catch {
      this.targetPath = '/';
    }
    this.detector = new PaymentDetector(DEFAULT_PAYMENT_INDICATORS, [this.targetPath]);
    this.alertManager = new AlertManager();
  }

  /**
   * Initialize browser and create contexts
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing Drop Bot...');
    console.log(`📊 Configuration: ${this.config.tabCount} tabs, ${this.config.strategy} strategy`);

    if (this.config.useNativeBrowser) {
      await this.initializeNativeBrowser();
    } else {
      await this.initializeChromeCDP();
    }
  }

  /**
   * Initialize using Chrome DevTools Protocol (connect to existing Chrome)
   */
  private async initializeChromeCDP(): Promise<void> {
    console.log(`🔗 Connecting to Chrome on port ${this.config.cdpPort}...`);

    try {
      const cdpUrl = `http://127.0.0.1:${this.config.cdpPort}`;
      console.log(`   Connecting to: ${cdpUrl}`);
      this.browser = await chromium.connectOverCDP(cdpUrl);
      
      const contexts = this.browser.contexts();
      this.context = contexts[0] || await this.browser.newContext();
      
      console.log('✅ Connected to your Chrome browser!');
    } catch (error) {
      console.error(`❌ Failed to connect to Chrome on port ${this.config.cdpPort}`);
      console.error('Make sure Chrome is running with: --remote-debugging-port=9222');
      throw new Error(`Chrome not available on port ${this.config.cdpPort}`);
    }
  }

  /**
   * Initialize using Playwright's native Chromium browser
   */
  private async initializeNativeBrowser(): Promise<void> {
    console.log('🌐 Using Playwright native browser mode...');
    console.log('⚠️ You will need to log in manually in the browser window!');

    this.browser = await chromium.launch({
      headless: this.config.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    this.context = await this.browser.newContext({
      viewport: this.config.viewport
    });

    console.log('✅ Native browser launched!');
  }

  /**
   * Wait until a specific time before proceeding
   */
  private async waitUntil(targetTime: string): Promise<void> {
    const [hours, minutes, seconds = 0] = targetTime.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) {
      console.error(`⚠️ Invalid time format: ${targetTime}, proceeding immediately`);
      return;
    }
    
    const now = new Date();
    const target = this.timezoneTimeToDate(targetTime);
    
    let waitMs = target.getTime() - now.getTime();
    
    if (waitMs > 0) {
      const waitSec = Math.ceil(waitMs / 1000);
      console.log(`⏰ Waiting ${waitSec} seconds until ${targetTime}...`);
      
      while (waitMs > 0) {
        const remainingSec = Math.ceil(waitMs / 1000);
        if (remainingSec % 10 === 0 || remainingSec <= 5) {
          process.stdout.write(`\r   ${remainingSec}s remaining...    `);
        }
        const sleepMs = Math.min(1000, waitMs);
        await new Promise(r => setTimeout(r, sleepMs));
        waitMs -= sleepMs;
      }
      process.stdout.write('\r                          \r');
      console.log(`✅ Time reached: ${targetTime}`);
    } else {
      console.log(`⏰ Target time ${targetTime} has already passed, proceeding immediately...`);
    }
  }

  /**
   * Get milliseconds until target time
   */
  private getMsUntil(targetTime: string): number {
    const [hours, minutes, seconds = 0] = targetTime.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return 0;
    
    const now = new Date();
    const target = this.timezoneTimeToDate(targetTime);
    
    return target.getTime() - now.getTime();
  }

  /**
   * Check if a target time has been reached
   */
  private hasTimePassed(targetTime: string): boolean {
    return this.getMsUntil(targetTime) <= 0;
  }

  /**
   * Create all tab workers
   */
  async createWorkers(): Promise<void> {
    if (!this.context) throw new Error('Context not initialized');

    console.log(`📝 Creating ${this.config.tabCount} tab workers...`);

    for (let i = 0; i < this.config.tabCount; i++) {
      await this.createWorker(i);
    }

    console.log(`✅ Created ${this.workers.size} workers`);
  }

  /**
   * Create a single worker
   */
  async createWorker(id: number): Promise<TabWorker> {
    if (!this.context) throw new Error('Context not initialized');

    const page = await this.context.newPage();
    
    const jitter = Math.floor(Math.random() * 100);
    await page.setViewportSize({
      width: this.config.viewport.width + jitter,
      height: this.config.viewport.height + jitter
    });

    const worker: TabWorker = {
      id,
      page,
      status: 'idle',
      strategy: this.config.strategy === 'refresh-spam' ? 'refresh-spam' : 'pre-position',
      lastRefresh: 0,
      refreshCount: 0,
      buyButtonDetected: false,
      postDropRefreshCount: 0
    };

    this.workers.set(id, worker);
    return worker;
  }

  /**
   * Main execution loop
   */
  async run(): Promise<void> {
    try {
      await this.initialize();

      console.log('\n🎯 Starting drop bot...');
      console.log(`⏰ Strategy: ${this.config.strategy}`);

      if (this.config.strategy === 'time-based') {
        if (!this.config.useWaves) {
          if (this.config.autoStart) {
            console.log('\n📅 Auto-start enabled');
            await this.waitUntil(this.config.prePositionTime);
          }
          await this.createWorkers();
          console.log(`🕐 Rush time: ${this.config.rushTime}`);
          console.log(`🔄 Refresh spam starts: ${this.config.refreshSpamStart}`);
        } else {
          console.log(`🌊 Wave mode enabled`);
          console.log(`🕐 First wave starts: ${this.config.waveStartTime}`);
        }
        await this.executeTimeBasedStrategy();
      } else if (this.config.strategy === 'pre-position' || this.config.strategy === 'hybrid') {
        await this.createWorkers();
        console.log(`🕐 Rush time: ${this.config.rushTime}`);
        await this.executePrePositionStrategy();
        
        if (this.config.strategy === 'hybrid' && !this.successFlag) {
          console.log('\n🔄 Switching to refresh spam mode...');
          await this.executeRefreshSpamStrategy();
        }
      } else if (this.config.strategy === 'refresh-spam') {
        await this.createWorkers();
        await this.executeRefreshSpamStrategy();
      }

      if (!this.successFlag) {
        console.log('\n❌ Drop failed - no tab reached payment screen');
      }
    } catch (error) {
      console.error('💥 Fatal error:', error);
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Time-based strategy with optional TIERED WAVES
   */
  private async executeTimeBasedStrategy(): Promise<void> {
    if (this.config.useWaves) {
      await this.executeWaveStrategy();
    } else {
      await this.executeStandardTimeBasedStrategy();
    }
  }

  /**
   * TIERED WAVE STRATEGY
   */
  private async executeWaveStrategy(): Promise<void> {
    console.log('\n🌊 Executing TIERED WAVE strategy...');
    console.log(`   Waves: ${this.config.waves}`);
    console.log(`   Tabs per wave: ${this.config.tabsPerWave}`);
    console.log(`   First wave starts: ${this.config.waveStartTime}`);

    if (this.config.autoStart) {
      console.log(`⏰ Waiting until ${this.config.waveStartTime}...`);
      await this.waitUntil(this.config.waveStartTime);
    }

    for (let wave = 0; wave < this.config.waves; wave++) {
      if (this.successFlag) {
        console.log(`\n✅ Success detected! Skipping remaining waves.`);
        break;
      }

      const startTabId = wave * this.config.tabsPerWave;
      const endTabId = Math.min(startTabId + this.config.tabsPerWave, this.config.tabCount);
      const tabsInThisWave = endTabId - startTabId;

      if (tabsInThisWave <= 0) break;

      console.log(`\n🚀 WAVE ${wave + 1}/${this.config.waves}: Launching ${tabsInThisWave} tabs`);

      const waveWorkers: TabWorker[] = [];
      for (let i = startTabId; i < endTabId; i++) {
        const worker = await this.createWorker(i);
        waveWorkers.push(worker);
      }

      const navigatePromises = waveWorkers.map(async (worker) => {
        await this.navigateWithRetry(worker);
      });

      await Promise.all(navigatePromises);

      console.log(`✅ Wave ${wave + 1} complete. ${this.workers.size} total tabs active.`);

      for (const worker of waveWorkers) {
        if (worker.status !== 'error' && worker.status !== 'stopped') {
          await this.checkForPayment(worker);
          if (!this.successFlag && !worker.buyButtonDetected) {
            await this.checkForBuyButton(worker);
          }
        }
      }

      if (this.successFlag) break;

      if (wave < this.config.waves - 1) {
        console.log(`⏳ Waiting ${this.config.waveDelay}ms...`);
        await new Promise(r => setTimeout(r, this.config.waveDelay));
      }
    }

    console.log(`\n📊 All waves complete. ${this.workers.size} tabs active.`);

    console.log(`\n🔍 Monitoring for buy button + payment...`);
    
    const maxMonitorTime = 300000; // 5 minutes
    const startTime = Date.now();

    while (!this.successFlag && !this.isShuttingDown) {
      if (Date.now() - startTime > maxMonitorTime) {
        console.log(`\n⏰ Timeout. Assuming sold out.`);
        break;
      }

      if (this.hasTimePassed(this.config.refreshSpamStart) && !this.refreshSpamStarted) {
        this.refreshSpamStarted = true;
        console.log(`\n⏰ Switching to refresh-spam mode`);
        await this.executeRefreshSpamStrategy();
        break;
      }

      const checkPromises = Array.from(this.workers.values())
        .filter(w => w.status !== 'stopped' && w.status !== 'error')
        .map(async (worker) => {
          await this.checkForPayment(worker);
          if (!this.successFlag && !worker.buyButtonDetected) {
            await this.checkForBuyButton(worker);
          }
        });

      await Promise.all(checkPromises);

      if (!this.successFlag) {
        await new Promise(r => setTimeout(r, this.config.buyButtonCheckInterval));
      }
    }
  }

  /**
   * STANDARD Time-based strategy
   */
  private async executeStandardTimeBasedStrategy(): Promise<void> {
    console.log('\n📍 Executing TIME-BASED strategy...');

    const navigatePromises = Array.from(this.workers.values()).map(async (worker) => {
      await this.navigateWithRetry(worker);
    });

    await Promise.all(navigatePromises);

    const msUntilRefreshSpam = this.getMsUntil(this.config.refreshSpamStart);
    
    if (msUntilRefreshSpam > 0) {
      console.log(`\n⏳ Phase 2: Monitoring until ${this.config.refreshSpamStart}...`);

      await this.monitorWithTimeLimit(this.config.refreshSpamStart);
    }

    if (!this.successFlag) {
      console.log('\n🔄 Phase 3: Switching to REFRESH-SPAM mode...');
      await this.executeRefreshSpamStrategy();
    }
  }

  /**
   * Monitor all tabs for buy button and payment screen until target time
   */
  private async monitorWithTimeLimit(untilTime: string): Promise<void> {
    while (!this.successFlag && !this.isShuttingDown) {
      if (this.hasTimePassed(untilTime)) {
        console.log(`\n⏰ ${untilTime} reached`);
        break;
      }

      const checkPromises = Array.from(this.workers.values())
        .filter(w => w.status !== 'stopped' && w.status !== 'error')
        .map(async (worker) => {
          const currentUrl = worker.page.url();
          if (currentUrl.includes('rate-limit.html')) {
            console.log(`[Tab ${worker.id}] Rate limit page, refreshing...`);
            await this.refreshTab(worker);
            return;
          }

          if (this.isOnTargetSite(currentUrl)) {
            await this.checkForPayment(worker);
            if (!this.successFlag && !worker.buyButtonDetected) {
              await this.checkForBuyButton(worker);
            }
          }
        });

      await Promise.all(checkPromises);

      if (!this.successFlag) {
        await new Promise(r => setTimeout(r, this.config.buyButtonCheckInterval));
      }
    }
  }

  /**
   * Navigate to target URL with retry on high load errors
   */
  private async navigateWithRetry(worker: TabWorker): Promise<void> {
    let attempt = 0;
    let success = false;
    const maxAttempts = this.config.maxNavigateAttempts;

    while (!success && !this.isShuttingDown) {
      attempt++;
      
      if (maxAttempts > 0 && attempt > maxAttempts) {
        console.error(`[Tab ${worker.id}] ❌ Max attempts (${maxAttempts}) reached`);
        worker.status = 'error';
        return;
      }

      try {
        worker.status = 'navigating';
        console.log(`[Tab ${worker.id}] Attempt ${attempt}: Navigating...`);

        await worker.page.goto(this.config.targetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 60000
        });

        await new Promise(r => setTimeout(r, 5000));

        const currentUrl = worker.page.url();
        console.log(`[Tab ${worker.id}] URL: ${currentUrl}`);

        const hasHighLoadError = await this.checkForHighLoadError(worker);

        if (hasHighLoadError) {
          console.log(`[Tab ${worker.id}] ⚠️ Rate limit, retrying...`);
          worker.status = 'refreshing';
          worker.refreshCount++;
          await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));
        } else if (this.isOnTargetSite(currentUrl)) {
          const msgElement = worker.page.locator('p#msg.message');
          const isErrorPage = await msgElement.isVisible().catch(() => false);

          if (!isErrorPage) {
            success = true;
            worker.status = 'waiting';
            console.log(`[Tab ${worker.id}] ✅ Loaded after ${attempt} attempts`);
          } else {
            console.log(`[Tab ${worker.id}] ⚠️ Error element found, retrying...`);
            worker.status = 'refreshing';
            await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));
          }
        } else {
          console.log(`[Tab ${worker.id}] ⚠️ Unknown page, retrying...`);
          worker.status = 'refreshing';
          await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
        }
      } catch (error) {
        console.error(`[Tab ${worker.id}] ❌ Error (attempt ${attempt}): ${(error as Error).message}`);
        worker.status = 'error';
        await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));
      }
    }
  }

  /**
   * Check if current page is the rate limit error page
   */
  private async checkForHighLoadError(worker: TabWorker): Promise<boolean> {
    try {
      const msgElement = worker.page.locator('p#msg.message');
      const isMsgVisible = await msgElement.isVisible().catch(() => false);

      if (isMsgVisible) {
        const msgText = await msgElement.textContent().catch(() => '');
        if (msgText && msgText.includes('当前访问人数较多') && msgText.includes('刷新')) {
          console.log(`[Tab ${worker.id}] Rate limit page detected`);
          
          try {
            const refreshLink = worker.page.locator('a#refreshLink');
            await refreshLink.click({ timeout: 5000 });
            await worker.page.waitForLoadState('domcontentloaded', { timeout: 30000 });
            await new Promise(r => setTimeout(r, 3000));
            return true;
          } catch {
            return true;
          }
        }
      }

      const currentUrl = worker.page.url();
      if (currentUrl.includes('rate-limit.html')) {
        console.log(`[Tab ${worker.id}] Rate limit via URL`);
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Refresh a single tab
   */
  private async refreshTab(worker: TabWorker): Promise<void> {
    // Wait for rate limit slot
    while (this.activeRefreshCount >= this.config.maxConcurrentRefreshes) {
      await new Promise(r => setTimeout(r, 100));
    }

    this.activeRefreshCount++;
    
    try {
      worker.status = 'refreshing';
      worker.refreshCount++;

      const jitter = Math.random() * (this.config.maxRefreshInterval - this.config.minRefreshInterval);
      const interval = this.config.minRefreshInterval + jitter;

      console.log(`[Tab ${worker.id}] Refreshing (attempt ${worker.refreshCount})`);

      try {
        await worker.page.goto(this.config.targetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });

        await new Promise(r => setTimeout(r, 3000));

        const currentUrl = worker.page.url();
        if (!currentUrl.includes('rate-limit.html') && this.isOnTargetSite(currentUrl)) {
          worker.lastRefresh = Date.now();
          worker.status = 'waiting';
          worker.buyButtonDetected = false; // Reset after refresh
          console.log(`[Tab ${worker.id}] ✅ Refresh successful`);
        } else {
          console.log(`[Tab ${worker.id}] ⚠️ Refresh resulted in error page`);
        }

        await new Promise(r => setTimeout(r, interval));
      } catch (navError) {
        const errorMsg = (navError as Error).message;
        if (errorMsg.includes('ERR_ABORTED')) {
          console.log(`[Tab ${worker.id}] ⚠️ Navigation aborted`);
        } else {
          console.error(`[Tab ${worker.id}] ❌ Nav error: ${errorMsg}`);
        }
        worker.status = 'waiting';
      }
    } catch (error) {
      if (!this.isShuttingDown) {
        console.error(`[Tab ${worker.id}] ❌ Refresh error:`, error);
      }
      worker.status = 'error';
    } finally {
      this.activeRefreshCount = Math.max(0, this.activeRefreshCount - 1);
    }
  }

  /**
   * A stable target page is the intended product page, not a rate-limit page.
   * Once a worker reaches this state, we stop mass-refreshing that tab unless
   * the user explicitly allowed extra target-page refresh attempts.
   */
  private isStableTargetPage(url: string): boolean {
    return this.isOnTargetSite(url) && !url.includes('rate-limit.html');
  }

  /**
   * Decide whether this worker should keep refreshing after the drop.
   *
   * Rules:
   * - If the tab already shows a payment screen or enabled buy button, stop refreshing it.
   * - Every tab gets one mandatory post-drop refresh unless it is already actionable.
   * - Tabs still stuck on rate-limit/unknown pages should keep refreshing.
   * - Tabs already cleanly on the target page should stop mass-refreshing.
   */
  private async shouldRefreshWorkerAfterDrop(worker: TabWorker): Promise<boolean> {
    const currentUrl = worker.page.url();

    if (this.isStableTargetPage(currentUrl)) {
      await this.checkForPayment(worker);
      if (!this.successFlag && !worker.buyButtonDetected) {
        await this.checkForBuyButton(worker);
      }

      if (this.successFlag || worker.buyButtonDetected) {
        return false;
      }
    }

    if (worker.postDropRefreshCount === 0) {
      console.log(`[Tab ${worker.id}] First post-drop refresh`);
      return true;
    }

    if (!this.isStableTargetPage(currentUrl)) {
      return true;
    }

    return false;
  }

  /**
   * Check if buy button is available
   */
  private async checkForBuyButton(worker: TabWorker): Promise<PlanAvailabilityEvent | null> {
    if (this.successFlag || worker.buyButtonDetected) return null;

    try {
      const planOrder = Array.from(new Set<PlanTier>([
        ...(this.config.planPriority.length > 0 ? this.config.planPriority : [this.config.planTier]),
        this.config.planTier
      ]));

      for (const tier of planOrder) {
        const plan = DEFAULT_PLAN_TIERS[tier];

        for (const selector of plan.selectors) {
          try {
            const buttonLocator = worker.page.locator(selector);
            const buttonCount = await buttonLocator.count().catch(() => 0);
            
            for (let btnIdx = 0; btnIdx < buttonCount; btnIdx++) {
              try {
                const button = buttonLocator.nth(btnIdx);
                const isVisible = await button.isVisible().catch(() => false);
                
                if (!isVisible) continue;

                const isEnabled = await button.isEnabled().catch(() => false);
                const buttonText = await button.textContent().catch(() => '');
                
                const hasDisabledState = await button.evaluate(el => {
                  const classList = (el as HTMLElement).className || '';
                  const hasDisabledAttr = (el as HTMLButtonElement).disabled;
                  const hasDisabledClass = /is-disabled|disabled/i.test(classList);
                  const text = el.textContent || '';
                  const hasSoldOutText = /暂时售罄|sold out|售罄/i.test(text);
                  return hasDisabledAttr || hasDisabledClass || hasSoldOutText;
                }).catch(() => true);

                if (isEnabled && !hasDisabledState) {
                  worker.buyButtonDetected = true;
                  this.buyButtonDetectedOnAnyTab = true;
                  
                  const event: PlanAvailabilityEvent = {
                    tabId: worker.id,
                    timestamp: Date.now(),
                    planName: plan.name,
                    buttonSelector: selector,
                    buttonText: buttonText || ''
                  };

                  console.log(`\n🛒 ${plan.name.toUpperCase()} AVAILABLE on Tab ${worker.id}!`);
                  console.log(`   Text: "${buttonText?.trim()}"`);
                  console.log(`   CLICK IT NOW!`);
                  
                  await this.clearPageOverlays(worker.page);
                  
                  await worker.page.evaluate((planName) => {
                    const indicator = document.createElement('div');
                    indicator.id = 'bot-buy-indicator';
                    indicator.style.cssText = `
                      position: fixed; top: 10px; right: 10px;
                      background: #ff6b00; color: white;
                      padding: 20px 30px; font-size: 20px; font-weight: bold;
                      border-radius: 10px; z-index: 999999;
                      box-shadow: 0 4px 15px rgba(255,107,0,0.6);
                      animation: botPulse 1s infinite;
                    `;
                    indicator.innerHTML = `🛒 ${planName} AVAILABLE! CLICK NOW!`;
                    document.body.appendChild(indicator);
                    
                    const overlay = document.createElement('div');
                    overlay.id = 'bot-buy-overlay';
                    overlay.style.cssText = `
                      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                      border: 8px solid #ff6b00; z-index: 999998;
                      pointer-events: none; box-sizing: border-box;
                      animation: botBorderPulse 0.5s infinite alternate;
                    `;
                    document.body.appendChild(overlay);
                    
                    if (!document.getElementById('bot-animation-styles')) {
                      const style = document.createElement('style');
                      style.id = 'bot-animation-styles';
                      style.textContent = `
                        @keyframes botPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
                        @keyframes botBorderPulse { from { border-color: #ff6b00; box-shadow: 0 0 10px #ff6b00; } to { border-color: #ffaa00; box-shadow: 0 0 30px #ffaa00; } }
                      `;
                      document.head.appendChild(style);
                    }
                  }, plan.name);

                  await this.highlightBuyButtonTab(worker, plan.name);
                  
                  return event;
                }
              } catch {
                // Continue
              }
            }
          } catch {
            // Continue
          }
        }
      }
    } catch {
      // Silent
    }
    
    return null;
  }

  /**
   * Remove previously added bot overlays
   */
  private async clearPageOverlays(page: Page): Promise<void> {
    try {
      await page.evaluate(() => {
        const ids = ['bot-buy-indicator', 'bot-buy-overlay', 'bot-buy-button-overlay', 'drop-bot-alert'];
        for (const id of ids) {
          const el = document.getElementById(id);
          if (el) el.remove();
        }
      });
    } catch {
      // Ignore
    }
  }

  /**
   * Highlight tab where buy button was detected
   */
  private async highlightBuyButtonTab(worker: TabWorker, planName: string): Promise<void> {
    try {
      await worker.page.bringToFront();
      
      await worker.page.evaluate((plan) => {
        const oldOverlay = document.getElementById('bot-buy-button-overlay');
        if (oldOverlay) oldOverlay.remove();
        
        const overlay = document.createElement('div');
        overlay.id = 'bot-buy-button-overlay';
        overlay.style.cssText = `
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          border: 8px solid #ff6b00; z-index: 999998;
          pointer-events: none; box-sizing: border-box;
        `;
        document.body.appendChild(overlay);
        
        (window as any).__botAvailablePlan = plan;
      }, planName);
      
      console.log(`🔍 Tab ${worker.id} brought to front - ${planName} available!`);
    } catch {
      // Ignore
    }
  }

  /**
   * Pre-position strategy
   */
  private async executePrePositionStrategy(): Promise<void> {
    console.log('\n📍 Executing pre-position strategy...');
    
    const promises = Array.from(this.workers.values()).map(async (worker) => {
      try {
        worker.status = 'navigating';
        await worker.page.goto(this.config.targetUrl, {
          waitUntil: 'networkidle',
          timeout: 30000
        });

        worker.status = 'waiting';
        await this.monitorWorker(worker);
      } catch (error) {
        if (!this.isShuttingDown) {
          console.error(`[Tab ${worker.id}] Error:`, error);
        }
        worker.status = 'error';
      }
    });

    await Promise.all(promises);
  }

  /**
   * Refresh spam strategy
   */
  private async executeRefreshSpamStrategy(): Promise<void> {
    console.log('\n🔄 Executing post-drop refresh strategy...');
    
    const promises = Array.from(this.workers.values())
      .filter(w => w.status !== 'stopped')
      .map(async (worker) => {
        worker.strategy = 'refresh-spam';
        
        while (!this.successFlag && worker.status !== 'stopped') {
          const shouldRefresh = await this.shouldRefreshWorkerAfterDrop(worker);

          if (!shouldRefresh) {
            worker.status = 'waiting';
            if (!this.successFlag) {
              await worker.page.waitForTimeout(this.config.buyButtonCheckInterval);
            }
            continue;
          }

          // Wait for rate limit slot
          while (this.activeRefreshCount >= this.config.maxConcurrentRefreshes) {
            await new Promise(r => setTimeout(r, 100));
          }
          
          this.activeRefreshCount++;
          
          try {
            worker.status = 'refreshing';
            worker.refreshCount++;
            worker.postDropRefreshCount++;
            worker.buyButtonDetected = false;
            
            const jitter = Math.random() * (this.config.maxRefreshInterval - this.config.minRefreshInterval);
            const interval = this.config.minRefreshInterval + jitter;

            await worker.page.goto(this.config.targetUrl, {
              waitUntil: 'domcontentloaded',
              timeout: 15000
            });

            worker.lastRefresh = Date.now();
            worker.status = 'waiting';

            await this.checkForPayment(worker);
            if (!this.successFlag && !worker.buyButtonDetected) {
              await this.checkForBuyButton(worker);
            }

            if (!this.successFlag) {
              await worker.page.waitForTimeout(interval);
            }
          } catch (error) {
            if (!this.isShuttingDown) {
              console.error(`[Tab ${worker.id}] Refresh error:`, error);
            }
            worker.status = 'waiting';
            await new Promise(r => setTimeout(r, 2000));
          } finally {
            this.activeRefreshCount = Math.max(0, this.activeRefreshCount - 1);
          }
        }
      });

    await Promise.all(promises);
  }

  /**
   * Monitor a worker for payment screen
   */
  private async monitorWorker(worker: TabWorker): Promise<void> {
    while (!this.successFlag && worker.status !== 'stopped' && worker.status !== 'error') {
      await this.checkForPayment(worker);
      
      if (!this.successFlag) {
        await worker.page.waitForTimeout(this.config.checkInterval);
      }
    }
  }

  /**
   * Check if worker has reached payment screen
   */
  private async checkForPayment(worker: TabWorker): Promise<void> {
    if (this.successFlag) return;

    try {
      const result = await this.detector.detect(worker.page);
      
      if (result.isPaymentScreen) {
        await this.handleSuccess(worker, result.matchedIndicators);
      }
    } catch (error) {
      console.error(`[Tab ${worker.id}] Payment detection error:`, error);
    }
  }

  /**
   * Handle successful payment screen detection
   */
  private async handleSuccess(worker: TabWorker, indicators: string[]): Promise<void> {
    if (this.successFlag) return;
    
    this.successFlag = true;
    this.winningTabId = worker.id;
    worker.status = 'payment-detected';

    const successEvent: SuccessEvent = {
      tabId: worker.id,
      timestamp: Date.now(),
      url: worker.page.url(),
      indicators
    };

    console.log('\n🎉🎉🎉 SUCCESS! PAYMENT SCREEN REACHED! 🎉🎉🎉');
    console.log(`✅ Tab ${worker.id} reached payment screen!`);
    console.log(`🔗 URL: ${successEvent.url}`);
    console.log(`🔍 Matched: ${indicators.join(', ')}`);

    await this.stopAllOtherWorkers(worker.id);
    await this.alertManager.trigger(successEvent, worker.page);
    await this.focusWinningTab(worker);
  }

  /**
   * Stop all workers except the winning one
   */
  private async stopAllOtherWorkers(winningTabId: number): Promise<void> {
    console.log(`🛑 Stopping all tabs except ${winningTabId}...`);
    
    for (const worker of this.workers.values()) {
      if (worker.id !== winningTabId) {
        worker.status = 'stopped';
        console.log(`[Tab ${worker.id}] Stopped`);
      }
    }

    console.log('✅ All other tabs stopped');
  }

  /**
   * Focus the winning tab
   */
  private async focusWinningTab(worker: TabWorker): Promise<void> {
    console.log(`🔍 Focusing tab ${worker.id}...`);
    
    try {
      await worker.page.bringToFront();
      await this.clearPageOverlays(worker.page);
      
      await worker.page.evaluate(() => {
        const overlay = document.createElement('div');
        overlay.id = 'drop-bot-alert';
        overlay.style.cssText = `
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0, 255, 0, 0.1); border: 10px solid #00ff00;
          z-index: 999999; pointer-events: none;
          display: flex; align-items: center; justify-content: center;
        `;
        overlay.innerHTML = `
          <div style="background: #00ff00; color: black; padding: 20px 40px;
            font-size: 24px; font-weight: bold; border-radius: 10px;
            box-shadow: 0 0 20px rgba(0,255,0,0.5);">
            ✅ PAYMENT SCREEN DETECTED - COMPLETE YOUR PURCHASE!
          </div>
        `;
        document.body.appendChild(overlay);
      });

      console.log('✅ Winning tab focused');
    } catch (error) {
      console.error('Error focusing tab:', error);
    }
  }

  /**
   * Get current status of all workers
   */
  getStatus(): { total: number; byStatus: Record<string, number> } {
    const byStatus: Record<string, number> = {};
    
    for (const worker of this.workers.values()) {
      byStatus[worker.status] = (byStatus[worker.status] || 0) + 1;
    }

    return { total: this.workers.size, byStatus };
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.isShuttingDown = true;
    console.log('\n🧹 Cleaning up...');
    
    this.alertManager.cleanup();
    
    if (this.config.useNativeBrowser) {
      if (this.browser) {
        try {
          await this.browser.close();
          console.log('✅ Browser closed');
        } catch {
          // Already closed
        }
      }
    } else {
      for (const worker of this.workers.values()) {
        try {
          await worker.page.close();
        } catch {
          // Already closed
        }
      }
      console.log('✅ Cleanup complete (Chrome still running)');
    }
  }
}
