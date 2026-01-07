// js/data/currencies.js

export const CURRENCIES = {
  // Fiat
  AUD: { symbol: '$', name: 'Australian Dollar', decimals: 2, unit: 100, type: 'fiat' },
  USD: { symbol: '$', name: 'US Dollar', decimals: 2, unit: 100, type: 'fiat' },
  EUR: { symbol: '€', name: 'Euro', decimals: 2, unit: 100, type: 'fiat' },
  GBP: { symbol: '£', name: 'British Pound', decimals: 2, unit: 100, type: 'fiat' },
  JPY: { symbol: '¥', name: 'Japanese Yen', decimals: 0, unit: 1, type: 'fiat' },
  NZD: { symbol: '$', name: 'New Zealand Dollar', decimals: 2, unit: 100, type: 'fiat' },
  CAD: { symbol: '$', name: 'Canadian Dollar', decimals: 2, unit: 100, type: 'fiat' },
  
  // Crypto
  BTC: { symbol: '₿', name: 'Bitcoin', decimals: 8, unit: 100_000_000, type: 'crypto' },
  ETH: { symbol: 'Ξ', name: 'Ethereum', decimals: 8, unit: 100_000_000, type: 'crypto' },
};

export const toSmallestUnit = (amount, currency) => {
  const c = CURRENCIES[currency];
  if (!c) throw new Error(`Unknown currency: ${currency}`);
  return Math.round(amount * c.unit);
};

export const fromSmallestUnit = (amount, currency) => {
  const c = CURRENCIES[currency];
  if (!c) throw new Error(`Unknown currency: ${currency}`);
  return amount / c.unit;
};

export const formatCurrency = (amountInSmallestUnit, currency, opts = {}) => {
  const c = CURRENCIES[currency];
  if (!c) return String(amountInSmallestUnit);
  
  const value = amountInSmallestUnit / c.unit;
  
  if (c.type === 'crypto') {
    const formatted = value.toFixed(opts.precision ?? c.decimals);
    return `${c.symbol}${formatted}`;
  }
  
  return new Intl.NumberFormat(opts.locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: c.decimals,
  }).format(value);
};
