import { api, adaToken, tetapkanToken, apabilaTamat } from './api.js';

const $app = document.getElementById('app');
const $bar = document.getElementById('bar');
const $toast = document.getElementById('toast');

// ------------------------------------------------------------------ util
// Semua kandungan dimasukkan sebagai teks (textContent) supaya data pengguna tidak dirender sebagai HTML.
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  let nilai;
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'value') nilai = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'checked' || k === 'disabled') el[k] = true;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
  }
  if (nilai !== undefined) el.value = nilai;
  return el;
};

const STATUS = {
  draf: 'Draf', dihantar: 'Dihantar', dalam_semakan: 'Dalam semakan', dipulangkan: 'Dipulangkan',
  menunggu_kelulusan: 'Menunggu kelulusan', diluluskan: 'Diluluskan', ditolak: 'Ditolak',
  dibatalkan: 'Dibatalkan', tamat_tempoh: 'Tamat tempoh', selesai: 'Selesai',
};
const KEPUTUSAN = {
  hantar: 'Dihantar', pulang: 'Dipulangkan untuk pembetulan', semak_lengkap: 'Semakan lengkap, dihantar kepada pelulus',
  lulus: 'Diluluskan', tolak: 'Ditolak', hantar_balik: 'Dihantar balik kepada penyemak',
  batal: 'Dibatalkan', tamat_tempoh: 'Tamat tempoh',
};
const PERANAN = { pemohon: 'Pemohon', penyemak: 'Penyemak', pelulus: 'Pelulus', admin: 'Admin' };
const JENIS = { van: 'Van', hilux: 'Hilux', bas: 'Bas' };
const MUTLAK = ['ditolak', 'dibatalkan', 'tamat_tempoh', 'selesai'];

const fmt = (iso) => iso
  ? new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  : '-';
const fmtTarikh = (d) => d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
const keInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const keISO = (v) => (v ? new Date(v).toISOString() : null);

let masaToast;
const toast = (mesej, ralat = false) => {
  $toast.textContent = mesej;
  $toast.classList.add('papar');
  clearTimeout(masaToast);
  masaToast = setTimeout(() => $toast.classList.remove('papar'), ralat ? 6000 : 3000);
};

const lencana = (s) => h('span', { class: `lencana ${s}` }, STATUS[s] || s);
const mount = (...nodes) => $app.replaceChildren(...nodes.flat());

const jalankan = async (btn, fn, mesejOk) => {
  btn.disabled = true;
  try {
    await fn();
    if (mesejOk) toast(mesejOk);
  } catch (e) {
    toast(e.message || String(e), true);
  } finally {
    btn.disabled = false;
  }
};

let profil = null;

// ---------------------------------------------------------------- navigasi
const rute = () => {
  const [, a = '', b = ''] = location.hash.split('/');
  return { a, b };
};

function renderBar() {
  $bar.replaceChildren();
  if (!profil) return;
  const { a } = rute();
  const pautan = (href, teks, kunci) => h('a', { href, class: a === kunci ? 'aktif' : '' }, teks);
  $bar.append(...[
    h('span', { class: 'jenama' }, 'Tempahan Kenderaan'),
    pautan('#/', 'Permohonan saya', ''),
    pautan('#/baharu', 'Permohonan baharu', 'baharu'),
    pautan('#/kalendar', 'Kalendar', 'kalendar'),
    profil.peranan === 'penyemak' ? pautan('#/semakan', 'Semakan', 'semakan') : null,
    profil.peranan === 'pelulus' ? pautan('#/kelulusan', 'Kelulusan', 'kelulusan') : null,
    profil.peranan === 'admin' ? pautan('#/admin', 'Pentadbiran', 'admin') : null,
    h('span', { class: 'ruang' }),
    h('a', { href: '#/profil', class: a === 'profil' ? 'aktif' : '' }, `${profil.nama} (${PERANAN[profil.peranan]})`),
    h('button', { onclick: logKeluar }, 'Log keluar'),
  ].filter(Boolean));
}

async function logKeluar() {
  try { await api('log_keluar'); } catch { /* sesi mungkin sudah tamat */ }
  tetapkanToken(null);
  profil = null;
  render();
}

let sedangRender = 0;
async function render() {
  const nombor = ++sedangRender;
  renderBar();
  if (!profil) return halamanMasuk();
  mount(h('p', { class: 'muted' }, 'Memuatkan...'));
  const { a, b } = rute();
  try {
    const halaman = {
      '': () => senaraiSaya(),
      baharu: () => borang(null),
      edit: () => borang(b),
      permohonan: () => butiran(b),
      kalendar: () => kalendar(),
      semakan: () => senaraiTugasan('semakan'),
      kelulusan: () => senaraiTugasan('kelulusan'),
      admin: () => admin(),
      profil: () => halamanProfil(),
    }[a];
    if (!halaman) return mount(h('p', {}, 'Halaman tidak ditemui.'));
    const nodes = await halaman();
    if (nombor === sedangRender && nodes) mount(nodes);
  } catch (e) {
    if (nombor === sedangRender) mount(h('p', { class: 'ralat' }, e.message || String(e)));
  }
}
window.addEventListener('hashchange', render);
apabilaTamat(() => {
  profil = null;
  toast('Sesi tamat. Sila log masuk semula.', true);
  render();
});

