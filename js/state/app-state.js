import { Utils } from '../utils/index.js';
import { MathUtils } from '../utils/math-utils.js';
import { Envelope } from '../models/envelope.js';
import { Account } from '../models/account.js';
import { ScheduledTransaction } from '../models/transaction.js';
import { MonthData } from '../models/month-data.js';
import { MLManager } from '../services/ml-manager.js';
import { BudgetForecaster } from '../services/forecaster.js';
import { PinManager } from '../db/pin-manager.js';
import { Toaster } from '../ui/toast-manager.js';
import { ExchangeRateService } from '../services/exchange-rates.js';
import { CURRENCIES, fromSmallestUnit } from '../data/currencies.js';
import { LotTracker } from '../services/lot-tracker.js';

export class AppState {

constructor(db,pluginSystem) {
    this.db = db;
    this.plugins = pluginSystem;
    this.baseCurrency = 'AUD'; 
    this.exchangeRates = null;  
    this.data = {
      currentMonth: new Date().toISOString().slice(0, 7),
      months: new Map(),
      envelopes: new Map(),
      accounts: new Map(),
      scheduled: new Map(),
      pinHash: null,
      pinSalt: null,
      locked: false,
      naiveBayesModel: null,
      clusters: new Map(),
      forecastInsights: {}
    };
    // INITIALIZE WORKER
    this.worker = new Worker('./js/services/ml.worker.js', { type: 'module' });
    this.worker.onmessage = this._handleWorkerMessage.bind(this);
    
    // debounce
    this.debouncedTrainML = Utils.debounce(() => this.trainML(), 2000);
  }

async _buildCurrencyMeta(account, date = Date.now()) {
    if (account.currency === this.baseCurrency) {
      return {};
    }
    
    const rate = await this.exchangeRates.getHistoricalRate(
      account.currency,
      this.baseCurrency,
      date
    );
    
    if (!rate) {
      console.warn(`Could not fetch rate for ${account.currency}`);
      return {};
    }
    
    return {
      exchangeRate: rate,
      baseCurrency: this.baseCurrency
    };
  }

  _calculateBaseCurrencyAmount(nativeAmount, account, rate) {
    if (!rate) return null;
    const nativeValue = nativeAmount / CURRENCIES[account.currency].unit;
    const baseValue = nativeValue * rate;
    return Math.round(baseValue * CURRENCIES[this.baseCurrency].unit);
  }

async transferBetweenAccounts(fromAccountId, toAccountId, amount, note) {
    const fromAcc = this.getAccount(fromAccountId);
    const toAcc = this.getAccount(toAccountId);

    if (!fromAcc || !toAcc) throw new Error("Invalid accounts selected");
    if (fromAccountId === toAccountId) throw new Error("Cannot transfer to the same account");
    if (amount <= 0) throw new Error("Invalid amount");

    const oldFromBal = fromAcc.balance;
    const oldToBal = toAcc.balance;

    try {
        const txDB = this.db.instance.transaction(['accounts'], 'readwrite');
        const accountStore = txDB.objectStore('accounts');
        
        const splitId = Utils.generateId();
        const now = Date.now();

        // Build currency metadata for both sides
        const fromMeta = await this._buildCurrencyMeta(fromAcc, now);
        if (fromMeta.exchangeRate) {
          fromMeta.baseCurrencyAmount = this._calculateBaseCurrencyAmount(-amount, fromAcc, fromMeta.exchangeRate);
        }
        
        // For cross-currency transfers, calculate receiving amount
        let toAmount = amount;
        let toMeta = {};
        
        if (fromAcc.currency !== toAcc.currency) {
          // Convert amount to destination currency
          const rate = await this.exchangeRates.getCurrentRate(fromAcc.currency, toAcc.currency);
          if (!rate) throw new Error('Could not fetch exchange rate');
          
          // Convert: amount is in fromAcc's smallest units
          const fromValue = amount / CURRENCIES[fromAcc.currency].unit;
          const toValue = fromValue * rate;
          toAmount = Math.round(toValue * CURRENCIES[toAcc.currency].unit);
          
          toMeta = await this._buildCurrencyMeta(toAcc, now);
          if (toMeta.exchangeRate) {
            toMeta.baseCurrencyAmount = this._calculateBaseCurrencyAmount(toAmount, toAcc, toMeta.exchangeRate);
          }
        }

        // Outflow from source
        fromAcc.addTransaction('transfer', -amount, `Transfer to ${toAcc.name}: ${note}`, null, now, fromMeta);
        fromAcc.transactions[0].transferPairId = splitId;

        // Inflow to destination
        toAcc.addTransaction('transfer', toAmount, `Transfer from ${fromAcc.name}: ${note}`, null, now, toMeta);
        toAcc.transactions[0].transferPairId = splitId;

        accountStore.put(fromAcc);
        accountStore.put(toAcc);

        return new Promise((resolve, reject) => {
            txDB.oncomplete = () => {
                this.debouncedTrainML();
                resolve(true);
            };
            txDB.onerror = (e) => reject(new Error(`Account Transfer Failed: ${e.target.error}`));
        });

    } catch (error) {
        fromAcc.balance = oldFromBal;
        toAcc.balance = oldToBal;
        throw new Error(error.message);
    }
}


async load() {
    // Initialize exchange rate service
    this.exchangeRates = new ExchangeRateService(this.db); 
    try {
      const [state, envelopesData, accountsData, scheduledData, monthsData] = await Promise.all([
        this.db.get('appState', 'main'),
        this.db.getAll('envelopes'),
        this.db.getAll('accounts'),
        this.db.getAll('scheduled'),
        this.db.getAll('months')
      ]);
      
      if (state) {
        Object.assign(this.data, {
          currentMonth: state.currentMonth || this.data.currentMonth,
          pinHash: state.pinHash,
          pinSalt: state.pinSalt,
          locked: state.locked || false
        });
        
        // --- SURGICAL FIX: Safe JSON Parse ---
        if (state.naiveBayesModel) {
          try {
            this.data.naiveBayesModel = JSON.parse(state.naiveBayesModel);
          } catch (e) {
            console.warn("Corrupted ML model found, resetting.", e);
            this.data.naiveBayesModel = null;
          }
        }
      }

      envelopesData.forEach(d => this.data.envelopes.set(d.id, new Envelope(d)));
      accountsData.forEach(d => this.data.accounts.set(d.id, new Account(d)));
      scheduledData.forEach(d => this.data.scheduled.set(d.id, new ScheduledTransaction(d)));
      monthsData.forEach(d => this.data.months.set(d.month, new MonthData(d)));

    // ---  Heal Legacy Scheduled Transactions ---
      const scheduledToFix = [];
      
      scheduledData.forEach(d => {
          // Check if this is a "legacy" item (missing timestamp)
          if (!d.updatedAt) {
              d.updatedAt = Date.now(); // Assign a stable timestamp NOW
              d.deleted = false;        // Ensure deleted flag exists
              scheduledToFix.push(d);
          }
          // Instantiate with the (possibly patched) data
          this.data.scheduled.set(d.id, new ScheduledTransaction(d));
      });

      // If we found legacy items, permanently save their new timestamps to DB
      if (scheduledToFix.length > 0) {
          console.log(`🩹 Healing ${scheduledToFix.length} legacy scheduled transactions...`);
          await this.db.multiPut({ scheduled: scheduledToFix });
      }

      await this.ensureCurrentMonth();

      // --- SURGICAL FIX: Safe ML Training ---
      try {
          if (!this.data.naiveBayesModel) {
            this.trainML();
          }
          this.data.clusters = MLManager.computeClusters(Array.from(this.data.envelopes.values()));
      } catch (mlError) {
          console.warn("ML/Clustering failed during load (non-critical):", mlError);
          // Proceed without ML features rather than crashing app
      }

    } catch (error) {
      console.error('Load Error:', error);
      this.resetDefaults();
      await this.ensureCurrentMonth();
    }
}

async createDefaultJars() {
        // Pulls keys directly from the loaded JSON rules
        const defaults = Object.keys(MLManager.KEYWORD_RULES); 
        const stores = ['envelopes'];
        
        try {
            await this.db.runTransaction(stores, 'readwrite', (stores) => {
                defaults.forEach(name => {
                    // Format name (e.g., "DINING & TAKEAWAY" -> "Dining & Takeaway")
                    const fmtName = name.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                    
                    const defaultEnv = new Envelope({ name: fmtName });
                    this.data.envelopes.set(defaultEnv.id, defaultEnv);
                    stores.envelopes.put(defaultEnv);
                });
            });
            return true;
        } catch (e) {
            throw new Error("Failed to create defaults: " + e.message);
        }
    }

/**
 * Audit the ledger to ensure TBB = Total Cash - Total Envelopes.
 * Fixes any "drift" caused by bugs or development changes.
 */
async performIntegrityCheck() {
    console.log("⚖️ Running Ledger Integrity Check...");
    
    // 1. Calculate Total Real World Cash (Assets ONLY)
    // Exclude credit cards so debt creation doesn't double-dip TBB
    const totalCash = Array.from(this.data.accounts.values())
        .filter(a => !a.deleted && a.status === 'open' && a.type !== 'credit')
        .reduce((sum, a) => sum + a.balance, 0);

    // 2. Calculate Total Allocated Money (Envelopes)
    const totalEnvelopes = Array.from(this.data.envelopes.values())
        .filter(e => !e.deleted)
        .reduce((sum, e) => sum + e.balance, 0);

    // 3. Calculate what TBB *should* be
    const calculatedTBB = totalCash - totalEnvelopes;

    // 4. Compare with current TBB record
    const currentMonthKey = this.data.currentMonth;
    const monthData = await this.ensureCurrentMonth();
    const storedTBB = monthData.tbb;

    // 5. Auto-correct if drifted
    // We use a small epsilon for floating point safety, though you use integers (cents) mostly.
    if (Math.abs(storedTBB - calculatedTBB) > 0) {
        console.warn(`⚠️ Budget Drift Detected! Stored TBB: ${storedTBB}, Real TBB: ${calculatedTBB}`);
        
        // Update Memory
        monthData.tbb = calculatedTBB;
        monthData.updatedAt = Date.now();
        
        // Update Database
        try {
            await this.db.put('months', monthData);
            console.log("✅ Budget Drift Auto-Corrected.");
            
            // Notify user via Toast
            Toaster.show("Budget optimized and resynced.", "info");
        } catch (e) {
            console.error("Failed to save integrity fix:", e);
        }
    } else {
        console.log("✅ Ledger is balanced.");
    }
}

async makeCreditCardPayment(paymentJarId, amount, fromAccountId, note, date = Date.now()) { // <--- Added date
        const paymentJar = this.getEnvelope(paymentJarId);
        const fromAcc = this.getAccount(fromAccountId);
        if (!paymentJar || paymentJar.type !== 'cc_payment') throw new Error('Invalid Payment Jar');
        if (!fromAcc) throw new Error('Funding Account not found');
        
        const ccAccountId = paymentJar.linkedAccountId;
        const ccAcc = this.getAccount(ccAccountId);
        
        if (!ccAcc) throw new Error('Linked Credit Account not found');
        if (fromAccountId === ccAccountId) throw new Error('Cannot pay credit card with itself');

        const oldJarBal = paymentJar.balance;
        const oldFromBal = fromAcc.balance;
        const oldCcBal = ccAcc.balance;

        try {
            const stores = ['envelopes', 'accounts'];
            await this.db.runTransaction(stores, 'readwrite', (stores) => {
                const splitId = Utils.generateId();
                
                // Pass 'date' to all addTransaction calls
                paymentJar.addTransaction('transfer', -amount, `Payment: ${note}`, ccAcc.name, splitId, fromAccountId, date);
                fromAcc.addTransaction('transfer', -amount, `CC Payment: ${note}`, paymentJarId, splitId, date);
                ccAcc.addTransaction('transfer', amount, `Payment Received`, fromAcc.name, splitId, date); // Note: No Jar ID on receiving side

                stores.envelopes.put(paymentJar);
                stores.accounts.put(fromAcc);
                stores.accounts.put(ccAcc);
            });
            this.debouncedTrainML();
            return true;

        } catch (error) {
            paymentJar.balance = oldJarBal;
            fromAcc.balance = oldFromBal;
            ccAcc.balance = oldCcBal;
            throw new Error(`CC Payment Failed: ${error.message}`);
        }
    }

exportTaxCSV(accountId, financialYear) {
  const account = this.getAccount(accountId);
  const tracker = new LotTracker(account, this.baseCurrency);
  const report = tracker.generateTaxReport(financialYear);
  
  let csv = 'Disposal Date,Units,Proceeds (AUD),Cost Basis (AUD),Gain/Loss,CGT Discount,Taxable Gain,Holding Period\n';
  
  for (const event of report.events) {
    const date = new Date(event.disposalDate).toISOString().split('T')[0];
    const units = fromSmallestUnit(event.units, account.currency);
    const proceeds = (event.proceeds / 100).toFixed(2);
    const cost = (event.costBasis / 100).toFixed(2);
    const gain = (event.gain / 100).toFixed(2);
    const discount = (event.discountableGain / 100).toFixed(2);
    const taxable = (event.taxableGain / 100).toFixed(2);
    const holding = event.isLongTerm ? '>12 months' : '<12 months';
    
    csv += `${date},${units},${proceeds},${cost},${gain},${discount},${taxable},${holding}\n`;
  }
  
  csv += `\nSUMMARY\n`;
  csv += `Total Proceeds,${(report.summary.totalProceeds / 100).toFixed(2)}\n`;
  csv += `Total Cost Basis,${(report.summary.totalCostBasis / 100).toFixed(2)}\n`;
  csv += `Total Gain/Loss,${(report.summary.totalGain / 100).toFixed(2)}\n`;
  csv += `CGT Discount Applied,${(report.summary.totalDiscount / 100).toFixed(2)}\n`;
  csv += `Net Taxable Gain,${(report.summary.totalTaxable / 100).toFixed(2)}\n`;
  
  return csv;
}

async updateEnvelopeGoal(id, goalType, goalAmount, targetDate) { 
  const env = this.getEnvelope(id);
  if (!env) throw new Error('Envelope not found');
  env.goalType = goalType;
  env.goalAmount = goalAmount;
  env.targetDate = targetDate || null; 
  await this.updateEnvelope(env);
}

async reconcileAccount(accountId, actualBalance) {
    const acc = this.getAccount(accountId);
    if (!acc) throw new Error('Account not found');

    const calculatedBalance = acc.balance; 
    const diff = actualBalance - calculatedBalance;
    
    // 1. Mark account as reconciled
    acc.reconciled = true;
    acc.lastReconciledDate = new Date().toISOString();

    // 2. Create adjustment if needed
    if (diff !== 0) {
        const note = "Reconciliation Adjustment";
        
        // --- FIX START ---
        if (acc.type === 'credit') {
            // For credit cards, we must perform the adjustment manually 
            // because addIncome() throws an error for them.
            const monthData = await this.getCurrentMonthData();
            
            // Adjust TBB (Positive diff = less debt = more TBB)
            monthData.updateTBB(diff);
            
            // Add transaction directly
            acc.addTransaction('income', diff, note, null, Date.now(), {});
            
            // Save Changes
            await this.db.runTransaction(['months', 'accounts'], 'readwrite', (stores) => {
                stores.months.put(monthData);
                stores.accounts.put(acc);
            });
        } else {
            // For Cash/Asset accounts, existing logic works fine
            await this.addIncome(diff, note, accountId); 
        }
        // --- FIX END ---

    } else {
        await this.updateAccount(acc); 
    }
    return diff;
}


_handleWorkerMessage(event) {
    const { type, payload, error } = event.data;
    
    if (type === 'SUCCESS') {
        // Apply the calculations to state
        if (payload.naiveBayesModel) {
            this.data.naiveBayesModel = payload.naiveBayesModel;
            // Save model to DB asynchronously
            this.db.get('appState', 'main').then(state => {
                const s = state || { id: 'main' };
                this.db.put('appState', { ...s, naiveBayesModel: JSON.stringify(this.data.naiveBayesModel) });
            });
        }
        
        if (payload.clusters) {
            // Rehydrate Map from the worker data
            this.data.clusters = payload.clusters; 
        }
        
        if (payload.forecastInsights) {
            this.data.forecastInsights = payload.forecastInsights;
        }
        
        console.log("✅ ML State Updated via Worker");
    } else if (type === 'ERROR') {
        console.error("Worker Calculation Failed:", error);
    }
}

calculateAgeOfMoney() {
  const allTxs = [];
  this.data.accounts.forEach(acc => {
    allTxs.push(...acc.transactions.filter(tx => tx.type === 'income' || tx.type === 'spend'));
  });
  
  if (allTxs.length < 5) return 0;
  
  allTxs.sort((a, b) => a.date - b.date);
  
  let incomeQueue = [];
  let totalAge = 0;
  let count = 0;

  for (const tx of allTxs) {
    if (tx.type === 'income' && tx.amount > 0) {
      incomeQueue.push({ date: tx.date, amount: tx.amount });
    } else if (tx.type === 'spend' && tx.amount < 0) {
      let spendAmount = Math.abs(tx.amount);

      while (spendAmount > 0 && incomeQueue.length > 0) {
        const oldestIncome = incomeQueue[0];
        const spendFromOldest = Math.min(spendAmount, oldestIncome.amount);
        
        const days = (tx.date - oldestIncome.date) / (1000 * 60 * 60 * 24);
        
        totalAge += days * spendFromOldest;
        count += spendFromOldest;

        oldestIncome.amount -= spendFromOldest;
        spendAmount -= spendFromOldest;

        if (oldestIncome.amount <= 0) {
          incomeQueue.shift();
        }
      }
    }
  }
  return count > 0 ? Math.round(totalAge / count) : 0;
}
  
