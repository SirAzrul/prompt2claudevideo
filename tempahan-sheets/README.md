# Tempahan Kenderaan Pusat: Google Sheets + Apps Script + GitHub Pages

Versi yang guna Google Sheets sebagai database, Google Apps Script sebagai backend, dan GitHub Pages untuk frontend. Aliran kerja sama dengan versi Supabase dalam `tempahan-kenderaan/` (versi itu masih ada sebagai alternatif; boleh dipadam jika tak digunakan).

```
Pemohon hantar → no. rujukan → Penyemak semak ⇄ Dipulangkan (pemohon betulkan)
                                    ↓
                          Pelulus lulus / tolak (justifikasi wajib) → emel kepada pemohon
Semua tindakan direkod dalam lembaran Audit.
```

## Cuba dulu tanpa Google (mod demo)

Selagi `docs/config.js` masih ada nilai `GANTI-...`, laman di GitHub Pages berjalan dalam **mod demo**: kod backend Apps Script yang sama dijalankan di dalam pelayar anda, dengan data contoh. Tiada Google, tiada pelayan. Data disimpan dalam `localStorage` pelayar itu sahaja, jadi ia tidak dikongsi antara peranti dan tidak boleh dijadikan sistem sebenar.

- Halaman log masuk ada butang log masuk pantas untuk Pemohon, Penyemak, Pelulus dan Admin (kata laluan semua: `Demo12345`).
- Data contoh merangkumi permohonan yang diluluskan, menunggu kelulusan, baru dihantar, dipulangkan, ditolak dan draf.
- Butang **Peti mel demo** di bar kuning memaparkan emel yang akan dihantar (termasuk kod pengesahan semasa daftar akaun baharu).
- **Set semula demo** memulihkan data contoh.
- Mod demo hilang sendiri apabila anda tampal URL Web App sebenar ke `docs/config.js`.
- Selepas mengubah mana-mana fail dalam `apps-script/`, jalankan `node tempahan-sheets/scripts/bina-demo.mjs` untuk mengemas kini `docs/demo/backend.js` (fail dijana, jangan sunting manual), kemudian commit.

## Struktur

```
tempahan-sheets/apps-script/   kod backend (salin ke projek Apps Script)
tempahan-sheets/test/          ujian backend dan ujian hujung-ke-hujung
docs/                          frontend, diterbitkan oleh GitHub Pages
docs/demo/backend.js           dijana daripada apps-script/*.gs, untuk mod demo
```

## Cara ia melindungi data (7 teknik sekuriti)

1. **Tiada Publish to Web.** Spreadsheet tidak dikongsi dan tidak diterbitkan. Semua baca/tulis lalu `doPost`.
2. **Kata laluan** dihash SHA-256 dengan salt unik per pengguna, pepper rahsia dalam Script Properties, 500 pusingan. Tiada kata laluan plaintext di mana-mana.
3. **Session token** rawak 256-bit, disimpan di server (CacheService, TTL 6 jam), disahkan pada setiap permintaan. Log keluar memadam token di server. Peranan dan status aktif dibaca semula dari Sheet pada setiap permintaan, jadi pengguna yang dinyahaktifkan terputus serta-merta.
4. **Peranan disemak di server** dalam router (`Kod.gs`) dan dalam setiap fungsi aliran kerja. Menyembunyikan butang di UI bukan kawalan.
5. **Had percubaan:** log masuk 8 kali / 5 minit setiap emel, pendaftaran dan tetapan semula kata laluan juga dihadkan, kod pengesahan maksimum 5 percubaan.
6. **Sanitasi:** semua sel berformat teks dan nilai bermula `= + - @` diberi awalan `'`. Frontend hanya guna `textContent`. Emel di-escape HTML. Muat naik fail disemak jenis, saiz dan magic bytes.
7. **PDPA:** notis privasi dan persetujuan semasa daftar, tempoh simpan 3 tahun (boleh diubah), kutipan data diminimumkan (tiada IC, tiada data kewangan).

