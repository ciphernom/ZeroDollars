import { MathUtils } from '../utils/math-utils.js';

export class MLManager {
    // 1. Initialize as empty
  static KEYWORD_RULES = {};
  static STOP_WORDS = new Set([
    // --- Expanded Articles, Prepositions & Conjunctions (English + Multi-lingual basics) ---
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
    'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were',
    'will', 'with', 'or', 'if', 'then', 'not', 'she', 'they', 'them', 'their',
    'this', 'these', 'those', 'about', 'above', 'after', 'below', 'been',
    'doing', 'down', 'during', 'each', 'few', 'further', 'had', 'having',
    'here', 'how', 'into', 'more', 'most', 'my', 'myself', 'no', 'nor', 'now',
    'only', 'other', 'our', 'ours', 'out', 'over', 'own', 'same', 'so', 'some',
    'such', 'than', 'through', 'under', 'until', 'up', 'very', 'what', 'when',
    'where', 'which', 'while', 'who', 'whom', 'why', 'your', 'yours',
    // French/Spanish basics (for international txns)
    'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'ou', 'mais',
    'el', 'la', 'los', 'las', 'de', 'y', 'o',
    // --- Massively Expanded Banking, Transaction & Payment Terms (Global) ---
    'account', 'payment', 'transfer', 'debit', 'credit', 'online', 'banking',
    'fee', 'charge', 'interest', 'purchase', 'receipt', 'ref', 'reference',
    'transaction', 'direct', 'eftpos', 'withdrawal', 'atm', 'int', 'statement',
    'card', 'pay', 'paid', 'deposit', 'web', 'www', 'http', 'https', 'com',
    'net', 'org', 'biz', 'info', 'app', 'annual', 'monthly', 'daily', 'weekly',
    'balance', 'auth', 'authorisation', 'authorization', 'pending', 'processed',
    'cleared', 'invoice', 'order', 'ord', 'txn', 'pos', 'qkr', 'vpos', 'cardless',
    'cash', 'cashout', 'bpay', 'billpay', 'paypass', 'contactless', 'nfc',
    'dd', 'dr', 'cr', 'eft', 'swift', 'iban', 'bic', 'reversal', 'refund',
    'adj', 'adjustment', 'misc', 'miscellaneous', 'osko', 'npp', 'ach', 'sepa',
    'faster payments', 'wire', 'foreign', 'currency', 'amount', 'fcy', 'fgn',
    'eur', 'usd', 'gbp', 'cad', 'aud', 'jpy', 'nzd', 'chf', 'cny', 'inr',
    'instalment', 'repayment', 'salary', 'payroll', 'deposit', 'benefit',
    'salary', 'wage', 'income', 'earnings', 'remittance', 'pension', 'super',
    'dividend', 'interest', 'royalty', 'rental income', 'freelance',
    // --- Expanded Payment Processors & Networks (Global + New) ---
    'visa', 'mastercard', 'mc', 'amex', 'express', 'diners', 'discover',
    'paypal', 'pp', 'afterpay', 'zip', 'zpp', 'klarna', 'humm', 'latitude',
    'affirm', 'paybright', 'sezzle', 'splitit', 'laybuy', 'oxford',
    'sq', 'square', 'sp', 'stripe', 'ezy', 'ezypay', 'eway', 'securepay',
    'braintree', 'adyen', 'worldpay', 'apple', 'google', 'samsung', 'gpay',
    'amazon pay', 'venmo', 'zelle', 'cash app', 'wise', 'revolut', 'n26',
    'monzo', 'starling', 'chime', 'current', 'varomoney',
    // --- Expanded Bank-Specific Artifacts (AU, US, UK, Global) ---
    'orange everyday', 'savings maximiser', 'chase', 'cba', 'nab', 'anz', 'wbc',
    'bank of america', 'boa', 'wells fargo', 'hsbc', 'barclays', 'lloyds',
    'rbc', 'td', 'bmo', 'scotiabank', 'commbank', 'commonwealth bank',
    'capital one', 'discover', 'us bank', 'pnc', 'citibank', 'citi',
    'natwest', 'rbs', 'barclays', 'hsbc uk', 'lloyds bank', 'halifax',
    'msbill.info', 'help.uber.com', 'zip.co/au', 'x.ai/about', 'amazon.com/bill',
    'ebay.com', 'paypal.com', 'netflix.com', 'spotify.com',
    // --- Expanded Business Suffixes & Legal Terms (Global + More) ---
    'pty', 'ltd', 'inc', 'corp', 'llc', 'co', 'group', 'services', 'holdings',
    'associates', 'ent', 'enterprise', 'enterprises', 'company', 'and co',
    '& co', 'p/l', 'limited', 'incorporated', 'australia', 'australian', 'usa',
    'trading', 'as', 't/a', 'business', 'international', 'global', 'p.c.',
    'gmbh', 'ag', 'sarl', 'sa', 'bv', 'nv', 'plc', 'llp', 'gmbh & co',
    'stores', 'sales', 'n', 'pl', 'b', 'wo', 'soul', 'kft', 's.p.a.', 'sas',
    'ltda', 's.a.', 'c.v.', 'b.v.b.a.',
    // --- Expanded Generic Descriptors & Categories ---
    'store', 'shop', 'goods', 'service', 'general', 'merchant', 'merchandise',
    'retail', 'solutions', 'systems', 'products', 'management',
    'auto', 'automotive', 'car', 'care', 'health', 'medical', 'food', 'foods',
    'drinks', 'beverages', 'liquor', 'coffee', 'cafe', 'restaurant', 'bar',
    'pub', 'hotel', 'motel', 'pharmacy', 'chemist', 'market', 'place',
    'super', 'supermarket', 'convenience', 'local', 'grocer', 'pastrie',
    'internet', 'bill', 'rego', 'vending', 'gas', 'electric', 'water',
    'insurance', 'loan', 'mortgage', 'rent', 'housing', 'travel', 'holiday',
    'entertainment', 'leisure', 'sports', 'education', 'school', 'uni',
    'charity', 'donation', 'gift', 'flowers', 'gym', 'fitness', 'spa',
    'vet', 'pet', 'baby', 'child', 'kids',
    // --- Expanded Location & Address Terms (Global + More Cities/States) ---
    'au', 'aus', 'nsw', 'vic', 'qld', 'wa', 'sa', 'tas', 'nt', 'act',
    'sydney', 'melbourne', 'brisbane', 'perth', 'adelaide', 'hobart', 'darwin',
    'canberra', 'syd', 'mel', 'bne', 'per', 'adl', 'cbr', 'hba', 'drw',
    'surfers para', 'surfers', 'paradise', 'oxenford', 'mentone', 'main beach',
    'banyo', 'kippa-ring', 'kippa', 'north lakes', 'scarborough', 'deception ba',
    'dakabin', 'barangaroo', 'clontarf', 'burpengary', 'cooroy', 'eudlo',
    'caboolture', 'geneva', 'rothwell', 'woodford', 'margate', 'newstead',
    'mooloolaba', 'morayfield', 'lawnton', 'kedron', 'chermside', 'shorncliffe',
    'us', 'usa', 'ca', 'ny', 'tx', 'fl', 'il', 'pa', 'oh', 'ga', 'nc', 'mi',
    'gb', 'uk', 'eng', 'sco', 'wal', 'nir', 'london', 'manchester', 'birmingham',
    'ca', 'can', 'on', 'qc', 'bc', 'ab', 'mb', 'sk', 'toronto', 'montreal', 'vancouver',
    'nz', 'auckland', 'wellington', 'de', 'fr', 'es', 'it', 'nl', 'jp',
    'street', 'st', 'road', 'rd', 'ave', 'avenue', 'cres', 'crescent',
    'pl', 'place', 'ln', 'lane', 'dr', 'drive', 'pde', 'parade', 'ct', 'court',
    'ctr', 'centre', 'center', 'plaza', 'arcade', 'corner', 'unit', 'level', 'lvl',
    'north', 'south', 'east', 'west', 'n', 's', 'e', 'w', 'central', 'city', 'cbd',
    'airport', 'station', 'dfo', 'outlet', 'fair', 'wharf',
    'canberra', 'syd', 'mel', 'bne', 'per', 'adl', 'cbr', 'hba', 'drw',
    'gb', 'uk', 'eng', 'sco', 'wal', 'nir', 'london', 'manchester', 'birmingham',
    'los angeles', 'new york', 'chicago', 'houston', 'phoenix', 'philadelphia', 'san antonio', 'san diego', 'dallas', 'san jose',
    'leeds', 'glasgow', 'liverpool', 'newcastle', 'sheffield', 'bristol', 'edinburgh', 'leicester', 'coventry', 'brighton',
    'airport', 'station', 'dfo', 'outlet', 'fair', 'mall', 'centre', 'harbour',
  
    // --- Expanded Days, Months & Time ---
    'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
    'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
    'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'monday', 'tuesday',
    'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'pm', 'am',
    'midnight', 'noon', 'morning', 'afternoon', 'evening', 'night'
  ]);
/**
   * Tokenizes text into words and bigrams, filtering stop words.
   * e.g., "Uber Eats" -> ["uber", "eats", "uber_eats"]
   * @param {string} text - Input text.
   * @returns {string[]} An array of token features.
   */
  static tokenizeWithNgrams(text) {
    if (!text) return [];
   
    // 1. Get all words, filter stop words
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !MLManager.STOP_WORDS.has(word));
    // 2. Create bigrams (e.g., "uber_eats")
    const bigrams = words.length > 0 ?
      words.slice(0, -1).map((w, i) => `${w}_${words[i + 1]}`) : [];
   
