// Pengesahan: kata laluan (SHA-256 + salt per-pengguna + pepper rahsia), session token,
// had percubaan dan pengesahan emel. Pepper disimpan dalam PropertiesService, bukan dalam kod.

function _hex(bait) {
  return bait.map(function (b) { return ((b + 256) % 256).toString(16).padStart(2, '0'); }).join('');
}
function sha256(teksMasuk) {
  return _hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, teksMasuk, Utilities.Charset.UTF_8));
}
function _pepper() {
  const p = PropertiesService.getScriptProperties().getProperty('PEPPER');
  if (!p) throw new Error('PEPPER belum ditetapkan. Jalankan setup().');
  return p;
}
function hashKata(kata, salt) {
  let h = kata + '|' + salt + '|' + _pepper();
  for (let i = 0; i < PUSINGAN_HASH; i++) h = sha256(h + salt);
  return h;
}
function _samaSelamat(a, b) {
  if (a.length !== b.length) return false;
  let beza = 0;
  for (let i = 0; i < a.length; i++) beza |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return beza === 0;
}
function _salt() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

function _cariPenggunaEmel(emel) {
  const e = String(emel || '').trim().toLowerCase();
  return baca('Pengguna').filter(function (u) { return u.Emel.toLowerCase() === e; })[0] || null;
}
function _cariPengguna(id) {
  return baca('Pengguna').filter(function (u) { return u.ID === id; })[0] || null;
}
function _staf(p) {
  return ['penyemak', 'pelulus', 'admin'].indexOf(p.Peranan) >= 0;
}
function _profilAwam(u) {
  return { id: u.ID, emel: u.Emel, nama: u.Nama, jabatan: u.Jabatan || '', telefon: u.Telefon || '', peranan: u.Peranan };
}

// ------------------------------------------------------------ had percubaan
function hadKadar(kunci, maks, saat, mesej) {
  const cache = CacheService.getScriptCache();
  const k = 'kadar_' + sha256(kunci);
  const bil = Number(cache.get(k) || 0);
  if (bil >= maks) throw new Ralat(mesej || 'Terlalu banyak percubaan. Cuba lagi sebentar lagi.', 'KADAR');
  cache.put(k, String(bil + 1), saat);
}

// ------------------------------------------------------------------- sesi
function cipta_sesi(pengguna) {
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  CacheService.getScriptCache().put('sesi_' + token, pengguna.ID, TTL_SESI);
  return token;
}

// Dipanggil pada SETIAP permintaan selepas log masuk. Peranan dan status aktif
// dibaca semula dari Sheet supaya perubahan oleh admin berkuat kuasa serta-merta.
function sahkanSesi(token, peranan) {
  if (!token || typeof token !== 'string' || token.length > 100) {
    throw new Ralat('Sesi tamat. Sila log masuk semula.', 'AUTH');
  }
  const uid = CacheService.getScriptCache().get('sesi_' + token);
  if (!uid) throw new Ralat('Sesi tamat. Sila log masuk semula.', 'AUTH');
  const p = _cariPengguna(uid);
  if (!p || !bool(p.Aktif) || !bool(p.Disahkan)) {
    throw new Ralat('Akaun tidak aktif. Hubungi admin.', 'AUTH');
  }
  if (peranan && peranan.indexOf(p.Peranan) < 0) {
    throw new Ralat('Anda tiada kebenaran untuk tindakan ini', 'FORBIDDEN');
  }
  _penggunaSemasa = p;
  return p;
}

// ---------------------------------------------------------- kod pengesahan
function _kodBaharu() {
  const n = parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 8), 16) % 1000000;
  return String(n).padStart(6, '0');
}
function _simpanKod(jenis, emel, kod) {
  CacheService.getScriptCache().put('kod_' + jenis + '_' + sha256(emel.toLowerCase()),
    JSON.stringify({ h: sha256(kod + '|' + emel.toLowerCase() + '|' + _pepper()), n: 0 }), TTL_KOD);
}
function _semakKod(jenis, emel, kod) {
  const cache = CacheService.getScriptCache();
  const k = 'kod_' + jenis + '_' + sha256(emel.toLowerCase());
  const mentah = cache.get(k);
  if (!mentah) throw new Ralat('Kod tidak sah atau telah tamat tempoh. Minta kod baharu.');
  const rekod = JSON.parse(mentah);
  if (rekod.n >= 5) {
    cache.remove(k);
    throw new Ralat('Terlalu banyak percubaan salah. Minta kod baharu.');
  }
  const padan = _samaSelamat(rekod.h, sha256(String(kod).trim() + '|' + emel.toLowerCase() + '|' + _pepper()));
  if (!padan) {
    rekod.n++;
    cache.put(k, JSON.stringify(rekod), TTL_KOD);
    throw new Ralat('Kod tidak betul');
  }
  cache.remove(k);
}

