/**
 * 🧠 WASM Plugin Runtime for ZeroDollars
 * 
 * Enables plugins to run compiled WebAssembly modules in a secure sandbox.
 * This protects plugin authors' intellectual property while maintaining app security.
 * 
 * Architecture:
 * - "Brain" (WASM): Compiled binary with proprietary logic (cannot touch DOM)
 * - "Hands" (JS Glue): Thin wrapper that bridges WASM ↔ App
 * 
 * Security Model:
 * - WASM runs in isolated memory space
 * - Only whitelisted functions are exposed to WASM
 * - All data access goes through controlled ABI
 * - No direct DOM, network, or storage access
 * 
 * @version 1.0.0
 */

export class WasmRuntime {
    constructor(appContext) {
        this.appContext = appContext;
        this.instances = new Map(); // pluginId -> WasmInstance
        this.memoryViews = new Map(); // pluginId -> memory utilities
        
        // Security: Track resource usage per plugin
        this.resourceLimits = {
            maxMemoryPages: 256,    // 16MB max per plugin
            maxExecutionTime: 5000, // 5 second timeout
            maxCallsPerSecond: 1000 // Rate limiting
        };
        
        this.callCounts = new Map();
    }

    /**
     * Creates the secure ABI (Application Binary Interface) that WASM can call.
     * This is the ONLY way WASM can interact with the outside world.
     */
    createSecureImports(pluginId, options = {}) {
        const self = this;
        const ctx = this.appContext;
        
        // Memory will be set after instantiation
        let memory = null;
        let memoryView = null;
        
        const setMemory = (mem) => {
            memory = mem;
            memoryView = {
                buffer: () => new Uint8Array(memory.buffer),
                i32: () => new Int32Array(memory.buffer),
                f64: () => new Float64Array(memory.buffer),
            };
            self.memoryViews.set(pluginId, memoryView);
        };
        
        // Helper: Read null-terminated string from WASM memory
        const readString = (ptr, maxLen = 1024) => {
            if (!memoryView) return '';
            const buf = memoryView.buffer();
            let end = ptr;
            while (end < ptr + maxLen && buf[end] !== 0) end++;
            return new TextDecoder().decode(buf.slice(ptr, end));
        };
        
        // Helper: Write string to WASM memory (returns bytes written)
        const writeString = (ptr, str, maxLen = 1024) => {
            if (!memoryView) return 0;
            const buf = memoryView.buffer();
            const encoded = new TextEncoder().encode(str);
            const len = Math.min(encoded.length, maxLen - 1);
            buf.set(encoded.slice(0, len), ptr);
            buf[ptr + len] = 0; // Null terminate
            return len;
        };
        
        // Helper: Rate limiting
        const checkRateLimit = () => {
            const now = Date.now();
            const key = `${pluginId}-${Math.floor(now / 1000)}`;
            const count = (self.callCounts.get(key) || 0) + 1;
            self.callCounts.set(key, count);
            
            if (count > self.resourceLimits.maxCallsPerSecond) {
                throw new Error('Rate limit exceeded');
            }
        };

        return {
            // ================================================================
            // ENVIRONMENT (env) - Standard WASM imports
            // ================================================================
            env: {
                // Memory management
                __memory_base: 0,
                __table_base: 0,
                
                // Abort handler (required by some compilers)
                abort: (msgPtr, filePtr, line, col) => {
                    const msg = readString(msgPtr);
                    console.error(`[WASM ${pluginId}] Abort: ${msg} at line ${line}`);
                },
                
                // Memory growth callback
                emscripten_notify_memory_growth: (index) => {
                    console.log(`[WASM ${pluginId}] Memory grew to ${memory.buffer.byteLength} bytes`);
                },
            },
            
            // ================================================================
            // ZERODOLLARS ABI - Controlled access to app data
            // ================================================================
            zd: {
                // --- LOGGING ---
                
                /**
                 * Log a message to console (for debugging)
                 * @param ptr - Pointer to null-terminated string
                 */
                console_log: (ptr) => {
                    checkRateLimit();
                    const msg = readString(ptr);
                    console.log(`[WASM ${pluginId}] ${msg}`);
                },
                
                console_error: (ptr) => {
                    checkRateLimit();
                    const msg = readString(ptr);
                    console.error(`[WASM ${pluginId}] ${msg}`);
                },
                
                // --- ACCOUNT ACCESS (Read-Only) ---
                
                /**
                 * Get the balance of an account in cents
                 * @param idPtr - Pointer to account ID string
                 * @returns Balance in cents, or -1 if not found
                 */
                get_account_balance: (idPtr) => {
                    checkRateLimit();
                    const id = readString(idPtr);
                    const account = ctx.getAccount?.(id);
                    // Return balance in cents (integer) for WASM compatibility
                    return account ? Math.round(account.balance * 100) : -1;
                },
                
                /**
                 * Get total balance across all accounts
                 * @returns Total balance in cents
                 */
                get_total_balance: () => {
                    checkRateLimit();
                    const accounts = Array.from(ctx.state?.data?.accounts?.values() || []);
                    const total = accounts
                        .filter(a => !a.deleted && a.status === 'open')
                        .reduce((sum, a) => sum + (a.balance || 0), 0);
                    return Math.round(total * 100);
                },
                
                /**
                 * Get the number of accounts
                 */
                get_account_count: () => {
                    checkRateLimit();
                    const accounts = Array.from(ctx.state?.data?.accounts?.values() || []);
                    return accounts.filter(a => !a.deleted).length;
                },
                
                // --- ENVELOPE ACCESS (Read-Only) ---
                
                /**
                 * Get the balance of an envelope in cents
                 */
                get_envelope_balance: (idPtr) => {
                    checkRateLimit();
                    const id = readString(idPtr);
                    const envelope = ctx.getEnvelope?.(id);
                    return envelope ? Math.round(envelope.balance * 100) : -1;
                },
                
                /**
                 * Get the budget for an envelope in a specific month
                 * @param idPtr - Envelope ID
                 * @param monthPtr - Month string "YYYY-MM"
                 */
                get_envelope_budget: (idPtr, monthPtr) => {
                    checkRateLimit();
                    const id = readString(idPtr);
                    const month = readString(monthPtr);
                    const envelope = ctx.getEnvelope?.(id);
                    return envelope?.budgets?.[month] 
                        ? Math.round(envelope.budgets[month] * 100) 
                        : 0;
                },
                
                /**
                 * Get the number of envelopes
                 */
                get_envelope_count: () => {
                    checkRateLimit();
                    const envelopes = Array.from(ctx.state?.data?.envelopes?.values() || []);
                    return envelopes.filter(e => !e.deleted).length;
                },
                
                // --- TRANSACTION ACCESS (Read-Only) ---
                
                /**
                 * Get transaction count for an account
                 */
                get_transaction_count: (accountIdPtr) => {
                    checkRateLimit();
                    const id = readString(accountIdPtr);
                    const account = ctx.getAccount?.(id);
                    if (!account) return -1;
                    return (account.transactions || []).filter(t => !t.deleted).length;
                },
                
                /**
                 * Get total spending for current month
                 */
                get_monthly_spending: () => {
                    checkRateLimit();
                    const currentMonth = ctx.state?.data?.currentMonth;
                    if (!currentMonth) return 0;
                    
                    const accounts = Array.from(ctx.state?.data?.accounts?.values() || []);
                    let total = 0;
                    
                    accounts.forEach(acc => {
                        (acc.transactions || []).forEach(tx => {
                            if (tx.deleted) return;
                            const txMonth = (tx.date || '').substring(0, 7);
                            if (txMonth === currentMonth && tx.type === 'spend') {
                                total += Math.abs(tx.amount);
                            }
                        });
                    });
                    
                    return Math.round(total * 100);
                },
                
                // --- MONTH DATA ACCESS ---
                
                /**
                 * Get To Be Budgeted amount in cents
                 */
                get_tbb: () => {
                    checkRateLimit();
                    const currentMonth = ctx.state?.data?.currentMonth;
                    const monthData = ctx.state?.data?.months?.get(currentMonth);
                    return monthData ? Math.round(monthData.tbb * 100) : 0;
                },
                
                /**
                 * Get current month string into buffer
                 * @param bufPtr - Buffer to write to
                 * @param bufLen - Buffer size
                 */
                get_current_month: (bufPtr, bufLen) => {
                    checkRateLimit();
                    const month = ctx.state?.data?.currentMonth || '';
                    return writeString(bufPtr, month, bufLen);
                },
                
                // --- TIME UTILITIES ---
                
                /**
                 * Get current timestamp in milliseconds
                 */
                get_timestamp: () => {
                    return Date.now();
                },
                
                /**
                 * Get current date as YYYY-MM-DD into buffer
                 */
                get_current_date: (bufPtr, bufLen) => {
                    checkRateLimit();
                    const date = new Date().toISOString().split('T')[0];
                    return writeString(bufPtr, date, bufLen);
                },
                
                // --- RANDOM ---
                
                /**
                 * Get a random 32-bit integer (for algorithms that need randomness)
                 */
                random_i32: () => {
                    const arr = new Uint32Array(1);
                    crypto.getRandomValues(arr);
                    return arr[0] | 0; // Convert to signed i32
                },
                
                /**
                 * Get a random float between 0 and 1
                 */
                random_f64: () => {
                    return Math.random();
                },
                
                // --- OUTPUT ---
                
                /**
                 * Show a toast notification
                 * @param msgPtr - Message string pointer
                 * @param typePtr - Type string pointer ("success", "error", "info")
                 */
                show_toast: (msgPtr, typePtr) => {
                    checkRateLimit();
                    const msg = readString(msgPtr);
                    const type = readString(typePtr) || 'info';
                    ctx.toast?.(msg, type);
                },
                
                /**
                 * Store a result value that JS can retrieve
                 * @param key - Result key (0-9)
                 * @param value - Integer value to store
                 */
                set_result_i32: (key, value) => {
                    checkRateLimit();
                    if (key < 0 || key > 9) return;
                    const instance = self.instances.get(pluginId);
                    if (instance) {
                        instance.results = instance.results || {};
                        instance.results[key] = value;
                    }
                },
                
                /**
                 * Store a float result
                 */
                set_result_f64: (key, value) => {
                    checkRateLimit();
                    if (key < 0 || key > 9) return;
                    const instance = self.instances.get(pluginId);
                    if (instance) {
                        instance.results = instance.results || {};
                        instance.results[key] = value;
                    }
                },
            },
            
            // ================================================================
            // WASI PREVIEW 1 - Minimal implementation for compatibility
            // ================================================================
            wasi_snapshot_preview1: {
                fd_write: (fd, iovs_ptr, iovs_len, nwritten_ptr) => {
                    // Minimal implementation - just return success
                    if (memoryView) {
                        memoryView.i32()[nwritten_ptr >> 2] = 0;
                    }
                    return 0;
                },
                fd_read: () => 0,
                fd_close: () => 0,
                fd_seek: () => 0,
                fd_fdstat_get: () => 0,
                environ_get: () => 0,
                environ_sizes_get: (count_ptr, size_ptr) => {
                    if (memoryView) {
                        memoryView.i32()[count_ptr >> 2] = 0;
                        memoryView.i32()[size_ptr >> 2] = 0;
                    }
                    return 0;
                },
                args_get: () => 0,
                args_sizes_get: (argc_ptr, argv_buf_size_ptr) => {
                    if (memoryView) {
                        memoryView.i32()[argc_ptr >> 2] = 0;
                        memoryView.i32()[argv_buf_size_ptr >> 2] = 0;
                    }
                    return 0;
                },
                proc_exit: (code) => {
                    console.log(`[WASM ${pluginId}] Exit with code ${code}`);
                },
                clock_time_get: (clock_id, precision, time_ptr) => {
                    if (memoryView) {
                        const now = BigInt(Date.now()) * BigInt(1000000);
                        const view = new DataView(memory.buffer);
                        view.setBigInt64(time_ptr, now, true);
                    }
                    return 0;
                },
            },
        };
        
        // Return with memory setter
        return { imports: null, setMemory, getImports: () => {
            const base = {
                env: { ...this.createSecureImports(pluginId).env },
                zd: { ...this.createSecureImports(pluginId).zd },
                wasi_snapshot_preview1: { ...this.createSecureImports(pluginId).wasi_snapshot_preview1 },
            };
            return base;
        }};
    }

