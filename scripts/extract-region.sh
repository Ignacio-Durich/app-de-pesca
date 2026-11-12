#!/usr/bin/env bash
# Recorta una región del build de Protomaps (spec §3.1) y muestra cuánto pesa. No sube nada por defecto.
# Uso: scripts/extract-region.sh <build> <id> <minlon,minlat,maxlon,maxlat>
#   <build>: URL del build, ej. https://build.protomaps.com/20261111.pmtiles (la lista vigente sale de
#            https://docs.protomaps.com/basemaps/downloads; no enlazar directo en la app).
#   <id>:    nombre del archivo de salida, ej. lima  ->  ${TMPDIR:-/tmp}/lima.pmtiles
#   bbox:    igual que src/data/regions.json
# Con UPLOAD=1 sube además el archivo a R2 (pesca-mapas/<id>.pmtiles); sin UPLOAD no corre wrangler.
# Pesa más de 25 MiB (límite de Cloudflare Pages por archivo) => va a R2; si no, a public/maps/.
# Requiere: pmtiles (go-pmtiles); wrangler con sesión iniciada solo si UPLOAD=1.
# Después: anotar el tamaño en src/data/regions.json ("bytes") y en la spec §3.1 / §8.5.
set -euo pipefail
BUILD="${1:?Falta la URL del build de Protomaps}"
ID="${2:?Falta el id de la región}"
BBOX="${3:?Falta el bbox minlon,minlat,maxlon,maxlat}"
OUT="${TMPDIR:-/tmp}/$ID.pmtiles"
pmtiles extract "$BUILD" "$OUT" --bbox="$BBOX"
if [ "${UPLOAD:-0}" = 1 ]; then
  npx wrangler r2 object put "pesca-mapas/$ID.pmtiles" --file "$OUT" --remote
fi
wc -c < "$OUT"
