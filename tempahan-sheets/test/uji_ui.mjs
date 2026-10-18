// Ujian hujung-ke-hujung: UI sebenar (docs/) + kod backend Apps Script sebenar melalui tiruan API Google.
// Guna: node test/uji_ui.mjs   (perlukan playwright dan Chromium)
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { bina } from './gas-mock.mjs';
const require = createRequire('/node-tools/node_modules/');
const { chromium } = require('playwright');

const docs = new URL('../../docs/', import.meta.url).pathname;
const URL_API = 'https://script.google.com/macros/s/UJI/exec';
const jenis = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  if (p === '/config.js') {
    res.writeHead(200, { 'content-type': 'text/javascript' });
    return res.end(`export const API_URL = '${URL_API}';`);
  }
  const f = join(docs, p);
  if (!existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': jenis[extname(f)] || 'text/plain' });
  res.end(readFileSync(f));
}).listen(0);
const asas = `http://localhost:${server.address().port}/`;

// ---- backend sebenar (tiruan Google)
const g = bina();
g.sifat.set('ADMIN_EMAIL', 'admin@org.my');
g.jalan('setup()');
const KATA = 'KataLaluan123';
const daftar = (emel, nama) => {
  const awal = g.outbox.length;
  g.panggil('daftar', { emel, nama, kata_laluan: KATA, persetujuan: true });
  g.panggil('sahkan_emel', { emel, kod: /<b[^>]*>(\d{6})<\/b>/.exec(g.outbox[awal].htmlBody)[1] });
};
daftar('admin@org.my', 'Dina Admin');
['ali@org.my:Ali', 'bakar@org.my:Bakar', 'chong@org.my:Chong'].forEach((x) => daftar(...x.split(':')));
const tokenAdmin = g.panggil('log_masuk', { emel: 'admin@org.my', kata_laluan: KATA }).data.token;
const peranan = (emel, p) => g.panggil('admin_tetapkan_peranan', { id: g.panggil('admin_pengguna', {}, tokenAdmin).data.find((u) => u.emel === emel).id, peranan: p, aktif: true }, tokenAdmin);
peranan('bakar@org.my', 'penyemak');
peranan('chong@org.my', 'pelulus');

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const ralatKonsol = [];
let gagal = 0;
const lapor = (ok, nama, butiran = '') => { if (!ok) gagal++; console.log(`${ok ? 'OK   ' : 'GAGAL'} ${nama}${butiran ? ' -- ' + butiran : ''}`); };

async function halaman() {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => ralatKonsol.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') ralatKonsol.push('console: ' + m.text()); });
  await page.route(URL_API, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    const jawapan = g.mentah(req.postData());
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(jawapan) });
  });
  return page;
}
async function logMasuk(page, emel) {
  await page.goto(asas);
  await page.fill('input[type=email]', emel);
  await page.fill('input[type=password]', KATA);
  await page.click('button[type=submit]');
  await page.waitForSelector('#bar .jenama');
}
const teks = async (page) => (await page.locator('#app').innerText()).replace(/\s+/g, ' ');
const tunggu = (page, t) => page.waitForFunction((x) => document.getElementById('app').innerText.includes(x), t, { timeout: 8000 });

// ---- 1. daftar melalui UI: kod emel, sahkan, log masuk
{
  const p = await halaman();
  await p.goto(asas);
  await p.click('text=Daftar akaun baharu');
  await p.fill('input[type=text] >> nth=0', 'Emi Baharu');
  await p.fill('input[type=email]', 'emi@org.my');
  await p.fill('input[type=password]', KATA);
  const awal = g.outbox.length;
  lapor(await p.locator('.notis').count() === 1, 'notis privasi dipaparkan semasa daftar');
  await p.click('button[type=submit]');   // tanpa tanda setuju: ditahan oleh HTML5 required
  lapor(g.outbox.length === awal, 'tidak boleh daftar tanpa tanda setuju');
  await p.check('input[type=checkbox]');
  await p.click('button[type=submit]');
  await p.waitForSelector('text=Sahkan emel');
  const kod = /<b[^>]*>(\d{6})<\/b>/.exec(g.outbox[awal].htmlBody)[1];
  await p.fill('input[inputmode=numeric]', kod);
  await p.click('button[type=submit]');
  await p.waitForSelector('text=Log masuk >> nth=0');
  await p.fill('input[type=email]', 'emi@org.my');
  await p.fill('input[type=password]', KATA);
  await p.click('button[type=submit]');
  await p.waitForSelector('#bar .jenama');
  lapor((await p.locator('#bar').innerText()).includes('Emi Baharu (Pemohon)'), 'daftar, sahkan emel dan log masuk melalui UI');
  lapor(!(await p.locator('#bar').innerText()).includes('Pentadbiran'), 'pemohon tidak nampak menu admin');
  // log masuk salah
  await p.click('text=Log keluar');
  await p.waitForSelector('input[type=email]');
  await p.fill('input[type=email]', 'emi@org.my');
  await p.fill('input[type=password]', 'salah-salah');
  await p.click('button[type=submit]');
  await p.waitForFunction(() => document.getElementById('toast').classList.contains('papar') && document.getElementById('toast').textContent.includes('tidak betul'));
  lapor(true, 'log masuk salah: mesej ralat dipaparkan');
  await p.context().close();
}