    /**
     * Load and instantiate a WASM module from base64 or ArrayBuffer
     */
    async loadWasm(pluginId, binaryData, options = {}) {
        console.log(`[WASM] Loading module for plugin: ${pluginId}`);
        
        // Convert base64 to bytes if needed
        let bytes;
        if (typeof binaryData === 'string') {
            const binaryString = atob(binaryData);
            bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
        } else if (binaryData instanceof ArrayBuffer) {
            bytes = new Uint8Array(binaryData);
        } else if (binaryData instanceof Uint8Array) {
            bytes = binaryData;
        } else {
            throw new Error('Invalid WASM binary format');
        }
        
        // Validate WASM magic number
        if (bytes[0] !== 0x00 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6D) {
            throw new Error('Invalid WASM binary (bad magic number)');
        }
        
        // Create imports helper
        const importHelper = this.createSecureImports(pluginId, options);
        
        // Create memory (if not provided by module)
        const memory = new WebAssembly.Memory({ 
            initial: 16,  // 1MB initial
            maximum: this.resourceLimits.maxMemoryPages 
        });
        
        // Build imports object
        const imports = {
            env: {
                memory,
                __memory_base: 0,
                __table_base: 0,
                abort: (msgPtr, filePtr, line, col) => {
                    console.error(`[WASM ${pluginId}] Abort at line ${line}`);
                },
            },
            zd: this.createZdImports(pluginId, memory),
            wasi_snapshot_preview1: this.createWasiImports(pluginId, memory),
        };
        
        // Compile and instantiate
        try {
            const module = await WebAssembly.compile(bytes);
            
            // Check what imports the module needs
            const moduleImports = WebAssembly.Module.imports(module);
            console.log(`[WASM] Module requires imports:`, moduleImports.map(i => `${i.module}.${i.name}`));
            
            const instance = await WebAssembly.instantiate(module, imports);
            
            // Update memory reference if module exports its own
            const exportedMemory = instance.exports.memory || memory;
            
            // Store instance
            const wasmInstance = {
                module,
                instance,
                memory: exportedMemory,
                exports: instance.exports,
                results: {},
                pluginId,
            };
            
            this.instances.set(pluginId, wasmInstance);
            
            // Call _start or _initialize if present (WASI convention)
            if (instance.exports._start) {
                instance.exports._start();
            } else if (instance.exports._initialize) {
                instance.exports._initialize();
            }
            
            console.log(`[WASM] Module loaded. Exports:`, Object.keys(instance.exports));
            
            return wasmInstance;
            
        } catch (e) {
            console.error(`[WASM] Failed to load module:`, e);
            throw e;
        }
    }

