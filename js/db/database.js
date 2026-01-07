// Database Manager Class (Handles IndexedDB with atomic transactions)
export class DatabaseManager {
  /**
   * @param {string} name - DB name.
   * @param {number} version - DB version.
   */
  constructor(name = 'JamJarsDB', version = 7) {
    this.name = name;
    this.version = version;
    this.instance = null;
  }
  /**
   * Opens the database, handling upgrades/migrations.
   * @returns {Promise<IDBDatabase>} Opened DB instance.
   */
  async open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, this.version);
      request.onupgradeneeded = (event) => {
        this.instance = event.target.result;
        const tx = event.target.transaction;
        if (event.oldVersion < this.version) {
          this.performUpgrade(tx, event.oldVersion);
        }
      };
      request.onsuccess = (event) => {
        this.instance = event.target.result;
        resolve(this.instance);
      };
      request.onerror = (event) => reject(new Error(`DB Open Error: ${event.target.error?.message || event.target.errorCode}`));
    });
  }
  
  /**
   * Starts and manages an atomic transaction across multiple stores.
   * @param {string[]} storeNames - Stores.
   * @param {IDBTransactionMode} mode - Mode.
   * @param {Function} callback - Function receiving object stores for read/write.
   * @returns {Promise<void>} Completes on success.
   */
  async runTransaction(storeNames, mode = 'readonly', callback) {
    if (!this.instance) throw new Error('DB not open');
    const tx = this.instance.transaction(storeNames, mode);
    const stores = Object.fromEntries(storeNames.map(name => [name, tx.objectStore(name)]));
    
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = (event) => reject(new Error(`Transaction Aborted: ${event.target.error?.message || 'Unknown'}`));
      tx.onerror = (event) => reject(new Error(`Transaction Error: ${event.target.error?.message || event.target.errorCode}`));
      
      try {
        callback(stores); // Execute the transaction logic
      } catch (err) {
        // If an error occurs during logic execution, abort the transaction.
        tx.abort();
        reject(err);
      }
    });
  }
  
  /**
   * Performs DB upgrade/migration.
   * @param {IDBTransaction} tx - Upgrade transaction.
   * @param {number} oldVersion - Previous version.
   */
