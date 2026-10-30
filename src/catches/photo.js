// Foto de captura (spec §5): se reduce antes de encolarla. Solo navegador (canvas).
export const MAX_SIDE = 1600 // [diseño] spec §5
export const QUALITY = 0.8 // [diseño] spec §5

export async function resizePhoto(blob, maxSide = MAX_SIDE, quality = QUALITY) {
  const img = await createImageBitmap(blob) // respeta la orientación EXIF por defecto
  const k = Math.min(1, maxSide / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * k)
  canvas.height = Math.round(img.height * k)
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  img.close()
  return new Promise((ok, fail) =>
    canvas.toBlob((b) => (b ? ok(b) : fail(new Error('No se pudo convertir la foto'))), 'image/jpeg', quality),
  )
}

// Fotos que todavía están en la cola (sin subir): path → Blob. La lista las muestra desde el
// teléfono hasta que suben; recién ahí existe la URL pública.
export const queuedPhotos = (ops) => new Map(ops.filter((o) => o.photo).map((o) => [o.photo.path, o.photo.blob]))