function _sahkanKata(kata) {
  if (typeof kata !== 'string' || kata.length < 8) throw new Ralat('Kata laluan sekurang-kurangnya 8 aksara');
  if (kata.length > 100) throw new Ralat('Kata laluan terlalu panjang');
  return kata;
}
function _sahkanEmel(emel) {
  const e = String(emel || '').trim().toLowerCase();
  if (e.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Ralat('Emel tidak sah');
  const domain = tetapan('domain_emel').trim().toLowerCase();
  if (domain && e.split('@')[1] !== domain) throw new Ralat('Hanya emel @' + domain + ' dibenarkan mendaftar');
  return e;
}

// ----------------------------------------------------------- tindakan awam
function daftar(d) {
  const emel = _sahkanEmel(d.emel);
  const kata = _sahkanKata(d.kata_laluan);
  const nama = teks(d.nama, 2, 100, 'Nama');
  const jabatan = d.jabatan ? teks(d.jabatan, 0, 100, 'Jabatan') : '';
  const telefon = d.telefon ? teks(d.telefon, 0, 20, 'No. telefon') : '';
  if (d.persetujuan !== true) throw new Ralat('Anda mesti bersetuju dengan notis privasi');

  hadKadar('daftar_emel_' + emel, 3, 1800, 'Terlalu banyak permintaan pendaftaran untuk emel ini. Cuba lagi dalam 30 minit.');
  hadKadar('daftar_global', 40, TTL_SESI, 'Pendaftaran dihadkan buat sementara waktu. Hubungi admin.');

  const sedia = _cariPenggunaEmel(emel);
  const mesejSama = 'Jika emel ini belum berdaftar, kod pengesahan 6 digit telah dihantar. Masukkan kod untuk mengaktifkan akaun.';
  if (sedia && bool(sedia.Disahkan)) return { mesej: mesejSama };   // tidak dedahkan sama ada emel wujud

  const salt = _salt();
  const adminAwal = (PropertiesService.getScriptProperties().getProperty('ADMIN_EMAIL') || '').trim().toLowerCase();
  const baris = {
    Emel: emel, Nama: nama, Jabatan: jabatan, Telefon: telefon,
    Peranan: emel === adminAwal ? 'admin' : 'pemohon',
    Aktif: false, Disahkan: false, Salt: salt, Hash: hashKata(kata, salt),
    Dicipta: new Date().toISOString(),
  };
  if (sedia) {
    kemas('Pengguna', sedia.ID, baris);   // pendaftaran belum disahkan: ganti
    audit('daftar_semula', 'Pengguna', sedia.ID, null, Object.assign({ ID: sedia.ID }, baris));
  } else {
    const baharu = tambah('Pengguna', baris);
    audit('daftar', 'Pengguna', baharu.ID, null, baharu);
  }
  const kod = _kodBaharu();
  _simpanKod('daftar', emel, kod);
  hantarEmel([emel], 'Kod pengesahan akaun Tempahan Kenderaan',
    '<p>Kod pengesahan anda: <b style="font-size:18px">' + esc(kod) + '</b></p><p>Kod ini sah selama 30 minit. Abaikan emel ini jika anda tidak mendaftar.</p>');
  return { mesej: mesejSama };
}

function sahkanEmelPendaftaran(d) {
  const emel = String(d.emel || '').trim().toLowerCase();
  hadKadar('sahkan_' + emel, 10, 1800);
  const u = _cariPenggunaEmel(emel);
  if (!u) throw new Ralat('Kod tidak sah atau telah tamat tempoh. Minta kod baharu.');
  _semakKod('daftar', emel, d.kod);
  const baharu = kemas('Pengguna', u.ID, { Disahkan: true, Aktif: true });
  audit('sahkan_emel', 'Pengguna', u.ID, u, baharu);
  return { mesej: 'Akaun diaktifkan. Sila log masuk.' };
}

function logMasuk(d) {
  const emel = String(d.emel || '').trim().toLowerCase();
  if (!emel || emel.length > 120) throw new Ralat('Emel atau kata laluan tidak betul');
  hadKadar('login_' + emel, 8, 300, 'Terlalu banyak percubaan. Cuba lagi dalam 5 minit.');
  const u = _cariPenggunaEmel(emel);
  const kata = typeof d.kata_laluan === 'string' ? d.kata_laluan.slice(0, 100) : '';
  // Sentiasa kira hash supaya masa tindak balas tidak membezakan emel wujud/tidak.
  const hash = hashKata(kata, u ? u.Salt : 'x');
  if (!u || !_samaSelamat(hash, u.Hash)) throw new Ralat('Emel atau kata laluan tidak betul');
  if (!bool(u.Disahkan)) throw new Ralat('Emel belum disahkan. Daftar semula untuk mendapat kod baharu.');
  if (!bool(u.Aktif)) throw new Ralat('Akaun tidak aktif. Hubungi admin.');
  _penggunaSemasa = u;
  audit('log_masuk', 'Pengguna', u.ID, null, null);
  return { token: cipta_sesi(u), profil: _profilAwam(u) };
}

function logKeluar(d, p) {
  CacheService.getScriptCache().remove('sesi_' + d.token);   // batalkan di server
  audit('log_keluar', 'Pengguna', p.ID, null, null);
  return {};
}

function lupaKata(d) {
  const emel = String(d.emel || '').trim().toLowerCase();
  if (!emel || emel.length > 120) throw new Ralat('Emel tidak sah');
  hadKadar('lupa_' + emel, 3, 1800, 'Terlalu banyak permintaan. Cuba lagi dalam 30 minit.');
  hadKadar('lupa_global', 40, TTL_SESI, 'Permintaan dihadkan buat sementara waktu. Hubungi admin.');
  const u = _cariPenggunaEmel(emel);
  if (u && bool(u.Disahkan) && bool(u.Aktif)) {
    const kod = _kodBaharu();
    _simpanKod('reset', emel, kod);
    hantarEmel([emel], 'Tetapan semula kata laluan',
      '<p>Kod tetapan semula: <b style="font-size:18px">' + esc(kod) + '</b></p><p>Sah selama 30 minit. Abaikan emel ini jika bukan anda yang meminta.</p>');
  }
  return { mesej: 'Jika emel ini berdaftar, kod tetapan semula telah dihantar.' };
}

function tetapSemula(d) {
  const emel = String(d.emel || '').trim().toLowerCase();
  hadKadar('tetap_' + emel, 10, 1800);
  const kata = _sahkanKata(d.kata_baru);
  const u = _cariPenggunaEmel(emel);
  if (!u) throw new Ralat('Kod tidak sah atau telah tamat tempoh. Minta kod baharu.');
  _semakKod('reset', emel, d.kod);
  const salt = _salt();
  const baharu = kemas('Pengguna', u.ID, { Salt: salt, Hash: hashKata(kata, salt) });
  _penggunaSemasa = u;
  audit('tetap_semula_kata', 'Pengguna', u.ID, u, baharu);
  return { mesej: 'Kata laluan dikemas kini. Sila log masuk.' };
}

// ----------------------------------------------------------- tindakan sesi
function profilSaya(d, p) {
  return _profilAwam(p);
}

function kemasKiniProfil(d, p) {
  const baharu = kemas('Pengguna', p.ID, {
    Nama: teks(d.nama, 2, 100, 'Nama'),
    Jabatan: d.jabatan ? teks(d.jabatan, 0, 100, 'Jabatan') : '',
    Telefon: d.telefon ? teks(d.telefon, 0, 20, 'No. telefon') : '',
  });
  audit('kemas_kini_profil', 'Pengguna', p.ID, p, baharu);
  return _profilAwam(baharu);
}

function tukarKata(d, p) {
  hadKadar('tukar_' + p.ID, 8, 300);
  const baru = _sahkanKata(d.kata_baru);
  if (!_samaSelamat(hashKata(String(d.kata_lama || '').slice(0, 100), p.Salt), p.Hash)) {
    throw new Ralat('Kata laluan semasa tidak betul');
  }
  const salt = _salt();
  const baharu = kemas('Pengguna', p.ID, { Salt: salt, Hash: hashKata(baru, salt) });
  audit('tukar_kata', 'Pengguna', p.ID, p, baharu);
  return {};
}
