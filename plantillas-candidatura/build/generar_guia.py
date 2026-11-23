#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genera la guía de uso (DOCX) y el PDF de vista previa del kit."""

from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PNG = ROOT / "png"
GUIA = ROOT / "guia"

TINTA = RGBColor(0x0F, 0x1B, 0x26)
AZUL = RGBColor(0x14, 0x40, 0x5F)
ACENTO = RGBColor(0xE2, 0x54, 0x2C)
GRIS = RGBColor(0x6E, 0x77, 0x80)
CREMA_HEX = "F6F1E8"
ARENA_HEX = "EDE4D6"
TINTA_HEX = "0F1B26"
ACENTO_HEX = "E2542C"


# --------------------------------------------------------------------------
# utilidades docx
# --------------------------------------------------------------------------


def shade(cell, hex_color):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_color)
    tcPr.append(shd)


def cell_text(cell, text, size=9, bold=False, color=None, align=None, space_after=2):
    cell.text = ""
    p = cell.paragraphs[0]
    if align:
        p.alignment = align
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.space_before = Pt(2)
    partes = text.split("\n")
    for i, linea in enumerate(partes):
        if i:
            p = cell.add_paragraph()
            p.paragraph_format.space_after = Pt(space_after)
            p.paragraph_format.space_before = Pt(0)
        r = p.add_run(linea)
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.name = "Segoe UI"
        if color is not None:
            r.font.color.rgb = color


def borders(cell, color="D8CDBB", size=4):
    tcPr = cell._tc.get_or_add_tcPr()
    b = OxmlElement("w:tcBorders")
    for edge in ("top", "left", "bottom", "right"):
        el = OxmlElement(f"w:{edge}")
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), str(size))
        el.set(qn("w:color"), color)
        b.append(el)
    tcPr.append(b)


def left_border(cell, color=ACENTO_HEX, size=24):
    tcPr = cell._tc.get_or_add_tcPr()
    b = OxmlElement("w:tcBorders")
    el = OxmlElement("w:left")
    el.set(qn("w:val"), "single")
    el.set(qn("w:sz"), str(size))
    el.set(qn("w:color"), color)
    b.append(el)
    tcPr.append(b)


def tabla(doc, headers, filas, anchos, size=8.6):
    t = doc.add_table(rows=1, cols=len(headers))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    tblPr = t._tbl.tblPr
    layout = OxmlElement("w:tblLayout")
    layout.set(qn("w:type"), "fixed")
    tblPr.append(layout)
    tblW = OxmlElement("w:tblW")
    tblW.set(qn("w:type"), "dxa")
    tblW.set(qn("w:w"), str(int(sum(anchos) * 567)))
    tblPr.append(tblW)
    mar = OxmlElement("w:tblCellMar")
    for lado, val in (("left", 90), ("right", 90), ("top", 40), ("bottom", 40)):
        el = OxmlElement(f"w:{lado}")
        el.set(qn("w:w"), str(val))
        el.set(qn("w:type"), "dxa")
        mar.append(el)
    tblPr.append(mar)
    hdr = t.rows[0]
    trPr = hdr._tr.get_or_add_trPr()
    th = OxmlElement("w:tblHeader")
    trPr.append(th)
    for i, h in enumerate(headers):
        c = hdr.cells[i]
        c.width = Cm(anchos[i])
        shade(c, TINTA_HEX)
        cell_text(c, h.upper(), size=size - 0.2, bold=True, color=RGBColor(0xF6, 0xF1, 0xE8))
    for k, fila in enumerate(filas):
        row = t.add_row()
        for i, val in enumerate(fila):
            c = row.cells[i]
            c.width = Cm(anchos[i])
            if k % 2 == 1:
                shade(c, "FBF7F0")
            cell_text(c, val, size=size)
    for row in t.rows:
        for i, c in enumerate(row.cells):
            c.width = Cm(anchos[i])
    return t


def callout(doc, titulo, texto):
    t = doc.add_table(rows=1, cols=1)
    t.autofit = False
    c = t.rows[0].cells[0]
    c.width = Cm(17)
    shade(c, CREMA_HEX)
    borders(c, "E3D7C6")
    left_border(c)
    c.text = ""
    p = c.paragraphs[0]
    p.paragraph_format.space_before = Pt(6)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run(titulo.upper())
    r.font.size = Pt(9)
    r.font.bold = True
    r.font.name = "Segoe UI"
    r.font.color.rgb = ACENTO
    p2 = c.add_paragraph()
    p2.paragraph_format.space_after = Pt(8)
    r2 = p2.add_run(texto)
    r2.font.size = Pt(9.5)
    r2.font.name = "Segoe UI"
    r2.font.color.rgb = TINTA
    doc.add_paragraph().paragraph_format.space_after = Pt(0)


