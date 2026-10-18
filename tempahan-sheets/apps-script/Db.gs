// Lapisan akses Google Sheets. Semua nilai disimpan sebagai teks (format lajur '@')
// supaya Sheets tidak mentafsir sebarang nilai sebagai formula, tarikh atau nombor.

let _memori = {};            // cache bacaan untuk satu pelaksanaan sahaja
let _penggunaSemasa = null;  // pengguna yang sedang membuat permintaan (untuk audit)

function Ralat(mesej, kod) {
  this.message = mesej;
  this.kod = kod || 'RALAT';
}
Ralat.prototype = Object.create(Error.prototype);
Ralat.prototype.constructor = Ralat;

function buka() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function _lembaran(nama) {
  const sh = buka().getSheetByName(nama);
  if (!sh) throw new Error('Lembaran tiada: ' + nama + '. Jalankan setup() dahulu.');
  return sh;
}

// Neutralkan nilai yang bermula dengan = + - @ (formula injection).
function sanitizeForSheet(nilai) {
  const s = String(nilai === null || nilai === undefined ? '' : nilai);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function _dariSel(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  const s = String(v);
  return /^'[=+\-@]/.test(s) ? s.slice(1) : s;
}
function _keSel(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return sanitizeForSheet(JSON.stringify(v));
  return sanitizeForSheet(v);
}

function bool(v) {
  return v === true || String(v).toUpperCase() === 'TRUE';
}

function baca(nama) {
  if (_memori[nama]) return _memori[nama];
  const lajur = SKEMA[nama];
  const sh = _lembaran(nama);
  const n = sh.getLastRow();
  const data = n > 1 ? sh.getRange(2, 1, n - 1, lajur.length).getValues() : [];
  _memori[nama] = data.map(function (baris, i) {
    const o = { _baris: i + 2 };
    lajur.forEach(function (k, j) { o[k] = _dariSel(baris[j]); });
    return o;
  });
  return _memori[nama];
}

function tambah(nama, obj) {
  const lajur = SKEMA[nama];
  if (lajur[0] === 'ID' && !obj.ID) obj.ID = Utilities.getUuid();
  const sh = _lembaran(nama);
  const baris = sh.getLastRow() + 1;
  const julat = sh.getRange(baris, 1, 1, lajur.length);
  julat.setNumberFormat('@');                       // WAJIB sebelum setValues
  julat.setValues([lajur.map(function (k) { return _keSel(obj[k]); })]);
  delete _memori[nama];
  return obj;
}

function kemas(nama, id, perubahan) {
  const lajur = SKEMA[nama];
  const kunci = lajur[0];
  const sedia = baca(nama).filter(function (r) { return r[kunci] === id; })[0];
  if (!sedia) throw new Ralat('Rekod tidak ditemui');
  const baharu = Object.assign({}, sedia, perubahan);
  const julat = _lembaran(nama).getRange(sedia._baris, 1, 1, lajur.length);
  julat.setNumberFormat('@');
  julat.setValues([lajur.map(function (k) { return _keSel(baharu[k]); })]);
  delete _memori[nama];
  return baharu;
}

// Padam baris yang memenuhi syarat (dari bawah supaya indeks baris kekal sah).
function padamJika(nama, syarat) {
  const sh = _lembaran(nama);
  const sasaran = baca(nama).filter(syarat).map(function (r) { return r._baris; }).sort(function (a, b) { return b - a; });
  sasaran.forEach(function (b) { sh.deleteRow(b); });
  delete _memori[nama];
  return sasaran.length;
}

function dalamKunci(fn) {
  const kunci = LockService.getScriptLock();
  kunci.waitLock(25000);
  try {
    _memori = {};   // bacaan mesti segar di dalam kunci
    return fn();
  } finally {
    kunci.releaseLock();
  }
}

function tetapan(kunci) {
  const t = baca('Tetapan').filter(function (x) { return x.Kunci === kunci; })[0];
  return t ? t.Nilai : (TETAPAN_LALAI[kunci] !== undefined ? TETAPAN_LALAI[kunci] : '');
}
function tetapanNombor(kunci) {
  const n = parseInt(tetapan(kunci), 10);
  return isNaN(n) ? parseInt(TETAPAN_LALAI[kunci], 10) : n;
}

// ------------------------------------------------------------------- audit
// Hanya tambah. Tiada fungsi dalam kod ini yang mengemas atau memadam baris Audit.
function _bersihAudit(obj) {
  if (!obj) return '';
  const salin = Object.assign({}, obj);
  delete salin.Salt;
  delete salin.Hash;
  delete salin._baris;
  const teks = JSON.stringify(salin);
  return teks.length > 40000 ? teks.slice(0, 40000) : teks;
}

function audit(tindakan, jadual, rekodId, sebelum, selepas) {
  tambah('Audit', {
    Masa: new Date().toISOString(),
    PenggunaID: _penggunaSemasa ? _penggunaSemasa.ID : '',
    Tindakan: tindakan,
    Jadual: jadual,
    RekodID: rekodId || '',
    Sebelum: _bersihAudit(sebelum),
    Selepas: _bersihAudit(selepas),
  });
}

// ------------------------------------------------------------- pengesahan input
function teks(nilai, min, maks, label) {
  const s = String(nilai === null || nilai === undefined ? '' : nilai).trim();
  if (s.length < min) throw new Ralat(label + ' diperlukan' + (min > 1 ? ' (sekurang-kurangnya ' + min + ' aksara)' : ''));
  if (s.length > maks) throw new Ralat(label + ' terlalu panjang (maksimum ' + maks + ' aksara)');
  return s;
}
function nombor(nilai, min, maks, label) {
  const n = Number(nilai);
  if (!isFinite(n) || Math.floor(n) !== n || n < min || n > maks) {
    throw new Ralat(label + ' mesti nombor bulat antara ' + min + ' dan ' + maks);
  }
  return n;
}
function tarikhISO(nilai, label) {
  const d = new Date(nilai);
  if (!nilai || isNaN(d.getTime())) throw new Ralat(label + ' tidak sah');
  return d.toISOString();
}
function esc(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function fmtMY(iso) {
  return iso ? Utilities.formatDate(new Date(iso), ZON, 'dd/MM/yyyy HH:mm') : '-';
}
function bertindih(mulaA, tamatA, mulaB, tamatB) {
  return new Date(mulaA) < new Date(tamatB) && new Date(mulaB) < new Date(tamatA);
}
