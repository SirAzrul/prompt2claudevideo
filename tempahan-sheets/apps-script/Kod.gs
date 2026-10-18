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
