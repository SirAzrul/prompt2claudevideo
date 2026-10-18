// DIJANA oleh tempahan-sheets/scripts/bina-demo.mjs daripada apps-script/*.gs. JANGAN SUNTING.
// Mod demo sahaja: menjalankan kod backend Apps Script dalam pelayar dengan tiruan API Google.
export function ciptaBackend(G) {
  const { Utilities, SpreadsheetApp, PropertiesService, CacheService, LockService, ContentService, MailApp, DriveApp, ScriptApp, Session, Logger } = G;
// ---- Admin.gs
// Tindakan pentadbir. Semua dikawal peranan 'admin' di router (Kod.gs).

function adminPengguna() {
  return baca('Pengguna').map(function (u) {
    return {
      id: u.ID, emel: u.Emel, nama: u.Nama, jabatan: u.Jabatan, peranan: u.Peranan,
      aktif: bool(u.Aktif), disahkan: bool(u.Disahkan),
    };
  }).sort(function (a, b) { return a.nama.localeCompare(b.nama); });
}

function adminTetapkanPeranan(d, p) {
  const u = _cariPengguna(String(d.id || ''));
  if (!u) throw new Ralat('Pengguna tidak ditemui');
  if (PERANAN.indexOf(d.peranan) < 0) throw new Ralat('Peranan tidak sah');
  const aktif = d.aktif === true;
  if (u.ID === p.ID && (d.peranan !== 'admin' || !aktif)) {
    throw new Ralat('Admin tidak boleh menurunkan peranan atau menyahaktifkan akaun sendiri');
  }
  const baharu = kemas('Pengguna', u.ID, { Peranan: d.peranan, Aktif: aktif });
  audit('tetapkan_peranan', 'Pengguna', u.ID, u, baharu);
  return {};
}

function adminKenderaan() {
  return baca('Kenderaan').map(function (v) {
    return { id: v.ID, jenis: v.Jenis, nama: v.Nama, no_plat: v.NoPlat, kapasiti: Number(v.Kapasiti), aktif: bool(v.Aktif) };
  });
}

function adminSimpanKenderaan(d) {
  if (JENIS_KENDERAAN.indexOf(d.jenis) < 0) throw new Ralat('Jenis kenderaan tidak sah');
  const medan = {
    Jenis: d.jenis, Nama: teks(d.nama, 1, 60, 'Nama'),
    NoPlat: teks(d.no_plat, 2, 20, 'No. plat').toUpperCase(),
    Kapasiti: nombor(d.kapasiti, 1, 100, 'Kapasiti'), Aktif: d.aktif !== false,
  };
  const duplikasi = baca('Kenderaan').some(function (v) { return v.NoPlat === medan.NoPlat && v.ID !== d.id; });
  if (duplikasi) throw new Ralat('No. plat sudah wujud');
  if (d.id) {
    const lama = baca('Kenderaan').filter(function (v) { return v.ID === d.id; })[0];
    if (!lama) throw new Ralat('Kenderaan tidak ditemui');
    audit('kemas_kenderaan', 'Kenderaan', d.id, lama, kemas('Kenderaan', d.id, medan));
    return { id: d.id };
  }
  const baharu = tambah('Kenderaan', medan);
  audit('tambah_kenderaan', 'Kenderaan', baharu.ID, null, baharu);
  return { id: baharu.ID };
}

function adminPemandu() {
  return baca('Pemandu').map(function (x) { return { id: x.ID, nama: x.Nama, telefon: x.Telefon, aktif: bool(x.Aktif) }; });
}

function adminSimpanPemandu(d) {
  const medan = {
    Nama: teks(d.nama, 2, 100, 'Nama'),
    Telefon: d.telefon ? teks(d.telefon, 0, 20, 'No. telefon') : '', Aktif: d.aktif !== false,
  };
  if (d.id) {
    const lama = baca('Pemandu').filter(function (x) { return x.ID === d.id; })[0];
    if (!lama) throw new Ralat('Pemandu tidak ditemui');
    audit('kemas_pemandu', 'Pemandu', d.id, lama, kemas('Pemandu', d.id, medan));
    return { id: d.id };
  }
  const baharu = tambah('Pemandu', medan);
  audit('tambah_pemandu', 'Pemandu', baharu.ID, null, baharu);
  return { id: baharu.ID };
}

function adminTetapan() {
  return Object.keys(TETAPAN_LALAI).map(function (k) { return { kunci: k, nilai: tetapan(k) }; });
}

function adminSimpanTetapan(d) {
  const kunci = String(d.kunci || '');
  if (!(kunci in TETAPAN_LALAI)) throw new Ralat('Tetapan tidak dikenali');
  let nilai = String(d.nilai === undefined || d.nilai === null ? '' : d.nilai).trim();
  if (kunci === 'domain_emel') {
    if (nilai && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(nilai)) throw new Ralat('Domain tidak sah');
    nilai = nilai.toLowerCase();
  } else if (!/^\d{1,4}$/.test(nilai) || Number(nilai) < 1) {
    throw new Ralat('Nilai mesti nombor positif');
  }
  const sedia = baca('Tetapan').filter(function (t) { return t.Kunci === kunci; })[0];
  if (sedia) {
    audit('kemas_tetapan', 'Tetapan', kunci, sedia, kemas('Tetapan', kunci, { Nilai: nilai }));
  } else {
    audit('tambah_tetapan', 'Tetapan', kunci, null, tambah('Tetapan', { Kunci: kunci, Nilai: nilai }));
  }
  return {};
}

function adminSemuaPermohonan(d, p) {
  return baca('Permohonan')
    .filter(function (r) { return r.Status !== 'draf'; })
    .sort(function (a, b) { return a.Dicipta < b.Dicipta ? 1 : -1; })
    .slice(0, 300)
    .map(function (r) { return _bentuk(r, p); });
}

function adminAudit() {
  const nama = {};
  baca('Pengguna').forEach(function (u) { nama[u.ID] = u.Nama; });
  const semua = baca('Audit');
  return semua.slice(Math.max(0, semua.length - 200)).reverse().map(function (a) {
    return {
      masa: a.Masa, pengguna: nama[a.PenggunaID] || (a.PenggunaID ? a.PenggunaID.slice(0, 8) : 'sistem'),
      tindakan: a.Tindakan, jadual: a.Jadual, rekod: a.RekodID.slice(0, 8),
    };
  });
}

// ---- Aliran.gs
// Aliran kerja permohonan. Setiap fungsi di sini dipanggil di dalam LockService
// (lihat Kod.gs), jadi semakan bertindih dan penulisan tempahan tidak boleh berlumba.
//
// Status: draf → dihantar → dalam_semakan ⇄ dipulangkan
//         dalam_semakan → menunggu_kelulusan → diluluskan → selesai | ditolak | dibatalkan | tamat_tempoh

const KEPUTUSAN_SAH = ['hantar', 'pulang', 'semak_lengkap', 'lulus', 'tolak', 'hantar_balik', 'batal', 'tamat_tempoh'];

// -------------------------------------------------------------- bantuan
function _permohonan(id) {
  return baca('Permohonan').filter(function (r) { return r.ID === id; })[0] || null;
}
function _bolehLihat(p, r) {
  return r.PemohonID === p.ID || (_staf(p) && r.Status !== 'draf');
}
function _dapatLihat(id, p) {
  const r = _permohonan(String(id || ''));
  if (!r || !_bolehLihat(p, r)) throw new Ralat('Permohonan tidak ditemui');
  return r;
}
function _dapatMilik(id, p, statusBoleh) {
  const r = _permohonan(String(id || ''));
  if (!r || r.PemohonID !== p.ID) throw new Ralat('Permohonan tidak ditemui');
  if (statusBoleh && statusBoleh.indexOf(r.Status) < 0) throw new Ralat('Tindakan ini tidak boleh dibuat pada status semasa');
  return r;
}
function _catat(permohonanId, olehId, keputusan, justifikasi) {
  tambah('Keputusan', {
    PermohonanID: permohonanId, OlehID: olehId || '', Keputusan: keputusan,
    Justifikasi: (justifikasi || '').trim(), Masa: new Date().toISOString(),
  });
}
function _ubahPermohonan(r, perubahan, tindakan) {
  const baharu = kemas('Permohonan', r.ID, Object.assign({ Dikemas: new Date().toISOString() }, perubahan));
  audit(tindakan, 'Permohonan', r.ID, r, baharu);
  return baharu;
}

function _bentuk(r, p) {
  const staf = _staf(p);
  const pem = _cariPengguna(r.PemohonID);
  const v = r.KenderaanID ? baca('Kenderaan').filter(function (x) { return x.ID === r.KenderaanID; })[0] : null;
  const dr = r.PemanduID ? baca('Pemandu').filter(function (x) { return x.ID === r.PemanduID; })[0] : null;
  return {
    id: r.ID, no_rujukan: r.NoRujukan || null, pemohon_id: r.PemohonID,
    tujuan: r.Tujuan, destinasi: r.Destinasi, bil_penumpang: Number(r.Penumpang),
    tarikh_mula: r.Mula, tarikh_tamat: r.Tamat, jenis_diminta: r.JenisDiminta || null,
    perlu_pemandu: bool(r.PerluPemandu), vehicle_id: r.KenderaanID || null, driver_id: r.PemanduID || null,
    status: r.Status, bil_pulang: Number(r.BilPulang || 0), tarikh_akhir_pembetulan: r.AkhirPembetulan || null,
    penyemak_id: staf ? (r.PenyemakID || null) : null,
    catatan_semakan: r.CatatanSemakan || null, sebab_tolak: r.SebabTolak || null,
    created_at: r.Dicipta, updated_at: r.Dikemas,
    pemohon: (staf || r.PemohonID === p.ID) && pem ? { nama: pem.Nama, jabatan: pem.Jabatan, telefon: pem.Telefon } : null,
    vehicle: v ? { nama: v.Nama, no_plat: v.NoPlat } : null,
    driver: dr ? { nama: dr.Nama } : null,
  };
}

function _sahkanTarikh(mula, tamat, masaDepan) {
  if (new Date(tamat) <= new Date(mula)) throw new Ralat('Tarikh tamat mesti selepas tarikh mula');
  if (masaDepan) {
    const had = tetapanNombor('had_hari_tempahan');
    if (new Date(mula) <= new Date()) throw new Ralat('Tarikh mula mesti pada masa hadapan');
    if (new Date(mula) > new Date(Date.now() + had * 86400000)) {
      throw new Ralat('Tempahan tidak boleh melebihi ' + had + ' hari ke hadapan');
    }
  }
}

function _janaRujukan() {
  const tahun = Utilities.formatDate(new Date(), ZON, 'yyyy');
  const props = PropertiesService.getScriptProperties();
  const kunci = 'KAUNTER_' + tahun;
  const n = Number(props.getProperty(kunci) || 0) + 1;
  props.setProperty(kunci, String(n));
  return 'VB-' + tahun + '-' + String(n).padStart(4, '0');
}

function _kenderaanKosong(mula, tamat) {
  const sibuk = baca('Tempahan').filter(function (t) { return bertindih(t.Mula, t.Tamat, mula, tamat); });
  return baca('Kenderaan').filter(function (v) {
    return bool(v.Aktif) && !sibuk.some(function (t) { return t.KenderaanID === v.ID; });
  });
}
function _pemanduKosong(mula, tamat) {
  const sibuk = baca('Tempahan').filter(function (t) { return t.PemanduID && bertindih(t.Mula, t.Tamat, mula, tamat); });
  return baca('Pemandu').filter(function (d) {
    return bool(d.Aktif) && !sibuk.some(function (t) { return t.PemanduID === d.ID; });
  });
}

// ------------------------------------------------------------- pemohon
function simpanPermohonan(d, p) {
  const tujuan = teks(d.tujuan, 5, 300, 'Tujuan');
  const destinasi = teks(d.destinasi, 2, 200, 'Destinasi');
  const bil = nombor(d.bil_penumpang, 1, 100, 'Bilangan penumpang');
  const mula = tarikhISO(d.tarikh_mula, 'Tarikh mula');
  const tamat = tarikhISO(d.tarikh_tamat, 'Tarikh tamat');
  _sahkanTarikh(mula, tamat, false);
  const jenis = d.jenis_diminta ? String(d.jenis_diminta) : '';
  if (jenis && JENIS_KENDERAAN.indexOf(jenis) < 0) throw new Ralat('Jenis kenderaan tidak sah');
  const medan = {
    Tujuan: tujuan, Destinasi: destinasi, Penumpang: bil, Mula: mula, Tamat: tamat,
    JenisDiminta: jenis, PerluPemandu: d.perlu_pemandu === true,
  };
  if (!d.id) {
    const baharu = tambah('Permohonan', Object.assign({
      PemohonID: p.ID, Status: 'draf', BilHantar: 0, BilPulang: 0,
      Dicipta: new Date().toISOString(), Dikemas: new Date().toISOString(),
    }, medan));
    audit('simpan_draf', 'Permohonan', baharu.ID, null, baharu);
    return { id: baharu.ID };
  }
  const r = _dapatMilik(d.id, p, ['draf', 'dipulangkan']);
  _ubahPermohonan(r, medan, 'simpan_draf');
  return { id: r.ID };
}

function hantarPermohonan(d, p) {
  const r = _dapatMilik(d.id, p, ['draf', 'dipulangkan']);
  if (r.Status === 'dipulangkan' && new Date() > new Date(r.AkhirPembetulan)) {
    throw new Ralat('Tempoh pembetulan telah tamat');
  }
  _sahkanTarikh(r.Mula, r.Tamat, true);
  const pertama = !r.NoRujukan;
  const versi = Number(r.BilHantar) + 1;
  const baharu = _ubahPermohonan(r, {
    Status: 'dihantar', BilHantar: versi, NoRujukan: r.NoRujukan || _janaRujukan(), AkhirPembetulan: '',
  }, 'hantar');
  tambah('Versi', {
    PermohonanID: r.ID, Versi: versi, Masa: new Date().toISOString(),
    Data: {
      tujuan: baharu.Tujuan, destinasi: baharu.Destinasi, bil_penumpang: baharu.Penumpang,
      tarikh_mula: baharu.Mula, tarikh_tamat: baharu.Tamat,
      jenis_diminta: baharu.JenisDiminta, perlu_pemandu: bool(baharu.PerluPemandu),
    },
  });
  _catat(r.ID, p.ID, 'hantar');
  if (pertama) emelPemohon(baharu, 'diterima');
  emelStaf(baharu, 'tugasan_penyemak');
  return { no_rujukan: baharu.NoRujukan };
}

function batalPermohonan(d, p) {
  const r = _permohonan(String(d.id || ''));
  if (!r || (r.PemohonID !== p.ID && p.Peranan !== 'admin')) throw new Ralat('Permohonan tidak ditemui');
  if (STATUS_AKHIR.indexOf(r.Status) >= 0) throw new Ralat('Permohonan tidak boleh dibatalkan pada status ini');
  const had = tetapanNombor('had_batal_jam');
  if (r.Status === 'diluluskan' && p.Peranan !== 'admin' && new Date(r.Mula) - new Date() < had * 3600000) {
    throw new Ralat('Pembatalan selepas lulus mesti dibuat sekurang-kurangnya ' + had + ' jam sebelum perjalanan. Sila hubungi admin');
  }
  const sebab = d.sebab ? teks(d.sebab, 0, 300, 'Sebab') : '';
  padamJika('Tempahan', function (t) { return t.PermohonanID === r.ID; });
  const baharu = _ubahPermohonan(r, { Status: 'dibatalkan' }, 'batal');
  _catat(r.ID, p.ID, 'batal', sebab);
  emelPemohon(baharu, 'dibatalkan');
  return {};
}

// ------------------------------------------------------------- penyemak
function ambilSemakan(d, p) {
  const r = _permohonan(String(d.id || ''));
  if (!r || r.Status !== 'dihantar') throw new Ralat('Permohonan tidak berada dalam senarai tugasan');
  if (r.PemohonID === p.ID) throw new Ralat('Anda tidak boleh menyemak permohonan sendiri');
  if (r.PenyemakID && r.PenyemakID !== p.ID) throw new Ralat('Permohonan ini telah diambil penyemak lain');
  _ubahPermohonan(r, { Status: 'dalam_semakan', PenyemakID: p.ID }, 'ambil_semakan');
  return {};
}

function _dalamSemakanSaya(id, p) {
  const r = _permohonan(String(id || ''));
  if (!r || r.Status !== 'dalam_semakan' || r.PenyemakID !== p.ID) throw new Ralat('Permohonan tidak dalam semakan anda');
  return r;
}

function pulangkanPermohonan(d, p) {
  const catatan = teks(d.catatan, 5, 500, 'Catatan pemulangan');
  const r = _dalamSemakanSaya(d.id, p);
  const had = tetapanNombor('had_pemulangan');
  if (Number(r.BilPulang) >= had) {
    throw new Ralat('Had pemulangan (' + had + ') telah dicapai. Sila hantar kepada pelulus untuk keputusan');
  }
  const hari = tetapanNombor('tempoh_pembetulan_hari');
  const baharu = _ubahPermohonan(r, {
    Status: 'dipulangkan', BilPulang: Number(r.BilPulang) + 1,
    AkhirPembetulan: new Date(Date.now() + hari * 86400000).toISOString(), CatatanSemakan: catatan,
  }, 'pulang');
  _catat(r.ID, p.ID, 'pulang', catatan);
  emelPemohon(baharu, 'dipulangkan');
  return {};
}

function hantarKelulusan(d, p) {
  const r = _dalamSemakanSaya(d.id, p);
  const v = baca('Kenderaan').filter(function (x) { return x.ID === d.vehicle_id && bool(x.Aktif); })[0];
  if (!v) throw new Ralat('Sila pilih kenderaan yang aktif');
  if (Number(v.Kapasiti) < Number(r.Penumpang)) {
    throw new Ralat('Kapasiti ' + v.Nama + ' (' + v.Kapasiti + ') kurang daripada bilangan penumpang (' + r.Penumpang + ')');
  }
  let dr = null;
  if (d.driver_id) {
    dr = baca('Pemandu').filter(function (x) { return x.ID === d.driver_id && bool(x.Aktif); })[0];
    if (!dr) throw new Ralat('Sila pilih pemandu yang aktif');
  }
  if ((v.Jenis === 'bas' || bool(r.PerluPemandu)) && !dr) throw new Ralat('Pemandu mesti ditugaskan untuk tempahan ini');
  if (!_kenderaanKosong(r.Mula, r.Tamat).some(function (x) { return x.ID === v.ID; })) {
    throw new Ralat('Kenderaan tersebut sudah ditempah pada masa ini');
  }
  if (dr && !_pemanduKosong(r.Mula, r.Tamat).some(function (x) { return x.ID === dr.ID; })) {
    throw new Ralat('Pemandu tersebut sudah ditugaskan pada masa ini');
  }
  const catatan = d.catatan ? teks(d.catatan, 0, 500, 'Catatan') : '';
  const baharu = _ubahPermohonan(r, {
    Status: 'menunggu_kelulusan', KenderaanID: v.ID, PemanduID: dr ? dr.ID : '', CatatanSemakan: catatan,
  }, 'semak_lengkap');
  _catat(r.ID, p.ID, 'semak_lengkap', catatan);
  emelStaf(baharu, 'tugasan_pelulus');
  return {};
}

// -------------------------------------------------------------- pelulus
function _menungguKelulusan(id, p) {
  const r = _permohonan(String(id || ''));
  if (!r || r.Status !== 'menunggu_kelulusan') throw new Ralat('Permohonan tidak menunggu kelulusan');
  if (r.PemohonID === p.ID || r.PenyemakID === p.ID) {
    throw new Ralat('Pelulus mesti orang yang berbeza daripada pemohon dan penyemak');
  }
  return r;
}

function lulusPermohonan(d, p) {
  const r = _menungguKelulusan(d.id, p);
  const catatan = d.catatan ? teks(d.catatan, 0, 500, 'Catatan') : '';
  // Semak semula kerana tempahan lain mungkin diluluskan selepas penyemak menugaskan.
  const v = _kenderaanKosong(r.Mula, r.Tamat).some(function (x) { return x.ID === r.KenderaanID; });
  const dr = !r.PemanduID || _pemanduKosong(r.Mula, r.Tamat).some(function (x) { return x.ID === r.PemanduID; });
  if (!v || !dr) {
    throw new Ralat('Kenderaan atau pemandu telah ditempah pada masa ini. Hantar balik kepada penyemak untuk tugasan semula');
  }
  const t = tambah('Tempahan', {
    PermohonanID: r.ID, KenderaanID: r.KenderaanID, PemanduID: r.PemanduID, Mula: r.Mula, Tamat: r.Tamat,
  });
  audit('tempahan_dikunci', 'Tempahan', t.ID, null, t);
  const baharu = _ubahPermohonan(r, { Status: 'diluluskan', PelulusID: p.ID }, 'lulus');
  _catat(r.ID, p.ID, 'lulus', catatan);
  emelPemohon(baharu, 'keputusan');
  return {};
}

function tolakPermohonan(d, p) {
  const sebab = teks(d.sebab, 10, 500, 'Justifikasi penolakan');
  const r = _menungguKelulusan(d.id, p);
  const baharu = _ubahPermohonan(r, { Status: 'ditolak', PelulusID: p.ID, SebabTolak: sebab }, 'tolak');
  _catat(r.ID, p.ID, 'tolak', sebab);
  emelPemohon(baharu, 'keputusan');
  return {};
}

function hantarBalikPenyemak(d, p) {
  const catatan = teks(d.catatan, 5, 500, 'Catatan');
  const r = _menungguKelulusan(d.id, p);
  _ubahPermohonan(r, { Status: 'dalam_semakan', CatatanSemakan: catatan }, 'hantar_balik');
  _catat(r.ID, p.ID, 'hantar_balik', catatan);
  return {};
}

// ---------------------------------------------------------------- bacaan
function senaraiSaya(d, p) {
  return baca('Permohonan')
    .filter(function (r) { return r.PemohonID === p.ID; })
    .sort(function (a, b) { return a.Dicipta < b.Dicipta ? 1 : -1; })
    .map(function (r) { return _bentuk(r, p); });
}

function senaraiTugasan(d, p) {
  let hasil;
  if (p.Peranan === 'penyemak') {
    hasil = baca('Permohonan').filter(function (r) {
      return r.PemohonID !== p.ID && (
        (r.Status === 'dihantar' && (!r.PenyemakID || r.PenyemakID === p.ID)) ||
        (r.Status === 'dalam_semakan' && r.PenyemakID === p.ID));
    });
  } else if (p.Peranan === 'pelulus') {
    hasil = baca('Permohonan').filter(function (r) {
      return r.Status === 'menunggu_kelulusan' && r.PemohonID !== p.ID && r.PenyemakID !== p.ID;
    });
  } else {
    throw new Ralat('Anda tiada kebenaran untuk tindakan ini', 'FORBIDDEN');
  }
  return hasil.sort(function (a, b) { return a.Dikemas < b.Dikemas ? -1 : 1; })
    .map(function (r) { return _bentuk(r, p); });
}

function butiran(d, p) {
  const r = _dapatLihat(d.id, p);
  const staf = _staf(p);
  const keputusan = baca('Keputusan')
    .filter(function (k) { return k.PermohonanID === r.ID; })
    .sort(function (a, b) { return a.Masa < b.Masa ? -1 : 1; })
    .map(function (k) {
      const oleh = _cariPengguna(k.OlehID);
      return {
        keputusan: k.Keputusan, masa: k.Masa, justifikasi: k.Justifikasi || null,
        oleh: oleh && (staf || oleh.ID === p.ID) ? oleh.Nama : 'Pegawai',
      };
    });
  const dokumen = baca('Dokumen')
    .filter(function (x) { return x.PermohonanID === r.ID; })
    .map(function (x) { return { id: x.ID, nama_fail: x.NamaFail, saiz: Number(x.Saiz) }; });
  return { permohonan: _bentuk(r, p), keputusan: keputusan, dokumen: dokumen };
}

function cariKosong(d, p) {
  const mula = tarikhISO(d.mula, 'Tarikh mula');
  const tamat = tarikhISO(d.tamat, 'Tarikh tamat');
  if (new Date(tamat) <= new Date(mula)) throw new Ralat('Tarikh tamat mesti selepas tarikh mula');
  return {
    kenderaan: _kenderaanKosong(mula, tamat).map(function (v) {
      return { id: v.ID, jenis: v.Jenis, nama: v.Nama, no_plat: v.NoPlat, kapasiti: Number(v.Kapasiti) };
    }),
    pemandu: _pemanduKosong(mula, tamat).map(function (x) { return { id: x.ID, nama: x.Nama }; }),
  };
}

function kalendar(d, p) {
  const dari = tarikhISO(d.dari, 'Tarikh');
  const hingga = tarikhISO(d.hingga, 'Tarikh');
  if (new Date(hingga) - new Date(dari) > 62 * 86400000) throw new Ralat('Julat kalendar terlalu panjang');
  const staf = _staf(p);
  const tempahan = baca('Tempahan')
    .filter(function (t) { return bertindih(t.Mula, t.Tamat, dari, hingga); })
    .sort(function (a, b) { return a.Mula < b.Mula ? -1 : 1; })
    .map(function (t) {
      const v = baca('Kenderaan').filter(function (x) { return x.ID === t.KenderaanID; })[0];
      const dr = t.PemanduID ? baca('Pemandu').filter(function (x) { return x.ID === t.PemanduID; })[0] : null;
      const r = _permohonan(t.PermohonanID);
      const pem = r ? _cariPengguna(r.PemohonID) : null;
      return {
        no_plat: v ? v.NoPlat : '', mula: t.Mula, tamat: t.Tamat, pemandu: dr ? dr.Nama : null,
        pemohon: staf && pem ? pem.Nama : null, destinasi: staf && r ? r.Destinasi : null,
      };
    });
  const kenderaan = baca('Kenderaan').filter(function (v) { return bool(v.Aktif); })
    .map(function (v) { return { jenis: v.Jenis, nama: v.Nama, no_plat: v.NoPlat }; });
  return { kenderaan: kenderaan, tempahan: tempahan };
}

// ------------------------------------------------------------- dokumen
function _bait(base64) {
  try { return Utilities.base64Decode(base64); } catch (e) { throw new Ralat('Fail tidak sah'); }
}
function _jenisFailSah(bait, mime) {
  const b = bait.map(function (x) { return (x + 256) % 256; });
  if (mime === 'application/pdf') return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
  if (mime === 'image/jpeg') return b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF;
  if (mime === 'image/png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47;
  return false;
}

function muatNaikDokumen(d, p) {
  const r = _dapatMilik(d.permohonan_id, p, ['draf', 'dipulangkan']);
  if (MIME_DIBENARKAN.indexOf(d.mime) < 0) throw new Ralat('Hanya PDF, JPG atau PNG dibenarkan');
  if (typeof d.data !== 'string') throw new Ralat('Fail tidak sah');
  if (baca('Dokumen').filter(function (x) { return x.PermohonanID === r.ID; }).length >= HAD_DOKUMEN_SETIAP_PERMOHONAN) {
    throw new Ralat('Had ' + HAD_DOKUMEN_SETIAP_PERMOHONAN + ' dokumen bagi setiap permohonan telah dicapai');
  }
  const bait = _bait(d.data);
  if (bait.length === 0 || bait.length > HAD_BAIT_DOKUMEN) throw new Ralat('Saiz fail maksimum 3MB');
  if (!_jenisFailSah(bait, d.mime)) throw new Ralat('Kandungan fail tidak sepadan dengan jenisnya');
  const nama = teks(d.nama_fail, 1, 120, 'Nama fail');
  const selamat = nama.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
  const folder = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID'));
  const fail = folder.createFile(Utilities.newBlob(bait, d.mime, r.ID + '_' + Date.now() + '_' + selamat));
  const baris = tambah('Dokumen', {
    PermohonanID: r.ID, NamaFail: nama, DriveID: fail.getId(), Saiz: bait.length, Masa: new Date().toISOString(),
  });
  audit('muat_naik_dokumen', 'Dokumen', baris.ID, null, baris);
  return { id: baris.ID };
}

function _dapatDokumen(id, p) {
  const dok = baca('Dokumen').filter(function (x) { return x.ID === String(id || ''); })[0];
  if (!dok) throw new Ralat('Dokumen tidak ditemui');
  const r = _permohonan(dok.PermohonanID);
  if (!r || !_bolehLihat(p, r)) throw new Ralat('Dokumen tidak ditemui');
  return { dok: dok, r: r };
}

function muatTurunDokumen(d, p) {
  const x = _dapatDokumen(d.id, p);
  const blob = DriveApp.getFileById(x.dok.DriveID).getBlob();
  audit('muat_turun_dokumen', 'Dokumen', x.dok.ID, null, null);
  return { nama_fail: x.dok.NamaFail, mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

function padamDokumen(d, p) {
  const x = _dapatDokumen(d.id, p);
  if (x.r.PemohonID !== p.ID || ['draf', 'dipulangkan'].indexOf(x.r.Status) < 0) {
    throw new Ralat('Dokumen tidak boleh dipadam pada status ini');
  }
  DriveApp.getFileById(x.dok.DriveID).setTrashed(true);
  padamJika('Dokumen', function (y) { return y.ID === x.dok.ID; });
  audit('padam_dokumen', 'Dokumen', x.dok.ID, x.dok, null);
  return {};
}

// ---------------------------------------------- tugas berjadual (lihat Setup.gs)
function tutupPermohonanLuput() {
  return dalamKunci(function () {
    let n = 0;
    const kini = new Date();
    baca('Permohonan').filter(function (r) {
      return r.Status === 'dipulangkan' && r.AkhirPembetulan && new Date(r.AkhirPembetulan) < kini;
    }).forEach(function (r) {
      const baharu = _ubahPermohonan(r, { Status: 'tamat_tempoh' }, 'tamat_tempoh');
      _catat(r.ID, '', 'tamat_tempoh', 'Tempoh pembetulan tamat');
      emelPemohon(baharu, 'tamat_tempoh');
      n++;
    });
    baca('Permohonan').filter(function (r) { return r.Status === 'diluluskan' && new Date(r.Tamat) < kini; })
      .forEach(function (r) { _ubahPermohonan(r, { Status: 'selesai' }, 'selesai'); });
    return n;
  });
}

// PDPA: padam rekod permohonan yang sudah ditutup selepas tempoh simpan.
// Log audit tidak dipadam di sini; lihat README bahagian PDPA.
function bersihkanRekodLama() {
  return dalamKunci(function () {
    const had = new Date(Date.now() - tetapanNombor('tempoh_simpan_tahun') * 365 * 86400000);
    const lama = baca('Permohonan').filter(function (r) {
      return STATUS_AKHIR.indexOf(r.Status) >= 0 && new Date(r.Dikemas) < had;
    });
    lama.forEach(function (r) {
      baca('Dokumen').filter(function (x) { return x.PermohonanID === r.ID; }).forEach(function (x) {
        try { DriveApp.getFileById(x.DriveID).setTrashed(true); } catch (e) { console.error('Padam fail gagal: ' + e); }
      });
      padamJika('Dokumen', function (x) { return x.PermohonanID === r.ID; });
      padamJika('Versi', function (x) { return x.PermohonanID === r.ID; });
      padamJika('Keputusan', function (x) { return x.PermohonanID === r.ID; });
      padamJika('Tempahan', function (x) { return x.PermohonanID === r.ID; });
      padamJika('Permohonan', function (x) { return x.ID === r.ID; });
      audit('padam_retensi', 'Permohonan', r.ID, null, null);
    });
    return lama.length;
  });
}

// ---- Auth.gs
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

// ---- Config.gs
// Sistem Tempahan Kenderaan Pusat - backend Google Apps Script + Google Sheets.
// Semua data dibaca dan ditulis melalui Web App (doPost) yang dikawal session token.
// JANGAN gunakan "Publish to Web" pada Spreadsheet ini, dan jangan kongsi Spreadsheet
// dengan sesiapa selain pentadbir sistem.

const ZON = 'Asia/Kuala_Lumpur';
const PUSINGAN_HASH = 500;              // bilangan pusingan SHA-256 (boleh dinaikkan jika login masih laju)
const TTL_SESI = 6 * 60 * 60;           // saat; had maksimum CacheService ialah 21600
const TTL_KOD = 30 * 60;                // kod pengesahan emel sah 30 minit
const HAD_BAIT_DOKUMEN = 3 * 1024 * 1024;
const HAD_BADAN_POST = 4500000;         // aksara; menolak permintaan terlalu besar
const HAD_DOKUMEN_SETIAP_PERMOHONAN = 10;

const PERANAN = ['pemohon', 'penyemak', 'pelulus', 'admin'];
const JENIS_KENDERAAN = ['van', 'hilux', 'bas'];
const STATUS_AKHIR = ['ditolak', 'dibatalkan', 'tamat_tempoh', 'selesai'];
const MIME_DIBENARKAN = ['application/pdf', 'image/jpeg', 'image/png'];

const TETAPAN_LALAI = {
  domain_emel: '',               // cth: organisasi.gov.my ; kosong = semua domain boleh daftar
  had_hari_tempahan: '60',       // tempah paling jauh N hari ke hadapan
  tempoh_pembetulan_hari: '7',   // masa pemohon untuk betulkan permohonan yang dipulangkan
  had_pemulangan: '3',           // bilangan maksimum permohonan boleh dipulangkan
  had_batal_jam: '24',           // pemohon boleh batal permohonan lulus sehingga N jam sebelum mula
  tempoh_simpan_tahun: '3',      // rekod permohonan yang selesai dipadam selepas N tahun
};

const SKEMA = {
  Pengguna: ['ID', 'Emel', 'Nama', 'Jabatan', 'Telefon', 'Peranan', 'Aktif', 'Disahkan', 'Salt', 'Hash', 'Dicipta'],
  Kenderaan: ['ID', 'Jenis', 'Nama', 'NoPlat', 'Kapasiti', 'Aktif'],
  Pemandu: ['ID', 'Nama', 'Telefon', 'Aktif'],
  Permohonan: ['ID', 'NoRujukan', 'PemohonID', 'Tujuan', 'Destinasi', 'Penumpang', 'Mula', 'Tamat',
    'JenisDiminta', 'PerluPemandu', 'KenderaanID', 'PemanduID', 'Status', 'BilHantar', 'BilPulang',
    'AkhirPembetulan', 'PenyemakID', 'PelulusID', 'CatatanSemakan', 'SebabTolak', 'Dicipta', 'Dikemas'],
  Tempahan: ['ID', 'PermohonanID', 'KenderaanID', 'PemanduID', 'Mula', 'Tamat'],
  Keputusan: ['ID', 'PermohonanID', 'OlehID', 'Keputusan', 'Justifikasi', 'Masa'],
  Versi: ['ID', 'PermohonanID', 'Versi', 'Data', 'Masa'],
  Dokumen: ['ID', 'PermohonanID', 'NamaFail', 'DriveID', 'Saiz', 'Masa'],
  Audit: ['ID', 'Masa', 'PenggunaID', 'Tindakan', 'Jadual', 'RekodID', 'Sebelum', 'Selepas'],
  Tetapan: ['Kunci', 'Nilai'],
};

// ---- Db.gs
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

// ---- Emel.gs
// Notifikasi emel melalui MailApp. Kuota harian MailApp: sekitar 100 penerima untuk akaun
// Gmail biasa dan 1500 untuk Google Workspace (semak kuota semasa di dokumentasi Google).
// Kegagalan menghantar emel tidak membatalkan tindakan; ia direkod dalam lembaran Audit.

function hantarEmel(kepada, subjek, badanHtml) {
  const unik = kepada.filter(function (e, i) { return e && kepada.indexOf(e) === i; });
  if (!unik.length) return;
  try {
    MailApp.sendEmail({
      to: unik.join(','),
      subject: subjek,
      htmlBody: badanHtml,
      name: 'Tempahan Kenderaan',
      noReply: true,
    });
  } catch (e) {
    console.error('Emel gagal: ' + e);
    try { audit('emel_gagal', 'Emel', '', null, { subjek: subjek, ralat: String(e).slice(0, 200) }); } catch (e2) { /* abaikan */ }
  }
}

function _emelPeranan(peranan, id) {
  return baca('Pengguna').filter(function (u) {
    return u.Peranan === peranan && bool(u.Aktif) && bool(u.Disahkan) && (!id || u.ID === id);
  }).map(function (u) { return u.Emel; });
}

function _ringkas(r) {
  const pem = _cariPengguna(r.PemohonID);
  const url = PropertiesService.getScriptProperties().getProperty('APP_URL') || '';
  return '<p><b>No. rujukan:</b> ' + esc(r.NoRujukan) + '<br>' +
    '<b>Pemohon:</b> ' + esc(pem ? pem.Nama : '') + '<br>' +
    '<b>Tujuan:</b> ' + esc(r.Tujuan) + '<br>' +
    '<b>Destinasi:</b> ' + esc(r.Destinasi) + '<br>' +
    '<b>Tarikh:</b> ' + esc(fmtMY(r.Mula)) + ' hingga ' + esc(fmtMY(r.Tamat)) + '</p>' +
    (url ? '<p><a href="' + esc(url) + '#/permohonan/' + esc(r.ID) + '">Buka permohonan</a></p>' : '');
}

function emelPemohon(r, jenis) {
  const pem = _cariPengguna(r.PemohonID);
  if (!pem) return;
  const no = r.NoRujukan;
  const ringkas = _ringkas(r);
  let subjek;
  let isi;
  if (jenis === 'diterima') {
    subjek = 'Permohonan diterima (' + no + ')';
    isi = '<p>Permohonan anda telah diterima. Simpan nombor rujukan untuk semakan status.</p>';
  } else if (jenis === 'dipulangkan') {
    subjek = 'Permohonan dipulangkan untuk pembetulan (' + no + ')';
    isi = '<p>Permohonan anda perlu dibetulkan sebelum ' + esc(fmtMY(r.AkhirPembetulan)) + '.</p>' +
      '<p><b>Catatan penyemak:</b> ' + esc(r.CatatanSemakan) + '</p>';
  } else if (jenis === 'keputusan') {
    if (r.Status === 'diluluskan') {
      subjek = 'Permohonan diluluskan (' + no + ')';
      isi = '<p>Permohonan anda diluluskan.</p>';
    } else {
      subjek = 'Permohonan tidak diluluskan (' + no + ')';
      isi = '<p>Permohonan anda tidak diluluskan.</p><p><b>Sebab:</b> ' + esc(r.SebabTolak) + '</p>';
    }
  } else if (jenis === 'dibatalkan') {
    subjek = 'Permohonan dibatalkan (' + no + ')';
    isi = '<p>Permohonan telah dibatalkan.</p>';
  } else if (jenis === 'tamat_tempoh') {
    subjek = 'Permohonan tamat tempoh (' + no + ')';
    isi = '<p>Permohonan ditutup kerana pembetulan tidak dihantar dalam tempoh yang ditetapkan. Sila buat permohonan baharu jika masih perlu.</p>';
  } else {
    return;
  }
  hantarEmel([pem.Emel], subjek, isi + ringkas);
}

function emelStaf(r, jenis) {
  if (jenis === 'tugasan_penyemak') {
    hantarEmel(_emelPeranan('penyemak', r.PenyemakID || null), 'Tugasan semakan baharu (' + r.NoRujukan + ')',
      '<p>Ada permohonan yang menunggu semakan anda.</p>' + _ringkas(r));
  } else if (jenis === 'tugasan_pelulus') {
    hantarEmel(_emelPeranan('pelulus'), 'Menunggu kelulusan (' + r.NoRujukan + ')',
      '<p>Ada permohonan yang menunggu keputusan anda.</p>' + _ringkas(r));
  }
}

// ---- Kod.gs
// Titik masuk Web App. Frontend menghantar POST dengan Content-Type text/plain
// (elak preflight CORS) dan badan JSON: { tindakan, token, ...data }.
//
// Semua tindakan kecuali daftar/sahkan_emel/log_masuk/lupa_kata/tetap_semula WAJIB
// ada token sesi yang sah. Peranan disemak di sini (server), bukan di frontend.

const SEMUA = ['pemohon', 'penyemak', 'pelulus', 'admin'];

// Dibina secara lazy: fail .gs dimuatkan mengikut susunan, jadi rujukan terus kepada fungsi
// dalam fail lain pada peringkat atas boleh gagal jika fail itu dimuatkan kemudian.
function _senaraiTindakan() {
  return {
  // awam (tiada token)
  daftar:          { awam: true, tulis: true, fn: daftar },
  sahkan_emel:     { awam: true, tulis: true, fn: sahkanEmelPendaftaran },
  log_masuk:       { awam: true, tulis: true, fn: logMasuk },
  lupa_kata:       { awam: true, tulis: true, fn: lupaKata },
  tetap_semula:    { awam: true, tulis: true, fn: tetapSemula },
  // semua pengguna log masuk
  log_keluar:      { peranan: SEMUA, tulis: true, fn: logKeluar },
  profil_saya:     { peranan: SEMUA, fn: profilSaya },
  kemas_kini_profil: { peranan: SEMUA, tulis: true, fn: kemasKiniProfil },
  tukar_kata:      { peranan: SEMUA, tulis: true, fn: tukarKata },
  senarai_saya:    { peranan: SEMUA, fn: senaraiSaya },
  butiran:         { peranan: SEMUA, fn: butiran },
  simpan_permohonan: { peranan: SEMUA, tulis: true, fn: simpanPermohonan },
  hantar_permohonan: { peranan: SEMUA, tulis: true, fn: hantarPermohonan },
  batal_permohonan:  { peranan: SEMUA, tulis: true, fn: batalPermohonan },
  cari_kosong:     { peranan: SEMUA, fn: cariKosong },
  kalendar:        { peranan: SEMUA, fn: kalendar },
  muat_naik_dokumen: { peranan: SEMUA, tulis: true, fn: muatNaikDokumen },
  muat_turun_dokumen: { peranan: SEMUA, tulis: true, fn: muatTurunDokumen },
  padam_dokumen:   { peranan: SEMUA, tulis: true, fn: padamDokumen },
  // penyemak / pelulus
  senarai_tugasan: { peranan: ['penyemak', 'pelulus'], fn: senaraiTugasan },
  ambil_semakan:   { peranan: ['penyemak'], tulis: true, fn: ambilSemakan },
  pulangkan:       { peranan: ['penyemak'], tulis: true, fn: pulangkanPermohonan },
  hantar_kelulusan: { peranan: ['penyemak'], tulis: true, fn: hantarKelulusan },
  lulus:           { peranan: ['pelulus'], tulis: true, fn: lulusPermohonan },
  tolak:           { peranan: ['pelulus'], tulis: true, fn: tolakPermohonan },
  hantar_balik:    { peranan: ['pelulus'], tulis: true, fn: hantarBalikPenyemak },
  // admin
  admin_pengguna:  { peranan: ['admin'], fn: adminPengguna },
  admin_tetapkan_peranan: { peranan: ['admin'], tulis: true, fn: adminTetapkanPeranan },
  admin_kenderaan: { peranan: ['admin'], fn: adminKenderaan },
  admin_simpan_kenderaan: { peranan: ['admin'], tulis: true, fn: adminSimpanKenderaan },
  admin_pemandu:   { peranan: ['admin'], fn: adminPemandu },
  admin_simpan_pemandu: { peranan: ['admin'], tulis: true, fn: adminSimpanPemandu },
  admin_tetapan:   { peranan: ['admin'], fn: adminTetapan },
  admin_simpan_tetapan: { peranan: ['admin'], tulis: true, fn: adminSimpanTetapan },
  admin_semua_permohonan: { peranan: ['admin'], fn: adminSemuaPermohonan },
  admin_audit:     { peranan: ['admin'], fn: adminAudit },
  };
}

function _jawab(objek) {
  return ContentService.createTextOutput(JSON.stringify(objek)).setMimeType(ContentService.MimeType.JSON);
}

// Tiada data dipulangkan melalui GET.
function doGet() {
  return _jawab({ ok: true, sistem: 'Tempahan Kenderaan' });
}

function doPost(e) {
  let jawapan;
  _memori = {};
  _penggunaSemasa = null;
  try {
    const mentah = e && e.postData ? e.postData.contents : '';
    if (!mentah || mentah.length > HAD_BADAN_POST) throw new Ralat('Permintaan tidak sah');
    let badan;
    try { badan = JSON.parse(mentah); } catch (x) { throw new Ralat('Permintaan tidak sah'); }
    if (!badan || typeof badan !== 'object' || typeof badan.tindakan !== 'string') throw new Ralat('Permintaan tidak sah');

    const peta = _senaraiTindakan();
    const t = Object.prototype.hasOwnProperty.call(peta, badan.tindakan) ? peta[badan.tindakan] : null;
    if (!t) throw new Ralat('Tindakan tidak dikenali');

    let pengguna = null;
    if (!t.awam) pengguna = sahkanSesi(badan.token, t.peranan);   // setiap permintaan
    const laksana = function () {
      // Sahkan semula di dalam kunci supaya data dan peranan segar.
      if (!t.awam && t.tulis) pengguna = sahkanSesi(badan.token, t.peranan);
      return t.fn(badan, pengguna);
    };
    jawapan = { ok: true, data: t.tulis ? dalamKunci(laksana) : laksana() };
  } catch (err) {
    if (err instanceof Ralat) {
      jawapan = { ok: false, error: err.message, kod: err.kod };
    } else {
      console.error('Ralat dalaman: ' + (err && err.stack ? err.stack : err));
      jawapan = { ok: false, error: 'Ralat dalaman. Cuba lagi atau hubungi admin.', kod: 'DALAMAN' };
    }
  }
  return _jawab(jawapan);
}

// ---- Setup.gs
// Jalankan setup() SEKALI dari editor Apps Script selepas menetapkan Script Properties
// ADMIN_EMAIL dan APP_URL (lihat README). Ia selamat dijalankan semula.

function setup() {
  const props = PropertiesService.getScriptProperties();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Buka Apps Script dari Spreadsheet (Extensions > Apps Script).');
  props.setProperty('SPREADSHEET_ID', ss.getId());

  if (!props.getProperty('PEPPER')) {
    props.setProperty('PEPPER', Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid());
  }
  if (!props.getProperty('ADMIN_EMAIL')) {
    throw new Error('Tetapkan Script Property ADMIN_EMAIL (emel admin pertama) sebelum menjalankan setup().');
  }

  Object.keys(SKEMA).forEach(function (nama) {
    let sh = ss.getSheetByName(nama);
    if (!sh) sh = ss.insertSheet(nama);
    const lajur = SKEMA[nama];
    const tajuk = sh.getRange(1, 1, 1, lajur.length);
    tajuk.setValues([lajur]).setFontWeight('bold');
    // Semua data teks biasa supaya tiada nilai ditafsir sebagai formula.
    sh.getRange(1, 1, sh.getMaxRows(), lajur.length).setNumberFormat('@');
    sh.setFrozenRows(1);
  });
  const lalai = ss.getSheetByName('Sheet1') || ss.getSheetByName('Helaian1');
  if (lalai && ss.getSheets().length > 1 && lalai.getLastRow() === 0) ss.deleteSheet(lalai);

  _semaiTetapan();
  _semaiData();
  _ciptaFolderDokumen();
  _kunciLembaran(ss);
  _pasangPencetus();
  Logger.log('Setup selesai. Seterusnya: Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).');
}

function _semaiTetapan() {
  _memori = {};
  const sedia = baca('Tetapan').map(function (t) { return t.Kunci; });
  Object.keys(TETAPAN_LALAI).forEach(function (k) {
    if (sedia.indexOf(k) < 0) tambah('Tetapan', { Kunci: k, Nilai: TETAPAN_LALAI[k] });
  });
}

function _semaiData() {
  _memori = {};
  if (baca('Kenderaan').length === 0) {
    tambah('Kenderaan', { Jenis: 'van', Nama: 'Van', NoPlat: 'GANTI-VAN', Kapasiti: 12, Aktif: true });
    tambah('Kenderaan', { Jenis: 'hilux', Nama: 'Hilux', NoPlat: 'GANTI-HILUX', Kapasiti: 5, Aktif: true });
    tambah('Kenderaan', { Jenis: 'bas', Nama: 'Bas', NoPlat: 'GANTI-BAS', Kapasiti: 40, Aktif: true });
  }
  if (baca('Pemandu').length === 0) {
    ['Farid', 'Azerul', 'Luqman'].forEach(function (n) { tambah('Pemandu', { Nama: n, Telefon: '', Aktif: true }); });
  }
}

function _ciptaFolderDokumen() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('DRIVE_FOLDER_ID')) return;
  const folder = DriveApp.createFolder('Tempahan Kenderaan - Dokumen (JANGAN KONGSI)');
  props.setProperty('DRIVE_FOLDER_ID', folder.getId());
}

// Lindungi lembaran supaya hanya pemilik skrip boleh menyunting. Pemilik skrip ialah
// akaun yang menjalankan Web App, jadi akaun ini yang perlu dijaga dengan 2FA.
function _kunciLembaran(ss) {
  const sayaEmel = Session.getEffectiveUser().getEmail();
  ss.getSheets().forEach(function (sh) {
    const perlindungan = sh.protect().setDescription('Dikawal oleh sistem. Jangan sunting manual.');
    perlindungan.addEditor(sayaEmel);
    const lain = perlindungan.getEditors().filter(function (e) { return e.getEmail() !== sayaEmel; });
    if (lain.length) perlindungan.removeEditors(lain);
    if (perlindungan.canDomainEdit()) perlindungan.setDomainEdit(false);
  });
}

function _pasangPencetus() {
  const sedia = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  if (sedia.indexOf('tutupPermohonanLuput') < 0) {
    ScriptApp.newTrigger('tutupPermohonanLuput').timeBased().everyHours(1).create();
  }
  if (sedia.indexOf('bersihkanRekodLama') < 0) {
    ScriptApp.newTrigger('bersihkanRekodLama').timeBased().onMonthDay(1).atHour(3).create();
  }
}

  return { doPost, doGet, setup, tutupPermohonanLuput, bersihkanRekodLama };
}
