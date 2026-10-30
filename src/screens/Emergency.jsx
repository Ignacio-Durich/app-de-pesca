import { useEffect, useState } from 'preact/hooks'
import { toDegMin } from '../map/nav.js'
import contacts from '../data/emergency.json'

// Sin red: solo GPS del teléfono y datos locales.
export function Emergency() {
  const [pos, setPos] = useState(null)
  const [err, setErr] = useState(null) // 'denied' | 'unavailable' | 'waiting'

  useEffect(() => {
    if (!navigator.geolocation) { setErr('unavailable'); return }
    const id = navigator.geolocation.watchPosition(
      (p) => { setPos(p.coords); setErr(null) },
      (e) => setErr(e.code === 1 ? 'denied' : 'waiting'),
      { enableHighAccuracy: true, maximumAge: 5000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  const tel = contacts.find((c) => c.kind === 'tel')
  const radio = contacts.find((c) => c.kind === 'radio')

  return (
    <section class="stack">
      <h1>Emergencias</h1>
      <div class="card">
        <h2>Tu posición</h2>
        {pos ? (
          <>
            <p class="coords">{toDegMin(pos.latitude, pos.longitude)}</p>
            {pos.accuracy != null && <p class="muted">±{Math.round(pos.accuracy)} m</p>}
          </>
        ) : (
          (!err || err === 'waiting') && <p class="muted">Buscando señal de GPS…</p>
        )}
        {err === 'denied' && (
          <p>
            No tenemos permiso para usar el GPS. Activá la ubicación del teléfono (Ajustes del sistema) y
            permitila para este sitio en los permisos del navegador. Después volvé a abrir esta pantalla.
          </p>
        )}
        {err === 'unavailable' && <p>Este dispositivo o navegador no tiene GPS disponible.</p>}
        {err && pos && <p class="muted">Última posición conocida: ya no se actualiza.</p>}
      </div>
      {tel && (
        <a class="btn big sos" href={`tel:${tel.value}`}>Llamar al {tel.value}</a>
      )}
      <div class="card">
        {contacts.map((c) => (
          <p key={c.kind}><strong>{c.label}:</strong> {c.value}{c.kind === 'tel' && ' (gratuito)'}</p>
        ))}
        {radio && <p class="muted">Por radio, llamá por el {radio.label}.</p>}
      </div>
      <div class="card">
        <h2>Qué datos pasar</h2>
        <ul>
          <li>Posición (la de arriba, en grados y minutos).</li>
          <li>Cantidad de personas.</li>
          <li>Situación.</li>
        </ul>
      </div>
    </section>
  )
}
