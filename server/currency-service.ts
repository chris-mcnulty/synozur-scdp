import { storage } from "./storage";
import { getExchangeRate } from "./exchange-rates";

/**
 * Lock (or manually set) the exchange rate on an estimate.
 * Returns the updated estimate.
 */
export async function lockEstimateRate(
  estimateId: string,
  manualRate?: number | null,
): Promise<ReturnType<typeof storage.updateEstimate>> {
  const estimate = await storage.getEstimate(estimateId);
  if (!estimate) throw new Error("Estimate not found");

  let exchangeRate: number;

  if (manualRate !== undefined && manualRate !== null) {
    const parsed = Number(manualRate);
    if (!isFinite(parsed) || parsed <= 0) {
      throw new Error("Exchange rate must be a positive finite number");
    }
    exchangeRate = parsed;
  } else if ((estimate.quoteCurrency || "USD") === (estimate.costCurrency || "USD")) {
    exchangeRate = 1;
  } else {
    exchangeRate = await getExchangeRate(
      estimate.quoteCurrency || "USD",
      estimate.costCurrency || "USD",
    );
    if (!isFinite(exchangeRate) || exchangeRate <= 0) {
      throw new Error(`Could not fetch a valid live rate for ${estimate.quoteCurrency} → ${estimate.costCurrency}`);
    }
  }

  const source = manualRate !== undefined && manualRate !== null ? "manual" : "locked";
  return storage.updateEstimate(estimateId, {
    exchangeRate: String(exchangeRate),
    exchangeRateLockedAt: new Date(),
    exchangeRateSource: source,
  });
}

/**
 * Refresh an estimate's exchange rate to the current live market rate and clear the lock.
 * Returns the updated estimate.
 */
export async function refreshEstimateRate(
  estimateId: string,
): Promise<ReturnType<typeof storage.updateEstimate>> {
  const estimate = await storage.getEstimate(estimateId);
  if (!estimate) throw new Error("Estimate not found");

  const quoteCurrency = estimate.quoteCurrency || "USD";
  const costCurrency = estimate.costCurrency || "USD";

  let newRate: number;
  if (quoteCurrency === costCurrency) {
    newRate = 1;
  } else {
    newRate = await getExchangeRate(quoteCurrency, costCurrency);
    if (!isFinite(newRate) || newRate <= 0) {
      throw new Error(`Could not fetch a valid live rate for ${quoteCurrency} → ${costCurrency}`);
    }
  }

  return storage.updateEstimate(estimateId, {
    exchangeRate: String(newRate),
    exchangeRateLockedAt: null,
    exchangeRateSource: "live",
  });
}

/**
 * Convert an amount from quoteCurrency to costCurrency using the stored exchange rate.
 * If no rate is stored, falls back to a live rate fetch.
 */
export async function convertAmount(
  amount: number,
  estimateId: string,
): Promise<{ converted: number; rate: number; source: string }> {
  const estimate = await storage.getEstimate(estimateId);
  if (!estimate) throw new Error("Estimate not found");

  const quoteCurrency = estimate.quoteCurrency || "USD";
  const costCurrency = estimate.costCurrency || "USD";

  if (quoteCurrency === costCurrency) {
    return { converted: amount, rate: 1, source: "same-currency" };
  }

  let rate: number;
  let source: string;

  if (estimate.exchangeRate) {
    rate = Number(estimate.exchangeRate);
    source = estimate.exchangeRateSource || "stored";
  } else {
    rate = await getExchangeRate(quoteCurrency, costCurrency);
    source = "live";
  }

  return { converted: amount * rate, rate, source };
}

/**
 * Fetch the current live exchange rate between two currencies.
 */
export { getExchangeRate as getCurrentRate };
