import { Utils } from '../utils/index.js';

export class MerkleService {
    constructor(state) {
        this.state = state;
        this.encoder = new TextEncoder();
    }

    /**
     * Generates the Root Hash and Collection Hashes
     * Returns: { root: "hash", collections: { envelopes: "hash", accounts: "hash", ... } }
     */
    async generateTree() {
        try {
            console.log(`🌳 generateTree() called`);
            console.log(`   state exists: ${!!this.state}`);
            console.log(`   state.data exists: ${!!this.state?.data}`);
            
            const collections = {
                envelopes: await this._hashCollection(this.state.data.envelopes),
                accounts: await this._hashCollection(this.state.data.accounts),
                scheduled: await this._hashCollection(this.state.data.scheduled),
                months: await this._hashCollection(this.state.data.months, 'month') 
            };

            console.log(`   ✅ All collections hashed`);
            
            // Create Root Hash by combining collection hashes
            const rootString = Object.values(collections).sort().join('|');
            const rootHash = await this._sha256(rootString);

            console.log(`   ✅ Root hash created: ${rootHash.substring(0, 16)}...`);
            
            return { root: rootHash, collections };
        } catch (error) {
            console.error(`❌ Error in generateTree():`, error);
            console.error(`   State:`, this.state);
            console.error(`   Data keys:`, Object.keys(this.state?.data || {}));
            throw error;
        }
    }

    /**
     * Generates a lightweight "Fingerprint" for a specific collection.
     * Returns: { "id1": 167888222, "id2": 167889999 }
     */
    getCollectionFingerprint(collectionName) {
        const map = this.state.data[collectionName];
        const fingerprint = {};
        // Handle both Map (envelopes) and Objects/Arrays
        const items = map instanceof Map ? Array.from(map.values()) : Object.values(map);
        
        items.forEach(item => {
            // For months, the key is the month string, for others it's .id
            const key = collectionName === 'months' ? item.month : item.id;
            fingerprint[key] = item.updatedAt || 0;
        });
        if (Object.keys(fingerprint).length > 10000) {
            console.warn(`Large fingerprint: ${collectionName} has ${Object.keys(fingerprint).length} items`);
        }
        return fingerprint;
    }

    /**
     * Compares local fingerprints vs remote fingerprints.
     * Returns list of IDs that WE need to fetch from THEM.
     */
    calculateDiff(remoteFingerprint, collectionName) {
        const localFingerprint = this.getCollectionFingerprint(collectionName);
        const idsToRequest = [];

        Object.entries(remoteFingerprint).forEach(([id, remoteTime]) => {
            const localTime = localFingerprint[id] || 0;
            // If remote is newer, request it
            // Note: We use a slight buffer (e.g. 100ms) if dealing with clock drift, 
            // but SimpleSync handles drift offset, so exact comparison is okay here.
            if (remoteTime > localTime) {
                idsToRequest.push(id);
            }
        });

        return idsToRequest;
    }

    /**
     * Internal: Hash a collection of items based on ID + UpdatedAt
     */
    async _hashCollection(mapOrObj, idKey = 'id') {
        const items = mapOrObj instanceof Map ? Array.from(mapOrObj.values()) : Object.values(mapOrObj);
        
        // Sort by ID to ensure deterministic hashing
        items.sort((a, b) => (a[idKey] || '').localeCompare(b[idKey] || ''));

        // Create a string representing the state: "id:timestamp:contentHash"
        // FIX: Hash critical content values, not just the timestamp.
        const stateString = items
            .map(item => {
                // Detect value based on entity type
                const val = item.balance ?? item.amount ?? item.tbb ?? 0;
                // Detect secondary value (e.g. budgeting for envelopes)
                const budgetHash = item.budgets ? JSON.stringify(Utils.canonicalize(item.budgets)).length : 0;
                
                return `${item[idKey]}:${item.updatedAt || 0}:${val}:${budgetHash}`;
            })
            .join('|');

        return await this._sha256(stateString);
    }

    async _sha256(str) {
        const data = this.encoder.encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
}
