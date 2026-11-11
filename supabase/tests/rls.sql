-- Prueba de RLS. Correr DESPUÉS de aplicar 001_init.sql, conectado como postgres:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql
-- (o pegar entero en el SQL Editor de Supabase). Todo corre en una transacción
-- que termina en ROLLBACK: no deja datos. Cualquier assert que falle aborta el script.
begin;

-- Semillas (como postgres, que se salta RLS)
insert into trips (id, name) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Viaje A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Viaje B');
insert into checklist_items (trip_id, text) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a1'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a2'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b1');
insert into itinerary_items (trip_id, title) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b');
insert into catches (trip_id, species) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b');
-- Para catches_near (migración 004): A con posición (a ~0 km del punto de prueba) y otra sin lat;
-- B con posición lejos (~100 km).
insert into catches (trip_id, species, caught_at, lat, lon, tide_phase, tide_height_m, level_source) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'near-a', '2026-01-01T10:00:00Z', -34.1, -58.9, 'creciente', 1.2, 'marea');
insert into catches (trip_id, species, caught_at, lat, lon) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'sin-lat', '2026-01-02T10:00:00Z', null, -58.9),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'far-b', '2026-01-03T10:00:00Z', -35.0, -58.9);
insert into spots (name) values ('spot compartido');

-- ── Viaje A ─────────────────────────────────────────────────────────────────
set local role anon;
set local request.headers = '{"x-trip-id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}';

do $$
declare n int;
begin
  assert current_user = 'anon', 'el test debe correr como anon';
  assert public.req_trip() = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'req_trip() debe leer el header';

  -- ve lo suyo y nada de B
  assert (select count(*) from trips) = 1, 'A ve solo su trip';
  assert (select count(*) from trips where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') = 0, 'A no ve el trip B';
  assert (select count(*) from checklist_items) = 2, 'A ve sus 2 checklist_items';
  assert (select count(*) from checklist_items where trip_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') = 0, 'A no ve checklist de B';
  assert (select count(*) from itinerary_items) = 1, 'A ve su itinerario';
  assert (select count(*) from catches) = 3, 'A ve sus 3 capturas';
  assert (select count(*) from spots where name = 'spot compartido') = 1, 'spots es de lectura abierta';

  -- insert propio OK
  insert into checklist_items (trip_id, text) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a3');
  assert (select count(*) from checklist_items) = 3, 'insert propio funciona';

  -- insert con trip_id de B: RLS lo rechaza
  begin
    insert into checklist_items (trip_id, text) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'intruso');
    assert false, 'el insert con trip_id de B debía fallar';
  exception when insufficient_privilege then
    null;  -- 42501 = new row violates row-level security policy
  end;

  -- update/delete de filas de B: afectan 0 filas
  update checklist_items set text = 'hackeado' where trip_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  get diagnostics n = row_count;
  assert n = 0, 'A no puede editar filas de B';
  delete from catches where trip_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  get diagnostics n = row_count;
  assert n = 0, 'A no puede borrar filas de B';

  -- mover una fila propia a B: with check lo rechaza
  begin
    update checklist_items set trip_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where text = 'a1';
    assert false, 'mover una fila a B debía fallar';
  exception when insufficient_privilege then
    null;
  end;

  -- spots y soundings: alta abierta; sin delete
  insert into spots (name) values ('spot nuevo');
  insert into soundings (lat, lon) values (0, 0);
  begin
    delete from spots;
    assert false, 'borrar spots debía fallar';
  exception when insufficient_privilege then
    null;
  end;

  -- Storage: subir a la carpeta propia OK, a la de B rechazado
  insert into storage.objects (bucket_id, name) values ('catch-photos', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/t.jpg');
  begin
    insert into storage.objects (bucket_id, name) values ('catch-photos', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/t.jpg');
    assert false, 'subir a la carpeta de B debía fallar';
  exception when insufficient_privilege then
    null;
  end;

  raise notice 'OK viaje A: ve lo suyo y 0 de B; insert/update/delete cruzados rechazados';
end $$;

-- ── Migración 004: constraints y catches_near (header de A) ────────────────
do $$
declare r record;
begin
  begin
    insert into spots (name, best_tide) values ('x', 'rarísimo');
    assert false, 'best_tide fuera del enum debía fallar';
  exception when check_violation then
    null;
  end;
  begin
    insert into spots (name, access) values ('x', 'kayak');
    assert false, 'access = kayak debía fallar';
  exception when check_violation then
    null;
  end;

  -- 1 fila: la captura con posición cercana; la sin lat y la lejana de B no entran.
  -- La función devuelve solo species, caught_at, lat, lon, tide_phase, tide_height_m, level_source:
  -- no tiene columna member (lo garantiza el tipo de retorno).
  select * into r from public.catches_near(-34.1, -58.9, 1);
  assert (select count(*) from public.catches_near(-34.1, -58.9, 1)) = 1, 'catches_near devuelve 1 fila';
  assert r.species = 'near-a' and r.tide_phase = 'creciente' and r.level_source = 'marea', 'catches_near devuelve los campos';
  assert (select count(*) from public.catches_near(-34.1, -58.9, 200)) = 2, 'con radio grande entra la de B (cruza viajes)';

  -- los pesqueros con fuente vienen sembrados por la migración
  assert (select count(*) from spots where created_by = 'fuente') = 4, '4 pesqueros con fuente';
  raise notice 'OK migración 004';
end $$;

-- ── Viaje B: simétrico (ve 1 checklist, no los de A) ────────────────────────
set local request.headers = '{"x-trip-id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}';
do $$
begin
  assert (select count(*) from checklist_items) = 1, 'B ve su único checklist_item';
  assert (select count(*) from checklist_items where trip_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 0, 'B no ve checklist de A';
  -- catches_near cruza viajes: B ve la captura cercana de A (sin nombres)
  assert (select count(*) from public.catches_near(-34.1, -58.9, 1)) = 1, 'B ve la captura de A vía catches_near';
  raise notice 'OK viaje B';
end $$;

-- ── Sin header: 0 filas de las tablas del viaje ─────────────────────────────
set local request.headers = '{}';
do $$
begin
  assert public.req_trip() is null, 'sin header, req_trip() es null';
  assert (select count(*) from trips) = 0, 'sin header: 0 trips';
  assert (select count(*) from checklist_items) = 0, 'sin header: 0 checklist_items';
  assert (select count(*) from itinerary_items) = 0, 'sin header: 0 itinerario';
  assert (select count(*) from catches) = 0, 'sin header: 0 capturas';
  begin
    insert into checklist_items (trip_id, text) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'sin header');
    assert false, 'insertar sin header debía fallar';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'OK sin header';
end $$;

-- ── Header malformado: null, sin error de cast ──────────────────────────────
set local request.headers = '{"x-trip-id":"no-soy-un-uuid"}';
do $$
begin
  assert public.req_trip() is null, 'header malformado: req_trip() es null';
  assert (select count(*) from checklist_items) = 0, 'header malformado: 0 filas';
  raise notice 'OK header malformado';
end $$;

-- Crear un viaje es abierto (aunque el header no sea el suyo)
set local request.headers = '{}';
insert into trips (id, name) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Viaje C');

reset role;
rollback;