def h1(doc, texto):
    p = doc.add_heading(level=1)
    p.paragraph_format.space_before = Pt(16)
    p.paragraph_format.space_after = Pt(6)
    r = p.add_run(texto)
    r.font.size = Pt(17)
    r.font.bold = True
    r.font.name = "Segoe UI"
    r.font.color.rgb = TINTA
    return p


def h2(doc, texto):
    p = doc.add_heading(level=2)
    p.paragraph_format.space_before = Pt(12)
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run(texto)
    r.font.size = Pt(11.5)
    r.font.bold = True
    r.font.name = "Segoe UI"
    r.font.color.rgb = ACENTO
    return p


def parrafo(doc, texto, size=10, bold=False, color=TINTA, space_after=6, italic=False):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.line_spacing = 1.18
    r = p.add_run(texto)
    r.font.size = Pt(size)
    r.font.bold = bold
    r.font.italic = italic
    r.font.name = "Segoe UI"
    r.font.color.rgb = color
    return p


def vineta(doc, texto, size=9.6):
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.line_spacing = 1.15
    for r in p.runs:
        r.font.size = Pt(size)
    r = p.add_run(texto)
    r.font.size = Pt(size)
    r.font.name = "Segoe UI"
    r.font.color.rgb = TINTA


def paso(doc, n, titulo, texto):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.line_spacing = 1.15
    r = p.add_run(f"{n}. {titulo} ")
    r.font.size = Pt(9.6)
    r.font.bold = True
    r.font.name = "Segoe UI"
    r.font.color.rgb = TINTA
    r2 = p.add_run(texto)
    r2.font.size = Pt(9.6)
    r2.font.name = "Segoe UI"
    r2.font.color.rgb = RGBColor(0x3A, 0x45, 0x50)


def pagina_field(par):
    run = par.add_run()
    f1 = OxmlElement("w:fldChar")
    f1.set(qn("w:fldCharType"), "begin")
    it = OxmlElement("w:instrText")
    it.set(qn("xml:space"), "preserve")
    it.text = "PAGE"
    f2 = OxmlElement("w:fldChar")
    f2.set(qn("w:fldCharType"), "end")
    run._r.append(f1)
    run._r.append(it)
    run._r.append(f2)
    run.font.size = Pt(8)
    run.font.name = "Segoe UI"
    run.font.color.rgb = GRIS


# --------------------------------------------------------------------------
# documento
# --------------------------------------------------------------------------


