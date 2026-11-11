# App de Pesca — Diseño

Fecha: 2026-10-29 · Autor: Nacho (con Claude) · Datos verificados el 29/10/2026 (ver §9) · Fase 2 ampliada con "dónde pescar" el 11/11/2026 (ver §8 y §9.1)

> **Convención:** todo dato del mundo real lleva su fuente en §9. Los números de diseño (umbrales, pesos, tiempos) se marcan **[diseño]**: son valores iniciales elegidos para arrancar, no datos medidos, y se ajustan con las capturas.

## 1. Objetivo

Una web app para que un grupo de amigos planifique y registre viajes de pesca. Responde la pregunta central de Fernando: **a qué hora tener los anzuelos en el agua y cuánto dura la ventana**, según marea, viento, luz y luna. Además ordena la logística del viaje: checklist, itinerario, spots y capturas.

**Primer uso real:** viaje del grupo "Luroooo" (Nacho, Fernando, Jero, Manu, El) a Bahía San Blas, Buenos Aires. Según el chat del grupo:
- Sábado 7/11/2026: viaje. Están a "2 horas y media más o menos", con ripio.
- Domingo 8/11: pesca de costa.
- Lunes 9/11: "día de la reserva", a buscar cazón con guía.

**Éxito:**
- El domingo y el lunes el grupo sabe con anticipación sus mejores ventanas de pesca diurnas.
- **La app funciona sin internet en la playa y mar adentro.** Lo único que necesita señal es actualizar el pronóstico y sincronizar con el grupo. Es la prioridad número uno del diseño.
- El checklist y las capturas quedan compartidos.
- La app sirve igual para el próximo viaje a otro lugar.

### Lo que dijo el usuario vs. lo que se asumió
- **Dicho:** web por link, reusable, datos en vivo, acceso con link y "Soy X", todos los extras (spots, checklist, capturas, itinerario), puntaje por hora, offline como prioridad, mapa de profundidad, condiciones automáticas en cada captura, especies y reglamento, Cloudflare + Supabase y fase 2 de río.
- **Asumido:** costa y embarcado necesitan reglas de puntaje distintas; en San Blas no se pesca de noche (Fernando: "Espero que no sea de noche"); alcanza con "gana el último cambio" para la edición concurrente.

### Fuera de alcance
Chat, notificaciones push, cuentas y contraseñas, tablas de marea más allá del horizonte del pronóstico, app nativa y navegación. La app no reemplaza la carta náutica, el GPS náutico ni la sonda del barco.

## 2. Funcionalidades

### 2.1 Viajes y acceso
- **Viaje:** nombre, lugar (lat/lon y nombre), fecha de inicio y fin, integrantes (lista de nombres), **tipo de agua** (`mar` o `río`) y **pesca nocturna** (sí/no; por defecto no).
  - En fase 1 solo se implementa `mar`. El campo existe desde el día 1 para que la fase 2 (§8) no cambie la estructura.
- **Crear un viaje** genera un `id` UUID. El link es `/t/<id>`.
- **Al abrir el link:** pantalla "¿Quién sos?" con los integrantes. La elección se guarda en `localStorage` de ese teléfono y se puede cambiar.
- **Inicio sin link:** permite crear un viaje nuevo y muestra los viajes abiertos antes en ese teléfono (los guarda `localStorage`).

### 2.2 Pronóstico (pestaña principal)
- Selector de día dentro del rango del viaje y selector **Costa / Embarcado**.
- **Arriba (respuesta directa, elegido por el usuario el 29/10):** en grande "Anzuelos al agua HH:MM", "hasta las HH:MM" y cuánto falta ("en 2 h 15 min"; "ahora" si ya empezó). Debajo: puntaje, viento, el motivo ("Por qué: …"), la ventana siguiente y el puntaje de ahora. Ejemplo de ventana: `12:30–14:45 · 8/10 · fin de creciente + repunte, viento 12 km/h SO`.
- **"Ver hora por hora" (desplegable):** curva de marea del día con pleamares y bajamares marcadas (hora y altura), las ventanas pintadas en verde sobre la curva, franjas de noche en gris, barras de puntaje de 0 a 10 por hora y marcas de las capturas registradas.
- **Datos por hora:** viento, ráfagas y dirección, probabilidad de lluvia, temperatura, presión y, en embarcado, altura de ola. Temperatura del mar del día.
- **Viento por modelo (estilo Windguru):** una tabla compacta con el viento de ECMWF, GFS e ICON hora por hora.
  - ICON solo llega a unos 7 días (§3.1); más allá se muestran los modelos que haya.
  - Cuando los modelos disponibles difieren en más de 10 km/h **[diseño]**, la hora se marca "pronóstico incierto".
- **Del día:** salida y puesta del sol, fase de la luna y períodos solunares.
- **En embarcado:** con viento de más de 25 km/h u olas de más de 1,2 m **[diseño]** en una hora de luz, aparece el cartel "No conviene salir".

### 2.3 Mapa, profundidad y spots
- **Mapa base:** Leaflet con un mapa de OpenStreetMap **alojado por nosotros** (Protomaps, §3.1).
  - No se usan las teselas de `tile.openstreetmap.org`, porque su política prohíbe el uso offline y la precarga.
- **Capa de profundidad** (se prende y se apaga):
  - escala de colores pensada para 0–60 m, con isobatas cada 5 m **[diseño]**;
  - tocando el mapa se ve la profundidad de ese punto.
  - **Aviso fijo:** "Profundidad orientativa, no apta para navegar".
  - **Límite verificado:** la fuente es ETOPO1, con celdas de 1 minuto de arco (unos 1,8 km). Mar afuera da valores razonables: −36,9 m en un punto a unos 50 km de San Blas. En el canal y la bahía no tiene detalle: 0 m o valores de tierra. Ver §3.1.
- **Sondeos del grupo:** desde el barco se carga la profundidad que marca la sonda (o la que dice el guía) en el punto GPS actual. La app guarda la altura de marea de ese momento y la descuenta, así todos los sondeos quedan referidos al mismo nivel y se pueden comparar entre días. Se dibujan como puntos numerados sobre el mapa. Viaje a viaje, el grupo arma su propio mapa de profundidad donde los datos globales no llegan.
- **En el mar (solo GPS, sin internet):**
  - tu posición sobre el mapa, con la profundidad estimada debajo;
  - **"Marcar punto":** guarda el punto GPS actual como spot, con profundidad opcional;
  - **"Ir a punto":** distancia y rumbo (con flecha de brújula) hasta un spot guardado.
- **Pin:** nombre, especies, marea recomendada, profundidad (opcional), notas y quién lo cargó. Cualquier integrante puede agregar o editar.
- Los spots van ligados a coordenadas, no al viaje. Se muestran los que están a menos de 250 km del lugar del viaje **[diseño]**, la misma zona que bajan el mapa base, la profundidad y el satélite (antes 50 y 80 km; el 30/10 el grupo pidió lugares a más de 4 h de viaje por día). Tiempos en auto desde San Blas según OSRM (router.project-osrm.org, 30/10): Bahía Blanca 4,4 h, Caleta de los Loros 4,2 h, Las Grutas 4,4 h; las tres quedan dentro de 250 km en línea recta. Satélite: Sentinel-2 cloudless 2025 de EOX, zoom 8–13, licencia CC BY-NC-SA 4.0 (uso no comercial con atribución). A 250 km son 24.688 teselas; con una muestra de 40 por zoom (30/10) se estiman unos 145 MB.
- **Datos iniciales:** spots de Bahía San Blas, cada uno con su fuente. Solo se cargan los que se puedan respaldar.

### 2.4 Checklist
Ítems con texto, quién lo lleva (opcional) y tildado. Se agregan, se tildan y se borran. Lo ve todo el grupo.

### 2.5 Itinerario
Ítems con fecha y hora, título y notas, ordenados en el tiempo. Ejemplos: salida, ruta, comida, cita con el guía.

### 2.6 Capturas
- **Lo carga el usuario:** especie (de la guía o texto libre), medida en cm (opcional), foto (opcional), quién la sacó (por defecto el usuario actual) y "devuelto sí/no".
- **Lo agrega la app sola:** hora, ubicación GPS (si hay permiso), fase y altura de la marea, viento y dirección. Todo se calcula con el pronóstico guardado de esa hora.
- **Vistas:** lista del viaje, ranking por integrante (cantidad y mayor medida) y resumen "capturas por fase de marea".

