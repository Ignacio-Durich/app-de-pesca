-- App de Pesca, fase 1: esquema (spec §3.2) + RLS por header x-trip-id (spec §3.3).
-- Sin cuentas: PostgREST y Storage ponen los headers del pedido en request.headers.

-- ── Helper ──────────────────────────────────────────────────────────────────
-- Devuelve el uuid del viaje del header, o null si falta o no es un uuid
-- (un header basura no debe romper el pedido con un error de cast).
create or replace function public.req_trip() returns uuid
language sql stable set search_path = '' as
$$
  select case when t ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then t::uuid end
  from (select nullif(current_setting('request.headers', true), '')::json ->> 'x-trip-id' as t) h
$$;

-- ── Tablas ──────────────────────────────────────────────────────────────────
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  name text,
  place_name text,
  lat float8,
  lon float8,
  start_date date,
  end_date date,
  members text[],
  water text not null default 'mar' check (water in ('mar', 'rio')),
  night_fishing bool not null default false,
  created_at timestamptz default now()
);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  text text,
  who text,
  done bool default false,
  created_at timestamptz default now()
);

create table public.itinerary_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  starts_at timestamptz,
  title text,
  notes text
);

create table public.catches (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  member text,
  species text,
  length_cm numeric,
  released bool,
  photo_path text,
  caught_at timestamptz,
  lat float8,
  lon float8,
  tide_phase text,
  tide_height_m numeric,
  wind_kmh numeric,
  wind_dir_deg numeric
);

create table public.spots (
  id uuid primary key default gen_random_uuid(),
  name text,
  lat float8,
  lon float8,
  species text[],
  best_tide text,
  depth_m numeric,
  notes text,
  created_by text,
  created_at timestamptz default now()
);

-- depth_datum_m = medido − altura de marea
create table public.soundings (
  id uuid primary key default gen_random_uuid(),
  lat float8,
  lon float8,
  depth_measured_m numeric,
  tide_height_m numeric,
  depth_datum_m numeric,
  measured_at timestamptz,
  created_by text
);

create index on public.checklist_items (trip_id);
create index on public.itinerary_items (trip_id);
create index on public.catches (trip_id);

-- ── Privilegios de tabla para anon (explícitos, no dependen de los defaults) ─
revoke all on public.trips, public.checklist_items, public.itinerary_items,
              public.catches, public.spots, public.soundings from anon;
grant usage on schema public to anon;
grant select, insert, update on public.trips, public.spots, public.soundings to anon;
grant select, insert, update, delete on public.checklist_items, public.itinerary_items,
                                        public.catches to anon;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.trips enable row level security;
alter table public.checklist_items enable row level security;
alter table public.itinerary_items enable row level security;
alter table public.catches enable row level security;
alter table public.spots enable row level security;
alter table public.soundings enable row level security;

-- trips: crear abierto; leer y editar solo el del header (sin delete)
create policy trips_ins on public.trips for insert to anon with check (true);
create policy trips_sel on public.trips for select to anon using (id = (select public.req_trip()));
create policy trips_upd on public.trips for update to anon
  using (id = (select public.req_trip())) with check (id = (select public.req_trip()));

-- tablas del viaje: todo, siempre con trip_id = viaje del header
create policy checklist_sel on public.checklist_items for select to anon using (trip_id = (select public.req_trip()));
create policy checklist_ins on public.checklist_items for insert to anon with check (trip_id = (select public.req_trip()));
create policy checklist_upd on public.checklist_items for update to anon
  using (trip_id = (select public.req_trip())) with check (trip_id = (select public.req_trip()));
create policy checklist_del on public.checklist_items for delete to anon using (trip_id = (select public.req_trip()));

create policy itinerary_sel on public.itinerary_items for select to anon using (trip_id = (select public.req_trip()));
create policy itinerary_ins on public.itinerary_items for insert to anon with check (trip_id = (select public.req_trip()));
create policy itinerary_upd on public.itinerary_items for update to anon
  using (trip_id = (select public.req_trip())) with check (trip_id = (select public.req_trip()));
create policy itinerary_del on public.itinerary_items for delete to anon using (trip_id = (select public.req_trip()));

create policy catches_sel on public.catches for select to anon using (trip_id = (select public.req_trip()));
create policy catches_ins on public.catches for insert to anon with check (trip_id = (select public.req_trip()));
create policy catches_upd on public.catches for update to anon
  using (trip_id = (select public.req_trip())) with check (trip_id = (select public.req_trip()));
create policy catches_del on public.catches for delete to anon using (trip_id = (select public.req_trip()));

-- spots y soundings: lectura, alta y edición abiertas (sin delete)
create policy spots_sel on public.spots for select to anon using (true);
create policy spots_ins on public.spots for insert to anon with check (true);
create policy spots_upd on public.spots for update to anon using (true) with check (true);

create policy soundings_sel on public.soundings for select to anon using (true);
create policy soundings_ins on public.soundings for insert to anon with check (true);
create policy soundings_upd on public.soundings for update to anon using (true) with check (true);

-- ── Storage: lectura pública por ruta; subir solo a <trip_id>/… ─────────────
insert into storage.buckets (id, name, public)
values ('catch-photos', 'catch-photos', true)
on conflict (id) do nothing;

create policy photos_ins on storage.objects for insert to anon
  with check (bucket_id = 'catch-photos' and (storage.foldername(name))[1] = (select public.req_trip())::text);
