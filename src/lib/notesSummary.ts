import { plural } from './plural';

/**
 * Subtitlul paginii Notițe: „3 notițe din 2 grile · 1 schemă”. Schemele salvate din chat nu țin de nicio grilă,
 * deci se numără separat (înainte apăreau ca „1 notiță din 1 grilă”).
 */
export function notesSummary(noteCount: number, quizCount: number, schemaCount: number): string {
  const parts: string[] = [];
  if (noteCount > 0) parts.push(`${plural(noteCount, 'notiță', 'notițe')} din ${plural(quizCount, 'grilă', 'grile')}`);
  if (schemaCount > 0) parts.push(plural(schemaCount, 'schemă', 'scheme'));
  return parts.join(' · ');
}
