import { Toaster } from '../ui/toast-manager.js';
import { MerkleService } from './merkle.js';
import { Envelope } from '../models/envelope.js';
import { Account } from '../models/account.js';
import { ScheduledTransaction } from '../models/transaction.js';
import { MonthData } from '../models/month-data.js';
import { PinManager } from '../db/pin-manager.js';

export class SimpleSync {
    constructor(state, ui) {
        this.state = state;
        this.ui = ui;
        this.merkle = new MerkleService(state);
        
// --- SECURITY CHANGE: Do NOT load key immediately ---
        this.syncKey = null;
        this.encryptedKeyBlob = localStorage.getItem('zerodollars_sync_enc_key'); 
        
        // MIGRATION PATH: Check for legacy key
        const legacyKey = localStorage.getItem('zerodollars_sync_key');

        // 1. If we have an encrypted key, we can safely destroy the legacy raw key now
        if (this.encryptedKeyBlob && legacyKey) {
             console.log("🔐 Encrypted key found. Purging legacy raw key.");
             localStorage.removeItem('zerodollars_sync_key');
        } 
        // 2. If we ONLY have a legacy key, load it but WARN the user
        else if (legacyKey && !this.encryptedKeyBlob) {
             console.warn("⚠️ Using insecure legacy key.");
             try { 
                 this.syncKey = this.hexToBytes(legacyKey); 
                 
                 // Wait for UI to init, then show persistent warning
                 setTimeout(() => {
                     Toaster.show(
                         "⚠️ Security Alert: Your sync key is unencrypted! Please tap 'Lock' 🔒 to set a PIN and encrypt your data.", 
                         'error', 
                         10000 // 10 second duration
                     );
                 }, 2000);
             } catch(e) {
                 console.error("Legacy key corrupt", e);
             }
        }

        this.peer = null;
        this.conn = null;
        this.html5QrCode = null;
        this.isHost = false;
        this.isSyncing = false;
        this.clockOffset = parseInt(localStorage.getItem('sync_clock_offset_v2') || '0', 10);
        this.clockSynced = false;
        this.messageSeq = 0;
        this.peerSeq = null;
        this.currentChallenge = null;

        // Loop Prevention & Convergence
        this.syncRound = 0;
        this.MAX_SYNC_ROUNDS = 100; 
        this._syncLock = false;

        // Clock Sync Samples
        this.clockMeasurements = [];
        // Configuration & Constants
        this.SCHEMA_VERSION = 2;
        this.PEER_ID_PREFIX = "zdsync-";
        this.CONNECT_TIMEOUT = 30000;
        this.MAX_PAYLOAD_BYTES = 1024 * 1024; // 1MB safety limit
        this.MAX_RETRIES = 2;
        this.retryCount = 0;
        this.syncStats = { startTime: null, endTime: null };

        this.els = {};

        // REMOVED: this.loadKeyFromStorage(); 
        this.cacheElements();
        this.setupUI();
        this.renderState();
    }
// --- NEW: Called by Main.js after PIN success ---
    async unlockSync(pin) {
        if (this.syncKey || !this.encryptedKeyBlob) return; // Already unlocked or no key

        try {
            const state = await this.state.db.get('appState', 'main');
            if (!state || !state.pinSalt) return;

            this.syncKey = await PinManager.decryptSecret(pin, state.pinSalt, this.encryptedKeyBlob);
            console.log("🔓 Sync Key Decrypted.");
            this.renderState();
            
            // Auto-start sync if we have a key
            if(this.syncKey) this.attemptAutoSync();
        } catch (e) {
            console.error("Sync Unlock Failed:", e);
        }
    }
    // ====================================================================
    // 1. KEY MANAGEMENT
    // ====================================================================
    loadKeyFromStorage() {
        const stored = localStorage.getItem('zerodollars_sync_key');
        if (stored) {
            try {
                this.syncKey = this.hexToBytes(stored);
                if (this.syncKey.length !== 32) throw new Error("Invalid key length");
            } catch (e) {
                console.warn("Corrupted sync key removed", e);
                localStorage.removeItem('zerodollars_sync_key');
                this.syncKey = null;
            }
        }
    }

async saveKey(pinOverride = null) {
        if (this.syncKey?.length === 32) {
            const state = await this.state.db.get('appState', 'main');
            
            // SECURITY ENFORCEMENT: Refuse to save raw key.
            if (!state?.pinSalt) {
                 Toaster.show("⚠️ Security Alert: You must set a PIN in settings to save your Sync Key.", "error");
                 return;
            }

            // App has PIN setup, proceed with encryption.
            if (pinOverride && state.pinSalt) {
                 const blob = await PinManager.encryptSecret(pinOverride, state.pinSalt, this.syncKey);
                 localStorage.setItem('zerodollars_sync_enc_key', blob);
                 localStorage.removeItem('zerodollars_sync_key'); // Nuke legacy
                 console.log("🔒 Sync key encrypted and saved.");
            } else {
                console.warn("Cannot save sync key: PIN required for encryption.");
            }
            
            this.renderState();
        }
    }

async generateNewSyncKey() {
        const state = await this.state.db.get('appState', 'main');
        
        this.syncKey = crypto.getRandomValues(new Uint8Array(32));
        this.clockOffset = 0;
        localStorage.removeItem('sync_clock_offset_v2');
        
        if (!state?.locked && !state?.pinSalt) {
            localStorage.setItem('zerodollars_sync_key', this.bytesToHex(this.syncKey));
            this.renderState(); // Update UI to show "Device Paired"
        } else {
             Toaster.show("New key generated. It will be saved to disk next time you enter your PIN.", "info");
             // We keep this.syncKey in memory so they can sync NOW, but it won't persist if they reload without saving.
             this.renderState();
        }
        
        this.showQrCode();
    }