Pengesahan emel guna kod 6 digit supaya tiada orang boleh mendaftar atas nama emel orang lain.

## Persediaan (kira-kira 20 minit)

### 1. Spreadsheet dan Apps Script

1. Cipta Google Spreadsheet kosong, namakan contohnya `Tempahan Kenderaan (DATA)`. **Jangan kongsi dengan sesiapa dan jangan Publish to Web.**
2. Extensions > Apps Script. Padam kod lalai.
3. Cipta fail `.gs` dengan nama sama seperti dalam `tempahan-sheets/apps-script/` (`Config`, `Db`, `Auth`, `Aliran`, `Emel`, `Admin`, `Kod`, `Setup`) dan tampal kandungannya. Buka Project Settings, hidupkan "Show appsscript.json manifest file in editor", kemudian tampal kandungan `appsscript.json`.
4. Project Settings > Script Properties > tambah:
   - `ADMIN_EMAIL` = emel anda (orang pertama yang mendaftar dengan emel ini menjadi admin)
   - `APP_URL` = `https://sirazrul.github.io/prompt2claudevideo/` (URL GitHub Pages anda, dengan `/` di hujung)
5. Pilih fungsi `setup` dan tekan Run. Luluskan kebenaran yang diminta (Spreadsheet, Drive, Mail, Triggers). `setup()` mencipta semua lembaran, mengunci perlindungan, menyemai 3 kenderaan dan 3 pemandu, mencipta folder Drive dokumen, dan memasang dua tugas berjadual (tutup permohonan luput setiap jam, padam rekod lama setiap bulan).
6. Edit lembaran `Kenderaan`: ganti no. plat `GANTI-...` dan kapasiti sebenar. Atau lakukan melalui Pentadbiran dalam aplikasi selepas log masuk.

### 2. Terbitkan Web App

1. Deploy > New deployment > jenis Web app.
2. Execute as: **Me**. Who has access: **Anyone**. Ini tidak bermakna data terbuka: tanpa login dan token, setiap tindakan ditolak. Ia perlu supaya GitHub Pages boleh memanggil API.
3. Salin URL yang berakhir dengan `/exec`.
4. Selepas mengubah kod pada masa hadapan: Deploy > Manage deployments > edit > Version: New version. URL kekal sama.

### 3. GitHub Pages

1. Edit `docs/config.js`, tampal URL Web App ke dalam `API_URL`, commit dan push.
2. Repo Settings > Pages > Source: Deploy from a branch. Pilih branch (cth `claude/compassionate-knuth-939bsm` untuk cubaan, atau `main` selepas merge) dan folder `/docs`.
3. Tunggu 1 hingga 2 minit. URL biasanya `https://<pengguna>.github.io/<repo>/`.
4. Pages untuk repo private memerlukan plan GitHub berbayar. Jika repo public, kod boleh dibaca semua orang. Itu tidak mendedahkan rahsia kerana `docs/` hanya ada URL Web App, dan pepper serta data tinggal dalam akaun Google anda.

### 4. Ujian pertama

1. Buka laman, daftar dengan `ADMIN_EMAIL`, masukkan kod 6 digit dari emel, log masuk. Anda ialah admin.
2. Pentadbiran > Tetapan > isi `domain_emel` (cth `organisasi.gov.my`) **sebelum** kongsi pautan. Nilai kosong bermakna sesiapa dengan emel sah boleh mendaftar.
3. Daftar dua akaun lain, jadikan seorang Penyemak dan seorang Pelulus di Pentadbiran > Pengguna.
4. Cuba satu permohonan dari awal hingga lulus.

## Ujian automatik