// ---- 2. aliran penuh: pemohon -> penyemak -> pelulus -> pemohon
const mula = new Date(Date.now() + 10 * 86400000); mula.setMinutes(0, 0, 0);
const tamat = new Date(mula.getTime() + 6 * 3600000);
const input = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
let noRujukan;
{
  const p = await halaman();
  await logMasuk(p, 'ali@org.my');
  await p.click('text=Permohonan baharu >> nth=0');
  await p.waitForSelector('text=Tujuan perjalanan');
  const tujuan = '<b>Lawatan</b> kerja ke Ipoh';
  await p.fill('form input[maxlength="300"]', tujuan);
  await p.fill('form input[maxlength="200"]', 'Ipoh');
  await p.fill('input[type=datetime-local] >> nth=0', input(mula));
  await p.fill('input[type=datetime-local] >> nth=1', input(tamat));
  await p.fill('input[type=number]', '8');
  await p.selectOption('select', 'van');
  await tunggu(p, 'Kenderaan kosong pada masa ini');
  lapor(true, 'semakan kenderaan kosong dipaparkan di borang');
  await p.click('text=Simpan dan hantar');
  await p.waitForSelector('text=VB-');
  noRujukan = (await teks(p)).match(/VB-\d{4}-\d{4}/)[0];
  lapor(/VB-\d{4}-0001/.test(noRujukan), 'permohonan dihantar dan dapat no rujukan', noRujukan);
  lapor((await p.locator('#app b', { hasText: 'Lawatan' }).count()) === 0, 'HTML dalam tujuan tidak dirender (XSS)');
  lapor((await teks(p)).includes('<b>Lawatan</b> kerja ke Ipoh'), 'tujuan dipaparkan sebagai teks');
  await p.context().close();
}
{
  const p = await halaman();
  await logMasuk(p, 'bakar@org.my');
  await p.click('#bar >> text=Semakan');
  await p.waitForSelector(`text=${noRujukan}`);
  await p.click(`text=${noRujukan}`);
  await p.click('text=Ambil untuk semakan');
  await p.waitForSelector('text=Lengkap, hantar kepada pelulus');
  await p.selectOption('select >> nth=0', { label: (await p.locator('select >> nth=0 >> option').allInnerTexts()).find((t) => t.startsWith('Van')) });
  await p.click('text=Lengkap, hantar kepada pelulus');
  await tunggu(p, 'Menunggu kelulusan');
  lapor(true, 'penyemak ambil, tugaskan van dan hantar kepada pelulus');
  await p.context().close();
}
{
  const p = await halaman();
  await logMasuk(p, 'chong@org.my');
  await p.click('#bar >> text=Kelulusan');
  await p.click(`text=${noRujukan}`);
  await p.waitForSelector('text=Tolak (justifikasi wajib)');
  await p.click('text=Tolak (justifikasi wajib)');
  await p.waitForFunction(() => document.getElementById('toast').textContent.includes('Justifikasi'));
  lapor(true, 'tolak tanpa justifikasi dihalang dan mesej dipaparkan');
  await p.click('button.utama >> text=Lulus');
  await tunggu(p, 'Diluluskan');
  lapor(true, 'pelulus luluskan permohonan');
  await p.context().close();
}
{
  const p = await halaman();
  await logMasuk(p, 'ali@org.my');
  await p.waitForSelector(`text=${noRujukan}`);
  lapor((await teks(p)).includes('Diluluskan'), 'pemohon nampak status Diluluskan');
  await p.click(`text=${noRujukan}`);
  await tunggu(p, 'Sejarah');
  const t = await teks(p);
  lapor(t.includes('Van (') && t.includes('Pegawai') && !t.includes('Chong') && !t.includes('Bakar'), 'pemohon nampak kenderaan; nama pegawai disembunyikan');
  await p.click('#bar >> text=Kalendar');
  await tunggu(p, 'Kalendar tempahan');
  lapor(!(await teks(p)).includes('Ipoh'), 'kalendar pemohon tidak dedahkan destinasi');
  await p.click('#bar >> text=Log keluar');
  await p.waitForSelector('input[type=email]');
  // token dibatalkan di server: sesi lama tidak boleh dihidupkan semula
  await p.context().close();
}
// ---- 3. admin & kawalan sesi
{
  const p = await halaman();
  await logMasuk(p, 'admin@org.my');
  await p.click('#bar >> text=Pentadbiran');
  await tunggu(p, 'ali@org.my');
  for (const tab of ['Kenderaan', 'Pemandu', 'Tetapan', 'Semua permohonan', 'Log audit']) {
    await p.click(`.tab >> text=${tab}`);
    await p.waitForTimeout(250);
    const t = await teks(p);
    lapor(t.length > 30 && !/undefined|TypeError/.test(t), `tab admin ${tab} dirender`);
  }
  await p.click('.tab >> text=Log audit');
  await tunggu(p, 'lulus');
  lapor(true, 'log audit memaparkan tindakan lulus');
  // sesi dibatalkan di server -> UI kembali ke log masuk
  g.cache.forEach((_, k) => { if (k.startsWith('sesi_')) g.cache.delete(k); });
  await p.click('.tab >> text=Pengguna');
  await p.waitForSelector('input[type=email]', { timeout: 8000 });
  lapor(true, 'sesi tamat di server: UI kembali ke halaman log masuk');
  await p.context().close();
}
// pemohon cuba buka halaman admin melalui URL
{
  const p = await halaman();
  await logMasuk(p, 'ali@org.my');
  await p.goto(asas + '#/admin/audit');
  await p.reload();
  await p.waitForFunction(() => document.getElementById('app').innerText.includes('tiada kebenaran'), null, { timeout: 8000 });
  lapor(true, 'pemohon buka #/admin: server menolak (bukan sekadar UI disembunyikan)');
  await p.context().close();
}

if (ralatKonsol.length) { console.log('Ralat konsol:\n' + [...new Set(ralatKonsol)].join('\n')); gagal++; }
await browser.close();
server.close();
console.log(gagal ? `${gagal} GAGAL` : 'Semua lulus');
process.exit(gagal ? 1 : 0);