// ------------------------------------------------------------- log masuk
const NOTIS_PRIVASI = 'Notis privasi (PDPA): sistem ini mengumpul nama, emel, jabatan, no. telefon, butiran perjalanan '
  + 'dan dokumen sokongan anda untuk mengurus tempahan kenderaan pusat. Data hanya boleh dilihat oleh pegawai penyemak, '
  + 'pelulus dan admin yang berkaitan. Rekod permohonan yang telah ditutup dipadam selepas 3 tahun (tempoh boleh diubah '
  + 'admin). Data disimpan dalam Google Sheets dan Google Drive, yang pelayannya mungkin berada di luar Malaysia. '
  + 'Hubungi admin untuk mengakses atau membetulkan data anda.';

function halamanMasuk() {
  let mod = 'masuk';   // masuk | daftar | kod | lupa | tetap
  let emelSimpan = '';
  const tukar = (m) => { mod = m; papar(); };
  const pautan = (teks, m) => h('a', { class: 'pautan', onclick: () => tukar(m) }, teks);

  const papar = () => {
    const emel = h('input', { type: 'email', required: true, autocomplete: 'email', value: emelSimpan });
    const kata = h('input', { type: 'password', required: true, minlength: 8, maxlength: 100, autocomplete: mod === 'masuk' ? 'current-password' : 'new-password' });
    const nama = h('input', { type: 'text', required: true, maxlength: 100 });
    const jabatan = h('input', { type: 'text', maxlength: 100 });
    const tel = h('input', { type: 'tel', maxlength: 20 });
    const kod = h('input', { type: 'text', inputmode: 'numeric', pattern: '[0-9]{6}', maxlength: 6, required: true, autocomplete: 'one-time-code' });
    const setuju = h('input', { type: 'checkbox', required: true });
    const hantar = h('button', { class: 'utama', type: 'submit' }, 'Teruskan');

    const tindak = {
      masuk: async () => {
        const d = await api('log_masuk', { emel: emel.value, kata_laluan: kata.value });
        tetapkanToken(d.token);
        profil = d.profil;
        location.hash = '#/';
        render();
      },
      daftar: async () => {
        emelSimpan = emel.value.trim();
        const d = await api('daftar', {
          emel: emelSimpan, kata_laluan: kata.value, nama: nama.value, jabatan: jabatan.value, telefon: tel.value, persetujuan: setuju.checked,
        });
        toast(d.mesej);
        tukar('kod');
      },
      kod: async () => {
        emelSimpan = emel.value.trim();
        const d = await api('sahkan_emel', { emel: emelSimpan, kod: kod.value });
        toast(d.mesej);
        tukar('masuk');
      },
      lupa: async () => {
        emelSimpan = emel.value.trim();
        const d = await api('lupa_kata', { emel: emelSimpan });
        toast(d.mesej);
        tukar('tetap');
      },
      tetap: async () => {
        emelSimpan = emel.value.trim();
        const d = await api('tetap_semula', { emel: emelSimpan, kod: kod.value, kata_baru: kata.value });
        toast(d.mesej);
        tukar('masuk');
      },
    }[mod];

    const tajuk = { masuk: 'Log masuk', daftar: 'Daftar akaun', kod: 'Sahkan emel', lupa: 'Lupa kata laluan', tetap: 'Tetapkan kata laluan baharu' }[mod];
    hantar.textContent = { masuk: 'Log masuk', daftar: 'Daftar', kod: 'Sahkan', lupa: 'Hantar kod', tetap: 'Simpan kata laluan' }[mod];

    mount(h('div', { class: 'kad auth' }, h('h1', {}, tajuk),
      h('p', { class: 'muted' }, 'Tempahan kenderaan pusat. Untuk staf dalaman sahaja.'),
      h('form', {
        onsubmit: (e) => { e.preventDefault(); jalankan(hantar, tindak); },
      },
      mod === 'daftar' ? [h('label', {}, 'Nama penuh'), nama] : null,
      h('label', {}, 'Emel'), emel,
      mod === 'kod' || mod === 'tetap' ? [h('label', {}, 'Kod 6 digit dari emel'), kod] : null,
      mod !== 'kod' && mod !== 'lupa' ? [h('label', {}, mod === 'tetap' ? 'Kata laluan baharu (sekurang-kurangnya 8 aksara)' : 'Kata laluan'), kata] : null,
      mod === 'daftar' ? [
        h('label', {}, 'Jabatan / unit'), jabatan, h('label', {}, 'No. telefon'), tel,
        h('div', { class: 'notis' }, NOTIS_PRIVASI),
        h('label', {}, setuju, 'Saya telah membaca dan bersetuju dengan notis privasi di atas'),
      ] : null,
      h('div', { class: 'tindakan' }, hantar),
      h('div', { class: 'langkah' },
        mod === 'masuk' ? [pautan('Daftar akaun baharu', 'daftar'), pautan('Lupa kata laluan', 'lupa'), pautan('Saya ada kod pengesahan emel', 'kod')] : pautan('Kembali ke log masuk', 'masuk')))));
  };
  papar();
}

