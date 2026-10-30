// Pantalla Pronóstico (spec §2.2): se dibuja con lo local y después refresca (spec §3.4).
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { cachedForecast, getForecast, ageLabel, ageOf, shouldRefresh } from '../forecast/cache.js'
import { findExtremes } from '../forecast/tides.js'
import { scoreDay, median } from '../score/score.js'
import { findWindows } from '../score/windows.js'
import { moonDay } from '../score/moon.js'
import { NOGO_WIND_KMH, WAVE_NOGO_M } from '../score/config.js'
import {
  tripDays, nowLocal, pickDay, dayLabel, countdown, slotNow, noGoRanges, tideReaches, phaseLabel, hhmm, dec, heroWindows,
} from '../forecast/view.js'
import { ScoreChart } from '../components/ScoreChart.jsx'
import { ModelTable } from '../components/ModelTable.jsx'
import { useRows } from '../lib/useRows.js'
import { fromInstant } from '../lib/time.js'

const MODE_KEY = 'forecastMode' // por teléfono
const readMode = () => {
  try { return localStorage.getItem(MODE_KEY) === 'embarcado' ? 'embarcado' : 'costa' } catch { return 'costa' }
}
const saveMode = (m) => {
  try { localStorage.setItem(MODE_KEY, m) } catch { /* modo privado */ }
}

export function Forecast({ trip, tripId }) {
  const [catches] = useRows('catches', tripId)
  const [res, setRes] = useState(null)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(Date.now)
  const run = useRef(0) // cambia al cambiar de lugar o desmontar: las respuestas viejas se descartan

  const refresh = () => {
    const my = run.current
    setLoading(true)
    getForecast(trip)
      .then((r) => my === run.current && setRes(r))
      .catch((e) => my === run.current && setRes((s) => ({ forecast: null, ...s, error: e.message })))
      .finally(() => my === run.current && setLoading(false))
  }

  useEffect(() => {
    const my = ++run.current
    setRes(null)
    cachedForecast(trip).then((r) => my === run.current && setRes((s) => s ?? r)).catch(() => {})
    refresh()
    return () => { run.current++ }
  }, [trip.lat, trip.lon])

  // Reloj cada 30 s y al volver a la app (iPhone la deja suspendida horas sin recargar).
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const onVisible = () => document.visibilityState === 'visible' && tick()
    const id = setInterval(tick, 30000)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // En cada tic: si la copia quedó vieja (o no hay), se vuelve a pedir.
  useEffect(() => {
    if (res && shouldRefresh(ageOf(res.forecast, now), loading)) refresh()
  }, [now])

  if (!res) return <p class="muted">Cargando…</p>
  if (!res.forecast) {
    return (
      <section class="card">
        <p>{loading ? 'Descargando pronóstico…' : 'Sin datos todavía. Abrí la app con señal antes de salir.'}</p>
      </section>
    )
  }
  const age = ageLabel(ageOf(res.forecast, now))
  return (
    <>
      <DayView trip={trip} forecast={res.forecast} now={now} catches={catches} />
      <footer class="data-age">
        <span class={age.amber ? 'amber' : ''}>{age.text}</span>
        {res.error && !loading && <span class="muted"> · no se pudo actualizar</span>}
        <span class="muted"> · Datos: Open-Meteo</span>
      </footer>
    </>
  )
}

