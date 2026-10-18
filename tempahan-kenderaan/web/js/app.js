import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const $app = document.getElementById('app');
const $bar = document.getElementById('bar');
const $toast = document.getElementById('toast');

// ------------------------------------------------------------------ util
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

// Jalankan tindakan dengan butang dilumpuhkan semasa proses.
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
const semak = ({ data, error }) => {
  if (error) throw error;
  return data;
};

// ------------------------------------------------------------ konfigurasi
let sb;
try {
  const cfg = await import('../config.js');
  sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
} catch {
  mount(h('div', { class: 'kad' }, h('h1', {}, 'Konfigurasi tiada'),
    h('p', {}, 'Fail web/config.js tidak ditemui. Lihat README.md untuk cara menetapkannya.')));
  throw new Error('config.js tiada');
}

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
    h('a', { href: '#/profil' }, `${profil.nama} (${PERANAN[profil.peranan]})`),
    h('button', { onclick: () => sb.auth.signOut() }, 'Log keluar'),
  ].filter(Boolean));
}

async function render() {
  renderBar();
  if (!profil) return halamanMasuk();
  const { a, b } = rute();
  try {
    if (a === '') return await senaraiSaya();
    if (a === 'baharu') return await borang(null);
    if (a === 'edit') return await borang(b);
    if (a === 'permohonan') return await butiran(b);
    if (a === 'kalendar') return await kalendar();
    if (a === 'semakan') return await senaraiTugasan('semakan');
    if (a === 'kelulusan') return await senaraiTugasan('kelulusan');
    if (a === 'admin') return await admin();
    if (a === 'profil') return halamanProfil();
    mount(h('p', {}, 'Halaman tidak ditemui.'));
  } catch (e) {
    mount(h('p', { class: 'ralat' }, e.message || String(e)));
  }
}
window.addEventListener('hashchange', render);

async function muatProfil(session) {
  if (!session) {
    profil = null;
    return render();
  }
  const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
  if (error || !data) {
    profil = null;
    toast('Profil tidak ditemui. Hubungi admin.', true);
    return render();
  }
  if (!data.aktif) {
    profil = null;
    toast('Akaun anda tidak aktif. Hubungi admin.', true);
    await sb.auth.signOut();
    return;
  }
  profil = data;
  render();
}

// Mencetus INITIAL_SESSION semasa mula, jadi tiada panggilan muat awal berasingan.
sb.auth.onAuthStateChange((_ev, session) => {
  // Elak panggilan Supabase terus di dalam callback; tangguhkan.
  setTimeout(() => muatProfil(session), 0);
});

// ------------------------------------------------------------- log masuk
function halamanMasuk() {
  let daftar = false;
  const papar = () => {
    const emel = h('input', { type: 'email', required: true, autocomplete: 'email' });
    const kata = h('input', { type: 'password', required: true, minlength: 8, autocomplete: daftar ? 'new-password' : 'current-password' });
    const nama = h('input', { type: 'text', required: true });
    const jabatan = h('input', { type: 'text' });
    const tel = h('input', { type: 'tel' });
    const hantar = h('button', { class: 'utama', type: 'submit' }, daftar ? 'Daftar' : 'Log masuk');
    const borang = h('form', {
      onsubmit: (e) => {
        e.preventDefault();
        jalankan(hantar, async () => {
          if (daftar) {
            const { data, error } = await sb.auth.signUp({
              email: emel.value.trim(), password: kata.value,
              options: { data: { nama: nama.value, jabatan: jabatan.value, no_telefon: tel.value } },
            });
            if (error) throw new Error('Pendaftaran gagal. Pastikan anda guna emel organisasi dan kata laluan sekurang-kurangnya 8 aksara.');
            if (!data.session) toast('Semak emel anda untuk mengesahkan akaun, kemudian log masuk.');
          } else {
            const { error } = await sb.auth.signInWithPassword({ email: emel.value.trim(), password: kata.value });
            if (error) throw new Error('Emel atau kata laluan tidak betul.');
          }
        });
      },
    },
    daftar ? [h('label', {}, 'Nama penuh'), nama] : null,
    h('label', {}, 'Emel'), emel,
    h('label', {}, 'Kata laluan'), kata,
    daftar ? [h('label', {}, 'Jabatan / unit'), jabatan, h('label', {}, 'No. telefon'), tel] : null,
    h('div', { class: 'tindakan' }, hantar,
      h('button', { type: 'button', onclick: () => { daftar = !daftar; papar(); } },
        daftar ? 'Sudah ada akaun' : 'Daftar akaun baharu')));
    mount(h('div', { class: 'kad auth' }, h('h1', {}, 'Tempahan Kenderaan'),
      h('p', { class: 'muted' }, 'Untuk staf dalaman sahaja.'), borang));
  };
  papar();
}

