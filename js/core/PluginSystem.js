/* js/core/PluginSystem.js */
import { Utils } from '../utils/index.js';
import { integrateWasmRuntime } from './WasmRuntime.js';

export class PluginSystem {
    constructor(db) {
        this.db = db;
        this.plugins = new Map(); 
        this.hooks = new Map();   
        this.filters = new Map(); 
        this.uiPoints = new Map();
        this.appContext = null;   
    }

    init(appState, uiManager) {
        this.appContext = {
            db: this.db,
            state: appState,
            ui: uiManager,
            utils: Utils,
            toast: (msg, type) => import('../ui/toast-manager.js').then(m => m.Toaster.show(msg, type)),
            getAccount: (id) => appState.getAccount(id),
            getEnvelope: (id) => appState.getEnvelope(id)
        };
        
        integrateWasmRuntime(this);
        return this.loadPluginsFromDB();
    }

    async loadPluginsFromDB() {
        const storedPlugins = await this.db.getAll('installed_plugins');
        for (const p of storedPlugins) {
            if (p.active) await this.bootPlugin(p);
        }
    }

    async bootPlugin(pluginData) {
        try {
            console.log(`🔌 Booting ${pluginData.name}...`);
            let source = pluginData.sourceCode;

            if (source instanceof ArrayBuffer || source instanceof Uint8Array) {
                try { source = await this._decompress(source); } 
                catch (err) { console.error(`Decompress failed:`, err); return; }
            }

            const blob = new Blob([source], { type: 'text/javascript' });
            const url = URL.createObjectURL(blob);
            const module = await import(url);
            
            if (!module.plugin) throw new Error("Plugin must export 'plugin' object");

            if (module.plugin.init) module.plugin.init(this.appContext);

            if (module.plugin.hooks) {
                for (const [evt, fn] of Object.entries(module.plugin.hooks)) this.on(evt, fn);
            }
            if (module.plugin.filters) {
                for (const [evt, fn] of Object.entries(module.plugin.filters)) this.registerFilter(evt, fn);
            }
            if (module.plugin.ui) {
                for (const [zone, fn] of Object.entries(module.plugin.ui)) {
                    if (!this.uiPoints.has(zone)) this.uiPoints.set(zone, []);
                    this.uiPoints.get(zone).push({ id: pluginData.id, render: fn });
                }
            }

            this.plugins.set(pluginData.id, module.plugin);
            URL.revokeObjectURL(url); 

        } catch (e) {
            console.error(`❌ Failed to boot plugin ${pluginData.id}:`, e);
        }
    }

    /**
     * NOSTR EVENT INSTALLER (V2 JSON)
     */
    async installPlugin(file) {
        let text = '';
        let verified = false;
        let signerKey = null;

        try {
            const rawText = await file.text();
            
            // Try Parsing as JSON (Nostr Event Format)
            try {
                const event = JSON.parse(rawText);
                if (event.content && event.sig && event.pubkey) {
                    console.log("📦 Parsing Signed Nostr Event Package...");
                    
                    // 1. Verify Event
                    const isValid = window.NostrTools.verifyEvent(event);
                    if (!isValid) throw new Error("❌ Signature Verification Failed! Event tampered.");
                    
                    console.log("✅ Nostr Signature Verified.");
                    verified = true;
                    
                    // 2. Extract Data
                    signerKey = window.NostrTools.nip19.npubEncode(event.pubkey);
                    const binaryString = atob(event.content);
                    const len = binaryString.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    text = await this._decompress(bytes);
                } else {
                    // JSON but not an event? Treat as text (unlikely for plugins)
                    throw new Error("Not a plugin package");
                }
            } catch (jsonErr) {
                // Not JSON? Fallback to Legacy Binary/Text check
                if (rawText.startsWith('export const plugin') || rawText.includes('export const plugin')) {
                    text = rawText;
                } else {
                    // Try array buffer path for old custom binary format if needed
                    const ab = await file.arrayBuffer();
                    const bytes = new Uint8Array(ab);
                    try { text = await this._decompress(bytes); }
                    catch { text = rawText; }
                }
            }
        } catch (e) {
            console.error(e);
            throw new Error(e.message || "Failed to parse plugin.");
        }
        
        if (!text.includes('export const plugin')) throw new Error("Invalid Plugin Code");

        const id = 'plugin_' + Utils.generateId();
        const name = file.name.replace(/(\.js|\.gz|\.zdp)+$/i, '');

        const newPlugin = {
            id,
            name,
            sourceCode: text,
            active: true,
            verified,
            signerId: signerKey ? signerKey.substring(0, 12) + '...' : null,
            installedAt: Date.now()
        };

        await this.db.put('installed_plugins', newPlugin);
        await this.bootPlugin(newPlugin);
        return newPlugin;
    }

