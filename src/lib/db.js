import { createClient } from '@supabase/supabase-js'
import { timeoutSignal } from './timeout.js'

// [diseño] tiempo máximo por pedido a Supabase: uno colgado no traba la cola (flush) para siempre.
export const DB_TIMEOUT_MS = 60_000

// Sin cuentas: el id del viaje viaja en x-trip-id y las políticas RLS lo leen (spec §3.3).
// `opts` ({url, key, fetch}) existe para tests y scripts; en la app se usa import.meta.env.
export function makeClient(tripId, opts = {}) {
  const url = opts.url ?? import.meta.env.VITE_SUPABASE_URL
  const key = opts.key ?? import.meta.env.VITE_SUPABASE_ANON_KEY
  return createClient(url, key, {
    auth: { persistSession: false },
    global: {
      headers: tripId ? { 'x-trip-id': tripId } : {},
      fetch: (url, init = {}) =>
        (opts.fetch ?? globalThis.fetch)(url, { ...init, signal: timeoutSignal(DB_TIMEOUT_MS, init.signal) }),
    },
  })
}
