# App de Pesca — Fase 1 (San Blas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una PWA offline-first para el viaje del 7/11 a Bahía San Blas: viajes por link, pronóstico con puntaje y ventanas, checklist, itinerario, capturas, mapa offline con profundidad y GPS, emergencias y guía de especies.

**Architecture:** Preact + Vite, sin servidor propio. El teléfono pide directo a Open-Meteo, AWS (terrarium), R2 (mapa `.pmtiles`) y Supabase. Toda pantalla lee de IndexedDB. La red solo trae datos nuevos y vacía una cola de escrituras. La lógica pura (marea, puntaje, ventanas, luna, profundidad, navegación, teselas) vive en módulos sin DOM con tests en Vitest.

**Tech Stack:** Vite, Preact, Vitest, fake-indexeddb (tests), `@supabase/supabase-js`, `idb-keyval`, `leaflet`, `protomaps-leaflet`, `suncalc@^2`, `vite-plugin-pwa`. Hosting: Cloudflare Pages + R2. CLI: `wrangler`, `pmtiles` (go-pmtiles).

**Spec:** `docs/superpowers/specs/2026-10-29-app-de-pesca-design.md`. La fase 2 (río, §8) tiene su propio plan después del viaje.

## Global Constraints

- Nada de datos inventados. Todo valor del mundo real sale de la spec (§9) o de una fuente nueva citada en el código o en `species.json`. Los valores **[diseño]** viven solo en `src/score/config.js` o en las constantes indicadas.
- Ninguna pantalla espera a la red: siempre renderiza desde lo local y después refresca.
- Las horas de Open-Meteo vienen en hora local del lugar (`timezone=America/Argentina/Buenos_Aires`) como texto sin offset. Nunca se parsean con la zona del dispositivo; se usan los helpers de `src/lib/time.js`. Para pasar a UTC (suncalc) se usa `utc_offset_seconds` de la respuesta.
- No se usan teselas de `tile.openstreetmap.org` (su política prohíbe offline). Mapa base: solo el `.pmtiles` propio en R2.
- Header `x-trip-id` en todo pedido a Supabase (`global.headers`). Supabase Realtime no se usa.
- Textos de la interfaz en español rioplatense. Atribución visible: Open-Meteo, OpenStreetMap/Protomaps y "Terrain Tiles (AWS Open Data)".
- Dependencias: solo las del Tech Stack. `suncalc` en versión ≥2 (la 1.9 no trae `transit`).

## Review Focus

1. **Horas de pleno a medianoche:** a las 00:30, la fase de marea depende del extremo del día anterior. `scoreDay` usa los extremos de toda la serie (se pide con `past_days=1`), nunca solo los del día. Test en Task 5.
2. **Modelos faltantes:** ICON se corta a unos 7 días y cualquier modelo puede traer `null`. La mediana usa los presentes. Si no hay ninguno, el factor viento es `null` y la hora muestra "sin datos de viento" con el puntaje calculado sin viento, renormalizando los pesos (nunca 0 por falta de dato). Test en Task 5.
3. **Cola que sobrevive al cierre de la app:** una captura con foto cargada sin señal sigue en la cola después de cerrar y reabrir. El reintento no duplica filas (upsert por `id` generado en el cliente). Test en Task 7.
4. **"Preparar viaje" cortado:** al relanzarlo no vuelve a bajar lo que ya está y termina. Test en Task 13.
5. **Link abierto por primera vez sin señal:** muestra "Abrí este link una vez con señal para descargar el viaje", no una pantalla vacía ni un error. Test en Task 8.

---

### Task 1: Proyecto base, PWA y deploy en Cloudflare Pages

**Files:**
- Create: `package.json`, `vite.config.js`, `index.html`, `src/main.jsx`, `src/app.jsx`, `.gitignore`, `.env.example`, `test/smoke.test.js`

