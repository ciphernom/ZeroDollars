// js/db/pin-manager.js
export class PinManager {
  static generateSalt() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  static async hashPin(pin, salt) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin);
    const saltBuffer = Uint8Array.from(salt.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    
    // Use PBKDF2 for a slow, memory-hard hash
    const key = await crypto.subtle.importKey(
      'raw', data, { name: 'PBKDF2' }, false, ['deriveKey']
    );
    
    const hashBuffer = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: 600000, 
        hash: 'SHA-256'
      },
      key,
      { name: 'HMAC', hash: 'SHA-256', length: 256 },
      true,
      ['sign']
    );
    
    const exportedKey = await crypto.subtle.exportKey('raw', hashBuffer);
    const hashArray = Array.from(new Uint8Array(exportedKey));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  static async setPin(pin, db) {
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) throw new Error('PIN must be 4 digits');
    
    const salt = this.generateSalt();
    const hash = await this.hashPin(pin, salt);
    const state = await db.get('appState', 'main') || { id: 'main' };
    await db.put('appState', { ...state, pinHash: hash, pinSalt: salt, locked: true });
  }

  static async checkPin(inputPin, db) {
    const state = await db.get('appState', 'main');
    if (!state?.pinHash || !state.pinSalt) return false;
    
    const hash = await this.hashPin(inputPin, state.pinSalt);
    return hash === state.pinHash;
  }

  // --- NEW: Recovery Method ---
  static async removePin(db) {
    const state = await db.get('appState', 'main') || { id: 'main' };
    // Keep ID and other settings, just wipe lock data
    await db.put('appState', { ...state, pinHash: null, pinSalt: null, locked: false });
  }
  
  // --- NEW: Cryptographic Wrapping ---

  static async deriveAesKey(pin, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw", enc.encode(pin), { name: "PBKDF2" }, false, ["deriveKey"]
    );
    
    const saltBuffer = Uint8Array.from(salt.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: saltBuffer,
        iterations: 100000,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  static async encryptSecret(pin, salt, plainBytes) {
    const key = await this.deriveAesKey(pin, salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      plainBytes
    );

    const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
    const bodyHex = Array.from(new Uint8Array(encrypted)).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${ivHex}:${bodyHex}`;
  }

  static async decryptSecret(pin, salt, encryptedString) {
    const [ivHex, bodyHex] = encryptedString.split(':');
    const iv = new Uint8Array(ivHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const body = new Uint8Array(bodyHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    
    const key = await this.deriveAesKey(pin, salt);
    
    try {
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        body
      );
      return new Uint8Array(decrypted);
    } catch (e) {
      throw new Error("Decryption failed. Wrong PIN or corrupted data.");
    }
  }
  
}
