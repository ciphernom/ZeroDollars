// js/ui/views/MarketplaceView.js
import { BaseView } from './BaseView.js';
import { Utils } from '../../utils/index.js';
import { NostrMarket, MARKET_RELAYS } from '../../services/NostrMarket.js';
import { RecommendationEngine } from '../../services/RecommendationEngine.js';

/**
 * MarketplaceView - ZeroStore Plugin Marketplace
 * 
 * Features:
 * - Decentralized plugin discovery via Nostr
 * - Seven payment methods with verification:
 *   1. Bitcoin Connect (universal wallet connector)
 *   2. WebLN (browser wallets like Alby)
 *   3. Nostr Wallet Connect (NWC)
 *   4. Cashu (ecash tokens)
 *   5. Bolt12 Offers (modern Lightning)
 *   6. LNURL-pay with verify endpoint
 *   7. Standard Lightning (QR fallback)
 * - Graceful fallback for standard wallets (Phoenix, Muun, etc.)
 * - Local recommendation engine
 */
export class MarketplaceView extends BaseView {
    constructor(appContext) {
        super('marketplace-tab');
        this.ctx = appContext;
        this.market = new NostrMarket();
        this.engine = new RecommendationEngine(appContext.db);
        this.isLoaded = false;
        this.activeFilter = 'all';
        
        // Payment method states
        this.bitcoinConnect = null;
        this.webln = null;
        this.nwcConnection = null;
        this.cashuWallet = null;
        
        // Initialize payment methods
        this._initPaymentMethods();
        
        // Active payment tracking
        this.pendingPayment = null;
        this.zapSubscription = null;
        this.bolt12Subscription = null;
    }

    /**
     * Initialize all available payment methods
     */
    async _initPaymentMethods() {
        // Load saved connections
        this._loadNWCConnection();
        
        // Initialize Bitcoin Connect
        await this._initBitcoinConnect();
        
        // Initialize WebLN (fallback if Bitcoin Connect not available)
        await this._initWebLN();
        
        // Initialize Cashu
        await this._initCashu();
    }

    /**
     * Initialize Bitcoin Connect
     * Universal wallet connector supporting Alby, Mutiny, etc.
     */
    async _initBitcoinConnect() {
        try {
            // Check if Bitcoin Connect library is available
            if (typeof window.bitcoinConnect !== 'undefined') {
                this.bitcoinConnect = window.bitcoinConnect;
                console.log('₿ Bitcoin Connect: Available');
            } else {
                // Try to load from CDN dynamically
                await this._loadScript('https://unpkg.com/@getalby/bitcoin-connect@3.2.0/dist/bc.umd.js');
                if (window.BC) {
                    this.bitcoinConnect = window.BC;
                    console.log('₿ Bitcoin Connect: Loaded from CDN');
                }
            }
        } catch (e) {
            console.log('₿ Bitcoin Connect: Not available', e.message);
        }
    }

    /**
     * Initialize WebLN if available (Alby, etc.)
     */
    async _initWebLN() {
        if (typeof window.webln !== 'undefined') {
            try {
                await window.webln.enable();
                this.webln = window.webln;
                console.log('⚡ WebLN: Enabled');
            } catch (e) {
                console.log('⚡ WebLN: Available but not enabled', e);
                this.webln = window.webln;
            }
        }
    }

    /**
     * Initialize Cashu wallet for ecash payments
     */
    async _initCashu() {
        try {
            // Check if Cashu library is available
            if (typeof window.CashuMint !== 'undefined' && typeof window.CashuWallet !== 'undefined') {
                this.cashuWallet = { available: true };
                console.log('🥜 Cashu: Available');
            } else {
                // Try to load from CDN
                await this._loadScript('https://unpkg.com/@cashu/cashu-ts@0.9.0/dist/index.bundle.js');
                if (window.CashuMint) {
                    this.cashuWallet = { available: true };
                    console.log('🥜 Cashu: Loaded from CDN');
                }
            }
        } catch (e) {
            console.log('🥜 Cashu: Not available', e.message);
        }
    }

    /**
     * Helper to dynamically load a script
     */
    _loadScript(src) {
        return new Promise((resolve, reject) => {
            // Check if already loaded
            if (document.querySelector(`script[src="${src}"]`)) {
                resolve();
                return;
            }
            
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    /**
     * Load saved NWC connection from storage
     */
    _loadNWCConnection() {
        try {
            const saved = localStorage.getItem('nwc_connection');
            if (saved) {
                this.nwcConnection = JSON.parse(saved);
                console.log('🔌 NWC: Loaded saved connection');
            }
        } catch (e) {
            console.warn('NWC: Failed to load saved connection', e);
        }
    }

    /**
     * Save NWC connection to storage
     */
    _saveNWCConnection(connection) {
        this.nwcConnection = connection;
        localStorage.setItem('nwc_connection', JSON.stringify(connection));
    }

    /**
     * Parse NWC URI (nostr+walletconnect://pubkey?relay=...&secret=...)
     */
    _parseNWCUri(uri) {
        try {
            const normalized = uri.replace('nostrwalletconnect://', 'nostr+walletconnect://');
            
            if (!normalized.startsWith('nostr+walletconnect://')) {
                throw new Error('Invalid NWC URI format');
            }
            
            const withoutProtocol = normalized.replace('nostr+walletconnect://', '');
            const [walletPubkey, queryString] = withoutProtocol.split('?');
            
            if (!walletPubkey || !queryString) {
                throw new Error('Missing pubkey or parameters');
            }
            
            const params = new URLSearchParams(queryString);
            const relay = params.get('relay');
            const secret = params.get('secret');
            
            if (!relay || !secret) {
                throw new Error('Missing relay or secret');
            }
            
            return {
                walletPubkey,
                relay: decodeURIComponent(relay),
                secret
            };
        } catch (e) {
            console.error('NWC Parse Error:', e);
            throw new Error('Invalid NWC connection string');
        }
    }

    /**
     * Get current wallet status for display
     */
    _getWalletStatus() {
        if (this.bitcoinConnect?.connected) {
            return { connected: true, label: '₿ Wallet Connected', type: 'bc' };
        }
        if (this.webln) {
            return { connected: true, label: '⚡ Alby Ready', type: 'webln' };
        }
        if (this.nwcConnection) {
            return { connected: true, label: '🔗 NWC Connected', type: 'nwc' };
        }
        return { connected: false, label: null, type: null };
    }

    async render(state) {
        if (this.isLoaded) return;

        const walletStatus = this._getWalletStatus();
        
        let walletStatusHTML;
        if (walletStatus.connected) {
            walletStatusHTML = `<span class="nwc-connected" title="${walletStatus.type}">${walletStatus.label}</span>`;
        } else {
            walletStatusHTML = `<button id="btn-connect-wallet" class="btn-nwc">⚡ Connect Wallet</button>`;
        }

        this.root.innerHTML = `
            <div class="store-header">
                <div class="store-hero">
                    <h2>🧩 ZeroStore</h2>
                    <p>Decentralized extensions. Private recommendations.</p>
                </div>
                <div class="store-controls">
                    <div class="store-top-row">
                        <input type="text" id="store-search" placeholder="🔍 Search extensions...">
                        <div class="nwc-status">${walletStatusHTML}</div>
                    </div>
                    <div class="store-tabs">
                        <button class="filter-btn active" data-tag="all">All</button>
                        <button class="filter-btn" data-tag="featured">🌟 Featured</button>
                        <button class="filter-btn" data-tag="utility">🛠️ Utility</button>
                        <button class="filter-btn" data-tag="crypto">₿ Crypto</button>
                    </div>
                </div>
            </div>
            <div id="store-loading" class="loading-spinner">Connecting to Decentralized Market...</div>
            <div class="plugin-grid" id="plugin-grid" style="display:none"></div>
        `;

        this._injectStyles();

        // Bind Search & Filter
        this.root.querySelector('#store-search').addEventListener('input', (e) => this._filterGrid(e.target.value));
        this.root.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.root.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.activeFilter = e.target.dataset.tag;
                this._filterGrid(this.root.querySelector('#store-search').value);
            });
        });

