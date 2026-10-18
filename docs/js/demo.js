// MOD DEMO: menjalankan kod backend Apps Script yang sebenar (docs/demo/backend.js, dijana
// daripada tempahan-sheets/apps-script/*.gs) di dalam pelayar, dengan tiruan Google Sheets, Drive,
// MailApp dan CacheService. Data disimpan dalam localStorage pelayar ini sahaja.
import { ciptaBackend } from '../demo/backend.js';
import { KATA_DEMO } from './demo-info.js';

const KUNCI_STATE = 'vb_demo_state_v1';

// ---------------------------------------------------------------- SHA-256 segerak
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be,
  0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa,
  0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85,
  0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
  0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
function sha256(bait) {
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const panjang = bait.length;
  const jumlah = (((panjang + 9 + 63) >> 6) << 6);
  const m = new Uint8Array(jumlah);
  m.set(bait);
  m[panjang] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(jumlah - 8, Math.floor((panjang * 8) / 0x100000000));
  dv.setUint32(jumlah - 4, (panjang * 8) >>> 0);
  const w = new Uint32Array(64);
  const rr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < jumlah; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  H.forEach((x, i) => ov.setUint32(i * 4, x));
  return out;
}
const enc = new TextEncoder();
const keSigned = (u8) => Array.from(u8, (b) => (b > 127 ? b - 256 : b));
const dariSigned = (a) => Uint8Array.from(a, (b) => (b + 256) % 256);
const keB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192)); return btoa(s); };
const dariB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// ---------------------------------------------------------------- tiruan Sheets
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
        if (sel.fmt !== '@' && typeof v === 'string') {
          if (v.startsWith('=')) v = "'" + v;   // demo: jangan jalankan formula
          else if (v.trim() !== '' && !isNaN(Number(v))) v = Number(v);
          else if (v.startsWith("'")) v = v.slice(1);
        }
        sel.v = v;
      }
    }
    return this;
  }
  setNumberFormat(f) {
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.sel(this.r + i, this.c + j).fmt = f;
    return this;
  }
  setFontWeight() { return this; }
}
class Lembaran {
  constructor(nama, sel = []) { this.nama = nama; this.sel_ = new Map(sel); }
  sel(r, c) {
    const k = r + ',' + c;
    if (!this.sel_.has(k)) this.sel_.set(k, { v: '', fmt: '' });
    return this.sel_.get(k);
  }
  getRange(r, c, nr = 1, nc = 1) { return new Julat(this, r, c, nr, nc); }
  getLastRow() {
    let maks = 0;
    for (const [k, s] of this.sel_) if (s.v !== '' && s.v !== null) maks = Math.max(maks, Number(k.split(',')[0]));
    return maks;
  }
  getMaxRows() { return 1000; }
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
    const p = {};
    p.setDescription = () => p; p.addEditor = () => p; p.getEditors = () => []; p.removeEditors = () => p;
    p.canDomainEdit = () => false; p.setDomainEdit = () => p;
    return p;
  }
}

