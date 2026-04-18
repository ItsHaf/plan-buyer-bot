import { Page } from 'playwright';

export type PlanTier = 'lite' | 'pro' | 'max';

export interface PlanTierConfig {
  name: string;
  selectors: string[];
}

export interface BotConfig {
  tabCount: number;
  targetUrl: string;
  strategy: 'pre-position' | 'refresh-spam' | 'hybrid' | 'time-based';
  timezone: string;
  prePositionTime: string;
  rushTime: string;
  refreshSpamStart: string;
  buyButtonWaitSeconds: number;
  minRefreshInterval: number;
  maxRefreshInterval: number;
  maxConcurrentRefreshes: number;
  checkInterval: number;
  buyButtonCheckInterval: number;
  playSound: boolean;
  flashScreen: boolean;
  focusWindow: boolean;
  headless: boolean;
  viewport: { width: number; height: number };
  cdpPort: number;
  useNativeBrowser: boolean;
  autoStart: boolean;
  maxNavigateAttempts: number;
  useWaves: boolean;
  waves: number;
  tabsPerWave: number;
  waveDelay: number;
  waveStartTime: string;
  planTier: PlanTier;
  planPriority: PlanTier[];
}

export const DEFAULT_CONFIG: BotConfig = {
  tabCount: 20,
  targetUrl: 'https://bigmodel.cn/glm-coding',
  strategy: 'time-based',
  timezone: 'Asia/Shanghai',
  prePositionTime: '09:55',
  rushTime: '10:00',
  refreshSpamStart: '10:00:00',
  buyButtonWaitSeconds: 30,
  minRefreshInterval: 800,
  maxRefreshInterval: 2000,
  maxConcurrentRefreshes: 5,
  checkInterval: 500,
  buyButtonCheckInterval: 250,
  playSound: true,
  flashScreen: true,
  focusWindow: true,
  headless: false,
  viewport: { width: 1280, height: 720 },
  cdpPort: 9222,
  useNativeBrowser: false,
  autoStart: true,
  maxNavigateAttempts: 30,
  useWaves: true,
  waves: 4,
  tabsPerWave: 5,
  waveDelay: 2000,
  waveStartTime: '09:55:00',
  planTier: 'max',
  planPriority: ['max', 'pro', 'lite']
};

export interface TabWorker {
  id: number;
  page: Page;
  status: TabStatus;
  strategy: StrategyType;
  lastRefresh: number;
  refreshCount: number;
  buyButtonDetected: boolean;
}

export type TabStatus = 
  | 'idle'
  | 'waiting-for-start'
  | 'navigating' 
  | 'waiting' 
  | 'checking-buy-button'
  | 'refreshing' 
  | 'attempting-purchase' 
  | 'payment-detected' 
  | 'stopped' 
  | 'error';

export type StrategyType = 'pre-position' | 'refresh-spam' | 'time-based' | 'hybrid';

export interface PaymentIndicators {
  urlPatterns: RegExp[];
  selectors: string[];
  textPatterns: RegExp[];
  titlePatterns: RegExp[];
}

export interface PlanAvailabilityEvent {
  tabId: number;
  timestamp: number;
  planName: string;
  buttonSelector: string;
  buttonText: string;
}

// Keep payment indicators but exclude overly broad patterns
export const DEFAULT_PAYMENT_INDICATORS: PaymentIndicators = {
  urlPatterns: [
    /\/checkout/i,
    /\/payment/i,
    /\/purchase/i,
    /\/billing/i,
    /\/pay\/order/i,
    /\/pay\/alipay/i,
    /\/pay\/wechat/i,
    /alipay\.com/i,
    /wxpay\.com/i,
    /trade/i,
    /order.*confirm/i,
    /confirm.*pay/i,
  ],
  selectors: [
    '[data-testid="payment-form"]',
    '[data-testid="checkout"]',
    '.payment-methods',
    '#payment-form',
    '.checkout-container',
    '[class*="payment-method"]',
    '[class*="checkout-form"]',
    '[class*="order-confirm"]',
    '[id*="alipay-qrcode"]',
    '[id*="wechat-qrcode"]',
    '[class*="alipay-qr"]',
    '[class*="wechat-qr"]',
    'input[name*="card-number"]',
    'input[name*="cvv"]',
  ],
  textPatterns: [
    /确认.*支付/i,
    /完成.*付款/i,
    /订单.*确认/i,
    /选择.*支付方式/i,
    /支付.*金额/i,
    /order\s*summary/i,
    /confirm\s*purchase/i,
    /select.*payment/i,
    /payment.*method/i,
    /checkout.*total/i,
    /扫描.*支付/i,
    /支付宝.*扫/i,
    /微信.*支付/i,
  ],
  titlePatterns: [
    /确认.*支付/i,
    /订单.*确认/i,
    /checkout/i,
    /payment/i,
    /billing/i,
  ]
};

const DEFAULT_SOLD_OUT_INDICATORS = [
  '暂时售罄',
  'sold out',
  '售罄',
  'is-disabled',
  'disabled'
];

export const DEFAULT_PLAN_TIERS: Record<PlanTier, PlanTierConfig> = {
  lite: {
    name: 'Lite',
    selectors: [
      '.package-card:has(.package-card-title .font-prompt:text-is("Lite")) .buy-btn',
      '.package-card-box:has-text("Lite") .buy-btn',
      '.package-card-title >> text=Lite >> .. >> .. .buy-btn',
    ],
  },
  pro: {
    name: 'Pro',
    selectors: [
      '.package-card:has(.package-card-title .font-prompt:text-is("Pro")) .buy-btn',
      '.package-card-box:has-text("Pro") .buy-btn',
      '.package-card-title >> text=Pro >> .. >> .. .buy-btn',
    ],
  },
  max: {
    name: 'Max',
    selectors: [
      '.package-card:has(.package-card-title .font-prompt:text-is("Max")) .buy-btn',
      '.package-card-box:has-text("Max") .buy-btn',
      '.package-card-title >> text=Max >> .. >> .. .buy-btn',
    ],
  },
};

export interface SuccessEvent {
  tabId: number;
  timestamp: number;
  url: string;
  indicators: string[];
}
