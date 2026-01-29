declare module 'node-fetch';
import fetch from 'node-fetch';

interface ExchangeRatesResponse {
  disclaimer: string;
  license: string;
  timestamp: number;
  base: string;
  rates: Record<string, number>;
}

interface CachedRates {
  rates: Record<string, number>;
  timestamp: number;
  base: string;
}

const CACHE_DURATION_MS = 60 * 60 * 1000;
let cachedRates: CachedRates | null = null;

export async function getExchangeRates(): Promise<Record<string, number>> {
  const appId = process.env.OPEN_EXCHANGE_RATES_APP_ID;
  
  if (!appId) {
    console.warn('[EXCHANGE] Open Exchange Rates API key not configured, using fallback rates');
    return getFallbackRates();
  }

  if (cachedRates && (Date.now() - cachedRates.timestamp) < CACHE_DURATION_MS) {
    return cachedRates.rates;
  }

  try {
    const response = await fetch(
      `https://openexchangerates.org/api/latest.json?app_id=${appId}`,
      { timeout: 10000 }
    );

    if (!response.ok) {
      console.error('[EXCHANGE] API error:', response.status, response.statusText);
      return cachedRates?.rates || getFallbackRates();
    }

    const data = await response.json() as ExchangeRatesResponse;
    
    cachedRates = {
      rates: data.rates,
      timestamp: Date.now(),
      base: data.base
    };

    console.log('[EXCHANGE] Fetched fresh exchange rates, base:', data.base);
    return data.rates;
  } catch (error) {
    console.error('[EXCHANGE] Failed to fetch rates:', error);
    return cachedRates?.rates || getFallbackRates();
  }
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
