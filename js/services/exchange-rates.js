// js/services/exchange-rates.js

import { CURRENCIES } from '../data/currencies.js';

export class ExchangeRateService {
  constructor(db) {
    this.db = db;
    this.cache = new Map();
    this.CACHE_TTL = 15 * 60 * 1000; // 15 minutes for current rates
  }

  async getCurrentRate(from, to) {
    if (from === to) return 1;
    
    const key = `current_${from}_${to}`;
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.rate;
    }

    const rate = await this._fetchCurrentRate(from, to);
    if (rate) {
      this.cache.set(key, { rate, timestamp: Date.now() });
    }
    return rate;
  }

  async getHistoricalRate(from, to, date) {
    if (from === to) return 1;
    
    const dateStr = new Date(date).toISOString().split('T')[0];
    const key = `${from}_${to}_${dateStr}`;
    
    // Historical rates are immutable - check DB first
    const cached = await this.db.get('exchangeRates', key);
    if (cached) return cached.rate;
    
    const rate = await this._fetchHistoricalRate(from, to, dateStr);
    if (rate) {
      await this.db.put('exchangeRates', { 
        id: key, 
        from, 
        to, 
        date: dateStr, 
        rate, 
        fetchedAt: Date.now() 
      });
    }
    return rate;
  }

  async _fetchCurrentRate(from, to) {
    const isCrypto = (c) => CURRENCIES[c]?.type === 'crypto';
    
    try {
      if (isCrypto(from)) {
        const res = await fetch(`https://api.coinbase.com/v2/prices/${from}-${to}/spot`);
        const data = await res.json();
        return parseFloat(data.data.amount);
      } else if (isCrypto(to)) {
        const res = await fetch(`https://api.coinbase.com/v2/prices/${to}-${from}/spot`);
        const data = await res.json();
        return 1 / parseFloat(data.data.amount);
      } else {
        const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${from}`);
        const data = await res.json();
        return data.rates[to];
      }
    } catch (e) {
      console.error(`Rate fetch failed ${from}->${to}:`, e);
      // Fallback to last known rate
      const fallback = await this.db.get('exchangeRates', `${from}_${to}_latest`);
      return fallback?.rate || null;
    }
  }

  async _fetchHistoricalRate(from, to, dateStr) {
    const isCrypto = (c) => CURRENCIES[c]?.type === 'crypto';
    
    try {
      if (isCrypto(from) || isCrypto(to)) {
        return this._fetchHistoricalCryptoRate(from, to, dateStr);
      } else {
        return this._fetchHistoricalFiatRate(from, to, dateStr);
      }
    } catch (e) {
      console.error(`Historical rate fetch failed:`, e);
      return null;
    }
  }

  async _fetchHistoricalCryptoRate(from, to, dateStr) {
    const cryptoIds = { BTC: 'bitcoin', ETH: 'ethereum' };
    const [year, month, day] = dateStr.split('-');
    const geckoDate = `${day}-${month}-${year}`;
    
    const cryptoCurrency = CURRENCIES[from]?.type === 'crypto' ? from : to;
    const fiatCurrency = CURRENCIES[from]?.type === 'crypto' ? to : from;
    
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${cryptoIds[cryptoCurrency]}/history?date=${geckoDate}`
    );
    const data = await res.json();
    
    const rate = data.market_data?.current_price?.[fiatCurrency.toLowerCase()];
    if (!rate) return null;
    
    // If asked fiat->crypto, invert
    return CURRENCIES[from]?.type === 'crypto' ? rate : 1 / rate;
  }

  async _fetchHistoricalFiatRate(from, to, dateStr) {
    const res = await fetch(
      `https://api.frankfurter.app/${dateStr}?from=${from}&to=${to}`
    );
    const data = await res.json();
    return data.rates?.[to] || null;
  }

  async convert(amount, from, to, date = null) {
    const rate = date 
      ? await this.getHistoricalRate(from, to, date)
      : await this.getCurrentRate(from, to);
    if (!rate) throw new Error(`No rate for ${from}->${to}`);
    return { amount: Math.round(amount * rate), rate };
  }
}
