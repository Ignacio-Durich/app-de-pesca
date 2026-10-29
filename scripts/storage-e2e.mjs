// Prueba de punta a punta de Storage (spec §7). Correr UNA vez con el proyecto real:
//   node scripts/storage-e2e.mjs
// Lee VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY de .env.local.
// Esperado: A/test.jpg se sube; B/test.jpg lo rechaza RLS (el cliente va como viaje A).
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { makeClient } from '../src/lib/db.js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const opts = { url: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_ANON_KEY }
if (!opts.url || !opts.key) throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en .env.local')

const A = randomUUID()
const B = randomUUID()
const jpg = new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }) // JPEG mínimo
const bucket = makeClient(A, opts).storage.from('catch-photos')

const own = await bucket.upload(`${A}/test.jpg`, jpg)
const other = await bucket.upload(`${B}/test.jpg`, jpg)
console.log('A/test.jpg (esperado OK):      ', own.error ? `FALLO: ${own.error.message}` : 'OK')
console.log('B/test.jpg (esperado rechazo): ', other.error ? `rechazado: ${other.error.message}` : 'FALLO: se subió')

if (!own.error) {
  const { error } = await bucket.remove([`${A}/test.jpg`])
  // anon no tiene política de delete: remove no borra nada. Se verifica por la URL pública (list no sirve: anon no tiene select).
  const still = (await fetch(bucket.getPublicUrl(`${A}/test.jpg`).data.publicUrl)).ok
  if (error || still)
    console.log(`Borrar a mano (Dashboard > Storage > catch-photos): ${A}/test.jpg`)
  else console.log('Archivo de prueba borrado.')
}
if (!other.error) console.log(`Borrar a mano: ${B}/test.jpg`)
process.exitCode = !own.error && other.error ? 0 : 1
