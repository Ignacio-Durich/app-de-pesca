// Tabla compacta por hora (estilo Windguru): viento de cada modelo + datos del resto.
import { median, circularMean } from '../score/score.js'
import { cardinal } from '../score/windows.js'
import { UNCERTAIN_KMH } from '../score/config.js'
import { hhmm, dec } from '../forecast/view.js'

const n = (v, d = 0, unit = '') => (v == null ? '–' : dec(v, d) + unit)
const med = (o) => median(Object.values(o))

export function ModelTable({ hours, slots, mode }) {
  const boat = mode === 'embarcado'
  return (
    <div class="table-wrap">
      <table class="mt">
        <thead>
          <tr>
            <th>Hora</th><th>ECMWF</th><th>GFS</th><th>ICON</th><th>Ráf.</th><th>Dir.</th>
            <th>Lluvia</th><th>°C</th><th>hPa</th>{boat && <th>Ola</th>}
          </tr>
        </thead>
        <tbody>
          {hours.map((h) => {
            const unc = slots[2 * +h.t.slice(11, 13)]?.uncertain
            const dir = circularMean(Object.values(h.dir))
            return (
              <tr key={h.t} class={unc ? 'unc' : ''}>
                <td>{hhmm(h.t)}{unc && ' ?'}</td>
                <td>{n(h.wind.ecmwf)}</td><td>{n(h.wind.gfs)}</td><td>{n(h.wind.icon)}</td>
                <td>{n(med(h.gust))}</td><td>{dir == null ? '–' : cardinal(dir)}</td>
                <td>{n(med(h.rain), 0, '%')}</td><td>{n(med(h.temp))}</td><td>{n(med(h.pressure))}</td>
                {boat && <td>{n(h.wave, 1, ' m')}</td>}
              </tr>
            )
          })}
        </tbody>
      </table>
      <p class="muted small">Viento en km/h. <strong>?</strong> = pronóstico incierto: los modelos difieren en más de {UNCERTAIN_KMH} km/h.</p>
    </div>
  )
}