    async importSyncKeyFromQr(text) {
        if (!text?.trim()) return false;
        if (!window.NostrTools?.nip19) {
            Toaster.show("Sync library not loaded. Check internet.", 'error');
            return false;
        }

        try {
            let raw;
            if (text.startsWith('nsec')) {
                raw = window.NostrTools.nip19.decode(text).data;
            } else if (text.startsWith('zdsync1')) {
                raw = window.NostrTools.nip19.decode(text.slice(7)).data;
            } else {
                raw = this.hexToBytes(text.trim());
            }
            if (raw instanceof Uint8Array && raw.length === 32) {
                this.syncKey = raw;
                this.clockOffset = 0;
                this.saveKey();
                Toaster.show("Key imported successfully", 'success');
                this.showQrCode();
                return true;
            }
        } catch (e) {
            console.error("Key import failed:", e);
            Toaster.show("Invalid key format", 'error');
        }
        return false;
    }

    getSyncNsec() {
        if (!this.syncKey) return '';
        if (!window.NostrTools?.nip19) {
            console.error('NostrTools library not loaded');
            return '';
        }
        return 'zdsync1' + window.NostrTools.nip19.nsecEncode(this.syncKey);
    }

    // ====================================================================
    // 2. CRYPTO
    // ====================================================================
    async getStableHostId() {
        if (!this.syncKey) throw new Error("No sync key");
        const hash = await crypto.subtle.digest('SHA-256', this.syncKey);
        const hex = Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0')).join('');
        return `${this.PEER_ID_PREFIX}${hex.substring(0, 16)}`;
    }

