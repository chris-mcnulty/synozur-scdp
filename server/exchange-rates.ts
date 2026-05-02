declare module 'node-fetch';
import fetch from 'node-fetch';
import { getCached, setCached, invalidate } from './lib/cache';

interface ExchangeRatesResponse {
  disclaimer: string;
  license: string;
  timestamp: number;
  base: string;
  rates: Record<string, number>;
}

const CACHE_KEY = 'exchange_rates:latest';
const LAST_GOOD_KEY = 'exchange_rates:last_good';
const TTL_RATES = 60 * 60 * 1000;
const TTL_LAST_GOOD = 7 * 24 * 60 * 60 * 1000;

export async function getExchangeRates(): Promise<Record<string, number>> {
  const appId = process.env.OPEN_EXCHANGE_RATES_APP_ID;

  if (!appId) {
    console.warn('[EXCHANGE] Open Exchange Rates API key not configured, using fallback rates');
    return getFallbackRates();
  }

  const cached = await getCached(CACHE_KEY, TTL_RATES, async () => {
    try {
      const response = await fetch(
        `https://openexchangerates.org/api/latest.json?app_id=${appId}`,
        { timeout: 10000 }
      );

      if (!response.ok) {
        console.error('[EXCHANGE] API error:', response.status, response.statusText);
        return null;
      }

      const data = await response.json() as ExchangeRatesResponse;
      console.log('[EXCHANGE] Fetched fresh exchange rates, base:', data.base);
      return data.rates;
    } catch (error) {
      console.error('[EXCHANGE] Failed to fetch rates:', error);
      return null;
    }
  });

  if (cached !== null) {
    // Refresh the long-lived fallback on every successful fetch so it stays current.
    setCached(LAST_GOOD_KEY, TTL_LAST_GOOD, cached as Record<string, number>);
    return cached as Record<string, number>;
  }

  // Fetch failed — evict the null entry so next call retries the API
  invalidate(CACHE_KEY);

  // Serve last-known-good rates if available, otherwise built-in fallback
  const lastGood = await getCached(LAST_GOOD_KEY, TTL_LAST_GOOD, async () => null);
  if (lastGood !== null) {
    console.warn('[EXCHANGE] API unavailable, serving last-known-good rates');
    return lastGood as Record<string, number>;
  }

  console.warn('[EXCHANGE] No cached rates available, using built-in fallback rates');
  return getFallbackRates();
}

export function invalidateExchangeRates(): void {
  invalidate(CACHE_KEY);
}

function getFallbackRates(): Record<string, number> {
  return {
    USD: 1,
    CAD: 1.36,
    EUR: 0.92,
    GBP: 0.79
  };
}

export async function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<{ convertedAmount: number; exchangeRate: number }> {
  if (fromCurrency === toCurrency) {
    return { convertedAmount: amount, exchangeRate: 1 };
  }

  const rates = await getExchangeRates();

  const fromRate = rates[fromCurrency.toUpperCase()];
  const toRate = rates[toCurrency.toUpperCase()];

  if (!fromRate || !toRate) {
    console.warn(`[EXCHANGE] Unknown currency: ${fromCurrency} or ${toCurrency}, returning original amount`);
    return { convertedAmount: amount, exchangeRate: 1 };
  }

  const amountInUSD = amount / fromRate;
  const convertedAmount = amountInUSD * toRate;
  const exchangeRate = toRate / fromRate;

  return {
    convertedAmount: Math.round(convertedAmount * 100) / 100,
    exchangeRate: Math.round(exchangeRate * 10000) / 10000
  };
}

export async function getExchangeRate(
  fromCurrency: string,
  toCurrency: string
): Promise<number> {
  if (fromCurrency === toCurrency) {
    return 1;
  }

  const rates = await getExchangeRates();
  const fromRate = rates[fromCurrency.toUpperCase()] || 1;
  const toRate = rates[toCurrency.toUpperCase()] || 1;

  return Math.round((toRate / fromRate) * 10000) / 10000;
}
