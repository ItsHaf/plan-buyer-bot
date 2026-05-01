import { DropController } from './controller';
import { BotConfig, DEFAULT_CONFIG, PlanTier } from './types';

/**
 * Drop Bot
 * Multi-tab browser automation for securing limited availability plans
 */

const PLAN_TIERS: PlanTier[] = ['lite', 'pro', 'max'];

function isPlanTier(value: string): value is PlanTier {
  return PLAN_TIERS.includes(value as PlanTier);
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║                                                        ║');
  console.log('║                  🚀 Drop Bot Runner 🚀                ║');
  console.log('║                                                        ║');
  console.log('║     Multi-tab automation for plan purchases            ║');
  console.log('║                                                        ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log();
  console.log('⚠️  IMPORTANT: This bot connects to an existing Chrome browser!');
  console.log('   Make sure Chrome is running with: --remote-debugging-port=9222');
  console.log();

  // Parse command line arguments
  const args = process.argv.slice(2);
  const config: Partial<BotConfig> = {};

  // Parse --tabs=N
  const tabsArg = args.find(arg => arg.startsWith('--tabs='));
  if (tabsArg) {
    config.tabCount = parseInt(tabsArg.split('=')[1], 10);
  }

  // Parse --strategy=pre-position|refresh-spam|hybrid|time-based
  const strategyArg = args.find(arg => arg.startsWith('--strategy='));
  if (strategyArg) {
    config.strategy = strategyArg.split('=')[1] as any;
  }

  // Parse --plan=lite|pro|max
  const planArg = args.find(arg => arg.startsWith('--plan='));
  if (planArg) {
    const planTier = planArg.split('=')[1];
    if (isPlanTier(planTier)) {
      config.planTier = planTier;
      config.planPriority = [planTier, ...DEFAULT_CONFIG.planPriority.filter(t => t !== planTier)];
    } else {
      console.warn(`⚠️  Ignoring invalid plan tier: ${planTier}`);
    }
  }

  // Parse --timezone (IANA timezone, e.g. Asia/Shanghai, America/New_York)
  const timezoneArg = args.find(arg => arg.startsWith('--timezone='));
  if (timezoneArg) {
    config.timezone = timezoneArg.split('=')[1];
  }

  // Parse --start-time=HH:MM
  const startTimeArg = args.find(arg => arg.startsWith('--start-time='));
  if (startTimeArg) {
    config.prePositionTime = startTimeArg.split('=')[1];
    config.autoStart = true;
  }

  // Parse --rush-time=HH:MM
  const rushTimeArg = args.find(arg => arg.startsWith('--rush-time='));
  if (rushTimeArg) {
    config.rushTime = rushTimeArg.split('=')[1];
  }

  // Parse --refresh-time=HH:MM:SS
  const refreshTimeArg = args.find(arg => arg.startsWith('--refresh-time='));
  if (refreshTimeArg) {
    config.refreshSpamStart = refreshTimeArg.split('=')[1];
  }

  // Parse --port=N (Chrome DevTools Protocol port)
  const portArg = args.find(arg => arg.startsWith('--port='));
  if (portArg) {
    config.cdpPort = parseInt(portArg.split('=')[1], 10);
  }

  // Parse --use-native-browser (use Playwright's Chromium instead of Chrome CDP)
  if (args.includes('--use-native-browser')) {
    config.useNativeBrowser = true;
    console.log('🌐 Using native browser mode (Playwright Chromium)');
  }

  // Parse --no-waves (disable tiered wave approach)
  if (args.includes('--no-waves')) {
    config.useWaves = false;
    console.log('📍 Disabling wave approach - using standard strategy');
  }

  // Parse --waves=N (number of waves)
  const wavesArg = args.find(arg => arg.startsWith('--waves='));
  if (wavesArg) {
    config.waves = parseInt(wavesArg.split('=')[1], 10);
  }

  // Parse --tabs-per-wave=N (tabs per wave)
  const tabsPerWaveArg = args.find(arg => arg.startsWith('--tabs-per-wave='));
  if (tabsPerWaveArg) {
    config.tabsPerWave = parseInt(tabsPerWaveArg.split('=')[1], 10);
  }

  // Parse --wave-delay=N (delay between waves in ms)
  const waveDelayArg = args.find(arg => arg.startsWith('--wave-delay='));
  if (waveDelayArg) {
    config.waveDelay = parseInt(waveDelayArg.split('=')[1], 10);
  }

  // Parse --wave-start-time=HH:MM:SS (when to start first wave)
  const waveStartTimeArg = args.find(arg => arg.startsWith('--wave-start-time='));
  if (waveStartTimeArg) {
    config.waveStartTime = waveStartTimeArg.split('=')[1];
  }

  // Parse --no-wait (disable auto-start waiting)
  if (args.includes('--no-wait')) {
    config.autoStart = false;
  }

  // Parse --headless
  if (args.includes('--headless')) {
    config.headless = true;
    console.log('⚠️  WARNING: Running in headless mode - you won\'t see the browser!');
  }

  // Parse --max-retries=N (max navigation attempts, 0 = infinite)
  const maxRetriesArg = args.find(arg => arg.startsWith('--max-retries='));
  if (maxRetriesArg) {
    config.maxNavigateAttempts = parseInt(maxRetriesArg.split('=')[1], 10);
    if (config.maxNavigateAttempts === 0) {
      console.log('🔄 Infinite navigation retries enabled');
    } else {
      console.log(`🔄 Max navigation retries: ${config.maxNavigateAttempts}`);
    }
  }

  const effectiveConfig: BotConfig = { ...DEFAULT_CONFIG, ...config };

  if (!tabsArg) {
    const computedTabCount = effectiveConfig.waves * effectiveConfig.tabsPerWave;
    config.tabCount = computedTabCount;
    effectiveConfig.tabCount = computedTabCount;
  }

  // Show configuration
  console.log('📋 Configuration:');
  console.log(`   Tabs: ${effectiveConfig.tabCount}`);
  console.log(`   Strategy: ${effectiveConfig.strategy}`);
  console.log(`   Target URL: ${effectiveConfig.targetUrl}`);
  console.log(`   Timezone: ${effectiveConfig.timezone} (all times in this timezone)`);
  console.log(`   Plan tier: ${effectiveConfig.planTier}`);
  console.log(`   Plan priority: ${effectiveConfig.planPriority.join(' -> ')}`);
  console.log(`   Max retries: ${effectiveConfig.maxNavigateAttempts === 0 ? 'infinite' : effectiveConfig.maxNavigateAttempts}`);
  
  if (effectiveConfig.useNativeBrowser) {
    console.log(`   Browser: Playwright Native Chromium`);
  } else {
    console.log(`   Browser: Chrome CDP (port ${effectiveConfig.cdpPort})`);
  }
  
  if (effectiveConfig.strategy === 'time-based') {
    if (effectiveConfig.useWaves) {
      console.log(`   Mode: Wave`);
      console.log(`   Tabs: ${effectiveConfig.tabCount} total (${effectiveConfig.waves} waves x ${effectiveConfig.tabsPerWave} tabs/wave)`);
      console.log(`   Wave delay: ${effectiveConfig.waveDelay}ms`);
      console.log(`   First wave starts: ${effectiveConfig.waveStartTime}`);
    } else {
      console.log(`   Pre-position time: ${effectiveConfig.prePositionTime}`);
      console.log(`   Rush time: ${effectiveConfig.rushTime}`);
      console.log(`   Refresh spam starts: ${effectiveConfig.refreshSpamStart}`);
    }
  }
  
  console.log();

  // Create and run the bot
  const controller = new DropController(config);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Received interrupt signal, shutting down...');
    await controller.cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n\n🛑 Received termination signal, shutting down...');
    await controller.cleanup();
    process.exit(0);
  });

  try {
    await controller.run();
  } catch (error) {
    console.error('💥 Fatal error:', error);
    await controller.cleanup();
    process.exit(1);
  }
}

// Run the bot
main();