function halamanProfil() {
  const nama = h('input', { value: profil.nama, maxlength: 100 });
  const jabatan = h('input', { value: profil.jabatan || '', maxlength: 100 });
  const tel = h('input', { value: profil.telefon || '', maxlength: 20 });
  const simpan = h('button', { class: 'utama', type: 'submit' }, 'Simpan');
  const lama = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  const baru = h('input', { type: 'password', autocomplete: 'new-password', required: true, minlength: 8, maxlength: 100 });
  const tukarBtn = h('button', { type: 'submit' }, 'Tukar kata laluan');
  return [h('h1', {}, 'Profil saya'),
    h('form', {
      class: 'kad',
      onsubmit: (e) => {
        e.preventDefault();
        jalankan(simpan, async () => {
          profil = await api('kemas_kini_profil', { nama: nama.value, jabatan: jabatan.value, telefon: tel.value });
          renderBar();
        }, 'Profil dikemas kini');
      },
    },
    h('p', { class: 'muted' }, profil.emel),
    h('label', {}, 'Nama'), nama, h('label', {}, 'Jabatan / unit'), jabatan, h('label', {}, 'No. telefon'), tel,
    h('div', { class: 'tindakan' }, simpan)),
    h('form', {
      class: 'kad',
      onsubmit: (e) => {
        e.preventDefault();
        jalankan(tukarBtn, async () => {
          await api('tukar_kata', { kata_lama: lama.value, kata_baru: baru.value });
          lama.value = '';
          baru.value = '';
        }, 'Kata laluan ditukar');
      },
    }, h('h2', {}, 'Tukar kata laluan'), h('label', {}, 'Kata laluan semasa'), lama,
    h('label', {}, 'Kata laluan baharu'), baru, h('div', { class: 'tindakan' }, tukarBtn))];
}

// -------------------------------------------------------- senarai permohonan
function jadualPermohonan(baris, { tunjukPemohon = false } = {}) {
  if (!baris.length) return h('p', { class: 'muted' }, 'Tiada permohonan.');
  return h('div', { class: 'jadual-scroll' }, h('table', {},
    h('thead', {}, h('tr', {},
      h('th', {}, 'No. rujukan'), tunjukPemohon ? h('th', {}, 'Pemohon') : null,
      h('th', {}, 'Tujuan'), h('th', {}, 'Tarikh'), h('th', {}, 'Status'))),
    h('tbody', {}, baris.map((r) => h('tr', {},
      h('td', {}, h('a', { href: `#/permohonan/${encodeURIComponent(r.id)}` }, r.no_rujukan || '(draf)')),
      tunjukPemohon ? h('td', {}, r.pemohon?.nama || '-') : null,
      h('td', {}, r.tujuan),
      h('td', {}, `${fmt(r.tarikh_mula)} - ${fmt(r.tarikh_tamat)}`),
      h('td', {}, lencana(r.status)))))));
}

async function senaraiSaya() {
  const data = await api('senarai_saya');
  return [h('h1', {}, 'Permohonan saya'), jadualPermohonan(data),
    h('div', { class: 'tindakan' }, h('a', { class: 'btn utama', href: '#/baharu' }, 'Permohonan baharu'))];
}

async function senaraiTugasan(jenis) {
  const data = await api('senarai_tugasan');
  return [h('h1', {}, jenis === 'semakan' ? 'Tugasan semakan' : 'Menunggu kelulusan'),
    jadualPermohonan(data, { tunjukPemohon: true })];
}

