// Tindakan pentadbir. Semua dikawal peranan 'admin' di router (Kod.gs).

function adminPengguna() {
  return baca('Pengguna').map(function (u) {
    return {
      id: u.ID, emel: u.Emel, nama: u.Nama, jabatan: u.Jabatan, peranan: u.Peranan,
      aktif: bool(u.Aktif), disahkan: bool(u.Disahkan),
    };
  }).sort(function (a, b) { return a.nama.localeCompare(b.nama); });
}

function adminTetapkanPeranan(d, p) {
  const u = _cariPengguna(String(d.id || ''));
  if (!u) throw new Ralat('Pengguna tidak ditemui');
  if (PERANAN.indexOf(d.peranan) < 0) throw new Ralat('Peranan tidak sah');
  const aktif = d.aktif === true;
  if (u.ID === p.ID && (d.peranan !== 'admin' || !aktif)) {
    throw new Ralat('Admin tidak boleh menurunkan peranan atau menyahaktifkan akaun sendiri');
  }
  const baharu = kemas('Pengguna', u.ID, { Peranan: d.peranan, Aktif: aktif });
  audit('tetapkan_peranan', 'Pengguna', u.ID, u, baharu);
  return {};
}

function adminKenderaan() {
  return baca('Kenderaan').map(function (v) {
    return { id: v.ID, jenis: v.Jenis, nama: v.Nama, no_plat: v.NoPlat, kapasiti: Number(v.Kapasiti), aktif: bool(v.Aktif) };
  });
}

function adminSimpanKenderaan(d) {
  if (JENIS_KENDERAAN.indexOf(d.jenis) < 0) throw new Ralat('Jenis kenderaan tidak sah');
  const medan = {
    Jenis: d.jenis, Nama: teks(d.nama, 1, 60, 'Nama'),
    NoPlat: teks(d.no_plat, 2, 20, 'No. plat').toUpperCase(),
    Kapasiti: nombor(d.kapasiti, 1, 100, 'Kapasiti'), Aktif: d.aktif !== false,
  };
  const duplikasi = baca('Kenderaan').some(function (v) { return v.NoPlat === medan.NoPlat && v.ID !== d.id; });
  if (duplikasi) throw new Ralat('No. plat sudah wujud');
  if (d.id) {
    const lama = baca('Kenderaan').filter(function (v) { return v.ID === d.id; })[0];
    if (!lama) throw new Ralat('Kenderaan tidak ditemui');
    audit('kemas_kenderaan', 'Kenderaan', d.id, lama, kemas('Kenderaan', d.id, medan));
    return { id: d.id };
  }
  const baharu = tambah('Kenderaan', medan);
  audit('tambah_kenderaan', 'Kenderaan', baharu.ID, null, baharu);
  return { id: baharu.ID };
}

function adminPemandu() {
  return baca('Pemandu').map(function (x) { return { id: x.ID, nama: x.Nama, telefon: x.Telefon, aktif: bool(x.Aktif) }; });
}

function adminSimpanPemandu(d) {
  const medan = {
    Nama: teks(d.nama, 2, 100, 'Nama'),
    Telefon: d.telefon ? teks(d.telefon, 0, 20, 'No. telefon') : '', Aktif: d.aktif !== false,
  };
  if (d.id) {
    const lama = baca('Pemandu').filter(function (x) { return x.ID === d.id; })[0];
    if (!lama) throw new Ralat('Pemandu tidak ditemui');
    audit('kemas_pemandu', 'Pemandu', d.id, lama, kemas('Pemandu', d.id, medan));
    return { id: d.id };
  }
  const baharu = tambah('Pemandu', medan);
  audit('tambah_pemandu', 'Pemandu', baharu.ID, null, baharu);
  return { id: baharu.ID };
}

function adminTetapan() {
  return Object.keys(TETAPAN_LALAI).map(function (k) { return { kunci: k, nilai: tetapan(k) }; });
}

function adminSimpanTetapan(d) {
  const kunci = String(d.kunci || '');
  if (!(kunci in TETAPAN_LALAI)) throw new Ralat('Tetapan tidak dikenali');
  let nilai = String(d.nilai === undefined || d.nilai === null ? '' : d.nilai).trim();
  if (kunci === 'domain_emel') {
    if (nilai && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(nilai)) throw new Ralat('Domain tidak sah');
    nilai = nilai.toLowerCase();
  } else if (!/^\d{1,4}$/.test(nilai) || Number(nilai) < 1) {
    throw new Ralat('Nilai mesti nombor positif');
  }
  const sedia = baca('Tetapan').filter(function (t) { return t.Kunci === kunci; })[0];
  if (sedia) {
    audit('kemas_tetapan', 'Tetapan', kunci, sedia, kemas('Tetapan', kunci, { Nilai: nilai }));
  } else {
    audit('tambah_tetapan', 'Tetapan', kunci, null, tambah('Tetapan', { Kunci: kunci, Nilai: nilai }));
  }
  return {};
}

function adminSemuaPermohonan(d, p) {
  return baca('Permohonan')
    .filter(function (r) { return r.Status !== 'draf'; })
    .sort(function (a, b) { return a.Dicipta < b.Dicipta ? 1 : -1; })
    .slice(0, 300)
    .map(function (r) { return _bentuk(r, p); });
}

function adminAudit() {
  const nama = {};
  baca('Pengguna').forEach(function (u) { nama[u.ID] = u.Nama; });
  const semua = baca('Audit');
  return semua.slice(Math.max(0, semua.length - 200)).reverse().map(function (a) {
    return {
      masa: a.Masa, pengguna: nama[a.PenggunaID] || (a.PenggunaID ? a.PenggunaID.slice(0, 8) : 'sistem'),
      tindakan: a.Tindakan, jadual: a.Jadual, rekod: a.RekodID.slice(0, 8),
    };
  });
}
