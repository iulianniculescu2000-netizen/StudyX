/**
 * Regulile compacte pentru scheme: învață modelul formatul ```schema (cca. o treime din
 * tokenii unui flowchart mermaid). Aplicația îl randează în componenta de chat
 * (components/ai-chat/schemaDsl.ts). Constanta e independentă de promptKit: se leagă acolo.
 */
export const DIAGRAM_RULES_COMPACT = [
  'SCHEME: bloc ```schema, o linie pe pas, indentare = ramificare, max 14 pași.',
  'Marcaje: ? decizie, ! urgență, + tratament, ~ investigație, . pas, = rezultat. Ramuri: da> / nu> / [etichetă]>. Lanț: A -> B -> C. Notă scurtă după |. Titlu: # Titlu.',
  '```schema',
  '# Durere toracică',
  '! Durere toracică | sub 20 min',
  '~ ECG în 10 min',
  '? Supradenivelare ST?',
  '  da> + Reperfuzie urgentă',
  '  nu> ~ Troponină seriată',
  '```',
].join('\n');
