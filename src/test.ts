import { DropController } from '../src/controller';

/**
 * Test script - runs bot with minimal tabs to verify functionality
 * This won't actually buy anything, just tests the mechanics
 */

async function test() {
  console.log('🧪 Running test mode...');
  console.log('This will open 3 tabs in a Chrome browser and test the detection system.');
  console.log('⚠️  Make sure Chrome is running with: --remote-debugging-port=9222');
  console.log('Press Ctrl+C to stop early.\n');

  const controller = new DropController({
    tabCount: 3,
    strategy: 'hybrid',
    headless: false,
    checkInterval: 1000,
    minRefreshInterval: 2000,
    maxRefreshInterval: 3000
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Stopping test...');
    await controller.cleanup();
    process.exit(0);
  });

  try {
    await controller.run();
  } catch (error) {
    console.error('Test error:', error);
    await controller.cleanup();
  }
}

test();