**Interfaces:**
- Produces: app Preact montada en `#app`; `src/app.jsx` exporta `App` con rutas `/` (Home) y `/t/:id` (Trip); env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MAP_BASE_URL`.

- [ ] **Step 1:** `git init`, crear el proyecto Vite + Preact (`npm create vite@latest . -- --template preact`) y agregar `vitest`, `fake-indexeddb`, `vite-plugin-pwa`.
- [ ] **Step 2:** Test `test/smoke.test.js`: `expect(1 + 1).toBe(2)`. Correr `npx vitest run` → PASS.
- [ ] **Step 3:** En `vite.config.js`, `VitePWA({ registerType: 'autoUpdate', workbox: { globPatterns: ['**/*.{js,css,html,json,svg,png}'] }, manifest: { name: 'App de Pesca', short_name: 'Pesca', display: 'standalone', lang: 'es-AR', start_url: '/', icons: [...] } })`. Íconos 192 y 512 px simples.
- [ ] **Step 4:** Router mínimo en `src/app.jsx` con `location.pathname` y `history.pushState` (sin librería). `/t/:id` muestra el placeholder "Viaje <id>".
- [ ] **Step 5:** `npm run build`, después `npx wrangler pages deploy dist --project-name app-de-pesca` (el usuario hace `wrangler login`). Abrir `https://app-de-pesca.pages.dev/t/abc` directo: tiene que cargar la app. Si da 404, agregar `public/_redirects` con `/* /index.html 200`.
- [ ] **Step 6:** Commit `chore: scaffold PWA and Cloudflare Pages deploy`.

### Task 2: Tiempo local y detección de mareas

**Files:**
- Create: `src/lib/time.js`, `src/forecast/tides.js`, `test/fixtures/marine-sanblas.json`, `test/tides.test.js`

**Interfaces:**
- Produces:
  - `parseLocal(iso: string) -> number` (minutos; trata el texto como UTC para no depender del dispositivo)
  - `formatLocal(min: number) -> 'YYYY-MM-DDTHH:MM'`
  - `localToUtcDate(iso: string, utcOffsetSeconds: number) -> Date`
  - `findExtremes(series: {t: string, sea: number|null}[]) -> {t: string, h: number, type: 'high'|'low'}[]`
  - `tidePhaseAt(tMin: number, extremes) -> {rising: boolean, sincePrevMin: number, toNextMin: number, prev, next} | null`

- [ ] **Step 1:** Guardar el fixture real:
  `curl "https://marine-api.open-meteo.com/v1/marine?latitude=-40.56&longitude=-62.24&hourly=sea_level_height_msl,wave_height,sea_surface_temperature&timezone=America/Argentina/Buenos_Aires&start_date=2026-11-06&end_date=2026-11-08&cell_selection=sea" > test/fixtures/marine-sanblas.json`
  (Si ya pasó la fecha, usar el archivo histórico de Open-Meteo con el mismo rango.)
- [ ] **Step 2:** Tests:
  - `findExtremes` sobre el 7/11 da 4 extremos en orden high/low/high/low, a ≤20 min de tide-forecast: `2026-11-07T00:42`, `07:05`, `13:09`, `19:09`.
  - Ignora `null` sin cortar la serie.
  - `tidePhaseAt(parseLocal('2026-11-07T12:00'), ext)` da `rising: true` y `toNextMin` entre 50 y 90.
  - `parseLocal('2026-11-07T00:00') - parseLocal('2026-11-06T23:30') === 30`.
- [ ] **Step 3:** Correr → FAIL.
- [ ] **Step 4:** Implementar. Extremo = punto `i` con `sea[i]` mayor (o menor) que sus dos vecinos no nulos. Refinamiento parabólico con 3 puntos (y0, y1, y2 a −60, 0 y +60 min): `offset = 30·(y0−y2)/(y0−2·y1+y2)` minutos, `h = y1 − (y0−y2)·offset/240`.
- [ ] **Step 5:** Correr → PASS. Commit `feat: tide extremes from Open-Meteo sea level`.

### Task 3: Descarga y normalización del pronóstico

**Files:**
- Create: `src/forecast/fetch.js`, `test/fixtures/weather-sanblas.json`, `test/forecast.test.js`

**Interfaces:**
- Consumes: `parseLocal`.
- Produces:
  - `buildUrls(lat, lon) -> {marine: string, weather: string}`, siempre con `past_days=1&forecast_days=16`. Marine: `hourly=sea_level_height_msl,wave_height,sea_surface_temperature&cell_selection=sea`. Weather: `hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation_probability,temperature_2m,surface_pressure&daily=sunrise,sunset&models=ecmwf_ifs025,gfs_seamless,icon_seamless`. Ambas con `timezone=America/Argentina/Buenos_Aires`.
  - `normalize(marine, weather, fetchedAt: string) -> Forecast`:
    ```
    Forecast = { fetchedAt, utcOffsetSeconds, lat, lon,
      hours: [{ t, sea, wave, sst,
                wind:{ecmwf,gfs,icon}, gust:{…}, dir:{…}, rain:{…}, temp:{…}, pressure:{…} }],
      days: { 'YYYY-MM-DD': { sunrise: 'YYYY-MM-DDTHH:MM', sunset } },
      lastTideT: string|null, lastWindT: string|null }
    ```
  - `fetchForecast(lat, lon, fetchImpl = fetch) -> Promise<Forecast>`
  - `MODELS = { ecmwf: 'ecmwf_ifs025', gfs: 'gfs_seamless', icon: 'icon_seamless' }`