    async reassignAccountTransaction(accountId, txIndex, newJarId) {
        const acc = this.getAccount(accountId);
        if (!acc) throw new Error('Account not found');
        const tx = acc.transactions[txIndex];
        if (!tx) throw new Error('Transaction not found');
        
        if (tx.jarId === 'split') {
            throw new Error("Cannot reassign a split transaction. Please delete it and recreate the transaction.");
        }
        
        const oldJarId = tx.jarId;
        if (oldJarId === newJarId) return true; // No change
        const newJar = newJarId ? this.getEnvelope(newJarId) : null;
        const oldJar = oldJarId ? this.getEnvelope(oldJarId) : null;
        const isOrphan = oldJarId && !oldJar;
        const spendAmount = Math.abs(tx.amount); // tx.amount is negative
        // Check funds
        if (newJar && spendAmount > newJar.balance) {
            throw new Error(`Insufficient funds in jar: ${newJar.name}.`);
        }
        const oldAccBalance = acc.balance;
        const oldNewJarBalance = newJar ? newJar.balance : 0;
        const oldOldJarBalance = oldJar ? oldJar.balance : 0;
        try {
            // Use the db.instance for a raw transaction
            const txDB = this.db.instance.transaction(['accounts', 'envelopes'], 'readwrite');
            const accountStore = txDB.objectStore('accounts');
            const envelopeStore = txDB.objectStore('envelopes');
            // 1. Update the account transaction
            tx.jarId = newJarId;
            accountStore.put(acc); // Save updated account
            if (isOrphan) {
                // Orphan path: Just debit the new jar
                if (newJar) {
                    newJar.addTransaction('spend', tx.amount, tx.note || 'Re-assigned orphan spend', '', null, accountId);
                    envelopeStore.put(newJar);
                }
            } else {
                // Live path: Move money
                // 2. Remove from Old Jar
                if (oldJar) {
                    const oldTxIndex = oldJar.transactions.findIndex(t =>
                        t.date === tx.date && t.amount === tx.amount && t.accountId === accountId
                    );
                    if (oldTxIndex > -1) {
                        oldJar.transactions.splice(oldTxIndex, 1);
                        envelopeStore.put(oldJar);
                    }
                }
                // 3. Add to New Jar
                if (newJar) {
                    newJar.addTransaction('spend', tx.amount, tx.note || 'Re-assigned spend', '', null, accountId);
                    envelopeStore.put(newJar);
                }
            }
            return new Promise((resolve, reject) => {
                txDB.oncomplete = () => resolve(true);
                txDB.onerror = (e) => reject(new Error(`Re-assign Failed: ${e.target.error}`));
            });
        } catch (error) {
            // Rollback in-memory changes
            acc.balance = oldAccBalance;
            if (newJar) newJar.balance = oldNewJarBalance;
            if (oldJar) oldJar.balance = oldOldJarBalance;
            tx.jarId = oldJarId;
            // Note: In-memory balances are now out of sync, a reload might be safest
            throw new Error(`Re-assign Failed: ${error.message}`);
        }
    }
   