performUpgrade(tx, oldVersion) {
    
    
    if (oldVersion < 3) { // Bump version check
      console.log('Upgrading DB to V3...');
      
      // Define stores (Existing + NEW)
      const storesConfig = {
        appState: { keyPath: 'id' },
        envelopes: { keyPath: 'id' },
        accounts: { keyPath: 'id' },
        scheduled: { keyPath: 'id' },
        months: { keyPath: 'month' },
        settings: { keyPath: 'id' },
        // --- NEW COLD STORAGE ---
        archivedTransactions: { keyPath: 'id' } 
      };

      Object.entries(storesConfig).forEach(([name, options]) => {
        if (!this.instance.objectStoreNames.contains(name)) {
          this.instance.createObjectStore(name, options);
        }
      });

      // Create Index for fast lookup by account
      const archiveStore = tx.objectStore('archivedTransactions');
      if (!archiveStore.indexNames.contains('accountId')) {
          archiveStore.createIndex('accountId', 'accountId', { unique: false });
      }
      // Migrate from V1 if exists
      if (this.instance.objectStoreNames.contains('appData')) {
        const oldStore = tx.objectStore('appData');
        oldStore.get('main').onsuccess = (event) => {
          const oldData = event.target.result;
          if (oldData) {
            this.migrateV1Data(tx, oldData);
          }
          // Delete old store
          try {
            oldStore.delete('main');
          } catch (e) {
            console.warn('Could not delete old V1 store:', e);
          }
        };
      }
    }
    if (oldVersion < 4) {
        console.log('Upgrading DB to V4 (Plugin System)...');
        // Store for raw plugin code and metadata
        // Key: id (string), Value: { id, name, sourceCode, active, settings }
        if (!this.instance.objectStoreNames.contains('installed_plugins')) {
            const pluginStore = this.instance.createObjectStore('installed_plugins', { keyPath: 'id' });
        }
    }
    if (oldVersion < 5) {
        console.log('Upgrading DB to V5 (Multi-Currency)...');
        if (!this.instance.objectStoreNames.contains('exchangeRates')) {
            this.instance.createObjectStore('exchangeRates', { keyPath: 'id' });
        }
    }
    // --- NEW: Behavioral & Gamification Schema ---
    if (oldVersion < 7) { // Jumping to 7 to cover both features
        console.log('Upgrading DB to V7 (Behavior & Gamification)...');
        
        // 1. Metrics Store (Behavioral Events)
        if (!this.instance.objectStoreNames.contains('metrics')) {
            const metricsStore = this.instance.createObjectStore('metrics', { keyPath: 'id' });
            metricsStore.createIndex('targetId', 'targetId', { unique: false });
            metricsStore.createIndex('type', 'type', { unique: false });
        }

        // 2. Gamification Store (Player Stats)
        if (!this.instance.objectStoreNames.contains('gamification')) {
            const gameStore = this.instance.createObjectStore('gamification', { keyPath: 'id' });
            // Seed initial player state
            gameStore.put({ 
                id: 'player_stats', 
                xp: 0, 
                level: 1, 
                streak: 0, 
                lastActionDate: null,
                highestStreak: 0,
                titles: ['Novice Saver']
            });
        }
        }
    }
  /**
   * Migrates V1 data to new stores.
   * @param {IDBTransaction} tx - Transaction.
   * @param {Object} oldData - V1 data.
   */
  migrateV1Data(tx, oldData) {
    const stores = {
      appState: tx.objectStore('appState'),
      envelopes: tx.objectStore('envelopes'),
      accounts: tx.objectStore('accounts'),
      scheduled: tx.objectStore('scheduled'),
      months: tx.objectStore('months')
    };
    // App state
    stores.appState.put({
      id: 'main',
      currentMonth: oldData.currentMonth,
      pinHash: oldData.pinHash,
      pinSalt: oldData.pinSalt,
      locked: !!oldData.pinHash
    });
    // Arrays
    (oldData.envelopes || []).forEach(item => stores.envelopes.put(item));
    (oldData.accounts || []).forEach(item => stores.accounts.put(item));
    (oldData.scheduled || []).forEach(item => stores.scheduled.put(item));
    // Months object
    if (oldData.months) {
      Object.values(oldData.months).forEach(month => stores.months.put(month));
    }
    console.log('V1 migration complete.');
  }
  /**
   * Starts an atomic transaction across multiple stores.
   * @param {string[]} storeNames - Stores.
   * @param {IDBTransactionMode} mode - Mode.
   * @returns {Promise<void>} Completes on success.
   */
  async transaction(storeNames, mode = 'readonly') {
    if (!this.instance) throw new Error('DB not open');
    const tx = this.instance.transaction(storeNames, mode);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = (event) => reject(new Error(`Transaction Error: ${event.target.error?.message || event.target.errorCode}`));
      tx.onabort = (event) => reject(new Error(`Transaction Aborted: ${event.target.error?.message || 'Unknown'}`));
    });
  }
  /**
   * Generic get.
   * @param {string} storeName - Store.
   * @param {*} key - Key.
   * @returns {Promise<*>} Item.
   */
  async get(storeName, key) {
    try {
      const tx = this.instance.transaction([storeName], 'readonly');
      const store = tx.objectStore(storeName);
      return new Promise((resolve, reject) => {
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = (event) => reject(new Error(event.target.error?.message || 'Get failed'));
      });
    } catch (error) {
      console.error('DB Get Error:', error);
      return null;
    }
  }
  /**
   * Generic getAll.
   * @param {string} storeName - Store.
   * @returns {Promise<*>[]} Items.
   */
  async getAll(storeName) {
    try {
      const tx = this.instance.transaction([storeName], 'readonly');
      const store = tx.objectStore(storeName);
      return new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = (event) => reject(new Error(event.target.error?.message || 'GetAll failed'));
      });
    } catch (error) {
      console.error('DB GetAll Error:', error);
      return [];
    }
  }
  /**
   * Generic put (atomic with transaction).
   * @param {string} storeName - Store.
   * @param {*} item - Item.
   * @returns {Promise<*>} Key.
   */
  async put(storeName, item) {
    try {
      const tx = this.instance.transaction([storeName], 'readwrite');
      const store = tx.objectStore(storeName);
      return new Promise((resolve, reject) => {
        const req = store.put(item);
        req.onsuccess = () => resolve(req.result);
        req.onerror = (event) => reject(new Error(event.target.error?.message || 'Put failed'));
      });
    } catch (error) {
      console.error('DB Put Error:', error);
      throw error;
    }
  }
  /**
   * Generic delete.
   * @param {string} storeName - Store.
   * @param {*} key - Key.
   * @returns {Promise<void>}
   */
  async delete(storeName, key) {
    try {
      const tx = this.instance.transaction([storeName], 'readwrite');
      const store = tx.objectStore(storeName);
      return new Promise((resolve, reject) => {
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = (event) => reject(new Error(event.target.error?.message || 'Delete failed'));
      });
    } catch (error) {
      console.error('DB Delete Error:', error);
      throw error;
    }
  }
  /**
   * Atomic multi-put for complex operations.
   * @param {Object} operations - {store: [items]} or single.
   * @returns {Promise<void>}
   */
  async multiPut(operations) {
    const storeNames = Object.keys(operations);
    try {
      const tx = this.instance.transaction(storeNames, 'readwrite');
      storeNames.forEach(storeName => {
        const store = tx.objectStore(storeName);
        (operations[storeName] || []).forEach(item => store.put(item));
      });
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(new Error(`MultiPut Failed: ${e.target.error}`));
      });
    } catch (error) {
      console.error('MultiPut Error:', error);
      throw error;
    }
  }
  /**
   * Creates a full in-memory backup of the database.
   * Used by Sync to rollback if a merge fails.
   */
  async createBackup() {
    if (!this.instance) throw new Error('DB not open');
    const storeNames = Array.from(this.instance.objectStoreNames);
    const backup = {};
    
    const tx = this.instance.transaction(storeNames, 'readonly');
    
    const promises = storeNames.map(name => {
      return new Promise((resolve, reject) => {
        const req = tx.objectStore(name).getAll();
        req.onsuccess = () => {
          backup[name] = req.result;
          resolve();
        };
        req.onerror = () => reject(req.error);
      });
    });

    await Promise.all(promises);
    return backup;
  }

  /**
   * Restores the database from a backup object.
   * DANGEROUS: Clears all current data first.
   */
  async restoreBackup(backupData) {
    if (!this.instance) throw new Error('DB not open');
    const storeNames = Object.keys(backupData);
    
    // Use readwrite transaction to clear and put
    const tx = this.instance.transaction(storeNames, 'readwrite');
    
    for (const name of storeNames) {
      const store = tx.objectStore(name);
      await new Promise((resolve, reject) => {
        const clearReq = store.clear();
        clearReq.onsuccess = resolve;
        clearReq.onerror = reject;
      });
      
      for (const item of backupData[name]) {
        store.put(item);
      }
    }
    
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(new Error(`Restore Failed: ${e.target.error}`));
    });
  }
  
}