- [ ] **Step 1:** Guardar el fixture de clima con la URL de `buildUrls(-40.55, -62.23)`. Recortar `marine-sanblas.json` y el de clima a 6/11–9/11 para que pesen poco.
- [ ] **Step 2:** Tests:
  - `normalize` arma `hours[i].wind.icon` desde `wind_speed_10m_icon_seamless`;
  - `days['2026-11-08'].sunrise` sale de `sunrise_ecmwf_ifs025`, o del primer modelo con dato;
  - `lastTideT` es el último `t` con `sea != null`;
  - `buildUrls` contiene `models=ecmwf_ifs025,gfs_seamless,icon_seamless` y `cell_selection=sea`;
  - `fetchForecast` con un `fetchImpl` falso que rechaza propaga el error.
- [ ] **Step 3:** FAIL → implementar → PASS.
- [ ] **Step 4:** Commit `feat: fetch and normalize Open-Meteo marine + 3-model weather`.

### Task 4: Luna

**Files:**
- Create: `src/score/moon.js`, `test/moon.test.js`

**Interfaces:**
- Consumes: `localToUtcDate`.
- Produces: `moonDay(dateIso: 'YYYY-MM-DD', lat, lon, utcOffsetSeconds) -> {rise?: string, set?: string, transit?: string, lowerTransit?: string, fraction: number, phase: number}` (horas en local `'YYYY-MM-DDTHH:MM'`).

- [ ] **Step 1:** `npm i suncalc@^2`. Leer en el README de suncalc 2 la firma exacta de `getMoonTimes` (parámetro de UTC u offset) antes de escribir el test.
- [ ] **Step 2:** Tests:
  - `moonDay('2026-11-08', -40.55, -62.23, -10800)` devuelve `fraction` entre 0 y 1 y `transit` con formato local válido;
  - una fecha de luna llena publicada (tomarla de una efeméride citada en el test) da `fraction > 0.95`.
- [ ] **Step 3:** FAIL → implementar con `getMoonTimes` y `getMoonIllumination` → PASS. Commit `feat: moon times and illumination`.

### Task 5: Puntaje y ventanas

**Files:**
- Create: `src/score/config.js`, `src/score/score.js`, `src/score/windows.js`, `test/score.test.js`, `test/windows.test.js`

**Interfaces:**
- Consumes: `Forecast`, `findExtremes`, `tidePhaseAt`, `moonDay`, `parseLocal`.
- Produces:
  - `config.js`: exporta `WEIGHTS = {tide: 0.5, wind: 0.3, moon: 0.1, weather: 0.1}`, `TIDE`, `WIND`, `WAVE_NOGO_M = 1.2`, `NOGO_WIND_KMH = 25`, `UNCERTAIN_KMH = 10`, `NIGHT_CAP = 2`, `WINDOW_MIN = 7`, con los valores exactos de spec §4.
  - `median(values: (number|null)[]) -> number|null`
  - `tideFactor(phase, mode: 'costa'|'embarcado') -> number`
  - `windFactor(windKmh: number|null, gustKmh: number|null, waveM: number|null, mode) -> number|null`
  - `moonFactor(tMin, moon) -> number`
  - `scoreDay(forecast, extremes, dateIso, mode, {nightFishing: boolean}) -> Slot[]`, con `Slot = {t, score, factors:{tide, wind, moon, weather}, night, noGo, uncertain, windKmh, dirDeg}`, cada 30 min (los :30 interpolan linealmente las horas vecinas).
  - `findWindows(slots, {nightFishing}) -> {start, end, score, reason, weak}[]` (máximo 3, ordenadas por puntaje).

- [ ] **Step 1:** Tests de factores con los valores de spec §4:
  - costa, 90 min antes de la pleamar → 1.0; 30 min después de la pleamar → 1.0; 90 min después → 0.5; mitad de la bajante → 0.25; 30 min de la bajamar → 0.2;
  - embarcado, 30 min de un extremo → 1.0; 90 min → 0.6; 3 h → 0.2;
  - `windFactor(14, 18, null, 'costa') === 1.0` (`max(14, 0.7·18 = 12.6) = 14`, cae en ≤15);
  - `windFactor(10, 40, null, 'costa') === 0.2` (`max(10, 0.7·40 = 28) = 28`, cae en ≤35);
  - `windFactor(11, 0, 1.3, 'embarcado') === 0`;
  - `median([10, null, 30]) === 20`; `median([null, null]) === null`.