    // 3. Combine single words and bigrams into one feature list
    return [...words, ...bigrams];
  }
  // ------------------------------------------------------------------
  // LAYER 1: STATIC KEYWORD RULES 
  // ------------------------------------------------------------------
  // Keywords extracted and aggregated from global sources: Wikipedia lists, Statista, NRF Top 100, QSR Magazine, etc.
  // Covers major chains in AU, US, UK, EU, Asia, Latin America, etc. ~200-500 per category for comprehensive coverage.
  static async loadRules() {
    try {
      const response = await fetch('./data/keywords.json');
      if (!response.ok) throw new Error('Failed to load keywords');
      this.KEYWORD_RULES = await response.json();
      console.log('✅ ML Keywords loaded');
    } catch (err) {
      console.error('Could not load ML rules:', err);
      // Optional: Fallback to a minimal set if fetch fails
      this.KEYWORD_RULES = {}; 
    }
  }
 
 
  // Improved normalization for payees: extracts meaningful tokens (lowercase, no numbers/punct, filter short/stop words)
  static normalizePayee(payee) {
    if (!payee) return [];
    return payee
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Keep letters, spaces; remove punct
      .replace(/\d+/g, '') // Remove numbers
      .trim()
      .split(/\s+/) // Split on whitespace
      .filter(word => word.length > 2 && !MLManager.STOP_WORDS.has(word));
  }
  // Simple Union-Find for clustering (disjoint sets)
  static UnionFind = class {
    constructor(size) {
      this.parent = Array.from({length: size}, (_, i) => i);
      this.rank = new Array(size).fill(0);
    }
    find(x) {
      if (this.parent[x] !== x) {
        this.parent[x] = this.find(this.parent[x]);
      }
      return this.parent[x];
    }
    union(x, y) {
      let px = this.find(x), py = this.find(y);
      if (px === py) return;
      if (this.rank[px] < this.rank[py]) [px, py] = [py, px];
      this.parent[py] = px;
      if (this.rank[px] === this.rank[py]) this.rank[px]++;
    }
  };
