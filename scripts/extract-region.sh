#!/usr/bin/env bash
# Recorta la región San Blas del build de Protomaps y la sube a R2 (spec §3.1). Pesa más que los 25 MiB
# que acepta Cloudflare Pages por archivo, por eso no va en public/.
# Uso: scripts/extract-region.sh <URL del build de Protomaps, ej. https://build.protomaps.com/20261030.pmtiles>
#   La URL del build sale de https://docs.protomaps.com/basemaps/downloads (no enlazar directo en la app).
# Requiere: pmtiles (go-pmtiles) y wrangler con sesión iniciada. Después: anotar el tamaño en
# src/data/regions.json ("bytes") y en la spec §3.1.
set -euo pipefail
BUILD="${1:?Falta la URL del build de Protomaps}"
OUT="${TMPDIR:-/tmp}/san-blas.pmtiles"
# bbox [diseño], igual que src/data/regions.json
pmtiles extract "$BUILD" "$OUT" --bbox=-65.19,-42.80,-59.27,-38.30
npx wrangler r2 object put pesca-mapas/san-blas.pmtiles --file "$OUT" --remote
wc -c < "$OUT"
