// js/services/RecommendationEngine.js

export class RecommendationEngine {
    constructor(db) {
        this.db = db; // Reference to ZeroDollars IndexedDB
    }

    /**
     * Builds a privacy-safe profile of the user
     * Returns: { hasCrypto: bool, isFreelancer: bool, topCategories: [] }
     */
    async _buildUserProfile() {
        // We assume 'getAll' is a method on your DB manager to fetch transactions
        const accounts = await this.db.getAll('accounts');
        const txs = accounts.flatMap(a => a.transactions || []);
        
        const profile = {
            keywords: new Set(),
            hasCrypto: false,
            highIncome: false
        };

        // Heuristics (The "Local AI")
        for (const tx of txs) {
            const payee = (tx.note || '').toLowerCase(); // Note holds payee in your model
            
            // Detect Crypto Users
            if (payee.includes('coinbase') || payee.includes('binance') || payee.includes('kraken')) {
                profile.hasCrypto = true;
            }

            // Detect Business/Freelance (High variance or "invoice" keywords)
            if (payee.includes('invoice') || payee.includes('payroll')) {
                profile.keywords.add('business');
            }
        }

        return profile;
    }

    async getRankedPlugins(allPlugins) {
        const profile = await this._buildUserProfile();
        
        return allPlugins.map(plugin => {
            let score = 0;

            // 1. Featured Boost (The "Pay-to-Win" Layer)
            if (plugin.isFeatured) score += 1000;

            // 2. Relevance Boost (The "AI" Layer)
            // Tags are stored as an array of strings
            const tags = plugin.tags || [];
            
            if (profile.hasCrypto && tags.includes('crypto')) score += 500;
            if (profile.keywords.has('business') && tags.includes('business')) score += 300;

            // 3. Simple Recency/Content Boost
            if (plugin.image) score += 50;

            return { ...plugin, score };
        }).sort((a, b) => b.score - a.score); // Descending order
    }
}