function halamanProfil() {
  const nama = h('input', { value: profil.nama });
  const jabatan = h('input', { value: profil.jabatan || '' });
  const tel = h('input', { value: profil.no_telefon || '' });
  const simpan = h('button', { class: 'utama', type: 'submit' }, 'Simpan');
  mount(h('h1', {}, 'Profil saya'), h('form', {
    class: 'kad',
    onsubmit: (e) => {
      e.preventDefault();
      jalankan(simpan, async () => {
        semak(await sb.rpc('kemas_kini_profil', { p_nama: nama.value, p_jabatan: jabatan.value, p_telefon: tel.value }));
        Object.assign(profil, { nama: nama.value.trim(), jabatan: jabatan.value.trim(), no_telefon: tel.value.trim() });
        renderBar();
      }, 'Profil dikemas kini');
    },
  },
  h('p', { class: 'muted' }, `${profil.emel}`),
  h('label', {}, 'Nama'), nama, h('label', {}, 'Jabatan / unit'), jabatan, h('label', {}, 'No. telefon'), tel,
  h('div', { class: 'tindakan' }, simpan)));
}

// -------------------------------------------------------- senarai permohonan
function jadualPermohonan(baris, { tunjukPemohon = false } = {}) {
  if (!baris.length) return h('p', { class: 'muted' }, 'Tiada permohonan.');
  return h('div', { class: 'jadual-scroll' }, h('table', {},
    h('thead', {}, h('tr', {},
      h('th', {}, 'No. rujukan'), tunjukPemohon ? h('th', {}, 'Pemohon') : null,
      h('th', {}, 'Tujuan'), h('th', {}, 'Tarikh'), h('th', {}, 'Status'))),
    h('tbody', {}, baris.map((r) => h('tr', {},
      h('td', {}, h('a', { href: `#/permohonan/${r.id}` }, r.no_rujukan || '(draf)')),
      tunjukPemohon ? h('td', {}, r.pemohon?.nama || '-') : null,
      h('td', {}, r.tujuan),
      h('td', {}, `${fmt(r.tarikh_mula)} - ${fmt(r.tarikh_tamat)}`),
      h('td', {}, lencana(r.status)))))));
}

async function senaraiSaya() {
  const data = semak(await sb.from('requests').select('*').eq('pemohon_id', profil.id).order('created_at', { ascending: false }));
  mount(h('h1', {}, 'Permohonan saya'), jadualPermohonan(data),
    h('div', { class: 'tindakan' }, h('a', { class: 'btn utama', href: '#/baharu' }, 'Permohonan baharu')));
}

async function senaraiTugasan(jenis) {
  const status = jenis === 'semakan' ? ['dihantar', 'dalam_semakan'] : ['menunggu_kelulusan'];
  let data = semak(await sb.from('requests')
    .select('*, pemohon:profiles!requests_pemohon_id_fkey(nama)')
    .in('status', status).order('updated_at', { ascending: true }));
  if (jenis === 'semakan') {
    data = data.filter((r) => r.pemohon_id !== profil.id && (!r.penyemak_id || r.penyemak_id === profil.id));
  } else {
    data = data.filter((r) => r.pemohon_id !== profil.id && r.penyemak_id !== profil.id);
  }
  mount(h('h1', {}, jenis === 'semakan' ? 'Tugasan semakan' : 'Menunggu kelulusan'),
    jadualPermohonan(data, { tunjukPemohon: true }));
}

