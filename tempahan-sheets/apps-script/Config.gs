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
