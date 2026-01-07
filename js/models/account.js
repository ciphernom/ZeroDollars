// js/models/account.js
import { Utils } from '../utils/index.js';

export class Account {
  constructor(data = {}) {
    this.id = data.id || Utils.generateId();
    this.name = data.name || '';
    this.type = data.type || 'cash';
    this.currency = data.currency || 'AUD';  
    this.status = data.status || 'open';
    this.reconciled = data.reconciled || false;
    
    // Active "Hot" Transactions (The tip)
    this.transactions = data.transactions || [];
    
    // "Cold" Storage Sum (The Checkpoint)
    this.snapshotBalance = data.snapshotBalance || 0; 
    
    // Integrity Hash (Links current state to pruned history)
    this.lastArchiveHash = data.lastArchiveHash || null;

    this.updatedAt = data.updatedAt || Date.now();
    this.deleted = data.deleted || false;
    
    // If loading legacy data that had a hardcoded 'balance' but no snapshot,
    // we trust the transactions + snapshot to equal that balance. 
    // However, for migration simplicity, we assume data passed in is clean.
  }

  /**
   * DYNAMIC BALANCE GETTER
   * Balance = Snapshot (Archived) + Sum of Active Transactions
   */
  get balance() {
    const activeSum = this.transactions
        .filter(t => !t.deleted)
        .reduce((sum, t) => sum + t.amount, 0);
    
    // Floating point safety check (round to integer cents if needed, but usually fine in JS integers)
    return this.snapshotBalance + activeSum;
  }

  /**
   * Setter to prevent overwriting the computed property.
   * Necessary because IndexedDB hydration might try to set 'balance'.
   */
  set balance(val) {
    // No-op. We derive balance, we don't store it.
  }

  /**
   * DEPRECATED: updateBalance
   * We no longer manually shift a balance number. 
   * We simply add a transaction, and the getter handles the math.
   */
  updateBalance(delta) {
    // No-op
  }

addTransaction(type, amount, note = '', jarId = null, date = Date.now(), meta = {}) {
    const tx = {
      id: Utils.generateId(),
      type,
      amount,
      date: typeof date === 'number' ? date : new Date(date).getTime(),
      note,
      jarId,
      // Currency metadata
      exchangeRate: meta.exchangeRate || null,
      baseCurrencyAmount: meta.baseCurrencyAmount || null,
      baseCurrency: meta.baseCurrency || null,
      // Lot tracking (for FIFO tax calc)
      lotId: meta.lotId || null,
      updatedAt: Date.now(),
      deleted: false
    };
    
    this.transactions.unshift(tx);
    this.updatedAt = Date.now();
    
    if (this.transactions.length > 2000) {
        console.warn(`Account ${this.name} has ${this.transactions.length} unpruned transactions!`);
    }
    
    return tx;
  }

  setReconciled(reconciled) {
    this.reconciled = reconciled;
  }

  setStatus(status) {
    this.status = status;
  }

  /**
   * PRUNING
   * Moves oldest transactions to 'archivedTransactions' store.
   * @param {IDBDatabase} dbInstance - Raw DB instance for atomic transaction
   */
  async archiveHistory(dbInstance) {
    const MAX_ACTIVE = 500; // Keep last 500 active (fast UI)
    const PRUNE_CHUNK = 200; // Prune 200 at a time when we exceed limit

    if (this.transactions.length <= MAX_ACTIVE) return false;

    // 1. Identify split point
    // transactions is sorted Newest -> Oldest (index 0 is new)
    // We want to keep indices 0 to MAX_ACTIVE.
    // We archive from MAX_ACTIVE to END.
    const transactionsToKeep = this.transactions.slice(0, MAX_ACTIVE);
    const transactionsToArchive = this.transactions.slice(MAX_ACTIVE);

    if (transactionsToArchive.length === 0) return false;

    console.log(`📦 Archiving ${transactionsToArchive.length} transactions for ${this.name}...`);

    // 2. Calculate value of the block being archived
    const archiveSum = transactionsToArchive
        .filter(t => !t.deleted)
        .reduce((sum, t) => sum + t.amount, 0);

    // 3. Hash the block (Deterministic Integrity Check)
    // Use Utils.canonicalize to ensure consistent hashing across devices
    const canonicalData = Utils.canonicalize(transactionsToArchive); 
    const payload = JSON.stringify(canonicalData) + (this.lastArchiveHash || '');
    
    const buffer = new TextEncoder().encode(payload);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const blockHash = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0')).join('');

    // 4. Create Archive Block Object
    const archiveBlock = {
        id: Utils.generateId(), // Unique Block ID
        accountId: this.id,
        transactions: transactionsToArchive, // The actual data
        startBalance: this.snapshotBalance, // Balance BEFORE this block
        endBalance: this.snapshotBalance + archiveSum, // Balance AFTER this block
        prevHash: this.lastArchiveHash,
        hash: blockHash,
        createdAt: Date.now()
    };

    // 5. Atomic Write: Save Block AND Update Account State
    return new Promise((resolve, reject) => {
        const tx = dbInstance.transaction(['accounts', 'archivedTransactions'], 'readwrite');
        
        tx.objectStore('archivedTransactions').put(archiveBlock);

        // Update Local State (The Tip)
        this.transactions = transactionsToKeep;
        this.snapshotBalance += archiveSum; // Move money from "Active" to "Snapshot"
        this.lastArchiveHash = blockHash;
        this.updatedAt = Date.now();

        // Save Account with new state
        tx.objectStore('accounts').put(this);

        tx.oncomplete = () => resolve(true);
        tx.onerror = (e) => reject(e.target.error);
    });
  }
}