### 2.7 Especies y reglamento
- Archivo fijo `species.json` dentro de la app.
- **Por especie:** nombre, zona y época, carnada y técnica, medida mínima, si es de devolución obligatoria y la fuente. Cada campo sin fuente queda vacío o marcado "no verificado".
- **Especies de San Blas:**
  - **Tesis doctoral UNLP (Llompart, 2011)** sobre la pesca deportiva en la bahía: pescadilla de red y corvina rubia (las principales, más del 60% del peso capturado), pejerrey (más del 85% de lo que se pesca desde el puente), lenguado, gatuzo y rayas.
    - **Temporada:** la actividad se concentra en primavera y verano, con pico en diciembre y enero. Las salidas embarcadas van de octubre a abril, con más viajes en noviembre y diciembre.
  - **Además, con fuente:** cazón (lo menciona la Disposición 217/07 como pesca deportiva; según una nota, en noviembre hay salidas nocturnas de costa con marcado y devolución) y pez elefante (Disposición 217/07; lo nombró Fernando).
- **Reglamento de Buenos Aires: Disposición 217/07** (texto oficial en normas.gba.gob.ar):
  - **Art. 14:** devolución obligatoria y prohibición de sacrificio para los grandes tiburones costeros. El texto nombra al escalandrún, la bacota, el gatopardo, el **cazón** (*Galeorhinus galeus*) y el tiburón martillo. Desde embarcación, una caña por pescador; desde costa, dos. Un solo anzuelo por aparejo, sin anzuelos en tándem.
  - **Pesca variada con reserva** (rayas, chuchos, pez ángel, **pez elefante**, corvina negra): se pueden sacrificar hasta 2 ejemplares; el resto se devuelve.
  - **Tallas mínimas (anexo 2):** corvina rubia, 35 cm; pescadilla de red, 30 cm.
  - **Cupos:** pesca variada, 40 piezas por pescador y día (art. 9); pesca dirigida, 10 por día, salvo pejerrey con 40 (art. 11); combinada, hasta 50 en 24 h (art. 17).
  - **Vigencia (confirmado el 30/10 con el reglamento 2026, pág. 10–11):** mantiene la Disposición 217/07 y estos valores: corvina rubia 35 cm, pescadilla 30 cm; pesca variada 40 por día, pesca variada con reserva 2, pesca dirigida 10, pejerrey 40; grandes tiburones costeros (incluido el cazón) con devolución obligatoria.
    - **Más detalle que la spec:** la pesca combinada es una tabla, no un tope único de 50. Por ejemplo, P.V. + P.V.R. = 38 + 2, P.D. + P.V. = 10 + 40 y P.D. pejerrey + P.V. = 50.
    - **Para el día de cazón (P.D.R.):** anzuelo curvo tipo Mustad 39960 BL, o de fácil degradación tipo Mustad 3406, en 12/0 o 14/0. Nylon de 0,70 mm como mínimo. Se recomienda una boya tope a 25 cm del anzuelo en las líneas de fondo.
    - **Otras tallas de la tabla:** pez ángel 75 cm, gatuzo 60 cm, pez palo 46 cm, lisa 45 cm, salmón de mar 37 cm, besugo 26 cm.
    - **Licencia:** hay una licencia "Turística" de 20 días (pág. 3).
    - **Pez elefante:** la tabla de carnadas dice "Pez elefante o gallo" (pág. 12), así que el reglamento usa los dos nombres.
- **Licencia de pesca deportiva de Buenos Aires** (página oficial gba.gob.ar):
  - se tramita en línea en `maa.gba.gov.ar/sistemas/pesca/licencias/licencias00.php`, o en la Dirección Provincial de Pesca (calle 51 esquina 12, Torre I, piso 5, La Plata);
  - hay licencia especial para jubilados y equivalentes (Resolución 46/05);
  - **el costo no está publicado** en la página oficial; la app enlaza al trámite y no muestra un precio.
- **Regla:** todo dato de reglamento se verifica con fuentes oficiales de la provincia o del Ministerio antes de publicarse. Lo que no se pueda verificar va marcado "no verificado".

### 2.8 Emergencias (siempre disponible sin internet)
- Botón fijo en la barra superior.
- Muestra tu posición GPS en letra grande, en grados y minutos, lista para leerla por radio.
- **Verificado:** Prefectura Naval Argentina, **106** (emergencias náuticas, gratuito) y **VHF canal 16** (156,800 MHz). Ver §9.
- Muestra qué datos pasar: posición, cantidad de personas y situación.

### 2.9 Preparar viaje para offline
- Botón grande en el inicio del viaje, con progreso y una lista de lo que ya está guardado:
  - pronóstico de todos los días del viaje que estén dentro del horizonte;
  - mapa base de la región y profundidad del área;
  - spots y sondeos;
  - checklist, itinerario y capturas;
  - fotos en miniatura.
- Al terminar muestra "Listo para offline ✓ · datos de hoy 18:40".
- Si faltan 48 h o menos para el viaje y los datos tienen más de 12 h **[diseño]** (o nunca se preparó), aparece un cartel que lo recuerda.

## 3. Arquitectura

```
Teléfono (PWA: Vite + Preact)
 ├─ Open-Meteo Marine API ──── nivel del mar (marea), olas, temperatura del mar
 ├─ Open-Meteo Forecast API ── viento, ráfagas, lluvia, temperatura, presión, sol (3 modelos)
 ├─ suncalc ≥2 (local) ─────── luna: fase, iluminación, salida/puesta, tránsitos
 ├─ Mapa base: .pmtiles regional (Protomaps/OSM) en Cloudflare R2 → guardado entero en el teléfono
 ├─ Teselas terrarium (AWS) ── profundidad (se decodifica en el teléfono)
 ├─ GPS + brújula (local) ──── posición, marcar / ir a punto, emergencias
 ├─ Supabase (Postgres + Storage) ── viajes, checklist, itinerario, capturas, spots, fotos
 └─ caché local (Cache API + IndexedDB) ── app, pronóstico, mapa, cola de escrituras
Hosting: Cloudflare Pages (app) + Cloudflare R2 (mapas regionales)
```

**Dependencias:** `preact`, `@supabase/supabase-js`, `leaflet`, `protomaps-leaflet` (trae `pmtiles`), `suncalc@^2`, `vite-plugin-pwa`, `idb-keyval`. No se agrega nada más sin motivo.

### 3.1 Fuentes de datos
Todas responden con CORS abierto (`Access-Control-Allow-Origin: *`), verificado el 29/10. El teléfono les pide directo, sin servidor intermedio.

- **Marea:** `marine-api.open-meteo.com/v1/marine`, con `hourly=sea_level_height_msl,wave_height,sea_surface_temperature`, `cell_selection=sea` y `timezone=America/Argentina/Buenos_Aires`.
  - Las pleamares y bajamares son los máximos y mínimos locales de la serie horaria, refinados con interpolación parabólica de 3 puntos.
  - **Validado:** para el 7/11 en San Blas, Open-Meteo da sus extremos en 01:00, 07:00, 13:00 y 19:00 (serie horaria, sin refinar), y tide-forecast.com da 00:42, 07:05, 13:09 y 19:09. Diferencia máxima: 18 min.
  - Las mareas que Fernando pasó al grupo (01:28 / 07:57 / 14:08 / 19:59) coinciden con las de tide-forecast.com para el domingo 8/11.
- **Clima:** `api.open-meteo.com/v1/forecast`, con `hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation_probability,temperature_2m,surface_pressure`, `daily=sunrise,sunset` y `models=ecmwf_ifs025,gfs_seamless,icon_seamless`.
  - Con `models`, cada variable viene con sufijo por modelo, también las diarias (`wind_speed_10m_ecmwf_ifs025`, `sunrise_gfs_seamless`, etc.). Las tres variables por hora vienen para los tres modelos.
  - **Desacuerdo entre modelos, medido el 29/10 para el 4/11 a las 12:00 en San Blas:** ECMWF 10,4 km/h e ICON 30,2 km/h, una diferencia de 19,8 km/h.
  - **Sol:** Open-Meteo da para el 8/11 una salida a las 05:49 y una puesta a las 19:58. tide-forecast da 05:48 y 19:57.
- **Horizonte** (medido el 29/10):
  - marea y olas: hasta el 7/11 a las 20:00, unos 9 días;
  - temperatura del mar: hasta el 8/11 a las 02:00;
  - viento y clima: ECMWF hasta el 13/11 (unos 15 días), GFS hasta el 13/11 a las 23:00 (unos 15–16 días), ICON hasta el 5/11 (unos 7 días).
  - **Regla:** el horizonte no se fija en el código; se toma el último dato no nulo de cada serie. Si el día pedido no tiene datos de marea, se muestra "El pronóstico de marea todavía no llega a esta fecha".
