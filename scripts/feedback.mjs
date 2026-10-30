// Lee los comentarios y errores (tabla feedback) con la clave de .env.local (FEEDBACK_READ_KEY).
// Uso: node scripts/feedback.mjs [desde, ej. 2026-11-01]   → npm run feedback
import { readFileSync } from 'node:fs'
import { makeClient } from '../src/lib/db.js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
if (!env.FEEDBACK_READ_KEY) throw new Error('Falta FEEDBACK_READ_KEY en .env.local')

const client = makeClient(null, { url: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_ANON_KEY })
const since = process.argv[2] ? new Date(process.argv[2]).toISOString() : null
const { data, error } = await client.rpc('read_feedback', { p_key: env.FEEDBACK_READ_KEY, p_since: since })
if (error) throw new Error(error.message)

const when = (t) => new Date(t).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hourCycle: 'h23' })
console.log(`${data.length} comentario(s)\n`)
for (const f of data) {
  console.log(`— ${when(f.created_at)} · ${f.author ?? '?'} · pantalla: ${f.page ?? 'menú Más'}`)
  console.log(`  ${f.body.replace(/\n/g, '\n  ')}`)
  console.log(`  (${f.user_agent ?? 'sin navegador'})\n`)
}
