import type { ComponentType } from 'react';
import { AssistantVisual, ExamVisual, FinishVisual, FlashcardVisual, IntroVisual, PlanVisual, QuizVisual } from './sceneVisuals';

export interface FilmScene {
  id: string;
  kicker: string;
  title: string;
  text: string;
  /** Cât durează scena înainte să treacă singură la următoarea. */
  durationMs: number;
  Visual: ComponentType;
}

export const FILM_SCENES: FilmScene[] = [
  {
    id: 'intro',
    kicker: 'Bun venit',
    title: 'Aici începe pregătirea ta',
    text: 'Ce înveți azi? Cursurile, grilele, cardurile și planul tău se întâlnesc într-un singur loc.',
    durationMs: 6000,
    Visual: IntroVisual,
  },
  {
    id: 'quiz',
    kicker: 'Grile',
    title: 'Exersezi ca la examen',
    text: 'Creezi sau imporți grile, alegi un răspuns și citești explicația. Fiecare greșeală îți arată ce merită repetat.',
    durationMs: 10000,
    Visual: QuizVisual,
  },
  {
    id: 'cards',
    kicker: 'Flashcarduri',
    title: 'Repetarea care se adaptează',
    text: 'Transformi ideea într-un card. Îl întorci, alegi Greu, Bine sau Ușor, iar următoarea repetare se adaptează.',
    durationMs: 9000,
    Visual: FlashcardVisual,
  },
  {
    id: 'ai',
    kicker: 'Biblioteca AI și chat',
    title: 'Un asistent care citește cărțile tale',
    text: 'După indexarea cursului, întrebi în română și verifici pasajul citat. AI-ul are nevoie de o cheie configurată în Setări.',
    durationMs: 12000,
    Visual: AssistantVisual,
  },
  {
    id: 'plan',
    kicker: 'Rezidențiat și Organizare',
    title: 'Un plan până la examen',
    text: 'Alegi data examenului. Patru treceri, topicuri pe săptămâni și o sarcină pentru azi îți dau un ritm clar.',
    durationMs: 10000,
    Visual: PlanVisual,
  },
  {
    id: 'exam',
    kicker: 'Simulare și Caiet de erori',
    title: 'Vezi unde mai ai de lucrat',
    text: 'Simularea îți arată unde mai ai de lucrat. Revii la explicații și exersezi greșelile într-un test scurt.',
    durationMs: 9000,
    Visual: ExamVisual,
  },
  {
    id: 'finish',
    kicker: 'Gata de start',
    title: 'Hai să începem',
    text: 'Începi cu ce ai de făcut azi. Pip și butonul „?” te ajută; acum îți arăt unde găsești fiecare lucru.',
    durationMs: 4000,
    Visual: FinishVisual,
  },
];
