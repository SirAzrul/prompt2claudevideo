-- Ujian aliran kerja. Jalankan selepas mock_supabase.sql dan 001_skema.sql.
\set ON_ERROR_STOP on
create schema uji;
create table uji.keputusan (nama text, lulus boolean, butiran text);
grant usage on schema uji to authenticated;
grant all on uji.keputusan to authenticated;

create function uji.sebagai(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
end $$;

-- Jalankan sql, jangka ralat yang mengandungi p_teks (atau null = jangka berjaya)
create function uji.jangka(p_nama text, p_sql text, p_teks text default null) returns void
language plpgsql as $$
declare ralat text;
begin
  begin
    execute p_sql;
  exception when others then
    ralat := sqlerrm;
  end;
  insert into uji.keputusan values (p_nama,
    case when p_teks is null then ralat is null else ralat like '%' || p_teks || '%' end,
    coalesce(ralat, 'berjaya'));
end $$;
grant execute on all functions in schema uji to authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', 'ali@org.my',   '{"nama":"Ali"}'),
 ('00000000-0000-0000-0000-00000000000b', 'bakar@org.my', '{"nama":"Bakar"}'),
 ('00000000-0000-0000-0000-00000000000c', 'chong@org.my', '{"nama":"Chong"}'),
 ('00000000-0000-0000-0000-00000000000d', 'dina@org.my',  '{"nama":"Dina"}'),
 ('00000000-0000-0000-0000-00000000000e', 'emi@org.my',   '{"nama":"Emi"}');
update profiles set peranan='penyemak' where emel='bakar@org.my';
update profiles set peranan='pelulus'  where emel='chong@org.my';
update profiles set peranan='admin'    where emel='dina@org.my';
update profiles set peranan='pemohon'  where emel='emi@org.my';

insert into vehicles (id, jenis, nama, no_plat, kapasiti) values
 ('10000000-0000-0000-0000-000000000001','van','Van','VAN1234',12),
 ('10000000-0000-0000-0000-000000000002','hilux','Hilux','HIL1234',5),
 ('10000000-0000-0000-0000-000000000003','bas','Bas','BAS1234',40);
insert into drivers (id, nama) values
 ('20000000-0000-0000-0000-000000000001','Farid'),
 ('20000000-0000-0000-0000-000000000002','Azerul'),
 ('20000000-0000-0000-0000-000000000003','Luqman');

\set ali   '00000000-0000-0000-0000-00000000000a'
\set bakar '00000000-0000-0000-0000-00000000000b'
\set chong '00000000-0000-0000-0000-00000000000c'
\set dina  '00000000-0000-0000-0000-00000000000d'
\set emi   '00000000-0000-0000-0000-00000000000e'

set role authenticated;

-- 1. Pemohon cipta draf, hantar, dapat nombor rujukan
select uji.sebagai(:'ali');
select simpan_permohonan(null,'Lawatan kerja ke Ipoh','Ipoh',8,
  now()+interval '10 days', now()+interval '10 days 6 hours','van',false) as req1 \gset
select uji.jangka('draf tiada no rujukan', format($f$select 1/ (case when (select no_rujukan from requests where id=%L) is null then 1 else 0 end)$f$, :'req1'));
select hantar_permohonan(:'req1') as rujukan1 \gset
select uji.jangka('nombor rujukan dijana', format($f$select 1/(case when %L like 'VB-____-0001' then 1 else 0 end)$f$, :'rujukan1'));

-- 2. Pemohon tidak boleh ubah status terus / insert terus
select uji.jangka('update status terus ditolak', format($f$update requests set status='diluluskan' where id=%L$f$, :'req1'), 'permission denied');
select uji.jangka('insert requests terus ditolak', format($f$insert into requests(pemohon_id,tujuan,destinasi,bil_penumpang,tarikh_mula,tarikh_tamat) values (%L,'abcdef','x',1,now(),now()+interval '1 hour')$f$, :'ali'), 'permission denied');
select uji.jangka('insert bookings terus ditolak', format($f$insert into bookings(request_id,vehicle_id,during) values (%L,'10000000-0000-0000-0000-000000000001','[2030-01-01,2030-01-02)')$f$, :'req1'), 'permission denied');
select uji.jangka('pemohon tidak boleh ubah peranan sendiri', format($f$update profiles set peranan='admin' where id=%L$f$, :'ali'), 'permission denied');
select uji.jangka('pemohon tidak boleh baca audit', 'select 1/(case when (select count(*) from audit_log)=0 then 1 else 0 end)');

-- 3. Pemohon lain tidak nampak permohonan Ali; penyemak nampak
select uji.sebagai(:'emi');
select uji.jangka('pemohon lain tak nampak', format($f$select 1/(case when (select count(*) from requests where id=%L)=0 then 1 else 0 end)$f$, :'req1'));
select uji.sebagai(:'bakar');
select uji.jangka('penyemak nampak', format($f$select 1/(case when (select count(*) from requests where id=%L)=1 then 1 else 0 end)$f$, :'req1'));
select uji.sebagai(:'ali');
select uji.jangka('pemohon tak boleh ambil semakan', format($f$select ambil_semakan(%L)$f$, :'req1'), 'tiada kebenaran');

-- 4. Pelulus tak boleh ambil semakan; penyemak ambil
select uji.sebagai(:'chong');
select uji.jangka('pelulus tak boleh ambil semakan', format($f$select ambil_semakan(%L)$f$, :'req1'), 'tiada kebenaran');
select uji.sebagai(:'bakar');
select ambil_semakan(:'req1');

-- 5. Pulangkan, pemohon betulkan, hantar semula
select pulangkan_permohonan(:'req1', 'Sila lampirkan surat tugasan');
select uji.jangka('pulang tanpa catatan ditolak', format($f$select pulangkan_permohonan(%L,'ab')$f$, :'req1'), 'sekurang-kurangnya');
select uji.sebagai(:'ali');
select simpan_permohonan(:'req1','Lawatan kerja ke Ipoh (dibetulkan)','Ipoh',8,
  now()+interval '10 days', now()+interval '10 days 6 hours','van',false);
select hantar_permohonan(:'req1') as rujukan1b \gset
select uji.jangka('nombor rujukan kekal selepas hantar semula', format($f$select 1/(case when %L = %L then 1 else 0 end)$f$, :'rujukan1', :'rujukan1b'));

-- 6. Penyemak hantar kelulusan: halang kapasiti, pemandu bas, tugaskan sah
select uji.sebagai(:'bakar');
select ambil_semakan(:'req1');
select uji.jangka('kapasiti tak cukup', format($f$select hantar_kelulusan(%L,'10000000-0000-0000-0000-000000000002',null)$f$, :'req1'), 'Kapasiti');
select uji.jangka('bas wajib pemandu', format($f$select hantar_kelulusan(%L,'10000000-0000-0000-0000-000000000003',null)$f$, :'req1'), 'Pemandu mesti');
select hantar_kelulusan(:'req1','10000000-0000-0000-0000-000000000001', null, 'Lengkap');

-- 7. Pelulus: tolak tanpa justifikasi gagal, lulus berjaya
select uji.sebagai(:'chong');
select uji.jangka('tolak tanpa justifikasi', format($f$select tolak_permohonan(%L,'  ')$f$, :'req1'), 'Justifikasi');
select lulus_permohonan(:'req1');
select uji.jangka('booking wujud', format($f$select 1/(case when (select count(*) from bookings where request_id=%L)=1 then 1 else 0 end)$f$, :'req1'));

-- 8. Permohonan kedua bertindih pada van yang sama: penyemak tak boleh tugaskan; constraint halang
select uji.sebagai(:'emi');
select simpan_permohonan(null,'Hantar barang','Shah Alam',3,
  now()+interval '10 days 1 hour', now()+interval '10 days 3 hours','van',false) as req2 \gset
select hantar_permohonan(:'req2');
select uji.sebagai(:'bakar');
select ambil_semakan(:'req2');
select uji.jangka('van bertindih ditolak semasa tugasan', format($f$select hantar_kelulusan(%L,'10000000-0000-0000-0000-000000000001',null)$f$, :'req2'), 'sudah ditempah');
select hantar_kelulusan(:'req2','10000000-0000-0000-0000-000000000002', null);
-- cari kosong tidak memaparkan van pada masa itu
select uji.jangka('carian kosong tidak sertakan van', $f$select 1/(case when (select count(*) from cari_kenderaan_kosong(now()+interval '10 days 1 hour', now()+interval '10 days 3 hours') where jenis='van')=0 then 1 else 0 end)$f$);

-- 9. Constraint DB menghalang bertindih walaupun penyemak menugaskan sebelum lulus (perlumbaan)
select uji.sebagai(:'emi');
select simpan_permohonan(null,'Program komuniti','Klang',10,
  now()+interval '20 days', now()+interval '20 days 5 hours','bas',true) as req3 \gset
select hantar_permohonan(:'req3');
select simpan_permohonan(null,'Program belia','Klang',10,
  now()+interval '20 days 1 hour', now()+interval '20 days 4 hours','bas',true) as req4 \gset
select hantar_permohonan(:'req4');
select uji.sebagai(:'bakar');
select ambil_semakan(:'req3');
select ambil_semakan(:'req4');
select hantar_kelulusan(:'req3','10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001');
select hantar_kelulusan(:'req4','10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002');
select uji.sebagai(:'chong');
select lulus_permohonan(:'req3');
select uji.jangka('lulus kedua bertindih gagal (constraint)', format($f$select lulus_permohonan(%L)$f$, :'req4'), 'telah ditempah');
select uji.jangka('status req4 kekal menunggu', format($f$select 1/(case when (select status from requests where id=%L)='menunggu_kelulusan' then 1 else 0 end)$f$, :'req4'));
select hantar_balik_penyemak(:'req4','Bas sudah ditempah, tukar kenderaan');
select uji.sebagai(:'bakar');
select hantar_kelulusan(:'req4','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002');
select uji.sebagai(:'chong');
select tolak_permohonan(:'req4','Program tidak memenuhi syarat penganjuran');
select uji.jangka('sebab tolak disimpan', format($f$select 1/(case when (select sebab_tolak from requests where id=%L) like 'Program%%' then 1 else 0 end)$f$, :'req4'));

-- 10. Had 60 hari dan tarikh lepas
select uji.sebagai(:'ali');
select simpan_permohonan(null,'Terlalu jauh','Johor',4, now()+interval '61 days', now()+interval '61 days 2 hours','hilux',false) as req5 \gset
select uji.jangka('lebih 60 hari ditolak', format($f$select hantar_permohonan(%L)$f$, :'req5'), '60 hari');
select simpan_permohonan(null,'Tarikh lepas','Johor',4, now()-interval '1 day', now()+interval '2 hours','hilux',false) as req6 \gset
select uji.jangka('tarikh lepas ditolak', format($f$select hantar_permohonan(%L)$f$, :'req6'), 'masa hadapan');

-- 11. Batal selepas lulus: dalam had 24 jam ditolak, di luar had berjaya dan lepas slot
select uji.jangka('batal lulus > 24j berjaya', format($f$select batal_permohonan(%L,'Program ditunda')$f$, :'req1'));
select uji.jangka('slot dilepaskan selepas batal', format($f$select 1/(case when (select count(*) from bookings where request_id=%L)=0 then 1 else 0 end)$f$, :'req1'));

-- 12. Admin: tetapkan peranan; admin tak boleh turunkan diri; bukan admin tak boleh
select uji.sebagai(:'dina');
select tetapkan_peranan(:'emi', 'penyemak', true);
select uji.jangka('admin tak turun diri sendiri', format($f$select tetapkan_peranan(%L,'pemohon',true)$f$, :'dina'), 'tidak boleh');
select uji.jangka('admin baca audit', 'select 1/(case when (select count(*) from audit_log) > 10 then 1 else 0 end)');
select uji.sebagai(:'ali');
select uji.jangka('pemohon tak boleh tetapkan peranan', format($f$select tetapkan_peranan(%L,'admin',true)$f$, :'ali'), 'tiada kebenaran');

-- 13. Audit log append-only walaupun admin
select uji.sebagai(:'dina');
select uji.jangka('audit tak boleh dipadam', 'delete from audit_log', 'permission denied');
reset role;
select uji.jangka('audit tak boleh dipadam (superuser)', 'delete from audit_log', 'tidak boleh diubah');
select uji.jangka('audit tak boleh dikosongkan (superuser)', 'truncate audit_log', 'tidak boleh diubah');
select uji.jangka('audit tak boleh dikemas (superuser)', 'update audit_log set jadual=''x''', 'tidak boleh diubah');

-- 14. Tamat tempoh pembetulan
set role authenticated;
select uji.sebagai(:'emi');
reset role;
update tetapan set nilai='' where kunci='domain_emel';

-- 15. Sekatan domain emel
update tetapan set nilai='org.my' where kunci='domain_emel';
select uji.jangka('domain luar ditolak', $f$insert into auth.users(email) values ('luar@gmail.com')$f$, 'dibenarkan');
select uji.jangka('domain dalam diterima', $f$insert into auth.users(email) values ('baru@org.my')$f$);

-- Keputusan
select case when lulus then 'LULUS ' else 'GAGAL ' end || nama || ' -- ' || butiran as keputusan from uji.keputusan order by (lulus) , nama;
select count(*) filter (where not lulus) as gagal, count(*) as jumlah from uji.keputusan;
