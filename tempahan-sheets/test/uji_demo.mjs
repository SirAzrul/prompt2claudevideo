// Ujian mod demo: docs/ dihidangkan dengan config.js lalai (placeholder) => backend berjalan dalam pelayar.
// Guna: node test/uji_demo.mjs   (perlukan playwright dan Chromium)
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';
const require = createRequire('/node-tools/node_modules/');
const { chromium } = require('playwright');

const docs = new URL('../../docs/', import.meta.url).pathname;
const jenis = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  const f = join(docs, p);   // config.js sebenar (placeholder) => mod demo
  if (!existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': jenis[extname(f)] || 'text/plain' });
  res.end(readFileSync(f));
}).listen(0);
const asas = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const ctx = await browser.newContext();
const page = await ctx.newPage();
const ralat = [];
page.on('pageerror', (e) => ralat.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') ralat.push('console: ' + m.text()); });
let gagal = 0;
const lapor = (ok, nama, butiran = '') => { if (!ok) gagal++; console.log(`${ok ? 'OK   ' : 'GAGAL'} ${nama}${butiran ? ' -- ' + butiran : ''}`); };
const tunggu = (t) => page.waitForFunction((x) => document.getElementById('app').innerText.includes(x), t, { timeout: 15000 });
const teks = async () => (await page.locator('#app').innerText()).replace(/\s+/g, ' ');

await page.goto(asas);
await page.waitForSelector('text=Mod demo: log masuk pantas', { timeout: 15000 });
lapor((await page.locator('.banner-demo').innerText()).includes('MOD DEMO'), 'banner mod demo dipaparkan');

// pemohon: nampak data contoh
await page.click('button:has-text("Pemohon (Ali)")');
await page.waitForSelector('#bar .jenama');
await tunggu('Lawatan kerja ke cawangan Ipoh');
let t = await teks();
lapor(['Diluluskan', 'Ditolak', 'Dihantar', 'Draf'].every((s) => t.includes(s)), 'senarai pemohon ada pelbagai status contoh');
lapor(!t.includes('Mesyuarat di pejabat negeri'), 'pemohon tidak nampak permohonan orang lain');
await page.click('text=VB-2026-0001');
await tunggu('Sejarah');
t = await teks();
lapor(t.includes('Van (') && t.includes('Pegawai') && !t.includes('Bakar') && !t.includes('Chong'), 'butiran: kenderaan dipaparkan, nama pegawai disembunyikan daripada pemohon');
await page.click('#bar >> text=Kalendar');
await tunggu('Kalendar tempahan');
lapor(!(await teks()).includes('Ipoh'), 'kalendar pemohon tidak dedahkan destinasi');

// penyemak: ambil tugasan bas (dihantar), tugaskan bas + pemandu
await page.click('#bar >> text=Log keluar');
await page.waitForSelector('text=Mod demo: log masuk pantas');
await page.click('button:has-text("Penyemak (Bakar)")');
await page.click('#bar >> text=Semakan');
await tunggu('Program komuniti anjuran jabatan');
await page.click('text=VB-2026-0003');
await page.click('text=Ambil untuk semakan');
await page.waitForSelector('text=Lengkap, hantar kepada pelulus');
await page.selectOption('select >> nth=0', { label: (await page.locator('select >> nth=0 >> option').allInnerTexts()).find((x) => x.startsWith('Bas')) });
await page.click('text=Lengkap, hantar kepada pelulus');
await page.waitForFunction(() => document.getElementById('toast').textContent.includes('Pemandu mesti'));
lapor(true, 'bas tanpa pemandu ditolak oleh backend');
await page.selectOption('select >> nth=1', { index: 1 });
await page.click('text=Lengkap, hantar kepada pelulus');
await tunggu('Menunggu kelulusan');
lapor(true, 'penyemak tugaskan bas dan pemandu, hantar kepada pelulus');

// pelulus: lulus
await page.click('#bar >> text=Log keluar');
await page.waitForSelector('text=Mod demo: log masuk pantas');
await page.click('button:has-text("Pelulus (Chong)")');
await page.click('#bar >> text=Kelulusan');
await tunggu('Program komuniti anjuran jabatan');
await page.click('text=VB-2026-0003');
await page.click('button.utama >> text=Lulus');
await tunggu('Diluluskan');
lapor(true, 'pelulus luluskan');

// peti mel demo ada emel keputusan dan tiada HTML mentah
await page.click('.banner-demo >> text=Peti mel demo');
await page.waitForSelector('#peti-mel .surat');
const peti = await page.locator('#peti-mel').innerText();
lapor(peti.includes('Permohonan diluluskan') && peti.includes('pemohon@demo.my') && !peti.includes('<p>'), 'peti mel demo memaparkan emel keputusan sebagai teks');
await page.click('#peti-mel >> text=Tutup');

// admin: tab dirender
await page.click('#bar >> text=Log keluar');
await page.waitForSelector('text=Mod demo: log masuk pantas');
await page.click('button:has-text("Admin (Dina)")');
await page.click('#bar >> text=Pentadbiran');
await tunggu('pemohon@demo.my');
await page.click('.tab >> text=Log audit');
await tunggu('lulus');
lapor(true, 'admin nampak log audit');

// data dikekalkan selepas refresh
await page.reload();
await page.waitForSelector('#bar .jenama', { timeout: 15000 }).catch(() => {});
await page.click('#bar >> text=Log keluar').catch(() => {});
await page.waitForSelector('text=Mod demo: log masuk pantas');
await page.click('button:has-text("Pemohon (Ali)")');
await tunggu('Program komuniti anjuran jabatan');
lapor((await teks()).includes('Diluluskan'), 'data demo dikekalkan selepas refresh');

// daftar akaun baharu melalui peti mel demo
await page.click('#bar >> text=Log keluar');
await page.waitForSelector('text=Daftar akaun baharu');
await page.click('text=Daftar akaun baharu');
await page.fill('input[type=text] >> nth=0', 'Zul Baharu');
await page.fill('input[type=email]', 'zul@demo.my');
await page.fill('input[type=password]', 'KataLaluan123');
await page.check('input[type=checkbox]');
await page.click('button[type=submit]');
await page.waitForSelector('text=Sahkan emel');
await page.click('.banner-demo >> text=Peti mel demo');
await page.waitForSelector('#peti-mel .surat');
const kod = /\b(\d{6})\b/.exec(await page.locator('#peti-mel .surat').first().innerText())[1];
await page.click('#peti-mel >> text=Tutup');
await page.fill('input[inputmode=numeric]', kod);
await page.click('button[type=submit]');
await page.waitForSelector('text=Log masuk >> nth=0');
await page.fill('input[type=email]', 'zul@demo.my');
await page.fill('input[type=password]', 'KataLaluan123');
await page.click('button[type=submit]');
await page.waitForSelector('#bar .jenama');
lapor((await page.locator('#bar').innerText()).includes('Zul Baharu (Pemohon)'), 'daftar akaun baharu dengan kod dari peti mel demo');

// set semula
page.once('dialog', (d) => d.accept());
await page.click('.banner-demo >> text=Set semula demo');
await page.waitForSelector('text=Mod demo: log masuk pantas', { timeout: 15000 });
await page.click('button:has-text("Pemohon (Ali)")');
await tunggu('Lawatan kerja ke cawangan Ipoh');
lapor(true, 'set semula demo memulihkan data contoh');

if (ralat.length) { console.log('Ralat konsol:\n' + [...new Set(ralat)].join('\n')); gagal++; }
await browser.close();
server.close();
console.log(gagal ? `${gagal} GAGAL` : 'Semua lulus');
process.exit(gagal ? 1 : 0);