def build():
    GUIA.mkdir(parents=True, exist_ok=True)
    doc = Document()

    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21), Cm(29.7)
    sec.top_margin = Cm(2)
    sec.bottom_margin = Cm(1.8)
    sec.left_margin = Cm(2)
    sec.right_margin = Cm(2)

    normal = doc.styles["Normal"]
    normal.font.name = "Segoe UI"
    normal.font.size = Pt(10)
    normal.paragraph_format.space_after = Pt(6)

    # pie de página
    foot = sec.footer.paragraphs[0]
    foot.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    r = foot.add_run("Kit de plantillas de campaña · guía de uso · pág. ")
    r.font.size = Pt(8)
    r.font.name = "Segoe UI"
    r.font.color.rgb = GRIS
    pagina_field(foot)

    # ---------------- portada ----------------
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run("KIT DE PLANTILLAS DE CAMPAÑA")
    r.font.size = Pt(9)
    r.font.bold = True
    r.font.name = "Segoe UI"
    r.font.color.rgb = ACENTO
    r.font.all_caps = True

    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run("Plantillas editables por capas")
    r.font.size = Pt(30)
    r.font.bold = True
    r.font.name = "Arial Black"
    r.font.color.rgb = TINTA

    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(10)
    r = p.add_run("8 piezas para una candidatura: rediseñables en SVG (Inkscape, Illustrator, Figma) "
                  "y editables en PowerPoint, sin programas de diseño.")
    r.font.size = Pt(11)
    r.font.name = "Segoe UI"
    r.font.color.rgb = GRIS

    t = doc.add_table(rows=1, cols=1)
    c = t.rows[0].cells[0]
    c.width = Cm(17)
    shade(c, ACENTO_HEX)
    c.text = ""
    pp = c.paragraphs[0]
    pp.paragraph_format.space_before = Pt(2)
    pp.paragraph_format.space_after = Pt(2)
    pp.add_run(" ").font.size = Pt(2)

    # ---------------- 1 ----------------
    h1(doc, "1. Qué recibiste")
    parrafo(doc, "Cada pieza existe en dos versiones equivalentes: un archivo SVG construido por capas "
                 "(la versión de diseño, ideal para imprenta y para cambiar todo) y un PPTX donde cada "
                 "elemento es una forma con nombre (la versión rápida, para editar sin saber diseño).")

    tabla(doc, ["Carpeta", "Contenido", "Para qué sirve"], [
        ["svg/", "8 archivos .svg (uno por pieza)", "Edición por capas, cambios de color globales, exportación a imprenta"],
        ["pptx/", "6 archivos .pptx (8 diapositivas)", "Editar textos, foto y colores en PowerPoint o Google Slides"],
        ["png/", "Previsualizaciones y hoja de contactos", "Revisar, enviar por WhatsApp, aprobar con el equipo"],
        ["assets/", "foto-candidato.jpg", "Foto de ejemplo: al reemplazarla se actualiza en todas las piezas SVG"],
        ["build/", "generar.py", "Regenerar el kit completo con otra paleta o con otros textos"],
        ["vista-previa.pdf", "Las 8 piezas en un PDF", "Revisar desde el teléfono o imprimir para revisión"],
    ], [2.6, 5.4, 9.0])

    parrafo(doc, "Las piezas:", size=10, bold=True, space_after=2)
    for linea in [
        "01 Post cuadrado 1080 × 1080 — presentación de candidatura (feed de Instagram y Facebook).",
        "02 Story / Reel 1080 × 1920 — las 3 prioridades, con tres tarjetas editables.",
        "03 Volante A4, frente — foto, nombre y lema; 04 Volante A4, reverso — 5 propuestas.",
        "05 Portada de Facebook 1640 × 624.",
        "06 Tarjeta de presentación 90 × 50 mm, frente y reverso.",
        "07 Afiche A3 297 × 420 mm para calle.",
    ]:
        vineta(doc, linea)

    # ---------------- 2 ----------------
    h1(doc, "2. La lógica de capas")
    parrafo(doc, "En los SVG las capas están numeradas y ordenadas: la 01 queda al fondo y la 08 arriba. "
                 "En los PPTX ese mismo orden es el orden de apilado de las formas; puedes verlo en "
                 "Inicio › Seleccionar › Panel de selección, donde cada forma aparece con su nombre de capa.")

    tabla(doc, ["Capa", "Qué contiene", "Qué se edita ahí"], [
        ["01 FONDO", "Color o textura base de la pieza", "El color de fondo general"],
        ["02 FORMAS", "Barras, bandas, marcos y bloques detrás de la foto", "Colores de bloques y geometría"],
        ["03 FOTO", "La imagen del candidato (archivo enlazado)", "Reemplazar la foto y ajustar el encuadre"],
        ["04 SOBRE FOTO", "Paneles de color y sellos que van encima de la foto", "Opacidad y color de los paneles"],
        ["05 TEXTOS", "Nombre, cargo, lema, títulos y bajadas", "Todo el contenido textual"],
        ["06 DATOS", "Sello VOTA, fecha, redes, logo y datos de contacto", "Datos duros de la campaña"],
        ["07 LEGAL", "Leyenda de propaganda electoral", "Texto legal obligatorio"],
        ["08 GUÍAS", "Márgenes de zona segura (oculta)", "Referencia: no se imprime ni se exporta"],
    ], [3.0, 7.4, 6.6])

    callout(doc, "Regla de oro",
            "Si algo debe quedar encima de la foto, va en la capa 04. Si debe quedar debajo, va en la 02. "
            "Mover un elemento de capa es la forma más rápida de corregir un empalme o un borde tapado.")

    # ---------------- 3 ----------------
    h1(doc, "3. Cambiar los colores")
    parrafo(doc, "Los colores no están sueltos: viven en un bloque único al inicio de cada SVG. Si cambias "
                 "esos siete valores, la pieza completa se recolorea de una vez y se mantiene coherente.")
    parrafo(doc, "En el SVG, abre el archivo con un editor de texto (o el panel de CSS de Inkscape) y edita "
                 "las clases .c-tinta, .c-azul, .c-acento, .c-crema, .c-arena, .c-gris y .c-blanco. "
                 "En PowerPoint usa Inicio › Reemplazar color, o edita el relleno de cada forma.",
            space_after=8)

    tabla(doc, ["Token", "Rol", "Institucional", "Verde", "Rojo", "Azul"], [
        ["tinta", "Texto principal, fondos oscuros", "#0F1B26", "#0B2019", "#200E12", "#0A1A33"],
        ["azul", "Apoyo, cargos y datos", "#14405F", "#12523C", "#7A1220", "#1447A6"],
        ["acento", "Llamados de atención, sellos", "#E2542C", "#D8A227", "#F0B429", "#F2C14E"],
        ["crema", "Fondo claro", "#F6F1E8", "#F4F1E6", "#F8F0EA", "#F5F6F8"],
        ["arena", "Bordes y textos suaves", "#E3D7C6", "#DFD8C3", "#E6D5CB", "#D9DEE7"],
        ["gris", "Bajadas y datos secundarios", "#6E7780", "#6C7468", "#77686A", "#6B7280"],
    ], [2.2, 5.7, 2.5, 2.2, 2.2, 2.2])

    img = PNG / "00b_comparativa_paletas.png"
    if img.exists():
        doc.add_picture(str(img), width=Cm(16.4))
        doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
        cap = doc.add_paragraph()
        cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
        cap.paragraph_format.space_after = Pt(8)
        rr = cap.add_run("La misma plantilla con las cuatro paletas incluidas.")
        rr.font.size = Pt(8.5)
        rr.font.italic = True
        rr.font.name = "Segoe UI"
        rr.font.color.rgb = GRIS

    # ---------------- 4 ----------------
    h1(doc, "4. Cambiar la foto")
    h2(doc, "En SVG (actualiza todas las piezas de una vez)")
    paso(doc, 1, "Reemplaza el archivo.", "Guarda tu foto como assets/foto-candidato.jpg, con el mismo nombre. "
             "Todas las plantillas la toman de ahí automáticamente.")
    paso(doc, 2, "Respeta la proporción.", "La plantilla recorta la foto al marco (no la estira). "
             "Lo ideal es una foto vertical de 2000 px de alto o más, con el rostro en el tercio superior.")
    paso(doc, 3, "Ajusta el encuadre si hace falta.", "En Inkscape selecciona la imagen y usa las asas del "
             "recorte; en Illustrator usa Recortar con máscara de recorte. También puedes cambiar "
             "xMidYMid slice por xMidYMin slice en el atributo preserveAspectRatio para priorizar la cabeza.")

    h2(doc, "En PowerPoint")
    paso(doc, 1, "Selecciona la foto de ejemplo.", "Es la forma llamada «Foto del candidato — clic derecho > Cambiar imagen».")
    paso(doc, 2, "Clic derecho › Cambiar imagen.", "Elige tu archivo; el marco se mantiene y la foto se ajusta sola.")
    paso(doc, 3, "Ajusta el recorte.", "Formato de imagen › Recortar, para decidir qué parte se ve.")

    callout(doc, "Qué foto funciona",
            "Plano medio o medio corto, mirada hacia el espacio donde va el texto, fondo simple y luz pareja. "
            "Evita fotos de espalda, con otras personas reconocibles sin autorización, o con el rostro muy pequeño "
            "en el marco. Para imprenta, mínimo 300 dpi al tamaño final (un A3 pide unos 3500 × 5000 px).")

    # ---------------- 5 ----------------
    h1(doc, "5. Logo, textos y datos")
    parrafo(doc, "El recuadro punteado «TU LOGO» es un marcador de posición: bórralo y coloca tu logo en el "
                 "mismo lugar, o reemplázalo por una versión en negativo (crema) cuando el fondo sea oscuro. "
                 "Mantén el logo dentro del margen de la zona segura y no lo hagas competir con el nombre.")

    parrafo(doc, "Campos de texto que aparecen en las piezas:", bold=True, space_after=4)
    tabla(doc, ["Campo", "Texto de ejemplo", "Dónde aparece"], [
        ["Proceso", "ELECCIONES 2028", "Post, story, volante, portada, afiche"],
        ["Nombre", "NOMBRE", "Todas las piezas"],
        ["Apellido", "APELLIDO", "Todas, siempre como titular"],
        ["Cargo", "CANDIDATO A ALCALDE", "Todas"],
        ["Lema", "POR UN BARRIO SEGURO, LIMPIO Y CON OPORTUNIDADES", "Todas"],
        ["Redes", "@TUUSUARIO", "Todas"],
        ["Fecha", "26 DE OCTUBRE", "Post, volante, tarjeta, portada"],
        ["Llamado al voto", "VOTA / VOTA POR MÍ", "Sello circular y afiche"],
        ["Contacto", "+56 9 1234 5678 · tucandidatura.cl", "Tarjeta"],
        ["Prioridades", "01 Seguridad real · 02 Áreas verdes · 03 Empleo local", "Story"],
        ["Propuestas", "5 propuestas para los primeros 100 días", "Volante reverso"],
        ["Leyenda legal", "PROPAGANDA ELECTORAL · [completar]", "Volante, story, afiche"],
    ], [3.4, 8.2, 5.4])

    # ---------------- 6 ----------------
    h1(doc, "6. Exportar según el destino")
    parrafo(doc, "Cada plantilla ya está al tamaño correcto. En pantalla exporta PNG o JPG; para imprenta "
                 "exporta PDF con 300 dpi y marcas de corte, y avisa del sangrado.")

    tabla(doc, ["Pieza", "Medida final", "Formato y ajustes", "Uso"], [
        ["Post", "1080 × 1080 px", "JPG calidad 85-90 %, sRGB", "Feed Instagram / Facebook"],
        ["Story", "1080 × 1920 px", "JPG o PNG; deja ~250 px libres arriba y abajo", "Historias, estados, reels"],
        ["Portada", "1640 × 624 px", "JPG; el móvil recorta el centro", "Cabecera de página"],
        ["Volante", "210 × 297 mm", "PDF 300 dpi + 3 mm de sangrado, CMYK", "Imprenta / puerta a puerta"],
        ["Afiche", "297 × 420 mm", "PDF 300 dpi + 3 mm de sangrado, CMYK", "Muro, reja, vitrina"],
        ["Tarjeta", "90 × 50 mm", "PDF 300 dpi + 2 mm de sangrado, CMYK", "Contacto directo"],
    ], [2.4, 3.6, 6.6, 4.4])

    parrafo(doc, "En Inkscape: Archivo › Propiedades del documento › Ajustar página al dibujo, luego "
                 "Archivo › Exportar y elige 300 dpi. En Illustrator: Exportar como › SVG o PDF, con "
                 "«Usar mesas de trabajo» activado.", space_after=6)

    # ---------------- 7 ----------------
    h1(doc, "7. Reglas que conviene no romper")
    for titulo, texto in [
        ("Una idea por pieza.", "El post dice quién es; la story dice qué va a hacer; el volante resume; el afiche grita el nombre. No mezcles todo en la misma pieza."),
        ("Contraste real.", "Texto oscuro sobre crema o texto crema sobre tinta. Nunca acento sobre foto, ni gris sobre arena. Apunta a 4.5:1 como mínimo."),
        ("Margen de respeto.", "La capa 08 GUÍAS marca la zona segura: no pongas texto fuera de ella, sobre todo en story y portada, donde la plataforma recorta."),
        ("Jerarquía de tres niveles.", "Apellido grande, cargo mediano, lema pequeño. Si todo grita, nada se lee."),
        ("Dos tipografías como máximo.", "Arial Black para titulares y Segoe UI para el resto. No agregues una tercera."),
        ("Foto que mira al texto.", "Si el candidato mira a la derecha, el texto va a la derecha. Ajusta el encuadre, no la posición del texto."),
    ]:
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.line_spacing = 1.15
        r = p.add_run(titulo + " ")
        r.font.bold = True
        r.font.size = Pt(9.8)
        r.font.name = "Segoe UI"
        r.font.color.rgb = TINTA
        r2 = p.add_run(texto)
        r2.font.size = Pt(9.8)
        r2.font.name = "Segoe UI"
        r2.font.color.rgb = RGBColor(0x3A, 0x45, 0x50)

    # ---------------- 8 ----------------
    h1(doc, "8. Normativa electoral (Chile)")
    parrafo(doc, "La propaganda electoral está regulada por la Ley 19.884 sobre transparencia, límite y control "
                 "del gasto electoral y por las instrucciones del SERVEL, que cambian en cada proceso. "
                 "Por eso cada plantilla reserva una franja para la leyenda obligatoria: no la elimines, "
                 "complétala con el texto vigente.")
    for linea in [
        "Leyenda de financiamiento: la capa 07 LEGAL está pensada para la frase que exige la normativa sobre el origen de los recursos.",
        "Periodo de propaganda: fuera de los plazos permitidos no se puede instalar propaganda en la vía pública; el afiche y el volante tienen ventanas de uso.",
        "Redes sociales: la propaganda digital también se considera gasto electoral y debe registrarse.",
        "Autorización de la foto: si aparecen terceros, necesitas su consentimiento por escrito.",
    ]:
        vineta(doc, linea)
    callout(doc, "Antes de imprimir",
            "Confirma con tu administrador electoral el texto exacto de la leyenda, el tamaño mínimo permitido y "
            "los plazos de instalación. Esta guía no reemplaza esa revisión.")

    # ---------------- 9 ----------------
    h1(doc, "9. Rehacer el kit con otra paleta")
    parrafo(doc, "El kit se genera desde un solo script, así que puedes producir una versión nueva sin tocar "
                 "pieza por pieza. Requiere Python con Pillow y python-pptx (el entorno de este equipo ya lo tiene).")
    for linea in [
        "python build/generar.py — regenera todo con la paleta institucional.",
        "python build/generar.py --paleta verde — cambia la paleta (verde, rojo, azul).",
        "python build/generar.py --sin-pptx — solo SVG y PNG, sin PowerPoint.",
    ]:
        vineta(doc, linea)
    parrafo(doc, "Si prefieres no usar el script, edita el bloque de colores de cada SVG: el resultado es el mismo "
                 "para esa pieza.", color=GRIS)

    # ---------------- 10 ----------------
    h1(doc, "10. Problemas frecuentes")
    tabla(doc, ["Síntoma", "Causa y solución"], [
        ["La tipografía se ve distinta", "Arial Black y Segoe UI son fuentes de Windows/Office. En Mac, Arial Black existe; Segoe UI se sustituye por Arial. Si vas a imprenta, convierte los textos a curvas antes de enviar."],
        ["La foto se ve estirada", "Se reemplazó el archivo por uno de otra proporción en un programa que no recorta. Vuelve a aplicar el recorte o usa un PPTX."],
        ["El texto se sale del marco", "Los textos son cajas de tamaño fijo. Reduce el cuerpo un par de puntos o acorta el texto; el apellido se ajusta solo hasta 10 px menos."],
        ["En Illustrator no aparecen las capas", "Illustrator importa los grupos como objetos, no como capas de Inkscape. Abre el SVG en Inkscape o en Figma para ver la estructura de capas."],
        ["Los colores impresos no coinciden", "La pantalla es RGB y la imprenta usa CMYK. Pide una prueba de color y evita naranjas muy saturados en papeles mate."],
        ["El PPTX se ve corrido 2 px", "Es la diferencia normal entre navegador y PowerPoint. Si necesitas precisión absoluta, usa el SVG."],
    ], [4.6, 12.4], size=8.4)

    # ---------------- hoja de contactos ----------------
    doc.add_page_break()
    h1(doc, "Vista general de las 8 piezas")
    cs = PNG / "00_hoja_de_contactos.png"
    if cs.exists():
        doc.add_picture(str(cs), width=Cm(17))
        doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER

    out = GUIA / "Guia-Plantillas-Candidatura.docx"
    doc.save(str(out))
    print("DOCX:", out)
    return out


