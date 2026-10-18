// Klien untuk Web App Apps Script. Content-Type text/plain mengelakkan preflight CORS
// (Apps Script tidak menyokong permintaan OPTIONS).
import { API_URL } from '../config.js';

// Tanpa URL Web App yang sah, aplikasi berjalan dalam MOD DEMO (backend dalam pelayar).
export const MOD_DEMO = !API_URL || API_URL.startsWith('GANTI') || API_URL === 'DEMO';

const KUNCI = 'vb_token';
let token = null;
let apabilaSesiTamat = () => {};

try { token = sessionStorage.getItem(KUNCI); } catch { /* storan disekat: sesi tidak dikekalkan */ }

export const adaToken = () => !!token;
export const tetapkanToken = (t) => {
  token = t;
  try { if (t) sessionStorage.setItem(KUNCI, t); else sessionStorage.removeItem(KUNCI); } catch { /* abaikan */ }
};
export const apabilaTamat = (fn) => { apabilaSesiTamat = fn; };

async function panggilRangkaian(tindakan, data) {
  const kawal = new AbortController();
  const masa = setTimeout(() => kawal.abort(), 60000);
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ tindakan, token, ...data }),
      signal: kawal.signal,
    });
  } catch (e) {
    throw new Error(e.name === 'AbortError'
      ? 'Pelayan lambat bertindak. Cuba lagi.'
      : 'Tidak dapat menyambung ke pelayan. Semak sambungan internet dan URL Web App.');
  } finally {
    clearTimeout(masa);
  }
  try { return await res.json(); } catch { throw new Error('Jawapan pelayan tidak sah. Semak penerbitan Web App (Who has access: Anyone).'); }
}

export async function api(tindakan, data = {}) {
  const j = MOD_DEMO
    ? await (await import('./demo.js')).panggil({ tindakan, token, ...data })
    : await panggilRangkaian(tindakan, data);
  if (!j.ok) {
    if (j.kod === 'AUTH') {
      tetapkanToken(null);
      apabilaSesiTamat();
    }
    throw new Error(j.error);
  }
  return j.data;
}
