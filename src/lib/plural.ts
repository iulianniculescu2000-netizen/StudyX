/**
 * Acord de număr pentru textele din interfață: `plural(1, 'grilă', 'grile')` → „1 grilă”,
 * `plural(5, 'grilă', 'grile')` → „5 grile”, `plural(20, 'grilă', 'grile')` → „20 de grile”.
 * Româna cere „de” după numerele de la 20 în sus, cu excepția celor care se termină în 01–19 (101 sesiuni, 119 sesiuni).
 */
export function pluralWord(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function plural(n: number, one: string, many: string): string {
  const abs = Math.abs(Math.trunc(n));
  const text = n.toLocaleString('ro-RO');
  if (n === 1) return `${text} ${one}`;
  const rest = abs % 100;
  const needsDe = abs !== 0 && (rest === 0 || rest >= 20);
  return `${text}${needsDe ? ' de' : ''} ${many}`;
}
