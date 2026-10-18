-- Sistem Tempahan Kenderaan Pusat
-- Skema, RLS, audit log dan fungsi aliran kerja.
-- Semua perubahan status berlaku melalui fungsi RPC di bawah; pengguna tidak
-- boleh INSERT/UPDATE terus ke jadual requests, bookings atau decisions.

create extension if not exists btree_gist;

-- ---------------------------------------------------------------- jenis data
create type peranan_t as enum ('pemohon', 'penyemak', 'pelulus', 'admin');
create type jenis_kenderaan_t as enum ('van', 'hilux', 'bas');
create type status_t as enum (
  'draf', 'dihantar', 'dalam_semakan', 'dipulangkan', 'menunggu_kelulusan',
  'diluluskan', 'ditolak', 'dibatalkan', 'tamat_tempoh', 'selesai'
);

-- ------------------------------------------------------------------ tetapan
create table tetapan (
  kunci text primary key,
  nilai text not null
);
insert into tetapan (kunci, nilai) values
  ('domain_emel', ''),              -- cth: organisasi.gov.my ; kosong = tiada sekatan domain
  ('had_hari_tempahan', '60'),      -- tempah paling jauh N hari ke hadapan
  ('tempoh_pembetulan_hari', '7'),  -- masa pemohon untuk betulkan permohonan yang dipulangkan
  ('had_pemulangan', '3'),          -- bilangan maksimum permohonan boleh dipulangkan
  ('had_batal_jam', '24');          -- pemohon boleh batal permohonan lulus sehingga N jam sebelum mula

create function tetapan_nilai(p_kunci text) returns text
language sql stable security definer set search_path = public as $$
  select nilai from tetapan where kunci = p_kunci
$$;

-- ----------------------------------------------------------------- pengguna
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  emel text not null,
  nama text not null,
  jabatan text,
  no_telefon text,
  peranan peranan_t not null default 'pemohon',
  aktif boolean not null default true,
  created_at timestamptz not null default now()
);

create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d text := lower(coalesce(tetapan_nilai('domain_emel'), ''));
begin
  if d <> '' and lower(split_part(new.email, '@', 2)) <> d then
    raise exception 'Hanya emel @% dibenarkan mendaftar', d;
  end if;
  insert into profiles (id, emel, nama, jabatan, no_telefon)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nama'), ''), split_part(new.email, '@', 1)),
    nullif(trim(new.raw_user_meta_data ->> 'jabatan'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'no_telefon'), '')
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create function peranan_semasa() returns peranan_t
language sql stable security definer set search_path = public as $$
  select peranan from profiles where id = auth.uid() and aktif
$$;

create function adalah_staf() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(peranan_semasa() in ('penyemak', 'pelulus', 'admin'), false)
$$;

-- --------------------------------------------------- kenderaan dan pemandu
create table vehicles (
  id uuid primary key default gen_random_uuid(),
  jenis jenis_kenderaan_t not null,
  nama text not null,
  no_plat text not null unique,
  kapasiti int not null check (kapasiti > 0),
  aktif boolean not null default true,
  catatan text
);

create table drivers (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  no_telefon text,
  aktif boolean not null default true
);

-- ------------------------------------------------------------- permohonan
create table requests (
  id uuid primary key default gen_random_uuid(),
  no_rujukan text unique,
  pemohon_id uuid not null references profiles (id),
  tujuan text not null check (length(trim(tujuan)) >= 5),
  destinasi text not null check (length(trim(destinasi)) >= 2),
  bil_penumpang int not null check (bil_penumpang between 1 and 100),
  tarikh_mula timestamptz not null,
  tarikh_tamat timestamptz not null,
  jenis_diminta jenis_kenderaan_t,
  perlu_pemandu boolean not null default false,
  vehicle_id uuid references vehicles (id),
  driver_id uuid references drivers (id),
  status status_t not null default 'draf',
  bil_penghantaran int not null default 0,
  bil_pulang int not null default 0,
  tarikh_akhir_pembetulan timestamptz,
  penyemak_id uuid references profiles (id),
  pelulus_id uuid references profiles (id),
  catatan_semakan text,
  sebab_tolak text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tarikh_tamat > tarikh_mula)
);
create index requests_pemohon_idx on requests (pemohon_id);
create index requests_status_idx on requests (status);

