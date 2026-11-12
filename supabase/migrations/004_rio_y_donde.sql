-- App de Pesca, fase 2: río y "dónde pescar".
-- Spots con acceso/fuente/rango de nivel, level_source en capturas y sondeos,
-- historial de capturas cercano (sin nombres) y pesqueros con fuente citada.

-- ── spots ───────────────────────────────────────────────────────────────────
alter table public.spots add column if not exists access text check (access in ('costa', 'embarcado', 'ambos'));
alter table public.spots add column if not exists source text;
alter table public.spots add column if not exists best_level_min_m numeric;
alter table public.spots add column if not exists best_level_max_m numeric;

-- best_tide pasa a ser un enum cerrado. Lo que no coincide va a notes y best_tide queda en null.
alter table public.spots drop constraint if exists spots_best_tide_check;
update public.spots
   set notes = concat_ws(' · ', nullif(notes, ''), 'mejor marea: ' || best_tide),
       best_tide = null
 where best_tide is not null
   and best_tide not in ('creciente', 'pleamar', 'bajante', 'bajamar');
alter table public.spots add constraint spots_best_tide_check
  check (best_tide in ('creciente', 'pleamar', 'bajante', 'bajamar'));

-- ── level_source: 'marea' o 'ina:<serie medida>'; solo se comparan alturas con la misma fuente ─
alter table public.catches add column if not exists level_source text;
alter table public.soundings add column if not exists level_source text;

-- ── catches_near: capturas de todos los viajes cerca de un punto, sin member ─
-- Cruza viajes a propósito (historial compartido, sin nombres). Haversine en km, radio terrestre 6371.
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
  where c.lat is not null and c.lon is not null
    and 2 * 6371 * asin(sqrt(least(1.0,
          power(sin(radians(c.lat - p_lat) / 2), 2)
          + cos(radians(p_lat)) * cos(radians(c.lat)) * power(sin(radians(c.lon - p_lon) / 2), 2)
        ))) <= least(p_km, 250) -- tope: limita el scraping masivo; 250 = radio de la zona de mar
  order by c.caught_at desc
  limit 2000
$$;

revoke execute on function public.catches_near(float8, float8, float8) from public;
grant execute on function public.catches_near(float8, float8, float8) to anon;

-- ── Pesqueros con fuente ────────────────────────────────────────────────────
insert into public.spots (id, name, lat, lon, access, best_tide, species, notes, source, created_by) values
  ('f0e5a000-0000-4000-8000-000000000001', 'Frente al camping Las Tejas', -34.1043, -58.9943, 'embarcado', null,
   '{Boga}', null,
   'Crónica Pesca, 26/3/2026 (prensa): https://www.cronica.com.ar/sociedad/cronica-pesca-el-pique-de-la-semana-noticias-y-detalles-claves-4269.html · posición: camping en OpenStreetMap',
   'fuente'),
  ('f0e5a000-0000-4000-8000-000000000002', 'Punta Segunda', -40.54, -62.24, 'costa', 'bajamar',
   '{"Corvina rubia"}', null,
   'Llompart 2011, cap. 3, pág. 72: https://sedici.unlp.edu.ar/handle/10915/34280',
   'fuente'),
  ('f0e5a000-0000-4000-8000-000000000003', 'La Rebeca', -40.5667, -62.2083, 'costa', null,
   null, null,
   'Llompart 2011, cap. 3, págs. 73–74: https://sedici.unlp.edu.ar/handle/10915/34280',
   'fuente'),
  ('f0e5a000-0000-4000-8000-000000000004', 'Playa de Arena, Mina de Hierro', -40.5833, -62.1667, 'costa', null,
   null, 'cazón de costa en octubre y menos en noviembre (Llompart, pág. 75)',
   'Llompart 2011, cap. 3, pág. 75: https://sedici.unlp.edu.ar/handle/10915/34280',
   'fuente')
on conflict (id) do nothing;