- **Descartadas:**
  - **Windy:** su página oficial dice que la clave gratis devuelve datos "mezclados al azar y levemente modificados", solo para desarrollo y con 500 pedidos por día. La licencia profesional cuesta 990 € por año y no incluye ECMWF.
  - **Windguru:** no encontré una API pública ni un programa de datos para terceros.
  - **SMN:** no encontré una API oficial documentada. Publica en datos.gob.ar un dataset de pronóstico a 5 días.
  - **Météo-France** (`meteofrance_seamless`): devolvió vacío para San Blas.
- **Mapa base (offline):** Protomaps, un mapa de OpenStreetMap en formato `.pmtiles` (licencia ODbL, con atribución a OpenStreetMap). Hay un build planetario con zoom 0–15.
  - **Regiones:** se recorta una región con `pmtiles extract <build> <salida>.pmtiles --bbox=<minlon,minlat,maxlon,maxlat>` (también funciona con `--maxzoom`) y se sube a Cloudflare R2. Protomaps desaconseja enlazar directo a su build; R2 tiene 10 GB gratis por mes y no cobra egreso.
    - **Medido el 30/10:** el recorte de San Blas (build 20261030, zoom 0–15) pesa **1.184.103 bytes (1,2 MB)**. Ese recorte (−62,50, −40,80, −61,95, −40,35) era más chico que la profundidad y en el teléfono dejaba rectángulos grises. Se cambió por uno de 80 km alrededor del viaje (−63,19, −41,27, −61,29, −39,83), que pesa **6.049.492 bytes (6,0 MB)**. El 30/10 se agrandó a 250 km (−65,19, −42,80, −59,27, −38,30): con zoom 0–15 pesaba 44 MB y Cloudflare Pages no acepta archivos de más de 25 MiB, así que va a Cloudflare R2 (bucket `pesca-mapas`) con zoom 0–15: **43.893.951 bytes (43,9 MB)**. R2 gratis: 10 GB/mes guardados, 1 M escrituras y 10 M lecturas por mes, salida sin cargo; no tiene tope de gasto, hay un aviso por mail (Budget alert) de US$ 1. "Preparar viaje" lo vuelve a bajar si el guardado no pesa lo que dice `regions.json`. Con ese tamaño no hace falta R2: el archivo va junto a la app, en `public/maps/san-blas.pmtiles` (mismo origen, sin CORS), y se publica con la app en Cloudflare Pages. R2 queda para regiones grandes; en esta cuenta hay que activarlo desde el panel de Cloudflare.
  - **En el teléfono:** "Preparar viaje" descarga el `.pmtiles` de la región entero y lo guarda en IndexedDB. `pmtiles` lo lee con `FileSource(new File([blob], …))`, así el mapa funciona sin internet y sin precargar teselas sueltas.
  - **Regiones iniciales:** Bahía San Blas, y después el Paraná de las Palmas entre Zárate y Lima.
  - **Límite conocido:** un lugar nuevo necesita correr el script de recorte una vez. Cuando se use seguido en lugares nuevos, conviene una región provincial más grande.
  - **Tamaño de cada región:** se mide en la prueba inicial (§7) y se muestra antes de descargar.
- **Profundidad:** teselas "terrarium" de AWS Open Data, `s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`.
  - Son PNG que codifican la altura en los colores: `alt = R·256 + G + B/256 − 32768`.
  - **En el mar,** la fuente es ETOPO1, con 1 minuto de arco (la documentación de tilezen/joerd dice "nominalmente 2,5 km" en zoom 15). La misma documentación advierte artefactos en la costa.
  - **Probado el 29/10:** canal frente al pueblo, 6,0 m (valor positivo, o sea tierra o costa); boca del canal, 0,0 m; 15 km mar afuera, 0,0 m; unos 50 km mar afuera, −36,9 m.
  - **Uso:** se piden teselas solo hasta zoom 12 (más zoom no agrega datos en el mar) y se agrandan en el teléfono. Se cachean como cualquier GET.
  - **Licencia:** no encontré restricciones de descarga; se cita como pide AWS y según la atribución de tilezen/joerd.
  - **Alternativa a evaluar:** GEBCO 2026, una grilla de 15 segundos de arco (unos 450 m), que se puede descargar por área en GeoTIFF o netCDF. Su WMS (`wms.gebco.net/mapserv`) en la bahía no mostró detalle con su escala de colores, y la consulta por punto no devolvió valores. Una prueba de 1 hora compara un recorte de GEBCO con terrarium en la bahía. Si GEBCO tiene más detalle, se convierte a teselas terrarium con un script y se sube a R2.
- **Atribución** visible de Open-Meteo, OpenStreetMap/Protomaps y de la fuente de profundidad.

### 3.2 Modelo de datos (Supabase)

```sql
trips(id uuid pk default gen_random_uuid(), name text, place_name text,
      lat float8, lon float8, start_date date, end_date date,
      members text[], water text not null default 'mar' check (water in ('mar','rio')),
      night_fishing bool not null default false, created_at timestamptz default now())
checklist_items(id uuid pk, trip_id uuid fk, text text, who text, done bool default false,
                created_at timestamptz)
itinerary_items(id uuid pk, trip_id uuid fk, starts_at timestamptz, title text, notes text)
catches(id uuid pk, trip_id uuid fk, member text, species text, length_cm numeric,
        released bool, photo_path text, caught_at timestamptz, lat float8, lon float8,
        tide_phase text, tide_height_m numeric, wind_kmh numeric, wind_dir_deg numeric)
spots(id uuid pk, name text, lat float8, lon float8, species text[], best_tide text,
      depth_m numeric, notes text, created_by text, created_at timestamptz)
soundings(id uuid pk, lat float8, lon float8, depth_measured_m numeric,
          tide_height_m numeric, depth_datum_m numeric, measured_at timestamptz,
          created_by text)   -- depth_datum_m = medido − altura de marea
```

- **Storage:** bucket `catch-photos`, con rutas `<trip_id>/<uuid>.jpg`.
- **IDs:** el cliente genera los UUID de cada fila. Así una escritura en cola sin señal se puede reintentar sin duplicarse (upsert idempotente).

### 3.3 Seguridad sin cuentas
- El cliente manda el header `x-trip-id: <id>` en cada pedido (opción `global.headers` de supabase-js).
- Las políticas RLS de `trips`, `checklist_items`, `itinerary_items` y `catches` exigen `trip_id` (o `id`) igual a `(current_setting('request.headers', true)::json->>'x-trip-id')::uuid`.
  - La documentación de Supabase confirma que esto funciona en la API REST.
  - Ese header **no llega** a Realtime, que la app no usa.
- **Resultado:** sin el UUID del viaje no se puede listar ni modificar nada de ese viaje.
- **Crear un viaje:** `insert` abierto para la clave anónima.
- **`spots` y `soundings`:** lectura, inserción y edición abiertas. No tienen datos sensibles.
- **Storage (confirmado):**
  - **En el código de `supabase/storage`:** el servidor carga en la base `set_config('request.headers', …)` con `JSON.stringify` de todos los headers del pedido (`src/internal/database/postgres/scope.ts` y `pg-connection.ts`). Las políticas de `storage.objects` pueden leer `x-trip-id` igual que las tablas.
  - **CORS:** un pedido de verificación (OPTIONS) a Storage y a REST de un proyecto Supabase respondió `access-control-allow-headers` con `x-trip-id`, así que el navegador puede mandarlo.
  - **Política:** lectura pública por ruta. Escritura solo si la primera carpeta de la ruta es igual a `x-trip-id`.
  - El primer día igual se corre una prueba de punta a punta (§7).
- **Límite conocido:** cualquiera con el link puede editar. Para un grupo de amigos es aceptable.

### 3.4 Offline primero

**Principio:** la app lee siempre de los datos locales. La red solo sirve para traer datos nuevos y subir los cambios. Ninguna pantalla espera a la red para mostrarse.