create table request_versions (
  id bigint generated always as identity primary key,
  request_id uuid not null references requests (id),
  versi int not null,
  data jsonb not null,
  masa timestamptz not null default now(),
  unique (request_id, versi)
);

create table decisions (
  id bigint generated always as identity primary key,
  request_id uuid not null references requests (id),
  oleh uuid references profiles (id),
  keputusan text not null check (keputusan in (
    'hantar', 'pulang', 'semak_lengkap', 'lulus', 'tolak', 'hantar_balik', 'batal', 'tamat_tempoh'
  )),
  justifikasi text,
  masa timestamptz not null default now()
);

-- Tempahan yang disahkan. Constraint di bawah menghalang kenderaan atau
-- pemandu yang sama ditempah pada masa bertindih, walaupun dua pelulus
-- meluluskan serentak.
create table bookings (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references requests (id),
  vehicle_id uuid not null references vehicles (id),
  driver_id uuid references drivers (id),
  during tstzrange not null,
  constraint kenderaan_tak_bertindih exclude using gist (vehicle_id with =, during with &&),
  constraint pemandu_tak_bertindih exclude using gist (driver_id with =, during with &&)
    where (driver_id is not null)
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests (id),
  nama_fail text not null,
  path text not null unique,
  saiz int,
  dimuat_naik timestamptz not null default now()
);

create table rujukan_kaunter (
  tahun int primary key,
  nombor int not null default 0
);

create table notifikasi (
  id bigint generated always as identity primary key,
  request_id uuid not null references requests (id),
  jenis text not null,
  dicipta timestamptz not null default now(),
  dihantar_pada timestamptz,
  ralat text
);

-- ------------------------------------------------------------- audit log
create table audit_log (
  id bigint generated always as identity primary key,
  masa timestamptz not null default now(),
  pengguna_id uuid,
  jadual text not null,
  rekod_id text,
  tindakan text not null,
  sebelum jsonb,
  selepas jsonb
);

