# App de Pesca — Fase 2 (río en Lima y "dónde pescar") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que la app sirva para pescar en el Paraná de las Palmas a la altura de Lima (costa y embarcado). La altura del INA reemplaza a la marea, hay reglamento según la orilla, y la app recomienda pesqueros con puntaje y "por qué", en río y en mar.

**Architecture:** en río, la altura del INA entra en `forecast.hours[].sea`. Así la curva, los extremos (`findExtremes`), la fase, el puntaje, las capturas y los sondeos de la fase 1 funcionan sin cambios de forma. Lo propio del río (tendencia, presión, banda del pronóstico y niveles de alerta) se suma con `water === 'rio'`. "Dónde pescar" es un módulo puro, `src/score/spots.js`, que usa los slots de `scoreDay` y las capturas cercanas de todos los viajes (RPC `catches_near`). Todo se calcula en el teléfono, con lo guardado.

**Tech Stack:** el mismo de la fase 1 (Vite, Preact, Vitest, fake-indexeddb, supabase-js, idb-keyval, leaflet, protomaps-leaflet, suncalc@2). Sin dependencias nuevas. CLI: `pmtiles` y `wrangler` para la región nueva.

**Spec:** `docs/superpowers/specs/2026-10-29-app-de-pesca-design.md`, §8 (fase 2, ampliada el 11/11) y §9.1. Las correcciones hechas al planificar están marcadas en la spec como "corregido/agregado el 11/11 al planificar".

## Global Constraints

- **Nada inventado:** todo valor del mundo real sale de §9/§9.1 o de una fuente nueva citada en el código o en el JSON. Los valores **[diseño]** viven solo en `src/score/config.js`, con el comentario `[diseño]` y la sección de la spec.
- **Ninguna pantalla espera a la red:** se dibuja con lo local y después refresca. Todo lo de "dónde pescar" funciona en modo avión.
- **Horas del INA:** vienen en UTC (`...Z`) y se pasan a hora local del viaje (UTC−3, `TRIP_OFFSET_MIN` de `src/lib/time.js`) como texto `YYYY-MM-DDTHH:MM`. Nunca se usa la zona del teléfono.
- **Un viaje de río usa una sola estación** (la más cercana con pronóstico) para la altura, las capturas y los sondeos. Cada valor guardado lleva `level_source` (`marea` o `ina:<serie medida>`). Solo se comparan alturas con el mismo `level_source`.
- **Viajes de mar:** la clave de caché del pronóstico, el puntaje (`WEIGHTS`) y las pantallas no cambian. Los 246 tests actuales siguen pasando.
- **Textos** en español rioplatense. Atribución visible: "Altura: INA (Zárate)" en río.
- **Permisos del usuario:** commit solo si el usuario lo autorizó para esta ejecución. Aplicar la migración en Supabase, subir archivos a R2 y hacer deploy requieren preguntar cada vez. Nunca pedir la clave `service_role` ni la contraseña de la base. No tocar los proyectos NutriNacho ni Pelis_By_Pili.
- **Rendimiento en iPhone:** se mide en WebKit (arnés WKWebView), no en Chrome.

## Review Focus

1. **Alturas con distinto cero:** una captura de un viaje de mar, o de otra estación, a menos de 300 m de un pesquero de río no debe sumar como "parecida". Solo cuenta con el mismo `level_source`. Test en Task 10 (`ignores catches from another level_source`).
2. **INA caído o día fuera del horizonte:** sin altura para ese día, la curva dice "El pronóstico de altura todavía no llega a esta fecha". El puntaje se arma con viento, presión, luna y clima, el rango de altura no resta, y un pesquero con `best_tide` no queda en 0 (dice "sin altura para aplicar la regla"). Tests en Task 2 (`keeps weather when INA fails`) y Task 10 (`best_tide without extremes`).
3. **Hora UTC del INA:** `2026-11-11T21:00:00.000Z` es `2026-11-11T18:00` local. A medianoche, el día local lo decide la hora local, no la UTC. Test en Task 1 (`converts UTC to trip local time`).
4. **Capturas sin GPS** (`lat`/`lon` null, por ejemplo con la hora cargada a mano) no aparecen en `catches_near` ni en el historial. Test en Task 6 (RLS/SQL) y Task 10 (`skips catches without position`).
5. **Spots viejos** (`access` null, `best_tide` null, sin rango) aparecen en costa y en embarcado, puntúan solo con la base y dicen "sin capturas del grupo todavía". Test en Task 10 (`old spot without new fields`).

---

### Task 1: Estaciones y lectura del INA

**Files:**
- Create: `src/data/stations.json`, `src/river/ina.js`, `test/ina.test.js`, `test/fixtures/ina-zarate-obs.json`, `test/fixtures/ina-zarate-prono.json`

