import { createClient } from '@supabase/supabase-js'
import { timeoutSignal } from './timeout.js'

// [diseño] tiempo máximo por pedido a Supabase: uno colgado no traba la cola (flush) para siempre.
export const DB_TIMEOUT_MS = 60_000

// Clave para crear viajes (migración 005): se carga una vez en el teléfono y viaja en x-create-key.
const CREATE_KEY = 'createKey'
export const getCreateKey = () => { try { return localStorage.getItem(CREATE_KEY) } catch { return null } }
export const setCreateKey = (k) => { try { localStorage.setItem(CREATE_KEY, k) } catch { /* modo privado */ } }

// Sin cuentas: el id del viaje viaja en x-trip-id y las políticas RLS lo leen (spec §3.3).
// `opts` ({url, key, fetch, createKey}) existe para tests y scripts; en la app se usa import.meta.env.
export function makeClient(tripId, opts = {}) {
  const url = opts.url ?? import.meta.env.VITE_SUPABASE_URL
  const key = opts.key ?? import.meta.env.VITE_SUPABASE_ANON_KEY
  const createKey = opts.createKey ?? getCreateKey()
  return createClient(url, key, {
    auth: { persistSession: false },
    global: {
      headers: { ...(tripId && { 'x-trip-id': tripId }), ...(createKey && { 'x-create-key': createKey }) },
      fetch: (url, init = {}) =>
        (opts.fetch ?? globalThis.fetch)(url, { ...init, signal: timeoutSignal(DB_TIMEOUT_MS, init.signal) }),
    },
  })
}
