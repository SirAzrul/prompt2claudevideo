// Jana docs/demo/backend.js daripada tempahan-sheets/apps-script/*.gs supaya mod demo
// di GitHub Pages menjalankan kod backend yang SAMA dengan yang anda tampal ke Apps Script.
// Guna: node tempahan-sheets/scripts/bina-demo.mjs         (jana)
//       node tempahan-sheets/scripts/bina-demo.mjs --semak (gagal jika fail dijana sudah lapuk)
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const gs = new URL('../apps-script/', import.meta.url).pathname;
const keluar = new URL('../../docs/demo/backend.js', import.meta.url).pathname;

const kod = readdirSync(gs).filter((f) => f.endsWith('.gs')).sort()
  .map((f) => `// ---- ${f}\n${readFileSync(join(gs, f), 'utf8')}`).join('\n');

const hasil = `// DIJANA oleh tempahan-sheets/scripts/bina-demo.mjs daripada apps-script/*.gs. JANGAN SUNTING.
// Mod demo sahaja: menjalankan kod backend Apps Script dalam pelayar dengan tiruan API Google.
export function ciptaBackend(G) {
  const { Utilities, SpreadsheetApp, PropertiesService, CacheService, LockService, ContentService, MailApp, DriveApp, ScriptApp, Session, Logger } = G;
${kod}
  return { doPost, doGet, setup, tutupPermohonanLuput, bersihkanRekodLama };
}
`;

if (process.argv.includes('--semak')) {
  const sedia = existsSync(keluar) ? readFileSync(keluar, 'utf8') : '';
  if (sedia !== hasil) {
    console.error('docs/demo/backend.js sudah lapuk. Jalankan: node tempahan-sheets/scripts/bina-demo.mjs');
    process.exit(1);
  }
  console.log('docs/demo/backend.js terkini.');
} else {
  writeFileSync(keluar, hasil);
  console.log('Dijana: docs/demo/backend.js (' + hasil.length + ' aksara)');
}