**Interfaces:**
- Produces:
  - `stations.json`: `[{ id: 'zarate', name: 'Zárate', estacionId: 5907, lat: -34.1019, lon: -59.0089, obsSeries: 29437, pronoCal: 440, pronoSeries: 29534, alertM: 2.0, evacM: 2.2, lowM: 0.3, source: 'API del INA a5 (alerta.ina.gob.ar), verificado 29/10 y 11/11/2026' }]`.
  - `nearestStation(lat, lon, list = stations) → station | null`: la más cercana a menos de `STATION_MAX_KM`; si no hay, `null`.
  - `inaUrls(station, now: Date) → { obs, prono }`: medidas de los últimos 7 días y `/sim/calibrados/<pronoCal>/corridas/last?estacion_id=<estacionId>&includeProno=true&format=json`.
  - `parseLevels(obsJson, pronoJson) → { forecastDate: string|null, points: [{ t, h, lo, hi, measured }] }`, ordenado por `t`.
  - `fetchLevels(station, { fetchImpl = fetch, now = new Date() }) → { source: 'ina:<obsSeries>', stationId, forecastDate, points }`. Lanza si fallan los dos pedidos; si falla uno, usa el otro.

- [ ] **Step 1: Guardar fixtures reales.** Bajar las medidas con `curl -s -G https://alerta.ina.gob.ar/a5/obs/puntual/series/29437/observaciones -d timestart=<hace 7 días ISO> -d timeend=<ahora ISO> -d format=json > test/fixtures/ina-zarate-obs.json` y el pronóstico con `curl -s -G https://alerta.ina.gob.ar/a5/sim/calibrados/440/corridas/last -d estacion_id=5907 -d includeProno=true -d format=json > test/fixtures/ina-zarate-prono.json`. Anotar en el test la fecha de descarga.
- [ ] **Step 2: Escribir los tests que fallan** en `test/ina.test.js`:
  - `nearestStation`: Chacras del Paraná (−33.968, −59.256) da `zarate`; San Blas (−40.55, −62.23) da `null`.
  - `converts UTC to trip local time`: un punto `2026-11-11T21:00:00.000Z` queda con `t === '2026-11-11T18:00'`.
  - `measured beats main`: en una hora con medida y pronóstico, `h` es la medida y `measured === true`. En esa hora, `lo`/`hi` siguen siendo p01/p99.
  - `main/p01/p99 per hour`: en una hora solo pronosticada, `h` = `main`, `lo` = `p01`, `hi` = `p99`.
  - `fetchLevels`: con un `fetchImpl` falso que falla el pronóstico, devuelve solo las medidas. Si fallan los dos, rechaza. `source === 'ina:29437'`.
- [ ] **Step 3: Correr** `npx vitest run test/ina.test.js`. Esperado: FAIL (no existe `src/river/ina.js`).
- [ ] **Step 4: Implementar** `src/river/ina.js`. La respuesta trae `rows` en las medidas y `series[0].pronosticos` en la corrida. Cada pronóstico es `{ timestart, valor, qualifier }`, con `qualifier` igual a `main`, `p01` o `p99`. Para la hora local se usa `formatLocal(Date.parse(iso)/60000 + TRIP_OFFSET_MIN)`, exportando `TRIP_OFFSET_MIN` desde `src/lib/time.js`. Agregar `STATION_MAX_KM = 60` en `src/score/config.js`, con el comentario `[diseño] spec §8.1`.
- [ ] **Step 5: Correr** `npx vitest run`. Esperado: PASS, todos.
- [ ] **Step 6: Commit** `feat: read river height from INA (Zárate)`, si está autorizado.

### Task 2: Pronóstico de río (altura en `sea`)

**Files:**
- Modify: `src/forecast/fetch.js`, `src/forecast/cache.js`
- Test: `test/forecast.test.js`, `test/cache.test.js`

**Interfaces:**
- Consumes: `fetchLevels`, `nearestStation` (Task 1).
- Produces:
  - `buildUrls(lat, lon, { water = 'mar' } = {})`: en `rio`, `marine` es `null` y `weather` usa `past_days=5` (para la temperatura estimada, §8.3).
  - `withLevels(forecast, levels) → forecast`, pura: copia `points[].h` en `hours[].sea` por `t`, agrega `forecast.level = { source, stationId, forecastDate, points }` y recalcula `lastTideT`.
  - `fetchForecast(lat, lon, fetchImpl = fetch, { water = 'mar', station = null } = {})`: en río pide el clima y `fetchLevels` a la vez. Si el INA falla, devuelve el pronóstico sin `level` y con `levelError: string`.
  - `cacheKey(trip)`: en mar no cambia; en río es `forecast:rio:<lat>,<lon>`.
  - `getForecast(trip, opts)`: si `trip.water === 'rio'`, pasa `water` y `station: nearestStation(trip.lat, trip.lon)`.