def vista_previa_pdf():
    """PDF de revisión: una página por pieza."""
    orden = [
        ("01_post_1080.png", "Post cuadrado 1080 x 1080"),
        ("02_story_1080x1920.png", "Story / Reel 1080 x 1920"),
        ("03_volante_A4_frente.png", "Volante A4 · frente"),
        ("04_volante_A4_reverso.png", "Volante A4 · reverso"),
        ("05_portada_facebook_1640x624.png", "Portada Facebook 1640 x 624"),
        ("06_tarjeta_frente.png", "Tarjeta 90 x 50 mm · frente"),
        ("07_tarjeta_reverso.png", "Tarjeta 90 x 50 mm · reverso"),
        ("08_afiche_A3.png", "Afiche A3 297 x 420 mm"),
    ]
    ims = []
    for name, _ in orden:
        p = PNG / name
        if not p.exists():
            continue
        im = Image.open(p).convert("RGB")
        im.thumbnail((2480, 3508), Image.LANCZOS)
        ims.append(im)
    if not ims:
        return None
    out = ROOT / "vista-previa.pdf"
    ims[0].save(out, save_all=True, append_images=ims[1:], resolution=150)
    print("PDF:", out)
    return out


if __name__ == "__main__":
    build()
    vista_previa_pdf()
