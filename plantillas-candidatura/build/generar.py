#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generador del kit de plantillas para candidatura.
Produce, desde una sola fuente de datos:
  - SVG por capas  (svg/*.svg)      -> Inkscape / Illustrator / Figma
  - PNG de control (png/*.png)      -> se rasteriza el SVG con Edge headless
  - PPTX editable  (pptx/*.pptx)    -> cada elemento es una forma con nombre de capa
  - foto de ejemplo (assets/foto-candidato.jpg)

Uso:
    python generar.py                 # paleta institucional
    python generar.py --paleta verde  # variante de color
"""

import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SVG_DIR = ROOT / "svg"
PNG_DIR = ROOT / "png"
PPTX_DIR = ROOT / "pptx"
ASSETS = ROOT / "assets"
BUILD = ROOT / "build"
EDGE = Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")
WIN_FONTS = Path(r"C:\Windows\Fonts")

# --------------------------------------------------------------------------
# 1. SISTEMA VISUAL
# --------------------------------------------------------------------------

PALETAS = {
    "institucional": {
        "tinta": "#0F1B26",
        "azul": "#14405F",
        "acento": "#E2542C",
        "crema": "#F6F1E8",
        "arena": "#E3D7C6",
        "gris": "#6E7780",
        "blanco": "#FFFFFF",
    },
    "verde": {
        "tinta": "#0B2019",
        "azul": "#12523C",
        "acento": "#D8A227",
        "crema": "#F4F1E6",
        "arena": "#DFD8C3",
        "gris": "#6C7468",
        "blanco": "#FFFFFF",
    },
    "rojo": {
        "tinta": "#200E12",
        "azul": "#7A1220",
        "acento": "#F0B429",
        "crema": "#F8F0EA",
        "arena": "#E6D5CB",
        "gris": "#77686A",
        "blanco": "#FFFFFF",
    },
    "azul": {
        "tinta": "#0A1A33",
        "azul": "#1447A6",
        "acento": "#F2C14E",
        "crema": "#F5F6F8",
        "arena": "#D9DEE7",
        "gris": "#6B7280",
        "blanco": "#FFFFFF",
    },
}

P = dict(PALETAS["institucional"])

FTTF = {
    ("display", False): WIN_FONTS / "ariblk.ttf",
    ("semi", False): WIN_FONTS / "segoeuib.ttf",
    ("body", False): WIN_FONTS / "segoeui.ttf",
    ("body", True): WIN_FONTS / "segoeuib.ttf",
}
FAMILY_SVG = {
    "display": "'Arial Black','Segoe UI Black',Impact,sans-serif",
    "semi": "'Segoe UI Semibold','Segoe UI',Arial,sans-serif",
    "body": "'Segoe UI',Arial,Helvetica,sans-serif",
}
FAMILY_PPT = {"display": "Arial Black", "semi": "Segoe UI Semibold", "body": "Segoe UI"}

LAYERS = [
    "01 FONDO",
    "02 FORMAS",
    "03 FOTO",
    "04 SOBRE FOTO",
    "05 TEXTOS",
    "06 DATOS",
    "07 LEGAL",
    "08 GUÍAS",
]

# Textos de ejemplo (todo reemplazable)
T = {
    "kicker": "ELECCIONES 2028",
    "nombre": "NOMBRE",
    "apellido": "APELLIDO",
    "cargo": "CANDIDATO A ALCALDE",
    "lema1": "POR UN BARRIO SEGURO,",
    "lema2": "LIMPIO Y CON OPORTUNIDADES",
    "lema_full": "POR UN BARRIO SEGURO, LIMPIO Y CON OPORTUNIDADES",
    "handle": "@TUUSUARIO",
    "fecha": "26 DE OCTUBRE",
    "vota": "VOTA",
    "vota_largo": "VOTA POR MÍ",
    "cta": "CONÓCEME",
    "legal": "PROPAGANDA ELECTORAL · LEYENDA LEGAL OBLIGATORIA: [COMPLETAR SEGÚN NORMATIVA SERVEL]",
}

# --------------------------------------------------------------------------
# 2. MEDICIÓN Y AJUSTE DE TEXTO (mismas líneas para SVG y PPTX)
# --------------------------------------------------------------------------

_fcache = {}


def font(fam, size, bold=False):
    key = (fam, bold, int(size))
    if key not in _fcache:
        _fcache[key] = ImageFont.truetype(str(FTTF[(fam, bold)]), max(int(size), 4))
    return _fcache[key]


def twidth(s, fam, size, ls=0.0, bold=False):
    w = font(fam, size, bold).getlength(s)
    return w + ls * size * max(len(s) - 1, 0)


def wrap_lines(s, fam, size, maxw, ls=0.0, bold=False):
    words = s.split()
    lines, cur = [], ""
    for word in words:
        cand = (cur + " " + word).strip()
        if twidth(cand, fam, size, ls, bold) <= maxw or not cur:
            cur = cand
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def fit_size(s, fam, size, maxw, ls=0.0, bold=False, minsize=10):
    while size > minsize and twidth(s, fam, size, ls, bold) > maxw:
        size -= 1
    return size


# --------------------------------------------------------------------------
# 3. MODELO DE ESCENA (capas -> nodos)
# --------------------------------------------------------------------------


ACCENT_MAP = str.maketrans("áéíóúñüÁÉÍÓÚÑÜ", "aeiounuAEIOUNU")


class Scene:
    def __init__(self, key, titulo, w, h, desc=""):
        self.key = key
        self.titulo = titulo
        self.w = w
        self.h = h
        self.desc = desc
        self.layers = {k: [] for k in LAYERS}
        self.notes = []
        self._ids = set()

    def add(self, layer, node):
        assert layer in self.layers, layer
        if node.get("name"):
            base = re.sub(r"[^a-z0-9]+", "-",
                          node["name"].translate(ACCENT_MAP).lower()).strip("-") or "objeto"
            slug, i = base, 2
            while slug in self._ids:
                slug = f"{base}-{i}"
                i += 1
            self._ids.add(slug)
            node["slug"] = slug
        self.layers[layer].append(node)
        return node


def id_attrs(n):
    if not n.get("name"):
        return ""
    return f' id="{n["slug"]}" inkscape:label="{svg_escape(n["name"])}"' 


def _n(kind, layer, **kw):
    kw["t"] = kind
    kw["layer"] = layer
    return kw


def rect(sc, layer, x, y, w, h, fill="crema", stroke=None, sw=1, dash=None,
         rx=0, name=None, opacity=None):
    sc.add(layer, _n("rect", layer, x=x, y=y, w=w, h=h, fill=fill, stroke=stroke,
                     sw=sw, dash=dash, rx=rx, name=name, opacity=opacity))


def poly(sc, layer, pts, fill="acento", name=None, opacity=None):
    sc.add(layer, _n("poly", layer, pts=pts, fill=fill, name=name, opacity=opacity))


def circle(sc, layer, cx, cy, r, fill="acento", stroke=None, sw=1, name=None):
    sc.add(layer, _n("circle", layer, cx=cx, cy=cy, r=r, fill=fill, stroke=stroke,
                     sw=sw, name=name))


def line(sc, layer, x1, y1, x2, y2, stroke="gris", sw=1, dash=None, name=None):
    sc.add(layer, _n("line", layer, x1=x1, y1=y1, x2=x2, y2=y2, stroke=stroke,
                     sw=sw, dash=dash, name=name))


def text(sc, layer, x, y, s, size, fam="body", color="tinta", ls=0.0,
         anchor="start", w=None, name=None, bold=False, vcenter=None, fit_max=None):
    """Una línea. (x,y) = punto de la línea base."""
    if fit_max:
        size = fit_size(s, fam, size, fit_max, ls, bold)
        if w is None:
            w = fit_max
    sc.add(layer, _n("text", layer, lines=[(s, y)], x=x, size=size, fam=fam, color=color,
                     ls=ls, anchor=anchor, w=w, name=name, bold=bold, vcenter=vcenter,
                     lh=1.2))


def block(sc, layer, x, y, s, size, max_w, fam="body", color="tinta", ls=0.0,
          lh=1.45, anchor="start", name=None, bold=False, upper=False,
          fit_max=None, min_size=9):
    """Párrafo multilínea con líneas ya calculadas. (x,y) = línea base 1."""
    if upper:
        s = s.upper()
    if fit_max:
        size = fit_size(s, fam, size, fit_max, ls, bold, min_size)
    lines = wrap_lines(s, fam, size, max_w, ls, bold)
    if len(lines) == 1:
        size = fit_size(s, fam, size, max_w, ls, bold, min_size)
        lines = [s]
    step = size * lh
    entries = [(ln, y + i * step) for i, ln in enumerate(lines)]
    sc.add(layer, _n("text", layer, lines=entries, x=x, size=size, fam=fam, color=color,
                     ls=ls, anchor=anchor, w=max_w, name=name, bold=bold, vcenter=None,
                     lh=lh))
    return size, len(lines)


def photo(sc, layer, x, y, w, h, name="Foto del candidato"):
    sc.add(layer, _n("photo", layer, x=x, y=y, w=w, h=h, name=name,
                     href="../assets/foto-candidato.jpg"))


def logo(sc, layer, x, y, w, h, tone="tinta"):
    sc.add(layer, _n("logo", layer, x=x, y=y, w=w, h=h, tone=tone, name="Logo (reemplazar)"))


def guides(sc, margin=40):
    lyr = "08 GUÍAS"
    rect(sc, lyr, margin, margin, sc.w - 2 * margin, sc.h - 2 * margin,
         fill=None, stroke="acento", sw=1, dash="8 6", name="Zona segura")
    text(sc, lyr, margin + 6, margin - 12, f"ZONA SEGURA · margen {margin}px", 11,
         "semi", "acento", 0.08)


# --------------------------------------------------------------------------
# 4. PLANTILLAS
# --------------------------------------------------------------------------


def t_post():
    sc = Scene("01_post_1080", "Post cuadrado 1080 x 1080",
               1080, 1080, "Presentación de candidatura · feed Instagram / Facebook")
    rect(sc, "01 FONDO", 0, 0, 1080, 1080, "crema", name="Fondo crema")
    rect(sc, "02 FORMAS", 584, 0, 12, 1080, "acento", name="Barra acento vertical")
    rect(sc, "02 FORMAS", 0, 948, 584, 132, "tinta", name="Banda inferior")
    photo(sc, "03 FOTO", 596, 0, 484, 1080)

    logo(sc, "06 DATOS", 60, 56, 150, 44)
    rect(sc, "02 FORMAS", 60, 140, 44, 6, "acento", name="Guion acento")
    text(sc, "05 TEXTOS", 60, 182, T["kicker"], 19, "semi", "azul", 0.18)
    text(sc, "05 TEXTOS", 60, 244, T["nombre"], 30, "semi", "tinta", 0.12)
    text(sc, "05 TEXTOS", 60, 330, T["apellido"], 84, "display", "tinta", 0.0,
         name="Apellido (titular)", w=470)
    rect(sc, "02 FORMAS", 60, 366, 86, 8, "acento", name="Regla acento")
    text(sc, "05 TEXTOS", 60, 418, T["cargo"], 26, "semi", "azul", 0.10)
    block(sc, "05 TEXTOS", 60, 496, T["lema1"] + " " + T["lema2"], 33, 478, "body",
          "tinta", lh=1.42, name="Lema")
    text(sc, "06 DATOS", 60, 676, "SEGURIDAD · ÁREAS VERDES · EMPLEO", 18, "semi",
         "gris", 0.10, name="Ejes (chips)")

    rect(sc, "02 FORMAS", 60, 716, 300, 62, "tinta", rx=31, name="Botón CTA")
    text(sc, "05 TEXTOS", 210, 754, T["cta"], 20, "semi", "crema", 0.16, anchor="middle")
    text(sc, "06 DATOS", 60, 1002, T["fecha"], 22, "display", "crema", 0.04)
    text(sc, "06 DATOS", 60, 1042, T["handle"], 17, "semi", "arena", 0.12)

    circle(sc, "04 SOBRE FOTO", 596, 948, 96, "crema", name="Aro sello")
    circle(sc, "04 SOBRE FOTO", 596, 948, 84, "acento", name="Sello")
    text(sc, "06 DATOS", 596, 978, T["vota"], 40, "display", "crema", 0.06,
         anchor="middle", name="Sello VOTA")

    guides(sc)
    sc.notes = [
        "Post cuadrado 1080 x 1080 px.",
        "Capa 03 FOTO: reemplaza assets/foto-candidato.jpg (misma proporción).",
        "El sello 'VOTA' se puede cambiar por el número de papeleta si aplica.",
    ]
    return sc


def t_story():
    sc = Scene("02_story_1080x1920", "Story / Reel 1080 x 1920",
               1080, 1920, "3 prioridades · historias de Instagram, estados, reels")
    rect(sc, "01 FONDO", 0, 0, 1080, 1920, "crema", name="Fondo crema")
    rect(sc, "02 FORMAS", 0, 0, 1080, 720, "tinta", name="Bloque superior")
    rect(sc, "02 FORMAS", 0, 720, 1080, 10, "acento", name="Separador acento")
    rect(sc, "02 FORMAS", 590, 66, 412, 576, "acento", name="Marco desplazado")
    photo(sc, "03 FOTO", 602, 78, 412, 576)

    logo(sc, "06 DATOS", 64, 62, 150, 42, tone="crema")
    text(sc, "05 TEXTOS", 64, 216, T["kicker"], 22, "semi", "acento", 0.18)
    text(sc, "05 TEXTOS", 64, 290, T["nombre"], 34, "semi", "crema", 0.10)
    text(sc, "05 TEXTOS", 64, 378, T["apellido"], 76, "display", "crema", 0.0,
         name="Apellido (titular)", w=500)
    text(sc, "05 TEXTOS", 64, 430, T["cargo"], 24, "semi", "arena", 0.10)
    block(sc, "05 TEXTOS", 64, 512, T["lema_full"], 27, 490, "body", "arena", lh=1.38,
          name="Lema")
    rect(sc, "02 FORMAS", 64, 640, 218, 56, "acento", rx=28, name="Botón VOTA")
    text(sc, "05 TEXTOS", 173, 678, T["vota"], 26, "display", "crema", 0.10, anchor="middle")

    text(sc, "05 TEXTOS", 64, 826, "MIS 3 PRIORIDADES", 54, "display", "tinta", 0.0,
         name="Título de sección", w=952)
    text(sc, "06 DATOS", 64, 866, "LO QUE VOY A HACER EN EL PRIMER AÑO", 19, "semi",
         "gris", 0.12)

    tarjetas = [
        ("01", "SEGURIDAD REAL", "Más patrullaje municipal, cámaras en los pasajes y alarmas comunitarias."),
        ("02", "ÁREAS VERDES", "Recuperar las plazas abandonadas y arborizar cada calle del barrio."),
        ("03", "EMPLEO LOCAL", "Oficina municipal de empleo y ferias de emprendimiento cada mes."),
    ]
    y = 910
    for num, titulo, desc in tarjetas:
        rect(sc, "02 FORMAS", 64, y, 952, 210, "blanco", name=f"Tarjeta {num}")
        rect(sc, "02 FORMAS", 64, y, 12, 210, "acento", name=f"Barra tarjeta {num}")
        rect(sc, "02 FORMAS", 64, y, 952, 210, None, "arena", sw=1, name=f"Borde tarjeta {num}")
        text(sc, "05 TEXTOS", 104, y + 86, num, 44, "display", "acento", 0.0)
        text(sc, "05 TEXTOS", 192, y + 86, titulo, 34, "display", "tinta", 0.0, w=790)
        block(sc, "05 TEXTOS", 192, y + 140, desc, 26, 780, "body", "gris", lh=1.3)
        y += 230

    rect(sc, "02 FORMAS", 0, 1640, 1080, 280, "tinta", name="Pie")
    text(sc, "05 TEXTOS", 64, 1720, "COMPARTE ESTA HISTORIA", 26, "semi", "crema", 0.14)
    text(sc, "06 DATOS", 64, 1790, T["handle"], 34, "display", "acento", 0.0)
    rect(sc, "02 FORMAS", 748, 1704, 268, 64, "crema", rx=32, name="Botón VOTA")
    text(sc, "05 TEXTOS", 882, 1743, T["vota"], 24, "display", "tinta", 0.12, anchor="middle")
    text(sc, "07 LEGAL", 64, 1862, "PROPAGANDA ELECTORAL · [LEYENDA LEGAL]", 12, "semi",
         "crema", 0.10, name="Leyenda legal")

    guides(sc)
    sc.notes = ["Story 1080 x 1920 px (deja 250 px libres arriba y abajo).",
                "Las 3 tarjetas son capas independientes: duplica o elimina según necesites."]
    return sc


def t_volante_frente():
    sc = Scene("03_volante_A4_frente", "Volante A4 · frente",
               794, 1123, "Volante para imprenta (210 x 297 mm)")
    rect(sc, "01 FONDO", 0, 0, 794, 1123, "crema", name="Fondo crema")
    rect(sc, "02 FORMAS", 0, 0, 794, 14, "acento", name="Barra superior")
    rect(sc, "02 FORMAS", 0, 1109, 794, 14, "acento", name="Barra inferior")
    photo(sc, "03 FOTO", 0, 96, 794, 470)
    rect(sc, "04 SOBRE FOTO", 0, 452, 794, 232, "tinta", name="Panel de nombre")

    logo(sc, "06 DATOS", 48, 36, 140, 40)
    text(sc, "06 DATOS", 746, 62, T["kicker"], 16, "semi", "azul", 0.18, anchor="end")

    text(sc, "05 TEXTOS", 56, 536, "CANDIDATURA A ALCALDE", 18, "semi", "acento", 0.18)
    text(sc, "05 TEXTOS", 56, 588, T["nombre"], 34, "semi", "crema", 0.10)
    text(sc, "05 TEXTOS", 56, 668, T["apellido"], 78, "display", "crema", 0.0,
         name="Apellido (titular)", w=540)
    circle(sc, "04 SOBRE FOTO", 700, 596, 72, "acento", name="Sello")
    text(sc, "06 DATOS", 700, 613, T["vota"], 30, "display", "crema", 0.06, anchor="middle")

    rect(sc, "02 FORMAS", 56, 734, 80, 7, "acento", name="Regla acento")
    block(sc, "05 TEXTOS", 56, 804, T["lema_full"], 33, 682, "body", "tinta", lh=1.4,
          name="Lema")
    rect(sc, "02 FORMAS", 56, 906, 300, 62, "tinta", rx=31, name="Botón CTA")
    text(sc, "05 TEXTOS", 206, 944, T["cta"], 20, "semi", "crema", 0.16, anchor="middle")
    text(sc, "06 DATOS", 380, 932, T["fecha"], 26, "display", "azul", 0.04)
    text(sc, "06 DATOS", 380, 962, T["handle"], 16, "semi", "gris", 0.12)

    block(sc, "07 LEGAL", 56, 1052, T["legal"], 11, 682, "semi", "gris", lh=1.3,
          name="Leyenda legal")
    guides(sc, 30)
    sc.notes = ["A4 vertical 210 x 297 mm. Exporta a 300 dpi y agrega 3 mm de sangrado.",
                "Capa 03 FOTO: usa una foto horizontal de al menos 2400 px de ancho."]
    return sc


def t_volante_reverso():
    sc = Scene("04_volante_A4_reverso", "Volante A4 · reverso",
               794, 1123, "5 propuestas para los primeros 100 días")
    rect(sc, "01 FONDO", 0, 0, 794, 1123, "crema", name="Fondo crema")
    rect(sc, "02 FORMAS", 0, 0, 794, 14, "acento", name="Barra superior")
    rect(sc, "02 FORMAS", 0, 1030, 794, 93, "tinta", name="Pie")

    logo(sc, "06 DATOS", 48, 36, 140, 40)
    text(sc, "06 DATOS", 746, 62, "PROPUESTAS", 16, "semi", "azul", 0.18, anchor="end")

    text(sc, "05 TEXTOS", 56, 190, "5 PROPUESTAS", 60, "display", "tinta", 0.0,
         name="Título")
    text(sc, "06 DATOS", 56, 226, "PARA LOS PRIMEROS 100 DÍAS DE GESTIÓN", 18, "semi",
         "gris", 0.12)
    rect(sc, "02 FORMAS", 56, 250, 80, 7, "acento", name="Regla acento")

    props = [
        ("1", "SEGURIDAD DE BARRIO", "Patrullaje municipal nocturno y cámaras en los pasajes críticos."),
        ("2", "PLAZAS RECUPERADAS", "Remodelación de 6 plazas y 1.000 árboles nuevos."),
        ("3", "EMPLEO Y EMPRENDIMIENTO", "Oficina de empleo y feria mensual de emprendedores."),
        ("4", "ADULTOS MAYORES", "Centro diurno y transporte gratuito a trámites."),
        ("5", "TRANSPORTE LOCAL", "Nuevas paradas seguras y recorrido barrial nocturno."),
    ]
    y = 296
    for num, titulo, desc in props:
        text(sc, "05 TEXTOS", 56, y + 60, num, 76, "display", "acento", 0.0)
        text(sc, "05 TEXTOS", 140, y + 34, titulo, 28, "display", "tinta", 0.0,
             fit_max=560, w=560)
        block(sc, "05 TEXTOS", 140, y + 74, desc, 20, 560, "body", "gris", lh=1.3)
        line(sc, "02 FORMAS", 56, y + 118, 738, y + 118, "arena", 1.5)
        y += 148

    text(sc, "06 DATOS", 56, 1082, "VOTA · " + T["fecha"], 24, "display", "crema", 0.04)
    text(sc, "06 DATOS", 738, 1078, T["handle"], 16, "semi", "arena", 0.12, anchor="end")
    guides(sc, 30)
    sc.notes = ["A4 vertical. Reverso del volante: 5 propuestas numeradas.",
                "Cada propuesta es un grupo de capas independiente (número, título, bajada, línea)."]
    return sc


def t_portada():
    sc = Scene("05_portada_facebook_1640x624", "Portada Facebook 1640 x 624",
               1640, 624, "Cabecera de página / perfil")
    rect(sc, "01 FONDO", 0, 0, 1640, 624, "tinta", name="Fondo tinta")
    rect(sc, "02 FORMAS", 0, 0, 14, 624, "acento", name="Barra acento")
    rect(sc, "02 FORMAS", 1062, 0, 14, 624, "acento", name="Marco acento foto")
    photo(sc, "03 FOTO", 1076, 0, 564, 624)

    logo(sc, "06 DATOS", 80, 56, 150, 44, tone="crema")
    text(sc, "05 TEXTOS", 80, 216, T["kicker"] + " · COMUNA", 20, "semi", "acento", 0.18)
    text(sc, "05 TEXTOS", 80, 286, T["nombre"], 34, "semi", "crema", 0.10)
    text(sc, "05 TEXTOS", 80, 384, T["apellido"], 92, "display", "crema", 0.0,
         name="Apellido (titular)", w=900)
    text(sc, "05 TEXTOS", 80, 438, T["cargo"], 26, "semi", "arena", 0.12)
    text(sc, "05 TEXTOS", 80, 500, T["lema1"] + " " + T["lema2"], 28, "body", "arena", 0.0,
         w=880, name="Lema")
    text(sc, "06 DATOS", 80, 572, T["handle"] + "  ·  " + T["fecha"], 18, "semi", "acento", 0.12)

    guides(sc, 40)
    sc.notes = ["Portada 1640 x 624 px. En móvil Facebook recorta el centro: "
                "mantén nombre y lema dentro de la zona segura marcada."]
    return sc


def t_tarjeta_frente():
    sc = Scene("06_tarjeta_frente", "Tarjeta de presentación · frente",
               340, 189, "90 x 50 mm")
    rect(sc, "01 FONDO", 0, 0, 340, 189, "crema", name="Fondo crema")
    rect(sc, "02 FORMAS", 0, 0, 9, 189, "acento", name="Barra acento")
    logo(sc, "06 DATOS", 24, 18, 104, 24)
    text(sc, "06 DATOS", 316, 34, "26 OCT", 11, "display", "acento", 0.06, anchor="end", w=90)
    text(sc, "06 DATOS", 316, 48, T["vota"], 7.5, "semi", "gris", 0.16, anchor="end", w=90)
    text(sc, "05 TEXTOS", 24, 88, T["nombre"], 11, "semi", "azul", 0.12)
    text(sc, "05 TEXTOS", 24, 122, T["apellido"], 29, "display", "tinta", 0.0,
         name="Apellido", w=290, fit_max=290)
    rect(sc, "02 FORMAS", 24, 134, 44, 3.5, "acento", name="Regla acento")
    text(sc, "05 TEXTOS", 24, 152, T["cargo"], 9.5, "semi", "azul", 0.10)
    text(sc, "06 DATOS", 24, 174, "+56 9 1234 5678  ·  " + T["handle"], 8.5, "body", "gris", 0.0)
    guides(sc, 12)
    sc.notes = ["Tarjeta 90 x 50 mm (340 x 189 px a 96 dpi). " \
                "Para imprenta usa 300 dpi: 1063 x 591 px."]
    return sc


def t_tarjeta_reverso():
    sc = Scene("07_tarjeta_reverso", "Tarjeta de presentación · reverso",
               340, 189, "90 x 50 mm")
    rect(sc, "01 FONDO", 0, 0, 340, 189, "tinta", name="Fondo tinta")
    rect(sc, "02 FORMAS", 0, 0, 9, 189, "acento", name="Barra acento")
    logo(sc, "06 DATOS", 24, 20, 110, 28, tone="crema")
    block(sc, "05 TEXTOS", 24, 98, T["lema_full"], 13.5, 292, "body", "crema", lh=1.35,
          name="Lema")
    text(sc, "06 DATOS", 24, 148, T["handle"] + "  ·  tucandidatura.cl", 8.5, "semi",
         "arena", 0.06)
    text(sc, "06 DATOS", 24, 174, "VOTA · " + T["fecha"], 13, "display", "acento", 0.04)
    guides(sc, 12)
    sc.notes = ["Reverso de la tarjeta: lema + llamado al voto."]
    return sc


def t_afiche():
    sc = Scene("08_afiche_A3", "Afiche A3", 1123, 1587,
               "Afiche de calle 297 x 420 mm")
    rect(sc, "01 FONDO", 0, 0, 1123, 1587, "crema", name="Fondo crema")
    rect(sc, "02 FORMAS", 0, 0, 1123, 640, "tinta", name="Bloque superior")
    rect(sc, "02 FORMAS", 0, 628, 1123, 12, "acento", name="Separador acento")
    photo(sc, "03 FOTO", 0, 640, 1123, 947)
    rect(sc, "04 SOBRE FOTO", 0, 1310, 1123, 277, "tinta", name="Banda inferior")

    logo(sc, "06 DATOS", 64, 56, 180, 54, tone="crema")
    text(sc, "05 TEXTOS", 64, 214, T["kicker"], 24, "semi", "acento", 0.18)
    text(sc, "05 TEXTOS", 64, 318, T["nombre"], 46, "semi", "crema", 0.10)
    text(sc, "05 TEXTOS", 64, 456, T["apellido"], 128, "display", "crema", 0.0,
         name="Apellido (titular)", w=995)
    text(sc, "05 TEXTOS", 64, 526, T["cargo"], 30, "semi", "arena", 0.12)

    block(sc, "05 TEXTOS", 64, 1392, T["lema_full"], 31, 520, "body", "crema", lh=1.38,
          name="Lema")
    text(sc, "05 TEXTOS", 1059, 1436, T["vota_largo"], 56, "display", "acento", 0.0,
         anchor="end", w=450, fit_max=450, name="Llamado al voto")
    text(sc, "05 TEXTOS", 1059, 1492, T["fecha"], 22, "display", "crema", 0.06,
         anchor="end", w=450, name="Fecha")
    text(sc, "06 DATOS", 64, 1530, T["handle"], 20, "semi", "arena", 0.12)
    guides(sc, 45)
    sc.notes = ["A3 297 x 420 mm. Para imprenta: 300 dpi + 3 mm de sangrado.",
                "La foto ocupa el 60% inferior: usa una imagen vertical de buena calidad."]
    return sc


ETIQUETAS = {
    "01_post_1080": "POST 1080 × 1080",
    "02_story_1080x1920": "STORY 1080 × 1920",
    "03_volante_A4_frente": "VOLANTE A4 · FRENTE",
    "04_volante_A4_reverso": "VOLANTE A4 · REVERSO",
    "05_portada_facebook_1640x624": "PORTADA FB 1640 × 624",
    "06_tarjeta_frente": "TARJETA · FRENTE",
    "07_tarjeta_reverso": "TARJETA · REVERSO",
    "08_afiche_A3": "AFICHE A3",
}

TEMPLATES = [
    t_post,
    t_story,
    t_volante_frente,
    t_volante_reverso,
    t_portada,
    t_tarjeta_frente,
    t_tarjeta_reverso,
    t_afiche,
]


# --------------------------------------------------------------------------
# 5. RENDER SVG
# --------------------------------------------------------------------------


def color_attr(token, key="fill"):
    if token is None:
        return f'{key}="none"' if key == "fill" else ""
    hexv = P.get(token, token)
    return f'{key}="{hexv}"'


def svg_escape(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;"))


def node_svg(n):
    t = n["t"]
    if t == "rect":
        fill = color_attr(n.get("fill"))
        extra = ""
        if n.get("stroke"):
            extra += " " + color_attr(n["stroke"], "stroke")
            extra += f' stroke-width="{n.get("sw", 1)}"'
            if n.get("dash"):
                extra += f' stroke-dasharray="{n["dash"]}"'
        if n.get("opacity") is not None:
            extra += f' fill-opacity="{n["opacity"]}"'
        rx = n.get("rx") or 0
        return (f'<rect{id_attrs(n)} x="{n["x"]}" y="{n["y"]}" width="{n["w"]}" height="{n["h"]}"'
                f' rx="{rx}" {fill}{extra}/>')
    if t == "circle":
        extra = ""
        if n.get("stroke"):
            extra += " " + color_attr(n["stroke"], "stroke")
            extra += f' stroke-width="{n.get("sw", 1)}"'
        return (f'<circle{id_attrs(n)} cx="{n["cx"]}" cy="{n["cy"]}" r="{n["r"]}"'
                f' {color_attr(n.get("fill"))}{extra}/>')
    if t == "line":
        extra = ""
        if n.get("dash"):
            extra += f' stroke-dasharray="{n["dash"]}"'
        return (f'<line x1="{n["x1"]}" y1="{n["y1"]}" x2="{n["x2"]}" y2="{n["y2"]}"'
                f' {color_attr(n.get("stroke"), "stroke")} stroke-width="{n.get("sw", 1)}"{extra}/>')
    if t == "poly":
        pts = " ".join(f"{x},{y}" for x, y in n["pts"])
        return f'<polygon{id_attrs(n)} points="{pts}" {color_attr(n.get("fill"))}/>'
    if t == "text":
        out = []
        for s, y in n["lines"]:
            ls = n["ls"] * n["size"]
            anchor = {"start": "", "middle": ' text-anchor="middle"',
                      "end": ' text-anchor="end"'}[n["anchor"]]
            bold = ' font-weight="700"' if n.get("bold") else ""
            out.append(f'<text x="{n["x"]}" y="{round(y, 2)}" class="f-{n["fam"]}"'
                       f' font-size="{n["size"]}" letter-spacing="{round(ls, 2)}"{bold}'
                       f' {color_attr(n["color"])}{anchor}>{svg_escape(s)}</text>')
        cuerpo = "\n        ".join(out)
        if n.get("name"):
            return f'<g{id_attrs(n)}>\n        {cuerpo}\n      </g>'
        return cuerpo
    if t == "photo":
        return (f'<image x="{n["x"]}" y="{n["y"]}" width="{n["w"]}" height="{n["h"]}"'
                f' preserveAspectRatio="xMidYMid slice"'
                f' href="{n["href"]}" xlink:href="{n["href"]}"{id_attrs(n)}/>')
    if t == "logo":
        tone = n.get("tone", "tinta")
        fs = max(9, round(n["h"] * 0.30))
        return (
            f'<g{id_attrs(n)}>'
            f'<rect x="{n["x"]}" y="{n["y"]}" width="{n["w"]}" height="{n["h"]}" rx="2"'
            f' fill="none" {color_attr(tone, "stroke")} stroke-width="1.4" stroke-dasharray="7 5" opacity="0.55"/>'
            f'<text x="{n["x"] + n["w"] / 2}" y="{n["y"] + n["h"] / 2 + fs * 0.36}"'
            f' class="f-semi" font-size="{fs}" letter-spacing="{round(fs * 0.16, 2)}"'
            f' text-anchor="middle" {color_attr(tone)} opacity="0.7">TU LOGO</text>'
            f'</g>')
    return ""


def scene_svg(sc, paleta_nombre):
    css = "\n".join(f"  .c-{k}{{fill:{v}}}" for k, v in P.items())
    css += ("\n  .f-display{font-family:" + FAMILY_SVG["display"] + ";font-weight:900}"
            "\n  .f-semi{font-family:" + FAMILY_SVG["semi"] + ";font-weight:600}"
            "\n  .f-body{font-family:" + FAMILY_SVG["body"] + ";font-weight:400}")
    body = []
    for layer in LAYERS:
        nodes = sc.layers[layer]
        if not nodes:
            continue
        oculto = ' style="display:none"' if layer == "08 GUÍAS" else ""
        body.append(f'  <g id="capa-{layer[:2]}" inkscape:groupmode="layer" '
                    f'inkscape:label="{layer}"{oculto}>')
        for n in nodes:
            s = node_svg(n)
            if s:
                body.append("    " + s)
        body.append("  </g>")
    head = f"""<?xml version="1.0" encoding="UTF-8"?>
<!--
  PLANTILLA: {sc.titulo}  ({sc.w} x {sc.h} px)
  PALETA: {paleta_nombre}
  Capas (de abajo hacia arriba): {' · '.join(LAYERS)}
  Para recolorear: edita el bloque <style> (clases .c-tinta, .c-azul, .c-acento...).
  Para cambiar la foto: reemplaza el archivo assets/foto-candidato.jpg.
-->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     width="{sc.w}" height="{sc.h}" viewBox="0 0 {sc.w} {sc.h}"
     version="1.1">
  <title>{svg_escape(sc.titulo)}</title>
  <desc>{svg_escape(sc.desc)}</desc>
  <style>
{css}
  </style>
"""
    return head + "\n".join(body) + "\n</svg>\n"


# --------------------------------------------------------------------------
# 6. RENDER PNG (Edge headless sobre el SVG)
# --------------------------------------------------------------------------


def svg_to_png(svg_path, png_path, w, h):
    args = [
        str(EDGE),
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        f"--user-data-dir={BUILD / 'edge-profile'}",
        f"--window-size={w},{h}",
        f"--screenshot={png_path}",
        svg_path.as_uri(),
    ]
    subprocess.run(args, capture_output=True, timeout=120)


# --------------------------------------------------------------------------
# 7. RENDER PPTX
# --------------------------------------------------------------------------


def build_pptx(scenes, out_path, titulo):
    from pptx import Presentation
    from pptx.util import Emu, Pt
    from pptx.dml.color import RGBColor
    from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
    from pptx.enum.shapes import MSO_SHAPE
    from pptx.enum.dml import MSO_LINE
    from pptx.enum.text import MSO_AUTO_SIZE

    EMU = 9525

    def rgb(token):
        h = P.get(token, token).lstrip("#")
        return RGBColor(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))

    prs = Presentation()
    first = True
    for sc in scenes:
        if first:
            prs.slide_width = Emu(sc.w * EMU)
            prs.slide_height = Emu(sc.h * EMU)
            layout = prs.slide_layouts[6]
            first = False
        # cada escena puede tener distinto tamaño: un archivo por formato
        slide = prs.slides.add_slide(layout)
        for layer in LAYERS:
            if layer == "08 GUÍAS":
                continue
            for n in sc.layers[layer]:
                t = n["t"]
                if t == "rect":
                    shp = slide.shapes.add_shape(
                        MSO_SHAPE.ROUNDED_RECTANGLE if n.get("rx") else MSO_SHAPE.RECTANGLE,
                        Emu(int(n["x"] * EMU)), Emu(int(n["y"] * EMU)),
                        Emu(int(n["w"] * EMU)), Emu(int(n["h"] * EMU)))
                    if n.get("rx"):
                        try:
                            shp.adjustments[0] = min(0.5, n["rx"] / max(1, min(n["w"], n["h"])))
                        except Exception:
                            pass
                    if n.get("fill"):
                        shp.fill.solid()
                        shp.fill.fore_color.rgb = rgb(n["fill"])
                    else:
                        shp.fill.background()
                    if n.get("stroke"):
                        shp.line.color.rgb = rgb(n["stroke"])
                        shp.line.width = Pt(n.get("sw", 1) * 0.75)
                        if n.get("dash"):
                            shp.line.dash_style = MSO_LINE.DASH
                    else:
                        shp.line.fill.background()
                    shp.shadow.inherit = False
                    shp.name = n.get("name") or "Forma"
                elif t == "circle":
                    shp = slide.shapes.add_shape(MSO_SHAPE.OVAL,
                                                 Emu(int((n["cx"] - n["r"]) * EMU)),
                                                 Emu(int((n["cy"] - n["r"]) * EMU)),
                                                 Emu(int(2 * n["r"] * EMU)),
                                                 Emu(int(2 * n["r"] * EMU)))
                    if n.get("fill"):
                        shp.fill.solid()
                        shp.fill.fore_color.rgb = rgb(n["fill"])
                    else:
                        shp.fill.background()
                    if n.get("stroke"):
                        shp.line.color.rgb = rgb(n["stroke"])
                        shp.line.width = Pt(n.get("sw", 1) * 0.75)
                    else:
                        shp.line.fill.background()
                    shp.shadow.inherit = False
                    shp.name = n.get("name") or "Forma"
                elif t == "line":
                    from pptx.enum.shapes import MSO_CONNECTOR
                    conn = slide.shapes.add_connector(
                        MSO_CONNECTOR.STRAIGHT,
                        Emu(int(n["x1"] * EMU)), Emu(int(n["y1"] * EMU)),
                        Emu(int(n["x2"] * EMU)), Emu(int(n["y2"] * EMU)))
                    conn.line.color.rgb = rgb(n["stroke"])
                    conn.line.width = Pt(n.get("sw", 1) * 0.75)
                    if n.get("dash"):
                        conn.line.dash_style = MSO_LINE.DASH
                    conn.name = n.get("name") or "Línea"
                elif t == "photo":
                    ph = placeholder_image(n["w"], n["h"])
                    pic = slide.shapes.add_picture(str(ph), Emu(int(n["x"] * EMU)),
                                                   Emu(int(n["y"] * EMU)),
                                                   Emu(int(n["w"] * EMU)),
                                                   Emu(int(n["h"] * EMU)))
                    pic.name = f"{n['name']} — clic derecho > Cambiar imagen"
                elif t == "logo":
                    shp = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE,
                                                 Emu(int(n["x"] * EMU)), Emu(int(n["y"] * EMU)),
                                                 Emu(int(n["w"] * EMU)), Emu(int(n["h"] * EMU)))
                    shp.fill.background()
                    shp.line.color.rgb = rgb(n.get("tone", "tinta"))
                    shp.line.width = Pt(1)
                    shp.line.dash_style = MSO_LINE.DASH
                    shp.shadow.inherit = False
                    shp.name = "Logo (reemplazar)"
                    tb = slide.shapes.add_textbox(Emu(int(n["x"] * EMU)), Emu(int(n["y"] * EMU)),
                                                  Emu(int(n["w"] * EMU)), Emu(int(n["h"] * EMU)))
                    tf = tb.text_frame
                    tf.word_wrap = False
                    tf.auto_size = MSO_AUTO_SIZE.NONE
                    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
                    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
                    p = tf.paragraphs[0]
                    p.alignment = PP_ALIGN.CENTER
                    r = p.add_run()
                    r.text = "TU LOGO"
                    r.font.size = Pt(max(9, round(n["h"] * 0.30)) * 0.75)
                    r.font.name = FAMILY_PPT["semi"]
                    r.font.color.rgb = rgb(n.get("tone", "tinta"))
                    tb.name = "Logo texto"
                elif t == "text":
                    size = n["size"]
                    lineas = n["lines"]
                    if len(lineas) > 1:
                        L = lineas[1][1] - lineas[0][1]
                    else:
                        L = size * n.get("lh", 1.2)
                    # PowerPoint ubica la linea base al 73,7% de la altura de linea
                    top = lineas[0][1] - 0.737 * L
                    wbox = n.get("w") or 200
                    if n["anchor"] == "middle":
                        left = n["x"] - wbox / 2
                        align = PP_ALIGN.CENTER
                    elif n["anchor"] == "end":
                        left = n["x"] - wbox
                        align = PP_ALIGN.RIGHT
                    else:
                        left = n["x"]
                        align = PP_ALIGN.LEFT
                    tb = slide.shapes.add_textbox(Emu(int(left * EMU)), Emu(int(top * EMU)),
                                                  Emu(int(wbox * EMU)),
                                                  Emu(int((len(lineas) * L + size * 0.6) * EMU)))
                    tf = tb.text_frame
                    tf.word_wrap = False
                    tf.auto_size = MSO_AUTO_SIZE.NONE
                    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
                    tf.vertical_anchor = MSO_ANCHOR.TOP
                    for i, (s_line, _y) in enumerate(lineas):
                        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
                        p.alignment = align
                        p.line_spacing = Pt(L * 0.75)
                        p.space_before = Pt(0)
                        p.space_after = Pt(0)
                        r = p.add_run()
                        r.text = s_line
                        r.font.size = Pt(size * 0.75)
                        r.font.name = FAMILY_PPT[n["fam"]]
                        r.font.bold = bool(n.get("bold"))
                        r.font.color.rgb = rgb(n["color"])
                        if n["ls"]:
                            r.font._rPr.set("spc", str(int(round(n["ls"] * size * 0.75 * 100))))
                    tb.name = n.get("name") or ("Texto: " + lineas[0][0][:28])
        txt = "\n".join(sc.notes)
        if txt:
            slide.notes_slide.notes_text_frame.text = txt
    prs.core_properties.title = titulo
    prs.core_properties.author = "Equipo de campaña"
    prs.core_properties.subject = "Plantillas editables por capas"
    prs.save(str(out_path))


# --------------------------------------------------------------------------
# 8. IMÁGENES DE APOYO
# --------------------------------------------------------------------------

PH_CACHE = {}


def placeholder_image(w, h):
    """Foto de ejemplo con la proporción exacta del marco (para PPTX)."""
    key = (int(w), int(h))
    if key in PH_CACHE:
        return PH_CACHE[key]
    scale = 1000 / max(w, h)
    W, H = max(2, int(w * scale)), max(2, int(h * scale))
    img = Image.new("RGB", (W, H), (228, 217, 200))
    d = ImageDraw.Draw(img)
    m = min(W, H)
    cx, cy = W * 0.5, H * 0.40
    r = m * 0.115
    tone = (203, 187, 163)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=tone)
    d.ellipse([cx - m * 0.29, cy + r * 0.72, cx + m * 0.29, cy + r * 0.72 + m * 0.92], fill=tone)
    fs = max(9, int(m * 0.040))
    f = ImageFont.truetype(str(WIN_FONTS / "seguisb.ttf"), fs)
    f2 = ImageFont.truetype(str(WIN_FONTS / "segoeui.ttf"), max(7, int(fs * 0.72)))
    label, sub = "FOTO DEL CANDIDATO", "reemplazar imagen"
    for txt, fnt, yy, col in ((label, f, H * 0.845, (128, 116, 99)),
                              (sub, f2, H * 0.845 + fs * 1.5, (156, 145, 128))):
        tw = d.textlength(txt, font=fnt)
        d.text(((W - tw) / 2, yy), txt, font=fnt, fill=col)
    out = BUILD / "ph" / f"ph_{key[0]}x{key[1]}.jpg"
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, quality=92)
    PH_CACHE[key] = out
    return out


def make_asset_photo():
    """Foto de ejemplo cuadrada: se recorta parejo en formatos verticales y apaisados."""
    ASSETS.mkdir(parents=True, exist_ok=True)
    W = H = 1500
    img = Image.new("RGB", (W, H), (229, 218, 201))
    d = ImageDraw.Draw(img)
    tone = (200, 184, 160)
    cx = W * 0.5
    cy, r = H * 0.40, W * 0.135
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=tone)
    d.ellipse([cx - W * 0.30, cy + r * 0.80, cx + W * 0.30, cy + r * 0.80 + W * 0.74], fill=tone)
    img.save(ASSETS / "foto-candidato.jpg", quality=92)


def contacto(previews):
    """Hoja de contactos con todas las plantillas."""
    cols, cell_w, cell_h, pad = 4, 560, 660, 40
    rows = (len(previews) + cols - 1) // cols
    W = cols * cell_w + pad * 2
    H = rows * cell_h + pad * 2 + 90
    sheet = Image.new("RGB", (W, H), (15, 27, 38))
    d = ImageDraw.Draw(sheet)
    f = ImageFont.truetype(str(WIN_FONTS / "ariblk.ttf"), 44)
    fl = ImageFont.truetype(str(WIN_FONTS / "seguisb.ttf"), 24)
    d.text((pad, 26), "PLANTILLAS DE CANDIDATURA · VISTA GENERAL", font=f, fill=(246, 241, 232))
    for i, (path, label) in enumerate(previews):
        r, c = divmod(i, cols)
        x0 = pad + c * cell_w
        y0 = pad + 90 + r * cell_h
        im = Image.open(path).convert("RGB")
        im.thumbnail((cell_w - 70, cell_h - 110), Image.LANCZOS)
        box_x = x0 + (cell_w - 70 - im.width) // 2 + 20
        box_y = y0 + (cell_h - 110 - im.height) // 2
        d.rectangle([box_x - 1, box_y - 1, box_x + im.width, box_y + im.height],
                    outline=(60, 76, 92))
        sheet.paste(im, (box_x, box_y))
        d.text((x0 + 20, y0 + cell_h - 66), label, font=fl, fill=(226, 84, 44))
    out = PNG_DIR / "00_hoja_de_contactos.png"
    sheet.save(out)
    return out


def comparativa_paletas(scene_fn, path):
    ims = []
    global P
    base = dict(P)
    for name in ("institucional", "verde", "rojo", "azul"):
        P = dict(PALETAS[name])
        sc = scene_fn()
        tmp_svg = BUILD / f"pal_{name}.svg"
        tmp_svg.write_text(scene_svg(sc, name), encoding="utf-8")
        tmp_png = BUILD / f"pal_{name}.png"
        svg_to_png(tmp_svg, tmp_png, sc.w, sc.h)
        ims.append(Image.open(tmp_png).convert("RGB"))
    P = base
    tw = 420
    ims = [im.resize((tw, int(tw * im.height / im.width)), Image.LANCZOS) for im in ims]
    gap = 24
    H = ims[0].height + 74
    W = tw * 4 + gap * 5
    canvas = Image.new("RGB", (W, H), (15, 27, 38))
    d = ImageDraw.Draw(canvas)
    f = ImageFont.truetype(str(WIN_FONTS / "seguisb.ttf"), 22)
    names = ["INSTITUCIONAL", "VERDE", "ROJO", "AZUL"]
    for i, (im, nm) in enumerate(zip(ims, names)):
        x = gap + i * (tw + gap)
        canvas.paste(im, (x, 22))
        d.text((x, 22 + im.height + 14), nm, font=f, fill=(246, 241, 232))
    canvas.save(path)
    return path


# --------------------------------------------------------------------------
# 9. MAIN
# --------------------------------------------------------------------------


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--paleta", default="institucional", choices=list(PALETAS))
    ap.add_argument("--sin-pptx", action="store_true")
    args = ap.parse_args()

    global P
    P = dict(PALETAS[args.paleta])
    for d in (SVG_DIR, PNG_DIR, PPTX_DIR, ASSETS, BUILD):
        d.mkdir(parents=True, exist_ok=True)
    make_asset_photo()

    scenes = [fn() for fn in TEMPLATES]
    previews = []
    for sc in scenes:
        svg = SVG_DIR / f"{sc.key}.svg"
        svg.write_text(scene_svg(sc, args.paleta), encoding="utf-8")
        png = PNG_DIR / f"{sc.key}.png"
        svg_to_png(svg, png, sc.w, sc.h)
        previews.append((png, f"{sc.titulo}"))
        print(f"  OK  {svg.name}  ->  {png.name}")

    if not args.sin_pptx:
        grupos = {
            "01_post_cuadrado": [scenes[0]],
            "02_story_vertical": [scenes[1]],
            "03_volante_A4": [scenes[2], scenes[3]],
            "04_portada_facebook": [scenes[4]],
            "05_tarjeta_presentacion": [scenes[5], scenes[6]],
            "06_afiche_A3": [scenes[7]],
        }
        for key, grupo in grupos.items():
            out = PPTX_DIR / f"{key}.pptx"
            build_pptx(grupo, out, grupo[0].titulo)
            print(f"  OK  {out.name}")

    # la leyenda de la hoja de contactos se acorta
    cortos = [(png, ETIQUETAS[sc.key]) for sc, (png, _t) in zip(scenes, previews)]
    cs = contacto(cortos)
    print(f"  OK  {cs.name}")

    cmp = comparativa_paletas(t_post, PNG_DIR / "00b_comparativa_paletas.png")
    print(f"  OK  {cmp.name}")

    # limpieza: el kit queda sin archivos temporales
    for carpeta in (BUILD / "edge-profile", BUILD / "ph"):
        shutil.rmtree(carpeta, ignore_errors=True)
    for f in BUILD.glob("pal_*"):
        f.unlink(missing_ok=True)


if __name__ == "__main__":
    sys.exit(main())
