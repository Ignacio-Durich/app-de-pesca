#!/usr/bin/env bash
# Recorta la región San Blas del build de Protomaps y la sube a R2 (spec §3.1, plan Task 13 Step 1).
# Uso: scripts/extract-region.sh <URL del build de Protomaps>
#   La URL del build sale de https://docs.protomaps.com/basemaps/downloads (no enlazar directo en la app).
# Requiere: pmtiles (go-pmtiles) y wrangler con sesión iniciada. Después: anotar el tamaño en
# src/data/regions.json ("bytes") y en la spec §3.1, y configurar CORS (GET desde la app) y acceso público del bucket.
set -euo pipefail
BUILD="${1:?Falta la URL del build de Protomaps}"
# bbox [diseño], igual que src/data/regions.json
pmtiles extract "$BUILD" san-blas.pmtiles --bbox=-62.50,-40.80,-61.95,-40.35
wrangler r2 object put pesca-mapas/san-blas.pmtiles --file san-blas.pmtiles --remote
wc -c < san-blas.pmtiles
