"""Regenerate bundled Romanian intro narration; requires edge-tts and mutagen."""
import asyncio
import json
from pathlib import Path

import edge_tts
from mutagen.mp3 import MP3

ROOT = Path(__file__).resolve().parent.parent
SCENES = {
    "intro": "Bun venit în Study X. Din cursurile tale, construiești o pregătire clară, pas cu pas, până la examen.",
    "quiz": "Începi cu grile. Le creezi, le imporți sau le generezi din materialele tale. Alegi modul de studiu și înțelegi fiecare răspuns prin explicații.",
    "cards": "Transformi ideile importante în flashcarduri. Repetarea se adaptează la răspunsurile tale, iar noțiunile dificile revin când ai nevoie de ele.",
    "ai": "În biblioteca A I, adaugi cursurile și aștepți pregătirea lor. Apoi pui întrebări în română și verifici sursele indicate. Tu păstrezi controlul asupra fiecărei generări.",
    "plan": "Pentru rezidențiat, urmărești materia și trecerile prin ea. Organizarea îți arată ce urmează, astfel încât fiecare zi să aibă un obiectiv realist.",
    "exam": "Testezi pregătirea într-o simulare. Rezultatele arată progresul, iar caietul de erori te ajută să revii exact la ceea ce merită consolidat.",
    "finish": "Hai să începem. Semnul întrebării îți oferă explicații și ghiduri, ori de câte ori ai nevoie.",
}


async def main():
    output = ROOT / "public" / "audio" / "intro"
    output.mkdir(parents=True, exist_ok=True)
    manifest = []
    for scene, text in SCENES.items():
        destination = output / f"{scene}.mp3"
        await edge_tts.Communicate(text, "ro-RO-AlinaNeural", rate="+8%").save(str(destination))
        duration = round(MP3(destination).info.length * 1000)
        manifest.append({"id": scene, "text": text, "durationMs": duration})
        print(f"{scene}: {duration} ms", flush=True)
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    asyncio.run(main())