- [ ] **Step 2:** Tests de `scoreDay` con los fixtures del 7/11:
  - de noche y sin pesca nocturna, `score ≤ 2` y `night: true`; con `nightFishing: true` no hay tope;
  - el slot `2026-11-07T00:30` tiene `factors.tide` no nulo (Review Focus 1);
  - con todos los `wind` en `null`, `factors.wind === null` y el puntaje sale de los demás factores con pesos renormalizados (Review Focus 2);
  - si dos modelos difieren en más de 10 km/h, `uncertain: true`;
  - en embarcado, con viento de más de 25 km/h de día, `noGo: true`.
- [ ] **Step 3:** Tests de `findWindows`:
  - slots `[6,7,8,8,7,5]` dan una ventana del 2.º al 5.º slot, con fin = inicio del 6.º;
  - ningún slot ≥7 da una sola ventana `weak: true` con el mejor tramo;
  - de noche sin pesca nocturna no hay ventana;
  - `reason` incluye la fase de marea ("fin de creciente + repunte", "creciente", etc.) y el viento promedio redondeado con su punto cardinal (8 rumbos).
- [ ] **Step 4:** FAIL → implementar → PASS. La primera y la última hora de luz suman +1 con tope 10.
- [ ] **Step 5:** Commit `feat: fishing score and windows`.

### Task 6: Supabase — esquema, RLS, Storage y cliente

**Files:**
- Create: `supabase/migrations/001_init.sql`, `supabase/tests/rls.sql`, `src/lib/db.js`

**Interfaces:**
- Produces: `makeClient(tripId: string|null) -> SupabaseClient` (con `global.headers: {'x-trip-id': tripId}` cuando hay id). Las tablas y columnas son exactamente las de spec §3.2.

- [ ] **Step 1:** El usuario elige o crea el proyecto Supabase (sugerido: nuevo, región `sa-east-1`) y carga `VITE_SUPABASE_URL` y la clave publicable en `.env.local`.
- [ ] **Step 2:** Escribir `001_init.sql`: tablas de §3.2, RLS activado en todas y estas políticas:
  ```sql
  -- helper
  create function public.req_trip() returns uuid language sql stable as
  $$ select nullif(current_setting('request.headers', true)::json->>'x-trip-id','')::uuid $$;
  -- trips
  create policy trips_ins on trips for insert to anon with check (true);
  create policy trips_sel on trips for select to anon using (id = req_trip());
  create policy trips_upd on trips for update to anon using (id = req_trip());
  -- checklist_items, itinerary_items, catches: select/insert/update/delete con trip_id = req_trip()
  -- spots, soundings: select/insert/update to anon using (true) with check (true)
  insert into storage.buckets (id, name, public) values ('catch-photos','catch-photos', true);
  create policy photos_ins on storage.objects for insert to anon
    with check (bucket_id = 'catch-photos' and (storage.foldername(name))[1] = req_trip()::text);
  ```
- [ ] **Step 3:** `supabase/tests/rls.sql`, corriendo como `anon`:
  - con el header de un viaje A ve las filas de A y 0 de B;
  - sin header ve 0;
  - un insert en `checklist_items` con `trip_id` de B falla.
  
  Aplicar la migración y correr el test (Supabase MCP `apply_migration` / `execute_sql`, o `psql`). Esperado: los conteos indicados.
- [ ] **Step 4:** Prueba de punta a punta de Storage (spec §7): un script `node` que con `makeClient(A)` sube `A/test.jpg` (OK) y `B/test.jpg` (rechazado por RLS). Borrar los archivos de prueba.
- [ ] **Step 5:** Commit `feat: supabase schema, RLS by x-trip-id, storage policy`.

### Task 7: Capa local y cola de escrituras

**Files:**
- Create: `src/lib/local.js`, `src/lib/queue.js`, `src/lib/repo.js`, `test/queue.test.js`, `test/repo.test.js`