    async editAccountTransaction(accountId, txIndex, newSignedAmount, newDate, newNote) {
        const acc = this.getAccount(accountId);
        if (!acc) throw new Error('Account not found');
        const tx = acc.transactions[txIndex];
        if (!tx) throw new Error('Transaction not found');

        // FIX #4: Block editing amount on Split transactions
        if (tx.jarId === 'split' && tx.amount !== newSignedAmount) {
            throw new Error("Cannot edit total amount of a split transaction. Please delete and recreate.");
        }

        const oldAmount = tx.amount;
        const oldDate = tx.date;
        const oldNote = tx.note;
        const delta = newSignedAmount - oldAmount;

        if (delta === 0 && tx.note === newNote && new Date(tx.date).toISOString().slice(0, 16) === newDate) {
            return true;
        }

        const monthData = await this.getCurrentMonthData();
        const jar = tx.jarId ? this.getEnvelope(tx.jarId) : null;

        const oldAccBalance = acc.balance;
        const oldMonthTBB = monthData.tbb;
        const oldJarBalance = jar ? jar.balance : 0;

        try {
            const stores = ['accounts', 'months'];
            if (jar) stores.push('envelopes');

            const txDB = this.db.instance.transaction(stores, 'readwrite');
            const accountStore = txDB.objectStore('accounts');
            const monthStore = txDB.objectStore('months');
            const envelopeStore = jar ? txDB.objectStore('envelopes') : null;

            // 1. Update Account
            tx.amount = newSignedAmount;
            tx.date = new Date(newDate).getTime();
            tx.note = newNote;
            tx.updatedAt = Date.now();
            accountStore.put(acc);

            // 2. CHECK FOR TRANSFER PAIR
            let isTransfer = false;
            if (tx.transferPairId) {
                for (const otherAcc of this.data.accounts.values()) {
                    if (otherAcc.id === accountId) continue;
                    const partnerTx = otherAcc.transactions.find(t => t.transferPairId === tx.transferPairId);
                    
                    if (partnerTx) {
                        isTransfer = true;
                        
                        // FIX #3: Prevent Data Corruption on Multi-Currency Edits
                        if (acc.currency !== otherAcc.currency && delta !== 0) {
                            throw new Error("Cannot auto-update amount for cross-currency transfers. Please edit them separately to set the correct exchange rate.");
                        }

                        partnerTx.amount = -newSignedAmount; // Only safe if currencies match
                        partnerTx.date = tx.date;
                        partnerTx.note = `(Linked) ${newNote}`;
                        partnerTx.updatedAt = Date.now();
                        accountStore.put(otherAcc);
                        break;
                    }
                }
            }

            // 3. Update TBB or Jar
            if (!isTransfer) {
                if (tx.type === 'income') {
                    monthData.updateTBB(delta);
                    monthStore.put(monthData);
                } else if (tx.type === 'spend') {
                    if (jar) {
                        const envTxIndex = jar.transactions.findIndex(t => t.accountId === accountId && t.date === oldDate && t.amount === oldAmount);
                        if (envTxIndex > -1) {
                            const envTx = jar.transactions[envTxIndex];
                            envTx.amount = newSignedAmount;
                            envTx.date = tx.date;
                            envTx.note = tx.note;
                            envTx.updatedAt = Date.now();
                        }
                        envelopeStore.put(jar);
                    } else {
                        monthData.updateTBB(delta);
                        monthStore.put(monthData);
                    }
                }
            }

            return new Promise((resolve, reject) => {
                txDB.oncomplete = () => {
                    this.debouncedTrainML();
                    resolve(true);
                };
                txDB.onerror = (e) => reject(new Error(`Edit Failed: ${e.target.error}`));
            });
        } catch (error) {
            // Rollback
            acc.balance = oldAccBalance;
            monthData.tbb = oldMonthTBB;
            if (jar) jar.balance = oldJarBalance;
            tx.amount = oldAmount;
            tx.date = oldDate;
            tx.note = oldNote;
            throw new Error(`Edit Failed: ${error.message}`);
        }
    }
    async deleteAccountTransaction(accountId, txIndex) {
        const acc = this.getAccount(accountId);
        if (!acc) throw new Error('Account not found');
        const tx = acc.transactions[txIndex];
        if (!tx) throw new Error('Transaction not found');
        
        const oldAmount = tx.amount; 
        const delta = -oldAmount; // Reversal amount
        
        const monthData = await this.getCurrentMonthData();
        const jar = tx.jarId ? this.getEnvelope(tx.jarId) : null;
        
        // --- Store old values for rollback ---
        const oldAccBalance = acc.balance;
        const oldMonthTBB = monthData.tbb;
        // Note: We don't need oldJarBalance anymore because it's dynamic!

        try {
            const stores = ['accounts', 'months'];
            if (jar) stores.push('envelopes');
            
            // --- PERFORM IN-MEMORY UPDATES (SOFT DELETE) ---
            
            // 1. Mark Account Transaction as Deleted (TOMBSTONE)
            tx.deleted = true;
            tx.updatedAt = Date.now();
            acc.updatedAt = Date.now(); 
            
            // 2. Handle Linked Entities (TBB or Jar)
            if (tx.type === 'income') {
                // Income reversal affects TBB
                monthData.updateTBB(delta);
            } else if (tx.type === 'spend') {
                if (jar) {
                    // Find matching envelope tx and SOFT delete it
                    const envTx = jar.transactions.find(t => 
                        t.accountId === accountId && 
                        t.date === tx.date && 
                        t.amount === tx.amount && 
                        !t.deleted
                    );
                    
                    if (envTx) {
                        envTx.deleted = true;
                        envTx.updatedAt = Date.now();
                        jar.updatedAt = Date.now(); 
                        // DYNAMIC FIX: We do NOT manually touch jar.balance.
                        // The getter automatically ignores this deleted transaction now.
                    }
                } else {
                    // Uncategorized spend reversal -> adds money back to TBB
                    monthData.updateTBB(delta);
                }
            }

            // 3. Persist to DB
            await this.db.runTransaction(stores, 'readwrite', (stores) => {
                stores.accounts.put(acc);
                
                if (tx.type === 'income' || !jar) {
                    stores.months.put(monthData);
                }
                
                if (jar) {
                    stores.envelopes.put(jar);
                }
            });
            this.debouncedTrainML();
            return true;

        } catch (error) {
            // --- ROLLBACK ---
            acc.balance = oldAccBalance;
            monthData.tbb = oldMonthTBB;
            
            // Revert Tombstone
            tx.deleted = false;
            
            if (jar) {
                 const envTx = jar.transactions.find(t => t.accountId === accountId && t.date === tx.date && t.amount === tx.amount && t.deleted);
                 if(envTx) envTx.deleted = false;
            }
            
            throw new Error(`Delete Failed: ${error.message}`);
        }
    }
   
