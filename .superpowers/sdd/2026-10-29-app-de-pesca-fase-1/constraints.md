## Global Constraints

- Nada de datos inventados. Todo valor del mundo real sale de la spec (§9) o de una fuente nueva citada en el código o en `species.json`. Los valores **[diseño]** viven solo en `src/score/config.js` o en las constantes indicadas.
- Ninguna pantalla espera a la red: siempre renderiza desde lo local y después refresca.
- Las horas de Open-Meteo vienen en hora local del lugar (`timezone=America/Argentina/Buenos_Aires`) como texto sin offset. Nunca se parsean con la zona del dispositivo; se usan los helpers de `src/lib/time.js`. Para pasar a UTC (suncalc) se usa `utc_offset_seconds` de la respuesta.
- No se usan teselas de `tile.openstreetmap.org` (su política prohíbe offline). Mapa base: solo el `.pmtiles` propio en R2.
- Header `x-trip-id` en todo pedido a Supabase (`global.headers`). Supabase Realtime no se usa.
- Textos de la interfaz en español rioplatense. Atribución visible: Open-Meteo, OpenStreetMap/Protomaps y "Terrain Tiles (AWS Open Data)".
- Dependencias: solo las del Tech Stack. `suncalc` en versión ≥2 (la 1.9 no trae `transit`).

