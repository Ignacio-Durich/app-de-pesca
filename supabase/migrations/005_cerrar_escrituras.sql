-- Cierra la app a extraños (16/11/2026). La clave pública de Supabase viaja en la app, así que sin esto
-- cualquiera podía crear viajes, leer y editar spots y sondeos, subir fotos y ver capturas de todos los viajes.
-- 1. Crear un viaje pide el header x-create-key. La clave vive solo en .env.local (TRIP_CREATE_KEY);
--    acá queda su sha256 (clave aleatoria de ~118 bits: el hash no permite recuperarla).
-- 2. Spots, sondeos, fotos y catches_near piden un x-trip-id de un viaje que exista.
-- Editar un viaje existente no cambia: un upsert que encuentra la fila va por la política de update.

create or replace function public.create_key_ok() returns boolean
language sql stable security definer set search_path = '' as
$$
  select encode(sha256(convert_to(coalesce(
           nullif(current_setting('request.headers', true), '')::json ->> 'x-create-key', ''), 'UTF8')), 'hex')
         = 'c2f34fd09290601426815bfe4f649c93ef58d2f41fecb7acea7387cb670ebdf8'
$$;

-- security definer: mira trips sin pasar por su RLS (y sirve igual desde Storage).
create or replace function public.valid_trip() returns boolean
language sql stable security definer set search_path = '' as
$$
  select exists (select 1 from public.trips where id = public.req_trip())
$$;

-- La app la llama al cargar la clave, para no guardar una equivocada.
create or replace function public.check_create_key() returns boolean
language sql stable security definer set search_path = '' as
$$ select public.create_key_ok() $$;

revoke execute on function public.create_key_ok(), public.valid_trip(), public.check_create_key() from public;
grant execute on function public.create_key_ok(), public.valid_trip(), public.check_create_key() to anon;

-- ── trips ───────────────────────────────────────────────────────────────────
drop policy trips_ins on public.trips;
create policy trips_ins on public.trips for insert to anon with check ((select public.create_key_ok()));

-- ── spots y soundings: solo desde un viaje que exista ───────────────────────
drop policy spots_sel on public.spots;
drop policy spots_ins on public.spots;
drop policy spots_upd on public.spots;
create policy spots_sel on public.spots for select to anon using ((select public.valid_trip()));
create policy spots_ins on public.spots for insert to anon with check ((select public.valid_trip()));
create policy spots_upd on public.spots for update to anon
  using ((select public.valid_trip())) with check ((select public.valid_trip()));

drop policy soundings_sel on public.soundings;
drop policy soundings_ins on public.soundings;
drop policy soundings_upd on public.soundings;
create policy soundings_sel on public.soundings for select to anon using ((select public.valid_trip()));
create policy soundings_ins on public.soundings for insert to anon with check ((select public.valid_trip()));
create policy soundings_upd on public.soundings for update to anon
  using ((select public.valid_trip())) with check ((select public.valid_trip()));

-- ── Fotos: la carpeta tiene que ser un viaje que exista ─────────────────────
drop policy photos_ins on storage.objects;
create policy photos_ins on storage.objects for insert to anon
  with check (bucket_id = 'catch-photos'
              and (storage.foldername(name))[1] = (select public.req_trip())::text
              and (select public.valid_trip()));

-- ── catches_near: igual que en 004, pero solo desde un viaje que exista ─────
create or replace function public.catches_near(p_lat float8, p_lon float8, p_km float8)
returns table (species text, caught_at timestamptz, lat float8, lon float8,
               tide_phase text, tide_height_m numeric, level_source text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.species, c.caught_at, c.lat, c.lon, c.tide_phase, c.tide_height_m, c.level_source
  from public.catches c
  where public.valid_trip()
    and c.lat is not null and c.lon is not null
    and 2 * 6371 * asin(sqrt(least(1.0,
          power(sin(radians(c.lat - p_lat) / 2), 2)
          + cos(radians(p_lat)) * cos(radians(c.lat)) * power(sin(radians(c.lon - p_lon) / 2), 2)
        ))) <= least(p_km, 250) -- tope: limita el scraping masivo; 250 = radio de la zona de mar
  order by c.caught_at desc
  limit 2000
$$;
