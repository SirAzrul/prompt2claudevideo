# Sistem Tempahan Kenderaan Pusat

Permohonan van, Hilux dan bas untuk staf dalaman. Pemohon hantar permohonan dan dapat nombor rujukan. Penyemak semak maklumat dan dokumen, kemudian pulangkan untuk pembetulan atau hantar kepada pelulus. Pelulus luluskan atau tolak (justifikasi wajib). Setiap tindakan masuk audit log.

Stack: Supabase (Postgres, Auth, Storage, Edge Function) + frontend statik (vanilla JS, tiada build) di Netlify.

## Aliran

```
Draf → Dihantar → Dalam semakan ⇄ Dipulangkan (pemohon betulkan, hantar semula)
                       ↓
              Menunggu kelulusan → Diluluskan → Selesai
                       ↓                ↓
                   Ditolak          Dibatalkan
```

Peraturan yang dikuatkuasakan di database (bukan di UI sahaja):

- Pemohon, penyemak dan pelulus mesti orang berbeza untuk satu permohonan. Setiap pengguna hanya ada satu peranan.
- Kenderaan dan pemandu tidak boleh bertindih masa (exclusion constraint). Slot dikunci bila permohonan diluluskan.
- Bas wajib pemandu. Kapasiti kenderaan mesti cukup untuk bilangan penumpang.
- Tempahan maksimum 60 hari ke hadapan, tarikh mula mesti pada masa hadapan.
- Pemulangan: maksimum 3 kali, pemohon ada 7 hari untuk betulkan, selepas itu status Tamat tempoh.
- Pembatalan selepas lulus: sehingga 24 jam sebelum perjalanan (admin boleh pada bila-bila masa).
- Penolakan: justifikasi sekurang-kurangnya 10 aksara.
- Audit log hanya boleh ditambah. UPDATE, DELETE dan TRUNCATE ditolak oleh trigger, termasuk untuk superuser.
- Semua perubahan status melalui fungsi RPC. Pengguna tiada hak INSERT/UPDATE terus pada jadual permohonan, tempahan dan keputusan.

Nilai 60 hari, 7 hari, 3 kali dan 24 jam boleh diubah oleh admin di halaman Pentadbiran > Tetapan.

## Struktur

```
supabase/migrations/001_skema.sql   skema, RLS, audit, fungsi aliran kerja
supabase/seed.sql                   kenderaan dan pemandu awal (ganti no. plat)
supabase/functions/hantar-emel/     Edge Function emel notifikasi
web/                                frontend statik (diterbitkan oleh Netlify)
scripts/gen-config.mjs              jana web/config.js daripada env var semasa build
test/                               ujian database dan UI (lihat bawah)
netlify.toml
```

## Persediaan

### 1. Supabase

1. Cipta projek di supabase.com. Pilih region ikut polisi lokasi data organisasi anda. Semak dengan pihak IT.
2. SQL Editor: jalankan `supabase/migrations/001_skema.sql`, kemudian `supabase/seed.sql` (edit no. plat dan kapasiti dahulu).
3. Authentication > Providers > Email: hidupkan. Tetapkan sama ada emel perlu disahkan (disyorkan).
4. Authentication > URL Configuration: letak URL Netlify anda sebagai Site URL.
5. Sekatan domain: di aplikasi, Pentadbiran > Tetapan > "Domain emel dibenarkan" (cth `organisasi.gov.my`). Pendaftaran dari domain lain akan ditolak oleh database. Tetapkan ini SEBELUM kongsi pautan kepada staf. Nilai awal kosong bermakna semua domain boleh daftar.
6. Daftar akaun pertama anda melalui aplikasi, kemudian jadikan diri admin di SQL Editor:

   ```sql
   update profiles set peranan = 'admin' where emel = 'emel-anda@organisasi.my';
   ```

   Selepas itu admin boleh tetapkan peranan penyemak dan pelulus untuk pengguna lain di Pentadbiran > Pengguna.

### 2. Emel notifikasi

Emel dihantar pada 5 titik: permohonan diterima, tugasan penyemak, dipulangkan, tugasan pelulus, keputusan akhir (serta pembatalan dan tamat tempoh).

```bash
supabase functions deploy hantar-emel --no-verify-jwt
supabase secrets set WEBHOOK_SECRET=<rentetan rawak panjang> \
  RESEND_API_KEY=<kunci resend> \
  EMEL_PENGHANTAR="Tempahan Kenderaan <tempahan@domain-anda.my>" \
  APP_URL=https://nama-site-anda.netlify.app
```

Kemudian di dashboard: Database > Webhooks > Create. Jadual `public.notifikasi`, event INSERT, jenis Supabase Edge Functions, fungsi `hantar-emel`, tambah header `x-webhook-secret` dengan nilai `WEBHOOK_SECRET` yang sama.

Domain penghantar perlu disahkan di Resend. Anda boleh tukar `hantar()` dalam `index.ts` kepada SMTP organisasi jika perlu. Kegagalan hantar disimpan dalam lajur `notifikasi.ralat`.

### 3. Tutup permohonan luput

Fungsi `tutup_permohonan_luput()` menukar permohonan dipulangkan yang melepasi tempoh kepada Tamat tempoh, dan permohonan lulus yang sudah lalu kepada Selesai. Jadualkan dengan pg_cron (aktifkan di Database > Extensions):

```sql
select cron.schedule('tutup-luput', '0 * * * *', $$select public.tutup_permohonan_luput()$$);
```

### 4. GitHub dan Netlify

1. Push repo ke GitHub (private disyorkan).
2. Netlify > Add new site > Import from Git. **Base directory: `tempahan-kenderaan`**. Build command dan publish directory dibaca daripada `netlify.toml`.
3. Site settings > Environment variables:
   - `SUPABASE_URL`: Project URL
   - `SUPABASE_ANON_KEY`: anon (public) key
4. Deploy.

**Jangan** letak `service_role` key dalam Netlify, frontend atau repo. Skrip build akan menolak jika kelihatan seperti service_role key. Anon key memang kelihatan di browser, dan data dilindungi oleh RLS.

Pembangunan tempatan: salin `web/config.example.js` kepada `web/config.js`, isi nilai, kemudian hidangkan folder `web/` dengan mana-mana pelayan statik (cth `npx serve web`).

## Ujian

Ujian database perlukan PostgreSQL tempatan. `test/mock_supabase.sql` meniru skema `auth` dan `storage` Supabase.

```bash
test/jalan.sh          # bina semula pangkalan data ujian, jalankan 35 semakan aliran kerja dan RLS
node test/uji_ui.mjs pelulus menunggu_kelulusan   # asap UI dengan klien Supabase palsu (perlukan Playwright)
```

Ujian ini belum menggantikan ujian pada projek Supabase sebenar. Yang belum diuji secara automatik: Edge Function emel, polisi storage `storage.objects` (hanya dipasang, tidak dilaksanakan dalam tiruan), dan integrasi sebenar dengan Supabase Auth.

## Had semasa

- Satu peranan bagi setiap pengguna, satu peringkat kelulusan.
- Tiada blok masa servis kenderaan. Nyahaktifkan kenderaan di Pentadbiran untuk menghalang tempahan baharu.
- Tiada rekod selepas perjalanan (odometer, kerosakan). Dirancang untuk fasa kedua.
- Pemandu bukan pengguna sistem, jadi tidak menerima emel.
- Jika tiada penyemak atau pelulus aktif, permohonan akan tergantung. Pastikan sekurang-kurangnya seorang penyemak dan seorang pelulus aktif sentiasa ada.