// --------------------------------------------------------------- borang
async function borang(id) {
  let r = null;
  if (id) {
    r = semak(await sb.from('requests').select('*').eq('id', id).single());
    if (r.pemohon_id !== profil.id || !['draf', 'dipulangkan'].includes(r.status)) {
      return mount(h('p', { class: 'ralat' }, 'Permohonan ini tidak boleh diubah.'));
    }
  }
  const tujuan = h('input', { value: r?.tujuan || '', required: true, minlength: 5 });
  const destinasi = h('input', { value: r?.destinasi || '', required: true });
  const bil = h('input', { type: 'number', min: 1, max: 100, value: r?.bil_penumpang || 1, required: true });
  const mula = h('input', { type: 'datetime-local', value: keInput(r?.tarikh_mula), required: true });
  const tamat = h('input', { type: 'datetime-local', value: keInput(r?.tarikh_tamat), required: true });
  const jenis = h('select', {},
    h('option', { value: '' }, 'Mana-mana'),
    Object.entries(JENIS).map(([k, v]) => h('option', { value: k }, v)));
  jenis.value = r?.jenis_diminta || '';
  const pemandu = h('input', { type: 'checkbox', checked: r?.perlu_pemandu });
  const kosong = h('p', { class: 'muted' }, 'Pilih tarikh untuk semak kenderaan yang kosong.');

  const semakKosong = async () => {
    if (!mula.value || !tamat.value || new Date(tamat.value) <= new Date(mula.value)) return;
    const { data, error } = await sb.rpc('cari_kenderaan_kosong', { p_mula: keISO(mula.value), p_tamat: keISO(tamat.value) });
    if (error) return;
    kosong.textContent = data.length
      ? `Kenderaan kosong pada masa ini: ${data.map((v) => `${v.nama} (${v.kapasiti} tempat)`).join(', ')}`
      : 'Tiada kenderaan kosong pada masa ini. Anda masih boleh hantar, tetapi mungkin tidak dapat dipenuhi.';
  };
  mula.addEventListener('change', semakKosong);
  tamat.addEventListener('change', semakKosong);
  semakKosong();

  const simpanDraf = async () => semak(await sb.rpc('simpan_permohonan', {
    p_id: id, p_tujuan: tujuan.value, p_destinasi: destinasi.value, p_bil: Number(bil.value),
    p_mula: keISO(mula.value), p_tamat: keISO(tamat.value),
    p_jenis: jenis.value || null, p_pemandu: pemandu.checked,
  }));

  const btnDraf = h('button', { type: 'button' }, 'Simpan draf');
  const btnHantar = h('button', { class: 'utama', type: 'submit' }, 'Simpan dan hantar');
  btnDraf.addEventListener('click', () => {
    if (!tujuan.reportValidity() || !destinasi.reportValidity() || !mula.reportValidity() || !tamat.reportValidity()) return;
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
        const rujukan = semak(await sb.rpc('hantar_permohonan', { p_id: rid }));
        toast(`Permohonan dihantar. No. rujukan: ${rujukan}`);
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

  mount(h('h1', {}, id ? 'Edit permohonan' : 'Permohonan baharu'), el,
    id ? await bahagianDokumen(r, true) : h('p', { class: 'muted' }, 'Simpan draf dahulu untuk melampirkan dokumen.'));
}

// ------------------------------------------------------------- dokumen
async function bahagianDokumen(r, boleh) {
  const kad = h('div', { class: 'kad' });
  const muat = async () => {
    const docs = semak(await sb.from('documents').select('*').eq('request_id', r.id).order('dimuat_naik'));
    const senarai = docs.map((d) => h('li', {},
      h('a', {
        href: '#',
        onclick: async (e) => {
          e.preventDefault();
          const { data, error } = await sb.storage.from('dokumen').createSignedUrl(d.path, 60);
          if (error) return toast(error.message, true);
          window.open(data.signedUrl, '_blank', 'noopener');
        },
      }, d.nama_fail),
      boleh ? [' ', h('button', {
        class: 'bahaya',
        onclick: (e) => jalankan(e.target, async () => {
          const { error } = await sb.storage.from('dokumen').remove([d.path]);
          if (error) throw error;
          semak(await sb.from('documents').delete().eq('id', d.id));
          await muat();
        }),
      }, 'Padam')] : null));
    const fail = h('input', { type: 'file', accept: 'application/pdf,image/jpeg,image/png' });
    const naik = h('button', { type: 'button' }, 'Muat naik');
    naik.addEventListener('click', () => jalankan(naik, async () => {
      const f = fail.files[0];
      if (!f) throw new Error('Pilih fail dahulu');
      if (f.size > 5 * 1024 * 1024) throw new Error('Saiz fail maksimum 5MB');
      const selamat = f.name.replace(/[^A-Za-z0-9._-]/g, '_');
      const path = `${r.id}/${Date.now()}-${selamat}`;
      const { error } = await sb.storage.from('dokumen').upload(path, f, { contentType: f.type });
      if (error) throw error;
      semak(await sb.from('documents').insert({ request_id: r.id, nama_fail: f.name, path, saiz: f.size }));
      await muat();
    }, 'Dokumen dimuat naik'));
    kad.replaceChildren(h('h2', {}, 'Dokumen sokongan'),
      senarai.length ? h('ul', {}, senarai) : h('p', { class: 'muted' }, 'Tiada dokumen.'),
      boleh ? h('div', {}, h('p', { class: 'muted' }, 'PDF, JPG atau PNG, maksimum 5MB.'), fail, h('div', { class: 'tindakan' }, naik)) : null);
  };
  await muat();
  return kad;
}

// ------------------------------------------------------------- butiran
async function butiran(id) {
  const r = semak(await sb.from('requests').select(
    '*, pemohon:profiles!requests_pemohon_id_fkey(nama, jabatan, no_telefon), vehicle:vehicles(nama, no_plat), driver:drivers(nama),'
    + ' decisions(*, oleh_profil:profiles!decisions_oleh_fkey(nama))',
  ).eq('id', id).order('masa', { referencedTable: 'decisions' }).single());

  const adaPemohon = r.pemohon_id === profil.id;
  const rowData = [
    ['No. rujukan', r.no_rujukan || '(belum dihantar)'],
    ['Status', lencana(r.status)],
    ['Pemohon', r.pemohon ? `${r.pemohon.nama}${r.pemohon.jabatan ? `, ${r.pemohon.jabatan}` : ''}${r.pemohon.no_telefon ? ` (${r.pemohon.no_telefon})` : ''}` : '-'],
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

  const garis = h('ul', { class: 'garis-masa' }, r.decisions.map((d) => h('li', {},
    h('b', {}, KEPUTUSAN[d.keputusan] || d.keputusan), ` - ${fmt(d.masa)}`,
    h('div', { class: 'muted' }, d.oleh_profil?.nama || 'Pegawai'),
    d.justifikasi ? h('div', {}, d.justifikasi) : null)));

  const tindakan = h('div', { class: 'kad' });
  const muatSemula = () => render();
  const ruangTindakan = [];

  // Pemohon
  if (adaPemohon && ['draf', 'dipulangkan'].includes(r.status)) {
    const hantar = h('button', {
      class: 'utama',
      onclick: () => jalankan(hantar, async () => {
        const rujukan = semak(await sb.rpc('hantar_permohonan', { p_id: id }));
        toast(`Permohonan dihantar. No. rujukan: ${rujukan}`);
        muatSemula();
      }),
    }, 'Hantar');
    ruangTindakan.push(h('a', { class: 'btn', href: `#/edit/${id}` }, 'Edit'), hantar);
  }

  // Batal (pemohon atau admin)
  if ((adaPemohon || profil.peranan === 'admin') && !MUTLAK.includes(r.status)) {
    const sebab = h('input', { placeholder: 'Sebab pembatalan (pilihan)' });
    const batal = h('button', {
      class: 'bahaya',
      onclick: () => {
        if (!confirm('Batalkan permohonan ini?')) return;
        jalankan(batal, async () => {
          semak(await sb.rpc('batal_permohonan', { p_id: id, p_sebab: sebab.value || null }));
          muatSemula();
        }, 'Permohonan dibatalkan');
      },
    }, 'Batalkan permohonan');
    ruangTindakan.push(h('div', { class: 'baris' }, sebab, h('div', {}, batal)));
  }

  // Penyemak
  const bukanDiri = !adaPemohon;
  if (profil.peranan === 'penyemak' && bukanDiri) {
    if (r.status === 'dihantar' && (!r.penyemak_id || r.penyemak_id === profil.id)) {
      const ambil = h('button', {
        class: 'utama',
        onclick: () => jalankan(ambil, async () => {
          semak(await sb.rpc('ambil_semakan', { p_id: id }));
          muatSemula();
        }, 'Permohonan diambil untuk semakan'),
      }, 'Ambil untuk semakan');
      ruangTindakan.push(ambil);
    }
    if (r.status === 'dalam_semakan' && r.penyemak_id === profil.id) {
      ruangTindakan.push(await panelSemakan(r, muatSemula));
    }
  }

  // Pelulus
  if (profil.peranan === 'pelulus' && bukanDiri && r.status === 'menunggu_kelulusan' && r.penyemak_id !== profil.id) {
    ruangTindakan.push(panelKelulusan(r, muatSemula));
  }

  if (ruangTindakan.length) tindakan.append(h('h2', {}, 'Tindakan'), ...ruangTindakan.map((n) => h('div', { class: 'tindakan' }, n)));

  mount(
    h('h1', {}, `Permohonan ${r.no_rujukan || '(draf)'}`),
    h('div', { class: 'kad' }, h('dl', {}, rowData.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]))),
    ruangTindakan.length ? tindakan : null,
    await bahagianDokumen(r, adaPemohon && ['draf', 'dipulangkan'].includes(r.status)),
    h('div', { class: 'kad' }, h('h2', {}, 'Sejarah'), r.decisions.length ? garis : h('p', { class: 'muted' }, 'Belum ada tindakan.')),
  );
}

async function panelSemakan(r, muatSemula) {
  const [kenderaan, pemandu] = await Promise.all([
    sb.rpc('cari_kenderaan_kosong', { p_mula: r.tarikh_mula, p_tamat: r.tarikh_tamat }).then(semak),
    sb.rpc('cari_pemandu_kosong', { p_mula: r.tarikh_mula, p_tamat: r.tarikh_tamat }).then(semak),
  ]);
  const vSel = h('select', {}, h('option', { value: '' }, '- Pilih kenderaan -'),
    kenderaan.map((v) => h('option', { value: v.id },
      `${v.nama} (${v.no_plat}) - ${v.kapasiti} tempat${v.kapasiti < r.bil_penumpang ? ' - TIDAK CUKUP' : ''}`)));
  const pSel = h('select', {}, h('option', { value: '' }, '- Tiada pemandu -'),
    pemandu.map((p) => h('option', { value: p.id }, p.nama)));
  const catatan = h('textarea', { placeholder: 'Catatan (wajib jika dipulangkan)' });
  const lengkap = h('button', {
    class: 'utama',
    onclick: () => jalankan(lengkap, async () => {
      semak(await sb.rpc('hantar_kelulusan', {
        p_id: r.id, p_vehicle: vSel.value || null, p_driver: pSel.value || null, p_catatan: catatan.value || null,
      }));
      muatSemula();
    }, 'Dihantar kepada pelulus'),
  }, 'Lengkap, hantar kepada pelulus');
  const pulang = h('button', {
    class: 'bahaya',
    onclick: () => jalankan(pulang, async () => {
      semak(await sb.rpc('pulangkan_permohonan', { p_id: r.id, p_catatan: catatan.value }));
      muatSemula();
    }, 'Dipulangkan kepada pemohon'),
  }, 'Pulangkan kepada pemohon');
  return h('div', {},
    h('p', { class: 'muted' }, `Hanya kenderaan dan pemandu yang kosong pada masa ini dipaparkan. Penumpang: ${r.bil_penumpang}.`),
    h('label', {}, 'Kenderaan'), vSel, h('label', {}, 'Pemandu'), pSel,
    h('label', {}, 'Catatan'), catatan, h('div', { class: 'tindakan' }, lengkap, pulang));
}

function panelKelulusan(r, muatSemula) {
  const catatan = h('textarea', { placeholder: 'Catatan, justifikasi penolakan atau sebab dihantar balik' });
  const lulus = h('button', {
    class: 'utama',
    onclick: () => jalankan(lulus, async () => {
      semak(await sb.rpc('lulus_permohonan', { p_id: r.id, p_catatan: catatan.value || null }));
      muatSemula();
    }, 'Permohonan diluluskan'),
  }, 'Lulus');
  const tolak = h('button', {
    class: 'bahaya',
    onclick: () => jalankan(tolak, async () => {
      semak(await sb.rpc('tolak_permohonan', { p_id: r.id, p_sebab: catatan.value }));
      muatSemula();
    }, 'Permohonan ditolak'),
  }, 'Tolak (justifikasi wajib)');
  const balik = h('button', {
    onclick: () => jalankan(balik, async () => {
      semak(await sb.rpc('hantar_balik_penyemak', { p_id: r.id, p_catatan: catatan.value }));
      muatSemula();
    }, 'Dihantar balik kepada penyemak'),
  }, 'Hantar balik kepada penyemak');
  return h('div', {}, h('label', {}, 'Catatan / justifikasi'), catatan,
    h('div', { class: 'tindakan' }, lulus, tolak, balik));
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
    const [kenderaan, tempahan] = await Promise.all([
      sb.from('vehicles').select('*').eq('aktif', true).order('jenis').then(semak),
      sb.rpc('kalendar', { p_dari: d0.toISOString(), p_hingga: hingga.toISOString() }).then(semak),
    ]);
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
  mount(h('h1', {}, 'Kalendar tempahan'), h('div', { class: 'kad' }, h('label', {}, 'Mulai tarikh'), dari), kandungan);
  await muat();
}

// ------------------------------------------------------------ pentadbiran
async function admin() {
  const tab = rute().b || 'pengguna';
  const tabs = ['pengguna', 'kenderaan', 'pemandu', 'tetapan', 'permohonan', 'audit'];
  const nama = { pengguna: 'Pengguna', kenderaan: 'Kenderaan', pemandu: 'Pemandu', tetapan: 'Tetapan', permohonan: 'Semua permohonan', audit: 'Log audit' };
  const isi = h('div', {});
  mount(h('h1', {}, 'Pentadbiran'),
    h('div', { class: 'tab' }, tabs.map((t) => h('button', { class: t === tab ? 'aktif' : '', onclick: () => { location.hash = `#/admin/${t}`; } }, nama[t]))),
    isi);
  const muat = () => ({ pengguna: tabPengguna, kenderaan: tabKenderaan, pemandu: tabPemandu, tetapan: tabTetapan, permohonan: tabSemuaPermohonan, audit: tabAudit })[tab](isi);
  await muat();
}

async function tabPengguna(isi) {
  const data = semak(await sb.from('profiles').select('*').order('nama'));
  isi.replaceChildren(h('div', { class: 'jadual-scroll' }, h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, 'Nama'), h('th', {}, 'Emel'), h('th', {}, 'Peranan'), h('th', {}, 'Aktif'), h('th', {}))),
    h('tbody', {}, data.map((p) => {
      const per = h('select', {}, Object.entries(PERANAN).map(([k, v]) => h('option', { value: k }, v)));
      per.value = p.peranan;
      const aktif = h('input', { type: 'checkbox', checked: p.aktif });
      const simpan = h('button', {
        onclick: () => jalankan(simpan, async () => {
          semak(await sb.rpc('tetapkan_peranan', { p_user: p.id, p_peranan: per.value, p_aktif: aktif.checked }));
        }, 'Disimpan'),
      }, 'Simpan');
      return h('tr', {}, h('td', {}, p.nama), h('td', {}, p.emel), h('td', {}, per), h('td', {}, aktif), h('td', {}, simpan));
    })))));
}