// ---------------------------------------------------------------- persekitaran
function bina(simpan) {
  const lembaran = new Map();
  const sifat = new Map();
  const cache = new Map();
  const fail = new Map();
  const outbox = [];
  let tiada = 0;

  if (simpan) {
    simpan.lembaran.forEach(([nama, sel]) => lembaran.set(nama, new Lembaran(nama, sel)));
    simpan.sifat.forEach(([k, v]) => sifat.set(k, v));
    simpan.cache.forEach(([k, v]) => cache.set(k, v));
    simpan.fail.forEach(([k, v]) => fail.set(k, v));
    outbox.push(...simpan.outbox);
    tiada = simpan.tiada || 0;
  }

  const ss = {
    getId: () => 'DEMO',
    getSheetByName: (n) => lembaran.get(n) || null,
    insertSheet: (n) => { const s = new Lembaran(n); lembaran.set(n, s); return s; },
    getSheets: () => [...lembaran.values()],
    deleteSheet: (s) => lembaran.delete(s.nama),
  };
  const blob = (b, mime, nama) => ({ getBytes: () => b, getContentType: () => mime, getName: () => nama });

  const G = {
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => keSigned(sha256(enc.encode(s))),
      getUuid: () => crypto.randomUUID(),
      base64Decode: (s) => {
        if (!/^[A-Za-z0-9+/=]*$/.test(s)) throw new Error('base64 tidak sah');
        return keSigned(dariB64(s));
      },
      base64Encode: (b) => keB64(dariSigned(b)),
      newBlob: blob,
      formatDate: (d, zon, fmt) => {
        const t = new Date(d.getTime() + 8 * 3600000);
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
      get: (k) => { const e = cache.get(k); if (!e) return null; if (e.t < Date.now()) { cache.delete(k); return null; } return e.v; },
      put: (k, v, ttl) => { cache.set(k, { v: String(v), t: Date.now() + (ttl || 600) * 1000 }); },
      remove: (k) => { cache.delete(k); },
    }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (s) => ({ s, setMimeType() { return this; }, getContent() { return this.s; } }),
    },
    MailApp: { sendEmail: (o) => { outbox.push({ to: o.to, subject: o.subject, htmlBody: o.htmlBody, masa: new Date().toISOString() }); } },
    DriveApp: {
      createFolder: () => ({ getId: () => 'FOLDER-DEMO' }),
      getFolderById: () => ({
        createFile: (b) => {
          const id = 'F' + (++tiada);
          fail.set(id, { b64: keB64(dariSigned(b.getBytes())), mime: b.getContentType(), nama: b.getName(), sampah: false });
          return { getId: () => id };
        },
      }),
      getFileById: (id) => ({
        getBlob: () => { const f = fail.get(id); return blob(keSigned(dariB64(f.b64)), f.mime, f.nama); },
        setTrashed: (v) => { const f = fail.get(id); if (f) { f.sampah = v; if (v) f.b64 = ''; } },
      }),
    },
    ScriptApp: { newTrigger: () => { const t = { timeBased: () => t, everyHours: () => t, onMonthDay: () => t, atHour: () => t, create: () => t }; return t; }, getProjectTriggers: () => [] },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'demo@demo.my' }) },
    Logger: { log() {} },
  };

  const serial = () => ({
    lembaran: [...lembaran.values()].map((s) => [s.nama, [...s.sel_.entries()]]),
    sifat: [...sifat.entries()], cache: [...cache.entries()], fail: [...fail.entries()], outbox, tiada,
  });
  return { G, outbox, serial };
}

// ---------------------------------------------------------------- penyediaan
let sedia = null;

function simpanState(env) {
  try {
    localStorage.setItem(KUNCI_STATE, JSON.stringify(env.serial()));
    return true;
  } catch {
    return false;   // kuota penuh atau storan disekat: demo masih berjalan, tetapi tidak dikekalkan
  }
}

function jalankan(B, tindakan, data = {}, token) {
  return JSON.parse(B.doPost({ postData: { contents: JSON.stringify({ tindakan, token, ...data }) } }).getContent());
}

