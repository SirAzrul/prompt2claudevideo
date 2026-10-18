// Notifikasi emel melalui MailApp. Kuota harian MailApp: sekitar 100 penerima untuk akaun
// Gmail biasa dan 1500 untuk Google Workspace (semak kuota semasa di dokumentasi Google).
// Kegagalan menghantar emel tidak membatalkan tindakan; ia direkod dalam lembaran Audit.

function hantarEmel(kepada, subjek, badanHtml) {
  const unik = kepada.filter(function (e, i) { return e && kepada.indexOf(e) === i; });
  if (!unik.length) return;
  try {
    MailApp.sendEmail({
      to: unik.join(','),
      subject: subjek,
      htmlBody: badanHtml,
      name: 'Tempahan Kenderaan',
      noReply: true,
    });
  } catch (e) {
    console.error('Emel gagal: ' + e);
    try { audit('emel_gagal', 'Emel', '', null, { subjek: subjek, ralat: String(e).slice(0, 200) }); } catch (e2) { /* abaikan */ }
  }
}

function _emelPeranan(peranan, id) {
  return baca('Pengguna').filter(function (u) {
    return u.Peranan === peranan && bool(u.Aktif) && bool(u.Disahkan) && (!id || u.ID === id);
  }).map(function (u) { return u.Emel; });
}

function _ringkas(r) {
  const pem = _cariPengguna(r.PemohonID);
  const url = PropertiesService.getScriptProperties().getProperty('APP_URL') || '';
  return '<p><b>No. rujukan:</b> ' + esc(r.NoRujukan) + '<br>' +
    '<b>Pemohon:</b> ' + esc(pem ? pem.Nama : '') + '<br>' +
    '<b>Tujuan:</b> ' + esc(r.Tujuan) + '<br>' +
    '<b>Destinasi:</b> ' + esc(r.Destinasi) + '<br>' +
    '<b>Tarikh:</b> ' + esc(fmtMY(r.Mula)) + ' hingga ' + esc(fmtMY(r.Tamat)) + '</p>' +
    (url ? '<p><a href="' + esc(url) + '#/permohonan/' + esc(r.ID) + '">Buka permohonan</a></p>' : '');
}

function emelPemohon(r, jenis) {
  const pem = _cariPengguna(r.PemohonID);
  if (!pem) return;
  const no = r.NoRujukan;
  const ringkas = _ringkas(r);
  let subjek;
  let isi;
  if (jenis === 'diterima') {
    subjek = 'Permohonan diterima (' + no + ')';
    isi = '<p>Permohonan anda telah diterima. Simpan nombor rujukan untuk semakan status.</p>';
  } else if (jenis === 'dipulangkan') {
    subjek = 'Permohonan dipulangkan untuk pembetulan (' + no + ')';
    isi = '<p>Permohonan anda perlu dibetulkan sebelum ' + esc(fmtMY(r.AkhirPembetulan)) + '.</p>' +
      '<p><b>Catatan penyemak:</b> ' + esc(r.CatatanSemakan) + '</p>';
  } else if (jenis === 'keputusan') {
    if (r.Status === 'diluluskan') {
      subjek = 'Permohonan diluluskan (' + no + ')';
      isi = '<p>Permohonan anda diluluskan.</p>';
    } else {
      subjek = 'Permohonan tidak diluluskan (' + no + ')';
      isi = '<p>Permohonan anda tidak diluluskan.</p><p><b>Sebab:</b> ' + esc(r.SebabTolak) + '</p>';
    }
  } else if (jenis === 'dibatalkan') {
    subjek = 'Permohonan dibatalkan (' + no + ')';
    isi = '<p>Permohonan telah dibatalkan.</p>';
  } else if (jenis === 'tamat_tempoh') {
    subjek = 'Permohonan tamat tempoh (' + no + ')';
    isi = '<p>Permohonan ditutup kerana pembetulan tidak dihantar dalam tempoh yang ditetapkan. Sila buat permohonan baharu jika masih perlu.</p>';
  } else {
    return;
  }
  hantarEmel([pem.Emel], subjek, isi + ringkas);
}

function emelStaf(r, jenis) {
  if (jenis === 'tugasan_penyemak') {
    hantarEmel(_emelPeranan('penyemak', r.PenyemakID || null), 'Tugasan semakan baharu (' + r.NoRujukan + ')',
      '<p>Ada permohonan yang menunggu semakan anda.</p>' + _ringkas(r));
  } else if (jenis === 'tugasan_pelulus') {
    hantarEmel(_emelPeranan('pelulus'), 'Menunggu kelulusan (' + r.NoRujukan + ')',
      '<p>Ada permohonan yang menunggu keputusan anda.</p>' + _ringkas(r));
  }
}
