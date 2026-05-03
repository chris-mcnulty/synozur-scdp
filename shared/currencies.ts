export const SUPPORTED_CURRENCIES = [
  "USD","CAD","EUR","GBP","AUD","NZD","CHF","JPY","MXN","BRL",
  "INR","SGD","HKD","SEK","NOK","DKK","ZAR","AED","THB","PHP",
  "IDR","MYR","VND","KRW","TWD","PLN","HUF","CZK","ILS","TRY",
  "SAR","QAR","KWD","OMR","BHD","JOD","EGP","NGN","KES","GHS",
  "XAF","XOF",
] as const;

export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

export const VALID_CURRENCY_SET = new Set<string>(SUPPORTED_CURRENCIES);

export const DISPLAY_CURRENCIES = [
  "USD","CAD","EUR","GBP","AUD","NZD","CHF","JPY","MXN","BRL",
  "INR","SGD","SEK","NOK","DKK",
] as const;

export type DisplayCurrency = typeof DISPLAY_CURRENCIES[number];