/**
   * Layer 1: Tries to find a Jar ID by matching payee to static keywords using Regex.
   * @param {string} payee - The messy payee string (e.g., "LIQUORLAND 6537...")
   * @param {Envelope[]} envelopes - An array of all user envelopes
   * @returns {string | null} The ID of the matching envelope, or null
   */
  static getJarIdFromKeywords(payee, envelopes) {
    if (!payee) return null;
  
    for (const [jarName, keywords] of Object.entries(this.KEYWORD_RULES)) {
      // Case-insensitive match for envelope name (improved robustness)
      const targetEnvelope = envelopes.find(env => env.name.toUpperCase() === jarName.toUpperCase());
    
      if (targetEnvelope) {
        for (const keyword of keywords) {
          // Create a Regex to match the keyword as a "whole word" (case-insensitive)
          // "COLES" becomes /\bCOLES\b/i
          // This prevents "COLESONLINE" from matching "COLE"
          const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'); // Escape special regex chars
        
          if (regex.test(payee)) {
            return targetEnvelope.id; // Found a match!
          }
        }
      }
    }
    return null; // No static keyword match found
  }
  // ------------------------------------------------------------------
  // LAYER 2: LEARNED HABITS (IMPROVED NAIVE BAYES)
  // ------------------------------------------------------------------
  // Now tokenizes both payee and note for richer features
