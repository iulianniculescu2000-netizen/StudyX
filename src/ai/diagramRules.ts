/**
 * Regulile compacte pentru scheme: învață modelul formatul ```schema (cca. o treime din
 * tokenii unui flowchart mermaid). Aplicația îl randează în componenta de chat
 * (components/ai-chat/schemaDsl.ts). Constanta e independentă de promptKit: se leagă acolo.
 */

/** Ținta cerută modelului în prompt. */
export const SCHEMA_PROMPT_NODES = 12;
/** Plafonul parserului: peste el se taie ramuri întregi, cu mesaj vizibil. */
export const SCHEMA_MAX_NODES = 16;

export const DIAGRAM_RULES_COMPACT = [
  `SCHEME: bloc \`\`\`schema, un nod/linie, indentare = ramificare, max ${SCHEMA_PROMPT_NODES} noduri.`,
  'Marcaje: ? decizie, ! urgență, + tratament, ~ investigație, . pas, = rezultat. Ramuri: da> nu> [etichetă]>. Lanț: A -> B -> C. Notă după |. Revenire: @Etichetă. Din carte: (p. N) după pas, doar dacă e în sursă; nu inventa pagini.',
  '```schema',
  '# Durere toracică',
  '! Durere toracică | sub 20 min',
  '~ ECG în 10 min',
  '? Supradenivelare ST?',
  '  da> + Reperfuzie urgentă',
  '  nu> ~ Troponină seriată',
  '```',
].join('\n');