async function tabKenderaan(isi) {
  const data = semak(await sb.from('vehicles').select('*').order('jenis'));
  const jenis = h('select', {}, Object.entries(JENIS).map(([k, v]) => h('option', { value: k }, v)));
  const nama = h('input', { placeholder: 'Nama' });
  const plat = h('input', { placeholder: 'No. plat' });
  const kap = h('input', { type: 'number', min: 1, placeholder: 'Kapasiti' });
  const tambah = h('button', {
    class: 'utama',
    onclick: () => jalankan(tambah, async () => {
      semak(await sb.from('vehicles').insert({ jenis: jenis.value, nama: nama.value, no_plat: plat.value.trim().toUpperCase(), kapasiti: Number(kap.value) }));
      await tabKenderaan(isi);
    }, 'Kenderaan ditambah'),
  }, 'Tambah');
  isi.replaceChildren(
    h('div', { class: 'jadual-scroll' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Jenis'), h('th', {}, 'Nama'), h('th', {}, 'No. plat'), h('th', {}, 'Kapasiti'), h('th', {}, 'Aktif'))),
      h('tbody', {}, data.map((v) => {
        const aktif = h('input', {
          type: 'checkbox', checked: v.aktif,
          onchange: () => jalankan(aktif, async () => { semak(await sb.from('vehicles').update({ aktif: aktif.checked }).eq('id', v.id)); }, 'Disimpan'),
        });
        return h('tr', {}, h('td', {}, JENIS[v.jenis]), h('td', {}, v.nama), h('td', {}, v.no_plat), h('td', {}, v.kapasiti), h('td', {}, aktif));
      })))),
    h('div', { class: 'kad' }, h('h2', {}, 'Tambah kenderaan'), h('div', { class: 'baris' }, jenis, nama, plat, kap), h('div', { class: 'tindakan' }, tambah)));
}