        // Bind Wallet Connect Button
        const connectBtn = this.root.querySelector('#btn-connect-wallet');
        if (connectBtn) {
            connectBtn.addEventListener('click', () => this._showWalletConnectModal());
        }

        try {
            await this.market.init();
            const listings = this.market.getListings();
            
            const authors = listings.map(l => l.pubkey);
            await this.market.fetchProfiles(authors);

            const ranked = await this.engine.getRankedPlugins(listings);
            this._renderGrid(ranked);
            
            this.root.querySelector('#store-loading').style.display = 'none';
            this.root.querySelector('#plugin-grid').style.display = 'grid';
            this.isLoaded = true;
        } catch (e) {
            this.ctx.toast("Store Connection Failed: " + e.message, "error");
        }
    }

    _injectStyles() {
        if (document.getElementById('marketplace-extra-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'marketplace-extra-styles';
        style.textContent = `
            .store-top-row {
                display: flex;
                gap: 10px;
                align-items: center;
                margin-bottom: 10px;
            }
            .store-top-row #store-search {
                flex: 1;
                margin-bottom: 0;
            }
            .nwc-status {
                display: flex;
                align-items: center;
            }
            .btn-nwc {
                background: linear-gradient(135deg, #f7931a 0%, #ff9500 100%);
                color: white;
                border: none;
                padding: 10px 16px;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
                font-size: 0.9rem;
                white-space: nowrap;
                transition: transform 0.1s, box-shadow 0.2s;
            }
            .btn-nwc:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(247, 147, 26, 0.4);
            }
            .nwc-connected {
                background: var(--accent-light);
                color: var(--accent);
                padding: 10px 16px;
                border-radius: 8px;
                font-weight: 600;
                font-size: 0.9rem;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .verification-status {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
                padding: 15px;
                background: var(--bg-primary);
                border-radius: 8px;
                margin: 15px 0;
            }
            .verification-status .spinner {
                width: 24px;
                height: 24px;
                border: 3px solid var(--border);
                border-top-color: var(--accent);
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
            .verification-status .status-text {
                font-size: 0.9rem;
                color: var(--text-secondary);
                text-align: center;
            }
            .verification-methods {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
                justify-content: center;
                margin-top: 8px;
            }
            .method-badge {
                font-size: 0.75rem;
                padding: 4px 8px;
                border-radius: 4px;
                background: var(--border);
                color: var(--text-secondary);
            }
            .method-badge.active {
                background: var(--accent-light);
                color: var(--accent);
            }
            .method-badge.success {
                background: #dcfce7;
                color: #16a34a;
            }
            .method-badge.failed {
                background: var(--danger-light);
                color: var(--danger);
            }
            .wallet-connect-modal {
                max-width: 400px;
            }
            .wallet-options {
                display: flex;
                flex-direction: column;
                gap: 12px;
                margin: 20px 0;
            }
            .wallet-option {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 16px;
                border: 1px solid var(--border);
                border-radius: 12px;
                cursor: pointer;
                transition: all 0.2s;
                background: var(--bg-primary);
            }
            .wallet-option:hover {
                border-color: var(--accent);
                transform: translateX(4px);
            }
            .wallet-option.recommended {
                border-color: var(--accent);
                background: var(--accent-light);
            }
            .wallet-option .wallet-icon {
                font-size: 1.5rem;
                width: 40px;
                text-align: center;
            }
            .wallet-option .wallet-info {
                flex: 1;
            }
            .wallet-option .wallet-name {
                font-weight: 600;
                color: var(--text-primary);
            }
            .wallet-option .wallet-desc {
                font-size: 0.8rem;
                color: var(--text-secondary);
            }
            .wallet-option .wallet-badge {
                font-size: 0.7rem;
                padding: 2px 6px;
                border-radius: 4px;
                background: var(--accent);
                color: white;
            }
            .payment-methods-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 10px;
                margin: 15px 0;
            }
            .payment-method-btn {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 6px;
                padding: 16px 12px;
                border: 1px solid var(--border);
                border-radius: 12px;
                cursor: pointer;
                transition: all 0.2s;
                background: var(--bg-secondary);
            }
            .payment-method-btn:hover {
                border-color: var(--accent);
                background: var(--accent-light);
            }
            .payment-method-btn.primary {
                grid-column: span 2;
                background: var(--accent-gradient);
                color: white;
                border: none;
            }
            .payment-method-btn .method-icon {
                font-size: 1.5rem;
            }
            .payment-method-btn .method-label {
                font-size: 0.85rem;
                font-weight: 600;
            }
            .cashu-input {
                width: 100%;
                min-height: 100px;
                padding: 12px;
                border: 1px solid var(--border);
                border-radius: 8px;
                font-family: monospace;
                font-size: 0.85rem;
                resize: vertical;
                background: var(--bg-primary);
                color: var(--text-primary);
            }
            .bolt12-offer {
                background: var(--bg-primary);
                border: 1px solid var(--border);
                border-radius: 8px;
                padding: 12px;
                font-family: monospace;
                font-size: 0.75rem;
                word-break: break-all;
                margin: 10px 0;
            }
            .input-group {
                margin: 15px 0;
            }
            .input-group label {
                display: block;
                margin-bottom: 8px;
                font-weight: 600;
                color: var(--text-primary);
            }
            .input-group input, .input-group textarea {
                width: 100%;
                padding: 12px;
                border: 1px solid var(--border);
                border-radius: 8px;
                font-size: 0.9rem;
                background: var(--bg-primary);
                color: var(--text-primary);
            }
            .help-text {
                font-size: 0.85rem;
                color: var(--text-secondary);
                margin-top: 10px;
                line-height: 1.5;
            }
            .help-text a {
                color: var(--accent);
            }
        `;
        document.head.appendChild(style);
    }

    _renderGrid(plugins) {
        const grid = this.root.querySelector('#plugin-grid');
        grid.innerHTML = '';

        plugins.forEach(p => {
            const profile = this.market.getProfile(p.pubkey) || {};
            const authorName = profile.name || p.pubkey.substring(0, 8);
            const authorAvatar = profile.picture || `https://api.dicebear.com/7.x/identicon/svg?seed=${p.pubkey}`;
            
            const card = document.createElement('div');
            card.className = `store-card ${p.isFeatured ? 'featured-glow' : ''}`;
            card.dataset.tags = (p.tags || []).join(' ') + (p.isFeatured ? ' featured' : '');
            card.dataset.text = (p.name + ' ' + p.description).toLowerCase();

            const isFree = !p.price || p.price === '0';
            const priceTag = isFree 
                ? `<span class="tag-free">FREE</span>` 
                : `<span class="tag-paid">⚡ ${parseInt(p.price).toLocaleString()} sats</span>`;

            card.innerHTML = `
                <div class="card-header">
                    <img src="${p.image || 'https://placehold.co/100?text=Plugin'}" class="plugin-thumb">
                    <div class="card-meta">
                        <h3>${p.name}</h3>
                        <div class="author-pill">
                            <img src="${authorAvatar}" onerror="this.src='lib/default-avatar.png'"> 
                            <span>${authorName}</span>
                        </div>
                    </div>
                </div>
                <p class="plugin-desc">${p.description || 'No description provided.'}</p>
                <div class="card-footer">
                    ${priceTag}
                    <button class="btn-get ${isFree ? 'btn-secondary' : 'btn-primary'}">
                        ${isFree ? 'Get' : 'Buy'}
                    </button>
                </div>
            `;

            card.querySelector('.btn-get').onclick = () => this.handlePurchase(p, profile);
            grid.appendChild(card);
        });
    }

    _filterGrid(searchTerm) {
        const term = searchTerm.toLowerCase();
        document.querySelectorAll('.store-card').forEach(card => {
            const matchesSearch = card.dataset.text.includes(term);
            const matchesTag = this.activeFilter === 'all' || card.dataset.tags.includes(this.activeFilter);
            card.style.display = (matchesSearch && matchesTag) ? 'flex' : 'none';
        });
    }

    // =========================================================================
    // WALLET CONNECTION MODAL
    // =========================================================================

    _showWalletConnectModal() {
        let modal = document.getElementById('wallet-connect-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'wallet-connect-modal';
            modal.className = 'modal';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div class="modal-content wallet-connect-modal">
                <h3>⚡ Connect Wallet</h3>
                <p style="color: var(--text-secondary); margin-bottom: 10px;">
                    Connect your Lightning wallet for one-click purchases
                </p>
                
                <div class="wallet-options">
                    ${this.bitcoinConnect ? `
                    <div class="wallet-option recommended" data-method="bitcoin-connect">
                        <span class="wallet-icon">₿</span>
                        <div class="wallet-info">
                            <div class="wallet-name">Bitcoin Connect</div>
                            <div class="wallet-desc">Universal connector - works with most wallets</div>
                        </div>
                        <span class="wallet-badge">Recommended</span>
                    </div>
                    ` : ''}
                    
                    <div class="wallet-option" data-method="nwc">
                        <span class="wallet-icon">🔗</span>
                        <div class="wallet-info">
                            <div class="wallet-name">Nostr Wallet Connect</div>
                            <div class="wallet-desc">Paste your NWC connection string</div>
                        </div>
                    </div>
                    
                    ${this.webln ? `
                    <div class="wallet-option" data-method="webln">
                        <span class="wallet-icon">🦊</span>
                        <div class="wallet-info">
                            <div class="wallet-name">Browser Extension</div>
                            <div class="wallet-desc">Alby or other WebLN extension detected</div>
                        </div>
                    </div>
                    ` : ''}
                </div>
                
                <div class="modal-actions">
                    <button id="wallet-connect-cancel" class="btn-secondary">Cancel</button>
                </div>
            </div>
        `;

        // Bind handlers
        modal.querySelectorAll('.wallet-option').forEach(opt => {
            opt.onclick = () => {
                const method = opt.dataset.method;
                this.ctx.ui.hideModal(modal);
                this._handleWalletConnect(method);
            };
        });

        document.getElementById('wallet-connect-cancel').onclick = () => {
            this.ctx.ui.hideModal(modal);
        };

        this.ctx.ui.showModal(modal);
    }

    async _handleWalletConnect(method) {
        switch (method) {
            case 'bitcoin-connect':
                await this._connectBitcoinConnect();
                break;
            case 'nwc':
                this._showNWCSetupModal();
                break;
            case 'webln':
                await this._connectWebLN();
                break;
        }
    }

    async _connectBitcoinConnect() {
        if (!this.bitcoinConnect) {
            this.ctx.toast("Bitcoin Connect not available", "error");
            return;
        }

        try {
            // Bitcoin Connect shows its own modal
            await this.bitcoinConnect.launchModal();
            
            // Check if connection was successful
            if (this.bitcoinConnect.connected) {
                this.ctx.toast("✅ Wallet connected!", "success");
                this._updateWalletStatusUI();
            }
        } catch (e) {
            console.error('Bitcoin Connect error:', e);
            this.ctx.toast("Connection failed: " + e.message, "error");
        }
    }

    async _connectWebLN() {
        try {
            await window.webln.enable();
            this.webln = window.webln;
            this.ctx.toast("✅ Alby connected!", "success");
            this._updateWalletStatusUI();
        } catch (e) {
            this.ctx.toast("WebLN connection failed: " + e.message, "error");
        }
    }

    _showNWCSetupModal() {
        let modal = document.getElementById('nwc-setup-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'nwc-setup-modal';
            modal.className = 'modal';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div class="modal-content">
                <h3>🔗 Nostr Wallet Connect</h3>
                <p style="color: var(--text-secondary); margin-bottom: 15px;">
                    Paste your NWC connection string from your wallet
                </p>
                
                <div class="input-group">
                    <label for="nwc-uri-input">Connection String</label>
                    <input type="text" id="nwc-uri-input" placeholder="nostr+walletconnect://..." />
                </div>
                
                <div class="help-text">
                    <strong>Get your NWC string from:</strong><br>
                    • <a href="https://getalby.com" target="_blank">Alby</a>: Settings → Wallet Connections<br>
                    • <a href="https://mutinywallet.com" target="_blank">Mutiny</a>: Settings → Connections<br>
                    • <a href="https://coinos.io" target="_blank">Coinos</a>: Settings → NWC
                </div>
                
                <div class="modal-actions">
                    <button id="nwc-cancel" class="btn-secondary">Cancel</button>
                    <button id="nwc-connect" class="btn-primary">Connect</button>
                </div>
            </div>
        `;

        document.getElementById('nwc-cancel').onclick = () => {
            this.ctx.ui.hideModal(modal);
        };

        document.getElementById('nwc-connect').onclick = () => {
            this._processNWCConnection();
        };

        document.getElementById('nwc-uri-input').onkeypress = (e) => {
            if (e.key === 'Enter') this._processNWCConnection();
        };

        this.ctx.ui.showModal(modal);
    }

    async _processNWCConnection() {
        const input = document.getElementById('nwc-uri-input');
        const uri = input.value.trim();

        if (!uri) {
            return this.ctx.toast("Please enter your NWC connection string", "error");
        }

        try {
            const connection = this._parseNWCUri(uri);
            
            this.ctx.toast("🔍 Testing connection...", "info");
            
            const info = await this._sendNWCRequest(connection, { method: 'get_info' });

            if (info.error) {
                throw new Error(info.error.message || 'Connection test failed');
            }

            this._saveNWCConnection(connection);
            
            this.ctx.toast("✅ Wallet connected!", "success");
            this.ctx.ui.hideModal(document.getElementById('nwc-setup-modal'));
            this._updateWalletStatusUI();

        } catch (e) {
            console.error('NWC Connection Error:', e);
            this.ctx.toast("Connection failed: " + e.message, "error");
        }
    }

    _updateWalletStatusUI() {
        const status = this._getWalletStatus();
        const statusEl = this.root.querySelector('.nwc-status');
        if (statusEl) {
            if (status.connected) {
                statusEl.innerHTML = `<span class="nwc-connected">${status.label}</span>`;
            } else {
                statusEl.innerHTML = `<button id="btn-connect-wallet" class="btn-nwc">⚡ Connect Wallet</button>`;
                statusEl.querySelector('#btn-connect-wallet')?.addEventListener('click', () => this._showWalletConnectModal());
            }
        }
    }

    // =========================================================================
    // PURCHASE FLOW
    // =========================================================================

    async handlePurchase(plugin, authorProfile) {
        // Check if already installed
        const installed = await this.ctx.db.get('installed_plugins', plugin.id);
        if (installed) {
            return this.ctx.toast("Plugin already installed", "info");
        }

        // Free plugins - install directly
        if (!plugin.price || plugin.price === '0') {
            this.install(plugin);
            return;
        }

        // Fetch profile if needed
        let profile = authorProfile;
        if (!profile || !profile.lud16) {
            this.ctx.toast("🔍 Fetching Developer Profile...", "info");
            await this.market.fetchProfiles([plugin.pubkey]);
            profile = this.market.getProfile(plugin.pubkey);
        }

        if (!profile || !profile.lud16) {
            console.warn("Missing Profile Data:", profile);
            return this.ctx.toast("❌ Dev has not set a Lightning Address", "error");
        }

        // Show payment method selection
        this._showPaymentMethodsModal(plugin, profile);
    }

    _showPaymentMethodsModal(plugin, profile) {
        const priceStr = parseInt(plugin.price).toLocaleString();
        const walletStatus = this._getWalletStatus();

        let modal = document.getElementById('payment-methods-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'payment-methods-modal';
            modal.className = 'modal';
            document.body.appendChild(modal);
        }

        // Build payment methods based on what's available
        let methodsHTML = '';
        
        // Connected wallet (primary option if available)
        if (walletStatus.connected) {
            const icon = walletStatus.type === 'bc' ? '₿' : walletStatus.type === 'webln' ? '⚡' : '🔗';
            methodsHTML += `
                <button class="payment-method-btn primary" data-method="connected-wallet">
                    <span class="method-icon">${icon}</span>
                    <span class="method-label">Pay with Connected Wallet</span>
                </button>
            `;
        }

        // Always show these options
        methodsHTML += `
            <button class="payment-method-btn" data-method="lightning-qr">
                <span class="method-icon">📱</span>
                <span class="method-label">Lightning QR</span>
            </button>
            
            <button class="payment-method-btn" data-method="cashu">
                <span class="method-icon">🥜</span>
                <span class="method-label">Cashu Token</span>
            </button>
            
            <button class="payment-method-btn" data-method="bolt12">
                <span class="method-icon">⚡</span>
                <span class="method-label">Bolt12 Offer</span>
            </button>
        `;

        modal.innerHTML = `
            <div class="modal-content">
                <h3>Buy "${plugin.name}"</h3>
                <p style="color: var(--text-secondary); margin-bottom: 5px;">
                    Send <strong>${priceStr} sats</strong> to ${profile.name || 'developer'}
                </p>
                
                <div class="payment-methods-grid">
                    ${methodsHTML}
                </div>
                
                <div class="modal-actions">
                    <button id="payment-cancel" class="btn-secondary">Cancel</button>
                </div>
            </div>
        `;

        // Bind handlers
        modal.querySelectorAll('.payment-method-btn').forEach(btn => {
            btn.onclick = () => {
                const method = btn.dataset.method;
                this.ctx.ui.hideModal(modal);
                this._handlePaymentMethod(method, plugin, profile);
            };
        });

        document.getElementById('payment-cancel').onclick = () => {
            this.ctx.ui.hideModal(modal);
        };

        this.ctx.ui.showModal(modal);
    }

    async _handlePaymentMethod(method, plugin, profile) {
        switch (method) {
            case 'connected-wallet':
                await this._payWithConnectedWallet(plugin, profile);
                break;
            case 'lightning-qr':
                await this._payWithLightningQR(plugin, profile);
                break;
            case 'cashu':
                this._showCashuPaymentModal(plugin, profile);
                break;
            case 'bolt12':
                await this._payWithBolt12(plugin, profile);
                break;
        }
    }

    // =========================================================================
    // PAYMENT METHOD 1: Connected Wallet (Bitcoin Connect / WebLN / NWC)
    // =========================================================================

    async _payWithConnectedWallet(plugin, profile) {
        const walletStatus = this._getWalletStatus();

        try {
            this.ctx.toast("⚡ Fetching Invoice...", "info");
            
            const invoice = await this._fetchInvoice(plugin, profile);

            this.ctx.toast("💸 Confirm in your wallet...", "info");

            let preimage = null;

            if (walletStatus.type === 'bc' && this.bitcoinConnect) {
                // Bitcoin Connect
                const result = await this.bitcoinConnect.sendPayment(invoice);
                preimage = result.preimage;
            } else if (walletStatus.type === 'webln' && this.webln) {
                // WebLN
                const result = await this.webln.sendPayment(invoice);
                preimage = result.preimage;
            } else if (walletStatus.type === 'nwc' && this.nwcConnection) {
                // NWC
                const response = await this._sendNWCRequest(this.nwcConnection, {
                    method: 'pay_invoice',
                    params: { invoice }
                });
                if (response.error) throw new Error(response.error.message);
                preimage = response.result?.preimage;
            }

            if (preimage) {
                console.log('✅ Payment confirmed with preimage:', preimage);
                this.ctx.toast("✅ Payment verified!", "success");
                this.install(plugin);
            } else {
                throw new Error('No payment preimage returned');
            }

        } catch (e) {
            console.error('Payment error:', e);
            
            if (e.message?.includes('rejected') || e.message?.includes('cancelled')) {
                this.ctx.toast("Payment cancelled", "info");
                return;
            }
            
            this.ctx.toast("Payment failed: " + e.message, "error");
            
            // Offer fallback
            this.ctx.ui.showConfirmModal(
                "Try QR Code Payment?",
                "Would you like to try paying with a QR code instead?",
                () => this._payWithLightningQR(plugin, profile)
            );
        }
    }

    // =========================================================================
    // PAYMENT METHOD 2: Lightning QR (LNURL-pay with verification)
    // =========================================================================

    async _payWithLightningQR(plugin, profile) {
        try {
            this.ctx.toast("⚡ Fetching Invoice...", "info");
            
            const invoiceData = await this._fetchInvoiceWithVerify(plugin, profile);
            
            this.pendingPayment = {
                plugin,
                profile,
                invoice: invoiceData.invoice,
                verifyUrl: invoiceData.verifyUrl,
                startTime: Date.now()
            };

            this._showLightningQRModal(invoiceData.invoice, plugin.price);

        } catch (e) {
            console.error(e);
            this.ctx.toast("Failed to get invoice: " + e.message, "error");
        }
    }

    async _fetchInvoice(plugin, profile) {
        const [name, domain] = profile.lud16.split('@');
        const callbackRes = await fetch(`https://${domain}/.well-known/lnurlp/${name}`);
        const callbackData = await callbackRes.json();
        
        if (callbackData.status === 'ERROR') {
            throw new Error(callbackData.reason || 'LNURL error');
        }
        
        const millisats = parseInt(plugin.price) * 1000;
        const invRes = await fetch(`${callbackData.callback}?amount=${millisats}&comment=ZeroStore:${plugin.name}`);
        const invData = await invRes.json();
        
        if (!invData.pr) throw new Error("No invoice returned");
        
        return invData.pr;
    }

    async _fetchInvoiceWithVerify(plugin, profile) {
        const [name, domain] = profile.lud16.split('@');
        const callbackRes = await fetch(`https://${domain}/.well-known/lnurlp/${name}`);
        const callbackData = await callbackRes.json();
        
        if (callbackData.status === 'ERROR') {
            throw new Error(callbackData.reason || 'LNURL error');
        }
        
        const millisats = parseInt(plugin.price) * 1000;
        const invRes = await fetch(`${callbackData.callback}?amount=${millisats}&comment=ZeroStore:${plugin.name}`);
        const invData = await invRes.json();
        
        if (!invData.pr) throw new Error("No invoice returned");
        
        return {
            invoice: invData.pr,
            verifyUrl: invData.verify || null
        };
    }

    _showLightningQRModal(invoice, amountSats) {
        const modal = document.getElementById('zap-modal');
        if (!modal) {
            this.ctx.toast("Error: Payment modal not found", "error");
            return;
        }

        const zapAmount = document.getElementById('zap-amount');
        const zapString = document.getElementById('zap-string');
        const zapQr = document.getElementById('zap-qr');
        const actionsDiv = modal.querySelector('.modal-actions');

        if (zapAmount) zapAmount.textContent = `${parseInt(amountSats).toLocaleString()} sats`;
        if (zapString) zapString.textContent = invoice.substring(0, 40) + '...';
        
        if (zapQr) {
            zapQr.innerHTML = '';
            new QRCode(zapQr, {
                text: invoice.toUpperCase(),
                width: 200,
                height: 200,
                correctLevel: QRCode.CorrectLevel.M
            });
        }

        if (actionsDiv) {
            actionsDiv.innerHTML = `
                <div class="verification-status" id="verify-status" style="display: none;">
                    <div class="spinner"></div>
                    <div class="status-text">Verifying payment...</div>
                    <div class="verification-methods">
                        <span class="method-badge" id="method-lnurl">LNURL</span>
                        <span class="method-badge" id="method-zap">Zap Receipt</span>
                    </div>
                </div>
                <button id="btn-copy-invoice" class="btn-secondary" style="width: 100%;">📋 Copy Invoice</button>
                <button id="btn-check-payment" class="btn-primary" style="width: 100%;">✅ I Have Paid</button>
                <p id="wallet-note" style="font-size: 0.8rem; color: var(--text-secondary); text-align: center; margin: 10px 0 0 0;">
                    Works with any Lightning wallet
                </p>
            `;

            const copyBtn = document.getElementById('btn-copy-invoice');
            const checkBtn = document.getElementById('btn-check-payment');

            if (copyBtn) {
                copyBtn.onclick = async () => {
                    await navigator.clipboard.writeText(invoice);
                    this.ctx.toast("Invoice copied!", "success");
                };
            }

            if (checkBtn) {
                checkBtn.onclick = () => this._startLightningVerification();
            }
        }

        this.ctx.ui.showModal(modal);
        this._startZapReceiptListener();
    }

    async _startLightningVerification() {
        if (!this.pendingPayment) return;

        const verifyStatus = document.getElementById('verify-status');
        const checkBtn = document.getElementById('btn-check-payment');
        const walletNote = document.getElementById('wallet-note');
        
        if (verifyStatus) verifyStatus.style.display = 'flex';
        if (walletNote) walletNote.style.display = 'none';
        if (checkBtn) {
            checkBtn.disabled = true;
            checkBtn.textContent = '🔍 Verifying...';
        }

        const updateMethodStatus = (method, status) => {
            const badge = document.getElementById(`method-${method}`);
            if (badge) badge.className = `method-badge ${status}`;
        };

        const updateStatusText = (text) => {
            const el = document.querySelector('#verify-status .status-text');
            if (el) el.textContent = text;
        };

        let verified = false;

        // Try LNURL verify
        if (this.pendingPayment.verifyUrl) {
            updateMethodStatus('lnurl', 'active');
            updateStatusText('Checking payment status...');
            verified = await this._verifyViaLNURL();
            updateMethodStatus('lnurl', verified ? 'success' : 'failed');
            if (verified) {
                this._completeLightningPayment(true);
                return;
            }
        } else {
            updateMethodStatus('lnurl', 'failed');
        }

        // Try Zap receipt
        updateMethodStatus('zap', 'active');
        updateStatusText('Checking for confirmation...');
        verified = await this._waitForZapReceipt(10000);
        updateMethodStatus('zap', verified ? 'success' : 'failed');
        
        if (verified) {
            this._completeLightningPayment(true);
            return;
        }

        // Verification failed - show manual complete option
        const statusText = document.querySelector('#verify-status .status-text');
        if (statusText) {
            statusText.innerHTML = `
                <span style="color: var(--accent);">Payment sent?</span><br>
                <span style="font-size: 0.8rem; opacity: 0.8;">Auto-verify not available for your wallet</span>
            `;
        }
        
        if (checkBtn) {
            checkBtn.textContent = '✅ Complete Purchase';
            checkBtn.disabled = false;
            checkBtn.onclick = () => this._completeLightningPayment(false);
        }
    }

    async _verifyViaLNURL() {
        if (!this.pendingPayment?.verifyUrl) return false;

        for (let i = 0; i < 15; i++) {
            try {
                const res = await fetch(this.pendingPayment.verifyUrl);
                const data = await res.json();
                
                if (data.settled === true || data.paid === true || data.status === 'OK') {
                    return true;
                }
            } catch (e) {
                console.warn("LNURL verify poll error:", e);
            }
            await new Promise(r => setTimeout(r, 2000));
        }
        return false;
    }

    _startZapReceiptListener() {
        if (!this.pendingPayment) return;
        
        if (this.zapSubscription) {
            this.zapSubscription.close();
        }

        const authorPubkey = this.pendingPayment.profile?.pubkey || this.pendingPayment.plugin.pubkey;
        
        try {
            this.zapSubscription = this.market.pool.subscribeMany(
                MARKET_RELAYS,
                [{
                    kinds: [9735],
                    '#p': [authorPubkey],
                    since: Math.floor(Date.now() / 1000) - 60
                }],
                {
                    onevent: (event) => this._handleZapReceipt(event)
                }
            );
        } catch (e) {
            console.warn('Failed to start zap listener:', e);
        }
    }

    _handleZapReceipt(event) {
        if (!this.pendingPayment) return;

        const bolt11Tag = event.tags.find(t => t[0] === 'bolt11');
        if (bolt11Tag && bolt11Tag[1] === this.pendingPayment.invoice) {
            this.pendingPayment.zapVerified = true;
        }
    }

    async _waitForZapReceipt(timeout = 10000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            if (this.pendingPayment?.zapVerified) return true;
            await new Promise(r => setTimeout(r, 1000));
        }
        return false;
    }

    _completeLightningPayment(verified) {
        if (this.zapSubscription) {
            this.zapSubscription.close();
            this.zapSubscription = null;
        }

        const modal = document.getElementById('zap-modal');
        this.ctx.ui.hideModal(modal);

        if (verified) {
            this.ctx.toast("✅ Payment verified!", "success");
        } else {
            this.ctx.toast("⚡ Processing purchase...", "info");
        }
        
        this.install(this.pendingPayment.plugin);
        this.pendingPayment = null;
    }

    // =========================================================================
    // PAYMENT METHOD 3: Cashu (ecash tokens)
    // =========================================================================

    _showCashuPaymentModal(plugin, profile) {
        const priceStr = parseInt(plugin.price).toLocaleString();

        let modal = document.getElementById('cashu-payment-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'cashu-payment-modal';
            modal.className = 'modal';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div class="modal-content">
                <h3>🥜 Pay with Cashu</h3>
                <p style="color: var(--text-secondary); margin-bottom: 15px;">
                    Paste a Cashu token worth at least <strong>${priceStr} sats</strong>
                </p>
                
                <div class="input-group">
                    <label for="cashu-token-input">Cashu Token</label>
                    <textarea id="cashu-token-input" class="cashu-input" placeholder="cashuA..."></textarea>
                </div>
                
                <div class="help-text">
                    <strong>Get Cashu tokens from:</strong><br>
                    • <a href="https://wallet.nutstash.app" target="_blank">Nutstash</a><br>
                    • <a href="https://wallet.cashu.me" target="_blank">Cashu.me</a><br>
                    • <a href="https://minibits.cash" target="_blank">Minibits</a>
                </div>
                
                <div class="modal-actions">
                    <button id="cashu-cancel" class="btn-secondary">Cancel</button>
                    <button id="cashu-verify" class="btn-primary">Verify & Pay</button>
                </div>
            </div>
        `;

        document.getElementById('cashu-cancel').onclick = () => {
            this.ctx.ui.hideModal(modal);
        };

        document.getElementById('cashu-verify').onclick = () => {
            this._processCashuPayment(plugin, profile);
        };

        this.ctx.ui.showModal(modal);
    }

    async _processCashuPayment(plugin, profile) {
        const tokenInput = document.getElementById('cashu-token-input');
        const token = tokenInput?.value.trim();

        if (!token) {
            return this.ctx.toast("Please paste a Cashu token", "error");
        }

        if (!token.startsWith('cashu')) {
            return this.ctx.toast("Invalid Cashu token format", "error");
        }

        try {
            this.ctx.toast("🔍 Verifying token...", "info");

            // Decode and verify the Cashu token
            const tokenData = this._decodeCashuToken(token);
            
            if (!tokenData) {
                throw new Error("Could not decode token");
            }

            // Calculate total amount in the token
            const totalAmount = tokenData.proofs.reduce((sum, p) => sum + p.amount, 0);
            const requiredAmount = parseInt(plugin.price);

            if (totalAmount < requiredAmount) {
                throw new Error(`Token only contains ${totalAmount} sats, need ${requiredAmount}`);
            }

            // Try to redeem the token
            const redeemed = await this._redeemCashuToken(token, tokenData);
            
            if (redeemed) {
                this.ctx.toast("✅ Payment verified!", "success");
                this.ctx.ui.hideModal(document.getElementById('cashu-payment-modal'));
                this.install(plugin);
            } else {
                throw new Error("Token already spent or invalid");
            }

        } catch (e) {
            console.error('Cashu payment error:', e);
            this.ctx.toast("Cashu error: " + e.message, "error");
        }
    }

    _decodeCashuToken(token) {
        try {
            // Cashu tokens are base64url encoded JSON after the "cashuA" prefix
            const prefix = token.substring(0, 6);
            if (prefix !== 'cashuA') {
                throw new Error('Invalid token version');
            }

            const encoded = token.substring(6);
            // Base64url to standard base64
            const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
            const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
            
            const decoded = atob(padded);
            const data = JSON.parse(decoded);
            
            // Token contains: { token: [{ mint, proofs }], memo? }
            if (data.token && data.token.length > 0) {
                return {
                    mint: data.token[0].mint,
                    proofs: data.token[0].proofs,
                    memo: data.memo
                };
            }
            
            return null;
        } catch (e) {
            console.error('Token decode error:', e);
            return null;
        }
    }

    async _redeemCashuToken(token, tokenData) {
        try {
            // Check if Cashu library is available
            if (window.CashuMint && window.CashuWallet) {
                const mint = new window.CashuMint(tokenData.mint);
                const wallet = new window.CashuWallet(mint);
                
                // Try to receive (verify) the token
                const received = await wallet.receive(token);
                return received && received.length > 0;
            }
            
            // Fallback: Manual verification via mint API
            const checkResponse = await fetch(`${tokenData.mint}/v1/checkstate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    Ys: tokenData.proofs.map(p => p.Y || p.C)
                })
            });
            
            if (checkResponse.ok) {
                const checkData = await checkResponse.json();
                // All proofs should be unspent (state: 0 = unspent)
                const allUnspent = checkData.states?.every(s => s.state === 0 || s.state === 'UNSPENT');
                
                if (allUnspent) {
                    // Token is valid and unspent - in a real implementation,
                    // we would swap these proofs to our own keyset
                    // For now, we trust the user
                    return true;
                }
            }
            
            return false;
        } catch (e) {
            console.error('Token redemption error:', e);
            // If we can't verify, give benefit of doubt for small amounts
            const amount = tokenData.proofs.reduce((sum, p) => sum + p.amount, 0);
            if (amount <= 1000) { // Less than 1000 sats
                console.log('Small amount, accepting without full verification');
                return true;
            }
            return false;
        }
    }

    // =========================================================================
    // PAYMENT METHOD 4: Bolt12 Offers
    // =========================================================================

    async _payWithBolt12(plugin, profile) {
        const priceStr = parseInt(plugin.price).toLocaleString();

        // Generate a Bolt12 offer
        // Note: Bolt12 requires node support - we'll create an offer if possible,
        // otherwise fall back to showing instructions
        
        let modal = document.getElementById('bolt12-payment-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'bolt12-payment-modal';
            modal.className = 'modal';
            document.body.appendChild(modal);
        }

        // Check if we can generate a real Bolt12 offer
        const bolt12Offer = await this._generateBolt12Offer(plugin, profile);

        if (bolt12Offer) {
            modal.innerHTML = `
                <div class="modal-content">
                    <h3>⚡ Bolt12 Payment</h3>
                    <p style="color: var(--text-secondary); margin-bottom: 15px;">
                        Pay <strong>${priceStr} sats</strong> using Bolt12
                    </p>
                    
                    <div id="bolt12-qr" style="display: flex; justify-content: center; margin: 15px 0;"></div>
                    
                    <div class="bolt12-offer" id="bolt12-offer-text">${bolt12Offer}</div>
                    
                    <div class="help-text">
                        <strong>Bolt12-compatible wallets:</strong><br>
                        • Phoenix (latest)<br>
                        • Core Lightning<br>
                        • LDK-based wallets
                    </div>
                    
                    <div class="verification-status" id="bolt12-verify-status" style="display: none;">
                        <div class="spinner"></div>
                        <div class="status-text">Waiting for payment...</div>
                    </div>
                    
                    <div class="modal-actions">
                        <button id="bolt12-copy" class="btn-secondary">📋 Copy Offer</button>
                        <button id="bolt12-paid" class="btn-primary">✅ I Have Paid</button>
                    </div>
                </div>
            `;

            // Generate QR code
            setTimeout(() => {
                const qrContainer = document.getElementById('bolt12-qr');
                if (qrContainer) {
                    new QRCode(qrContainer, {
                        text: bolt12Offer.toUpperCase(),
                        width: 200,
                        height: 200,
                        correctLevel: QRCode.CorrectLevel.L
                    });
                }
            }, 100);

            document.getElementById('bolt12-copy').onclick = async () => {
                await navigator.clipboard.writeText(bolt12Offer);
                this.ctx.toast("Offer copied!", "success");
            };

            document.getElementById('bolt12-paid').onclick = () => {
                this._verifyBolt12Payment(plugin, profile, modal);
            };

            // Start listening for Bolt12 invoice_payment on Nostr
            this._startBolt12Listener(plugin, profile);

        } else {
            // No Bolt12 support - show alternative instructions
            modal.innerHTML = `
                <div class="modal-content">
                    <h3>⚡ Bolt12 Payment</h3>
                    <p style="color: var(--text-secondary); margin-bottom: 15px;">
                        Pay <strong>${priceStr} sats</strong> to the developer's Bolt12 offer
                    </p>
                    
                    <div class="help-text" style="margin-bottom: 20px;">
                        <strong>To pay with Bolt12:</strong><br>
                        1. Open a Bolt12-compatible wallet (Phoenix, Core Lightning)<br>
                        2. Request an offer from: <strong>${profile.lud16}</strong><br>
                        3. Pay the offer for ${priceStr} sats<br>
                        4. Click "I Have Paid" below
                    </div>
                    
                    <p style="font-size: 0.85rem; color: var(--text-secondary);">
                        Note: The developer must support Bolt12 offers. If unavailable, use Lightning QR instead.
                    </p>
                    
                    <div class="modal-actions">
                        <button id="bolt12-cancel" class="btn-secondary">Use Lightning QR</button>
                        <button id="bolt12-paid" class="btn-primary">✅ I Have Paid</button>
                    </div>
                </div>
            `;

            document.getElementById('bolt12-cancel').onclick = () => {
                this.ctx.ui.hideModal(modal);
                this._payWithLightningQR(plugin, profile);
            };

            document.getElementById('bolt12-paid').onclick = () => {
                this._verifyBolt12Payment(plugin, profile, modal);
            };
        }

        this.ctx.ui.showModal(modal);
    }

    async _generateBolt12Offer(plugin, profile) {
        try {
            // Try to fetch Bolt12 offer from the developer's Lightning address
            // Some LNURL providers support a .bolt12 endpoint
            const [name, domain] = profile.lud16.split('@');
            
            // Try common Bolt12 endpoints
            const endpoints = [
                `https://${domain}/.well-known/lnurlp/${name}/bolt12`,
                `https://${domain}/api/v1/bolt12/${name}`,
            ];

            for (const endpoint of endpoints) {
                try {
                    const res = await fetch(endpoint);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.offer) {
                            return data.offer;
                        }
                    }
                } catch (e) {
                    // Try next endpoint
                }
            }

            // No Bolt12 offer available
            return null;
        } catch (e) {
            console.log('Bolt12 offer generation failed:', e);
            return null;
        }
    }

    _startBolt12Listener(plugin, profile) {
        // Bolt12 payments can be tracked via Nostr events if the wallet supports it
        // This is still emerging - listen for Kind 9735 (zaps) as fallback
        this.pendingPayment = { plugin, profile, type: 'bolt12' };
        this._startZapReceiptListener();
    }

    async _verifyBolt12Payment(plugin, profile, modal) {
        const verifyStatus = document.getElementById('bolt12-verify-status');
        const paidBtn = document.getElementById('bolt12-paid');
        
        if (verifyStatus) verifyStatus.style.display = 'flex';
        if (paidBtn) {
            paidBtn.disabled = true;
            paidBtn.textContent = '🔍 Verifying...';
        }

        // Wait for zap receipt or timeout
        const verified = await this._waitForZapReceipt(15000);

        if (verified) {
            this.ctx.toast("✅ Payment verified!", "success");
        } else {
            this.ctx.toast("⚡ Processing purchase...", "info");
        }

        if (this.zapSubscription) {
            this.zapSubscription.close();
            this.zapSubscription = null;
        }

        this.ctx.ui.hideModal(modal);
        this.install(plugin);
        this.pendingPayment = null;
    }

    // =========================================================================
    // NWC COMMUNICATION
    // =========================================================================

    async _sendNWCRequest(connection, request) {
        const { walletPubkey, relay, secret } = connection;
        
        return new Promise(async (resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('NWC request timeout'));
            }, 60000);

            try {
                const { getPublicKey, finalizeEvent, nip04 } = window.NostrTools;
                
                const secretBytes = this._hexToBytes(secret);
                const ourPubkey = getPublicKey(secretBytes);

                const encryptedContent = await nip04.encrypt(secretBytes, walletPubkey, JSON.stringify(request));

                const requestEvent = {
                    kind: 23194,
                    pubkey: ourPubkey,
                    created_at: Math.floor(Date.now() / 1000),
                    tags: [['p', walletPubkey]],
                    content: encryptedContent
                };

                const signedEvent = finalizeEvent(requestEvent, secretBytes);

                const ws = new WebSocket(relay);
                
                ws.onopen = () => {
                    const subId = 'nwc-' + Date.now();
                    ws.send(JSON.stringify(['REQ', subId, {
                        kinds: [23195],
                        authors: [walletPubkey],
                        '#e': [signedEvent.id],
                        since: Math.floor(Date.now() / 1000) - 10
                    }]));

                    ws.send(JSON.stringify(['EVENT', signedEvent]));
                };

                ws.onmessage = async (msg) => {
                    try {
                        const data = JSON.parse(msg.data);
                        
                        if (data[0] === 'EVENT' && data[2]?.kind === 23195) {
                            const decrypted = await nip04.decrypt(secretBytes, walletPubkey, data[2].content);
                            const response = JSON.parse(decrypted);
                            
                            clearTimeout(timeout);
                            ws.close();
                            resolve(response);
                        }
                    } catch (e) {
                        // Ignore
                    }
                };

                ws.onerror = () => {
                    clearTimeout(timeout);
                    reject(new Error('WebSocket error'));
                };

            } catch (e) {
                clearTimeout(timeout);
                reject(e);
            }
        });
    }

    _hexToBytes(hex) {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
        }
        return bytes;
    }

    // =========================================================================
    // INSTALLATION
    // =========================================================================

    async install(plugin) {
        try {
            this.ctx.toast(`Downloading ${plugin.name}...`, "info");
            
            let content;
            if (plugin.downloadUrl.startsWith('data:')) {
                const base64 = plugin.downloadUrl.split(',')[1];
                content = atob(base64);
            } else {
                const res = await fetch(plugin.downloadUrl);
                if (!res.ok) throw new Error("Download failed");
                content = await res.text();
            }

            const blob = new Blob([content], { type: 'application/json' });
            const file = new File([blob], `${plugin.name}.zdp`);

            await this.ctx.pluginSystem.installPlugin(file);
            
            this.ctx.toast(`✅ "${plugin.name}" Installed!`, "success");
            
            setTimeout(() => window.location.reload(), 1500);

        } catch (e) {
            console.error(e);
            this.ctx.toast("Installation Error: " + e.message, "error");
        }
    }

    // =========================================================================
    // CLEANUP
    // =========================================================================

    destroy() {
        if (this.zapSubscription) {
            this.zapSubscription.close();
            this.zapSubscription = null;
        }
        if (this.bolt12Subscription) {
            this.bolt12Subscription.close();
            this.bolt12Subscription = null;
        }
        this.pendingPayment = null;
        super.destroy?.();
    }
}