    async hmacSha256(message) {
        const key = await crypto.subtle.importKey(
            'raw',
            this.syncKey,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        const sig = await crypto.subtle.sign('HMAC', key, message);
        return new Uint8Array(sig);
    }

async signMessage(obj) {
        // Use empty salt for CHALLENGE message since recipient doesn't have it yet
        const useEmptySalt = (obj.type === 'CHALLENGE' || !this.currentChallenge);
        const sessionSalt = useEmptySalt ? '' : this.bytesToHex(this.currentChallenge);

        // Canonicalize object keys before stringifying to ensure deterministic signature
        const canonicalData = this._canonicalize(obj);
        const payloadString = JSON.stringify(canonicalData) + sessionSalt;
        
        const payload = new TextEncoder().encode(payloadString);
        const signature = await this.hmacSha256(payload);

        return {
            ...obj,
            _sig: Array.from(signature),
            _seq: ++this.messageSeq
        };
    }

async verifyAndUnwrap(raw) {
        if (!raw || typeof raw !== 'object') return null;
        if (!Array.isArray(raw._sig)) return null;
        if (typeof raw._seq !== 'number') return null;

        const { _sig, _seq, ...data } = raw;

        if (this.peerSeq !== null && _seq <= this.peerSeq) {
            console.error(`❌ REPLAY DETECTED: seq ${_seq} <= ${this.peerSeq}`);
            return null;
        }

        // Use empty salt for CHALLENGE message since we don't have it yet
        const useEmptySalt = (data.type === 'CHALLENGE' || !this.currentChallenge);
        const sessionSalt = useEmptySalt ? '' : this.bytesToHex(this.currentChallenge);

        // Canonicalize the received data to match the sender's sorting
        const canonicalData = this._canonicalize(data);
        const payloadString = JSON.stringify(canonicalData) + sessionSalt;
        
        const payload = new TextEncoder().encode(payloadString);
        const expected = await this.hmacSha256(payload);

        if (!this.arraysEqual(new Uint8Array(_sig), expected)) {
            console.error('❌ VERIFY FAILED: Invalid signature');
            return null;
        }

        this.peerSeq = _seq;
        return data;
    }

    // ====================================================================
    // 3. P2P CONNECTION
    // ====================================================================
    async attemptAutoSync() {
        if (!this.syncKey) return Toaster.show("Generate or scan a key first", 'info');
        if (this.isSyncing) return Toaster.show("Sync already in progress", 'info');
        
        if (this._syncLock) return;
        this._syncLock = true;
        this.isSyncing = true;
        
        try {
            this.isSyncing = true;
            this.syncStats = { startTime: Date.now(), endTime: null };
            this.messageSeq = 0;
            this.peerSeq = null;
            this.clockSynced = false;
            this.syncRound = 0;
            this.clockMeasurements = [];
            this.cleanup();
            this.setStatus("Connecting...");
            const timeout = setTimeout(() => {
                this.setStatus("Connection timeout", 'error');
                this.cleanup();
            }, this.CONNECT_TIMEOUT);
            try {
                const hostId = await this.getStableHostId();
                this.peer = new Peer(hostId, { debug: 0 });

                this.peer.on('open', () => {
                    clearTimeout(timeout);
                    this.isHost = true;
                    this.setStatus("Host active — waiting");
                    this.showQrCode();
                });
                this.peer.on('error', err => {
                    clearTimeout(timeout);
                    if (err.type === 'unavailable-id') {
                        this.connectAsClient(hostId);
                    } else {
                        this.handlePeerError(err);
                    }
                });
                this.peer.on('connection', conn => this.setupConnection(conn));
            } catch (e) {
                clearTimeout(timeout);
                this.handlePeerError(e);
            }
        } finally {
            this._syncLock = false;
        }            
    }

    async connectAsClient(hostId) {
        if (this.peer) this.peer.destroy();
        this.peer = new Peer({ debug: 0 });
        this.isHost = false;
        this.peer.on('open', () => {
            this.setStatus("Connecting to host...");
            const conn = this.peer.connect(hostId, { reliable: true });
            this.setupConnection(conn);
        });
        this.peer.on('error', this.handlePeerError.bind(this));
    }

    handlePeerError(err) {
        console.error("PeerJS error:", err);
        if (this.retryCount < this.MAX_RETRIES && err.type !== 'peer-unavailable') {
            this.retryCount++;
            this.setStatus(`Retrying... (${this.retryCount}/${this.MAX_RETRIES})`);
            this.cleanup();
            setTimeout(() => {
                this.isSyncing = false;
                this.attemptAutoSync();
            }, 2000);
        } else {
            this.setStatus("Connection failed", 'error');
            this.cleanup();
        }
    }

    // ====================================================================
    // 4. SECURE HANDSHAKE + CLOCK SYNC + DATA FLOW
    // ====================================================================
setupConnection(conn) {
    if (this.conn) this.conn.close();
    this.conn = conn;
    let authPassed = false;

    console.log(`\n========================================`);
    console.log(`🔌 NEW CONNECTION: isHost=${this.isHost}`);
    console.log(`========================================\n`);

    const send = async (obj) => {
        if (!conn.open) {
            console.error('❌ SEND FAILED: Connection not open for', obj.type);
            return;
        }
        console.log(`\n📤 SENDING: ${obj.type}`);
        const signed = await this.signMessage(obj);
        conn.send(signed);
        console.log(`✅ SENT: ${obj.type}, seq=${signed._seq}\n`);
    };
    this.send = send;
    
    const sendChallenge = async () => {
        // --- FIX: Don't regenerate if we already have a pending challenge ---
        if (this.currentChallenge && this.isHost) {
             console.log("♻️ Resending existing challenge...");
             await send({ type: 'CHALLENGE', data: Array.from(this.currentChallenge) });
             return;
        }
        // --------------------------------------------------------------------

        this.currentChallenge = crypto.getRandomValues(new Uint8Array(32));
        console.log(`🔑 Generated challenge: ${this.bytesToHex(this.currentChallenge).substring(0, 32)}...`);
        await send({ type: 'CHALLENGE', data: Array.from(this.currentChallenge) });
    };

    conn.on('open', async () => {
        console.log(`\n✅ Connection OPENED`);
        if (this.isHost) {
            console.log(`👑 I am HOST - sending challenge\n`);
            this.setStatus("Verifying key...");
            await sendChallenge();
        } else {
            console.log(`📱 I am CLIENT - waiting for challenge\n`);
            this.setStatus("Handshaking...");
        }
    });
    
    conn.on('data', async raw => {
        // Clear any pending timeout when we receive ANY message
        if (this._merkleTimeout) {
            clearTimeout(this._merkleTimeout);
            this._merkleTimeout = null;
        }
        console.log(`\n========================================`);
        console.log(`📥 RECEIVED RAW MESSAGE`);
        console.log(`   Type: ${raw?.type}`);
        console.log(`   Has _sig: ${!!raw?._sig}`);
        console.log(`   Has _seq: ${!!raw?._seq}`);
        console.log(`========================================`);
        
        const msg = await this.verifyAndUnwrap(raw);
        if (!msg) {
            console.error(`\n❌❌❌ MESSAGE REJECTED: ${raw?.type} ❌❌❌\n`);
            return;
        }

        console.log(`\n✅✅✅ MESSAGE ACCEPTED: ${msg.type} ✅✅✅`);
        console.log(`   authPassed: ${authPassed}`);
        console.log(`   clockSynced: ${this.clockSynced}`);
        console.log(`   isHost: ${this.isHost}\n`);

        // --- 1. AUTH & CHALLENGE ---
        if (!authPassed) {
            console.log(`🔐 AUTH PHASE: Processing ${msg.type}`);
            
            // CLIENT: Respond to challenge
            if (msg.type === 'CHALLENGE' && !this.isHost) {
                console.log(`🔑 CLIENT: Received CHALLENGE`);
                console.log(`   Challenge length: ${msg.data.length}`);
                console.log(`   Challenge preview: ${msg.data.slice(0, 8).map(b => b.toString(16).padStart(2,'0')).join('')}...`);
                
                // CRITICAL: Store the challenge for future message signing
                this.currentChallenge = new Uint8Array(msg.data);
                console.log(`   ✅ Stored challenge in this.currentChallenge`);
                console.log(`   Hex: ${this.bytesToHex(this.currentChallenge).substring(0, 32)}...`);
                
                const sig = await this.hmacSha256(this.currentChallenge);
                console.log(`   Computed response signature: ${this.bytesToHex(sig).substring(0, 32)}...`);
                
                await send({ type: 'CHALLENGE_RESPONSE', data: Array.from(sig) });
                console.log(`✅ CLIENT: Sent CHALLENGE_RESPONSE\n`);
                return;
            }
            
            // HOST: Verify challenge response
            if (msg.type === 'CHALLENGE_RESPONSE' && this.isHost) {
                console.log(`🔑 HOST: Received CHALLENGE_RESPONSE`);
                console.log(`   Response length: ${msg.data.length}`);
                console.log(`   Response preview: ${msg.data.slice(0, 8).map(b => b.toString(16).padStart(2,'0')).join('')}...`);
                
                const expected = await this.hmacSha256(this.currentChallenge);
                console.log(`   Expected: ${this.bytesToHex(expected).substring(0, 32)}...`);
                console.log(`   Received: ${msg.data.slice(0, 16).map(b => b.toString(16).padStart(2,'0')).join('')}...`);
                
                if (this.arraysEqual(new Uint8Array(msg.data), expected)) {
                    console.log(`✅✅✅ HOST: Signature VERIFIED! ✅✅✅`);
                    authPassed = true;
                    this.setStatus("Authenticated");
                    await send({ type: 'CLOCK_SYNC_REQUEST', sentAt: Date.now() });
                    console.log(`✅ HOST: Sent CLOCK_SYNC_REQUEST\n`);
                } else {
                    console.error(`❌❌❌ HOST: WRONG SIGNATURE! ❌❌❌`);
                    this.setStatus("Wrong key", 'error');
                    this.currentChallenge = null;
                    conn.close();
                }
                return;
            }
            
            // CLIENT: Allow CLOCK_SYNC_REQUEST to pass through
            if (msg.type === 'CLOCK_SYNC_REQUEST' && !this.isHost) {
                console.log(`✅✅✅ CLIENT: Received CLOCK_SYNC_REQUEST - AUTH SUCCESS! ✅✅✅`);
                authPassed = true;
                this.setStatus("Authenticated");
                console.log(`   Setting authPassed=true`);
                console.log(`   Falling through to clock sync handler...\n`);
                // Fall through to clock sync handler
            } else {
                console.log(`⚠️ Blocking unauthenticated message: ${msg.type}\n`);
                return; // Block other messages
            }
        }

        // --- 2. CLOCK SYNC ---
        if (msg.type === 'CLOCK_SYNC_REQUEST') {
            console.log(`⏰ Processing CLOCK_SYNC_REQUEST`);
            console.log(`   sentAt: ${msg.sentAt}`);
            const now = Date.now();
            console.log(`   peerNow: ${now}`);
            await send({ type: 'CLOCK_SYNC_RESPONSE', sentAt: msg.sentAt, peerNow: now });
            console.log(`✅ Sent CLOCK_SYNC_RESPONSE\n`);
            
            // Guest also sets clockSynced after responding to requests
            if (!this.clockSynced && !this.isHost) {
                this.clockSynced = true;
                console.log(`✅ GUEST: Clock sync enabled\n`);
            }
            return;
        }

        if (msg.type === 'CLOCK_SYNC_RESPONSE') {
            const receiveTime = Date.now();
            const rtt = receiveTime - msg.sentAt;
            const peerTimeAtSend = msg.peerNow;
            const estimatedPeerTimeNow = peerTimeAtSend + (rtt / 2);
            const offset = estimatedPeerTimeNow - receiveTime;
            
            this.clockMeasurements.push({ offset, rtt });
            console.log(`⏰ Clock sample ${this.clockMeasurements.length}/5`);
            console.log(`   offset: ${offset}ms, rtt: ${rtt}ms`);

            if (this.clockMeasurements.length < 5) {
                console.log(`   Need ${5 - this.clockMeasurements.length} more samples\n`);
                await send({ type: 'CLOCK_SYNC_REQUEST', sentAt: Date.now() });
                return;
            }

            const sorted = this.clockMeasurements.sort((a, b) => a.rtt - b.rtt).slice(0, 3);
            const medianOffset = sorted.reduce((sum, m) => sum + m.offset, 0) / sorted.length;
            
            this.clockOffset = Math.round(medianOffset);
            localStorage.setItem('sync_clock_offset_v2', this.clockOffset.toString());
            this.clockSynced = true;
            console.log(`\n✅✅✅ CLOCK SYNC COMPLETE! ✅✅✅`);
            console.log(`   Final offset: ${this.clockOffset}ms\n`);

            if (this.isHost) {
                console.log(`👑 HOST: Starting Merkle sync...`);
                this.setStatus("Starting sync...");
                const tree = await this.merkle.generateTree();
                await send({ type: 'MERKLE_INIT', tree, round: 0 });
                
                const timeoutId = setTimeout(() => {
                    console.error(`\n❌❌❌ TIMEOUT: No response to MERKLE_INIT after 5 seconds`);
                }, 5000);
                
                this._merkleTimeout = timeoutId;
            } else {
                // GUEST: Ready to receive Merkle sync
                console.log(`👥 GUEST: Ready for Merkle sync...`);
                this.setStatus("Ready for sync...");
            }
            return;
        }

        if (!this.clockSynced) {
            console.log(`⚠️ Blocking message before clock sync: ${msg.type}\n`);
            return;
        }

// --- 3. MERKLE STATE MACHINE ---
        console.log(`📊 MERKLE: Processing ${msg.type}`);
        
        // CRITICAL: Check if merkle exists
        if (!this.merkle) {
            console.error(`❌ CRITICAL: this.merkle is undefined!`);
            this.setStatus("Sync error - merkle not initialized", 'error');
            this.cleanup();
            return;
        }
        
        if (msg.type === 'MERKLE_INIT') {
            try {
                console.log(`📊 MERKLE_INIT received`);
                console.log(`   isHost: ${this.isHost}`);
                console.log(`   msg.round: ${msg.round}`);
                console.log(`   this.syncRound: ${this.syncRound}`);
                
                if (this.isHost && msg.round === undefined) {
                    console.log(`   ⚠️ Host ignoring MERKLE_INIT with no round`);
                    return;
                }
                
                this.syncRound = msg.round || 0;
                this.setStatus(`Sync Round ${this.syncRound + 1}...`);
                console.log(`   Set syncRound to: ${this.syncRound}`);

                console.log(`   Generating local merkle tree...`);
                console.log(`   state.data exists: ${!!this.state?.data}`);
                console.log(`   envelopes count: ${this.state?.data?.envelopes?.size || 0}`);
                console.log(`   accounts count: ${this.state?.data?.accounts?.size || 0}`);
                console.log(`   scheduled count: ${this.state?.data?.scheduled?.size || 0}`);
                console.log(`   months count: ${this.state?.data?.months?.size || 0}`);
                
                const localTree = await this.merkle.generateTree();
                console.log(`   ✅ Local tree generated`);
                console.log(`   Local root: ${localTree.root}`);
                
                const remoteTree = msg.tree;
                console.log(`   Remote root: ${remoteTree.root}`);
                
                if (localTree.root === remoteTree.root) {
                    console.log(`✅ Roots match - sync complete!`);
                    this.finalizeSync("Sync Complete!");
                    return;
                }

                console.log(`   Roots differ - finding dirty collections...`);
                const dirtyCollections = [];
                ['envelopes', 'accounts', 'scheduled', 'months'].forEach(col => {
                    const localHash = localTree.collections[col];
                    const remoteHash = remoteTree.collections[col];
                    console.log(`   ${col}: local=${localHash?.substring(0,8)}... remote=${remoteHash?.substring(0,8)}...`);
                    if (localHash !== remoteHash) {
                        dirtyCollections.push(col);
                    }
                });
                
                console.log(`   Dirty collections:`, dirtyCollections);
                
                if (dirtyCollections.length === 0) {
                    console.log(`   No dirty collections but roots differ - this is a bug!`);
                    this.finalizeSync("Sync Complete (forced)");
                    return;
                }
                
                const fingerprints = {};
                for (const col of dirtyCollections) {
                    try {
                        console.log(`   Getting fingerprint for ${col}...`);
                        fingerprints[col] = this.merkle.getCollectionFingerprint(col);
                        console.log(`   ✅ ${col} has ${Object.keys(fingerprints[col]).length} items`);
                    } catch (fpError) {
                        console.error(`   ❌ Error getting fingerprint for ${col}:`, fpError);
                        throw fpError;
                    }
                }
                
                console.log(`   Sending MERKLE_FINGERPRINTS...`);
                await send({ type: 'MERKLE_FINGERPRINTS', fingerprints });
                console.log(`✅ Sent MERKLE_FINGERPRINTS`);
                
            } catch (error) {
                console.error(`\n❌❌❌ ERROR in MERKLE_INIT handler ❌❌❌`);
                console.error(`Error type: ${error.constructor.name}`);
                console.error(`Error message: ${error.message}`);
                console.error(`Stack trace:`, error.stack);
                
                // Log state for debugging
                console.error(`Debug info:`);
                console.error(`  this.merkle exists: ${!!this.merkle}`);
                console.error(`  this.state exists: ${!!this.state}`);
                console.error(`  this.state.data exists: ${!!this.state?.data}`);
                
                this.setStatus("Sync error: " + error.message, 'error');
                this.cleanup();
            }
        }

        if (msg.type === 'MERKLE_FINGERPRINTS') {
            this.setStatus("Calculating diffs...");
            const remoteFingerprints = msg.fingerprints;
            const requests = {};
            const pushes = {};
            let totalItems = 0;
            
            Object.keys(remoteFingerprints).forEach(col => {
                const localFingerprint = this.merkle.getCollectionFingerprint(col);
                const idsNeeded = [];
                const idsToPush = [];
                
                const allIds = new Set([
                    ...Object.keys(remoteFingerprints[col]), 
                    ...Object.keys(localFingerprint)
                ]);

                allIds.forEach(id => {
                    const remoteTime = remoteFingerprints[col][id] || 0;
                    const localTimeRaw = localFingerprint[id] || 0;
                    const localTimeAdjusted = this._toPeerClock(localTimeRaw);

                    if (remoteTime > localTimeAdjusted) {
                        idsNeeded.push(id);
                    }
                    else if (localTimeAdjusted > (remoteTime + 100)) {
                        idsToPush.push(id);
                    }
                });
                if (idsNeeded.length > 0) requests[col] = idsNeeded;
                if (idsToPush.length > 0) pushes[col] = idsToPush;
                totalItems += idsNeeded.length + idsToPush.length;
            });

            console.log(`   Total items to sync: ${totalItems}`);

            const payloadToPush = {};
            Object.entries(pushes).forEach(([col, ids]) => {
                payloadToPush[col] = [];
                let batchSize = 0;
                const map = this.state.data[col];
                
                for (const id of ids) {
                    const item = map instanceof Map ? map.get(id) : map[id];
                    if (item) {
                        const itemSize = JSON.stringify(item).length;
                        if (batchSize + itemSize < this.MAX_PAYLOAD_BYTES) {
                            payloadToPush[col].push(item);
                            batchSize += itemSize;
                        } else {
                            break;
                        }
                    }
                }
            });

            await send({ 
                type: 'MERKLE_SYNC_BATCH',
                requests: requests, 
                pushedData: payloadToPush 
            });
            if (totalItems === 0) this.setStatus("Verifying convergence...");
        }

        if (msg.type === 'MERKLE_SYNC_BATCH') {
            let changesApplied = false;

            if (msg.pushedData && Object.keys(msg.pushedData).length > 0) {
                this.setStatus("Merging pushed data...");
                const affected = await this.mergeDataPartial(msg.pushedData);
                console.log(`   Merged ${affected} items`);
                if (affected > 0) changesApplied = true;
            }

            const requests = msg.requests || {};
            const responsePayload = {};
            
            Object.entries(requests).forEach(([col, ids]) => {
                responsePayload[col] = [];
                let batchSize = 0;
                const map = this.state.data[col];
                
                for (const id of ids) {
                    const item = map instanceof Map ? map.get(id) : map[id];
                    if (item) {
                        const itemSize = JSON.stringify(item).length;
                        if (batchSize + itemSize < this.MAX_PAYLOAD_BYTES) {
                            responsePayload[col].push(item);
                            batchSize += itemSize;
                        } else {
                            break; 
                        }
                    }
                }
            });
            
            await send({ type: 'MERKLE_DATA', payload: responsePayload, hadUpdates: changesApplied });
        }

        if (msg.type === 'MERKLE_DATA') {
            this.setStatus("Merging updates...");
            try {
                let localUpdates = 0;
                if (Object.keys(msg.payload).length > 0) {
                    localUpdates = await this.mergeDataPartial(msg.payload);
                    console.log(`   Applied ${localUpdates} updates`);
                }

                if (this.isHost) {
                    this.syncRound++;
                    if (localUpdates === 0 && !msg.hadUpdates) {
                        console.log(`✅ No updates on either side - converged!`);
                        this.finalizeSync("Sync Complete (Converged)");
                    } 
                    else if (this.syncRound >= this.MAX_SYNC_ROUNDS) {
                        console.log(`⚠️ Max rounds reached`);
                        this.finalizeSync("Sync Complete (Max Rounds)");
                    } 
                    else {
                        console.log(`   Starting round ${this.syncRound + 1}...`);
                        const tree = await this.merkle.generateTree();
                        await send({ type: 'MERKLE_INIT', tree, round: this.syncRound });
                    }
                } else {
                    this.ui.render();
                }
            } catch (e) {
                console.error('❌ Merge error:', e);
                this.setStatus("Merge failed", 'error');
            }
        }
    });
    
    conn.on('close', () => {
        console.log('\n❌ Connection closed\n');
        this.onConnectionClosed();
    });
    
    conn.on('error', (err) => {
        console.error('\n❌ Connection error:', err, '\n');
        this.onConnectionClosed();
    });
}

    onConnectionClosed() {
        if (this.isSyncing) this.setStatus("Connection lost", 'error');
        this.cleanup();
    }

    finalizeSync(message) {
        this.stopQrScanner();
        this.syncStats.endTime = Date.now();
        const duration = ((this.syncStats.endTime - this.syncStats.startTime) / 1000).toFixed(1);
        console.log(`Sync session completed in ${duration}s`);

        this.ui.render();
        this.ui.renderAccounts();
        this.setStatus(message, 'success');
        setTimeout(() => this.cleanup(), 3000);
        this.isSyncing = false;
    }

    // ====================================================================
    // 5. FINANCIALLY CORRECT & ATOMIC MERGING
    // ====================================================================
    
    _toPeerClock(ts) {
        if (ts == null || ts === 0) return 0;
        return Math.max(0, ts + this.clockOffset);
    }

    // Recalculates TBB (To Be Budgeted) to ensure financial integrity
    // Includes fix for deleted jars and timestamp stabilization
    async _recalculateTBB() {
        const envelopes = Array.from(this.state.data.envelopes.values());
        const accounts = Array.from(this.state.data.accounts.values());
        const allTxs = accounts.flatMap(a => a.transactions || []);
        const allMonthKeys = new Set(this.state.data.months.keys());
        const mergedMonths = {};
        let runningTBB = 0;
        
        const sortedMonths = Array.from(allMonthKeys).sort();
        const incomeMap = new Map();
        const spendMap = new Map();

        allTxs.forEach(tx => {
            if(tx.deleted) return;
            if (!tx.date) return;  
            const dateStr = (typeof tx.date === 'number' ? new Date(tx.date).toISOString() : tx.date);
            const month = dateStr.substring(0, 7);
            
            const jar = envelopes.find(e => e.id === tx.jarId);

            if (tx.type === 'income') {
                 incomeMap.set(month, (incomeMap.get(month) || 0) + tx.amount);
            } 
            // FIX: Treat deleted jars as Uncategorized for TBB purposes
            // If jar is missing OR jar is marked deleted, the spend counts against TBB
            else if (tx.type === 'spend' && (!tx.jarId || (jar && jar.deleted) || !jar)) {
                 spendMap.set(month, (spendMap.get(month) || 0) + tx.amount);
            }
        });

        for (const month of sortedMonths) {
            const income = incomeMap.get(month) || 0;
            const uncat = spendMap.get(month) || 0;
            // Only subtract budget if envelope is ACTIVE
            const budgeted = envelopes
                .filter(e => !e.deleted)
                .reduce((s, e) => s + (e.budgets?.[month] || 0), 0);
            
            runningTBB += income + uncat - budgeted;
            
            // FIX: Check against existing to prevent timestamp churn (stabilizes Merkle Hash)
            const existing = this.state.data.months.get(month);
            const hasChanged = !existing || existing.tbb !== runningTBB || existing.budgeted !== budgeted;

            mergedMonths[month] = { 
                month, 
                tbb: runningTBB, 
                budgeted,
                // Update timestamp ONLY if data changed
                updatedAt: hasChanged ? Date.now() : (existing.updatedAt || Date.now())
            };
        }

        // TBB is derived from flow, but Archiving breaks flow history.
        // We must enforce: TBB = (Sum of Accounts) - (Sum of Envelopes)
        
        const totalCash = accounts
            .filter(a => !a.deleted && a.status === 'open')
            .reduce((sum, a) => sum + a.balance, 0); // .balance getter handles snapshot + active

        const totalEnvelopes = envelopes
            .filter(e => !e.deleted)
            .reduce((sum, e) => sum + e.balance, 0);

        const calculatedGlobalTBB = totalCash - totalEnvelopes;

        // We apply the correction to the CURRENT month.
        // We trust the historical "runningTBB" calculations for past months, 
        // but we force the current month to match financial reality.
        
        const currentMonthKey = this.state.data.currentMonth;
        
        // Find or create current month
        if(!mergedMonths[currentMonthKey]) {
             mergedMonths[currentMonthKey] = { month: currentMonthKey, tbb: 0, budgeted: 0, updatedAt: Date.now() };
        }

        // Calculate the drift caused by archiving/logic errors
        const logicTBB = mergedMonths[currentMonthKey].tbb;
        
        // If there is a mismatch, override the current month to balance the ledger
        if (logicTBB !== calculatedGlobalTBB) {
            console.log(`⚖️ Integrity Check: Correcting TBB from ${logicTBB} to ${calculatedGlobalTBB}`);
            mergedMonths[currentMonthKey].tbb = calculatedGlobalTBB;
            mergedMonths[currentMonthKey].updatedAt = Date.now();
        }
        const monthList = Object.values(mergedMonths);
        if (monthList.length > 0) {
            await this.state.db.multiPut({ months: monthList });
            monthList.forEach(m => this.state.data.months.set(m.month, m));
        }
    }

async mergeDataPartial(payload) {
        const cleanPayload = {};
        let dropped = 0;

        const collections = ['envelopes', 'accounts', 'scheduled', 'months'];
        
        for (const col of collections) {
            if (payload[col] && Array.isArray(payload[col])) {
                cleanPayload[col] = payload[col].filter(item => {
                    const valid = this._validateSchema(item, col);
                    if (!valid) {
                        console.warn(`⚠️ Dropped malformed ${col}:`, item);
                        dropped++;
                    }
                    return valid;
                });
            }
        }

        if (dropped > 0) {
            Toaster.show(`Security: Blocked ${dropped} malformed updates.`, 'error');
        }

        try {
            const operations = {};
            if (cleanPayload.envelopes?.length > 0) {
                operations.envelopes = this._mergeEntities(
                    Array.from(this.state.data.envelopes.values()), cleanPayload.envelopes
                );
            }
            if (cleanPayload.accounts?.length > 0) {
                operations.accounts = this._mergeEntities(
                    Array.from(this.state.data.accounts.values()), cleanPayload.accounts
                );
            }
            if (cleanPayload.scheduled?.length > 0) {
                operations.scheduled = this._mergeEntities(
                    Array.from(this.state.data.scheduled.values()), cleanPayload.scheduled
                );
            }
            if (cleanPayload.months?.length > 0) {
                const localMonths = Array.from(this.state.data.months.values()).map(m => ({ ...m, id: m.month }));
                const incomingMonths = cleanPayload.months.map(m => ({ ...m, id: m.month }));
                const mergedWithIds = this._mergeEntities(localMonths, incomingMonths);
                operations.months = mergedWithIds.map(m => {
                    const { id, ...original } = m; 
                    return original;
                });
            }

            const opCount = Object.values(operations).flat().length;
            if (opCount > 0) {
                await this.state.db.multiPut(operations);
                if (operations.envelopes) {
                    operations.envelopes.forEach(e => this.state.data.envelopes.set(e.id, new Envelope(e)));
                }
                if (operations.accounts) {
                    operations.accounts.forEach(a => this.state.data.accounts.set(a.id, new Account(a)));
                }
                if (operations.scheduled) {
                    operations.scheduled.forEach(s => this.state.data.scheduled.set(s.id, new ScheduledTransaction(s)));
                }
                if (operations.months) {
                    operations.months.forEach(m => this.state.data.months.set(m.month, new MonthData(m)));
                }

                this.ui.render();
                if (operations.accounts) this.ui.renderAccounts();
            }
            return opCount;
        } catch (e) {
            console.error("Partial Merge Failed", e);
            throw e;
        }
    }

_mergeEntities(localArr = [], incomingArr = []) {
        const map = new Map(localArr.map(i => [i.id, i]));
        for (const inc of incomingArr) {
            const loc = map.get(inc.id);
            const incTime = inc.updatedAt || 0;
            const locTime = this._toPeerClock(loc?.updatedAt || 0);
            
            // 1. Incoming Delete Wins if newer
            if (inc.deleted && incTime > locTime) {
                 map.set(inc.id, inc);
                 continue;
            }
            // 2. Local Delete Wins if newer
            if (loc?.deleted && locTime >= incTime) {
                 continue;
            }

            // 3. Normal Update
            if (!loc || incTime > locTime) {
                const merged = { ...inc };
                if ((loc?.budgets || inc.budgets) && merged.budgets !== false) {
                    merged.budgets = { ...(loc?.budgets || {}), ...(inc.budgets || {}) };
                }
                if (loc?.transactions || inc.transactions) {
                    merged.transactions = this._mergeTransactions(loc?.transactions || [], inc.transactions || []);
                }
                
                // --- FIX: Recalculate Balance Correctly ---
                const txSum = (merged.transactions || [])
                    .filter(t => !t.deleted)
                    .reduce((s, t) => {
                        // CRITICAL FIX: Ignore 'add' type during sync reconstruction 
                        // because these funds are already captured in 'merged.budgets'.
                        if (t.type === 'add') return s; 
                        return s + t.amount;
                    }, 0);

                if (merged.budgets !== undefined) {
                    const budgeted = Object.values(merged.budgets || {})
                        .reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
                    merged.balance = budgeted + txSum;
                } else {
                    // Accounts (no budgets) use all transactions
                    const accountTxSum = (merged.transactions || [])
                        .filter(t => !t.deleted)
                        .reduce((s, t) => s + t.amount, 0);
                    merged.balance = accountTxSum;
                }
                map.set(inc.id, merged);
            }
        }
        return Array.from(map.values());
    }

    // FIX: Strict Tombstone Priority in Transaction Merge
    _mergeTransactions(localTxs = [], incomingTxs = []) {
        const map = new Map(localTxs.map(t => [t.id, t]));
        for (const t of incomingTxs) {
            const existing = map.get(t.id);
            const incTime = t.updatedAt || 0;
            const locTime = this._toPeerClock(existing?.updatedAt || 0);

            // 1. Incoming Delete Wins if newer
            if (t.deleted && incTime > locTime) {
                map.set(t.id, t); 
            }
            // 2. Local Delete Wins if newer
            else if (existing?.deleted && locTime >= incTime) {
                // Do nothing, keep local tombstone
            }
            // 3. Normal Update
            else if (!existing || incTime > locTime) {
                map.set(t.id, t);
            }
        }
        return Array.from(map.values()).sort((a, b) => {
            const timeA = new Date(a.date).getTime();
            const timeB = new Date(b.date).getTime();
            return timeB - timeA;
        });
    }

    // ====================================================================
    // 6. UI
    // ====================================================================
    cacheElements() {
        this.els = {
            syncBtn: document.getElementById('sync-btn'),
            startScan: document.getElementById('btn-start-scan'),
            becomeHost: document.getElementById('btn-become-host'),
            autoSync: document.getElementById('btn-auto-sync'),
            unpair: document.getElementById('btn-unpair'),
            statusText: document.getElementById('sync-status-text'),
            statusIndicator: document.getElementById('sync-status-indicator'),
            pairedSection: document.getElementById('state-paired'),
            unpairedSection: document.getElementById('state-unpaired'),
            qrContainer: document.getElementById('qr-display-container'),
            qrCode: document.getElementById('qr-code'),
            qrReader: document.getElementById('qr-reader'),
            modals: document.querySelectorAll('.modal-close'),
            manualEntryBtn: document.getElementById('btn-manual-entry'),
            manualKeyEntry: document.getElementById('manual-key-entry'),
            manualKeyInput: document.getElementById('manual-key-input'),
            importManualKeyBtn: document.getElementById('btn-import-manual-key'),
            cancelManualBtn: document.getElementById('btn-cancel-manual'),
            syncKeyDisplay: document.getElementById('sync-key-display'),
            syncKeyText: document.getElementById('sync-key-text'),
            copyKeyBtn: document.getElementById('btn-copy-key'),
            showQrBtn: document.getElementById('btn-show-qr'),
            showKeyBtn: document.getElementById('btn-show-key')
        };
    }

    setupUI() {
        this.els.syncBtn?.addEventListener('click', () => {
            this.renderState();
            this.ui.showModal(document.getElementById('sync-modal'));
        });
        this.els.startScan?.addEventListener('click', () => this.startQrScanner());
        this.els.becomeHost?.addEventListener('click', () => this.generateNewSyncKey());
        this.els.autoSync?.addEventListener('click', () => this.attemptAutoSync());
        this.els.unpair?.addEventListener('click', () => {
            Toaster.confirm("Unpair this device?", () => {
                this.syncKey = null;
                localStorage.removeItem('zerodollars_sync_key');
                localStorage.removeItem('sync_clock_offset_v2');
                this.clockOffset = 0;
                this.cleanup();
                this.renderState();
                Toaster.show("Device unpaired", 'info');
            }, "Unpair");
        });
        this.els.modals.forEach(el => el.addEventListener('click', () => this.cleanup()));
        this.els.manualEntryBtn?.addEventListener('click', () => {
        this.els.manualKeyEntry.style.display = 'block';
        this.els.manualKeyInput.focus();
    });
    this.els.cancelManualBtn?.addEventListener('click', () => {
        this.els.manualKeyEntry.style.display = 'none';
    });
    this.els.importManualKeyBtn?.addEventListener('click', async () => {
        const text = this.els.manualKeyInput?.value?.trim();
        if (await this.importSyncKeyFromQr(text)) {
            this.els.manualKeyEntry.style.display = 'none';
            this.renderState();
            Toaster.show("Key imported!", 'success');
        }
    });
    this.els.showQrBtn?.addEventListener('click', () => {
        this.els.qrContainer.style.display = 'block';
        this.els.syncKeyDisplay.style.display = 'none';
    });
    this.els.showKeyBtn?.addEventListener('click', () => {
        this.els.qrContainer.style.display = 'none';
        this.els.syncKeyDisplay.style.display = 'block';
        this.els.syncKeyText.textContent = this.getSyncNsec();
    });
    this.els.copyKeyBtn?.addEventListener('click', async () => {
        await navigator.clipboard.writeText(this.getSyncNsec());
        Toaster.show("Copied!", 'success');
    });
    }

    renderState() {
        const paired = !!this.syncKey;
        if (this.els.statusIndicator) {
            this.els.statusIndicator.textContent = paired ? "Device Paired" : "Not Paired";
            this.els.statusIndicator.className = paired ? 'badge-success' : 'badge-warning';
        }
        if (this.els.pairedSection) this.els.pairedSection.style.display = paired ? 'block' : 'none';
        if (this.els.unpairedSection) this.els.unpairedSection.style.display = paired ? 'none' : 'block';
    }

    setStatus(msg, type = 'normal') {
        if (this.els.statusText) {
            this.els.statusText.textContent = msg;
            this.els.statusText.style.color = type === 'error' ? 'var(--danger, red)' : 'inherit';
        }
    }

    showQrCode() {
        if (this.els.qrContainer) this.els.qrContainer.style.display = 'block';
        if (this.els.qrCode) {
            this.els.qrCode.style.display = 'block';
            this.els.qrCode.innerHTML = '';
            const txt = this.getSyncNsec();
            if (txt) {
                new QRCode(this.els.qrCode, {
                    text: txt,
                    width: 220,
                    height: 220,
                    correctLevel: QRCode.CorrectLevel.M
                });
            }
        }
    }

    startQrScanner() {
        if (this.els.qrCode) this.els.qrCode.style.display = 'none';
        if (this.els.qrReader) this.els.qrReader.style.display = 'block';
        if (!this.html5QrCode) this.html5QrCode = new Html5Qrcode("qr-reader");
        this.html5QrCode.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            (text) => this.importSyncKeyFromQr(text).then(success => success && this.stopQrScanner()),
            () => {}
        ).catch(err => {
            Toaster.show("Camera access denied", 'error');
            console.error(err);
        });
    }

