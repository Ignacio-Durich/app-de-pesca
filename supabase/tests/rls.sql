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
  assert (select count(*) from catches) = 1, 'A ve sus capturas';
  assert (select count(*) from spots) = 1, 'spots es de lectura abierta';

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

-- ── Viaje B: simétrico (ve 1 checklist, no los de A) ────────────────────────
set local request.headers = '{"x-trip-id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}';
do $$
begin
  assert (select count(*) from checklist_items) = 1, 'B ve su único checklist_item';
  assert (select count(*) from checklist_items where trip_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 0, 'B no ve checklist de A';
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
