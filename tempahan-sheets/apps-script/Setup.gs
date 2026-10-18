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