**Interfaces:**
- Consumes: `makeClient`.
- Produces:
  - `localGet(key)`, `localSet(key, value)`, `localDel(key)` (idb-keyval). Claves: `forecast:<lat>,<lon>`, `rows:<table>:<scope>`, `queue`, `region:<id>`, `prepare:<tripId>`.
  - `enqueue(op: {id, table, kind: 'upsert'|'delete', row?, photo?: {path, blob}})`
  - `flush(client) -> Promise<{done: number, failed: number}>`. Sube la foto primero y después hace upsert de la fila. Un fallo deja la op con `nextTry = now + min(2^n·10 s, 10 min)` **[diseño]**.
  - `pending() -> Promise<op[]>`
  - `listRows(table, scope) -> Promise<row[]>`, `saveRow(table, scope, row)` (aplica local y encola), `deleteRow(table, scope, id)`, `pull(client, table, scope)` (reemplaza lo local salvo las filas con ops pendientes). `scope` = tripId, o `'near:<lat>,<lon>'` para spots y sondeos.
  - `startAutoFlush(getClient)`: al abrir, en el evento `online` y cada 60 s.

- [ ] **Step 1:** Tests con `fake-indexeddb/auto` y un cliente falso:
  - `saveRow` hace que `listRows` devuelva la fila al instante y `pending()` tenga 1;
  - un `flush` con el cliente fallando deja 1 pendiente con `nextTry` futuro;
  - al recargar el módulo (simula reabrir la app) sigue 1 pendiente con su Blob (Review Focus 3);
  - dos `flush` exitosos sobre la misma op llaman upsert con el mismo `id` y dejan 0 pendientes;
  - `pull` no pisa una fila con op pendiente.
- [ ] **Step 2:** FAIL → implementar → PASS. Commit `feat: local store and durable write queue`.

### Task 8: Viajes, link y "¿Quién sos?"

**Files:**
- Create: `src/trips/trips.js`, `src/screens/Home.jsx`, `src/screens/WhoAreYou.jsx`, `src/screens/TripShell.jsx`, `test/trips.test.js`
- Modify: `src/app.jsx`

**Interfaces:**
- Consumes: `makeClient`, `repo`, `local`.
- Produces:
  - `createTrip({name, placeName, lat, lon, startDate, endDate, members, water: 'mar', nightFishing}) -> Promise<string>` (UUID del cliente, insert con header del mismo id)
  - `loadTrip(id) -> Promise<{trip, source: 'local'|'remote'} | {trip: null, offlineFirstOpen: true}>`
  - `getMe(tripId) / setMe(tripId, name)` (localStorage `me:<tripId>`)
  - `recentTrips()` (localStorage `recentTrips`)
  - `TripShell`: barra superior con botón Emergencias y pestañas Pronóstico, Mapa, Checklist, Itinerario, Capturas y Especies.

- [ ] **Step 1:** Tests:
  - `loadTrip` sin red y sin copia local devuelve `offlineFirstOpen: true` (Review Focus 5);
  - con copia local, devuelve `source: 'local'` sin esperar a la red;
  - `setMe` y `getMe` se guardan por viaje.
- [ ] **Step 2:** FAIL → implementar → PASS.
- [ ] **Step 3:** Pantallas:
  - Home: crear viaje (formulario con lugar por lat/lon o tocando un mapa simple, fechas, integrantes, pesca nocturna) y lista de recientes;
  - WhoAreYou: botones por integrante;
  - con `offlineFirstOpen`, el texto exacto "Abrí este link una vez con señal para descargar el viaje."
- [ ] **Step 4:** Crear el viaje real "San Blas" (−40.55, −62.23; 7 al 9/11; Nacho, Fernando, Jero, Manu, El; sin pesca nocturna) y verificar el link en dos teléfonos.
- [ ] **Step 5:** Commit `feat: trips, share link and member picker`.

### Task 9: Pantalla Pronóstico (offline) y caché del pronóstico

**Files:**
- Create: `src/forecast/cache.js`, `src/screens/Forecast.jsx`, `src/components/ScoreChart.jsx`, `src/components/ModelTable.jsx`, `test/cache.test.js`

**Interfaces:**
- Consumes: `fetchForecast`, `findExtremes`, `scoreDay`, `findWindows`, `moonDay`, `localGet/Set`.
- Produces:
  - `getForecast(trip, {now, fetchImpl}) -> Promise<{forecast, ageHours, refreshed: boolean, error?}>`: devuelve lo local al instante y refresca si tiene más de 1 h **[diseño]**.
  - `ageLabel(ageHours) -> {text, amber: boolean}`: ámbar con más de 24 h.

- [ ] **Step 1:** Tests de `cache.js`:
  - con copia de 30 min no pide a la red;
  - con copia de 2 h pide; si la red falla devuelve la copia con `error` y `refreshed: false`;
  - sin copia y sin red devuelve `forecast: null`;
  - `ageLabel(30).amber === true` y `ageLabel(30).text` incluye "30 h".
