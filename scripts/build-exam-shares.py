# -*- coding: utf-8 -*-
"""Cât din examen cade pe fiecare specialitate (cifre agregate pe cele 1200 de grile reale 2021–2025).
Citește „Pagini eligibile.csv” din proiectul Grile rezidentiat, adună grilele pe (carte, capitol) și le grupează pe
specialități. Ieșire: src/data/rezidentiat/examShares.json — doar numere și cuvinte-cheie, fără text de subiecte.

  python -X utf8 scripts/build-exam-shares.py "<folder Grile rezidentiat>"
"""
import csv
import json
import os
import sys
from collections import Counter, defaultdict

AICI = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(AICI), "src", "data", "rezidentiat", "examShares.json")

# (carte, capitol) -> specialitate. Cuvintele-cheie potrivesc numele specialităților din băncile de grile ale aplicației.
FAMILY = {
    ("Kumar", 8): "Boli infecțioase", ("Kumar", 37): "Boli infecțioase",
    ("Kumar", 9): "Nefrologie", ("Kumar", 36): "Nefrologie",
    ("Kumar", 10): "Terapie intensivă",
    ("Kumar", 16): "Hematologie", ("Kumar", 18): "Reumatologie", ("Kumar", 21): "Endocrinologie",
    ("Kumar", 23): "Diabet", ("Kumar", 26): "Neurologie", ("Kumar", 28): "Pneumologie",
    ("Kumar", 29): "Boală venoasă tromboembolică",
    ("Kumar", 30): "Cardiologie", ("Kumar", 31): "Cardiologie",
    ("Kumar", 32): "Gastroenterologie și hepatologie", ("Kumar", 34): "Gastroenterologie și hepatologie",
    ("Lawrence", 1): "Chirurgie generală", ("Lawrence", 4): "Chirurgie generală", ("Lawrence", 8): "Chirurgie generală",
    ("Lawrence", 9): "Chirurgie generală", ("Lawrence", 10): "Chirurgie generală", ("Lawrence", 11): "Chirurgie generală",
    ("Lawrence", 12): "Chirurgie digestivă", ("Lawrence", 13): "Chirurgie digestivă", ("Lawrence", 14): "Chirurgie digestivă",
    ("Lawrence", 15): "Chirurgie digestivă", ("Lawrence", 16): "Chirurgie digestivă", ("Lawrence", 17): "Chirurgie digestivă",
    ("Lawrence", 20): "Chirurgie digestivă",
    ("Lawrence", 26): "Chirurgie vasculară", ("Lawrence", 27): "ORL", ("Lawrence", 28): "Ortopedie", ("Lawrence", 29): "Urologie",
    ("Sinopsis", 9): "Dermatologie", ("Sinopsis", 10): "Pediatrie",
    ("Sinopsis", 12): "Obstetrică și ginecologie", ("Sinopsis", 13): "Obstetrică și ginecologie",
    ("Sinopsis", 14): "Psihiatrie", ("Sinopsis", 15): "Epidemiologie și etică",
}
# Cuvinte (fără diacritice, litere mici) căutate în numele unei specialități din banca aplicației.
KEYWORDS = {
    "Boli infecțioase": ["boli infectioase", "infectii", "sepsis", "transmisibile", "hiv"],
    "Nefrologie": ["nefrolog", "renale", "hidro electrolitic", "hidro-electrolitic"],
    "Terapie intensivă": ["terapie intensiva", "reanimare"],
    "Hematologie": ["hematolog"],
    "Reumatologie": ["reumatolog"],
    "Endocrinologie": ["endocrin"],
    "Diabet": ["diabet"],
    "Neurologie": ["neurolog"],
    "Pneumologie": ["pneumolog"],
    "Boală venoasă tromboembolică": ["tromboembol"],
    "Cardiologie": ["cardiolog", "hipertensiun"],
    "Gastroenterologie și hepatologie": ["gastro", "hepat"],
    "Chirurgie generală": ["chirurgie generala", "perioperator", "infectiile chirurgicale", "sangerarile", "arsurile"],
    "Chirurgie digestivă": ["viscerala", "digestiva", "esofag", "stomacul", "intestin", "colon", "biliare", "pancreas", "ficatul", "herni"],
    "Chirurgie vasculară": ["vascular"],
    "ORL": ["orl", "otorino"],
    "Ortopedie": ["ortoped", "traumatolog"],
    "Urologie": ["urolog", "tractului urinar"],
    "Dermatologie": ["dermatolog"],
    "Pediatrie": ["pediatrie"],
    "Obstetrică și ginecologie": ["obstetric", "ginecolog"],
    "Psihiatrie": ["psihiatr"],
    "Epidemiologie și etică": ["epidemiolog", "etica", "sanatate publica"],
}


def main(src):
    rows = list(csv.DictReader(open(os.path.join(src, "Date", "Tabele", "Pagini eligibile.csv"), encoding="utf-8-sig")))
    per = Counter()
    total = 0
    for r in rows:
        n = int(r["n_grile"])
        total += n
        family = FAMILY.get((r["carte"], int(r["cap"])))
        if family:
            per[family] += n
    missing = total - sum(per.values())
    out = {
        "total": total,
        "unmapped": missing,
        "families": [
            {"name": name, "keywords": KEYWORDS[name], "questions": per[name]}
            for name in sorted(per, key=lambda k: -per[k])
        ],
    }
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{sum(per.values())} din {total} grile pe {len(per)} specialități -> {OUT}")
    for f in out["families"]:
        print(f"  {f['name']}: {f['questions']} ({f['questions'] * 200 / total:.1f} din 200)")


if __name__ == "__main__":
    main(sys.argv[1])
