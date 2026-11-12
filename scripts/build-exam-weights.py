# -*- coding: utf-8 -*-
"""Agregă „Pagini eligibile.csv” (proiectul Grile rezidentiat) pe temele din plan.json.
Ieșire: src/data/organizare/examWeights.json — doar cifre (fără text de subiecte reale).
  python -X utf8 scripts/build-exam-weights.py "<folder Grile rezidentiat>"
Potrivire: carte + număr de capitol + pagina din fișierul capitolului (pagina_extras) în intervalul „pdf” al temei.
Dacă o pagină cade în mai multe teme (intervale suprapuse), ponderea se împarte egal."""
import csv, json, re, sys, os

AICI = os.path.dirname(os.path.abspath(__file__))
RADACINA = os.path.dirname(AICI)
PLAN = os.path.join(RADACINA, "src", "data", "organizare", "plan.json")
OUT = os.path.join(RADACINA, "src", "data", "organizare", "examWeights.json")
CARTE = {"K": "Kumar", "L": "Lawrence", "S": "Sinopsis"}


def interval(pdf):
    m = re.match(r"^(\d+)(?:-(\d+))?$", str(pdf).strip())
    if not m:
        return None
    a = int(m.group(1))
    return a, int(m.group(2) or a)


def capitol(cap):
    m = re.search(r"Cap\.\s*(\d+)", cap)
    return int(m.group(1)) if m else None


def main(src):
    plan = json.load(open(PLAN, encoding="utf-8"))
    rows = list(csv.DictReader(open(os.path.join(src, "Date", "Tabele", "Pagini eligibile.csv"), encoding="utf-8-sig")))
    topics = []
    for i, t in enumerate(plan["ch"]):
        iv = interval(t["pdf"])
        topics.append((i, CARTE[t["b"]], capitol(t["cap"]), iv))
    w = {}
    total = matched = 0.0
    for r in rows:
        n = int(r["n_grile"])
        total += n
        pg, cap = int(r["pagina_extras"]), int(r["cap"])
        hit = [i for i, c, k, iv in topics if c == r["carte"] and k == cap and iv and iv[0] <= pg <= iv[1]]
        if not hit:
            continue
        matched += n
        for i in hit:
            e = w.setdefault(i, {"n": 0.0, "y": 0, "hot": 0})
            e["n"] += n / len(hit)
            e["y"] = max(e["y"], int(r["n_ani"]))
            e["hot"] += 1 if r["fierbinte"] == "True" else 0
    out = {str(i): {"n": round(e["n"], 2), "y": e["y"], "hot": e["hot"]} for i, e in sorted(w.items())}
    json.dump({"src": {str(i): plan["ch"][i]["src"] for i in w}, "w": out}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(f"{int(matched)} din {int(total)} grile potrivite pe {len(out)} din {len(topics)} teme -> {OUT}")


if __name__ == "__main__":
    main(sys.argv[1])