    /**
     * Create ZeroDollars ABI imports with memory bound
     */
    createZdImports(pluginId, memory) {
        const ctx = this.appContext;
        const self = this;
        
        // Memory view helpers
        const readString = (ptr, maxLen = 1024) => {
            const buf = new Uint8Array(memory.buffer);
            let end = ptr;
            while (end < ptr + maxLen && buf[end] !== 0) end++;
            return new TextDecoder().decode(buf.slice(ptr, end));
        };
        
        const writeString = (ptr, str, maxLen = 1024) => {
            const buf = new Uint8Array(memory.buffer);
            const encoded = new TextEncoder().encode(str);
            const len = Math.min(encoded.length, maxLen - 1);
            buf.set(encoded.slice(0, len), ptr);
            buf[ptr + len] = 0;
            return len;
        };
        
        const checkRateLimit = () => {
            const now = Date.now();
            const key = `${pluginId}-${Math.floor(now / 1000)}`;
            const count = (self.callCounts.get(key) || 0) + 1;
            self.callCounts.set(key, count);
            if (count > self.resourceLimits.maxCallsPerSecond) {
                throw new Error('WASM rate limit exceeded');
            }
        };
        
        return {
            console_log: (ptr) => {
                checkRateLimit();
                console.log(`[WASM ${pluginId}]`, readString(ptr));
            },
            console_error: (ptr) => {
                checkRateLimit();
                console.error(`[WASM ${pluginId}]`, readString(ptr));
            },
            get_account_balance: (idPtr) => {
                checkRateLimit();
                const account = ctx.getAccount?.(readString(idPtr));
                return account ? Math.round(account.balance * 100) : -1;
            },
            get_total_balance: () => {
                checkRateLimit();
                const accounts = Array.from(ctx.state?.data?.accounts?.values() || []);
                return Math.round(accounts
                    .filter(a => !a.deleted && a.status === 'open')
                    .reduce((sum, a) => sum + (a.balance || 0), 0) * 100);
            },
            get_account_count: () => {
                checkRateLimit();
                return Array.from(ctx.state?.data?.accounts?.values() || [])
                    .filter(a => !a.deleted).length;
            },
            get_envelope_balance: (idPtr) => {
                checkRateLimit();
                const envelope = ctx.getEnvelope?.(readString(idPtr));
                return envelope ? Math.round(envelope.balance * 100) : -1;
            },
            get_envelope_budget: (idPtr, monthPtr) => {
                checkRateLimit();
                const envelope = ctx.getEnvelope?.(readString(idPtr));
                const month = readString(monthPtr);
                return envelope?.budgets?.[month] ? Math.round(envelope.budgets[month] * 100) : 0;
            },
            get_envelope_count: () => {
                checkRateLimit();
                return Array.from(ctx.state?.data?.envelopes?.values() || [])
                    .filter(e => !e.deleted).length;
            },
            get_transaction_count: (accountIdPtr) => {
                checkRateLimit();
                const account = ctx.getAccount?.(readString(accountIdPtr));
                return account ? (account.transactions || []).filter(t => !t.deleted).length : -1;
            },
            get_monthly_spending: () => {
                checkRateLimit();
                const currentMonth = ctx.state?.data?.currentMonth;
                if (!currentMonth) return 0;
                let total = 0;
                Array.from(ctx.state?.data?.accounts?.values() || []).forEach(acc => {
                    (acc.transactions || []).forEach(tx => {
                        if (tx.deleted) return;
                        if ((tx.date || '').substring(0, 7) === currentMonth && tx.type === 'spend') {
                            total += Math.abs(tx.amount);
                        }
                    });
                });
                return Math.round(total * 100);
            },
            get_tbb: () => {
                checkRateLimit();
                const monthData = ctx.state?.data?.months?.get(ctx.state?.data?.currentMonth);
                return monthData ? Math.round(monthData.tbb * 100) : 0;
            },
            get_current_month: (bufPtr, bufLen) => {
                checkRateLimit();
                return writeString(bufPtr, ctx.state?.data?.currentMonth || '', bufLen);
            },
            get_timestamp: () => Date.now(),
            get_current_date: (bufPtr, bufLen) => {
                checkRateLimit();
                return writeString(bufPtr, new Date().toISOString().split('T')[0], bufLen);
            },
            random_i32: () => {
                const arr = new Uint32Array(1);
                crypto.getRandomValues(arr);
                return arr[0] | 0;
            },
            random_f64: () => Math.random(),
            show_toast: (msgPtr, typePtr) => {
                checkRateLimit();
                ctx.toast?.(readString(msgPtr), readString(typePtr) || 'info');
            },
            set_result_i32: (key, value) => {
                checkRateLimit();
                const inst = self.instances.get(pluginId);
                if (inst && key >= 0 && key <= 9) {
                    inst.results[key] = value;
                }
            },
            set_result_f64: (key, value) => {
                checkRateLimit();
                const inst = self.instances.get(pluginId);
                if (inst && key >= 0 && key <= 9) {
                    inst.results[key] = value;
                }
            },
        };
    }