- [ ] **Step 1: Tests que fallan:**
  - `buildUrls(..., { water: 'rio' }).marine === null`, y `weather` contiene `past_days=5`.
  - `withLevels` pone `h` en `sea` para las horas que coinciden, deja `null` las demás y `lastTideT` es la última hora con altura.
  - `keeps weather when INA fails`: `fetchForecast` en río, con el INA rechazando, trae `hours` del clima, no tiene `level` y `levelError` es un texto.
  - `cacheKey` de un viaje de mar es igual al de antes (`forecast:-40.55,-62.23`).
- [ ] **Step 2: Correr** `npx vitest run test/forecast.test.js test/cache.test.js`. Esperado: FAIL.
- [ ] **Step 3: Implementar.** En río se llama `normalize({ hourly: { time: [] } }, weather, fetchedAt)` y después `withLevels`.
- [ ] **Step 4: Correr** `npx vitest run`. Esperado: PASS.
- [ ] **Step 5: Commit** `feat: river forecast uses INA height as water level`.

### Task 3: Puntaje de río (tendencia y presión)

**Files:**
- Create: `src/score/river.js`, `test/river.test.js`
- Modify: `src/score/config.js`, `src/score/score.js`, `src/score/windows.js`
- Test: `test/score.test.js`, `test/windows.test.js`

**Interfaces:**
- Consumes: `forecast.level.points` (Task 2).
- Produces:
  - config, todo `[diseño] spec §8.2`:
    - `WEIGHTS_RIO = { tide: 0.5, wind: 0.3, pressure: 0.1, moon: 0.05, weather: 0.05 }`;
    - `RIVER = { trendDays: 3, fastFallCmDay: 15, fastFall: 0.6, strongRiseCmDay: 30, strongRise: 0.7, stableCmDay: 5 }`;
    - `PRESSURE = { hours: 6, deltaHpa: 2, drop: 1.0, stable: 0.6, rise: 0.3 }`. La spec no fija qué es "sube rápido": se toma +2 hPa en 6 h, simétrico a la caída, y se anota `[diseño]`.
  - `trendCmPerDay(points, dateIso) → number|null`: `(h(día 12:00) − h(día−3 12:00)) / 3 × 100`. Si falta alguna de las dos, `null`.
  - `trendFactor(cmDay) → number`: menos de −15 da 0.6; más de 30 da 0.7; si no, o con `null`, da 1.
  - `trendLabel(cmDay) → 'creciendo'|'estable'|'bajando'|null`, con ±5 cm por día.
  - `pressureFactor(hours, tMin) → number|null`: mediana de los modelos de `pressure` en `t` y en `t−6 h`.
  - `baseScore(factors, weights = WEIGHTS)`.
  - `scoreDay(forecast, extremes, dateIso, mode, { nightFishing, water = 'mar' })`: en río multiplica `factors.tide` por `trendFactor`, agrega `factors.pressure` y usa `WEIGHTS_RIO`.
  - `findWindows(slots, { nightFishing, mode, note })`: si viene `note` (por ejemplo, `río creciendo, +8 cm/día`), se agrega al final del motivo.

- [ ] **Step 1: Tests que fallan:**
  - `trendCmPerDay` con puntos sintéticos (de 1,00 a 1,60 m en 3 días) da 20.
  - `trendFactor(-16) = 0.6`, `trendFactor(31) = 0.7`, `trendFactor(null) = 1`.
  - `pressureFactor`: −2 hPa da 1.0, 0 da 0.6, +2 da 0.3, y sin datos da `null`.
  - Un viaje de mar da los mismos slots que antes (snapshot de `score` y `factors` del 7/11 con el fixture de San Blas).
  - En río, con `pressure` presente, `factors.pressure` existe y el puntaje usa `WEIGHTS_RIO`.
  - `findWindows` con `note` termina el motivo en `, río creciendo, +8 cm/día`.
- [ ] **Step 2: Correr** `npx vitest run test/river.test.js test/score.test.js test/windows.test.js`. Esperado: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correr** `npx vitest run`. Esperado: PASS.
- [ ] **Step 5: Commit** `feat: river score with trend and pressure`.

### Task 4: Pantalla Pronóstico en río

**Files:**
- Modify: `src/screens/Forecast.jsx`, `src/components/ScoreChart.jsx`, `src/forecast/view.js`
- Test: `test/view.test.js`