- [ ] **Step 2:** FAIL → implementar → PASS.
- [ ] **Step 3:** UI según spec §2.2:
  - selector de día (días del viaje) y Costa/Embarcado;
  - ventanas arriba y gráfico de barras por hora con la curva de marea (SVG a mano, sin librería);
  - tabla de los 3 modelos con marca de "incierto", sol y luna, temperatura del mar, cartel "No conviene salir";
  - antigüedad visible;
  - sin datos: "Sin datos todavía. Abrí la app con señal antes de salir.";
  - día sin marea: "El pronóstico de marea todavía no llega a esta fecha."
- [ ] **Step 4:** Deploy. Verificar en el celu: el 8/11 muestra extremos a ±20 min de 01:28 / 07:57 / 14:08 / 19:59, y en modo avión la pantalla sigue igual.
- [ ] **Step 5:** Commit `feat: forecast screen with offline cache`.

### Task 10: Checklist e itinerario

**Files:**
- Create: `src/screens/Checklist.jsx`, `src/screens/Itinerary.jsx`

**Interfaces:**
- Consumes: `listRows/saveRow/deleteRow/pull` con las tablas `checklist_items` e `itinerary_items`, scope = tripId.

- [ ] **Step 1:** Checklist: agregar (texto y "quién lleva" de los integrantes), tildar y borrar. Itinerario: agregar con fecha y hora, título y notas, ordenado por `starts_at`. Indicador global "N pendientes" (de `pending()`) en `TripShell`.
- [ ] **Step 2:** Verificación manual en dos teléfonos: con señal, un tilde en A aparece en B al reabrir. En modo avión en A, tildar, volver a tener señal: se sube y el contador vuelve a 0.
- [ ] **Step 3:** Commit `feat: shared checklist and itinerary`.

### Task 11: Emergencias y formato de coordenadas

**Files:**
- Create: `src/map/nav.js`, `src/data/emergency.json`, `src/screens/Emergency.jsx`, `test/nav.test.js`

**Interfaces:**
- Produces:
  - `distanceBearing(lat1, lon1, lat2, lon2) -> {km: number, deg: number}` (haversine, R = 6371.0088)
  - `toDegMin(lat, lon) -> string`
  - `emergency.json = [{label: 'Prefectura Naval — Emergencias náuticas', value: '106', kind: 'tel'}, {label: 'VHF canal 16', value: '156,800 MHz', kind: 'radio'}]`

- [ ] **Step 1:** Tests:
  - `distanceBearing(0, 0, 0, 1)` da `km ≈ 111.2` (±0.1) y `deg ≈ 90`;
  - `distanceBearing(-40.55, -62.23, -40.90, -61.80)` da `km ≈ 53.18` (±0.1) y `deg ≈ 137.2` (±0.5);
  - `toDegMin(-40.55, -62.23) === "40°33,0' S  62°13,8' O"`.
- [ ] **Step 2:** FAIL → implementar → PASS.
- [ ] **Step 3:** Pantalla: posición GPS en letra grande (`watchPosition`), botón para llamar al 106 (`tel:106`), el canal 16 y qué datos pasar (posición, cantidad de personas, situación). Si falta el permiso de GPS, explicar cómo activarlo. Todo funciona en modo avión.
- [ ] **Step 4:** Commit `feat: emergency screen`.

### Task 12: Capturas

**Files:**
- Create: `src/catches/conditions.js`, `src/catches/photo.js`, `src/screens/Catches.jsx`, `test/conditions.test.js`

**Interfaces:**
- Consumes: `Forecast`, `findExtremes`, `tidePhaseAt`, `median`, `saveRow`, `enqueue` (con `photo`).
- Produces:
  - `conditionsAt(forecast, extremes, tLocal: string) -> {tide_phase: 'creciente'|'bajante'|'pleamar'|'bajamar', tide_height_m, wind_kmh, wind_dir_deg}` (pleamar o bajamar si está a ±30 min de un extremo **[diseño]**)
  - `resizePhoto(blob, maxSide = 1600, quality = 0.8) -> Promise<Blob>` (canvas, solo navegador)

- [ ] **Step 1:** Tests de `conditionsAt` con los fixtures del 7/11:
  - a las 10:00 da `creciente`, con altura interpolada entre las horas vecinas y viento igual a la mediana de los modelos;
  - a 10 min de un extremo da `pleamar` o `bajamar`.
