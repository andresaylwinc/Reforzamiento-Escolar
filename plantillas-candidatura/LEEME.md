# Kit de plantillas para candidatura

8 piezas de campaña, editables **por capas**. Cada pieza existe en dos versiones equivalentes:

| Versión | Archivo | Para qué |
|---|---|---|
| Diseño (capas) | `svg/` | Inkscape, Illustrator, Figma. Cambia colores de una vez, exporta a imprenta. |
| Oficina (capas) | `pptx/` | PowerPoint o Google Slides. Cada elemento es una forma con nombre; se edita sin saber diseño. |

## Contenido

```
svg/     8 archivos .svg  (01 post … 08 afiche)
pptx/    6 archivos .pptx (8 diapositivas)
png/     previsualizaciones + hoja de contactos + comparativa de paletas
assets/  foto-candidato.jpg  (foto de ejemplo enlazada por los SVG)
guia/    Guia-Plantillas-Candidatura.docx  (instructivo completo)
vista-previa.pdf   las 8 piezas en un PDF para revisar
build/   generar.py (regenera todo) y generar_guia.py
```

## Las 8 piezas

| # | Pieza | Medida |
|---|---|---|
| 01 | Post cuadrado | 1080 × 1080 px |
| 02 | Story / Reel | 1080 × 1920 px |
| 03 | Volante A4, frente | 210 × 297 mm |
| 04 | Volante A4, reverso (5 propuestas) | 210 × 297 mm |
| 05 | Portada de Facebook | 1640 × 624 px |
| 06 | Tarjeta, frente | 90 × 50 mm |
| 07 | Tarjeta, reverso | 90 × 50 mm |
| 08 | Afiche A3 | 297 × 420 mm |

## Las capas (mismo orden en SVG y PPTX)

`01 FONDO` · `02 FORMAS` · `03 FOTO` · `04 SOBRE FOTO` · `05 TEXTOS` · `06 DATOS` · `07 LEGAL` · `08 GUÍAS` (oculta)

- En SVG son grupos con `inkscape:label`, visibles en el panel de capas.
- En PPTX son formas en el **Panel de selección** (Inicio › Seleccionar).
- Lo que debe quedar **encima** de la foto va en `04 SOBRE FOTO`; lo que va debajo, en `02 FORMAS`.

## Tres cambios que resuelven casi todo

1. **Foto:** reemplaza `assets/foto-candidato.jpg` (mismo nombre). Los SVG se actualizan solos; en PPTX usa clic derecho › Cambiar imagen.
2. **Colores:** edita el bloque `<style>` del SVG (clases `.c-tinta`, `.c-azul`, `.c-acento`, `.c-crema`, `.c-arena`, `.c-gris`, `.c-blanco`). En PPTX, relleno de cada forma.
3. **Textos:** capas `05 TEXTOS` (nombre, cargo, lema), `06 DATOS` (fecha, redes, logo) y `07 LEGAL` (leyenda obligatoria).

## Regenerar con otra paleta

```bash
python build/generar.py                  # paleta institucional
python build/generar.py --paleta verde   # verde | rojo | azul
python build/generar.py --sin-pptx        # solo SVG y PNG
```

Requiere Python con `Pillow` y `python-pptx`.

## Antes de publicar

- Completa la leyenda legal (`07 LEGAL`) según la normativa electoral vigente (SERVEL, Ley 19.884) y confírmala con tu administrador electoral.
- Imprenta: PDF a 300 dpi, CMYK y 3 mm de sangrado.
- Tipografías: Arial Black (titulares) y Segoe UI (textos). Si la imprenta no las tiene, convierte los textos a curvas.

El detalle completo está en `guia/Guia-Plantillas-Candidatura.docx`.