    async batchImportTransactions(accountId, transactions) {
        const acc = this.getAccount(accountId);
        if (!acc) throw new Error('Account not found');
       
        const monthData = await this.getCurrentMonthData();
        const jarsToUpdate = new Map();
       
        // --- Store old values for rollback ---
        const oldAccBalance = acc.balance;
        const oldMonthTBB = monthData.tbb;
        const oldJarBalances = new Map();
        try {
            // 1. Determine all stores needed for the transaction
            const stores = ['accounts', 'months'];
            transactions.forEach(tx => {
                if (tx.jarId) {
                    if (!jarsToUpdate.has(tx.jarId)) {
                        const jar = this.getEnvelope(tx.jarId);
                        if (!jar) throw new Error(`Jar with id ${tx.jarId} not found.`);
                        jarsToUpdate.set(tx.jarId, jar);
                        oldJarBalances.set(tx.jarId, jar.balance); // Save for rollback
                    }
                }
            });
            if (jarsToUpdate.size > 0) stores.push('envelopes');
           
            const txDB = this.db.instance.transaction(stores, 'readwrite');
            const accountStore = txDB.objectStore('accounts');
            const monthStore = txDB.objectStore('months');
            // Only get the store if we actually added it to the transaction
            const envelopeStore = (jarsToUpdate.size > 0) ? txDB.objectStore('envelopes') : null;
            // 2. Process all transactions in-memory and queue writes
            for (const tx of transactions) {
                const txTimestamp = new Date(tx.date).getTime(); // Convert ISO string to a number
               
                // Add to Account
                acc.addTransaction(tx.amount < 0 ? 'spend' : 'income', tx.amount, tx.note, tx.jarId, txTimestamp);
                if (tx.jarId && envelopeStore) { // <-- ADDED CHECK
                    // Add to Jar
                    const jar = jarsToUpdate.get(tx.jarId);
                    jar.addTransaction(tx.amount < 0 ? 'spend' : 'add', tx.amount, tx.note, '', null, accountId, txTimestamp);
                } else {
                    // Add to TBB
                    monthData.updateTBB(tx.amount);
                }
            }
            // 3. Save all changes
            accountStore.put(acc);
            monthStore.put(monthData);
            if (envelopeStore) {
                jarsToUpdate.forEach(jar => {
                    envelopeStore.put(jar);
                });
            }
            return new Promise((resolve, reject) => {
                txDB.oncomplete = () => {
                    this.debouncedTrainML(); // Train on new data
                    resolve(true);
                };
                txDB.onerror = (e) => reject(new Error(`Batch Import Failed: ${e.target.error}`));
            });
        } catch (error) {
            // Rollback in-memory
            acc.balance = oldAccBalance;
            monthData.tbb = oldMonthTBB;
            oldJarBalances.forEach((bal, id) => {
                this.getEnvelope(id).balance = bal;
            });
            // Note: A full rollback would require removing txs, but
            // for a failed batch, a page reload is the safest state.
            throw new Error(`Import Failed: ${error.message}`);
        }
    }
    async closeAccount(accountId) {
            const acc = this.getAccount(accountId);
            if (!acc) throw new Error('Account not found');
            if (acc.balance !== 0) throw new Error('Balance must be zero');
            if (acc.type === 'credit') throw new Error('Credit cards must be deleted, not closed.');
           
            acc.setStatus('closed'); // Set in-memory
            try {
                await this.db.put('accounts', acc); // Save to DB
                return true;
            } catch (error) {
                acc.setStatus('open'); // Rollback in-memory
                throw new Error(`DB Error: ${error.message}`);
            }
        }
        async deleteCreditAccount(accountId) {
            const acc = this.getAccount(accountId);
            if (!acc) throw new Error('Account not found');
            if (acc.type !== 'credit') throw new Error('Only credit accounts can be deleted.');
            const monthData = await this.getCurrentMonthData();
            const paymentJar = Array.from(this.data.envelopes.values())
                                    .find(e => e.type === 'cc_payment' && e.linkedAccountId === accountId);
            // Store old values for rollback
            const oldMonthTBB = monthData.tbb;
            try {
                const stores = ['accounts', 'months'];
                if (paymentJar) stores.push('envelopes');
                const txDB = this.db.instance.transaction(stores, 'readwrite');
                const accountStore = txDB.objectStore('accounts');
                const monthStore = txDB.objectStore('months');
                const envelopeStore = paymentJar ? txDB.objectStore('envelopes') : null;
                // 1. Delete Account
                this.data.accounts.delete(accountId);
                accountStore.delete(accountId);
                // 2. Delete Jar and move funds (if jar exists)
                if (paymentJar) {
                    monthData.updateTBB(paymentJar.balance); // Return jar balance to TBB
                    this.data.envelopes.delete(paymentJar.id);
                    envelopeStore.delete(paymentJar.id);
                }
               
                monthStore.put(monthData); // Save TBB change
                return new Promise((resolve, reject) => {
                    txDB.oncomplete = () => resolve(true);
                    txDB.onerror = (e) => reject(new Error(`Delete Failed: ${e.target.error}`));
                });
            } catch (error) {
                // Rollback in-memory
                monthData.tbb = oldMonthTBB;
                this.data.accounts.set(accountId, acc); // Re-add account
                if (paymentJar) this.data.envelopes.set(paymentJar.id, paymentJar); // Re-add jar
                throw new Error(`Delete Failed: ${error.message}`);
            }
        }
   
   
  resetDefaults() {
    this.data = {
      currentMonth: new Date().toISOString().slice(0, 7),
      months: new Map(),
      envelopes: new Map(),
      accounts: new Map(),
      scheduled: new Map(),
      pinHash: null,
      pinSalt: null,
      locked: false,
      naiveBayesModel: null,
      clusters: new Map()
    };
  }
  async ensureCurrentMonth() {
    const monthStr = this.data.currentMonth;
    if (!this.data.months.has(monthStr)) {
      const monthData = new MonthData({ month: monthStr });
      this.data.months.set(monthStr, monthData);
      await this.db.put('months', monthData);
    }
    return this.data.months.get(monthStr);
  }
  async getCurrentMonthData() {
    return this.ensureCurrentMonth();
  }
  async addEnvelope(envelope) {
    try {
      await this.db.put('envelopes', envelope);
      this.data.envelopes.set(envelope.id, envelope);
      return envelope;
    } catch (error) {
      throw new Error(`Add Envelope Failed: ${error.message}`);
    }
  }
  getEnvelope(id) {
    return this.data.envelopes.get(id) || null;
  }
  async updateEnvelope(envelope) {
    try {
      await this.db.put('envelopes', envelope);
      this.data.envelopes.set(envelope.id, envelope);
    } catch (error) {
      throw new Error(`Update Envelope Failed: ${error.message}`);
    }
  }
async deleteEnvelope(id) {
    const envelope = this.getEnvelope(id);
    if (!envelope) return false;
    const monthData = await this.getCurrentMonthData();
    // Capture balance BEFORE zeroing it out
    const returnAmount = envelope.balance;
    
    // Mark as deleted instead of removing
    envelope.deleted = true;
    envelope.updatedAt = Date.now();
    envelope.balance = 0; // Clear balance so it doesn't count towards totals

    monthData.updateTBB(returnAmount); 

    // Save the "Dead" envelope to DB so sync can propagate the deletion
    await this.db.put('envelopes', envelope); 
    
    // Do NOT delete from this.data.envelopes map yet (or UI will crash on lookup)
    // Just ensure UI filters it out.
    return true;
}
  async addAccount(account) {
    const monthData = await this.getCurrentMonthData();
    const oldMonthTBB = monthData.tbb;
    const oldAccountBalance = account.balance;
    let ccJar = null;
    // Define stores needed
    const stores = ['accounts', 'months'];
    if (account.type === 'credit') {
        stores.push('envelopes'); // Always need envelopes for a CC
    }
    try {
        const txDB = this.db.instance.transaction(stores, 'readwrite');
        const accountStore = txDB.objectStore('accounts');
        const monthStore = txDB.objectStore('months');
        const envelopeStore = (account.type === 'credit') ? txDB.objectStore('envelopes') : null;
        // 1. Handle Account and TBB
        this.data.accounts.set(account.id, account); // Add to in-memory
        if (account.type === 'credit') {
            // Create the payment jar *inside* this transaction
            const jarName = `${account.name} Payment`;
            // We must check for duplicate names here
            if (Array.from(this.data.envelopes.values()).some(e => e.name === jarName)) {
                 throw new Error(`A payment jar named "${jarName}" already exists.`);
            }
            ccJar = new Envelope({ name: jarName, type: 'cc_payment', linkedAccountId: account.id });
           
            if (account.balance < 0) {
                // Has initial debt
                const debt = Math.abs(account.balance);
                monthData.updateTBB(-debt);
                ccJar.addTransaction('add', debt, 'Initial balance imported');
                account.addTransaction('debt', account.balance, `Initial ${account.name} debt`);
            }
            this.data.envelopes.set(ccJar.id, ccJar); // Add jar to in-memory
            envelopeStore.put(ccJar); // Save jar
        } else {
            // Cash account, just add balance to TBB
            monthData.updateTBB(account.balance);
        }
       
        // 2. Save Account and Month Data
        monthStore.put(monthData);
        accountStore.put(account);
        return new Promise((resolve, reject) => {
            txDB.oncomplete = () => resolve(account);
            txDB.onerror = (e) => reject(new Error(`Add Account Failed: ${e.target.error.message}`));
        });
    } catch (error) {
        // Rollback in-memory
        this.data.accounts.delete(account.id); // Remove account
        if (ccJar) this.data.envelopes.delete(ccJar.id); // Remove jar
        monthData.tbb = oldMonthTBB; // Reset TBB
        account.balance = oldAccountBalance; // Reset account
        // Re-throw the specific error
        throw new Error(error.message);
    }
  }
  getAccount(id) {
    return this.data.accounts.get(id) || null;
  }
  async updateAccount(account) {
    try {
      await this.db.put('accounts', account);
      this.data.accounts.set(account.id, account);
    } catch (error) {
      throw new Error(`Update Account Failed: ${error.message}`);
    }
  }
  async addScheduled(scheduled) {
    try {
      await this.db.put('scheduled', scheduled);
      this.data.scheduled.set(scheduled.id, scheduled);
      return scheduled;
    } catch (error) {
      throw new Error(`Add Scheduled Failed: ${error.message}`);
    }
  }
  getScheduled(id) {
    return this.data.scheduled.get(id) || null;
  }
async deleteScheduled(id) {
    const scheduled = this.getScheduled(id);
    if (!scheduled) return false;

    // Soft Delete: Mark as deleted so sync propagates the removal
    scheduled.deleted = true;
    scheduled.updatedAt = Date.now();

    try {
      await this.db.put('scheduled', scheduled);
      // We keep it in memory (but filtered out in UI) so sync can find it
      this.data.scheduled.set(id, scheduled);
      return true;
    } catch (error) {
      throw new Error(`Delete Scheduled Failed: ${error.message}`);
    }
  }
 
async updateScheduled(id, data) {
    const scheduled = this.getScheduled(id);
    if (!scheduled) throw new Error("Scheduled transaction not found.");
   
    scheduled.name = data.name;
    scheduled.amount = data.amount;
    scheduled.frequency = data.frequency;
    scheduled.envelopeId = data.envelopeId;
    scheduled.accountId = data.accountId;
    scheduled.date = data.date;
    scheduled.type = data.type;
    
    // --- NEW: Update timestamp so sync picks up the edit ---
    scheduled.updatedAt = Date.now();

    try {
      await this.db.put('scheduled', scheduled);
      this.data.scheduled.set(id, scheduled);
      return true;
    } catch (error) {
      throw new Error(`Update Scheduled Failed: ${error.message}`);
    }
  }
 
async trainML() {
    console.log("🚀 Sending data to ML Worker...");
    
    // CHANGE: Filter out deleted envelopes
    const envelopesArr = Array.from(this.data.envelopes.values()).filter(e => !e.deleted);
    
    const accountsArr = Array.from(this.data.accounts.values());

    this.worker.postMessage({
        type: 'TRAIN_ALL',
        id: Date.now(),
        payload: {
            envelopes: envelopesArr,
            accounts: accountsArr,
            keywordRules: MLManager.KEYWORD_RULES 
        }
    });
}

async analyzeImport(rawTransactions) {
    return new Promise((resolve, reject) => {
        const reqId = Date.now();
        
        const handler = (event) => {
            const { type, id, payload, error } = event.data;
            if (id === reqId) {
                this.worker.removeEventListener('message', handler); 
                if (type === 'SUCCESS') resolve(payload);
                else reject(new Error(error));
            }
        };

        this.worker.addEventListener('message', handler);

        this.worker.postMessage({
            type: 'ANALYZE_IMPORT',
            id: reqId,
            payload: {
                rawTransactions,
                // CHANGE: Filter out deleted envelopes here too
                envelopes: Array.from(this.data.envelopes.values()).filter(e => !e.deleted),
                naiveBayesModel: this.data.naiveBayesModel,
                keywordRules: MLManager.KEYWORD_RULES 
            }
        });
    });
}
  
  
predictJar(note) {
    // CHANGE: Only pass active jar IDs to the predictor
    const ids = Array.from(this.data.envelopes.values())
        .filter(e => !e.deleted)
        .map(e => e.id);
        
    return MLManager.predictJar(note, this.data.naiveBayesModel, ids);
}
detectRecurringBills() {
    const suggestions = [];
    const activeScheduled = Array.from(this.data.scheduled.values());
    
    // --- 1. GROUP BY ROOT PAYEE ---
    // Solves the "Cluster Blob" issue by grouping "Netflix" and "Netflix.com" together,
    // while keeping "Netflix" and "Spotify" separate.
    const historyByPayee = {};
    
    Array.from(this.data.accounts.values()).forEach(acc => {
        acc.transactions.forEach(tx => {
            if (tx.type === 'spend' && !tx.deleted) {
                const tokens = MLManager.normalizePayee(tx.note || 'Unknown');
                if (tokens.length === 0) return;
                
                const rootName = tokens[0].toUpperCase();
                if (!historyByPayee[rootName]) historyByPayee[rootName] = { name: rootName, txs: [] };
                historyByPayee[rootName].txs.push(tx);
            }
        });
    });

    Object.values(historyByPayee).forEach(cluster => {
        // Need minimal history (3+ transactions) to establish any pattern
        if (cluster.txs.length < 3) return;

        // Common Data Prep
        const allTxs = cluster.txs.sort((a, b) => a.date - b.date);
        const dates = allTxs.map(t => new Date(t.date));
        const amounts = allTxs.map(t => Math.abs(t.amount));
        const lastDate = dates[dates.length - 1];

        // --- 🌊 STAGE 1: STRICT DETECTOR (The "Exact" Match) ---
        // Logic: Zero variance in amount, near-zero variance in interval.
        // Target: Spotify, Rent, Fixed Loans.
        const recentAmts = amounts.slice(-3);
        const recentDates = dates.slice(-3);
        
        let recentIntervals = [];
        for(let i=1; i<recentDates.length; i++) recentIntervals.push((recentDates[i]-recentDates[i-1])/(1000*60*60*24));
        
        // StdDev of 0 means perfect consistency
        if (MathUtils.standardDeviation(recentAmts) === 0 && MathUtils.standardDeviation(recentIntervals) < 1) {
            this._addSuggestion(suggestions, activeScheduled, {
                name: cluster.name,
                amount: recentAmts[0],
                interval: MathUtils.mean(recentIntervals),
                lastDate: lastDate,
                confidence: 95,
                source: 'Strict'
            });
            return; // Waterfall Exit
        }

        // --- 🔉 STAGE 2: NOISE-TOLERANT DETECTOR (Signal over Noise) ---
        // Logic: Find Dominant Amount (Mode), Filter Outliers, Check Intervals.
        // Target: Netflix (with random rentals), Amazon Prime (with random purchases).
        
        // 1. Find Mode Amount
        const amountCounts = {};
        allTxs.forEach(t => { 
            const k = Math.round(Math.abs(t.amount)/100); 
            amountCounts[k] = (amountCounts[k]||0)+1; 
        });
        let bestKey = null, maxCount = 0;
        Object.entries(amountCounts).forEach(([k,c]) => { if(c>maxCount){ maxCount=c; bestKey=parseInt(k); }});

        // 2. Filter: Keep only transactions close to the dominant amount (±10%)
        const cleanTxs = allTxs.filter(t => {
            const val = Math.abs(t.amount)/100;
            return Math.abs(val - bestKey) < (bestKey * 0.1) || val === bestKey; 
        });

        // 3. Re-Analyze Clean Data
        if (cleanTxs.length >= 3) {
            const cleanDates = cleanTxs.map(t => new Date(t.date));
            const cleanIntervals = [];
            for(let i=1; i<cleanDates.length; i++) cleanIntervals.push((cleanDates[i]-cleanDates[i-1])/(1000*60*60*24));
            
            const validIntervals = MathUtils.filterOutliers(cleanIntervals);
            
            // If intervals are stable AFTER cleaning amounts (StdDev < 2 days)
            if (MathUtils.standardDeviation(validIntervals) < 2) {
                this._addSuggestion(suggestions, activeScheduled, {
                    name: cluster.name,
                    amount: bestKey * 100, // Convert back to cents
                    interval: MathUtils.mean(validIntervals),
                    lastDate: cleanDates[cleanDates.length-1],
                    confidence: 85,
                    source: 'Noise-Filter'
                });
                return; // Waterfall Exit
            }
        }

// --- 〰️ STAGE 3: ROBUST PERIODICITY (The "Pattern" Match) ---
        // Logic: Checks if a significant % of intervals match standard cycles (7, 14, 30, etc).
        // Target: Electricity, Water, Variable Bills (ignores amount variance if timing is good).
        
        const dayDiffs = [];
        for(let i=1; i<dates.length; i++) {
            dayDiffs.push((dates[i] - dates[i-1]) / (1000 * 60 * 60 * 24));
        }

        // Define standard cycles
        const cycles = [
            { name: 'weekly', days: 7, tol: 2 },
            { name: 'fortnightly', days: 14, tol: 3 },
            { name: 'monthly', days: 30.44, tol: 5 },
            { name: 'quarterly', days: 91.25, tol: 10 },
            { name: 'yearly', days: 365.25, tol: 15 }
        ];

        let bestMatch = null;

        // Find the cycle that fits the most intervals
        for (const cycle of cycles) {
            // Count how many intervals fit this cycle (within tolerance)
            // We double the weight of the most recent interval to bias towards current habits
            let score = 0;
            let totalWeight = 0;

            dayDiffs.forEach((diff, index) => {
                const weight = (index === dayDiffs.length - 1) ? 2 : 1; // Recent = 2x weight
                totalWeight += weight;
                
                // Check simple match (e.g. ~30 days) OR double match (missed payment ~60 days)
                const isSingle = Math.abs(diff - cycle.days) <= cycle.tol;
                const isDouble = Math.abs(diff - (cycle.days * 2)) <= cycle.tol; 

                if (isSingle || isDouble) {
                    score += weight;
                }
            });

            const confidence = score / totalWeight;

            // We need at least 60% of the history to match the pattern
            if (confidence >= 0.6) {
                if (!bestMatch || confidence > bestMatch.confidence) {
                    bestMatch = { cycle, confidence };
                }
            }
        }

        // If a pattern was found
        if (bestMatch) {
            // Calculate a safe average amount (Median is best for variable bills)
            const medianAmt = MathUtils.median(amounts);
            
            // Generate confidence score (Base 70 + bonus for high consistency)
            let finalConf = 70 + (bestMatch.confidence * 20); 
            
            // Slight penalty if the amounts vary WILDLY (CV > 1.0), but don't disqualify
            const amtMean = MathUtils.mean(amounts);
            const amtDev = MathUtils.standardDeviation(amounts);
            if (amtMean > 0 && (amtDev / amtMean) > 1.0) finalConf -= 10;

            this._addSuggestion(suggestions, activeScheduled, {
                name: cluster.name,
                amount: medianAmt, 
                interval: bestMatch.cycle.days,
                lastDate: lastDate,
                confidence: Math.min(99, Math.round(finalConf)),
                source: `Pattern: ${bestMatch.cycle.name} (${Math.round(bestMatch.confidence*100)}%)`,
                isVariable: true
            });
        }
        
    });

    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  // Helper to format, predict next date, and deduplicate
  _addSuggestion(list, activeBills, data) {
    // 1. Determine Cycle
    let cycle = 'irregular';
    const day = Math.round(data.interval);
    if (Math.abs(day - 7) <= 2) cycle = 'weekly';
    else if (Math.abs(day - 14) <= 2) cycle = 'fortnightly';
    else if (Math.abs(day - 30) <= 4) cycle = 'monthly';
    else if (Math.abs(day - 90) <= 5) cycle = 'quarterly';
    else if (Math.abs(day - 182) <= 7) cycle = 'half_yearly';
    else if (Math.abs(day - 365) <= 10) cycle = 'yearly';

    if (cycle === 'irregular') return;

    // 2. Predict Next Date
    const nextDate = new Date(data.lastDate);
    const today = new Date();
    
    // Catch up to future
    while (nextDate < today) {
        if (cycle === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
        else if (cycle === 'yearly') nextDate.setFullYear(nextDate.getFullYear() + 1);
        else nextDate.setDate(nextDate.getDate() + Math.round(data.interval));
    }

    // 3. Deduplicate against Active Bills
    const isDuplicate = activeBills.some(s => {
        const nameSim = MLManager.calculateSimilarity(data.name, s.name);
        // If names match, we assume it's the same bill even if amounts changed slightly
        return nameSim > 0.6; 
    });

    if (!isDuplicate) {
        list.push({
            name: data.name,
            amount: Math.round(data.amount),
            frequency: cycle,
            date: nextDate.toISOString().split('T')[0],
            confidence: data.confidence,
            isVariable: !!data.isVariable,
            source: data.source
        });
    }
  }
 
  getClusters(id) {
    return this.data.clusters.get(id) || null;
  }
async changeMonth(delta) {
    // 1. Get the current app state (ASYNC operation moved OUTSIDE the transaction)
    const appState = await this.db.get('appState', 'main') || { id: 'main' };

    // 2. Get the data for the month we are LEAVING
    const oldMonthStr = this.data.currentMonth;
    const oldMonthData = this.data.months.get(oldMonthStr);
    const tbbRolloverAmount = oldMonthData ? oldMonthData.tbb : 0;

    // 3. Calculate and set the NEW month string
    const currentDate = new Date(oldMonthStr + '-01');
    currentDate.setMonth(currentDate.getMonth() + delta);
    const newMonthStr = currentDate.toISOString().slice(0, 7);
    this.data.currentMonth = newMonthStr;
    
    // 4. Ensure the NEW month data exists
    let newMonthData = this.data.months.get(newMonthStr);
    if (!newMonthData) {
      newMonthData = new MonthData({ month: newMonthStr });
      this.data.months.set(newMonthStr, newMonthData);
    }

    // 5. PERFORM IN-MEMORY ROLLOVER
    if (tbbRolloverAmount > 0 && oldMonthData) { // Check oldMonthData just in case
        // Zero out old month's TBB (it's now allocated to the next month)
        oldMonthData.tbb = 0;
        
        // Add the amount to the new month's TBB
        newMonthData.updateTBB(tbbRolloverAmount);
    }

    // 6. Start DB transaction (SYNCHRONOUS operations only inside this block)
    try {
        const txDB = this.db.instance.transaction(['appState', 'months'], 'readwrite');
        const stateStore = txDB.objectStore('appState');
        const monthStore = txDB.objectStore('months');
        
        // Save new currentMonth state (Use the variable fetched in step 1)
        appState.currentMonth = this.data.currentMonth;
        stateStore.put(appState);
        
        // Save both month data records
        if (oldMonthData) monthStore.put(oldMonthData);
        monthStore.put(newMonthData);

        return new Promise((resolve, reject) => {
            txDB.oncomplete = () => resolve(true);
            txDB.onerror = (e) => reject(new Error(`Month Change Failed: ${e.target.error}`));
        });
    } catch (error) {
        // Log the error and re-throw
        console.error("Month Change Failed before DB commit:", error);
        // Rollback (best effort)
        this.data.currentMonth = oldMonthStr;
        if (oldMonthData) oldMonthData.tbb = tbbRolloverAmount; // Rollback TBB on failure
        if (newMonthData) newMonthData.updateTBB(-tbbRolloverAmount);
        
        throw new Error(`Month Change Failed: ${error.message}`);
    }
}
async addIncome(amount, note, accountId, date = Date.now()) {
    const filtered = await this.plugins.applyFilters('transaction:before_income', { amount, note, accountId });
    amount = filtered.amount;
    note = filtered.note;
    accountId = filtered.accountId;
    
    const account = this.getAccount(accountId);
    if (!account || account.type === 'credit') throw new Error('Invalid account for income');
    
    // Multi-currency: build metadata (use passed date)
    const meta = await this._buildCurrencyMeta(account, date);
    if (meta.exchangeRate) {
      meta.baseCurrencyAmount = this._calculateBaseCurrencyAmount(amount, account, meta.exchangeRate);
    }
    
    const monthData = await this.getCurrentMonthData();
    const oldMonthTBB = monthData.tbb;
    const oldAccountBalance = account.balance;
    
    // For TBB: use base currency amount if foreign, else native amount
    const tbbAmount = meta.baseCurrencyAmount || amount;
    
    try {
      const txDB = this.db.instance.transaction(['months', 'accounts'], 'readwrite');
      const monthStore = txDB.objectStore('months');
      const accountStore = txDB.objectStore('accounts');
      
      monthData.updateTBB(tbbAmount);
      account.setReconciled(false);
      account.addTransaction('income', amount, note, null, date, meta);
      
      monthStore.put(monthData);
      accountStore.put(account);
      
      this.plugins.emit('transaction:income_logged', { amount, note, accountId });
      
      return new Promise((resolve, reject) => {
        txDB.oncomplete = () => resolve(true);
        txDB.onerror = (e) => reject(new Error(`Add Income Failed: ${e.target.error}`));
      });
    } catch (error) {
      monthData.tbb = oldMonthTBB;
      account.balance = oldAccountBalance;
      throw new Error(`Add Income Failed: ${error.message}`);
    }
  }
  
  async editArchivedTransaction(accountId, txId, newAmount, newNote) {
    const acc = this.getAccount(accountId);
    if (!acc) throw new Error('Account not found');

    const tx = this.db.instance.transaction(['accounts', 'archivedTransactions'], 'readwrite');
    const archiveStore = tx.objectStore('archivedTransactions');
    const accountStore = tx.objectStore('accounts');
    const index = archiveStore.index('accountId');

    return new Promise((resolve, reject) => {
      // 1. Get all blocks for this account
      const request = index.getAll(accountId);

      request.onsuccess = () => {
        const blocks = request.result;
        let foundBlock = null;
        let foundTxIndex = -1;

        // 2. Find the block containing the transaction
        for (const block of blocks) {
          const idx = block.transactions.findIndex(t => t.id === txId);
          if (idx !== -1) {
            foundBlock = block;
            foundTxIndex = idx;
            break;
          }
        }

        if (!foundBlock) {
          reject(new Error('Transaction not found in archives.'));
          return;
        }

        // 3. Calculate Delta
        const oldTx = foundBlock.transactions[foundTxIndex];
        const oldAmount = oldTx.amount;
        const delta = newAmount - oldAmount;

        // 4. Update the Transaction inside the Block
        oldTx.amount = newAmount;
        oldTx.note = newNote;
        oldTx.updatedAt = Date.now();

        // 5. Update the Block Metadata
        foundBlock.endBalance += delta;

        // 6. Update the ACTIVE Account Snapshot
        acc.snapshotBalance += delta; 
        acc.updatedAt = Date.now();

        // 7. Save Both
        archiveStore.put(foundBlock);
        accountStore.put(acc);
        
        // Optional: Update linked Jar if needed (omitted for simplicity)

        tx.oncomplete = () => {
            console.log(`🩹 Patched archive block ${foundBlock.id}. Delta: ${delta}`);
            resolve();
        };
      };
      
      request.onerror = (e) => reject(e);
    });
  }
  
async addFundsToEnvelope(envelopeId, amount, note) {
    const envelope = this.getEnvelope(envelopeId);
    if (!envelope) throw new Error('Envelope not found');
    const monthData = await this.getCurrentMonthData();
    if (amount > monthData.tbb) throw new Error('Insufficient TBB');
    
    const oldMonthTBB = monthData.tbb;
    const oldMonthBudgeted = monthData.budgeted;
    // No need to track oldEnvelopeBalance manually

    try {
      const txDB = this.db.instance.transaction(['months', 'envelopes'], 'readwrite');
      const monthStore = txDB.objectStore('months');
      const envelopeStore = txDB.objectStore('envelopes');
      
      // 1. Update in-memory objects
      monthData.updateTBB(-amount);
      monthData.updateBudgeted(amount);
      envelope.setBudget(this.data.currentMonth, (envelope.budgets[this.data.currentMonth] || 0) + amount);
      
      // DYNAMIC FIX: Just add the transaction. The balance getter handles the math.
      envelope.addTransaction('add', amount, note);
      
      // 2. Put objects into transaction
      monthStore.put(monthData);
      envelopeStore.put(envelope);
      
      return new Promise((resolve, reject) => {
        txDB.oncomplete = () => resolve(true);
        txDB.onerror = (e) => reject(new Error(`Add Funds Failed: ${e.target.error}`));
      });
    } catch (error) {
      // Rollback
      monthData.tbb = oldMonthTBB;
      monthData.budgeted = oldMonthBudgeted;
      // envelope balance reverts automatically because we didn't save the transaction
      throw new Error(`Add Funds Failed: ${error.message}`);
    }
  }
async logSpend(envelopeId, amount, note, accountId, splits = [], date = Date.now()) {
    // 1. [PLUGIN HOOK] Filter Data Before Logic
    const context = { envelopeId, amount, note, accountId, splits };

    // Plugins can modify the amount (e.g. currency conversion), note (auto-tagging), or splits
    const filtered = await this.plugins.applyFilters('transaction:before_spend', context);

    // Destructure back the potentially modified values
    envelopeId = filtered.envelopeId;
    amount = filtered.amount;
    note = filtered.note;
    accountId = filtered.accountId;
    splits = filtered.splits;  
    
    
    const account = this.getAccount(accountId);
    if (!account) throw new Error('Account not found');
    const isCredit = account.type === 'credit';
    let ccJar = null;
    if (isCredit) {
      ccJar = Array.from(this.data.envelopes.values()).find(e => e.type === 'cc_payment' && e.linkedAccountId === accountId);
      if (!ccJar) throw new Error('CC payment jar not found');
    }

    // Pre-flight checks
    if (splits.length > 0) {
      const totalSplit = splits.reduce((sum, s) => sum + s.amt, 0);
      if (totalSplit !== amount) throw new Error('Splits must sum to total');
      splits.forEach(split => {
        const env = this.getEnvelope(split.jar);
        if (!env || split.amt > env.balance) throw new Error(`Insufficient in ${env?.name || 'unknown'} jar`);
      });
    } else {
      const env = this.getEnvelope(envelopeId);
      if (!env || amount > env.balance) throw new Error(`Insufficient in ${env.name} jar`);
    }

    const oldAccountBalance = account.balance;
    const updatedEnvelopes = new Set();

    if (splits.length > 0) {
      splits.forEach(split => {
        updatedEnvelopes.add(this.getEnvelope(split.jar));
        if (ccJar) updatedEnvelopes.add(ccJar);
      });
    } else {
      updatedEnvelopes.add(this.getEnvelope(envelopeId));
      if (ccJar) updatedEnvelopes.add(ccJar);
    }
    
    // Use passed 'date' for metadata
    const meta = await this._buildCurrencyMeta(account, date);
    if (meta.exchangeRate) {
      meta._rate = meta.exchangeRate;
    }
    
    try {
      await this.db.runTransaction(['accounts', 'envelopes'], 'readwrite', (stores) => {
          const splitId = Utils.generateId();
          // REMOVED: const now = Date.now(); -- use 'date' parameter instead
          let totalAccDelta = 0;

          if (splits.length > 0) {
            splits.forEach(split => {
              const env = this.getEnvelope(split.jar);
              if (isCredit) {
                env.addTransaction('transfer', -split.amt, `CC: ${note}`, ccJar.name, splitId, accountId, date);
                ccJar.addTransaction('transfer', split.amt, `CC: ${note}`, env.name, splitId, null, date);
              } else {
                env.addTransaction('spend', -split.amt, note, '', splitId, accountId, date); 
              }
              totalAccDelta -= split.amt;
            });
          } else {
            const env = this.getEnvelope(envelopeId);
            if (isCredit) {
              env.addTransaction('transfer', -amount, `CC: ${note}`, ccJar.name, splitId, accountId, date);
              ccJar.addTransaction('transfer', amount, `CC: ${note}`, env.name, splitId, null, date);
            } else {
              env.addTransaction('spend', -amount, note, '', null, accountId, date);
            }
            totalAccDelta -= amount;
          }
          
          if (meta._rate) {
            meta.baseCurrencyAmount = this._calculateBaseCurrencyAmount(totalAccDelta, account, meta._rate);
          }
          account.setReconciled(false);
          account.addTransaction('spend', totalAccDelta, note, envelopeId || (splits.length > 0 ? 'split' : null), date);
          
          stores.accounts.put(account);
          updatedEnvelopes.forEach(env => {
            stores.envelopes.put(env);
          });
      });

      this.debouncedTrainML();
      this.plugins.emit('transaction:spend_logged', {
          envelopeId, amount, note, accountId, splits, timestamp: date
      });
      return true;
    } catch (error) {
      account.balance = oldAccountBalance;
      throw new Error(`Log Spend Failed: ${error.message}`);
    }
  }
  
async getSmartCoverSuggestions(targetJarId, amount) {
      const targetJar = this.getEnvelope(targetJarId);
      if (!targetJar) throw new Error("Target jar not found");

      const deficit = amount - targetJar.balance;
      if (deficit <= 0) return null; // No cover needed

      const forecaster = new BudgetForecaster(this.data.envelopes, this.data.accounts);
      
      // [FIX] Added 'await' here to handle the async forecaster
      const candidates = await forecaster.rankJarsForCovering(deficit, targetJarId, Array.from(this.data.scheduled.values()));

      let remaining = deficit;
      const plan = [];

      // Greedy Selection Strategy
      for (const cand of candidates) {
          if (remaining <= 0) break;
          
          const take = Math.min(remaining, cand.available);
          plan.push({
              fromJar: cand.jar,
              amount: take
          });
          remaining -= take;
      }

      if (remaining > 0) {
          return { success: false, deficit: remaining };
      }

      return { success: true, plan };
  }

  async applySmartCoverAndSpend(targetJarId, amount, note, accountId, coverPlan, date = Date.now()) {
      // Execute the Cover Transfers AND the Spend in one atomic block
      try {
          const stores = ['envelopes', 'accounts'];
          await this.db.runTransaction(stores, 'readwrite', (stores) => {
              const targetEnv = this.getEnvelope(targetJarId);
              const account = this.getAccount(accountId);
              const splitId = Utils.generateId(); // Link moves together

              // 1. Execute Covers
              coverPlan.forEach(move => {
                  const sourceEnv = this.getEnvelope(move.fromJar.id);
                  const note = `Cover for ${targetEnv.name}`;
                  
                  // Move money: Source -> Target
                  sourceEnv.addTransaction('transfer', -move.amount, note, targetEnv.name, splitId);
                  targetEnv.addTransaction('transfer', move.amount, note, sourceEnv.name, splitId);
                  
                  stores.envelopes.put(sourceEnv);
              });

              // 2. Execute the Spend (Now fully funded)
              // We call the logic manually here to keep it inside this specific transaction block
              targetEnv.addTransaction('spend', -amount, note, '', splitId, accountId, date);
              account.addTransaction('spend', -amount, note, targetJarId, date);

              stores.envelopes.put(targetEnv);
              stores.accounts.put(account);
          });
          this.plugins.emit('transaction:spend_logged', {
              jarId: targetJarId,
              amount,
              note,
              accountId,
              smartCover: true
          });
          this.debouncedTrainML();
          return true;
      } catch (e) {
          throw new Error("Smart Cover Failed: " + e.message);
      }
  }
  
  
async transfer(fromId, toId, amount, note) {
    const fromEnv = this.getEnvelope(fromId);
    const toEnv = this.getEnvelope(toId);
    if (!fromEnv || !toEnv || fromId === toId || amount <= 0 || amount > fromEnv.balance) {
      throw new Error('Invalid transfer');
    }
    
    // No need to store old balances manually

    try {
      const txDB = this.db.instance.transaction(['envelopes'], 'readwrite');
      const envelopeStore = txDB.objectStore('envelopes');
      const splitId = Utils.generateId();
      
      // DYNAMIC FIX: Just add transactions.
      fromEnv.addTransaction('transfer', -amount, note, toEnv.name, splitId);
      toEnv.addTransaction('transfer', amount, note, fromEnv.name, splitId);
      
      envelopeStore.put(fromEnv);
      envelopeStore.put(toEnv);
      this.plugins.emit('transaction:transfer', {
          fromId,
          toId,
          amount,
          note
      });
      
      return new Promise((resolve, reject) => {
        txDB.oncomplete = () => resolve(true);
        txDB.onerror = (e) => reject(new Error(`Transfer Failed: ${e.target.error}`));
      });
    } catch (error) {
      // Revert in memory is handled by reloading or just failing before save
      throw new Error(`Transfer Failed: ${error.message}`);
    }
  }
  async coverOverspend(fromId, toId, amount, note) {
    return this.transfer(fromId, toId, amount, note); // Same logic
  }
 async applyScheduled(id) {
    const scheduled = this.getScheduled(id);
    if (!scheduled) throw new Error('Scheduled not found');
    
    const account = this.getAccount(scheduled.accountId);
    if (!account) throw new Error('Account not found');
    
    const env = scheduled.envelopeId ? this.getEnvelope(scheduled.envelopeId) : null;
    const monthData = await this.getCurrentMonthData();
    
    // --- Rollback Snapshots ---
    const oldAccountBalance = account.balance;
    const oldMonthTBB = monthData.tbb;
    let oldEnvBalance = 0;
    let ccJar = null;

    // Setup for Expense logic rollback
    if (account.type === 'credit') {
      ccJar = Array.from(this.data.envelopes.values()).find(e => e.type === 'cc_payment' && e.linkedAccountId === account.id);
      if (!ccJar && (scheduled.type || 'expense') === 'expense') throw new Error('CC jar not found');
      oldEnvBalance = env ? env.balance : 0;
    } else if (env) {
      oldEnvBalance = env.balance;
    }

    try {
      // The transaction must include all potential stores
      const stores = ['scheduled', 'accounts', 'envelopes', 'months'];
      const txDB = this.db.instance.transaction(stores, 'readwrite');
      
      const scheduledStore = txDB.objectStore('scheduled');
      const accountStore = txDB.objectStore('accounts');
      const envelopeStore = txDB.objectStore('envelopes');
      const monthStore = txDB.objectStore('months');

      const note = `Scheduled: ${scheduled.name}`;
      const type = scheduled.type || 'expense'; // Check type (default to expense)

      // --- BRANCH LOGIC: INCOME VS EXPENSE ---
      if (type === 'income') {
          // 1. INCOME LOGIC
          // Add to Account
          account.setReconciled(false);
          account.addTransaction('income', scheduled.amount, note, null); // Income usually has no jar

          // Add to TBB
          monthData.updateTBB(scheduled.amount);

          // Save
          accountStore.put(account);
          monthStore.put(monthData);

      } else {
          // 2. EXPENSE LOGIC (Your existing logic)
          let delta = -scheduled.amount;
          const splitId = Utils.generateId();

          if (account.type === 'credit') {
            if (env) {
              if (scheduled.amount > env.balance) throw new Error('Insufficient envelope balance');
              env.addTransaction('transfer', -scheduled.amount, `CC: ${note}`, ccJar.name, splitId, scheduled.accountId);
            } else {
              if (scheduled.amount > monthData.tbb) throw new Error('Insufficient TBB');
              monthData.updateTBB(-scheduled.amount);
            }
            ccJar.addTransaction('transfer', scheduled.amount, `CC: ${note}`, env ? env.name : 'TBB', splitId);
            envelopeStore.put(ccJar);
          } else {
            if (env) {
              if (scheduled.amount > env.balance) throw new Error('Insufficient envelope balance');
              env.addTransaction('spend', -scheduled.amount, note, '', null, scheduled.accountId);
            } else {
              if (scheduled.amount > monthData.tbb) throw new Error('Insufficient TBB');
              monthData.updateTBB(-scheduled.amount);
            }
          }

          account.setReconciled(false);
          account.addTransaction('spend', delta, note, scheduled.envelopeId || null);
          
          // Save Expense Entities
          accountStore.put(account);
          if (env) envelopeStore.put(env);
          else monthStore.put(monthData);
          
          // If it was a CC expense coming from TBB, ensure monthData is saved
          if (account.type === 'credit' && !env) monthStore.put(monthData);
      }

      // --- COMMON: DATE ADVANCE / DELETE ---
      if (scheduled.frequency !== 'once') {
        scheduled.advanceDate();
        scheduledStore.put(scheduled);
      } else {
        scheduled.deleted = true;
        scheduled.updatedAt = Date.now();
        scheduledStore.put(scheduled);
        
        // Update in-memory map so UI filters it out, but Sync can still find it
        this.data.scheduled.set(id, scheduled);
      }

      return new Promise((resolve, reject) => {
        txDB.oncomplete = () => {
          this.debouncedTrainML();
          resolve(true);
        };
        txDB.onerror = (e) => reject(new Error(`Apply Scheduled Failed: ${e.target.error}`));
      });

    } catch (error) {
      // --- ROLLBACK ---
      account.balance = oldAccountBalance;
      monthData.tbb = oldMonthTBB;
      if (env) env.balance = oldEnvBalance;
      throw new Error(`Apply Scheduled Failed: ${error.message}`);
    }
  }
  async quickFundGoals() {
    const monthData = await this.getCurrentMonthData();
    let totalFunded = 0;
    const oldMonthTBB = monthData.tbb;
    const oldEnvelopes = new Map();
    Array.from(this.data.envelopes.values()).forEach(env => {
      oldEnvelopes.set(env.id, env.balance);
    });
    try {
      const txDB = this.db.instance.transaction(['months', 'envelopes'], 'readwrite');
      const monthStore = txDB.objectStore('months');
      const envelopeStore = txDB.objectStore('envelopes');
      const envsToUpdate = [];
      Array.from(this.data.envelopes.values()).forEach(env => {
        const budget = env.budgets[this.data.currentMonth] || 0;
        if (budget > 0 && env.balance < budget) {
          const needed = budget - env.balance;
          if (needed <= monthData.tbb) {
            monthData.updateTBB(-needed);
            env.addTransaction('add', needed, 'Quick fund goal');
            totalFunded += needed;
            envsToUpdate.push(env);
          }
        }
      });
      if (totalFunded > 0) {
        monthStore.put(monthData);
        envsToUpdate.forEach(env => envelopeStore.put(env));
        return new Promise((resolve, reject) => {
          txDB.oncomplete = () => resolve(totalFunded);
          txDB.onerror = (e) => reject(new Error(`Quick Fund Failed: ${e.target.error}`));
        });
      } else {
        throw new Error('No goals to fund or insufficient TBB');
      }
    } catch (error) {
      // Rollback
      monthData.tbb = oldMonthTBB;
      oldEnvelopes.forEach((oldBal, envId) => {
        const env = this.getEnvelope(envId);
        if (env) env.balance = oldBal;
      });
      throw error;
    }
  }
  
  
async smartFund() {
    const monthData = await this.getCurrentMonthData();
    let tbb = monthData.tbb;
    
    // --- FIX: Capture initial state for rollback ---
    const oldMonthTBB = tbb; 

    // --- LOGGING START ---
    console.group('✨ SMART-FUND DETAILED REPORT');
    console.log(`💰 Starting TBB: ${Utils.formatCurrency(tbb)}`);
    console.log(`📅 Target Month: ${this.data.currentMonth}`);

    if (tbb <= 0) {
        console.groupEnd();
        throw new Error("No funds available in 'To Be Budgeted' to Smart-Fund.");
    }
    const currentMonthStr = this.data.currentMonth;
    
    // 1. Setup Tracking Maps
    const allocations = new Map(); 
    const virtualBalances = new Map(); 
    const virtualBudgeted = new Map();
    const skippedBills = [];
    // --- SMART FIX: Calculate "Real Inflow" ---
    // Instead of trusting the static budget number, we sum actual money moved in this month.
    // This counts "Add Funds", "Transfers", and "Income" as valid funding.
    Array.from(this.data.envelopes.values()).forEach(e => {
        virtualBalances.set(e.id, e.balance);
        
        // Sum all positive inflows for this month
        const realMonthlyInflow = e.transactions
            .filter(t => 
                !t.deleted && 
                t.amount > 0 && // Positive only (Money coming IN)
                new Date(t.date).toISOString().startsWith(currentMonthStr)
            )
            .reduce((sum, t) => sum + t.amount, 0);
            
        virtualBudgeted.set(e.id, realMonthlyInflow);
    });
    
    // Capture old balances for rollback
    const oldBalances = new Map();
    Array.from(this.data.envelopes.values()).forEach(jar => oldBalances.set(jar.id, jar.balance));

    const stageAllocation = (jar, amount) => {
        if (amount <= 0) return;
        const current = allocations.get(jar.id) || 0;
        allocations.set(jar.id, current + amount);
        
        // Update virtual trackers so subsequent logic sees the new money
        virtualBalances.set(jar.id, virtualBalances.get(jar.id) + amount);
        virtualBudgeted.set(jar.id, virtualBudgeted.get(jar.id) + amount);
    };

    try {
        const txDB = this.db.instance.transaction(['months', 'envelopes', 'accounts'], 'readwrite');
        const monthStore = txDB.objectStore('months');
        const envelopeStore = txDB.objectStore('envelopes');
        
        // =========================================================
        // PHASE 1: SCHEDULED BILLS (WATERFALL)
        // Bills get priority based on checking if the JAR BALANCE can cover them.
        // =========================================================
        const scheduled = Array.from(this.data.scheduled.values())
            .filter(s => !s.deleted && s.type !== 'income'); 

        const today = new Date();
        const nextMonth = new Date(today);
        nextMonth.setMonth(today.getMonth() + 1);

        console.groupCollapsed(`🌊 PHASE 1: Bills (Waterfall)`);
        
        for (const bill of scheduled) {
            if (tbb <= 0) {
                console.log(`⚠️ TBB ran out! Stopping bill funding.`);
                break; 
            }

            const nextDueDate = bill.nextDate();
            // Filter: Only pay bills due this month or next month
            if (nextDueDate.toISOString().slice(0, 7) !== currentMonthStr && nextDueDate.getMonth() !== nextMonth.getMonth()) {
                continue;
            }

            let jar = this.getEnvelope(bill.envelopeId);
            if (jar && jar.deleted) jar = null;

            const needed = bill.amount;
            let amountToFund = 0;
            let logDetail = `Bill: ${bill.name} | Amount: ${Utils.formatCurrency(needed)}`;

            if (jar) {
                // Bills care about BALANCE (Can I pay this?)
                const currentBal = virtualBalances.get(jar.id);
                amountToFund = Math.max(0, needed - currentBal);
                logDetail += ` | Jar Bal: ${Utils.formatCurrency(currentBal)}`;
            } else {
                amountToFund = needed; 
                logDetail += ` | Unlinked`;
            }
            
            if (amountToFund > 0) {
                const amt = Math.min(tbb, amountToFund);
                
                if (jar) {
                   stageAllocation(jar, amt);
                   tbb -= amt; 
                   console.log(`✅ ${logDetail} -> FUNDING ${Utils.formatCurrency(amt)}`);
                } else {
                    console.log(`⚠️ ${logDetail} -> SKIPPED (No Jar Linked)`);
                    skippedBills.push(bill.name);
                }
            } else {
                console.log(`okk ${logDetail} -> Fully Covered.`);
            }
        }
        console.groupEnd(); 

        // =========================================================
        // PHASE 2: GOALS (PROPORTIONAL DISTRIBUTION)
        // =========================================================
        console.groupCollapsed(`⚖️ PHASE 2: Goal Calculation (TBB Left: ${Utils.formatCurrency(tbb)})`);

        if (tbb > 0) {
            const goalDemands = [];
            let totalGoalDemand = 0;

            const allJars = Array.from(this.data.envelopes.values()).filter(e => !e.deleted);

            for (const jar of allJars) {
                let monthlyGap = 0;
                
                const currentBal = virtualBalances.get(jar.id); 
                // Uses the Real Inflow we calculated at the start
                const currentBud = virtualBudgeted.get(jar.id); 

                let calcLog = `[${jar.name}] Goal: ${Utils.formatCurrency(jar.goalAmount)}`;

                if (jar.goalType === 'monthly' && jar.goalAmount > 0) {
                    monthlyGap = Math.max(0, jar.goalAmount - currentBud);
                    calcLog += ` (Monthly) - Inflow: ${Utils.formatCurrency(currentBud)} = GAP: ${Utils.formatCurrency(monthlyGap)}`;
                } 
                else if (jar.goalType === 'target' && jar.goalAmount > 0) {
                    if (jar.targetDate) {
                        // Calculate start-of-month balance to determine pace
                        const startOfMonthBalance = Math.max(0, currentBal - currentBud);
                        const totalRemaining = Math.max(0, jar.goalAmount - startOfMonthBalance);
                        
                        const target = new Date(jar.targetDate);
                        const monthsDiff = (target.getFullYear() - today.getFullYear()) * 12 + (target.getMonth() - today.getMonth());
                        const monthsLeft = Math.max(1, monthsDiff);
                        
                        const requiredMonthlySlice = totalRemaining / monthsLeft;
                        monthlyGap = Math.max(0, requiredMonthlySlice - currentBud);
                        
                        calcLog += ` (Target Date) - Inflow: ${Utils.formatCurrency(currentBud)} = GAP: ${Utils.formatCurrency(monthlyGap)}`;
                    } else {
                        // Simple Target (fill until full)
                        monthlyGap = Math.max(0, jar.goalAmount - currentBal);
                        calcLog += ` (Target) - Balance: ${Utils.formatCurrency(currentBal)} = GAP: ${Utils.formatCurrency(monthlyGap)}`;
                    }
                }

                if (monthlyGap > 0) {
                    goalDemands.push({ jar, amount: monthlyGap });
                    totalGoalDemand += monthlyGap;
                    console.log(calcLog); 
                }
            }
            console.groupEnd(); 

            // --- THE DISTRIBUTION ---
            console.group(`💸 PHASE 3: Distribution`);
            if (totalGoalDemand > 0) {
                const ratio = Math.min(1, tbb / totalGoalDemand);
                
                console.log(`📊 TOTAL DEMAND: ${Utils.formatCurrency(totalGoalDemand)}`);
                console.log(`💵 AVAILABLE:   ${Utils.formatCurrency(tbb)}`);
                console.log(`🍰 RATIO: ${(ratio*100).toFixed(1)}%`);

                for (const item of goalDemands) {
                    const fairShare = Math.floor(item.amount * ratio);
                    
                    if (fairShare > 0) {
                        stageAllocation(item.jar, fairShare);
                        tbb -= fairShare; 
                        console.log(`✅ [${item.jar.name}] Gap: ${Utils.formatCurrency(item.amount)} -> GETS: ${Utils.formatCurrency(fairShare)}`);
                    }
                }
            } else {
                console.log("No goals need funding.");
            }
            console.groupEnd();
        } else {
            console.groupEnd(); 
            console.log("⚠️ Skipped Goals: No TBB left after bills.");
        }

        // =========================================================
        // PHASE 4: COMMIT
        // =========================================================
        const totalFunded = oldMonthTBB - tbb; 

        if (totalFunded === 0) {
             console.groupEnd();
             throw new Error("No bills or goals found to fund.");
        }

        monthData.updateTBB(-totalFunded);
        monthData.updateBudgeted(totalFunded); 
        monthStore.put(monthData);
        
        for (const [jarId, amount] of allocations.entries()) {
            const jar = this.data.envelopes.get(jarId);
            jar.budgets[currentMonthStr] = (jar.budgets[currentMonthStr] || 0) + amount;
            jar.addTransaction('add', amount, '✨ Smart-Fund');
            envelopeStore.put(jar);
        }
        
        console.log(`🏁 FINISHED. Total Allocated: ${Utils.formatCurrency(totalFunded)}`);
        console.groupEnd(); 
        
        return new Promise((resolve, reject) => {
            txDB.oncomplete = () => resolve({ totalFunded, skippedBills }); 
            txDB.onerror = (e) => {
                console.error("Smart-Fund DB Error:", e.target.error);
                reject(new Error(`Smart-Fund Failed: ${e.target.error}`));
            }
        });

    } catch (error) {
        monthData.tbb = oldMonthTBB; 
        oldBalances.forEach((oldBal, envId) => {
            const env = this.getEnvelope(envId);
            if (env) env.balance = oldBal;
        });
        console.error("✨ SMART-FUND FAILED:", error.message);
        console.groupEnd();
        throw error;
    }
}



async editTransaction(envelopeId, txIndex, newAmount, newDate, newNote) {
    const env = this.getEnvelope(envelopeId);
    if (!env || txIndex < 0 || txIndex >= env.transactions.length) throw new Error('Transaction not found');
    const tx = env.transactions[txIndex];
    // --- PRE-FETCH & ROLLBACK STATE ---
    const monthData = await this.getCurrentMonthData();
    // Pre-fetch monthData
    const oldAmount = tx.amount;
    const oldDate = tx.date; // FIX: Capture old date for lookup/rollback
    const oldNote = tx.note; // FIX: Capture old note for rollback
    const delta = newAmount - oldAmount;
    const oldEnvBalance = env.balance;
    const oldMonthTBB = monthData.tbb;
    const affectedEnvs = new Set([envelopeId]);

    // NEW: Identify and Fetch Linked Account Transaction
    let linkedAcc = null;
    let linkedTx = null;
    if (tx.accountId) {
        linkedAcc = this.getAccount(tx.accountId);
        if (linkedAcc) {
            // Find the matching transaction using OLD values (before we mutate them)
            linkedTx = linkedAcc.transactions.find(t => 
                t.date === oldDate && 
                t.amount === oldAmount && 
                t.jarId === envelopeId && 
                !t.deleted
            );
        }
    }

    // Gather all affected envelopes (including split partners)
    if (tx.splitId) {
      Array.from(this.data.envelopes.values()).forEach(otherEnv => {
        if (otherEnv.id !== envelopeId && otherEnv.transactions.some(t => t.splitId === tx.splitId)) {
          affectedEnvs.add(otherEnv.id);
        }
      });
    }
    const oldOtherBalances = new Map();
    affectedEnvs.forEach(id => {
      if (id !== envelopeId) {
        const other = this.getEnvelope(id);
        if (other) oldOtherBalances.set(id, other.balance);
      }
    });
    // --- END PRE-FETCH ---

    try {
      const stores = ['envelopes'];
      if (tx.type === 'add') stores.push('months');
      if (linkedAcc) stores.push('accounts'); // NEW: Request access to accounts store
        
      // --- PERFORM IN-MEMORY UPDATES ---
      tx.amount = newAmount;
      tx.date = new Date(newDate).getTime() || Date.now();
      tx.note = newNote || tx.note;
      tx.updatedAt = Date.now(); // Ensure sync sees this update

      // NEW: Update the linked account transaction to match
      if (linkedTx) {
          linkedTx.amount = newAmount;
          linkedTx.date = tx.date;
          linkedTx.note = tx.note;
          linkedTx.updatedAt = Date.now();
      }

      // Handle special cases like add (affect TBB)
      if (tx.type === 'add') {
        monthData.updateTBB(-delta);
        // Reverse old, apply new
      }
    
      // Handle splits if applicable
      if (tx.splitId) {
        for (const otherEnv of Array.from(this.data.envelopes.values())) {
          if (otherEnv.id === envelopeId) continue;
          const otherTx = otherEnv.transactions.find(t => t.splitId === tx.splitId);
          if (otherTx) {
            otherTx.amount = -newAmount;
            // Update split transaction amount
            // Also update date so they stay chronologically synced
            otherTx.date = tx.date; 
            otherTx.updatedAt = Date.now();
          }
        }
      }
      // --- END IN-MEMORY UPDATES ---
        
      await this.db.runTransaction(stores, 'readwrite', (stores) => {
        stores.envelopes.put(env);
        if (linkedAcc) stores.accounts.put(linkedAcc); // NEW: Save the account
        
        // Put all affected split partners
        affectedEnvs.forEach(id => {
             if (id !== envelopeId) stores.envelopes.put(this.getEnvelope(id));
        });
        // Put month data if applicable
        if (stores.months) {
          stores.months.put(monthData);
        }
      });
      this.debouncedTrainML();
      return true;
      
    } catch (error) {
      // --- ROLLBACK ---
      env.balance = oldEnvBalance;
      
      // NEW: Rollback account transaction
      if (linkedTx) {
          linkedTx.amount = oldAmount;
          linkedTx.date = oldDate;
          linkedTx.note = oldNote;
      }

      if (tx.type === 'add') {
        monthData.tbb = oldMonthTBB;
      }
      oldOtherBalances.forEach((oldBal, id) => {
        const other = this.getEnvelope(id);
        if (other) other.balance = oldBal;
      });
      // Rollback the transaction object itself to avoid confusing the next action
      tx.amount = oldAmount;
      tx.date = oldDate;
      tx.note = oldNote;
      // --- END ROLLBACK ---
      throw new Error(`Edit Transaction Failed: ${error.message}`);
    }
}
  
  
async deleteTransaction(envelopeId, txIndex) {
    const env = this.getEnvelope(envelopeId);
    if (!env || txIndex < 0 || txIndex >= env.transactions.length) throw new Error('Transaction not found');
    const tx = env.transactions[txIndex];
    // --- PRE-FETCH & ROLLBACK STATE ---
    const monthData = await this.getCurrentMonthData();
    // Pre-fetch monthData
    const delta = -tx.amount;
    // Reverse effect (to fix balance)
    const oldEnvBalance = env.balance;
    const oldMonthTBB = monthData.tbb;
    const affectedEnvs = new Set([envelopeId]);
    let affectedAccounts = [];
    
    // Identify affected split envelopes
    if (tx.splitId) {
      Array.from(this.data.envelopes.values()).forEach(otherEnv => {
        if (otherEnv.id !== envelopeId && otherEnv.transactions.some(t => t.splitId === tx.splitId)) {
          affectedEnvs.add(otherEnv.id);
        }
      });
    }
    // Identify affected account
    if (tx.accountId) {
      const acc = this.getAccount(tx.accountId);
      if (acc) affectedAccounts.push(acc);
    }
    
    // Snapshot balances for rollback
    const oldOtherBalances = new Map();
    affectedEnvs.forEach(id => {
      if (id !== envelopeId) {
        const other = this.getEnvelope(id);
        if (other) oldOtherBalances.set(id, other.balance);
      }
    });
    const oldAccountBalances = new Map();
    affectedAccounts.forEach(acc => {
      oldAccountBalances.set(acc.id, acc.balance);
    });
    // --- END PRE-FETCH ---

    try {
      const stores = ['envelopes'];
      if (tx.type === 'add') stores.push('months');
      if (affectedAccounts.length > 0) stores.push('accounts');
      // --- PERFORM IN-MEMORY UPDATES (SOFT DELETE) ---
      
      // 1. Reverse Balance Impact (Money is technically "gone" from the budget view)
      
      // 2. Mark Envelope Transaction as Deleted (TOMBSTONE)
      tx.deleted = true;
      tx.updatedAt = Date.now();
      env.updatedAt = Date.now(); // Update Parent Container Timestamp
      
      // 3. Handle TBB if this was an 'add' transaction
      if (tx.type === 'add') {
        monthData.updateTBB(delta);
      }

      // 4. Handle Splits (Soft Delete related transactions)
      if (tx.splitId) {
        for (const otherEnv of Array.from(this.data.envelopes.values())) {
          if (otherEnv.id === envelopeId) continue;
          // Find the split partner
          const otherTx = otherEnv.transactions.find(t => t.splitId === tx.splitId && !t.deleted);
          if (otherTx) {
            otherTx.deleted = true;
            // Tombstone
            otherTx.updatedAt = Date.now();
            otherEnv.updatedAt = Date.now();
            // Update Parent
          }
        }
      }

      // 5. Handle Linked Account (Soft Delete account transaction)
      if (tx.accountId) {
        const acc = this.getAccount(tx.accountId);
        if (acc) {
          // Find the linked account transaction 
          // Note: We match by properties since account txs don't always share IDs with envelope txs in this model
          // FIX: Use 'envelopeId' (argument) instead of 'tx.envelopeId' (undefined on the tx object)
          const accTx = acc.transactions.find(t => 
              t.date === tx.date && 
              t.amount === tx.amount && 
              t.jarId === envelopeId && // <--- FIX HERE
              !t.deleted
          );
          if (accTx) {
            accTx.deleted = true;
            // Tombstone
            accTx.updatedAt = Date.now();
            acc.updatedAt = Date.now();
            // Update Parent
          }
        }
      }
      // --- END IN-MEMORY UPDATES ---

      // 6. Persist to DB
      await this.db.runTransaction(stores, 'readwrite', (stores) => {
        stores.envelopes.put(env);
        
        // Put other affected envelopes
        affectedEnvs.forEach(id => {
             if (id !== envelopeId) stores.envelopes.put(this.getEnvelope(id));
        });
        
        // Put month data
        if (stores.months) stores.months.put(monthData);
        
        // Put account data
        if (stores.accounts) affectedAccounts.forEach(acc => stores.accounts.put(acc));
      });
      this.debouncedTrainML();
      return true;
      
    } catch (error) {
      // --- ROLLBACK (Revert flags and balances) ---
      env.balance = oldEnvBalance;
      // Un-delete logic
      tx.deleted = false; 
      delete tx.updatedAt;
      // Optional: clear timestamp or revert it if you tracked it

      if (tx.type === 'add') {
        monthData.tbb = oldMonthTBB;
      }
      
      oldOtherBalances.forEach((oldBal, id) => {
        const other = this.getEnvelope(id);
        if (other) {
            other.balance = oldBal;
            // Revert split deleted status
            const otherTx = other.transactions.find(t => t.splitId === tx.splitId && t.deleted);
            if(otherTx) 
                otherTx.deleted = false;
        }
      });
      oldAccountBalances.forEach((oldBal, accId) => {
        const acc = this.getAccount(accId);
        if (acc) {
            acc.balance = oldBal;
             // Revert account deleted status
             // FIX: Use 'envelopeId' here for rollback lookup as well
             const accTx = acc.transactions.find(t => t.date === tx.date && t.amount === tx.amount && t.jarId === envelopeId && t.deleted);
             if(accTx) accTx.deleted = false;
        }
      });
      // --- END ROLLBACK ---
      throw new Error(`Delete Transaction Failed: ${error.message}`);
    }
}
  generateTaxReport(accountId, financialYear) {
  const account = this.getAccount(accountId);
  if (!account) throw new Error('Account not found');
  
  const tracker = new LotTracker(account, this.baseCurrency);
  return tracker.generateTaxReport(financialYear);
}

exportTaxCSV(accountId, financialYear) {
  const account = this.getAccount(accountId);
  if (!account) throw new Error('Account not found');
  
  const tracker = new LotTracker(account, this.baseCurrency);
  const report = tracker.generateTaxReport(financialYear);
  
  // Build CSV
  let csv = 'Date,Units Disposed,Proceeds (AUD),Cost Basis (AUD),Gain/Loss,CGT Discount,Taxable Gain,Holding Period\n';
  
  for (const event of report.events) {
    const date = new Date(event.disposalDate).toISOString().split('T')[0];
    const units = fromSmallestUnit(event.units, account.currency).toFixed(8);
    const proceeds = (event.proceeds / 100).toFixed(2);
    const cost = (event.costBasis / 100).toFixed(2);
    const gain = (event.gain / 100).toFixed(2);
    const discount = (event.discountableGain / 100).toFixed(2);
    const taxable = (event.taxableGain / 100).toFixed(2);
    const holding = event.isLongTerm ? '>12 months' : '<12 months';
    
    csv += `${date},${units},${proceeds},${cost},${gain},${discount},${taxable},${holding}\n`;
  }
  
  csv += `\n`;
  csv += `SUMMARY FY${financialYear}\n`;
  csv += `Total Proceeds,$${(report.summary.totalProceeds / 100).toFixed(2)}\n`;
  csv += `Total Cost Basis,$${(report.summary.totalCostBasis / 100).toFixed(2)}\n`;
  csv += `Total Gain/Loss,$${(report.summary.totalGain / 100).toFixed(2)}\n`;
  csv += `CGT Discount Applied,$${(report.summary.totalDiscount / 100).toFixed(2)}\n`;
  csv += `Net Taxable Gain,$${(report.summary.totalTaxable / 100).toFixed(2)}\n`;
  
  return csv;
}

downloadTaxCSV(accountId, financialYear) {
  const csv = this.exportTaxCSV(accountId, financialYear);
  const account = this.getAccount(accountId);
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${account.name}_CGT_FY${financialYear}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
  
  
async reassignTransaction(envelopeId, txId, newEnvelopeId) {
        const oldEnv = this.getEnvelope(envelopeId);
        const newEnv = this.getEnvelope(newEnvelopeId);
        if (!oldEnv || !newEnv) throw new Error('Envelope not found');
        
        const tx = oldEnv.transactions.find(t => t.id === txId);
        if (!tx || tx.type !== 'spend') throw new Error('Transaction not found or invalid type');

        // Capture data for account lookup before modifying tx
        const { accountId, amount, date } = tx;

        try {
            const stores = ['envelopes'];
            if (accountId) stores.push('accounts'); // We need to update the account too

            const txDB = this.db.instance.transaction(stores, 'readwrite');
            const envelopeStore = txDB.objectStore('envelopes');
            const accountStore = accountId ? txDB.objectStore('accounts') : null;
            
            tx.envelopeId = newEnvelopeId;

            // 1. Update Envelopes
            const oldTxIdx = oldEnv.transactions.findIndex(t => t.id === txId);
            if (oldTxIdx > -1) {
                oldEnv.transactions.splice(oldTxIdx, 1);
            }
            newEnv.addTransaction('spend', -Math.abs(tx.amount), tx.note, '', tx.splitId, tx.accountId);
            
            envelopeStore.put(oldEnv);
            envelopeStore.put(newEnv);

            // 2. Sync with Account (The Fix)
            if (accountId && accountStore) {
                const acc = this.getAccount(accountId);
                if (acc) {
                    // Find the account-side transaction matching this jar transaction
                    const accTx = acc.transactions.find(t => 
                        !t.deleted &&
                        t.amount === amount &&
                        t.date === date && 
                        t.jarId === envelopeId // Look for OLD jar ID
                    );

                    if (accTx) {
                        accTx.jarId = newEnvelopeId; // Point to NEW jar ID
                        accTx.updatedAt = Date.now();
                        accountStore.put(acc);
                    } else {
                        console.warn("Could not find linked account transaction to update.");
                    }
                }
            }
            
            return new Promise((resolve, reject) => {
                txDB.oncomplete = () => resolve(true);
                txDB.onerror = (e) => reject(new Error(`Reassign Failed: ${e.target.error}`));
            });
        } catch (error) {
            throw new Error(`Reassign Failed: ${error.message}`);
        }
    }
}
