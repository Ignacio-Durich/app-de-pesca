# Prueba en los 5 teléfonos (Tarea 16)

Link del viaje (mandarlo por WhatsApp): **`https://<la app>/t/<id del viaje>`**

Hacerla con tiempo antes del sábado 7/11, con wifi. Anotar en cada punto: ✓, ✗ o qué pasó, y en qué teléfono (iPhone / Android).

## 1. Instalar (cada uno en su teléfono)

**iPhone**
1. Abrir el link en **Safari**. Si WhatsApp lo abre adentro suyo, tocar "Abrir en Safari".
2. Elegir tu nombre.
3. Ir a Más → Preparar viaje → **Copiar link**.
4. Compartir → **Agregar a pantalla de inicio**.
5. Abrir la app **desde el ícono**, pegar el link en **"Abrir un viaje"** y elegir tu nombre de nuevo.
6. Adentro de la app: Más → **Preparar viaje** → esperar **"Listo para offline ✓"**.

¿El ícono se ve bien? ¿La barra de abajo queda por encima de la rayita del iPhone? ¿Lo de arriba no lo tapa la isla o el notch?

**Android**
1. Abrir el link en Chrome y elegir tu nombre.
2. Menú ⋮ → **Instalar app** (o "Agregar a pantalla principal").
3. Abrir desde el ícono → Más → **Preparar viaje** → esperar **"Listo para offline ✓"**.

## 2. Sin señal (modo avión, con la app cerrada del todo antes)
- [ ] Abre y se ven todas las pestañas.
- [ ] **Pronóstico**: muestra la ventana de "Anzuelos al agua" y "Ver hora por hora".
- [ ] **Mapa**: se ve el mapa de San Blas (calles, costa), la profundidad, tu punto GPS y el aviso "Profundidad orientativa, no apta para navegar".
- [ ] **Emergencias** (botón SOS): se ve tu posición en grados y minutos; el botón "Llamar al 106" funciona.
- [ ] **Capturas**: cargar una de prueba **con foto de la cámara**. Se ve tu foto en la lista. Arriba dice "1 pendientes".
- [ ] La primera vez que pide permiso de ubicación, aceptar o rechazar: "Guardando…" no se queda trabado.
- [ ] Cerrar la app del todo y volver a abrirla: la captura y "1 pendientes" siguen ahí.
- [ ] **Mapa** → "Marcar punto" y "Cargar sondeo" (en la playa o el barco): se guardan con la posición.
- [ ] **Ir a punto**: la flecha apunta bien con el teléfono plano (en iPhone, tocar "Activar brújula").

## 3. Volver a tener señal
- [ ] "pendientes" llega a 0 en más o menos un minuto.
- [ ] En **otro** teléfono aparece la captura con su foto.
- [ ] Checklist: dos teléfonos marcan y borran el mismo ítem; queda lo último que se hizo y el borrado llega a los dos.

## 4. Otras cosas para mirar
- [ ] Con poca señal (una rayita), el link y el Pronóstico se dan por vencidos en 10–20 segundos en vez de quedar cargando para siempre.
- [ ] "Preparar viaje" por segunda vez termina rápido.
- [ ] Al sol y en modo oscuro se leen bien: SOS, "No conviene salir", el aviso del mapa y el puntaje.
- [ ] Un teléfono con otra zona horaria muestra las mismas horas de pronóstico y capturas.

## 5. Al terminar
- Borrar las capturas de prueba desde la app.
- Abrir la app una vez con señal, esperar unos 30 segundos, cerrarla y volver a abrirla. Así queda la última versión antes de salir.
- Contarme lo que falló. No voy a publicar cambios después de la prueba salvo que haga falta arreglar algo.

## 6. Fase 2: viaje de río y "dónde pescar"
Antes: la migración 004 aplicada en Supabase y `lima.pmtiles` subido a R2 (sin eso, "Preparar viaje" no llega a "Listo").

1. Inicio → **Crear viaje**: Agua **Río**, "Lima", −33.968, −59.256. "Pesca nocturna" se marca sola.
2. Más → **Preparar viaje** → esperar **"Listo para offline ✓"** (sin "Profundidad"; con "Capturas del grupo").
3. Modo avión y app cerrada del todo. Abrir:
- [ ] **Pronóstico**: "Río creciendo/estable/bajando, ±N cm/día" debajo de "Anzuelos al agua"; el pie dice "Altura: INA (Zárate)".
- [ ] **Ver hora por hora**: curva del río con la franja gris, máximos y mínimos con hora, y las marcas de alerta (2,0 m) y aguas bajas (0,3 m) o su texto en el borde.
- [ ] **Dónde**: los 3 mejores lugares con puntaje, hora y km; "Por qué" se abre; las líneas de diseño dicen "(regla de diseño)" y las de fuente tienen link.
- [ ] Tocar un lugar → **Mapa** con "Hoy: N/10" y "Ir a punto" abierto.
- [ ] **Mapa**: mapa base de Lima, sin capa de profundidad; "Spots cerca (100 km)".
- [ ] "Marcar punto": "Desde" (Costa / Embarcado / Las dos) y "Altura recomendada del río"; con mínimo mayor que máximo avisa el error.
- [ ] **Capturas**: una de prueba se guarda (en la base va con `level_source` = `ina:29437`).
- [ ] **Especies**: "Orilla … Buenos Aires"; el dorado muestra "Veda: 1/10 al 15/1"; las que no tienen regla dicen "no verificado".
- [ ] **Emergencias**: Prefectura Zárate y VTS Zárate canal 72, con su "fuente".

Probado en el navegador de la compu el 12/11/2026 (sin Supabase, con datos reales de Open-Meteo e INA): todo lo de arriba anduvo, salvo el mapa base y "Listo", que esperan a R2 y a la migración. El 12/11/2026 se aplicó la migración 004 (con `rls.sql` sin errores) y se subió `lima.pmtiles` a R2.

**Apertura en WebKit de Mac (12/11/2026):** app real (build de producción con service worker), abierta en "/" como desde el ícono, cada corrida en un proceso nuevo; mediana de 5 rondas alternadas, descartando la primera. Hasta ver el nombre del viaje:

| Guardado | Página recibida | App visible | Desde lanzar el proceso |
|---|---|---|---|
| Solo el viaje | 8 ms | 44 ms | 167 ms |
| + Lima (72.689.696 B) | 10 ms | 36 ms | 152 ms |
| + Lima + 24.688 teselas de satélite (6 KB c/u, en IndexedDB) | 8 ms | 43 ms | 164 ms |

Las diferencias entran en el ruido entre corridas: ni el mapa de Lima ni el satélite en IndexedDB demoran la apertura. Esto mide cómo escala, no el tiempo absoluto de un iPhone; no incluye la capa de profundidad (Cache API). Falta confirmarlo con un video en el teléfono.
