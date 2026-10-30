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