    /**
     * Create minimal WASI imports
     */
    createWasiImports(pluginId, memory) {
        return {
            fd_write: (fd, iovs_ptr, iovs_len, nwritten_ptr) => {
                new Int32Array(memory.buffer)[nwritten_ptr >> 2] = 0;
                return 0;
            },
            fd_read: () => 0,
            fd_close: () => 0,
            fd_seek: () => 0,
            fd_fdstat_get: () => 0,
            environ_get: () => 0,
            environ_sizes_get: (count_ptr, size_ptr) => {
                const view = new Int32Array(memory.buffer);
                view[count_ptr >> 2] = 0;
                view[size_ptr >> 2] = 0;
                return 0;
            },
            args_get: () => 0,
            args_sizes_get: (argc_ptr, argv_buf_size_ptr) => {
                const view = new Int32Array(memory.buffer);
                view[argc_ptr >> 2] = 0;
                view[argv_buf_size_ptr >> 2] = 0;
                return 0;
            },
            proc_exit: (code) => console.log(`[WASM ${pluginId}] Exit: ${code}`),
            clock_time_get: (clock_id, precision, time_ptr) => {
                const view = new DataView(memory.buffer);
                view.setBigInt64(time_ptr, BigInt(Date.now()) * BigInt(1000000), true);
                return 0;
            },
        };
    }

