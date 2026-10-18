// Tiruan minimum API Google Apps Script untuk menguji backend di Node.
// Meniru tingkah laku yang penting kepada keselamatan: format teks '@' menghalang formula,
// tanpa '@' nilai bermula '=' menjadi formula dan teks seperti nombor ditukar kepada nombor.
import crypto from 'node:crypto';
import vm from 'node:vm';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ZON_OFFSET_JAM = 8;

class Julat {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const baris = [];
      for (let j = 0; j < this.nc; j++) baris.push(this.sh.sel(this.r + i, this.c + j).v);
      out.push(baris);
    }
    return out;
  }
  setValues(nilai) {
    for (let i = 0; i < this.nr; i++) {
      for (let j = 0; j < this.nc; j++) {
        const sel = this.sh.sel(this.r + i, this.c + j);
        let v = nilai[i][j];
        sel.formula = false;
        if (sel.fmt !== '@' && typeof v === 'string') {
          if (v.startsWith('=')) sel.formula = true;                       // Sheets mentafsir sebagai formula
          else if (v.trim() !== '' && !isNaN(Number(v))) v = Number(v);    // dan menukar teks nombor
          else if (v.startsWith("'")) v = v.slice(1);                      // apostrof ialah penanda teks
        }
        sel.v = v;
      }
    }
    this.sh.ubahan++;
    return this;
  }
  setNumberFormat(f) {
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.sel(this.r + i, this.c + j).fmt = f;
    return this;
  }
  setFontWeight() { return this; }
}

class Lembaran {
  constructor(nama) { this.nama = nama; this.sel_ = new Map(); this.ubahan = 0; this.maks = 1000; this.perlindungan = []; }
  sel(r, c) {
    const k = r + ',' + c;
    if (!this.sel_.has(k)) this.sel_.set(k, { v: '', fmt: '', formula: false });
    return this.sel_.get(k);
  }
  getRange(r, c, nr = 1, nc = 1) { return new Julat(this, r, c, nr, nc); }
  getLastRow() {
    let maks = 0;
    for (const [k, s] of this.sel_) if (s.v !== '' && s.v !== null) maks = Math.max(maks, Number(k.split(',')[0]));
    return maks;
  }
  getMaxRows() { return this.maks; }
  setFrozenRows() { return this; }
  deleteRow(r) {
    const baru = new Map();
    for (const [k, s] of this.sel_) {
      const [rr, cc] = k.split(',').map(Number);
      if (rr === r) continue;
      baru.set((rr > r ? rr - 1 : rr) + ',' + cc, s);
    }
    this.sel_ = baru;
  }
  protect() {
    const p = { editors: ['pemilik@x.my', 'lain@x.my'] };
    p.setDescription = () => p;
    p.addEditor = (e) => { if (!p.editors.includes(e)) p.editors.push(e); return p; };
    p.getEditors = () => p.editors.map((e) => ({ getEmail: () => e }));
    p.removeEditors = (l) => { p.editors = p.editors.filter((e) => !l.some((x) => x.getEmail() === e)); return p; };
    p.canDomainEdit = () => false;
    p.setDomainEdit = () => p;
    this.perlindungan.push(p);
    return p;
  }
  semuaSel() { return [...this.sel_.values()]; }
}

export function bina() {
  const lembaran = new Map();
  const ss = {
    getId: () => 'SS1',
    getSheetByName: (n) => lembaran.get(n) || null,
    insertSheet: (n) => { const s = new Lembaran(n); lembaran.set(n, s); return s; },
    getSheets: () => [...lembaran.values()],
    deleteSheet: (s) => lembaran.delete(s.nama),
  };
  const sifat = new Map();
  const cache = new Map();
  const fail = new Map();
  const outbox = [];
  const picu = [];
  const luaran = { gagalEmel: false };

  const bait = (buf) => [...buf].map((b) => (b > 127 ? b - 256 : b));
  const darBait = (a) => Buffer.from(a.map((b) => (b + 256) % 256));
  const blob = (b, mime, nama) => ({
    getBytes: () => b, getContentType: () => mime, getName: () => nama,
  });

  const konteks = {
    console, Date, Math, JSON, Object, Array, String, Number, Buffer, isNaN, isFinite, parseInt,
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => bait(crypto.createHash('sha256').update(typeof s === 'string' ? s : darBait(s)).digest()),
      getUuid: () => crypto.randomUUID(),
      base64Decode: (s) => {
        if (!/^[A-Za-z0-9+/=]*$/.test(s)) throw new Error('base64 tidak sah');
        return bait(Buffer.from(s, 'base64'));
      },
      base64Encode: (b) => darBait(b).toString('base64'),
      newBlob: blob,
      formatDate: (d, zon, fmt) => {
        const t = new Date(d.getTime() + ZON_OFFSET_JAM * 3600000);
        const p = (n) => String(n).padStart(2, '0');
        return fmt.replace('yyyy', t.getUTCFullYear()).replace('dd', p(t.getUTCDate())).replace('MM', p(t.getUTCMonth() + 1))
          .replace('HH', p(t.getUTCHours())).replace('mm', p(t.getUTCMinutes()));
      },
    },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (sifat.has(k) ? sifat.get(k) : null),
      setProperty: (k, v) => { sifat.set(k, String(v)); },
    }) },
    CacheService: { getScriptCache: () => ({
      get: (k) => (cache.has(k) ? cache.get(k) : null),
      put: (k, v, ttl) => { if (ttl > 21600) throw new Error('TTL cache melebihi 21600s'); cache.set(k, String(v)); },
      remove: (k) => { cache.delete(k); },
    }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (s) => ({ s, setMimeType() { return this; }, getContent() { return this.s; } }),
    },
    MailApp: { sendEmail: (o) => { if (luaran.gagalEmel) throw new Error('kuota emel'); outbox.push(o); } },
    DriveApp: {
      createFolder: () => ({ getId: () => 'FOLDER1' }),
      getFolderById: () => ({
        createFile: (b) => { const id = 'F' + (fail.size + 1); fail.set(id, { blob: b, sampah: false }); return { getId: () => id }; },
      }),
      getFileById: (id) => ({
        getBlob: () => fail.get(id).blob,
        setTrashed: (v) => { fail.get(id).sampah = v; },
      }),
    },
    ScriptApp: { newTrigger: (fn) => {
      const t = { fn, timeBased: () => t, everyHours: () => t, onMonthDay: () => t, atHour: () => t, create: () => { picu.push(fn); return t; } };
      return t;
    }, getProjectTriggers: () => picu.map((fn) => ({ getHandlerFunction: () => fn })) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'pemilik@x.my' }) },
    Logger: { log() {} },
  };

  const ctx = vm.createContext(konteks);
  const dir = new URL('../apps-script/', import.meta.url).pathname;
  const kod = readdirSync(dir).filter((f) => f.endsWith('.gs')).sort().map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  vm.runInContext(kod, ctx, { filename: 'gabungan.gs' });

  return {
    ctx, ss, lembaran, sifat, cache, fail, outbox, picu, luaran,
    jalan: (kod_) => vm.runInContext(kod_, ctx),
    panggil(tindakan, data = {}, token) {
      const badan = JSON.stringify({ tindakan, token, ...data });
      const out = vm.runInContext('doPost', ctx)({ postData: { contents: badan } });
      return JSON.parse(out.getContent());
    },
    mentah(teks) {
      return JSON.parse(vm.runInContext('doPost', ctx)({ postData: { contents: teks } }).getContent());
    },
  };
}