    /**
     * NOSTR EVENT PACKAGER (V2 JSON)
     * Wraps the compressed code in a Nostr Event (Kind 30078)
     */
    async createSignedPackage(sourceCode, privateKeyBytes) {
        // 1. Compress Code
        const compressedBuffer = await this._compress(sourceCode);
        const compressedBytes = new Uint8Array(compressedBuffer);
        
        // 2. Base64 Encode (to fit in JSON content)
        let binaryString = '';
        const len = compressedBytes.byteLength;
        for (let i = 0; i < len; i++) {
            binaryString += String.fromCharCode(compressedBytes[i]);
        }
        const base64Content = btoa(binaryString);

        // 3. Create Event Template
        // Kind 30078 is "Application-specific Data"
        const eventTemplate = {
            kind: 30078,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['d', 'zerodollars-plugin']],
            content: base64Content,
        };

        // 4. Sign Event using finalizeEvent (Standard V2 API)
        // Ensure key is bytes (Uint8Array)
        let key = privateKeyBytes;
        if (typeof key === 'string') key = Utils.hexToBytes(key);
        
        const signedEvent = window.NostrTools.finalizeEvent(eventTemplate, key);

        // 5. Return JSON Blob
        const jsonStr = JSON.stringify(signedEvent, null, 2);
        return new Blob([jsonStr], { type: 'application/json' });
    }

    async exportPluginPackage(pluginId) {
        // Placeholder - Export logic should generally live where keys are accessible
        console.warn("Use UI Manager to export signed packages.");
    }

    async _compress(string) {
        const stream = new Blob([string]).stream();
        const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
        return await new Response(compressedStream).arrayBuffer();
    }

    async _decompress(arrayBuffer) {
        const stream = new Blob([arrayBuffer]).stream();
        const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
        return await new Response(decompressedStream).text();
    }

    // --- Events & Filters Engine ---
    on(event, callback) {
        if (!this.hooks.has(event)) this.hooks.set(event, []);
        this.hooks.get(event).push(callback);
    }

    async emit(event, payload) {
        const listeners = this.hooks.get(event) || [];
        listeners.forEach(fn => {
            try { fn(payload, this.appContext); } 
            catch(e) { console.error(`Error in hook ${event}:`, e); }
        });
    }

    registerFilter(name, callback) {
        if (!this.filters.has(name)) this.filters.set(name, []);
        this.filters.get(name).push(callback);
    }

    async applyFilters(name, data, context = {}) {
        const filters = this.filters.get(name) || [];
        let result = data;
        for (const fn of filters) {
            try {
                result = await fn(result, { ...this.appContext, ...context });
            } catch (e) {
                console.error(`Error in filter ${name}:`, e);
            }
        }
        return result;
    }

    getUI(zone, context = {}) {
        const renders = this.uiPoints.get(zone) || [];
        return renders.map(r => {
            try { return r.render(context); } 
            catch(e) { return null; }
        }).filter(Boolean);
    }
    
registerInternal(id, definition) {
        const wrappedPlugin = {
            id: id,
            init: () => console.log(`🔌 Core Plugin Loaded: ${definition.title}`),
            ui: {
                'reports_grid': (context) => {
                    // [FIX] Detect new widgets and pass full context (db, utils)
                    // Legacy widgets (NetWorth, etc) only expect 'state'
                    const newWidgets = ['widget-gamification', 'widget-behavioral', 'widget-personality', 'widget-wellness'];

                    
                    if (newWidgets.includes(id)) {
                        return definition.render(context); // Pass { state, db, utils... }
                    } else {
                        return definition.render(context.state); // Pass just state
                    }
                }
            }
        };
        wrappedPlugin.meta = {
            title: definition.title,
            order: definition.order || 99,
            gridSpan: definition.gridSpan,
            collapsible: definition.collapsible
        };
        this.plugins.set(id, wrappedPlugin);
        if (!this.uiPoints.has('reports_grid')) this.uiPoints.set('reports_grid', []);
        this.uiPoints.get('reports_grid').push({ 
            id, 
            render: wrappedPlugin.ui.reports_grid,
            meta: wrappedPlugin.meta 
        });
    }
    
    getUIWithMeta(zone, context = {}) {
        const renders = this.uiPoints.get(zone) || [];
        const fullContext = { ...this.appContext, ...context };
        return renders.map(r => {
            try { 
                return {
                    id: r.id,
                    element: r.render(fullContext),
                    meta: r.meta || {} 
                }; 
            } 
            catch(e) { 
                console.error(`Error rendering plugin ${r.id}`, e);
                return null; 
            }
        }).filter(item => item && item.element);
    }
}