**Interfaces:**
- Consumes: `forecast.level`, `forecast.levelError` (Task 2); `trendCmPerDay` y `trendLabel` (Task 3); `stations.json`.
- Produces:
  - `riverLine(cmDay) → string`, por ejemplo `'Río creciendo, +8 cm/día'`, o `'Río: sin tendencia'` si es `null`.
  - `waterTempEstimate(hours, dateIso) → number|null`: promedio de la temperatura del aire (mediana de los modelos) de las 120 h anteriores a las 00:00 del día.
  - `ScoreChart` con las props nuevas, opcionales: `band: [{t, lo, hi}]` y `marks: { alert, low }`.
  - `readMode()`, que pasa de `Forecast.jsx` a `view.js` y se exporta, porque el Mapa lo usa en Task 11.

- [ ] **Step 1: Tests que fallan** para `riverLine(8)`, `riverLine(-20)`, `riverLine(null)` y `waterTempEstimate` (con horas sintéticas de 20 °C da 20; con menos de 24 h de datos da `null`).
- [ ] **Step 2: Correr** `npx vitest run test/view.test.js`. Esperado: FAIL.
- [ ] **Step 3: Implementar.** Antes, buscar en la API del INA una serie de temperatura del agua del bajo Paraná (§8.3). Si aparece una con fuente, se muestra esa; si no, la estimada. Lo que se encuentre se anota en §9.1. En río, la pantalla muestra:
  - la línea `riverLine` debajo de "Anzuelos al agua";
  - la banda p01–p99 y las líneas de alerta y de aguas bajas de la estación en el gráfico;
  - "Temperatura del agua: N °C (estimada con el aire de 5 días)" en vez de la del mar;
  - el texto del gráfico dice "altura del río en Zárate (INA)";
  - el pie dice `Datos: Open-Meteo · Altura: INA (Zárate)`;
  - si hay `levelError`, `· no se pudo actualizar la altura`;
  - sin altura ese día, "El pronóstico de altura todavía no llega a esta fecha".
  - `findWindows` recibe `note: riverLine(...)`. En mar, nada cambia.
- [ ] **Step 4: Correr** `npx vitest run`. Esperado: PASS. Revisión manual con `npm run dev`: un viaje de río en −33.968, −59.256 muestra la curva, la banda y la tendencia.
- [ ] **Step 5: Commit** `feat: forecast screen for river trips`.

### Task 5: Crear un viaje de río

**Files:**
- Modify: `src/screens/Home.jsx`
- Test: `test/trips.test.js`

**Interfaces:**
- Consumes: `createTrip({ ..., water, nightFishing })` (ya existe), `nearestStation` (Task 1).

- [ ] **Step 1: Test que falla:** `createTrip({ ..., water: 'rio', nightFishing: true })` guarda `water: 'rio'` y `night_fishing: true`.
- [ ] **Step 2: Correr** `npx vitest run test/trips.test.js`. Esperado: FAIL si el test nuevo depende de algo que todavía no existe; si pasa de entrada, se deja como test de regresión.
- [ ] **Step 3: Implementar en `Home.jsx`:**
  - un selector "Agua: Mar / Río";
  - al elegir Río, "Pesca nocturna" se marca sola y se puede desmarcar (§8.2);
  - si `nearestStation(lat, lon)` es `null`, aviso: "No hay una estación del INA con pronóstico a menos de 60 km: el puntaje va a ir sin altura del río".
- [ ] **Step 4: Correr** `npx vitest run`. Esperado: PASS. Manual: crear el viaje "Lima" desde Home.
- [ ] **Step 5: Commit** `feat: create river trips`.

### Task 6: Migración 004 (spots, level_source, catches_near y pesqueros con fuente)

**Files:**
- Create: `supabase/migrations/004_rio_y_donde.sql`
- Modify: `supabase/tests/rls.sql`

**Interfaces:**
- Produces:
  - `spots.access text check (access in ('costa','embarcado','ambos'))`, `spots.source text`, `spots.best_level_min_m numeric`, `spots.best_level_max_m numeric`;
  - `check (best_tide in ('creciente','pleamar','bajante','bajamar'))`. Antes del check, los valores que no coinciden pasan a `notes` y `best_tide` queda en null;
  - `catches.level_source text`, `soundings.level_source text`;
  - `public.catches_near(p_lat float8, p_lon float8, p_km float8) returns table (species text, caught_at timestamptz, lat float8, lon float8, tide_phase text, tide_height_m numeric, level_source text)`. Es `security definer` con `set search_path = ''` y `grant execute` a `anon`. Filtra `lat is not null and lon is not null` y la distancia haversine ≤ `p_km`, con tope de 2000 filas;
  - las filas con fuente (`created_by = 'fuente'`, UUID fijos, `on conflict (id) do nothing`):
    - **Las Tejas:** `name 'Frente al camping Las Tejas'`, −34.1043, −58.9943, `access 'embarcado'`, `species {Boga}`, `source 'Crónica Pesca, 26/3/2026 (prensa): https://www.cronica.com.ar/sociedad/cronica-pesca-el-pique-de-la-semana-noticias-y-detalles-claves-4269.html · posición: camping en OpenStreetMap'`;
    - **Punta Segunda:** −40.54, −62.24, `costa`, `best_tide 'bajamar'`, `species {Corvina rubia}`, `source 'Llompart 2011, cap. 3, pág. 72: https://sedici.unlp.edu.ar/handle/10915/34280'`;
    - **La Rebeca:** −40.5667, −62.2083, `costa`, fuente Llompart pág. 73–74;
    - **Playa de Arena, Mina de Hierro:** −40.5833, −62.1667, `costa`, notas "cazón de costa en octubre y menos en noviembre (Llompart, pág. 75)".

