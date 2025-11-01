// Crypto utils: AES-GCM-256, HMAC-SHA-256 + Vault manager (no user passphrase)

const enc = new TextEncoder();
const dec = new TextDecoder();

const toHex = (buf) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
const fromB64 = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));

// Keys are generated per-install and stored locally (no passphrase required)

async function hmacHex(hKey, data) {
  const mac = await crypto.subtle.sign('HMAC', hKey, enc.encode(data));
  return toHex(mac);
}

async function aesEncrypt(aKey, dataBytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aKey, dataBytes);
  return { iv: toB64(iv), data: toB64(ct) };
}

async function aesDecrypt(aKey, ivB64, dataB64) {
  const iv = fromB64(ivB64);
  const ct = fromB64(dataB64);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aKey, ct);
  return new Uint8Array(pt);
}

function randBytes(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return a; }

export class Vault {
  constructor() {
    this.keyName = 'safemask_vault';
    this.keysStore = 'safemask_keys_v2';
    this.data = null; // encrypted structure
    this.map = null; // decrypted { tokens: { token: value } }
    this.aesKey = null; this.hmacKey = null;
    this.unlockTimer = null;
    this.autoLockMinutes = 10;
  }

  async init(onLockStateChange) {
    this.onLockStateChange = onLockStateChange;
    const res = await chrome.storage.local.get([this.keyName, this.keysStore, 'safemask_settings']);
    this.data = res[this.keyName] || null;
    const s = res['safemask_settings'];
    if (s && s.autoLockMinutes) this.autoLockMinutes = s.autoLockMinutes;
    await this.ensureKeys(res[this.keysStore]);
    await this.loadOrInitMap();
    if (this.onLockStateChange) this.onLockStateChange(true);
  }

  isUnlocked() { return true; }

  touch() { if (this.unlockTimer) clearTimeout(this.unlockTimer); this.unlockTimer = setTimeout(() => this.lock(), this.autoLockMinutes * 60 * 1000); }

  async ensureData() {
    if (this.data) return;
    this.data = { version: 2, createdAt: Date.now(), updatedAt: Date.now(), enc: { iv: null, data: null } };
    await chrome.storage.local.set({ [this.keyName]: this.data });
  }

  async unlock() { return true; }

  lock() {
    if (this.unlockTimer) { clearTimeout(this.unlockTimer); this.unlockTimer = null; }
  }

  async _persistEncrypted(obj) {
    const bytes = enc.encode(JSON.stringify(obj));
    if (!this.aesKey) throw new Error('Vault not initialized');
    const encd = await aesEncrypt(this.aesKey, bytes);
    this.data.enc = encd;
    this.data.updatedAt = Date.now();
    await chrome.storage.local.set({ [this.keyName]: this.data });
  }

  async exportEncrypted() { await this.ensureData(); return this.data; }

  async importEncrypted(data) {
    // Do not overwrite salts unless user accepts importing; here we adopt provided data
    this.data = data; this.map = null; this.aesKey = null; this.hmacKey = null; this.passphrase = null;
    await chrome.storage.local.set({ [this.keyName]: this.data });
  }

  async putToken(token, original) {
    if (!this.map) throw new Error('Vault locked');
    if (!this.map.tokens) this.map.tokens = {};
    if (!this.map.tokens[token]) this.map.tokens[token] = original;
    await this._persistEncrypted(this.map);
  }

  getOriginal(token) {
    if (!this.map || !this.map.tokens) return null;
    return this.map.tokens[token] || null;
  }

  async computeToken(type, value) {
    if (!this.hmacKey) throw new Error('Vault not initialized');
    const norm = `${type}|${(value||'').trim().toLowerCase()}`;
    const mac = await hmacHex(this.hmacKey, norm);
    const short = mac.slice(0, 8).toUpperCase();
    return `${type}_${short}`;
  }

  async ensureKeys(stored) {
    if (this.aesKey && this.hmacKey) return;
    let rec = stored;
    if (!rec) {
      const aes = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt','decrypt']);
      const hmac = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256', length: 256 }, true, ['sign']);
      const aesRaw = await crypto.subtle.exportKey('raw', aes);
      const hmacRaw = await crypto.subtle.exportKey('raw', hmac);
      rec = { aes: toB64(aesRaw), hmac: toB64(hmacRaw) };
      await chrome.storage.local.set({ [this.keysStore]: rec });
    }
    this.aesKey = await crypto.subtle.importKey('raw', fromB64(rec.aes), { name: 'AES-GCM', length: 256 }, true, ['encrypt','decrypt']);
    this.hmacKey = await crypto.subtle.importKey('raw', fromB64(rec.hmac), { name: 'HMAC', hash: 'SHA-256' }, true, ['sign']);
  }

  async loadOrInitMap() {
    await this.ensureData();
    if (!this.data.enc?.iv || !this.data.enc?.data) {
      this.map = { tokens: {} };
      await this._persistEncrypted(this.map);
    } else {
      const pt = await aesDecrypt(this.aesKey, this.data.enc.iv, this.data.enc.data);
      const obj = JSON.parse(dec.decode(pt));
      this.map = obj || { tokens: {} };
    }
  }

  async clear() {
    this.map = { tokens: {} };
    await this._persistEncrypted(this.map);
  }
}
export const CryptoUtils = { hmacHex, aesEncrypt, aesDecrypt };