- [ ] **Step 2:** FAIL → implementar → PASS.
- [ ] **Step 3:** Pantalla: formulario (especie de `species.json` o texto libre, cm, foto, quién, devuelto); lista; ranking por cantidad y mayor medida; resumen por fase de marea. La foto se guarda en `catch-photos/<tripId>/<uuid>.jpg` a través de la cola.
- [ ] **Step 4:** Manual: en modo avión cargar una captura con foto, cerrar la app, reabrir con señal y verificar que la foto y la fila están en Supabase.
- [ ] **Step 5:** Commit `feat: catches with auto conditions and offline photos`.

### Task 13: Mapa base offline y "Preparar viaje"

**Files:**
- Create: `scripts/extract-region.sh`, `src/data/regions.json`, `src/map/basemap.js`, `src/map/tiles.js`, `src/prepare/prepare.js`, `src/screens/Prepare.jsx`, `test/tiles.test.js`, `test/prepare.test.js`

**Interfaces:**
- Consumes: `getForecast`, `pull`, `localGet/Set`.
- Produces:
  - `regions.json = [{id: 'san-blas', name: 'Bahía San Blas', bbox: [-62.50, -40.80, -61.95, -40.35], url: '<VITE_MAP_BASE_URL>/san-blas.pmtiles', bytes: <medido>}]` (bbox **[diseño]**)
  - `regionFor(lat, lon) -> region|null`
  - `downloadRegion(region, onProgress) -> Promise<void>` (Blob en `region:<id>`)
  - `basemapLayer(region) -> Promise<L.Layer>`: `new PMTiles(new FileSource(new File([blob], id + '.pmtiles')))` pasado a `protomaps-leaflet`
  - `tilesInRadius(lat, lon, radiusKm, zMin, zMax) -> {z, x, y}[]`
  - `prepareTrip(trip, {onProgress, cache}) -> Promise<PrepareStatus>`, con `PrepareStatus = {forecastAt, regionAt, depth: {done, total}, dataAt}` guardado en `prepare:<tripId>`
  - `needsReminder(trip, status, nowLocal) -> boolean`

- [ ] **Step 1:** Script: `pmtiles extract <URL del build de Protomaps, ver docs.protomaps.com/basemaps/downloads> san-blas.pmtiles --bbox=-62.50,-40.80,-61.95,-40.35`, y después `wrangler r2 object put pesca-mapas/san-blas.pmtiles --file san-blas.pmtiles`. Configurar CORS del bucket (GET desde `https://app-de-pesca.pages.dev`) y el acceso público. **Anotar el tamaño real en `regions.json` y en la spec §3.1.**
- [ ] **Step 2:** Confirmar en el README de `protomaps-leaflet` que `leafletLayer({url})` acepta una instancia de `PMTiles`. Si no, usar la opción que documente para fuentes propias.
- [ ] **Step 3:** Tests de `tilesInRadius`:
  - incluye la tesela del centro en cada zoom;
  - no tiene duplicados;
  - la cantidad crece con el zoom;
  - todas las teselas tocan el cuadrado de lado 2·radio.
- [ ] **Step 4:** Tests de `prepareTrip` con dependencias falsas:
  - si se corta en la tesela 5 de 10, al relanzarlo pide solo las 5 restantes (Review Focus 4);
  - `needsReminder` es true a 40 h del viaje con `forecastAt` de hace 13 h, false con 2 h, true si nunca se preparó;
  - a 72 h del viaje es false.
- [ ] **Step 5:** FAIL → implementar → PASS. "Preparar viaje" guarda el pronóstico, la región, las teselas de profundidad (zoom 8–12, radio 80 km **[diseño]**, en la Cache API `depth-v1`), pull de todas las tablas, miniaturas de fotos y el estado. La pantalla muestra el tamaño antes de bajar, el progreso y "Listo para offline ✓ · datos de hoy HH:MM". El cartel de recordatorio va en `TripShell`. En el primer uso: guía de "Agregar a pantalla de inicio" en iPhone y `navigator.storage.persist()`.
- [ ] **Step 6:** Commit `feat: offline basemap region and prepare-trip`.

### Task 14: Mapa, spots, GPS, profundidad y sondeos

**Files:**
- Create: `src/map/depth.js`, `src/map/depthLayer.js`, `src/screens/Map.jsx`, `test/depth.test.js`