- [ ] **Step 1: Agregar asserts a `supabase/tests/rls.sql`:**
  - como `anon`, `catches_near` sobre una captura sembrada del viaje A con posición devuelve 1 fila sin `member`;
  - una captura sin `lat` no aparece;
  - un `best_tide = 'rarísimo'` sembrado antes de la migración termina en `notes`;
  - insertar `access = 'kayak'` falla.
- [ ] **Step 2: Escribir la migración.**
- [ ] **Step 3: Pedir permiso al usuario** para aplicarla en el proyecto de la app (no en NutriNacho ni en Pelis_By_Pili). Con el OK, aplicarla y correr `supabase/tests/rls.sql` como en la fase 1 (SQL Editor o `psql`, sin pedir claves). Esperado: termina en ROLLBACK sin errores.
- [ ] **Step 4: Commit** `feat: migration 004 for river and where-to-fish`.

### Task 7: Capturas y sondeos con `level_source`

**Files:**
- Modify: `src/catches/conditions.js`, `src/screens/Catches.jsx`, `src/screens/Map.jsx`
- Test: `test/conditions.test.js`

**Interfaces:**
- Consumes: `forecast.level.source` (Task 2), las columnas de Task 6.
- Produces:
  - `phaseNameAt(tMin, extremes) → 'pleamar'|'bajamar'|'creciente'|'bajante'|null`, sacado de `conditionsAt`, con la misma regla de `SLACK_MIN`;
  - `conditionsAt(...)` devuelve además `level_source`: `forecast.level.source` si existe; si no, `'marea'` cuando hay `tide_height_m`; si no, `null`.

- [ ] **Step 1: Tests que fallan:**
  - con un forecast con `level.source = 'ina:29437'`, `conditionsAt(...).level_source === 'ina:29437'` y `tide_height_m` es la altura del río interpolada;
  - con el fixture de San Blas da `'marea'`;
  - `phaseNameAt` coincide con el `tide_phase` de `conditionsAt` en 4 horas del 7/11.
- [ ] **Step 2: Correr** `npx vitest run test/conditions.test.js`. Esperado: FAIL.
- [ ] **Step 3: Implementar.** `Map.jsx#addSounding` guarda `level_source`; `Catches.jsx` ya lo guarda vía `...conditionsAt`. En el popup del sondeo en río, "Marea:" pasa a "Río:".
- [ ] **Step 4: Correr** `npx vitest run`. Esperado: PASS.
- [ ] **Step 5: Commit** `feat: catches and soundings record their water level source`.

### Task 8: Zona del viaje de río (radio, mapa base, profundidad y capturas cercanas offline)

**Files:**
- Modify: `src/prepare/prepare.js`, `src/screens/Map.jsx`, `src/screens/Prepare.jsx`, `src/lib/repo.js`, `src/data/regions.json`, `scripts/extract-region.sh`, `src/score/config.js`
- Test: `test/prepare.test.js`, `test/repo.test.js`

**Interfaces:**
- Consumes: RPC `catches_near` (Task 6).
- Produces:
  - `RIVER_RADIUS_KM = 100` en config (`[diseño] spec §8.5`);
  - `zoneRadiusKm(trip) → 250 | 100`;
  - `depthTiles(trip)` da `[]` en río (§8.5: la capa se oculta);
  - `satTiles(trip)` usa `zoneRadiusKm`;
  - `pullCatchesNear(client, lat, lon, km) → rows`: guarda en `rows:catchesNear:<nearScope(lat, lon)>`;
  - `listRows('catchesNear', nearScope(lat, lon))`, que lee lo guardado;
  - `prepareTrip` agrega el paso `catchesNear` (si falla: `missing` "Capturas del grupo: sin señal");
  - `regions.json` suma `{ id: 'lima', name: 'Lima (Paraná de las Palmas)', bbox: [-60.34, -34.87, -58.18, -33.07], bboxNote: '[diseño] 100 km alrededor de Chacras del Paraná (-33,968, -59,256)', file: 'lima.pmtiles', bytes: <medido> }`;
  - `scripts/extract-region.sh <build> <id> <minlon,minlat,maxlon,maxlat>`, con los argumentos en vez de San Blas fijo.