// --------------------------------------------------------------- borang
async function borang(id) {
  let r = null;
  let dokumenSedia = [];
  if (id) {
    const detail = await api('butiran', { id });
    r = detail.permohonan;
    dokumenSedia = detail.dokumen;
    if (r.pemohon_id !== profil.id || !['draf', 'dipulangkan'].includes(r.status)) {
      return h('p', { class: 'ralat' }, 'Permohonan ini tidak boleh diubah.');
    }
  }
  const tujuan = h('input', { value: r?.tujuan || '', required: true, minlength: 5, maxlength: 300 });
  const destinasi = h('input', { value: r?.destinasi || '', required: true, maxlength: 200 });
  const bil = h('input', { type: 'number', min: 1, max: 100, value: r?.bil_penumpang || 1, required: true });
  const mula = h('input', { type: 'datetime-local', value: keInput(r?.tarikh_mula), required: true });
  const tamat = h('input', { type: 'datetime-local', value: keInput(r?.tarikh_tamat), required: true });
  const jenis = h('select', {}, h('option', { value: '' }, 'Mana-mana'),
    Object.entries(JENIS).map(([k, v]) => h('option', { value: k }, v)));
  jenis.value = r?.jenis_diminta || '';
  const pemandu = h('input', { type: 'checkbox', checked: r?.perlu_pemandu });
  const kosong = h('p', { class: 'muted' }, 'Pilih tarikh untuk semak kenderaan yang kosong.');

  const semakKosong = async () => {
    if (!mula.value || !tamat.value || new Date(tamat.value) <= new Date(mula.value)) return;
    try {
      const d = await api('cari_kosong', { mula: keISO(mula.value), tamat: keISO(tamat.value) });
      kosong.textContent = d.kenderaan.length
        ? `Kenderaan kosong pada masa ini: ${d.kenderaan.map((v) => `${v.nama} (${v.kapasiti} tempat)`).join(', ')}`
        : 'Tiada kenderaan kosong pada masa ini. Anda masih boleh hantar, tetapi mungkin tidak dapat dipenuhi.';
    } catch { /* maklumat tambahan sahaja */ }
  };
  mula.addEventListener('change', semakKosong);
  tamat.addEventListener('change', semakKosong);
  semakKosong();

  const simpanDraf = async () => (await api('simpan_permohonan', {
    id, tujuan: tujuan.value, destinasi: destinasi.value, bil_penumpang: Number(bil.value),
    tarikh_mula: keISO(mula.value), tarikh_tamat: keISO(tamat.value),
    jenis_diminta: jenis.value || null, perlu_pemandu: pemandu.checked,
  })).id;

  const btnDraf = h('button', { type: 'button' }, 'Simpan draf');
  const btnHantar = h('button', { class: 'utama', type: 'submit' }, 'Simpan dan hantar');
  btnDraf.addEventListener('click', () => {
    if (![tujuan, destinasi, mula, tamat].every((i) => i.reportValidity())) return;
    jalankan(btnDraf, async () => {
      const baru = await simpanDraf();
      location.hash = id ? `#/permohonan/${id}` : `#/edit/${baru}`;
    }, 'Draf disimpan');
  });
  const el = h('form', {
    class: 'kad',
    onsubmit: (e) => {
      e.preventDefault();
      jalankan(btnHantar, async () => {
        const rid = await simpanDraf();
        const d = await api('hantar_permohonan', { id: rid });
        toast(`Permohonan dihantar. No. rujukan: ${d.no_rujukan}`);
        location.hash = `#/permohonan/${rid}`;
      });
    },
  },
  r?.status === 'dipulangkan' ? h('p', { class: 'ralat' }, `Dipulangkan: ${r.catatan_semakan}. Hantar semula sebelum ${fmt(r.tarikh_akhir_pembetulan)}.`) : null,
  h('label', {}, 'Tujuan perjalanan'), tujuan,
  h('label', {}, 'Destinasi'), destinasi,
  h('div', { class: 'baris' },
    h('div', {}, h('label', {}, 'Tarikh dan masa mula'), mula),
    h('div', {}, h('label', {}, 'Tarikh dan masa tamat'), tamat)),
  kosong,
  h('div', { class: 'baris' },
    h('div', {}, h('label', {}, 'Bilangan penumpang'), bil),
    h('div', {}, h('label', {}, 'Jenis kenderaan diminta'), jenis)),
  h('label', {}, pemandu, 'Perlukan pemandu (bas sentiasa memerlukan pemandu)'),
  h('div', { class: 'tindakan' }, btnHantar, btnDraf));

  return [h('h1', {}, id ? 'Edit permohonan' : 'Permohonan baharu'), el,
    id ? bahagianDokumen(id, dokumenSedia, true)
      : h('p', { class: 'muted' }, 'Simpan draf dahulu untuk melampirkan dokumen.')];
}

// ------------------------------------------------------------- dokumen
const bacaBase64 = (fail) => new Promise((ok, gagal) => {
  const fr = new FileReader();
  fr.onload = () => ok(String(fr.result).split(',')[1] || '');
  fr.onerror = () => gagal(new Error('Fail tidak dapat dibaca'));
  fr.readAsDataURL(fail);
});

