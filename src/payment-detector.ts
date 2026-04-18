import { Page } from 'playwright';
import { PaymentIndicators, DEFAULT_PAYMENT_INDICATORS } from './types';

export class PaymentDetector {
  private indicators: PaymentIndicators;
  private excludePaths: string[];

  constructor(indicators: PaymentIndicators = DEFAULT_PAYMENT_INDICATORS, excludePaths: string[] = []) {
    this.indicators = indicators;
    this.excludePaths = excludePaths;
  }

  /**
   * Check if current page is a payment/checkout screen
   * 
   * IMPORTANT: Excludes known product pages to avoid
   * false positives from buy button text like "购买" appearing on the product page.
   */
  async detect(page: Page): Promise<{ isPaymentScreen: boolean; matchedIndicators: string[] }> {
    const matchedIndicators: string[] = [];

    try {
      const url = page.url();

      // GUARD: If we're on a known product page, this is NOT a payment screen
      // Product pages have buy buttons but aren't payment screens
      if (this.excludePaths.some(p => url.includes(p))) {
        return { isPaymentScreen: false, matchedIndicators: [] };
      }

      // Check 1: URL pattern matching
      for (const pattern of this.indicators.urlPatterns) {
        if (pattern.test(url)) {
          matchedIndicators.push(`url:${pattern.source}`);
        }
      }

      // Check 2: Page title
      const title = await page.title().catch(() => '');
      for (const pattern of this.indicators.titlePatterns) {
        if (pattern.test(title)) {
          matchedIndicators.push(`title:${pattern.source}`);
        }
      }

      // Check 3: DOM selectors
      for (const selector of this.indicators.selectors) {
        try {
          const element = await page.locator(selector).first();
          const isVisible = await element.isVisible().catch(() => false);
          if (isVisible) {
            matchedIndicators.push(`selector:${selector}`);
          }
        } catch {
          // Continue
        }
      }

      // Check 4: Page text content
      const bodyText = await page.locator('body').textContent({ timeout: 5000 }).catch(() => '');
      if (bodyText) {
        for (const pattern of this.indicators.textPatterns) {
          if (pattern.test(bodyText)) {
            matchedIndicators.push(`text:${pattern.source}`);
          }
        }
      }

      // Detection: URL match alone is sufficient, otherwise need 2+ non-URL indicators
      const urlMatches = matchedIndicators.filter(i => i.startsWith('url:')).length;
      const nonUrlMatches = matchedIndicators.length - urlMatches;
      
      const isPaymentScreen = urlMatches >= 1 || nonUrlMatches >= 2;

      return { isPaymentScreen, matchedIndicators };
    } catch (error) {
      console.error(`Error in payment detection: ${error}`);
      return { isPaymentScreen: false, matchedIndicators: [] };
    }
  }

  /**
   * Wait for payment screen with timeout
   */
  async waitForPaymentScreen(
    page: Page, 
    checkInterval: number, 
    timeout: number
  ): Promise<{ found: boolean; result?: { matchedIndicators: string[] } }> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const result = await this.detect(page);
      if (result.isPaymentScreen) {
        return { found: true, result };
      }
      await page.waitForTimeout(checkInterval);
    }
    
    return { found: false };
  }
}