- [ ] **Step 1: Tests que fallan:**
  - en `prepare.test.js`, un viaje `water: 'rio'` da `depth.total === 0`, y `sat.total` es igual a `tilesInRadius(lat, lon, 100, 8, 13).length`;
  - un viaje de mar no cambia;
  - el paso `catchesNear` con un `pull` falso que rechaza agrega su línea a `missing`;
  - en `repo.test.js`, `pullCatchesNear` llama a `client.rpc('catches_near', { p_lat, p_lon, p_km })` y guarda el resultado bajo la clave nueva.
- [ ] **Step 2: Correr** `npx vitest run test/prepare.test.js test/repo.test.js`. Esperado: FAIL.
- [ ] **Step 3: Implementar.**
  - **`Map.jsx`:** en río no dibuja la capa de profundidad, su leyenda ni el aviso, y usa `zoneRadiusKm` para spots y sondeos (`SPOTS_RADIUS_KM` pasa a ser `zoneRadiusKm(trip)`).
  - **`Prepare.jsx`:** en río no ofrece "Profundidad".
  - **Estimación del satélite:** se recalcula con la cantidad de teselas del viaje. Usa el mismo `satTime`, sin números nuevos.
- [ ] **Step 4: Extraer la región Lima.** Correr `scripts/extract-region.sh <build vigente de docs.protomaps.com/basemaps/downloads> lima -60.34,-34.87,-58.18,-33.07` hasta antes del `wrangler r2 object put`. Medir los bytes, anotarlos en `regions.json` y en la spec §8.5, y elegir: si pesa más de 25 MiB va a R2; si no, a `public/maps/`. **Pedir permiso al usuario antes de subir a R2.**
- [ ] **Step 5: Correr** `npx vitest run`. Esperado: PASS.
- [ ] **Step 6: Commit** `feat: river trip zone, base map region and nearby catches offline`.

### Task 9: Reglamento según la orilla, especies de río y Prefectura

**Files:**
- Create: `scripts/zones.mjs`, `src/data/zones.json`, `src/data/regulation-rio.json`, `src/regulation/zones.js`, `test/zones.test.js`
- Modify: `src/data/species.json`, `src/screens/Species.jsx`, `src/data/emergency.json`, `src/screens/Emergency.jsx`, spec §8.4 y §9.1

**Interfaces:**
- Produces:
  - `zones.json`: `[{ id: 'ba'|'er', name, polygon: [[lon, lat], ...], source }]`, generado una sola vez por `scripts/zones.mjs` con los límites provinciales de OSM (admin_level 4) recortados al bbox de Lima y simplificados. El script no lo usa la app.
  - `zonesAt(lat, lon, zones = zonesJson, edgeKm = ZONE_EDGE_KM) → string[]`: punto en polígono, más las zonas cuyo borde queda a ≤ `edgeKm`. `ZONE_EDGE_KM = 1` va en config (`[diseño] spec §8.4`).
  - `regulation-rio.json`: `{ ba: { note, rules: [{text, sources}], license }, er: {...} }`, con el mismo formato que `regulation.json`.
  - especies de río en `species.json` con `waters: ['rio']` y `zones: ['ba'|'er', ...]`.

- [ ] **Step 1: Tests que fallan** en `test/zones.test.js`, con un polígono cuadrado sintético:
  - un punto adentro da `['ba']`;
  - a 0,5 km del borde da las dos zonas;
  - lejos da `[]`;
  - con el `zones.json` real, Chacras del Paraná (−33.968, −59.256) da `'ba'`.
- [ ] **Step 2: Correr** `npx vitest run test/zones.test.js`. Esperado: FAIL.
- [ ] **Step 3: Generar `zones.json`** con `node scripts/zones.mjs`. Overpass puede responder 502 por carga: reintentar con espera. Verificar en el mapa qué islas frente a Lima son de cada provincia y anotarlo en §8.4 y §9.1, con la fuente.
- [ ] **Step 4: Investigar y cargar el reglamento y las especies,** solo con fuente oficial. Lo que no se verifique queda `null` o "no verificado" (spec §2.7, regla).
  - **Buenos Aires:** reglamento de pesca deportiva 2026, aguas interiores y Paraná. Confirmar si la veda de pejerrey (DI-2019-483 y DISPO-2021-116) alcanza al Paraná de las Palmas.
  - **Entre Ríos:** el texto oficial de la Ley 11.174, desde la ficha del Senado, y el reglamento de pesca deportiva vigente.
  - **Especies candidatas (§8.4):** boga, dorado, bagre blanco y amarillo, armado, patí, surubí y sábalo. Tararira y pejerrey entran solo con fuente.
  - **Fotos:** con licencia y atribución, como en la fase 1.