function bahagianDokumen(reqId, dokumen, boleh) {
  const kad = h('div', { class: 'kad' });
  const muat = async () => {
    const docs = (await api('butiran', { id: reqId })).dokumen;
    paparkan(docs);
  };
  const paparkan = (docs) => {
    const senarai = docs.map((d) => h('li', {},
      h('a', {
        class: 'pautan',
        onclick: async () => {
          try {
            const f = await api('muat_turun_dokumen', { id: d.id });
            const bait = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
            const url = URL.createObjectURL(new Blob([bait], { type: f.mime }));
            const a = h('a', { href: url, download: f.nama_fail });
            document.body.append(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
          } catch (e) { toast(e.message, true); }
        },
      }, d.nama_fail),
      boleh ? [' ', h('button', {
        class: 'bahaya',
        onclick: (e) => jalankan(e.target, async () => { await api('padam_dokumen', { id: d.id }); await muat(); }),
      }, 'Padam')] : null));
    const fail = h('input', { type: 'file', accept: 'application/pdf,image/jpeg,image/png' });
    const naik = h('button', { type: 'button' }, 'Muat naik');
    naik.addEventListener('click', () => jalankan(naik, async () => {
      const f = fail.files[0];
      if (!f) throw new Error('Pilih fail dahulu');
      if (f.size > 3 * 1024 * 1024) throw new Error('Saiz fail maksimum 3MB');
      await api('muat_naik_dokumen', { permohonan_id: reqId, nama_fail: f.name, mime: f.type, data: await bacaBase64(f) });
      await muat();
    }, 'Dokumen dimuat naik'));
    kad.replaceChildren(h('h2', {}, 'Dokumen sokongan'),
      senarai.length ? h('ul', {}, senarai) : h('p', { class: 'muted' }, 'Tiada dokumen.'),
      boleh ? h('div', {}, h('p', { class: 'muted' }, 'PDF, JPG atau PNG, maksimum 3MB.'), fail, h('div', { class: 'tindakan' }, naik)) : null);
  };
  paparkan(dokumen);
  return kad;
}

// ------------------------------------------------------------- butiran
async function butiran(id) {
  const { permohonan: r, keputusan, dokumen } = await api('butiran', { id });
  const adaPemohon = r.pemohon_id === profil.id;
  const rowData = [
    ['No. rujukan', r.no_rujukan || '(belum dihantar)'],
    ['Status', lencana(r.status)],
    ['Pemohon', r.pemohon ? `${r.pemohon.nama}${r.pemohon.jabatan ? `, ${r.pemohon.jabatan}` : ''}${r.pemohon.telefon ? ` (${r.pemohon.telefon})` : ''}` : '-'],
    ['Tujuan', r.tujuan],
    ['Destinasi', r.destinasi],
    ['Tarikh', `${fmt(r.tarikh_mula)} hingga ${fmt(r.tarikh_tamat)}`],
    ['Penumpang', r.bil_penumpang],
    ['Kenderaan diminta', r.jenis_diminta ? JENIS[r.jenis_diminta] : 'Mana-mana'],
    ['Pemandu', r.perlu_pemandu ? 'Diperlukan' : 'Tidak diperlukan'],
    ['Kenderaan ditugaskan', r.vehicle ? `${r.vehicle.nama} (${r.vehicle.no_plat})` : '-'],
    ['Pemandu ditugaskan', r.driver?.nama || '-'],
    r.status === 'ditolak' ? ['Sebab penolakan', r.sebab_tolak] : null,
    r.status === 'dipulangkan' ? ['Catatan penyemak', `${r.catatan_semakan}\nHantar semula sebelum ${fmt(r.tarikh_akhir_pembetulan)}`] : null,
  ].filter(Boolean);

  const garis = h('ul', { class: 'garis-masa' }, keputusan.map((d) => h('li', {},
    h('b', {}, KEPUTUSAN[d.keputusan] || d.keputusan), ` - ${fmt(d.masa)}`,
    h('div', { class: 'muted' }, d.oleh),
    d.justifikasi ? h('div', {}, d.justifikasi) : null)));

  const muatSemula = () => render();
  const tindakan = [];

  if (adaPemohon && ['draf', 'dipulangkan'].includes(r.status)) {
    const hantar = h('button', {
      class: 'utama',
      onclick: () => jalankan(hantar, async () => {
        const d = await api('hantar_permohonan', { id });
        toast(`Permohonan dihantar. No. rujukan: ${d.no_rujukan}`);
        muatSemula();
      }),
    }, 'Hantar');
    tindakan.push(h('a', { class: 'btn', href: `#/edit/${encodeURIComponent(id)}` }, 'Edit'), hantar);
  }

  if ((adaPemohon || profil.peranan === 'admin') && !MUTLAK.includes(r.status)) {
    const sebab = h('input', { placeholder: 'Sebab pembatalan (pilihan)', maxlength: 300 });
    const batal = h('button', {
      class: 'bahaya',
      onclick: () => {
        if (!confirm('Batalkan permohonan ini?')) return;
        jalankan(batal, async () => { await api('batal_permohonan', { id, sebab: sebab.value }); muatSemula(); }, 'Permohonan dibatalkan');
      },
    }, 'Batalkan permohonan');
    tindakan.push(h('div', { class: 'baris' }, sebab, h('div', {}, batal)));
  }

  if (profil.peranan === 'penyemak' && !adaPemohon) {
    if (r.status === 'dihantar' && (!r.penyemak_id || r.penyemak_id === profil.id)) {
      const ambil = h('button', {
        class: 'utama',
        onclick: () => jalankan(ambil, async () => { await api('ambil_semakan', { id }); muatSemula(); }, 'Permohonan diambil untuk semakan'),
      }, 'Ambil untuk semakan');
      tindakan.push(ambil);
    }
    if (r.status === 'dalam_semakan' && r.penyemak_id === profil.id) tindakan.push(await panelSemakan(r, muatSemula));
  }

  if (profil.peranan === 'pelulus' && !adaPemohon && r.status === 'menunggu_kelulusan' && r.penyemak_id !== profil.id) {
    tindakan.push(panelKelulusan(r, muatSemula));
  }

  return [
    h('h1', {}, `Permohonan ${r.no_rujukan || '(draf)'}`),
    h('div', { class: 'kad' }, h('dl', {}, rowData.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]))),
    tindakan.length ? h('div', { class: 'kad' }, h('h2', {}, 'Tindakan'), tindakan.map((n) => h('div', { class: 'tindakan' }, n))) : null,
    bahagianDokumen(id, dokumen, adaPemohon && ['draf', 'dipulangkan'].includes(r.status)),
    h('div', { class: 'kad' }, h('h2', {}, 'Sejarah'), keputusan.length ? garis : h('p', { class: 'muted' }, 'Belum ada tindakan.')),
  ];
}

