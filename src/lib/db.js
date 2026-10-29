import { createClient } from '@supabase/supabase-js'

// Sin cuentas: el id del viaje viaja en x-trip-id y las políticas RLS lo leen (spec §3.3).
// `opts` ({url, key, fetch}) existe para tests y scripts; en la app se usa import.meta.env.
export function makeClient(tripId, opts = {}) {
  const url = opts.url ?? import.meta.env.VITE_SUPABASE_URL
  const key = opts.key ?? import.meta.env.VITE_SUPABASE_ANON_KEY
  return createClient(url, key, {
    auth: { persistSession: false },
    global: {
      headers: tripId ? { 'x-trip-id': tripId } : {},
      ...(opts.fetch && { fetch: opts.fetch }),
    },
  })
}