- **App:** `vite-plugin-pwa` precachea todos los archivos, incluido `species.json` y los datos de emergencias. Se instala desde "Agregar a pantalla de inicio".
- **Instalación obligatoria en iPhone:** según WebKit, Safari borra los datos guardados por un sitio (IndexedDB, caché, etc.) tras 7 días de uso de Safari sin interactuar con ese sitio. Las apps de pantalla de inicio llevan su propia cuenta de días y WebKit no espera que borren datos propios. El primer uso guía la instalación y además se pide `navigator.storage.persist()` en cada "Preparar viaje"; si el teléfono no lo da, la pantalla lo avisa. WebKit: sin esa protección puede borrar todo un sitio si falta espacio ([política de almacenamiento](https://webkit.org/blog/14403/updates-to-storage-policy/)).
- **Abrir la app (3/11, comentario desde el ícono):** el iPhone cierra las apps de pantalla de inicio y las abre en `start_url` ("/"). Por eso "/" entra directo al último viaje abierto; a los demás se llega desde Más → Otros viajes.
- **Satélite en IndexedDB, no en la Cache API (4/11):** un video del iPhone mostró ~39 s desde tocar el ícono hasta ver la app (~10 s en negro y ~29 s en blanco), con las 24.688 teselas en la Cache API. En el código de WebKit cada entrada es un archivo, y cualquier `caches.match` o `caches.open` espera a que se abran todos los cachés, leyendo todos esos archivos: pasa antes de entregar la página. Medido el 4/11 en WebKit de Mac (app real, en frío, mediana de 5, teselas de prueba de 6 KB), hasta recibir la página: 3.162 ms con las teselas en la Cache API y 46 ms después de pasarlas. La copia de las 24.688 tardó 7 s. No se midió en iPhone. Las teselas van en la base `sat-tiles` (`src/map/satStore.js`), que no se abre al arrancar, y la capa del mapa las lee de ahí. Profundidad (412) y fotos siguen en la Cache API. "Preparar viaje" con satélite copia lo que haya en `sat-v1` sin volver a bajarlo y borra ese caché al completar; hasta entonces un cartel lo pide y el service worker sigue sirviendo `sat-v1`, así no se pierde el uso sin señal. Límite conocido: quien elige "sin satélite" conserva `sat-v1`, y con él la demora, hasta que elija "con satélite".
- **Descarga cortada:** una corrida cortada no baja lo guardado: la cuenta anterior vale hasta que termina cada paso, y el avance se guarda cada 300 teselas **[diseño]**. Durante la descarga se pide mantener la pantalla prendida (Wake Lock; en apps de pantalla de inicio el soporte no está confirmado, por eso también se pide por texto).
- **Descarga fuera de la pantalla (4/11, `src/prepare/run.js`):** sigue al cambiar de pestaña, con una barrita de avance en todas, no arranca dos veces y pide la pantalla prendida mientras corre. Con la app afuera no puede seguir en iPhone: Safari no soporta Background Fetch ([datos de MDN](https://github.com/mdn/browser-compat-data/blob/main/api/BackgroundFetchManager.json)), e iOS congela la app (según fuentes viejas, no probado en el iPhone). Al volver pregunta "¿Seguir la descarga?" con los MB que faltan, y no pide más tandas hasta la respuesta. Safari tampoco dice si hay wifi o datos ([NetworkInformation](https://github.com/mdn/browser-compat-data/blob/main/api/NetworkInformation.json)), así que en iPhone pregunta siempre; donde el teléfono dice wifi (Chrome en Android) sigue sola. **[diseño]** Si la app se cerró del todo no arranca sola: un cartel ofrece seguir, para no gastar datos sin pedirlo.
- **Resultado en iPhone (video del 4/11):** de ~39 s a ~1,5 s desde tocar el ícono hasta ver la app, sin pantalla blanca. Revisar las 24.688 teselas ya guardadas tardó ~4-5 s.
- **Tiempo estimado del satélite:** se calcula con lo que falta. Si ya está todo, el botón dice "ya está bajado". Si falta bajar, muestra un rango de ~15 a 38 min para las 24.688. El satélite baja de a 12 pedidos **[diseño]**: el 4/11 en WebKit de Mac, alternando sobre teselas mezcladas (3 rondas de 100, sin errores), dio 28,7 teselas por segundo contra 18,9 de a 6. El otro extremo del rango es lo peor medido de a 12: 11,1 (muestra de 120 en Chromium). Las pruebas varían mucho y no se midió una descarga real en iPhone.
- **Comentarios:** el dato de navegador lleva adelante si está abierta desde el ícono, si lo guardado está protegido, cuánto ocupa y cuánto tardó en cargar.
- **Pronóstico:** se guarda en IndexedDB por lugar y fecha, con la hora de descarga.
  - Con señal se refresca solo si tiene más de 1 hora **[diseño]**.
  - La antigüedad siempre está a la vista, y si supera las 24 h **[diseño]** se pone en ámbar: "el pronóstico tiene 30 h, puede haber cambiado".
  - El puntaje, las ventanas, la marea en cada captura y la luna se calculan en el teléfono a partir de esos datos.
- **Mapa base:** el `.pmtiles` regional, guardado entero en IndexedDB (§3.1).
- **Profundidad:** "Preparar viaje" pide las teselas terrarium de zoom 8–10 en un radio de 250 km **[diseño]**: 412 teselas, unos 21 MB estimados con el promedio medido el 30/10 a 80 km (60 teselas, 3,1 MB). Medido ese día en 8 puntos del mar de San Blas: zoom 8–10 dan entre −2 y −25 m, y zoom 11–12 dan 0 m. Desde zoom 11 se agranda la tesela z10 con interpolación y las guarda en la Cache API. Son pedidos GET comunes a AWS Open Data.
- **Datos compartidos:** checklist, itinerario, capturas, spots y sondeos también se guardan en IndexedDB. La interfaz los lee de ahí, y con señal se traen los cambios de los demás.
- **Escrituras:** se aplican en la interfaz al instante y se encolan en IndexedDB, incluida la foto completa como Blob.
  - La cola se procesa al abrir la app, al volver la conexión (evento `online`) y cada 60 s **[diseño]**.
  - Safari (iOS y escritorio) no soporta la API Background Sync, así que en iPhone se sube cuando la app está abierta.
  - Un indicador muestra "N pendientes" y abre la lista.
- **GPS:** funciona sin internet. Se usa para la posición en el mapa, marcar puntos, ir a un punto, emergencias y capturas.
- **Brújula:** viene de `DeviceOrientationEvent`. En iPhone hay que pedir permiso con un toque (`DeviceOrientationEvent.requestPermission()`).

## 4. Puntaje de pesca

**Todo este capítulo es [diseño]:** una regla aproximada que parte del razonamiento de Fernando en el chat (creciente y repunte) y de criterios comunes. No son datos medidos. Pesos y umbrales viven en `src/score/config.js` y se ajustan con las capturas.

Se calcula para cada hora `h` del día.

```
base = 0.5·marea + 0.3·viento + 0.1·luna + 0.1·clima     (cada factor de 0 a 1)
puntaje = round(10 · base · luz)
```

### Marea
Se toma la posición de `h` dentro del ciclo, entre el extremo anterior y el siguiente.
- **Costa:**
  - últimas 2 h de creciente y hasta 1 h después de la pleamar: 1.0;
  - resto de la creciente: 0.7;
  - de 1 a 2 h después de la pleamar: 0.5;
  - bajante: 0.25;
  - ±1 h de la bajamar: 0.2.
- **Embarcado:**
  - ±1 h de cualquier extremo (repunte, corriente floja): 1.0;
  - de 1 a 2 h del extremo: 0.6;
  - mitad de la marea: 0.2.

### Viento (km/h, se usa el máximo entre viento medio y 0.7·ráfaga, tomando la mediana de los modelos disponibles a esa hora)
- **Costa:** ≤15 → 1.0; ≤25 → 0.6; ≤35 → 0.2; más de 35 → 0.
- **Embarcado:** ≤12 → 1.0; ≤20 → 0.6; ≤25 → 0.3; más de 25 → 0.
- **Olas (embarcado):** con más de 1.2 m, viento = 0.

### Luna (con suncalc ≥2: `getMoonTimes` da `rise`, `set`, `transit` y `lowerTransit`; `getMoonIllumination` da `fraction`)
- **Base:** 0.3.
- ±1 h del tránsito superior o inferior: +0.5.
- ±30 min de la salida o puesta de la luna: +0.3.
- Con una iluminación menor a 10% o mayor a 90% (luna nueva o llena): +0.2.
- Tope: 1.0.

### Clima
1 − probabilidad de lluvia/100 (mediana de los modelos).

### Luz
- **Noche** (antes de la salida o después de la puesta del sol): si el viaje no tiene pesca nocturna, el puntaje tiene tope 2 y se muestra en gris. Con pesca nocturna, la noche puntúa normal (franja sombreada solo como referencia) y las ventanas pueden caer de noche.
- **Primera y última hora de luz:** +1, con tope 10.

### Ventanas
- Una ventana es una serie de horas seguidas con puntaje de 7 o más (todas de día, salvo que el viaje tenga pesca nocturna).
- Se recortan los bordes a la media hora usando la hora de los extremos de marea cuando corresponde.
- **Motivo:** se arma con el factor de marea dominante y el viento promedio.
- Se muestran hasta 3 por día, ordenadas por puntaje. Si no hay ninguna de 7 o más, se muestra la mejor del día con "día flojo".

## 5. Errores
- **Error de red al pedir el pronóstico:** se usa la caché. Sin caché aparece "Sin datos todavía. Abrí la app con señal antes de salir".
- **Día fuera de horizonte:** el mensaje de §3.1.
- **Falla al escribir en Supabase:** queda en la cola y se reintenta con backoff (espera creciente). Nunca se descarta.
- **Foto:** antes de subirla se reduce a 1600 px de lado mayor, en JPEG con calidad 0.8 **[diseño]**.
- **Sin permiso de GPS:** la captura se guarda sin coordenadas. "Marcar punto", "Ir a punto" y Emergencias explican cómo activar el GPS.
- **Sin espacio en el teléfono o descarga cortada:** "Preparar viaje" retoma donde quedó y avisa qué falta.
- **Sin brújula o sin permiso:** "Ir a punto" muestra el rumbo en grados y la distancia, sin flecha.
- **Concurrencia:** gana el último cambio. Se refresca al abrir la app y al volver a ella.

## 6. Pruebas
- **Automáticas (Vitest), sobre la lógica pura:**
  - `tides.js`: detección de extremos con la serie real de San Blas del 7/11 guardada como fixture; tienen que coincidir con tide-forecast (00:42 / 07:05 / 13:09 / 19:09) con 20 min de tolerancia.
  - `score.js`: casos borde (noche, viento extremo, repunte en costa vs embarcado, un solo modelo disponible).
  - `windows.js`: unir horas, recortar, el caso "día flojo".
  - Luna: fase conocida en una fecha conocida.
  - `depth.js`: decodificar el píxel terrarium probado (−36,9 m) y corregir un sondeo por la marea.
  - `nav.js`: distancia y rumbo entre dos puntos conocidos.
  - `prepare.js`: la lista de teselas para un radio y un rango de zoom (cantidad esperada, sin duplicados).
- **Manuales en el celu:**
  - Instalar, tocar "Preparar viaje", poner modo avión y recorrer todas las pestañas: nada puede quedar en blanco, mapa incluido.
  - Siempre en modo avión: cargar una captura con foto, marcar un punto, cargar un sondeo, usar "Ir a punto" y abrir Emergencias.
  - Recuperar la señal y verificar que todo se sube.
  - Abrir el link en un segundo teléfono y verificar que se ve lo compartido.

## 7. Orden de entrega (viaje: sábado 7/11)
El offline no es una etapa aparte: cada pantalla se construye leyendo de los datos locales desde el primer día.

1. **Vie 30/10 – sáb 31/10:**
   - **Primero, dos pruebas cortas:** subir una foto de punta a punta con la política de Storage de §3.3, y recortar el `.pmtiles` de San Blas para medir su tamaño.
   - Después: proyecto, Supabase, capa local (IndexedDB y cola de escrituras), viajes, link y "Soy X", y Pronóstico con puntaje y ventanas, que ya anda offline. Se publica en Cloudflare Pages.
2. **Dom 1/11 – lun 2/11:** Checklist, Itinerario, Emergencias y "Preparar viaje" (pronóstico y datos).
3. **Mar 3/11 – mié 4/11:** Capturas (condiciones y fotos) y Mapa (mapa base offline, spots, GPS, marcar e ir a punto, profundidad y sondeos), más la descarga de mapa y profundidad en "Preparar viaje".
4. **Jue 5/11:** leer el reglamento oficial 2026 de Buenos Aires (§2.7), Especies y reglamento (solo lo verificado), spots iniciales de San Blas con fuente.
5. **Vie 6/11:** prueba completa en modo avión con los 5 celulares, y ajustes.

**Prerrequisitos del usuario:** una cuenta de Cloudflare (Pages y R2) y un proyecto de Supabase (existente o nuevo).

## 8. Fase 2: pesca de río (después del 7/11)

**Uso real:** el grupo pesca seguido en el Paraná de las Palmas a la altura de Lima (Zárate), embarcado y de costa. Pescan desde la costa de una chacra en Chacras del Paraná (Lima) o salen en lancha, incluso aguas arriba. Se construye sobre los campos `water` y `night_fishing` que ya existen desde la fase 1.

**Dos partes (ampliado el 11/11/2026, a partir del comentario del 8/11 en la app):**
1. **Que la app entienda el río (§8.1–8.5):** altura del INA en vez de marea, puntaje de "cuándo" en río, reglamento según la orilla, sondeos y spots.
2. **Dónde pescar (§8.6):** recomienda pesqueros con puntaje y "por qué". Sirve en río y en mar, y necesita la parte 1 para el río.

Lo verificado el 11/11 está en §9.1.

### 8.1 Altura del río en vez de marea de mar
- **Fuente:** API pública del INA (sistema de alerta a5), JSON sin clave y con CORS abierto. Probada el 29/10:
  - **Estaciones:** `GET https://alerta.ina.gob.ar/a5/obs/puntual/estaciones?nombre=<texto>&format=json` devuelve id, coordenadas, río y niveles de alerta, evacuación y aguas bajas. La búsqueda distingue acentos: "Zárate" encuentra y "Zarate" no.
  - **Series de una estación:** `GET /a5/obs/puntual/series?estacion_id=<id>&format=json` (la respuesta viene en `rows`).
  - **Alturas medidas:** `GET /a5/obs/puntual/series/<serie>/observaciones?timestart=<iso>&timeend=<iso>&format=json`.
  - **Pronóstico:** `GET /a5/sim/calibrados/<cal>/corridas/last?estacion_id=<id>&includeProno=true&format=json`. Devuelve `series[].pronosticos` con valores `main` y una banda `p01`–`p99`.
- **Estaciones cerca de Lima** (verificadas el 29/10):
  - **Zárate:** estación 5907, Paraná de las Palmas, red RHN.
    - Altura hora por hora en la serie 29437. El 29/10 osciló entre 0,78 y 1,14 m, con dos máximos en el día.
    - **Pronóstico:** calibrado 440 (`regre_zarateatuchacampanaescobar`), paso horario, serie 29534. La corrida del 29/10 a las 18:00 (hora local) llegaba hasta el 1/11 a las 21:00 local, unos 3 días.
    - La API da para Zárate: alerta 2,0 m, evacuación 2,2 m y aguas bajas 0,3 m.
  - **Atucha** (localidad Lima según la API): estación 8208, serie 42645, una lectura por hora. **No tiene pronóstico**: la corrida del calibrado 440 solo trae la serie de Zárate.
  - **Campana** (41), **Escobar** (42) y **Zárate de Prefectura** (40): una lectura por día.
- **Elección de estación (corregido el 11/11 al planificar):** el viaje usa **una sola estación, la más cercana que tenga pronóstico**. De ella salen la altura medida y el pronóstico, y con esa misma altura se guardan las capturas y se corrigen los sondeos. Así todo queda sobre el mismo cero y se puede comparar.
  - Las estaciones con pronóstico viven en `src/data/stations.json`, con su id, sus series, coordenadas y niveles. Hoy hay una sola: **Zárate**, estación 5907, con la serie medida 29437 y el pronóstico 29534 del calibrado 440.
  - Si no hay ninguna a menos de 60 km [diseño] del lugar, el viaje de río queda sin altura y con aviso. En ese caso, el puntaje de "cuándo" se arma solo con viento, presión, luna y clima.
  - La corrida del pronóstico trae también los últimos ~6 días simulados, hora por hora. Para cada hora se usa la altura medida si existe, y si no, el valor `main` del pronóstico.
- **Pantalla Pronóstico en río:** en vez de la curva de marea se ve la curva de altura (medida más pronóstico, con su banda) y las líneas de alerta y aguas bajas.
  - Se marcan los máximos y mínimos de la oscilación diaria.
  - **Tendencia de 3 días:** "creciendo", "estable" o "bajando", con los cm por día.
- **Offline:** "Preparar viaje" guarda las alturas de los últimos 7 días y el último pronóstico, con su hora.
- **Chacras del Paraná (verificado el 11/11):**
  - Según OpenStreetMap queda en −33,968, −59,256, sobre la margen derecha del Paraná de las Palmas, cerca de la boca del río Areco y unos 4,5 km aguas arriba de Atucha I (−33,970, −59,206).
  - La estación más cercana es **Atucha (8208)**, a 4,5 km, y el 11/11 seguía dando una lectura por hora. Pero no tiene pronóstico y su cero es distinto: a las 18:00 local daba 1,97 m y Zárate 0,78 m. Por eso no se usa (ver "Elección de estación").
  - El pronóstico sale de Zárate: la corrida del calibrado 440 del 11/11 a las 12:00 local llega hasta el 14/11 a las 21:00 local, unos 3,5 días.
  - La 8208 y la 151, las dos "Atucha", también difieren entre sí (1,97 y 2,07 m). Cada valor guardado lleva la serie de la que salió (`level_source`).
- **Mapa base y satélite en río (agregado el 11/11 al planificar):** hace falta una región nueva, "Lima", en `regions.json`.
  - El radio es de **100 km** alrededor del lugar [diseño], no 250: alcanza para subir en lancha hasta San Pedro (unos 55 km) y Ramallo (unos 85 km), y no mete toda la ciudad de Buenos Aires ni Rosario en el archivo.
  - El tamaño del recorte se mide al extraerlo. Si pasa los 25 MiB va a R2, como San Blas.
  - El satélite y los spots usan el mismo radio en río.

### 8.2 Puntaje en río (todo [diseño], igual que §4)
- **Factor "agua"** (reemplaza a marea, 50%):
  - **Oscilación diaria:** se trata igual que la marea. Costa: subiendo y repunte. Embarcado: alrededor de los cambios.
  - **Tendencia de varios días:** estable o creciendo despacio, ×1.0; bajante rápida (más de 15 cm por día), ×0.6; creciente fuerte (más de 30 cm por día), ×0.7.
- **Factor "presión"** (10%, se descuenta de luna y clima en río):
  - Viene de Open-Meteo (`surface_pressure`, ya incluida en el pedido de clima).
  - Si cae 2 hPa o más en 6 h: 1.0. Estable: 0.6. Si sube rápido: 0.3.
  - También se calcula en mar, pero con peso 0 hasta que haya capturas que lo justifiquen.
- **Viento:** se muestra la dirección y la velocidad. No hay reglas propias sobre su efecto en la altura del río: el modelo del INA ya usa el viento, y no encontré una fuente que respalde una regla simple por dirección.
- **Pesca nocturna:** los viajes de río la tienen activada por defecto, con la regla de §4 "Luz". Los reportes de pesca de la zona Zárate–Campana describen boga y surubí sobre todo de noche (§9).

### 8.3 Temperatura del agua
- **Mar:** Open-Meteo Marine `sea_surface_temperature`, ya en fase 1.
- **Río:** al implementar se busca en el INA alguna serie de temperatura del agua en el bajo Paraná. Si no hay, se estima con el promedio de la temperatura del aire de los últimos 5 días, marcado como "estimada".
- **Uso:** se muestra en el día. En la guía de especies solo se agregan rangos de temperatura que tengan fuente.

### 8.4 Reglamento según la orilla
- **Zonas:** cada zona es un polígono simplificado de jurisdicción con su reglamento. En Lima, el límite entre Buenos Aires y Entre Ríos sale de los límites provinciales de OpenStreetMap (admin_level 4), simplificado. Al implementarlo se verifica, contra ese límite, qué orilla e islas son de cada provincia; el texto anterior ("margen de Buenos Aires e islas de Entre Ríos") no tenía fuente. El límite se dibuja aproximado, con un aviso.
- **Uso:** la guía de especies y el aviso de licencia usan la zona según tu posición GPS (sin internet) o el lugar del viaje. A menos de 1 km del límite **[diseño]** se muestran las dos.
- **Especies de río:**
  - **Con fuente para el tramo Zárate–Campana** (reportes de pesca): boga, dorado, bagre blanco y amarillo, armado, patí y surubí.
  - **Con fuente para la cuenca** (FAO, estudio del NEA): sábalo.
  - **Sin fuente encontrada para este tramo:** tararira y pejerrey. Van solo si aparece una.
  - Cada especie lleva medida mínima, cupo, vedas y devolución obligatoria por provincia, solo con fuente oficial.
  - Las tallas del reglamento binacional del Paraná y Paraguay limítrofe (por ejemplo, dorado 75 cm) **no** valen para Lima.
- **Entre Ríos y el dorado: Ley 11.174** (confirmada en la ficha del Senado de Entre Ríos). Promulgada el 20/12/2024 y publicada en el Boletín Oficial el 30/12/2024. Declara al dorado, "en todas sus especies", pez de interés turístico provincial.
  - Según una copia del texto (AICACYP) y la prensa: prohíbe la pesca comercial, el acopio, la venta, la tenencia y el tránsito, con excepciones para la pesca deportiva con devolución obligatoria, los pobladores ribereños y los pescadores artesanales. Fue reglamentada en mayo de 2025.
  - Antes de publicarlo en la app se lee el texto oficial (descarga de la ficha del Senado).
  - "11.175" era un error de una nota policial.
- **Pejerrey en aguas interiores de Buenos Aires:** la DI-2019-483 fija una veda del 1/9 al 1/12. La DISPO-2021-116 permite la pesca deportiva y recreativa durante la veda los sábados, domingos y feriados. Falta confirmar si alcanza al Paraná de las Palmas.
- **Emergencias:** se agrega la dependencia de Prefectura más cercana (Zárate), con contactos verificados en el sitio oficial.

### 8.5 Profundidad y spots en río
- **Profundidad:** las teselas globales no tienen datos en el río, así que la capa se oculta en viajes de río. Los sondeos del grupo son la única fuente.
- **Corrección de sondeos:** en río se descuenta la altura del INA de la estación del viaje, interpolada a la hora del sondeo, en vez de la marea. Se agrega `soundings.level_source text` (`marea` o `ina:<serie>`).
- **Spots:** campo opcional "altura de río recomendada" (`spots.best_level_min_m`, `spots.best_level_max_m`). §8.6 lo usa para puntuar.
- **Capturas en río:** las condiciones de cada captura (§2.6) usan la altura del INA en vez de la marea.
  - Se guarda en `tide_height_m`, igual que en los sondeos, y se agrega `catches.level_source text` (`marea` o `ina:<serie>`).
  - La fase (`tide_phase`) sale de la oscilación diaria del río, con los mismos nombres que en mar: creciente, bajante, pleamar y bajamar.

### 8.6 Dónde pescar
Responde el comentario del 8/11: *"Que nos ayude a encontrar dónde pescar además de cuándo… Que haga recomendaciones de lugares puntuándolo y por qué están puntuados así."*

**Idea:** los lugares salen de dos fuentes, lo que carga el grupo y lo que dice una fuente citada. El puntaje combina el "cuándo" que ya existe con las reglas de cada lugar y con lo que el grupo ya pescó ahí. No se puntúan zonas del mapa sin dato.

**Qué no entra, y por qué (verificado el 11/11, §9.1):**
- **Corrientes:** Open-Meteo no tiene celdas en el río. En San Blas sus celdas miden 7 a 9 km, ven tierra en el pueblo y no resuelven el canal. Su propia documentación dice que en la costa la precisión es limitada. No hay otra fuente pública.
- **Temperatura del agua:** en el río no hay serie (§8.3). En el mar, la de Open-Meteo usa la misma grilla de 8 km y no hay regla con fuente que la convierta en "mejor lugar".
- **Profundidad del río:** no encontré batimetría pública descargable. Las cartas del SHN y el modelo de elevación del Delta del INA (2017) existen, pero no están para bajar. El Boletín Fluvial da un solo dato por tramo: el paso menos profundo del canal de navegación.
- **Rasgos del río como regla** (boca de arroyo, vuelta, descarga de Atucha): no encontré fuente que diga que pescan mejor. Se pueden cargar como pesqueros comunes, pero no suman puntos por ser lo que son.

**Datos del pesquero** (tabla `spots`, migración 004):
- `access text` con valores `costa`, `embarcado` o `ambos`; si queda vacío, cuenta como `ambos`.
- `source text`: la cita, con su link. Si queda vacío, lo cargó el grupo.
- `best_tide` ya se elige de una lista en la app (`creciente`, `pleamar`, `bajante`, `bajamar` o vacío). La migración agrega un `check` con esos valores, y un valor viejo que no coincida pasa a `notes`.
- Siguen igual el rango de altura (§8.5), las especies, las notas y quién lo cargó.

**Puntaje del pesquero (todo [diseño], en `src/score/config.js`).** Se calcula para el día y el modo (costa o embarcado) elegidos. Entran los spots del radio del viaje cuyo `access` coincide con el modo.
1. **Base:** el puntaje horario más alto del día (§4 en mar, §8.2 en río).
   - Si el pesquero tiene `best_tide`, solo cuentan las horas en esa fase. Si no hay ninguna, la base es 0 con el motivo "hoy no le da el agua".
   - La hora elegida y su ventana (§4 "Ventanas", sobre esas horas) se muestran como "anzuelos al agua" de ese lugar.
2. **Altura (solo río, si el pesquero tiene rango):** si la altura pronosticada a esa hora queda fuera del rango, **−3** [diseño].
   - Si ese día no tiene pronóstico de altura (pasado el horizonte de unos 3 días), no se aplica y se avisa "sin pronóstico de altura".
3. **Lo que pescó el grupo:** se cuentan las capturas **de todos los viajes** a menos de **300 m** [diseño] del pesquero con condiciones parecidas a las de esa hora.
   - Hoy cada captura solo se ve dentro de su viaje (RLS de §3.3). Para esto se agrega la función `catches_near(lat, lon, km)` (migración 004, `security definer`), que devuelve solo `species`, `caught_at`, `lat`, `lon`, `tide_phase`, `tide_height_m` y `level_source`, sin quién, foto ni viaje.
   - Expone las posiciones y especies de las capturas a quien tenga la clave pública, igual que los spots hoy.
   - "Preparar viaje" la guarda para usarla sin señal.
   - Se cuentan las capturas con condiciones parecidas:
   - en mar, la misma `tide_phase`;
   - en río, una altura a menos de **0,2 m** [diseño] de la pronosticada.
   - Con 1 o 2 capturas, **+1**; con 3 o más, **+2** [diseño].
4. **Resultado:** queda entre 0 y 10, redondeado. Se ordena por puntaje y, si empatan, por cercanía al lugar del viaje.

**Aviso fijo en la pantalla:** "Al principio casi todos los lugares tienen el mismo puntaje: solo los distinguen sus reglas y lo que pesquen ustedes. Carguen las capturas en el lugar donde salieron."

**"Por qué":** una línea por cada término que sumó o restó, con su origen. Estos ejemplos muestran el formato; los números no son datos:
- "Ventana HH:MM–HH:MM · N/10 · río creciendo despacio, viento N km/h" [diseño §8.2];
- "El grupo sacó N <especie> acá con el río entre A y B m (última: <fecha>)" (sus capturas);
- "Altura prevista X m, dentro del rango que cargaron (A–B m)";
- "Fuente: Crónica Pesca, 26/3/2026 (prensa)" o "Fuente: Llompart 2011, pág. 73".

Los pesqueros que solo tienen fuente externa y ninguna captura dicen "sin capturas del grupo todavía".

**Pantalla:**
- **Pronóstico:** debajo de "Anzuelos al agua" va la sección "Dónde". Muestra los 3 mejores [diseño], cada uno con nombre, puntaje, hora y "por qué" desplegable, y abajo "Ver todos".
- Tocar un lugar abre el Mapa con "Ir a punto" (§2.3) hacia ese lugar.
- En el Mapa, el pesquero muestra su puntaje del día y su "por qué".
- **Offline:** todo se calcula en el teléfono con lo que ya está guardado (spots, capturas, pronóstico y alturas del INA). No pide nada nuevo a internet.

**Pesqueros que se cargan con fuente** (filas en la migración 004, con `created_by = 'fuente'` y UUID fijos):
- **Río:** las posiciones salen de OpenStreetMap. Si OSM no tiene el lugar, no se carga y lo marca el grupo en el agua con "Marcar punto".
  - Frente al camping Las Tejas, embarcado, bogas: según Crónica Pesca (26/3/2026), "buen rinde de bogas de embarcado". La posición del camping en OSM es −34,104, −58,994.
  - Muelle cerealero de Lima y Vuelta de San Antonio: según la misma nota. El 11/11 no los encontré en OSM, así que no se cargan hasta tener una posición con fuente.
  - La costa de la chacra la marca el grupo con GPS.
- **Mar (San Blas, por si vuelven):** solo los sitios con coordenadas en Llompart 2011, cap. 3:
  - Punta Segunda (−40,54, −62,24): costa, variada, `best_tide = bajamar` ("sobre todo de corvina en marea baja", pág. 72);
  - La Rebeca (40°34′S, 62°13′–62°12′O): costa, variada; se carga el punto medio, 40°34′S, 62°12,5′O;
  - fin de la Playa de Arena, Mina de Hierro (40°35′S, 62°10′O): costa, variada; en notas, cazón de costa en octubre y menos en noviembre.
  - El Puente del arroyo Jabalí no se carga: la tesis no da coordenadas, y su regla ("solo en la pleamar, con un desfase de 1–2 h") no entra en `best_tide`. Si el grupo lo marca, la regla va en las notas.
- **Antes de cargar cualquier pesquero cerca de Atucha** se averigua con Prefectura o con la ARN si hay una zona de exclusión para navegar o pescar. Hasta confirmarlo, no se carga ningún pesquero con fuente a menos de 2 km de la central [diseño], y los que marque el grupo en esa zona muestran el aviso "zona de la central: verificar si se puede pescar".

### 8.7 Fuera de alcance de la fase 2
- Tráfico de buques de la Hidrovía y cartas fluviales oficiales.
- Corrientes, temperatura del agua y batimetría del río como datos de puntaje, porque no hay fuente pública (§8.6).
- Leer los informes de pesca de la prensa en forma automática.
- Reglas por tipo de lugar sin fuente: boca de arroyo, vuelta, descarga térmica.

### 8.8 Pruebas de la fase 2
- **Automáticas:**
  - con una serie real de Zárate guardada como fixture: detectar la oscilación diaria, calcular la tendencia y aplicar el factor presión;
  - elegir la estación más cercana;
  - corregir un sondeo con la altura del INA;
  - elegir la zona por punto, incluido el caso borde a menos de 1 km del límite.
- **Automáticas, dónde pescar:**
  - un pesquero con `best_tide = bajamar` sin horas de bajamar en el día da 0 y "hoy no le da el agua";
  - fuera del rango de altura resta 3, y sin pronóstico de altura no resta;
  - con 0, 2 y 3 capturas parecidas a menos de 300 m suma 0, +1 y +2; una captura a 301 m no cuenta;
  - el filtro por modo: un pesquero de costa no aparece en embarcado;
  - cada término del puntaje produce su línea de "por qué" con el origen;
  - la migración 004 pasa los `best_tide` viejos que no coinciden a `notes`.
- **Manuales:**
  - crear un viaje de río en Lima, preparar el viaje, ponerse en modo avión y ver altura, pronóstico, reglamento por zona y spots en rango;
  - en modo avión, ver la sección "Dónde", abrir el "por qué" y tocar un lugar para ir al Mapa.

## 9. Registro de verificación (29/10/2026)

| Dato | Fuente | Estado |
|---|---|---|
| Plan del viaje (fechas, 2,5 h, cazón el lunes) | Chat del grupo y aclaración de Nacho | ✓ |
| Mareas del 8/11 de Fernando = tide-forecast | [tide-forecast San Blas](https://www.tide-forecast.com/locations/San-Blas-Argentina/tides/latest) | ✓ coinciden al minuto |
| Open-Meteo vs tide-forecast, 7/11 | Pedido real a la API vs la página | ✓ máximo 18 min |
| Parámetros y horizonte de Open-Meteo | Pedidos reales a la API | ✓ marea ~9 días; ICON ~7, ECMWF/GFS ~15 |
| Desacuerdo de modelos de 19,8 km/h | Pedido real a la API | ✓ |
| CORS de Open-Meteo, AWS e INA | Headers reales | ✓ |
| Clave gratis de Windy con datos alterados; 990 €/año | [Windy, precios](https://api.windy.com/point-forecast/pricing) | ✓ oficial |
| Windguru sin API pública | Búsqueda sin resultados | ⚠ no encontrado (no es prueba de que no exista) |
| SMN sin API documentada; dataset a 5 días | [datos.gob.ar](https://datos.gob.ar/dataset/smn-pronostico-tiempo-5-dias) | ⚠ no encontré API |
| OSM prohíbe offline y precarga en tile.openstreetmap.org | [Política de teselas de OSM](https://operations.osmfoundation.org/policies/tiles/) | ✓ cambió el diseño |
| Protomaps: ODbL, zoom 0–15, recorte con `pmtiles extract` | [Descargas](https://docs.protomaps.com/basemaps/downloads), [CLI](https://docs.protomaps.com/pmtiles/cli) | ✓ |
| `pmtiles` tiene `FileSource(file)` | Tipos de pmtiles@4.5.0 | ✓ |
| R2: 10 GB gratis, sin egreso; Pages: 25 MiB por archivo | [R2](https://developers.cloudflare.com/r2/pricing/), [Pages](https://developers.cloudflare.com/pages/platform/limits/) | ✓ |
| Terrarium en el mar = ETOPO1 de 1′ | [tilezen/joerd](https://github.com/tilezen/joerd/blob/master/docs/data-sources.md) | ✓ corregido (antes decía 450 m) |
| Valores de profundidad en San Blas | Decodificación real de teselas | ✓ |
| GEBCO 2026 de 15″, descarga por área | [GEBCO](https://www.gebco.net/data-products/gridded-bathymetry-data) | ✓ |
| suncalc 2.x con `transit` y `lowerTransit` | Código de suncalc@2.1.1 | ✓ (la 1.9 no lo trae) |
| Safari: borrado a los 7 días; apps de inicio exentas | [WebKit](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/) | ✓ |
| Safari sin Background Sync | [caniuse](https://caniuse.com/background-sync) | ✓ |
| `request.headers` en RLS (REST); no llega a Realtime | [Supabase](https://supabase.com/docs/guides/api/securing-your-api), [supabase-js #1797](https://github.com/supabase/supabase-js/issues/1797) | ✓ |
| Storage carga `request.headers` con todos los headers | [supabase/storage scope.ts](https://github.com/supabase/storage/blob/master/src/internal/database/postgres/scope.ts), pg-connection.ts | ✓ código fuente |
| CORS de Supabase acepta `x-trip-id` | OPTIONS real a Storage y REST | ✓ |
| Prefectura 106 y canal 16 (156,800 MHz) | [argentina.gob.ar, emergencias](https://www.argentina.gob.ar/tema/emergencias), [PNA](https://www.argentina.gob.ar/node/235064) | ✓ |
| Especies y temporada de San Blas | [Tesis UNLP, Llompart 2011](https://sedici.unlp.edu.ar/handle/10915/34280); cazón: [Río Negro](https://www.rionegro.com.ar/voy-turismo/bahia-san-blas-tiempo-de-descuento-el-plan-para-marzo-y-semana-santa-hay-mas-que-pesca-2767201/?amp=1) | ✓ académica · ⚠ cazón de noche solo por prensa |
| Disposición 217/07: cazón con devolución obligatoria, tallas y cupos | [Texto oficial, normas.gba.gob.ar](https://normas.gba.gob.ar/documentos/0nvkq6iM.html) | ✓ texto · ⚠ vigencia: se confirma con el reglamento 2026 |
| Reglamento de pesca deportiva 2026 de BA | [gba.gob.ar, pesca deportiva](https://www.gba.gob.ar/desarrollo_agrario/pesca/pesca_deportiva) ([PDF en Drive](https://drive.google.com/file/d/1-6HWnpuQjw38iq0VY5R5mSJ5RnkCHgGk/view), 26 págs., creado 4/2/2026) | ✓ leído el 30/10: ambientes marinos según Disp. 217/07, mismos valores (ver nota abajo) |
| Licencia de BA: trámite en línea o presencial; costo no publicado | [gba.gob.ar, pesca deportiva](https://www.gba.gob.ar/desarrollo_agrario/pesca/pesca_deportiva) | ✓ |
| Veda de pejerrey en aguas interiores de BA | [gba.gob.ar, disposiciones](https://www.gba.gob.ar/desarrollo_agrario/pesca/legislacion/provincial/disposiciones) | ✓ · ⚠ alcance en el Paraná sin confirmar |
| API del INA: estaciones, series y pronóstico | Pedidos reales a la API | ✓ pronóstico solo en Zárate, ~3 días |
| Especies del tramo Zárate–Campana | [Crónica Pesca](https://www.cronica.com.ar/sociedad/cronica-pesca-el-pique-de-la-semana-noticias-y-detalles-claves-7318.html), [FAO](https://www.fao.org/4/ac743e/AC743E25.htm) | ⚠ reportes sin fecha visible |
| Ley 11.174 de Entre Ríos (dorado) | [Senado de Entre Ríos](https://www.senadoer.gob.ar/ley/ley-n-11174/), [copia AICACYP](https://www.aicacyp.ar/wp-content/uploads/2025/11/Ley-N-11174.pdf), [El Día](https://www.eldiaonline.com/ya-rige-la-prohibicion-de-pescar-el-dorado-en-entre-rios-cuales-son-las-excepciones-y-las-multas) | ✓ número y fechas · ⚠ excepciones según copia y prensa |
| Sudestada eleva el agua del Río de la Plata | [Wikipedia](https://en.wikipedia.org/wiki/Sudestada), notas de prensa | ⚠ sin regla aplicable al Delta → se sacó del diseño |
| "Viento N/NO baja el agua en el Delta" | Sin fuente | ✗ se sacó del diseño |
| "Dorado activo a más de 18 °C" | Sin fuente | ✗ se sacó del diseño |
| "Pez gallo = pez elefante" | Reglamento 2026 de BA, pág. 12: "Pez elefante o gallo" | ✓ desde el 30/10 (antes sin fuente) |
| Estimación de 60–120 MB offline | Inventada | ✗ se sacó; se mide en la prueba |

### 9.1 Registro de verificación del 11/11/2026 (fase 2 y "dónde pescar")

| Dato | Fuente | Estado |
|---|---|---|
| Ubicación de Chacras del Paraná (−33,968, −59,256) y de Atucha I | [Nominatim / OpenStreetMap](https://nominatim.openstreetmap.org/) | ✓ |
| Atucha 8208 con una lectura por hora; 8208 y 151 con distinto cero | Pedidos reales a la API del INA (a5) | ✓ |
| Pronóstico de Zárate (calibrado 440, serie 29534) hasta el 14/11 21:00 local | Corrida real del 11/11 | ✓ unos 3,5 días |
| Caudal de Atucha (151) sin datos del 4 al 11/11 | Pedido real a la API del INA | ✓ no se usa |
| Open-Meteo Marine en el río: sin datos | Pedido real en −33,958, −59,216 | ✓ |
| Corrientes SMOC: 0,08°, incluyen marea, "accuracy at coastal areas is limited", no sirven para navegar cerca de la costa | [Open-Meteo Marine API](https://open-meteo.com/en/docs/marine-weather-api) | ✓ |
| En San Blas el modelo ve tierra en el pueblo y no ve el canal; máximo de 4,1 km/h el 8/11 | Pedidos reales a 56 celdas | ✓ |
| Canal San Blas: flujo de hasta 2 m/s | Llompart 2011, pág. 24, cita a Cuadrado & Gómez 2010 | ✓ académica |
| Pesqueros de San Blas con coordenadas y la regla de marea de Punta Segunda | [Llompart 2011, cap. 3, págs. 71–80](https://sedici.unlp.edu.ar/handle/10915/34280) | ✓ académica |
| Batimetría del Paraná de las Palmas | [Boletín Fluvial](https://argentina.gob.ar/sites/default/files/2025/01/boletin_fluvial_10_25.pdf) (un solo dato por tramo), [MDE del Delta, INA 2017](https://www.ina.gob.ar/delta/pdf/INA-DELTA_Info_01_Topobatimetria.pdf) (sin descarga) | ⚠ no hay grilla pública |
| Bogas embarcado frente a Las Tejas; muelle cerealero de Lima; Vuelta de San Antonio | [Crónica Pesca, 26/3/2026](https://www.cronica.com.ar/sociedad/cronica-pesca-el-pique-de-la-semana-noticias-y-detalles-claves-4269.html) | ⚠ prensa |
| Camping Las Tejas en OSM (−34,104, −58,994) | Nominatim | ✓ · ⚠ muelle cerealero y Vuelta de San Antonio no encontrados |
| Pesca en la descarga térmica de Atucha | Búsqueda sin resultados con fuente | ✗ no entra como regla |
| Zona de exclusión frente a Atucha | Sin verificar | ⚠ se averigua antes de cargar pesqueros cerca |
| Capturas, spots y sondeos del grupo al 11/11 | Supabase (lectura con la clave pública) | ✓ 0 capturas del viaje a San Blas; 2 spots reales |
| Temperatura del agua del bajo Paraná en el INA (a5) | Pedidos a `/obs/puntual/series` de la estación Zárate (5907: solo altura y caudal) y de la variable 73 "Temperatura del agua" (2 series: Bell Ville y Aguapey, ninguna en el bajo Paraná), 11/11/2026 | ✗ no hay serie usable; se muestra la estimada con el aire de 5 días |