async function panelSemakan(r, muatSemula) {
  const k = await api('cari_kosong', { mula: r.tarikh_mula, tamat: r.tarikh_tamat });
  const vSel = h('select', {}, h('option', { value: '' }, '- Pilih kenderaan -'),
    k.kenderaan.map((v) => h('option', { value: v.id },
      `${v.nama} (${v.no_plat}) - ${v.kapasiti} tempat${v.kapasiti < r.bil_penumpang ? ' - TIDAK CUKUP' : ''}`)));
  const pSel = h('select', {}, h('option', { value: '' }, '- Tiada pemandu -'),
    k.pemandu.map((p) => h('option', { value: p.id }, p.nama)));
  const catatan = h('textarea', { placeholder: 'Catatan (wajib jika dipulangkan)', maxlength: 500 });
  const lengkap = h('button', {
    class: 'utama',
    onclick: () => jalankan(lengkap, async () => {
      await api('hantar_kelulusan', { id: r.id, vehicle_id: vSel.value || null, driver_id: pSel.value || null, catatan: catatan.value });
      muatSemula();
    }, 'Dihantar kepada pelulus'),
  }, 'Lengkap, hantar kepada pelulus');
  const pulang = h('button', {
    class: 'bahaya',
    onclick: () => jalankan(pulang, async () => { await api('pulangkan', { id: r.id, catatan: catatan.value }); muatSemula(); }, 'Dipulangkan kepada pemohon'),
  }, 'Pulangkan kepada pemohon');
  return h('div', {},
    h('p', { class: 'muted' }, `Hanya kenderaan dan pemandu yang kosong pada masa ini dipaparkan. Penumpang: ${r.bil_penumpang}.`),
    h('label', {}, 'Kenderaan'), vSel, h('label', {}, 'Pemandu'), pSel,
    h('label', {}, 'Catatan'), catatan, h('div', { class: 'tindakan' }, lengkap, pulang));
}

function panelKelulusan(r, muatSemula) {
  const catatan = h('textarea', { placeholder: 'Catatan, justifikasi penolakan atau sebab dihantar balik', maxlength: 500 });
  const lulus = h('button', {
    class: 'utama',
    onclick: () => jalankan(lulus, async () => { await api('lulus', { id: r.id, catatan: catatan.value }); muatSemula(); }, 'Permohonan diluluskan'),
  }, 'Lulus');
  const tolak = h('button', {
    class: 'bahaya',
    onclick: () => jalankan(tolak, async () => { await api('tolak', { id: r.id, sebab: catatan.value }); muatSemula(); }, 'Permohonan ditolak'),
  }, 'Tolak (justifikasi wajib)');
  const balik = h('button', {
    onclick: () => jalankan(balik, async () => { await api('hantar_balik', { id: r.id, catatan: catatan.value }); muatSemula(); }, 'Dihantar balik kepada penyemak'),
  }, 'Hantar balik kepada penyemak');
  return h('div', {}, h('label', {}, 'Catatan / justifikasi'), catatan, h('div', { class: 'tindakan' }, lulus, tolak, balik));
}

