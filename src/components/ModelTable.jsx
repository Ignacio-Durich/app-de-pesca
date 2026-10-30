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
      <ul class="muted small keys">
        <li><strong>ECMWF, GFS, ICON:</strong> viento medio en km/h según tres modelos del tiempo: el europeo (ECMWF), el de EE.UU. (GFS, de NOAA) y el alemán (ICON, del DWD).</li>
        <li><strong>Ráf.:</strong> ráfagas, en km/h. <strong>Dir.:</strong> de dónde viene el viento (N = del norte).</li>
        <li><strong>Lluvia:</strong> probabilidad de lluvia. <strong>°C:</strong> temperatura del aire. <strong>hPa:</strong> presión.{boat && <> <strong>Ola:</strong> altura de las olas.</>}</li>
        <li><strong>?</strong> (en naranja): pronóstico incierto, los modelos difieren en más de {UNCERTAIN_KMH} km/h.</li>
        <li><strong>–</strong>: ese modelo todavía no llega a ese día. ICON pronostica unos 7 días; se completa a medida que se acerca la fecha.</li>
      </ul>
    </div>
  )
}