create function audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  baris jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into audit_log (pengguna_id, jadual, rekod_id, tindakan, sebelum, selepas)
  values (
    auth.uid(),
    tg_table_name,
    coalesce(baris ->> 'id', baris ->> 'kunci'),
    coalesce(nullif(current_setting('app.tindakan', true), ''), tg_op),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return null;
end $$;

create function audit_tegah() returns trigger
language plpgsql as $$
begin
  raise exception 'Audit log tidak boleh diubah atau dipadam';
end $$;

create trigger audit_log_tiada_ubah before update or delete on audit_log
  for each row execute function audit_tegah();
create trigger audit_log_tiada_kosong before truncate on audit_log
  for each statement execute function audit_tegah();

create trigger audit_requests after insert or update or delete on requests
  for each row execute function audit_trigger();
create trigger audit_bookings after insert or update or delete on bookings
  for each row execute function audit_trigger();
create trigger audit_decisions after insert or update or delete on decisions
  for each row execute function audit_trigger();
create trigger audit_documents after insert or update or delete on documents
  for each row execute function audit_trigger();
create trigger audit_vehicles after insert or update or delete on vehicles
  for each row execute function audit_trigger();
create trigger audit_drivers after insert or update or delete on drivers
  for each row execute function audit_trigger();
create trigger audit_profiles after insert or update or delete on profiles
  for each row execute function audit_trigger();
create trigger audit_tetapan after insert or update or delete on tetapan
  for each row execute function audit_trigger();

create function kemas_masa() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger requests_kemas_masa before update on requests
  for each row execute function kemas_masa();

-- -------------------------------------------------------- fungsi dalaman
-- Dipanggil oleh fungsi RPC sahaja (tidak diberi kepada pengguna).
create function _mula(p_tindakan text, p_peranan peranan_t[] default null) returns profiles
language plpgsql security definer set search_path = public as $$
declare
  p profiles;
begin
  select * into p from profiles where id = auth.uid() and aktif;
  if not found then
    raise exception 'Akses ditolak. Sila log masuk semula';
  end if;
  if p_peranan is not null and not (p.peranan = any (p_peranan)) then
    raise exception 'Anda tiada kebenaran untuk tindakan ini';
  end if;
  perform set_config('app.tindakan', p_tindakan, true);
  return p;
end $$;

create function _catat(p_req uuid, p_oleh uuid, p_keputusan text, p_justifikasi text default null)
returns void language sql security definer set search_path = public as $$
  insert into decisions (request_id, oleh, keputusan, justifikasi)
  values (p_req, p_oleh, p_keputusan, nullif(trim(p_justifikasi), ''))
$$;

create function _notif(p_req uuid, p_jenis text) returns void
language sql security definer set search_path = public as $$
  insert into notifikasi (request_id, jenis) values (p_req, p_jenis)
$$;

create function _sahkan_tarikh(p_mula timestamptz, p_tamat timestamptz, p_masa_depan boolean)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  had int := coalesce(tetapan_nilai('had_hari_tempahan')::int, 60);
begin
  if p_tamat <= p_mula then
    raise exception 'Tarikh tamat mesti selepas tarikh mula';
  end if;
  if p_masa_depan then
    if p_mula <= now() then
      raise exception 'Tarikh mula mesti pada masa hadapan';
    end if;
    if p_mula > now() + make_interval(days => had) then
      raise exception 'Tempahan tidak boleh melebihi % hari ke hadapan', had;
    end if;
  end if;
end $$;

create function _jana_rujukan() returns text
language plpgsql security definer set search_path = public as $$
declare
  t int := extract(year from (now() at time zone 'Asia/Kuala_Lumpur'))::int;
  n int;
begin
  insert into rujukan_kaunter (tahun, nombor) values (t, 1)
  on conflict (tahun) do update set nombor = rujukan_kaunter.nombor + 1
  returning nombor into n;
  return 'VB-' || t || '-' || lpad(n::text, 4, '0');
end $$;

-- ------------------------------------------------------- RPC: pemohon
create function simpan_permohonan(
  p_id uuid, p_tujuan text, p_destinasi text, p_bil int,
  p_mula timestamptz, p_tamat timestamptz,
  p_jenis jenis_kenderaan_t, p_pemandu boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  u profiles := _mula('simpan_draf');
  r requests;
  v_id uuid;
begin
  perform _sahkan_tarikh(p_mula, p_tamat, false);
  if p_id is null then
    insert into requests (pemohon_id, tujuan, destinasi, bil_penumpang, tarikh_mula, tarikh_tamat, jenis_diminta, perlu_pemandu)
    values (u.id, trim(p_tujuan), trim(p_destinasi), p_bil, p_mula, p_tamat, p_jenis, coalesce(p_pemandu, false))
    returning id into v_id;
  else
    select * into r from requests where id = p_id for update;
    if not found or r.pemohon_id <> u.id then
      raise exception 'Permohonan tidak ditemui';
    end if;
    if r.status not in ('draf', 'dipulangkan') then
      raise exception 'Permohonan tidak boleh diubah pada status ini';
    end if;
    update requests set
      tujuan = trim(p_tujuan), destinasi = trim(p_destinasi), bil_penumpang = p_bil,
      tarikh_mula = p_mula, tarikh_tamat = p_tamat, jenis_diminta = p_jenis,
      perlu_pemandu = coalesce(p_pemandu, false)
    where id = p_id;
    v_id := p_id;
  end if;
  return v_id;
end $$;

create function hantar_permohonan(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  u profiles := _mula('hantar');
  r requests;
  versi int;
  tarikh_baharu boolean;
begin
  select * into r from requests where id = p_id for update;
  if not found or r.pemohon_id <> u.id then
    raise exception 'Permohonan tidak ditemui';
  end if;
  if r.status not in ('draf', 'dipulangkan') then
    raise exception 'Permohonan tidak boleh dihantar pada status ini';
  end if;
  if r.status = 'dipulangkan' and now() > r.tarikh_akhir_pembetulan then
    raise exception 'Tempoh pembetulan telah tamat';
  end if;
  perform _sahkan_tarikh(r.tarikh_mula, r.tarikh_tamat, true);

  tarikh_baharu := r.no_rujukan is null;
  versi := r.bil_penghantaran + 1;
  update requests set
    status = 'dihantar',
    bil_penghantaran = versi,
    no_rujukan = coalesce(no_rujukan, _jana_rujukan()),
    tarikh_akhir_pembetulan = null
  where id = p_id
  returning * into r;

  insert into request_versions (request_id, versi, data)
  values (p_id, versi, jsonb_build_object(
    'tujuan', r.tujuan, 'destinasi', r.destinasi, 'bil_penumpang', r.bil_penumpang,
    'tarikh_mula', r.tarikh_mula, 'tarikh_tamat', r.tarikh_tamat,
    'jenis_diminta', r.jenis_diminta, 'perlu_pemandu', r.perlu_pemandu));

  perform _catat(p_id, u.id, 'hantar');
  if tarikh_baharu then
    perform _notif(p_id, 'diterima');
  end if;
  perform _notif(p_id, 'tugasan_penyemak');
  return r.no_rujukan;
end $$;

create function batal_permohonan(p_id uuid, p_sebab text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  u profiles := _mula('batal');
  r requests;
  had int := coalesce(tetapan_nilai('had_batal_jam')::int, 24);
begin
  select * into r from requests where id = p_id for update;
  if not found or (r.pemohon_id <> u.id and u.peranan <> 'admin') then
    raise exception 'Permohonan tidak ditemui';
  end if;
  if r.status in ('ditolak', 'dibatalkan', 'tamat_tempoh', 'selesai') then
    raise exception 'Permohonan tidak boleh dibatalkan pada status ini';
  end if;
  if r.status = 'diluluskan' and u.peranan <> 'admin'
     and r.tarikh_mula - now() < make_interval(hours => had) then
    raise exception 'Pembatalan selepas lulus mesti dibuat sekurang-kurangnya % jam sebelum perjalanan. Sila hubungi admin', had;
  end if;
  delete from bookings where request_id = p_id;
  update requests set status = 'dibatalkan' where id = p_id;
  perform _catat(p_id, u.id, 'batal', p_sebab);
  perform _notif(p_id, 'dibatalkan');
end $$;

-- ------------------------------------------------------ RPC: penyemak
create function ambil_semakan(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  u profiles := _mula('ambil_semakan', array['penyemak']::peranan_t[]);
  r requests;
begin
  select * into r from requests where id = p_id for update;
  if not found or r.status <> 'dihantar' then
    raise exception 'Permohonan tidak berada dalam senarai tugasan';
  end if;
  if r.pemohon_id = u.id then
    raise exception 'Anda tidak boleh menyemak permohonan sendiri';
  end if;
  if r.penyemak_id is not null and r.penyemak_id <> u.id then
    raise exception 'Permohonan ini telah diambil penyemak lain';
  end if;
  update requests set status = 'dalam_semakan', penyemak_id = u.id where id = p_id;
end $$;

create function pulangkan_permohonan(p_id uuid, p_catatan text) returns void
language plpgsql security definer set search_path = public as $$
declare
  u profiles := _mula('pulang', array['penyemak']::peranan_t[]);
  r requests;
  had int := coalesce(tetapan_nilai('had_pemulangan')::int, 3);
  hari int := coalesce(tetapan_nilai('tempoh_pembetulan_hari')::int, 7);
begin
  if length(trim(coalesce(p_catatan, ''))) < 5 then
    raise exception 'Sila nyatakan apa yang perlu dibetulkan (sekurang-kurangnya 5 aksara)';
  end if;
  select * into r from requests where id = p_id for update;
  if not found or r.status <> 'dalam_semakan' or r.penyemak_id <> u.id then
    raise exception 'Permohonan tidak dalam semakan anda';
  end if;
  if r.bil_pulang >= had then
    raise exception 'Had pemulangan (%) telah dicapai. Sila hantar kepada pelulus untuk keputusan', had;
  end if;
  update requests set
    status = 'dipulangkan',
    bil_pulang = bil_pulang + 1,
    tarikh_akhir_pembetulan = now() + make_interval(days => hari),
    catatan_semakan = trim(p_catatan)
  where id = p_id;
  perform _catat(p_id, u.id, 'pulang', p_catatan);
  perform _notif(p_id, 'dipulangkan');
end $$;

create function hantar_kelulusan(p_id uuid, p_vehicle uuid, p_driver uuid, p_catatan text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  u profiles := _mula('semak_lengkap', array['penyemak']::peranan_t[]);
  r requests;
  v vehicles;
  d drivers;
  julat tstzrange;
begin
  select * into r from requests where id = p_id for update;
  if not found or r.status <> 'dalam_semakan' or r.penyemak_id <> u.id then
    raise exception 'Permohonan tidak dalam semakan anda';
  end if;
  select * into v from vehicles where id = p_vehicle and aktif;
  if not found then
    raise exception 'Sila pilih kenderaan yang aktif';
  end if;
  if v.kapasiti < r.bil_penumpang then
    raise exception 'Kapasiti % (%) kurang daripada bilangan penumpang (%)', v.nama, v.kapasiti, r.bil_penumpang;
  end if;
  if (v.jenis = 'bas' or r.perlu_pemandu) and p_driver is null then
    raise exception 'Pemandu mesti ditugaskan untuk tempahan ini';
  end if;
  if p_driver is not null then
    select * into d from drivers where id = p_driver and aktif;
    if not found then
      raise exception 'Sila pilih pemandu yang aktif';
    end if;
  end if;
  julat := tstzrange(r.tarikh_mula, r.tarikh_tamat, '[)');
  if exists (select 1 from bookings b where b.vehicle_id = p_vehicle and b.during && julat) then
    raise exception 'Kenderaan tersebut sudah ditempah pada masa ini';
  end if;
  if p_driver is not null
     and exists (select 1 from bookings b where b.driver_id = p_driver and b.during && julat) then
    raise exception 'Pemandu tersebut sudah ditugaskan pada masa ini';
  end if;
  update requests set
    status = 'menunggu_kelulusan', vehicle_id = p_vehicle, driver_id = p_driver,
    catatan_semakan = nullif(trim(p_catatan), '')
  where id = p_id;
  perform _catat(p_id, u.id, 'semak_lengkap', p_catatan);
  perform _notif(p_id, 'tugasan_pelulus');
end $$;

-- ------------------------------------------------------- RPC: pelulus
create function lulus_permohonan(p_id uuid, p_catatan text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  u profiles := _mula('lulus', array['pelulus']::peranan_t[]);
  r requests;
begin
  select * into r from requests where id = p_id for update;
  if not found or r.status <> 'menunggu_kelulusan' then
    raise exception 'Permohonan tidak menunggu kelulusan';
  end if;
  if r.pemohon_id = u.id or r.penyemak_id = u.id then
    raise exception 'Pelulus mesti orang yang berbeza daripada pemohon dan penyemak';
  end if;
  begin
    insert into bookings (request_id, vehicle_id, driver_id, during)
    values (p_id, r.vehicle_id, r.driver_id, tstzrange(r.tarikh_mula, r.tarikh_tamat, '[)'));
  exception when exclusion_violation then
    raise exception 'Kenderaan atau pemandu telah ditempah pada masa ini. Hantar balik kepada penyemak untuk tugasan semula';
  end;
  update requests set status = 'diluluskan', pelulus_id = u.id where id = p_id;
  perform _catat(p_id, u.id, 'lulus', p_catatan);
  perform _notif(p_id, 'keputusan');
end $$;

create function tolak_permohonan(p_id uuid, p_sebab text) returns void
language plpgsql security definer set search_path = public as $$
declare
  u profiles := _mula('tolak', array['pelulus']::peranan_t[]);
  r requests;
begin
  if length(trim(coalesce(p_sebab, ''))) < 10 then
    raise exception 'Justifikasi penolakan wajib diisi (sekurang-kurangnya 10 aksara)';
  end if;
  select * into r from requests where id = p_id for update;
  if not found or r.status <> 'menunggu_kelulusan' then
    raise exception 'Permohonan tidak menunggu kelulusan';
  end if;
  if r.pemohon_id = u.id or r.penyemak_id = u.id then
    raise exception 'Pelulus mesti orang yang berbeza daripada pemohon dan penyemak';
  end if;
  update requests set status = 'ditolak', pelulus_id = u.id, sebab_tolak = trim(p_sebab) where id = p_id;
  perform _catat(p_id, u.id, 'tolak', p_sebab);
  perform _notif(p_id, 'keputusan');
end $$;

create function hantar_balik_penyemak(p_id uuid, p_catatan text) returns void
language plpgsql security definer set search_path = public as $$
declare
  u profiles := _mula('hantar_balik', array['pelulus']::peranan_t[]);
  r requests;
begin
  if length(trim(coalesce(p_catatan, ''))) < 5 then
    raise exception 'Sila nyatakan sebab dihantar balik kepada penyemak';
  end if;
  select * into r from requests where id = p_id for update;
  if not found or r.status <> 'menunggu_kelulusan' then
    raise exception 'Permohonan tidak menunggu kelulusan';
  end if;
  update requests set status = 'dalam_semakan', catatan_semakan = trim(p_catatan) where id = p_id;
  perform _catat(p_id, u.id, 'hantar_balik', p_catatan);
end $$;

-- --------------------------------------------------------- RPC: carian
create function cari_kenderaan_kosong(p_mula timestamptz, p_tamat timestamptz)
returns table (id uuid, jenis jenis_kenderaan_t, nama text, no_plat text, kapasiti int)
language sql stable security definer set search_path = public as $$
  select v.id, v.jenis, v.nama, v.no_plat, v.kapasiti
  from vehicles v
  where auth.uid() is not null and v.aktif
    and not exists (
      select 1 from bookings b
      where b.vehicle_id = v.id and b.during && tstzrange(p_mula, p_tamat, '[)'))
  order by v.jenis, v.nama
$$;

create function cari_pemandu_kosong(p_mula timestamptz, p_tamat timestamptz)
returns table (id uuid, nama text)
language sql stable security definer set search_path = public as $$
  select d.id, d.nama
  from drivers d
  where auth.uid() is not null and d.aktif
    and not exists (
      select 1 from bookings b
      where b.driver_id = d.id and b.during && tstzrange(p_mula, p_tamat, '[)'))
  order by d.nama
$$;

create function kalendar(p_dari timestamptz, p_hingga timestamptz)
returns table (
  booking_id uuid, kenderaan text, jenis jenis_kenderaan_t, no_plat text,
  mula timestamptz, tamat timestamptz, pemandu text,
  no_rujukan text, pemohon text, destinasi text
)
language sql stable security definer set search_path = public as $$
  select b.id, v.nama, v.jenis, v.no_plat,
         lower(b.during), upper(b.during), d.nama,
         case when adalah_staf() then r.no_rujukan end,
         case when adalah_staf() then p.nama end,
         case when adalah_staf() then r.destinasi end
  from bookings b
  join vehicles v on v.id = b.vehicle_id
  join requests r on r.id = b.request_id
  join profiles p on p.id = r.pemohon_id
  left join drivers d on d.id = b.driver_id
  where auth.uid() is not null
    and b.during && tstzrange(p_dari, p_hingga, '[)')
  order by lower(b.during)
$$;

-- ------------------------------------------------------- RPC: pentadbiran
create function kemas_kini_profil(p_nama text, p_jabatan text, p_telefon text) returns void
language plpgsql security definer set search_path = public as $$
declare
  u profiles := _mula('kemas_kini_profil');
begin
  if length(trim(coalesce(p_nama, ''))) < 2 then
    raise exception 'Nama diperlukan';
  end if;
  update profiles set nama = trim(p_nama), jabatan = nullif(trim(p_jabatan), ''),
    no_telefon = nullif(trim(p_telefon), '')
  where id = u.id;
end $$;

create function tetapkan_peranan(p_user uuid, p_peranan peranan_t, p_aktif boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  u profiles := _mula('tetapkan_peranan', array['admin']::peranan_t[]);
begin
  if p_user = u.id and (p_peranan <> 'admin' or not p_aktif) then
    raise exception 'Admin tidak boleh menurunkan peranan atau menyahaktifkan akaun sendiri';
  end if;
  update profiles set peranan = p_peranan, aktif = p_aktif where id = p_user;
end $$;

-- Dipanggil oleh jadual (pg_cron) atau secara manual oleh service role.
create function tutup_permohonan_luput() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  r record;
begin
  perform set_config('app.tindakan', 'tutup_luput', true);
  for r in
    select id from requests
    where status = 'dipulangkan' and tarikh_akhir_pembetulan < now()
    for update
  loop
    update requests set status = 'tamat_tempoh' where id = r.id;
    perform _catat(r.id, null, 'tamat_tempoh', 'Tempoh pembetulan tamat');
    perform _notif(r.id, 'tamat_tempoh');
    n := n + 1;
  end loop;
  update requests set status = 'selesai'
  where status = 'diluluskan' and tarikh_tamat < now();
  return n;
end $$;

-- ------------------------------------------------------------------- RLS
alter table tetapan enable row level security;
alter table profiles enable row level security;
alter table vehicles enable row level security;
alter table drivers enable row level security;
alter table requests enable row level security;
alter table request_versions enable row level security;
alter table decisions enable row level security;
alter table bookings enable row level security;
alter table documents enable row level security;
alter table rujukan_kaunter enable row level security;
alter table notifikasi enable row level security;
alter table audit_log enable row level security;

create policy tetapan_baca on tetapan for select to authenticated using (true);
create policy tetapan_admin on tetapan for update to authenticated
  using (peranan_semasa() = 'admin') with check (peranan_semasa() = 'admin');

create policy profiles_baca on profiles for select to authenticated
  using (id = auth.uid() or adalah_staf());

create policy vehicles_baca on vehicles for select to authenticated using (true);
create policy vehicles_admin_tambah on vehicles for insert to authenticated
  with check (peranan_semasa() = 'admin');
create policy vehicles_admin_kemas on vehicles for update to authenticated
  using (peranan_semasa() = 'admin') with check (peranan_semasa() = 'admin');

create policy drivers_baca on drivers for select to authenticated using (true);
create policy drivers_admin_tambah on drivers for insert to authenticated
  with check (peranan_semasa() = 'admin');
create policy drivers_admin_kemas on drivers for update to authenticated
  using (peranan_semasa() = 'admin') with check (peranan_semasa() = 'admin');

-- Draf adalah peribadi kepada pemohon; staf nampak selepas dihantar.
create policy requests_baca on requests for select to authenticated
  using (pemohon_id = auth.uid() or (adalah_staf() and status <> 'draf'));

create policy versions_baca on request_versions for select to authenticated
  using (exists (select 1 from requests r where r.id = request_id));
create policy decisions_baca on decisions for select to authenticated
  using (exists (select 1 from requests r where r.id = request_id));
create policy bookings_baca on bookings for select to authenticated using (true);

create policy documents_baca on documents for select to authenticated
  using (exists (select 1 from requests r where r.id = request_id));
create policy documents_tambah on documents for insert to authenticated
  with check (exists (
    select 1 from requests r
    where r.id = request_id and r.pemohon_id = auth.uid() and r.status in ('draf', 'dipulangkan')));
create policy documents_padam on documents for delete to authenticated
  using (exists (
    select 1 from requests r
    where r.id = request_id and r.pemohon_id = auth.uid() and r.status in ('draf', 'dipulangkan')));

create policy audit_admin on audit_log for select to authenticated
  using (peranan_semasa() = 'admin');

-- ---------------------------------------------------------- hak akses
revoke all on all tables in schema public from anon, authenticated;
grant select on tetapan, profiles, vehicles, drivers, requests, request_versions,
  decisions, bookings, documents, audit_log to authenticated;
grant update on tetapan to authenticated;
grant insert, update on vehicles, drivers to authenticated;
grant insert, delete on documents to authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  peranan_semasa(), adalah_staf(),
  simpan_permohonan(uuid, text, text, int, timestamptz, timestamptz, jenis_kenderaan_t, boolean),
  hantar_permohonan(uuid), batal_permohonan(uuid, text),
  ambil_semakan(uuid), pulangkan_permohonan(uuid, text),
  hantar_kelulusan(uuid, uuid, uuid, text),
  lulus_permohonan(uuid, text), tolak_permohonan(uuid, text), hantar_balik_penyemak(uuid, text),
  cari_kenderaan_kosong(timestamptz, timestamptz), cari_pemandu_kosong(timestamptz, timestamptz),
  kalendar(timestamptz, timestamptz),
  kemas_kini_profil(text, text, text), tetapkan_peranan(uuid, peranan_t, boolean)
to authenticated;

-- ------------------------------------------------------- storan dokumen
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dokumen', 'dokumen', false, 5242880,
        array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- Laluan fail: {request_id}/{nama-fail}
create policy dokumen_baca on storage.objects for select to authenticated
  using (bucket_id = 'dokumen' and exists (
    select 1 from public.requests r where r.id::text = (storage.foldername(name))[1]));
create policy dokumen_muat_naik on storage.objects for insert to authenticated
  with check (bucket_id = 'dokumen' and exists (
    select 1 from public.requests r
    where r.id::text = (storage.foldername(name))[1]
      and r.pemohon_id = auth.uid() and r.status in ('draf', 'dipulangkan')));
create policy dokumen_padam on storage.objects for delete to authenticated
  using (bucket_id = 'dokumen' and exists (
    select 1 from public.requests r
    where r.id::text = (storage.foldername(name))[1]
      and r.pemohon_id = auth.uid() and r.status in ('draf', 'dipulangkan')));