    /**
     * Call a WASM function with timeout protection
     */
    async callWithTimeout(pluginId, funcName, args = [], timeout = null) {
        const instance = this.instances.get(pluginId);
        if (!instance) {
            throw new Error(`No WASM instance for plugin: ${pluginId}`);
        }
        
        const func = instance.exports[funcName];
        if (typeof func !== 'function') {
            throw new Error(`Function not found: ${funcName}`);
        }
        
        timeout = timeout || this.resourceLimits.maxExecutionTime;
        
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`WASM execution timeout (${timeout}ms)`));
            }, timeout);
            
            try {
                const result = func(...args);
                clearTimeout(timer);
                resolve(result);
            } catch (e) {
                clearTimeout(timer);
                reject(e);
            }
        });
    }

    /**
     * Get stored results from a WASM instance
     */
    getResults(pluginId) {
        return this.instances.get(pluginId)?.results || {};
    }

    /**
     * Unload a WASM instance
     */
    unload(pluginId) {
        this.instances.delete(pluginId);
        this.memoryViews.delete(pluginId);
        console.log(`[WASM] Unloaded: ${pluginId}`);
    }

    /**
     * Get memory usage stats
     */
    getStats(pluginId) {
        const instance = this.instances.get(pluginId);
        if (!instance) return null;
        
        return {
            memoryBytes: instance.memory.buffer.byteLength,
            memoryPages: instance.memory.buffer.byteLength / 65536,
            exports: Object.keys(instance.exports),
        };
    }
}

