const CACHE_VERSION = '1.1.1'; // Bumped version to force HTML update
const CACHE_NAME = `jars-budget-v${CACHE_VERSION}`;

// The exact list of EVERY file your app needs to run
const urlsToCache = [
    './',
    './index.html',
    './manifest.json',
    './css/style.css',
    './data/keywords.json',
    
    // Local Libraries
    './lib/chart.min.js',
    './lib/peerjs.min.js',
    './lib/qrcode.min.js',
    './lib/html5-qrcode.min.js',
    './lib/nostr.bundle.js',
    './lib/editor.bundle.js',
    './lib/wabt.js',
    
    // App Logic
    './js/config.js',
    './js/main.js',
    
    // Database & Models
    './js/db/database.js',
    './js/db/pin-manager.js',
    './js/models/account.js',
    './js/models/envelope.js',
    './js/models/month-data.js',
    './js/models/transaction.js',
    
    // Services
    './js/services/forecaster.js',
    './js/services/merkle.js',
    './js/services/ml-manager.js',
    './js/services/sync.js',
    './js/services/ml.worker.js',
    './js/services/NostrMarket.js',        
    './js/services/RecommendationEngine.js', 
    './js/services/gamification-engine.js',
    './js/services/interaction-tracker.js',
    './js/services/psych-engine.js',
    './js/services/smartcover.js',
    './js/services/ZDScriptCompiler.js',
    './js/services/ZDScriptLanguage.js',
    
    // Core (New)
    './js/core/PluginSystem.js',
    './js/core/WasmRuntime.js',
    
    // State & UI
    './js/state/app-state.js',
    './js/ui/toast-manager.js',
    './js/ui/ui-manager.js',
    './js/ui/ExtensionStudio.js',
    './js/ui/views/BaseView.js',
    './js/ui/views/BudgetView.js',
    './js/ui/views/AccountsView.js',
    './js/ui/views/ReportsView.js',
    './js/ui/views/MarketplaceView.js',
    
    // UI Components
    './js/ui/components/Component.js',
    './js/ui/components/LedgerState.js',
    './js/ui/components/TransactionList.js',
    './js/ui/components/VirtualScroller.js',
    
    // Utils
    './js/utils/index.js',
    './js/utils/math-utils.js',
    
        // NEW: Currency support
    './js/data/currencies.js',
    './js/services/exchange-rates.js',
    './js/services/lot-tracker.js',
    
    // Legacy Plugins (Loaded dynamically, but good to cache source if needed)
    './js/plugins/reports/AgeOfMoneyWidget.js',
    './js/plugins/reports/CashflowWidget.js',
    './js/plugins/reports/ForecastWidget.js',
    './js/plugins/reports/InsightsWidget.js',
    './js/plugins/reports/NetWorthWidget.js',
    './js/plugins/reports/PerformanceTableWidget.js',
    './js/plugins/reports/SpendingPieWidget.js',
    './js/plugins/reports/SpendingTrendWidget.js',
    './js/plugins/reports/BehavioralWidget.js',
    './js/plugins/reports/GamificationWidget.js',
    './js/plugins/reports/WellnessWidget.js',
    './js/plugins/reports/PersonalityWidget.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('fetch', event => {
    // IGNORE external API calls (let the browser handle them directly)
    if (!event.request.url.startsWith(self.location.origin)) {
        return;
    }

    // Network-first strategy for API calls, Cache-first for static assets
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Cache hit - return response
                if (response) {
                    return response;
                }
                return fetch(event.request).then(
                    function(response) {
                        // Check if we received a valid response
                        if(!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }

                        // Clone the response
                        var responseToCache = response.clone();

                        caches.open(CACHE_NAME)
                            .then(function(cache) {
                                // Dynamically cache new requests
                                if (!event.request.url.startsWith('chrome-extension')) {
                                    cache.put(event.request, responseToCache);
                                }
                            });

                        return response;
                    }
                );
            })
    );
});

self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        console.log('Service Worker: Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            return self.clients.claim();
        }).then(() => {
            self.clients.matchAll().then(clients => {
                clients.forEach(client => client.postMessage({ type: 'NEW_VERSION_READY' }));
            });
        })
    );
});

self.addEventListener('message', event => {
    if (event.data && event.data.action === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
