-- Comentarios y errores desde Más o el botón 🐞 de arriba (como en Pelis by Pili). page = pantalla desde
-- la que se tocó el 🐞 (null si se entró por Más). Se guardan acá y la app no los puede leer:
-- Nacho los ve en el panel de Supabase (Table Editor → feedback, o por SQL).

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  author text check (char_length(author) <= 60),
  page text check (char_length(page) <= 40),
  body text not null check (char_length(body) between 1 and 2000),
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now()
);

create index feedback_trip_created on public.feedback (trip_id, created_at);

-- RLS sin políticas: nadie la lee ni la escribe directo.
alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
grant all on public.feedback to service_role;

-- El viaje sale del header x-trip-id, como en el resto de las tablas.
-- [diseño] hasta 50 comentarios por viaje cada 24 h.
create function public.send_feedback(p_body text, p_author text, p_page text, p_user_agent text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip uuid := public.req_trip();
  v_body text := btrim(p_body);
begin
  if v_trip is null or not exists (select 1 from public.trips where id = v_trip) then
    raise exception 'no_trip';
  end if;
  if v_body is null or char_length(v_body) not between 1 and 2000 then
    raise exception 'invalid_feedback';
  end if;
  if (select count(*) from public.feedback
      where trip_id = v_trip and created_at > now() - interval '24 hours') >= 50 then
    raise exception 'too_many';
  end if;

  insert into public.feedback (trip_id, author, page, body, user_agent)
  values (v_trip, left(btrim(p_author), 60), left(p_page, 40), v_body, left(p_user_agent, 300));
end;
$$;

revoke execute on function public.send_feedback(text, text, text, text) from public;
grant execute on function public.send_feedback(text, text, text, text) to anon;