static trainNaiveBayes(envelopes) {
    const vocab = new Set();
    const classCounts = {};
    const wordCounts = {};

    envelopes.forEach(env => {
        classCounts[env.id] = 0;

        // --- PART A: Seed with Static Keywords (The "Base Knowledge") ---
        // Find matching category key (e.g., jar "Groceries" matches rule "GROCERIES")
        const ruleKey = Object.keys(this.KEYWORD_RULES).find(k =>
            k.toUpperCase() === env.name.toUpperCase()
        );

        if (ruleKey) {
            const keywords = this.KEYWORD_RULES[ruleKey];
            keywords.forEach(keyword => {
                // Treat every keyword as a learned "transaction"
                classCounts[env.id]++;
                
                MLManager.tokenizeWithNgrams(keyword).forEach(token => {
                    vocab.add(token);
                    if (!wordCounts[token]) wordCounts[token] = {};
                    wordCounts[token][env.id] = (wordCounts[token][env.id] || 0) + 1;
                });
            });
        }

        // --- PART B: Train on Real History (The "User Habits") ---
        env.transactions.forEach(tx => {
            const text = (tx.payee || '') + ' ' + (tx.note || ''); 
            if (text.trim()) {
                classCounts[env.id]++;
                MLManager.tokenizeWithNgrams(text).forEach(token => { 
                    vocab.add(token);
                    if (!wordCounts[token]) wordCounts[token] = {};
                    wordCounts[token][env.id] = (wordCounts[token][env.id] || 0) + 1;
                });
            }
        });
    });

    const totalClasses = Object.values(classCounts).reduce((sum, count) => sum + count, 0);
    if (totalClasses === 0) return null;

    const model = {
        vocab: Array.from(vocab),
        priors: {},
        likelihoods: {},
        classCounts
    };
    Object.entries(classCounts).forEach(([id, count]) => {
      model.priors[id] = count / totalClasses;
    });
    model.vocab.forEach(word => {
      model.likelihoods[word] = {};
      Object.keys(classCounts).forEach(id => {
        const classWord = wordCounts[word]?.[id] || 0;
        const classTotal = classCounts[id];
        model.likelihoods[word][id] = (classWord + 1) / (classTotal + model.vocab.length); // Laplace smoothing
      });
    });
    return model;
  }
  static predictJar(text, model, envelopeIds) {
    if (!model || envelopeIds.length === 0) return null;
    const tokens = MLManager.tokenizeWithNgrams(text); // Use NEW n-gram tokenizer
    if (tokens.length === 0) return null;
    let maxProb = -Infinity;
    let best = null;
    let bestScore = 0;
    envelopeIds.forEach(id => {
      let prob = Math.log(model.priors[id] || 1e-9);
      tokens.forEach(token => prob += Math.log(model.likelihoods[token]?.[id] || 1e-9));
      const score = Math.exp(prob); // Convert back to probability for confidence
      if (prob > maxProb) {
        maxProb = prob;
        best = id;
        bestScore = score;
      }
    });
    // Return null if confidence too low (e.g., < 0.1)
    return bestScore > 0.1 ? best : null;
  }
  // ------------------------------------------------------------------
  // LAYER 3: IMPROVED HABIT CLUSTERING (HYBRID + JACCARD-BASED)
  // ------------------------------------------------------------------
  // - Exact payee grouping first (handles duplicates accurately)
  // - Jaccard similarity on tokens for fuzzy clustering of singles (semantic overlap)
  // - Union-Find for disjoint clusters (no overlaps)
  // - Dynamic cluster naming via most frequent shared token
  // - Higher accuracy: catches similar payees like "TELSTRA MOBILE" + "TELSTRA BILL"
  /**
   * Layer 3: Main clustering function
   * PASS 1: Rule-Based Clustering (escaped regex)
   * PASS 2: Exact Payee Grouping + Jaccard Fuzzy Clustering for remaining
   */
  static clusterUncategorized(uncategorizedTxs) {
    const minClusterSize = 2; // Only cluster 2 or more
    if (uncategorizedTxs.length < minClusterSize) return [];
    const clusters = new Map(); // Map<string, {name: string, txs: []}>
    const remainingTxs = []; // Txs that don't match any rules
    // --- PASS 1: Rule-Based Clustering (improved regex escaping) ---
    for (const tx of uncategorizedTxs) {
        let foundCluster = false;
        for (const [categoryName, keywords] of Object.entries(this.KEYWORD_RULES)) {
            for (const keyword of keywords) {
                const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
              
                if (regex.test(tx.payee)) {
                    // Found a match! Group it by its category.
                    if (!clusters.has(categoryName)) {
                        clusters.set(categoryName, { name: categoryName, txs: [] });
                    }
                    clusters.get(categoryName).txs.push(tx);
                    foundCluster = true;
                    break; // Stop checking keywords for this rule
                }
            }
            if (foundCluster) break; // Stop checking rules for this tx
        }
      
        if (!foundCluster) {
            remainingTxs.push(tx); // No rule matched, save for Pass 2
        }
    }
    // --- PASS 2: IMPROVED FREQUENCY + JACCARD CLUSTERING ---
    if (remainingTxs.length >= minClusterSize) {
      // Step 2.1: Group by exact cleaned payee (handles duplicates like "COLES 123" -> "COLES")
      const payeeGroups = new Map();
      for (const tx of remainingTxs) {
        // Clean key: upper, remove punct/numbers, normalize spaces
        const cleanKey = tx.payee
          .toUpperCase()
          .replace(/[^\w\s]/g, ' ')
          .replace(/\d+/g, '')
          .trim()
          .replace(/\s{2,}/g, ' ');
        if (!payeeGroups.has(cleanKey)) {
          payeeGroups.set(cleanKey, { name: cleanKey, txs: [], count: 0 });
        }
        payeeGroups.get(cleanKey).txs.push(tx);
        payeeGroups.get(cleanKey).count++;
      }
      // Add multi-occurrence groups as clusters
      const multiGroups = Array.from(payeeGroups.values()).filter(g => g.count >= minClusterSize);
      multiGroups.forEach(g => {
        const clusterName = g.name.split(' ').find(w => w.length > 2) || g.name; // Simple name: first meaningful word
        clusters.set(clusterName, { name: clusterName, txs: g.txs });
      });
      // Step 2.2: Fuzzy cluster singles using Jaccard on tokens
      const singleGroups = Array.from(payeeGroups.values()).filter(g => g.count === 1);
      if (singleGroups.length >= 2) {
        const groupTokens = singleGroups.map(g => MLManager.tokenizeWithNgrams(g.name));
        const n = singleGroups.length;
        const uf = new this.UnionFind(n);
        const threshold = 0.3; // Jaccard threshold: 30% overlap (tunable; higher = stricter)
        // Compute pairwise Jaccard
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const setA = new Set(groupTokens[i]);
            const setB = new Set(groupTokens[j]);
            const intersection = new Set([...setA].filter(x => setB.has(x))).size;
            const unionSize = new Set([...setA, ...setB]).size;
            const jaccard = unionSize > 0 ? intersection / unionSize : 0;
            if (jaccard > threshold) {
              uf.union(i, j);
            }
          }
        }
        // Group by connected components
        const rootToComponent = new Map();
        for (let i = 0; i < n; i++) {
          const root = uf.find(i);
          if (!rootToComponent.has(root)) rootToComponent.set(root, []);
          rootToComponent.get(root).push(singleGroups[i]);
        }
        // Create clusters from components with size >= minClusterSize
        for (const [root, compGroups] of rootToComponent) {
          if (compGroups.length >= minClusterSize) {
            const allTxs = compGroups.flatMap(g => g.txs);
            // Dynamic name: most frequent token across component
            const allWords = new Map();
            compGroups.forEach(g => {
              // Re-tokenize here. It's cleaner and fixes a potential bug
                const tokens = MLManager.tokenizeWithNgrams(g.name);
              tokens.forEach(w => {
                allWords.set(w, (allWords.get(w) || 0) + 1);
              });
            });
            let bestWord = 'UNKNOWN';
            let maxFreq = 0;
            for (const [w, f] of allWords) {
              if (f > maxFreq) {
                maxFreq = f;
                bestWord = w.toUpperCase();
              }
            }
            const clusterName = bestWord;
            if (!clusters.has(clusterName)) {
              clusters.set(clusterName, { name: clusterName, txs: [] });
            }
            // Merge txs (avoid dups, though unlikely, since singles)
            allTxs.forEach(tx => {
              if (!clusters.get(clusterName).txs.includes(tx)) {
                clusters.get(clusterName).txs.push(tx);
              }
            });
          }
        }
      }
    }
    // --- Final Step: Format for the UIManager ---
    // Ensure we only return clusters that actually meet the size requirement
    return Array.from(clusters.values())
        .filter(cluster => cluster.txs.length >= minClusterSize)
        .sort((a, b) => b.txs.length - a.txs.length); // Sort by size descending for better UX
  }
  /**
   * K-Means clustering for finding spending habits (amount + day of week).
   * Pulled from budgetappOLD.html
   */
  static _kmeansForHabits(transactions, k = 3) {
    if (transactions.length < k) return null;
    const features = transactions.map(tx => [
        Math.abs(tx.amount),
        new Date(tx.date).getDay() // 0=Sun, 6=Sat
    ]);
    let centroids = features.slice(0, k);
    let assignments = new Array(features.length).fill(0);
    for (let iter = 0; iter < 10; iter++) { // Max iterations
        assignments = features.map(point => {
            let minDist = Infinity;
            let best = 0;
            for (let c = 0; c < k; c++) {
                const dist = Math.sqrt(Math.pow(point[0] - centroids[c][0], 2) + Math.pow(point[1] - centroids[c][1], 2));
                if (dist < minDist) {
                    minDist = dist;
                    best = c;
                }
            }
            return best;
        });
        const newCentroids = Array.from({length: k}, () => [0, 0]);
        const counts = new Array(k).fill(0);
        features.forEach((point, i) => {
            const cluster = assignments[i];
            newCentroids[cluster][0] += point[0];
            newCentroids[cluster][1] += point[1];
            counts[cluster]++;
        });
        centroids = newCentroids.map((cent, i) => counts[i] > 0 ? [cent[0] / counts[i], cent[1] / counts[i]] : cent);
    }

      
        transactions.forEach((tx, i) => {
            const cluster = assignments[i];
            const dist = Math.sqrt(Math.pow(Math.abs(tx.amount) - centroids[cluster][0], 2) + Math.pow(new Date(tx.date).getDay() - centroids[cluster][1], 2));
          
            const distances = features.map((p, j) => {
                if (assignments[j] !== cluster) return 0;
                return Math.sqrt(Math.pow(p[0] - centroids[cluster][0], 2) + Math.pow(p[1] - centroids[cluster][1], 2));
            });
            const meanDist = distances.reduce((a, b) => a + b, 0) / features.length;
            const stdDev = Math.sqrt(distances.map(d => Math.pow(d - meanDist, 2)).reduce((a, b) => a + b, 0) / features.length);
          
            tx.isAnomaly = dist > meanDist + 2 * stdDev;
        });
    return {
        clusters: centroids.map((cent, i) => ({
            avgAmount: cent[0],
            avgDay: cent[1],
            count: assignments.filter(a => a === i).length,
            transactions: transactions.filter((_, j) => assignments[j] === i)
        })),
        assignments
    };
  }
  /**
   * Calculates spending habit clusters for all envelopes.
   * Pulled from budgetappOLD.html and adapted for MLManager.
   * @param {Envelope[]} envelopes - An array of all Envelope objects.
   * @returns {Map<string, Object>} A Map where key is envelope.id and value is the cluster data.
   */
  static computeClusters(envelopes) {
      const allClusters = new Map();
      envelopes.forEach(env => {
          const spends = env.transactions.filter(tx => tx.type === 'spend').slice(-60);
          if (spends.length > 3) {
              // Call the new habit-finder k-means
              allClusters.set(env.id, this._kmeansForHabits(spends, 3));
          }
      });
      return allClusters;
  }
  
  /**
   * Calculates Jaccard Similarity between two strings using n-grams.
   * Used for deduplicating recurring bill suggestions.
   */
  static calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    if (str1.toLowerCase() === str2.toLowerCase()) return 1;

    // Reuse existing tokenizer
    const tokensA = new Set(MLManager.tokenizeWithNgrams(str1));
    const tokensB = new Set(MLManager.tokenizeWithNgrams(str2));

    if (tokensA.size === 0 || tokensB.size === 0) return 0;

    // Calculate Jaccard Index
    const intersection = new Set([...tokensA].filter(x => tokensB.has(x)));
    const union = new Set([...tokensA, ...tokensB]);

    return intersection.size / union.size;
  }
  /**
   * Unified prediction logic: Tries Naive Bayes first, falls back to Static Keywords.
   * @param {string} note - The transaction note/payee.
   * @param {Object} model - The trained Naive Bayes model.
   * @param {Array} envelopes - Array of envelope objects.
   * @returns {string|null} The predicted Jar ID or null.
   */