async function tabPemandu(isi) {
  const data = semak(await sb.from('drivers').select('*').order('nama'));
  const nama = h('input', { placeholder: 'Nama pemandu' });
  const tel = h('input', { placeholder: 'No. telefon' });
  const tambah = h('button', {
    class: 'utama',
    onclick: () => jalankan(tambah, async () => {
      semak(await sb.from('drivers').insert({ nama: nama.value, no_telefon: tel.value || null }));
      await tabPemandu(isi);
    }, 'Pemandu ditambah'),
  }, 'Tambah');
  isi.replaceChildren(
    h('div', { class: 'jadual-scroll' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Nama'), h('th', {}, 'No. telefon'), h('th', {}, 'Aktif'))),
      h('tbody', {}, data.map((d) => {
        const aktif = h('input', {
          type: 'checkbox', checked: d.aktif,
          onchange: () => jalankan(aktif, async () => { semak(await sb.from('drivers').update({ aktif: aktif.checked }).eq('id', d.id)); }, 'Disimpan'),
        });
        return h('tr', {}, h('td', {}, d.nama), h('td', {}, d.no_telefon || '-'), h('td', {}, aktif));
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
  };
  const data = semak(await sb.from('tetapan').select('*').order('kunci'));
  isi.replaceChildren(h('div', { class: 'kad' }, data.map((t) => {
    const nilai = h('input', { value: t.nilai });
    const simpan = h('button', {
      onclick: () => jalankan(simpan, async () => {
        const v = nilai.value.trim();
        if (t.kunci !== 'domain_emel' && !/^\d+$/.test(v)) throw new Error('Nilai mesti nombor');
        semak(await sb.from('tetapan').update({ nilai: v }).eq('kunci', t.kunci));
      }, 'Disimpan'),
    }, 'Simpan');
    return h('div', {}, h('label', {}, label[t.kunci] || t.kunci), h('div', { class: 'baris' }, nilai, h('div', {}, simpan)));
  })));
}

async function tabSemuaPermohonan(isi) {
  const data = semak(await sb.from('requests').select('*, pemohon:profiles!requests_pemohon_id_fkey(nama)').neq('status', 'draf').order('created_at', { ascending: false }).limit(200));
  isi.replaceChildren(jadualPermohonan(data, { tunjukPemohon: true }));
}

async function tabAudit(isi) {
  const [log, orang] = await Promise.all([
    sb.from('audit_log').select('*').order('id', { ascending: false }).limit(200).then(semak),
    sb.from('profiles').select('id, nama').then(semak),
  ]);
  const peta = Object.fromEntries(orang.map((o) => [o.id, o.nama]));
  isi.replaceChildren(h('div', { class: 'jadual-scroll' }, h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, 'Masa'), h('th', {}, 'Pengguna'), h('th', {}, 'Tindakan'), h('th', {}, 'Jadual'), h('th', {}, 'Rekod'), h('th', {}, 'Status'))),
    h('tbody', {}, log.map((l) => h('tr', {},
      h('td', {}, fmt(l.masa)), h('td', {}, peta[l.pengguna_id] || (l.pengguna_id ? l.pengguna_id.slice(0, 8) : 'sistem')),
      h('td', {}, l.tindakan), h('td', {}, l.jadual), h('td', {}, (l.rekod_id || '').slice(0, 8)),
      h('td', {}, l.sebelum?.status && l.selepas?.status && l.sebelum.status !== l.selepas.status
        ? `${STATUS[l.sebelum.status] || l.sebelum.status} → ${STATUS[l.selepas.status] || l.selepas.status}` : '')))))));
}
