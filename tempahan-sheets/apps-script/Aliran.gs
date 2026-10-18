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