    stopQrScanner() {
        if (this.html5QrCode?.isScanning) {
            this.html5QrCode.stop().then(() => {
                this.html5QrCode.clear();
                if (this.els.qrReader) this.els.qrReader.style.display = 'none';
            }).catch(() => {});
        }
    }

    cleanup() {
        if (this.conn) { this.conn.close(); this.conn = null; }
        if (this.peer) { this.peer.destroy(); this.peer = null; }
        this.stopQrScanner();
        this.isHost = false;
        this.isSyncing = false;
        this.clockSynced = false;
        this.messageSeq = 0;
        this.peerSeq = null;
        this.retryCount = 0;
        this.setStatus("");
        if(this.els.qrCode) this.els.qrCode.innerHTML = '';
    }

    // ====================================================================
    // 7. UTILS
    // ====================================================================
_validateSchema(item, type) {
        if (!item || typeof item !== 'object') return false;

        // --- SECURITY CONSTANTS ---
        const MAX_STR_LEN = 5000; // Max 5KB per string field
        const MAX_ID_LEN = 64;    // Strict limit for IDs
        const SAFE_MAX_INT = Number.MAX_SAFE_INTEGER; // ~9 quadrillion

        // --- ENHANCED VALIDATORS ---
        // 1. String: Must be a string AND within safe length limits
        const isString = (s, maxLen = MAX_STR_LEN) => typeof s === 'string' && s.length <= maxLen;
        
        // 2. Number: Must be a number, finite, not NaN, and within safe integer range
        const isNum = (n) => typeof n === 'number' && !isNaN(n) && isFinite(n) && Math.abs(n) <= SAFE_MAX_INT;
        
        // 3. ID: Must be a string, not empty, and short
        const isId = (id) => isString(id, MAX_ID_LEN) && id.length > 0;

        switch (type) {
            case 'envelopes':
                // Validates: id (64 chars), name (5000 chars), balance (safe int)
                return isId(item.id) && 
                       isString(item.name) && 
                       (item.balance === undefined || isNum(item.balance));

            case 'accounts':
                // Validates: id, name
                return isId(item.id) && isString(item.name);

            case 'scheduled':
                // Validates: id, name, amount
                return isId(item.id) && 
                       isString(item.name) && 
                       isNum(item.amount);

            case 'months':
                // Validates: month ('YYYY-MM' approx 7 chars), tbb
                return isString(item.month, 10) && isNum(item.tbb);

            default:
                return false; // Strict allowlist: Block unknown types
        }
    }
    // Deterministic Object Sorting (Canonical JSON)
    _canonicalize(data) {
        if (data === null || typeof data !== 'object') {
            return data;
        }
        if (Array.isArray(data)) {
            return data.map(item => this._canonicalize(item));
        }
        return Object.keys(data).sort().reduce((acc, key) => {
            acc[key] = this._canonicalize(data[key]);
            return acc;
        }, {});
    }
    hexToBytes(hex) {
        if (!hex) return new Uint8Array(0);
        const match = hex.match(/.{1,2}/g);
        return match ? new Uint8Array(match.map(b => parseInt(b, 16))) : new Uint8Array(0);
    }

    bytesToHex(bytes) {
        return bytes ? Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('') : '';
    }

    arraysEqual(a, b) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }
}