// ------------------------------------------------------------- kalendar
async function kalendar() {
  const mulaAwal = new Date();
  mulaAwal.setHours(0, 0, 0, 0);
  const dari = h('input', { type: 'date', value: keInput(mulaAwal.toISOString()).slice(0, 10) });
  const kandungan = h('div', {});
  const muat = async () => {
    const d0 = new Date(`${dari.value}T00:00`);
    const hari = 14;
    const hingga = new Date(d0.getTime() + hari * 86400000);
    const { kenderaan, tempahan } = await api('kalendar', { dari: d0.toISOString(), hingga: hingga.toISOString() });
    const masa = (iso) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit', hour12: false });
    const baris = [];
    for (let i = 0; i < hari; i++) {
      const s = new Date(d0.getTime() + i * 86400000);
      const e = new Date(s.getTime() + 86400000);
      baris.push(h('tr', {}, h('td', {}, fmtTarikh(s)), kenderaan.map((v) => {
        const ada = tempahan.filter((t) => t.no_plat === v.no_plat && new Date(t.mula) < e && new Date(t.tamat) > s);
        return h('td', { class: 'sel-kalendar' }, ada.map((t) => h('div', {},
          `${masa(t.mula)}-${masa(t.tamat)}`, t.pemandu ? ` (${t.pemandu})` : '',
          t.pemohon ? h('div', { class: 'muted' }, `${t.pemohon}${t.destinasi ? `, ${t.destinasi}` : ''}`) : null)));
      })));
    }
    kandungan.replaceChildren(h('div', { class: 'jadual-scroll' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Tarikh'), kenderaan.map((v) => h('th', {}, `${v.nama} (${v.no_plat})`)))),
      h('tbody', {}, baris))));
  };
  dari.addEventListener('change', () => muat().catch((e) => toast(e.message, true)));
  await muat();
  return [h('h1', {}, 'Kalendar tempahan'), h('div', { class: 'kad' }, h('label', {}, 'Mulai tarikh'), dari), kandungan];
}

// ------------------------------------------------------------ pentadbiran
async function admin() {
  const tab = rute().b || 'pengguna';
  const tabs = ['pengguna', 'kenderaan', 'pemandu', 'tetapan', 'permohonan', 'audit'];
  const nama = { pengguna: 'Pengguna', kenderaan: 'Kenderaan', pemandu: 'Pemandu', tetapan: 'Tetapan', permohonan: 'Semua permohonan', audit: 'Log audit' };
  const isi = h('div', {});
  const kandungan = { pengguna: tabPengguna, kenderaan: tabKenderaan, pemandu: tabPemandu, tetapan: tabTetapan, permohonan: tabSemuaPermohonan, audit: tabAudit }[tab];
  if (!kandungan) return h('p', {}, 'Tab tidak ditemui.');
  await kandungan(isi);
  return [h('h1', {}, 'Pentadbiran'),
    h('div', { class: 'tab' }, tabs.map((t) => h('button', { class: t === tab ? 'aktif' : '', onclick: () => { location.hash = `#/admin/${t}`; } }, nama[t]))),
    isi];
}

async function tabPengguna(isi) {
  const data = await api('admin_pengguna');
  isi.replaceChildren(h('div', { class: 'jadual-scroll' }, h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, 'Nama'), h('th', {}, 'Emel'), h('th', {}, 'Peranan'), h('th', {}, 'Aktif'), h('th', {}))),
    h('tbody', {}, data.map((p) => {
      const per = h('select', {}, Object.entries(PERANAN).map(([k, v]) => h('option', { value: k }, v)));
      per.value = p.peranan;
      const aktif = h('input', { type: 'checkbox', checked: p.aktif });
      const simpan = h('button', {
        onclick: () => jalankan(simpan, async () => { await api('admin_tetapkan_peranan', { id: p.id, peranan: per.value, aktif: aktif.checked }); }, 'Disimpan'),
      }, 'Simpan');
      return h('tr', {}, h('td', {}, p.nama), h('td', {}, p.emel + (p.disahkan ? '' : ' (belum disahkan)')), h('td', {}, per), h('td', {}, aktif), h('td', {}, simpan));
    })))));
}

