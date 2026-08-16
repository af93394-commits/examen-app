#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Extrae preguntas + opciones + clave de PDFs con capa de texto (OCR) para el modulo PreICFES Varios.

Uso:
  python extraer_pdf.py CUADERNILLO.pdf [CLAVE.pdf] [-o salida.json]

Reglas:
- Solo usa la capa de texto del PDF (pymupdf). Si el PDF es escaneado (sin texto)
  reporta tiene_texto=false y NO se importa: el usuario debe aplicarle OCR primero.
- Detecta la clave en el propio cuadernillo (secciones "RESPUESTAS"/"CLAVE") o en
  un PDF de claves separado. Tambien detecta letras pintadas de rojo a color.
- El texto se entrega TAL CUAL del PDF (regla AGENTS.md: 100% identico al original).
"""
import sys
import json
import re
import argparse

try:
    import fitz  # pymupdf
except ImportError:
    sys.stderr.write("ERROR: falta pymupdf. Instalar: pip install pymupdf\n")
    sys.exit(2)

RE_PREG = re.compile(r'^\s*(\d{1,3})\s*[\.\)]\s*(.*?)\s*$')
RE_OPC = re.compile(r'^\s*([A-D])\s*[\.\)]\s*(.*?)\s*$')
RE_CLAVE = re.compile(r'^\s*(\d{1,3})\s*[\.\:\-\)]?\s*([A-D])\s*$')
RE_CLAVE2 = re.compile(r'^CLAVE\s*$|^RESPUESTAS\s*$|^RESPUESTA\s*$', re.IGNORECASE)


def es_rojo(color):
    r, g, b = color & 0xFF, (color >> 8) & 0xFF, (color >> 16) & 0xFF
    return r > 140 and g < 100 and b < 100


def texto_paginas(doc):
    paginas = []
    for page in doc:
        paginas.append(page.get_text("text"))
    return paginas


def detectar_letras_rojas(doc, por_pagina):
    rojas = {}
    for i, page in enumerate(doc):
        d = page.get_text("dict")
        for block in d.get("blocks", []):
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    if es_rojo(span.get("color", 0)):
                        t = span["text"].strip()
                        if re.fullmatch(r'[A-D]', t):
                            rojas[t] = rojas.get(t, 0) + 1
    return rojas


def parsear_cuadernillo(page_texts):
    preguntas = []
    actual = None
    pasaje_actual = []
    pasajes = []
    en_clave = False
    clave = {}

    for texto in page_texts:
        for linea_raw in texto.splitlines():
            linea = linea_raw.rstrip()
            if not linea.strip():
                continue
            if RE_CLAVE2.match(linea.strip()):
                en_clave = True
                continue
            if en_clave:
                m = RE_CLAVE.match(linea)
                if m and int(m.group(1)) <= 500:
                    clave[int(m.group(1))] = m.group(2).upper()
                    continue
                m2 = RE_CLAVE2.match(linea.strip())
                if not m2 and RE_PREG.match(linea):
                    en_clave = False
            m = RE_PREG.match(linea)
            if m:
                n = int(m.group(1))
                cuerpo = m.group(2).strip()
                if actual is not None and not actual["opciones"] and n != actual["n"]:
                    actual["texto"] += " " + linea_raw.strip()
                    continue
                if actual is not None and n <= 500 and (n == actual["n"] or n == actual["n"] + 1 or (len(preguntas) > 0 and n == preguntas[-1]["n"] + 1)):
                    pass
                actual = {"n": n, "texto": cuerpo, "opciones": {}, "respuesta": None,
                          "texto_lectura": None, "notas": []}
                preguntas.append(actual)
                continue
            m = RE_OPC.match(linea)
            if m and actual is not None and actual["texto"]:
                actual["opciones"][m.group(1).upper()] = m.group(2).strip()
                continue
            if actual is not None and actual["opciones"]:
                ult = list(actual["opciones"].keys())[-1]
                actual["opciones"][ult] += " " + linea_raw.strip()
            elif actual is not None:
                actual["texto"] += " " + linea_raw.strip()
            else:
                pasaje_actual.append(linea_raw.strip())

    return preguntas, clave, pasajes


def main():
    ap = argparse.ArgumentParser(description="Extraccion de preguntas desde PDF con OCR.")
    ap.add_argument("cuadernillo")
    ap.add_argument("clave", nargs="?", default=None)
    ap.add_argument("-o", "--output", default=None)
    args = ap.parse_args()

    doc = fitz.open(args.cuadernillo)
    pages = texto_paginas(doc)
    total_texto = "".join(pages)
    tiene_texto = bool(total_texto.strip())

    if not tiene_texto:
        print(json.dumps({"archivo": args.cuadernillo, "tiene_texto": False,
                          "paginas": doc.page_count, "detalle": "PDF escaneado sin capa de texto"})),
        sys.exit(0)

    preguntas, clave_interna, _pasajes = parsear_cuadernillo(pages)

    rojas = detectar_letras_rojas(doc, None)
    if len(rojas) >= 1 and len(rojas) <= 4:
        for p in preguntas:
            if p["respuesta"] is None:
                candidatas = [l for l in p["opciones"].keys() if l in rojas]
                if len(candidatas) == 1:
                    p["respuesta"] = candidatas[0]
                    p["notas"].append("clave por letra pintada en rojo")

    sin_clave_interna = {}
    for p in preguntas:
        if p["respuesta"] is None and p["n"] in clave_interna:
            p["respuesta"] = clave_interna[p["n"]]
        if p["respuesta"] is None:
            sin_clave_interna[p["n"]] = True

    if args.clave:
        clave_doc = fitz.open(args.clave)
        for page_text in texto_paginas(clave_doc):
            for linea in page_text.splitlines():
                m = RE_CLAVE.match(linea)
                if m:
                    clave_interna[int(m.group(1))] = m.group(2).upper()
        for p in preguntas:
            if p["respuesta"] is None and p["n"] in clave_interna:
                p["respuesta"] = clave_interna[p["n"]]

    salida = {
        "archivo": args.cuadernillo,
        "tiene_texto": True,
        "paginas": doc.page_count,
        "preguntas": preguntas,
        "sin_clave": [p["n"] for p in preguntas if p["respuesta"] is None],
        "clave_letras_rojas": {k: v for k, v in sorted(rojas.items())},
    }
    resumen = {
        "archivo": args.cuadernillo,
        "tiene_texto": True,
        "preguntas_detectadas": len(preguntas),
        "con_clave": sum(1 for p in preguntas if p["respuesta"] is not None),
        "sin_clave": len(salida["sin_clave"]),
        "paginas": doc.page_count,
    }
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(salida, f, ensure_ascii=False, indent=1)
    print(json.dumps(resumen, ensure_ascii=False))
    if salida["sin_clave"]:
        sys.stderr.write("SIN CLAVE: %s preguntas sin respuesta identificada\n" % len(salida["sin_clave"]))


if __name__ == "__main__":
    main()