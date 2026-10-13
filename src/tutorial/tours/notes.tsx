import { StickyNote, Search, BookOpen, Sparkles } from 'lucide-react';
import type { TourDefinition } from '../types';

export const notesTour: TourDefinition = {
  id: 'notes', title: 'Notițele mele',
  steps: [
    {
      id: 'notes-intro', title: 'Păstrează explicațiile tale',
      body: (ctx) => ctx.quizCount === 0
        ? 'Notițele sunt legate de întrebările din grile. Adaugă o grilă și salvează o notiță după ce răspunzi; aici vei putea reveni la explicațiile tale. Notițele unei grile șterse pot rămâne în listă.'
        : 'Aici găsești notițele salvate la întrebările din grile, grupate după grila de origine. Dacă lista este goală, salvează prima notiță în timpul unei grile, după ce răspunzi.',
      icon: <StickyNote size={22} />, placement: 'center', route: '/notes',
    },
    {
      id: 'notes-search', title: 'Găsește ce ai notat',
      body: 'Căutarea verifică textul notiței, întrebarea și titlul grilei. Când sunt mai multe grile, filtrul de lângă titlul unui grup îți arată doar notițele acelui grup. Poți șterge căutarea și filtrul pentru a vedea din nou totul.',
      icon: <Search size={22} />, target: '[data-tutorial="notes-search"]',
      placement: 'bottom', optional: true, route: '/notes',
    },
    {
      id: 'notes-entry', title: 'Revino la întrebarea de origine',
      body: 'Fiecare notiță păstrează textul tău și, când grila mai există, întrebarea și un link către grilă. Ștergerea unei notițe cere confirmare. Ghidul nu șterge și nu modifică notițe.',
      icon: <BookOpen size={22} />, target: '[data-tutorial="notes-entry"]',
      placement: 'bottom', optional: true, route: '/notes',
    },
    {
      id: 'notes-ai', title: 'Transformă notițele în material de studiu',
      body: (ctx) => ctx.aiReady
        ? 'Cu un furnizor AI configurat, Grilă AI și AI Flashcarduri folosesc notițele din lista filtrată. Cererea pornește când apeși tu și creează un set nou; verifică materialul generat înainte de studiu.'
        : 'Poți citi și căuta notițele fără AI. Pentru a transforma lista filtrată într-o grilă sau în flashcarduri, configurează un furnizor în Setări › AI. Generarea pornește doar când alegi tu.',
      icon: <Sparkles size={22} />, placement: 'center', route: '/notes',
    },
  ],
};