async function tabKenderaan(isi) {
  const data = await api('admin_kenderaan');
  const jenis = h('select', {}, Object.entries(JENIS).map(([k, v]) => h('option', { value: k }, v)));
  const nama = h('input', { placeholder: 'Nama', maxlength: 60 });
  const plat = h('input', { placeholder: 'No. plat', maxlength: 20 });
  const kap = h('input', { type: 'number', min: 1, placeholder: 'Kapasiti' });
  const tambah = h('button', {
    class: 'utama',
    onclick: () => jalankan(tambah, async () => {
      await api('admin_simpan_kenderaan', { jenis: jenis.value, nama: nama.value, no_plat: plat.value, kapasiti: Number(kap.value) });
      await tabKenderaan(isi);
    }, 'Kenderaan ditambah'),
  }, 'Tambah');
  isi.replaceChildren(
    h('div', { class: 'jadual-scroll' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Jenis'), h('th', {}, 'Nama'), h('th', {}, 'No. plat'), h('th', {}, 'Kapasiti'), h('th', {}, 'Aktif'))),
      h('tbody', {}, data.map((v) => {
        const aktif = h('input', {
          type: 'checkbox', checked: v.aktif,
          onchange: () => jalankan(aktif, async () => { await api('admin_simpan_kenderaan', { ...v, aktif: aktif.checked }); }, 'Disimpan'),
        });
        return h('tr', {}, h('td', {}, JENIS[v.jenis]), h('td', {}, v.nama), h('td', {}, v.no_plat), h('td', {}, v.kapasiti), h('td', {}, aktif));
      })))),
    h('div', { class: 'kad' }, h('h2', {}, 'Tambah kenderaan'), h('div', { class: 'baris' }, jenis, nama, plat, kap), h('div', { class: 'tindakan' }, tambah)));
}

async function tabPemandu(isi) {
  const data = await api('admin_pemandu');
  const nama = h('input', { placeholder: 'Nama pemandu', maxlength: 100 });
  const tel = h('input', { placeholder: 'No. telefon', maxlength: 20 });
  const tambah = h('button', {
    class: 'utama',
    onclick: () => jalankan(tambah, async () => { await api('admin_simpan_pemandu', { nama: nama.value, telefon: tel.value }); await tabPemandu(isi); }, 'Pemandu ditambah'),
  }, 'Tambah');
  isi.replaceChildren(
    h('div', { class: 'jadual-scroll' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Nama'), h('th', {}, 'No. telefon'), h('th', {}, 'Aktif'))),
      h('tbody', {}, data.map((d) => {
        const aktif = h('input', {
          type: 'checkbox', checked: d.aktif,
          onchange: () => jalankan(aktif, async () => { await api('admin_simpan_pemandu', { ...d, aktif: aktif.checked }); }, 'Disimpan'),
        });
        return h('tr', {}, h('td', {}, d.nama), h('td', {}, d.telefon || '-'), h('td', {}, aktif));
      })))),
    h('div', { class: 'kad' }, h('h2', {}, 'Tambah pemandu'), h('div', { class: 'baris' }, nama, tel), h('div', { class: 'tindakan' }, tambah)));
}

async function tabTetapan(isi) {
  const label = {
    domain_emel: 'Domain emel dibenarkan mendaftar (kosong = semua)',
    had_hari_tempahan: 'Had hari tempahan ke hadapan',
    tempoh_pembetulan_hari: 'Tempoh pembetulan (hari)',
    had_pemulangan: 'Had bilangan pemulangan',
    had_batal_jam: 'Had pembatalan selepas lulus (jam sebelum mula)',
    tempoh_simpan_tahun: 'Tempoh simpan rekod yang ditutup (tahun)',
  };
  const data = await api('admin_tetapan');
  isi.replaceChildren(h('div', { class: 'kad' }, data.map((t) => {
    const nilai = h('input', { value: t.nilai, maxlength: 100 });
    const simpan = h('button', {
      onclick: () => jalankan(simpan, async () => { await api('admin_simpan_tetapan', { kunci: t.kunci, nilai: nilai.value }); }, 'Disimpan'),
    }, 'Simpan');
    return h('div', {}, h('label', {}, label[t.kunci] || t.kunci), h('div', { class: 'baris' }, nilai, h('div', {}, simpan)));
  })));
}

async function tabSemuaPermohonan(isi) {
  isi.replaceChildren(jadualPermohonan(await api('admin_semua_permohonan'), { tunjukPemohon: true }));
}

async function tabAudit(isi) {
  const log = await api('admin_audit');
  isi.replaceChildren(h('div', { class: 'jadual-scroll' }, h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, 'Masa'), h('th', {}, 'Pengguna'), h('th', {}, 'Tindakan'), h('th', {}, 'Jadual'), h('th', {}, 'Rekod'))),
    h('tbody', {}, log.map((l) => h('tr', {},
      h('td', {}, fmt(l.masa)), h('td', {}, l.pengguna), h('td', {}, l.tindakan), h('td', {}, l.jadual), h('td', {}, l.rekod)))))));
}

// -------------------------------------------------------------- mula
(async () => {
  if (adaToken()) {
    try {
      profil = await api('profil_saya');
    } catch {
      profil = null;
    }
  }
  render();
})();
