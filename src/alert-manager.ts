import { Page } from 'playwright';
import { SuccessEvent } from './types';
import * as fs from 'fs';
import * as path from 'path';

export class AlertManager {
  private hasAlerted: boolean = false;
  private intervalIds: NodeJS.Timeout[] = [];

  /**
   * Trigger all alert mechanisms
   */
  async trigger(event: SuccessEvent, page: Page): Promise<void> {
    if (this.hasAlerted) return;
    this.hasAlerted = true;

    console.log('\n🔔 ALERT TRIGGERED!');

    // 1. Console alerts
    this.consoleAlert(event);

    // 2. Visual alert on page
    await this.visualAlert(page);

    // 3. Play sound
    this.soundAlert();

    // 4. Create notification file
    this.fileAlert(event);

    // 5. Flash terminal
    this.terminalAlert();
  }

  /**
   * Console-based alert
   */
  private consoleAlert(event: SuccessEvent): void {
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║                                                        ║');
    console.log('║     🎉 PAYMENT SCREEN DETECTED - TAKE ACTION! 🎉      ║');
    console.log('║                                                        ║');
    console.log(`║     Tab: ${event.tabId.toString().padEnd(45)} ║`);
    console.log(`║     Time: ${new Date(event.timestamp).toLocaleTimeString().padEnd(44)} ║`);
    console.log('║                                                        ║');
    console.log('║     👆 SWITCH TO THE BROWSER TAB NOW!                 ║');
    console.log('║     💳 COMPLETE YOUR PAYMENT MANUALLY!                ║');
    console.log('║                                                        ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log('\n');
  }

  /**
   * Visual alert - add overlay to the page
   */
  private async visualAlert(page: Page): Promise<void> {
    try {
      await page.evaluate(() => {
        // Remove any existing overlay
        const existing = document.getElementById('drop-bot-alert');
        if (existing) existing.remove();

        // Create alert overlay
        const overlay = document.createElement('div');
        overlay.id = 'drop-bot-alert';
        overlay.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 255, 0, 0.15);
          border: 15px solid #00ff00;
          z-index: 2147483647;
          pointer-events: none;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: botPulse 1s ease-in-out infinite;
        `;

        // Add pulse animation
        const style = document.createElement('style');
        style.textContent = `
          @keyframes botPulse {
            0%, 100% { border-color: #00ff00; box-shadow: 0 0 30px #00ff00; }
            50% { border-color: #00cc00; box-shadow: 0 0 50px #00cc00; }
          }
          @keyframes botFlash {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
          }
        `;
        document.head.appendChild(style);

        overlay.innerHTML = `
          <div style="
            background: linear-gradient(135deg, #00ff00, #00cc00);
            color: black;
            padding: 30px 50px;
            font-size: 28px;
            font-weight: bold;
            border-radius: 15px;
            box-shadow: 0 0 40px rgba(0,255,0,0.6);
            text-align: center;
            animation: botFlash 0.5s ease-in-out infinite;
            font-family: Arial, sans-serif;
          ">
            <div style="font-size: 48px; margin-bottom: 15px;">✅</div>
            <div>PAYMENT SCREEN DETECTED!</div>
            <div style="font-size: 18px; margin-top: 10px; opacity: 0.9;">
              Complete your purchase now - this tab is active!
            </div>
          </div>
        `;

        document.body.appendChild(overlay);
      });
    } catch (error) {
      console.error('Visual alert error:', error);
    }
  }

  /**
   * Sound alert using terminal bell and console
   */
  private soundAlert(): void {
    // Terminal bell
    process.stdout.write('\u0007');
    
    // Multiple beeps
    let beepCount = 0;
    const beepInterval = setInterval(() => {
      process.stdout.write('\u0007');
      beepCount++;
      if (beepCount >= 5) {
        clearInterval(beepInterval);
      }
    }, 500);
    this.intervalIds.push(beepInterval);
  }

  /**
   * Create a file alert for external monitoring
   */
  private fileAlert(event: SuccessEvent): void {
    const alertData = {
      success: true,
      timestamp: event.timestamp,
      tabId: event.tabId,
      url: event.url,
      indicators: event.indicators,
      message: 'Payment screen detected - manual action required'
    };

    try {
      const alertPath = path.join(process.cwd(), 'SUCCESS_ALERT.json');
      fs.writeFileSync(alertPath, JSON.stringify(alertData, null, 2));
      console.log(`📝 Alert file created: ${alertPath}`);
    } catch (error) {
      console.error('File alert error:', error);
    }
  }

  /**
   * Terminal flash/alert
   */
  private terminalAlert(): void {
    // Flash the terminal title
    let flashCount = 0;
    const originalTitle = process.title;
    
    const flashInterval = setInterval(() => {
      process.title = flashCount % 2 === 0 
        ? '🔴🔴🔴 SUCCESS - PAYMENT SCREEN DETECTED 🔴🔴🔴'
        : originalTitle;
      
      flashCount++;
      if (flashCount >= 20) {
        clearInterval(flashInterval);
        process.title = originalTitle;
      }
    }, 300);
    this.intervalIds.push(flashInterval);
  }

  /**
   * Cleanup all running intervals
   * Call this on bot shutdown to prevent memory leaks
   */
  cleanup(): void {
    for (const intervalId of this.intervalIds) {
      clearInterval(intervalId);
    }
    this.intervalIds = [];
  }
}
