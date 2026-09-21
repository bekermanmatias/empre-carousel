# Empre Carousel

Renderer determinístico de ocho plantillas de Empre Management. Los templates son React/CSS y las PNG de `references/` sólo se usan en el comparador visual, nunca como fondo de un render.

## Desarrollo y QA

```bash
npm install
npm run dev
npm run check
npm run test:content
npm run test:image-security
npm run render:demo
npm run render -- examples/demo-real.json
```

Los PNG de demo se escriben en `output/`; el carrusel real se escribe en `output/demo-real/`. Cada render genera un `render-report.json` con dimensiones, warnings de overflow y validez por slide.

## Contrato de entrada

El body es un objeto estricto con `version: "1"` y entre 1 y 10 `slides`. Cada slide es una unión discriminada por `template`; `position`, si existe, debe ser única. La imagen tiene el formato `image: { url, objectPosition?, alt? }`.

```json
{
  "version": "1",
  "slides": [{
    "template": "T01",
    "position": 1,
    "slideNumber": "01 / 09",
    "title": "Un título editorial",
    "summary": "Una bajada breve.",
    "image": { "url": "/imagen.jpg", "objectPosition": "50% 30%", "alt": "Descripción" }
  }]
}
```

Límites: T01 título 180/resumen 260; T02/T04/T07 sección 40, título 180, cuerpo 520, destacado 180; T03/T08 título 200/cuerpo 520; T06 sección 40, cita 180/contexto 200; T09 título 180/cuerpo 340/destacado 180. El navegador mide overflow real: T06 puede aplicar un auto-fit acotado a la cita; los demás campos emiten un warning y marcan el render inválido.

## API HTTP para n8n

```bash
npm run api
# desarrollo con reinicio automático
npm run api:dev
```

La API escucha en `http://127.0.0.1:3001` por defecto; definí `PORT` para cambiarlo.

| Método | Ruta | Función |
| --- | --- | --- |
| GET | `/health` | Estado del servicio. |
| POST | `/validate` | Valida el body Zod sin renderizar. |
| POST | `/render` | Crea un job, renderiza y devuelve su estado. |
| POST | `/inspect-image` | Descarga una imagen pública e informa dimensiones, MIME y tamaño. |
| POST | `/score-image` | Calcula orientación, compatibilidad geométrica y posición sugerida para un template. |
| POST | `/prepare-image` | Descarga una URL HTTP(S) pública, la normaliza a JPEG sRGB y devuelve una URL estable local. |
| GET | `/public/prepared/:filename` | Sirve los JPEG normalizados que usa el renderer. |
| GET | `/jobs/:jobId` | Devuelve metadata y `render-report.json`. |
| GET | `/jobs/:jobId/files/:filename` | Sirve `NN.png` sólo para demo/desarrollo. |
| POST | `/jobs/:jobId/export-instagram-assets` | Convierte los PNG del job a JPEG y devuelve sus URL públicas. |
| GET | `/public/jobs/:jobId/instagram/:filename` | Sirve un asset JPEG exportado para Instagram. |

```bash
curl http://localhost:3001/health

curl -X POST http://localhost:3001/validate \
  -H "Content-Type: application/json" \
  --data @examples/api-request.json

curl -X POST http://localhost:3001/render \
  -H "Content-Type: application/json" \
  --data @examples/api-request.json
```

Un render correcto devuelve:

```json
{
  "success": true,
  "jobId": "uuid",
  "valid": true,
  "slideCount": 8,
  "files": [{ "position": 1, "filename": "01.png" }],
  "warnings": []
}
```

Cada job queda aislado en `output/jobs/<jobId>/` con `input.json`, sus PNG y el reporte. Antes de abrir Chromium, `/render` prepara internamente cada `image.url`: acepta sólo HTTP(S) público, controla redirects, timeout y 15 MB, valida el binario con Sharp y lo guarda como JPEG sRGB estable en `output/prepared/`. La protección SSRF resuelve todos los registros A/AAAA en modo verbatim y bloquea rangos privados, link-local, multicast, loopback e IPv4-mapped privados. Una descarga fallida devuelve `image_load_error` con códigos como `PRIVATE_IP`, `REDIRECT_TO_PRIVATE_IP`, `HTTP_403`, `INVALID_CONTENT_TYPE` o `TIMEOUT`; es un resultado HTTP 200 inválido y recuperable para n8n, sin screenshot de esa slide.

### Auto-fit controlado de T06

La cita de T06 conserva su caja de 435×390 px. Si desborda con la tipografía editorial de 43 px, el renderer reduce sólo ese campo en pasos de 1 px hasta 36.55 px (85%), preservando la proporción de `line-height`. El reporte agrega `autoFits` cuando logra resolverlo; si no entra al mínimo o supera sus 8 líneas, el warning `overflow` sigue invalidando el slide. El fixture `examples/t06-real-overflow.json` cubre la cita real de referencia.

### Métricas visuales

Cada slide de `render-report.json` incluye `textMetrics` por campo (`lineCount`, `scrollHeight`, `clientHeight`, `overflow`, `fontSizeUsed` y `autoFitApplied`) e `imageMetrics` cuando tiene imagen. Estas últimas incluyen `sourceUrl`, `preparedUrl`, `loaded`, dimensiones, MIME, tamaño y `templateFit`. Los límites de línea y la reducción acotada a un mínimo del 85% están centralizados por template. T08 reserva un margen de 20 px antes del divisor inferior; si el body no entra aun con auto-fit, emite `overflow` en vez de dejar que la línea lo atraviese.

## Exportar assets para Instagram

Una vez que el render terminó, exportá sus slides como JPEG con:

```bash
curl -X POST http://localhost:3001/jobs/<jobId>/export-instagram-assets
```

Los archivos se escriben en `output/jobs/<jobId>/instagram/` y quedan disponibles en
`/public/jobs/<jobId>/instagram/NN.jpg`. Para que las URL devueltas sean las del dominio
público del renderer, definí `PUBLIC_BASE_URL=https://render.empre.ar` en el VPS. Si no
está definido, la API usa el protocolo y host de la request. Los JPEG se generan a 1080×1350
con calidad 95 y fondo blanco para cualquier transparencia del PNG.

## Docker local

```bash
docker build -t empre-carousel-api .
docker run --rm -p 3001:3001 empre-carousel-api
```
