import { Utils } from '../utils/index.js';

export class Envelope {
  constructor(data = {}) {
    this.id = data.id || Utils.generateId();
    this.name = data.name || '';
    
    // STORAGE CHANGE: 
    // We now use 'snapshotBalance' as the baseline (for future archiving support).
    // The active 'balance' is calculated dynamically below.
    this.snapshotBalance = data.snapshotBalance || 0;
    
    this.budgets = data.budgets || {};
    this.transactions = data.transactions || [];
    this.type = data.type || 'default';
    this.linkedAccountId = data.linkedAccountId || null;
    this.goalType = data.goalType || null; 
    this.goalAmount = data.goalAmount || 0;
    this.targetDate = data.targetDate || null; 
    this.updatedAt = data.updatedAt || Date.now();
    this.deleted = data.deleted || false;
  }

  /**
   * DYNAMIC BALANCE GETTER
   * Balance = Snapshot (Archived/Base) + Sum of Active Transactions
   */
  get balance() {
    const activeSum = this.transactions
        .filter(t => !t.deleted)
        .reduce((sum, t) => sum + t.amount, 0);
    return this.snapshotBalance + activeSum;
  }

  /**
   * Setter is a no-op to prevent DB hydration from overwriting the dynamic getter
   */
  set balance(val) {
    // No-op. We derive balance, we don't store it.
  }

  addTransaction(type, amount, note = '', fromName = '', splitId = null, accountId = null, date = Date.now()) {
    const tx = {
      id: Utils.generateId(),
      type,
      amount,
      date: date,
      note,
      fromName,
      splitId,
      accountId,
      isAnomaly: false,
      updatedAt: Date.now(),
      deleted: false
    };
    
    this.transactions.unshift(tx);
    this.updatedAt = Date.now();
    
    // CRITICAL FIX: Removed the logic that sliced transactions > 100.
    // We must keep ALL history for the dynamic balance to stay correct
    // until we implement a proper 'archiveHistory' method for Envelopes later.
    
    return tx;
  }

  setBudget(month, amount) {
    this.budgets[month] = amount;
  }

  getForecast() {
    const now = new Date();
    const sixtyDaysAgo = now.getTime() - 60 * 24 * 60 * 60 * 1000;
    const spends = this.transactions.filter(tx => tx.type === 'spend' && tx.date > sixtyDaysAgo);
    
    if (spends.length < 3) return '';
    const totalSpend = spends.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const avgDaily = totalSpend / 60;
    return `~${Utils.formatCurrency(avgDaily * 30)}/month`;
  }

  getGoalProgress(currentMonth) {
    if (!this.goalType || this.goalAmount <= 0) return null;
    
    // Use the dynamic balance getter
    const currentBal = this.balance; 
    let progress = 0;
    let targetText = '';
    
    if (this.goalType === 'target') {
      progress = Math.min(100, Math.max(0, (currentBal / this.goalAmount) * 100));
      if (this.targetDate) {
        const now = new Date();
        const target = new Date(this.targetDate);
        const monthsDiff = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
        const monthsLeft = Math.max(1, monthsDiff);
        const needed = this.goalAmount - currentBal;
        
        if (needed > 0 && monthsLeft > 0) {
          const perMonth = needed / monthsLeft;
          targetText = `Need ${Utils.formatCurrency(perMonth)}/mo by ${target.toLocaleDateString()}`;
        } else if (currentBal >= this.goalAmount) {
             targetText = "Goal Reached! 🎉";
        } else if (monthsLeft <= 0) {
             targetText = `Target date missed! Still need ${Utils.formatCurrency(needed)}`;
        } else {
             targetText = `${Utils.formatCurrency(currentBal)} of ${Utils.formatCurrency(this.goalAmount)}`;
        }
      } else {
         targetText = `${Utils.formatCurrency(currentBal)} of ${Utils.formatCurrency(this.goalAmount)}`;
      }

    } else if (this.goalType === 'monthly') {
      const monthBudget = this.budgets[currentMonth] || 0;
      progress = Math.min(100, Math.max(0, (monthBudget / this.goalAmount) * 100));
      targetText = `${Utils.formatCurrency(monthBudget)} budgeted, need ${Utils.formatCurrency(this.goalAmount)}/mo`;
    }
    
    return { progress, targetText };
  }
}