- [ ] **Step 5: Implementar en `Species.jsx`:** filtra por `trip.water` y, en río, por `zonesAt` de la posición GPS (si hay permiso) o del lugar del viaje. Si hay dos zonas, muestra las dos con el aviso "Cerca del límite entre provincias: valen las dos".
- [ ] **Step 6: Prefectura Zárate.** Agregarla a `emergency.json` con `water: 'rio'`, solo si el teléfono o el canal figuran en un sitio oficial (argentina.gob.ar / PNA). `Emergency.jsx` muestra las de `water` igual a la del viaje, más las generales.
- [ ] **Step 7: Correr** `npx vitest run`. Esperado: PASS. Correr `npm run build` para confirmar que el JSON entra en el paquete.
- [ ] **Step 8: Commit** `feat: river regulation by bank, river species and Prefectura Zárate`.

### Task 10: Puntaje de pesqueros (módulo puro)

**Files:**
- Create: `src/score/spots.js`, `test/spots.test.js`
- Modify: `src/score/config.js`

**Interfaces:**
- Consumes: slots de `scoreDay` (Tasks 3 y 7: cada slot trae `t`, `score`, `night`, `noGo` y `phase`), `findWindows` con `note`, `phaseNameAt` (Task 7), `within(rows, lat, lon, km)` y `distanceBearing(lat1, lon1, lat2, lon2)` de `src/map/nav.js`, y `zoneRadiusKm` (Task 8, `src/prepare/prepare.js`), `forecast.level`.
- Produces:
  - config, todo `[diseño] spec §8.6`: `SPOT = { radiusM: 300, levelSimilarM: 0.2, outOfRangePenalty: 3, historyOne: 1, historyMany: 2, manyFrom: 3, top: 3, centralKm: 2 }`, y `ATUCHA = { lat: -33.9695, lon: -59.2061, source: 'OpenStreetMap (Nominatim), 11/11/2026' }`.
  - `rankSpots({ spots, catches, slots, extremes, forecast, mode, water, nightFishing, day }) → [{ spot, score, best: { t, window } | null, km, lines: [{ text, origin }] }]`, ordenado por `score` desc y después `km` asc. `origin` es `'diseño'`, `'grupo'`, `'fuente'` o `'aviso'`.
  - `rankForTrip(trip, forecast, spots, catches, mode, day) → igual`: envuelve `findExtremes`, `scoreDay` y `within(spots, trip.lat, trip.lon, zoneRadiusKm(trip))`, y calcula `km` desde el lugar del viaje.

- [ ] **Step 1: Tests que fallan** en `test/spots.test.js`. Usan slots sintéticos: 48 slots con `score` y `phase`, armados con un helper del test.
  - `filters by mode`: un spot `access 'costa'` no aparece en `embarcado`; con `access` null aparece en los dos.
  - `best_tide bajamar without low tide`: sin horas en bajamar da `score 0` y la línea "hoy no le da el agua".
  - `best_tide without extremes`: con `extremes = []`, la regla no se aplica, la base es la mejor hora y aparece la línea "sin altura para aplicar la regla".
  - `level out of range`: en río, con rango 1,8–2,3 y la altura de la mejor hora en 2,5, resta 3 y aparece la línea con los dos números. Sin `forecast.level`, o sin altura en esa hora, no resta y dice "sin pronóstico de altura".
  - `history 0/2/3`: 0, 2 y 3 capturas parecidas a ≤ 300 m suman 0, +1 y +2. Una a 301 m no cuenta.
  - `ignores catches from another level_source`: en río, una captura a 50 m con `level_source 'marea'` no cuenta.
  - `skips catches without position`.
  - `history in sea uses tide_phase`: en mar, solo cuenta la misma `tide_phase` que tiene la mejor hora.
  - `clamps 0..10`.
  - `ties by distance`.
  - `old spot without new fields`: un spot viejo puntúa solo con la base y dice "sin capturas del grupo todavía".
  - `source line`: un spot con `source` agrega una línea `origin 'fuente'` con ese texto.
  - `near Atucha`: un spot a 1,5 km de `ATUCHA` agrega la línea `origin 'aviso'` "zona de la central: verificar si se puede pescar", sin cambiar el puntaje.