function semaiDemo(env, B) {
  const p = (t, d, tk) => {
    const j = jalankan(B, t, d, tk);
    if (!j.ok) throw new Error(`Semaian demo gagal (${t}): ${j.error}`);
    return j.data;
  };
  env.G.PropertiesService.getScriptProperties().setProperty('ADMIN_EMAIL', 'admin@demo.my');
  env.G.PropertiesService.getScriptProperties().setProperty('APP_URL', location.origin + location.pathname);
  B.setup();

  const akaun = [
    ['admin@demo.my', 'Dina (Admin)', 'Pentadbiran'], ['pemohon@demo.my', 'Ali (Pemohon)', 'Unit Latihan'],
    ['pemohon2@demo.my', 'Emi (Pemohon)', 'Unit Kewangan'], ['penyemak@demo.my', 'Bakar (Penyemak)', 'Unit Pentadbiran'],
    ['pelulus@demo.my', 'Chong (Pelulus)', 'Pejabat Pengarah'],
  ];
  const token = {};
  for (const [emel, nama, jabatan] of akaun) {
    const awal = env.outbox.length;
    p('daftar', { emel, nama, jabatan, kata_laluan: KATA_DEMO, persetujuan: true });
    const kod = /<b[^>]*>(\d{6})<\/b>/.exec(env.outbox[awal].htmlBody)[1];
    p('sahkan_emel', { emel, kod });
    token[emel] = p('log_masuk', { emel, kata_laluan: KATA_DEMO }).token;
  }
  const senarai = p('admin_pengguna', {}, token['admin@demo.my']);
  const tetapPeranan = (emel, peranan) => p('admin_tetapkan_peranan', { id: senarai.find((u) => u.emel === emel).id, peranan, aktif: true }, token['admin@demo.my']);
  tetapPeranan('penyemak@demo.my', 'penyemak');
  tetapPeranan('pelulus@demo.my', 'pelulus');

  const T = { ali: token['pemohon@demo.my'], emi: token['pemohon2@demo.my'], bakar: token['penyemak@demo.my'], chong: token['pelulus@demo.my'] };
  const hari = (n, jam = 0) => new Date(Date.now() + n * 86400000 + jam * 3600000).toISOString();
  const k = p('cari_kosong', { mula: hari(30), tamat: hari(30, 1) }, T.bakar);
  const kend = (jenis) => k.kenderaan.find((v) => v.jenis === jenis).id;
  const pem = (nama) => k.pemandu.find((d) => d.nama === nama).id;
  const draf = (tk, o) => p('simpan_permohonan', { tujuan: 'Lawatan', destinasi: 'Ipoh', bil_penumpang: 6, jenis_diminta: 'van', perlu_pemandu: false, ...o }, tk).id;

  // 1. diluluskan
  let id = draf(T.ali, { tujuan: 'Lawatan kerja ke cawangan Ipoh', destinasi: 'Ipoh, Perak', bil_penumpang: 8, tarikh_mula: hari(3), tarikh_tamat: hari(3, 8) });
  p('hantar_permohonan', { id }, T.ali); p('ambil_semakan', { id }, T.bakar);
  p('hantar_kelulusan', { id, vehicle_id: kend('van'), catatan: 'Dokumen lengkap' }, T.bakar); p('lulus', { id, catatan: 'Diluluskan' }, T.chong);
  // 2. menunggu kelulusan
  id = draf(T.emi, { tujuan: 'Hantar peralatan ke Shah Alam', destinasi: 'Shah Alam', bil_penumpang: 3, jenis_diminta: 'hilux', tarikh_mula: hari(5), tarikh_tamat: hari(5, 5) });
  p('hantar_permohonan', { id }, T.emi); p('ambil_semakan', { id }, T.bakar);
  p('hantar_kelulusan', { id, vehicle_id: kend('hilux') }, T.bakar);
  // 3. baru dihantar, belum disemak (bas + pemandu)
  id = draf(T.ali, { tujuan: 'Program komuniti anjuran jabatan', destinasi: 'Klang', bil_penumpang: 30, jenis_diminta: 'bas', perlu_pemandu: true, tarikh_mula: hari(8), tarikh_tamat: hari(8, 7) });
  p('hantar_permohonan', { id }, T.ali);
  // 4. dipulangkan
  id = draf(T.emi, { tujuan: 'Mesyuarat di pejabat negeri', destinasi: 'Seremban', bil_penumpang: 4, tarikh_mula: hari(6), tarikh_tamat: hari(6, 6) });
  p('hantar_permohonan', { id }, T.emi); p('ambil_semakan', { id }, T.bakar);
  p('pulangkan', { id, catatan: 'Sila lampirkan surat arahan mesyuarat' }, T.bakar);
  // 5. ditolak
  id = draf(T.ali, { tujuan: 'Lawatan peribadi hujung minggu', destinasi: 'Langkawi', bil_penumpang: 5, tarikh_mula: hari(4), tarikh_tamat: hari(4, 30) });
  p('hantar_permohonan', { id }, T.ali); p('ambil_semakan', { id }, T.bakar);
  p('hantar_kelulusan', { id, vehicle_id: kend('van') }, T.bakar);
  p('tolak', { id, sebab: 'Tujuan tiada kaitan dengan urusan rasmi jabatan' }, T.chong);
  // 6. draf
  draf(T.ali, { tujuan: 'Draf: kursus kakitangan', destinasi: 'Putrajaya', tarikh_mula: hari(12), tarikh_tamat: hari(12, 5) });

  env.outbox.length = 0;
}

async function sediakan() {
  if (sedia) return sedia;
  let simpan = null;
  try { simpan = JSON.parse(localStorage.getItem(KUNCI_STATE) || 'null'); } catch { simpan = null; }
  const env = bina(simpan);
  const B = ciptaBackend(env.G);
  if (!simpan) {
    semaiDemo(env, B);
    simpanState(env);
  }
  sedia = { env, B };
  return sedia;
}

// Dipanggil oleh api.js dengan badan permintaan yang sama seperti dihantar ke Web App.
export async function panggil(badan) {
  const { env, B } = await sediakan();
  await new Promise((r) => setTimeout(r, 120));   // meniru sedikit latensi rangkaian
  const j = JSON.parse(B.doPost({ postData: { contents: JSON.stringify(badan) } }).getContent());
  if (!simpanState(env) && !window.__amaranSimpan) {
    window.__amaranSimpan = true;
    console.warn('Storan penuh: data demo tidak dikekalkan selepas refresh.');
  }
  return j;
}

export async function petiMel() {
  const { env } = await sediakan();
  return env.outbox.slice().reverse();
}

export function setSemulaDemo() {
  try { localStorage.removeItem(KUNCI_STATE); sessionStorage.removeItem('vb_token'); } catch { /* abaikan */ }
  location.reload();
}
