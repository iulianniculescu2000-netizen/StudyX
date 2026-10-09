import type { ReactNode } from 'react';
import { AssistantVisual, ExamVisual, FinishVisual, FlashcardVisual, IntroVisual, PlanVisual, QuizVisual } from './sceneVisuals';

export interface FilmScene {
  id: string;
  kicker: string;
  title: string;
  text: string;
  /** Cât durează scena înainte să treacă singură la următoarea. */
  durationMs: number;
  Visual: () => ReactNode;
}

export const FILM_SCENES: FilmScene[] = [
  {
    id: 'intro',
    kicker: 'Bun venit',
    title: 'Aici începe pregătirea ta',
    text: 'StudyX strânge într-un singur loc grilele, flashcardurile, cărțile și planul tău pentru rezidențiat.',
    durationMs: 5200,
    Visual: IntroVisual,
  },
  {
    id: 'quiz',
    kicker: 'Grile',
    title: 'Exersezi ca la examen',
    text: 'Creezi grile, le imporți sau le generezi din cursurile tale. Primești explicații după fiecare răspuns.',
    durationMs: 6200,
    Visual: QuizVisual,
  },
  {
    id: 'cards',
    kicker: 'Flashcarduri',
    title: 'Repetarea care se adaptează',
    text: 'Ce știi bine îl vezi tot mai rar, ce greșești revine curând. Studiezi puțin în fiecare zi, nu mult odată.',
    durationMs: 6200,
    Visual: FlashcardVisual,
  },
  {
    id: 'ai',
    kicker: 'Biblioteca AI și chat',
    title: 'Un asistent care citește cărțile tale',
    text: 'Încarci cursurile, ceri în română ce ai nevoie, iar răspunsul arată din ce pagină vine.',
    durationMs: 7000,
    Visual: AssistantVisual,
  },
  {
    id: 'plan',
    kicker: 'Rezidențiat și Organizare',
    title: 'Un plan până la examen',
    text: 'Patru treceri prin materie, topicuri pe săptămâni și zilele rămase, mereu la vedere.',
    durationMs: 6200,
    Visual: PlanVisual,
  },
  {
    id: 'exam',
    kicker: 'Simulare și Caiet de erori',
    title: 'Vezi unde mai ai de lucrat',
    text: 'Un examen de probă cu ceas și penalizare, apoi un caiet care adună greșelile tale până le fixezi.',
    durationMs: 6200,
    Visual: ExamVisual,
  },
  {
    id: 'finish',
    kicker: 'Gata de start',
    title: 'Hai să începem',
    text: 'Îți arăt pe scurt unde e fiecare lucru. Oricând apeși „?”, găsești un răspuns sau un mic ghid.',
    durationMs: 6000,
    Visual: FinishVisual,
  },
];