```bash
node tempahan-sheets/test/uji_backend.mjs   # 190 semakan backend dengan tiruan API Google
node tempahan-sheets/test/uji_ui.mjs        # UI sebenar + backend sebenar, hujung-ke-hujung (perlukan Playwright)
node tempahan-sheets/test/uji_demo.mjs      # mod demo penuh dalam Chromium (perlukan Playwright)
node tempahan-sheets/scripts/bina-demo.mjs --semak   # pastikan docs/demo/backend.js tidak lapuk
```

Ujian backend meliputi aliran penuh, pemisahan tugas, kawalan peranan, tempahan bertindih, pemandu bertindih, had 60 hari, had pemulangan, tamat tempoh, formula injection, muat naik fail, audit, retensi, rate limit dan pengesahan emel.

**Apa yang tiruan tidak dapat sahkan** (uji di Google sebenar semasa cubaan):

- Tingkah laku CORS sebenar dari GitHub Pages ke `script.google.com`. Corak `Content-Type: text/plain` yang digunakan ialah corak lazim untuk Apps Script, tetapi belum diuji di sini.
- Kelajuan log masuk. 500 pusingan hash dalam Apps Script belum diukur. Jika terasa lambat, kurangkan `PUSINGAN_HASH` dalam `Config.gs`.
- API perlindungan lembaran, pencetus berjadual, MailApp dan Drive. Semuanya diuji dengan tiruan sahaja.
- Latensi bacaan Sheets. Setiap permintaan membaca lembaran berkaitan. Untuk lebih kurang 130 permohonan sebulan ia sepatutnya cukup, tetapi anggaran ini belum diukur.

## Had dan perkara yang perlu anda tahu

- **Akaun Google pemilik skrip ialah titik paling kritikal.** Sesiapa yang menguasai akaun itu boleh membaca dan mengubah semua data, termasuk Audit. Hidupkan 2-Step Verification dan guna akaun khusus untuk sistem ini.
- **Audit log tidak benar-benar tidak boleh diubah.** Kod tidak mempunyai laluan untuk mengubahnya dan lembaran dilindungi, tetapi pemilik Sheet masih boleh menyuntingnya secara manual. Ia memberi jejak audit yang munasabah, bukan bukti kebal sabotaj. Untuk jaminan lebih kuat, eksport berkala ke lokasi lain.
- **Padam retensi** memadam permohonan, versi, keputusan, tempahan dan dokumen yang sudah ditutup selepas tempoh simpan, tetapi tidak memadam baris Audit. Baris Audit mengandungi salinan data permohonan. Tentukan polisi retensi audit anda sendiri dan padam manual jika perlu.
- **Kuota emel:** MailApp had harian terhad (sekitar 100 penerima untuk Gmail biasa, lebih tinggi untuk Workspace; semak dokumentasi Google semasa). Anggaran 30 permohonan seminggu dengan 4 hingga 5 emel setiap satu masih dalam had.
- **Had percubaan** berdasarkan emel kerana Apps Script tidak memberi alamat IP. Orang jahat boleh sengaja menyekat log masuk satu emel selama 5 minit. Ini kompromi yang diterima.
- **Konkurensi:** semua penulisan guna `LockService`, jadi dua pelulus yang meluluskan serentak tidak boleh menempah kenderaan yang sama. Penulisan serentak banyak akan beratur (maksimum 25 saat menunggu).
- **Lokasi data:** Google Sheets dan Drive mungkin menyimpan data di luar Malaysia. Semak dengan pihak IT atau pematuhan organisasi sama ada ini dibenarkan untuk data staf, dan sama ada Pegawai Perlindungan Data perlu dilantik.
- **Sesi 6 jam** dan token disimpan dalam `sessionStorage` (hilang bila tab ditutup). CacheService boleh membuang kunci lebih awal; pengguna hanya perlu log masuk semula.
- **Dokumen** maksimum 3MB setiap fail dan 10 fail setiap permohonan, kerana fail dihantar sebagai base64 melalui Web App.
- Tiada kalendar servis kenderaan. Nyahaktifkan kenderaan di Pentadbiran untuk menghalang tempahan baharu.
