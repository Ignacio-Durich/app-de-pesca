-- Leer los comentarios desde la compu de Nacho (para que Claude ajuste la app con su ayuda).
-- La clave vive solo en .env.local (FEEDBACK_READ_KEY); acá queda su sha256, que no permite recuperarla.
-- Sin la clave correcta no devuelve nada. Leer: node scripts/feedback.mjs

create function public.read_feedback(p_key text, p_since timestamptz default null)
returns table (created_at timestamptz, trip_id uuid, author text, page text, body text, user_agent text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex')
     <> '6600a8a4ca2631646f6956bb6c7d2f407bead5d7aeedcc500f47194e8164b43d' then
    raise exception 'bad_key';
  end if;
  return query
    select f.created_at, f.trip_id, f.author, f.page, f.body, f.user_agent
    from public.feedback f
    where p_since is null or f.created_at > p_since
    order by f.created_at desc
    limit 500;
end;
$$;

revoke execute on function public.read_feedback(text, timestamptz) from public;
grant execute on function public.read_feedback(text, timestamptz) to anon;
