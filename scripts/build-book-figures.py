# -*- coding: utf-8 -*-
"""Completează textul cărților din aplicație cu „unitățile speciale” din proiectul Grile rezidentiat:
etichetele schemelor și algoritmilor, legendele figurilor, titlurile cadranelor și casetelor, notele de subsol
și casetele „De reținut”. PDF-ul din aplicație le pierde (sunt text din imagini); proiectul-sursă le-a extras
pagină cu pagină, iar examenul întreabă și din ele (scheme, cadrane, note).

Ieșire: src/data/rezidentiat/library/figures.json  {"K": {"<pagina din PDF>": "text"}, "L": {...}, "S": {...}}
Se adaugă doar ce lipsește din textul paginii din aplicație și trece de filtrul de vocabular (fără resturi OCR).
Numerotarea paginilor e aceea din `*.pages.json` (aceeași ca în extrasul sursei; verificat pe 781 de unități).

  python -X utf8 scripts/build-book-figures.py "<folder Grile rezidentiat>"
"""
import json
import os
import re
import sys
import unicodedata
from collections import Counter

AICI = os.path.dirname(os.path.abspath(__file__))
LIB = os.path.join(os.path.dirname(AICI), "src", "data", "rezidentiat", "library")
OUT = os.path.join(LIB, "figures.json")
CODE = {"kumar": "K", "lawrence": "L", "sinopsis": "S"}
MIN_WORDS = 3
VOCAB_SHARE = 0.75  # cel puțin atât din cuvintele de ≥4 litere trebuie să existe în carte
WATERMARK = re.compile(r"rezidentiat|grile rezi|wolters|hipocrate|©", re.I)


def fold(text):
    text = text.replace("­", "").lower()
    text = unicodedata.normalize("NFD", text)
    return "".join(c for c in text if not unicodedata.combining(c))


def tokens(text):
    return re.findall(r"[a-z0-9]+", fold(text))


def comma_diacritics(text):
    return (
        text.replace("­", "")
        .replace("ş", "ș").replace("Ş", "Ș").replace("ţ", "ț").replace("Ţ", "Ț")
    )


def tidy(text):
    text = comma_diacritics(text)
    text = re.sub(r"\s*\|\s*", "; ", text)
    text = re.sub(r"\s*\n\s*", " ", text)
    return re.sub(r"\s{2,}", " ", text).strip(" ;")


def main(src):
    pages = {}
    vocab = {}
    for name, code in CODE.items():
        raw = json.load(open(os.path.join(LIB, name + ".pages.json"), encoding="utf-8"))
        pages[code] = [" ".join(tokens(p)) for p in raw]
        vocab[code] = Counter(w for p in pages[code] for w in p.split())
    units = [json.loads(l) for l in open(os.path.join(src, "Date", "Tabele", "Unitati speciale.jsonl"), encoding="utf-8")]
    out = {"K": {}, "L": {}, "S": {}}
    stats = Counter()
    for u in units:
        code = CODE[u["carte"]]
        text = tidy(u["text"])
        words = tokens(text)
        stats["total"] += 1
        if len(words) < MIN_WORDS or WATERMARK.search(text):
            stats["scurt/filigran"] += 1
            continue
        page = int(u["pdf_page"])
        if page < 1 or page > len(pages[code]):
            stats["în afara paginilor"] += 1
            continue
        if " ".join(words) in pages[code][page - 1]:
            stats["deja în pagină"] += 1
            continue
        long_words = [w for w in words if len(w) >= 4 and not w.isdigit()]
        if long_words:
            share = sum(1 for w in long_words if vocab[code][w] >= 2) / len(long_words)
            if share < VOCAB_SHARE:
                stats["resturi OCR"] += 1
                continue
        bucket = out[code].setdefault(str(page), [])
        if text not in bucket:
            bucket.append(text)
            stats["adăugat"] += 1
    final = {code: {p: "\n".join(items) for p, items in sorted(d.items(), key=lambda kv: int(kv[0]))} for code, d in out.items()}
    json.dump(final, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(dict(stats))
    print({c: len(d) for c, d in final.items()}, "pagini cu completări ->", OUT)


if __name__ == "__main__":
    main(sys.argv[1])