function DayView({ trip, forecast: f, now, catches }) {
  const days = useMemo(() => tripDays(trip.start_date, trip.end_date), [trip.start_date, trip.end_date])
  const nowIso = nowLocal(now, f.utcOffsetSeconds)
  const today = nowIso.slice(0, 10)
  const [picked, setPicked] = useState(null)
  const day = picked ?? pickDay(days, today)
  const [mode, setModeState] = useState(readMode)
  const setMode = (m) => (saveMode(m), setModeState(m))
  const nightFishing = !!trip.night_fishing

  const extremes = useMemo(() => findExtremes(f.hours), [f])
  const slots = useMemo(() => scoreDay(f, extremes, day, mode, { nightFishing }), [f, extremes, day, mode, nightFishing])
  const windows = useMemo(() => findWindows(slots, { nightFishing, mode }), [slots, nightFishing, mode])
  const moon = useMemo(() => moonDay(day, f.lat, f.lon, f.utcOffsetSeconds), [f, day])
  const hours = f.hours.filter((h) => h.t.startsWith(day))
  const dayExt = extremes.filter((e) => e.t.startsWith(day))
  const sun = f.days[day] ?? {}
  const sst = median(hours.map((h) => h.sst))
  const noGo = mode === 'embarcado' ? noGoRanges(slots) : []
  const hasTide = tideReaches(f, day)
  // caught_at es un instante real; se pasa a hora local del viaje para marcarla en el gráfico
  const catchTimes = catches.map((c) => fromInstant(c.caught_at)).filter((c) => c.date === day).map((c) => `${c.date}T${c.time}`)

  return (
    <section class="stack">
      <div class="chips" role="group" aria-label="Día">
        {days.map((d) => (
          <button key={d} class={d === day ? 'chip on' : 'chip'} aria-pressed={d === day} onClick={() => setPicked(d)}>
            {d === today ? `Hoy · ${dayLabel(d)}` : dayLabel(d)}
          </button>
        ))}
      </div>
      <div class="chips" role="group" aria-label="Modo">
        {[['costa', 'Costa'], ['embarcado', 'Embarcado']].map(([k, label]) => (
          <button key={k} class={k === mode ? 'chip on' : 'chip'} aria-pressed={k === mode} onClick={() => setMode(k)}>{label}</button>
        ))}
      </div>

      {hasTide
        ? <Hero windows={windows} slots={slots} isToday={day === today} nowIso={nowIso} />
        : <section class="card"><p>El pronóstico de marea todavía no llega a esta fecha.</p></section>}

      {noGo.length > 0 && (
        <div class="banner" role="alert">
          <strong>No conviene salir</strong>: {noGo.join(', ')}
          <div class="small">Viento de más de {NOGO_WIND_KMH} km/h u olas de más de {dec(WAVE_NOGO_M)} m.</div>
        </div>
      )}

      <details class="card">
        <summary>Ver hora por hora</summary>
        {hasTide && <ScoreChart day={day} hours={hours} extremes={dayExt} windows={windows} slots={slots} sun={sun} catches={catchTimes} />}
        <ModelTable hours={hours} slots={slots} mode={mode} />
        <ul class="day-info">
          <li>Sol: sale {sun.sunrise ? hhmm(sun.sunrise) : '–'}, se pone {sun.sunset ? hhmm(sun.sunset) : '–'}</li>
          <li>
            Luna: {Math.round(moon.fraction * 100)} % iluminada, {moon.phase < 0.5 ? 'creciente' : 'menguante'}
            {moon.transit && ` · tránsito ${hhmm(moon.transit)}`}
            {moon.lowerTransit && ` · tránsito inferior ${hhmm(moon.lowerTransit)}`}
            {moon.rise && ` · sale ${hhmm(moon.rise)}`}
            {moon.set && ` · se pone ${hhmm(moon.set)}`}
          </li>
          <li>Temperatura del mar: {sst == null ? 'sin dato' : `${dec(sst)} °C`}</li>
        </ul>
      </details>
    </section>
  )
}

function Hero({ windows: all, slots, isToday, nowIso }) {
  const windows = heroWindows(all, nowIso, isToday)
  const [best, ...rest] = windows
  const nowSlot = isToday ? slotNow(slots, nowIso) : null
  const phase = nowSlot && phaseLabel(nowSlot.phase)
  if (!best) {
    return (
      <section class="card hero">
        <p class="hero-label">{all.length ? 'Ya pasaron las ventanas de hoy.' : 'Sin ventana recomendable este día.'}</p>
        {nowSlot?.score != null && <p class="muted">Ahora: {nowSlot.score}/10{phase && ` · ${phase}`}</p>}
      </section>
    )
  }
  return (
    <section class="card hero">
      <p class="hero-label">{best.weak ? 'Día flojo · mejor tramo' : 'Anzuelos al agua'}</p>
      <p class="hero-time">{hhmm(best.start)}</p>
      <p class="hero-until">
        hasta las {hhmm(best.end)}
        {isToday && <strong> · {countdown(nowIso, best.start, best.end)}</strong>}
      </p>
      <p><span class="score-chip">{best.score}/10</span> Por qué: {best.reason}</p>
      {rest.map((w) => (
        <p key={w.start} class="muted">
          {w.start > best.start ? 'Después' : 'Antes'}: {hhmm(w.start)}–{hhmm(w.end)} · {w.score}/10
        </p>
      ))}
      {nowSlot?.score != null && <p class="muted">Ahora: {nowSlot.score}/10{phase && ` · ${phase}`}</p>}
    </section>
  )
}
