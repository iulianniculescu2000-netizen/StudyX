/**
 * "Știai că…" — one small, true thing the app can do, shown on the dashboard.
 *
 * Features keep landing that nobody discovers: the exam-style tracks, the drawn
 * schemas, the chapter-aware book import. A tip strip is the cheapest way to
 * surface them without another modal or a tour the user has to sit through.
 *
 * Each tip can declare when it is worth showing, so a student with an empty
 * library isn't told about chapter filtering, and one who never opened the
 * chat isn't shown a shortcut for something they haven't met yet.
 */
export interface AppTipContext {
  hasQuizzes: boolean;
  hasFlashcards: boolean;
  hasLibrary: boolean;
  hasMistakes: boolean;
  dueCount: number;
  /** Ctrl+K has no equivalent on a touchscreen — the palette tip only makes sense on desktop. */
  mobile: boolean;
}

export interface AppTip {
  id: string;
  /** Kept short: this renders on one line at most sizes. */
  text: string;
  emoji: string;
  action?: { label: string; route: string };
  /** Shown only when this holds; omitted means "always relevant". */
  when?: (context: AppTipContext) => boolean;
}

export const APP_TIPS: AppTip[] = [
  {
    id: 'palette',
    emoji: '⌘',
    text: 'poți sări la orice set, folder sau acțiune cu Ctrl+K, fără să mai umbli prin meniuri',
    when: (context) => !context.mobile,
  },
  {
    id: 'schemas',
    emoji: '🧩',
    text: 'AI-ul îți desenează algoritmi și scheme adevărate, nu doar text — cere-i „fă-mi o schemă"',
    action: { label: 'Deschide AI', route: '/vault' },
  },
  {
    id: 'tracks',
    emoji: '🎯',
    text: 'grilele se pot genera în două feluri: ca la rezidențiat (5 variante) sau simple, pentru materii',
  },
  {
    id: 'books',
    emoji: '📚',
    text: 'manualele mari sunt citite integral și împărțite pe capitolele din tematica oficială',
    action: { label: 'Biblioteca', route: '/vault' },
    when: (context) => context.hasLibrary,
  },
  {
    id: 'books-empty',
    emoji: '📥',
    text: 'poți importa un manual întreg în Bibliotecă, iar AI-ul generează apoi grile pe capitole',
    action: { label: 'Importă', route: '/vault' },
    when: (context) => !context.hasLibrary,
  },
  {
    id: 'mistakes',
    emoji: '🔁',
    text: 'poți cere „fă-mi 10 grile din greșelile mele" și primești un set țintit pe ce ratezi des',
    when: (context) => context.hasMistakes,
  },
  {
    id: 'flashcards',
    emoji: '🃏',
    text: 'flashcardurile se pot genera pe orice subiect, nu doar dintr-un curs încărcat',
    action: { label: 'Flashcarduri', route: '/flashcards' },
  },
  {
    id: 'due',
    emoji: '⏰',
    text: 'recapitularea zilnică îți dă exact itemii scadenți, calculați după algoritmul de repetiție spațiată',
    action: { label: 'Recapitulează', route: '/daily-review' },
    when: (context) => context.dueCount > 0,
  },
  {
    id: 'conformance',
    emoji: '📏',
    text: 'după fiecare generare vezi cât de mult seamănă setul cu subiectele reale de rezidențiat',
    when: (context) => context.hasQuizzes,
  },
  {
    id: 'photo-import',
    emoji: '📷',
    text: 'poți face grile dintr-o poză sau dintr-un PDF scanat — se recunosc variantele și răspunsul corect',
    action: { label: 'Importă grile', route: '/quizzes' },
  },
  {
    id: 'anki',
    emoji: '🔗',
    text: 'îți poți aduce colecția din Anki, cu tot cu progresul de repetiție',
    action: { label: 'Flashcarduri', route: '/flashcards' },
    when: (context) => context.hasFlashcards,
  },
  {
    id: 'chat-fullscreen',
    emoji: '🪟',
    text: 'chatul AI se deschide și pe tot ecranul, ca un panou transparent — apasă Ctrl+Shift+F și reglează transparența',
    when: (context) => !context.mobile,
  },
  {
    id: 'chat-memory',
    emoji: '🧠',
    text: 'asistentul își amintește ce ți-e greu și cum înveți — vezi, editezi sau ștergi tot din Setări',
    action: { label: 'Setări', route: '/settings' },
  },
  {
    id: 'explain-key',
    emoji: '🔍',
    text: 'la explicații AI-ul verifică și cheia grilei — dacă răspunsul marcat e greșit, ți-o spune',
    when: (context) => context.hasQuizzes,
  },
];

/** Tips that make sense right now, in a stable order. */
export function selectRelevantTips(context: AppTipContext): AppTip[] {
  return APP_TIPS.filter((tip) => !tip.when || tip.when(context));
}
