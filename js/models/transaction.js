import { Utils } from '../utils/index.js';

export class ScheduledTransaction {
  constructor(data = {}) {
    this.id = data.id || Utils.generateId();
    this.name = data.name || '';
    this.amount = data.amount || 0;
    this.envelopeId = data.envelopeId || null;
    this.accountId = data.accountId || null;
    this.date = data.date || new Date().toISOString().split('T')[0];
    this.frequency = data.frequency || 'monthly';
    this.type = data.type || 'expense';
    this.updatedAt = data.updatedAt || Date.now();
    this.deleted = data.deleted || false;
  }
nextDate() {
    let next = new Date(this.date);
    next.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (next < today && this.frequency !== 'once') {
      const add = { 
          weekly: () => next.setDate(next.getDate() + 7), 
          fortnightly: () => next.setDate(next.getDate() + 14), 
          monthly: () => next.setMonth(next.getMonth() + 1), 
          quarterly: () => next.setMonth(next.getMonth() + 3),
          half_yearly: () => next.setMonth(next.getMonth() + 6), 
          yearly: () => next.setFullYear(next.getFullYear() + 1) 
      };
      while (next < today) {
        add[this.frequency]();
      }
    }
    return next;
  }
advanceDate() {
    // This function will now set the date to the next valid date *after* today
    const next = this.nextDate();
    // Get the date that just passed
    const add = { weekly: 7, fortnightly: 14, monthly: 1, quarterly: 3, half_yearly: 6, yearly: 1 };
    const setter = { weekly: 'Date', fortnightly: 'Date', monthly: 'Month', quarterly: 'Month', half_yearly: 'Month', yearly: 'FullYear' };
    const inc = add[this.frequency];
   
    if (inc) {
        // Start from the date that just passed (or was due)
        const newDate = new Date(next);
        // And increment it
        newDate['set' + setter[this.frequency]](newDate['get' + setter[this.frequency]]() + inc);
        this.date = newDate.toISOString().split('T')[0];
        
        // --- FIX: Update timestamp so Sync detects the date change ---
        this.updatedAt = Date.now(); 
    }
  }
}