static getJarIdFromKeywords(payee, envelopes) {
    if (!payee) return null;
    
    // Iterate through all categories in our rules
    for (const [categoryKey, keywords] of Object.entries(this.KEYWORD_RULES)) {
      
      // 1. Check if the payee matches any keyword in this category
      // We check the keyword FIRST so we don't waste time searching envelopes for non-matching categories
        const isKeywordMatch = keywords.some(keyword => {
            const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            return regex.test(payee);
        }) || (new RegExp(`\\b${categoryKey}\\b`, 'i').test(payee));

      if (isKeywordMatch) {
        // 2. We found the category (e.g. "SHOPPING & RETAIL"). 
        // Now let's find the best matching jar the user actually HAS.
        
        // Priority A: Exact Match (e.g. Jar "SHOPPING & RETAIL")
        let target = envelopes.find(env => env.name.toUpperCase() === categoryKey.toUpperCase());
        
        // Priority B: Partial Word Match
        // Split category "DINING & TAKEAWAY" -> ["DINING", "TAKEAWAY"]
        // Matches if user has a jar named "Dining" or "Takeaway"
        if (!target) {
            const keyParts = categoryKey.split(/[&/]/).map(s => s.trim().toUpperCase()).filter(s => s.length > 2);
            
            target = envelopes.find(env => {
                const upperEnv = env.name.toUpperCase();
                // Does the jar name contain "SHOPPING"? Or does "SHOPPING" contain the jar name?
                return keyParts.some(part => upperEnv.includes(part) || part.includes(upperEnv));
            });
        }

        if (target) return target.id;
      }
    }
    return null; 
  }

  // helper method to wrap everything up nicely:
  /**
   * Unified prediction logic: Tries Naive Bayes first, falls back to Static Keywords.
   */
  static predictJarUnified(note, model, envelopes) {
      // 1. Try Naive Bayes (Learned History)
      const envelopeIds = envelopes.map(e => e.id);
      let predictedJarId = this.predictJar(note, model, envelopeIds);

      // 2. Fallback to Static Keywords (Global Knowledge)
      if (!predictedJarId) {
          predictedJarId = this.getJarIdFromKeywords(note, envelopes);
      }

      return predictedJarId;
  }
}