- [ ] **Step 2: Correr** `npx vitest run test/spots.test.js`. Esperado: FAIL.
- [ ] **Step 3: Implementar `rankSpots`.**
  - Las horas elegibles son las de `findWindows`: `score != null`, `!noGo` y, si no hay pesca nocturna, `!night`.
  - Con `best_tide` y extremos, las horas de otra fase pasan a `score: null` antes de elegir el máximo y antes de llamar a `findWindows`.
  - "Captura parecida", en río: mismo `level_source` que `forecast.level.source` y `|tide_height_m − sea(hora)| ≤ 0.2`. En mar: `tide_phase === phaseNameAt(hora)`.
  - Los textos de las líneas son los de la spec §8.6 "Por qué".
- [ ] **Step 4: Correr** `npx vitest run`. Esperado: PASS.
- [ ] **Step 5: Commit** `feat: rank fishing spots with reasons`.

### Task 11: "Dónde" en Pronóstico y en el Mapa, y el formulario del pesquero

**Files:**
- Modify: `src/screens/Forecast.jsx`, `src/screens/Map.jsx`, `src/components/MapForms.jsx`, `src/styles.css`
- Test: `test/spots.test.js` (los textos que usa la pantalla)

**Interfaces:**
- Consumes: `rankForTrip` (Task 10), `listRows('catchesNear', ...)` (Task 8), `readMode` (Task 4), spots vía `useRows('spots', nearScope(...))`.

- [ ] **Step 1: Test que falla:** `rankForTrip` con un spot fuera de `zoneRadiusKm(trip)` no lo devuelve.
- [ ] **Step 2: Correr** `npx vitest run test/spots.test.js`. Esperado: FAIL.
- [ ] **Step 3: Implementar.**
  - **Pronóstico:** debajo del Hero va la sección "Dónde", con los `SPOT.top` primeros. Cada uno muestra nombre, `score/10`, la hora de `best`, `km` y un `<details>` "Por qué" con las `lines`. Los de `origin 'diseño'` dicen "(regla de diseño)" y los de `'fuente'` muestran el link.
    - Debajo, "Ver todos (N)" y el aviso fijo de la spec §8.6, tal cual.
    - Sin spots en la zona: "Todavía no hay lugares cargados. Marcalos en el Mapa con 'Marcar punto'."
  - **Tocar un lugar** navega a `/t/<id>/mapa?spot=<spotId>`.
  - **Mapa:**
    - con `?spot=` selecciona ese spot, centra el mapa y abre "Ir a punto";
    - la tarjeta del spot muestra "Hoy: N/10" y las mismas líneas, usando `rankForTrip` con el forecast guardado, `readMode()` y el día de hoy;
    - sin forecast guardado, no muestra nada.
  - **`MarkForm` y `SpotEditor`:**
    - selector "Desde: Costa / Embarcado / Las dos" (`access`);
    - en río, "Altura recomendada del río, de … a … m" (`best_level_min_m` y `best_level_max_m`; si el mínimo es mayor que el máximo, error "El mínimo no puede ser mayor que el máximo");
    - `source` se muestra como texto si existe y no se puede editar;
    - en río, la etiqueta "Marea recomendada" pasa a "Agua recomendada".
- [ ] **Step 4: Correr** `npx vitest run`. Esperado: PASS. Revisión manual con `npm run dev`, en modo avión después de "Preparar viaje":
  - la sección "Dónde" aparece y el "Por qué" se abre;
  - tocar un lugar lleva al Mapa con "Ir a punto";
  - editar un spot guarda `access` y el rango.
- [ ] **Step 5: Commit** `feat: where-to-fish in forecast and map`.

### Task 12: Verificación de punta a punta

**Files:**
- Modify: `docs/prueba-telefonos.md` (los pasos de río y de "dónde")

- [ ] **Step 1:** `npx vitest run` y `npm run build`. Esperado: todo PASS y el build sin errores.
- [ ] **Step 2: Prueba manual de la spec §8.8 en el navegador:**
  - crear "Lima" (río, −33.968, −59.256), preparar el viaje y pasar a modo avión;
  - ver la altura, el pronóstico, la tendencia, el reglamento según la orilla, la sección "Dónde" con su "por qué", "Ir a punto" y Emergencias con Prefectura (si se cargó);
  - cargar una captura y un sondeo, y ver que guardan `level_source 'ina:29437'`.
- [ ] **Step 3: Medir en WebKit** (arnés WKWebView de la fase 1) el tiempo de apertura con la región Lima y el satélite guardados. Anotar el número en `docs/prueba-telefonos.md`.
- [ ] **Step 4: Preguntar al usuario** antes de publicar (deploy en Cloudflare Pages). Commit `docs: phase 2 phone test steps`, si está autorizado.
