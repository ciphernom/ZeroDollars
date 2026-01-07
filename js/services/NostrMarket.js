// js/services/NostrMarket.js

const { SimplePool } = window.NostrTools;

// Your Public Key (The "Admin" who curates the Featured list)
const ADMIN_PUBKEY = "0ae29d1227d7c5df25d6b8ba4b1f70717f9718fc59eba53278721c9301a6e979"; 

// Export relays so MarketplaceView can use them for zap receipt verification
export const MARKET_RELAYS = [
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://nos.lol'
];

export class NostrMarket {
    constructor() {
        this.pool = new SimplePool();
        this.listings = [];
        this.profiles = new Map(); // Store author profiles here
        this.featuredIds = new Set();
    }

    async init() {
        try {
            // 1. Fetch "Featured" List (Kind 1985)
            const featuredEvents = await this.pool.querySync(MARKET_RELAYS, {
                kinds: [1985],
                authors: [ADMIN_PUBKEY],
                '#L': ['featured-plugins'],
                limit: 1
            });

            if (featuredEvents.length > 0) {
                featuredEvents[0].tags
                    .filter(t => t[0] === 'e')
                    .forEach(t => this.featuredIds.add(t[1]));
            }

            // 2. Fetch Listings (Kind 30402)
            const events = await this.pool.querySync(MARKET_RELAYS, {
                kinds: [30402], 
                '#t': ['zerodollars-plugin'],
                limit: 50
            });

            this.listings = events.map(ev => this._parseListing(ev));
            console.log(`🏪 Market: Loaded ${this.listings.length} plugins`);
            
        } catch (e) {
            console.warn("Nostr Connection Issue:", e);
        }
    }

    /**
     * Fetch User Profiles (Kind 0) for a list of pubkeys
     * This gets the Name, Picture, and Lightning Address (lud16)
     */
    async fetchProfiles(pubkeys) {
        if (!pubkeys || pubkeys.length === 0) return;

        // Deduplicate and filter out ones we already have
        const missing = [...new Set(pubkeys)].filter(pk => !this.profiles.has(pk));
        if (missing.length === 0) return;

        try {
            const events = await this.pool.querySync(MARKET_RELAYS, {
                kinds: [0], // Metadata
                authors: missing
            });

            events.forEach(ev => {
                try {
                    const content = JSON.parse(ev.content);
                    this.profiles.set(ev.pubkey, {
                        name: content.name || content.display_name,
                        picture: content.picture,
                        about: content.about,
                        lud16: content.lud16, // The Lightning Address!
                        pubkey: ev.pubkey // Store pubkey in profile for convenience
                    });
                } catch (e) {
                    console.warn("Bad profile JSON", ev.id);
                }
            });
        } catch (e) {
            console.error("Profile fetch failed", e);
        }
    }

    getProfile(pubkey) {
        return this.profiles.get(pubkey);
    }

    _parseListing(event) {
        const getTag = (k) => {
            const t = event.tags.find(tag => tag[0] === k);
            return t ? t[1] : null;
        };

        return {
            id: event.id,
            pubkey: event.pubkey,
            name: getTag('title') || 'Untitled Plugin',
            description: event.content,
            price: getTag('price') || '0',
            currency: getTag('currency') || 'sats',
            downloadUrl: getTag('resource'),
            image: getTag('image'),
            tags: event.tags.filter(t => t[0] === 't').map(t => t[1]),
            isFeatured: this.featuredIds.has(event.id),
            rawEvent: event
        };
    }

    getListings() {
        return this.listings;
    }

    /**
     * Get the underlying SimplePool for advanced operations
     * (e.g., subscribing to zap receipts)
     */
    getPool() {
        return this.pool;
    }

    /**
     * Get the relay list
     */
    getRelays() {
        return MARKET_RELAYS;
    }
}