/**
 * Integration with PluginSystem
 * Add this to your PluginSystem.init() method
 */
export function integrateWasmRuntime(pluginSystem) {
    // Create runtime instance
    const wasmRuntime = new WasmRuntime(pluginSystem.appContext);
    
    // Add to app context so plugins can use it
    pluginSystem.appContext.wasm = {
        /**
         * Load a WASM module
         * @param binary - Base64 string or ArrayBuffer of WASM binary
         * @returns Object with exports and helper methods
         */
        load: async (binary) => {
            const pluginId = `wasm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const instance = await wasmRuntime.loadWasm(pluginId, binary);
            
            return {
                // Direct access to exports
                exports: instance.exports,
                
                // Safe call with timeout
                call: (name, ...args) => wasmRuntime.callWithTimeout(pluginId, name, args),
                
                // Get results set by WASM
                getResults: () => wasmRuntime.getResults(pluginId),
                
                // Memory stats
                getStats: () => wasmRuntime.getStats(pluginId),
                
                // Cleanup
                unload: () => wasmRuntime.unload(pluginId),
                
                // Instance ID
                id: pluginId,
            };
        },
        
        // Runtime reference for advanced usage
        runtime: wasmRuntime,
    };
    
    console.log('🧠 WASM Runtime integrated');
    return wasmRuntime;
}

// Export for direct usage
export default WasmRuntime;
