# App de Pesca — Diseño

Fecha: 2026-10-29 · Autor: Nacho (con Claude) · Datos verificados el 29/10/2026 (ver §9)

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

**Uso real:** el grupo pesca seguido en el Paraná de las Palmas a la altura de Lima (Zárate), embarcado y de costa. Nada de esta sección hace falta para San Blas. Se construye sobre los campos `water` y `night_fishing` que ya existen desde la fase 1.

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
- **Elección de estación:** al crear un viaje de río se elige sola la estación con altura del INA más cercana al lugar del viaje. Se puede cambiar. El pronóstico se toma de la estación más cercana que tenga uno (hoy, Zárate).
- **Pantalla Pronóstico en río:** en vez de la curva de marea se ve la curva de altura (medida más pronóstico, con su banda) y las líneas de alerta y aguas bajas.
  - Se marcan los máximos y mínimos de la oscilación diaria.
  - **Tendencia de 3 días:** "creciendo", "estable" o "bajando", con los cm por día.
- **Offline:** "Preparar viaje" guarda las alturas de los últimos 7 días y el último pronóstico, con su hora.

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
- **Zonas:** cada zona es un polígono simplificado de jurisdicción con su reglamento. En Lima: margen de Buenos Aires e islas de Entre Ríos. El límite se dibuja aproximado, con un aviso.
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
- **Spots:** campo opcional "altura de río recomendada" (`spots.best_level_min_m`, `spots.best_level_max_m`). En el pronóstico se destacan los spots que entran en rango con la altura prevista.

### 8.6 Fuera de alcance de la fase 2
Tráfico de buques de la Hidrovía y cartas fluviales oficiales.

### 8.7 Pruebas de la fase 2
- **Automáticas:** con una serie real de Zárate guardada como fixture, detectar la oscilación diaria, calcular la tendencia y aplicar el factor presión; elegir la estación más cercana; corregir un sondeo con la altura del INA; elegir la zona por punto, incluido el caso borde a menos de 1 km del límite.
- **Manuales:** crear un viaje de río en Lima, preparar el viaje, ponerse en modo avión y ver altura, pronóstico, reglamento por zona y spots en rango.

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
