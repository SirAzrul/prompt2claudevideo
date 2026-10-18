// Ujian asap UI: muat app dengan klien Supabase palsu dan semak setiap halaman dirender tanpa ralat.
// Guna: node test/uji_ui.mjs   (perlukan playwright dan Chromium)
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';
const require = createRequire('/node-tools/node_modules/');
const { chromium } = require('playwright');

const web = new URL('../web/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  if (p === '/config.js') {
    res.writeHead(200, { 'content-type': 'text/javascript' });
    return res.end("export const SUPABASE_URL='http://x'; export const SUPABASE_ANON_KEY='k';");
  }
  const f = join(web, p);
  if (!existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[extname(f)] || 'text/plain' });
  res.end(readFileSync(f));
}).listen(0);
const port = server.address().port;

const peranan = process.argv[2] || 'pemohon';
const statusReq = process.argv[3] || 'dihantar';
const idSaya = peranan === 'pemohon' ? 'u1' : 'u2';
const req1 = {
  id: 'r1', no_rujukan: 'VB-2026-0001', pemohon_id: 'u1', penyemak_id: statusReq === 'dihantar' ? null : statusReq === 'dalam_semakan' ? 'u2' : 'u3', status: statusReq,
  tujuan: 'Lawatan kerja ke Ipoh <b>x</b>', destinasi: 'Ipoh', bil_penumpang: 8,
  tarikh_mula: '2026-11-01T01:00:00Z', tarikh_tamat: '2026-11-01T09:00:00Z', jenis_diminta: 'van',
  perlu_pemandu: false, pemohon: { nama: 'Ali', jabatan: 'IT', no_telefon: '012' },
  vehicle: null, driver: null, decisions: [{ keputusan: 'hantar', masa: '2026-10-18T01:00:00Z', oleh_profil: { nama: 'Ali' }, justifikasi: null }],
  created_at: '2026-10-18T01:00:00Z', updated_at: '2026-10-18T01:00:00Z',
};
const fakeModule = `
const rows = ${JSON.stringify({ requests: [req1], profiles: [{ id: 'u1', nama: 'Ali', emel: 'a@b.my', peranan: 'pemohon', aktif: true }], vehicles: [{ id: 'v1', jenis: 'van', nama: 'Van', no_plat: 'VAN1', kapasiti: 12, aktif: true }], drivers: [{ id: 'd1', nama: 'Farid', aktif: true }], documents: [], tetapan: [{ kunci: 'had_batal_jam', nilai: '24' }], audit_log: [{ id: 1, masa: '2026-10-18T01:00:00Z', pengguna_id: 'u1', jadual: 'requests', rekod_id: 'r1', tindakan: 'hantar', sebelum: { status: 'draf' }, selepas: { status: 'dihantar' } }] })};
const me = { id: '${idSaya}', nama: 'Ali', emel: 'a@b.my', peranan: '${peranan}', aktif: true };
const builder = (t) => {
  let single = false;
  const b = { select: () => b, eq: () => b, neq: () => b, in: () => b, order: () => b, limit: () => b,
    single: () => { single = true; return b; }, insert: () => b, update: () => b, delete: () => b,
    then: (ok) => {
      let data = rows[t] || [];
      if (t === 'profiles' && single) data = me;
      else if (single) data = data[0];
      return Promise.resolve({ data, error: null }).then(ok);
    } };
  return b;
};
export const createClient = () => ({
  auth: { onAuthStateChange: (cb) => { setTimeout(() => cb('INITIAL_SESSION', { user: { id: '${idSaya}' } }), 0); return {}; },
    signOut: async () => ({}), signInWithPassword: async () => ({ error: null }), signUp: async () => ({ data: {}, error: null }) },
  from: builder,
  rpc: async (n) => ({ data: n === 'cari_kenderaan_kosong' ? rows.vehicles.map(v => ({ ...v })) : n === 'cari_pemandu_kosong' ? rows.drivers : [], error: null }),
  storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'x' }, error: null }) }) },
});`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const page = await browser.newPage();
const ralat = [];
page.on('pageerror', (e) => ralat.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') ralat.push('console: ' + m.text()); });
await page.route('https://cdn.jsdelivr.net/**', (r) => r.fulfill({ contentType: 'text/javascript', body: fakeModule }));

const laluan = ['', 'baharu', 'edit/r1', 'permohonan/r1', 'kalendar', 'semakan', 'kelulusan', 'profil',
  'admin/pengguna', 'admin/kenderaan', 'admin/pemandu', 'admin/tetapan', 'admin/permohonan', 'admin/audit'];
let gagal = 0;
for (const l of laluan) {
  await page.goto(`http://localhost:${port}/#/${l}`);
  await page.reload();
  await page.waitForTimeout(300);
  const teks = (await page.locator('#app').innerText()).trim();
  const bar = (await page.locator('#bar').innerText()).trim();
  const rosak = !teks || /^Memuatkan/.test(teks) || /Cannot|undefined|TypeError/.test(teks);
  if (rosak) gagal++;
  console.log(`${rosak ? 'GAGAL' : 'OK   '} [${peranan}] #/${l}  -> ${teks.split('\n')[0].slice(0, 60)}`);
}
// Tindakan khusus peranan pada halaman butiran
await page.goto(`http://localhost:${port}/#/permohonan/r1`);
await page.reload();
await page.waitForTimeout(300);
const tindakan = (await page.locator('#app button, #app a.btn').allInnerTexts()).join(' | ');
console.log(`Tindakan [${peranan}/${statusReq}]: ${tindakan}`);
// XSS: tujuan mengandungi <b>, mesti dipaparkan sebagai teks
await page.goto(`http://localhost:${port}/#/permohonan/r1`);
await page.reload();
await page.waitForTimeout(300);
const adaB = await page.locator('#app b', { hasText: 'x' }).count();
console.log(adaB === 0 ? 'OK    XSS: HTML dalam data tidak dirender' : 'GAGAL XSS: HTML dirender');
if (adaB) gagal++;
console.log('Menu:', (await page.locator('#bar').innerText()).replace(/\n/g, ' | '));
if (ralat.length) { console.log('Ralat konsol:\n' + ralat.join('\n')); gagal++; }
await browser.close();
server.close();
process.exit(gagal ? 1 : 0);
