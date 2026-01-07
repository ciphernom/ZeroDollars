// js/utils/index.js
// Utility Functions (Pure, stateless)
export const Utils = {
  /**
   * Generates a cryptographically secure UUID.
   * @returns {string} UUID v4.
   */
  generateId() {
    return crypto.randomUUID();
  },
    /**
   * HEX/BYTE UTILITIES (Required for Crypto/Nostr)
   */
  hexToBytes(hex) {
    if (!hex) return new Uint8Array(0);
    if (typeof hex !== 'string') return hex; // Pass through if already bytes
    const match = hex.match(/.{1,2}/g);
    return match ? new Uint8Array(match.map(b => parseInt(b, 16))) : new Uint8Array(0);
  },

  bytesToHex(bytes) {
    if (!bytes) return '';
    if (typeof bytes === 'string') return bytes; // Pass through if already hex
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  },

  /**
   * Parses input string to cents (handles decimals, negatives).
   * @param {string|number} value - Input value.
   * @returns {number} Amount in cents.
   */
  parseToCents(value) {
    if (typeof value === 'number') return Math.round(value * 100);
    const trimmed = (value || '').toString().trim();
    if (!trimmed) return 0;
    const parts = trimmed.split('.');
    let dollars = parseInt(parts[0].replace(/[^\d-]/g, ''), 10) || 0;
    let cents = 0;
    if (parts[1]) {
      cents = parseInt(parts[1].replace(/[^\d]/g, '').padEnd(2, '0').slice(0, 2), 10) || 0;
    }
    const isNegative = dollars < 0 || trimmed.startsWith('-');
    const absDollars = Math.abs(dollars);
    return isNegative ? -(absDollars * 100 + cents) : (absDollars * 100 + cents);
  },
  /**
   * Formats cents to currency string.
   * @param {number} cents - Amount in cents.
   * @returns {string} Formatted currency (e.g., "$1,234.56").
   */
  formatCurrency(cents) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents || 0) / 100);
  },
/**
   * Formats date to readable string.
   * @param {Date|string|number} dateInput - Date input.
   * @returns {string} Formatted date.
   */
  formatDate(dateInput) {
    if (!dateInput) return 'No Date';
    const date = new Date(dateInput);
    // Safety check: if the date is invalid (NaN), return a placeholder instead of crashing
    if (isNaN(date.getTime())) {
        return 'Invalid Date'; 
    }
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric'
    }).format(date);
  },
  /**
   * Tokenizes text for ML (lowercase, no punctuation).
   * @param {string} text - Input text.
   * @returns {string[]} Tokens.
   */
  tokenize(text) {
    return (text || '').toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(t => t.length > 0);
  },
  /**
   * Debounces a function call.
   * @param {Function} func - Function to debounce.
   * @param {number} timeout - Delay in ms.
   * @returns {Function} Debounced function.
   */
  debounce(func, timeout = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => func.apply(this, args), timeout);
    };
  },
  /**
   * Creates DOM element safely (XSS-proof via textContent and event listeners).
   * @param {string} tag - Tag name.
   * @param {Object} props - Properties (className, textContent, onclick, dataset, style).
   * @param {HTMLElement[]} children - Child elements.
   * @returns {HTMLElement} Created element.
   */
  createElement(tag, props = {}, children = []) {
    const el = document.createElement(tag);
Object.entries(props).forEach(([key, value]) => {
      if (key === 'onclick' && typeof value === 'function') {
        el.addEventListener('click', value);
      } else if (key === 'dataset' && typeof value === 'object') {
        Object.entries(value).forEach(([dataKey, dataVal]) => {
          el.dataset[dataKey] = String(dataVal);
        });
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(el.style, value);
      } else if (key === 'textContent' || key === 'className' || key === 'id' || key === 'value' || key === 'innerHTML') {
        // Safelist of properties to set directly
        el[key] = value;
      } else if (key === 'href' || key === 'src' || key === 'type' || key === 'placeholder' || key === 'aria-label') {
        // Safelist of attributes to set
        el.setAttribute(key, value);
      }
      // Any other properties (like innerHTML) are ignored
    });
    children.filter(child => child instanceof HTMLElement).forEach(child => el.appendChild(child));
    return el;
  }, 
 
/**
   * Parses a CSV file safely handling quoted fields with commas.
   * @param {File} file - The file from an <input>
   * @returns {Promise<Object[]>}
   */
  parseCSV(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
                if (lines.length < 2) throw new Error('CSV must have at least a header and one data row.');
                
                // Regex to split by comma ONLY if not inside quotes
                const splitRegex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
                
                // Helper to clean quotes: "value" -> value, and "" -> "
                const clean = (val) => val ? val.trim().replace(/^"|"$/g, '').replace(/""/g, '"') : '';

                const headers = lines[0].split(splitRegex).map(h => clean(h));
                const data = [];
                
                for (let i = 1; i < lines.length; i++) {
                    const values = lines[i].split(splitRegex).map(v => clean(v));
                    // Skip empty rows or rows with mismatched columns
                    if (values.length !== headers.length) continue;

                    const obj = {};
                    headers.forEach((header, index) => {
                        obj[header] = values[index];
                    });
                    data.push(obj);
                }
                resolve({headers, data});
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsText(file);
    });
  },
  /**
   * Tries to parse various common date formats (YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY).
   * @param {string} dateString - The date string from the CSV.
   * @returns {Date | null} A valid Date object or null.
   */
  parseDate(dateString) {
    if (!dateString) return null;
    // 1. Try native parser first (handles YYYY-MM-DD and MM/DD/YYYY)
    // Note: This can be risky, as '01/02/2025' is ambiguous (Jan 2 or Feb 1).
    // The native parser will *assume* MM/DD/YYYY.
    let d = new Date(dateString);
    if (!isNaN(d.getTime())) {
      return d;
    }
    // 2. Define regex for common formats
    const dd_mm_yyyy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/; // DD/MM/YYYY or DD-MM-YYYY
    const yyyy_mm_dd = /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/; // YYYY/MM/DD or YYYY-MM-DD
    let match;
    // 3. Try DD/MM/YYYY (Common non-US format)
    match = dateString.match(dd_mm_yyyy);
    if (match) {
        // Rearrange to YYYY-MM-DD for an unambiguous parse
        const isoString = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
        d = new Date(isoString);
        if (!isNaN(d.getTime())) return d;
    }
   
    // 4. Try YYYY/MM/DD (Another common format)
    match = dateString.match(yyyy_mm_dd);
    if (match) {
        // Already in a safe-ish order, just needs dashes
        const isoString = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
        d = new Date(isoString);
        if (!isNaN(d.getTime())) return d;
    }
    // 5. If all else fails, return null
    console.warn(`Could not parse date: ${dateString}`);
    return null;
  },
  /**
   * Deterministic JSON stringify (Sorts keys)
   * Fixes critical bug where different browsers hash objects differently.
   * @param {any} data 
   */
  canonicalize(data) {
    if (data === null || typeof data !== 'object') {
        return data;
    }
    if (Array.isArray(data)) {
        return data.map(item => Utils.canonicalize(item));
    }
    return Object.keys(data).sort().reduce((acc, key) => {
        acc[key] = Utils.canonicalize(data[key]);
        return acc;
    }, {});
  }
 
};