**Interfaces:**
- Consumes: `basemapLayer`, `distanceBearing`, `conditionsAt`, repo (`spots` y `soundings` con scope `near:<lat>,<lon>`).
- Produces:
  - `decodeTerrarium(r, g, b) -> number` (m)
  - `soundingDatum(measuredM, tideHeightM) -> number` (= medido − marea)
  - `depthAt(lat, lon, cache) -> Promise<number|null>` (píxel de la tesela z12 cacheada; `null` si no está o si da ≥ 0)
  - `depthLayer(cache) -> L.GridLayer` (bandas de color cada 5 m **[diseño]** entre 0 y 60 m, con borde de 1 px donde cambia la banda; tierra transparente)

- [ ] **Step 1:** Tests:
  - `decodeTerrarium(127, 219, 26) ≈ -36.9` (±0.01), el valor probado en San Blas;
  - `decodeTerrarium(128, 0, 0) === 0`;
  - `soundingDatum(8.5, 1.2) === 7.3`.
- [ ] **Step 2:** FAIL → implementar → PASS.
- [ ] **Step 3:** Pantalla Mapa:
  - mapa base offline;
  - capa de profundidad que se prende y se apaga, con el aviso fijo "Profundidad orientativa, no apta para navegar";
  - tocar el mapa muestra la profundidad de ese punto;
  - spots a menos de 50 km **[diseño]**;
  - posición GPS con la profundidad estimada debajo;
  - "Marcar punto": spot con la posición actual y profundidad opcional;
  - "Cargar sondeo": profundidad medida; se guarda con la marea de `conditionsAt` y `depth_datum_m`;
  - "Ir a punto": distancia y rumbo con flecha. La flecha usa `DeviceOrientationEvent`, con permiso por toque en iOS mediante `requestPermission()`; sin brújula se muestran solo los grados.
- [ ] **Step 4:** Manual en modo avión después de "Preparar viaje": el mapa, la profundidad, marcar punto, sondeo e "Ir a punto" funcionan.
- [ ] **Step 5:** Commit `feat: map with spots, GPS tools, depth and soundings`.

### Task 15: Especies, reglamento y spots iniciales

**Files:**
- Create: `src/data/species.json`, `src/screens/Species.jsx`, `test/species.test.js`

**Interfaces:**
- Produces: `species.json = [{id, name, waters: ['mar'], season: string|null, bait: string|null, minSizeCm: number|null, dailyLimit: string|null, release: string|null, verified: boolean, sources: [{title, url}]}]` y `license = {url, notes, sources}`.

- [ ] **Step 1:** **Pedir permiso al usuario** para descargar el PDF oficial `reglamento-pesca-deportiva-2026.pdf` (Google Drive enlazado desde gba.gob.ar, pesca deportiva). Leerlo y comparar con los valores de la Disposición 217/07 de spec §2.7. Si difieren, gana el 2026 y se anota en la spec §9.
- [ ] **Step 2:** Test `species.test.js`: toda entrada con `verified: true` tiene al menos una fuente con `url`; toda entrada con `minSizeCm` o `release` no nulos tiene una fuente oficial (dominio `gba.gob.ar` o `normas.gba.gob.ar`).
- [ ] **Step 3:** Cargar solo lo verificado:
  - especies de la tesis de Llompart 2011, más cazón y pez elefante;
  - tallas (corvina rubia 35, pescadilla de red 30), cupos y devoluciones según el reglamento vigente;
  - licencia: link al trámite en línea, la dirección presencial y "costo no publicado".
- [ ] **Step 4:** Spots iniciales de San Blas: solo los que tengan una fuente pública citada en `notes`, cargados como filas de `spots`. Si no hay fuentes suficientes, se deja vacío y el grupo los carga en el viaje.
- [ ] **Step 5:** Test → PASS. Pantalla con ficha por especie y fuentes clickeables. Commit `feat: species guide with verified regulations`.

### Task 16: Prueba final en los 5 teléfonos

- [ ] **Step 1:** Cada integrante abre el link, elige su nombre, instala la app en la pantalla de inicio y toca "Preparar viaje" con wifi.
- [ ] **Step 2:** En modo avión, recorrer todas las pestañas: ninguna queda en blanco. Cargar una captura con foto, marcar un punto, cargar un sondeo, usar "Ir a punto" y abrir Emergencias.
- [ ] **Step 3:** Volver a tener señal: todo se sube (contador en 0) y se ve desde otro teléfono.
- [ ] **Step 4:** Revisar que el pronóstico del 8/11 y el 9/11 tenga marea (horizonte de unos 9 días) y anotar los problemas encontrados. Correcciones → commit `fix: …`.
